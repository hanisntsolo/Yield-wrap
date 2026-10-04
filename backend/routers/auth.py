"""Registration, login, cookie-based JWT sessions and profile management."""
import asyncio
import hmac
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pymongo.errors import DuplicateKeyError

from config import settings
from errors import APIError, conflict, forbidden, not_found, unauthorized
from models.common import FOOD_CATEGORIES
from models.user import FcmTokenRequest, LoginRequest, RegisterRequest, UpdateMeRequest
from services import fcm_service
from services.auth_service import (
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    clear_auth_cookies,
    get_current_user,
    hash_password,
    public_user,
    require_roles,
    set_auth_cookies,
    user_from_token,
    verify_password,
)
from services.db_service import db, serialize, utcnow
from services.rate_limit import login_limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])

DOCUMENT_TYPES = {b"%PDF": "pdf", b"\x89PNG": "png", b"\xff\xd8\xff": "jpg"}
DOCUMENT_NAME = re.compile(r"^[a-f0-9]{32}\.(pdf|png|jpg)$")
DOCUMENT_MEDIA_TYPES = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg"}
# Compared against when the email is unknown so response timing doesn't reveal which accounts exist.
_DUMMY_HASH = hash_password(uuid.uuid4().hex)


def documents_dir() -> Path:
    return Path(settings.upload_dir) / "ngo_documents"


async def load_profile(user: dict) -> dict | None:
    if user["role"] == "ngo":
        profile = await db.ngos.find_one({"user_id": user["_id"]})
    elif user["role"] == "volunteer":
        profile = await db.volunteers.find_one({"user_id": user["_id"]})
    elif user["role"] == "business":
        profile = await db.businesses.find_one({"user_id": user["_id"]})
    else:
        return None
    return serialize(profile) if profile else None


@router.post("/register", status_code=201)
async def register(body: RegisterRequest, response: Response):
    if body.role == "admin" and not (
        settings.admin_signup_code and hmac.compare_digest(body.admin_code or "", settings.admin_signup_code)
    ):
        raise forbidden("A valid admin signup code is required to register as an admin")
    if await db.users.find_one({"email": body.email}, {"_id": 1}):
        raise conflict("An account with this email already exists", "EMAIL_TAKEN")

    now = utcnow()
    location = body.location.model_dump() if body.location else None
    user = {
        "name": body.name,
        "email": body.email,
        "password": await asyncio.to_thread(hash_password, body.password),
        "role": body.role,
        "phone": body.phone,
        "location": location,
        "is_verified": body.role != "ngo",  # NGOs are verified by an admin before receiving food
        "is_suspended": False,
        "is_premium_partner": False,
        "fcm_token": None,
        "token_version": 0,
        "ad_credits": 0,
        "ad_earnings_credits": 0,
        "created_at": now,
    }
    try:
        user["_id"] = (await db.users.insert_one(user)).inserted_id
    except DuplicateKeyError:
        raise conflict("An account with this email already exists", "EMAIL_TAKEN") from None

    if body.role == "ngo":
        await db.ngos.insert_one(
            {
                "user_id": user["_id"],
                "organization_name": body.organization_name,
                "registration_number": body.registration_number,
                "document_url": None,
                "location": location,
                "accepted_food_types": body.accepted_food_types or list(FOOD_CATEGORIES),
                "storage_capacity_kg": body.storage_capacity_kg or 100.0,
                "current_load_kg": 0.0,
                "beneficiary_count": body.beneficiary_count or 0,
                "operating_hours": (body.operating_hours.model_dump() if body.operating_hours else {"open": "08:00", "close": "20:00"}),
                "is_active": True,
                "is_verified": False,
                "offers_received": 0,
                "offers_accepted": 0,
                "acceptance_rate": 0.5,
                "created_at": now,
            }
        )
        await fcm_service.notify_admins(
            "New NGO registration",
            f"{body.organization_name} ({body.registration_number}) is waiting for verification.",
            {"type": "ngo_registered", "user_id": str(user["_id"])},
        )
    elif body.role == "volunteer":
        await db.volunteers.insert_one(
            {
                "user_id": user["_id"],
                "name": body.name,
                "vehicle_type": body.vehicle_type or "bike",
                "availability": False,
                "current_location": {"lat": location["lat"], "lng": location["lng"]} if location else None,
                "active_task_id": None,
                "completed_deliveries": 0,
                "rating": 4.5,
                "hours_contributed": 0.0,
                "created_at": now,
            }
        )
        await fcm_service.notify_admins(
            "New volunteer registered",
            f"{body.name} joined as a volunteer ({(body.vehicle_type or 'bike').replace('_', ' ')}).",
            {"type": "volunteer_registered", "user_id": str(user["_id"])},
        )

    elif body.role == "business":
        await db.businesses.insert_one(
            {
                "user_id": user["_id"],
                "business_name": body.business_name,
                "business_type": body.business_type,
                "website": body.website,
                "created_at": now,
            }
        )
        await fcm_service.notify_admins(
            "New business advertiser",
            f"{body.business_name} ({body.business_type}) registered as an advertiser.",
            {"type": "business_registered", "user_id": str(user["_id"])},
        )

    set_auth_cookies(response, user)
    return {"user": public_user(user)}


