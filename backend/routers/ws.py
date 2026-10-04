"""WebSocket: live volunteer location.

Subscribers are the volunteer themself, admins, and the donor/NGO of the volunteer's active task.
Auth uses the `access_token` cookie; the Origin header is checked to prevent cross-site hijacking.
"""
import logging

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from config import settings
from errors import APIError
from models.user import LocationUpdate
from services.auth_service import ACCESS_COOKIE, user_from_token
from services.db_service import db
from services.realtime import hub, publish_location

logger = logging.getLogger("yieldwrap.ws")
router = APIRouter()

POLICY_VIOLATION = 1008


async def find_volunteer(volunteer_id: str) -> dict | None:
    if not ObjectId.is_valid(volunteer_id):
        return None
    oid = ObjectId(volunteer_id)
    # Accept the volunteer profile id (canonical) or the volunteer's user id.
    return await db.volunteers.find_one({"$or": [{"_id": oid}, {"user_id": oid}]})


async def can_watch(user: dict, volunteer: dict) -> bool:
    if user["role"] == "admin" or volunteer["user_id"] == user["_id"]:
        return True
    return bool(
        await db.donations.find_one(
            {
                "assigned_volunteer_id": volunteer["_id"],
                "status": {"$in": ["matched", "in_transit"]},
                "$or": [{"donor_id": user["_id"]}, {"matched_ngo_user_id": user["_id"]}],
            },
            {"_id": 1},
        )
    )


@router.websocket("/ws/volunteer/{volunteer_id}/location")
async def volunteer_location(websocket: WebSocket, volunteer_id: str):
    origin = websocket.headers.get("origin")
    if origin and origin.rstrip("/") not in settings.cors_origins:
        await websocket.close(code=POLICY_VIOLATION)
        return
    try:
        user = await user_from_token(websocket.cookies.get(ACCESS_COOKIE))
    except APIError:
        await websocket.close(code=POLICY_VIOLATION)
        return
    volunteer = await find_volunteer(volunteer_id)
    if not volunteer or not await can_watch(user, volunteer):
        await websocket.close(code=POLICY_VIOLATION)
        return

    await websocket.accept()
    channel = str(volunteer["_id"])
    hub.subscribe(channel, websocket)
    is_self = volunteer["user_id"] == user["_id"]
    try:
        if volunteer.get("current_location"):
            await websocket.send_json(
                {
                    "volunteer_id": channel,
                    **volunteer["current_location"],
                    "timestamp": volunteer.get("location_updated_at").isoformat() if volunteer.get("location_updated_at") else None,
                }
            )
        while True:
            message = await websocket.receive_json()
            if not is_self:
                continue  # watchers can't publish
            try:
                point = LocationUpdate.model_validate(message)
            except ValidationError:
                await websocket.send_json({"error": "Expected {lat, lng}", "code": "VALIDATION_ERROR"})
                continue
            await publish_location(volunteer, point.lat, point.lng)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("Location socket error")
    finally:
        hub.unsubscribe(channel, websocket)
