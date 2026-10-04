"""Packaging ad-tech (v2): credits, Razorpay, creatives, packet/poster/digital campaigns, stickers and revenue."""
import asyncio
import hashlib
import hmac
import json

import pytest
from bson import ObjectId

from config import settings
from services import razorpay_service
from tests.conftest import NEAR, donation_body, register

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
GIF = b"GIF89a" + b"\x00" * 64


def upload_creative(client, title="Fresh Bites", url="https://bites.example.com", image=PNG):
    files = {"image": ("ad.png", image, "image/png")} if image else None
    return client.post("/api/ads/creatives", data={"title": title, "tagline": "Tasty and local", "url": url}, files=files)


def approved_creative(client, admin, **kwargs) -> str:
    response = upload_creative(client, **kwargs)
    assert response.status_code == 201, response.text
    creative_id = response.json()["id"]
    reviewed = admin.put(f"/api/admin/ad-creatives/{creative_id}/review", json={"approved": True})
    assert reviewed.json()["status"] == "approved"
    return creative_id


def buy(client, pack_id="growth") -> dict:
    order = client.post("/api/ads/orders", json={"pack_id": pack_id})
    assert order.status_code == 201, order.text
    assert order.json()["provider"] == "simulated"
    verified = client.post(f"/api/ads/orders/{order.json()['order_id']}/verify", json={})
    assert verified.status_code == 200, verified.text
    return verified.json()


def credits(client) -> int:
    return client.get("/api/ads/wallet").json()["credits"]


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def business(make_client):
    client = make_client()
    register(client, "business", n="1")
    return client


# ------------------------------------------------------------------------------------------ roles & payments


def test_business_registration_and_profile(make_client):
    client = make_client()
    user = register(client, "business", n="x")
    assert user["role"] == "business" and user["is_verified"] is True
    me = client.get("/api/auth/me").json()
    assert me["profile"]["business_name"] == "Test Business x"
    assert me["profile"]["business_type"] == "restaurant" and me["profile"]["website"] == "https://biz.example.com"

    other = make_client()
    bad = other.post(
        "/api/auth/register",
        json={"name": "No Name", "email": "nobiz@test.yieldwrap.org", "password": "Password123", "role": "business"},
    )
    assert bad.status_code == 422 and bad.json()["code"] == "VALIDATION_ERROR"


def test_pricing_is_public():
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as anonymous:
        pricing = anonymous.get("/api/ads/pricing").json()
    assert pricing["payments"] == {"provider": "simulated", "key_id": None}
    assert pricing["costs"] == {"packet_sticker": 2, "ngo_poster_week_default": 50, "digital_per_1000": 10}
    assert [p["id"] for p in pricing["packs"]] == ["starter", "growth", "pro"]


def test_simulated_purchase_and_idempotent_verify(business, platform):
    order = business.post("/api/ads/orders", json={"pack_id": "starter"}).json()
    assert order["amount_paise"] == 49900 and order["credits"] == 100 and order["razorpay_order_id"] is None
    assert order["prefill"]["email"] == "business1@test.yieldwrap.org"

    first = business.post(f"/api/ads/orders/{order['order_id']}/verify", json={}).json()
    second = business.post(f"/api/ads/orders/{order['order_id']}/verify", json={}).json()
    assert first == second == {"order": {"id": order["order_id"], "status": "paid", "credits": 100}, "wallet": {"credits": 100}}
    wallet = business.get("/api/ads/wallet").json()
    assert [(t["type"], t["credits"], t["balance_after"]) for t in wallet["transactions"]] == [("purchase", 100, 100)]

    # Someone else's order is invisible; NGOs and volunteers can't buy.
    assert platform["donor"].post(f"/api/ads/orders/{order['order_id']}/verify", json={}).status_code == 404
    assert platform["ngo_near"].post("/api/ads/orders", json={"pack_id": "starter"}).status_code == 403
    assert business.post("/api/ads/orders", json={"pack_id": "mega"}).status_code == 422


