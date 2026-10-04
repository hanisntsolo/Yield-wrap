"""Geographic helpers shared by the matching, allocation and routing engines."""
import math

EARTH_RADIUS_KM = 6371.0


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns distance in kilometers between two GPS coordinates."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def has_coords(location: dict | None) -> bool:
    if not isinstance(location, dict):
        return False
    lat, lng = location.get("lat"), location.get("lng")
    return isinstance(lat, (int, float)) and isinstance(lng, (int, float)) and -90 <= lat <= 90 and -180 <= lng <= 180


def distance_km(a: dict | None, b: dict | None) -> float | None:
    if not (has_coords(a) and has_coords(b)):
        return None
    return haversine(a["lat"], a["lng"], b["lat"], b["lng"])


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))
