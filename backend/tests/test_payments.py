import hashlib
import hmac

from app import payments
from app.config import settings


def test_signature_verification_matches_razorpays_documented_scheme(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_secret", "test_secret")
    order_id, payment_id = "order_ABC123", "pay_XYZ789"
    expected = hmac.new(b"test_secret", f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    assert payments.verify_payment_signature(order_id=order_id, payment_id=payment_id, signature=expected)


def test_signature_verification_rejects_tampered_signature(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_secret", "test_secret")
    assert not payments.verify_payment_signature(order_id="order_ABC123", payment_id="pay_XYZ789", signature="0" * 64)


def test_signature_verification_fails_closed_without_a_configured_secret(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    assert not payments.verify_payment_signature(order_id="o", payment_id="p", signature="anything")


def test_not_configured_without_both_keys(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "")
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    assert not payments.is_configured()
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_123")
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    assert not payments.is_configured()


def test_create_order_raises_cleanly_when_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "")
    monkeypatch.setattr(settings, "razorpay_key_secret", "")
    try:
        payments.create_order(amount=100, receipt="r1")
        assert False, "expected RazorpayError"
    except payments.RazorpayError as error:
        assert str(error) == "razorpay_not_configured"
