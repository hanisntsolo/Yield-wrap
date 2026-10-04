"""Tests for the RandomForest demand forecaster."""
import math
from datetime import date, datetime, timedelta, timezone

from ai_engine import forecasting
from services.analytics_service import local_today


async def seed_logs(db, days: int):
    today = local_today()
    docs = []
    for i in range(days, 0, -1):
        day = today - timedelta(days=i)
        weekend = day.weekday() >= 5
        docs.append(
            {
                "date": datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
                "total_kg_needed": 120 + (40 if weekend else 0) + 10 * math.sin(i / 3),
                "total_kg_redistributed": 100.0,
                "avg_temp": 27.0,
                "source": "seed",
            }
        )
    await db.analytics_logs.insert_many(docs)


async def test_forecast_returns_7_days(mock_db):
    await seed_logs(mock_db, 45)
    result = await forecasting.forecast_demand(7)
    assert result["model"]["source"] == "random_forest"
    assert result["model"]["samples"] == 45
    dates = [date.fromisoformat(f["date"]) for f in result["forecast"]]
    assert len(dates) == 7
    assert dates[0] == local_today() + timedelta(days=1)
    assert all(b - a == timedelta(days=1) for a, b in zip(dates, dates[1:]))


async def test_forecast_values_are_positive(mock_db):
    await seed_logs(mock_db, 45)
    for entry in (await forecasting.forecast_demand(7))["forecast"]:
        assert entry["predicted_kg"] > 0
        assert 0 < entry["confidence"] <= 1


async def test_forecast_learns_weekly_pattern(mock_db):
    await seed_logs(mock_db, 60)
    forecast = (await forecasting.forecast_demand(7))["forecast"]
    weekend = [f["predicted_kg"] for f in forecast if date.fromisoformat(f["date"]).weekday() >= 5]
    weekday = [f["predicted_kg"] for f in forecast if date.fromisoformat(f["date"]).weekday() < 5]
    assert min(weekend) > max(weekday)


async def test_baseline_with_little_history(mock_db):
    await seed_logs(mock_db, 10)
    result = await forecasting.forecast_demand(7)
    assert result["model"]["source"] == "baseline"
    assert len(result["forecast"]) == 7
    assert all(f["predicted_kg"] > 0 for f in result["forecast"])


async def test_baseline_with_no_history(mock_db):
    result = await forecasting.forecast_demand(3)
    assert [f["predicted_kg"] for f in result["forecast"]] == [forecasting.DEFAULT_DAILY_KG] * 3


async def test_model_is_persisted_and_reused(mock_db):
    await seed_logs(mock_db, 40)
    first = await forecasting.forecast_demand(7)
    assert forecasting._model_path().is_file()
    forecasting.reset_cache()
    second = await forecasting.forecast_demand(7)
    assert second["model"]["trained_at"] == first["model"]["trained_at"]
    assert second["forecast"] == first["forecast"]


def test_cyclical_features():
    row = forecasting.feature_row(date(2026, 1, 26), None, 100.0)
    assert len(row) == len(forecasting.FEATURES)
    assert row[4] == 1.0  # holiday
    assert row[5] == 0.0  # winter