def test_production_without_keys_is_unavailable(business, monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")
    response = business.post("/api/ads/orders", json={"pack_id": "starter"})
    assert response.status_code == 503 and response.json()["code"] == "PAYMENTS_UNAVAILABLE"


def test_razorpay_signature_and_webhook(business, monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_fake")
    monkeypatch.setattr(settings, "razorpay_key_secret", "fake_secret")
    monkeypatch.setattr(settings, "razorpay_webhook_secret", "hook_secret")

    async def fake_create_order(amount_paise, receipt, notes):
        assert amount_paise == 199900 and notes["pack_id"] == "growth"
        return {"id": f"order_{receipt[-10:]}", "amount": amount_paise}

    monkeypatch.setattr(razorpay_service, "create_order", fake_create_order)
    assert business.get("/api/ads/pricing").json()["payments"] == {"provider": "razorpay", "key_id": "rzp_test_fake"}

    order = business.post("/api/ads/orders", json={"pack_id": "growth"}).json()
    assert order["provider"] == "razorpay" and order["key_id"] == "rzp_test_fake"
    rzp_order = order["razorpay_order_id"]
    verify_url = f"/api/ads/orders/{order['order_id']}/verify"

    bad = business.post(verify_url, json={"razorpay_order_id": rzp_order, "razorpay_payment_id": "pay_1", "razorpay_signature": "0" * 64})
    assert bad.status_code == 400 and bad.json()["code"] == "PAYMENT_VERIFICATION_FAILED"
    assert business.post(verify_url, json={}).json()["code"] == "PAYMENT_VERIFICATION_FAILED"
    assert credits(business) == 0

    signature = hmac.new(b"fake_secret", f"{rzp_order}|pay_1".encode(), hashlib.sha256).hexdigest()
    good = {"razorpay_order_id": rzp_order, "razorpay_payment_id": "pay_1", "razorpay_signature": signature}
    assert business.post(verify_url, json=good).json()["wallet"]["credits"] == 500

    # The webhook for the same payment arrives afterwards: verified, but credits are not added twice.
    event = json.dumps(
        {"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_1", "order_id": rzp_order, "amount": 199900}}}}
    ).encode()
    hook_sig = hmac.new(b"hook_secret", event, hashlib.sha256).hexdigest()
    assert business.post("/api/ads/webhooks/razorpay", content=event, headers={"X-Razorpay-Signature": "bad"}).status_code == 400
    response = business.post("/api/ads/webhooks/razorpay", content=event, headers={"X-Razorpay-Signature": hook_sig})
    assert response.json() == {"ok": True}
    assert credits(business) == 500

    # A second order paid only through the webhook (user closed the tab) is credited once.
    order2 = business.post("/api/ads/orders", json={"pack_id": "growth"}).json()
    event2 = json.dumps(
        {"event": "order.paid", "payload": {"order": {"entity": {"id": order2["razorpay_order_id"], "amount_paid": 199900}},
                                            "payment": {"entity": {"id": "pay_2", "order_id": order2["razorpay_order_id"], "amount": 199900}}}}
    ).encode()
    sig2 = hmac.new(b"hook_secret", event2, hashlib.sha256).hexdigest()
    for _ in range(2):
        business.post("/api/ads/webhooks/razorpay", content=event2, headers={"X-Razorpay-Signature": sig2})
    assert credits(business) == 1000
    assert business.post(f"/api/ads/orders/{order2['order_id']}/verify", json={}).json()["order"]["status"] == "paid"


# ------------------------------------------------------------------------------------------ creatives & campaigns


