"""Donor endpoints: list surplus food, manage donations, follow deliveries live."""
from fastapi import APIRouter, Depends, Query
from pymongo import ReturnDocument

from ai_engine.route_optimizer import estimate_eta_minutes
from config import settings
from errors import conflict, not_found
from models.common import DonationStatus
from models.donation import DonationCreate, DonationUpdate
from services import ad_market_service, fcm_service
from services.analytics_service import impact_from_kg
from services.auth_service import require_roles
from services.db_service import db, utcnow
from services.donation_service import close_donation, compute_totals, get_donation, public_donation, stakeholders

router = APIRouter(prefix="/api/donor", tags=["donor"])
donor_only = require_roles("donor")


async def own_donation(donation_id: str, user: dict) -> dict:
    donation = await get_donation(donation_id)
    if donation["donor_id"] != user["_id"]:
        raise not_found("Donation")
    return donation


def volunteer_eta(donation: dict, volunteer: dict | None) -> int | None:
    if donation["status"] == "delivered":
        return 0
    if not volunteer or not volunteer.get("current_location"):
        return None
    path = [volunteer["current_location"]]
    if donation.get("task_stage") not in ("picked_up", "delivered"):
        path.append(donation["pickup_location"])
    path.append(donation.get("delivery_location"))
    return estimate_eta_minutes(path, volunteer.get("vehicle_type", "bike"))


async def packaging_for(packet_count: int, creative_id: str | None, user: dict) -> dict:
    """Own-ad stickers need one of the donor's approved creatives; the rest of the packets go to the sponsored pool."""
    creative = None
    if packet_count and creative_id:
        creative = await ad_market_service.usable_creative(creative_id, user)
    return ad_market_service.build_packaging(packet_count, creative)


@router.post("/donations", status_code=201)
async def create_donation(body: DonationCreate, user: dict = Depends(donor_only)):
    packaging = await packaging_for(body.packet_count, body.own_ad_creative_id, user)
    now = utcnow()
    food_items = [item.model_dump() for item in body.food_items]
    donation = {
        "donor_id": user["_id"],
        "donor_name": user["name"],
        "food_items": food_items,
        "pickup_location": body.pickup_location.model_dump(),
        "status": "pending",
        "urgency_level": body.urgency_level,
        "notes": body.notes,
        **compute_totals(food_items),
        "matched_ngo_id": None,
        "matched_ngo_name": None,
        "delivery_location": None,
        "ngo_accepted": False,
        "assigned_volunteer_id": None,
        "assigned_volunteer_name": None,
        "task_stage": None,
        "ai_match_score": None,
        "match_candidates": [],
        "declined_ngo_ids": [],
        "declined_volunteer_ids": [],
        "last_match_attempt": None,
        "created_at": now,
        "updated_at": now,
        "matched_at": None,
        "picked_up_at": None,
        "delivered_at": None,
        "delivery_record": None,
        "packaging": packaging,
    }
    donation["_id"] = (await db.donations.insert_one(donation)).inserted_id
    await fcm_service.notify_admins(
        "New donation listed",
        f"{user['name']} listed {donation['total_kg']:g} kg ({body.urgency_level} urgency).",
        {"type": "donation_created", "donation_id": str(donation["_id"])},
    )
    return public_donation(donation, now)


@router.get("/donations")
async def list_donations(status: DonationStatus | None = Query(None), user: dict = Depends(donor_only)):
    query = {"donor_id": user["_id"], **({"status": status} if status else {})}
    donations = await db.donations.find(query).sort("created_at", -1).to_list(500)
    now = utcnow()
    return [public_donation(d, now) for d in donations]


@router.get("/donations/{donation_id}")
async def donation_detail(donation_id: str, user: dict = Depends(donor_only)):
    return public_donation(await own_donation(donation_id, user))


