import type { Dashboard } from "./types";

export type HealthTier = "good" | "attention" | "support";

export type AccountHealth = { score: number; tier: HealthTier };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A real composite score from the account's actual signals, replacing what
 * was a hardcoded 48%/78% bar that only ever reflected the binary
 * stress_flag and never moved with anything else about the account (same
 * savings rate, same alerts, same segment — the bar looked identical
 * regardless). Every input here already exists on the dashboard payload:
 * savings rate, a missed EMI, live fraud/stress alerts, and the stress
 * flag itself all pull the score down; nothing here needs a new endpoint.
 */
export function computeAccountHealth(data: Dashboard): AccountHealth {
  let score = 68;
  score += Math.round(clamp(data.features.savings_rate ?? 0, -1, 1) * 22);
  if (data.features.missed_emi_30d) score -= 22;
  // Counted from `alert_counts`, not from `data.alerts`. The alert list is
  // deduplicated by type before it leaves the API, so it can never hold more
  // than one alert of a kind — which made the `Math.min(count, 3)` scaling
  // below dead arithmetic and left an account with four blocked fraud attempts
  // scoring exactly the same as one with a single blocked attempt.
  const counts = data.alert_counts ?? {};
  const fraudAlerts = counts.fraud ?? data.alerts.filter(alert => alert.type === "fraud").length;
  const stressAlerts = counts.stress ?? data.alerts.filter(alert => alert.type === "stress").length;
  score -= Math.min(fraudAlerts, 3) * 14;
  score -= Math.min(stressAlerts, 2) * 8;
  // A payment held for step-up confirmation is a live safety question, but a
  // much softer signal than one that was refused outright — and a declined
  // payment is not a safety signal at all, so it deliberately costs nothing
  // here beyond whatever the savings rate already reflects.
  score -= Math.min(counts.review ?? 0, 2) * 4;
  if (data.stress_flag) score -= 12;
  score = clamp(Math.round(score), 4, 98);
  const tier: HealthTier = data.stress_flag || score < 40 ? "support" : score < 70 ? "attention" : "good";
  return { score, tier };
}
