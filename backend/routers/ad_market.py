"""Packaging ad-tech marketplace: pricing, wallet, Razorpay orders, creatives, campaigns, stickers and QR scans."""
import asyncio
import json
import logging
import re
import uuid
from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import ValidationError

from ai_engine.geo import distance_km
from config import settings
from errors import APIError, bad_request, conflict, forbidden, not_found
from models.ad_market import CampaignCreate, CreativeFields, OrderCreate, PaymentVerify
from models.common import ADVERTISER_ROLES
from services import ad_market_service, fcm_service, razorpay_service
from services.ad_market_service import CREDIT_PACKS, PACKS_BY_ID, campaign_out, creative_out, creatives_dir
from services.auth_service import get_current_user, get_optional_user, require_roles
from services.db_service import db, to_object_id, utcnow

logger = logging.getLogger("yieldwrap.ad_market")
router = APIRouter(prefix="/api/ads", tags=["ad-market"])
advertiser = require_roles(*ADVERTISER_ROLES)

IMAGE_TYPES = {b"\x89PNG": "png", b"\xff\xd8\xff": "jpg"}
IMAGE_MEDIA_TYPES = {"png": "image/png", "jpg": "image/jpeg"}
IMAGE_NAME = re.compile(r"^[a-f0-9]{32}\.(png|jpg)$")
CREATIVE_STATUS_PATTERN = r"^(pending|approved|rejected)$"


def payments_unavailable() -> APIError:
    return APIError(503, "Payments are not available right now. Please try again later.", "PAYMENTS_UNAVAILABLE")


def verification_failed() -> APIError:
    return bad_request("The payment could not be verified", "PAYMENT_VERIFICATION_FAILED")


# ---------------------------------------------------------------------------------------------- pricing & wallet


@router.get("/pricing")
async def pricing():
    provider = razorpay_service.provider()
    return {
        "credit_value_inr": settings.credit_value_inr,
        "own_share": settings.ad_own_share,
        "ngo_revenue_share": settings.ngo_revenue_share,
        "costs": {
            "packet_sticker": settings.packet_sticker_credits,
            "ngo_poster_week_default": settings.ngo_poster_week_default,
            "digital_per_1000": settings.digital_credits_per_1000,
        },
        "packs": CREDIT_PACKS,
        "payments": {
            "provider": provider or "razorpay",
            "key_id": settings.razorpay_key_id if provider == "razorpay" else None,
        },
    }


@router.get("/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    return await ad_market_service.wallet(user)


@router.post("/orders", status_code=201)
async def create_order(body: OrderCreate, user: dict = Depends(advertiser)):
    provider = razorpay_service.provider()
    if provider is None:
        raise payments_unavailable()
    pack = PACKS_BY_ID[body.pack_id]
    amount_paise = pack["price_inr"] * 100
    order = {
        "_id": ObjectId(),
        "user_id": user["_id"],
        "pack_id": pack["id"],
        "credits": pack["credits"],
        "amount_paise": amount_paise,
        "currency": "INR",
        "provider": provider,
        "razorpay_order_id": None,
        "razorpay_payment_id": None,
        "status": "created",
        "created_at": utcnow(),
    }
    await db.ad_orders.insert_one(order)
    if provider == "razorpay":
        try:
            remote = await razorpay_service.create_order(
                amount_paise, str(order["_id"]), {"order_id": str(order["_id"]), "user_id": str(user["_id"]), "pack_id": pack["id"]}
            )
        except razorpay_service.PaymentsUnavailable:
            await db.ad_orders.update_one({"_id": order["_id"]}, {"$set": {"status": "failed"}})
            raise payments_unavailable() from None
        order["razorpay_order_id"] = remote["id"]
        await db.ad_orders.update_one({"_id": order["_id"]}, {"$set": {"razorpay_order_id": remote["id"]}})
    return {
        "order_id": str(order["_id"]),
        "provider": provider,
        "razorpay_order_id": order["razorpay_order_id"],
        "key_id": settings.razorpay_key_id if provider == "razorpay" else None,
        "amount_paise": amount_paise,
        "currency": "INR",
        "credits": pack["credits"],
        "name": "YIELD WRAP",
        "description": f"{pack['credits']} ad credits ({pack['id']} pack)",
        "prefill": {"name": user.get("name", ""), "email": user.get("email", ""), "contact": user.get("phone", "")},
    }


@router.post("/orders/{order_id}/verify")
async def verify_order(order_id: str, body: PaymentVerify | None = None, user: dict = Depends(advertiser)):
    body = body or PaymentVerify()
    order = await db.ad_orders.find_one({"_id": to_object_id(order_id, "Order"), "user_id": user["_id"]})
    if not order:
        raise not_found("Order")
    if order["status"] == "created":
        if order["provider"] == "simulated":
            if settings.is_production:
                raise verification_failed()
            order, _ = await ad_market_service.mark_order_paid({"_id": order["_id"]}, None, "simulated")
        else:
            if not (
                body.razorpay_order_id
                and body.razorpay_payment_id
                and body.razorpay_order_id == order.get("razorpay_order_id")
                and razorpay_service.verify_payment_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature or "")
            ):
                raise verification_failed()
            order, _ = await ad_market_service.mark_order_paid({"_id": order["_id"]}, body.razorpay_payment_id, "verify")
    if not order or order["status"] != "paid":
        raise conflict("This order can't be paid any more", "ORDER_NOT_PAYABLE")
    fresh = await db.users.find_one({"_id": user["_id"]}, {"ad_credits": 1}) or {}
    return {
        "order": {"id": str(order["_id"]), "status": order["status"], "credits": order["credits"]},
        "wallet": {"credits": fresh.get("ad_credits", 0)},
    }


