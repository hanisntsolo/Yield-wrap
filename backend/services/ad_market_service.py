"""Packaging ad-tech: credit wallets, creatives, campaigns, sticker pool allocation and NGO revenue share.

Credits are integers stored on the user document (`ad_credits` spendable, `ad_earnings_credits` for NGOs).
Every balance change is mirrored in the `credit_transactions` ledger. All balance and inventory changes are
single-document atomic updates (guarded `$inc`) so concurrent requests never overdraw or double-count.
"""
import logging
import math
from datetime import timedelta
from pathlib import Path

from bson import ObjectId
from pymongo import ReturnDocument

from ai_engine.geo import distance_km, has_coords
from config import settings
from errors import conflict, not_found, payment_required
from services import fcm_service
from services.db_service import db, serialize, to_object_id, utcnow

logger = logging.getLogger("yieldwrap.ad_market")

CREDIT_PACKS = [
    {"id": "starter", "credits": 100, "price_inr": 499},
    {"id": "growth", "credits": 500, "price_inr": 1999},
    {"id": "pro", "credits": 2000, "price_inr": 6999},
]
PACKS_BY_ID = {pack["id"]: pack for pack in CREDIT_PACKS}
CAMPAIGN_TYPES = ("packet", "ngo_poster", "digital")
DIGITAL_AD_WEIGHT = 3.0  # paid campaigns win over house ads (weight 1.0) most of the time
DIGITAL_AD_PREFIX = "cmp_"

EMPTY_PACKAGING = {
    "packet_count": 0,
    "own_ad": None,
    "sponsored_capacity": 0,
    "sponsored": [],
    "stickers_total": 0,
    "stickers_applied": None,
}


def creatives_dir() -> Path:
    return Path(settings.upload_dir) / "ad_creatives"


def share_of(credits: float, share: float) -> int:
    """floor(credits × share), immune to float noise like 29.999999999."""
    return max(0, math.floor(round(credits * share, 6)))


# ---------------------------------------------------------------------------------------------- wallet


async def _ledger(user_id: ObjectId, kind: str, credits: int, balance_after: int, note: str, ref_id, **extra) -> None:
    await db.credit_transactions.insert_one(
        {
            "user_id": user_id,
            "type": kind,
            "credits": credits,
            "balance_after": balance_after,
            "note": note,
            "ref_id": str(ref_id) if ref_id is not None else None,
            "created_at": utcnow(),
            **extra,
        }
    )


async def add_credits(user_id: ObjectId, credits: int, kind: str, note: str, ref_id=None, *, earnings: bool = False, **extra) -> int | None:
    """Add credits (purchase/refund/grant) or NGO earnings. Returns the new balance (None if the user is gone)."""
    if credits <= 0:
        return None
    field = "ad_earnings_credits" if earnings else "ad_credits"
    user = await db.users.find_one_and_update(
        {"_id": user_id}, {"$inc": {field: credits}}, projection={field: 1}, return_document=ReturnDocument.AFTER
    )
    if user is None:
        logger.warning("Credit of %s to missing user %s skipped (%s)", credits, user_id, note)
        return None
    await _ledger(user_id, kind, credits, user.get(field, 0), note, ref_id, wallet="earnings" if earnings else "credits", **extra)
    return user.get(field, 0)


async def debit_credits(user_id: ObjectId, credits: int, kind: str, note: str, ref_id=None, **extra) -> int:
    """Atomically spend credits; 402 INSUFFICIENT_CREDITS if the balance is too low."""
    user = await db.users.find_one_and_update(
        {"_id": user_id, "ad_credits": {"$gte": credits}},
        {"$inc": {"ad_credits": -credits}},
        projection={"ad_credits": 1},
        return_document=ReturnDocument.AFTER,
    )
    if user is None:
        current = await db.users.find_one({"_id": user_id}, {"ad_credits": 1}) or {}
        raise payment_required(f"This needs {credits} credits but your balance is {current.get('ad_credits', 0)}")
    await _ledger(user_id, kind, -credits, user["ad_credits"], note, ref_id, wallet="credits", **extra)
    return user["ad_credits"]


