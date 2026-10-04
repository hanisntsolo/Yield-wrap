"""Test fixtures: an in-memory Motor mock replaces MongoDB, and each user gets their own cookie jar."""
import os
import tempfile
from contextlib import ExitStack
from datetime import timedelta

_tmp = tempfile.mkdtemp(prefix="yieldwrap-tests-")
os.environ.update(
    {
        "ENVIRONMENT": "test",
        "JWT_SECRET": "test-secret-0123456789abcdef0123456789abcdef",
        "BCRYPT_ROUNDS": "4",
        "ENABLE_SCHEDULER": "false",
        "ADMIN_SIGNUP_CODE": "test-admin-code",
        "GOOGLE_MAPS_API_KEY": "",
        "FIREBASE_CREDENTIALS_PATH": "",
        "MODEL_DIR": os.path.join(_tmp, "models"),
        "UPLOAD_DIR": os.path.join(_tmp, "uploads"),
        "APP_TIMEZONE": "Asia/Kolkata",
        # No Razorpay keys: the simulated checkout is used (ENVIRONMENT != production).
        "RAZORPAY_KEY_ID": "",
        "RAZORPAY_KEY_SECRET": "",
        "RAZORPAY_WEBHOOK_SECRET": "",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from ai_engine import forecasting  # noqa: E402
from main import app  # noqa: E402
from services.db_service import set_database, utcnow  # noqa: E402
from services.rate_limit import login_limiter  # noqa: E402

PASSWORD = "Password123"
# Bengaluru city centre and points a few km away.
CENTRE = {"address": "MG Road, Bengaluru", "lat": 12.9756, "lng": 77.6050}
NEAR = {"address": "Indiranagar, Bengaluru", "lat": 12.9784, "lng": 77.6408}  # ~3.9 km
FAR = {"address": "Whitefield, Bengaluru", "lat": 12.9698, "lng": 77.7500}  # ~15.7 km


@pytest.fixture(autouse=True)
def mock_db():
    database = AsyncMongoMockClient(tz_aware=True)["yieldwrap_test"]
    set_database(database)
    forecasting.reset_cache()
    forecasting._model_path().unlink(missing_ok=True)
    login_limiter._hits.clear()
    yield database
    set_database(None)


@pytest.fixture
def make_client(mock_db):
    """Factory for independent API clients (one per logged-in user)."""
    with ExitStack() as stack:
        yield lambda: stack.enter_context(TestClient(app))


@pytest.fixture
def client(make_client):
    return make_client()


def future(hours: float = 6) -> str:
    return (utcnow() + timedelta(hours=hours)).isoformat()


def register(client, role: str, **overrides) -> dict:
    n = overrides.pop("n", "")
    body = {
        "name": f"Test {role.title()} {n}".strip(),
        "email": f"{role}{n}@test.yieldwrap.org",
        "password": PASSWORD,
        "role": role,
        "phone": "+91 98765 43210",
        "location": CENTRE,
    }
    if role == "ngo":
        body.update(
            organization_name=f"Test NGO {n}".strip(),
            registration_number=f"NGO-{n or 0}",
            accepted_food_types=["cooked", "packaged", "produce"],
            storage_capacity_kg=300,
            beneficiary_count=150,
            operating_hours={"open": "00:00", "close": "23:59"},
        )
    if role == "volunteer":
        body["vehicle_type"] = "car"
    if role == "admin":
        body["admin_code"] = "test-admin-code"
    if role == "business":
        body.update(business_name=f"Test Business {n}".strip(), business_type="restaurant", website="https://biz.example.com")
    body.update(overrides)
    response = client.post("/api/auth/register", json=body)
    assert response.status_code == 201, response.text
    return response.json()["user"]


def donation_body(**overrides) -> dict:
    body = {
        "food_items": [
            {"name": "Veg biryani", "category": "cooked", "quantity_kg": 12, "expiry_time": future(5), "allergens": ["nuts"]},
            {"name": "Bread loaves", "category": "packaged", "quantity_kg": 8, "expiry_time": future(24)},
        ],
        "pickup_location": CENTRE,
        "urgency_level": "high",
    }
    body.update(overrides)
    return body


@pytest.fixture
def platform(make_client):
    """An admin, a donor, two verified NGOs (near and far) and an available volunteer, each logged in."""
    admin = make_client()
    register(admin, "admin")
    donor = make_client()
    register(donor, "donor")
    ngos = {}
    for key, location in (("near", NEAR), ("far", FAR)):
        c = make_client()
        user = register(c, "ngo", n=key, location=location)
        assert admin.put(f"/api/admin/users/{user['id']}/verify", json={"is_verified": True}).status_code == 200
        ngos[key] = c
    volunteer = make_client()
    register(volunteer, "volunteer", location=CENTRE)
    assert volunteer.put("/api/volunteer/availability", json={"availability": True}).status_code == 200
    return {"admin": admin, "donor": donor, "ngo_near": ngos["near"], "ngo_far": ngos["far"], "volunteer": volunteer}
