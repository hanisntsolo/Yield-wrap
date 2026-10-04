"""Donation lifecycle helpers shared by the routers, AI engine and scheduler."""
from datetime import datetime

from bson import ObjectId
from pymongo import ReturnDocument

from ai_engine.priority_engine import compute_priority_score, hours_until_expiry
from errors import not_found
from services import ad_market_service
from services.db_service import as_utc, db, serialize, to_object_id, utcnow

OPEN_STATUSES = ("pending", "matched")
ACTIVE_STATUSES = ("pending", "matched", "in_transit")

# Bookkeeping fields that are not part of the public Donation contract.
INTERNAL_FIELDS = {
    "matched_ngo_user_id",
    "assigned_volunteer_user_id",
    "declined_ngo_ids",
    "declined_volunteer_ids",
    "expiry_notified",
    "last_match_attempt",
    "offered_at",
    "load_reserved_kg",
}

PUBLIC_DEFAULTS = {
    "matched_ngo_id": None,
    "matched_ngo_name": None,
    "delivery_location": None,
    "ngo_accepted": False,
    "assigned_volunteer_id": None,
    "assigned_volunteer_name": None,
    "task_stage": None,
    "ai_match_score": None,
    "match_candidates": [],
    "matched_at": None,
    "picked_up_at": None,
    "delivered_at": None,
    "delivery_record": None,
    "notes": "",
    "packaging": ad_market_service.EMPTY_PACKAGING,
}


def compute_totals(food_items: list[dict]) -> dict:
    expiries = [as_utc(item["expiry_time"]) for item in food_items if item.get("expiry_time")]
    return {
        "total_kg": round(sum(float(item.get("quantity_kg", 0)) for item in food_items), 2),
        "earliest_expiry": min(expiries) if expiries else None,
    }


def public_donation(doc: dict, now: datetime | None = None) -> dict:
    now = now or utcnow()
    out = {**PUBLIC_DEFAULTS, **{k: v for k, v in doc.items() if k not in INTERNAL_FIELDS}}
    out["priority_score"] = compute_priority_score(doc, now)
    hours = hours_until_expiry(doc, now)
    out["hours_to_expiry"] = None if hours is None else round(hours, 2)
    return serialize(out)


async def get_donation(donation_id: str | ObjectId) -> dict:
    donation = await db.donations.find_one({"_id": to_object_id(donation_id, "Donation")})
    if not donation:
        raise not_found("Donation")
    return donation


def stakeholders(donation: dict, *, donor=True, ngo=True, volunteer=True) -> list:
    ids = []
    if donor:
        ids.append(donation.get("donor_id"))
    if ngo and donation.get("ngo_accepted"):
        ids.append(donation.get("matched_ngo_user_id"))
    if volunteer:
        ids.append(donation.get("assigned_volunteer_user_id"))
    return [i for i in ids if i]


async def release_volunteer(donation: dict) -> None:
    if donation.get("assigned_volunteer_id"):
        await db.volunteers.update_one(
            {"_id": donation["assigned_volunteer_id"], "active_task_id": donation["_id"]},
            {"$set": {"active_task_id": None}},
        )


async def adjust_ngo_load(ngo_id: ObjectId | None, delta_kg: float) -> None:
    if not ngo_id or not delta_kg:
        return
    ngo = await db.ngos.find_one_and_update(
        {"_id": ngo_id}, {"$inc": {"current_load_kg": round(delta_kg, 2)}}, return_document=ReturnDocument.AFTER
    )
    if ngo and ngo.get("current_load_kg", 0) < 0:
        await db.ngos.update_one({"_id": ngo_id}, {"$set": {"current_load_kg": 0.0}})


async def release_ngo_reservation(donation: dict) -> None:
    reserved = donation.get("load_reserved_kg") or 0
    if reserved and donation.get("matched_ngo_id"):
        await adjust_ngo_load(donation["matched_ngo_id"], -reserved)


async def close_donation(donation: dict, status: str, extra: dict | None = None) -> dict | None:
    """Move an unpicked donation to a terminal state (cancelled/expired) and free its NGO and volunteer."""
    now = utcnow()
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "status": {"$in": list(OPEN_STATUSES)}},
        {"$set": {"status": status, f"{status}_at": now, "task_stage": None, "load_reserved_kg": 0, **(extra or {})}},
        return_document=ReturnDocument.AFTER,
    )
    if updated:
        await release_volunteer(donation)
        await release_ngo_reservation(donation)
        if (updated.get("packaging") or {}).get("sponsored"):
            await ad_market_service.release_donation_allocations(updated)
            updated = await db.donations.find_one({"_id": updated["_id"]})
    return updated


async def reset_to_pending(donation: dict, declined_ngo: ObjectId | None = None) -> dict | None:
    """Undo an NGO acceptance (e.g. the NGO account was removed) so the donation can be matched again."""
    await release_volunteer(donation)
    await release_ngo_reservation(donation)
    update = {
        "$set": {
            "status": "pending",
            "ngo_accepted": False,
            "matched_ngo_id": None,
            "matched_ngo_user_id": None,
            "matched_ngo_name": None,
            "delivery_location": None,
            "assigned_volunteer_id": None,
            "assigned_volunteer_user_id": None,
            "assigned_volunteer_name": None,
            "task_stage": None,
            "load_reserved_kg": 0,
            "last_match_attempt": None,
        }
    }
    if declined_ngo:
        update["$addToSet"] = {"declined_ngo_ids": declined_ngo}
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "status": {"$in": list(OPEN_STATUSES)}}, update, return_document=ReturnDocument.AFTER
    )
    if updated and (updated.get("packaging") or {}).get("sponsored"):
        await ad_market_service.release_donation_allocations(updated)  # the next NGO's acceptance refills the pool
        updated = await db.donations.find_one({"_id": updated["_id"]})
    return updated
