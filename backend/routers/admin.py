"""Admin console: user management, system-wide donations, platform stats, broadcasts and the live map."""
import re

from fastapi import APIRouter, Depends, Query
from pymongo import ReturnDocument

from ai_engine.volunteer_allocator import allocate_volunteer
from errors import bad_request, conflict, not_found
from models.ad_market import CreativeReview, CreditGrant
from models.analytics import BroadcastRequest
from models.common import DONATION_STATUSES, ROLES, DonationStatus, Role
from models.user import SuspendRequest, VerifyRequest
from services import ad_market_service, fcm_service
from services.analytics_service import delivered_kg, impact_from_kg, wasted_kg
from services.auth_service import public_user, require_roles
from services.db_service import db, serialize, to_object_id, utcnow
from services.donation_service import OPEN_STATUSES, close_donation, public_donation, reset_to_pending

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_roles("admin")


async def get_user(user_id: str) -> dict:
    user = await db.users.find_one({"_id": to_object_id(user_id, "User")})
    if not user:
        raise not_found("User")
    return user


async def profiles_for(users: list[dict]) -> dict:
    ids = [u["_id"] for u in users]
    profiles = {}
    async for ngo in db.ngos.find({"user_id": {"$in": ids}}):
        profiles[ngo["user_id"]] = ngo
    async for volunteer in db.volunteers.find({"user_id": {"$in": ids}}):
        profiles[volunteer["user_id"]] = volunteer
    async for business in db.businesses.find({"user_id": {"$in": ids}}):
        profiles[business["user_id"]] = business
    return profiles


async def unassign_volunteer_tasks(volunteer: dict) -> None:
    """Hand a volunteer's not-yet-collected task to someone else."""
    async for donation in db.donations.find({"assigned_volunteer_id": volunteer["_id"], "status": "matched"}):
        await db.donations.update_one(
            {"_id": donation["_id"]},
            {
                "$set": {"assigned_volunteer_id": None, "assigned_volunteer_user_id": None, "assigned_volunteer_name": None, "task_stage": None},
                "$addToSet": {"declined_volunteer_ids": volunteer["_id"]},
            },
        )
        await db.volunteers.update_one({"_id": volunteer["_id"]}, {"$set": {"active_task_id": None}})
        await allocate_volunteer(donation["_id"])


@router.get("/users")
async def list_users(
    role: Role | None = Query(None),
    q: str | None = Query(None, max_length=100),
    _: dict = Depends(admin_only),
):
    query: dict = {}
    if role:
        query["role"] = role
    if q and q.strip():
        pattern = re.escape(q.strip())
        query["$or"] = [{"name": {"$regex": pattern, "$options": "i"}}, {"email": {"$regex": pattern, "$options": "i"}}]
    users = await db.users.find(query).sort("created_at", -1).to_list(1000)
    profiles = await profiles_for(users)
    return [{**public_user(u), "profile": serialize(profiles[u["_id"]]) if u["_id"] in profiles else None} for u in users]


@router.put("/users/{user_id}/verify")
async def verify_user(user_id: str, body: VerifyRequest, _: dict = Depends(admin_only)):
    user = await get_user(user_id)
    updated = await db.users.find_one_and_update(
        {"_id": user["_id"]}, {"$set": {"is_verified": body.is_verified}}, return_document=ReturnDocument.AFTER
    )
    if user["role"] == "ngo":
        await db.ngos.update_one({"user_id": user["_id"]}, {"$set": {"is_verified": body.is_verified}})
    await fcm_service.notify_users(
        [user["_id"]],
        "Account verified" if body.is_verified else "Verification removed",
        "Your account has been verified. You can now receive donations." if body.is_verified
        else "An administrator removed your verification. Contact support for details.",
        {"type": "verification"},
    )
    return public_user(updated)