def test_creative_review_and_unapproved_cannot_be_used(business, platform):
    admin = platform["admin"]
    assert upload_creative(business, url="javascript:alert(1)").status_code == 422
    assert upload_creative(business, title="x").status_code == 422
    assert upload_creative(business, image=GIF).json()["code"] == "UNSUPPORTED_FILE_TYPE"

    created = upload_creative(business).json()
    assert created["status"] == "pending" and created["owner_name"] == "Test Business 1"
    assert created["image_url"] == f"/api/ads/creatives/{created['id']}/image"
    assert "image_file" not in created

    buy(business, "starter")
    blocked = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": created["id"], "packets": 10})
    assert blocked.status_code == 409 and blocked.json()["code"] == "CREATIVE_NOT_APPROVED"
    assert credits(business) == 100

    # The image is private until approved.
    assert business.get(created["image_url"]).status_code == 200
    assert platform["donor"].get(created["image_url"]).status_code == 404
    assert [c["id"] for c in admin.get("/api/admin/ad-creatives").json()] == [created["id"]]
    assert platform["donor"].get("/api/ads/creatives").json() == []

    reviewed = admin.put(f"/api/admin/ad-creatives/{created['id']}/review", json={"approved": True}).json()
    assert reviewed["status"] == "approved" and reviewed["reviewed_at"]
    assert platform["donor"].get(created["image_url"]).content == PNG
    assert "Creative approved" in [n["title"] for n in business.get("/api/notifications/").json()]

    # Other advertisers can't use or delete it.
    buy(platform["donor"], "starter")
    other = platform["donor"].post("/api/ads/campaigns", json={"type": "packet", "creative_id": created["id"], "packets": 10})
    assert other.status_code == 404
    assert platform["donor"].delete(f"/api/ads/creatives/{created['id']}").status_code == 404

    rejected = upload_creative(business, title="Second").json()
    out = admin.put(f"/api/admin/ad-creatives/{rejected['id']}/review", json={"approved": False, "reason": "Blurry"}).json()
    assert out["status"] == "rejected" and out["rejection_reason"] == "Blurry"
    assert business.delete(f"/api/ads/creatives/{rejected['id']}").json() == {"ok": True}


def test_packet_campaign_debit_and_insufficient_credits(business, platform):
    creative = approved_creative(business, platform["admin"])
    poor = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": creative, "packets": 10})
    assert poor.status_code == 402 and poor.json()["code"] == "INSUFFICIENT_CREDITS"

    buy(business, "starter")
    campaign = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": creative, "packets": 30}).json()
    assert campaign["credits_spent"] == 60 and campaign["status"] == "active"
    assert campaign["packet"] == {"packets_requested": 30, "packets_allocated": 0, "packets_applied": 0, "target": None}
    assert campaign["creative"]["title"] == "Fresh Bites" and campaign["scans"] == 0
    assert credits(business) == 40
    assert business.get("/api/ads/wallet").json()["transactions"][0] == {
        **business.get("/api/ads/wallet").json()["transactions"][0], "type": "spend", "credits": -60, "balance_after": 40,
    }
    assert business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": creative, "packets": 21}).status_code == 402
    assert business.post("/api/ads/campaigns", json={"type": "digital", "creative_id": creative, "impressions": 1500}).status_code == 422
    assert business.delete(f"/api/ads/creatives/{creative}").json()["code"] == "CREATIVE_IN_USE"

    cancelled = business.post(f"/api/ads/campaigns/{campaign['id']}/cancel").json()
    assert cancelled["status"] == "cancelled" and cancelled["credits_refunded"] == 60
    assert credits(business) == 100
    assert business.post(f"/api/ads/campaigns/{campaign['id']}/cancel").json()["code"] == "NOT_CANCELLABLE"
    assert platform["donor"].post(f"/api/ads/campaigns/{campaign['id']}/cancel").status_code == 404


def setup_packaged_donation(platform, business, packets_campaign=100, packet_count=100):
    """Business runs a packet campaign; the donor lists packet_count packets with its own sticker; the NGO accepts."""
    admin, donor, ngo = platform["admin"], platform["donor"], platform["ngo_near"]
    biz_creative = approved_creative(business, admin)
    buy(business, "growth")
    campaign = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": biz_creative, "packets": packets_campaign}).json()
    own_creative = approved_creative(donor, admin, title="Donor Diner", url="")
    donation = donor.post("/api/donor/donations", json=donation_body(packet_count=packet_count, own_ad_creative_id=own_creative)).json()
    accepted = ngo.post(f"/api/ngo/accept/{donation['id']}").json()
    return {"campaign": campaign, "biz_creative": biz_creative, "own_creative": own_creative, "donation": accepted["donation"]}


def campaign(client, campaign_id):
    return next(c for c in client.get("/api/ads/campaigns").json() if c["id"] == campaign_id)


