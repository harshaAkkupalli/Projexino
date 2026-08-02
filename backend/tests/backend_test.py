"""Backend API tests for Projexino"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"


# ----- Fixtures -----
@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["email"] == ADMIN_EMAIL
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


# ----- Health -----
def test_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert r.json().get("service") == "projexino-api"


# ----- Auth -----
class TestAuth:
    def test_login_admin(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert isinstance(data["token"], str) and len(data["token"]) > 20
        # cookie set
        assert "access_token" in r.cookies or any(
            "access_token" in c.name for c in r.cookies
        ) or "set-cookie" in {k.lower() for k in r.headers.keys()}

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me_unauthenticated(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_authenticated(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_register_and_login_new_user(self):
        email = f"test_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "Test User"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email
        # Duplicate registration
        r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "Test@1234", "name": "Test User"})
        assert r2.status_code == 400
        # Login
        r3 = requests.post(f"{API}/auth/login", json={"email": email, "password": "Test@1234"})
        assert r3.status_code == 200

    def test_logout(self):
        r = requests.post(f"{API}/auth/logout")
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ----- Leads -----
class TestLeads:
    created_id = None

    def test_create_lead(self, admin_session):
        payload = {
            "name": "TEST_Lead Acme",
            "email": "acme@test.com",
            "phone": "1234567890",
            "company": "Acme",
            "source": "website",
            "value": 5000,
            "status": "new",
        }
        r = admin_session.post(f"{API}/leads", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["value"] == 5000
        assert data["status"] == "new"
        assert len(data["activities"]) >= 1
        TestLeads.created_id = data["id"]

    def test_list_leads(self, admin_session):
        r = admin_session.get(f"{API}/leads")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_lead(self, admin_session):
        assert TestLeads.created_id, "create test should run first"
        r = admin_session.get(f"{API}/leads/{TestLeads.created_id}")
        assert r.status_code == 200
        assert r.json()["id"] == TestLeads.created_id

    def test_patch_lead_status(self, admin_session):
        r = admin_session.patch(f"{API}/leads/{TestLeads.created_id}", json={"status": "qualified"})
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "qualified"
        # activity logged
        kinds = [a["kind"] for a in data["activities"]]
        assert "status_change" in kinds

    def test_add_note(self, admin_session):
        r = admin_session.post(f"{API}/leads/{TestLeads.created_id}/notes", json={"message": "Followup call done"})
        assert r.status_code == 200
        data = r.json()
        assert any(a["kind"] == "note" and "Followup" in a["message"] for a in data["activities"])

    def test_add_empty_note_fails(self, admin_session):
        r = admin_session.post(f"{API}/leads/{TestLeads.created_id}/notes", json={"message": "  "})
        assert r.status_code == 400

    def test_analytics(self, admin_session):
        r = admin_session.get(f"{API}/leads/analytics/summary")
        assert r.status_code == 200
        data = r.json()
        for k in ["total", "by_status", "by_source", "pipeline_value", "conversion_rate"]:
            assert k in data

    def test_delete_lead(self, admin_session):
        r = admin_session.delete(f"{API}/leads/{TestLeads.created_id}")
        assert r.status_code == 200
        # verify removal
        r2 = admin_session.get(f"{API}/leads/{TestLeads.created_id}")
        assert r2.status_code == 404

    def test_unauth_leads_blocked(self):
        r = requests.get(f"{API}/leads")
        assert r.status_code == 401


# ----- Tasks -----
class TestTasks:
    created_id = None

    def test_create_task(self, admin_session):
        payload = {"title": "TEST_Task Build CI", "description": "set up", "priority": "high", "status": "todo"}
        r = admin_session.post(f"{API}/tasks", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["status"] == "todo"
        TestTasks.created_id = data["id"]

    def test_list_tasks(self, admin_session):
        r = admin_session.get(f"{API}/tasks")
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert TestTasks.created_id in ids

    def test_patch_task_status(self, admin_session):
        r = admin_session.patch(f"{API}/tasks/{TestTasks.created_id}", json={"status": "in_progress"})
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"

    def test_delete_task(self, admin_session):
        r = admin_session.delete(f"{API}/tasks/{TestTasks.created_id}")
        assert r.status_code == 200
        r2 = admin_session.patch(f"{API}/tasks/{TestTasks.created_id}", json={"status": "done"})
        assert r2.status_code == 404

    def test_unauth_tasks_blocked(self):
        r = requests.get(f"{API}/tasks")
        assert r.status_code == 401


# ----- Team -----
class TestTeam:
    created_id = None
    created_email = None

    def test_unauth_team_blocked(self):
        r = requests.get(f"{API}/team")
        assert r.status_code == 401

    def test_create_team_member(self, admin_session):
        TestTeam.created_email = f"test_{uuid.uuid4().hex[:8]}@projexino.com"
        payload = {
            "name": "TEST_Member One",
            "email": TestTeam.created_email,
            "role": "Engineer",
            "department": "Engineering",
            "status": "active",
            "skills": ["python", "react"],
            "bio": "Test bio",
        }
        r = admin_session.post(f"{API}/team", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["email"] == TestTeam.created_email
        assert data["role"] == "Engineer"
        assert data["department"] == "Engineering"
        assert data["status"] == "active"
        assert data["skills"] == ["python", "react"]
        assert "id" in data and isinstance(data["id"], str)
        assert "avatar_color" in data and isinstance(data["avatar_color"], str) and len(data["avatar_color"]) > 0
        assert "owner_id" in data and isinstance(data["owner_id"], str)
        TestTeam.created_id = data["id"]

    def test_list_team(self, admin_session):
        r = admin_session.get(f"{API}/team")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        ids = [m["id"] for m in data]
        assert TestTeam.created_id in ids
        # All members belong to admin owner
        owner_ids = {m["owner_id"] for m in data}
        assert len(owner_ids) == 1

    def test_duplicate_email_blocked(self, admin_session):
        payload = {
            "name": "TEST_Dup",
            "email": TestTeam.created_email,
            "role": "Engineer",
            "department": "Engineering",
        }
        r = admin_session.post(f"{API}/team", json=payload)
        assert r.status_code == 400

    def test_patch_team_member(self, admin_session):
        r = admin_session.patch(
            f"{API}/team/{TestTeam.created_id}",
            json={"status": "away", "role": "Senior Engineer", "department": "Platform", "skills": ["go"]},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "away"
        assert data["role"] == "Senior Engineer"
        assert data["department"] == "Platform"
        assert data["skills"] == ["go"]
        # verify persistence via list
        r2 = admin_session.get(f"{API}/team")
        match = next((m for m in r2.json() if m["id"] == TestTeam.created_id), None)
        assert match is not None
        assert match["status"] == "away"
        assert match["role"] == "Senior Engineer"

    def test_team_analytics(self, admin_session):
        r = admin_session.get(f"{API}/team/analytics/summary")
        assert r.status_code == 200
        data = r.json()
        for k in ["total", "by_department", "by_status"]:
            assert k in data
        assert isinstance(data["total"], int)
        assert isinstance(data["by_department"], dict)
        assert isinstance(data["by_status"], dict)
        assert data["total"] >= 1

    def test_delete_team_member(self, admin_session):
        r = admin_session.delete(f"{API}/team/{TestTeam.created_id}")
        assert r.status_code == 200
        # verify removal — patching deleted member should 404
        r2 = admin_session.patch(f"{API}/team/{TestTeam.created_id}", json={"status": "offline"})
        assert r2.status_code == 404


# ----- Dashboard -----
def test_dashboard_stats(admin_session):
    r = admin_session.get(f"{API}/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    for k in ["leads_total", "leads_won", "leads_qualified", "open_tasks", "done_tasks", "team_total", "team_active"]:
        assert k in data and isinstance(data[k], int)
    # team_active must be <= team_total
    assert data["team_active"] <= data["team_total"]


# ----- CORS -----
def test_cors_credentialed_post():
    """Real-flow CORS: actual login POST returns allow-credentials header."""
    origin = "https://projexino-hub.preview.emergentagent.com"
    r = requests.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        headers={"Origin": origin},
    )
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-credentials", "").lower() == "true"
