"use client";

import { AlertCircle, CheckCircle2, Clock3, IndianRupee, TrendingUp } from "lucide-react";
import type { Dashboard, Language } from "../../lib/types";
import { alertMessage, money } from "../../lib/types";
import { computeAccountHealth } from "../../lib/health";
import type { TranslationCopy } from "../../lib/translations";
import { ALERT_TONE_CLASSES, alertLabel } from "../../lib/alerts";

// Each panel gets its own accent color (a top border strip plus a matching
// icon chip) so the rail reads as distinct, purpose-built cards at a glance
// -- the same convention professional dashboards (Stripe, Plaid) use instead
// of an unbroken column of identical-looking white boxes.
const ACCENTS = {
  gold: { border: "border-t-gold", chip: "bg-gold-light text-gold" },
  primary: { border: "border-t-primary", chip: "bg-primary-light text-primary" },
  neutral: { border: "border-t-[#c7d3e6]", chip: "bg-paper text-[#5c7291]" },
} as const;

function RailSection({ title, icon, accent, children }: { title: string; icon: React.ReactNode; accent: keyof typeof ACCENTS; children: React.ReactNode }) {
  const style = ACCENTS[accent];
  return (
    <section className={`mt-3.5 rounded-xl border border-t-2 border-border bg-white p-[18px] shadow-[0_2px_8px_rgba(10,46,92,.04)] ${style.border}`}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`grid h-6 w-6 flex-none place-items-center rounded-md ${style.chip}`}>{icon}</span>
        <span className="text-xs font-bold text-navy">{title}</span>
      </div>
      {children}
    </section>
  );
}

export function RailAlerts({ data, copy, language }: { data: Dashboard; copy: TranslationCopy; language: Language }) {
  return (
    <RailSection title={copy.alerts} icon={<AlertCircle size={13} />} accent="gold">
      {data.alerts.length ? data.alerts.slice(0, 3).map(alert => (
        <div key={alert.id} className="flex items-start gap-2.5 border-t border-[#edf1f8] py-3 first:border-t-0">
          <span className={`grid h-7 w-7 flex-none place-items-center rounded-md ${ALERT_TONE_CLASSES[alertLabel(alert.type, copy).tone]}`}>
            <AlertCircle size={15} />
          </span>
          <div>
            <strong className="block text-xs text-navy">{alertLabel(alert.type, copy).title}</strong>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{alertMessage(alert, language)}</p>
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
    <RailSection title={copy.recommendations} icon={<TrendingUp size={13} />} accent="primary">
      {data.offers.length ? data.offers.slice(0, 3).map(offer => (
        <div key={offer.id} className="flex items-center gap-2.5 border-t border-[#edf1f8] py-3 text-muted first:border-t-0">
          <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-primary-light text-primary"><IndianRupee size={15} /></span>
          <span className="min-w-0 flex-1">
            <strong className="block text-xs text-navy">{offer.product_code.replaceAll("_", " ")}</strong>
            <small className="mt-1 block truncate text-[10px] text-muted">{offer.blocked_by_ethics ? copy.pausedBySafety : offer.reason}</small>
          </span>
        </div>
      )) : (
        <div className="flex items-center gap-2 pb-0.5 pt-3 text-[11px] leading-relaxed text-muted"><Clock3 size={17} /><span>{copy.offersWillAppear}</span></div>
      )}
    </RailSection>
  );
}

export function RailActivity({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  return (
    <RailSection title={copy.activity} icon={<Clock3 size={13} />} accent="neutral">
      {data.transactions.slice(0, 5).map(txn => (
        <div key={txn.id} className="flex items-center gap-2 border-t border-[#edf1f8] py-2.5 first:border-t-0">
          {/* All four outcomes are visually distinct: a payment held for
              confirmation and one declined for balance are not the same thing
              as a fraud block, and must not share its red. */}
          <span className={`grid h-[23px] w-[23px] flex-none place-items-center rounded text-sm font-bold ${
            txn.status === "blocked" ? "bg-danger-light text-danger"
              : txn.status === "review" ? "bg-gold-light text-gold"
              : txn.status === "declined" ? "bg-paper text-muted"
              : "bg-primary-light text-primary"}`}>
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
  good: { dot: "bg-[#6fc06f]", bar: "bg-primary", border: "border-t-primary", title: (copy: TranslationCopy) => copy.lookingGood, text: (copy: TranslationCopy) => copy.stable },
  attention: { dot: "bg-gold", bar: "bg-gold", border: "border-t-gold", title: (copy: TranslationCopy) => copy.attentionMode, text: (copy: TranslationCopy) => copy.attentionText },
  support: { dot: "bg-danger", bar: "bg-danger", border: "border-t-danger", title: (copy: TranslationCopy) => copy.supportMode, text: (copy: TranslationCopy) => copy.support },
} as const;

export function RailAccount({ data, copy }: { data: Dashboard; copy: TranslationCopy }) {
  // A real composite score (lib/health.ts) from savings rate, missed EMIs,
  // and live fraud/stress alerts — replaces a bar that was hardcoded to
  // exactly 48% or 78% off the stress flag alone and never moved for any
  // other reason, so it looked identical no matter what was actually
  // happening on the account. This card leads the rail (it's the account's
  // single most important status signal), so its top-border accent sets the
  // color language the panels below it repeat.
  const health = computeAccountHealth(data);
  const style = HEALTH_STYLES[health.tier];
  return (
    <div className={`rounded-xl border border-t-2 border-border bg-white p-[18px] shadow-[0_2px_8px_rgba(10,46,92,.04)] ${style.border}`}>
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