@router.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    """Server-to-server confirmation. The same `created → paid` transition as /verify keeps it idempotent."""
    if not settings.razorpay_webhook_secret:
        raise payments_unavailable()
    raw = await request.body()
    if not razorpay_service.verify_webhook_signature(raw, request.headers.get("X-Razorpay-Signature")):
        raise verification_failed()
    try:
        event = json.loads(raw)
    except ValueError:
        raise bad_request("Invalid webhook payload") from None
    if not isinstance(event, dict) or event.get("event") not in ("payment.captured", "order.paid"):
        return {"ok": True}
    payload = event.get("payload") or {}
    payment = ((payload.get("payment") or {}).get("entity")) or {}
    remote_order = ((payload.get("order") or {}).get("entity")) or {}
    razorpay_order_id = payment.get("order_id") or remote_order.get("id")
    if not razorpay_order_id:
        return {"ok": True}
    order = await db.ad_orders.find_one({"razorpay_order_id": razorpay_order_id, "provider": "razorpay"})
    if not order:
        logger.warning("Webhook for unknown Razorpay order %s", razorpay_order_id)
        return {"ok": True}
    amount = payment.get("amount") if payment else remote_order.get("amount_paid")
    if amount is not None and amount != order["amount_paise"]:
        logger.warning("Webhook amount %s doesn't match order %s (%s)", amount, order["_id"], order["amount_paise"])
        return {"ok": True}
    await ad_market_service.mark_order_paid({"_id": order["_id"]}, payment.get("id"), "webhook")
    return {"ok": True}


# ---------------------------------------------------------------------------------------------- creatives


@router.get("/creatives")
async def list_creatives(status: str | None = Query(None, pattern=CREATIVE_STATUS_PATTERN), user: dict = Depends(advertiser)):
    query: dict = {} if user["role"] == "admin" else {"owner_id": user["_id"]}
    if status:
        query["status"] = status
    creatives = await db.ad_creatives.find(query).sort("created_at", -1).to_list(500)
    return [creative_out(c) for c in creatives]


@router.post("/creatives", status_code=201)
async def create_creative(
    title: str = Form(..., max_length=200),
    tagline: str = Form("", max_length=500),
    url: str = Form("", max_length=600),
    image: UploadFile | None = File(None),
    user: dict = Depends(advertiser),
):
    try:
        fields = CreativeFields(title=title, tagline=tagline, url=url)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from None

    image_file = None
    if image is not None and image.filename:
        max_bytes = settings.max_upload_mb * 1024 * 1024
        content = await image.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise APIError(413, f"Image must be {settings.max_upload_mb} MB or smaller", "FILE_TOO_LARGE")
        extension = next((ext for magic, ext in IMAGE_TYPES.items() if content.startswith(magic)), None)
        if extension is None:
            raise APIError(415, "Upload a PNG or JPG image", "UNSUPPORTED_FILE_TYPE")
        directory = creatives_dir()
        directory.mkdir(parents=True, exist_ok=True)
        image_file = f"{uuid.uuid4().hex}.{extension}"
        await asyncio.to_thread((directory / image_file).write_bytes, content)

    creative_id = ObjectId()
    creative = {
        "_id": creative_id,
        "owner_id": user["_id"],
        "owner_name": await ad_market_service.owner_name_for(user),
        "title": fields.title,
        "tagline": fields.tagline,
        "url": fields.url,
        "image_file": image_file,
        "image_url": f"/api/ads/creatives/{creative_id}/image" if image_file else None,
        "status": "pending",
        "rejection_reason": None,
        "created_at": utcnow(),
        "reviewed_at": None,
    }
    await db.ad_creatives.insert_one(creative)
    await fcm_service.notify_admins(
        "Ad creative to review", f"{creative['owner_name']} submitted \"{creative['title']}\".",
        {"type": "creative_submitted", "creative_id": str(creative_id)},
    )
    return creative_out(creative)


