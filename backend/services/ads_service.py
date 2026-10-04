"""Built-in direct-sold ad server: contextual selection by role, location and time of day."""
import random
from datetime import datetime

from ai_engine.geo import distance_km
from config import settings
from services.ad_market_service import digital_ads
from services.db_service import db, utcnow

SLOT_SIZES = {"leaderboard": (728, 90), "rectangle": (300, 250), "mobile": (320, 50)}
ALL_SLOTS = list(SLOT_SIZES)
DAYPARTS = {"breakfast": range(6, 11), "lunch": range(11, 16), "dinner": range(18, 23)}

# House inventory, inserted on startup when the `ads` collection is empty.
DEFAULT_ADS = [
    {
        "_id": "ad_freshpack",
        "title": "Compostable takeaway containers",
        "body": "Partner restaurants get 20% off bulk FreshPack orders — leak-proof and 100% compostable.",
        "cta": "Get the partner rate",
        "url": "https://example.com/freshpack",
        "sponsor": "FreshPack Supplies",
        "category": "restaurant_supply",
        "target_roles": ["donor"],
        "dayparts": [],
    },
    {
        "_id": "ad_chillchain",
        "title": "Cold storage on demand",
        "body": "Rent refrigerated units by the day to keep surplus food fresh until pickup.",
        "cta": "Check availability",
        "url": "https://example.com/chillchain",
        "sponsor": "ChillChain",
        "category": "restaurant_supply",
        "target_roles": ["donor", "ngo"],
        "dayparts": [],
    },
    {
        "_id": "ad_fuelsmart",
        "title": "Fuel discount for delivery volunteers",
        "body": "Show your YIELD WRAP volunteer profile at FuelSmart stations for a per-litre discount.",
        "cta": "Find a station",
        "url": "https://example.com/fuelsmart",
        "sponsor": "FuelSmart",
        "category": "logistics",
        "target_roles": ["volunteer"],
        "dayparts": [],
    },
    {
        "_id": "ad_greenride",
        "title": "Electric scooters for last-mile runs",
        "body": "First week free on GreenRide EV scooter rentals for registered volunteers.",
        "cta": "Claim free week",
        "url": "https://example.com/greenride",
        "sponsor": "GreenRide",
        "category": "logistics",
        "target_roles": ["volunteer"],
        "dayparts": [],
    },
    {
        "_id": "ad_bulkbasket",
        "title": "Wholesale staples for NGOs",
        "body": "Rice, lentils and oil at cost price for verified food banks and shelters.",
        "cta": "Open an NGO account",
        "url": "https://example.com/bulkbasket",
        "sponsor": "BulkBasket",
        "category": "ngo_supply",
        "target_roles": ["ngo"],
        "dayparts": [],
    },
    {
        "_id": "ad_morningbrew",
        "title": "Breakfast combo — coffee & fresh bake",
        "body": "Start your day at Morning Brew Café. Every combo funds a meal for a shelter.",
        "cta": "See the menu",
        "url": "https://example.com/morningbrew",
        "sponsor": "Morning Brew Café",
        "category": "food",
        "target_roles": [],
        "dayparts": ["breakfast"],
    },
    {
        "_id": "ad_lunchbox",
        "title": "Healthy lunch bowls delivered",
        "body": "Order a Lunchbox bowl today — surplus is donated through YIELD WRAP every evening.",
        "cta": "Order lunch",
        "url": "https://example.com/lunchbox",
        "sponsor": "Lunchbox Kitchens",
        "category": "food",
        "target_roles": [],
        "dayparts": ["lunch"],
    },
    {
        "_id": "ad_supperclub",
        "title": "Dinner for two, zero waste",
        "body": "Supper Club's zero-waste tasting menu — leftovers go to local NGOs, never the bin.",
        "cta": "Book a table",
        "url": "https://example.com/supperclub",
        "sponsor": "Supper Club",
        "category": "food",
        "target_roles": [],
        "dayparts": ["dinner"],
    },
    {
        "_id": "ad_partner",
        "title": "Become a Verified Partner",
        "body": "Get a Verified Partner badge on your profile and priority visibility across YIELD WRAP.",
        "cta": "Learn more",
        "url": "mailto:partners@yieldwrap.org",
        "sponsor": "YIELD WRAP",
        "category": "house",
        "target_roles": [],
        "dayparts": [],
        "weight": 0.6,
    },
]


async def ensure_default_ads() -> None:
    if await db.ads.count_documents({}) == 0:
        now = utcnow()
        await db.ads.insert_many(
            [
                {"slots": ALL_SLOTS, "image_url": None, "active": True, "weight": 1.0, "location": None, "created_at": now, **ad}
                for ad in DEFAULT_ADS
            ]
        )


def current_daypart(now: datetime) -> str | None:
    hour = now.astimezone(settings.tz).hour
    return next((name for name, hours in DAYPARTS.items() if hour in hours), None)


def ad_weight(ad: dict, role: str | None, location: dict | None, daypart: str | None) -> float:
    targets = ad.get("target_roles") or []
    if targets and role not in targets:
        return 0.0
    weight = float(ad.get("weight", 1.0)) * (2.0 if targets else 1.0)
    dayparts = ad.get("dayparts") or []
    if dayparts:
        weight *= 2.5 if daypart in dayparts else 0.2
    geo = ad.get("location")
    if geo and location:
        distance = distance_km(location, geo)
        if distance is not None:
            weight *= 1.5 if distance <= geo.get("radius_km", 10) else 0.3
    return weight


async def choose_ad(slot: str, user: dict | None, now: datetime | None = None, rng: random.Random | None = None) -> dict | None:
    now = now or utcnow()
    # Paid digital campaigns (higher weight) compete with the house inventory, which remains the fallback.
    ads = await digital_ads(slot) + await db.ads.find({"active": True, "slots": slot}).to_list(None)
    role = user["role"] if user else None
    location = user.get("location") if user else None
    daypart = current_daypart(now)
    weights = [ad_weight(ad, role, location, daypart) for ad in ads]
    if not any(weights):
        return None
    ad = (rng or random).choices(ads, weights=weights, k=1)[0]
    width, height = SLOT_SIZES[slot]
    return {
        "id": str(ad["_id"]),
        "title": ad["title"],
        "body": ad["body"],
        "image_url": ad.get("image_url"),
        "cta": ad.get("cta", "Learn more"),
        "url": ad["url"],
        "sponsor": ad.get("sponsor", ""),
        "slot": slot,
        "width": width,
        "height": height,
        "category": ad.get("category"),
        "is_paid": bool(ad.get("is_paid", False)),
    }
