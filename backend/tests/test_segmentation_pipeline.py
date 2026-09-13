"""Guards against the segmentation train/serve skew that let seeded personas
drift off their own life stage as soon as a real transaction was scored."""

import json
from pathlib import Path

from app.ml.segment import GUARDED_SEGMENTS, MODEL_SEGMENTS, SEGMENTS, deterministic_segment, predict_segment
from app.pipeline import savings_rate

LABEL_MAPPING_PATH = Path(__file__).resolve().parents[1] / "app" / "ml" / "models" / "segment_label_mapping.json"

# A profile that clears every deterministic guard, so the trained classifier is
# the thing that decides it.
UNGUARDED = dict(spend_30d=20000, savings_rate=0.05, missed_emi=0, hospital_spend=0,
                unique_payees=4, salary_amount=45000, velocity=6, entertainment_spend=800)


def test_saved_label_mapping_covers_exactly_the_model_served_segments():
    """The classifier is only ever consulted for the segments the guards leave
    undecided, so its label space must be MODEL_SEGMENTS -- not all seven.
    predict_segment indexes its raw output against MODEL_SEGMENTS, so a
    mapping that disagrees would silently return the wrong life stage.
    """
    mapping = json.loads(LABEL_MAPPING_PATH.read_text(encoding="utf-8"))
    assert [mapping[str(index)] for index in range(len(mapping))] == list(MODEL_SEGMENTS)
    assert set(MODEL_SEGMENTS).isdisjoint(GUARDED_SEGMENTS)
    assert set(MODEL_SEGMENTS) | set(GUARDED_SEGMENTS) == set(SEGMENTS)


def test_guards_own_their_segments_and_beat_the_model():
    assert deterministic_segment(**{**UNGUARDED, "missed_emi": 1, "velocity": 0}) == "STRESS"
    assert deterministic_segment(**{**UNGUARDED, "savings_rate": -0.2, "velocity": 0}) == "STRESS"
    assert deterministic_segment(**{**UNGUARDED, "hospital_spend": 12000, "velocity": 0}) == "MEDICAL"
    assert deterministic_segment(**{**UNGUARDED, "unique_payees": 18, "velocity": 0}) == "HIGH_VELOCITY"
    assert deterministic_segment(spend_30d=8000, savings_rate=0.4, missed_emi=0, hospital_spend=0,
                                 unique_payees=3, salary_amount=50000, velocity=4) == "SAVER"


def test_high_velocity_is_reachable_from_a_thirty_day_transaction_count():
    """pipeline.run_pipeline used to pass its *2-minute* debit burst counter as
    `velocity`. Five debits inside two minutes is already a hard fraud block,
    so that counter could never reach the guard's threshold of 16 -- this arm
    of HIGH_VELOCITY was dead code, and the model saw a feature ranging 0-2
    where its training data ranged 0-40.
    """
    assert deterministic_segment(**{**UNGUARDED, "velocity": 21, "unique_payees": 4}) == "HIGH_VELOCITY"
    assert predict_segment(**{**UNGUARDED, "velocity": 21, "unique_payees": 4}) == "HIGH_VELOCITY"


def test_model_only_ever_returns_a_segment_it_is_responsible_for():
    assert predict_segment(**UNGUARDED) in MODEL_SEGMENTS


def test_high_saver_who_misses_the_saver_threshold_is_not_forced_into_first_job():
    """Ananya Roy's real shape: saves 59% of inflow but spends just over 80% of
    salary, so the SAVER guard doesn't fire and the model decides. The training
    frame used to cap every model-served class at 0.19 savings, leaving this
    whole region uncovered, and she was classified FIRST_JOB.
    """
    assert deterministic_segment(spend_30d=20419, savings_rate=0.592, missed_emi=0, hospital_spend=0,
                                 unique_payees=2, salary_amount=25000, velocity=15) is None
    assert predict_segment(spend_30d=20419, savings_rate=0.592, missed_emi=0, hospital_spend=0,
                           unique_payees=2, salary_amount=25000, velocity=15, entertainment_spend=0) == "BASELINE"


def test_savings_rate_stays_a_rate_when_there_is_no_inflow():
    """`(credits - debits) / max(credits, 1)` returned -20000.0 for a customer
    with spending but no credit in the window -- far outside the [-1, 0.55]
    range the segmentation model is trained on, and rendered on the dashboard
    as "-2,000,000%".
    """
    assert savings_rate(0, 20000) == -1.0
    assert savings_rate(0, 0) == 0.0
    assert savings_rate(50000, 20000) == 0.6
    assert -1.0 <= savings_rate(10000, 900000) <= 1.0
