"""AI engine: predictive demand forecasting."""
from fastapi import APIRouter, Depends, Query

from ai_engine.forecasting import forecast_demand
from services.auth_service import get_current_user, require_roles

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/forecast")
async def forecast(days: int = Query(7, ge=1, le=30), _: dict = Depends(get_current_user)):
    return await forecast_demand(days)


@router.post("/forecast/retrain")
async def retrain(_: dict = Depends(require_roles("admin"))):
    return await forecast_demand(7, force_retrain=True)