@router.post("/login")
async def login(body: LoginRequest, request: Request, response: Response):
    limiter_key = f"{request.client.host if request.client else 'unknown'}:{body.email}"
    login_limiter.check(limiter_key)
    user = await db.users.find_one({"email": body.email})
    valid = await asyncio.to_thread(verify_password, body.password, user["password"] if user else _DUMMY_HASH)
    if not user or not valid:
        raise unauthorized("Invalid email or password", "INVALID_CREDENTIALS")
    if user.get("is_suspended"):
        raise APIError(403, "This account has been suspended", "ACCOUNT_SUSPENDED")
    login_limiter.reset(limiter_key)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": utcnow()}})
    set_auth_cookies(response, user)
    return {"user": public_user(user)}


@router.post("/refresh")
async def refresh(request: Request):
    try:
        user = await user_from_token(request.cookies.get(REFRESH_COOKIE), "refresh")
    except APIError as exc:
        failure = JSONResponse({"error": exc.message, "code": exc.code}, status_code=exc.status_code)
        clear_auth_cookies(failure)
        return failure
    response = JSONResponse({"user": public_user(user)})
    set_auth_cookies(response, user)
    return response


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Clear cookies and revoke every outstanding token for this user."""
    for cookie, kind in ((ACCESS_COOKIE, "access"), (REFRESH_COOKIE, "refresh")):
        try:
            user = await user_from_token(request.cookies.get(cookie), kind)
        except APIError:
            continue
        await db.users.update_one({"_id": user["_id"]}, {"$inc": {"token_version": 1}})
        break
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": public_user(user), "profile": await load_profile(user)}


@router.put("/me")
async def update_me(body: UpdateMeRequest, user: dict = Depends(get_current_user)):
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "location" in changes:
        changes["location"] = body.location.model_dump()
    if changes:
        await db.users.update_one({"_id": user["_id"]}, {"$set": changes})
        if user["role"] == "volunteer" and "name" in changes:
            await db.volunteers.update_one({"user_id": user["_id"]}, {"$set": {"name": changes["name"]}})
        if user["role"] == "ngo" and "location" in changes:
            await db.ngos.update_one({"user_id": user["_id"]}, {"$set": {"location": changes["location"]}})
            await db.ad_spaces.update_many({"ngo_user_id": user["_id"]}, {"$set": {"location": changes["location"]}})
        if user["role"] in ("donor", "admin") and "name" in changes:
            # Advertiser display name shown on creatives and campaigns (businesses use business_name).
            for collection in (db.ad_creatives, db.ad_campaigns):
                await collection.update_many({"owner_id": user["_id"]}, {"$set": {"owner_name": changes["name"]}})
    return {"user": public_user(await db.users.find_one({"_id": user["_id"]}))}


@router.post("/fcm-token")
async def register_fcm_token(body: FcmTokenRequest, user: dict = Depends(get_current_user)):
    # A device token belongs to whoever logged in on that device most recently.
    await db.users.update_many({"fcm_token": body.token, "_id": {"$ne": user["_id"]}}, {"$set": {"fcm_token": None}})
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"fcm_token": body.token}})
    return {"ok": True}


@router.post("/ngo-document")
async def upload_ngo_document(file: UploadFile = File(...), user: dict = Depends(require_roles("ngo"))):
    ngo = await db.ngos.find_one({"user_id": user["_id"]})
    if not ngo:
        raise not_found("NGO profile")
    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise APIError(413, f"Document must be {settings.max_upload_mb} MB or smaller", "FILE_TOO_LARGE")
    extension = next((ext for magic, ext in DOCUMENT_TYPES.items() if content.startswith(magic)), None)
    if extension is None:
        raise APIError(415, "Upload a PDF, PNG or JPG document", "UNSUPPORTED_FILE_TYPE")

    directory = documents_dir()
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{extension}"
    await asyncio.to_thread((directory / name).write_bytes, content)

    old_url = ngo.get("document_url") or ""
    document_url = f"/api/auth/ngo-document/{name}"
    await db.ngos.update_one({"_id": ngo["_id"]}, {"$set": {"document_url": document_url}})
    old_name = old_url.rsplit("/", 1)[-1]
    if DOCUMENT_NAME.match(old_name):
        (directory / old_name).unlink(missing_ok=True)
    return {"document_url": document_url}


@router.get("/ngo-document/{file_name}")
async def get_ngo_document(file_name: str, user: dict = Depends(get_current_user)):
    match = DOCUMENT_NAME.match(file_name)
    if not match:
        raise not_found("Document")
    document_url = f"/api/auth/ngo-document/{file_name}"
    if user["role"] != "admin" and not await db.ngos.find_one({"user_id": user["_id"], "document_url": document_url}):
        raise not_found("Document")
    path = documents_dir() / file_name
    if not path.is_file():
        raise not_found("Document")
    return FileResponse(path, media_type=DOCUMENT_MEDIA_TYPES[match.group(1)])
