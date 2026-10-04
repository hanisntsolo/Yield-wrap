"""Intelligent donor–NGO matching: weighted multi-factor scoring of every active, verified NGO."""
from datetime import datetime, time

from bson import ObjectId
from pymongo import ReturnDocument

from ai_engine.geo import clamp, distance_km, haversine  # noqa: F401 - haversine is part of this module's API
from ai_engine.priority_engine import hours_until_expiry
from config import settings
from errors import conflict
from services import fcm_service
from services.db_service import db, utcnow
from services.donation_service import get_donation, public_donation

WEIGHTS = {"distance": 0.30, "capacity": 0.25, "food_type": 0.20, "urgency": 0.15, "history": 0.10}
URGENCY_VALUE = {"critical": 1.0, "high": 0.7, "medium": 0.4, "low": 0.1}
LARGE_NGO_KG = 500.0  # remaining capacity at which an NGO counts as "high-capacity"
DEFAULT_ACCEPTANCE_RATE = 0.5
TOP_MATCHES = 3


def category_kg(donation: dict) -> dict[str, float]:
    totals: dict[str, float] = {}
    for item in donation.get("food_items", []):
        totals[item.get("category")] = totals.get(item.get("category"), 0.0) + float(item.get("quantity_kg", 0))
    return totals


def remaining_capacity(ngo: dict) -> float:
    return max(0.0, float(ngo.get("storage_capacity_kg", 0)) - float(ngo.get("current_load_kg", 0)))


def _parse_hhmm(value: str) -> time:
    hours, minutes = value.split(":")
    return time(int(hours), int(minutes))


def is_open_at(ngo: dict, when: datetime) -> bool | None:
    """Whether the NGO is open at `when` (platform local time). None when hours are unknown."""
    hours = ngo.get("operating_hours") or {}
    try:
        opens, closes = _parse_hhmm(hours["open"]), _parse_hhmm(hours["close"])
    except (KeyError, ValueError, AttributeError):
        return None
    local = when.astimezone(settings.tz).time()
    if opens <= closes:
        return opens <= local <= closes
    return local >= opens or local <= closes  # overnight shift


def score_components(donation: dict, ngo: dict, now: datetime | None = None) -> dict | None:
    """Per-factor scores for one NGO, or None when the NGO cannot take this donation at all
    (out of range, no compatible food type, or no remaining capacity)."""
    max_distance = settings.max_match_distance_km
    distance = distance_km(donation.get("pickup_location"), ngo.get("location"))
    if distance is None or distance > max_distance:
        return None

    by_category = category_kg(donation)
    total = sum(by_category.values())
    accepted = set(ngo.get("accepted_food_types") or [])
    compatible = sum(kg for category, kg in by_category.items() if category in accepted)
    remaining = remaining_capacity(ngo)
    if total <= 0 or compatible <= 0 or remaining <= 0:
        return None

    distance_score = 1 - distance / max_distance
    # Enough room scores 0.5–1.0 (more headroom is better); partial room scores below 0.5.
    capacity_score = 0.5 + 0.5 * (1 - total / remaining) if remaining >= total else 0.5 * remaining / total
    food_score = compatible / total
    # Critical donations favour high-capacity NGOs that are open right now; low urgency is indifferent.
    urgency = URGENCY_VALUE.get(donation.get("urgency_level"), 0.4)
    urgency_score = 1 - urgency * (1 - clamp(remaining / LARGE_NGO_KG))
    open_now = is_open_at(ngo, now or utcnow())
    if open_now is False:
        urgency_score *= 1 - urgency
    history_score = clamp(float(ngo.get("acceptance_rate", DEFAULT_ACCEPTANCE_RATE)))

    breakdown = {
        "distance": distance_score,
        "capacity": capacity_score,
        "food_type": food_score,
        "urgency": urgency_score,
        "history": history_score,
    }
    score = sum(WEIGHTS[factor] * value for factor, value in breakdown.items())
    return {
        "score": round(clamp(score), 4),
        "distance_km": round(distance, 2),
        "breakdown": {k: round(clamp(v), 3) for k, v in breakdown.items()},
        "is_open": open_now,
    }


def compute_match_score(donation: dict, ngo: dict, now: datetime | None = None) -> float:
    """Weighted match score in 0.0–1.0; 0.0 means the NGO is excluded."""
    components = score_components(donation, ngo, now)
    return components["score"] if components else 0.0


