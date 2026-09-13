"""Train and evaluate MISP Bank's deterministic synthetic ML artifacts."""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier, IsolationForest, RandomForestClassifier
from sklearn.metrics import average_precision_score, classification_report, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.segment import GUARDED_SEGMENTS, MODEL_SEGMENTS, SEGMENT_FEATURE_SCALES, SEGMENT_FEATURES, SEGMENTS, deterministic_segment

SEED = 20260912
ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "app" / "ml" / "models"
REPORT_DIR = ROOT / "data" / "synthetic" / "reports"
FRAUD_FEATURES = ("amount", "log_amount", "hour", "is_night", "km_from_last", "same_device", "velocity_2m", "amount_vs_typical", "balance_ratio", "is_new_payee", "payee_frequency_30d", "risk_interaction")
# SEGMENT_FEATURES itself now lives in app.ml.segment, imported above, so it's
# one column order shared by training and inference instead of two copies
# that can silently drift apart -- see predict_segment's "Known fix" note.


def fraud_frame(size: int = 24000) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED)
    dates = np.array([datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(minutes=20 * index) for index in range(size)])
    amount = rng.lognormal(7.1, 0.85, size).clip(10, 250000)
    hour = rng.integers(0, 24, size)
    is_night = ((hour >= 22) | (hour < 5)).astype(int)
    distance = rng.exponential(9, size)
    same_device = rng.binomial(1, 0.96, size)
    velocity = rng.poisson(0.3, size)
    watchlist = rng.binomial(1, 0.008, size)
    new_payee = rng.binomial(1, 0.08, size)
    amount_vs_typical = rng.lognormal(0, 0.45, size).clip(0.2, 18)
    balance_ratio = rng.beta(1.5, 8, size).clip(0.001, 1.5)
    payee_frequency = rng.poisson(5, size)
    distance[::113] = 400
    amount[::113] = 22000
    velocity[::127] = 5
    amount[::127] = 12000
    same_device[::139] = 0
    amount[::139] = 26000
    hour[::149] = 23
    is_night[::149] = 1
    amount[::149] = 50000
    amount_vs_typical[::163] = 7
    balance_ratio[::163] = 0.7
    new_payee[::163] = 1
    payee_frequency[::163] = 0
    # This pattern's `amount` was left at whatever the base lognormal gave --
    # almost always under ₹20,000 -- so the model only ever saw "new payee +
    # high amount_vs_typical + high balance_ratio" fraud at small absolute
    # amounts. Paired with the large-legit injection below (which only sets
    # new_payee=0), that left "large amount" region of feature space with
    # legit examples but no risky ones, so trees generalized the whole
    # region toward "large == safe" -- undoing exactly the risk signal this
    # pattern exists to teach. Spreading it across the same wide amount
    # range as the legit injection gives the model matched contrasting
    # pairs at every amount, so it has to actually use new_payee/
    # amount_vs_typical/balance_ratio instead of amount alone.
    risky_count = len(amount[::163])
    amount[::163] = rng.uniform(3000, 150000, risky_count)

    # Realistic large *legitimate* transactions -- rent, tuition, a wedding
    # vendor payment, an EMI lump sum, a big-ticket purchase. Without this,
    # the base lognormal population puts virtually no mass above ~₹50,000
    # (its 4.4-sigma tail), so in 24,000 rows almost the only transactions
    # the model ever saw above that size were the fraud-pattern injections
    # above. It had no examples to learn that a large amount to an
    # established payee, on the account's own device, with no other risk
    # signal, is completely normal -- so at inference it extrapolated past
    # its training range and treated "large amount" alone as fraud-like,
    # regardless of context. This deliberately covers the same
    # amount_vs_typical/balance_ratio range as the fraud rule below (values
    # above 4 and 0.5 respectively) but with new_payee=0 -- an established
    # payee -- which is exactly the distinction that rule already requires
    # and the one the model needs many more examples of to actually learn.
    large_legit = rng.random(size) < 0.07
    legit_count = int(large_legit.sum())
    amount[large_legit] = rng.uniform(30000, 200000, legit_count)
    distance[large_legit] = rng.uniform(0, 15, legit_count)
    same_device[large_legit] = 1
    velocity[large_legit] = 0
    watchlist[large_legit] = 0
    hour[large_legit] = rng.integers(8, 21, legit_count)
    is_night[large_legit] = 0
    amount_vs_typical[large_legit] = rng.uniform(2, 12, legit_count)
    balance_ratio[large_legit] = rng.uniform(0.1, 0.9, legit_count)
    new_payee[large_legit] = 0
    payee_frequency[large_legit] = rng.integers(3, 15, legit_count)

    fraud = (
        ((distance > 250) & (amount > 15000))
        | (velocity >= 5)
        | ((same_device == 0) & (amount > 20000))
        | (watchlist == 1)
        | ((is_night == 1) & (amount > 40000))
        | ((amount_vs_typical > 4) & (balance_ratio > 0.5) & (new_payee == 1))
    )
    borderline = (rng.random(size) < 0.012) & ~fraud
    fraud = fraud | borderline
    # Same engineered interaction as app/ml/fraud.py::fraud_score -- gives
    # the model one direct feature for "large-vs-typical AND balance-draining
    # AND a brand-new payee" instead of requiring it to reconstruct that
    # three-way AND from splits on the three raw features separately, which
    # needs far more depth and far more matching training rows to learn
    # reliably than a single engineered column does.
    risk_interaction = amount_vs_typical * balance_ratio * new_payee
    features = np.column_stack((amount, np.log1p(amount), hour, is_night, distance, same_device, velocity, amount_vs_typical, balance_ratio, new_payee, payee_frequency, risk_interaction)).astype(float)
    order = np.argsort(dates)
    return features[order], fraud.astype(int)[order], dates[order]


