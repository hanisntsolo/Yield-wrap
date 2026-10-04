"""API tests: authentication, donations and AI matching through the HTTP layer."""
import jwt

from config import settings
from tests.conftest import NEAR, PASSWORD, donation_body, register


def test_auth_register_donor(client):
    user = register(client, "donor")
    assert user["role"] == "donor"
    assert user["email"] == "donor@test.yieldwrap.org"
    assert "password" not in user and "token_version" not in user
    assert client.cookies.get("access_token") and client.cookies.get("refresh_token")
    me = client.get("/api/auth/me").json()
    assert me["user"]["id"] == user["id"] and me["profile"] is None


def test_auth_register_duplicate_email(client):
    register(client, "donor")
    response = client.post(
        "/api/auth/register", json={"name": "Again", "email": "DONOR@test.yieldwrap.org", "password": PASSWORD, "role": "donor"}
    )
    assert response.status_code == 409 and response.json()["code"] == "EMAIL_TAKEN"


def test_auth_login_and_token(make_client):
    register(make_client(), "donor")
    client = make_client()
    bad = client.post("/api/auth/login", json={"email": "donor@test.yieldwrap.org", "password": "wrong-pass1"})
    assert bad.status_code == 401 and bad.json() == {"error": "Invalid email or password", "code": "INVALID_CREDENTIALS"}

    response = client.post("/api/auth/login", json={"email": "Donor@Test.YieldWrap.org", "password": PASSWORD})
    assert response.status_code == 200
    assert "token" not in response.text  # tokens only travel in httpOnly cookies
    assert "httponly" in response.headers["set-cookie"].lower()
    payload = jwt.decode(client.cookies["access_token"], settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert payload["type"] == "access" and payload["role"] == "donor"
    assert client.get("/api/auth/me").status_code == 200


def test_refresh_and_logout_revokes_tokens(client):
    register(client, "donor")
    old_access = client.cookies["access_token"]
    assert client.post("/api/auth/refresh").status_code == 200
    assert client.post("/api/auth/logout").json() == {"ok": True}
    assert client.get("/api/auth/me").status_code == 401
    # The pre-logout token no longer works even if replayed.
    client.cookies.set("access_token", old_access)
    assert client.get("/api/auth/me").json()["code"] == "UNAUTHORIZED"


def test_create_donation_authenticated(client):
    register(client, "donor")
    response = client.post("/api/donor/donations", json=donation_body())
    assert response.status_code == 201, response.text
    donation = response.json()
    assert donation["status"] == "pending"
    assert donation["total_kg"] == 20
    assert donation["food_items"][0]["allergens"] == ["nuts"]
    assert 0 <= donation["priority_score"] <= 1
    assert "_id" not in donation and donation["id"]
    assert [d["id"] for d in client.get("/api/donor/donations").json()] == [donation["id"]]


def test_create_donation_unauthenticated_blocked(client):
    response = client.post("/api/donor/donations", json=donation_body())
    assert response.status_code == 401
    assert response.json() == {"error": "Authentication required", "code": "UNAUTHORIZED"}


def test_create_donation_wrong_role_forbidden(client):
    register(client, "volunteer")
    response = client.post("/api/donor/donations", json=donation_body())
    assert response.status_code == 403 and response.json()["code"] == "FORBIDDEN"


def test_create_donation_validation_error(client):
    register(client, "donor")
    body = donation_body()
    body["food_items"][0]["quantity_kg"] = -1
    response = client.post("/api/donor/donations", json=body)
    assert response.status_code == 422
    payload = response.json()
    assert payload["code"] == "VALIDATION_ERROR" and payload["details"][0]["field"] == "food_items.0.quantity_kg"


def test_ai_match_returns_ranked_list(platform):
    donor = platform["donor"]
    donation = donor.post("/api/donor/donations", json=donation_body()).json()
    response = donor.post(f"/api/ai/match/{donation['id']}")
    assert response.status_code == 200, response.text
    result = response.json()
    matches = result["matches"]
    assert len(matches) == 2
    assert [m["score"] for m in matches] == sorted((m["score"] for m in matches), reverse=True)
    assert matches[0]["organization_name"] == "Test NGO near"
    assert matches[0]["distance_km"] < matches[1]["distance_km"]
    assert set(matches[0]["breakdown"]) == {"distance", "capacity", "food_type", "urgency", "history"}
    assert result["donation"]["status"] == "matched"
    assert result["donation"]["matched_ngo_name"] == "Test NGO near"
    # The top NGO is notified of the offer.
    inbox = platform["ngo_near"].get("/api/notifications/").json()
    assert inbox[0]["title"] == "New donation offer"


def test_unverified_ngo_not_matched(make_client):
    donor = make_client()
    register(donor, "donor")
    register(make_client(), "ngo", location=NEAR)  # never verified
    donation = donor.post("/api/donor/donations", json=donation_body()).json()
    result = donor.post(f"/api/ai/match/{donation['id']}").json()
    assert result["matches"] == [] and result["donation"]["status"] == "pending"


def test_admin_signup_requires_code(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Mallory", "email": "m@test.yieldwrap.org", "password": PASSWORD, "role": "admin", "admin_code": "guess"},
    )
    assert response.status_code == 403
