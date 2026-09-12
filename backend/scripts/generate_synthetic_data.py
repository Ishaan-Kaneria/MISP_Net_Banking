"""Generate deterministic, repository-compatible synthetic QA and ML data."""

from __future__ import annotations

import csv
import json
import math
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.rules import fraud_hard_rules, offer_rules

SEED = 20260912
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic"
SEGMENTS = ("FIRST_JOB", "MARRIAGE", "MEDICAL", "STRESS", "SAVER", "HIGH_VELOCITY", "BASELINE")
CATEGORIES = ("SALARY", "HOSPITAL", "UPI_GROCERY", "FUEL", "EDUCATION", "EMI", "ENTERTAINMENT", "TRANSFER", "WATCHLIST", "UNKNOWN")


def write_csv(name: str, rows: list[dict]) -> None:
    path = OUT / name
    fields = list(rows[0]) if rows else []
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def write_json(name: str, value) -> None:
    (OUT / name).write_text(json.dumps(value, indent=2, ensure_ascii=False), encoding="utf-8")


def customer_rows() -> list[dict]:
    people = [
        ("customer-0001", "Ramesh Synthetic", "SAVER", False, 28000, 0.32, 0, 0, 4, "gu", "verified"),
        ("customer-0002", "Priya Synthetic", "FIRST_JOB", False, 18000, 0.10, 0, 0, 6, "hi", "pending"),
        ("customer-0003", "Amit Synthetic", "STRESS", True, 4500, -0.30, 1, 0, 12, "hi", "verified"),
        ("customer-0004", "Meena Synthetic", "MEDICAL", False, 22000, 0.05, 0, 24000, 5, "hi", "verified"),
        ("customer-0005", "Kiran Synthetic", "MARRIAGE", False, 65000, 0.18, 0, 7000, 8, "en", "verified"),
        ("customer-0006", "Dev Synthetic", "HIGH_VELOCITY", False, 42000, 0.08, 0, 0, 28, "en", "verified"),
        ("customer-0007", "Neha Synthetic", "BASELINE", False, 24000, 0.02, 0, 0, 7, "hi", "verified"),
        ("customer-0008", "Zero Synthetic", "BASELINE", False, 0, 0.0, 0, 0, 0, "en", "verified"),
    ]
    rows = []
    for index, (customer_id, name, segment, stress, balance, savings, missed, hospital, payees, language, kyc) in enumerate(people, 1):
        rows.append({
            "customer_id": customer_id, "name": name, "phone": f"90000000{index:02d}",
            "language": language, "kyc_status": kyc, "device_id": f"device-{index:04d}",
            "segment": segment, "life_stage": segment, "stress_flag": stress, "balance": balance,
            "spend_7d": 5000 + index * 250, "spend_30d": 24000 + index * 1500,
            "savings_rate": savings, "salary_amount": 28000 if index != 6 else 60000,
            "emi_count": 4 if index in (1, 3, 5) else 1, "missed_emi_30d": missed,
            "hospital_spend": hospital, "entertainment_spend": 600 + index * 40,
            "unique_payees_7d": payees, "night_txn_ratio": 0.02 if not stress else 0.22,
            "account_age_days": 30 if segment == "FIRST_JOB" else 720,
            "transaction_velocity": 18 if segment == "HIGH_VELOCITY" else 2,
            "city_tier": "TIER_2" if index % 2 else "TIER_1", "age_band": "26-35",
            "occupation_group": "FIRST_JOB" if segment == "FIRST_JOB" else "SALARIED",
        })
    return rows


def transaction_rows(customers: list[dict]) -> list[dict]:
    rng = random.Random(SEED)
    rows = []
    base = datetime(2026, 9, 1, 9, tzinfo=timezone.utc)
    for customer in customers:
        for index in range(20):
            category = "SALARY" if index == 0 else ("EMI" if index == 9 else "UPI_GROCERY")
            amount = 28000 if category == "SALARY" else (6200 if category == "EMI" else 350 + index * 15)
            direction = "credit" if category == "SALARY" else "debit"
            timestamp = base - timedelta(days=index) + timedelta(minutes=rng.randint(0, 300))
            rows.append({
                "transaction_id": f"txn-{customer['customer_id'][-4:]}-{index:04d}",
                "customer_id": customer["customer_id"], "amount": amount, "direction": direction,
                "payee": category.title(), "mcc": None, "category": category,
                "lat": 23.0225, "lng": 72.5714, "device_id": customer["device_id"],
                "ts": timestamp.isoformat(), "status": "posted", "fraud_score": 0.04,
                "fraud_type": "NONE", "fraud_reason": "normal seeded activity",
                "is_new_payee": False, "distance_from_previous_km": 0.0,
                "transactions_last_2m": 0, "transactions_last_1h": 0, "transactions_last_24h": 1,
                "hour_ist": (timestamp.hour + 5) % 24, "is_night": False, "same_device": True,
                "velocity_2m": 0, "account_balance_before": customer["balance"],
                "account_balance_after": customer["balance"],
            })
    return rows


