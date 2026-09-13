from datetime import datetime, timedelta, timezone
from decimal import Decimal
from statistics import median
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Account, Alert, AuditLog, Recommendation, Transaction, User, UserFeature, UserScore
from .ml.fraud import HARD_BLOCK_THRESHOLD, REVIEW_THRESHOLD, fraud_score as model_fraud_score
from .ml.segment import predict_segment
from .rules import CREDIT_SHAPED_OFFERS, fraud_hard_rules, haversine_km, offer_rules

CATEGORIES = {
    "salary": "SALARY", "hospital": "HOSPITAL", "apollo": "HOSPITAL", "grocery": "UPI_GROCERY",
    "zepto": "UPI_GROCERY", "fuel": "FUEL", "school": "EDUCATION", "emi": "EMI",
    "netflix": "ENTERTAINMENT", "transfer": "TRANSFER", "razorpay": "TOPUP",
}


def comparable_time(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def classify(payee: str, mcc: str | None) -> str:
    value = payee.lower()
    for keyword, category in CATEGORIES.items():
        if keyword in value:
            return category
    if mcc == "7995":
        return "WATCHLIST"
    return "UNKNOWN"


def missed_emi(all_transactions: list[Transaction], now: datetime) -> bool:
    """Detect a genuinely missed EMI from the user's real EMI cadence.

    An EMI is "missed" when the user has an established, roughly-regular EMI
    payment history but the gap since the last posted EMI is well beyond
    their typical cadence. This replaces a dead keyword check (`"missed" in
    payee`) that nothing in the app ever produces, so it never fired outside
    of a hand-crafted seed row.
    """
    emi_history = sorted(
        (t for t in all_transactions if t.category == "EMI" and t.status == "posted"),
        key=lambda t: comparable_time(t.ts),
    )
    if len(emi_history) < 2:
        return False
    gaps = [
        (comparable_time(emi_history[index + 1].ts) - comparable_time(emi_history[index].ts)).days
        for index in range(len(emi_history) - 1)
    ]
    typical_gap = median(gaps)
    days_since_last = (now - comparable_time(emi_history[-1].ts)).days
    return days_since_last > typical_gap + 15


def savings_rate(credits: float, debits: float) -> float:
    """Share of the last 30 days' inflow that wasn't spent, as a real rate.

    This used to be `(credits - debits) / max(credits, 1)`, whose `max(..., 1)`
    guard only protects against ZeroDivisionError, not against nonsense: a
    customer with no salary credit in the window but ₹20,000 of spending scored
    `-20000.0` instead of a rate. That number then went three places it does
    real damage -- into the segmentation model as a feature trained on the
    range [-1, 0.55], into the stress guard, and onto the dashboard, where the
    Overview tile renders `savings_rate * 100` and printed "-2,000,000%".

    No inflow at all is a full-depth negative rate (-1.0), not an unbounded
    one, and the result is clamped into the range the model was trained on so
    an extreme month can't push the feature outside its training distribution.
    """
    if credits <= 0:
        return -1.0 if debits > 0 else 0.0
    return round(max(-1.0, min(1.0, (credits - debits) / credits)), 3)


def sync_recommendations(db: Session, user_id: str, recommendations: list[tuple[str, str, bool]], *, stress_flag: bool = False) -> None:
    """Upsert an offer set for a customer, keyed by product code.

    Extracted from run_pipeline so `app/seed.py` can derive a persona's opening
    recommendations from the behavioural history it just built. Without that,
    recommendations only ever came into existence as a side effect of scoring a
    *new* transaction — so a customer with nine months of history who had not
    yet paid anyone since signing in saw an empty Recommendations page, and the
    personalization engine appeared to have nothing to say about them.

    `stress_flag` re-applies the ethics gate across *every* credit-shaped offer
    the customer already holds, not just the ones whose rule fires this time.
    Without that sweep the gate leaked: an offer is only revisited here when its
    rule fires again, so a credit product surfaced while the customer was
    healthy kept `blocked_by_ethics = False` permanently once its rule stopped
    firing. A customer who spent heavily on a wedding, tipped into STRESS, and
    thereby left the MARRIAGE segment kept being offered the wedding EMI plan
    and EMI conversion -- both credit -- at the exact moment the system had
    decided they were under financial stress, while the pitch claims a stress
    signal suppresses every credit-shaped offer.
    """
    existing = {item.product_code: item for item in db.scalars(select(Recommendation).where(Recommendation.user_id == user_id))}
    for code, reason, blocked in recommendations:
        current = existing.get(code)
        if current:
            current.reason = reason
            current.blocked_by_ethics = blocked
            db.add(current)
        else:
            created = Recommendation(user_id=user_id, product_code=code, reason=reason, blocked_by_ethics=blocked)
            db.add(created)
            existing[code] = created
    for code, row in existing.items():
        if code in CREDIT_SHAPED_OFFERS and row.blocked_by_ethics != stress_flag:
            row.blocked_by_ethics = stress_flag
            db.add(row)


def refresh_behavioural_profile(db: Session, user_id: str, *, now: datetime, category: str, amount: float,
                               current_balance: float, fraud_score: float | None = None) -> tuple[str, bool]:
    """Recompute a customer's rolling features, life-stage segment and offers
    from whatever is currently posted on their account.

    Shared by `run_pipeline` and `main.confirm_transaction` so that releasing a
    held payment updates the customer's profile the same way scoring one does.
    It previously did not: confirming moved the money and stopped there, so a
    large payment released through step-up left the segment, the savings rate
    and the whole offer set frozen at their pre-payment values until some
    *other* transaction happened to trigger a recompute. A customer could
    confirm a payment that took them into financial stress and still be shown
    their old segment and their old credit offers.

    Returns the resulting (segment, stress_flag).
    """
    all_transactions = list(db.scalars(select(Transaction).where(Transaction.user_id == user_id).order_by(Transaction.ts.desc()).limit(100)))
    prior_count = max(len(all_transactions) - 1, 0)
    cutoff = now - timedelta(days=30)
    recent = [t for t in all_transactions if comparable_time(t.ts) >= cutoff and t.status == "posted"]
    # TOPUP (a Razorpay Add Money credit) is the user moving their own money
    # into the account, not income -- counting it as "credits" here let a
    # single top-up dominate savings_rate (e.g. add ₹50,000 with almost no
    # other activity and the ratio reads as ~80% "savings", which then
    # qualifies for SAVER-style investment offers moments after being
    # overdrawn). Excluded from both sides so a top-up moves the balance
    # (still handled above) without distorting the behavior signals at all.
    behavioral = [t for t in recent if t.category != "TOPUP"]
    debits = sum(float(t.amount) for t in behavioral if t.direction == "debit")
    credits = sum(float(t.amount) for t in behavioral if t.direction == "credit")
    spend_7d = sum(float(t.amount) for t in behavioral if t.direction == "debit" and comparable_time(t.ts) >= now - timedelta(days=7))
    feature = db.get(UserFeature, user_id) or UserFeature(user_id=user_id)
    feature.spend_7d, feature.spend_30d = Decimal(str(spend_7d)), Decimal(str(debits))
    feature.savings_rate = savings_rate(credits, debits)
    feature.salary_amt = Decimal(str(max([float(t.amount) for t in recent if t.category == "SALARY"] or [0])))
    feature.emi_count = sum(t.category == "EMI" for t in recent)
    # Localize to IST before checking the hour -- t.ts is stored in UTC, and
    # comparing its raw .hour directly (as this used to) checks against UTC
    # nighttime, not the user's actual local nighttime. is_night above
    # already gets this right for the transaction just posted; this brings
    # the same 30-day feature in line with it.
    feature.night_txn_ratio = sum((comparable_time(t.ts).astimezone(ZoneInfo("Asia/Kolkata")).hour >= 22 or comparable_time(t.ts).astimezone(ZoneInfo("Asia/Kolkata")).hour < 5) for t in recent) / max(len(recent), 1)
    feature.unique_payees_7d = len({t.payee for t in recent if comparable_time(t.ts) >= now - timedelta(days=7)})
    feature.missed_emi_30d = 1 if missed_emi(all_transactions, now) else 0
    db.add(feature)
    if feature.missed_emi_30d or feature.savings_rate < -0.15:
        segment = "STRESS"
    elif category == "HOSPITAL":
        segment = "MEDICAL"
    elif category == "SALARY" and prior_count == 0:
        segment = "FIRST_JOB"
    else:
        # `velocity` is the customer's 30-day transaction count, the same
        # quantity scripts/train_models.py generates (0-40) and the same one
        # ML_MODEL_README documents for the HIGH_VELOCITY guard ("more than 15
        # transactions"). This used to pass `len(recent_debits)` -- the
        # *2-minute* burst counter built above for the fraud rules -- so the
        # segmentation model received a number that is 0-2 in practice where
        # its training data ranged over 0-40, and the `velocity > 15` guard
        # could never fire at all: 5 debits inside 2 minutes is already a hard
        # block (VELOCITY_5_DEBITS_2M), so the counter can't even reach 5,
        # let alone 16. HIGH_VELOCITY was reachable only through its
        # unique-payees arm.
        segment = predict_segment(spend_30d=debits, savings_rate=feature.savings_rate,
                                  missed_emi=feature.missed_emi_30d, hospital_spend=sum(float(t.amount) for t in recent if t.category == "HOSPITAL"),
                                  unique_payees=feature.unique_payees_7d, salary_amount=float(feature.salary_amt),
                                  velocity=len(behavioral), entertainment_spend=sum(float(t.amount) for t in recent if t.category == "ENTERTAINMENT"))
    stress = segment == "STRESS" or feature.missed_emi_30d > 0
    score = db.get(UserScore, user_id) or UserScore(user_id=user_id)
    if fraud_score is not None:
        score.fraud_score = fraud_score
    score.segment, score.life_stage, score.stress_flag = segment, segment, stress
    db.add(score)
    recommendations = offer_rules(category, segment, stress, amount, debits,
                                  savings_rate=feature.savings_rate, salary_amt=float(feature.salary_amt),
                                  emi_count=feature.emi_count, night_txn_ratio=feature.night_txn_ratio,
                                  unique_payees_7d=feature.unique_payees_7d, balance=current_balance)
    sync_recommendations(db, user_id, recommendations, stress_flag=stress)
    return segment, stress


def run_pipeline(db: Session, user_id: str, payload, *, force_post: bool = False) -> tuple[Transaction, list[str], list[str]]:
    """`force_post` is for money that has already been verified and captured
    by an external, already-KYC'd payment gateway (e.g. a Razorpay top-up
    whose signature we just verified) — the fraud engine still scores and
    records the transaction for the audit trail, but cannot leave it
    "blocked": the payer's money has already left their bank via Razorpay,
    so failing to credit the ledger would mean it simply vanished from the
    user's view. Never set this for a debit or for money that hasn't
    already cleared an external gateway."""
    now = payload.ts or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now = now.astimezone(timezone.utc)
    local_time = now.astimezone(ZoneInfo("Asia/Kolkata"))
    category = classify(payload.payee, payload.mcc)
    user = db.get(User, user_id)
    history = list(db.scalars(select(Transaction).where(Transaction.user_id == user_id).order_by(Transaction.ts.desc()).limit(100)))
    # The last place the customer verifiably *was*, which means the last
    # transaction that actually went through. This used to take history[0]
    # regardless of status, so a blocked payment still set the origin for the
    # next geo-jump calculation -- with two consequences. A genuine payment made
    # from home right after an attacker's blocked attempt from another city was
    # itself scored as impossible travel, and an attacker could deliberately
    # poison the baseline with attempts they knew would be refused. Money never
    # moved for those attempts, and the coordinates on them are exactly the
    # ones we did not trust. Every other history-derived feature here already
    # filters on posted (see prior_debits and payee_frequency_30d below).
    previous = next((t for t in history if t.status == "posted"), None)
    # with_for_update() locks this account row for the rest of the
    # transaction (a no-op on SQLite, which has no row-level locking, but a
    # real fix on Postgres): without it, two debits fired close enough
    # together both read the same starting balance, both pass the
    # insufficient-funds check against it, and both post -- overdrawing the
    # account past zero despite that check existing. Rapidly repeating the
    # safety simulator is exactly the kind of near-simultaneous request
    # pattern that triggers this.
    account = db.scalar(select(Account).where(Account.user_id == user_id).with_for_update())
    km = haversine_km(previous.lat, previous.lng, payload.lat, payload.lng) if previous else 0
    recent_debits = [t for t in history if t.direction == "debit" and comparable_time(t.ts) >= now - timedelta(minutes=2)]
    same_device = bool(user and user.device_id and payload.device_id == user.device_id)
    prior_debits = [float(t.amount) for t in history if t.direction == "debit" and t.status == "posted"]
    # With no debit history yet, falling back to a ₹1 "typical" (as this used
    # to) makes amount_vs_typical explode to hundreds or thousands for any
    # real first payment (₹5,000 / ₹1 = 5000x) -- a value far outside
    # anything the model was trained on (its training frame clips this ratio
    # to [0.2, 18]), so it gets treated as an extreme outlier and pushes the
    # score up for a transaction that is, by definition, this account's very
    # first and has no actual "unusual for this user" signal to report yet.
    # Falling back to the payment's own amount makes a brand-new account's
    # first transaction read as neutral (ratio 1.0) instead of a false spike.
    typical_amount = median(prior_debits) if prior_debits else float(payload.amount)
    amount_vs_typical = float(payload.amount) / max(typical_amount, 1.0)
    balance_ratio = float(payload.amount) / max(float(account.balance) if account else 1.0, 1.0)
    payee_frequency_30d = sum(t.payee == payload.payee and t.status == "posted" and comparable_time(t.ts) >= now - timedelta(days=30) for t in history)
    is_new_payee = payee_frequency_30d == 0
    is_night = local_time.hour >= 22 or local_time.hour < 5
    hard_reasons = fraud_hard_rules(amount=float(payload.amount), km_from_last=km, same_device=same_device,
                                    txns_last_2m=len(recent_debits) + (1 if payload.direction == "debit" else 0), category=category, is_night=is_night,
                                    direction=payload.direction)
    anomaly_score = model_fraud_score(amount=float(payload.amount), hour=local_time.hour, is_night=is_night,
                                      km_from_last=km, same_device=same_device, velocity_2m=len(recent_debits),
                                      amount_vs_typical=amount_vs_typical, balance_ratio=balance_ratio,
                                      is_new_payee=is_new_payee, payee_frequency_30d=payee_frequency_30d,
                                      direction=payload.direction)
    fraud_score = round(max(anomaly_score, 0.86 if hard_reasons else 0), 3)
    current_balance = float(account.balance) if account else 0.0
    # Not having the money is a decline, not a fraud signal, and the two must
    # not share a code path. INSUFFICIENT_BALANCE used to be appended to
    # `hard_reasons` -- the fired-fraud-rule list -- which meant a customer
    # short of funds got a transaction marked "blocked" exactly like a
    # detected takeover, an alert reading "This payment was blocked for your
    # protection", that reason written into the fraud audit trail, and a
    # 14-point hit to their Account Health. That is precisely the punitive,
    # blunt-flag treatment this project exists to argue against; a bank
    # declines the payment and tells you your balance is short.
    insufficient_funds = payload.direction == "debit" and float(payload.amount) > current_balance
    # Three-way, not two-way: a hard rule or a high-confidence score refuses the
    # payment, a middling score asks the customer to confirm it with a one-time
    # code, and everything else posts. See app/ml/fraud.py for why one cut-off
    # could not serve both ends.
    blocked_for_fraud = bool(hard_reasons) or fraud_score >= HARD_BLOCK_THRESHOLD
    needs_review = not blocked_for_fraud and fraud_score >= REVIEW_THRESHOLD
    if force_post:
        status = "posted"
    elif blocked_for_fraud:
        # Fraud outranks a decline: if both apply, the customer needs to know
        # the payment was stopped for safety, not merely for balance.
        status = "blocked"
    elif insufficient_funds:
        status = "declined"
    elif needs_review:
        status = "review"
    else:
        status = "posted"
    transaction = Transaction(user_id=user_id, amount=payload.amount, direction=payload.direction,
                              payee=payload.payee, mcc=payload.mcc, lat=payload.lat, lng=payload.lng,
                              device_id=payload.device_id, ts=now, category=category, status=status, fraud_score=fraud_score)
    db.add(transaction)
    db.flush()
    if status == "posted":
        if account:
            account.balance += payload.amount if payload.direction == "credit" else -payload.amount
    segment, stress = refresh_behavioural_profile(
        db, user_id, now=now, category=category, amount=float(payload.amount),
        current_balance=current_balance, fraud_score=fraud_score)
    alert_ids = []
    if status == "blocked":
        alert = Alert(user_id=user_id, type="fraud", message_hi="यह भुगतान सुरक्षा कारणों से रोक दिया गया है।", message_en="This payment was blocked for your protection.", message_gu="આ ચુકવણી સુરક્ષા કારણોસર રોકવામાં આવી છે.")
        db.add(alert)
        db.flush()
        alert_ids.append(alert.id)
    elif status == "review":
        alert = Alert(user_id=user_id, type="review",
                     message_en="This payment is waiting for you to confirm it with a one-time code. Nothing has been sent yet.",
                     message_hi="यह भुगतान आपकी एक बार के कोड से पुष्टि का इंतज़ार कर रहा है। अभी तक कुछ भी नहीं भेजा गया है।",
                     message_gu="આ ચુકવણી તમારા એક-વખતના કોડથી પુષ્ટિની રાહ જુએ છે. હજી સુધી કંઈ મોકલાયું નથી.")
        db.add(alert)
        db.flush()
        alert_ids.append(alert.id)
    elif status == "declined":
        # A separate alert type, with copy that says what actually happened and
        # what the customer can do about it. Routing this through the "fraud"
        # alert above told someone who was simply short of money that their own
        # payment looked like crime.
        shortfall = float(payload.amount) - current_balance
        alert = Alert(user_id=user_id, type="balance",
                     message_en=f"This payment needs ₹{shortfall:,.0f} more than your available balance. Nothing was sent, and no fee was charged.",
                     message_hi=f"इस भुगतान के लिए आपके उपलब्ध बैलेंस से ₹{shortfall:,.0f} और चाहिए। कुछ भी नहीं भेजा गया, और कोई शुल्क नहीं लिया गया।",
                     message_gu=f"આ ચુકવણી માટે તમારા ઉપલબ્ધ બેલેન્સ કરતાં ₹{shortfall:,.0f} વધુ જોઈએ. કંઈ મોકલાયું નથી, અને કોઈ ફી લેવાઈ નથી.")
        db.add(alert)
        db.flush()
        alert_ids.append(alert.id)
    if stress:
        has_stress_alert = db.scalar(select(Alert.id).where(Alert.user_id == user_id, Alert.type == "stress"))
        if not has_stress_alert:
            db.add(Alert(user_id=user_id, type="stress", message_hi="आपकी नकदी सुरक्षित रखना हमारी प्राथमिकता है।", message_en="Your cash flow comes first. Grace support is available.", message_gu="તમારો રોકડ પ્રવાહ સુરક્ષિત રાખવો એ અમારી પ્રાથમિકતા છે. ગ્રેસ સહાય ઉપલબ્ધ છે."))
    db.add(AuditLog(user_id=user_id, transaction_id=transaction.id, action="txn_score", features={"km_from_last": km, "is_night": is_night, "fraud_score": fraud_score, "amount_vs_typical": round(amount_vs_typical, 3), "balance_ratio": round(balance_ratio, 3), "is_new_payee": is_new_payee, "payee_frequency_30d": payee_frequency_30d, "risk_interaction": round(amount_vs_typical * balance_ratio * int(is_new_payee), 3),
                                                                 # Recorded as a feature, deliberately not as a fired fraud rule:
                                                                 # the auditor view still explains a decline without the audit
                                                                 # trail claiming a safety rule caught it.
                                                                 "insufficient_balance": insufficient_funds}, reasons=hard_reasons))
    db.commit()
    db.refresh(transaction)
    return transaction, alert_ids, hard_reasons