@router.put("/donations/{donation_id}")
async def update_donation(donation_id: str, body: DonationUpdate, user: dict = Depends(donor_only)):
    donation = await own_donation(donation_id, user)
    if donation["status"] != "pending":
        raise conflict("Only donations that are still pending can be edited", "NOT_EDITABLE")
    changes = {}
    if body.food_items is not None:
        changes["food_items"] = [item.model_dump() for item in body.food_items]
        changes.update(compute_totals(changes["food_items"]))
        changes["expiry_notified"] = False
    if body.pickup_location is not None:
        changes["pickup_location"] = body.pickup_location.model_dump()
    if body.urgency_level is not None:
        changes["urgency_level"] = body.urgency_level
    if body.notes is not None:
        changes["notes"] = body.notes
    if body.packet_count is not None or "own_ad_creative_id" in body.model_fields_set:
        current = donation.get("packaging") or ad_market_service.EMPTY_PACKAGING
        packet_count = body.packet_count if body.packet_count is not None else current["packet_count"]
        if "own_ad_creative_id" in body.model_fields_set:
            creative_id = body.own_ad_creative_id
        else:
            creative_id = str(current["own_ad"]["creative_id"]) if current.get("own_ad") else None
        # Pending donations have no sponsored allocations yet, so the packaging is rebuilt from scratch.
        changes["packaging"] = await packaging_for(packet_count, creative_id, user)
    if not changes:
        return public_donation(donation)
    # Edited donations are re-evaluated from scratch, including by NGOs that passed on the old version.
    changes.update({"updated_at": utcnow(), "last_match_attempt": None, "declined_ngo_ids": []})
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "status": "pending"}, {"$set": changes}, return_document=ReturnDocument.AFTER
    )
    if updated is None:
        raise conflict("This donation was matched while you were editing it", "NOT_EDITABLE")
    return public_donation(updated)


@router.delete("/donations/{donation_id}")
async def cancel_donation(donation_id: str, user: dict = Depends(donor_only)):
    donation = await own_donation(donation_id, user)
    if donation["status"] not in ("pending", "matched"):
        raise conflict("Donations can only be cancelled before the food is picked up", "NOT_CANCELLABLE")
    updated = await close_donation(donation, "cancelled", {"cancelled_by": user["_id"]})
    if updated is None:
        raise conflict("Donations can only be cancelled before the food is picked up", "NOT_CANCELLABLE")
    recipients = stakeholders(donation, donor=False)
    if donation.get("matched_ngo_user_id") and not donation.get("ngo_accepted"):
        recipients.append(donation["matched_ngo_user_id"])  # an open offer disappears too
    await fcm_service.notify_users(
        recipients,
        "Donation cancelled",
        f"{user['name']} cancelled their donation of {donation.get('total_kg', 0):g} kg.",
        {"type": "donation_cancelled", "donation_id": str(donation["_id"])},
    )
    return public_donation(updated)


@router.get("/donations/{donation_id}/track")
async def track_donation(donation_id: str, user: dict = Depends(donor_only)):
    donation = await own_donation(donation_id, user)
    volunteer = None
    if donation.get("assigned_volunteer_id"):
        volunteer = await db.volunteers.find_one({"_id": donation["assigned_volunteer_id"]})
    return {
        "donation_id": str(donation["_id"]),
        "status": donation["status"],
        "task_stage": donation.get("task_stage"),
        "volunteer": (
            {
                "id": str(volunteer["_id"]),
                "name": volunteer.get("name"),
                "vehicle_type": volunteer.get("vehicle_type"),
                "location": volunteer.get("current_location"),
                "location_updated_at": volunteer.get("location_updated_at"),
            }
            if volunteer
            else None
        ),
        "pickup_location": donation.get("pickup_location"),
        "delivery_location": donation.get("delivery_location"),
        "eta_minutes": volunteer_eta(donation, volunteer),
    }


@router.get("/stats")
async def donor_stats(user: dict = Depends(donor_only)):
    rows = await db.donations.aggregate(
        [
            {"$match": {"donor_id": user["_id"]}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}, "kg": {"$sum": "$total_kg"}, "delivered_kg": {"$sum": "$delivered_kg"}}},
        ]
    ).to_list(None)
    by_status = {row["_id"]: row for row in rows}
    delivered = by_status.get("delivered", {})
    impact = impact_from_kg(float(delivered.get("delivered_kg", 0)))
    return {
        "donations_count": sum(row["count"] for row in rows),
        "delivered_count": delivered.get("count", 0),
        "active_count": sum(by_status.get(s, {}).get("count", 0) for s in ("pending", "matched", "in_transit")),
        "total_kg_donated": round(sum(row["kg"] for s, row in by_status.items() if s != "cancelled"), 1),
        "total_kg_delivered": impact["kg_saved"],
        "meals_contributed": impact["meals_served"],
        "co2_saved_kg": impact["co2_saved_kg"],
        "kg_per_meal": settings.kg_per_meal,
    }
