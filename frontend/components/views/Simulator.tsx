"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { api, ApiError } from "../../lib/api";
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

export function Simulator({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState({ amount: "48000", payee: "New city transfer", lat: "28.61", lng: "77.20", device_id: "new-device", ts: "" });
  const [result, setResult] = useState<{ status: string; fraud_score: number; category: string } | null>(null);
  const [error, setError] = useState("");
  const [showStepUp, setShowStepUp] = useState(false);
  const [running, setRunning] = useState(false);

  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));

  const runSimulation = async () => {
    setRunning(true);
    try {
      setError("");
      const response = await api<{ status: string; fraud_score: number; category: string }>("/admin/simulate-txn", {
        method: "POST",
        body: JSON.stringify({
          amount: Number(form.amount),
          direction: "debit",
          payee: form.payee,
          lat: Number(form.lat),
          lng: Number(form.lng),
          device_id: form.device_id,
          ...(form.ts ? { ts: new Date(form.ts).toISOString() } : {}),
        }),
      });
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
        <p className="leading-relaxed text-muted">Inject a UPI-like debit and watch the server explain whether it posts or blocks. You'll confirm with a one-time code first, just like a real payment would ask.</p>
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
          <div className="mt-4.5 rounded-lg bg-primary-light p-4">
            <strong>Status:</strong> {result.status}<br /><strong>Fraud score:</strong> {result.fraud_score}<br /><strong>Category:</strong> {result.category}
          </div>
        )}
        <Button onClick={() => setShowStepUp(true)} className="mt-5">
          Run safety check <ArrowUpRight size={18} />
        </Button>
      </Card>
    </div>
  );
}
