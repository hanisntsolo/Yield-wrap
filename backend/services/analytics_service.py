"""Impact metrics and the daily `analytics_logs` roll-up (one document per local calendar day)."""
from datetime import date, datetime, time, timedelta, timezone

from ai_engine.forecasting import is_holiday
from config import settings
from services.db_service import as_utc, db, utcnow


def log_key(day: date) -> datetime:
    """analytics_logs.date: the local calendar day stored as UTC midnight."""
    return datetime.combine(day, time.min, tzinfo=timezone.utc)


def local_today() -> date:
    return utcnow().astimezone(settings.tz).date()


def local_date(value: datetime) -> date:
    return as_utc(value).astimezone(settings.tz).date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    """UTC instants bounding a local calendar day."""
    start = datetime.combine(day, time.min, tzinfo=settings.tz)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)


def impact_from_kg(kg: float) -> dict:
    return {
        "kg_saved": round(kg, 1),
        "meals_served": int(kg / settings.kg_per_meal),
        "co2_saved_kg": round(kg * settings.co2_kg_per_food_kg, 1),
        "water_saved_liters": round(kg * settings.water_liters_per_food_kg),
    }


async def _sum(field: str, match: dict) -> float:
    rows = await db.donations.aggregate([{"$match": match}, {"$group": {"_id": None, "kg": {"$sum": field}}}]).to_list(None)
    return float(rows[0]["kg"]) if rows else 0.0


async def delivered_kg(match: dict | None = None) -> float:
    return await _sum("$delivered_kg", {"status": "delivered", **(match or {})})


async def wasted_kg(match: dict | None = None) -> float:
    return await _sum("$total_kg", {"status": "expired", **(match or {})})


async def avg_delivery_minutes(since: datetime | None = None, until: datetime | None = None) -> float | None:
    window = {}
    if since:
        window["$gte"] = since
    if until:
        window["$lt"] = until
    query = {"status": "delivered", **({"delivered_at": window} if window else {})}
    docs = await db.donations.find(query, {"created_at": 1, "delivered_at": 1}).to_list(None)
    durations = [
        (as_utc(d["delivered_at"]) - as_utc(d["created_at"])).total_seconds() / 60
        for d in docs
        if d.get("delivered_at") and d.get("created_at")
    ]
    return round(sum(durations) / len(durations), 1) if durations else None


async def rollup_day(day: date) -> dict | None:
    """Recompute one day's analytics log from live data. Seeded history (`source: seed`) is preserved."""
    key = log_key(day)
    existing = await db.analytics_logs.find_one({"date": key})
    if existing and existing.get("source") == "seed":
        return existing
    start, end = day_bounds(day)
    redistributed = await delivered_kg({"delivered_at": {"$gte": start, "$lt": end}})
    doc = {
        "date": key,
        "total_donations": await db.donations.count_documents({"created_at": {"$gte": start, "$lt": end}}),
        "total_kg_donated": await _sum("$total_kg", {"created_at": {"$gte": start, "$lt": end}}),
        "total_kg_redistributed": round(redistributed, 2),
        "total_kg_wasted": round(await wasted_kg({"expired_at": {"$gte": start, "$lt": end}}), 2),
        "total_kg_needed": round(await _sum("$total_kg", {"accepted_at": {"$gte": start, "$lt": end}}), 2),
        "active_ngos": await db.ngos.count_documents({"is_active": True, "is_verified": True}),
        "active_volunteers": await db.volunteers.count_documents({"availability": True}),
        "avg_delivery_time_min": await avg_delivery_minutes(start, end),
        "meals_served_estimate": int(redistributed / settings.kg_per_meal),
        "avg_temp": (existing or {}).get("avg_temp"),
        "is_holiday": is_holiday(day),
        "source": "live",
        "updated_at": utcnow(),
    }
    await db.analytics_logs.update_one({"date": key}, {"$set": doc}, upsert=True)
    return doc
