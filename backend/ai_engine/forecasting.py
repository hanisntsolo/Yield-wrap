"""Predictive demand forecasting: a RandomForestRegressor trained on daily `analytics_logs`.

Features: cyclical day-of-week and month (sin/cos), is_holiday, season, avg_temp, prev_7day_avg.
Target:   total_kg_needed (kg NGOs took on that day; falls back to kg redistributed).
The trained model is persisted with joblib and retrained when it is older than 7 days. With fewer
than 30 days of history a day-of-week baseline is returned instead.
"""
import asyncio
import logging
import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import mean

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor

from ai_engine.geo import clamp
from config import settings
from services.db_service import as_utc, db, utcnow

logger = logging.getLogger("yieldwrap.forecast")

FEATURES = ["dow_sin", "dow_cos", "month_sin", "month_cos", "is_holiday", "season", "avg_temp", "prev_7day_avg"]
MIN_TRAINING_DAYS = 30
RETRAIN_AFTER = timedelta(days=7)
MODEL_FILE = "demand_forecast.joblib"
DEFAULT_DAILY_KG = 50.0
MAX_HISTORY_DAYS = 730
# Fixed-date public holidays (month, day); moving holidays are not modelled.
HOLIDAYS = {(1, 1), (1, 26), (5, 1), (8, 15), (10, 2), (12, 25)}

_bundle: dict | None = None
_lock = asyncio.Lock()


def is_holiday(day: date) -> bool:
    return (day.month, day.day) in HOLIDAYS


def season(day: date) -> int:
    """0 winter (Dec–Feb), 1 spring, 2 summer, 3 autumn."""
    return (day.month % 12) // 3


def climatology_temp(day: date) -> float:
    """Typical daily mean temperature (°C) used when no observation is available."""
    return 27.0 + 4.0 * math.sin(2 * math.pi * (day.timetuple().tm_yday - 29) / 365)


def feature_row(day: date, avg_temp: float | None, prev_7day_avg: float) -> list[float]:
    dow, month = day.weekday(), day.month - 1
    return [
        math.sin(2 * math.pi * dow / 7),
        math.cos(2 * math.pi * dow / 7),
        math.sin(2 * math.pi * month / 12),
        math.cos(2 * math.pi * month / 12),
        float(is_holiday(day)),
        float(season(day)),
        float(avg_temp if avg_temp is not None else climatology_temp(day)),
        float(prev_7day_avg),
    ]


def _log_date(value) -> date:
    return as_utc(value).date() if isinstance(value, datetime) else date.fromisoformat(str(value)[:10])


def prepare_history(logs: list[dict]) -> list[tuple[date, float, float | None]]:
    """[(date, kg_needed, avg_temp)] sorted by date, one entry per day."""
    by_day: dict[date, tuple[float, float | None]] = {}
    for log in logs:
        kg = log.get("total_kg_needed")
        if kg is None:
            kg = log.get("total_kg_redistributed")
        if kg is None:
            continue
        by_day[_log_date(log["date"])] = (float(kg), log.get("avg_temp"))
    return [(day, kg, temp) for day, (kg, temp) in sorted(by_day.items())]


def build_training_set(history: list[tuple[date, float, float | None]]) -> tuple[np.ndarray, np.ndarray]:
    rows, targets = [], []
    for i, (day, kg, temp) in enumerate(history):
        previous = [h[1] for h in history[max(0, i - 7) : i]]
        rows.append(feature_row(day, temp, mean(previous) if previous else kg))
        targets.append(kg)
    return np.array(rows), np.array(targets)


def train_model(history: list[tuple[date, float, float | None]]) -> dict:
    features, targets = build_training_set(history)
    model = RandomForestRegressor(n_estimators=100, min_samples_leaf=2, random_state=42, n_jobs=1)
    model.fit(features, targets)
    return {"model": model, "trained_at": utcnow(), "samples": len(targets), "features": FEATURES}


