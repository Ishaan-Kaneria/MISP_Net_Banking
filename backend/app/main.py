from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .llm import generate_reply_with_status, normalize_language
from .models import Account, Alert, AuditLog, ChatMessage, KycEvent, Recommendation, Transaction, User, UserFeature, UserScore, WalletTopup
from .payments import RazorpayError, create_order, is_configured as razorpay_is_configured, verify_payment_signature
from .rag.retrieve import retrieve
from .pipeline import refresh_behavioural_profile, run_pipeline
from .schemas import ChatRequest, HealthResponse, KycRequest, LoginRequest, TransactionRequest, TransactionResponse, WalletTopupOrderRequest, WalletTopupVerifyRequest
from .security import create_token, decode_token, hash_pin, verify_pin
from .seed import seed

app = FastAPI(title="MISP Bank", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    # In production (Postgres) the Docker CMD already runs `alembic upgrade
    # head` before uvicorn starts, so the schema is authoritative before this
    # ever runs. `create_all` here would just re-issue a full table/column
    # reflection round-trip to the DB on every single cold start (Render's
    # free tier spins the service down between requests, so this happens
    # often) for zero effect. Local/dev sqlite has no migration step, so it
    # still needs create_all to bootstrap the schema; tests rely on this too.
    if engine.dialect.name == "sqlite":
        Base.metadata.create_all(engine)
    seed()


def serialize_alert(alert: Alert) -> dict:
    # message_gu falls back to message_en (never message_hi -- the two are
    # unrelated languages) for alerts created before that column existed,
    # so every consumer gets a usable Gujarati-slot string instead of null.
    return {"id": alert.id, "type": alert.type, "message_en": alert.message_en, "message_hi": alert.message_hi, "message_gu": alert.message_gu or alert.message_en}


def unique_by_key(items: list, key: str) -> list:
    seen: set[str] = set()
    unique: list = []
    for item in items:
        value = getattr(item, key)
        if value in seen:
            continue
        seen.add(value)
        unique.append(item)
    return unique


def current_user(authorization: str | None, db: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, detail={"error": "Authentication required", "code": "AUTH_REQUIRED", "details": {}})
    try:
        user = db.get(User, decode_token(authorization[7:]))
    except ValueError as exc:
        raise HTTPException(401, detail={"error": str(exc), "code": "INVALID_TOKEN", "details": {}}) from exc
    if not user:
        raise HTTPException(401, detail={"error": "User not found", "code": "USER_NOT_FOUND", "details": {}})
    return user


@app.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "db": "ok"}


