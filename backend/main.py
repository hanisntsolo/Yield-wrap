"""YIELD WRAP API — FastAPI entry point."""
import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from errors import register_error_handlers
from routers import ad_market, admin, ads, analytics, auth, donor, forecast, matching, ngo, notifications, routing, volunteer, ws
from services import fcm_service, maps_service
from services.ads_service import ensure_default_ads
from services.db_service import get_database, setup_indexes
from services.scheduler import scheduler_loop

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("yieldwrap")

STARTUP_DB_ATTEMPTS = 15


async def wait_for_database() -> None:
    """MongoDB may still be booting when the API container starts (docker compose)."""
    for attempt in range(1, STARTUP_DB_ATTEMPTS + 1):
        try:
            await setup_indexes()
            return
        except Exception as exc:  # noqa: BLE001
            if attempt == STARTUP_DB_ATTEMPTS:
                raise
            logger.warning("MongoDB not ready (%s); retrying (%d/%d)", type(exc).__name__, attempt, STARTUP_DB_ATTEMPTS)
            await asyncio.sleep(2)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await wait_for_database()
    await ensure_default_ads()
    logger.info(
        "YIELD WRAP API ready (env=%s, maps=%s, push=%s)",
        settings.environment,
        "google" if maps_service.is_enabled() else "fallback",
        "fcm" if fcm_service.is_enabled() else "inbox-only",
    )
    scheduler = asyncio.create_task(scheduler_loop()) if settings.enable_scheduler else None
    try:
        yield
    finally:
        if scheduler:
            scheduler.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await scheduler


app = FastAPI(
    title="YIELD WRAP API",
    description="AI-powered real-time food redistribution: donors, NGOs, volunteers and admins.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    if request.url.path.startswith("/api/") and request.method == "GET":
        response.headers.setdefault("Cache-Control", "no-store")
    return response


register_error_handlers(app)

for module in (auth, donor, ngo, volunteer, admin, matching, forecast, routing, notifications, analytics, ads, ad_market, ws):
    app.include_router(module.router)


@app.get("/", tags=["meta"])
async def root():
    return {"name": "YIELD WRAP API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", tags=["meta"])
async def health():
    try:
        await get_database().command("ping")
        database = "ok"
    except Exception:  # noqa: BLE001
        database = "unavailable"
    return {
        "status": "ok" if database == "ok" else "degraded",
        "database": database,
        "maps_provider": "google" if maps_service.is_enabled() else "fallback",
        "push_notifications": fcm_service.is_enabled(),
    }
