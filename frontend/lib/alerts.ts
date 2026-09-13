import type { TranslationCopy } from "./translations";

export type AlertTone = "danger" | "gold" | "neutral";

/**
 * An alert type's display label and tone.
 *
 * Both the rail and the notification bell used `type === "fraud" ? ... : ...`,
 * which was fine while there were exactly two types. There are now four —
 * `balance` (a decline) and `review` (a payment held for confirmation) — and a
 * ternary silently labelled both of them "Cash-flow support", telling a
 * customer short of money that they were in financial-stress support.
 */
export function alertLabel(type: string, copy: TranslationCopy): { title: string; tone: AlertTone } {
  switch (type) {
    case "fraud": return { title: copy.paymentProtection, tone: "danger" };
    case "stress": return { title: copy.cashFlowSupport, tone: "gold" };
    case "review": return { title: copy.paymentHeld, tone: "gold" };
    case "balance": return { title: copy.balanceNotice, tone: "neutral" };
    default: return { title: copy.notifications, tone: "neutral" };
  }
}

export const ALERT_TONE_CLASSES: Record<AlertTone, string> = {
  danger: "bg-danger-light text-danger",
  gold: "bg-gold-light text-gold",
  neutral: "bg-paper text-muted",
};