def predict(bundle: dict, history: list[tuple[date, float, float | None]], start: date, days: int) -> list[dict]:
    """Roll the forecast forward day by day, feeding predictions back into prev_7day_avg.
    Confidence comes from the spread of the individual trees and decays with the horizon."""
    model: RandomForestRegressor = bundle["model"]
    recent = [kg for _, kg, _ in history[-7:]] or [DEFAULT_DAILY_KG]
    forecast = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        row = np.array([feature_row(day, None, mean(recent[-7:]))])
        per_tree = np.array([tree.predict(row)[0] for tree in model.estimators_])
        predicted = max(0.1, float(per_tree.mean()))
        spread = float(per_tree.std())
        confidence = clamp(1 - spread / max(predicted, 1.0), 0.05, 0.99) * (1 - 0.02 * offset)
        forecast.append({"date": day.isoformat(), "predicted_kg": round(predicted, 2), "confidence": round(confidence, 3)})
        recent.append(predicted)
    return forecast


def baseline_forecast(history: list[tuple[date, float, float | None]], start: date, days: int) -> list[dict]:
    """Day-of-week average of the last four weeks (or a fixed default with no history)."""
    window = history[-28:]
    overall = mean(kg for _, kg, _ in window) if window else DEFAULT_DAILY_KG
    by_weekday: dict[int, list[float]] = {}
    for day, kg, _ in window:
        by_weekday.setdefault(day.weekday(), []).append(kg)
    forecast = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        values = by_weekday.get(day.weekday())
        predicted = max(0.1, mean(values) if values else overall)
        forecast.append({"date": day.isoformat(), "predicted_kg": round(predicted, 2), "confidence": 0.35 if window else 0.2})
    return forecast


def _model_path() -> Path:
    return Path(settings.model_dir) / MODEL_FILE


def _load_bundle() -> dict | None:
    path = _model_path()
    if not path.is_file():
        return None
    try:
        return joblib.load(path)
    except Exception:  # noqa: BLE001 - a corrupt/incompatible model file is simply retrained
        logger.warning("Could not load %s; it will be retrained", path)
        return None


def _save_bundle(bundle: dict) -> None:
    path = _model_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, path)


def _is_stale(bundle: dict | None, now: datetime) -> bool:
    return bundle is None or now - as_utc(bundle["trained_at"]) > RETRAIN_AFTER


async def load_history(before: date) -> list[tuple[date, float, float | None]]:
    """Completed days only (today's log is still accumulating)."""
    since = datetime.combine(before - timedelta(days=MAX_HISTORY_DAYS), datetime.min.time(), tzinfo=timezone.utc)
    logs = await db.analytics_logs.find({"date": {"$gte": since}}).sort("date", 1).to_list(None)
    return [entry for entry in prepare_history(logs) if entry[0] < before]


async def get_model(history, *, force_retrain: bool = False) -> dict | None:
    global _bundle
    if len(history) < MIN_TRAINING_DAYS:
        return None
    async with _lock:
        now = utcnow()
        if _bundle is None:
            _bundle = await asyncio.to_thread(_load_bundle)
        if force_retrain or _is_stale(_bundle, now):
            logger.info("Training demand forecast model on %d days", len(history))
            _bundle = await asyncio.to_thread(train_model, history)
            await asyncio.to_thread(_save_bundle, _bundle)
        return _bundle


async def forecast_demand(days_ahead: int = 7, *, force_retrain: bool = False) -> dict:
    """Return {"forecast": [{date, predicted_kg, confidence}], "model": {source, trained_at, samples}}."""
    today = utcnow().astimezone(settings.tz).date()
    start = today + timedelta(days=1)
    history = await load_history(today)
    bundle = await get_model(history, force_retrain=force_retrain)
    if bundle is None:
        return {
            "forecast": baseline_forecast(history, start, days_ahead),
            "model": {"source": "baseline", "trained_at": None, "samples": len(history)},
        }
    forecast = await asyncio.to_thread(predict, bundle, history, start, days_ahead)
    return {
        "forecast": forecast,
        "model": {"source": "random_forest", "trained_at": as_utc(bundle["trained_at"]).isoformat(), "samples": bundle["samples"]},
    }


def reset_cache() -> None:
    """Forget the in-memory model (tests use this between cases)."""
    global _bundle
    _bundle = None
