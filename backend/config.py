"""Application settings. Every secret and API key is read from the environment / .env file."""
from datetime import timezone, tzinfo
from functools import cached_property
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(BASE_DIR.parent / ".env", BASE_DIR / ".env"), extra="ignore")

    environment: str = "development"

    # Database
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "yieldwrap"

    # Auth
    jwt_secret: str = "development-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 30
    refresh_token_days: int = 7
    bcrypt_rounds: int = 12
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    admin_signup_code: str = ""

    # CORS
    frontend_url: str = "http://localhost:3000"
    extra_cors_origins: str = ""

    # Integrations
    google_maps_api_key: str = ""
    firebase_credentials_path: str = ""

    # Local time zone used for operating hours, holidays, ad day-parts and naive datetimes
    app_timezone: str = "Asia/Kolkata"

    # Matching / dispatch
    max_match_distance_km: float = 50.0
    max_volunteer_distance_km: float = 25.0
    offer_timeout_minutes: int = 30
    rematch_interval_minutes: int = 10
    expiring_soon_hours: float = 2.0

    # Background jobs
    enable_scheduler: bool = True
    scheduler_interval_seconds: int = 300

    # Files
    upload_dir: str = str(BASE_DIR / "uploads")
    model_dir: str = str(BASE_DIR / "ai_engine" / "models")
    max_upload_mb: int = 5

    # Payments (Razorpay, test mode in development)
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Packaging ad-tech economics (credits are integers)
    ad_own_share: float = 0.5
    ngo_revenue_share: float = 0.3
    credit_value_inr: int = 5
    packet_sticker_credits: int = 2
    digital_credits_per_1000: int = 10
    ngo_poster_week_default: int = 50

    # Impact conversion factors
    kg_per_meal: float = 0.4
    co2_kg_per_food_kg: float = 2.5
    water_liters_per_food_kg: float = 1000.0

    @cached_property
    def cors_origins(self) -> list[str]:
        origins = {self.frontend_url.rstrip("/")}
        if self.environment == "development":
            origins |= {"http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"}
        origins |= {o.strip().rstrip("/") for o in self.extra_cors_origins.split(",") if o.strip()}
        return sorted(origins)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @cached_property
    def tz(self) -> tzinfo:
        try:
            return ZoneInfo(self.app_timezone)
        except (ZoneInfoNotFoundError, ValueError):
            return timezone.utc


settings = Settings()

if settings.is_production and settings.jwt_secret == "development-secret-change-me":
    raise RuntimeError("JWT_SECRET must be set in production")
