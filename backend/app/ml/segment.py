import numpy as np
import joblib
from pathlib import Path

SEGMENTS = ("FIRST_JOB", "MARRIAGE", "MEDICAL", "STRESS", "SAVER", "HIGH_VELOCITY", "BASELINE")

# Single source of truth for the trained classifier's input layout. Both
# `scripts/train_models.py::segment_frame` (which fits and saves
# life_stage_classifier.joblib) and `predict_segment` below build their
# feature vector by looking up this same tuple of names, instead of each
# hardcoding its own column order -- see the "Known fix" note on
# `predict_segment` for why that used to silently break.
SEGMENT_FEATURES = ("spend_30d", "savings_rate", "missed_emi", "hospital_spend", "unique_payees", "salary_amount", "velocity", "entertainment_spend")

try:
    from xgboost import XGBClassifier
except ImportError:  # Keep local fallback mode usable before optional ML install.
    XGBClassifier = None


def _training_data() -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(7)
    rows = []
    labels = []
    for label_index, label in enumerate(SEGMENTS):
        for _ in range(100):
            values = rng.normal(0, 1, 8)
            if label == "STRESS":
                values[0], values[1], values[2] = 1.4, -1.3, 1.2
            elif label == "SAVER":
                values[0], values[1] = -0.8, 1.5
            elif label == "MEDICAL":
                values[3] = 1.7
            elif label == "HIGH_VELOCITY":
                values[6] = 1.8
            elif label == "FIRST_JOB":
                values[4] = -1.0
            rows.append(values)
            labels.append(label_index)
    return np.asarray(rows), np.asarray(labels)


_MODEL = None
_MODEL_PATH = Path(__file__).parent / "models" / "life_stage_classifier.joblib"
if _MODEL_PATH.exists():
    _MODEL = joblib.load(_MODEL_PATH)
elif XGBClassifier is not None:
    features, labels = _training_data()
    _MODEL = XGBClassifier(n_estimators=40, max_depth=3, learning_rate=0.08, objective="multi:softmax", num_class=len(SEGMENTS), eval_metric="mlogloss", random_state=7)
    _MODEL.fit(features, labels)


def predict_segment(*, spend_30d: float, savings_rate: float, missed_emi: int, hospital_spend: float,
                    unique_payees: int, salary_amount: float, velocity: int, entertainment_spend: float) -> str:
    # Known fix (2026-09): this used to build the vector as a hardcoded list
    # literal in a different column order than `segment_frame` trains on
    # (salary/entertainment/unique_payees were in the wrong slots) -- the
    # saved life_stage_classifier.joblib was silently scored on scrambled
    # features for every profile that reaches it (anything past the
    # deterministic STRESS/MEDICAL/HIGH_VELOCITY/SAVER guards below, i.e.
    # every FIRST_JOB/MARRIAGE/BASELINE call). Building it from the same
    # named `SEGMENT_FEATURES` tuple the trainer uses makes the two
    # structurally impossible to drift apart again.
    normalized = {
        "spend_30d": spend_30d / 50000,
        "savings_rate": savings_rate,
        "missed_emi": missed_emi,
        "hospital_spend": hospital_spend / 20000,
        "unique_payees": unique_payees / 20,
        "salary_amount": salary_amount / 50000,
        "velocity": velocity / 20,
        "entertainment_spend": entertainment_spend / 20000,
    }
    vector = np.array([[normalized[name] for name in SEGMENT_FEATURES]], dtype=float)
    # Strong safety and behavior signals take precedence over a probabilistic class.
    if missed_emi or savings_rate < -0.15:
        return "STRESS"
    if hospital_spend > 10000:
        return "MEDICAL"
    if velocity > 15 or unique_payees > 15:
        return "HIGH_VELOCITY"
    if savings_rate > 0.2 and spend_30d < max(salary_amount * 0.8, 1):
        return "SAVER"
    if _MODEL is not None:
        return SEGMENTS[int(_MODEL.predict(vector)[0])]
    return "BASELINE"