"""Train and evaluate Arth-AI's deterministic synthetic ML artifacts."""

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

from app.ml.segment import SEGMENTS

SEED = 20260912
ROOT = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT / "app" / "ml" / "models"
REPORT_DIR = ROOT / "data" / "synthetic" / "reports"
FRAUD_FEATURES = ("amount", "log_amount", "hour", "is_night", "km_from_last", "same_device", "velocity_2m", "amount_vs_typical", "balance_ratio", "is_new_payee", "payee_frequency_30d")
SEGMENT_FEATURES = ("spend_30d", "savings_rate", "missed_emi", "hospital_spend", "unique_payees", "salary_amount", "velocity", "entertainment_spend")


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
    features = np.column_stack((amount, np.log1p(amount), hour, is_night, distance, same_device, velocity, amount_vs_typical, balance_ratio, new_payee, payee_frequency)).astype(float)
    order = np.argsort(dates)
    return features[order], fraud.astype(int)[order], dates[order]


def segment_frame(per_segment: int = 600) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(SEED + 1)
    rows, labels, customer_ids = [], [], []
    for label_index, label in enumerate(SEGMENTS):
        for index in range(per_segment):
            spend = rng.uniform(5000, 90000)
            savings = rng.uniform(-0.35, 0.55)
            missed = int(rng.random() < 0.08)
            hospital = rng.uniform(0, 30000)
            payees = int(rng.integers(1, 35))
            salary = rng.uniform(0, 90000)
            velocity = int(rng.integers(0, 40))
            entertainment = rng.uniform(0, 12000)
            if label == "STRESS": missed, savings = max(missed, 1), min(savings, -0.16)
            elif label == "SAVER": savings, missed = max(savings, 0.22), 0
            elif label == "MEDICAL": hospital = max(hospital, 11000)
            elif label == "HIGH_VELOCITY": velocity, payees = max(velocity, 18), max(payees, 16)
            elif label == "FIRST_JOB": salary, spend = rng.uniform(10000, 30000), rng.uniform(5000, 30000)
            elif label == "MARRIAGE": spend, hospital = max(spend, 35000), min(hospital, 9000)
            else: missed, hospital = 0, min(hospital, 9000)
            rows.append([spend / 50000, savings, missed, hospital / 20000, payees / 20, salary / 50000, velocity / 20, entertainment / 20000])
            labels.append(label_index)
            customer_ids.append(f"synthetic-customer-{label_index}-{index}")
    order = rng.permutation(len(rows))
    return np.asarray(rows)[order], np.asarray(labels)[order], np.asarray(customer_ids)[order]


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

    segment_x, segment_y, customer_ids = segment_frame()
    x_train, x_test, y_train, y_test = train_test_split(segment_x, segment_y, test_size=0.2, random_state=SEED, stratify=segment_y)
    segment_model = HistGradientBoostingClassifier(max_iter=180, learning_rate=0.08, max_leaf_nodes=20, l2_regularization=1.0, random_state=SEED)
    segment_model.fit(x_train, y_train)
    segment_pred = segment_model.predict(x_test)
    segment_report = {"train_rows": int(len(y_train)), "test_rows": int(len(y_test)), "macro_f1": float(f1_score(y_test, segment_pred, average="macro")), "report": classification_report(y_test, segment_pred, target_names=SEGMENTS, output_dict=True, zero_division=0)}
    joblib.dump(segment_model, MODEL_DIR / "life_stage_classifier.joblib")
    save_json("segment_feature_schema.json", {"features": list(SEGMENT_FEATURES), "normalization": "backend-compatible scaling", "version": "synthetic-20260912"})
    save_json("segment_label_mapping.json", {str(index): label for index, label in enumerate(SEGMENTS)})
    (REPORT_DIR / "metrics.json").write_text(json.dumps({"fraud": fraud_report, "segmentation": segment_report}, indent=2), encoding="utf-8")
    print(json.dumps({"fraud": fraud_report, "segmentation_macro_f1": segment_report["macro_f1"]}, indent=2))
    return {"fraud": fraud_report, "segmentation": segment_report}


if __name__ == "__main__":
    train()
