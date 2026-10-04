"""NGO endpoints: AI offers and open donations, acceptance, capacity, incoming deliveries and history."""
import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from pymongo import ReturnDocument

from ai_engine.matching import match_donation, record_offer_outcome, score_components
from ai_engine.priority_engine import total_kg
from ai_engine.route_optimizer import estimate_eta_minutes
from ai_engine.volunteer_allocator import allocate_volunteer
from errors import APIError, bad_request, conflict, not_found
from models.ad_market import AdSpaceCreate, AdSpaceUpdate
from models.user import CapacityUpdate, NGOProfileUpdate
from services import ad_market_service, fcm_service
from services.analytics_service import local_date
from services.auth_service import require_roles
from services.db_service import db, serialize, to_object_id, utcnow
from services.donation_service import adjust_ngo_load, get_donation, public_donation

router = APIRouter(prefix="/api/ngo", tags=["ngo"])


async def current_ngo(user: dict = Depends(require_roles("ngo"))) -> dict:
    ngo = await db.ngos.find_one({"user_id": user["_id"]})
    if not ngo:
        raise not_found("NGO profile")
    ngo["_user"] = user
    return ngo


def ngo_out(ngo: dict) -> dict:
    out = serialize({k: v for k, v in ngo.items() if k != "_user"})
    capacity = ngo.get("storage_capacity_kg") or 0
    out["load_pct"] = round(100 * ngo.get("current_load_kg", 0) / capacity, 1) if capacity else 0.0
    return out


def require_verified(ngo: dict) -> None:
    if not ngo.get("is_verified"):
        raise APIError(403, "Your organisation must be verified by an admin before accepting donations", "NGO_NOT_VERIFIED")


@router.get("/profile")
async def get_profile(ngo: dict = Depends(current_ngo)):
    return ngo_out(ngo)


@router.put("/profile")
async def update_profile(body: NGOProfileUpdate, ngo: dict = Depends(current_ngo)):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    capacity = changes.get("storage_capacity_kg", ngo.get("storage_capacity_kg", 0))
    if changes.get("current_load_kg", ngo.get("current_load_kg", 0)) > capacity:
        raise bad_request("current_load_kg cannot exceed storage_capacity_kg", "OVER_CAPACITY")
    if changes:
        changes["updated_at"] = utcnow()
        await db.ngos.update_one({"_id": ngo["_id"]}, {"$set": changes})
    return ngo_out(await db.ngos.find_one({"_id": ngo["_id"]}))


@router.get("/available-donations")
async def available_donations(ngo: dict = Depends(current_ngo)):
    """AI offers made to this NGO first, then compatible open (pending) donations."""
    now = utcnow()
    offers = await db.donations.find(
        {"status": "matched", "matched_ngo_id": ngo["_id"], "ngo_accepted": False, "earliest_expiry": {"$gt": now}}
    ).to_list(None)
    open_donations = await db.donations.find(
        {"status": "pending", "declined_ngo_ids": {"$ne": ngo["_id"]}, "earliest_expiry": {"$gt": now}}
    ).to_list(None)

    results = []
    for donation, offer_type in [(d, "offer") for d in offers] + [(d, "open") for d in open_donations]:
        components = score_components(donation, ngo, now)
        if offer_type == "open" and components is None:
            continue  # this NGO can't take it (food type, distance or capacity)
        out = public_donation(donation, now)
        out["offer_type"] = offer_type
        out["match_score"] = components["score"] if components else donation.get("ai_match_score")
        out["match_breakdown"] = components["breakdown"] if components else None
        out["distance_km"] = components["distance_km"] if components else None
        results.append(out)
    results.sort(key=lambda d: (d["offer_type"] != "offer", -(d["match_score"] or 0), -d["priority_score"]))
    return results


