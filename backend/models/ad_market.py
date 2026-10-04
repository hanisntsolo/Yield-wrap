"""Packaging ad-tech request schemas: orders, creatives, campaigns, NGO ad spaces and admin actions."""
from typing import Annotated, Literal, Union

from pydantic import BaseModel, BeforeValidator, Field, field_validator

from models.common import Coordinates, HttpUrl, Text, empty_to_none

ObjectIdStr = Annotated[str, Field(min_length=1, max_length=64)]


class OrderCreate(BaseModel):
    pack_id: Literal["starter", "growth", "pro"]


class PaymentVerify(BaseModel):
    razorpay_order_id: str | None = Field(None, max_length=64)
    razorpay_payment_id: str | None = Field(None, max_length=64)
    razorpay_signature: str | None = Field(None, max_length=256)


class CreativeFields(BaseModel):
    """Multipart form fields of POST /api/ads/creatives (validated manually)."""

    title: Text(60, 2)
    tagline: Text(120) = ""
    url: HttpUrl = None


class CreativeReview(BaseModel):
    approved: bool
    reason: Annotated[Text(300) | None, BeforeValidator(empty_to_none)] = None


class Target(Coordinates):
    radius_km: float = Field(gt=0, le=500)


class PacketCampaignCreate(BaseModel):
    type: Literal["packet"]
    creative_id: ObjectIdStr
    packets: int = Field(ge=1, le=100_000)
    target: Target | None = None


class PosterCampaignCreate(BaseModel):
    type: Literal["ngo_poster"]
    creative_id: ObjectIdStr
    ad_space_id: ObjectIdStr
    weeks: int = Field(ge=1, le=12)


class DigitalCampaignCreate(BaseModel):
    type: Literal["digital"]
    creative_id: ObjectIdStr
    impressions: int = Field(ge=1000, le=1_000_000, multiple_of=1000)


CampaignCreate = Annotated[
    Union[PacketCampaignCreate, PosterCampaignCreate, DigitalCampaignCreate], Field(discriminator="type")
]


class AdSpaceCreate(BaseModel):
    name: Text(80, 2)
    description: Text(500) = ""
    size: Text(60) = ""
    credits_per_week: int = Field(ge=10, le=10_000)


class AdSpaceUpdate(BaseModel):
    name: Text(80, 2) | None = None
    description: Text(500) | None = None
    size: Text(60) | None = None
    credits_per_week: int | None = Field(None, ge=10, le=10_000)
    active: bool | None = None


class CreditGrant(BaseModel):
    credits: int = Field(ge=-100_000, le=100_000)
    note: Text(200) = ""

    @field_validator("credits")
    @classmethod
    def non_zero(cls, value: int) -> int:
        if value == 0:
            raise ValueError("credits must not be 0")
        return value