@router.put("/users/{user_id}/suspend")
async def suspend_user(user_id: str, body: SuspendRequest, admin: dict = Depends(admin_only)):
    user = await get_user(user_id)
    if user["_id"] == admin["_id"]:
        raise bad_request("You can't suspend your own account", "SELF_ACTION")
    update = {"$set": {"is_suspended": body.is_suspended}}
    if body.is_suspended:
        update["$inc"] = {"token_version": 1}  # sign the user out everywhere
    updated = await db.users.find_one_and_update({"_id": user["_id"]}, update, return_document=ReturnDocument.AFTER)
    if user["role"] == "ngo":
        await db.ngos.update_one({"user_id": user["_id"]}, {"$set": {"is_active": not body.is_suspended}})
    elif user["role"] == "volunteer" and body.is_suspended:
        volunteer = await db.volunteers.find_one_and_update(
            {"user_id": user["_id"]}, {"$set": {"availability": False}}, return_document=ReturnDocument.AFTER
        )
        if volunteer:
            await unassign_volunteer_tasks(volunteer)
    return public_user(updated)


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(admin_only)):
    user = await get_user(user_id)
    if user["_id"] == admin["_id"]:
        raise bad_request("You can't delete your own account", "SELF_ACTION")

    ngo = await db.ngos.find_one({"user_id": user["_id"]}) if user["role"] == "ngo" else None
    volunteer = await db.volunteers.find_one({"user_id": user["_id"]}) if user["role"] == "volunteer" else None
    in_transit = {"status": "in_transit"}
    if (
        (user["role"] == "donor" and await db.donations.find_one({"donor_id": user["_id"], **in_transit}))
        or (ngo and await db.donations.find_one({"matched_ngo_id": ngo["_id"], **in_transit}))
        or (volunteer and await db.donations.find_one({"assigned_volunteer_id": volunteer["_id"], **in_transit}))
    ):
        raise conflict("This user has a delivery in transit. Wait until it is delivered.", "USER_HAS_ACTIVE_DELIVERY")

    if user["role"] == "donor":
        async for donation in db.donations.find({"donor_id": user["_id"], "status": {"$in": list(OPEN_STATUSES)}}):
            await close_donation(donation, "cancelled", {"cancelled_by": admin["_id"]})
    if ngo:
        async for donation in db.donations.find({"matched_ngo_id": ngo["_id"], "status": {"$in": list(OPEN_STATUSES)}}):
            await reset_to_pending(donation, declined_ngo=ngo["_id"])
        await db.ngos.delete_one({"_id": ngo["_id"]})
    if volunteer:
        await unassign_volunteer_tasks(volunteer)
        await db.volunteers.delete_one({"_id": volunteer["_id"]})
    if ngo:
        await ad_market_service.remove_ngo_ad_spaces(ngo)
    await ad_market_service.remove_advertiser(user)
    if user["role"] == "business":
        await db.businesses.delete_one({"user_id": user["_id"]})
    await db.notifications.delete_many({"user_id": user["_id"]})
    await db.users.delete_one({"_id": user["_id"]})
    return {"ok": True}


@router.get("/donations")
async def all_donations(status: DonationStatus | None = Query(None), _: dict = Depends(admin_only)):
    donations = await db.donations.find({"status": status} if status else {}).sort("created_at", -1).to_list(1000)
    now = utcnow()
    return [public_donation(d, now) for d in donations]


@router.get("/system-stats")
async def system_stats(_: dict = Depends(admin_only)):
    roles = await db.users.aggregate([{"$group": {"_id": "$role", "count": {"$sum": 1}}}]).to_list(None)
    statuses = await db.donations.aggregate([{"$group": {"_id": "$status", "count": {"$sum": 1}}}]).to_list(None)
    redistributed = await delivered_kg()
    return {
        "users_by_role": {role: 0 for role in ROLES} | {r["_id"]: r["count"] for r in roles},
        "donations_by_status": {s: 0 for s in DONATION_STATUSES} | {s["_id"]: s["count"] for s in statuses},
        "total_kg_redistributed": round(redistributed, 1),
        "total_kg_wasted": round(await wasted_kg(), 1),
        "meals_served_estimate": impact_from_kg(redistributed)["meals_served"],
        "pending_ngo_verifications": await db.ngos.count_documents({"is_verified": False}),
    }


@router.post("/broadcast")
async def broadcast(body: BroadcastRequest, _: dict = Depends(admin_only)):
    result = await fcm_service.notify_role(body.role, body.title, body.body, {"type": "broadcast"}, wait_for_push=True)
    return {"recipients": result["recipients"], "push_sent": result["push_sent"]}


@router.get("/map")
async def live_map(_: dict = Depends(admin_only)):
    now = utcnow()
    donations = await db.donations.find({"status": {"$in": ["pending", "matched", "in_transit"]}}).to_list(None)
    volunteers = await db.volunteers.find({"current_location": {"$ne": None}}).to_list(None)
    ngos = await db.ngos.find({"is_active": True}).to_list(None)
    return {
        "donations": [public_donation(d, now) for d in donations],
        "volunteers": [
            {
                "id": str(v["_id"]),
                "name": v.get("name"),
                "vehicle_type": v.get("vehicle_type"),
                "location": v.get("current_location"),
                "availability": v.get("availability", False),
                "active_task_id": str(v["active_task_id"]) if v.get("active_task_id") else None,
            }
            for v in volunteers
        ],
        "ngos": [
            {
                "id": str(n["_id"]),
                "organization_name": n.get("organization_name"),
                "location": n.get("location"),
                "is_verified": n.get("is_verified", False),
                "load_pct": round(100 * n.get("current_load_kg", 0) / n["storage_capacity_kg"], 1) if n.get("storage_capacity_kg") else 0.0,
            }
            for n in ngos
        ],
    }


