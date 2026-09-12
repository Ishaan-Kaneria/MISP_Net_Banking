from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from .config import settings
from .db import Base, engine, get_db
from .llm import generate_reply_with_status
from .models import Account, Alert, AuditLog, ChatMessage, KycEvent, Recommendation, Transaction, User, UserFeature, UserScore
from .rag.retrieve import retrieve
from .pipeline import run_pipeline
from .schemas import ChatRequest, HealthResponse, KycRequest, LoginRequest, TransactionRequest, TransactionResponse
from .security import create_token, decode_token, hash_pin, verify_pin
from .seed import seed

app = FastAPI(title="Arth-AI", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=[x.strip() for x in settings.cors_origins.split(",")], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    seed()


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


@app.post("/txn", response_model=TransactionResponse)
def create_transaction(payload: TransactionRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    transaction, alert_ids = run_pipeline(db, user.id, payload)
    return TransactionResponse(id=transaction.id, status=transaction.status, fraud_score=transaction.fraud_score, category=transaction.category, alert_ids=alert_ids)


@app.post("/admin/simulate-txn", response_model=TransactionResponse)
def simulate_transaction(payload: TransactionRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    return create_transaction(payload, authorization, db)


@app.get("/dashboard")
def dashboard(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    account = db.scalar(select(Account).where(Account.user_id == user.id))
    feature = db.get(UserFeature, user.id)
    score = db.get(UserScore, user.id)
    txns = list(db.scalars(select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.ts.desc()).limit(20)))
    offers = unique_by_key(list(db.scalars(select(Recommendation).where(Recommendation.user_id == user.id).order_by(Recommendation.created_at.desc()).limit(24))), "product_code")[:6]
    alerts = unique_by_key(list(db.scalars(select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc()).limit(24))), "type")[:6]
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
    return {"user": {"id": user.id, "name": user.name, "lang": user.lang, "kyc_status": user.kyc_status}, "balance": float(account.balance if account else 0), "segment": score.segment if score else "BASELINE", "stress_flag": score.stress_flag if score else False, "features": feature_payload, "transactions": [{"id": t.id, "amount": float(t.amount), "direction": t.direction, "payee": t.payee, "category": t.category, "status": t.status, "fraud_score": t.fraud_score, "ts": t.ts.isoformat()} for t in txns], "offers": [{"id": x.id, "product_code": x.product_code, "reason": x.reason, "blocked_by_ethics": x.blocked_by_ethics} for x in offers], "alerts": [{"id": x.id, "type": x.type, "message_en": x.message_en, "message_hi": x.message_hi} for x in alerts]}


@app.get("/alerts")
def alerts(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    return [{"id": x.id, "type": x.type, "message_en": x.message_en, "message_hi": x.message_hi} for x in db.scalars(select(Alert).where(Alert.user_id == user.id).order_by(Alert.created_at.desc()))]


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


@app.post("/chat")
def chat(payload: ChatRequest, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    score = db.get(UserScore, user.id)
    language = payload.lang.lower()[:2]
    message = payload.message.lower()
    db.add(ChatMessage(user_id=user.id, role="user", content=payload.message, lang=payload.lang))
    policy_context = retrieve(db, payload.message)
    traces = [f"rag:{document.source}" for document in policy_context]
    if score and score.stress_flag and any(word in message for word in ("loan", "credit", "लोन", "क्रेडिट", "લોન", "ક્રેડિટ")):
        reply = {
            "hi": "आपके नकदी प्रवाह पर दबाव है, इसलिए क्रेडिट अनुरोध अभी रोक दिया गया है। मैं 15 दिन की ग्रेस अवधि में मदद कर सकता हूं।",
            "gu": "તમારા રોકડ પ્રવાહ પર દબાણ હોવાથી ક્રેડિટ વિનંતી હાલમાં રોકવામાં આવી છે. હું 15 દિવસની ગ્રેસ અવધિમાં મદદ કરી શકું છું.",
        }.get(language, "Your credit request is paused while your cash flow is under stress. I can help request a 15-day grace period.")
        db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=payload.lang))
        db.commit()
        return {"reply": reply, "tool_traces": traces + ["ethics_gate: credit refused"]}
    if any(word in message for word in ("balance", "बैलेंस", "બેલેન્સ")):
        account = db.scalar(select(Account).where(Account.user_id == user.id))
        balance = float(account.balance if account else 0)
        reply = {
            "hi": f"आपका उपलब्ध बैलेंस ₹{balance:,.2f} है।",
            "gu": f"તમારું ઉપલબ્ધ બેલેન્સ ₹{balance:,.2f} છે.",
        }.get(language, f"Your available balance is ₹{balance:,.2f}.")
        db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=payload.lang))
        db.commit()
        return {"reply": reply, "tool_traces": traces + ["get_balance"]}
    lower_message = message
    reply = {
        "hi": "मैं आपके बैलेंस, ऑफर, हाल की गतिविधि या ग्रेस अवधि में मदद कर सकता हूं।",
        "gu": "હું તમારા બેલેન્સ, ઓફર્સ, તાજેતરની પ્રવૃત્તિ અથવા ગ્રેસ અવધિમાં મદદ કરી શકું છું.",
    }.get(language, "I can help with your balance, offers, recent transactions, or a grace period.")
    if any(word in lower_message for word in ("offer", "offers", "સૂચન", "ऑफर")):
        reply = {"hi": "आपके खाते के लिए उपलब्ध सुझाव सुरक्षा नियमों के अनुसार दिखाए गए हैं। ऑफर टैब में हर सुझाव का कारण देखें।", "gu": "તમારા ખાતા માટેની ભલામણો સુરક્ષા નિયમો મુજબ બતાવવામાં આવી છે. દરેક કારણ જોવા માટે ભલામણો જુઓ."}.get(language, "Your available recommendations are selected using your account activity and safety rules. Open recommendations to see the reason for each one.")
    elif any(word in lower_message for word in ("transaction", "payment", "भुगतान", "लेनदेन", "ચુકવણી")):
        reply = {"hi": "आपकी हाल की गतिविधि में भुगतान, राशि और सुरक्षा स्थिति दिखाई जाती है। किसी संदिग्ध भुगतान को सुरक्षा जांच में भेजा जा सकता है।", "gu": "તમારી તાજેતરની પ્રવૃત્તિમાં ચુકવણી, રકમ અને સુરક્ષા સ્થિતિ દેખાય છે. શંકાસ્પદ ચુકવણી સુરક્ષા તપાસમાં જઈ શકે છે."}.get(language, "Your recent activity shows each payment, amount, and safety status. Suspicious payments may be sent for a safety check.")
    elif any(word in lower_message for word in ("save", "saving", "emergency", "बचत", "आपात", "બચત")):
        reply = {"hi": "आपकी बचत दर और 30 दिन के खर्च को साथ देखकर आपातकालीन निधि का लक्ष्य तय करना आसान होगा।", "gu": "તમારા બચત દર અને 30 દિવસના ખર્ચને સાથે જોઈને ઇમરજન્સી ફંડનું લક્ષ્ય નક્કી કરી શકાય છે."}.get(language, "Compare your savings rate with your 30-day spend, then set an emergency-fund target that fits your cash flow.")
    model_reply, llm_status = generate_reply_with_status(payload.message, payload.lang, "\n\n".join(document.content for document in policy_context), bool(score and score.stress_flag))
    if model_reply:
        reply = model_reply
    db.add(ChatMessage(user_id=user.id, role="assistant", content=reply, lang=payload.lang))
    db.commit()
    traces.append(f"llm:{llm_status}")
    return {"reply": reply, "tool_traces": traces}


@app.get("/explain/txn/{transaction_id}")
def explain_transaction(transaction_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    transaction = db.get(Transaction, transaction_id)
    if not transaction or transaction.user_id != user.id:
        raise HTTPException(404, detail={"error": "Transaction not found", "code": "NOT_FOUND", "details": {}})
    audit = db.scalar(select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()))
    reasons = audit.reasons if audit else []
    return {"id": transaction.id, "status": transaction.status, "fraud_score": transaction.fraud_score, "features": audit.features if audit else {}, "fired_rules": reasons, "explanation_en": "This score reflects amount, time, device, location, and velocity signals.", "explanation_hi": "यह स्कोर राशि, समय, डिवाइस, स्थान और गति के संकेतों पर आधारित है।"}


@app.get("/explain/user/{user_id}")
def explain_user(user_id: str, authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    user = current_user(authorization, db)
    if user.id != user_id:
        raise HTTPException(403, detail={"error": "Forbidden", "code": "FORBIDDEN", "details": {}})
    score = db.get(UserScore, user.id)
    return {"user_id": user.id, "segment": score.segment if score else "BASELINE", "stress_flag": score.stress_flag if score else False, "ethics_explanation": "Credit products are dropped when stress is detected; grace support remains available."}
