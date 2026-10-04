"""Food donation schemas."""
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, field_validator, model_validator

from models.common import AwareDatetime, FoodCategory, Location, Text, Urgency, empty_to_none
from services.db_service import utcnow


def split_allergens(value: Any) -> Any:
    if isinstance(value, str):
        return [part for part in (p.strip() for p in value.split(",")) if part]
    return value


class FoodItem(BaseModel):
    name: Text(100, 1)
    category: FoodCategory
    quantity_kg: float = Field(gt=0, le=10_000)
    expiry_time: AwareDatetime
    allergens: Annotated[list[Text(40, 1)], BeforeValidator(split_allergens)] = Field(default_factory=list, max_length=20)

    @field_validator("allergens")
    @classmethod
    def dedupe_allergens(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(a.lower() for a in value))


def _check_future_expiry(items: list[FoodItem]) -> list[FoodItem]:
    now = utcnow()
    for item in items:
        if item.expiry_time <= now:
            raise ValueError(f"expiry_time for '{item.name}' must be in the future")
    return items


FoodItems = Annotated[list[FoodItem], Field(min_length=1, max_length=20), AfterValidator(_check_future_expiry)]


class DonationCreate(BaseModel):
    food_items: FoodItems
    pickup_location: Location
    urgency_level: Urgency = "medium"
    notes: Text(500) = ""
    packet_count: int = Field(0, ge=0, le=100_000)
    own_ad_creative_id: Annotated[str | None, BeforeValidator(empty_to_none), Field(max_length=64)] = None


class DonationUpdate(BaseModel):
    food_items: FoodItems | None = None
    pickup_location: Location | None = None
    urgency_level: Urgency | None = None
    notes: Text(500) | None = None
    packet_count: int | None = Field(None, ge=0, le=100_000)
    own_ad_creative_id: Annotated[str | None, BeforeValidator(empty_to_none), Field(max_length=64)] = None


class TaskStatusUpdate(BaseModel):
    status: Literal["at_pickup", "picked_up", "delivered"]
    receiver_name: Text(100, 1) | None = None
    quantity_confirmed_kg: float | None = Field(None, ge=0, le=10_000)
    stickers_applied: int | None = Field(None, ge=0, le=100_000)

    @model_validator(mode="after")
    def delivery_audit(self):
        if self.status == "delivered" and (not self.receiver_name or self.quantity_confirmed_kg is None):
            raise ValueError("receiver_name and quantity_confirmed_kg are required to confirm a delivery")
        return self
