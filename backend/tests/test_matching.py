"""Unit tests for the donor–NGO matching engine."""
from datetime import timedelta

import pytest
from bson import ObjectId

from ai_engine.matching import WEIGHTS, compute_match_score, haversine, rank_ngos
from services.db_service import utcnow

PICKUP = {"lat": 12.9756, "lng": 77.6050}


def make_donation(kg=20.0, category="cooked", urgency="medium"):
    return {
        "food_items": [{"name": "Food", "category": category, "quantity_kg": kg, "expiry_time": utcnow() + timedelta(hours=6)}],
        "pickup_location": PICKUP,
        "urgency_level": urgency,
    }


def make_ngo(lat=12.9784, lng=77.6408, capacity=300.0, load=0.0, types=("cooked", "packaged"), rate=0.8):
    return {
        "_id": ObjectId(),
        "organization_name": "NGO",
        "location": {"lat": lat, "lng": lng},
        "accepted_food_types": list(types),
        "storage_capacity_kg": capacity,
        "current_load_kg": load,
        "operating_hours": {"open": "00:00", "close": "23:59"},
        "acceptance_rate": rate,
    }


def test_haversine_accuracy():
    # London → Paris is ~343.5 km; Bengaluru → Chennai ~290 km.
    assert haversine(51.5074, -0.1278, 48.8566, 2.3522) == pytest.approx(343.5, abs=1.0)
    assert haversine(12.9716, 77.5946, 13.0827, 80.2707) == pytest.approx(290.2, abs=1.5)
    assert haversine(12.97, 77.59, 12.97, 77.59) == 0.0


def test_weights_sum_to_one():
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


@pytest.mark.parametrize("urgency", ["low", "medium", "high", "critical"])
@pytest.mark.parametrize("kg", [0.5, 20, 250, 5000])
def test_match_score_range(urgency, kg):
    for ngo in (make_ngo(), make_ngo(lat=13.2, lng=77.7, capacity=50, load=45, rate=0.0), make_ngo(capacity=5000, rate=1.0)):
        score = compute_match_score(make_donation(kg=kg, urgency=urgency), ngo)
        assert 0.0 <= score <= 1.0


def test_closest_ngo_gets_higher_score():
    near = make_ngo(lat=12.9784, lng=77.6408)  # ~4 km
    far = make_ngo(lat=12.9698, lng=77.7500)  # ~16 km
    donation = make_donation()
    assert compute_match_score(donation, near) > compute_match_score(donation, far)
    ranked = rank_ngos(donation, [far, near])
    assert ranked[0]["ngo_id"] == str(near["_id"])
    assert ranked[0]["distance_km"] < ranked[1]["distance_km"]


def test_incompatible_food_type_excluded():
    donation = make_donation(category="dairy")
    ngo = make_ngo(types=("cooked", "packaged"))
    assert compute_match_score(donation, ngo) == 0.0
    assert rank_ngos(donation, [ngo]) == []


def test_full_capacity_ngo_excluded():
    full = make_ngo(capacity=200, load=200)
    ok = make_ngo(capacity=200, load=50)
    donation = make_donation()
    assert compute_match_score(donation, full) == 0.0
    assert [m["ngo_id"] for m in rank_ngos(donation, [full, ok])] == [str(ok["_id"])]


def test_out_of_range_ngo_excluded():
    assert rank_ngos(make_donation(), [make_ngo(lat=19.07, lng=72.87)]) == []  # Mumbai


def test_critical_donation_prefers_high_capacity_ngo():
    small = make_ngo(capacity=60)
    large = make_ngo(capacity=1000)
    critical = make_donation(kg=40, urgency="critical")
    assert compute_match_score(critical, large) > compute_match_score(critical, small)


def test_declined_ngo_is_skipped():
    a, b = make_ngo(), make_ngo(lat=12.99, lng=77.62)
    ranked = rank_ngos(make_donation(), [a, b], exclude_ids=[a["_id"]])
    assert [m["ngo_id"] for m in ranked] == [str(b["_id"])]
