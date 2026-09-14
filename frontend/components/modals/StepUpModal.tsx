"use client";

import { useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Modal, ModalHeader } from "../ui";

const OTP_LENGTH = 6;

/**
 * A step-up authentication gate in front of the safety simulator: real
 * banking flows re-verify identity before anything that touches risk
 * decisioning, and the simulator shouldn't be a one-click bypass of that
 * just because its transaction data is synthetic. This is deliberately NOT
 * branded as Razorpay or any other real payment provider — it doesn't call
 * a real API (nothing here is a real payment), so presenting it as one
 * would be misleading. It's a clearly-labeled mock step-up check, matching
 * the same "mock, for the demo" honesty the KYC flow already uses.
 *
 * The OTP itself is 6 separate boxes that auto-advance and auto-submit the
 * instant the last digit lands — the same real-life pattern UPI apps and
 * bank OTP screens use, where typing the code *is* the submit action and
 * there's no separate button press to remember.
 */
export function StepUpModal({
  summary, onClose, onConfirm,
}: {
  summary: { amount: string; payee: string; device_id: string; lat: string; lng: string };
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [verifying, setVerifying] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const verify = () => {
    setVerifying(true);
    // Mock verification for the demo, same spirit as /kyc/verify: any full
    // code is accepted rather than checked against a real OTP provider.
    setTimeout(() => { onConfirm(); }, 400);
  };

  const setDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index < OTP_LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    } else if (digit && index === OTP_LENGTH - 1 && next.every(Boolean)) {
      // Last box just filled and the whole code is complete — typing it is
      // the submit, no button press needed.
      verify();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill("").map((_, index) => pasted[index] || "");
    setDigits(next);
    if (pasted.length === OTP_LENGTH) {
      verify();
    } else {
      inputs.current[pasted.length]?.focus();
    }
  };

  const complete = digits.every(Boolean);

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
        For your protection, confirm this test transaction with the one-time code sent to your registered number. (Demo: any 6 digits work — typing the last one submits automatically.)
      </p>
      <label className="mt-4 block text-sm font-semibold text-ink">
        One-time code
        <div className="mt-2 flex justify-between gap-2">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={element => { inputs.current[index] = element; }}
              value={digit}
              onChange={event => setDigit(index, event.target.value)}
              onKeyDown={event => handleKeyDown(index, event)}
              onPaste={handlePaste}
              inputMode="numeric"
              autoFocus={index === 0}
              disabled={verifying}
              className="h-12 w-full max-w-[46px] rounded-lg border border-border bg-white text-center text-lg font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light disabled:opacity-60"
            />
          ))}
        </div>
      </label>
      <Button onClick={verify} disabled={verifying || !complete} className="mt-5 w-full">
        {verifying ? "Verifying..." : "Verify & run simulation"}
      </Button>
    </Modal>
  );
}
