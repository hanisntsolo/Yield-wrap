"""Seed a realistic demo network (Mumbai) through the real API, then backdate history.

Every account, donation and campaign is created through the HTTP API so all business rules apply.
Afterwards timestamps are shifted directly in MongoDB to spread the history over the past weeks,
and older daily analytics are added as `source: "seed"` logs so the demand forecast has data to learn from.

Usage (API must be running against the same database):
    python scripts/seed_demo.py --api http://localhost:8010 \
        --mongo "mongodb://user:pass@localhost:27017/?authSource=admin" --db yieldwrap_demo --reset

The API needs ADMIN_SIGNUP_CODE set; pass it with --admin-code. All demo accounts use the password
printed at the end.
"""
import argparse
import math
import random
import sys
import zlib
import struct
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
from pymongo import MongoClient

PASSWORD = "Demo@1234"
DOMAIN = "yieldwrap.demo"
IMAGES_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "images"

DONORS = [
    ("Saffron Table", "Aarav Mehta", "Bandra West, Mumbai", 19.0596, 72.8295),
    ("Coastal Curry House", "Neha Pillai", "Juhu, Mumbai", 19.1075, 72.8263),
    ("Green Leaf Café", "Rohan Desai", "Powai, Mumbai", 19.1176, 72.9060),
    ("Hotel Seaview Residency", "Farah Khan", "Marine Drive, Mumbai", 18.9440, 72.8231),
    ("Baker's Basket", "Ishaan Kapoor", "Andheri West, Mumbai", 19.1364, 72.8296),
    ("Sunrise Caterers", "Meera Iyer", "Dadar, Mumbai", 19.0178, 72.8478),
    ("FreshMart Grocers", "Kabir Shah", "Goregaon East, Mumbai", 19.1663, 72.8526),
    ("Mumbai Masala Hotel", "Priya Nair", "Colaba, Mumbai", 18.9067, 72.8147),
]
NGOS = [
    ("Annapurna Food Bank", "Sunita Rao", "Andheri East, Mumbai", 19.1136, 72.8697, ["cooked", "packaged", "produce", "raw"], 800, 650),
    ("Roti Ghar Shelter", "Imran Sheikh", "Dharavi, Mumbai", 19.0380, 72.8538, ["cooked", "packaged"], 400, 320),
    ("Seva Community Kitchen", "Lakshmi Menon", "Bandra East, Mumbai", 19.0607, 72.8410, ["cooked", "raw", "produce", "dairy"], 600, 480),
    ("Hope Children's Home", "Daniel D'Souza", "Kurla, Mumbai", 19.0726, 72.8845, ["cooked", "packaged", "dairy"], 300, 140),
    ("Asha Women's Shelter", "Kavita Joshi", "Byculla, Mumbai", 18.9790, 72.8330, ["cooked", "packaged", "produce"], 350, 210),
]
VOLUNTEERS = [
    ("Arjun Patil", "bike", 19.0650, 72.8350, 4.9),
    ("Sneha Kulkarni", "car", 19.1100, 72.8500, 4.8),
    ("Vikram Singh", "van", 19.0400, 72.8600, 4.7),
    ("Ananya Gupta", "bike", 19.1200, 72.8900, 4.9),
    ("Rahul Verma", "car", 18.9800, 72.8300, 4.6),
    ("Zara Ali", "bike", 19.0200, 72.8450, 4.8),
    ("Karthik Reddy", "on_foot", 19.0590, 72.8300, 4.5),
    ("Pooja Bhatt", "car", 19.1400, 72.8350, 4.7),
]
BUSINESSES = [
    ("Urban Tiffin Co.", "restaurant", "Nikhil Jain", "https://example.com/urban-tiffin"),
    ("FreshPack Packaging", "retail", "Ayesha Siddiqui", "https://example.com/freshpack"),
    ("GreenRide EV Scooters", "other", "Siddharth Rao", "https://example.com/greenride"),
]
CREATIVES = [
    # owner kind, owner index, title, tagline, image file
    ("business", 0, "Urban Tiffin Co.", "Home-style tiffins delivered daily — scan for ₹50 off", "kitchen"),
    ("business", 1, "FreshPack Packaging", "Compostable boxes for every restaurant", "packets"),
    ("business", 2, "GreenRide EV", "First week free on electric scooters", "delivery"),
    ("donor", 0, "Saffron Table", "Proud food donor · Bandra West", "hero"),
    ("donor", 4, "Baker's Basket", "Fresh bakes daily · zero waste", "bakery"),
]
MENU = {
    "cooked": ["Veg biryani", "Dal tadka & rice", "Paneer butter masala", "Chole with jeera rice", "Mixed veg pulao", "Rajma chawal", "Idli & sambar", "Veg thali packs"],
    "packaged": ["Packaged snacks", "Juice cartons", "Biscuit packs", "Ready-to-eat meals"],
    "produce": ["Seasonal vegetables", "Bananas", "Tomatoes & onions", "Leafy greens"],
    "dairy": ["Curd cups", "Milk packets", "Paneer blocks"],
    "raw": ["Rice (raw)", "Atta flour", "Toor dal"],
}
DONOR_MIX = {0: "cooked", 1: "cooked", 2: "cooked", 3: "cooked", 4: "packaged", 5: "cooked", 6: "produce", 7: "cooked"}


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def tiny_png(rgb=(26, 122, 74), w=240, h=120) -> bytes:
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def image_bytes(key: str) -> tuple[str, bytes, str]:
    """A curated photo from frontend/public/images if present, else a flat brand-colour PNG."""
    for path in sorted(IMAGES_DIR.glob(f"{key}*.jpg")) + sorted(IMAGES_DIR.glob(f"*{key}*.jpg")):
        data = path.read_bytes()
        if len(data) <= 5 * 1024 * 1024 and data[:3] == b"\xff\xd8\xff":
            return path.name, data, "image/jpeg"
    return f"{key}.png", tiny_png(), "image/png"


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")

    def client(self) -> httpx.Client:
        return httpx.Client(base_url=self.base, timeout=30)

    def register(self, body: dict) -> httpx.Client:
        c = self.client()
        r = c.post("/api/auth/register", json=body)
        if r.status_code == 409:
            r = c.post("/api/auth/login", json={"email": body["email"], "password": body["password"]})
        r.raise_for_status()
        return c