def fraud_cases() -> list[dict]:
    cases = []
    specs = [
        ("safe", 1000, 10, True, 0, "UPI_GROCERY", False),
        ("geo_exact_distance", 15001, 250, True, 0, "UNKNOWN", False),
        ("geo_below_amount", 15000, 300, True, 0, "UNKNOWN", False),
        ("geo_above", 15001, 251, True, 0, "UNKNOWN", False),
        ("velocity_below", 1000, 0, True, 4, "UNKNOWN", False),
        ("velocity_exact", 1000, 0, True, 5, "UNKNOWN", False),
        ("new_device_exact_amount", 20000, 0, False, 0, "UNKNOWN", False),
        ("new_device_above", 20001, 0, False, 0, "UNKNOWN", False),
        ("watchlist", 100, 0, True, 0, "WATCHLIST", False),
        ("night_exact", 40000, 0, True, 0, "UNKNOWN", True),
        ("night_above", 40001, 0, True, 0, "UNKNOWN", True),
        ("multiple_rules", 48000, 500, False, 5, "WATCHLIST", True),
        ("missing_previous_location", 25000, 0, False, 0, "UNKNOWN", False),
    ]
    for index, (name, amount, distance, same_device, velocity, category, is_night) in enumerate(specs, 1):
        reasons = fraud_hard_rules(amount=amount, km_from_last=distance, same_device=same_device, txns_last_2m=velocity, category=category, is_night=is_night)
        status = "blocked" if reasons else ("review" if amount > 30000 else "posted")
        cases.append({
            "case_id": f"fraud-case-{index:03d}", "case_name": name, "amount": amount,
            "km_from_last": distance, "same_device": same_device, "velocity_2m": velocity,
            "category": category, "is_night": is_night, "hard_reasons": reasons,
            "expected_status": status, "expected_alert": bool(reasons),
            "model_features": {"amount": amount, "log_amount": math.log1p(amount), "hour": 23 if is_night else 12,
                               "is_night": int(is_night), "km_from_last": distance, "same_device": int(same_device),
                               "velocity_2m": velocity, "amount_vs_typical": 1.0 if name == "safe" else amount / 1200,
                               "balance_ratio": 0.05 if name == "safe" else min(amount / 50000, 1.0),
                               "is_new_payee": int(name in ("new_device_above", "multiple_rules")),
                               "payee_frequency_30d": 4 if name == "safe" else 0},
        })
    return cases


def segment_cases() -> list[dict]:
    rows = []
    templates = {
        "FIRST_JOB": (12000, 0.10, 0, 0, 4, 18000, 2, 500),
        "MARRIAGE": (45000, 0.18, 0, 7000, 8, 65000, 5, 900),
        "MEDICAL": (30000, 0.05, 0, 24000, 5, 30000, 3, 700),
        "STRESS": (42000, -0.30, 1, 0, 12, 28000, 5, 900),
        "SAVER": (18000, 0.32, 0, 0, 4, 28000, 2, 400),
        "HIGH_VELOCITY": (60000, 0.08, 0, 0, 30, 60000, 20, 1800),
        "BASELINE": (24000, 0.02, 0, 0, 7, 24000, 5, 600),
    }
    for index, (segment, values) in enumerate(templates.items(), 1):
        spend, savings, missed, hospital, payees, salary, velocity, entertainment = values
        rows.append({"case_id": f"segment-case-{index:03d}", "customer_id": f"segment-customer-{index:03d}",
                     "spend_30d": spend, "savings_rate": savings, "missed_emi": missed,
                     "hospital_spend": hospital, "unique_payees": payees, "salary_amount": salary,
                     "velocity": velocity, "entertainment_spend": entertainment,
                     "expected_segment": segment, "expected_stress_flag": segment == "STRESS",
                     "segment_reason": f"canonical {segment.lower()} behavior"})
    rows.extend([
        {"case_id": "segment-boundary-zero", "customer_id": "segment-customer-008", "spend_30d": 0, "savings_rate": 0, "missed_emi": 0, "hospital_spend": 0, "unique_payees": 0, "salary_amount": 0, "velocity": 0, "entertainment_spend": 0, "expected_segment": "BASELINE", "expected_stress_flag": False, "segment_reason": "all-zero cold start"},
        {"case_id": "segment-conflicting-stress", "customer_id": "segment-customer-009", "spend_30d": 1000, "savings_rate": 0.5, "missed_emi": 1, "hospital_spend": 0, "unique_payees": 1, "salary_amount": 10000, "velocity": 1, "entertainment_spend": 0, "expected_segment": "STRESS", "expected_stress_flag": True, "segment_reason": "missed EMI takes precedence"},
    ])
    return rows


