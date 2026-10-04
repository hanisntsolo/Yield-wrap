"""Firebase Cloud Messaging plus the in-app notification inbox.

Every notification is stored in `notifications` so the product works without Firebase; when
FIREBASE_CREDENTIALS_PATH points to a service-account file, it is also pushed via FCM.
"""
import asyncio
import logging
from pathlib import Path
from typing import Iterable

from bson import ObjectId

from config import settings
from services.db_service import db, utcnow

logger = logging.getLogger("yieldwrap.fcm")

_app = None
_init_attempted = False
_background_tasks: set[asyncio.Task] = set()
MULTICAST_LIMIT = 500


def _firebase_app():
    global _app, _init_attempted
    if _init_attempted:
        return _app
    _init_attempted = True
    path = settings.firebase_credentials_path
    if not path or not Path(path).is_file():
        logger.info("FCM push disabled (FIREBASE_CREDENTIALS_PATH not set); using in-app inbox only")
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials

        _app = firebase_admin.initialize_app(credentials.Certificate(path), name="yieldwrap")
    except Exception:  # noqa: BLE001 - a broken credential file must not take the API down
        logger.exception("Could not initialise Firebase; push notifications disabled")
        _app = None
    return _app


def is_enabled() -> bool:
    return _firebase_app() is not None


def _string_data(data: dict | None) -> dict[str, str]:
    return {str(k): str(v) for k, v in (data or {}).items() if v is not None}


def _build_message_parts(title: str, body: str, data: dict | None):
    from firebase_admin import messaging

    return {
        "notification": messaging.Notification(title=title, body=body),
        "data": _string_data({**(data or {}), "title": title, "body": body}),
        "webpush": messaging.WebpushConfig(notification=messaging.WebpushNotification(icon="/favicon.svg")),
    }


def _is_dead_token(exc: Exception | None) -> bool:
    from firebase_admin import messaging

    return isinstance(exc, (messaging.UnregisteredError, messaging.SenderIdMismatchError))


def _send_multicast_sync(tokens: list[str], title: str, body: str, data: dict | None) -> tuple[int, list[str]]:
    from firebase_admin import messaging

    sent, dead = 0, []
    for start in range(0, len(tokens), MULTICAST_LIMIT):
        chunk = tokens[start : start + MULTICAST_LIMIT]
        message = messaging.MulticastMessage(tokens=chunk, **_build_message_parts(title, body, data))
        response = messaging.send_each_for_multicast(message, app=_firebase_app())
        sent += response.success_count
        dead += [tok for tok, res in zip(chunk, response.responses) if not res.success and _is_dead_token(res.exception)]
    return sent, dead


async def send_multicast(tokens: Iterable[str], title: str, body: str, data: dict | None = None) -> int:
    tokens = list(dict.fromkeys(t for t in tokens if t))
    if not tokens or not is_enabled():
        return 0
    try:
        sent, dead = await asyncio.to_thread(_send_multicast_sync, tokens, title, body, data)
    except Exception:  # noqa: BLE001
        logger.exception("FCM multicast failed")
        return 0
    if dead:
        await db.users.update_many({"fcm_token": {"$in": dead}}, {"$set": {"fcm_token": None}})
    return sent


async def send_notification(fcm_token: str, title: str, body: str, data: dict | None = None) -> bool:
    return await send_multicast([fcm_token], title, body, data) == 1


async def send_to_role(role: str, title: str, body: str, data: dict | None = None) -> int:
    users = db.users.find(
        {"role": role, "fcm_token": {"$nin": [None, ""]}, "is_suspended": {"$ne": True}}, {"fcm_token": 1}
    )
    return await send_multicast([u["fcm_token"] async for u in users], title, body, data)


def _run_in_background(coro) -> None:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def notify_users(
    user_ids: Iterable, title: str, body: str, data: dict | None = None, *, wait_for_push: bool = False
) -> dict:
    """Store an inbox notification for each user and push it to their devices.

    Push delivery runs in the background unless `wait_for_push` is set (used by admin broadcasts
    to report how many pushes were sent). Failures are logged, never raised.
    """
    ids = list(dict.fromkeys(ObjectId(str(u)) for u in user_ids if u and ObjectId.is_valid(str(u))))
    if not ids:
        return {"recipients": 0, "push_sent": 0}
    now = utcnow()
    try:
        await db.notifications.insert_many(
            [{"user_id": uid, "title": title, "body": body, "data": data or {}, "read": False, "created_at": now} for uid in ids]
        )
    except Exception:  # noqa: BLE001
        logger.exception("Could not store notifications")
    if not is_enabled():
        return {"recipients": len(ids), "push_sent": 0}

    async def push() -> int:
        users = db.users.find({"_id": {"$in": ids}, "fcm_token": {"$nin": [None, ""]}}, {"fcm_token": 1})
        return await send_multicast([u["fcm_token"] async for u in users], title, body, data)

    if wait_for_push:
        return {"recipients": len(ids), "push_sent": await push()}
    _run_in_background(push())
    return {"recipients": len(ids), "push_sent": None}


async def notify_role(role: str | None, title: str, body: str, data: dict | None = None, *, wait_for_push: bool = False) -> dict:
    query = {"is_suspended": {"$ne": True}}
    if role:
        query["role"] = role
    ids = [u["_id"] async for u in db.users.find(query, {"_id": 1})]
    return await notify_users(ids, title, body, data, wait_for_push=wait_for_push)


async def notify_admins(title: str, body: str, data: dict | None = None) -> dict:
    return await notify_role("admin", title, body, data)
