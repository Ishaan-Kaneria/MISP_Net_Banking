from pathlib import Path

import numpy as np
import joblib
from sklearn.ensemble import IsolationForest

FEATURE_NAMES = ("amount", "log_amount", "hour", "is_night", "km_from_last", "same_device", "velocity_2m", "amount_vs_typical", "balance_ratio", "is_new_payee", "payee_frequency_30d")
MODEL_PATH = Path(__file__).parent / "models" / "iforest.joblib"
CLASSIFIER_PATH = Path(__file__).parent / "models" / "fraud_classifier.joblib"
THRESHOLD_PATH = Path(__file__).parent / "models" / "fraud_thresholds.json"


def _normal_training_data() -> np.ndarray:
    rng = np.random.default_rng(42)
    amount = rng.lognormal(mean=7.0, sigma=0.7, size=512)
    hour = rng.integers(7, 23, size=512)
    return np.column_stack((amount, np.log1p(amount), hour, hour < 5, rng.exponential(2, 512), np.ones(512), rng.poisson(0.2, 512), rng.lognormal(0, 0.25, 512), rng.uniform(0.01, 0.35, 512), rng.binomial(1, 0.04, 512), rng.poisson(4, 512)))


def _model() -> IsolationForest:
    model = IsolationForest(n_estimators=80, contamination=0.03, random_state=42)
    model.fit(_normal_training_data())
    return model


_FRAUD_MODEL = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else _model()
_FRAUD_CLASSIFIER = joblib.load(CLASSIFIER_PATH) if CLASSIFIER_PATH.exists() else None


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
    vector = np.array([[amount, np.log1p(amount), hour, int(is_night), km_from_last, int(same_device), velocity_2m,
                        amount_vs_typical, balance_ratio, int(is_new_payee), payee_frequency_30d]], dtype=float)
    if _FRAUD_CLASSIFIER is not None:
        score = float(_FRAUD_CLASSIFIER.predict_proba(vector)[0, 1])
    else:
        decision = float(_FRAUD_MODEL.decision_function(vector)[0])
        score = 1.0 / (1.0 + np.exp(5.0 * decision))
    if direction != "debit":
        score *= CREDIT_SCORE_DAMPENING
    return round(float(np.clip(score, 0.0, 1.0)), 3)