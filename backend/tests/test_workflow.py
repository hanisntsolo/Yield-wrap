"""End-to-end lifecycle: donate → match → NGO accepts → volunteer delivers, plus the supporting endpoints."""
import pytest
from starlette.websockets import WebSocketDisconnect

from tests.conftest import CENTRE, donation_body, register


def create_and_match(platform, **overrides):
    donor = platform["donor"]
    donation = donor.post("/api/donor/donations", json=donation_body(**overrides)).json()
    donor.post(f"/api/ai/match/{donation['id']}")
    return donation["id"]


def test_full_donation_lifecycle(platform):
    donor, ngo, volunteer, admin = platform["donor"], platform["ngo_near"], platform["volunteer"], platform["admin"]
    donation_id = create_and_match(platform)

    offers = ngo.get("/api/ngo/available-donations").json()
    assert offers[0]["id"] == donation_id and offers[0]["offer_type"] == "offer" and offers[0]["match_score"] > 0

    accepted = ngo.post(f"/api/ngo/accept/{donation_id}").json()
    assert accepted["donation"]["ngo_accepted"] is True
    assert accepted["volunteer_assignment"]["name"] == "Test Volunteer"
    assert accepted["donation"]["task_stage"] == "assigned"
    assert ngo.get("/api/ngo/profile").json()["current_load_kg"] == 20  # storage reserved

    tasks = volunteer.get("/api/volunteer/tasks").json()
    assert [t["id"] for t in tasks] == [donation_id]
    assert volunteer.put(f"/api/volunteer/tasks/{donation_id}/status", json={"status": "delivered"}).status_code == 422
    assert volunteer.post(f"/api/volunteer/tasks/{donation_id}/accept").json()["task_stage"] == "accepted"

    assert volunteer.put("/api/volunteer/location", json={"lat": 12.976, "lng": 77.606}).json() == {"ok": True}
    track = donor.get(f"/api/donor/donations/{donation_id}/track").json()
    assert track["volunteer"]["location"] == {"lat": 12.976, "lng": 77.606}
    assert track["eta_minutes"] >= 1 and track["delivery_location"]["lat"] == pytest.approx(12.9784)

    route = volunteer.post(
        "/api/ai/route",
        json={"volunteer_location": track["volunteer"]["location"], "pickup_location": track["pickup_location"],
              "delivery_location": track["delivery_location"], "vehicle_type": "car"},
    ).json()
    assert route["provider"] == "fallback" and len(route["points"]) == 3 and route["eta_minutes"] >= 1

    for stage in ("at_pickup", "picked_up"):
        assert volunteer.put(f"/api/volunteer/tasks/{donation_id}/status", json={"status": stage}).json()["task_stage"] == stage
    assert donor.get(f"/api/donor/donations/{donation_id}").json()["status"] == "in_transit"
    assert donor.delete(f"/api/donor/donations/{donation_id}").json()["code"] == "NOT_CANCELLABLE"

    delivered = volunteer.put(
        f"/api/volunteer/tasks/{donation_id}/status",
        json={"status": "delivered", "receiver_name": "Asha (storekeeper)", "quantity_confirmed_kg": 19.5},
    ).json()
    assert delivered["status"] == "delivered"
    record = delivered["delivery_record"]
    assert record["receiver_name"] == "Asha (storekeeper)" and record["quantity_confirmed_kg"] == 19.5 and record["volunteer_id"]

    profile = volunteer.get("/api/volunteer/profile").json()
    assert profile["completed_deliveries"] == 1 and profile["active_task_id"] is None and profile["hours_contributed"] > 0
    assert ngo.get("/api/ngo/profile").json()["current_load_kg"] == 19.5
    assert volunteer.get("/api/volunteer/leaderboard").json()[0]["deliveries_this_month"] == 1
    assert [d["id"] for d in ngo.get("/api/ngo/history").json()] == [donation_id]
    csv = ngo.get("/api/ngo/history.csv")
    assert csv.headers["content-type"].startswith("text/csv") and "Asha (storekeeper)" in csv.text

    stats = donor.get("/api/donor/stats").json()
    assert stats["delivered_count"] == 1 and stats["meals_contributed"] == 48 and stats["co2_saved_kg"] == 48.8
    titles = [n["title"] for n in donor.get("/api/notifications/").json()]
    assert {"Match found", "NGO accepted your donation", "Volunteer assigned", "Volunteer at pickup", "Food collected", "Delivery confirmed"} <= set(titles)

    dashboard = admin.get("/api/analytics/dashboard").json()
    assert dashboard["kg_redistributed_today"] == 19.5 and dashboard["donations_today"] == 1
    assert admin.get("/api/analytics/waste-saved").json()["kg_saved"] == 19.5
    assert admin.get("/api/admin/system-stats").json()["donations_by_status"]["delivered"] == 1


