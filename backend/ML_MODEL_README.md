# MISP Bank Decision Models

## Scope

MISP Bank uses machine learning as one signal in a safety-first transaction and customer-decision pipeline. The models are trained on deterministic synthetic data for the hackathon; they are not approved for real banking decisions.

## Fraud Decision Flow

Every transaction follows this order:

1. Normalize timestamp and derive India-local time.
2. Build decision-time features from the current request and prior posted history.
3. Evaluate independent hard fraud rules.
4. Calculate the saved RandomForest fraud probability and IsolationForest anomaly signal.
5. Use the higher model/hard-rule score and block when a hard rule fires or the configured fraud threshold is reached.
6. Persist the score, features, fired rules, and outcome in the audit log.

Hard rules cannot be overridden by the model.

## Fraud Features

The saved fraud artifacts use these features:

- `amount`: transaction amount in INR.
- `log_amount`: `log1p(amount)` for scale stability.
- `hour`: local India hour.
- `is_night`: local hour before 05:00 or from 22:00.
- `km_from_last`: haversine distance from the previous transaction.
- `same_device`: whether the request uses the trusted device.
- `velocity_2m`: recent debit count in the last two minutes.
- `amount_vs_typical`: amount divided by the customer's median posted debit.
- `balance_ratio`: amount divided by available balance, capped only by numerical safety at inference.
- `is_new_payee`: no matching posted payee in the recent history.
- `payee_frequency_30d`: matching posted payees in the last 30 days.
- `risk_interaction`: `amount_vs_typical * balance_ratio * is_new_payee`, an engineered feature (not a raw signal). A disproportionately large payment that also drains a real share of the balance is only genuinely risky when it's *also* going to a brand-new payee; each factor alone is unremarkable. This product turns that three-way AND into one number a tree can split on directly, instead of requiring enough depth and enough matching training rows to rediscover the same interaction from the three raw features separately.

The contextual features are computed before the transaction is posted. No future status, investigation result, or post-decision balance is used.

### Known fix: cold-start distortion at large amounts (2026-09)

Both the fraud classifier's own held-out evaluation *and* a live check against
seeded personas confirmed a real bug: the synthetic training frame (see
`scripts/train_models.py::fraud_frame`) put almost no mass above ₹50,000 in
its *legitimate* population — the base lognormal distribution's tail rarely
reaches there, and the only large-amount rows in ~24,000 training examples
were the deliberately-injected fraud patterns. With no legitimate large-amount
examples to learn from, the model extrapolated past its training range and
scored **any** large payment as fraud-like, regardless of device, payee
history, or anything else — a known, trusted payee's ₹50,000+ invoice was
blocked purely on amount. Fixed by injecting a matched population of
realistic large *legitimate* transactions (rent, tuition, a wedding vendor,
an EMI lump sum) alongside a wider amount range for the *risky* new-payee
pattern too, so the model has contrasting examples at every amount instead of
only seeing large amounts in one class. Re-verified: a known payee at any
amount up to ₹200,000 now posts normally when no other risk signal is
present, while the new-payee/balance-drain pattern this feature exists to
catch is still detected in 93% of matching held-out cases.

## Fraud Controls

Hard-rule thresholds remain explicit:

- Geo jump: more than 250 km and amount above INR 15,000.
- Velocity: at least 5 debits in 2 minutes.
- New device: amount above INR 20,000.
- Watchlist category: always flagged.
- Night high value: amount above INR 40,000 during the night window.

## Customer Segmentation

The segment model uses normalized behavioral aggregates:

- 30-day spend
- savings rate
- missed EMI indicator
- hospital spending
- unique payees
- salary amount
- transaction velocity
- entertainment spending

Strong signals are deterministic guardrails before the classifier:

- Missed EMI or savings rate below -15%: `STRESS`.
- Hospital spending above INR 10,000: `MEDICAL`.
- More than 15 transactions or payees: `HIGH_VELOCITY`.
- Savings rate above 20% with controlled spend: `SAVER`.

The classifier handles ambiguous profiles after these safety and behavior checks. Credit-related recommendations are independently blocked when stress is detected.

## Training and Evaluation

Run from `backend`:

```powershell
.\.venv\Scripts\python.exe scripts\train_models.py
```

The trainer:

- Uses fixed seed `20260912`.
- Uses a chronological fraud split: train, validation, then future test.
- Tunes the fraud threshold on validation only.
- Uses a stratified held-out customer segment test split.
- Reports precision, recall, F1, PR-AUC, ROC-AUC, and macro-F1.
- Saves artifacts under `app/ml/models/`.
- Saves metrics under `data/synthetic/reports/metrics.json`.

Current synthetic holdout metrics after the contextual feature update:

- Fraud precision: approximately 0.979
- Fraud recall: approximately 0.677
- Fraud F1: approximately 0.801
- Fraud PR-AUC: approximately 0.721
- Fraud ROC-AUC: approximately 0.835
- Segmentation macro-F1: approximately 0.790

Synthetic metrics are useful for regression checks, not proof of production performance. A real deployment requires representative labeled data, time-based validation, calibration, fairness review, monitoring, and human governance.

## Reproducibility and Testing

Regenerate synthetic QA data:

```powershell
.\.venv\Scripts\python.exe scripts\generate_synthetic_data.py
```

Run backend tests:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Never commit production secrets, customer data, or unreviewed model artifacts to a public repository.
