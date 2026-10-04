"""Ad-Tech: contextual ad serving, impression/click logging and Verified Partner listings."""
from fastapi import APIRouter, Depends, Query

from errors import not_found
from models.analytics import AdEvent, AdSlot
from services import ad_market_service
from services.ads_service import choose_ad
from services.auth_service import get_optional_user, require_roles
from services.db_service import db, utcnow

router = APIRouter(prefix="/api/ads", tags=["ads"])


@router.get("/")
async def serve_ad(
    slot: AdSlot = "rectangle",
    page: str = Query("", max_length=100),
    user: dict | None = Depends(get_optional_user),
):
    return {"ad": await choose_ad(slot, user)}


async def log_event(kind: str, body: AdEvent, user: dict | None) -> dict:
    collection = db.ad_impressions if kind == "impression" else db.ad_clicks
    if body.ad_id.startswith(ad_market_service.DIGITAL_AD_PREFIX):
        campaign = await ad_market_service.digital_campaign_for_ad(body.ad_id)
        if not campaign:
            raise not_found("Ad")
        if kind == "impression":
            await ad_market_service.record_digital_impression(campaign)
        else:
            await ad_market_service.record_digital_click(campaign)
    elif not await db.ads.find_one({"_id": body.ad_id}, {"_id": 1}):
        raise not_found("Ad")
    await collection.insert_one(
        {
            "ad_id": body.ad_id,
            "slot": body.slot,
            "page": body.page,
            "user_role": user["role"] if user else "anonymous",
            "user_id": user["_id"] if user else None,
            "timestamp": utcnow(),
        }
    )
    return {"ok": True}


@router.post("/impression")
async def impression(body: AdEvent, user: dict | None = Depends(get_optional_user)):
    return await log_event("impression", body, user)


@router.post("/click")
async def click(body: AdEvent, user: dict | None = Depends(get_optional_user)):
    return await log_event("click", body, user)


@router.get("/partners")
async def partners():
    """Verified premium partners, shown with a "Verified Partner" badge on their profiles."""
    users = await db.users.find(
        {"is_premium_partner": True, "is_verified": True, "is_suspended": {"$ne": True}}, {"name": 1, "role": 1}
    ).to_list(None)
    ngo_names = {
        n["user_id"]: n["organization_name"]
        async for n in db.ngos.find({"user_id": {"$in": [u["_id"] for u in users]}}, {"user_id": 1, "organization_name": 1})
    }
    return [
        {"user_id": str(u["_id"]), "name": ngo_names.get(u["_id"], u["name"]), "role": u["role"], "badge": "Verified Partner"}
        for u in users
    ]


@router.get("/stats")
async def ad_stats(_: dict = Depends(require_roles("admin"))):
    """Impressions, clicks and CTR per ad (and per role)."""
    pipeline = [{"$group": {"_id": {"ad_id": "$ad_id", "role": "$user_role"}, "count": {"$sum": 1}}}]
    impressions = await db.ad_impressions.aggregate(pipeline).to_list(None)
    clicks = await db.ad_clicks.aggregate(pipeline).to_list(None)
    ads = {a["_id"]: a async for a in db.ads.find({}, {"title": 1, "sponsor": 1})}
    stats: dict = {}
    for kind, rows in (("impressions", impressions), ("clicks", clicks)):
        for row in rows:
            ad_id, role = row["_id"]["ad_id"], row["_id"]["role"]
            entry = stats.setdefault(ad_id, {"impressions": 0, "clicks": 0, "by_role": {}})
            entry[kind] += row["count"]
            entry["by_role"].setdefault(role, {"impressions": 0, "clicks": 0})[kind] += row["count"]
    return sorted(
        (
            {
                "ad_id": ad_id,
                "title": ads.get(ad_id, {}).get("title"),
                "sponsor": ads.get(ad_id, {}).get("sponsor"),
                **entry,
                "ctr_pct": round(100 * entry["clicks"] / entry["impressions"], 2) if entry["impressions"] else 0.0,
            }
            for ad_id, entry in stats.items()
        ),
        key=lambda r: -r["impressions"],
    )
