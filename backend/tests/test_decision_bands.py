"""The fraud engine's three-way decision, and the things that must never
collapse back into each other: a decline is not fraud, and a payment the model
is merely unsure about is challenged rather than refused."""

import warnings

import pytest
from fastapi.testclient import TestClient

from app.ml.fraud import HARD_BLOCK_THRESHOLD, REVIEW_THRESHOLD
from app.ml.segment import SEGMENTS
from app.rules import fraud_hard_rules, haversine_km

warnings.filterwarnings("ignore")


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth(client):
    """Each test gets its own persona. Sharing one would make the tests
    interfere through the very machinery they are checking: five debits inside
    two minutes is a hard fraud rule, so a handful of same-user requests in the
    same test run start blocking each other for reasons unrelated to the case
    under test."""
    def login(phone: str) -> dict:
        token = client.post("/auth/login", json={"phone": phone, "pin": "1234"}).json()["access_token"]
        return {"Authorization": f"Bearer {token}", "X-Device": f"device-{phone[-4:]}"}
    return login


def pay(client, auth, **kwargs):
    body = {"direction": "debit", "device_id": auth["X-Device"], "lat": 23.02, "lng": 72.57, **kwargs}
    return client.post("/txn", headers={"Authorization": auth["Authorization"]}, json=body).json()


def test_thresholds_form_two_distinct_bands():
    """A single cut-off cannot both catch the social-engineering pattern and
    leave a customer's first large legitimate payment alone -- the two are the
    same shape in the features. The tuned threshold opens the challenge band;
    the higher one refuses outright.
    """
    assert REVIEW_THRESHOLD < HARD_BLOCK_THRESHOLD
    # The tuned value is what the trainer reports its metrics at, and must be
    # the one actually loaded -- it used to read the untuned 0.82 constant.
    assert REVIEW_THRESHOLD < 0.82


def test_insufficient_balance_is_a_decline_not_a_fraud_block(client, auth):
    """Being short of money must not produce a fraud-shaped outcome: no
    "blocked" status, no fraud rule in the audit trail, and no alert telling the
    customer their own payment looked like crime.
    """
    auth = auth("9000000003")
    balance = client.get("/dashboard", headers=auth).json()["balance"]
    result = pay(client, auth, amount=round(balance * 3, 2), payee="Zepto")
    assert result["status"] == "declined"
    assert "INSUFFICIENT_BALANCE" not in result["fired_rules"]
    assert result["fired_rules"] == []
    alerts = client.get("/alerts", headers=auth).json()
    newest = next(alert for alert in alerts if alert["id"] in result["alert_ids"])
    assert newest["type"] == "balance"
    assert "protection" not in newest["message_en"].lower()


def test_hard_rule_still_blocks_outright(client, auth):
    auth = auth("9000000002")
    result = pay(client, auth, amount=48000, payee="Transfer", device_id="stolen-phone")
    assert result["status"] == "blocked"
    assert "NEW_DEVICE_HIGH_VALUE" in result["fired_rules"]


def test_uncertain_payment_is_challenged_and_can_be_confirmed(client, auth):
    """The model's one independent contribution -- an atypically large payment
    draining a real share of balance to a brand-new payee -- used to post
    silently, because production blocked at 0.82 while the model scores this
    pattern around 0.55. It is now held, the money stays put, and passing
    step-up is what releases it.
    """
    auth = auth("9000000001")
    before = client.get("/dashboard", headers=auth).json()["balance"]
    result = pay(client, auth, amount=round(before * 0.75, 2), payee="A Brand New Beneficiary")
    assert result["status"] == "review"
    assert REVIEW_THRESHOLD <= result["fraud_score"] < HARD_BLOCK_THRESHOLD
    assert client.get("/dashboard", headers=auth).json()["balance"] == before, "money must not move while held"

    confirmed = client.post(f"/txn/{result['id']}/confirm", headers=auth)
    assert confirmed.status_code == 200 and confirmed.json()["status"] == "posted"
    assert client.get("/dashboard", headers=auth).json()["balance"] < before

    replay = client.post(f"/txn/{result['id']}/confirm", headers=auth)
    assert replay.status_code == 409, "a confirmed payment must not be replayable"


def test_confirm_rejects_a_transaction_that_is_not_held(client, auth):
    auth = auth("9000000004")
    posted = pay(client, auth, amount=200, payee="Zepto")
    assert posted["status"] == "posted"
    assert client.post(f"/txn/{posted['id']}/confirm", headers=auth).status_code == 409


def test_geo_jump_rule_can_fire_for_a_seeded_persona(client, auth):
    """Every seeded transaction lacked lat/lng, so haversine_km returned 0.0 and
    this rule could not fire on a persona's first payment -- the exact path the
    Safety Simulator walks.
    """
    auth = auth("9000000005")
    dashboard = client.get("/dashboard", headers=auth).json()
    assert dashboard["transactions"], "persona should have history"
    result = pay(client, auth, amount=30000, payee="Transfer", lat=19.07, lng=72.87)
    assert "GEO_JUMP_HIGH_VALUE" in result["fired_rules"]
    assert result["status"] == "blocked"


def test_dashboard_exposes_real_alert_counts_not_just_deduplicated_alerts(client, auth):
    """lib/health.ts scores up to three fraud alerts, but /dashboard's alert
    list is deduplicated by type and can never contain more than one of each.
    """
    auth = auth("9000000006")
    dashboard = client.get("/dashboard", headers=auth).json()
    assert "alert_counts" in dashboard
    types_in_list = [alert["type"] for alert in dashboard["alerts"]]
    assert len(types_in_list) == len(set(types_in_list)), "list is deduplicated by type"
    assert dashboard["alert_counts"].get("fraud", 0) >= types_in_list.count("fraud")


def test_kyc_status_exposes_the_consent_record_without_document_data(client, auth):
    auth = auth("9000000007")
    body = client.get("/kyc/status", headers=auth).json()
    assert body["kyc_status"] in {"pending", "verified"}
    assert "document image" in body["never_retained"]
    assert all(field not in body for field in ("aadhaar", "pan", "document"))


def test_haversine_is_zero_only_when_a_coordinate_is_genuinely_missing():
    assert haversine_km(None, None, 19.07, 72.87) == 0.0
    assert haversine_km(23.02, 72.57, 19.07, 72.87) > 400


def test_watchlist_still_applies_in_both_directions():
    assert "WATCHLIST_PAYEE" in fraud_hard_rules(amount=100, km_from_last=0, same_device=True, txns_last_2m=0,
                                                 category="WATCHLIST", is_night=False, direction="credit")


def test_segments_are_unchanged():
    assert len(SEGMENTS) == 7


def test_blocked_attempt_does_not_become_the_next_geo_baseline(client, auth):
    """A refused payment never happened, so it must not define where the
    customer last was. Taking the newest transaction of *any* status meant a
    genuine payment from home, made right after an attacker's blocked attempt
    from another city, was itself scored as impossible travel — and let an
    attacker poison the baseline with attempts they knew would be refused.
    """
    auth = auth("9000000007")
    blocked = pay(client, auth, amount=30000, payee="Cash Transfer", lat=19.0760, lng=72.8777)
    assert blocked["status"] == "blocked" and "GEO_JUMP_HIGH_VALUE" in blocked["fired_rules"]

    # Same city as the persona's real history, immediately afterwards.
    genuine = pay(client, auth, amount=16000, payee="Monthly Rent", lat=22.5726, lng=88.3639)
    assert "GEO_JUMP_HIGH_VALUE" not in genuine["fired_rules"]
