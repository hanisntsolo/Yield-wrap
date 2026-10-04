"""User, NGO and volunteer schemas (request bodies and documented response shapes)."""
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field, field_validator, model_validator

from models.common import (
    BusinessType,
    Coordinates,
    HttpUrl,
    FoodCategory,
    Location,
    OperatingHours,
    OptionalLocation,
    Phone,
    Role,
    Text,
    VehicleType,
    empty_to_none,
)



def _check_password(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password is too long")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain at least one letter and one number")
    return value


class RegisterRequest(BaseModel):
    name: Text(100, 2)
    email: EmailStr
    password: Annotated[str, Field(min_length=8, max_length=72), AfterValidator(_check_password)]
    role: Role
    phone: Phone = ""
    location: OptionalLocation = None
    # NGO
    organization_name: Annotated[Text(150) | None, BeforeValidator(empty_to_none)] = None
    registration_number: Annotated[Text(60) | None, BeforeValidator(empty_to_none)] = None
    accepted_food_types: list[FoodCategory] | None = None
    storage_capacity_kg: Annotated[Annotated[float, Field(gt=0, le=1_000_000)] | None, BeforeValidator(empty_to_none)] = None
    beneficiary_count: Annotated[Annotated[int, Field(ge=0, le=10_000_000)] | None, BeforeValidator(empty_to_none)] = None
    operating_hours: OperatingHours | None = None
    # Volunteer
    vehicle_type: Annotated[VehicleType | None, BeforeValidator(empty_to_none)] = None
    # Business (advertiser)
    business_name: Annotated[Text(150) | None, BeforeValidator(empty_to_none)] = None
    business_type: BusinessType = "other"
    website: HttpUrl = None
    # Admin
    admin_code: str | None = Field(None, max_length=200)

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str) -> str:
        return value.lower()

    @model_validator(mode="after")
    def role_fields(self):
        if self.role == "ngo":
            if not self.organization_name:
                raise ValueError("organization_name is required for NGOs")
            if not self.registration_number:
                raise ValueError("registration_number is required for NGOs")
            if self.location is None:
                raise ValueError("location with coordinates is required for NGOs")
        if self.role == "business" and (not self.business_name or len(self.business_name) < 2):
            raise ValueError("business_name (2-150 characters) is required for businesses")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str) -> str:
        return value.lower()


class UpdateMeRequest(BaseModel):
    name: Text(100, 2) | None = None
    phone: Phone | None = None
    location: OptionalLocation = None


class FcmTokenRequest(BaseModel):
    token: str = Field(min_length=10, max_length=4096)


class NGOProfileUpdate(BaseModel):
    organization_name: Text(150, 2) | None = None
    location: OptionalLocation = None
    accepted_food_types: list[FoodCategory] | None = Field(None, min_length=1)
    storage_capacity_kg: float | None = Field(None, gt=0, le=1_000_000)
    current_load_kg: float | None = Field(None, ge=0, le=1_000_000)
    beneficiary_count: int | None = Field(None, ge=0, le=10_000_000)
    operating_hours: OperatingHours | None = None
    is_active: bool | None = None


class CapacityUpdate(BaseModel):
    current_load_kg: float = Field(ge=0, le=1_000_000)
    storage_capacity_kg: float | None = Field(None, gt=0, le=1_000_000)


class AvailabilityUpdate(BaseModel):
    availability: bool


class LocationUpdate(Coordinates):
    pass


class VerifyRequest(BaseModel):
    is_verified: bool = True


class SuspendRequest(BaseModel):
    is_suspended: bool = True


class UserPublic(BaseModel):
    """Documented response shape of a user (password and push tokens are never returned)."""

    id: str
    name: str
    email: str
    role: Role
    phone: str = ""
    location: Location | None = None
    is_verified: bool = False
    is_suspended: bool = False
    is_premium_partner: bool = False
    created_at: datetime
