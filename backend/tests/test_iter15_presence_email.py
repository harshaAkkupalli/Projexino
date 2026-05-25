"""
Iteration 15 backend tests:
  1. Calling REMOVED — /api/calls* must 404 (router gone)
  2. Auth events — login/logout/admin filters/summary/stats/hours
  3. Presence — heartbeat, status whitelist, me, notice-ack, admin endpoints
  4. Email Campaigns — CRUD, recipient resolution, scheduling, send, AI draft
"""
import os
import re
import time
import pytest
import requests
from pathlib import Path

# Resolve REACT_APP_BACKEND_URL with fallback to /app/frontend/.env
BASE = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
if not BASE:
    fenv = Path("/app/frontend/.env")
    if fenv.exists():
        for line in fenv.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
BASE = BASE.rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not set"

CREDS = {
    "admin":   ("admin@projexino.com",   "Projexino@2026"),
    "manager": ("manager@projexino.com", "Manager@2026"),
    "hr":      ("hr@projexino.com",      "HR@2026"),
    "member":  ("member@projexino.com",  "Member@2026"),
    "intern":  ("intern@projexino.com",  "Intern@2026"),
}


def _login(role):
    email, pw = CREDS[role]
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {role} failed: {r.status_code} {r.text}"
    data = r.json()
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    return s, data


@pytest.fixture(scope="session")
def admin():
    return _login("admin")


@pytest.fixture(scope="session")
def manager():
    return _login("manager")


@pytest.fixture(scope="session")
def hr():
    return _login("hr")


@pytest.fixture(scope="session")
def member():
    return _login("member")


@pytest.fixture(scope="session")
def intern():
    return _login("intern")


