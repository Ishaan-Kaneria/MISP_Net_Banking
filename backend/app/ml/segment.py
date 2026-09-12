import numpy as np
import joblib
from pathlib import Path

SEGMENTS = ("FIRST_JOB", "MARRIAGE", "MEDICAL", "STRESS", "SAVER", "HIGH_VELOCITY", "BASELINE")

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
    vector = np.array([[spend_30d / 50000, savings_rate, missed_emi, hospital_spend / 20000,
                        salary_amount / 50000, entertainment_spend / 20000, velocity / 20, unique_payees / 20]], dtype=float)
    if _MODEL is not None:
        return SEGMENTS[int(_MODEL.predict(vector)[0])]
    if missed_emi or savings_rate < -0.15:
        return "STRESS"
    if hospital_spend > 10000:
        return "MEDICAL"
    if savings_rate > 0.2:
        return "SAVER"
    if velocity > 15:
        return "HIGH_VELOCITY"
    return "BASELINE"