async def wallet(user: dict) -> dict:
    fresh = await db.users.find_one({"_id": user["_id"]}, {"ad_credits": 1, "ad_earnings_credits": 1}) or {}
    transactions = await db.credit_transactions.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(50)
    return {
        "credits": fresh.get("ad_credits", 0),
        "credit_value_inr": settings.credit_value_inr,
        "earnings_credits": fresh.get("ad_earnings_credits", 0),
        "transactions": [
            serialize({k: v for k, v in t.items() if k in ("_id", "type", "credits", "balance_after", "note", "ref_id", "created_at")})
            for t in transactions
        ],
    }


async def mark_order_paid(order_filter: dict, payment_id: str | None, via: str) -> tuple[dict | None, bool]:
    """Flip an order `created` → `paid` exactly once and credit the buyer. Returns (order, newly_paid)."""
    order = await db.ad_orders.find_one_and_update(
        {**order_filter, "status": "created"},
        {"$set": {"status": "paid", "paid_at": utcnow(), "razorpay_payment_id": payment_id, "paid_via": via}},
        return_document=ReturnDocument.AFTER,
    )
    if order is None:
        return await db.ad_orders.find_one(order_filter), False
    await add_credits(order["user_id"], order["credits"], "purchase", f"Bought the {order['pack_id']} pack", order["_id"])
    await fcm_service.notify_users(
        [order["user_id"]], "Ad credits added", f"{order['credits']} credits were added to your wallet.", {"type": "credits_purchased"}
    )
    return order, True


# ---------------------------------------------------------------------------------------------- creatives


async def owner_name_for(user: dict) -> str:
    if user["role"] == "business":
        business = await db.businesses.find_one({"user_id": user["_id"]}, {"business_name": 1})
        if business and business.get("business_name"):
            return business["business_name"]
    return user["name"]


def creative_out(creative: dict) -> dict:
    return serialize({k: v for k, v in creative.items() if k != "image_file"})


def creative_snapshot(creative: dict) -> dict:
    return {k: creative.get(k) for k in ("title", "tagline", "image_url", "url")}


async def usable_creative(creative_id: str | None, user: dict, field: str = "creative_id") -> dict:
    """The user's own approved creative (admins may use any approved creative)."""
    if not creative_id or not ObjectId.is_valid(creative_id):
        raise not_found("Creative")
    creative = await db.ad_creatives.find_one({"_id": ObjectId(creative_id)})
    if not creative or (creative["owner_id"] != user["_id"] and user["role"] != "admin"):
        raise not_found("Creative")
    if creative["status"] != "approved":
        raise conflict("This creative hasn't been approved by an admin yet", "CREATIVE_NOT_APPROVED")
    return creative


# ---------------------------------------------------------------------------------------------- campaigns


def campaign_out(campaign: dict) -> dict:
    out = serialize(campaign)
    out.setdefault("scans", 0)
    for kind in CAMPAIGN_TYPES:
        key = "poster" if kind == "ngo_poster" else kind
        out.setdefault(key, None)
    return out


async def complete_if_done(campaign: dict | None) -> None:
    if not campaign or campaign.get("status") != "active":
        return
    done = False
    if campaign["type"] == "packet":
        packet = campaign["packet"]
        done = packet["packets_applied"] >= packet["packets_requested"]
    elif campaign["type"] == "digital":
        digital = campaign["digital"]
        done = digital["impressions_served"] >= digital["impressions_purchased"]
    if done:
        updated = await db.ad_campaigns.find_one_and_update(
            {"_id": campaign["_id"], "status": "active"}, {"$set": {"status": "completed", "completed_at": utcnow()}}
        )
        if updated:
            await fcm_service.notify_users(
                [campaign["owner_id"]], "Campaign completed", f"Your {campaign['type'].replace('_', ' ')} campaign has finished.",
                {"type": "campaign_completed", "campaign_id": str(campaign["_id"])},
            )


