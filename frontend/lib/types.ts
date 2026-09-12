export type Dashboard = {
  user: { id: string; name: string; lang: string; kyc_status: string; device_id: string | null };
  balance: number;
  segment: string;
  stress_flag: boolean;
  features: Record<string, number>;
  transactions: Array<{ id: string; amount: number; direction: string; payee: string; category: string; status: string; fraud_score: number; ts: string }>;
  offers: Array<{ id: string; product_code: string; reason: string; blocked_by_ethics: boolean }>;
  alerts: Array<{ id: string; type: string; message_en: string; message_hi: string }>;
};

export type View = "Overview" | "Offers" | "Conversation" | "Explain" | "Simulator";
export const VIEWS: View[] = ["Overview", "Offers", "Conversation", "Explain", "Simulator"];
export const isView = (value: unknown): value is View => VIEWS.includes(String(value) as View);

export type Language = "en" | "hi" | "gu";

export type TopupConfig = { enabled: boolean; key_id: string | null; max_amount: number };

export type UserExplanation = { user_id: string; segment: string; stress_flag: boolean; ethics_explanation: string };
export type TxnExplanation = { id: string; status: string; fraud_score: number; features: Record<string, unknown>; fired_rules: string[]; explanation_en: string; explanation_hi: string };

export const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
