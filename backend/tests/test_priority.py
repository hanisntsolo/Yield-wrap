"""Unit tests for the priority-based redistribution engine."""
from datetime import timedelta

from ai_engine.priority_engine import compute_priority_score, get_priority_queue, rank_donations
from services.db_service import utcnow


def donation(hours=24.0, urgency="medium", kg=20.0, status="pending"):
    expiry = utcnow() + timedelta(hours=hours)
    return {
        "food_items": [{"name": "Food", "category": "cooked", "quantity_kg": kg, "expiry_time": expiry}],
        "earliest_expiry": expiry,
        "total_kg": kg,
        "urgency_level": urgency,
        "status": status,
        "created_at": utcnow(),
    }


def test_expiring_donation_gets_top_priority():
    expiring = donation(hours=1.5)
    later = donation(hours=40)
    assert compute_priority_score(expiring) > compute_priority_score(later)
    # Expiring within 2 hours earns nearly the full 0.45 expiry weight.
    assert compute_priority_score(donation(hours=1.5, urgency="low", kg=0)) >= 0.43


def test_critical_urgency_beats_low_urgency():
    assert compute_priority_score(donation(urgency="critical")) > compute_priority_score(donation(urgency="low"))


def test_priority_score_range():
    for d in (donation(hours=-3, urgency="critical", kg=500), donation(hours=500, urgency="low", kg=0.1)):
        assert 0.0 <= compute_priority_score(d) <= 1.0


def test_priority_queue_ordering():
    items = [donation(hours=30, urgency="low"), donation(hours=1, urgency="critical", kg=80), donation(hours=10, urgency="high")]
    ranked = rank_donations(items)
    scores = [d["priority_score"] for d in ranked]
    assert scores == sorted(scores, reverse=True)
    assert ranked[0]["urgency_level"] == "critical"


async def test_priority_queue_reads_open_donations(mock_db):
    await mock_db.donations.insert_many(
        [
            donation(hours=20, urgency="low"),
            donation(hours=2, urgency="critical"),
            donation(hours=5, status="delivered"),
            donation(hours=-1, urgency="critical"),  # already expired
        ]
    )
    queue = await get_priority_queue()
    assert [d["urgency_level"] for d in queue] == ["critical", "low"]
