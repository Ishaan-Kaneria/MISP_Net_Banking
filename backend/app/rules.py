from math import asin, cos, radians, sin, sqrt


def haversine_km(lat1: float | None, lng1: float | None, lat2: float | None, lng2: float | None) -> float:
    if None in (lat1, lng1, lat2, lng2):
        return 0.0
    dlat = radians(lat2 - lat1)
    dlng = radians(lng2 - lng1)
    value = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ** 2
    return 6371 * 2 * asin(sqrt(value))


def fraud_hard_rules(*, amount: float, km_from_last: float, same_device: bool, txns_last_2m: int,
                     category: str, is_night: bool, direction: str = "debit") -> list[str]:
    """Hard, explainable fraud rules.

    Almost all of these describe risk to money LEAVING the account (device
    takeover, impossible travel, night-time cash-out, rapid-fire debits) and
    must not fire on incoming credits (salary, refunds, bonuses) — blocking
    money from entering an account is not "protection". Only the watchlist
    check applies to both directions, since receiving funds from a
    watchlisted/suspicious payee (e.g. a money-mule drop) is itself a signal
    worth flagging regardless of direction.
    """
    reasons = []
    if category == "WATCHLIST":
        reasons.append("WATCHLIST_PAYEE")
    if direction != "debit":
        return reasons
    if km_from_last > 250 and amount > 15000:
        reasons.append("GEO_JUMP_HIGH_VALUE")
    if txns_last_2m >= 5:
        reasons.append("VELOCITY_5_DEBITS_2M")
    if not same_device and amount > 20000:
        reasons.append("NEW_DEVICE_HIGH_VALUE")
    if is_night and amount > 40000:
        reasons.append("NIGHT_HIGH_VALUE")
    return reasons


def offer_rules(category: str, segment: str, stress_flag: bool, amount: float, spend_30d: float) -> list[tuple[str, str, bool]]:
    offers: list[tuple[str, str, bool]] = []
    if category == "SALARY":
        offers.append(("SIP", "A steady salary can become a simple monthly SIP.", False))
    if category == "HOSPITAL":
        offers.append(("MICRO_INSURANCE", "A small health cover can soften future medical shocks.", False))
    if spend_30d and amount >= spend_30d * 0.4:
        offers.append(("EMI_CONVERT", "Convert a large recent expense into manageable payments.", stress_flag))
    if segment == "FIRST_JOB":
        offers.append(("STARTER_CREDIT", "A small starter limit is available after your first salary.", stress_flag))
    if stress_flag or segment == "STRESS":
        offers.append(("GRACE_PERIOD", "Take a 15-day grace period while we protect your cash flow.", False))
        offers.append(("PERSONAL_LOAN", "Credit is paused while your financial stress is high.", True))
    return offers