# ──────────────────── 1. Calls removed ────────────────────
class TestCallsRemoved:
    def test_calls_create_404(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/calls", json={"callee_id": "x"}, timeout=10)
        assert r.status_code == 404, f"expected 404, got {r.status_code}"

    def test_calls_incoming_404(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/calls/incoming", timeout=10)
        assert r.status_code == 404

    def test_calls_id_404(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/calls/anything", timeout=10)
        assert r.status_code == 404


# ──────────────────── 2. Auth Events ────────────────────
class TestAuthEvents:
    def test_login_creates_event(self, admin):
        # Force a fresh login for member, check event appears
        s_member, _ = _login("member")
        # admin reads auth events
        s_admin, _ = admin
        r = s_admin.get(f"{BASE}/api/admin/auth-events", params={"kind": "login"}, timeout=20)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        # at least one login event for member should exist
        emails = [e.get("email") for e in events]
        assert "member@projexino.com" in emails, f"member login not logged: {emails[:5]}"

    def test_logout_creates_event(self, admin):
        # Login intern then logout
        s_intern, _ = _login("intern")
        r_out = s_intern.post(f"{BASE}/api/auth/logout", timeout=20)
        assert r_out.status_code == 200
        time.sleep(0.5)
        s_admin, _ = admin
        r = s_admin.get(f"{BASE}/api/admin/auth-events", params={"kind": "logout"}, timeout=20)
        assert r.status_code == 200
        events = r.json()
        assert any(e.get("email") == "intern@projexino.com" for e in events), \
            "intern logout not recorded"

    def test_auth_events_team_member_403(self, member):
        s, _ = member
        r = s.get(f"{BASE}/api/admin/auth-events", timeout=20)
        assert r.status_code == 403

    def test_auth_events_summary_day(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/admin/auth-events/summary", params={"period": "day"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            row = data[0]
            assert "logins" in row and "logouts" in row and "date" in row

    def test_auth_events_summary_month(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/admin/auth-events/summary", params={"period": "month"}, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ──────────────────── 3. Presence ────────────────────
class TestPresence:
    def test_heartbeat_returns_online(self, member):
        s, _ = member
        r = s.post(f"{BASE}/api/presence/heartbeat", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("ok") is True
        assert d.get("online") is True
        assert d.get("status") in ("online", "on_break")

    def test_status_online_ok(self, member):
        s, _ = member
        r = s.post(f"{BASE}/api/presence/status", json={"status": "online"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("status") == "online"

    def test_status_on_break_ok(self, member):
        s, _ = member
        r = s.post(f"{BASE}/api/presence/status", json={"status": "on_break"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("status") == "on_break"

    @pytest.mark.parametrize("bad", ["offline", "working", "available", "OOO", ""])
    def test_status_bad_rejected(self, member, bad):
        s, _ = member
        r = s.post(f"{BASE}/api/presence/status", json={"status": bad}, timeout=20)
        assert r.status_code == 400, f"status '{bad}' should be 400, got {r.status_code}"

    def test_presence_me_has_allowed_statuses(self, manager):
        s, _ = manager
        r = s.get(f"{BASE}/api/presence/me", timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d.get("allowed_statuses") == ["online", "on_break"]
        assert "notice_shown" in d
        assert "status" in d

    def test_presence_notice_ack_persists(self, hr):
        s, _ = hr
        r = s.post(f"{BASE}/api/presence/notice-ack", timeout=20)
        assert r.status_code == 200
        r2 = s.get(f"{BASE}/api/presence/me", timeout=20)
        assert r2.status_code == 200
        assert r2.json().get("notice_shown") is True

    def test_admin_presence_list(self, admin, member):
        # Ensure member has a heartbeat so they show up
        member[0].post(f"{BASE}/api/presence/heartbeat", timeout=10)
        s, _ = admin
        r = s.get(f"{BASE}/api/admin/presence", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 1
        row = rows[0]
        assert "online" in row and "status" in row and "email" in row

    def test_admin_presence_manager_allowed(self, manager):
        s, _ = manager
        r = s.get(f"{BASE}/api/admin/presence", timeout=20)
        assert r.status_code == 200

    def test_admin_presence_hr_allowed(self, hr):
        s, _ = hr
        r = s.get(f"{BASE}/api/admin/presence", timeout=20)
        assert r.status_code == 200

    def test_admin_presence_member_403(self, member):
        s, _ = member
        r = s.get(f"{BASE}/api/admin/presence", timeout=20)
        assert r.status_code == 403

    def test_admin_presence_intern_403(self, intern):
        s, _ = intern
        r = s.get(f"{BASE}/api/admin/presence", timeout=20)
        assert r.status_code == 403

    def test_admin_presence_stats(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/admin/presence/stats", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_users", "online_now", "by_status", "logins_today"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["by_status"], dict)
        assert isinstance(d["total_users"], int)

    def test_admin_presence_hours_admin_only(self, admin, manager):
        s, _ = admin
        r = s.get(f"{BASE}/api/admin/presence/hours", params={"period": "month"}, timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            row = rows[0]
            for k in ("user_id", "total_seconds", "total_hours", "sessions", "days_active"):
                assert k in row
        # Manager should be denied
        sm, _ = manager
        r2 = sm.get(f"{BASE}/api/admin/presence/hours", timeout=20)
        assert r2.status_code == 403


# ──────────────────── 4. Email Campaigns ────────────────────
class TestEmailCampaigns:
    created_ids: list = []

    def test_create_draft_with_manual_email(self, admin):
        s, _ = admin
        payload = {
            "name": "TEST_ITER15 draft",
            "subject": "Hello there",
            "body_html": "<p>hi</p>",
            "emails": ["test_a@example.com"],
        }
        r = s.post(f"{BASE}/api/email/campaigns", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "draft"
        assert d["total_recipients"] == 1
        assert "test_a@example.com" in d["recipients"]
        TestEmailCampaigns.created_ids.append(d["id"])

    def test_list_and_get(self, admin):
        s, _ = admin
        r = s.get(f"{BASE}/api/email/campaigns", timeout=20)
        assert r.status_code == 200
        lst = r.json()
        assert isinstance(lst, list)
        if TestEmailCampaigns.created_ids:
            cid = TestEmailCampaigns.created_ids[0]
            r2 = s.get(f"{BASE}/api/email/campaigns/{cid}", timeout=20)
            assert r2.status_code == 200
            assert r2.json()["id"] == cid

    def test_no_recipients_400(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 empty",
            "subject": "s",
            "body_html": "<p>b</p>",
        }, timeout=20)
        assert r.status_code == 400

    def test_include_all_employees(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 all-emps",
            "subject": "s", "body_html": "<p>b</p>",
            "include_all_employees": True,
        }, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["total_recipients"] >= 4
        emails = d["recipients"]
        assert any("@projexino.com" in e for e in emails)
        TestEmailCampaigns.created_ids.append(d["id"])

    def test_include_all_clients_no_error(self, admin):
        # Will succeed only if at least one finance client_emails exists; otherwise 400
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 all-cli",
            "subject": "s", "body_html": "<p>b</p>",
            "include_all_clients": True,
        }, timeout=20)
        assert r.status_code in (200, 400)
        if r.status_code == 200:
            TestEmailCampaigns.created_ids.append(r.json()["id"])

    def test_intern_forbidden(self, intern):
        s, _ = intern
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "x", "subject": "s", "body_html": "<p>b</p>",
            "emails": ["x@y.com"],
        }, timeout=20)
        assert r.status_code == 403
        r2 = s.get(f"{BASE}/api/email/campaigns", timeout=20)
        assert r2.status_code == 403

    def test_scheduled_future(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 scheduled",
            "subject": "s", "body_html": "<p>b</p>",
            "emails": ["sched@example.com"],
            "scheduled_at": "2030-01-01T00:00:00+00:00",
        }, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "scheduled"
        assert d["scheduled_at"]
        TestEmailCampaigns.created_ids.append(d["id"])

    def test_scheduled_invalid_400(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 bad sched",
            "subject": "s", "body_html": "<p>b</p>",
            "emails": ["x@y.com"],
            "scheduled_at": "not-a-date",
        }, timeout=20)
        assert r.status_code == 400

    def test_send_immediate_no_gmail_marks_failed(self, admin):
        s, _ = admin
        # create a draft
        r = s.post(f"{BASE}/api/email/campaigns", json={
            "name": "TEST_ITER15 send-now",
            "subject": "s", "body_html": "<p>b</p>",
            "emails": ["nogmail@example.com"],
        }, timeout=20)
        assert r.status_code == 200
        cid = r.json()["id"]
        TestEmailCampaigns.created_ids.append(cid)

        r2 = s.post(f"{BASE}/api/email/campaigns/{cid}/send", timeout=20)
        assert r2.status_code == 200
        # Poll for status transition
        final = None
        for _ in range(20):
            time.sleep(0.5)
            rg = s.get(f"{BASE}/api/email/campaigns/{cid}", timeout=10)
            if rg.status_code == 200:
                st = rg.json().get("status")
                if st in ("failed", "sent", "partial"):
                    final = rg.json()
                    break
        assert final is not None, "campaign did not transition out of sending"
        assert final["status"] == "failed", f"expected failed (no gmail), got {final['status']}"
        assert "Gmail not connected" in (final.get("error") or ""), final.get("error")

    def test_ai_draft_returns_subject_body(self, admin):
        s, _ = admin
        r = s.post(f"{BASE}/api/email/campaigns/ai-draft", json={
            "prompt": "Announce our new quarterly feature release.",
            "audience": "clients",
            "tone": "professional",
        }, timeout=120)
        # Could be 200 (success) or 502 if LLM errors — we accept 200 strictly per spec
        assert r.status_code == 200, f"AI draft failed: {r.status_code} {r.text[:300]}"
        d = r.json()
        assert "subject" in d and isinstance(d["subject"], str) and d["subject"]
        assert "body_html" in d and isinstance(d["body_html"], str) and d["body_html"]

    def test_delete_campaigns_cleanup(self, admin):
        s, _ = admin
        for cid in TestEmailCampaigns.created_ids:
            r = s.delete(f"{BASE}/api/email/campaigns/{cid}", timeout=20)
            assert r.status_code in (200, 404)
