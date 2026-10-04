"""Analytics, notification and ad-tech schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from models.common import Role, Text


class AnalyticsLog(BaseModel):
    """One document per day in `analytics_logs`; also the training data for demand forecasting."""

    date: datetime
    total_donations: int = 0
    total_kg_redistributed: float = 0.0
    total_kg_wasted: float = 0.0
    total_kg_needed: float = 0.0
    active_ngos: int = 0
    active_volunteers: int = 0
    avg_delivery_time_min: float | None = None
    meals_served_estimate: int = 0
    avg_temp: float | None = None
    is_holiday: bool = False


class BroadcastRequest(BaseModel):
    title: Text(120, 1)
    body: Text(1000, 1)
    role: Role | None = None


AdSlot = Literal["leaderboard", "rectangle", "mobile"]


class AdEvent(BaseModel):
    ad_id: str = Field(min_length=1, max_length=64)
    slot: AdSlot
    page: Text(100) = ""
