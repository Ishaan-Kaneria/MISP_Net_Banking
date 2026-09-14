import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine
from .models import Account, Transaction, User, UserFeature, UserScore
from .pipeline import sync_recommendations
from .rules import offer_rules
from .security import hash_pin

PERSONAS = [
    ("Ramesh Shah", "9000000001", "gu", "SAVER", 28000),
    ("Priya Verma", "9000000002", "hi", "FIRST_JOB", 18000),
    ("Amit Kumar", "9000000003", "hi", "STRESS", 4500),
    ("Meena Iyer", "9000000004", "hi", "MEDICAL", 22000),
    ("Fatima Sheikh", "9000000005", "hi", "MARRIAGE", 45000),
    ("Karthik Subramaniam", "9000000006", "en", "HIGH_VELOCITY", 15000),
    ("Ananya Roy", "9000000007", "en", "BASELINE", 20000),
]


_BACKGROUND_MERCHANTS = [
    ("Zepto", "UPI_GROCERY", 350), ("BigBasket", "UPI_GROCERY", 900),
    ("Indian Oil", "FUEL", 1200), ("Shell Petrol", "FUEL", 1400),
    ("Netflix", "ENTERTAINMENT", 199), ("BookMyShow", "ENTERTAINMENT", 600),
    ("School Fees", "EDUCATION", 3500), ("Udemy", "EDUCATION", 799),
    ("Local Store", "UNKNOWN", 250), ("Chemist", "UNKNOWN", 180),
]

# One or two large, story-appropriate one-off payments per segment -- kept
# as a lookup (rather than only inline in each builder below) so `seed()`
# can also backfill them onto personas that already exist in a live
# database, not just apply them when a persona is created for the first
# time. See `_seed_big_ticket_history` for why each entry is safe to
# re-apply on every restart.
BIG_TICKET_PURCHASES: dict[str, list[tuple[int, float, str, str]]] = {
    "SAVER": [
        (58, 68000, "Croma Electronics", "UNKNOWN"),      # a new fridge -- a saver's real big-ticket buy
        (140, 42000, "LIC Premium", "UNKNOWN"),           # annual insurance premium, paid once a year
    ],
    "MEDICAL": [
        (45, 55000, "Apollo Hospital Billing", "HOSPITAL"),  # a bigger, earlier procedure -- outside the 30-day window this segment's story depends on
    ],
    "FIRST_JOB": [
        (45, 25000, "New Apartment Deposit", "UNKNOWN"),  # a security deposit -- a very real first-job big-ticket cost
    ],
    "MARRIAGE": [
        (70, 150000, "Grand Wedding Hall", "UNKNOWN"),   # the venue booking deposit, months before the big day
        (50, 95000, "Zaveri Jewellers", "UNKNOWN"),      # a larger jewellery order, ahead of the smaller one within her 30-day window
    ],
    "HIGH_VELOCITY": [
        (55, 62000, "Croma Electronics", "UNKNOWN"),  # even a high-velocity spender has the occasional big one-off
    ],
    "BASELINE": [
        (50, 58000, "MakeMyTrip", "UNKNOWN"),  # an annual family vacation booking -- ordinary, occasional, large
    ],
    "STRESS": [
        (110, 45000, "Car Repair Workshop", "UNKNOWN"),  # part of the real story: the emergency expense that started the cash-flow strain, before the EMIs stopped
    ],
}