def test_packaging_pickup_and_delivery(platform, business, make_client):
    admin, donor, ngo, volunteer = platform["admin"], platform["donor"], platform["ngo_near"], platform["volunteer"]
    admin_creative_count = len(admin.get("/api/admin/ad-creatives").json())
    biz_creative = approved_creative(business, admin)
    buy(business, "growth")
    camp = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": biz_creative, "packets": 100}).json()

    # Unapproved own creative can't go on the packaging.
    pending_creative = upload_creative(donor, title="Pending").json()
    refused = donor.post("/api/donor/donations", json=donation_body(packet_count=100, own_ad_creative_id=pending_creative["id"]))
    assert refused.json()["code"] == "CREATIVE_NOT_APPROVED"

    own_creative = approved_creative(donor, admin, title="Donor Diner", url="")
    donation = donor.post("/api/donor/donations", json=donation_body(packet_count=100, own_ad_creative_id=own_creative)).json()
    packaging = donation["packaging"]
    assert packaging["own_ad"] == {"creative_id": own_creative, "title": "Donor Diner", "packets": 50}
    assert packaging["sponsored_capacity"] == 50 and packaging["sponsored"] == [] and packaging["stickers_total"] == 50
    assert business.get("/api/ads/inventory").json()["open_pool_packets"] == 50

    accepted = ngo.post(f"/api/ngo/accept/{donation['id']}").json()["donation"]
    assert accepted["packaging"]["stickers_total"] == 100
    assert [(s["campaign_id"], s["packets"], s["owner_name"]) for s in accepted["packaging"]["sponsored"]] == [(camp["id"], 50, "Test Business 1")]
    assert campaign(business, camp["id"])["packet"]["packets_allocated"] == 50
    inventory = business.get("/api/ads/inventory").json()
    assert inventory == {"open_pool_packets": 0, "packets_stickered_30d": 0, "active_packet_campaigns": 1, "pending_packet_demand": 50}

    # Sticker sheet: donor, receiving NGO, assigned volunteer and admin only.
    sheet = volunteer.get(f"/api/ads/stickers/{donation['id']}").json()
    assert sheet["packet_count"] == 100 and sheet["donor_name"] == "Test Donor"
    assert [(s["kind"], s["count"]) for s in sheet["stickers"]] == [("sponsored", 50), ("own", 50)]
    assert sheet["stickers"][0]["creative"]["id"] == biz_creative and sheet["stickers"][0]["campaign_id"] == camp["id"]
    assert sheet["stickers"][0]["qr_url"].endswith(f"/api/ads/s/{biz_creative}?d={donation['id']}")
    for allowed in (donor, ngo, admin):
        assert allowed.get(f"/api/ads/stickers/{donation['id']}").status_code == 200
    for denied in (business, platform["ngo_far"]):
        assert denied.get(f"/api/ads/stickers/{donation['id']}").status_code == 403

    # Pickup: the count is mandatory; a shortfall is released (sponsored are counted first).
    url = f"/api/volunteer/tasks/{donation['id']}/status"
    missing = volunteer.put(url, json={"status": "picked_up"})
    assert missing.status_code == 422 and missing.json()["details"][0]["field"] == "stickers_applied"
    assert volunteer.put(url, json={"status": "picked_up", "stickers_applied": 101}).status_code == 422
    picked = volunteer.put(url, json={"status": "picked_up", "stickers_applied": 40}).json()
    assert picked["status"] == "in_transit"
    assert picked["packaging"]["stickers_applied"]["count"] == 40
    assert picked["packaging"]["sponsored_applied"] == 40 and picked["packaging"]["own_applied"] == 0
    after_pickup = campaign(business, camp["id"])
    assert after_pickup["packet"]["packets_allocated"] == 40 and after_pickup["packet"]["packets_applied"] == 40
    assert after_pickup["status"] == "active"

    delivered = volunteer.put(url, json={"status": "delivered", "receiver_name": "Asha", "quantity_confirmed_kg": 20}).json()
    assert delivered["packaging"]["ngo_earned_credits"] == 24  # floor(40 × 2 × 0.3)
    ngo_wallet = ngo.get("/api/ads/wallet").json()
    assert ngo_wallet["earnings_credits"] == 24 and ngo_wallet["credits"] == 0
    assert ngo_wallet["transactions"][0]["type"] == "earning"

    # QR scans redirect and are attributed to the sponsoring campaign.
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app, follow_redirects=False) as anonymous:
        scan = anonymous.get(f"/api/ads/s/{biz_creative}?d={donation['id']}")
        assert scan.status_code == 302 and scan.headers["location"] == "https://bites.example.com"
        own_scan = anonymous.get(f"/api/ads/s/{own_creative}?d={donation['id']}")
        assert own_scan.status_code == 302 and own_scan.headers["location"] == settings.frontend_url
        assert anonymous.get(f"/api/ads/s/{ObjectId()}").status_code == 404
    assert campaign(business, camp["id"])["scans"] == 1

    revenue = admin.get("/api/admin/ad-revenue").json()
    assert revenue["credits_sold"] == 500 + 100 * 0 and revenue["orders_paid"] == 1 and revenue["revenue_inr"] == 1999
    assert revenue["credits_spent_by_type"] == {"packet": 200, "ngo_poster": 0, "digital": 0}
    assert revenue["credits_refunded"] == 0 and revenue["ngo_earnings_credits"] == 24
    assert (revenue["packets_stickered"], revenue["packets_own"], revenue["packets_sponsored"]) == (40, 0, 40)
    assert revenue["scans"] == 2 and revenue["active_campaigns"] == 1
    assert revenue["pending_creatives"] == admin_creative_count + 1  # the donor's "Pending" creative
    assert revenue["top_advertisers"] == [{"owner_id": camp["owner_id"], "owner_name": "Test Business 1", "credits_spent": 200}]


