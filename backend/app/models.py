from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    pin_hash: Mapped[str] = mapped_column(String(255))
    lang: Mapped[str] = mapped_column(String(2), default="hi")
    kyc_status: Mapped[str] = mapped_column(String(20), default="pending")
    device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), unique=True)
    balance: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)


class Transaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    direction: Mapped[str] = mapped_column(String(10))
    payee: Mapped[str | None] = mapped_column(String(180), nullable=True)
    mcc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    lat: Mapped[float | None] = mapped_column(nullable=True)
    lng: Mapped[float | None] = mapped_column(nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    category: Mapped[str] = mapped_column(String(30), default="UNKNOWN")
    status: Mapped[str] = mapped_column(String(10), default="posted")
    fraud_score: Mapped[float] = mapped_column(default=0)


class UserFeature(Base):
    __tablename__ = "user_features"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    spend_7d: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    spend_30d: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    savings_rate: Mapped[float] = mapped_column(default=0)
    salary_amt: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=0)
    emi_count: Mapped[int] = mapped_column(default=0)
    night_txn_ratio: Mapped[float] = mapped_column(default=0)
    unique_payees_7d: Mapped[int] = mapped_column(default=0)
    missed_emi_30d: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class UserScore(Base):
    __tablename__ = "user_scores"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    fraud_score: Mapped[float] = mapped_column(default=0)
    segment: Mapped[str] = mapped_column(String(30), default="BASELINE")
    life_stage: Mapped[str] = mapped_column(String(30), default="BASELINE")
    stress_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    product_code: Mapped[str] = mapped_column(String(40))
    reason: Mapped[str] = mapped_column(Text)
    blocked_by_ethics: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(20))
    message_hi: Mapped[str] = mapped_column(Text)
    message_en: Mapped[str] = mapped_column(Text)
    # Nullable, unlike the other two: existing rows created before this
    # column existed have no Gujarati text to backfill (there's no source to
    # translate from at the DB layer), so the API and frontend both fall
    # back to message_en for those. Every alert created going forward always
    # sets it (see pipeline.py), matching the trilingual EN/HI/GU coverage
    # the rest of the app (chat, offers, translations.ts) already has.
    message_gu: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    transaction_id: Mapped[str | None] = mapped_column(ForeignKey("transactions.id"), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(40))
    features: Mapped[dict] = mapped_column(JSON, default=dict)
    reasons: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class KycEvent(Base):
    __tablename__ = "kyc_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    doc_type: Mapped[str] = mapped_column(String(20))
    mock_ref: Mapped[str] = mapped_column(String(120))
    consent_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    lang: Mapped[str] = mapped_column(String(2), default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class WalletTopup(Base):
    __tablename__ = "wallet_topups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    razorpay_order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="created")
    transaction_id: Mapped[str | None] = mapped_column(ForeignKey("transactions.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    source: Mapped[str] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)