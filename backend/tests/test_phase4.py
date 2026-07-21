"""Phase 4 tests — HR role, intern-with-login, change password, profile,
heartbeat hours, manager dashboard, document verification, redesigned PDFs."""
import os
import time
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


# =========================
# AUTH / SEED
# =========================
class TestSeededAccounts:
    def test_admin_login(self):
        t = _login("admin@projexino.com", "Projexino@2026")
        assert t

    def test_manager_login(self):
        t = _login("manager@projexino.com", "Manager@2026")
        assert t

    def test_hr_login_returns_hr_role(self):
        r = requests.post(f"{API}/auth/login", json={"email": "hr@projexino.com", "password": "HR@2026"}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "hr"

    def test_member_login(self):
        assert _login("member@projexino.com", "Member@2026")

    def test_intern_login(self):
        assert _login("intern@projexino.com", "Intern@2026")


# =========================
# CREATE INTERN WITH LOGIN
# =========================
@pytest.fixture(scope="module")
def admin_token():
    return _login("admin@projexino.com", "Projexino@2026")


@pytest.fixture(scope="module")
def new_intern_creds(admin_token):
    """Create a new intern with login + return creds. Module-scoped so subsequent tests reuse."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_intern_{suffix}@projexino.com"
    payload = {
        "name": f"TEST_Intern_{suffix}",
        "email": email,
        "designation": "Engineering Intern",
        "department": "Engineering",
        "reporting_manager": "Manager",
        "reporting_manager_email": "manager@projexino.com",
        "start_date": "2026-01-01",
        "end_date": "2026-06-30",
        "bio": "Test intern for phase 4",
    }
    r = requests.post(f"{API}/interns/with-login", json=payload, headers=_h(admin_token), timeout=30)
    assert r.status_code == 200, f"create with-login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "intern" in data and "credentials" in data
    creds = data["credentials"]
    assert creds["email"] == email
    assert creds["password"].startswith("Welcome-")
    return {"creds": creds, "intern": data["intern"]}


class TestCreateInternWithLogin:
    def test_creates_intern_and_returns_welcome_password(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        assert creds["password"].startswith("Welcome-")
        assert len(creds["password"]) >= 10

    def test_intern_doc_linked_user(self, new_intern_creds):
        intern = new_intern_creds["intern"]
        assert intern.get("linked_user_id")
        assert intern["email"] == new_intern_creds["creds"]["email"]

    def test_login_with_returned_credentials(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        assert t

    def test_profile_shows_must_change_password(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        r = requests.get(f"{API}/me/profile", headers=_h(t), timeout=30)
        assert r.status_code == 200
        p = r.json()
        assert p.get("must_change_password") is True
        assert p.get("role") == "intern"

    def test_duplicate_intern_email_rejected(self, admin_token, new_intern_creds):
        email = new_intern_creds["creds"]["email"]
        payload = {
            "name": "dup", "email": email, "designation": "x",
            "start_date": "2026-01-01", "end_date": "2026-06-30",
        }
        r = requests.post(f"{API}/interns/with-login", json=payload, headers=_h(admin_token), timeout=30)
        assert r.status_code == 400


# =========================
# CHANGE PASSWORD
# =========================
class TestChangePassword:
    def test_first_change_without_current_password(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        new_pw = "NewPass@123"
        r = requests.post(f"{API}/me/change-password", json={"new_password": new_pw}, headers=_h(t), timeout=30)
        assert r.status_code == 200, f"first change failed: {r.status_code} {r.text}"
        # Save back for next tests
        new_intern_creds["creds"]["password"] = new_pw

        # Verify flag cleared
        t2 = _login(creds["email"], new_pw)
        prof = requests.get(f"{API}/me/profile", headers=_h(t2), timeout=30).json()
        assert prof["must_change_password"] is False

    def test_second_change_requires_current_password_wrong(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        r = requests.post(f"{API}/me/change-password",
                         json={"current_password": "WRONGpass", "new_password": "another@123"},
                         headers=_h(t), timeout=30)
        assert r.status_code == 400

    def test_second_change_with_correct_current_succeeds(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        new_pw = "ChangedAgain@123"
        r = requests.post(f"{API}/me/change-password",
                         json={"current_password": creds["password"], "new_password": new_pw},
                         headers=_h(t), timeout=30)
        assert r.status_code == 200
        creds["password"] = new_pw


# =========================
# PROFILE UPDATE
# =========================
class TestProfileUpdate:
    def test_patch_profile_updates_intern_record(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        new_name = "TEST_UpdatedName"
        new_bio = "Updated bio text 42"
        r = requests.patch(f"{API}/me/profile", json={"name": new_name, "bio": new_bio},
                           headers=_h(t), timeout=30)
        assert r.status_code == 200
        # Verify intern record mirrored
        r2 = requests.get(f"{API}/me/intern", headers=_h(t), timeout=30)
        assert r2.status_code == 200
        intern = r2.json()
        assert intern["name"] == new_name
        assert intern["bio"] == new_bio


# =========================
# HEARTBEAT
# =========================
class TestHeartbeat:
    def test_heartbeat_creates_and_increments(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        # First heartbeat
        r1 = requests.post(f"{API}/me/heartbeat", json={"pathname": "/intern/dashboard"},
                           headers=_h(t), timeout=30)
        assert r1.status_code == 200
        # Second heartbeat — should increment
        r2 = requests.post(f"{API}/me/heartbeat", json={"pathname": "/intern/dashboard"},
                           headers=_h(t), timeout=30)
        assert r2.status_code == 200
        # GET hours
        h = requests.get(f"{API}/me/hours", headers=_h(t), timeout=30)
        assert h.status_code == 200
        items = h.json()
        assert isinstance(items, list)
        assert len(items) >= 1
        today = items[0]
        assert today["minutes"] >= 2


# =========================
# MANAGER DASHBOARD
# =========================
class TestManagerDashboard:
    def test_manager_interns_admin(self, admin_token):
        r = requests.get(f"{API}/manager/interns", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "summary" in data and "interns" in data
        summ = data["summary"]
        for k in ("total_interns", "active_today", "at_risk", "badges_total", "tasks_overdue_total"):
            assert k in summ
        # Each intern row has expected shape
        if data["interns"]:
            row = data["interns"][0]
            for k in ("intern", "hours_last_7d", "today_minutes", "doc_pct", "at_risk", "at_risk_reasons"):
                assert k in row

    def test_manager_interns_forbidden_for_intern(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        r = requests.get(f"{API}/manager/interns", headers=_h(t), timeout=30)
        assert r.status_code == 403

    def test_activity_feed(self, admin_token):
        r = requests.get(f"{API}/manager/activity-feed", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        feed = r.json()
        assert isinstance(feed, list)
        # If non-empty, must be sorted desc by "at"
        if len(feed) > 1:
            ats = [f.get("at") or "" for f in feed]
            assert ats == sorted(ats, reverse=True)

    def test_activity_feed_hr_access(self):
        t = _login("hr@projexino.com", "HR@2026")
        r = requests.get(f"{API}/manager/activity-feed", headers=_h(t), timeout=30)
        assert r.status_code == 200


# =========================
# DOC VERIFICATION
# =========================
class TestDocVerification:
    def test_submit_and_verify_doc(self, admin_token, new_intern_creds):
        # First, intern submits a doc
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        # Use base64 of "test pdf"
        payload = {
            "doc_type": "pan_card",
            "file_name": "TEST_pan.pdf",
            "content_base64": "dGVzdCBwZGY=",
            "mime_type": "application/pdf",
        }
        r = requests.post(f"{API}/me/intern/documents", json=payload, headers=_h(t), timeout=30)
        assert r.status_code in (200, 201)

        # Admin marks verified
        intern_id = new_intern_creds["intern"]["id"]
        vr = requests.post(f"{API}/manager/verify-document",
                           json={"intern_id": intern_id, "doc_type": "pan_card",
                                 "verified": True, "note": "Approved"},
                           headers=_h(admin_token), timeout=30)
        assert vr.status_code == 200, vr.text

        # Intern should now have notification
        nr = requests.get(f"{API}/notifications", headers=_h(t), timeout=30)
        # Tolerate either notifications endpoint shape or absence
        if nr.status_code == 200:
            data = nr.json()
            items = data if isinstance(data, list) else data.get("items", [])
            # Not strict — just sanity check shape
            assert isinstance(items, list)


# =========================
# PDFs
# =========================
class TestPDFs:
    def test_intern_certificate_pdf(self, admin_token, new_intern_creds):
        intern_id = new_intern_creds["intern"]["id"]
        r = requests.get(f"{API}/interns/{intern_id}/certificate", headers=_h(admin_token), timeout=60)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 2000, f"PDF too small: {len(r.content)} bytes"

    def test_progress_pdf_redesigned(self, new_intern_creds):
        creds = new_intern_creds["creds"]
        t = _login(creds["email"], creds["password"])
        r = requests.get(f"{API}/me/intern/progress/pdf", headers=_h(t), timeout=60)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 2000


# =========================
# REGRESSION
# =========================
class TestRegression:
    def test_old_endpoints(self, admin_token):
        for ep in ["/projects", "/tasks", "/interns", "/me/intern"]:
            # Skip /me/intern for admin (not an intern)
            if ep == "/me/intern":
                continue
            r = requests.get(f"{API}{ep}", headers=_h(admin_token), timeout=30)
            assert r.status_code == 200, f"{ep} failed: {r.status_code}"

    def test_intern_self_service(self):
        t = _login("intern@projexino.com", "Intern@2026")
        for ep in ["/me/intern", "/me/intern/tasks", "/me/intern/documents", "/me/intern/progress"]:
            r = requests.get(f"{API}{ep}", headers=_h(t), timeout=30)
            assert r.status_code == 200, f"{ep} failed: {r.status_code}"