def test_full_pickup_completes_campaign(platform, business):
    setup = setup_packaged_donation(platform, business, packets_campaign=50)
    donation_id = setup["donation"]["id"]
    picked = platform["volunteer"].put(
        f"/api/volunteer/tasks/{donation_id}/status", json={"status": "picked_up", "stickers_applied": 100}
    ).json()
    assert picked["packaging"]["sponsored_applied"] == 50 and picked["packaging"]["own_applied"] == 50
    assert campaign(business, setup["campaign"]["id"])["status"] == "completed"


def test_cancel_before_pickup_releases_allocations(platform, business):
    setup = setup_packaged_donation(platform, business)
    camp_id = setup["campaign"]["id"]
    assert campaign(business, camp_id)["packet"]["packets_allocated"] == 50
    cancelled = platform["donor"].delete(f"/api/donor/donations/{setup['donation']['id']}").json()
    assert cancelled["status"] == "cancelled" and cancelled["packaging"]["sponsored"] == []
    assert campaign(business, camp_id)["packet"]["packets_allocated"] == 0


def test_cancelled_campaign_refunds_released_packets_later(platform, business):
    setup = setup_packaged_donation(platform, business)
    camp_id = setup["campaign"]["id"]
    assert credits(business) == 300
    out = business.post(f"/api/ads/campaigns/{camp_id}/cancel").json()
    assert out["credits_refunded"] == 100 and credits(business) == 400  # 50 unallocated packets
    platform["donor"].delete(f"/api/donor/donations/{setup['donation']['id']}")
    assert credits(business) == 500  # the 50 allocated packets came back after the donation was cancelled
    assert campaign(business, camp_id)["credits_refunded"] == 200


