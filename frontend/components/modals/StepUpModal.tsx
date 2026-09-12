"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Modal, ModalHeader } from "../ui";

/**
 * A step-up authentication gate in front of the safety simulator: real
 * banking flows re-verify identity before anything that touches risk
 * decisioning, and the simulator shouldn't be a one-click bypass of that
 * just because its transaction data is synthetic. This is deliberately NOT
 * branded as Razorpay or any other real payment provider — it doesn't call
 * a real API (nothing here is a real payment), so presenting it as one
 * would be misleading. It's a clearly-labeled mock step-up check, matching
 * the same "mock, for the demo" honesty the KYC flow already uses.
 */
export function StepUpModal({
  summary, onClose, onConfirm,
}: {
  summary: { amount: string; payee: string; device_id: string; lat: string; lng: string };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const verify = () => {
    if (otp.trim().length < 4) { setError("Enter the 4-6 digit code."); return; }
    setError("");
    setVerifying(true);
    // Mock verification for the demo, same spirit as /kyc/verify: any
    // code of plausible length is accepted rather than checked against a
    // real OTP provider.
    setTimeout(() => { onConfirm(); }, 450);
  };

  return (
    <Modal onClose={onClose} maxWidth={400}>
      <ModalHeader eyebrow="Step-up verification" title="Confirm this simulation" onClose={onClose} />
      <div className="mt-4 rounded-lg bg-paper p-3.5 text-sm">
        <div className="flex justify-between py-1"><span className="text-muted">Amount</span><strong>₹{summary.amount}</strong></div>
        <div className="flex justify-between py-1"><span className="text-muted">Payee</span><strong>{summary.payee}</strong></div>
        <div className="flex justify-between py-1"><span className="text-muted">Device</span><strong>{summary.device_id}</strong></div>
        <div className="flex justify-between py-1"><span className="text-muted">Location</span><strong>{summary.lat}, {summary.lng}</strong></div>
      </div>
      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <ShieldCheck size={15} className="mt-0.5 flex-none text-primary" />
        For your protection, confirm this test transaction with the one-time code sent to your registered number. (Demo: any 4-6 digit code works.)
      </p>
      <label className="mt-4 block text-sm font-semibold text-ink">
        One-time code
        <input
          value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric" placeholder="••••••" autoFocus
          className="mt-2 block w-full rounded-lg border border-border bg-white px-3.5 py-3 text-center text-lg tracking-[0.5em] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
        />
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      <Button onClick={verify} disabled={verifying} className="mt-5 w-full">
        {verifying ? "Verifying..." : "Verify & run simulation"}
      </Button>
    </Modal>
  );
}
