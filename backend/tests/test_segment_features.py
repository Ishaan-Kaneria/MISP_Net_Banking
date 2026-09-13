import json
from pathlib import Path

import numpy as np

from app.ml import segment
from app.ml.segment import SEGMENT_FEATURES, SEGMENTS, predict_segment

SCHEMA_PATH = Path(__file__).resolve().parents[1] / "app" / "ml" / "models" / "segment_feature_schema.json"


def test_segment_feature_order_matches_saved_schema():
    """Regression test for a real bug: predict_segment used to build its
    inference vector from a hardcoded list literal in a different column
    order than scripts/train_models.py::segment_frame trained
    life_stage_classifier.joblib on (salary_amount, entertainment_spend, and
    unique_payees were in the wrong slots), so the saved model scored every
    profile that reached it on scrambled features. Both sides now read the
    same SEGMENT_FEATURES tuple; this pins that tuple against the schema
    file scripts/train_models.py actually writes for the shipped model, so a
    future hardcoded copy anywhere can't silently drift from what the
    trained artifact expects again.
    """
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert list(SEGMENT_FEATURES) == schema["features"]


def test_predict_segment_feeds_the_model_features_in_schema_order(monkeypatch):
    """Pins the actual vector predict_segment hands to the trained model,
    independent of that model's own decision boundary. Each keyword below is
    a distinct value so a swapped pair of columns (the exact shape of the
    original bug) would show up as a wrong-order vector here even if it
    happened not to flip the predicted label.
    """
    captured = {}

    class RecordingModel:
        def predict(self, vector):
            captured["vector"] = vector
            return [0]

    monkeypatch.setattr(segment, "_MODEL", RecordingModel())
    values = dict(spend_30d=50000, savings_rate=0.1, missed_emi=0, hospital_spend=2000,
                 unique_payees=3, salary_amount=10000, velocity=4, entertainment_spend=6000)
    # None of these trip the deterministic STRESS/MEDICAL/HIGH_VELOCITY/SAVER
    # guards, so this reaches the model and RecordingModel.predict fires.
    predict_segment(**values)
    normalized = {
        "spend_30d": values["spend_30d"] / 50000, "savings_rate": values["savings_rate"], "missed_emi": values["missed_emi"],
        "hospital_spend": values["hospital_spend"] / 20000, "unique_payees": values["unique_payees"] / 20,
        "salary_amount": values["salary_amount"] / 50000, "velocity": values["velocity"] / 20,
        "entertainment_spend": values["entertainment_spend"] / 20000,
    }
    expected = np.array([[normalized[name] for name in SEGMENT_FEATURES]])
    assert captured["vector"].tolist() == expected.tolist()


def test_predict_segment_returns_a_known_label_on_the_ambiguous_path():
    result = predict_segment(spend_30d=15000, savings_rate=0.05, missed_emi=0, hospital_spend=0,
                             unique_payees=4, salary_amount=45000, velocity=3, entertainment_spend=500)
    assert result in SEGMENTS
