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

### Guards and model own different segments

Segmentation runs in two stages, and each stage owns a disjoint set of labels:

- `deterministic_segment()` in `app/ml/segment.py` decides `STRESS`, `MEDICAL`,
  `HIGH_VELOCITY`, and `SAVER`. These encode policy, so a probabilistic model
  must never be able to talk the bank out of one.
- The trained classifier decides only what the guards leave open:
  `FIRST_JOB`, `MARRIAGE`, `BASELINE` — its entire label space
  (`MODEL_SEGMENTS`), and the label space written to
  `segment_label_mapping.json`.

### Known fix: the classifier was trained on a boundary it never sees (2026-09)

`scripts/train_models.py` used to generate rows across all seven labels and fit
the classifier on every one of them. Because the guards intercept four of those
seven, **96% of the training rows described customers the model is never
consulted about, and 70% of those intercepted rows carried a label that
contradicted the guard that would actually decide them.** For the region it does
serve, the model was left with only 16 genuine `FIRST_JOB` and 61 genuine
`MARRIAGE` examples out of 4,200 rows.

Two feature bugs compounded it:

- `pipeline.run_pipeline` passed its **2-minute debit burst counter** as
  `velocity`, a feature trained over a 30-day transaction count of 0–40. In
  production that number is 0–2, because 5 debits inside 2 minutes is already a
  hard fraud block — so the `velocity > 15` guard could never fire, and the
  model received a constant out-of-range value. `HIGH_VELOCITY` was reachable
  only through its unique-payees arm.
- `savings_rate` was `(credits - debits) / max(credits, 1)`, which returns
  `-20000.0` rather than a rate for a customer with spending but no inflow in
  the window — far outside the `[-1, 0.55]` range the model is trained on.

Live effect: seeded personas drifted off their own life stage as soon as a real
transaction was scored — `MARRIAGE` → `BASELINE`, `BASELINE` → `FIRST_JOB` — and
lost the segment-specific offers that go with it. Only 4 of the 7 demo personas
still classified correctly after one transaction.

Fixed by making the guard function the single source of truth for both stages:
the trainer now rejection-samples the three model-served labels until each row
genuinely clears every guard, generates the four guarded labels so each
genuinely trips its own guard, trains the classifier on the served region only,
and additionally reports a **full-pipeline** metric (guards + model, end to end)
alongside the model-only one. The training frame now contains **zero
label/guard contradictions**, and all 7 personas hold their segment.

### Features

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
- More than 15 transactions (30-day count) or payees: `HIGH_VELOCITY`.
- Savings rate above 20% with controlled spend: `SAVER`.

The classifier handles ambiguous profiles after these safety and behavior checks. Credit-related recommendations are independently blocked when stress is detected.

Note that `SAVER` requires *both* a savings rate above 20% and spend below 80%
of salary, so a customer can save a large share of their inflow and still be
left to the classifier. That region has to be genuinely represented in the
training frame; it previously was not (see the known fix above).

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

Current synthetic holdout metrics, reproduced from a clean run of
`scripts/train_models.py` on the pinned dependency set and matching
`data/synthetic/reports/metrics.json` exactly:

| Metric | Value |
|---|---|
| Fraud precision | 0.978 |
| Fraud recall | 0.630 |
| Fraud F1 | 0.766 |
| Fraud PR-AUC | 0.680 |
| Fraud ROC-AUC | 0.810 |
| Fraud decision threshold (tuned on validation) | 0.43 |
| Segmentation — **full pipeline** macro-F1 (guards + model) | 0.985 |
| Segmentation — model-only macro-F1 (its served region) | 0.964 |

The previous revision of this file published fraud recall 0.677, F1 0.801,
PR-AUC 0.721, and ROC-AUC 0.835, and a segmentation macro-F1 of 0.790. **None of
those numbers reproduced from this repository.** The fraud figures were stale —
the committed `metrics.json` and a byte-identical retrain of the committed
artifact both give the table above — and the 0.790 segmentation figure measured
a seven-class problem the shipped classifier is never asked to solve (see the
known fix above). Published model performance that cannot be reproduced from
the code and artifacts in the repository is a governance problem in its own
right, independent of whether the numbers are good.

Read the segmentation figures with the right caveat: the two stages are now
measured for what they actually do, but the synthetic customers are generated
from per-segment rules, so they are close to separable by construction. The
honest claim is "the pipeline implements its stated policy consistently", not
"segmentation is 98% accurate on real customers". The fraud figures are the more
informative pair, and recall of 0.63 at precision 0.98 is the real trade-off the
tuned threshold currently strikes.

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
