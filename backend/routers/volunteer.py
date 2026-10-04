"""Volunteer endpoints: availability, pickup tasks, delivery confirmation, live location, leaderboard."""
from datetime import datetime, time

from fastapi import APIRouter, Depends
from pymongo import ReturnDocument

from ai_engine.volunteer_allocator import allocate_volunteer
from config import settings
from errors import conflict, field_error, not_found
from models.donation import TaskStatusUpdate
from models.user import AvailabilityUpdate, LocationUpdate
from services import ad_market_service, fcm_service
from services.auth_service import require_roles
from services.db_service import as_utc, db, serialize, utcnow
from services.donation_service import adjust_ngo_load, get_donation, public_donation, stakeholders
from services.realtime import publish_location

router = APIRouter(prefix="/api/volunteer", tags=["volunteer"])

ACTIVE_TASK_STATUSES = ["matched", "in_transit"]
MIN_TASK_HOURS, MAX_TASK_HOURS = 0.25, 12.0
# Allowed task-stage transitions: requested status -> stages it may follow.
TRANSITIONS = {
    "at_pickup": ("assigned", "accepted"),
    "picked_up": ("assigned", "accepted", "at_pickup"),
    "delivered": ("picked_up",),
}


async def current_volunteer(user: dict = Depends(require_roles("volunteer"))) -> dict:
    volunteer = await db.volunteers.find_one({"user_id": user["_id"]})
    if not volunteer:
        raise not_found("Volunteer profile")
    volunteer["_user"] = user
    return volunteer


def volunteer_out(volunteer: dict) -> dict:
    return serialize({k: v for k, v in volunteer.items() if k != "_user"})


async def own_task(donation_id: str, volunteer: dict) -> dict:
    donation = await get_donation(donation_id)
    if donation.get("assigned_volunteer_id") != volunteer["_id"]:
        raise not_found("Task")
    return donation


@router.get("/profile")
async def get_profile(volunteer: dict = Depends(current_volunteer)):
    return volunteer_out(volunteer)


@router.put("/availability")
async def set_availability(body: AvailabilityUpdate, volunteer: dict = Depends(current_volunteer)):
    updated = await db.volunteers.find_one_and_update(
        {"_id": volunteer["_id"]}, {"$set": {"availability": body.availability}}, return_document=ReturnDocument.AFTER
    )
    return volunteer_out(updated)


@router.get("/tasks")
async def tasks(volunteer: dict = Depends(current_volunteer)):
    donations = await db.donations.find(
        {"assigned_volunteer_id": volunteer["_id"], "status": {"$in": ACTIVE_TASK_STATUSES}}
    ).to_list(None)
    now = utcnow()
    return sorted((public_donation(d, now) for d in donations), key=lambda d: -d["priority_score"])


