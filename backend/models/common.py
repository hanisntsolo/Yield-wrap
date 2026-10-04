"""Shared field types. Every free-text field is stripped of control characters and length-limited."""
import re
from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlparse

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StringConstraints

from config import settings

Role = Literal["donor", "ngo", "volunteer", "admin", "business"]
BusinessType = Literal["restaurant", "hotel", "cafe", "caterer", "retail", "other"]
ADVERTISER_ROLES: tuple[str, ...] = ("donor", "business", "admin")
FoodCategory = Literal["cooked", "raw", "packaged", "dairy", "produce"]
Urgency = Literal["low", "medium", "high", "critical"]
DonationStatus = Literal["pending", "matched", "in_transit", "delivered", "expired", "cancelled"]
VehicleType = Literal["bike", "car", "van", "on_foot"]
TaskStage = Literal["assigned", "accepted", "at_pickup", "picked_up", "delivered"]

ROLES: tuple[str, ...] = Role.__args__
FOOD_CATEGORIES: tuple[str, ...] = FoodCategory.__args__
URGENCY_LEVELS: tuple[str, ...] = Urgency.__args__
DONATION_STATUSES: tuple[str, ...] = DonationStatus.__args__
VEHICLE_TYPES: tuple[str, ...] = VehicleType.__args__

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def clean_text(value: Any) -> Any:
    return _CONTROL_CHARS.sub("", value).strip() if isinstance(value, str) else value


def empty_to_none(value: Any) -> Any:
    return None if isinstance(value, str) and not value.strip() else value


def check_http_url(value: str | None) -> str | None:
    """Only absolute http(s) URLs are accepted (no javascript:, data:, mailto: …)."""
    if value is None:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or any(c.isspace() for c in value):
        raise ValueError("URL must start with http:// or https://")
    return value


HttpUrl = Annotated[
    Annotated[str, StringConstraints(max_length=500), BeforeValidator(clean_text)] | None,
    BeforeValidator(empty_to_none),
    AfterValidator(check_http_url),
]


def Text(max_length: int, min_length: int = 0):  # noqa: N802 - reads like a type
    return Annotated[str, StringConstraints(min_length=min_length, max_length=max_length), BeforeValidator(clean_text)]


Phone = Annotated[
    str,
    StringConstraints(max_length=20, pattern=r"^[0-9+()\-.\s]*$"),
    BeforeValidator(lambda v: "" if v is None else clean_text(v)),
]
HHMM = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


def _as_aware(value: datetime) -> datetime:
    """Naive datetimes are interpreted in the platform's local time zone."""
    return value.replace(tzinfo=settings.tz) if value.tzinfo is None else value


AwareDatetime = Annotated[datetime, AfterValidator(_as_aware)]


class Coordinates(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Location(Coordinates):
    address: Text(300) = ""


def drop_incomplete_location(value: Any) -> Any:
    """A location without coordinates (e.g. an address typed but never geocoded) counts as missing."""
    if isinstance(value, dict) and (empty_to_none(value.get("lat")) is None or empty_to_none(value.get("lng")) is None):
        return None
    return value


OptionalLocation = Annotated[Location | None, BeforeValidator(drop_incomplete_location)]


class OperatingHours(BaseModel):
    open: HHMM = "08:00"
    close: HHMM = "20:00"
