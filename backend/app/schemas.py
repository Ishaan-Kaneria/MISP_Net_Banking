from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    phone: str
    pin: str = Field(min_length=4, max_length=8)


class TransactionRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    direction: str = Field(pattern="^(debit|credit)$")
    payee: str = "Unknown merchant"
    mcc: str | None = None
    lat: float | None = None
    lng: float | None = None
    device_id: str | None = None
    ts: datetime | None = None


class KycRequest(BaseModel):
    doc_type: str = Field(pattern="^(aadhaar|pan)$")
    consent: bool
    locale: str = "en"


class ChatRequest(BaseModel):
    message: str
    lang: str = "en"


class WalletTopupOrderRequest(BaseModel):
    amount: Decimal = Field(gt=0)


class WalletTopupVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class TransactionResponse(BaseModel):
    id: str
    status: str
    fraud_score: float
    category: str
    alert_ids: list[str] = []


class HealthResponse(BaseModel):
    status: str
    db: str