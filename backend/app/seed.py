from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import Account, Transaction, User, UserFeature, UserScore
from .security import hash_pin

PERSONAS = [
    ("Ramesh Shah", "9000000001", "gu", "SAVER", 28000),
    ("Priya Verma", "9000000002", "hi", "FIRST_JOB", 18000),
    ("Amit Kumar", "9000000003", "hi", "STRESS", 4500),
    ("Meena Iyer", "9000000004", "hi", "MEDICAL", 22000),
]


def _seed_default_history(db, user: User) -> None:
    for index in range(40):
        category = "SALARY" if index % 10 == 0 else ("EMI" if index % 9 == 0 else "UPI_GROCERY")
        amount = 28000 if category == "SALARY" else (6200 if category == "EMI" else 350 + index * 12)
        db.add(Transaction(user_id=user.id, amount=amount, direction="credit" if category == "SALARY" else "debit", payee=category.title(), category=category, device_id=user.device_id, ts=datetime.now(timezone.utc) - timedelta(days=index), status="posted", fraud_score=0.04))


def _seed_stress_history(db, user: User) -> None:
    """A genuine missed-EMI story the live pipeline can re-derive from real
    transactions (see pipeline.missed_emi), instead of a hardcoded
    UserFeature row that the next live transaction silently overwrites.

    EMI payments land every ~30 days and then abruptly stop 75 days ago —
    two missed cycles. Salary keeps arriving but shrinking, and frequent
    small debits keep the account looking lived-in while spend outpaces
    income.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (165, 135, 105, 75):
        db.add(Transaction(user_id=user.id, amount=6000, direction="debit", payee="Emi", category="EMI", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.04))
    for days_ago, amount in ((150, 18000), (120, 18000), (90, 16000), (60, 15000), (30, 14000), (2, 13500)):
        db.add(Transaction(user_id=user.id, amount=amount, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.04))
    for days_ago in range(0, 30, 2):
        db.add(Transaction(user_id=user.id, amount=900 + days_ago * 15, direction="debit", payee="Upi_grocery", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.04))


def seed() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for name, phone, lang, segment, balance in PERSONAS:
            user = db.scalar(select(User).where(User.phone == phone))
            if user:
                continue
            user = User(name=name, phone=phone, lang=lang, pin_hash=hash_pin("1234"), kyc_status="pending", device_id=f"device-{phone[-4:]}")
            db.add(user)
            db.flush()
            db.add(Account(user_id=user.id, balance=balance))
            if segment == "STRESS":
                _seed_stress_history(db, user)
            else:
                _seed_default_history(db, user)
            db.add(UserFeature(user_id=user.id, spend_7d=5000, spend_30d=24000, savings_rate=0.32 if segment == "SAVER" else (-0.3 if segment == "STRESS" else 0.1), salary_amt=28000, emi_count=4, missed_emi_30d=1 if segment == "STRESS" else 0))
            db.add(UserScore(user_id=user.id, segment=segment, life_stage=segment, stress_flag=segment == "STRESS"))
        db.commit()


if __name__ == "__main__":
    seed()