@app.post("/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.phone == payload.phone))
    if not user or not verify_pin(payload.pin, user.pin_hash):
        raise HTTPException(401, detail={"error": "Invalid phone or PIN", "code": "INVALID_LOGIN", "details": {}})
    return {"access_token": create_token(user.id), "token_type": "bearer", "user": {"id": user.id, "name": user.name, "lang": user.lang}}


@app.post("/kyc/verify")
def verify_kyc(payload: KycRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    if not payload.consent:
        raise HTTPException(400, detail={"error": "Consent is required", "code": "CONSENT_REQUIRED", "details": {}})
    user.kyc_status = "verified"
    db.add(KycEvent(user_id=user.id, doc_type=payload.doc_type, mock_ref=f"mock-{user.id[:8]}", consent_json={"purpose": "account verification", "locale": payload.locale, "timestamp": datetime.now(timezone.utc).isoformat()}))
    db.commit()
    return {"kyc_status": "verified", "mock_ref": f"mock-{user.id[:8]}"}


@app.get("/kyc/status")
def kyc_status(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """The customer's own verification state and consent record.

    The KYC journey was previously a one-way door: personas start `pending`, the
    screen appears exactly once, and after verifying there was no route back to
    it anywhere in the app — so the consent record the DPDP safeguards are
    built around was invisible to the very person who gave it. This exposes what
    is actually stored (a mock reference, the document type, the language the
    consent was read in, and when) and deliberately nothing more: there is no
    document image or Aadhaar number to return, which is the point.
    """
    user = current_user(authorization, db)
    event = db.scalar(select(KycEvent).where(KycEvent.user_id == user.id).order_by(KycEvent.created_at.desc()))
    consent = event.consent_json if event else {}
    return {
        "kyc_status": user.kyc_status,
        "doc_type": event.doc_type if event else None,
        "mock_ref": event.mock_ref if event else None,
        "consent_locale": consent.get("locale") if isinstance(consent, dict) else None,
        "consent_purpose": consent.get("purpose") if isinstance(consent, dict) else None,
        "consent_timestamp": consent.get("timestamp") if isinstance(consent, dict) else None,
        "retained_fields": ["verification reference", "document type", "consent purpose", "consent language", "consent timestamp"],
        "never_retained": ["document image", "Aadhaar number", "PAN number", "biometrics"],
    }


@app.post("/txn", response_model=TransactionResponse)
def create_transaction(payload: TransactionRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    transaction, alert_ids, hard_reasons = run_pipeline(db, user.id, payload)
    return TransactionResponse(id=transaction.id, status=transaction.status, fraud_score=transaction.fraud_score, category=transaction.category, alert_ids=alert_ids, fired_rules=hard_reasons)


@app.post("/txn/{transaction_id}/confirm", response_model=TransactionResponse)
def confirm_transaction(transaction_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Complete a payment the fraud engine held for step-up confirmation.

    A middling fraud score means "this could be a genuine large payment or a
    social-engineering transfer, and the data cannot tell them apart" — so the
    customer is asked to confirm rather than being refused outright. Passing the
    step-up check is what distinguishes the two: an attacker who has the account
    but not the one-time code cannot get here. Only a transaction still in
    `review` can be confirmed, so this can never post something a hard rule
    refused, and the balance is re-checked at confirmation time because it may
    have moved since the payment was scored.
    """
    user = current_user(authorization, db)
    transaction = db.get(Transaction, transaction_id)
    if not transaction or transaction.user_id != user.id:
        raise HTTPException(404, detail={"error": "Transaction not found", "code": "NOT_FOUND", "details": {}})
    if transaction.status != "review":
        raise HTTPException(409, detail={"error": "This payment is not waiting for confirmation", "code": "NOT_IN_REVIEW", "details": {"status": transaction.status}})
    account = db.scalar(select(Account).where(Account.user_id == user.id).with_for_update())
    if transaction.direction == "debit" and account and transaction.amount > account.balance:
        transaction.status = "declined"
        db.commit()
        raise HTTPException(400, detail={"error": "Your balance no longer covers this payment", "code": "INSUFFICIENT_BALANCE", "details": {}})
    transaction.status = "posted"
    if account:
        account.balance += transaction.amount if transaction.direction == "credit" else -transaction.amount
    db.add(AuditLog(user_id=user.id, transaction_id=transaction.id, action="txn_step_up_confirmed",
                   features={"fraud_score": transaction.fraud_score}, reasons=["STEP_UP_CONFIRMED"]))
    # Releasing a held payment changes the customer's behaviour as much as
    # scoring one does, so their features, segment and offers are recomputed
    # here too. Without this the money moved and nothing else did: a payment
    # large enough to tip someone into financial stress left them looking at a
    # stale segment and their old credit offers until some later transaction
    # happened to trigger a recompute.
    refresh_behavioural_profile(db, user.id, now=datetime.now(timezone.utc), category=transaction.category,
                                amount=float(transaction.amount), current_balance=float(account.balance) if account else 0.0)
    db.commit()
    db.refresh(transaction)
    return TransactionResponse(id=transaction.id, status=transaction.status, fraud_score=transaction.fraud_score,
                               category=transaction.category, alert_ids=[], fired_rules=[])


@app.post("/admin/simulate-txn", response_model=TransactionResponse)
def simulate_transaction(payload: TransactionRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return create_transaction(payload, authorization, db)


@app.get("/wallet/topup/config")
def wallet_topup_config(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    current_user(authorization, db)
    return {"enabled": razorpay_is_configured(), "key_id": settings.razorpay_key_id if razorpay_is_configured() else None, "max_amount": settings.wallet_topup_max_amount}


@app.post("/wallet/topup/order")
def create_wallet_topup_order(payload: WalletTopupOrderRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    if not razorpay_is_configured():
        raise HTTPException(503, detail={"error": "Add Money is not configured on this server yet", "code": "RAZORPAY_NOT_CONFIGURED", "details": {}})
    if payload.amount > settings.wallet_topup_max_amount:
        raise HTTPException(400, detail={"error": f"Amount exceeds the maximum top-up of ₹{settings.wallet_topup_max_amount:,}", "code": "AMOUNT_TOO_LARGE", "details": {}})
    topup = WalletTopup(user_id=user.id, amount=payload.amount, razorpay_order_id="pending", status="created")
    db.add(topup)
    db.flush()
    try:
        order = create_order(amount=payload.amount, receipt=topup.id)
    except RazorpayError as error:
        db.rollback()
        raise HTTPException(502, detail={"error": "Could not start the payment with Razorpay", "code": str(error), "details": {}}) from error
    topup.razorpay_order_id = order["id"]
    db.commit()
    return {"order_id": order["id"], "amount": order["amount"], "currency": order["currency"], "key_id": settings.razorpay_key_id}


@app.post("/wallet/topup/verify", response_model=TransactionResponse)
def verify_wallet_topup(payload: WalletTopupVerifyRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    topup = db.scalar(select(WalletTopup).where(WalletTopup.razorpay_order_id == payload.razorpay_order_id))
    if not topup or topup.user_id != user.id:
        raise HTTPException(404, detail={"error": "Top-up order not found", "code": "NOT_FOUND", "details": {}})
    if topup.status == "paid" and topup.transaction_id:
        transaction = db.get(Transaction, topup.transaction_id)
        return TransactionResponse(id=transaction.id, status=transaction.status, fraud_score=transaction.fraud_score, category=transaction.category, alert_ids=[])
    if not verify_payment_signature(order_id=payload.razorpay_order_id, payment_id=payload.razorpay_payment_id, signature=payload.razorpay_signature):
        topup.status = "failed"
        db.commit()
        raise HTTPException(400, detail={"error": "Payment signature could not be verified", "code": "SIGNATURE_INVALID", "details": {}})
    topup.razorpay_payment_id = payload.razorpay_payment_id
    topup_request = TransactionRequest(amount=topup.amount, direction="credit", payee="Razorpay Top-up", device_id=user.device_id)
    transaction, alert_ids, hard_reasons = run_pipeline(db, user.id, topup_request, force_post=True)
    topup.status = "paid"
    topup.transaction_id = transaction.id
    db.commit()
    return TransactionResponse(id=transaction.id, status=transaction.status, fraud_score=transaction.fraud_score, category=transaction.category, alert_ids=alert_ids, fired_rules=hard_reasons)


@app.get("/dashboard")
def dashboard(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    feature = db.get(UserFeature, user.id)
    score = db.get(UserScore, user.id)
    txns = list(db.scalars(select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.ts.desc()).limit(20)))
    offers = unique_by_key(list(db.scalars(select(Recommendation).where(Recommendation.user_id == user.id).order_by(Recommendation.created_at.desc()).limit(24))), "product_code")[:6]
    alerts = unique_by_key(list(db.scalars(select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc()).limit(24))), "type")[:6]
    # The list above is deduplicated by type so the UI shows one card per kind
    # of alert. That makes it useless for counting, and lib/health.ts was
    # counting it anyway -- scoring `Math.min(fraudAlerts, 3) * 14` against a
    # list that can never contain more than one alert of a type, so an account
    # with four blocked fraud attempts scored exactly the same as one with a
    # single blocked attempt. These are the real per-type totals.
    alert_counts = dict(db.execute(select(Alert.type, func.count(Alert.id)).where(Alert.user_id == user.id).group_by(Alert.type)).all())
    feature_payload = {
        "spend_7d": float(feature.spend_7d or 0) if feature else 0,
        "spend_30d": float(feature.spend_30d or 0) if feature else 0,
        "savings_rate": feature.savings_rate if feature else 0,
        "salary_amt": float(feature.salary_amt or 0) if feature else 0,
        "emi_count": feature.emi_count if feature else 0,
        "night_txn_ratio": feature.night_txn_ratio if feature else 0,
        "unique_payees_7d": feature.unique_payees_7d if feature else 0,
        "missed_emi_30d": feature.missed_emi_30d if feature else 0,
    }
    return {"user": {"id": user.id, "name": user.name, "lang": user.lang, "kyc_status": user.kyc_status, "device_id": user.device_id}, "balance": float(account.balance if account else 0), "segment": score.segment if score else "BASELINE", "stress_flag": score.stress_flag if score else False, "features": feature_payload, "transactions": [{"id": t.id, "amount": float(t.amount), "direction": t.direction, "payee": t.payee, "category": t.category, "status": t.status, "fraud_score": t.fraud_score, "ts": t.ts.isoformat()} for t in txns], "offers": [{"id": x.id, "product_code": x.product_code, "reason": x.reason, "blocked_by_ethics": x.blocked_by_ethics} for x in offers], "alerts": [serialize_alert(x) for x in alerts], "alert_counts": {key: int(value) for key, value in alert_counts.items()}}


@app.get("/alerts")
def alerts(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    return [serialize_alert(x) for x in db.scalars(select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc()))]


@app.get("/offers")
def offers(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    return [{"id": x.id, "product_code": x.product_code, "reason": x.reason, "blocked_by_ethics": x.blocked_by_ethics} for x in unique_by_key(list(db.scalars(select(Recommendation).where(Recommendation.user_id == user.id).order_by(Recommendation.created_at.desc()))), "product_code")]


@app.post("/offers/{recommendation_id}/accept")
def accept_offer(recommendation_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    recommendation = db.get(Recommendation, recommendation_id)
    if not recommendation or recommendation.user_id != user.id:
        raise HTTPException(404, detail={"error": "Offer not found", "code": "NOT_FOUND", "details": {}})
    if recommendation.blocked_by_ethics:
        return {"accepted": False, "reason": "This offer is paused to protect your cash flow."}
    return {"accepted": True, "product_code": recommendation.product_code, "message": "Your request has been recorded for the demo."}


@app.get("/chat/history")
def chat_history(limit: int = 40, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """The customer's own conversation, oldest first.

    Every turn was already being persisted as a ChatMessage — and then never
    read back by anything, so the "conversational assistant" showed exactly one
    question and one answer at a time and forgot the exchange on any reload.
    """
    user = current_user(authorization, db)
    rows = list(db.scalars(
        select(ChatMessage).where(ChatMessage.user_id == user.id).order_by(ChatMessage.created_at.desc()).limit(max(1, min(limit, 100)))
    ))
    return [{"id": m.id, "role": m.role, "content": m.content, "lang": m.lang, "ts": m.created_at.isoformat()} for m in reversed(rows)]


@app.post("/chat")
def chat(payload: ChatRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    score = db.get(UserScore, user.id)
    language = normalize_language(payload.lang)
    message = payload.message.lower()
    db.add(ChatMessage(user_id=user.id, role="user", content=payload.message, lang=language))
    policy_context = retrieve(db, payload.message)
    traces = [f"rag:{document.source}" for document in policy_context]
    if score and score.stress_flag and any(word in message for word in ("loan", "credit", "लोन", "क्रेडिट", "લોન", "ક્રેડિટ")):
        reply = {
            "hi": "आपके नकदी प्रवाह पर दबाव है, इसलिए क्रेडिट अनुरोध अभी रोक दिया गया है। मैं 15 दिन की ग्रेस अवधि में मदद कर सकता हूं।",
            "gu": "તમારા રોકડ પ્રવાહ પર દબાણ હોવાથી ક્રેડિટ વિનંતી હાલમાં રોકવામાં આવી છે. હું 15 દિવસની ગ્રેસ અવધિમાં મદદ કરી શકું છું.",
        }.get(language, "Your credit request is paused while your cash flow is under stress. I can help request a 15-day grace period.")
        db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=language))
        db.commit()
        return {"reply": reply, "tool_traces": traces + ["ethics_gate: credit refused"]}
    if any(word in message for word in ("balance", "बैलेंस", "બેલેન્સ")):
        account = db.scalar(select(Account).where(Account.user_id == user.id))
        balance = float(account.balance if account else 0)
        reply = {
            "hi": f"आपका उपलब्ध बैलेंस ₹{balance:,.2f} है।",
            "gu": f"તમારું ઉપલબ્ધ બેલેન્સ ₹{balance:,.2f} છે.",
        }.get(language, f"Your available balance is ₹{balance:,.2f}.")
        db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=language))
        db.commit()
        return {"reply": reply, "tool_traces": traces + ["get_balance"]}
    reply = {
        "hi": "मैं आपके बैलेंस, ऑफर, हाल की गतिविधि या ग्रेस अवधि में मदद कर सकता हूं।",
        "gu": "હું તમારા બેલેન્સ, ઓફર્સ, તાજેતરની પ્રવૃત્તિ અથવા ગ્રેસ અવધિમાં મદદ કરી શકું છું.",
    }.get(language, "I can help with your balance, offers, recent transactions, or a grace period.")
    if any(word in message for word in ("offer", "offers", "સૂચન", "ऑफर")):
        reply = {"hi": "आपके खाते के लिए उपलब्ध सुझाव सुरक्षा नियमों के अनुसार दिखाए गए हैं। ऑफर टैब में हर सुझाव का कारण देखें।", "gu": "તમારા ખાતા માટેની ભલામણો સુરક્ષા નિયમો મુજબ બતાવવામાં આવી છે. દરેક કારણ જોવા માટે ભલામણો જુઓ."}.get(language, "Your available recommendations are selected using your account activity and safety rules. Open recommendations to see the reason for each one.")
    elif any(word in message for word in ("transaction", "payment", "भुगतान", "लेनदेन", "ચુકવણી")):
        reply = {"hi": "आपकी हाल की गतिविधि में भुगतान, राशि और सुरक्षा स्थिति दिखाई जाती है। किसी संदिग्ध भुगतान को सुरक्षा जांच में भेजा जा सकता है।", "gu": "તમારી તાજેતરની પ્રવૃત્તિમાં ચુકવણી, રકમ અને સુરક્ષા સ્થિતિ દેખાય છે. શંકાસ્પદ ચુકવણી સુરક્ષા તપાસમાં જઈ શકે છે."}.get(language, "Your recent activity shows each payment, amount, and safety status. Suspicious payments may be sent for a safety check.")
    elif any(word in message for word in ("save", "saving", "emergency", "बचत", "आपात", "બચત")):
        reply = {"hi": "आपकी बचत दर और 30 दिन के खर्च को साथ देखकर आपातकालीन निधि का लक्ष्य तय करना आसान होगा।", "gu": "તમારા બચત દર અને 30 દિવસના ખર્ચને સાથે જોઈને ઇમરજન્સી ફંડનું લક્ષ્ય નક્કી કરી શકાય છે."}.get(language, "Compare your savings rate with your 30-day spend, then set an emergency-fund target that fits your cash flow.")
    model_reply, llm_status = generate_reply_with_status(payload.message, language, "\n\n".join(document.content for document in policy_context), bool(score and score.stress_flag))
    if model_reply:
        reply = model_reply
    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=language))
    db.commit()
    traces.append(f"llm:{llm_status}")
    return {"reply": reply, "tool_traces": traces}


@app.get("/explain/txn/{transaction_id}")
def explain_transaction(transaction_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    transaction = db.get(Transaction, transaction_id)
    if not transaction or transaction.user_id != user.id:
        raise HTTPException(404, detail={"error": "Transaction not found", "code": "NOT_FOUND", "details": {}})
    audit = db.scalar(select(AuditLog).where(AuditLog.user_id == user.id, AuditLog.transaction_id == transaction.id).order_by(AuditLog.created_at.desc()))
    reasons = audit.reasons if audit else []
    return {"id": transaction.id, "status": transaction.status, "fraud_score": transaction.fraud_score, "features": audit.features if audit else {}, "fired_rules": reasons,
           "explanation_en": "This score reflects amount, time, device, location, and velocity signals.",
           "explanation_hi": "यह स्कोर राशि, समय, डिवाइस, स्थान और गति के संकेतों पर आधारित है।",
           "explanation_gu": "આ સ્કોર રકમ, સમય, ડિવાઇસ, સ્થાન અને ગતિના સંકેતોને પ્રતિબિંબિત કરે છે."}


@app.get("/explain/user/{user_id}")
def explain_user(user_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    if user.id != user_id:
        raise HTTPException(403, detail={"error": "Forbidden", "code": "FORBIDDEN", "details": {}})
    score = db.get(UserScore, user.id)
    stress_flag = score.stress_flag if score else False
    # Mirrors the same EN/HI/GU choice offer_rules() and the /chat ethics
    # gate already make (grace support, never credit, once stress is
    # detected) -- previously English-only here, so the Explain view's
    # ethics line reverted to English the moment this endpoint's response
    # arrived, even in a Hindi/Gujarati session.
    ethics = {
        "en": "Credit products are dropped when stress is detected; grace support remains available." if stress_flag else "Relevant, non-credit offers remain available; credit products are withheld only when stress is detected.",
        "hi": "तनाव का पता चलने पर क्रेडिट उत्पाद हटा दिए जाते हैं; ग्रेस सहायता उपलब्ध रहती है।" if stress_flag else "प्रासंगिक, गैर-क्रेडिट सुझाव उपलब्ध रहते हैं; क्रेडिट उत्पाद केवल तनाव का पता चलने पर रोके जाते हैं।",
        "gu": "તણાવ શોધાય ત્યારે ક્રેડિટ ઉત્પાદનો દૂર કરવામાં આવે છે; ગ્રેસ સહાય ઉપલબ્ધ રહે છે." if stress_flag else "સંબંધિત, બિન-ક્રેડિટ ભલામણો ઉપલબ્ધ રહે છે; ક્રેડિટ ઉત્પાદનો ફક્ત તણાવ શોધાય ત્યારે જ રોકવામાં આવે છે.",
    }
    return {"user_id": user.id, "segment": score.segment if score else "BASELINE", "stress_flag": stress_flag,
           "ethics_explanation": ethics["en"], "ethics_explanation_hi": ethics["hi"], "ethics_explanation_gu": ethics["gu"]}
