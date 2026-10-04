"""Priority-based redistribution: rank open donations so the most perishable/urgent move first."""
from datetime import datetime

from ai_engine.geo import clamp
from services.db_service import as_utc, db, utcnow

MAX_HOURS = 48.0
URGENCY_SCORES = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.1}
WEIGHTS = {"expiry": 0.45, "urgency": 0.35, "quantity": 0.20}
QUEUE_STATUSES = ("pending", "matched")


def total_kg(donation: dict) -> float:
    if donation.get("total_kg") is not None:
        return float(donation["total_kg"])
    return float(sum(item.get("quantity_kg", 0) for item in donation.get("food_items", [])))


def earliest_expiry(donation: dict) -> datetime | None:
    if donation.get("earliest_expiry"):
        return as_utc(donation["earliest_expiry"])
    expiries = [as_utc(i["expiry_time"]) for i in donation.get("food_items", []) if i.get("expiry_time")]
    return min(expiries) if expiries else None


def hours_until_expiry(donation: dict, now: datetime | None = None) -> float | None:
    expiry = earliest_expiry(donation)
    if expiry is None:
        return None
    return (expiry - (now or utcnow())).total_seconds() / 3600


def compute_priority_score(donation: dict, now: datetime | None = None) -> float:
    """
    - Time to expiry score: (1 - hours_remaining/max_hours) * 0.45
    - Urgency level score:  {"critical":1.0, "high":0.7, "medium":0.4, "low":0.1} * 0.35
    - Quantity score:       min(quantity_kg / 100, 1.0) * 0.20
    Returns a float in 0.0–1.0 (higher = process first).
    """
    hours = hours_until_expiry(donation, now)
    expiry_score = 0.0 if hours is None else 1 - clamp(hours, 0.0, MAX_HOURS) / MAX_HOURS
    urgency_score = URGENCY_SCORES.get(donation.get("urgency_level", "medium"), 0.4)
    quantity_score = min(total_kg(donation) / 100, 1.0)
    score = (
        expiry_score * WEIGHTS["expiry"]
        + urgency_score * WEIGHTS["urgency"]
        + quantity_score * WEIGHTS["quantity"]
    )
    return round(clamp(score), 4)


def rank_donations(donations: list[dict], now: datetime | None = None) -> list[dict]:
    now = now or utcnow()
    scored = [{**d, "priority_score": compute_priority_score(d, now)} for d in donations]
    return sorted(scored, key=lambda d: (-d["priority_score"], hours_until_expiry(d, now) or MAX_HOURS))


async def get_priority_queue(limit: int = 50) -> list[dict]:
    """Open donations (not yet picked up), highest priority first. Drives the admin queue and auto-dispatch."""
    now = utcnow()
    donations = await db.donations.find(
        {"status": {"$in": list(QUEUE_STATUSES)}, "earliest_expiry": {"$gt": now}}
    ).to_list(None)
    return rank_donations(donations, now)[:limit]