@router.delete("/creatives/{creative_id}")
async def delete_creative(creative_id: str, user: dict = Depends(advertiser)):
    creative = await db.ad_creatives.find_one({"_id": to_object_id(creative_id, "Creative")})
    if not creative or (creative["owner_id"] != user["_id"] and user["role"] != "admin"):
        raise not_found("Creative")
    in_campaign = await db.ad_campaigns.find_one({"creative_id": creative["_id"], "status": "active"}, {"_id": 1})
    on_packaging = await db.donations.find_one(
        {"packaging.own_ad.creative_id": creative["_id"], "status": {"$in": ["pending", "matched"]}}, {"_id": 1}
    )
    if in_campaign or on_packaging:
        raise conflict("This creative is used by an active campaign or donation", "CREATIVE_IN_USE")
    await db.ad_creatives.delete_one({"_id": creative["_id"]})
    if creative.get("image_file") and IMAGE_NAME.match(creative["image_file"]):
        (creatives_dir() / creative["image_file"]).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/creatives/{creative_id}/image")
async def creative_image(creative_id: str, user: dict | None = Depends(get_optional_user)):
    creative = await db.ad_creatives.find_one({"_id": to_object_id(creative_id, "Creative")})
    allowed = creative and (
        creative["status"] == "approved" or (user and (user["role"] == "admin" or user["_id"] == creative["owner_id"]))
    )
    match = IMAGE_NAME.match((creative or {}).get("image_file") or "")
    if not allowed or not match:
        raise not_found("Image")
    path = creatives_dir() / creative["image_file"]
    if not path.is_file():
        raise not_found("Image")
    return FileResponse(path, media_type=IMAGE_MEDIA_TYPES[match.group(1)])


# ---------------------------------------------------------------------------------------------- campaigns


@router.get("/campaigns")
async def list_campaigns(user: dict = Depends(advertiser)):
    query = {} if user["role"] == "admin" else {"owner_id": user["_id"]}
    campaigns = await db.ad_campaigns.find(query).sort("created_at", -1).to_list(500)
    return [campaign_out(c) for c in campaigns]


@router.post("/campaigns", status_code=201)
async def create_campaign(body: CampaignCreate, user: dict = Depends(advertiser)):
    creative = await ad_market_service.usable_creative(body.creative_id, user)
    campaign_id = ObjectId()
    campaign = {
        "_id": campaign_id,
        "owner_id": user["_id"],
        "owner_name": await ad_market_service.owner_name_for(user),
        "creative_id": creative["_id"],
        "creative": ad_market_service.creative_snapshot(creative),
        "type": body.type,
        "status": "active",
        "credits_refunded": 0,
        "created_at": utcnow(),
        "packet": None,
        "poster": None,
        "digital": None,
        "scans": 0,
    }
    space = None
    if body.type == "packet":
        cost = body.packets * settings.packet_sticker_credits
        campaign["unit_credits"] = settings.packet_sticker_credits
        campaign["packet"] = {
            "packets_requested": body.packets,
            "packets_allocated": 0,
            "packets_applied": 0,
            "target": body.target.model_dump() if body.target else None,
        }
        note = f"Packet stickers × {body.packets}"
    elif body.type == "ngo_poster":
        space = await db.ad_spaces.find_one({"_id": to_object_id(body.ad_space_id, "Ad space"), "active": True})
        if not space:
            raise not_found("Ad space")
        ngo = await db.ngos.find_one({"_id": space["ngo_id"]})
        if not ngo or not ngo.get("is_verified") or not ngo.get("is_active", True):
            raise conflict("This ad space can't be booked right now", "SPACE_UNAVAILABLE")
        cost = body.weeks * space["credits_per_week"]
        campaign["poster"] = {
            "ad_space_id": space["_id"],
            "ngo_id": space["ngo_id"],
            "ngo_name": space["ngo_name"],
            "space_name": space["name"],
            "weeks": body.weeks,
            "starts_at": None,
            "ends_at": None,
            "booking_status": "requested",
        }
        note = f"Poster at {space['ngo_name']} × {body.weeks} week(s)"
    else:
        cost = body.impressions // 1000 * settings.digital_credits_per_1000
        campaign["digital"] = {"impressions_purchased": body.impressions, "impressions_served": 0, "clicks": 0}
        note = f"Digital ads × {body.impressions} impressions"
    campaign["credits_spent"] = cost

    await ad_market_service.debit_credits(user["_id"], cost, "spend", note, campaign_id, campaign_type=body.type)
    try:
        await db.ad_campaigns.insert_one(campaign)
    except Exception:
        await ad_market_service.add_credits(user["_id"], cost, "refund", "Campaign could not be created", campaign_id)
        raise
    if space:
        await fcm_service.notify_users(
            [space["ngo_user_id"]], "New poster booking",
            f"{campaign['owner_name']} booked \"{space['name']}\" for {body.weeks} week(s). Confirm once the poster is up.",
            {"type": "poster_booked", "campaign_id": str(campaign_id)},
        )
    return campaign_out(campaign)


