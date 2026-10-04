"""Volunteer allocation: pick the best available volunteer for an NGO-accepted donation."""
from bson import ObjectId
from pymongo import ReturnDocument

from ai_engine.geo import clamp, distance_km
from ai_engine.priority_engine import total_kg
from config import settings
from services import fcm_service
from services.db_service import db, utcnow
from services.donation_service import get_donation

WEIGHTS = {"proximity": 0.50, "vehicle": 0.30, "rating": 0.20}
VEHICLE_CAPACITY_KG = {"on_foot": 5.0, "bike": 15.0, "car": 80.0, "van": 400.0}
# Critical or heavy donations prefer van > car > bike; small routine ones prefer nimble vehicles.
VEHICLE_PREFERENCE_HEAVY = {"van": 1.0, "car": 0.75, "bike": 0.35, "on_foot": 0.1}
VEHICLE_PREFERENCE_LIGHT = {"bike": 1.0, "car": 0.9, "van": 0.75, "on_foot": 0.8}
HEAVY_DONATION_KG = 40.0


def vehicle_suitability(vehicle_type: str, kg: float, urgency: str) -> float:
    heavy = kg >= HEAVY_DONATION_KG or urgency == "critical"
    preference = (VEHICLE_PREFERENCE_HEAVY if heavy else VEHICLE_PREFERENCE_LIGHT).get(vehicle_type, 0.5)
    capacity = VEHICLE_CAPACITY_KG.get(vehicle_type, 15.0)
    if capacity < kg:  # would need several trips
        preference *= 0.5 * capacity / kg
    return clamp(preference)


def score_volunteer(donation: dict, volunteer: dict) -> dict:
    distance = distance_km(volunteer.get("current_location"), donation.get("pickup_location"))
    proximity = 0.0 if distance is None else clamp(1 - distance / settings.max_volunteer_distance_km)
    vehicle = vehicle_suitability(volunteer.get("vehicle_type", "bike"), total_kg(donation), donation.get("urgency_level", "medium"))
    rating = clamp(float(volunteer.get("rating", 4.0)) / 5)
    score = WEIGHTS["proximity"] * proximity + WEIGHTS["vehicle"] * vehicle + WEIGHTS["rating"] * rating
    return {
        "volunteer_id": str(volunteer["_id"]),
        "name": volunteer.get("name", "Volunteer"),
        "vehicle_type": volunteer.get("vehicle_type"),
        "score": round(clamp(score), 4),
        "distance_km": None if distance is None else round(distance, 2),
        "breakdown": {"proximity": round(proximity, 3), "vehicle": round(vehicle, 3), "rating": round(rating, 3)},
    }


def rank_volunteers(donation: dict, volunteers: list[dict], exclude_ids=()) -> list[dict]:
    excluded = {str(i) for i in exclude_ids}
    ranked = [score_volunteer(donation, v) for v in volunteers if str(v["_id"]) not in excluded]
    ranked.sort(key=lambda c: (-c["score"], c["distance_km"] if c["distance_km"] is not None else float("inf")))
    return ranked


async def allocate_volunteer(donation_id, *, notify: bool = True) -> dict | None:
    """Assign the top-scoring free volunteer to the donation. Returns the assignment or None.

    The volunteer is claimed atomically (`active_task_id` must still be empty) so two donations can
    never grab the same person; if the donation was assigned concurrently the claim is rolled back.
    """
    donation = await get_donation(donation_id)
    if donation.get("status") != "matched" or not donation.get("ngo_accepted") or donation.get("assigned_volunteer_id"):
        return None

    volunteers = await db.volunteers.find({"availability": True, "active_task_id": None}).to_list(None)
    for candidate in rank_volunteers(donation, volunteers, donation.get("declined_volunteer_ids", [])):
        volunteer = await db.volunteers.find_one_and_update(
            {"_id": ObjectId(candidate["volunteer_id"]), "availability": True, "active_task_id": None},
            {"$set": {"active_task_id": donation["_id"]}},
            return_document=ReturnDocument.AFTER,
        )
        if volunteer:
            break
    else:
        return None

    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "status": "matched", "assigned_volunteer_id": None},
        {
            "$set": {
                "assigned_volunteer_id": volunteer["_id"],
                "assigned_volunteer_user_id": volunteer["user_id"],
                "assigned_volunteer_name": volunteer.get("name"),
                "task_stage": "assigned",
                "assigned_at": utcnow(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        await db.volunteers.update_one({"_id": volunteer["_id"]}, {"$set": {"active_task_id": None}})
        return None

    if notify:
        data = {"type": "task_assigned", "donation_id": str(donation["_id"])}
        pickup = (donation.get("pickup_location") or {}).get("address") or "the donor's location"
        await fcm_service.notify_users(
            [volunteer["user_id"]],
            "New pickup task",
            f"Pick up {total_kg(donation):g} kg at {pickup} and deliver to {donation.get('matched_ngo_name', 'the NGO')}.",
            data,
        )
        await fcm_service.notify_users(
            [donation["donor_id"]],
            "Volunteer assigned",
            f"{volunteer.get('name', 'A volunteer')} will collect your donation.",
            data,
        )
    return {k: candidate[k] for k in ("volunteer_id", "name", "score", "distance_km")}