def ok(r: httpx.Response, what: str) -> dict:
    if r.status_code >= 400:
        raise SystemExit(f"{what} failed: {r.status_code} {r.text[:300]}")
    return r.json()


def location(address, lat, lng):
    return {"address": address, "lat": lat, "lng": lng}


def build_accounts(api: Api, admin_code: str) -> dict:
    accounts = {"donors": [], "ngos": [], "volunteers": [], "businesses": []}
    accounts["admin"] = api.register({
        "name": "Ritika Sharma", "email": f"admin@{DOMAIN}", "password": PASSWORD, "role": "admin",
        "phone": "+91 98200 00001", "location": location("Lower Parel, Mumbai", 18.9950, 72.8300), "admin_code": admin_code,
    })
    for i, (org, person, addr, lat, lng) in enumerate(DONORS):
        accounts["donors"].append(api.register({
            "name": org, "email": f"donor{i + 1}@{DOMAIN}", "password": PASSWORD, "role": "donor",
            "phone": f"+91 98201 {10000 + i:05d}", "location": location(addr, lat, lng),
        }))
    for i, (org, person, addr, lat, lng, foods, cap, benef) in enumerate(NGOS):
        accounts["ngos"].append(api.register({
            "name": person, "email": f"ngo{i + 1}@{DOMAIN}", "password": PASSWORD, "role": "ngo",
            "phone": f"+91 98202 {20000 + i:05d}", "location": location(addr, lat, lng),
            "organization_name": org, "registration_number": f"MH/NGO/{2015 + i}/{4100 + i * 37}",
            "accepted_food_types": foods, "storage_capacity_kg": cap, "beneficiary_count": benef,
        }))
    for i, (name, vehicle, lat, lng, _) in enumerate(VOLUNTEERS):
        accounts["volunteers"].append(api.register({
            "name": name, "email": f"volunteer{i + 1}@{DOMAIN}", "password": PASSWORD, "role": "volunteer",
            "phone": f"+91 98203 {30000 + i:05d}", "location": location("Mumbai", lat, lng), "vehicle_type": vehicle,
        }))
    for i, (biz, btype, person, url) in enumerate(BUSINESSES):
        accounts["businesses"].append(api.register({
            "name": person, "email": f"business{i + 1}@{DOMAIN}", "password": PASSWORD, "role": "business",
            "phone": f"+91 98204 {40000 + i:05d}", "location": location("Mumbai", 19.07, 72.87),
            "business_name": biz, "business_type": btype, "website": url,
        }))
    admin = accounts["admin"]
    for c in accounts["ngos"]:
        uid = ok(c.get("/api/auth/me"), "me")["user"]["id"]
        ok(admin.put(f"/api/admin/users/{uid}/verify", json={"is_verified": True}), "verify ngo")
    for c, (_, _, lat, lng, _) in zip(accounts["volunteers"], VOLUNTEERS):
        ok(c.put("/api/volunteer/availability", json={"availability": True}), "availability")
        ok(c.put("/api/volunteer/location", json={"lat": lat, "lng": lng}), "location")
    log(f"accounts: 1 admin, {len(DONORS)} donors, {len(NGOS)} NGOs, {len(VOLUNTEERS)} volunteers, {len(BUSINESSES)} businesses")
    return accounts