def test_reset_and_scheduler_refill(platform, business, mock_db):
    """No campaign at accept time; the dispatcher fills the pool once one is created."""
    from services.scheduler import allocate_waiting
    from services.db_service import utcnow

    donor, ngo = platform["donor"], platform["ngo_near"]
    donation = donor.post("/api/donor/donations", json=donation_body(packet_count=20)).json()
    assert donation["packaging"]["own_ad"] is None and donation["packaging"]["sponsored_capacity"] == 20
    ngo.post(f"/api/ngo/accept/{donation['id']}")
    creative = approved_creative(business, platform["admin"])
    buy(business, "starter")
    near_target = {"lat": NEAR["lat"], "lng": NEAR["lng"], "radius_km": 1}
    far = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": creative, "packets": 10, "target": near_target}).json()
    camp = business.post("/api/ads/campaigns", json={"type": "packet", "creative_id": creative, "packets": 15}).json()
    run(allocate_waiting(utcnow()))
    packaging = donor.get(f"/api/donor/donations/{donation['id']}").json()["packaging"]
    assert [(s["campaign_id"], s["packets"]) for s in packaging["sponsored"]] == [(camp["id"], 15)]  # targeted one is out of range
    assert campaign(business, far["id"])["packet"]["packets_allocated"] == 0

    # Edits of pending donations recompute packaging; an unknown creative is rejected.
    pending = donor.post("/api/donor/donations", json=donation_body()).json()
    assert pending["packaging"]["packet_count"] == 0
    edited = donor.put(f"/api/donor/donations/{pending['id']}", json={"packet_count": 10}).json()
    assert edited["packaging"]["sponsored_capacity"] == 10
    assert donor.put(f"/api/donor/donations/{pending['id']}", json={"own_ad_creative_id": str(ObjectId())}).status_code == 404


# ------------------------------------------------------------------------------------------ NGO posters


def test_ngo_ad_space_poster_booking(platform, business):
    ngo, admin = platform["ngo_near"], platform["admin"]
    space = ngo.post("/api/ngo/ad-spaces", json={"name": "Dining hall wall", "size": "A3 poster", "credits_per_week": 40})
    assert space.status_code == 201, space.text
    space = space.json()
    assert space["location"]["lat"] == pytest.approx(NEAR["lat"]) and space["active"] is True
    assert ngo.post("/api/ngo/ad-spaces", json={"name": "Cheap", "credits_per_week": 5}).status_code == 422
    assert business.post("/api/ngo/ad-spaces", json={"name": "Nope", "credits_per_week": 40}).status_code == 403

    spaces = business.get(f"/api/ads/spaces?lat={NEAR['lat']}&lng={NEAR['lng']}&radius_km=5").json()
    assert [(s["id"], s["is_verified"], s["distance_km"]) for s in spaces] == [(space["id"], True, 0.0)]

    creative = approved_creative(business, admin)
    buy(business, "starter")
    booking = business.post("/api/ads/campaigns", json={"type": "ngo_poster", "creative_id": creative, "ad_space_id": space["id"], "weeks": 2}).json()
    assert booking["credits_spent"] == 80 and booking["poster"]["booking_status"] == "requested"
    assert booking["poster"]["ngo_name"] == "Test NGO near" and booking["poster"]["space_name"] == "Dining hall wall"
    assert credits(business) == 20
    assert ngo.delete(f"/api/ngo/ad-spaces/{space['id']}").json()["code"] == "SPACE_HAS_BOOKINGS"
    assert [b["id"] for b in ngo.get("/api/ngo/ad-bookings").json()] == [booking["id"]]
    assert platform["ngo_far"].post(f"/api/ngo/ad-bookings/{booking['id']}/displayed").status_code == 404

    displayed = ngo.post(f"/api/ngo/ad-bookings/{booking['id']}/displayed").json()
    assert displayed["poster"]["booking_status"] == "displayed" and displayed["poster"]["starts_at"] and displayed["poster"]["ends_at"]
    assert ngo.get("/api/ads/wallet").json()["earnings_credits"] == 24  # floor(80 × 0.3)
    assert ngo.post(f"/api/ngo/ad-bookings/{booking['id']}/displayed").json()["code"] == "INVALID_BOOKING_STATE"
    assert ngo.post(f"/api/ngo/ad-bookings/{booking['id']}/decline").json()["code"] == "INVALID_BOOKING_STATE"

    # Second booking is declined: full refund.
    ngo.put(f"/api/ngo/ad-spaces/{space['id']}", json={"credits_per_week": 10})
    second = business.post("/api/ads/campaigns", json={"type": "ngo_poster", "creative_id": creative, "ad_space_id": space["id"], "weeks": 2}).json()
    assert second["credits_spent"] == 20 and credits(business) == 0
    declined = ngo.post(f"/api/ngo/ad-bookings/{second['id']}/decline").json()
    assert declined["status"] == "rejected" and declined["poster"]["booking_status"] == "declined" and declined["credits_refunded"] == 20
    assert credits(business) == 20

    # Deactivated spaces disappear from the marketplace and can't be booked.
    ngo.put(f"/api/ngo/ad-spaces/{space['id']}", json={"active": False})
    assert business.get("/api/ads/spaces").json() == []
    assert business.post("/api/ads/campaigns", json={"type": "ngo_poster", "creative_id": creative, "ad_space_id": space["id"], "weeks": 1}).status_code == 404


