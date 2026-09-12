"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { money } from "../../lib/types";
import { Button, Card } from "../ui";
import { StepUpModal } from "../modals/StepUpModal";

const FIELDS = [
  ["amount", "Amount (INR)"],
  ["payee", "Payee"],
  ["lat", "Latitude"],
  ["lng", "Longitude"],
  ["device_id", "Device ID"],
  ["ts", "Time (optional)"],
] as const;

// Plain-language explanations for the hard fraud rules (app/rules.py) so a
// block is never a mystery flat "0.86" score -- the rule that actually
// fired says why. VELOCITY_5_DEBITS_2M in particular applies regardless of
// amount by design (rapid repeated small debits are the classic
// "card-testing" fraud pattern), so testing the simulator quickly, several
// times in a row, is the single most common way to see this one trip.
const RULE_EXPLANATIONS: Record<string, string> = {
  WATCHLIST_PAYEE: "This payee is on a watchlist, in either direction.",
  GEO_JUMP_HIGH_VALUE: "A large amount right after an impossible jump in location.",
  VELOCITY_5_DEBITS_2M: "5 or more debits within 2 minutes — this applies at any amount, since rapid repeated attempts (not the amount) are the real signal, the same pattern used to test whether a stolen card works.",
  NEW_DEVICE_HIGH_VALUE: "A large amount from a device this account hasn't used before.",
  NIGHT_HIGH_VALUE: "A large amount during late-night hours.",
  INSUFFICIENT_BALANCE: "The account doesn't have enough balance to cover this debit.",
};

export function Simulator({ balance, deviceId, onComplete }: { balance: number; deviceId: string | null; onComplete: () => void }) {
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
      setError(err instanceof ApiError ? err.message : "Simulation failed");
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
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Live demo injector</p>
        <h2 className="text-[30px] font-bold">Test the safety engine</h2>
        <p className="leading-relaxed text-muted">Inject a UPI-like debit and watch the server explain whether it posts or blocks — a posted debit really moves money out of your balance below, just like a real payment. You'll confirm with a one-time code first.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => applyPreset("normal")} className="rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper">Everyday payment (posts)</button>
          <button onClick={() => applyPreset("risky")} className="rounded-full border border-border bg-white px-3.5 py-2 text-xs font-semibold text-ink hover:bg-paper">Risky transfer (blocked)</button>
        </div>
        <div className="mt-5.5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {FIELDS.map(([key, label]) => (
            <label key={key} className="text-xs font-bold">{label}
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
            <p className="m-0 font-bold">{result.status === "posted" ? `− ${money(submittedAmount ?? 0)} debited` : "Blocked — no money moved"}</p>
            <p className="mt-1 text-sm text-muted">{result.status === "posted" ? `New balance: ${money(balance)}` : "Your balance is protected until this is confirmed safe."}</p>
            <p className="mt-2 text-xs text-muted">Fraud score {result.fraud_score} · Category {result.category}</p>
            {result.fired_rules.length > 0 && (
              <div className="mt-3 border-t border-black/10 pt-3">
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted">Why</p>
                {result.fired_rules.map(rule => (
                  <p key={rule} className="mt-1.5 text-xs leading-relaxed text-ink">
                    <strong className="font-mono">{rule}</strong> — {RULE_EXPLANATIONS[rule] || "A hard safety rule fired for this transaction."}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        <Button onClick={() => setShowStepUp(true)} className="mt-5">
          Run safety check <ArrowUpRight size={18} />
        </Button>
      </Card>
    </div>
  );
}
