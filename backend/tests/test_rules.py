from app.rules import fraud_hard_rules, offer_rules


def test_night_geo_high_value_is_blocked():
    reasons = fraud_hard_rules(amount=48000, km_from_last=500, same_device=False, txns_last_2m=1, category="UNKNOWN", is_night=True)
    assert "GEO_JUMP_HIGH_VALUE" in reasons
    assert "NEW_DEVICE_HIGH_VALUE" in reasons
    assert "NIGHT_HIGH_VALUE" in reasons


def test_stressed_user_cannot_receive_personal_loan():
    offers = offer_rules("UNKNOWN", "STRESS", True, 5000, 20000)
    assert not any(code == "PERSONAL_LOAN" and not blocked for code, _, blocked in offers)
    assert any(code == "GRACE_PERIOD" for code, _, _ in offers)