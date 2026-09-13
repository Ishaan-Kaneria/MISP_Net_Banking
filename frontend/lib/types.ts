export type Dashboard = {
  user: { id: string; name: string; lang: string; kyc_status: string; device_id: string | null };
  balance: number;
  segment: string;
  stress_flag: boolean;
  features: Record<string, number>;
  transactions: Array<{ id: string; amount: number; direction: string; payee: string; category: string; status: string; fraud_score: number; ts: string }>;
  offers: Array<{ id: string; product_code: string; reason: string; blocked_by_ethics: boolean }>;
  alerts: Array<{ id: string; type: string; message_en: string; message_hi: string; message_gu: string }>;
  // Real per-type totals. `alerts` above is deduplicated by type for display,
  // so it must never be used for counting — see lib/health.ts.
  alert_counts?: Record<string, number>;
};

export type KycStatus = {
  kyc_status: string;
  doc_type: string | null;
  mock_ref: string | null;
  consent_locale: string | null;
  consent_purpose: string | null;
  consent_timestamp: string | null;
  retained_fields: string[];
  never_retained: string[];
};

/**
 * A transaction can now end in four states, not two. `review` is the important
 * new one: the fraud engine is unsure, so the payment is held pending step-up
 * confirmation instead of being refused, and `declined` means the balance was
 * short — which is deliberately not a safety event.
 */
export type TxnStatus = "posted" | "blocked" | "review" | "declined";

export function statusLabel(status: string, copy: { statusPosted: string; statusBlocked: string; statusReview: string; statusDeclined: string }): string {
  switch (status) {
    case "posted": return copy.statusPosted;
    case "blocked": return copy.statusBlocked;
    case "review": return copy.statusReview;
    case "declined": return copy.statusDeclined;
    default: return status;
  }
}

export type View = "Overview" | "Offers" | "Conversation" | "Explain" | "Simulator" | "Verification";
export const VIEWS: View[] = ["Overview", "Offers", "Conversation", "Explain", "Simulator", "Verification"];
export const isView = (value: unknown): value is View => VIEWS.includes(String(value) as View);

export type Language = "en" | "hi" | "gu";

export type ChatTurn = { id: string; role: "user" | "assistant"; content: string; lang: string; ts: string };

export type TopupConfig = { enabled: boolean; key_id: string | null; max_amount: number };

export type UserExplanation = { user_id: string; segment: string; stress_flag: boolean; ethics_explanation: string; ethics_explanation_hi: string; ethics_explanation_gu: string };
export type TxnExplanation = { id: string; status: string; fraud_score: number; features: Record<string, unknown>; fired_rules: string[]; explanation_en: string; explanation_hi: string; explanation_gu: string };

export const localized = (texts: { en: string; hi: string; gu: string }, language: Language): string =>
  (language === "hi" ? texts.hi : language === "gu" ? texts.gu : texts.en) || texts.en;

export const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

// Alerts carry all three languages from the backend (app/pipeline.py), but
// the UI used to always render message_en regardless of the selected
// language -- the one piece of server-authored copy that never actually
// translated. This picks the field matching the current language, falling
// back to English for anything unexpected (or missing, for alerts created
// before message_gu existed).
export const alertMessage = (alert: Dashboard["alerts"][number], language: Language): string =>
  localized({ en: alert.message_en, hi: alert.message_hi, gu: alert.message_gu }, language);
