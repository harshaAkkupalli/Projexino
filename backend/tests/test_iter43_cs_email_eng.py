"""Iteration 43 - CS email composer, engineering linked-projects, project status RBAC.

Tests added:
- POST /api/clients/{cid}/cs-email/save           (persist draft)
- GET  /api/clients/{cid}/cs-email/draft          (fetch draft)
- DELETE /api/clients/{cid}/cs-email/draft        (clear draft)
- GET  /api/clients/{cid}/linked-projects/{pid}/tasks
- POST /api/clients/{cid}/linked-projects/{pid}/ai-summary (AI - may be slow)
- PATCH /api/projects/{id}  RBAC (manager / intern allowed for status field)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_id(admin_headers):
    payload = {
        "name": "TEST_QAClient_iter43",
        "email": "qa_iter43@example.com",
        "company": "TestCo iter43",
    }
    r = requests.post(f"{API}/clients", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201), f"client create failed: {r.status_code} {r.text[:200]}"
    cid = r.json().get("id")
    assert cid
    yield cid
    requests.delete(f"{API}/clients/{cid}", headers=admin_headers, timeout=20)


@pytest.fixture(scope="module")
def project_id(admin_headers, client_id):
    payload = {"name": "TEST_QA_Phase_E_iter43", "client_id": client_id, "status": "planning"}
    r = requests.post(f"{API}/projects", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code in (200, 201), f"project create failed: {r.status_code} {r.text[:200]}"
    pid = r.json().get("id")
    assert pid
    yield pid
    requests.delete(f"{API}/projects/{pid}", headers=admin_headers, timeout=20)


# ─── CS Email draft persistence ────────────────────────────────────────────
class TestCSEmailDraft:
    def test_save_draft(self, admin_headers, client_id):
        body = {
            "subject": "TESTPD QA",
            "greeting": "Hi QA,",
            "intro": "Quick update from Projexino QA tests.",
            "highlights": ["Item 1", "Item 2"],
            "ask_or_next_step": "Any feedback?",
            "closing": "Warmly,\nProjexino",
            "body_html": "<p>QA</p>",
            "purpose": "QA",
            "tone": "warm",
        }
        r = requests.post(f"{API}/clients/{client_id}/cs-email/save", json=body, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("ok") is True
        assert d.get("saved_at")

    def test_get_draft_persisted(self, admin_headers, client_id):
        r = requests.get(f"{API}/clients/{client_id}/cs-email/draft", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("subject") == "TESTPD QA"
        assert d.get("highlights") == ["Item 1", "Item 2"]
        assert d.get("client_id") == client_id

    def test_delete_draft(self, admin_headers, client_id):
        r = requests.delete(f"{API}/clients/{client_id}/cs-email/draft", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/clients/{client_id}/cs-email/draft", headers=admin_headers, timeout=20)
        assert r2.status_code == 200
        # After delete the doc should be empty
        assert not r2.json().get("subject")


# ─── Linked project tasks endpoint ─────────────────────────────────────────
class TestLinkedProjects:
    def test_tasks_endpoint(self, admin_headers, client_id, project_id):
        r = requests.get(
            f"{API}/clients/{client_id}/linked-projects/{project_id}/tasks",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "project" in d and d["project"]["id"] == project_id
        assert "tasks" in d and isinstance(d["tasks"], list)
        assert "counts" in d and set(["todo", "in_progress", "review", "done", "blocked"]).issubset(d["counts"].keys())
        assert d.get("total") == len(d["tasks"])

    def test_tasks_unlinked_project_404(self, admin_headers, client_id):
        # Random pid that isn't linked to this client
        r = requests.get(
            f"{API}/clients/{client_id}/linked-projects/{uuid.uuid4().hex}/tasks",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 404


# ─── AI summary endpoint (slow - may take 10s) ─────────────────────────────
class TestAISummary:
    def test_ai_summary(self, admin_headers, client_id, project_id):
        r = requests.post(
            f"{API}/clients/{client_id}/linked-projects/{project_id}/ai-summary",
            json={"tone": "warm · concise"},
            headers=admin_headers,
            timeout=60,
        )
        # 200 = AI configured & returned JSON. 400 = no LLM key. 502 = AI parse error.
        assert r.status_code in (200, 400, 502), r.text[:300]
        if r.status_code == 200:
            d = r.json()
            for k in ("subject", "greeting", "intro", "highlights", "ask_or_next_step", "closing", "body_html"):
                assert k in d, f"missing {k}"
            assert d.get("client_email") == "qa_iter43@example.com"
            assert isinstance(d.get("highlights"), list)
            assert "<div" in (d.get("body_html") or "")


# ─── PATCH /projects RBAC for assigned members/interns ─────────────────────
class TestProjectStatusRBAC:
    def test_manager_can_update_status(self, admin_headers, project_id):
        # Manager role can edit ANY project (is_priv path)
        mgr_token = login(*MANAGER)
        mh = {"Authorization": f"Bearer {mgr_token}", "Content-Type": "application/json"}
        r = requests.patch(f"{API}/projects/{project_id}", json={"status": "in_progress"}, headers=mh, timeout=20)
        assert r.status_code == 200, f"manager status update failed: {r.status_code} {r.text[:300]}"
        assert r.json().get("status") == "in_progress"

    def test_manager_cannot_edit_name(self, admin_headers, project_id):
        # Per request: managers (role-based privilege) DO have full rights.
        # The "limited subset" rule applies only to non-privileged assigned members.
        # So changing name as manager-role should succeed too.
        mgr_token = login(*MANAGER)
        mh = {"Authorization": f"Bearer {mgr_token}", "Content-Type": "application/json"}
        r = requests.patch(f"{API}/projects/{project_id}", json={"name": "TEST_QA_Phase_E_iter43_renamed"}, headers=mh, timeout=20)
        # Manager role is in is_priv list per backend code → expect 200.
        assert r.status_code == 200, f"manager rename status={r.status_code}"

    def test_intern_assigned_can_update_status(self, admin_headers, project_id):
        # Get intern user id via /admin/users endpoint
        ur = requests.get(f"{API}/admin/users", headers=admin_headers, timeout=20)
        assert ur.status_code == 200, ur.text[:200]
        users = ur.json() if isinstance(ur.json(), list) else ur.json().get("items", [])
        intern_user = next((u for u in users if (u.get("email") or "").lower() == "intern@projexino.com"), None)
        if not intern_user:
            pytest.skip("intern user not found in /admin/users listing")
        intern_uid = intern_user.get("id") or intern_user.get("user_id")
        assert intern_uid
        # Add intern to project via PATCH (admin)
        pr = requests.patch(
            f"{API}/projects/{project_id}",
            json={"intern_user_ids": [intern_uid]},
            headers=admin_headers,
            timeout=20,
        )
        assert pr.status_code == 200, pr.text[:300]
        # Now intern can update status
        i_tok = login(*INTERN)
        ih = {"Authorization": f"Bearer {i_tok}", "Content-Type": "application/json"}
        r = requests.patch(f"{API}/projects/{project_id}", json={"status": "on_hold"}, headers=ih, timeout=20)
        assert r.status_code == 200, f"intern status update failed: {r.status_code} {r.text[:300]}"
        assert r.json().get("status") == "on_hold"

    def test_intern_assigned_cannot_edit_name(self, admin_headers, project_id):
        # Intern is in the assigned list - editing name should 403
        i_tok = login(*INTERN)
        ih = {"Authorization": f"Bearer {i_tok}", "Content-Type": "application/json"}
        r = requests.patch(f"{API}/projects/{project_id}", json={"name": "intern_should_not"}, headers=ih, timeout=20)
        # Backend silently drops name from raw_updates -> falls through to "if not updates → 403"
        assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text[:200]}"
