import numpy as np
import joblib
from pathlib import Path

SEGMENTS = ("FIRST_JOB", "MARRIAGE", "MEDICAL", "STRESS", "SAVER", "HIGH_VELOCITY", "BASELINE")

# The four segments the bank decides deterministically, in `deterministic_segment`
# below: they encode policy (real financial stress, a medical shock, a
# high-velocity spender, a genuine saver), so a probabilistic model must never
# be able to talk the bank out of one. The model is only ever consulted for the
# remaining three, so those -- and only those -- are its label space.
GUARDED_SEGMENTS = ("STRESS", "MEDICAL", "HIGH_VELOCITY", "SAVER")
MODEL_SEGMENTS = ("FIRST_JOB", "MARRIAGE", "BASELINE")

# Single source of truth for the trained classifier's input layout. Both
# `scripts/train_models.py::segment_frame` (which fits and saves
# life_stage_classifier.joblib) and `predict_segment` below build their
# feature vector by looking up this same tuple of names, instead of each
# hardcoding its own column order -- see the "Known fix" note on
# `predict_segment` for why that used to silently break.
SEGMENT_FEATURES = ("spend_30d", "savings_rate", "missed_emi", "hospital_spend", "unique_payees", "salary_amount", "velocity", "entertainment_spend")

# Feature scaling, applied identically at training and inference time. Kept as
# one mapping rather than inline division so the trainer cannot normalize a
# feature differently from the way it is normalized when serving.
SEGMENT_FEATURE_SCALES = {"spend_30d": 50000, "savings_rate": 1, "missed_emi": 1, "hospital_spend": 20000,
                          "unique_payees": 20, "salary_amount": 50000, "velocity": 20, "entertainment_spend": 20000}


def normalize_segment_features(*, spend_30d: float, savings_rate: float, missed_emi: int, hospital_spend: float,
                               unique_payees: int, salary_amount: float, velocity: int, entertainment_spend: float) -> dict[str, float]:
    raw = {"spend_30d": spend_30d, "savings_rate": savings_rate, "missed_emi": missed_emi, "hospital_spend": hospital_spend,
           "unique_payees": unique_payees, "salary_amount": salary_amount, "velocity": velocity, "entertainment_spend": entertainment_spend}
    return {name: raw[name] / SEGMENT_FEATURE_SCALES[name] for name in SEGMENT_FEATURES}


def deterministic_segment(*, spend_30d: float, savings_rate: float, missed_emi: int, hospital_spend: float,
                          unique_payees: int, salary_amount: float, velocity: int, **_unused: float) -> str | None:
    """The bank's own hard segmentation policy, or None when no rule applies.

    Extracted from `predict_segment` so `scripts/train_models.py` can apply the
    *exact* same rules when it builds the training frame. It previously could
    not: the trainer generated rows across all seven labels and fit the
    classifier on every one of them, but 96% of those rows are ones these
    guards intercept before the model is ever consulted -- and 70% of the
    intercepted rows carried a label contradicting the guard that would decide
    them in production. The model was being taught, and then scored on, a
    decision boundary it never gets asked about, which is why a MARRIAGE
    customer could land on BASELINE (and a BASELINE customer on FIRST_JOB) the
    moment a real transaction was scored.

    `velocity` is a 30-day posted-transaction count (the same quantity the
    trainer generates), not a burst counter -- see pipeline.run_pipeline.

    Accepts (and ignores) the remaining segment features via `**_unused` so a
    caller can pass a whole feature row straight through without having to know
    which subset the guards happen to read.
    """
    if missed_emi or savings_rate < -0.15:
        return "STRESS"
    if hospital_spend > 10000:
        return "MEDICAL"
    if velocity > 15 or unique_payees > 15:
        return "HIGH_VELOCITY"
    if savings_rate > 0.2 and spend_30d < max(salary_amount * 0.8, 1):
        return "SAVER"
    return None


# When the approved artifact is missing we fall back to BASELINE (see
# predict_segment), not to a model trained on the spot. There used to be an
# XGBoost fallback here that fitted a classifier at import time on eight
# anonymous synthetic columns whose meanings did not line up with
# SEGMENT_FEATURES, over all seven labels rather than the three the model is
# responsible for -- so if the artifact ever went missing in production, the
# app would quietly serve life-stage decisions from a different model, trained
# on different features, with a different label space, and nothing in the
# response would say so. Failing safe to a neutral segment (no segment-specific
# offers) is the behaviour a bank wants there.
_MODEL = None
_MODEL_PATH = Path(__file__).parent / "models" / "life_stage_classifier.joblib"
if _MODEL_PATH.exists():
    _MODEL = joblib.load(_MODEL_PATH)


def predict_segment(*, spend_30d: float, savings_rate: float, missed_emi: int, hospital_spend: float,
                    unique_payees: int, salary_amount: float, velocity: int, entertainment_spend: float) -> str:
    # Strong safety and behavior signals take precedence over a probabilistic
    # class, and are evaluated first so a model regression can never hide real
    # financial stress.
    guarded = deterministic_segment(spend_30d=spend_30d, savings_rate=savings_rate, missed_emi=missed_emi,
                                    hospital_spend=hospital_spend, unique_payees=unique_payees,
                                    salary_amount=salary_amount, velocity=velocity)
    if guarded:
        return guarded
    if _MODEL is None:
        return "BASELINE"
    # Known fix (2026-09): this used to build the vector as a hardcoded list
    # literal in a different column order than `segment_frame` trains on
    # (salary/entertainment/unique_payees were in the wrong slots), so the
    # saved model was scored on scrambled features. Building it from the same
    # named `SEGMENT_FEATURES` tuple, with the same shared scales, makes the
    # two structurally impossible to drift apart again.
    normalized = normalize_segment_features(spend_30d=spend_30d, savings_rate=savings_rate, missed_emi=missed_emi,
                                            hospital_spend=hospital_spend, unique_payees=unique_payees,
                                            salary_amount=salary_amount, velocity=velocity,
                                            entertainment_spend=entertainment_spend)
    vector = np.array([[normalized[name] for name in SEGMENT_FEATURES]], dtype=float)
    # Indexed against MODEL_SEGMENTS, not SEGMENTS: the classifier is trained
    # only on the three life stages the guards above leave undecided, so its
    # class indices are positions in that tuple.
    predicted = int(_MODEL.predict(vector)[0])
    return MODEL_SEGMENTS[predicted] if 0 <= predicted < len(MODEL_SEGMENTS) else "BASELINE"