@router.post("/campaigns/{campaign_id}/cancel")
async def cancel_campaign(campaign_id: str, user: dict = Depends(advertiser)):
    campaign = await db.ad_campaigns.find_one({"_id": to_object_id(campaign_id, "Campaign")})
    if not campaign or (campaign["owner_id"] != user["_id"] and user["role"] != "admin"):
        raise not_found("Campaign")
    return campaign_out(await ad_market_service.cancel_campaign(campaign))


@router.get("/inventory")
async def inventory(_: dict = Depends(get_current_user)):
    open_pool = 0
    async for donation in db.donations.find(
        {"status": {"$in": ["pending", "matched"]}, "packaging.sponsored_capacity": {"$gt": 0}}, {"packaging": 1}
    ):
        packaging = donation["packaging"]
        open_pool += max(0, packaging["sponsored_capacity"] - sum(e["packets"] for e in packaging.get("sponsored", [])))
    since = utcnow() - timedelta(days=30)
    stickered = 0
    async for donation in db.donations.find({"packaging.stickers_applied.applied_at": {"$gte": since}}, {"packaging": 1}):
        stickered += donation["packaging"]["stickers_applied"]["count"]
    campaigns = await db.ad_campaigns.find({"type": "packet", "status": "active"}, {"packet": 1}).to_list(None)
    return {
        "open_pool_packets": open_pool,
        "packets_stickered_30d": stickered,
        "active_packet_campaigns": len(campaigns),
        "pending_packet_demand": sum(c["packet"]["packets_requested"] - c["packet"]["packets_allocated"] for c in campaigns),
    }


@router.get("/spaces")
async def list_spaces(
    lat: float | None = Query(None, ge=-90, le=90),
    lng: float | None = Query(None, ge=-180, le=180),
    radius_km: float | None = Query(None, gt=0, le=1000),
    _: dict = Depends(get_current_user),
):
    spaces = await db.ad_spaces.find({"active": True}).to_list(None)
    ngos = {n["_id"]: n async for n in db.ngos.find({"_id": {"$in": [s["ngo_id"] for s in spaces]}}, {"is_verified": 1, "is_active": 1})}
    origin = {"lat": lat, "lng": lng} if lat is not None and lng is not None else None
    results = []
    for space in spaces:
        ngo = ngos.get(space["ngo_id"])
        if not ngo or not ngo.get("is_active", True):
            continue
        distance = distance_km(origin, space.get("location")) if origin else None
        if radius_km is not None and origin and (distance is None or distance > radius_km):
            continue
        results.append(
            {
                "id": str(space["_id"]),
                "ngo_id": str(space["ngo_id"]),
                "ngo_name": space["ngo_name"],
                "name": space["name"],
                "description": space.get("description", ""),
                "size": space.get("size", ""),
                "credits_per_week": space["credits_per_week"],
                "location": space.get("location"),
                "distance_km": round(distance, 2) if distance is not None else None,
                "is_verified": bool(ngo.get("is_verified")),
            }
        )
    results.sort(key=lambda s: (s["distance_km"] is None, s["distance_km"] or 0, s["credits_per_week"]))
    return results


