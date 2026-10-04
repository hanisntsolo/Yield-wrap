"""Google Maps Directions API integration. Callers fall back to Haversine estimates on MapsUnavailable."""
import logging
import re

import httpx

from config import settings

logger = logging.getLogger("yieldwrap.maps")

DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"
TIMEOUT_SECONDS = 8.0
# Google has no bicycling coverage in many regions, so two-wheelers and vans are routed as driving.
TRAVEL_MODES = {"on_foot": "walking", "bike": "driving", "car": "driving", "van": "driving"}
_TAGS = re.compile(r"<[^>]+>")


class MapsUnavailable(Exception):
    pass


def is_enabled() -> bool:
    return bool(settings.google_maps_api_key)


def _latlng(point: dict) -> str:
    return f"{point['lat']},{point['lng']}"


async def get_directions(origin: dict, destination: dict, waypoints: list[dict] | None = None, vehicle_type: str = "car") -> dict:
    """Return {distance_km, eta_minutes, polyline, steps} for origin → waypoints → destination."""
    if not is_enabled():
        raise MapsUnavailable("GOOGLE_MAPS_API_KEY is not configured")
    params = {
        "origin": _latlng(origin),
        "destination": _latlng(destination),
        "mode": TRAVEL_MODES.get(vehicle_type, "driving"),
        "key": settings.google_maps_api_key,
    }
    if waypoints:
        params["waypoints"] = "|".join(_latlng(w) for w in waypoints)
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.get(DIRECTIONS_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Directions request failed: %s", exc)
        raise MapsUnavailable(str(exc)) from exc

    if payload.get("status") != "OK" or not payload.get("routes"):
        logger.warning("Directions API returned %s", payload.get("status"))
        raise MapsUnavailable(payload.get("status", "NO_ROUTE"))

    route = payload["routes"][0]
    legs = route.get("legs", [])
    steps = [
        {
            "instruction": _TAGS.sub(" ", step.get("html_instructions", "")).replace("  ", " ").strip(),
            "distance_km": round(step.get("distance", {}).get("value", 0) / 1000, 2),
            "duration_min": round(step.get("duration", {}).get("value", 0) / 60, 1),
        }
        for leg in legs
        for step in leg.get("steps", [])
    ]
    meters = sum(leg.get("distance", {}).get("value", 0) for leg in legs)
    seconds = sum(leg.get("duration", {}).get("value", 0) for leg in legs)
    return {
        "distance_km": round(meters / 1000, 2),
        "eta_minutes": max(1, round(seconds / 60)),
        "polyline": route.get("overview_polyline", {}).get("points", ""),
        "steps": steps,
    }