def build_ad_market(accounts: dict) -> dict:
    admin = accounts["admin"]
    creatives = {}
    for kind, idx, title, tagline, img in CREATIVES:
        owner = accounts["businesses" if kind == "business" else "donors"][idx]
        name, data, mime = image_bytes(img)
        url = BUSINESSES[idx][3] if kind == "business" else None
        fields = {"title": title, "tagline": tagline, **({"url": url} if url else {})}
        cr = ok(owner.post("/api/ads/creatives", data=fields, files={"image": (name, data, mime)}), "creative")
        ok(admin.put(f"/api/admin/ad-creatives/{cr['id']}/review", json={"approved": True}), "approve")
        creatives[(kind, idx)] = cr["id"]
    # one design waiting for review so the admin queue isn't empty
    owner = accounts["businesses"][2]
    name, data, mime = image_bytes("volunteers")
    ok(owner.post("/api/ads/creatives", data={"title": "GreenRide Monsoon Offer", "tagline": "Ride dry this monsoon"},
                  files={"image": (name, data, mime)}), "pending creative")
    for biz, pack in zip(accounts["businesses"], ["pro", "growth", "growth"]):
        order = ok(biz.post("/api/ads/orders", json={"pack_id": pack}), "order")
        ok(biz.post(f"/api/ads/orders/{order['order_id']}/verify", json={}), "verify order")
    ok(accounts["donors"][0].post("/api/ads/orders", json={"pack_id": "starter"}), "donor order")
    # NGO ad spaces
    spaces = []
    for c, name, size, price in [
        (accounts["ngos"][0], "Dining hall notice board", "A2 poster", 60),
        (accounts["ngos"][2], "Kitchen entrance wall", "A1 poster", 80),
        (accounts["ngos"][1], "Meal counter standee", "A3 poster", 40),
    ]:
        spaces.append(ok(c.post("/api/ngo/ad-spaces", json={"name": name, "description": "Seen by 300+ visitors every day", "size": size, "credits_per_week": price}), "space"))
    log(f"ad market: {len(creatives)} approved creatives (+1 pending), 3 paid credit orders, {len(spaces)} NGO ad spaces")
    return {"creatives": creatives, "spaces": spaces}


def launch_campaigns(accounts: dict, market: dict) -> None:
    b0, b1, b2 = accounts["businesses"]
    cr = market["creatives"]
    ok(b0.post("/api/ads/campaigns", json={"type": "packet", "creative_id": cr[("business", 0)], "packets": 400}), "packet campaign")
    ok(b1.post("/api/ads/campaigns", json={"type": "packet", "creative_id": cr[("business", 1)], "packets": 150,
                                           "target": {"lat": 19.06, "lng": 72.84, "radius_km": 12}}), "targeted campaign")
    ok(b2.post("/api/ads/campaigns", json={"type": "digital", "creative_id": cr[("business", 2)], "impressions": 20000}), "digital campaign")
    poster = ok(b0.post("/api/ads/campaigns", json={"type": "ngo_poster", "creative_id": cr[("business", 0)],
                                                    "ad_space_id": market["spaces"][0]["id"], "weeks": 4}), "poster")
    ok(accounts["ngos"][0].post(f"/api/ngo/ad-bookings/{poster['id']}/displayed"), "poster displayed")
    ok(b1.post("/api/ads/campaigns", json={"type": "ngo_poster", "creative_id": cr[("business", 1)],
                                           "ad_space_id": market["spaces"][1]["id"], "weeks": 2}), "poster requested")
    log("campaigns: 2 packet, 1 digital, 2 NGO posters (1 live, 1 awaiting NGO)")


