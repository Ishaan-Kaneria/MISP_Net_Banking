"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Dashboard, TxnExplanation, UserExplanation } from "../../lib/types";
import { api, ApiError } from "../../lib/api";
import { Card } from "../ui";

export function Explain({ data }: { data: Dashboard }) {
  const [userExplain, setUserExplain] = useState<UserExplanation | null>(null);
  const [userError, setUserError] = useState("");
  const [openTxnId, setOpenTxnId] = useState<string | null>(null);
  const [txnExplain, setTxnExplain] = useState<TxnExplanation | null>(null);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnError, setTxnError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<UserExplanation>(`/explain/user/${data.user.id}`)
      .then(result => { if (!cancelled) setUserExplain(result); })
      .catch(err => { if (!cancelled) setUserError(err instanceof ApiError ? err.message : "Could not load the audit trail"); });
    return () => { cancelled = true; };
  }, [data.user.id]);

  const toggleTxn = async (id: string) => {
    if (openTxnId === id) { setOpenTxnId(null); setTxnExplain(null); return; }
    setOpenTxnId(id);
    setTxnExplain(null);
    setTxnError("");
    setTxnLoading(true);
    try {
      setTxnExplain(await api<TxnExplanation>(`/explain/txn/${id}`));
    } catch (err) {
      setTxnError(err instanceof ApiError ? err.message : "Could not load this transaction's explanation");
    } finally {
      setTxnLoading(false);
    }
  };

  return (
    <div className="mt-7 animate-rise">
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">Auditor view</p>
        <h2 className="text-[30px] font-bold">Why Arth-AI chose this path</h2>
        <p className="leading-relaxed text-muted">The system combines rolling behavior, transaction context, and hard safety rules. The assistant cannot override this gate.</p>
        {userError && <p role="alert" className="mt-3 text-sm text-danger">{userError}</p>}
        <div className="mt-6">
          {[
            ["Behavioral segment", (userExplain ?? data).segment],
            ["Stress flag", (userExplain ?? data).stress_flag ? "Active: credit paused" : "Clear"],
            ["Ethics decision", userExplain?.ethics_explanation ?? (data.stress_flag ? "Grace support only" : "Relevant offers allowed")],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-5 border-b border-border py-3.5 last:border-b-0">
              <span className="text-muted">{String(label)}</span>
              <strong className="max-w-[320px] text-right">{String(value)}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h3 className="text-xl font-bold">Per-transaction explanation</h3>
        <p className="leading-relaxed text-muted">Pick a recent transaction to see the exact fired rules and feature values behind its fraud score.</p>
        {data.transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}
        {data.transactions.map(txn => (
          <div key={txn.id} className="border-b border-border last:border-b-0">
            <button onClick={() => void toggleTxn(txn.id)} className="flex w-full items-center justify-between gap-4 py-3.5 text-left">
              <span><strong>{txn.payee}</strong><br /><small className="text-muted">{txn.category} · {txn.status} · score {txn.fraud_score}</small></span>
              <ChevronRight size={16} className={`transition-transform ${openTxnId === txn.id ? "rotate-90" : ""}`} />
            </button>
            {openTxnId === txn.id && (
              <div className="pb-4">
                {txnLoading && <p className="text-muted">Loading explanation...</p>}
                {txnError && <p role="alert" className="text-sm text-danger">{txnError}</p>}
                {txnExplain && (
                  <div className="rounded-lg bg-paper p-3.5">
                    <p className="m-0">{txnExplain.explanation_en}</p>
                    <p className="mb-1 mt-2.5 text-xs font-bold uppercase text-muted">Fired rules</p>
                    <p className="m-0">{txnExplain.fired_rules.length ? txnExplain.fired_rules.join(", ") : "None — no hard rule triggered"}</p>
                    <p className="mb-1 mt-2.5 text-xs font-bold uppercase text-muted">Features</p>
                    <pre className="m-0 whitespace-pre-wrap text-xs">{JSON.stringify(txnExplain.features, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
