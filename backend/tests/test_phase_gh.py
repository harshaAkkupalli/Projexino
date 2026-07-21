"""
Phase G + H — AI config / doc streaming / task full / admin-edit-any-user
+ Connections (org chart) + Calendly-style booking.

Live preview backend at REACT_APP_BACKEND_URL. Cleanup performed at the end.
"""
import os
import uuid
import base64
from datetime import datetime, timezone, timedelta, date

import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = {"email": "admin@projexino.com", "password": "Projexino@2026"}
MANAGER = {"email": "manager@projexino.com", "password": "Manager@2026"}
HR_USER = {"email": "hr@projexino.com", "password": "HR@2026"}
MEMBER = {"email": "member@projexino.com", "password": "Member@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def super_token():
    return _login(SUPER["email"], SUPER["password"])


@pytest.fixture(scope="module")
def manager_token():
    return _login(MANAGER["email"], MANAGER["password"])


@pytest.fixture(scope="module")
def hr_token():
    return _login(HR_USER["email"], HR_USER["password"])


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER["email"], MEMBER["password"])


@pytest.fixture(scope="module")
def intern_token():
    return _login(INTERN["email"], INTERN["password"])


# =====================================================================
# Phase G — AI Config
# =====================================================================
class TestAIConfig:
    def test_get_ai_config_super(self, super_token):
        r = requests.get(f"{API}/ai/config", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "source" in data and data["source"] in ("db", "env", "none")
        assert "provider" in data
        assert "api_key_masked" in data
        assert "configured" in data
        # emergent env should be detected
        assert "emergent" in (data.get("env_providers_detected") or [])

    def test_get_ai_config_forbidden_for_member(self, member_token):
        r = requests.get(f"{API}/ai/config", headers=_h(member_token), timeout=15)
        assert r.status_code == 403

    def test_put_ai_config_persists_and_delete_clears(self, super_token):
        # PUT override
        payload = {"provider": "openai", "api_key": "sk-test-dummy-key-1234567890", "model": "gpt-4o-mini"}
        r = requests.put(f"{API}/ai/config", headers=_h(super_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["provider"] == "openai"
        assert body["api_key_masked"].startswith("sk-t") and body["api_key_masked"].endswith("7890")

        # Verify GET shows source=db
        r2 = requests.get(f"{API}/ai/config", headers=_h(super_token), timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["source"] == "db"
        assert d2["provider"] == "openai"

        # DELETE clears
        r3 = requests.delete(f"{API}/ai/config", headers=_h(super_token), timeout=15)
        assert r3.status_code == 200
        assert r3.json()["ok"] is True

        # GET back to env
        r4 = requests.get(f"{API}/ai/config", headers=_h(super_token), timeout=15)
        d4 = r4.json()
        assert d4["source"] in ("env", "none")

    def test_put_ai_config_forbidden_for_manager(self, manager_token):
        r = requests.put(f"{API}/ai/config", headers=_h(manager_token),
                         json={"provider": "openai", "api_key": "sk-xxx-yyy-zzz"}, timeout=15)
        assert r.status_code == 403

    def test_ai_test_endpoint(self, super_token):
        r = requests.post(f"{API}/ai/test", headers=_h(super_token),
                          json={"prompt": "Say hello in 3 words."}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        # Either ok:true with text or ok:false with error — test endpoint should respond
        assert "ok" in data
        assert "provider" in data
        if data.get("ok"):
            assert isinstance(data.get("response"), str) and len(data["response"]) > 0


# =====================================================================
# Phase G — Doc Verification streaming
# =====================================================================
class TestDocStream:
    def test_stream_doc_intern_self(self, intern_token, super_token):
        # Resolve intern record id
        r0 = requests.get(f"{API}/me/intern", headers=_h(intern_token), timeout=15)
        assert r0.status_code == 200, r0.text
        intern_record_id = r0.json()["id"]
        # Submit doc via intern self-service
        body = {"doc_type": "id_proof", "file_name": "id.png", "mime_type": "image/png",
                "content_base64": TINY_PNG_B64}
        r = requests.post(f"{API}/me/intern/documents", headers=_h(intern_token), json=body, timeout=20)
        assert r.status_code in (200, 201), f"upload doc: {r.status_code} {r.text[:200]}"

        # Stream the file as super_admin (priv access)
        r2 = requests.get(f"{API}/doc-verification/intern/{intern_record_id}/id_proof/file",
                          headers=_h(super_token), timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.headers.get("content-type", "").startswith("image/png")
        assert "inline" in r2.headers.get("content-disposition", "").lower()
        # Decoded bytes should match
        assert r2.content == base64.b64decode(TINY_PNG_B64)

    def test_stream_doc_forbidden(self, intern_token, member_token):
        r0 = requests.get(f"{API}/me/intern", headers=_h(intern_token), timeout=15).json()
        r = requests.get(f"{API}/doc-verification/intern/{r0['id']}/id_proof/file",
                        headers=_h(member_token), timeout=15)
        # member is non-priv and non-owner
        assert r.status_code == 403

    def test_stream_doc_404(self, super_token):
        r = requests.get(f"{API}/doc-verification/intern/nonexistent-id/id_proof/file",
                         headers=_h(super_token), timeout=15)
        assert r.status_code == 404


# =====================================================================
# Phase G — Task full
# =====================================================================
class TestTaskFull:
    @pytest.fixture(scope="class")
    def task_id(self, super_token):
        # Create a task as super_admin
        payload = {"title": f"TEST_task_{uuid.uuid4().hex[:8]}", "status": "todo",
                   "priority": "medium", "owner_id": "auto"}
        r = requests.post(f"{API}/tasks", headers=_h(super_token), json=payload, timeout=15)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_task_full_priv(self, super_token, task_id):
        r = requests.get(f"{API}/lifecycle/task/{task_id}/full", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "task" in data and data["task"]["id"] == task_id
        assert "project" in data
        assert "timeline" in data and isinstance(data["timeline"], list)
        assert "my_started_at" in data

    def test_task_full_forbidden_for_member(self, member_token, task_id):
        r = requests.get(f"{API}/lifecycle/task/{task_id}/full", headers=_h(member_token), timeout=15)
        assert r.status_code == 403

    def test_task_full_404(self, super_token):
        r = requests.get(f"{API}/lifecycle/task/nonexistent-task/full", headers=_h(super_token), timeout=15)
        assert r.status_code == 404


# =====================================================================
# Phase G — Admin users
# =====================================================================
class TestAdminUsers:
    def test_list_users_super(self, super_token):
        r = requests.get(f"{API}/admin/users", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) >= 5
        for u in data:
            assert "password_hash" not in u

    def test_list_users_forbidden_for_hr(self, hr_token):
        r = requests.get(f"{API}/admin/users", headers=_h(hr_token), timeout=15)
        assert r.status_code == 403

    def test_patch_profile(self, super_token, member_token):
        me = requests.get(f"{API}/auth/me", headers=_h(member_token), timeout=15).json()
        new_bio = f"TEST_bio_{uuid.uuid4().hex[:6]}"
        r = requests.patch(f"{API}/admin/users/{me['id']}/profile", headers=_h(super_token),
                          json={"bio": new_bio, "designation": "QA Engineer"}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["bio"] == new_bio
        assert data["designation"] == "QA Engineer"
        assert "password_hash" not in data

    def test_patch_cannot_demote_primary_super_admin(self, super_token):
        # Find primary super admin
        users = requests.get(f"{API}/admin/users", headers=_h(super_token), timeout=15).json()
        primary = next((u for u in users if u.get("is_primary_super_admin")), None)
        if not primary:
            primary = next((u for u in users if u["email"] == SUPER["email"]), None)
        assert primary, "Primary super admin not found"
        r = requests.patch(f"{API}/admin/users/{primary['id']}/profile", headers=_h(super_token),
                          json={"role": "manager"}, timeout=15)
        assert r.status_code == 400

    def test_patch_invalid_role(self, super_token, member_token):
        me = requests.get(f"{API}/auth/me", headers=_h(member_token), timeout=15).json()
        r = requests.patch(f"{API}/admin/users/{me['id']}/profile", headers=_h(super_token),
                          json={"role": "godmode"}, timeout=15)
        assert r.status_code == 400

    def test_post_avatar(self, super_token, member_token):
        me = requests.get(f"{API}/auth/me", headers=_h(member_token), timeout=15).json()
        r = requests.post(f"{API}/admin/users/{me['id']}/avatar", headers=_h(super_token),
                         json={"content_base64": TINY_PNG_B64, "mime_type": "image/png"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_post_avatar_forbidden(self, manager_token, member_token):
        me = requests.get(f"{API}/auth/me", headers=_h(member_token), timeout=15).json()
        r = requests.post(f"{API}/admin/users/{me['id']}/avatar", headers=_h(manager_token),
                         json={"content_base64": TINY_PNG_B64, "mime_type": "image/png"}, timeout=15)
        assert r.status_code == 403


# =====================================================================
# Phase H — Connections / Org chart
# =====================================================================
class TestConnections:
    def test_my_connections(self, member_token):
        r = requests.get(f"{API}/connections/me", headers=_h(member_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "me" in data and "manager" in data and "direct_reports" in data
        assert isinstance(data["direct_reports"], list)

    def test_org_chart_super(self, super_token):
        r = requests.get(f"{API}/connections/org-chart", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "roots" in data and isinstance(data["roots"], list)
        assert "total" in data and data["total"] >= 1
        # Sanity: nodes have children list
        if data["roots"]:
            assert "children" in data["roots"][0]

    def test_org_chart_forbidden_for_member(self, member_token):
        r = requests.get(f"{API}/connections/org-chart", headers=_h(member_token), timeout=15)
        assert r.status_code == 403


# =====================================================================
# Phase H — Booking
# =====================================================================
def _next_weekday(days_ahead_min=2):
    """Return a future Mon-Fri date that's at least N days out."""
    d = (datetime.now(timezone.utc) + timedelta(days=days_ahead_min)).date()
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


class TestBooking:
    @pytest.fixture(scope="class")
    def page_slug(self, super_token):
        payload = {
            "title": "TEST Discovery Call",
            "description": "Test page",
            "duration_minutes": 30,
            "buffer_minutes": 5,
            "advance_days": 30,
            "min_notice_minutes": 30,
        }
        r = requests.post(f"{API}/booking/pages", headers=_h(super_token), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        slug = r.json()["slug"]
        yield slug
        # Cleanup
        requests.delete(f"{API}/booking/pages/{slug}", headers=_h(super_token), timeout=15)

    def test_create_and_list(self, super_token, page_slug):
        r = requests.get(f"{API}/booking/pages", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        pages = r.json()
        assert any(p["slug"] == page_slug for p in pages)

    def test_patch_page(self, super_token, page_slug):
        r = requests.patch(f"{API}/booking/pages/{page_slug}", headers=_h(super_token),
                          json={"description": "Updated desc", "color": "#0EA5E9"}, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["description"] == "Updated desc"
        assert body["color"] == "#0EA5E9"

    def test_public_page(self, page_slug):
        # No auth required
        r = requests.get(f"{API}/booking/pages/{page_slug}/public", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["slug"] == page_slug
        assert data["title"] == "TEST Discovery Call"
        assert "owner_name" in data
        assert data["duration_minutes"] == 30

    def test_public_page_404(self):
        r = requests.get(f"{API}/booking/pages/non-existent-slug/public", timeout=15)
        assert r.status_code == 404

    def test_public_slots(self, page_slug):
        d = _next_weekday(days_ahead_min=3)
        r = requests.get(f"{API}/booking/pages/{page_slug}/slots",
                         params={"date": d.isoformat()}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "slots" in data
        assert isinstance(data["slots"], list)
        assert len(data["slots"]) > 0, f"No slots returned for weekday {d}"
        # ISO format
        datetime.fromisoformat(data["slots"][0])

    def test_public_book_and_conflict(self, page_slug, super_token):
        d = _next_weekday(days_ahead_min=5)
        slots_r = requests.get(f"{API}/booking/pages/{page_slug}/slots",
                              params={"date": d.isoformat()}, timeout=15)
        slots = slots_r.json()["slots"]
        assert len(slots) > 0
        slot = slots[0]
        guest_email = f"TEST_guest_{uuid.uuid4().hex[:6]}@example.com"
        book_payload = {
            "guest_name": "TEST Guest",
            "guest_email": guest_email,
            "slot_iso": slot,
            "notes": "test booking",
        }
        r = requests.post(f"{API}/booking/pages/{page_slug}/book", json=book_payload, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert "booking_id" in data
        assert "meet_link" in data  # may be empty
        booking_id = data["booking_id"]

        # Second booking same slot should 409
        r2 = requests.post(f"{API}/booking/pages/{page_slug}/book", json=book_payload, timeout=30)
        assert r2.status_code == 409

        # Cleanup booking — cancel via admin
        requests.post(f"{API}/booking/{booking_id}/cancel", headers=_h(super_token), timeout=15)

    def test_my_bookings(self, super_token):
        r = requests.get(f"{API}/booking/my-bookings", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_upcoming(self, super_token, page_slug):
        # Create a future booking
        d = _next_weekday(days_ahead_min=7)
        slots = requests.get(f"{API}/booking/pages/{page_slug}/slots",
                            params={"date": d.isoformat()}, timeout=15).json()["slots"]
        if not slots:
            pytest.skip("No slots available")
        book = requests.post(f"{API}/booking/pages/{page_slug}/book", timeout=30, json={
            "guest_name": "TEST Up", "guest_email": f"TEST_up_{uuid.uuid4().hex[:6]}@example.com",
            "slot_iso": slots[0]}).json()
        booking_id = book["booking_id"]

        r = requests.get(f"{API}/booking/upcoming", headers=_h(super_token), timeout=15)
        assert r.status_code == 200, r.text
        upc = r.json()
        assert any(b["id"] == booking_id for b in upc)

        # Cancel and verify status
        rc = requests.post(f"{API}/booking/{booking_id}/cancel", headers=_h(super_token), timeout=15)
        assert rc.status_code == 200
        assert rc.json()["ok"] is True

    def test_create_page_forbidden_for_member(self, member_token):
        r = requests.post(f"{API}/booking/pages", headers=_h(member_token),
                         json={"title": "x"}, timeout=15)
        assert r.status_code == 403

    def test_weekend_no_slots(self, page_slug):
        # Pick a Saturday
        today = datetime.now(timezone.utc).date()
        d = today + timedelta(days=1)
        while d.weekday() != 5:  # Saturday
            d += timedelta(days=1)
        r = requests.get(f"{API}/booking/pages/{page_slug}/slots",
                         params={"date": d.isoformat()}, timeout=15)
        assert r.status_code == 200
        assert r.json()["slots"] == []


# =====================================================================
# Quick win — GMAIL_SCOPES includes calendar.events
# =====================================================================
def test_gmail_scopes_contains_calendar():
    import sys
    sys.path.insert(0, "/app/backend")
    import email_module
    assert "https://www.googleapis.com/auth/calendar.events" in email_module.GMAIL_SCOPES
