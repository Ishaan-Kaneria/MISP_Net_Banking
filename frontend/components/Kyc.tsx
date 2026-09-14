"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { copyFor } from "../lib/translations";
import { rememberLanguage } from "../lib/language";
import type { Language } from "../lib/types";
import { Button } from "./ui";
import { LanguageToggle } from "./LanguageToggle";

export function Kyc({ language, setLanguage, onComplete }: { language: Language; setLanguage: (language: Language) => void; onComplete: () => void }) {
  const [docType, setDocType] = useState<"aadhaar" | "pan">("pan");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const copy = copyFor(language);

  const chooseLanguage = (next: Language) => { setLanguage(next); rememberLanguage(next); };

  const submit = async () => {
    try {
      setSubmitting(true);
      setError("");
      // `locale` is the language the customer actually read this consent in,
      // not a hardcoded "en": it is stored verbatim in the KycEvent consent
      // record, and a record claiming consent was given in English when the
      // screen was rendered in Gujarati would misstate the one thing that
      // record exists to prove.
      await api("/kyc/verify", { method: "POST", body: JSON.stringify({ doc_type: docType, consent, locale: language }) });
      onComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.verificationFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-paper p-5">
      <section className="w-full max-w-lg animate-rise rounded-2xl border border-border bg-white p-9 shadow-card">
        <div className="text-sm font-bold uppercase tracking-wide text-primary">{copy.secureOnboarding}</div>
        <h1 className="mt-6 text-3xl font-bold leading-tight text-navy md:text-4xl">
          {copy.kycTitleLead}<br /><span className="text-primary">{copy.kycTitleAccent}</span>
        </h1>
        <p className="mt-3 leading-relaxed text-muted">{copy.kycIntro}</p>

        <div className="mt-6">
          <LanguageToggle language={language} setLanguage={chooseLanguage} label={copy.chooseLanguage} />
        </div>

        <div className="mt-6 flex gap-2.5">
          {(["pan", "aadhaar"] as const).map(option => (
            <button key={option} onClick={() => setDocType(option)}
              className={`flex-1 rounded-lg border px-3.5 py-3 text-sm font-semibold ${docType === option ? "border-primary bg-primary-light text-primary" : "border-border bg-white text-muted"}`}>
              {option === "pan" ? copy.panCard : copy.aadhaar}
            </button>
          ))}
        </div>
        <label className="mt-7 flex items-start gap-3 text-sm leading-relaxed text-ink">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 accent-primary" />
          {copy.kycConsent}
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <Button onClick={() => void submit()} disabled={!consent || submitting} className="mt-6 w-full">
          {submitting ? copy.verifying : copy.continueSecurely} <ArrowUpRight size={18} />
        </Button>
      </section>
    </main>
  );
}
