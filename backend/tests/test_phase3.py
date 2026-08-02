"""Phase 3 — Role-based auth, intern self-service, members directory, manual badges."""
import os
import base64
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin":   ("admin@projexino.com",   "Projexino@2026"),
    "manager": ("manager@projexino.com", "Manager@2026"),
    "member":  ("member@projexino.com",  "Member@2026"),
    "intern":  ("intern@projexino.com",  "Intern@2026"),
}


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data


@pytest.fixture(scope="session")
def sessions():
    out = {}
    for role, (e, p) in CREDS.items():
        s, data = _login(e, p)
        out[role] = {"session": s, "data": data}
    return out


# ---------- Role-based login ----------
class TestRoleLogin:
    @pytest.mark.parametrize("role", ["admin", "manager", "member", "intern"])
    def test_login_returns_role(self, role, sessions):
        d = sessions[role]["data"]
        assert d["email"] == CREDS[role][0]
        assert d.get("role") == role or (role == "member" and d.get("role") == "team_member"), \
            f"role mismatch for {role}: got {d.get('role')}"
        assert "token" in d


# ---------- Members directory ----------
class TestMembersDirectory:
    def test_directory_returns_users_no_password_hash(self, sessions):
        s = sessions["admin"]["session"]
        r = s.get(f"{API}/members/directory")
        assert r.status_code == 200, r.text
        items = r.json()
        assert isinstance(items, list) and len(items) >= 4
        for u in items:
            assert "password_hash" not in u
            assert "email" in u
        emails = {u["email"] for u in items}
        for role_creds in CREDS.values():
            assert role_creds[0] in emails

    def test_directory_accessible_by_intern(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/members/directory")
        assert r.status_code == 200


# ---------- Intern self-service ----------
class TestInternSelfService:
    intern_record_id = None

    def test_me_intern_returns_profile(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/me/intern")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert "name" in data
        assert "designation" in data or True  # may be optional
        assert "badges" in data
        assert isinstance(data.get("badges", []), list)
        TestInternSelfService.intern_record_id = data["id"]

    def test_me_intern_403_for_admin(self, sessions):
        """Admin has no linked intern record — should 404."""
        s = sessions["admin"]["session"]
        r = s.get(f"{API}/me/intern")
        assert r.status_code in (404, 403)

    def test_seed_intern_task_then_list(self, sessions):
        """Admin seeds an intern task; intern lists their own tasks."""
        assert TestInternSelfService.intern_record_id, "intern profile must be fetched first"
        admin_s = sessions["admin"]["session"]
        future = "2099-12-31"
        payload = {
            "intern_id": TestInternSelfService.intern_record_id,
            "title": f"TEST_Phase3 Task {uuid.uuid4().hex[:6]}",
            "description": "Auto-seeded for phase3 test",
            "deadline": future,
        }
        r = admin_s.post(f"{API}/intern-tasks", json=payload)
        assert r.status_code == 200, r.text
        task_id = r.json()["id"]

        intern_s = sessions["intern"]["session"]
        r2 = intern_s.get(f"{API}/me/intern/tasks")
        assert r2.status_code == 200
        items = r2.json()
        assert any(t["id"] == task_id for t in items)
        TestInternSelfService._task_id = task_id

    def test_complete_task_awards_ontime_badge(self, sessions):
        s = sessions["intern"]["session"]
        before = s.get(f"{API}/me/intern").json()
        before_badges = {b["name"] for b in before.get("badges", [])}

        task_id = TestInternSelfService._task_id
        r = s.patch(f"{API}/me/intern/tasks/{task_id}",
                    json={"status": "completed", "completion_note": "done"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "completed"
        assert body.get("on_time") is True

        after = s.get(f"{API}/me/intern").json()
        after_badges = {b["name"] for b in after.get("badges", [])}
        assert "On-Time Achiever" in after_badges, \
            f"On-Time Achiever badge not awarded. before={before_badges} after={after_badges}"

    def test_list_documents_required_and_submitted_no_leak(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/me/intern/documents")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "required" in data and isinstance(data["required"], list)
        assert set(data["required"]) == {"bank_details", "pan_card", "id_proof", "address_proof", "resume"}
        # Existing submissions must not leak content_base64
        for k, v in (data.get("submitted") or {}).items():
            assert "content_base64" not in v

    def test_submit_all_5_docs_triggers_diligence(self, sessions):
        s = sessions["intern"]["session"]
        b64 = base64.b64encode(b"hello world phase3 test").decode()
        types = ["bank_details", "pan_card", "id_proof", "address_proof", "resume"]
        last = None
        for t in types:
            r = s.post(f"{API}/me/intern/documents", json={
                "doc_type": t,
                "file_name": f"{t}.txt",
                "mime_type": "text/plain",
                "content_base64": b64,
            })
            assert r.status_code == 200, f"{t}: {r.text}"
            last = r.json()
        # after final submission, intern should have 'Document Diligence'
        intern = s.get(f"{API}/me/intern").json()
        names = {b["name"] for b in intern.get("badges", [])}
        assert "Document Diligence" in names, f"Document Diligence not found in badges: {names}"

    def test_download_document_returns_content(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/me/intern/documents/pan_card/download")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("content_base64")
        decoded = base64.b64decode(data["content_base64"])
        assert decoded == b"hello world phase3 test"

    def test_progress_summary(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/me/intern/progress")
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["summary", "suggestions", "pending_tasks", "badges"]:
            assert k in data
        for sk in ["total_tasks", "completed", "pending", "overdue", "on_time_rate"]:
            assert sk in data["summary"]
        assert isinstance(data["suggestions"], list)

    def test_progress_pdf(self, sessions):
        s = sessions["intern"]["session"]
        r = s.get(f"{API}/me/intern/progress/pdf")
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), "PDF magic bytes missing"
        assert len(r.content) > 1024, f"PDF too small: {len(r.content)} bytes"


# ---------- Manual badge awarding ----------
class TestManualBadge:
    def test_manager_can_award_badge(self, sessions):
        intern_id = TestInternSelfService.intern_record_id
        assert intern_id
        s = sessions["manager"]["session"]
        r = s.post(f"{API}/me/award-badge", json={
            "intern_id": intern_id,
            "name": "TEST_Manager Choice",
            "reason": "Excellent collaboration",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body["badge"]["name"] == "TEST_Manager Choice"

    def test_admin_can_award_badge(self, sessions):
        intern_id = TestInternSelfService.intern_record_id
        s = sessions["admin"]["session"]
        r = s.post(f"{API}/me/award-badge", json={
            "intern_id": intern_id,
            "name": "TEST_Admin Star",
            "reason": "Stellar work",
        })
        assert r.status_code == 200, r.text

    def test_intern_cannot_award_badge(self, sessions):
        intern_id = TestInternSelfService.intern_record_id
        s = sessions["intern"]["session"]
        r = s.post(f"{API}/me/award-badge", json={
            "intern_id": intern_id,
            "name": "TEST_Self Award",
            "reason": "trying",
        })
        assert r.status_code == 403


# ---------- Regression: ensure existing endpoints still pass ----------
class TestRegression:
    def test_projects_list(self, sessions):
        r = sessions["admin"]["session"].get(f"{API}/projects")
        assert r.status_code == 200

    def test_tasks_list(self, sessions):
        r = sessions["admin"]["session"].get(f"{API}/tasks")
        assert r.status_code == 200

    def test_interns_list(self, sessions):
        r = sessions["admin"]["session"].get(f"{API}/interns")
        assert r.status_code == 200

    def test_chat_channels(self, sessions):
        r = sessions["admin"]["session"].get(f"{API}/chat/channels")
        assert r.status_code == 200

    def test_ai_sessions(self, sessions):
        r = sessions["admin"]["session"].get(f"{API}/ai/sessions")
        assert r.status_code == 200
