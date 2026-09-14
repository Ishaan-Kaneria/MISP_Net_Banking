from app.rules import fraud_hard_rules, offer_rules
from app.ml.fraud import fraud_score
from app.ml.segment import predict_segment
from app.llm import build_system_instruction, normalize_language


def test_multilingual_chat_uses_supported_language_and_script_guidance():
    assert normalize_language("hi-IN") == "hi"
    assert normalize_language("gu_IN") == "gu"
    assert normalize_language("unsupported") == "en"
    assert "Devanagari" in build_system_instruction("hi", False)
    assert "Gujarati script" in build_system_instruction("gu", False)


def test_night_geo_high_value_is_blocked():
    reasons = fraud_hard_rules(amount=48000, km_from_last=500, same_device=False, txns_last_2m=1, category="UNKNOWN", is_night=True)
    assert "GEO_JUMP_HIGH_VALUE" in reasons
    assert "NEW_DEVICE_HIGH_VALUE" in reasons
    assert "NIGHT_HIGH_VALUE" in reasons


def test_stressed_user_cannot_receive_personal_loan():
    offers = offer_rules("UNKNOWN", "STRESS", True, 5000, 20000)
    assert not any(code == "PERSONAL_LOAN" and not blocked for code, _, blocked in offers)
    assert any(code == "GRACE_PERIOD" for code, _, _ in offers)


def test_contextual_fraud_features_raise_risk_for_new_payee_balance_pressure():
    normal = fraud_score(amount=1200, hour=12, is_night=False, km_from_last=2, same_device=True, velocity_2m=0,
                         amount_vs_typical=1, balance_ratio=0.03, is_new_payee=False, payee_frequency_30d=6)
    suspicious = fraud_score(amount=12000, hour=12, is_night=False, km_from_last=2, same_device=True, velocity_2m=0,
                             amount_vs_typical=8, balance_ratio=0.7, is_new_payee=True, payee_frequency_30d=0)
    assert suspicious > normal


def test_strong_segment_signals_are_guarded_before_model_prediction():
    assert predict_segment(spend_30d=20000, savings_rate=-0.2, missed_emi=0, hospital_spend=0, unique_payees=2, salary_amount=30000, velocity=2, entertainment_spend=100) == "STRESS"
    assert predict_segment(spend_30d=20000, savings_rate=0.1, missed_emi=0, hospital_spend=12000, unique_payees=2, salary_amount=30000, velocity=2, entertainment_spend=100) == "MEDICAL"
    assert predict_segment(spend_30d=20000, savings_rate=0.1, missed_emi=0, hospital_spend=0, unique_payees=18, salary_amount=30000, velocity=2, entertainment_spend=100) == "HIGH_VELOCITY"
