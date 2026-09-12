"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Button } from "./ui";

export function Kyc({ onComplete }: { onComplete: () => void }) {
  const [docType, setDocType] = useState<"aadhaar" | "pan">("pan");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    try {
      setSubmitting(true);
      setError("");
      await api("/kyc/verify", { method: "POST", body: JSON.stringify({ doc_type: docType, consent, locale: "en" }) });
      onComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-paper p-5">
      <section className="w-full max-w-lg animate-rise rounded-2xl border border-border bg-white p-9 shadow-card">
        <div className="text-sm font-bold tracking-wide text-primary">SECURE ONBOARDING</div>
        <h1 className="mt-6 text-3xl font-bold leading-tight text-navy md:text-4xl">
          Let&apos;s verify<br /><span className="text-primary">your identity.</span>
        </h1>
        <p className="mt-3 leading-relaxed text-muted">
          This is a mock DigiLocker check for the demo. We retain only the verification reference and your consent record, never an identity document image.
        </p>
        <div className="mt-6 flex gap-2.5">
          {(["pan", "aadhaar"] as const).map(option => (
            <button key={option} onClick={() => setDocType(option)}
              className={`flex-1 rounded-lg border px-3.5 py-3 text-sm font-semibold ${docType === option ? "border-primary bg-primary-light text-primary" : "border-border bg-white text-muted"}`}>
              {option === "pan" ? "PAN card" : "Aadhaar"}
            </button>
          ))}
        </div>
        <label className="mt-7 flex items-start gap-3 text-sm leading-relaxed text-ink">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 accent-primary" />
          I consent to Arth-AI verifying this document for account onboarding and storing a timestamped consent record.
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <Button onClick={() => void submit()} disabled={!consent || submitting} className="mt-6 w-full">
          {submitting ? "Verifying..." : "Continue securely"} <ArrowUpRight size={18} />
        </Button>
      </section>
    </main>
  );
}