def api_cases() -> list[dict]:
    return [
        {"case_id": "api-login-valid", "method": "POST", "path": "/auth/login", "body": {"phone": "9000000001", "pin": "1234"}, "expected_status": 200},
        {"case_id": "api-login-invalid-pin", "method": "POST", "path": "/auth/login", "body": {"phone": "9000000001", "pin": "0000"}, "expected_status": 401},
        {"case_id": "api-kyc-no-consent", "method": "POST", "path": "/kyc/verify", "body": {"doc_type": "pan", "consent": False}, "expected_status": 400},
        {"case_id": "api-txn-negative", "method": "POST", "path": "/txn", "body": {"amount": -1, "direction": "debit"}, "expected_status": 422},
        {"case_id": "api-txn-invalid-direction", "method": "POST", "path": "/txn", "body": {"amount": 1, "direction": "refund"}, "expected_status": 422},
        {"case_id": "api-txn-no-auth", "method": "POST", "path": "/txn", "body": {"amount": 1, "direction": "debit"}, "expected_status": 401},
        {"case_id": "api-dashboard-no-auth", "method": "GET", "path": "/dashboard", "body": None, "expected_status": 401},
        {"case_id": "api-chat-empty", "method": "POST", "path": "/chat", "body": {"message": "", "lang": "en"}, "expected_status": 401},
        {"case_id": "api-health", "method": "GET", "path": "/health", "body": None, "expected_status": 200},
    ]


def edge_cases() -> list[dict]:
    return [
        {"case_id": "edge-zero-amount", "field": "amount", "value": 0, "expected": "422:must be greater than zero"},
        {"case_id": "edge-negative-amount", "field": "amount", "value": -1, "expected": "422:must be greater than zero"},
        {"case_id": "edge-decimal-amount", "field": "amount", "value": "0.01", "expected": "valid positive decimal"},
        {"case_id": "edge-invalid-direction", "field": "direction", "value": "refund", "expected": "422:pattern mismatch"},
        {"case_id": "edge-missing-payee", "field": "payee", "value": None, "expected": "schema default or nullable behavior must be verified"},
        {"case_id": "edge-missing-mcc", "field": "mcc", "value": None, "expected": "valid optional field"},
        {"case_id": "edge-null-location", "field": "lat_lng", "value": None, "expected": "valid optional location"},
        {"case_id": "edge-night-boundary", "field": "hour_ist", "value": [4, 5, 21, 22], "expected": "night is hour <5 or >=22"},
        {"case_id": "edge-auth-missing", "field": "authorization", "value": None, "expected": "401:AUTH_REQUIRED"},
        {"case_id": "edge-auth-malformed", "field": "authorization", "value": "Bearer invalid", "expected": "401:INVALID_TOKEN"},
        {"case_id": "edge-kyc-no-consent", "field": "consent", "value": False, "expected": "400:CONSENT_REQUIRED"},
        {"case_id": "edge-stress-credit", "field": "offer", "value": "PERSONAL_LOAN", "expected": "blocked_by_ethics=true"},
        {"case_id": "edge-stress-grace", "field": "offer", "value": "GRACE_PERIOD", "expected": "available"},
    ]


