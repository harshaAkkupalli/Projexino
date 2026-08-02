"""Backend API tests for Projexino extensions:
Projects, Documents, Chat, Notifications, Interns, Intern Tasks, Certificate, AI.
"""
import os
import io
import base64
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s


# =============== PROJECTS ===============
class TestProjects:
    created_id = None

    def test_unauth_projects_blocked(self):
        r = requests.get(f"{API}/projects")
        assert r.status_code == 401

    def test_create_project(self, admin_session):
        payload = {
            "name": "TEST_Project Alpha",
            "description": "Alpha test project",
            "client": "ACME",
            "status": "planning",
            "priority": "high",
        }
        r = admin_session.post(f"{API}/projects", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Project Alpha"
        assert data["status"] == "planning"
        assert data["priority"] == "high"
        assert "id" in data and isinstance(data["id"], str)
        TestProjects.created_id = data["id"]

    def test_list_projects(self, admin_session):
        r = admin_session.get(f"{API}/projects")
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert TestProjects.created_id in ids

    def test_get_project(self, admin_session):
        r = admin_session.get(f"{API}/projects/{TestProjects.created_id}")
        assert r.status_code == 200
        assert r.json()["id"] == TestProjects.created_id

    def test_patch_project_status_triggers_notification(self, admin_session):
        # baseline notifs
        before = admin_session.get(f"{API}/notifications").json()
        before_count = len(before)
        r = admin_session.patch(f"{API}/projects/{TestProjects.created_id}", json={"status": "in_progress"})
        assert r.status_code == 200
        assert r.json()["status"] == "in_progress"
        # creation also creates a notif; ensure list grew or at least one project-related notif exists
        after = admin_session.get(f"{API}/notifications").json()
        assert len(after) >= before_count
        kinds = [n["kind"] for n in after]
        assert any("project" in k for k in kinds), f"No project-related notif kind in {kinds}"

    def test_analytics_summary(self, admin_session):
        r = admin_session.get(f"{API}/projects/analytics/summary")
        assert r.status_code == 200
        data = r.json()
        # tolerant - check for at least the common keys
        assert "total" in data or "by_status" in data

    def test_delete_project(self, admin_session):
        r = admin_session.delete(f"{API}/projects/{TestProjects.created_id}")
        assert r.status_code == 200
        r2 = admin_session.get(f"{API}/projects/{TestProjects.created_id}")
        assert r2.status_code == 404


# =============== DOCUMENTS ===============
class TestDocuments:
    created_id = None

    def test_upload_document(self, admin_session):
        content = b"Hello Projexino test document"
        b64 = base64.b64encode(content).decode()
        payload = {
            "name": "TEST_hello.txt",
            "mime_type": "text/plain",
            "size": len(content),
            "content_base64": b64,
            "description": "test doc",
        }
        r = admin_session.post(f"{API}/documents", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_hello.txt"
        assert data["size"] == len(content)
        # list response must exclude content_base64
        assert "content_base64" not in data
        TestDocuments.created_id = data["id"]

    def test_list_documents_excludes_content(self, admin_session):
        r = admin_session.get(f"{API}/documents")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for d in items:
            assert "content_base64" not in d

    def test_download_document(self, admin_session):
        r = admin_session.get(f"{API}/documents/{TestDocuments.created_id}/download")
        assert r.status_code == 200
        data = r.json()
        assert "content_base64" in data
        decoded = base64.b64decode(data["content_base64"])
        assert decoded == b"Hello Projexino test document"

    def test_add_comment(self, admin_session):
        r = admin_session.post(
            f"{API}/documents/{TestDocuments.created_id}/comments",
            json={"message": "Looks good"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert any(c.get("message") == "Looks good" for c in data.get("comments", []))

    def test_delete_document(self, admin_session):
        r = admin_session.delete(f"{API}/documents/{TestDocuments.created_id}")
        assert r.status_code == 200


# =============== CHAT ===============
class TestChat:
    channel_id = None

    def test_create_channel(self, admin_session):
        r = admin_session.post(
            f"{API}/chat/channels",
            json={"name": "TEST_general", "kind": "group", "member_ids": []},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_general"
        TestChat.channel_id = data["id"]

    def test_list_channels(self, admin_session):
        r = admin_session.get(f"{API}/chat/channels")
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert TestChat.channel_id in ids

    def test_send_text_message(self, admin_session):
        r = admin_session.post(
            f"{API}/chat/messages",
            json={"channel_id": TestChat.channel_id, "text": "Hello chat"},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["text"] == "Hello chat"
        assert data["channel_id"] == TestChat.channel_id

    def test_send_attachment(self, admin_session):
        b64 = base64.b64encode(b"PNG-like-bytes").decode()
        r = admin_session.post(
            f"{API}/chat/messages",
            json={
                "channel_id": TestChat.channel_id,
                "text": "with file",
                "attachment_name": "TEST_file.txt",
                "attachment_mime": "text/plain",
                "attachment_base64": b64,
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["attachment_name"] == "TEST_file.txt"
        # attachment_base64 must not be returned in message body
        assert "attachment_base64" not in data

    def test_list_messages(self, admin_session):
        r = admin_session.get(f"{API}/chat/channels/{TestChat.channel_id}/messages")
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2
        texts = [m["text"] for m in msgs]
        assert "Hello chat" in texts

    def test_empty_message_rejected(self, admin_session):
        r = admin_session.post(
            f"{API}/chat/messages",
            json={"channel_id": TestChat.channel_id, "text": ""},
        )
        assert r.status_code == 400

    def test_delete_channel(self, admin_session):
        r = admin_session.delete(f"{API}/chat/channels/{TestChat.channel_id}")
        assert r.status_code == 200


# =============== NOTIFICATIONS ===============
class TestNotifications:
    def test_list_notifications(self, admin_session):
        r = admin_session.get(f"{API}/notifications")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_read_all(self, admin_session):
        r = admin_session.post(f"{API}/notifications/read-all")
        assert r.status_code == 200
        # verify
        items = admin_session.get(f"{API}/notifications").json()
        for n in items:
            assert n["read"] is True

    def test_read_single(self, admin_session):
        # create a project to trigger a notification, then read it
        cr = admin_session.post(f"{API}/projects", json={"name": "TEST_ProjNotif"})
        assert cr.status_code == 200
        pid = cr.json()["id"]
        items = admin_session.get(f"{API}/notifications").json()
        unread = [n for n in items if not n["read"]]
        if unread:
            nid = unread[0]["id"]
            r = admin_session.post(f"{API}/notifications/{nid}/read")
            assert r.status_code == 200
        admin_session.delete(f"{API}/projects/{pid}")


# =============== INTERNS + TASKS + BADGES + CERTIFICATE ===============
class TestInterns:
    intern_id = None
    task_id = None

    def test_create_intern(self, admin_session):
        payload = {
            "name": "TEST_Intern Bob",
            "email": f"test_intern_{uuid.uuid4().hex[:6]}@projexino.com",
            "designation": "SDE Intern",
            "department": "Engineering",
            "reporting_manager": "Maya Iyer",
            "start_date": "2026-01-01",
            "end_date": "2026-06-30",
        }
        r = admin_session.post(f"{API}/interns", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == "TEST_Intern Bob"
        assert data["status"] == "active"
        assert data["badges"] == []
        assert data["tasks_on_time"] == 0
        TestInterns.intern_id = data["id"]

    def test_create_intern_task(self, admin_session):
        # Deadline in the future
        payload = {
            "intern_id": TestInterns.intern_id,
            "title": "TEST_Build login",
            "description": "ship it",
            "deadline": "2099-12-31",
            "priority": "high",
        }
        r = admin_session.post(f"{API}/intern-tasks", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "assigned"
        TestInterns.task_id = data["id"]
        # tasks_assigned should bump
        r2 = admin_session.get(f"{API}/interns")
        intern = next(i for i in r2.json() if i["id"] == TestInterns.intern_id)
        assert intern["tasks_assigned"] == 1

    def test_complete_task_awards_badge(self, admin_session):
        r = admin_session.patch(
            f"{API}/intern-tasks/{TestInterns.task_id}",
            json={"status": "completed", "completion_note": "done"},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "completed"
        assert data["on_time"] is True
        # Intern badge appears + tasks_on_time bumps
        interns = admin_session.get(f"{API}/interns").json()
        intern = next(i for i in interns if i["id"] == TestInterns.intern_id)
        assert intern["tasks_on_time"] == 1
        badge_names = [b["name"] for b in intern["badges"]]
        assert "On-Time Achiever" in badge_names
        # notification created
        notifs = admin_session.get(f"{API}/notifications").json()
        assert any(n["kind"] == "intern_task_completed" for n in notifs)

    def test_certificate_pdf(self, admin_session):
        r = admin_session.get(f"{API}/interns/{TestInterns.intern_id}/certificate")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), "Response is not a PDF binary"
        # status flipped to completed
        interns = admin_session.get(f"{API}/interns").json()
        intern = next(i for i in interns if i["id"] == TestInterns.intern_id)
        assert intern["status"] == "completed"

    def test_cleanup_intern(self, admin_session):
        r = admin_session.delete(f"{API}/interns/{TestInterns.intern_id}")
        assert r.status_code == 200


# =============== AI ===============
class TestAI:
    session_id = None

    def test_create_session(self, admin_session):
        r = admin_session.post(f"{API}/ai/sessions", json={"title": "TEST AI chat", "mode": "general"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"] == "TEST AI chat"
        assert data["mode"] == "general"
        TestAI.session_id = data["id"]

    def test_send_and_receive(self, admin_session):
        r = admin_session.post(
            f"{API}/ai/send",
            json={"session_id": TestAI.session_id, "message": "Say hello in one short sentence.", "mode": "general"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        # response should include the assistant message text
        msgs = admin_session.get(f"{API}/ai/sessions/{TestAI.session_id}/messages").json()
        roles = [m["role"] for m in msgs]
        assert "user" in roles
        assert "assistant" in roles
        assistant_msg = next(m for m in msgs if m["role"] == "assistant")
        assert isinstance(assistant_msg["content"], str) and len(assistant_msg["content"]) > 0

    def test_cleanup_session(self, admin_session):
        r = admin_session.delete(f"{API}/ai/sessions/{TestAI.session_id}")
        assert r.status_code == 200