def rank_ngos(donation: dict, ngos: list[dict], now: datetime | None = None, exclude_ids=()) -> list[dict]:
    excluded = {str(i) for i in exclude_ids}
    ranked = []
    for ngo in ngos:
        if str(ngo["_id"]) in excluded:
            continue
        components = score_components(donation, ngo, now)
        if components:
            ranked.append(
                {
                    "ngo_id": str(ngo["_id"]),
                    "organization_name": ngo.get("organization_name", ""),
                    "score": components["score"],
                    "distance_km": components["distance_km"],
                    "breakdown": components["breakdown"],
                }
            )
    ranked.sort(key=lambda c: (-c["score"], c["distance_km"]))
    return ranked


async def eligible_ngos() -> list[dict]:
    return await db.ngos.find({"is_active": True, "is_verified": True}).to_list(None)


async def record_offer_outcome(ngo_id: ObjectId, *, received: int = 0, accepted: int = 0) -> None:
    """Update the NGO's offer counters and its (Laplace-smoothed) historical acceptance rate."""
    ngo = await db.ngos.find_one_and_update(
        {"_id": ngo_id},
        {"$inc": {"offers_received": received, "offers_accepted": accepted}},
        return_document=ReturnDocument.AFTER,
    )
    if ngo:
        rate = (ngo.get("offers_accepted", 0) + 1) / (ngo.get("offers_received", 0) + 2)
        await db.ngos.update_one({"_id": ngo_id}, {"$set": {"acceptance_rate": round(clamp(rate), 4)}})


async def match_donation(donation_id, *, notify: bool = True) -> dict:
    """Rank compatible NGOs, offer the donation to the best one and store the result on the donation.

    Returns {"donation": Donation, "matches": top-3 candidates}. NGOs that already declined are skipped;
    with no candidate the donation stays `pending` (visible to NGOs as an open donation).
    """
    donation = await get_donation(donation_id)
    if donation["status"] not in ("pending", "matched") or donation.get("ngo_accepted"):
        raise conflict("This donation has already been accepted or closed", "NOT_MATCHABLE")
    now = utcnow()
    if (hours_until_expiry(donation, now) or 0) <= 0:
        raise conflict("This donation has already expired", "DONATION_EXPIRED")

    ngos = await eligible_ngos()
    ranked = rank_ngos(donation, ngos, now, donation.get("declined_ngo_ids", []))
    matches = ranked[:TOP_MATCHES]
    previous_offer = donation.get("matched_ngo_id")

    if matches:
        best = matches[0]
        ngo = next(n for n in ngos if str(n["_id"]) == best["ngo_id"])
        update = {
            "status": "matched",
            "matched_ngo_id": ngo["_id"],
            "matched_ngo_user_id": ngo["user_id"],
            "matched_ngo_name": best["organization_name"],
            "ai_match_score": best["score"],
            "match_candidates": [{k: v for k, v in m.items() if k != "breakdown"} for m in matches],
            "matched_at": now,
            "last_match_attempt": now,
        }
        if previous_offer != ngo["_id"]:
            update["offered_at"] = now
    else:
        ngo = None
        update = {
            "status": "pending",
            "matched_ngo_id": None,
            "matched_ngo_user_id": None,
            "matched_ngo_name": None,
            "ai_match_score": None,
            "match_candidates": [],
            "last_match_attempt": now,
        }

    updated = await db.donations.find_one_and_update(
        {"_id": donation["_id"], "ngo_accepted": {"$ne": True}, "status": {"$in": ["pending", "matched"]}},
        {"$set": update},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict("This donation has already been accepted or closed", "NOT_MATCHABLE")

    if ngo and previous_offer != ngo["_id"]:
        await record_offer_outcome(ngo["_id"], received=1)
        if notify:
            data = {"type": "match_offer", "donation_id": str(donation["_id"])}
            await fcm_service.notify_users(
                [ngo["user_id"]],
                "New donation offer",
                f"{updated.get('total_kg', 0):g} kg from {updated.get('donor_name', 'a donor')} "
                f"— AI match score {round(matches[0]['score'] * 100)}%",
                data,
            )
            await fcm_service.notify_users(
                [donation["donor_id"]],
                "Match found",
                f"Your donation was matched with {matches[0]['organization_name']}. Waiting for them to accept.",
                data,
            )
    elif not ngo and previous_offer and notify:
        await fcm_service.notify_users(
            [donation["donor_id"]],
            "Still looking for an NGO",
            "No NGO could take your donation right now. We'll keep trying automatically.",
            {"type": "match_pending", "donation_id": str(donation["_id"])},
        )

    return {"donation": public_donation(updated, now), "matches": matches}
