import json
from pathlib import Path

import numpy as np
import joblib
from sklearn.ensemble import IsolationForest

FEATURE_NAMES = ("amount", "log_amount", "hour", "is_night", "km_from_last", "same_device", "velocity_2m", "amount_vs_typical", "balance_ratio", "is_new_payee", "payee_frequency_30d", "risk_interaction")
MODEL_PATH = Path(__file__).parent / "models" / "iforest.joblib"
CLASSIFIER_PATH = Path(__file__).parent / "models" / "fraud_classifier.joblib"
THRESHOLD_PATH = Path(__file__).parent / "models" / "fraud_thresholds.json"
# Fallback used only when train_models.py has never been run against this
# checkout (no fraud_thresholds.json on disk yet) -- matches the value the
# training script itself writes as "hard_rule_threshold", so behavior is
# unchanged wherever the file exists.
DEFAULT_BLOCK_THRESHOLD = 0.82


def _normal_training_data() -> np.ndarray:
    rng = np.random.default_rng(42)
    amount = rng.lognormal(mean=7.0, sigma=0.7, size=512)
    hour = rng.integers(7, 23, size=512)
    amount_vs_typical = rng.lognormal(0, 0.25, 512)
    balance_ratio = rng.uniform(0.01, 0.35, 512)
    is_new_payee = rng.binomial(1, 0.04, 512)
    return np.column_stack((amount, np.log1p(amount), hour, hour < 5, rng.exponential(2, 512), np.ones(512), rng.poisson(0.2, 512), amount_vs_typical, balance_ratio, is_new_payee, rng.poisson(4, 512), amount_vs_typical * balance_ratio * is_new_payee))


def _model() -> IsolationForest:
    model = IsolationForest(n_estimators=80, contamination=0.03, random_state=42)
    model.fit(_normal_training_data())
    return model


_FRAUD_MODEL = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else _model()
_FRAUD_CLASSIFIER = joblib.load(CLASSIFIER_PATH) if CLASSIFIER_PATH.exists() else None
# This file used to be written by train_models.py and never read anywhere --
# a genuine F1-optimal threshold (0.52) was tuned on held-out validation
# data every retrain, then silently discarded in favor of a threshold
# hardcoded separately in pipeline.py. Loading it here so a retrain's tuning
# actually takes effect instead of being thrown away.
BLOCK_THRESHOLD = DEFAULT_BLOCK_THRESHOLD
if THRESHOLD_PATH.exists():
    BLOCK_THRESHOLD = json.loads(THRESHOLD_PATH.read_text(encoding="utf-8")).get("hard_rule_threshold", DEFAULT_BLOCK_THRESHOLD)


# Both trained models were fit on debit-shaped behavior only (device/location/
# velocity signals that describe money leaving an account), so they have no
# notion of transaction direction. Retraining them on a direction feature is
# out of scope here, so we apply a direction-aware calibration on top of the
# raw model score instead of feeding direction into the model: incoming
# credits are inherently lower fraud risk *to the receiving account* than
# outgoing debits with the same device/location/velocity profile, since the
# account holder isn't the one who could be losing money to a takeover.
CREDIT_SCORE_DAMPENING = 0.35


def fraud_score(*, amount: float, hour: int, is_night: bool, km_from_last: float, same_device: bool, velocity_2m: int,
                amount_vs_typical: float = 1.0, balance_ratio: float = 0.0, is_new_payee: bool = False,
                payee_frequency_30d: int = 0, direction: str = "debit") -> float:
    # `risk_interaction` is an engineered feature, not a raw signal: it's the
    # exact compound condition ("a disproportionately large payment, draining
    # a real chunk of the balance, to a brand-new payee") that is genuinely
    # risky when all three hold together but unremarkable on their own. A
    # tree ensemble *can* discover that AND-of-three-conditions from the raw
    # features alone, but only with enough depth and enough training rows in
    # exactly that corner of feature space -- both scarce here. Handing it
    # the product directly turns "learn a three-way interaction" into "split
    # on one number", which is far more reliable with a training set this
    # size, and it's computed once here so every consumer (training and
    # inference) derives it identically instead of duplicating the formula.
    risk_interaction = amount_vs_typical * balance_ratio * int(is_new_payee)
    vector = np.array([[amount, np.log1p(amount), hour, int(is_night), km_from_last, int(same_device), velocity_2m,
                        amount_vs_typical, balance_ratio, int(is_new_payee), payee_frequency_30d, risk_interaction]], dtype=float)
    if _FRAUD_CLASSIFIER is not None:
        score = float(_FRAUD_CLASSIFIER.predict_proba(vector)[0, 1])
    else:
        decision = float(_FRAUD_MODEL.decision_function(vector)[0])
        score = 1.0 / (1.0 + np.exp(5.0 * decision))
    if direction != "debit":
        score *= CREDIT_SCORE_DAMPENING
    return round(float(np.clip(score, 0.0, 1.0)), 3)