def test_decline_passes_offer_to_next_ngo(platform):
    donation_id = create_and_match(platform)
    assert platform["ngo_near"].post(f"/api/ngo/decline/{donation_id}").json() == {"ok": True}
    offers = platform["ngo_far"].get("/api/ngo/available-donations").json()
    assert offers[0]["id"] == donation_id and offers[0]["offer_type"] == "offer"
    assert platform["ngo_near"].get("/api/ngo/available-donations").json() == []


def test_open_donation_can_be_claimed_by_compatible_ngo(platform):
    donation = platform["donor"].post("/api/donor/donations", json=donation_body()).json()  # not matched yet
    open_list = platform["ngo_far"].get("/api/ngo/available-donations").json()
    assert open_list[0]["offer_type"] == "open"
    result = platform["ngo_far"].post(f"/api/ngo/accept/{donation['id']}").json()
    assert result["donation"]["matched_ngo_name"] == "Test NGO far"
    assert platform["ngo_near"].post(f"/api/ngo/accept/{donation['id']}").json()["code"] == "NOT_AVAILABLE"


def test_volunteer_decline_reallocates(platform, make_client):
    second = make_client()
    register(second, "volunteer", n="2", location=CENTRE, vehicle_type="van")
    second.put("/api/volunteer/availability", json={"availability": True})
    donation_id = create_and_match(platform)
    first_assignee = platform["ngo_near"].post(f"/api/ngo/accept/{donation_id}").json()["volunteer_assignment"]["name"]
    first, other = (platform["volunteer"], second) if first_assignee == "Test Volunteer" else (second, platform["volunteer"])
    assert first.post(f"/api/volunteer/tasks/{donation_id}/decline").json() == {"ok": True}
    assert first.get("/api/volunteer/tasks").json() == []
    assert [t["id"] for t in other.get("/api/volunteer/tasks").json()] == [donation_id]


def test_cancel_releases_volunteer_and_ngo(platform):
    donation_id = create_and_match(platform)
    platform["ngo_near"].post(f"/api/ngo/accept/{donation_id}")
    cancelled = platform["donor"].delete(f"/api/donor/donations/{donation_id}").json()
    assert cancelled["status"] == "cancelled"
    assert platform["volunteer"].get("/api/volunteer/profile").json()["active_task_id"] is None
    assert platform["ngo_near"].get("/api/ngo/profile").json()["current_load_kg"] == 0
    assert platform["ngo_near"].get("/api/notifications/").json()[0]["title"] == "Donation cancelled"


def test_edit_only_while_pending(platform):
    donor = platform["donor"]
    donation = donor.post("/api/donor/donations", json=donation_body()).json()
    edited = donor.put(f"/api/donor/donations/{donation['id']}", json={"urgency_level": "critical", "notes": "Gate 2"}).json()
    assert edited["urgency_level"] == "critical" and edited["notes"] == "Gate 2"
    donor.post(f"/api/ai/match/{donation['id']}")
    assert donor.put(f"/api/donor/donations/{donation['id']}", json={"notes": "x"}).json()["code"] == "NOT_EDITABLE"


def test_donor_cannot_see_others_donations(platform, make_client):
    donation_id = create_and_match(platform)
    other = make_client()
    register(other, "donor", n="2")
    assert other.get(f"/api/donor/donations/{donation_id}").status_code == 404
    assert other.post(f"/api/ai/match/{donation_id}").status_code == 403


def test_unverified_ngo_cannot_accept(platform, make_client):
    donation = platform["donor"].post("/api/donor/donations", json=donation_body()).json()
    pending_ngo = make_client()
    register(pending_ngo, "ngo", n="new")
    response = pending_ngo.post(f"/api/ngo/accept/{donation['id']}")
    assert response.status_code == 403 and response.json()["code"] == "NGO_NOT_VERIFIED"


