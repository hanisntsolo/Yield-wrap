"""Background dispatch loop: expiry handling, auto-matching, volunteer allocation and analytics roll-ups."""
import asyncio
import logging
from datetime import timedelta

from ai_engine.matching import match_donation
from ai_engine.priority_engine import rank_donations
from ai_engine.volunteer_allocator import allocate_volunteer
from config import settings
from errors import APIError
from services import ad_market_service, fcm_service
from services.analytics_service import local_today, rollup_day
from services.db_service import db, utcnow
from services.donation_service import close_donation, stakeholders

logger = logging.getLogger("yieldwrap.scheduler")


async def expire_donations(now) -> int:
    """Food that expired before pickup is marked `expired` (and counted as wasted)."""
    expired = 0
    async for donation in db.donations.find({"status": {"$in": ["pending", "matched"]}, "earliest_expiry": {"$lte": now}}):
        if await close_donation(donation, "expired"):
            expired += 1
            await fcm_service.notify_users(
                stakeholders(donation),
                "Donation expired",
                f"The donation from {donation.get('donor_name', 'a donor')} expired before pickup.",
                {"type": "donation_expired", "donation_id": str(donation["_id"])},
            )
    return expired


async def warn_expiring(now) -> int:
    soon = now + timedelta(hours=settings.expiring_soon_hours)
    query = {
        "status": {"$in": ["pending", "matched"]},
        "earliest_expiry": {"$gt": now, "$lte": soon},
        "expiry_notified": {"$ne": True},
    }
    warned = 0
    async for donation in db.donations.find(query):
        await db.donations.update_one({"_id": donation["_id"]}, {"$set": {"expiry_notified": True}})
        minutes = int((donation["earliest_expiry"] - now).total_seconds() // 60)
        title, body = "Donation expiring soon", f"{donation.get('total_kg', 0):g} kg from {donation.get('donor_name', 'a donor')} expires in {minutes} min."
        data = {"type": "donation_expiring", "donation_id": str(donation["_id"])}
        await fcm_service.notify_users([donation["donor_id"]], title, body, data)
        await fcm_service.notify_admins(title, body, data)
        warned += 1
    return warned


async def auto_match(now) -> int:
    """Match new/stale pending donations and pass unanswered offers on to the next NGO, by priority."""
    rematch_before = now - timedelta(minutes=settings.rematch_interval_minutes)
    offer_timeout = now - timedelta(minutes=settings.offer_timeout_minutes)
    pending = await db.donations.find(
        {
            "status": "pending",
            "earliest_expiry": {"$gt": now},
            "$or": [{"last_match_attempt": None}, {"last_match_attempt": {"$lte": rematch_before}}],
        }
    ).to_list(None)
    stale_offers = await db.donations.find(
        {"status": "matched", "ngo_accepted": False, "offered_at": {"$lte": offer_timeout}, "earliest_expiry": {"$gt": now}}
    ).to_list(None)
    for donation in stale_offers:
        await db.donations.update_one({"_id": donation["_id"]}, {"$addToSet": {"declined_ngo_ids": donation["matched_ngo_id"]}})

    matched = 0
    for donation in rank_donations(pending + stale_offers, now):
        try:
            result = await match_donation(donation["_id"])
            matched += bool(result["matches"])
        except APIError:
            continue
    return matched


async def allocate_waiting(now) -> int:
    waiting = await db.donations.find(
        {"status": "matched", "ngo_accepted": True, "assigned_volunteer_id": None, "earliest_expiry": {"$gt": now}}
    ).to_list(None)
    allocated = 0
    for donation in rank_donations(waiting, now):
        allocated += bool(await allocate_volunteer(donation["_id"]))
    # Accepted donations whose sponsored sticker pool isn't full yet get another chance at new campaigns.
    await ad_market_service.retry_pool_fills(now)
    await ad_market_service.complete_finished_posters(now)
    return allocated


async def run_cycle() -> dict:
    now = utcnow()
    today = local_today()
    summary = {
        "expired": await expire_donations(now),
        "warned": await warn_expiring(now),
        "matched": await auto_match(now),
        "allocated": await allocate_waiting(now),
    }
    for day in (today - timedelta(days=1), today):
        await rollup_day(day)
    return summary


async def scheduler_loop() -> None:
    while True:
        try:
            summary = await run_cycle()
            if any(summary.values()):
                logger.info("Dispatch cycle: %s", summary)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - keep the loop alive
            logger.exception("Dispatch cycle failed")
        await asyncio.sleep(settings.scheduler_interval_seconds)