async def refund(campaign: dict, credits: int, note: str) -> None:
    if credits > 0:
        await db.ad_campaigns.update_one({"_id": campaign["_id"]}, {"$inc": {"credits_refunded": credits}})
        await add_credits(campaign["owner_id"], credits, "refund", note, campaign["_id"], campaign_type=campaign["type"])


async def cancel_campaign(campaign: dict) -> dict:
    """Cancel an active campaign and refund whatever hasn't been used yet."""
    cancelled = await db.ad_campaigns.find_one_and_update(
        {"_id": campaign["_id"], "status": "active"},
        {"$set": {"status": "cancelled", "cancelled_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if cancelled is None:
        raise conflict("Only active campaigns can be cancelled", "NOT_CANCELLABLE")
    # The AFTER document is the exact state at the moment of cancellation; later releases refund themselves.
    if cancelled["type"] == "packet":
        packet = cancelled["packet"]
        credits = (packet["packets_requested"] - packet["packets_allocated"]) * cancelled["unit_credits"]
    elif cancelled["type"] == "digital":
        digital = cancelled["digital"]
        unserved = max(0, digital["impressions_purchased"] - digital["impressions_served"])
        credits = unserved * cancelled["credits_spent"] // digital["impressions_purchased"]
    else:
        credits = cancelled["credits_spent"] if cancelled["poster"]["booking_status"] == "requested" else 0
    await refund(cancelled, credits, "Campaign cancelled")
    return await db.ad_campaigns.find_one({"_id": campaign["_id"]})


# ---------------------------------------------------------------------------------------------- packet pool


def build_packaging(packet_count: int, creative: dict | None) -> dict:
    own = math.floor(packet_count * settings.ad_own_share) if creative and packet_count else 0
    return {
        **EMPTY_PACKAGING,
        "packet_count": packet_count,
        "own_ad": {"creative_id": creative["_id"], "title": creative["title"], "packets": own} if own else None,
        "sponsored_capacity": packet_count - own,
        "stickers_total": own,
    }


def own_packets(packaging: dict) -> int:
    return (packaging.get("own_ad") or {}).get("packets", 0)


async def _reserve(campaign: dict, wanted: int) -> int:
    """Optimistically reserve up to `wanted` packets of a campaign's remaining demand."""
    for _ in range(5):
        current = await db.ad_campaigns.find_one({"_id": campaign["_id"], "status": "active"})
        if current is None:
            return 0
        allocated = current["packet"]["packets_allocated"]
        take = min(wanted, current["packet"]["packets_requested"] - allocated)
        if take <= 0:
            return 0
        result = await db.ad_campaigns.update_one(
            {"_id": current["_id"], "status": "active", "packet.packets_allocated": allocated},
            {"$inc": {"packet.packets_allocated": take}},
        )
        if result.modified_count:
            return take
    return 0


async def release_packets(campaign_id: ObjectId, packets: int, note: str = "Unused packet stickers returned") -> None:
    """Return reserved packets to a campaign. If it was cancelled meanwhile, the packets are refunded."""
    if packets <= 0:
        return
    for _ in range(5):
        campaign = await db.ad_campaigns.find_one({"_id": campaign_id})
        if campaign is None:
            return
        if campaign["status"] == "cancelled":
            credits = packets * campaign.get("unit_credits", settings.packet_sticker_credits)
            result = await db.ad_campaigns.update_one(
                {"_id": campaign_id, "status": "cancelled"},
                {"$inc": {"packet.packets_allocated": -packets, "credits_refunded": credits}},
            )
            if result.modified_count:
                await add_credits(campaign["owner_id"], credits, "refund", note, campaign_id, campaign_type="packet")
                return
        else:
            result = await db.ad_campaigns.update_one(
                {"_id": campaign_id, "status": {"$ne": "cancelled"}}, {"$inc": {"packet.packets_allocated": -packets}}
            )
            if result.modified_count:
                return


def _target_matches(campaign: dict, pickup: dict | None) -> bool:
    target = (campaign.get("packet") or {}).get("target")
    if not target:
        return True
    if not has_coords(pickup):
        return False
    return distance_km(pickup, target) <= target["radius_km"]


async def fill_pool(donation_id: ObjectId) -> int:
    """Fill an accepted, not-yet-collected donation's sponsored pool from active packet campaigns, oldest first."""
    donation = await db.donations.find_one({"_id": donation_id, "status": "matched", "ngo_accepted": True})
    packaging = (donation or {}).get("packaging")
    if not packaging:
        return 0
    sponsored = [dict(entry) for entry in packaging.get("sponsored", [])]
    remaining = packaging.get("sponsored_capacity", 0) - sum(e["packets"] for e in sponsored)
    if remaining <= 0:
        return 0

    reserved: list[tuple[ObjectId, int]] = []
    async for campaign in db.ad_campaigns.find({"type": "packet", "status": "active"}).sort("created_at", 1):
        if remaining <= 0:
            break
        if not _target_matches(campaign, donation.get("pickup_location")):
            continue
        take = await _reserve(campaign, remaining)
        if not take:
            continue
        reserved.append((campaign["_id"], take))
        remaining -= take
        entry = next((e for e in sponsored if e["campaign_id"] == campaign["_id"]), None)
        if entry:
            entry["packets"] += take
        else:
            sponsored.append(
                {
                    "campaign_id": campaign["_id"],
                    "creative_id": campaign["creative_id"],
                    "owner_name": campaign["owner_name"],
                    "title": campaign["creative"]["title"],
                    "packets": take,
                }
            )
    if not reserved:
        return 0
    added = sum(n for _, n in reserved)
    result = await db.donations.update_one(
        {
            "_id": donation["_id"],
            "status": "matched",
            "ngo_accepted": True,
            "packaging.stickers_total": packaging["stickers_total"],
        },
        {"$set": {"packaging.sponsored": sponsored, "packaging.stickers_total": packaging["stickers_total"] + added}},
    )
    if not result.modified_count:  # cancelled, picked up or filled concurrently — give the packets back
        for campaign_id, packets in reserved:
            await release_packets(campaign_id, packets)
        return 0
    return added


async def release_donation_allocations(donation: dict | None) -> None:
    """Cancel/expiry/re-match before pickup: return the sponsored packets to their campaigns."""
    packaging = (donation or {}).get("packaging") or {}
    sponsored = packaging.get("sponsored") or []
    if not sponsored or packaging.get("stickers_applied"):
        return
    claimed = await db.donations.update_one(
        {"_id": donation["_id"], "packaging.stickers_total": packaging["stickers_total"], "packaging.stickers_applied": None},
        {"$set": {"packaging.sponsored": [], "packaging.stickers_total": own_packets(packaging)}},
    )
    if claimed.modified_count:
        for entry in sponsored:
            await release_packets(entry["campaign_id"], entry["packets"])


def sticker_changes(packaging: dict, count: int, volunteer_id: ObjectId, now) -> dict:
    """Distribute the applied sticker count: sponsored first (allocation order), then the donor's own."""
    remaining = count
    sponsored = []
    for entry in packaging.get("sponsored", []):
        applied = min(entry["packets"], remaining)
        remaining -= applied
        sponsored.append({**entry, "applied": applied})
    own_applied = min(own_packets(packaging), remaining)
    return {
        "packaging.sponsored": sponsored,
        "packaging.sponsored_applied": sum(e["applied"] for e in sponsored),
        "packaging.own_applied": own_applied,
        "packaging.stickers_applied": {"count": count, "applied_at": now, "volunteer_id": volunteer_id},
    }


async def settle_stickers(packaging: dict) -> None:
    """After pickup: count applied packets on each campaign and release the shortfall."""
    for entry in packaging.get("sponsored", []):
        applied = entry.get("applied", 0)
        if applied:
            campaign = await db.ad_campaigns.find_one_and_update(
                {"_id": entry["campaign_id"]}, {"$inc": {"packet.packets_applied": applied}}, return_document=ReturnDocument.AFTER
            )
        shortfall = entry["packets"] - applied
        if shortfall > 0:
            await release_packets(entry["campaign_id"], shortfall, "Stickers not applied at pickup")
        if applied:
            await complete_if_done(campaign)


async def credit_ngo_for_delivery(donation: dict) -> int:
    packaging = donation.get("packaging") or {}
    earned = share_of(packaging.get("sponsored_applied", 0) * settings.packet_sticker_credits, settings.ngo_revenue_share)
    if earned and donation.get("matched_ngo_user_id"):
        await add_credits(
            donation["matched_ngo_user_id"], earned, "earning", "Sponsored packets delivered", donation["_id"], earnings=True, source="packet"
        )
        await db.donations.update_one({"_id": donation["_id"]}, {"$set": {"packaging.ngo_earned_credits": earned}})
    return earned


async def retry_pool_fills(now) -> int:
    """Dispatcher hook: accepted donations that still have unfilled sponsored capacity."""
    donations = await db.donations.find(
        {"status": "matched", "ngo_accepted": True, "earliest_expiry": {"$gt": now}, "packaging.sponsored_capacity": {"$gt": 0}},
        {"_id": 1},
    ).to_list(None)
    filled = 0
    for donation in donations:
        filled += await fill_pool(donation["_id"])
    return filled


async def complete_finished_posters(now) -> int:
    result = await db.ad_campaigns.update_many(
        {"type": "ngo_poster", "status": "active", "poster.booking_status": "displayed", "poster.ends_at": {"$lte": now}},
        {"$set": {"status": "completed", "completed_at": now}},
    )
    return result.modified_count


# ---------------------------------------------------------------------------------------------- NGO posters


async def display_poster(campaign_id: str, ngo: dict) -> dict:
    campaign = await db.ad_campaigns.find_one({"_id": to_object_id(campaign_id, "Booking"), "type": "ngo_poster", "poster.ngo_id": ngo["_id"]})
    if not campaign:
        raise not_found("Booking")
    now = utcnow()
    updated = await db.ad_campaigns.find_one_and_update(
        {"_id": campaign["_id"], "status": "active", "poster.booking_status": "requested"},
        {
            "$set": {
                "poster.booking_status": "displayed",
                "poster.starts_at": now,
                "poster.ends_at": now + timedelta(weeks=campaign["poster"]["weeks"]),
                "poster.displayed_at": now,
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise conflict("This booking is no longer waiting to be displayed", "INVALID_BOOKING_STATE")
    earned = share_of(updated["credits_spent"], settings.ngo_revenue_share)
    await add_credits(ngo["user_id"], earned, "earning", f"Poster displayed: {updated['creative']['title']}", updated["_id"], earnings=True, source="poster")
    await db.ad_campaigns.update_one({"_id": updated["_id"]}, {"$set": {"poster.ngo_earned_credits": earned}})
    await fcm_service.notify_users(
        [updated["owner_id"]], "Your poster is up",
        f"{updated['poster']['ngo_name']} is now displaying your poster for {updated['poster']['weeks']} week(s).",
        {"type": "poster_displayed", "campaign_id": str(updated["_id"])},
    )
    return await db.ad_campaigns.find_one({"_id": updated["_id"]})


async def decline_poster(campaign: dict, reason: str = "The NGO declined the booking") -> dict | None:
    updated = await db.ad_campaigns.find_one_and_update(
        {"_id": campaign["_id"], "status": "active", "poster.booking_status": "requested"},
        {"$set": {"status": "rejected", "poster.booking_status": "declined", "rejected_at": utcnow()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        return None
    await refund(updated, updated["credits_spent"], reason)
    await fcm_service.notify_users(
        [updated["owner_id"]], "Poster booking declined",
        f"{updated['poster']['ngo_name']} declined your poster booking. {updated['credits_spent']} credits were refunded.",
        {"type": "poster_declined", "campaign_id": str(updated["_id"])},
    )
    return await db.ad_campaigns.find_one({"_id": updated["_id"]})


# ---------------------------------------------------------------------------------------------- digital


async def digital_ads(slot: str) -> list[dict]:
    """Active digital campaigns with approved creatives, shaped like house ads for the selector."""
    campaigns = await db.ad_campaigns.find({"type": "digital", "status": "active"}).to_list(None)
    campaigns = [c for c in campaigns if c["digital"]["impressions_served"] < c["digital"]["impressions_purchased"]]
    if not campaigns:
        return []
    creatives = {
        c["_id"]: c async for c in db.ad_creatives.find({"_id": {"$in": [c["creative_id"] for c in campaigns]}, "status": "approved"})
    }
    ads = []
    for campaign in campaigns:
        creative = creatives.get(campaign["creative_id"])
        if not creative:
            continue
        ads.append(
            {
                "_id": f"{DIGITAL_AD_PREFIX}{campaign['_id']}",
                "title": creative["title"],
                "body": creative.get("tagline") or "",
                "image_url": creative.get("image_url"),
                "cta": "Learn more",
                "url": creative.get("url") or settings.frontend_url,
                "sponsor": campaign["owner_name"],
                "category": "sponsored",
                "slots": [slot],
                "target_roles": [],
                "dayparts": [],
                "location": None,
                "weight": DIGITAL_AD_WEIGHT,
                "is_paid": True,
            }
        )
    return ads


async def digital_campaign_for_ad(ad_id: str) -> dict | None:
    campaign_id = ad_id[len(DIGITAL_AD_PREFIX):]
    if not ObjectId.is_valid(campaign_id):
        return None
    return await db.ad_campaigns.find_one({"_id": ObjectId(campaign_id), "type": "digital"})


async def record_digital_impression(campaign: dict) -> None:
    purchased = campaign["digital"]["impressions_purchased"]
    updated = await db.ad_campaigns.find_one_and_update(
        {"_id": campaign["_id"], "status": "active", "digital.impressions_served": {"$lt": purchased}},
        {"$inc": {"digital.impressions_served": 1}},
        return_document=ReturnDocument.AFTER,
    )
    await complete_if_done(updated)


async def record_digital_click(campaign: dict) -> None:
    await db.ad_campaigns.update_one({"_id": campaign["_id"]}, {"$inc": {"digital.clicks": 1}})


# ---------------------------------------------------------------------------------------------- account removal


async def remove_ngo_ad_spaces(ngo: dict) -> None:
    async for campaign in db.ad_campaigns.find({"type": "ngo_poster", "status": "active", "poster.ngo_id": ngo["_id"]}):
        await decline_poster(campaign, "The NGO left the platform")
    await db.ad_spaces.delete_many({"ngo_id": ngo["_id"]})


async def remove_advertiser(user: dict) -> None:
    """A deleted advertiser's live campaigns stop; their creatives and images are removed."""
    await db.ad_campaigns.update_many(
        {"owner_id": user["_id"], "status": "active"}, {"$set": {"status": "cancelled", "cancelled_at": utcnow()}}
    )
    async for creative in db.ad_creatives.find({"owner_id": user["_id"]}):
        if creative.get("image_file"):
            (creatives_dir() / creative["image_file"]).unlink(missing_ok=True)
    await db.ad_creatives.delete_many({"owner_id": user["_id"]})
