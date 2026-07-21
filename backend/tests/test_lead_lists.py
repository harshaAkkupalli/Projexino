"""Backend tests for Outreach Lead Lists CRUD (iter50)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"

assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    data = r.json() or {}
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def two_leads(session):
    """Create two unique test leads and return their ids."""
    ids = []
    for _ in range(2):
        email = f"TEST_ll_{uuid.uuid4().hex[:8]}@example.com"
        r = session.post(
            f"{BASE_URL}/api/outreach/leads",
            json={"email": email, "first_name": "Test", "last_name": "Lead", "company": "TEST_LL_Co"},
            timeout=15,
        )
        assert r.status_code == 200, f"create lead: {r.status_code} {r.text[:200]}"
        ids.append(r.json()["id"])
    yield ids
    for lid in ids:
        try:
            session.delete(f"{BASE_URL}/api/outreach/leads/{lid}", timeout=10)
        except Exception:
            pass


# -- Auth required --
def test_lead_lists_requires_auth():
    r = requests.get(f"{BASE_URL}/api/outreach/lead-lists", timeout=10)
    assert r.status_code in (401, 403), f"expected auth error, got {r.status_code}"


# -- List endpoint --
def test_list_lead_lists_returns_array(session):
    r = session.get(f"{BASE_URL}/api/outreach/lead-lists", timeout=15)
    assert r.status_code == 200, r.text[:200]
    assert isinstance(r.json(), list)


# -- CRUD flow --
def test_create_and_get_lead_list(session, two_leads):
    name = f"TEST_LL_{uuid.uuid4().hex[:6]}"
    payload = {"name": name, "lead_ids": two_leads}
    r = session.post(f"{BASE_URL}/api/outreach/lead-lists", json=payload, timeout=15)
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data["name"] == name
    assert set(data["lead_ids"]) == set(two_leads)
    assert data["lead_count"] == 2
    list_id = data["id"]

    # GET /lead-lists must contain it
    r2 = session.get(f"{BASE_URL}/api/outreach/lead-lists", timeout=10)
    assert r2.status_code == 200
    assert any(x["id"] == list_id for x in r2.json())

    # GET /lead-lists/{id}/leads — returns members
    r3 = session.get(f"{BASE_URL}/api/outreach/lead-lists/{list_id}/leads", timeout=15)
    assert r3.status_code == 200, r3.text[:200]
    body = r3.json()
    assert body["list"]["id"] == list_id
    returned_ids = {l["id"] for l in body["leads"]}
    assert returned_ids == set(two_leads)

    # PATCH: rename + reduce members
    new_name = name + "_renamed"
    r4 = session.patch(
        f"{BASE_URL}/api/outreach/lead-lists/{list_id}",
        json={"name": new_name, "lead_ids": [two_leads[0]]},
        timeout=15,
    )
    assert r4.status_code == 200, r4.text[:200]
    assert r4.json()["name"] == new_name
    assert r4.json()["lead_count"] == 1

    # Verify persistence
    r5 = session.get(f"{BASE_URL}/api/outreach/lead-lists/{list_id}/leads", timeout=10)
    assert r5.status_code == 200
    assert r5.json()["list"]["name"] == new_name
    assert len(r5.json()["leads"]) == 1

    # DELETE
    r6 = session.delete(f"{BASE_URL}/api/outreach/lead-lists/{list_id}", timeout=10)
    assert r6.status_code == 200

    # Verify removal
    r7 = session.get(f"{BASE_URL}/api/outreach/lead-lists/{list_id}/leads", timeout=10)
    assert r7.status_code == 404


def test_duplicate_name_rejected(session):
    name = f"TEST_LL_DUP_{uuid.uuid4().hex[:6]}"
    r1 = session.post(f"{BASE_URL}/api/outreach/lead-lists", json={"name": name, "lead_ids": []}, timeout=10)
    assert r1.status_code == 200
    lid = r1.json()["id"]
    try:
        r2 = session.post(f"{BASE_URL}/api/outreach/lead-lists", json={"name": name, "lead_ids": []}, timeout=10)
        assert r2.status_code == 400
    finally:
        session.delete(f"{BASE_URL}/api/outreach/lead-lists/{lid}", timeout=10)


def test_empty_name_rejected(session):
    r = session.post(f"{BASE_URL}/api/outreach/lead-lists", json={"name": "", "lead_ids": []}, timeout=10)
    assert r.status_code == 400


def test_outreach_other_tabs_load(session):
    """Regression: confirm other Outreach endpoints still work."""
    for path in ["/api/outreach/leads", "/api/outreach/campaigns", "/api/outreach/sequences", "/api/outreach/summary"]:
        r = session.get(f"{BASE_URL}{path}", timeout=15)
        assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
