"""AI engine: route optimisation (single pickup → delivery, and multi-stop)."""
from fastapi import APIRouter, Depends

from ai_engine.route_optimizer import optimize_multi_stop, optimize_route
from models.matching import MultiRouteRequest, RouteRequest
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/route")
async def route(body: RouteRequest, _: dict = Depends(get_current_user)):
    return await optimize_route(
        body.volunteer_location.model_dump(),
        body.pickup_location.model_dump(),
        body.delivery_location.model_dump(),
        body.vehicle_type,
    )


@router.post("/route/multi")
async def multi_stop_route(body: MultiRouteRequest, _: dict = Depends(get_current_user)):
    return optimize_multi_stop(body.start.model_dump(), [stop.model_dump() for stop in body.stops], body.vehicle_type)