def _seed_big_ticket_history(db, user: User, purchases: list[tuple[int, float, str, str]]) -> None:
    """A handful of large, real-life one-off payments -- rent deposits,
    appliances, a big annual premium, an electronics upgrade -- dated 35+
    days ago, same as `_seed_lived_in_history`, so they sit in
    `amount_vs_typical`'s all-time median (giving every account real
    precedent for large amounts, which is exactly what the retrained fraud
    model needed more of — see scripts/train_models.py) without touching
    any segment's 30-day feature window or its story.

    `purchases` is `(days_ago, amount, payee, category)`. Each entry uses
    a distinct one-off payee by default (a big purchase usually isn't to
    a payee you pay every week), which is also the more realistic --and
    harder-- case for the fraud engine: a large amount with no repeat
    history at all, not just a large amount to an already-familiar payee.

    Checks each entry individually before inserting (matched on user +
    payee + amount) rather than being skipped wholesale for personas that
    already exist -- `seed()` runs on every app startup and only creates a
    persona's *entire* history once, on first creation. Without this
    per-item check, this function could never backfill the personas
    already sitting in a live database from before this history existed
    (exactly the deployed demo's actual state), and a plain unconditional
    insert would instead duplicate every row on every subsequent restart.
    """
    now = datetime.now(timezone.utc)
    for days_ago, amount, payee, category in purchases:
        already_present = db.scalar(select(Transaction.id).where(Transaction.user_id == user.id, Transaction.payee == payee, Transaction.amount == amount))
        if already_present:
            continue
        db.add(Transaction(user_id=user.id, amount=amount, direction="debit", payee=payee, category=category, device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.05))


def _seed_lived_in_history(db, user: User, *, months: int = 9) -> None:
    """Extra months of ordinary weekly spend, dated *before* the 30-day
    feature window every segment's story above is carefully tuned against
    (35+ days ago) so it never changes a single classification outcome --
    this only gives two things a real distribution to work with instead of
    a handful of hand-placed rows: `amount_vs_typical` in app/ml/fraud.py
    (the median of *all* prior posted debits, not just the last 30 days)
    and the general "this account has actually been used for most of a
    year" feel. Deliberately excludes category="EMI" so it can never
    disturb pipeline.missed_emi()'s cadence detection for the personas that
    depend on it.
    """
    now = datetime.now(timezone.utc)
    for week in range(5, 5 + months * 4):
        merchant, category, base = _BACKGROUND_MERCHANTS[week % len(_BACKGROUND_MERCHANTS)]
        days_ago = 35 + week * 7
        db.add(Transaction(user_id=user.id, amount=base + (week % 5) * 40, direction="debit", payee=merchant, category=category, device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))


