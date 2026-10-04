"""Live volunteer location fan-out to WebSocket subscribers.

Subscriptions are held in process memory; run a single API worker (or swap in Redis pub/sub)
when scaling out.
"""
import logging
from collections import defaultdict

from fastapi import WebSocket

from services.db_service import db, utcnow

logger = logging.getLogger("yieldwrap.realtime")


class LocationHub:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[WebSocket]] = defaultdict(set)

    def subscribe(self, volunteer_id: str, websocket: WebSocket) -> None:
        self._subscribers[volunteer_id].add(websocket)

    def unsubscribe(self, volunteer_id: str, websocket: WebSocket) -> None:
        subscribers = self._subscribers.get(volunteer_id)
        if subscribers:
            subscribers.discard(websocket)
            if not subscribers:
                del self._subscribers[volunteer_id]

    async def publish(self, volunteer_id: str, payload: dict) -> None:
        for websocket in list(self._subscribers.get(volunteer_id, ())):
            try:
                await websocket.send_json(payload)
            except Exception:  # noqa: BLE001 - a dead socket must not block the others
                self.unsubscribe(volunteer_id, websocket)


hub = LocationHub()


async def publish_location(volunteer: dict, lat: float, lng: float) -> dict:
    now = utcnow()
    await db.volunteers.update_one(
        {"_id": volunteer["_id"]}, {"$set": {"current_location": {"lat": lat, "lng": lng}, "location_updated_at": now}}
    )
    payload = {"volunteer_id": str(volunteer["_id"]), "lat": lat, "lng": lng, "timestamp": now.isoformat()}
    await hub.publish(str(volunteer["_id"]), payload)
    return payload
