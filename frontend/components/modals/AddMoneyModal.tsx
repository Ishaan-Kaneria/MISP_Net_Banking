"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import type { TopupConfig } from "../../lib/types";
import { Button, Input, Modal, ModalHeader } from "../ui";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load the payment widget. Check your connection (or an ad-blocker) and try again."));
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

export function AddMoneyModal({ userName, onClose, onSuccess }: { userName: string; onClose: () => void; onSuccess: (message: string) => void }) {
  const [config, setConfig] = useState<TopupConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [amount, setAmount] = useState("2000");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<TopupConfig>("/wallet/topup/config")
      .then(result => { if (!cancelled) setConfig(result); })
      .catch(err => {
        if (cancelled) return;
        // Distinguish "the server is unreachable" from "Razorpay just isn't
        // configured yet" — collapsing both into the same disabled state (as
        // the previous version did) is exactly what made a real connectivity
        // problem look identical to normal, expected "not set up" copy.
        setConfigError(err instanceof ApiError ? err.message : "Could not check whether Add Money is available.");
        setConfig({ enabled: false, key_id: null, max_amount: 0 });
      });
    return () => { cancelled = true; };
  }, []);

  const payWithRazorpay = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) { setError("Enter a valid amount."); return; }
    setError("");
    setSubmitting(true);
    try {
      const order = await api<{ order_id: string; amount: number; currency: string; key_id: string }>("/wallet/topup/order", { method: "POST", body: JSON.stringify({ amount: value }) });
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Payment widget failed to load.");
      const razorpay = new window.Razorpay({
        key: order.key_id,
        amount: order.amount,
        currency: order.currency,
        order_id: order.order_id,
        name: "MISP Bank",
        description: "Add money to your account",
        prefill: { name: userName },
        theme: { color: "#0b57b0" },
        handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          void (async () => {
            try {
              await api("/wallet/topup/verify", { method: "POST", body: JSON.stringify(response) });
              onSuccess(`₹${value.toLocaleString("en-IN")} added to your account.`);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Payment succeeded but could not be confirmed. Contact support.");
            } finally {
              setSubmitting(false);
            }
          })();
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      razorpay.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the payment.");
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader eyebrow="Add money" title="Top up via Razorpay" onClose={onClose} />

      {config === null && <p className="mt-5 text-muted">Checking availability...</p>}

      {config && !config.enabled && (
        <div className="mt-5">
          <p className="leading-relaxed text-muted">
            {configError
              ? "We couldn't confirm whether Add Money is available right now."
              : <>Add Money isn&apos;t configured in this environment yet — it needs a Razorpay key on the server. Once that&apos;s added, this will let you top up your balance with a real (test-mode) payment.</>}
          </p>
          {configError && <p role="alert" className="mt-3 text-sm text-danger">{configError}</p>}
        </div>
      )}

      {config && config.enabled && (
        <>
          <div className="mt-5">
            <Input label="Amount (INR)" value={amount} onChange={setAmount} type="number" min={1} max={config.max_amount} />
          </div>
          <p className="mt-1.5 text-xs text-muted">Maximum ₹{config.max_amount.toLocaleString("en-IN")} per top-up.</p>
          {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
          <Button onClick={() => void payWithRazorpay()} disabled={submitting} className="mt-6 w-full">
            {submitting ? "Opening secure checkout..." : `Pay ₹${amount || 0} with Razorpay`} {!submitting && <ArrowUpRight size={18} />}
          </Button>
        </>
      )}
    </Modal>
  );
}
