"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { money } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { Button, Card } from "../ui";
import { StepUpModal } from "../modals/StepUpModal";

// Field labels are looked up from `copy` by key at render time (see FIELDS
// below) so they translate with everything else in this view.
const FIELDS = [
  ["amount", "amountField"],
  ["payee", "payeeField"],
  ["lat", "latitudeField"],
  ["lng", "longitudeField"],
  ["device_id", "deviceIdField"],
  ["ts", "timeOptionalField"],
] as const satisfies ReadonlyArray<readonly [string, keyof TranslationCopy]>;

// Plain-language explanations for the hard fraud rules (app/rules.py) so a
// block is never a mystery flat "0.86" score -- the rule that actually
// fired says why. VELOCITY_5_DEBITS_2M in particular applies regardless of
// amount by design (rapid repeated small debits are the classic
// "card-testing" fraud pattern), so testing the simulator quickly, several
// times in a row, is the single most common way to see this one trip.
// Keyed to translation-copy keys, not literal strings, so this translates
// with the rest of the view instead of always reading in English.
const RULE_EXPLANATION_KEYS: Record<string, keyof TranslationCopy> = {
  WATCHLIST_PAYEE: "ruleWatchlistPayee",
  GEO_JUMP_HIGH_VALUE: "ruleGeoJumpHighValue",
  VELOCITY_5_DEBITS_2M: "ruleVelocity5Debits2m",
  NEW_DEVICE_HIGH_VALUE: "ruleNewDeviceHighValue",
  NIGHT_HIGH_VALUE: "ruleNightHighValue",
  INSUFFICIENT_BALANCE: "ruleInsufficientBalance",
};

export function Simulator({ balance, deviceId, copy, onComplete }: { balance: number; deviceId: string | null; copy: TranslationCopy; onComplete: () => void }) {
  // Defaults to a realistic, low-risk payment on the account's own
  // registered device, so the very first run actually posts and visibly
  // debits the balance -- a real money-transfer feel -- rather than the
  // ₹48,000/new-device combination that's *designed* to always trip
  // NEW_DEVICE_HIGH_VALUE and block, which made it look like the simulator
  // never moves money at all. That risky preset is still one click away.
  const [form, setForm] = useState({ amount: "1500", payee: "Zepto", lat: "28.61", lng: "77.20", device_id: deviceId || "device-0001", ts: "" });
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null);
  const [result, setResult] = useState<{ status: string; fraud_score: number; category: string; fired_rules: string[] } | null>(null);
  const [error, setError] = useState("");
  const [showStepUp, setShowStepUp] = useState(false);
  const [running, setRunning] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const applyPreset = (preset: "normal" | "risky") => {
    setResult(null);
    setForm(preset === "normal"
      ? { amount: "1500", payee: "Zepto", lat: "28.61", lng: "77.20", device_id: deviceId || "device-0001", ts: "" }
      : { amount: "48000", payee: "New city transfer", lat: "28.61", lng: "77.20", device_id: "new-device", ts: "" });
  };

  const runSimulation = async () => {
    setRunning(true);
    try {
      setError("");
      const amount = Number(form.amount);
      const response = await api<{ status: string; fraud_score: number; category: string; fired_rules: string[] }>("/admin/simulate-txn", {
        method: "POST",
        body: JSON.stringify({
          amount,
          direction: "debit",
          payee: form.payee,
          lat: Number(form.lat),
          lng: Number(form.lng),
          device_id: form.device_id,
          ...(form.ts ? { ts: new Date(form.ts).toISOString() } : {}),
        }),
      });
      setSubmittedAmount(amount);
      setResult(response);
      setShowStepUp(false);
      onComplete();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.simulationFailed);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mt-7 animate-rise">
      {showStepUp && (
        <StepUpModal
          summary={{ amount: form.amount, payee: form.payee, device_id: form.device_id, lat: form.lat, lng: form.lng }}
          onClose={() => !running && setShowStepUp(false)}
          onConfirm={() => void runSimulation()}
        />
      )}
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{copy.liveDemoInjector}</p>
        <h2 className="text-[30px] font-bold">{copy.simulatorTitle}</h2>
        <p className="leading-relaxed text-muted">{copy.simulatorIntro}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => applyPreset("normal")} className="rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper">{copy.everydayPaymentPreset}</button>
          <button onClick={() => applyPreset("risky")} className="rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper">{copy.riskyTransferPreset}</button>
        </div>
        <div className="mt-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([key, labelKey]) => (
            <label key={key} className="text-xs font-bold">{copy[labelKey]}
              <input
                type={key === "ts" ? "datetime-local" : key === "amount" || key === "lat" || key === "lng" ? "number" : "text"}
                value={form[key]} onChange={event => update(key, event.target.value)}
                className="mt-1.5 block w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
            </label>
          ))}
        </div>
        {error && <p className="mt-4 text-danger">{error}</p>}
        {result && (
          <div className={`mt-4.5 rounded-lg p-4 ${result.status === "posted" ? "bg-success-light" : "bg-danger-light"}`}>
            <p className="m-0 font-bold">{result.status === "posted" ? `− ${money(submittedAmount ?? 0)} ${copy.debited}` : copy.blockedNoMoney}</p>
            <p className="mt-1 text-sm text-muted">{result.status === "posted" ? `${copy.newBalance}: ${money(balance)}` : copy.balanceProtected}</p>
            <p className="mt-2 text-xs text-muted">{copy.fraudScoreLabel} {result.fraud_score} · {copy.categoryLabel} {result.category}</p>
            {result.fired_rules.length > 0 && (
              <div className="mt-3 border-t border-black/10 pt-3">
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">{copy.whyLabel}</p>
                {result.fired_rules.map(rule => (
                  <p key={rule} className="mt-1.5 text-xs leading-relaxed text-ink">
                    <strong className="font-mono">{rule}</strong> — {copy[RULE_EXPLANATION_KEYS[rule]] || copy.ruleDefault}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <Button onClick={() => setShowStepUp(true)} className="mt-5">
          {copy.runCheck} <ArrowUpRight size={18} />
        </Button>
      </Card>
    </div>
  );
}
