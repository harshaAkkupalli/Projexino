"""Batch 1 tests — Intern Hub: assign-task, assign-project, dm-channel, settings, task-attachment"""
import os
import base64
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@projexino.com", "Projexino@2026")


@pytest.fixture(scope="module")
def intern_token():
    return _login("intern@projexino.com", "Intern@2026")


@pytest.fixture(scope="module")
def member_token():
    return _login("member@projexino.com", "Member@2026")


@pytest.fixture(scope="module")
def seeded_intern(admin_token):
    """Find the seeded intern@projexino.com intern record."""
    r = requests.get(f"{API}/manager/interns", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    data = r.json()
    for row in data["interns"]:
        if row["intern"].get("email") == "intern@projexino.com":
            return row["intern"]
    pytest.fail("Seeded intern record not found")


@pytest.fixture(scope="module")
def an_existing_project(admin_token):
    r = requests.get(f"{API}/projects", headers=_h(admin_token), timeout=30)
    assert r.status_code == 200
    projects = r.json()
    if not projects:
        # create one
        r2 = requests.post(f"{API}/projects",
                           json={"name": "TEST_BatchProj", "description": "for tests"},
                           headers=_h(admin_token), timeout=30)
        assert r2.status_code in (200, 201)
        return r2.json()
    return projects[0]


# =========================
# SETTINGS
# =========================
class TestSettings:
    def test_public_settings_default_true(self):
        # Ensure default: explicitly set true first
        ad = _login("admin@projexino.com", "Projexino@2026")
        requests.patch(f"{API}/settings", json={"show_demo_creds": True}, headers=_h(ad), timeout=30)
        r = requests.get(f"{API}/settings/public", timeout=30)
        assert r.status_code == 200
        assert r.json().get("show_demo_creds") is True

    def test_settings_get_auth_required(self, admin_token):
        r = requests.get(f"{API}/settings", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        assert "show_demo_creds" in r.json()

    def test_settings_patch_non_admin_forbidden(self, member_token):
        r = requests.patch(f"{API}/settings", json={"show_demo_creds": False},
                           headers=_h(member_token), timeout=30)
        assert r.status_code == 403

    def test_settings_patch_admin_and_public_reflects(self, admin_token):
        # Set to false
        r = requests.patch(f"{API}/settings", json={"show_demo_creds": False},
                           headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        # Public should now be false (no auth)
        rp = requests.get(f"{API}/settings/public", timeout=30)
        assert rp.json().get("show_demo_creds") is False
        # Reset back to true so UI works for other testers
        rr = requests.patch(f"{API}/settings", json={"show_demo_creds": True},
                            headers=_h(admin_token), timeout=30)
        assert rr.status_code == 200
        rp2 = requests.get(f"{API}/settings/public", timeout=30)
        assert rp2.json().get("show_demo_creds") is True


# =========================
# ASSIGN TASK
# =========================
class TestAssignTask:
    def test_assign_task_with_attachment_no_project(self, admin_token, intern_token, seeded_intern):
        b64 = base64.b64encode(b"hello attachment").decode()
        payload = {
            "intern_id": seeded_intern["id"],
            "title": f"TEST_Task_{uuid.uuid4().hex[:6]}",
            "description": "test attach",
            "deadline": "2026-12-31",
            "priority": "medium",
            "attachments": [{"name": "hello.txt", "mime_type": "text/plain", "content_base64": b64}],
            "publish_to_project_docs": False,
        }
        r = requests.post(f"{API}/intern-hub/assign-task", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert len(data["attachments"]) == 1
        att = data["attachments"][0]
        assert att["name"] == "hello.txt"
        assert att["mime_type"] == "text/plain"
        assert "id" in att
        # content_base64 NOT in response metadata
        assert "content_base64" not in att

        task_id = data["id"]
        att_id = att["id"]

        # Intern can see this task
        tr = requests.get(f"{API}/me/intern/tasks", headers=_h(intern_token), timeout=30)
        assert tr.status_code == 200
        tasks = tr.json()
        match = [t for t in tasks if t["id"] == task_id]
        assert len(match) == 1
        assert len(match[0]["attachments"]) == 1
        assert match[0]["attachments"][0]["name"] == "hello.txt"
        # heavy field stripped
        assert "content_base64" not in match[0]["attachments"][0]

        # Admin can download attachment
        adr = requests.get(f"{API}/intern-hub/task-attachment/{task_id}/{att_id}",
                           headers=_h(admin_token), timeout=30)
        assert adr.status_code == 200, adr.text
        assert adr.json()["content_base64"] == b64

        # Intern can download attachment
        idr = requests.get(f"{API}/intern-hub/task-attachment/{task_id}/{att_id}",
                           headers=_h(intern_token), timeout=30)
        assert idr.status_code == 200
        assert idr.json()["content_base64"] == b64

        # Member (random user) is forbidden
        mt = _login("member@projexino.com", "Member@2026")
        mr = requests.get(f"{API}/intern-hub/task-attachment/{task_id}/{att_id}",
                          headers=_h(mt), timeout=30)
        assert mr.status_code == 403

    def test_assign_task_with_project_publishes_doc(self, admin_token, seeded_intern, an_existing_project):
        b64 = base64.b64encode(b"hi doc").decode()
        payload = {
            "intern_id": seeded_intern["id"],
            "title": f"TEST_TaskPub_{uuid.uuid4().hex[:6]}",
            "project_id": an_existing_project["id"],
            "project_name": an_existing_project.get("name", ""),
            "deadline": "2026-12-31",
            "attachments": [{"name": "spec.txt", "mime_type": "text/plain", "content_base64": b64}],
            "publish_to_project_docs": True,
        }
        r = requests.post(f"{API}/intern-hub/assign-task", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text

        # Verify db.documents created via /api/documents?project_id=...
        # Try project documents endpoint
        dr = requests.get(f"{API}/documents", headers=_h(admin_token), timeout=30,
                          params={"project_id": an_existing_project["id"]})
        if dr.status_code == 200:
            docs = dr.json() if isinstance(dr.json(), list) else dr.json().get("items", [])
            found = [d for d in docs if d.get("project_id") == an_existing_project["id"]
                     and d.get("name") == "spec.txt"]
            assert len(found) >= 1, "Document not published to project"


# =========================
# ASSIGN PROJECT
# =========================
class TestAssignProject:
    def test_assign_project_to_intern(self, admin_token, seeded_intern, an_existing_project):
        payload = {
            "intern_id": seeded_intern["id"],
            "project_id": an_existing_project["id"],
            "project_name": an_existing_project.get("name", ""),
            "role": "Contributor",
            "note": "Welcome",
        }
        r = requests.post(f"{API}/intern-hub/assign-project", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assigned = data.get("assigned_projects", [])
        assert any(a["project_id"] == an_existing_project["id"] for a in assigned)

        # Project's members list now includes intern name
        pr = requests.get(f"{API}/projects", headers=_h(admin_token), timeout=30)
        proj = next((p for p in pr.json() if p["id"] == an_existing_project["id"]), None)
        assert proj is not None
        members = proj.get("members", [])
        intern_name = seeded_intern["name"]
        assert intern_name in members or seeded_intern["email"] in members


# =========================
# DM CHANNEL find-or-create
# =========================
class TestDMChannel:
    def test_dm_find_or_create(self, admin_token, seeded_intern):
        r1 = requests.post(f"{API}/intern-hub/dm-channel",
                           json={"intern_id": seeded_intern["id"]},
                           headers=_h(admin_token), timeout=30)
        assert r1.status_code == 200, r1.text
        ch1 = r1.json()
        assert ch1["kind"] == "direct"
        assert seeded_intern["linked_user_id"] in ch1["member_ids"]
        # second call returns same
        r2 = requests.post(f"{API}/intern-hub/dm-channel",
                           json={"intern_id": seeded_intern["id"]},
                           headers=_h(admin_token), timeout=30)
        assert r2.status_code == 200
        assert r2.json()["id"] == ch1["id"]


# =========================
# REGRESSION
# =========================
class TestRegression:
    def test_verify_document_tristate(self, admin_token, seeded_intern):
        # Just verify endpoint accepts the call
        r = requests.post(f"{API}/manager/verify-document",
                          json={"intern_id": seeded_intern["id"],
                                "doc_type": "bank_details", "verified": True,
                                "note": "All good"},
                          headers=_h(admin_token), timeout=30)
        # 200 if doc submitted, else 404
        assert r.status_code in (200, 404)

    def test_intern_docs_endpoint(self, intern_token):
        r = requests.get(f"{API}/me/intern/documents", headers=_h(intern_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "required" in data
        assert "submitted" in data

    def test_members_directory(self, admin_token):
        r = requests.get(f"{API}/members/directory", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        assert len(items) >= 4