def validate(customers: list[dict], transactions: list[dict], fraud: list[dict], segments: list[dict], offers: list[dict]) -> None:
    customer_ids = [row["customer_id"] for row in customers]
    transaction_ids = [row["transaction_id"] for row in transactions]
    assert len(customer_ids) == len(set(customer_ids)), "duplicate customer IDs"
    assert len(transaction_ids) == len(set(transaction_ids)), "duplicate transaction IDs"
    assert {row["expected_segment"] for row in segments} == set(SEGMENTS), "segment coverage incomplete"
    covered = {reason for case in fraud for reason in case["hard_reasons"]}
    expected_rules = {"GEO_JUMP_HIGH_VALUE", "VELOCITY_5_DEBITS_2M", "NEW_DEVICE_HIGH_VALUE", "WATCHLIST_PAYEE", "NIGHT_HIGH_VALUE"}
    assert covered == expected_rules, f"fraud rule coverage mismatch: {covered}"
    assert any(not case["hard_reasons"] for case in fraud), "no safe fraud case"
    assert any(len(case["hard_reasons"]) > 1 for case in fraud), "no multi-rule fraud case"
    assert all(float(row["amount"]) > 0 for row in transactions), "non-positive transaction amount"
    assert {row["status"] for row in transactions} == {"posted"}, "normal fixture should only contain posted activity"
    assert any(row["stress_flag"] for row in customers), "stress customer missing"
    assert any(not row["stress_flag"] for row in customers), "non-stress customer missing"
    assert any(any(item[0] == "PERSONAL_LOAN" and item[2] for item in offer["expected_offers"]) for offer in offers), "blocked loan offer missing"


def main() -> None:
    random.seed(SEED)
    OUT.mkdir(parents=True, exist_ok=True)
    customers = customer_rows()
    transactions = transaction_rows(customers)
    fraud = fraud_cases()
    segments = segment_cases()
    edge = edge_cases()
    offers = []
    for category, segment, stress, amount, spend in [("SALARY", "SAVER", False, 28000, 24000), ("HOSPITAL", "MEDICAL", False, 24000, 24000), ("UNKNOWN", "STRESS", True, 5000, 20000), ("UNKNOWN", "FIRST_JOB", False, 5000, 20000), ("UNKNOWN", "BASELINE", False, 1000, 20000)]:
        offers.append({"category": category, "segment": segment, "stress_flag": stress, "amount": amount, "spend_30d": spend, "expected_offers": [list(item) for item in offer_rules(category, segment, stress, amount, spend)]})
    validate(customers, transactions, fraud, segments, offers)
    write_csv("customers.csv", customers)
    write_csv("transactions.csv", transactions)
    write_csv("fraud_cases.csv", fraud)
    write_csv("segment_cases.csv", segments)
    write_csv("fraud_training.csv", [{**case["model_features"], "case_id": case["case_id"], "is_fraud": bool(case["hard_reasons"]), "fraud_type": case["hard_reasons"][0] if case["hard_reasons"] else "NONE"} for case in fraud])
    write_csv("segmentation_training.csv", [{key: row[key] for key in ("case_id", "spend_30d", "savings_rate", "missed_emi", "hospital_spend", "unique_payees", "salary_amount", "velocity", "entertainment_spend", "expected_segment")} for row in segments])
    write_csv("offer_cases.csv", offers)
    write_json("api_cases.json", api_cases())
    write_json("edge_cases.json", edge)
    write_json("expected_results.json", {"fraud_cases": fraud, "segment_cases": segments, "offer_cases": offers})
    (OUT / "data_dictionary.md").write_text("# Synthetic data dictionary\n\nAll records are deterministic synthetic fixtures. Fraud thresholds are evaluated by `backend/app/rules.py`. Model features are available at decision time; labels and expected fields are test-only targets.\n", encoding="utf-8")
    (OUT / "README.md").write_text("# MISP Bank synthetic coverage data\n\nRun `python scripts/generate_synthetic_data.py` from `backend`. The generator covers every hard fraud rule, exact threshold boundaries, normal and blocked outcomes, all seven segments, ethics offers, and representative API validation cases. It uses seed 20260912 and never accesses external data.\n", encoding="utf-8")
    print(f"Generated {len(customers)} customers, {len(transactions)} transactions, {len(fraud)} fraud cases, {len(segments)} segment cases, {len(offers)} offer cases and {len(api_cases())} API cases in {OUT}")
    print("Fraud rules covered:", sorted({reason for case in fraud for reason in case["hard_reasons"]}))
    print("Segments covered:", ", ".join(sorted({row["expected_segment"] for row in segments})))


if __name__ == "__main__":
    main()