def donation_body(rng: random.Random, donor_idx: int, own_creative: str | None) -> dict:
    org, _, addr, lat, lng = DONORS[donor_idx]
    main = DONOR_MIX[donor_idx]
    items = []
    for n in range(rng.choice([1, 1, 2, 2, 3])):
        cat = main if n == 0 else rng.choice(["cooked", "packaged", "produce", "dairy"])
        items.append({
            "name": rng.choice(MENU[cat]), "category": cat,
            "quantity_kg": round(rng.uniform(4, 35) if cat == "cooked" else rng.uniform(3, 20), 1),
            "expiry_time": (datetime.now(timezone.utc) + timedelta(hours=rng.uniform(4, 30))).isoformat(),
            "allergens": rng.choice([[], [], ["dairy"], ["gluten"], ["nuts"]]),
        })
    packets = int(sum(i["quantity_kg"] for i in items) / 0.4) if main == "cooked" else 0
    body = {
        "food_items": items,
        "pickup_location": location(f"{org}, {addr}", lat + rng.uniform(-0.002, 0.002), lng + rng.uniform(-0.002, 0.002)),
        "urgency_level": rng.choices(["low", "medium", "high", "critical"], [2, 5, 3, 1])[0],
        "packet_count": packets,
    }
    if packets and own_creative and rng.random() < 0.7:
        body["own_ad_creative_id"] = own_creative
    return body


def find_client_for(accounts, ngo_user_id, me_cache):
    for c in accounts["ngos"]:
        if me_cache.setdefault(id(c), ok(c.get("/api/auth/me"), "me")["user"]["id"]) == ngo_user_id:
            return c
    return None


