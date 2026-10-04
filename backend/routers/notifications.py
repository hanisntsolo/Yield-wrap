"""In-app notification inbox (every push notification is also stored here)."""
from fastapi import APIRouter, Depends, Query

from errors import not_found
from services.auth_service import get_current_user
from services.db_service import db, serialize, to_object_id

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/")
async def inbox(limit: int = Query(50, ge=1, le=200), unread_only: bool = False, user: dict = Depends(get_current_user)):
    query = {"user_id": user["_id"], **({"read": False} if unread_only else {})}
    notifications = await db.notifications.find(query, {"user_id": 0}).sort("created_at", -1).to_list(limit)
    return serialize(notifications)


@router.get("/unread-count")
async def unread_count(user: dict = Depends(get_current_user)):
    return {"count": await db.notifications.count_documents({"user_id": user["_id"], "read": False})}


@router.post("/read-all")
async def mark_all_read(user: dict = Depends(get_current_user)):
    result = await db.notifications.update_many({"user_id": user["_id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True, "updated": result.modified_count}


@router.post("/{notification_id}/read")
async def mark_read(notification_id: str, user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"_id": to_object_id(notification_id, "Notification"), "user_id": user["_id"]}, {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise not_found("Notification")
    return {"ok": True}
