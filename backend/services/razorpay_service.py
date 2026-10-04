"""Razorpay Orders API and signature checks. Without keys (outside production) a simulated checkout is used."""
import hashlib
import hmac
import logging

import httpx

from config import settings

logger = logging.getLogger("yieldwrap.payments")

ORDERS_URL = "https://api.razorpay.com/v1/orders"
TIMEOUT_SECONDS = 10.0


class PaymentsUnavailable(Exception):
    pass


def is_enabled() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def provider() -> str | None:
    """`razorpay` when configured, `simulated` for dev/demo, `None` in production without keys."""
    if is_enabled():
        return "razorpay"
    return None if settings.is_production else "simulated"


async def create_order(amount_paise: int, receipt: str, notes: dict) -> dict:
    """Create a Razorpay order and return its JSON (`id` is the razorpay_order_id)."""
    if not is_enabled():
        raise PaymentsUnavailable("Razorpay keys are not configured")
    payload = {"amount": amount_paise, "currency": "INR", "receipt": receipt[:40], "notes": notes}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.post(ORDERS_URL, json=payload, auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
            response.raise_for_status()
            order = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Razorpay order creation failed: %s", exc)
        raise PaymentsUnavailable(str(exc)) from exc
    if not isinstance(order, dict) or not order.get("id"):
        raise PaymentsUnavailable("Razorpay returned no order id")
    return order


def sign(message: bytes, secret: str) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> bool:
    if not settings.razorpay_key_secret or not signature:
        return False
    expected = sign(f"{razorpay_order_id}|{razorpay_payment_id}".encode(), settings.razorpay_key_secret)
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(body: bytes, signature: str | None) -> bool:
    if not settings.razorpay_webhook_secret or not signature:
        return False
    return hmac.compare_digest(sign(body, settings.razorpay_webhook_secret), signature)