@router.post("/tasks/{donation_id}/accept")
async def accept_task(donation_id: str, volunteer: dict = Depends(current_volunteer)):
    donation = await own_task(donation_id, volunteer)
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "assigned_volunteer_id": volunteer["_id"], "task_stage": "assigned"},
        {"$set": {"task_stage": "accepted", "task_accepted_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict("This task has already been accepted or is no longer assigned to you", "INVALID_TASK_STAGE")
    await fcm_service.notify_users(
        [donation.get("matched_ngo_user_id")],
        "Volunteer on the way",
        f"{volunteer.get('name', 'A volunteer')} accepted the pickup from {donation.get('donor_name', 'the donor')}.",
        {"type": "task_accepted", "donation_id": str(donation["_id"])},
    )
    return public_donation(updated)


@router.post("/tasks/{donation_id}/decline")
async def decline_task(donation_id: str, volunteer: dict = Depends(current_volunteer)):
    donation = await own_task(donation_id, volunteer)
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "assigned_volunteer_id": volunteer["_id"], "task_stage": {"$in": ["assigned", "accepted", "at_pickup"]}},
        {
            "$set": {"assigned_volunteer_id": None, "assigned_volunteer_user_id": None, "assigned_volunteer_name": None, "task_stage": None},
            "$addToSet": {"declined_volunteer_ids": volunteer["_id"]},
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict("Tasks can only be declined before the food is picked up", "INVALID_TASK_STAGE")
    await db.volunteers.update_one({"_id": volunteer["_id"], "active_task_id": donation["_id"]}, {"$set": {"active_task_id": None}})
    await allocate_volunteer(donation["_id"])
    return {"ok": True}


@router.put("/tasks/{donation_id}/status")
async def update_task_status(donation_id: str, body: TaskStatusUpdate, volunteer: dict = Depends(current_volunteer)):
    donation = await own_task(donation_id, volunteer)
    now = utcnow()
    changes: dict = {"task_stage": body.status}
    guard: dict = {}
    packaging = donation.get("packaging")
    if body.status == "at_pickup":
        changes["at_pickup_at"] = now
    elif body.status == "picked_up":
        changes.update({"status": "in_transit", "picked_up_at": now})
        stickers_total = (packaging or {}).get("stickers_total", 0)
        if stickers_total > 0:
            if body.stickers_applied is None:
                raise field_error("stickers_applied", f"Enter how many of the {stickers_total} ad stickers were applied")
            if body.stickers_applied > stickers_total:
                raise field_error("stickers_applied", f"stickers_applied can't exceed {stickers_total}")
            changes.update(ad_market_service.sticker_changes(packaging, body.stickers_applied, volunteer["_id"], now))
        if packaging is not None:
            guard = {"packaging.stickers_total": stickers_total}  # the sticker pool must not change underneath us
    else:
        changes.update(
            {
                "status": "delivered",
                "delivered_at": now,
                "delivered_kg": body.quantity_confirmed_kg,
                "load_reserved_kg": 0,
                # Food-safety audit trail.
                "delivery_record": {
                    "delivered_at": now,
                    "volunteer_id": volunteer["_id"],
                    "volunteer_name": volunteer.get("name"),
                    "receiver_name": body.receiver_name,
                    "quantity_confirmed_kg": body.quantity_confirmed_kg,
                },
            }
        )

    updated = await db.donations.find_one_and_update(
        {
            "_id": donation["_id"],
            "assigned_volunteer_id": volunteer["_id"],
            "status": {"$in": ACTIVE_TASK_STATUSES},
            "task_stage": {"$in": list(TRANSITIONS[body.status])},
            **guard,
        },
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict(f"Can't mark this task as {body.status.replace('_', ' ')} from its current stage", "INVALID_TASK_STAGE")

    data = {"type": f"task_{body.status}", "donation_id": str(donation["_id"])}
    name = volunteer.get("name", "The volunteer")
    if body.status == "at_pickup":
        await fcm_service.notify_users(
            stakeholders(donation, volunteer=False), "Volunteer at pickup", f"{name} has arrived to collect the food.", data
        )
    elif body.status == "picked_up":
        if updated.get("packaging", {}).get("stickers_applied"):
            await ad_market_service.settle_stickers(updated["packaging"])
        await fcm_service.notify_users(
            stakeholders(donation, volunteer=False), "Food collected", f"{name} collected the food and is on the way.", data
        )
    else:
        started = donation.get("task_accepted_at") or donation.get("assigned_at") or now
        hours = min(MAX_TASK_HOURS, max(MIN_TASK_HOURS, (now - as_utc(started)).total_seconds() / 3600))
        await db.volunteers.update_one(
            {"_id": volunteer["_id"]},
            {"$inc": {"completed_deliveries": 1, "hours_contributed": round(hours, 2)}, "$set": {"active_task_id": None}},
        )
        await adjust_ngo_load(donation.get("matched_ngo_id"), body.quantity_confirmed_kg - (donation.get("load_reserved_kg") or 0))
        if await ad_market_service.credit_ngo_for_delivery(updated):
            updated = await get_donation(donation["_id"])
        message = f"{body.quantity_confirmed_kg:g} kg delivered to {donation.get('matched_ngo_name', 'the NGO')}, received by {body.receiver_name}."
        await fcm_service.notify_users(stakeholders(donation, volunteer=False), "Delivery confirmed", message, data)
        await fcm_service.notify_admins("Delivery confirmed", message, data)
    return public_donation(updated)


@router.put("/location")
async def update_location(body: LocationUpdate, volunteer: dict = Depends(current_volunteer)):
    await publish_location(volunteer, body.lat, body.lng)
    return {"ok": True}


@router.get("/history")
async def history(volunteer: dict = Depends(current_volunteer)):
    donations = await db.donations.find({"assigned_volunteer_id": volunteer["_id"], "status": "delivered"}).sort("delivered_at", -1).to_list(500)
    now = utcnow()
    return [public_donation(d, now) for d in donations]


@router.get("/leaderboard")
async def leaderboard(volunteer: dict = Depends(current_volunteer)):
    local_now = utcnow().astimezone(settings.tz)
    month_start = datetime.combine(local_now.date().replace(day=1), time.min, tzinfo=settings.tz)
    rows = await db.donations.aggregate(
        [
            {"$match": {"status": "delivered", "delivered_at": {"$gte": month_start}}},
            {"$group": {"_id": "$assigned_volunteer_id", "deliveries": {"$sum": 1}, "kg": {"$sum": "$delivered_kg"}}},
        ]
    ).to_list(None)
    this_month = {row["_id"]: row for row in rows}
    volunteers = await db.volunteers.find({}).to_list(None)
    board = [
        {
            "volunteer_id": str(v["_id"]),
            "name": v.get("name"),
            "vehicle_type": v.get("vehicle_type"),
            "deliveries_this_month": this_month.get(v["_id"], {}).get("deliveries", 0),
            "kg_this_month": round(this_month.get(v["_id"], {}).get("kg", 0), 1),
            "completed_deliveries": v.get("completed_deliveries", 0),
            "rating": v.get("rating"),
            "is_me": v["_id"] == volunteer["_id"],
        }
        for v in volunteers
    ]
    board.sort(key=lambda r: (-r["deliveries_this_month"], -r["completed_deliveries"], -(r["rating"] or 0)))
    return board[:20]