def _seed_saver_history(db, user: User) -> None:
    """Ramesh Shah — a genuine saver story: steady salary with spend kept
    well below it. This satisfies predict_segment()'s own deterministic
    `savings_rate > 0.2 and spend_30d < 0.8 * salary` rule directly, the same
    way pipeline.missed_emi() lets the STRESS persona re-derive its segment
    from real transactions rather than a hardcoded row the next live
    transaction would silently overwrite.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (150, 120, 90, 60, 29, 2):
        db.add(Transaction(user_id=user.id, amount=32000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in (145, 105, 65, 25):
        db.add(Transaction(user_id=user.id, amount=4000, direction="debit", payee="Emi", category="EMI", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in range(0, 28, 4):
        db.add(Transaction(user_id=user.id, amount=600 + days_ago * 5, direction="debit", payee="Zepto", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=499, direction="debit", payee="Netflix", category="ENTERTAINMENT", device_id=user.device_id, ts=now - timedelta(days=10), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["SAVER"])


def _seed_medical_history(db, user: User) -> None:
    """Meena Iyer — genuine, recent hospital spend so predict_segment()'s own
    deterministic `hospital_spend > 10000` rule classifies her as MEDICAL,
    instead of relying on the probabilistic segmentation model.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (150, 120, 90, 60, 29, 2):
        db.add(Transaction(user_id=user.id, amount=24000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in (150, 105, 60, 29):
        db.add(Transaction(user_id=user.id, amount=5500, direction="debit", payee="Emi", category="EMI", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago, amount in ((20, 6800), (12, 5400), (5, 4200)):
        db.add(Transaction(user_id=user.id, amount=amount, direction="debit", payee="Apollo Hospital", category="HOSPITAL", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in range(0, 28, 5):
        db.add(Transaction(user_id=user.id, amount=450 + days_ago * 8, direction="debit", payee="Zepto", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["MEDICAL"])


def _seed_first_job_history(db, user: User) -> None:
    """Priya Verma — a genuine first-job story: one recent first salary, no
    EMI history yet, and only a couple of distinct payees. There's no
    deterministic predict_segment() override for FIRST_JOB, so — unlike
    SAVER/MEDICAL above — this is still a best-effort classification by the
    segmentation model, same as before this rework. What changes is that her
    history is now a coherent, on-story signal (low unique_payees, spend
    close to her whole salary from one-off setup costs, exactly the shape
    the model was trained to recognise as FIRST_JOB) instead of being
    byte-for-byte the same generic salary/EMI/grocery loop every other
    persona shared, which had nothing to do with any of their segments.
    """
    now = datetime.now(timezone.utc)
    db.add(Transaction(user_id=user.id, amount=15000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=14), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=10500, direction="debit", payee="Laptop", device_id=user.device_id, ts=now - timedelta(days=11), status="posted", fraud_score=0.03))
    for days_ago, amount in ((9, 650), (6, 420), (3, 900)):
        db.add(Transaction(user_id=user.id, amount=amount, direction="debit", payee="Zepto", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=199, direction="debit", payee="Netflix", category="ENTERTAINMENT", device_id=user.device_id, ts=now - timedelta(days=7), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["FIRST_JOB"])


def _seed_marriage_history(db, user: User) -> None:
    """Fatima Sheikh — a big, recent wedding-related expense against a
    normal salary. There's no deterministic predict_segment() override for
    MARRIAGE (only SAVER/MEDICAL/STRESS/HIGH_VELOCITY have one), so like
    FIRST_JOB this is a best-effort classification by the segmentation
    model -- but her numbers are shaped to lean the right way: spend_30d
    well above salary (the model's own synthetic training data marks
    MARRIAGE with elevated spend, unlike SAVER's low-spend signal) while
    staying clear of hospital, missed-EMI, and high-velocity territory.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (150, 120, 90, 60, 29, 2):
        db.add(Transaction(user_id=user.id, amount=30000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=40000, direction="debit", payee="Grand Wedding Hall", device_id=user.device_id, ts=now - timedelta(days=9), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=12000, direction="debit", payee="Zaveri Jewellers", device_id=user.device_id, ts=now - timedelta(days=6), status="posted", fraud_score=0.03))
    for days_ago, amount in ((18, 900), (11, 1200), (4, 850)):
        db.add(Transaction(user_id=user.id, amount=amount, direction="debit", payee="Zepto", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["MARRIAGE"])


def _seed_high_velocity_history(db, user: User) -> None:
    """Karthik Subramaniam — frequent small payments to many distinct payees
    within the last 7 days. Unlike MARRIAGE/FIRST_JOB, HIGH_VELOCITY *does*
    have a deterministic predict_segment() rule (`unique_payees > 15`, same
    idea as SAVER/MEDICAL's own rules), so this one is built to trip it for
    real: 18 distinct one-off merchants inside the last 7 days.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (60, 29, 2):
        db.add(Transaction(user_id=user.id, amount=22000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    merchants = ["Swiggy", "Zomato", "Ola", "Uber", "BigBasket", "BluDart Courier", "PVR Cinemas",
                "Croma", "Decathlon", "Chai Point", "Dominos", "Haircut Salon", "Metro Recharge",
                "Book Store", "Pharmacy", "Bakery", "Parking App", "Streaming Service"]
    for index, merchant in enumerate(merchants):
        db.add(Transaction(user_id=user.id, amount=120 + index * 35, direction="debit", payee=merchant, device_id=user.device_id, ts=now - timedelta(days=index % 6, hours=index), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["HIGH_VELOCITY"])


def _seed_baseline_history(db, user: User) -> None:
    """Ananya Roy — a plain, unremarkable account: moderate salary, moderate
    spend, nothing in any special category. Like MARRIAGE/FIRST_JOB there's
    no deterministic override that lands on BASELINE specifically (it's
    whatever's left once every other rule and the model itself pass), so
    this is deliberately just an ordinary month with no signal pointing
    anywhere in particular.
    """
    now = datetime.now(timezone.utc)
    for days_ago in (150, 120, 90, 60, 29, 2):
        db.add(Transaction(user_id=user.id, amount=25000, direction="credit", payee="Salary", category="SALARY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in (140, 110, 80, 50, 20):
        db.add(Transaction(user_id=user.id, amount=6200, direction="debit", payee="Emi", category="EMI", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    for days_ago in range(1, 28, 3):
        db.add(Transaction(user_id=user.id, amount=400 + days_ago * 10, direction="debit", payee="Zepto", category="UPI_GROCERY", device_id=user.device_id, ts=now - timedelta(days=days_ago), status="posted", fraud_score=0.03))
    db.add(Transaction(user_id=user.id, amount=249, direction="debit", payee="Netflix", category="ENTERTAINMENT", device_id=user.device_id, ts=now - timedelta(days=15), status="posted", fraud_score=0.03))
    # Keeps spend_30d at ~0.8x salary so she doesn't accidentally clear
    # predict_segment()'s SAVER threshold (savings_rate>0.2 AND
    # spend_30d<0.8*salary) purely from low day-to-day spend -- an ordinary
    # month with rent still spends a normal share of the salary.
    db.add(Transaction(user_id=user.id, amount=9000, direction="debit", payee="Rent", device_id=user.device_id, ts=now - timedelta(days=8), status="posted", fraud_score=0.03))

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["BASELINE"])


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

    _seed_lived_in_history(db, user)
    _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES["STRESS"])


# Per-segment history builders and a matching initial UserFeature snapshot
# (shown on the dashboard until the persona's first live transaction
# recomputes it for real) — replaces one generic 40-row loop every non-STRESS
# persona used to share regardless of their intended segment.
HISTORY_BUILDERS = {
    "SAVER": _seed_saver_history,
    "FIRST_JOB": _seed_first_job_history,
    "STRESS": _seed_stress_history,
    "MEDICAL": _seed_medical_history,
    "MARRIAGE": _seed_marriage_history,
    "HIGH_VELOCITY": _seed_high_velocity_history,
    "BASELINE": _seed_baseline_history,
}
INITIAL_FEATURES = {
    "SAVER": {"spend_7d": 1200, "spend_30d": 9100, "savings_rate": 0.86, "salary_amt": 32000, "emi_count": 1, "missed_emi_30d": 0},
    "FIRST_JOB": {"spend_7d": 1750, "spend_30d": 12669, "savings_rate": 0.16, "salary_amt": 15000, "emi_count": 0, "missed_emi_30d": 0},
    "STRESS": {"spend_7d": 6100, "spend_30d": 18500, "savings_rate": -0.3, "salary_amt": 13500, "emi_count": 1, "missed_emi_30d": 1},
    "MEDICAL": {"spend_7d": 5300, "spend_30d": 25200, "savings_rate": 0.475, "salary_amt": 24000, "emi_count": 1, "missed_emi_30d": 0},
    "MARRIAGE": {"spend_7d": 2950, "spend_30d": 54950, "savings_rate": 0.084, "salary_amt": 30000, "emi_count": 0, "missed_emi_30d": 0},
    "HIGH_VELOCITY": {"spend_7d": 4536, "spend_30d": 4536, "savings_rate": -0.06, "salary_amt": 22000, "emi_count": 0, "missed_emi_30d": 0},
    "BASELINE": {"spend_7d": 1740, "spend_30d": 18500, "savings_rate": 0.26, "salary_amt": 25000, "emi_count": 1, "missed_emi_30d": 0},
}


# Where each persona does their everyday banking. Ahmedabad for the Gujarati
# speaker, Delhi/Mumbai/Chennai/Kolkata for the rest -- real cities, so a
# "sudden jump to another city" in the simulator is a jump from somewhere.
HOME_LOCATIONS = {
    "9000000001": (23.0225, 72.5714),   # Ahmedabad
    "9000000002": (28.6139, 77.2090),   # Delhi
    "9000000003": (28.7041, 77.1025),   # Delhi (north)
    "9000000004": (19.0760, 72.8777),   # Mumbai
    "9000000005": (28.5355, 77.3910),   # Noida
    "9000000006": (13.0827, 80.2707),   # Chennai
    "9000000007": (22.5726, 88.3639),   # Kolkata
}
DEFAULT_HOME = (28.6139, 77.2090)


def _apply_home_coordinates(db: Session, user: User, phone: str) -> None:
    """Give every seeded transaction a location near the persona's home city.

    Known fix (2026-09): not one of the ~380 seeded transactions carried a
    lat/lng, and `pipeline.haversine_km` returns 0.0 the moment either endpoint
    is None. So `km_from_last` was a constant 0 for the first payment any demo
    persona ever made, which meant `GEO_JUMP_HIGH_VALUE` -- a headline rule in
    the README, the deck, and the Safety Simulator's own explanations -- could
    not fire on the exact path a reviewer walks, and the fraud model received a
    dead feature. Coordinates are jittered deterministically per persona so
    re-seeding is reproducible, and kept within a few km of home so ordinary
    history reads as ordinary.
    """
    home_lat, home_lng = HOME_LOCATIONS.get(phone, DEFAULT_HOME)
    rng = random.Random(phone)
    for transaction in db.scalars(select(Transaction).where(Transaction.user_id == user.id, Transaction.lat.is_(None))):
        transaction.lat = round(home_lat + rng.uniform(-0.05, 0.05), 6)
        transaction.lng = round(home_lng + rng.uniform(-0.05, 0.05), 6)
        db.add(transaction)


def seed() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        for name, phone, lang, segment, balance in PERSONAS:
            user = db.scalar(select(User).where(User.phone == phone))
            if user:
                # The persona already exists (this is every already-deployed
                # environment, not just a hypothetical) -- its full history
                # was seeded once and won't be recreated, but the new
                # big-ticket purchases are still worth backfilling onto it.
                # Safe to call unconditionally: each entry checks for itself
                # before inserting (see _seed_big_ticket_history).
                _seed_big_ticket_history(db, user, BIG_TICKET_PURCHASES[segment])
                # Backfills coordinates onto already-deployed personas too,
                # whose history was seeded before transactions carried any.
                _apply_home_coordinates(db, user, phone)
                db.commit()
                continue
            user = User(name=name, phone=phone, lang=lang, pin_hash=hash_pin("1234"), kyc_status="pending", device_id=f"device-{phone[-4:]}")
            db.add(user)
            db.flush()
            db.add(Account(user_id=user.id, balance=balance))
            HISTORY_BUILDERS[segment](db, user)
            db.flush()
            _apply_home_coordinates(db, user, phone)
            features = INITIAL_FEATURES[segment]
            db.add(UserFeature(user_id=user.id, **features))
            db.add(UserScore(user_id=user.id, segment=segment, life_stage=segment, stress_flag=segment == "STRESS"))
            # Derive the persona's opening recommendations from the history we
            # just built. Recommendations used to be created only as a side
            # effect of scoring a *new* transaction, so every persona signed in
            # to an empty Recommendations page despite nine months of history
            # sitting behind them -- the personalization engine looking like it
            # had nothing to say until you poked it.
            sync_recommendations(db, user.id, offer_rules(
                "UNKNOWN", segment, segment == "STRESS", 0.0, float(features["spend_30d"]),
                savings_rate=features["savings_rate"], salary_amt=float(features["salary_amt"]),
                emi_count=features["emi_count"], night_txn_ratio=0.0,
                unique_payees_7d=0, balance=float(balance),
            ), stress_flag=segment == "STRESS")
        db.commit()


if __name__ == "__main__":
    seed()
