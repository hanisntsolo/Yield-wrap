"""Dashboard analytics and public impact metrics."""
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query

from config import settings
from services.analytics_service import (
    avg_delivery_minutes,
    day_bounds,
    delivered_kg,
    impact_from_kg,
    local_date,
    local_today,
    log_key,
)
from services.auth_service import get_current_user
from services.db_service import db, utcnow

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/public-impact")
async def public_impact():
    """Headline numbers for the landing page (no authentication)."""
    impact = impact_from_kg(await delivered_kg())
    return {
        "kg_saved": impact["kg_saved"],
        "meals_served": impact["meals_served"],
        "active_ngos": await db.ngos.count_documents({"is_active": True, "is_verified": True}),
        "co2_saved_kg": impact["co2_saved_kg"],
        "deliveries": await db.donations.count_documents({"status": "delivered"}),
        "volunteers": await db.volunteers.count_documents({}),
    }


@router.get("/dashboard")
async def dashboard(_: dict = Depends(get_current_user)):
    start, end = day_bounds(local_today())
    total = await delivered_kg()
    return {
        "donations_today": await db.donations.count_documents({"created_at": {"$gte": start, "$lt": end}}),
        "kg_redistributed_today": round(await delivered_kg({"delivered_at": {"$gte": start, "$lt": end}}), 1),
        "kg_redistributed_total": round(total, 1),
        "active_volunteers": await db.volunteers.count_documents({"availability": True}),
        "pending_matches": await db.donations.count_documents(
            {"status": {"$in": ["pending", "matched"]}, "ngo_accepted": {"$ne": True}}
        ),
        "awaiting_pickup": await db.donations.count_documents({"status": "matched", "ngo_accepted": True}),
        "in_transit": await db.donations.count_documents({"status": "in_transit"}),
        "meals_served_estimate": impact_from_kg(total)["meals_served"],
        "avg_delivery_time_min": await avg_delivery_minutes(utcnow() - timedelta(days=30)),
    }


@router.get("/donations/trend")
async def donation_trend(
    period: Literal["daily", "weekly"] = "daily",
    days: int = Query(30, ge=1, le=365),
    _: dict = Depends(get_current_user),
):
    """Donation count and kg per day/week. Live donations are aggregated directly; days covered only
    by imported/seeded history fall back to their `analytics_logs` entry."""
    today = local_today()
    first_day = today - timedelta(days=days - 1)
    start, _end = day_bounds(first_day)
    buckets = {first_day + timedelta(days=i): {"donations": 0, "kg": 0.0} for i in range(days)}

    async for donation in db.donations.find({"created_at": {"$gte": start}}, {"created_at": 1, "total_kg": 1}):
        day = local_date(donation["created_at"])
        if day in buckets:
            buckets[day]["donations"] += 1
            buckets[day]["kg"] += float(donation.get("total_kg", 0))
    async for log in db.analytics_logs.find({"date": {"$gte": log_key(first_day)}, "source": "seed"}):
        day = log["date"].date()
        if day in buckets and buckets[day]["donations"] == 0:
            buckets[day] = {"donations": log.get("total_donations", 0), "kg": float(log.get("total_kg_donated", 0))}

    if period == "weekly":
        weekly: dict = {}
        for day, values in buckets.items():
            week = day - timedelta(days=day.weekday())
            entry = weekly.setdefault(week, {"donations": 0, "kg": 0.0})
            entry["donations"] += values["donations"]
            entry["kg"] += values["kg"]
        buckets = weekly
    return [{"date": day.isoformat(), "donations": v["donations"], "kg": round(v["kg"], 1)} for day, v in sorted(buckets.items())]


@router.get("/food-types")
async def food_types(_: dict = Depends(get_current_user)):
    rows = await db.donations.aggregate(
        [
            {"$match": {"status": {"$ne": "cancelled"}}},
            {"$unwind": "$food_items"},
            {"$group": {"_id": "$food_items.category", "kg": {"$sum": "$food_items.quantity_kg"}, "count": {"$sum": 1}}},
        ]
    ).to_list(None)
    return sorted(
        ({"category": r["_id"], "kg": round(r["kg"], 1), "count": r["count"]} for r in rows if r["_id"]),
        key=lambda r: -r["kg"],
    )


@router.get("/volunteer-performance")
async def volunteer_performance(limit: int = Query(10, ge=1, le=100), _: dict = Depends(get_current_user)):
    volunteers = await db.volunteers.find({}).sort([("completed_deliveries", -1), ("rating", -1)]).to_list(limit)
    return [
        {
            "volunteer_id": str(v["_id"]),
            "name": v.get("name"),
            "vehicle_type": v.get("vehicle_type"),
            "completed_deliveries": v.get("completed_deliveries", 0),
            "rating": v.get("rating"),
            "hours_contributed": round(v.get("hours_contributed", 0), 1),
        }
        for v in volunteers
    ]


@router.get("/ngo-utilization")
async def ngo_utilization(_: dict = Depends(get_current_user)):
    received = {
        r["_id"]: r["kg"]
        for r in await db.donations.aggregate(
            [{"$match": {"status": "delivered"}}, {"$group": {"_id": "$matched_ngo_id", "kg": {"$sum": "$delivered_kg"}}}]
        ).to_list(None)
    }
    ngos = await db.ngos.find({"is_active": True}).to_list(None)
    rows = []
    for ngo in ngos:
        capacity = float(ngo.get("storage_capacity_kg") or 0)
        load = float(ngo.get("current_load_kg") or 0)
        rows.append(
            {
                "ngo_id": str(ngo["_id"]),
                "organization_name": ngo.get("organization_name"),
                "storage_capacity_kg": capacity,
                "current_load_kg": round(load, 1),
                "received_kg": round(received.get(ngo["_id"], 0), 1),
                "utilization_pct": round(100 * load / capacity, 1) if capacity else 0.0,
            }
        )
    return sorted(rows, key=lambda r: -r["utilization_pct"])


@router.get("/waste-saved")
async def waste_saved(_: dict = Depends(get_current_user)):
    impact = impact_from_kg(await delivered_kg())
    return {
        **impact,
        "factors": {
            "kg_per_meal": settings.kg_per_meal,
            "co2_kg_per_food_kg": settings.co2_kg_per_food_kg,
            "water_liters_per_food_kg": settings.water_liters_per_food_kg,
        },
    }
