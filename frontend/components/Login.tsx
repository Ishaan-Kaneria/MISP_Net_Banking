"use client";

import { useState } from "react";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Button, Input } from "./ui";

const trustLines = [
  "256-bit encrypted session",
  "RBI-guideline aligned fraud checks",
  "Consent-based KYC, nothing stored beyond a mock reference",
];

export function Login({ onLogin }: { onLogin: () => void }) {
  const [phone, setPhone] = useState("9000000001");
  const [pin, setPin] = useState("1234");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    try {
      setSubmitting(true);
      setError("");
      const result = await api<{ access_token: string }>("/auth/login", { method: "POST", body: JSON.stringify({ phone, pin }) });
      localStorage.setItem("mispbank_token", result.access_token);
      onLogin();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center gradient-navy p-5">
      <section className="grid w-full max-w-4xl animate-rise grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-pop md:grid-cols-2">
        <div className="flex flex-col gradient-navy-diagonal p-8 text-white md:p-10">
          <div className="flex items-center gap-2.5 text-sm font-bold tracking-wide">
            {/* eslint-disable-next-line @next/next/no-img-element -- a tiny static brand mark, not worth next/image's runtime for */}
            <img src="/logo.svg" alt="" width={22} height={22} /> MISP BANK NET BANKING
          </div>
          <h1 className="mt-8 text-3xl font-bold leading-tight md:mt-10 md:text-4xl">
            Money that<br /><span className="text-[#79b3ff]">understands life.</span>
          </h1>
          <p className="mt-3 max-w-sm leading-relaxed text-[#c3d4ec]">
            A calmer way to see your money, protect your payments, and find support when it matters.
          </p>
          <div className="mt-auto flex flex-col gap-3 pt-8">
            {trustLines.map(line => (
              <div key={line} className="flex items-start gap-2.5 text-xs text-[#b7cdec]">
                <CheckCircle2 size={15} className="mt-0.5 flex-none text-[#79b3ff]" /> {line}
              </div>
            ))}
          </div>
        </div>

        <div className="p-8 md:p-10">
          <p className="m-0 text-[11px] font-bold uppercase tracking-widest text-primary">Secure login</p>
          <h2 className="mb-6 mt-2.5 text-2xl font-bold text-navy">Sign in to your account</h2>

          <label className="block text-sm font-semibold text-ink">Mobile number
            <div className="mt-2 flex items-stretch">
              <span className="flex items-center rounded-l-lg border border-r-0 border-border bg-paper px-3 text-sm font-bold text-muted">+91</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="numeric"
                className="block w-full rounded-r-lg border border-border bg-white px-3.5 py-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light" />
            </div>
          </label>

          <div className="mt-4">
            <Input
              label="PIN" value={pin} onChange={setPin} type={showPin ? "text" : "password"}
              rightSlot={
                <button type="button" aria-label={showPin ? "Hide PIN" : "Show PIN"} onClick={() => setShowPin(current => !current)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-2 text-xs font-semibold text-muted hover:text-ink">
                  {showPin ? "Hide" : "Show"}
                </button>
              }
            />
          </div>
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <Button onClick={() => void submit()} disabled={submitting} className="mt-6 w-full">
            {submitting ? "Signing you in..." : "Enter your account"} {!submitting && <ArrowUpRight size={18} />}
          </Button>
          <p className="mt-5 text-center text-xs text-muted">Demo access: any seeded phone with PIN 1234</p>
        </div>
      </section>
    </main>
  );
}