# ------------------------------------------------------------------------------------------ digital


def test_digital_campaign_served_and_completed(platform, business, mock_db):
    creative = approved_creative(business, platform["admin"], title="Biz Banner")
    buy(business, "starter")
    camp = business.post("/api/ads/campaigns", json={"type": "digital", "creative_id": creative, "impressions": 1000}).json()
    assert camp["credits_spent"] == 10 and camp["digital"] == {"impressions_purchased": 1000, "impressions_served": 0, "clicks": 0}
    ad_id = f"cmp_{camp['id']}"

    served = None
    for _ in range(200):
        ad = platform["volunteer"].get("/api/ads/?slot=rectangle").json()["ad"]
        if ad["id"] == ad_id:
            served = ad
            break
    assert served and served["is_paid"] is True and served["sponsor"] == "Test Business 1" and served["title"] == "Biz Banner"
    assert served["url"] == "https://bites.example.com"

    event = {"ad_id": ad_id, "slot": "rectangle", "page": "/volunteer"}
    assert platform["volunteer"].post("/api/ads/impression", json=event).json() == {"ok": True}
    assert platform["volunteer"].post("/api/ads/click", json=event).json() == {"ok": True}
    current = campaign(business, camp["id"])["digital"]
    assert current["impressions_served"] == 1 and current["clicks"] == 1

    run(mock_db.ad_campaigns.update_one({"_id": ObjectId(camp["id"])}, {"$set": {"digital.impressions_served": 998}}))
    for _ in range(3):
        platform["volunteer"].post("/api/ads/impression", json=event)
    done = campaign(business, camp["id"])
    assert done["status"] == "completed" and done["digital"]["impressions_served"] == 1000
    assert all(platform["volunteer"].get("/api/ads/?slot=rectangle").json()["ad"]["id"] != ad_id for _ in range(30))
    assert platform["volunteer"].post("/api/ads/impression", json={**event, "ad_id": "cmp_" + "0" * 24}).status_code == 404


def test_digital_cancel_refunds_unserved(platform, business, mock_db):
    creative = approved_creative(business, platform["admin"])
    buy(business, "starter")
    camp = business.post("/api/ads/campaigns", json={"type": "digital", "creative_id": creative, "impressions": 5000}).json()
    assert credits(business) == 50
    run(mock_db.ad_campaigns.update_one({"_id": ObjectId(camp["id"])}, {"$set": {"digital.impressions_served": 2000}}))
    out = business.post(f"/api/ads/campaigns/{camp['id']}/cancel").json()
    assert out["credits_refunded"] == 30 and credits(business) == 80


def test_admin_credit_adjustment(platform, business):
    admin = platform["admin"]
    user_id = business.get("/api/auth/me").json()["user"]["id"]
    assert admin.post(f"/api/admin/users/{user_id}/credits", json={"credits": 75, "note": "Launch promo"}).json() == {"credits": 75}
    assert admin.post(f"/api/admin/users/{user_id}/credits", json={"credits": -25}).json() == {"credits": 50}
    assert admin.post(f"/api/admin/users/{user_id}/credits", json={"credits": -500}).status_code == 402
    assert admin.post(f"/api/admin/users/{user_id}/credits", json={"credits": 0}).status_code == 422
    assert business.post(f"/api/admin/users/{user_id}/credits", json={"credits": 5}).status_code == 403
    assert [t["type"] for t in business.get("/api/ads/wallet").json()["transactions"]] == ["grant", "grant"]
    stats = admin.get("/api/admin/system-stats").json()
    assert stats["users_by_role"]["business"] == 1
    users = admin.get("/api/admin/users?role=business").json()
    assert users[0]["profile"]["business_name"] == "Test Business 1"
    assert admin.delete(f"/api/admin/users/{user_id}").json() == {"ok": True}