# ------------------------------------------------------------------------------------------ packaging ad-tech


@router.get("/ad-creatives")
async def ad_creatives(
    status: str | None = Query("pending", pattern=r"^(pending|approved|rejected|all)$"), _: dict = Depends(admin_only)
):
    query = {} if status in (None, "all") else {"status": status}
    creatives = await db.ad_creatives.find(query).sort("created_at", 1).to_list(1000)
    return [ad_market_service.creative_out(c) for c in creatives]


@router.put("/ad-creatives/{creative_id}/review")
async def review_ad_creative(creative_id: str, body: CreativeReview, _: dict = Depends(admin_only)):
    creative = await db.ad_creatives.find_one_and_update(
        {"_id": to_object_id(creative_id, "Creative")},
        {
            "$set": {
                "status": "approved" if body.approved else "rejected",
                "rejection_reason": None if body.approved else (body.reason or "Doesn't meet the ad guidelines"),
                "reviewed_at": utcnow(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not creative:
        raise not_found("Creative")
    await fcm_service.notify_users(
        [creative["owner_id"]],
        "Creative approved" if body.approved else "Creative rejected",
        f"\"{creative['title']}\" is approved and ready for campaigns." if body.approved
        else f"\"{creative['title']}\" was rejected: {creative['rejection_reason']}",
        {"type": "creative_reviewed", "creative_id": str(creative["_id"])},
    )
    return ad_market_service.creative_out(creative)


@router.get("/ad-revenue")
async def ad_revenue(_: dict = Depends(admin_only)):
    orders = await db.ad_orders.aggregate(
        [{"$match": {"status": "paid"}}, {"$group": {"_id": None, "credits": {"$sum": "$credits"}, "paise": {"$sum": "$amount_paise"}, "count": {"$sum": 1}}}]
    ).to_list(None)
    sold = orders[0] if orders else {"credits": 0, "paise": 0, "count": 0}
    by_type = await db.ad_campaigns.aggregate(
        [{"$group": {"_id": "$type", "spent": {"$sum": "$credits_spent"}, "refunded": {"$sum": "$credits_refunded"}}}]
    ).to_list(None)
    earnings = await db.credit_transactions.aggregate(
        [{"$match": {"type": "earning"}}, {"$group": {"_id": None, "credits": {"$sum": "$credits"}}}]
    ).to_list(None)
    packets = {"stickered": 0, "own": 0, "sponsored": 0}
    async for donation in db.donations.find({"packaging.stickers_applied": {"$ne": None}}, {"packaging": 1}):
        packaging = donation["packaging"]
        packets["stickered"] += packaging["stickers_applied"]["count"]
        packets["own"] += packaging.get("own_applied", 0)
        packets["sponsored"] += packaging.get("sponsored_applied", 0)
    advertisers = await db.ad_campaigns.aggregate(
        [
            {"$group": {"_id": "$owner_id", "owner_name": {"$last": "$owner_name"}, "spent": {"$sum": "$credits_spent"}, "refunded": {"$sum": "$credits_refunded"}}},
        ]
    ).to_list(None)
    top = sorted(
        ({"owner_id": str(a["_id"]), "owner_name": a["owner_name"], "credits_spent": a["spent"] - a["refunded"]} for a in advertisers),
        key=lambda a: -a["credits_spent"],
    )[:10]
    return {
        "credits_sold": sold["credits"],
        "revenue_inr": round(sold["paise"] / 100, 2),
        "orders_paid": sold["count"],
        "credits_spent_by_type": {t: 0 for t in ad_market_service.CAMPAIGN_TYPES} | {row["_id"]: row["spent"] for row in by_type},
        "credits_refunded": sum(row["refunded"] for row in by_type),
        "ngo_earnings_credits": earnings[0]["credits"] if earnings else 0,
        "packets_stickered": packets["stickered"],
        "packets_own": packets["own"],
        "packets_sponsored": packets["sponsored"],
        "scans": await db.ad_scans.count_documents({}),
        "active_campaigns": await db.ad_campaigns.count_documents({"status": "active"}),
        "pending_creatives": await db.ad_creatives.count_documents({"status": "pending"}),
        "top_advertisers": top,
    }


@router.post("/users/{user_id}/credits")
async def grant_credits(user_id: str, body: CreditGrant, admin: dict = Depends(admin_only)):
    user = await get_user(user_id)
    note = body.note or "Adjustment by an administrator"
    if body.credits > 0:
        balance = await ad_market_service.add_credits(user["_id"], body.credits, "grant", note, admin["_id"])
    else:
        balance = await ad_market_service.debit_credits(user["_id"], -body.credits, "grant", note, admin["_id"])
    return {"credits": balance}
