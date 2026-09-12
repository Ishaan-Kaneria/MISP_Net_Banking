"use client";

import { AlertCircle, CheckCircle2, Clock3, IndianRupee, TrendingUp } from "lucide-react";
import type { Dashboard } from "../../lib/types";
import { money } from "../../lib/types";
import { computeAccountHealth } from "../../lib/health";
import type { TranslationCopy } from "../../lib/translations";

function RailSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-3.5 rounded-xl border border-border bg-white p-4.5 p-[18px] shadow-[0_2px_8px_rgba(10,46,92,.04)]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold text-navy">{icon} {title}</span>
      </div>
      {children}
    </section>
  );
}

export function RailAlerts({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return (
    <RailSection title={copy.alerts} icon={<AlertCircle size={15} />}>
      {data.alerts.length ? data.alerts.slice(0, 3).map(alert => (
        <div key={alert.id} className="flex items-start gap-2.5 border-t border-[#edf1f8] py-3 first:border-t-0">
          <span className={`grid h-7 w-7 flex-none place-items-center rounded-md ${alert.type === "fraud" ? "bg-danger-light text-danger" : "bg-gold-light text-gold"}`}>
            <AlertCircle size={15} />
          </span>
          <div>
            <strong className="block text-xs text-navy">{alert.type === "fraud" ? "Payment protection" : "Cash-flow support"}</strong>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{alert.message_en}</p>
          </div>
        </div>
      )) : (
        <div className="flex items-center gap-2 pb-0.5 pt-3 text-[11px] leading-relaxed text-muted"><CheckCircle2 size={17} /><span>{copy.noAlerts}</span></div>
      )}
    </RailSection>
  );
}

export function RailOffers({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return (
    <RailSection title={copy.recommendations} icon={<TrendingUp size={15} />}>
      {data.offers.length ? data.offers.slice(0, 3).map(offer => (
        <div key={offer.id} className="flex items-center gap-2.5 border-t border-[#edf1f8] py-3 text-muted first:border-t-0">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-primary-light text-primary"><IndianRupee size={15} /></span>
          <span className="min-w-0 flex-1">
            <strong className="block text-xs text-navy">{offer.product_code.replaceAll("_", " ")}</strong>
            <small className="mt-1 block truncate text-[10px] text-muted">{offer.blocked_by_ethics ? "Paused by safety rules" : offer.reason}</small>
          </span>
        </div>
      )) : (
        <div className="flex items-center gap-2 pb-0.5 pt-3 text-[11px] leading-relaxed text-muted"><Clock3 size={17} /><span>Recommendations will appear as your account evolves.</span></div>
      )}
    </RailSection>
  );
}

export function RailActivity({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return (
    <RailSection title={copy.activity} icon={<Clock3 size={15} />}>
      {data.transactions.slice(0, 5).map(txn => (
        <div key={txn.id} className="flex items-center gap-2 border-t border-[#edf1f8] py-2.5 first:border-t-0">
          <span className={`grid h-[23px] w-[23px] flex-none place-items-center rounded text-sm font-bold ${txn.status === "blocked" ? "bg-danger-light text-danger" : "bg-primary-light text-primary"}`}>
            {txn.direction === "debit" ? "−" : "+"}
          </span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-[10px] text-navy">{txn.payee}</strong>
            <small className="mt-0.5 block truncate text-[9px] text-muted">{txn.category}</small>
          </span>
          <strong className="whitespace-nowrap text-[10px] text-navy">{txn.direction === "debit" ? "-" : "+"}{money(txn.amount)}</strong>
        </div>
      ))}
    </RailSection>
  );
}

const HEALTH_STYLES = {
  good: { dot: "bg-[#6fc06f]", bar: "bg-primary", title: (copy: TranslationCopy) => copy.lookingGood, text: (copy: TranslationCopy) => copy.stable },
  attention: { dot: "bg-gold", bar: "bg-gold", title: (copy: TranslationCopy) => copy.attentionMode, text: (copy: TranslationCopy) => copy.attentionText },
  support: { dot: "bg-danger", bar: "bg-danger", title: (copy: TranslationCopy) => copy.supportMode, text: (copy: TranslationCopy) => copy.support },
} as const;

export function RailAccount({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  // A real composite score (lib/health.ts) from savings rate, missed EMIs,
  // and live fraud/stress alerts — replaces a bar that was hardcoded to
  // exactly 48% or 78% off the stress flag alone and never moved for any
  // other reason, so it looked identical no matter what was actually
  // happening on the account.
  const health = computeAccountHealth(data);
  const style = HEALTH_STYLES[health.tier];
  return (
    <div className="rounded-xl border border-border bg-white p-[18px] shadow-[0_2px_8px_rgba(10,46,92,.04)]">
      <div className="flex justify-between text-[10px] font-bold tracking-widest text-muted">
        <span>{copy.accountHealth.toUpperCase()}</span>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
      </div>
      <strong className="mt-3.5 block text-lg text-navy">{style.title(copy)}</strong>
      <p className="my-2 text-xs leading-relaxed text-muted">{style.text(copy)}</p>
      <div className="h-[5px] overflow-hidden rounded-full bg-[#e3eaf6]">
        <span className={`block h-full rounded-full transition-[width] duration-500 ${style.bar}`} style={{ width: `${health.score}%` }} />
      </div>
    </div>
  );
}
