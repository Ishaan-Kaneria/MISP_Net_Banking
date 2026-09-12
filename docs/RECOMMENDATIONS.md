# Phase 6 — Recommendation personalization

## `offer_rules()` expansion

Was 5 rules covering SALARY/HOSPITAL categories, one spend-ratio check, FIRST_JOB, and
STRESS (2 offers). Now also personalizes on the 30-day behavior features
`pipeline.run_pipeline()` already computes for every transaction (savings rate, salary,
EMI count, night-transaction ratio, unique payees), which weren't being used for
recommendations at all before:

| Trigger | Offer | Ethics-gated? |
|---|---|---|
| `segment == "SAVER"` and `savings_rate > 0.25` | `RECURRING_DEPOSIT` | No |
| `segment == "MARRIAGE"` | `WEDDING_EMI_PLAN` | Yes (credit-shaped) |
| `segment == "HIGH_VELOCITY"` | `SPEND_INSIGHTS` | No |
| `emi_count > 0` and not already `STRESS` | `EMI_PROTECT` | No |
| `unique_payees_7d >= 8` | `AUTOPAY_BUNDLE` | No |
| `night_txn_ratio > 0.3` | `NIGHT_SECURITY_LOCK` | No |
| `segment == "BASELINE"` with modest positive savings | `EMERGENCY_FUND` | No |
| `category == "HOSPITAL"` **or** `segment == "MEDICAL"` | `MICRO_INSURANCE` (was category-only — a MEDICAL-segment user buying groceries used to get zero medical-related offers) | No |

Non-credit nudges (insights, security, savings products) are never `blocked_by_ethics`
— unlike `PERSONAL_LOAN`/`STARTER_CREDIT`/`WEDDING_EMI_PLAN`, there's no cash-flow risk in
suggesting a savings product or a security setting to someone under financial stress, so
the existing ethics gate stays scoped to actual credit products.

## Seed data

Every non-STRESS persona previously shared one identical generic 40-row salary/EMI/grocery
loop regardless of their intended segment (SAVER, FIRST_JOB, MEDICAL) — the STRESS persona
was the only one with a real, tailored history (from Phase 1). Gave the other three
personas their own realistic histories the same way:

- **Ramesh Shah (SAVER)**: steady salary well above spend, satisfying `predict_segment()`'s
  own deterministic `savings_rate > 0.2 and spend_30d < 0.8 * salary` rule — verified he
  re-classifies as SAVER from his transaction history alone on the very next live `/txn`.
- **Meena Iyer (MEDICAL)**: recent hospital debits totaling >₹10,000 in the last 30 days,
  satisfying `predict_segment()`'s deterministic `hospital_spend > 10000` rule — verified
  MEDICAL on the next live transaction.
- **Priya Verma (FIRST_JOB)**: one recent first salary, no EMI history, few distinct
  payees, spend close to the whole salary from one-off setup costs. There's no
  deterministic `predict_segment()` override for FIRST_JOB (unlike the three above), so
  this is still a best-effort call by the segmentation model, same as before — verified in
  practice it lands on BASELINE rather than FIRST_JOB after a live transaction.

  Digging into why: `predict_segment()`'s feature vector order (spend_30d, savings_rate,
  missed_emi, hospital_spend, **salary_amount**, entertainment_spend, velocity,
  unique_payees) puts `salary_amount` at index 4, and the model's own synthetic training
  data (`ml/segment.py:_training_data()`) marks FIRST_JOB by setting that index to `-1.0`
  on an unconstrained `N(0,1)` draw. A real `salary_amount / 50000` can never go negative,
  so no real user's feature vector can actually reach the region of input space the model
  was taught to call FIRST_JOB — this looks like a pre-existing calibration mismatch
  between the synthetic training distribution and the real scaled feature range, not
  something introduced or fixable by seed data alone. Flagging it here rather than
  attempting a fix: retraining the segmentation model on a properly-scaled synthetic
  distribution is a bigger, separate change this session hasn't validated.

Each persona's initial `UserFeature`/`UserScore` snapshot (shown on the dashboard before
their first live transaction) was also updated to actually match their new seeded history,
rather than the same four hardcoded numbers every persona previously showed.