def test_admin_user_management(platform):
    admin = platform["admin"]
    users = admin.get("/api/admin/users", params={"role": "ngo"}).json()
    assert len(users) == 2 and all(u["profile"]["organization_name"] for u in users)
    assert len(admin.get("/api/admin/users", params={"q": "near"}).json()) == 1
    assert admin.get("/api/admin/users", params={"q": ".*"}).json() == []  # regex is escaped

    volunteer_id = platform["volunteer"].get("/api/auth/me").json()["user"]["id"]
    assert admin.put(f"/api/admin/users/{volunteer_id}/suspend", json={"is_suspended": True}).json()["is_suspended"]
    assert platform["volunteer"].get("/api/auth/me").status_code == 401  # sessions revoked
    assert admin.delete(f"/api/admin/users/{volunteer_id}").json() == {"ok": True}
    assert admin.get("/api/admin/users", params={"role": "volunteer"}).json() == []

    result = admin.post("/api/admin/broadcast", json={"title": "Heads up", "body": "Rain tonight", "role": "donor"}).json()
    assert result == {"recipients": 1, "push_sent": 0}
    assert platform["donor"].get("/api/notifications/unread-count").json() == {"count": 1}
    assert platform["donor"].post("/api/notifications/read-all").json()["ok"]
    assert platform["donor"].get("/api/notifications/unread-count").json() == {"count": 0}
    assert platform["donor"].get("/api/admin/users").status_code == 403

    live_map = admin.get("/api/admin/map").json()
    assert len(live_map["ngos"]) == 2 and {"donations", "volunteers"} <= set(live_map)


def test_analytics_endpoints(platform):
    create_and_match(platform)
    admin = platform["admin"]
    trend = admin.get("/api/analytics/donations/trend", params={"days": 7}).json()
    assert len(trend) == 7 and trend[-1]["donations"] == 1 and trend[-1]["kg"] == 20
    assert len(admin.get("/api/analytics/donations/trend", params={"period": "weekly", "days": 30}).json()) >= 5
    assert {r["category"] for r in admin.get("/api/analytics/food-types").json()} == {"cooked", "packaged"}
    assert len(admin.get("/api/analytics/ngo-utilization").json()) == 2
    assert admin.get("/api/analytics/volunteer-performance").json()[0]["name"] == "Test Volunteer"
    assert admin.get("/api/ai/forecast", params={"days": 7}).json()["model"]["source"] == "baseline"
    queue = admin.get("/api/ai/priority-queue").json()
    assert len(queue) == 1 and queue[0]["priority_score"] > 0
    public = platform["donor"].__class__(platform["donor"].app).get("/api/analytics/public-impact")
    assert public.status_code == 200 and public.json()["active_ngos"] == 2


def test_multi_stop_route(platform):
    stops = [{"id": "far", "lat": 12.99, "lng": 77.70}, {"id": "near", "lat": 12.976, "lng": 77.61}, {"id": "mid", "lat": 12.98, "lng": 77.65}]
    result = platform["volunteer"].post("/api/ai/route/multi", json={"start": CENTRE, "stops": stops, "vehicle_type": "bike"}).json()
    assert [s["id"] for s in result["ordered_stops"]] == ["near", "mid", "far"]
    assert result["ordered_stops"][-1]["cumulative_eta_minutes"] == result["total_eta_minutes"]
    too_many = [{"id": str(i), "lat": 12.9, "lng": 77.6} for i in range(6)]
    assert platform["volunteer"].post("/api/ai/route/multi", json={"start": CENTRE, "stops": too_many}).status_code == 422


def test_ads_serving_and_logging(platform, client):
    ad = platform["volunteer"].get("/api/ads/", params={"slot": "rectangle", "page": "volunteer"}).json()["ad"]
    assert ad["width"] == 300 and ad["height"] == 250 and ad["category"] in {"logistics", "food", "house"}
    anonymous = client.get("/api/ads/", params={"slot": "leaderboard"}).json()["ad"]
    assert anonymous["category"] in {"food", "house"}  # role-targeted ads aren't shown to visitors
    body = {"ad_id": ad["id"], "slot": "rectangle", "page": "volunteer"}
    assert platform["volunteer"].post("/api/ads/impression", json=body).json() == {"ok": True}
    assert platform["volunteer"].post("/api/ads/click", json=body).json() == {"ok": True}
    assert client.post("/api/ads/impression", json={**body, "ad_id": "nope"}).status_code == 404
    stats = platform["admin"].get("/api/ads/stats").json()
    assert stats[0]["impressions"] == 1 and stats[0]["clicks"] == 1 and stats[0]["by_role"]["volunteer"]["clicks"] == 1
    assert client.get("/api/ads/partners").json() == []


def test_location_websocket(platform, client):
    donation_id = create_and_match(platform)
    platform["ngo_near"].post(f"/api/ngo/accept/{donation_id}")
    volunteer_id = platform["volunteer"].get("/api/volunteer/profile").json()["id"]
    path = f"/ws/volunteer/{volunteer_id}/location"

    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(path) as ws:  # anonymous
            ws.receive_json()

    with platform["donor"].websocket_connect(path) as watcher, platform["volunteer"].websocket_connect(path) as publisher:
        watcher.receive_json()  # initial position
        publisher.receive_json()
        publisher.send_json({"lat": 12.977, "lng": 77.607})
        update = watcher.receive_json()
        assert update["volunteer_id"] == volunteer_id and update["lat"] == 12.977
