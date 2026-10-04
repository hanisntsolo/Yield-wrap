"""Smart route optimisation: Google Directions when available, Haversine estimates otherwise,
plus a nearest-neighbour multi-stop planner."""
from ai_engine.geo import distance_km, has_coords
from services import maps_service

ROAD_FACTOR = 1.4  # straight-line → road distance
SPEED_KMH = {"bike": 15.0, "car": 35.0, "van": 30.0, "on_foot": 5.0}
MAX_STOPS = 5


def encode_polyline(points: list[tuple[float, float]] | list[list[float]]) -> str:
    """Google encoded polyline algorithm format."""
    result, prev_lat, prev_lng = [], 0, 0
    for lat, lng in points:
        lat_i, lng_i = round(lat * 1e5), round(lng * 1e5)
        for delta in (lat_i - prev_lat, lng_i - prev_lng):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                result.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            result.append(chr(value + 63))
        prev_lat, prev_lng = lat_i, lng_i
    return "".join(result)


def decode_polyline(encoded: str) -> list[list[float]]:
    points, index, lat, lng = [], 0, 0, 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = result = 0
            while True:
                byte = ord(encoded[index]) - 63
                index += 1
                result |= (byte & 0x1F) << shift
                shift += 5
                if byte < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        lat += deltas[0]
        lng += deltas[1]
        points.append([lat / 1e5, lng / 1e5])
    return points


def road_distance_km(a: dict, b: dict) -> float:
    return (distance_km(a, b) or 0.0) * ROAD_FACTOR


def travel_minutes(km: float, vehicle_type: str) -> float:
    return km / SPEED_KMH.get(vehicle_type, SPEED_KMH["bike"]) * 60


def estimate_eta_minutes(path: list[dict], vehicle_type: str = "bike") -> int | None:
    """Fallback ETA along a sequence of points (skipping any without coordinates)."""
    points = [p for p in path if has_coords(p)]
    if len(points) < 2:
        return None
    km = sum(road_distance_km(a, b) for a, b in zip(points, points[1:]))
    return max(1, round(travel_minutes(km, vehicle_type)))


def fallback_route(volunteer_location: dict, pickup_location: dict, delivery_location: dict, vehicle_type: str) -> dict:
    legs = [("Head to the pickup point", volunteer_location, pickup_location), ("Deliver to the NGO", pickup_location, delivery_location)]
    steps, total_km = [], 0.0
    for label, start, end in legs:
        km = road_distance_km(start, end)
        total_km += km
        address = end.get("address")
        steps.append(
            {
                "instruction": f"{label}{f' at {address}' if address else ''} (~{km:.1f} km)",
                "distance_km": round(km, 2),
                "duration_min": round(travel_minutes(km, vehicle_type), 1),
            }
        )
    points = [[p["lat"], p["lng"]] for p in (volunteer_location, pickup_location, delivery_location)]
    return {
        "distance_km": round(total_km, 2),
        "eta_minutes": max(1, round(travel_minutes(total_km, vehicle_type))),
        "polyline": encode_polyline(points),
        "steps": steps,
        "provider": "fallback",
    }


async def optimize_route(volunteer_location: dict, pickup_location: dict, delivery_location: dict, vehicle_type: str = "bike") -> dict:
    """Volunteer → pickup → delivery. Returns {distance_km, eta_minutes, polyline, points, steps, provider}."""
    try:
        route = await maps_service.get_directions(volunteer_location, delivery_location, [pickup_location], vehicle_type)
        route["provider"] = "google"
    except maps_service.MapsUnavailable:
        route = fallback_route(volunteer_location, pickup_location, delivery_location, vehicle_type)
    route["points"] = decode_polyline(route["polyline"]) if route["polyline"] else []
    return route


def optimize_multi_stop(start: dict, stops: list[dict], vehicle_type: str = "bike") -> dict:
    """Nearest-neighbour greedy TSP over up to MAX_STOPS stops, with cumulative distance/ETA per stop."""
    if len(stops) > MAX_STOPS:
        raise ValueError(f"At most {MAX_STOPS} stops are supported")
    remaining = list(stops)
    current, ordered, total_km = start, [], 0.0
    while remaining:
        nearest = min(remaining, key=lambda stop: road_distance_km(current, stop))
        remaining.remove(nearest)
        total_km += road_distance_km(current, nearest)
        ordered.append(
            {
                **nearest,
                "cumulative_distance_km": round(total_km, 2),
                "cumulative_eta_minutes": round(travel_minutes(total_km, vehicle_type)),
            }
        )
        current = nearest
    return {
        "ordered_stops": ordered,
        "total_distance_km": round(total_km, 2),
        "total_eta_minutes": round(travel_minutes(total_km, vehicle_type)),
    }
