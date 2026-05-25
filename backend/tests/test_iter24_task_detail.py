"""Iteration 25 — Task detail (portal + intern) regression tests.

Tests GET /api/lifecycle/task/{id}/full for:
- Regular task as admin -> 200
- Regular task as intern (not assigned, not privileged) -> 403
- Intern task as intern owner -> 200 (fallback via db.intern_tasks + interns profile)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PASS = "Intern@2026"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def intern_session():
    return _login(INTERN_EMAIL, INTERN_PASS)


# --- Helpers ---
def _get_or_create_regular_task(admin):
    r = admin.get(f"{API}/tasks", timeout=20)
    assert r.status_code == 200, r.text
    items = r.json()
    if items:
        return items[0]
    r = admin.post(f"{API}/tasks", json={
        "title": "TEST_iter25 detail task",
        "description": "iter25 detail test",
        "priority": "medium",
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    return r.json()


# --- Tests ---
class TestTaskDetailFull:
    def test_login_intern(self, intern_session):
        r = intern_session.get(f"{API}/auth/me", timeout=20)
        assert r.status_code == 200
        assert r.json().get("role") == "intern"

    def test_admin_views_regular_task(self, admin_session):
        task = _get_or_create_regular_task(admin_session)
        tid = task["id"]
        r = admin_session.get(f"{API}/lifecycle/task/{tid}/full", timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "task" in d and d["task"]["id"] == tid
        assert "timeline" in d and isinstance(d["timeline"], list)
        assert "my_started_at" in d

    def test_intern_not_assigned_gets_403(self, admin_session, intern_session):
        # Create a regular task owned by admin (no intern assignment)
        r = admin_session.post(f"{API}/tasks", json={
            "title": "TEST_iter25 not-for-intern",
            "description": "intern should be forbidden",
            "priority": "low",
        }, timeout=20)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        rr = intern_session.get(f"{API}/lifecycle/task/{tid}/full", timeout=20)
        assert rr.status_code == 403, f"expected 403, got {rr.status_code}: {rr.text}"

    def test_intern_views_own_intern_task(self, admin_session, intern_session):
        # Get intern's own tasks
        r = intern_session.get(f"{API}/me/intern/tasks", timeout=20)
        assert r.status_code == 200, r.text
        my_tasks = r.json()
        if not my_tasks:
            pytest.skip("No intern tasks seeded for intern@projexino.com")
        tid = my_tasks[0]["id"]
        rr = intern_session.get(f"{API}/lifecycle/task/{tid}/full", timeout=20)
        assert rr.status_code == 200, f"Intern should see own task: {rr.status_code} {rr.text}"
        d = rr.json()
        assert d["task"]["id"] == tid
        assert "timeline" in d

    def test_task_not_found_404(self, admin_session):
        r = admin_session.get(f"{API}/lifecycle/task/does-not-exist-12345/full", timeout=20)
        assert r.status_code == 404
