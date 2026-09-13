export type Dashboard = {
  user: { id: string; name: string; lang: string; kyc_status: string; device_id: string | null };
  balance: number;
  segment: string;
  stress_flag: boolean;
  features: Record<string, number>;
  transactions: Array<{ id: string; amount: number; direction: string; payee: string; category: string; status: string; fraud_score: number; ts: string }>;
  offers: Array<{ id: string; product_code: string; reason: string; blocked_by_ethics: boolean }>;
  alerts: Array<{ id: string; type: string; message_en: string; message_hi: string; message_gu: string }>;
};

export type View = "Overview" | "Offers" | "Conversation" | "Explain" | "Simulator";
export const VIEWS: View[] = ["Overview", "Offers", "Conversation", "Explain", "Simulator"];
export const isView = (value: unknown): value is View => VIEWS.includes(String(value) as View);

export type Language = "en" | "hi" | "gu";

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
