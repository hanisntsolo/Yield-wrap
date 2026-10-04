"""AI engine request/response schemas: matching, routing, allocation."""
from pydantic import BaseModel, Field

from models.common import Coordinates, Text, VehicleType


class MatchBreakdown(BaseModel):
    distance: float
    capacity: float
    food_type: float
    urgency: float
    history: float


class MatchCandidate(BaseModel):
    ngo_id: str
    organization_name: str
    score: float = Field(ge=0, le=1)
    distance_km: float
    breakdown: MatchBreakdown | None = None


class RouteRequest(BaseModel):
    volunteer_location: Coordinates
    pickup_location: Coordinates
    delivery_location: Coordinates
    vehicle_type: VehicleType = "bike"


class Stop(Coordinates):
    id: Text(64, 1)


class MultiRouteRequest(BaseModel):
    start: Coordinates
    stops: list[Stop] = Field(min_length=1, max_length=5)
    vehicle_type: VehicleType = "bike"


class AllocateRequest(BaseModel):
    donation_id: str = Field(min_length=1, max_length=64)