# ---------------------------------------------------------------------------------------------- stickers & scans


def _creative_view(creative: dict | None, fallback_id, fallback_title: str) -> dict:
    if creative:
        return {k: creative.get(k) for k in ("title", "tagline", "image_url", "url")} | {"id": str(creative["_id"])}
    return {"id": str(fallback_id), "title": fallback_title, "tagline": "", "image_url": None, "url": None}


@router.get("/stickers/{donation_id}")
async def sticker_sheet(donation_id: str, request: Request, user: dict = Depends(get_current_user)):
    donation = await db.donations.find_one({"_id": to_object_id(donation_id, "Donation")})
    if not donation:
        raise not_found("Donation")
    allowed = (
        user["role"] == "admin"
        or donation.get("donor_id") == user["_id"]
        or (donation.get("ngo_accepted") and donation.get("matched_ngo_user_id") == user["_id"])
        or donation.get("assigned_volunteer_user_id") == user["_id"]
    )
    if not allowed:
        raise forbidden("Only the donor, the receiving NGO and the assigned volunteer can see this sticker sheet")

    packaging = donation.get("packaging") or ad_market_service.EMPTY_PACKAGING
    sponsored = packaging.get("sponsored", [])
    own = packaging.get("own_ad")
    ids = [e["creative_id"] for e in sponsored] + ([own["creative_id"]] if own else [])
    creatives = {c["_id"]: c async for c in db.ad_creatives.find({"_id": {"$in": ids}})}
    base = str(request.base_url).rstrip("/")

    def qr(creative_id) -> str:
        return f"{base}/api/ads/s/{creative_id}?d={donation['_id']}"

    stickers = [
        {
            "kind": "sponsored",
            "campaign_id": str(e["campaign_id"]),
            "owner_name": e.get("owner_name"),
            "creative": _creative_view(creatives.get(e["creative_id"]), e["creative_id"], e.get("title", "")),
            "count": e["packets"],
            "qr_url": qr(e["creative_id"]),
        }
        for e in sponsored
        if e["packets"]
    ]
    if own and own.get("packets"):
        stickers.append(
            {
                "kind": "own",
                "campaign_id": None,
                "owner_name": donation.get("donor_name"),
                "creative": _creative_view(creatives.get(own["creative_id"]), own["creative_id"], own.get("title", "")),
                "count": own["packets"],
                "qr_url": qr(own["creative_id"]),
            }
        )
    return {
        "donation_id": str(donation["_id"]),
        "donor_name": donation.get("donor_name"),
        "packet_count": packaging.get("packet_count", 0),
        "stickers": stickers,
    }


@router.get("/s/{creative_id}")
async def qr_scan(creative_id: str, request: Request, d: str | None = Query(None, max_length=64)):
    creative = await db.ad_creatives.find_one({"_id": to_object_id(creative_id, "Creative")})
    if not creative:
        raise not_found("Creative")
    donation_id = ObjectId(d) if d and ObjectId.is_valid(d) else None
    campaign_id = None
    if donation_id:
        donation = await db.donations.find_one({"_id": donation_id}, {"packaging": 1})
        if donation is None:
            donation_id = None
        else:
            entry = next(
                (e for e in (donation.get("packaging") or {}).get("sponsored", []) if e["creative_id"] == creative["_id"]), None
            )
            campaign_id = entry["campaign_id"] if entry else None
    if campaign_id is None and donation_id is None:
        poster = await db.ad_campaigns.find_one(
            {"creative_id": creative["_id"], "type": "ngo_poster", "status": "active"}, {"_id": 1}
        )
        campaign_id = poster["_id"] if poster else None
    await db.ad_scans.insert_one(
        {
            "creative_id": creative["_id"],
            "owner_id": creative["owner_id"],
            "donation_id": donation_id,
            "campaign_id": campaign_id,
            "user_agent": (request.headers.get("user-agent") or "")[:200],
            "created_at": utcnow(),
        }
    )
    if campaign_id:
        await db.ad_campaigns.update_one({"_id": campaign_id}, {"$inc": {"scans": 1}})
    target = creative.get("url") if creative["status"] == "approved" and creative.get("url") else settings.frontend_url
    return RedirectResponse(target, status_code=302)
