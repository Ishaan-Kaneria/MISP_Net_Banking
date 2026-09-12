import hashlib
import hmac

from fastapi.testclient import TestClient

from app import main as app_main
from app.config import settings
from app.main import app


def _login(client: TestClient) -> str:
    response = client.post("/auth/login", json={"phone": "9000000001", "pin": "1234"})
    assert response.status_code == 200
    return response.json()["access_token"]


def test_wallet_topup_full_flow_credits_balance_exactly_once(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_fake")
    monkeypatch.setattr(settings, "razorpay_key_secret", "fake_secret")
    monkeypatch.setattr(app_main, "razorpay_is_configured", lambda: True)
    monkeypatch.setattr(app_main, "create_order", lambda *, amount, receipt: {"id": "order_fake123", "amount": int(amount * 100), "currency": "INR"})

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {_login(client)}"}

        assert client.get("/wallet/topup/config", headers=headers).json()["enabled"] is True

        order = client.post("/wallet/topup/order", json={"amount": 5000}, headers=headers).json()
        assert order["order_id"] == "order_fake123"

        payment_id = "pay_fake456"
        signature = hmac.new(b"fake_secret", f"{order['order_id']}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        before = client.get("/dashboard", headers=headers).json()["balance"]

        verify = client.post("/wallet/topup/verify", json={
            "razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id, "razorpay_signature": signature,
        }, headers=headers)
        assert verify.status_code == 200
        assert verify.json()["status"] == "posted"
        after = client.get("/dashboard", headers=headers).json()["balance"]
        assert after == before + 5000

        # Replaying the same verified payment (e.g. a retried webhook) must
        # not double-credit the ledger.
        replay = client.post("/wallet/topup/verify", json={
            "razorpay_order_id": order["order_id"], "razorpay_payment_id": payment_id, "razorpay_signature": signature,
        }, headers=headers)
        assert replay.status_code == 200
        assert client.get("/dashboard", headers=headers).json()["balance"] == after


def test_wallet_topup_rejects_a_bad_signature_and_never_credits(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_fake")
    monkeypatch.setattr(settings, "razorpay_key_secret", "fake_secret")
    monkeypatch.setattr(app_main, "razorpay_is_configured", lambda: True)
    monkeypatch.setattr(app_main, "create_order", lambda *, amount, receipt: {"id": "order_bad", "amount": int(amount * 100), "currency": "INR"})

    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {_login(client)}"}
        order = client.post("/wallet/topup/order", json={"amount": 1000}, headers=headers).json()
        before = client.get("/dashboard", headers=headers).json()["balance"]

        resp = client.post("/wallet/topup/verify", json={
            "razorpay_order_id": order["order_id"], "razorpay_payment_id": "pay_x", "razorpay_signature": "0" * 64,
        }, headers=headers)
        assert resp.status_code == 400
        assert client.get("/dashboard", headers=headers).json()["balance"] == before


def test_wallet_topup_disabled_without_keys_configured():
    with TestClient(app) as client:
        headers = {"Authorization": f"Bearer {_login(client)}"}
        assert client.get("/wallet/topup/config", headers=headers).json()["enabled"] is False
        resp = client.post("/wallet/topup/order", json={"amount": 1000}, headers=headers)
        assert resp.status_code == 503