def segment_frame(per_segment: int = 600) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Synthetic customers across all seven life stages, labelled the way the
    *shipped pipeline* would have to get them right.

    Known fix (2026-09): this used to generate every row freely and hand all of
    them to the classifier. Because `deterministic_segment` intercepts four of
    the seven segments before the model is ever consulted, 96% of those rows
    described customers the model never decides, and 70% of the intercepted
    ones carried a label contradicting the guard that would actually decide
    them. The classifier was therefore trained on -- and scored against -- a
    boundary it is never asked about, while getting only 16 genuine FIRST_JOB
    and 61 genuine MARRIAGE examples for the region it *does* serve. Live
    effect: seeded personas drifted off their own segment (MARRIAGE -> BASELINE,
    BASELINE -> FIRST_JOB) as soon as a real transaction was scored, taking
    their segment-specific offers with them.

    Rows for the four guarded segments are now generated to genuinely trip
    their guard, and rows for the three model-served segments are generated to
    genuinely clear all four guards, so every label is consistent with what the
    pipeline would decide. `train()` then fits the classifier on the
    model-served rows only, and evaluates the full guards+model pipeline on all
    of them.
    """
    rng = np.random.default_rng(SEED + 1)

    def draw(label: str) -> dict:
        # Baseline draw, deliberately inside every guard's "safe" range so that
        # each branch below decides on its own terms rather than tripping an
        # unrelated guard by accident.
        row = {"spend_30d": rng.uniform(5000, 90000), "savings_rate": rng.uniform(-0.14, 0.19), "missed_emi": 0,
               "hospital_spend": rng.uniform(0, 9000), "unique_payees": int(rng.integers(1, 16)),
               "salary_amount": rng.uniform(0, 90000), "velocity": int(rng.integers(0, 16)),
               "entertainment_spend": rng.uniform(0, 12000)}
        if label == "STRESS":
            # Either arm of the stress guard, so the model-served region is
            # bounded by both of them and not just the savings rate.
            if rng.random() < 0.5: row["missed_emi"] = 1
            else: row["savings_rate"] = rng.uniform(-1.0, -0.16)
        elif label == "MEDICAL":
            row["hospital_spend"] = rng.uniform(10100, 30000)
        elif label == "HIGH_VELOCITY":
            # Either arm again: a burst of transactions, a wide spread of
            # distinct payees, or both.
            pick = rng.random()
            if pick < 0.4: row["velocity"] = int(rng.integers(16, 40))
            elif pick < 0.8: row["unique_payees"] = int(rng.integers(16, 35))
            else: row["velocity"], row["unique_payees"] = int(rng.integers(16, 40)), int(rng.integers(16, 35))
        elif label == "SAVER":
            row["savings_rate"] = rng.uniform(0.21, 0.55)
            row["salary_amount"] = rng.uniform(20000, 90000)
            row["spend_30d"] = rng.uniform(1000, row["salary_amount"] * 0.79)
        elif label == "FIRST_JOB":
            # A first salary: modest regular income, spend to match, and
            # discretionary-heavy behaviour.
            row["salary_amount"] = rng.uniform(10000, 30000)
            row["spend_30d"] = rng.uniform(5000, 30000)
            row["entertainment_spend"] = rng.uniform(1500, 12000)
            row["unique_payees"] = int(rng.integers(1, 10))
            row["savings_rate"] = rng.uniform(-0.14, 0.35)
        elif label == "MARRIAGE":
            # A big-ticket season: heavy spend on few payees, little left over,
            # but no missed EMI and no medical shock -- so no guard fires and
            # the model has to recognise the shape itself.
            row["spend_30d"] = rng.uniform(35000, 90000)
            row["salary_amount"] = rng.uniform(15000, 60000)
            row["entertainment_spend"] = rng.uniform(0, 3000)
            row["unique_payees"] = int(rng.integers(1, 12))
            row["savings_rate"] = rng.uniform(-0.14, 0.25)
        else:  # BASELINE -- the catch-all, and deliberately the widest savings
            # range of the three: a customer can save a large share of their
            # inflow and still not qualify as SAVER, because that guard also
            # requires spend below 80% of salary. Ananya Roy (a seeded persona)
            # is exactly that shape -- 59% saved, but ₹419 of spend over the
            # threshold -- and with the three model-served classes previously
            # capped at 0.19 savings, no class covered her at all, so the model
            # had to extrapolate and put her in FIRST_JOB.
            row["spend_30d"] = rng.uniform(5000, 34000)
            row["salary_amount"] = rng.uniform(20000, 90000)
            row["savings_rate"] = rng.uniform(-0.14, 0.60)
        return row

    rows, labels, customer_ids = [], [], []
    for label in SEGMENTS:
        for index in range(per_segment):
            row = draw(label)
            if label in MODEL_SEGMENTS:
                # Rejection-sample until the row genuinely clears every guard.
                # This is what keeps the classifier's training set and the
                # region it actually serves identical by construction, rather
                # than by hand-tuned ranges that can silently drift apart.
                attempts = 0
                while deterministic_segment(**row) is not None and attempts < 50:
                    row = draw(label)
                    attempts += 1
            rows.append([row[name] for name in SEGMENT_FEATURES])
            labels.append(SEGMENTS.index(label))
            customer_ids.append(f"synthetic-customer-{label}-{index}")
    order = rng.permutation(len(rows))
    return np.asarray(rows, dtype=float)[order], np.asarray(labels)[order], np.asarray(customer_ids)[order]


def normalize_segment_rows(raw: np.ndarray) -> np.ndarray:
    """Apply the same per-feature scaling the serving path uses, so a row can
    never be scaled one way in training and another way at inference."""
    scales = np.array([SEGMENT_FEATURE_SCALES[name] for name in SEGMENT_FEATURES], dtype=float)
    return raw / scales


def guard_labels(raw: np.ndarray) -> np.ndarray:
    """What `deterministic_segment` would decide for each raw row ('' if it
    leaves the row to the model)."""
    index = {name: position for position, name in enumerate(SEGMENT_FEATURES)}
    return np.array([
        deterministic_segment(spend_30d=row[index["spend_30d"]], savings_rate=row[index["savings_rate"]],
                              missed_emi=int(row[index["missed_emi"]]), hospital_spend=row[index["hospital_spend"]],
                              unique_payees=row[index["unique_payees"]], salary_amount=row[index["salary_amount"]],
                              velocity=row[index["velocity"]]) or ""
        for row in raw
    ], dtype=object)


def save_json(name: str, payload: dict) -> None:
    (MODEL_DIR / name).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def train() -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    fraud_x, fraud_y, fraud_dates = fraud_frame()
    cutoff_train = datetime(2026, 7, 1, tzinfo=timezone.utc)
    cutoff_valid = datetime(2026, 8, 15, tzinfo=timezone.utc)
    train_mask = fraud_dates < cutoff_train
    valid_mask = (fraud_dates >= cutoff_train) & (fraud_dates < cutoff_valid)
    test_mask = fraud_dates >= cutoff_valid
    # n_estimators=100, not the previously-shipped 320: profiling app/ml/fraud.py's
    # per-transaction fraud_score() (see docs/PERFORMANCE.md) showed the forest's
    # predict_proba() as the dominant cost of /txn — sklearn re-validates and
    # dispatches once per tree, so latency scales ~linearly with tree count
    # (320 trees ≈ 16.6ms/call; 100 ≈ 5.3ms). Held-out precision/recall/F1 at
    # n=100 are bit-for-bit identical to n=320 and PR-AUC/ROC-AUC move by
    # <0.001 — accuracy is unaffected here because this synthetic training
    # frame's fraud rule is simple enough for the forest to fit well below 320
    # trees; re-check both when the training data or targets change.
    fraud_model = RandomForestClassifier(n_estimators=100, max_features="sqrt", min_samples_leaf=2, class_weight="balanced_subsample", random_state=SEED, n_jobs=1)
    fraud_model.fit(fraud_x[train_mask], fraud_y[train_mask])
    valid_prob = fraud_model.predict_proba(fraud_x[valid_mask])[:, 1]
    thresholds = np.linspace(0.05, 0.95, 181)
    threshold = float(max(thresholds, key=lambda value: f1_score(fraud_y[valid_mask], valid_prob >= value, zero_division=0)))
    test_prob = fraud_model.predict_proba(fraud_x[test_mask])[:, 1]
    test_pred = test_prob >= threshold
    isolation = IsolationForest(n_estimators=240, contamination=0.02, random_state=SEED, n_jobs=1)
    isolation.fit(fraud_x[train_mask][fraud_y[train_mask] == 0])
    fraud_report = {
        "train_rows": int(train_mask.sum()), "validation_rows": int(valid_mask.sum()), "test_rows": int(test_mask.sum()),
        "fraud_rate_test": float(fraud_y[test_mask].mean()), "threshold": threshold,
        "precision": float(precision_score(fraud_y[test_mask], test_pred, zero_division=0)),
        "recall": float(recall_score(fraud_y[test_mask], test_pred, zero_division=0)),
        "f1": float(f1_score(fraud_y[test_mask], test_pred, zero_division=0)),
        "pr_auc": float(average_precision_score(fraud_y[test_mask], test_prob)),
        "roc_auc": float(roc_auc_score(fraud_y[test_mask], test_prob)),
    }
    joblib.dump(fraud_model, MODEL_DIR / "fraud_classifier.joblib")
    joblib.dump(isolation, MODEL_DIR / "iforest.joblib")
    save_json("fraud_feature_schema.json", {"features": list(FRAUD_FEATURES), "model": "RandomForestClassifier", "version": "synthetic-20260912-context-v2"})
    save_json("fraud_thresholds.json", {"decision_threshold": threshold, "hard_rule_threshold": 0.82})

    segment_raw, segment_y, _ = segment_frame()
    segment_x = normalize_segment_rows(segment_raw)
    guarded = guard_labels(segment_raw)
    # Hold out a stratified slice of *whole customers* first, then split each
    # side into "the guards decide this one" and "the model decides this one".
    # Splitting in that order keeps the pipeline evaluation below honest: the
    # test customers are unseen end to end, not just unseen by the model.
    train_index, test_index = train_test_split(np.arange(len(segment_y)), test_size=0.2, random_state=SEED, stratify=segment_y)
    served_train = train_index[guarded[train_index] == ""]
    served_test = test_index[guarded[test_index] == ""]
    # The classifier's label space is MODEL_SEGMENTS, not all seven segments:
    # the four guarded segments are decided before it is ever consulted, so
    # training it to emit them taught it a boundary it is never asked about.
    model_label = {SEGMENTS.index(label): position for position, label in enumerate(MODEL_SEGMENTS)}
    y_train = np.array([model_label[value] for value in segment_y[served_train]])
    y_test = np.array([model_label[value] for value in segment_y[served_test]])
    segment_model = HistGradientBoostingClassifier(max_iter=180, learning_rate=0.08, max_leaf_nodes=20, l2_regularization=1.0, random_state=SEED)
    segment_model.fit(segment_x[served_train], y_train)
    segment_pred = segment_model.predict(segment_x[served_test])
    # The metric that actually describes what ships: run every held-out
    # customer through the same two stages the API does -- guards first, model
    # only for what they leave undecided -- and score that end to end. The
    # model-only figure below it is kept for regression tracking, but it
    # describes just the slice the model is responsible for.
    pipeline_pred = np.array([
        guarded[position] if guarded[position] else MODEL_SEGMENTS[int(segment_model.predict(segment_x[position:position + 1])[0])]
        for position in test_index
    ], dtype=object)
    pipeline_true = np.array([SEGMENTS[value] for value in segment_y[test_index]], dtype=object)
    segment_report = {
        "model_label_space": list(MODEL_SEGMENTS),
        "guarded_segments": list(GUARDED_SEGMENTS),
        "train_rows": int(len(y_train)), "test_rows": int(len(y_test)),
        "guarded_share_of_customers": float((guarded != "").mean()),
        "macro_f1": float(f1_score(y_test, segment_pred, average="macro")),
        "pipeline_macro_f1": float(f1_score(pipeline_true, pipeline_pred, average="macro")),
        "pipeline_report": classification_report(pipeline_true, pipeline_pred, output_dict=True, zero_division=0),
        "report": classification_report(y_test, segment_pred, target_names=MODEL_SEGMENTS, output_dict=True, zero_division=0),
    }
    joblib.dump(segment_model, MODEL_DIR / "life_stage_classifier.joblib")
    save_json("segment_feature_schema.json", {"features": list(SEGMENT_FEATURES), "scales": {name: SEGMENT_FEATURE_SCALES[name] for name in SEGMENT_FEATURES}, "normalization": "backend-compatible scaling", "version": "synthetic-20260913-guarded-v2"})
    # Only the model-served labels: these indices are what predict_segment
    # maps a raw classifier output back through.
    save_json("segment_label_mapping.json", {str(index): label for index, label in enumerate(MODEL_SEGMENTS)})
    (REPORT_DIR / "metrics.json").write_text(json.dumps({"fraud": fraud_report, "segmentation": segment_report}, indent=2), encoding="utf-8")
    print(json.dumps({"fraud": fraud_report, "segmentation_model_macro_f1": segment_report["macro_f1"], "segmentation_pipeline_macro_f1": segment_report["pipeline_macro_f1"]}, indent=2))
    return {"fraud": fraud_report, "segmentation": segment_report}


if __name__ == "__main__":
    train()
