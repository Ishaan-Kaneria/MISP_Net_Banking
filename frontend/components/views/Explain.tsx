"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Dashboard, Language, TxnExplanation, UserExplanation } from "../../lib/types";
import { localized } from "../../lib/types";
import type { TranslationCopy } from "../../lib/translations";
import { api, ApiError } from "../../lib/api";
import { Card } from "../ui";

export function Explain({ data, copy, language }: { data: Dashboard; copy: TranslationCopy; language: Language }) {
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
      .catch(err => { if (!cancelled) setUserError(err instanceof ApiError ? err.message : copy.couldNotLoadAudit); });
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
      setTxnError(err instanceof ApiError ? err.message : copy.couldNotLoadTxnExplanation);
    } finally {
      setTxnLoading(false);
    }
  };

  return (
    <div className="mt-7 animate-rise">
      <Card className="p-6">
        <p className="text-xs font-bold uppercase tracking-wide text-primary">{copy.audit}</p>
        <h2 className="text-[30px] font-bold">{copy.why}</h2>
        <p className="leading-relaxed text-muted">{copy.explainIntro}</p>
        {userError && <p role="alert" className="mt-3 text-sm text-danger">{userError}</p>}
        <div className="mt-6">
          {[
            [copy.behavioralSegment, (userExplain ?? data).segment],
            [copy.stressFlagLabel, (userExplain ?? data).stress_flag ? copy.stressActive : copy.clearStatus],
            [copy.ethicsDecision, userExplain
              ? localized({ en: userExplain.ethics_explanation, hi: userExplain.ethics_explanation_hi, gu: userExplain.ethics_explanation_gu }, language)
              : (data.stress_flag ? copy.graceSupportOnly : copy.relevantOffersAllowed)],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between gap-5 border-b border-border py-3.5 last:border-b-0">
              <span className="text-muted">{String(label)}</span>
              <strong className="max-w-[320px] text-right">{String(value)}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h3 className="text-xl font-bold">{copy.perTxnExplanation}</h3>
        <p className="leading-relaxed text-muted">{copy.pickTxnText}</p>
        {data.transactions.length === 0 && <p className="text-muted">{copy.noTransactionsYet}</p>}
        {data.transactions.map(txn => (
          <div key={txn.id} className="border-b border-border last:border-b-0">
            <button onClick={() => void toggleTxn(txn.id)} className="flex w-full items-center justify-between gap-4 py-3.5 text-left">
              <span><strong>{txn.payee}</strong><br /><small className="text-muted">{txn.category} · {txn.status} · score {txn.fraud_score}</small></span>
              <ChevronRight size={16} className={`transition-transform ${openTxnId === txn.id ? "rotate-90" : ""}`} />
            </button>
            {openTxnId === txn.id && (
              <div className="pb-4">
                {txnLoading && <p className="text-muted">{copy.loadingExplanation}</p>}
                {txnError && <p role="alert" className="text-sm text-danger">{txnError}</p>}
                {txnExplain && (
                  <div className="rounded-lg bg-paper p-3.5">
                    <p className="m-0">{localized({ en: txnExplain.explanation_en, hi: txnExplain.explanation_hi, gu: txnExplain.explanation_gu }, language)}</p>
                    <p className="mb-1 mt-2.5 text-xs font-bold uppercase text-muted">{copy.firedRulesLabel}</p>
                    <p className="m-0">{txnExplain.fired_rules.length ? txnExplain.fired_rules.join(", ") : copy.noneNoHardRule}</p>
                    <p className="mb-1 mt-2.5 text-xs font-bold uppercase text-muted">{copy.featuresLabel}</p>
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
