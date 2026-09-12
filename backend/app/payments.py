"""Razorpay Orders API client for the Add Money / wallet top-up flow.

Uses direct REST calls over httpx (same dependency the Gemini client
already uses) rather than the `razorpay` SDK, to avoid adding a new
dependency for what is a handful of simple, well-documented endpoints.
"""

import hashlib
import hmac
from decimal import Decimal

try:
    import httpx
except ImportError:  # Local fallback remains available before optional client install.
    httpx = None

from .config import settings

ORDERS_URL = "https://api.razorpay.com/v1/orders"


def is_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret and httpx is not None)


class RazorpayError(RuntimeError):
    pass


def create_order(*, amount: Decimal, receipt: str) -> dict:
    """Create a Razorpay order for `amount` rupees. Returns the order dict
    (includes `id`, `amount` in paise, `currency`). Raises RazorpayError on
    any failure so the caller can turn it into a clean HTTP error."""
    if not is_configured():
        raise RazorpayError("razorpay_not_configured")
    amount_paise = int((amount * 100).to_integral_value())
    try:
        response = httpx.post(
            ORDERS_URL,
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            json={"amount": amount_paise, "currency": "INR", "receipt": receipt, "payment_capture": 1},
            timeout=12,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as error:
        raise RazorpayError(f"razorpay_http_error_{error.response.status_code}") from error
    except httpx.HTTPError as error:
        raise RazorpayError("razorpay_request_error") from error


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str) -> bool:
    """Verify the HMAC-SHA256 signature Razorpay Checkout returns after a
    successful payment, per Razorpay's documented scheme:
    signature == HMAC_SHA256(key_secret, "{order_id}|{payment_id}")."""
    if not settings.razorpay_key_secret:
        return False
    payload = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(settings.razorpay_key_secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
