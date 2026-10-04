"""MongoDB (Motor) connection and serialisation helpers."""
from datetime import date, datetime, timezone
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from config import settings
from errors import APIError

_client: AsyncIOMotorClient | None = None
_database: AsyncIOMotorDatabase | None = None


def set_database(database: Any) -> None:
    """Swap the active database (used by tests to inject an in-memory Motor mock)."""
    global _database
    _database = database


def get_database() -> AsyncIOMotorDatabase:
    global _client, _database
    if _database is None:
        _client = AsyncIOMotorClient(settings.mongodb_url, tz_aware=True, serverSelectionTimeoutMS=5000)
        _database = _client[settings.mongodb_db]
    return _database


class _DatabaseProxy:
    """`db.users` resolves against whichever database is currently active."""

    def __getattr__(self, name: str):
        return getattr(get_database(), name)

    def __getitem__(self, name: str):
        return get_database()[name]


db = _DatabaseProxy()


async def setup_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.ngos.create_index("user_id", unique=True)
    await db.volunteers.create_index("user_id", unique=True)
    await db.donations.create_index([("status", 1), ("created_at", -1)])
    await db.donations.create_index("donor_id")
    await db.donations.create_index("matched_ngo_id")
    await db.donations.create_index("assigned_volunteer_id")
    await db.analytics_logs.create_index("date", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.ad_impressions.create_index([("ad_id", 1), ("timestamp", -1)])
    await db.businesses.create_index("user_id", unique=True)
    await db.ad_creatives.create_index([("owner_id", 1), ("created_at", -1)])
    await db.ad_creatives.create_index("status")
    await db.ad_campaigns.create_index([("type", 1), ("status", 1), ("created_at", 1)])
    await db.ad_campaigns.create_index("owner_id")
    await db.ad_campaigns.create_index("poster.ngo_id")
    await db.credit_transactions.create_index([("user_id", 1), ("created_at", -1)])
    await db.ad_orders.create_index("razorpay_order_id")
    await db.ad_orders.create_index("user_id")
    await db.ad_spaces.create_index("ngo_id")
    await db.ad_scans.create_index([("creative_id", 1), ("created_at", -1)])


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def to_object_id(value: str | ObjectId, what: str = "Resource") -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    if not ObjectId.is_valid(value):
        raise APIError(404, f"{what} not found", "NOT_FOUND")
    return ObjectId(value)


def serialize(value: Any) -> Any:
    """Recursively convert Mongo documents to JSON-friendly data (`_id` → `id`, ObjectId → str)."""
    if isinstance(value, list):
        return [serialize(v) for v in value]
    if isinstance(value, dict):
        out = {}
        for key, item in value.items():
            if key == "password":
                continue
            out["id" if key == "_id" else key] = serialize(item)
        return out
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return as_utc(value).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value