def run_lifecycle(accounts: dict, did: str, final: str, rng: random.Random, me_cache: dict) -> str | None:
    """Drive one donation to `final` (pending|matched|accepted|in_transit|delivered|cancelled)."""
    donor_c = None
    for c in accounts["donors"]:
        if c.get(f"/api/donor/donations/{did}").status_code == 200:
            donor_c = c
            break
    match = ok(donor_c.post(f"/api/ai/match/{did}"), "match")
    if final == "pending":
        return None
    if final == "cancelled":
        ok(donor_c.delete(f"/api/donor/donations/{did}"), "cancel")
        return None
    d = match["donation"]
    if not d.get("matched_ngo_user_id") and not d.get("matched_ngo_id"):
        return None
    if final == "matched":
        return None
    # the offered NGO accepts
    ngo_c = None
    for c in accounts["ngos"]:
        avail = c.get("/api/ngo/available-donations").json()
        if any(x["id"] == did and x.get("offer_type") == "offer" for x in avail):
            ngo_c = c
            break
    if ngo_c is None:
        return None
    acc = ok(ngo_c.post(f"/api/ngo/accept/{did}"), "accept")
    assignment = acc.get("volunteer_assignment")
    if not assignment:
        return None
    vol_c = None
    for c in accounts["volunteers"]:
        if any(t["id"] == did for t in c.get("/api/volunteer/tasks").json()):
            vol_c = c
            break
    if vol_c is None or final == "accepted":
        return None
    ok(vol_c.post(f"/api/volunteer/tasks/{did}/accept"), "vol accept")
    ok(vol_c.put(f"/api/volunteer/tasks/{did}/status", json={"status": "at_pickup"}), "at pickup")
    don = ok(donor_c.get(f"/api/donor/donations/{did}"), "get")
    total = (don.get("packaging") or {}).get("stickers_total") or 0
    body = {"status": "picked_up"}
    if total:
        body["stickers_applied"] = total if rng.random() < 0.85 else max(0, total - rng.randint(1, max(1, total // 10)))
    ok(vol_c.put(f"/api/volunteer/tasks/{did}/status", json=body), "picked up")
    if final == "in_transit":
        return None
    kg = don["total_kg"]
    ok(vol_c.put(f"/api/volunteer/tasks/{did}/status", json={
        "status": "delivered", "receiver_name": rng.choice(["Asha", "Ramesh", "Fatima", "Joseph", "Geeta", "Sanjay"]),
        "quantity_confirmed_kg": round(kg * rng.uniform(0.95, 1.0), 1)}), "delivered")
    return "delivered"


DATE_FIELDS = ["created_at", "updated_at", "matched_at", "accepted_at", "at_pickup_at", "picked_up_at", "delivered_at",
               "cancelled_at", "expired_at", "last_match_attempt", "offer_sent_at", "earliest_expiry"]


def shift_doc_dates(db, did, created_target: datetime, rng: random.Random) -> None:
    from bson import ObjectId
    doc = db.donations.find_one({"_id": ObjectId(did)})
    delta = created_target - doc["created_at"].replace(tzinfo=timezone.utc)
    changes = {}
    for f in DATE_FIELDS:
        if isinstance(doc.get(f), datetime):
            changes[f] = doc[f].replace(tzinfo=timezone.utc) + delta
    # realistic durations: match in minutes, pickup within an hour, delivery 20–70 min later
    if doc.get("delivered_at"):
        matched = created_target + timedelta(minutes=rng.uniform(1, 6))
        accepted = matched + timedelta(minutes=rng.uniform(3, 25))
        at_pickup = accepted + timedelta(minutes=rng.uniform(10, 35))
        picked = at_pickup + timedelta(minutes=rng.uniform(3, 12))
        delivered = picked + timedelta(minutes=rng.uniform(18, 70))
        changes.update(matched_at=matched, accepted_at=accepted, at_pickup_at=at_pickup, picked_up_at=picked, delivered_at=delivered)
        if doc.get("delivery_record"):
            changes["delivery_record.delivered_at"] = delivered
    if isinstance(doc.get("food_items"), list):
        changes["food_items"] = [{**i, "expiry_time": (i["expiry_time"].replace(tzinfo=timezone.utc) + delta) if isinstance(i.get("expiry_time"), datetime) else i.get("expiry_time")} for i in doc["food_items"]]
    if (doc.get("packaging") or {}).get("stickers_applied", {}) and isinstance(doc["packaging"]["stickers_applied"].get("applied_at"), datetime):
        changes["packaging.stickers_applied.applied_at"] = changes.get("picked_up_at", doc["packaging"]["stickers_applied"]["applied_at"])
    db.donations.update_one({"_id": doc["_id"]}, {"$set": changes})


def seed_history(api: Api, db, accounts: dict, market: dict, days: int, per_day: tuple[int, int], seed: int) -> None:
    rng = random.Random(seed)
    me_cache: dict = {}
    own = {0: market["creatives"].get(("donor", 0)), 4: market["creatives"].get(("donor", 4))}
    now = datetime.now(timezone.utc)
    delivered = 0
    total = 0
    for back in range(days, 0, -1):
        day = now - timedelta(days=back)
        weekend = day.weekday() >= 5
        n = rng.randint(*per_day) + (2 if weekend else 0)
        for _ in range(n):
            di = rng.randrange(len(DONORS))
            r = accounts["donors"][di].post("/api/donor/donations", json=donation_body(rng, di, own.get(di)))
            if r.status_code >= 400:
                continue
            did = r.json()["id"]
            final = rng.choices(["delivered", "cancelled", "expired"], [90, 4, 6])[0]
            if final == "expired":
                run_lifecycle(accounts, did, "matched", rng, me_cache)
                db.donations.update_one({"_id": __import__("bson").ObjectId(did)}, {"$set": {"status": "expired", "expired_at": datetime.now(timezone.utc), "task_stage": None}})
            elif run_lifecycle(accounts, did, final, rng, me_cache) == "delivered":
                delivered += 1
            hour = rng.choice([12, 13, 14, 15, 21, 22, 22, 23]) - 5.5  # lunch / dinner service, IST → UTC
            created = day.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(hours=hour, minutes=rng.uniform(0, 50))
            shift_doc_dates(db, did, created, rng)
            total += 1
        if back % 10 == 0:
            log(f"history: {days - back}/{days} days, {total} donations, {delivered} delivered")
    log(f"history: {total} donations over {days} days ({delivered} delivered)")


def seed_live(accounts: dict, market: dict, seed: int) -> None:
    """Donations in every live stage so dashboards, maps and the priority queue have something to show."""
    rng = random.Random(seed + 1)
    me_cache: dict = {}
    own = {0: market["creatives"].get(("donor", 0)), 4: market["creatives"].get(("donor", 4))}
    plan = ["in_transit", "in_transit", "accepted", "accepted", "matched", "matched", "pending", "delivered", "delivered", "delivered"]
    counts: dict = {}
    for i, stage in enumerate(plan):
        di = i % len(DONORS)
        r = accounts["donors"][di].post("/api/donor/donations", json=donation_body(rng, di, own.get(di)))
        if r.status_code >= 400:
            continue
        run_lifecycle(accounts, r.json()["id"], stage, rng, me_cache)
        counts[stage] = counts.get(stage, 0) + 1
    # spread volunteers on the move around the city
    for c, (_, _, lat, lng, _) in zip(accounts["volunteers"], VOLUNTEERS):
        c.put("/api/volunteer/location", json={"lat": lat + rng.uniform(-0.01, 0.01), "lng": lng + rng.uniform(-0.01, 0.01)})
    log(f"live: {counts}")


def seed_analytics_logs(db, days_back_start: int, days_back_end: int, seed: int) -> None:
    """Older daily demand history (source: seed) so the Random Forest forecast has >30 days to learn from."""
    rng = random.Random(seed + 2)
    today = datetime.now(timezone.utc).date()
    docs = []
    for back in range(days_back_start, days_back_end, -1):
        d = today - timedelta(days=back)
        weekly = 1.25 if d.weekday() >= 5 else 1.0
        seasonal = 1 + 0.15 * math.sin(2 * math.pi * d.timetuple().tm_yday / 365)
        needed = round(160 * weekly * seasonal * rng.uniform(0.85, 1.15), 1)
        redistributed = round(needed * rng.uniform(0.7, 0.95), 1)
        docs.append({
            "date": d.isoformat(), "total_donations": int(redistributed / 14), "total_kg_donated": round(redistributed * 1.08, 1),
            "total_kg_redistributed": redistributed, "total_kg_wasted": round(redistributed * rng.uniform(0.02, 0.08), 1),
            "total_kg_needed": needed, "active_ngos": 5, "active_volunteers": 8, "avg_delivery_time_min": round(rng.uniform(32, 55), 1),
            "meals_served_estimate": int(redistributed / 0.4), "avg_temp": round(29 + 3 * math.sin(2 * math.pi * (d.timetuple().tm_yday - 100) / 365), 1),
            "is_holiday": False, "source": "seed", "updated_at": datetime.now(timezone.utc),
        })
    for doc in docs:
        db.analytics_logs.update_one({"date": doc["date"]}, {"$setOnInsert": doc}, upsert=True)
    log(f"analytics: {len(docs)} seeded daily logs")


def finalize(db, api_base: str) -> None:
    for name, _, _, _, rating in VOLUNTEERS:
        db.volunteers.update_one({"name": name}, {"$set": {"rating": rating}})
    model = Path(__file__).resolve().parents[1] / "ai_engine" / "models" / "demand_forecast.joblib"
    if model.exists():
        model.unlink()  # retrain on the seeded history on next forecast request


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", default="http://localhost:8000")
    ap.add_argument("--mongo", default="mongodb://localhost:27017")
    ap.add_argument("--db", default="yieldwrap_demo")
    ap.add_argument("--admin-code", required=True)
    ap.add_argument("--days", type=int, default=45, help="days of donation history created through the API")
    ap.add_argument("--reset", action="store_true", help="drop the database first (only allowed when its name contains 'demo')")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    client = MongoClient(args.mongo, tz_aware=True)
    db = client[args.db]
    if args.reset:
        if "demo" not in args.db:
            sys.exit("--reset is only allowed for databases whose name contains 'demo'")
        client.drop_database(args.db)
        print(f"dropped {args.db} — restart the API so it recreates indexes and house ads, then run again without --reset")
        return
    api = Api(args.api)
    if api.client().get("/api/health").json().get("database") != "ok":
        sys.exit("API is not healthy")
    print(f"Seeding {args.db} via {args.api}")
    accounts = build_accounts(api, args.admin_code)
    market = build_ad_market(accounts)
    launch_campaigns(accounts, market)
    seed_analytics_logs(db, 180, args.days, args.seed)
    seed_history(api, db, accounts, market, args.days, (2, 4), args.seed)
    seed_live(accounts, market, args.seed)
    finalize(db, args.api)
    # recompute daily logs for the live-history window
    print("Done. Log in with any of these (password %s):" % PASSWORD)
    for role, n in [("admin", 1), ("donor", len(DONORS)), ("ngo", len(NGOS)), ("volunteer", len(VOLUNTEERS)), ("business", len(BUSINESSES))]:
        print(f"  {role:<10} " + (f"admin@{DOMAIN}" if role == "admin" else f"{role}1@{DOMAIN} … {role}{n}@{DOMAIN}"))


if __name__ == "__main__":
    main()