@router.post("/accept/{donation_id}")
async def accept_donation(donation_id: str, ngo: dict = Depends(current_ngo)):
    require_verified(ngo)
    donation = await get_donation(donation_id)
    now = utcnow()
    is_offer = donation["status"] == "matched" and donation.get("matched_ngo_id") == ngo["_id"] and not donation.get("ngo_accepted")
    is_open = donation["status"] == "pending" and ngo["_id"] not in donation.get("declined_ngo_ids", [])
    if not (is_offer or is_open):
        raise conflict("This donation is no longer available", "NOT_AVAILABLE")
    if donation["earliest_expiry"] <= now:
        raise conflict("This donation has already expired", "DONATION_EXPIRED")
    components = score_components(donation, ngo, now)
    if is_open and components is None:
        raise conflict("Your organisation can't take this donation (food type, capacity or distance)", "INCOMPATIBLE")

    kg = total_kg(donation)
    expected = {"matched_ngo_id": ngo["_id"], "status": "matched"} if is_offer else {"status": "pending"}
    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "ngo_accepted": {"$ne": True}, **expected},
        {
            "$set": {
                "status": "matched",
                "ngo_accepted": True,
                "matched_ngo_id": ngo["_id"],
                "matched_ngo_user_id": ngo["user_id"],
                "matched_ngo_name": ngo["organization_name"],
                "delivery_location": ngo.get("location"),
                "ai_match_score": components["score"] if components else donation.get("ai_match_score"),
                "matched_at": donation.get("matched_at") or now,
                "accepted_at": now,
                "load_reserved_kg": kg,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict("This donation is no longer available", "NOT_AVAILABLE")

    await adjust_ngo_load(ngo["_id"], kg)  # reserve storage so matching sees the reduced capacity
    await record_offer_outcome(ngo["_id"], received=0 if is_offer else 1, accepted=1)
    await fcm_service.notify_users(
        [donation["donor_id"]],
        "NGO accepted your donation",
        f"{ngo['organization_name']} accepted {kg:g} kg. We're assigning a volunteer for pickup.",
        {"type": "ngo_accepted", "donation_id": str(donation["_id"])},
    )
    await ad_market_service.fill_pool(donation["_id"])  # sponsored stickers for the packaging
    assignment = await allocate_volunteer(donation["_id"])
    return {"donation": public_donation(await get_donation(donation["_id"])), "volunteer_assignment": assignment}


@router.post("/decline/{donation_id}")
async def decline_donation(donation_id: str, ngo: dict = Depends(current_ngo)):
    donation = await get_donation(donation_id)
    is_offer = donation["status"] == "matched" and donation.get("matched_ngo_id") == ngo["_id"] and not donation.get("ngo_accepted")
    if not is_offer and donation["status"] != "pending":
        raise conflict("This donation is no longer available", "NOT_AVAILABLE")
    await db.donations.update_one({"_id": donation["_id"]}, {"$addToSet": {"declined_ngo_ids": ngo["_id"]}})
    if is_offer:
        await record_offer_outcome(ngo["_id"])  # refresh the acceptance rate
        try:
            await match_donation(donation["_id"])  # offer passes to the next-best NGO
        except APIError:
            pass  # expired or accepted elsewhere in the meantime
    return {"ok": True}


@router.get("/incoming")
async def incoming(ngo: dict = Depends(current_ngo)):
    """Accepted donations on their way (or waiting for pickup), with live volunteer positions."""
    donations = await db.donations.find(
        {"matched_ngo_id": ngo["_id"], "ngo_accepted": True, "status": {"$in": ["matched", "in_transit"]}}
    ).sort("accepted_at", -1).to_list(None)
    volunteer_ids = [d["assigned_volunteer_id"] for d in donations if d.get("assigned_volunteer_id")]
    volunteers = {v["_id"]: v async for v in db.volunteers.find({"_id": {"$in": volunteer_ids}})}
    now = utcnow()
    results = []
    for donation in donations:
        out = public_donation(donation, now)
        volunteer = volunteers.get(donation.get("assigned_volunteer_id"))
        out["volunteer"] = (
            {
                "id": str(volunteer["_id"]),
                "name": volunteer.get("name"),
                "vehicle_type": volunteer.get("vehicle_type"),
                "location": volunteer.get("current_location"),
            }
            if volunteer
            else None
        )
        path = [volunteer.get("current_location")] if volunteer else []
        if donation.get("task_stage") != "picked_up":
            path.append(donation.get("pickup_location"))
        path.append(donation.get("delivery_location"))
        out["eta_minutes"] = estimate_eta_minutes(path, (volunteer or {}).get("vehicle_type", "bike")) if volunteer else None
        results.append(out)
    return results


@router.put("/capacity")
async def update_capacity(body: CapacityUpdate, ngo: dict = Depends(current_ngo)):
    capacity = body.storage_capacity_kg or ngo.get("storage_capacity_kg", 0)
    if body.current_load_kg > capacity:
        raise bad_request("current_load_kg cannot exceed storage_capacity_kg", "OVER_CAPACITY")
    updated = await db.ngos.find_one_and_update(
        {"_id": ngo["_id"]},
        {"$set": {"current_load_kg": body.current_load_kg, "storage_capacity_kg": capacity, "updated_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    return ngo_out(updated)


async def delivered_donations(ngo: dict) -> list[dict]:
    return await db.donations.find({"matched_ngo_id": ngo["_id"], "status": "delivered"}).sort("delivered_at", -1).to_list(1000)


@router.get("/history")
async def history(ngo: dict = Depends(current_ngo)):
    now = utcnow()
    return [public_donation(d, now) for d in await delivered_donations(ngo)]


def _csv_cell(value) -> str:
    """Neutralise spreadsheet formula injection in user-provided text."""
    text = "" if value is None else str(value)
    return f"'{text}" if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/history.csv")
async def history_csv(ngo: dict = Depends(current_ngo)):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        ["donation_id", "delivered_date", "delivered_at", "donor", "food_items", "categories", "total_kg", "quantity_confirmed_kg", "receiver_name", "volunteer"]
    )
    for donation in await delivered_donations(ngo):
        record = donation.get("delivery_record") or {}
        items = donation.get("food_items", [])
        writer.writerow(
            [
                _csv_cell(cell)
                for cell in (
                    str(donation["_id"]),
                    local_date(donation["delivered_at"]).isoformat() if donation.get("delivered_at") else "",
                    donation["delivered_at"].isoformat() if donation.get("delivered_at") else "",
                    donation.get("donor_name"),
                    "; ".join(f"{i.get('name')} ({i.get('quantity_kg')} kg)" for i in items),
                    "; ".join(sorted({i.get("category", "") for i in items})),
                    donation.get("total_kg"),
                    record.get("quantity_confirmed_kg"),
                    record.get("receiver_name"),
                    donation.get("assigned_volunteer_name"),
                )
            ]
        )
    filename = f"yieldwrap-history-{utcnow().date().isoformat()}.csv"
    return Response(
        buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ------------------------------------------------------------------------------------------ ad spaces


def space_out(space: dict) -> dict:
    return serialize({k: v for k, v in space.items() if k != "ngo_user_id"})


async def own_space(space_id: str, ngo: dict) -> dict:
    space = await db.ad_spaces.find_one({"_id": to_object_id(space_id, "Ad space"), "ngo_id": ngo["_id"]})
    if not space:
        raise not_found("Ad space")
    return space


@router.get("/ad-spaces")
async def list_ad_spaces(ngo: dict = Depends(current_ngo)):
    spaces = await db.ad_spaces.find({"ngo_id": ngo["_id"]}).sort("created_at", -1).to_list(None)
    return [space_out(s) for s in spaces]


@router.post("/ad-spaces", status_code=201)
async def create_ad_space(body: AdSpaceCreate, ngo: dict = Depends(current_ngo)):
    now = utcnow()
    space = {
        "ngo_id": ngo["_id"],
        "ngo_user_id": ngo["user_id"],
        "ngo_name": ngo["organization_name"],
        **body.model_dump(),
        "location": ngo.get("location"),
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    space["_id"] = (await db.ad_spaces.insert_one(space)).inserted_id
    return space_out(space)


@router.put("/ad-spaces/{space_id}")
async def update_ad_space(space_id: str, body: AdSpaceUpdate, ngo: dict = Depends(current_ngo)):
    space = await own_space(space_id, ngo)
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if changes:
        changes["updated_at"] = utcnow()
        await db.ad_spaces.update_one({"_id": space["_id"]}, {"$set": changes})
    return space_out(await db.ad_spaces.find_one({"_id": space["_id"]}))


@router.delete("/ad-spaces/{space_id}")
async def delete_ad_space(space_id: str, ngo: dict = Depends(current_ngo)):
    space = await own_space(space_id, ngo)
    if await db.ad_campaigns.find_one({"type": "ngo_poster", "status": "active", "poster.ad_space_id": space["_id"]}, {"_id": 1}):
        raise conflict("This space has a live poster booking", "SPACE_HAS_BOOKINGS")
    await db.ad_spaces.delete_one({"_id": space["_id"]})
    return {"ok": True}


@router.get("/ad-bookings")
async def list_ad_bookings(ngo: dict = Depends(current_ngo)):
    campaigns = await db.ad_campaigns.find({"type": "ngo_poster", "poster.ngo_id": ngo["_id"]}).sort("created_at", -1).to_list(None)
    return [ad_market_service.campaign_out(c) for c in campaigns]


@router.post("/ad-bookings/{campaign_id}/displayed")
async def booking_displayed(campaign_id: str, ngo: dict = Depends(current_ngo)):
    return ad_market_service.campaign_out(await ad_market_service.display_poster(campaign_id, ngo))


@router.post("/ad-bookings/{campaign_id}/decline")
async def booking_decline(campaign_id: str, ngo: dict = Depends(current_ngo)):
    campaign = await db.ad_campaigns.find_one(
        {"_id": to_object_id(campaign_id, "Booking"), "type": "ngo_poster", "poster.ngo_id": ngo["_id"]}
    )
    if not campaign:
        raise not_found("Booking")
    updated = await ad_market_service.decline_poster(campaign)
    if updated is None:
        raise conflict("Only requested bookings can be declined", "INVALID_BOOKING_STATE")
    return ad_market_service.campaign_out(updated)
