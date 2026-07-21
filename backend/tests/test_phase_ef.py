"""
Phase E (Password reset / profile / welcome emails) + Phase F (Notif Permissions)
+ Iter-19 Quick Wins: html.escape in lifecycle/doc-verification, safe-parse submitted_at,
unique index on hr_payslips.slip_no, per-employee idempotency in payslip scheduler.

Live preview backend at REACT_APP_BACKEND_URL. Cleanup performed at the end so subsequent
tests can keep using the seeded credentials.
"""
import os
import sys
import uuid
import base64
import asyncio
import datetime as dt
from datetime import timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Standard creds
SUPER = {"email": "admin@projexino.com", "password": "Projexino@2026"}
MANAGER = {"email": "manager@projexino.com", "password": "Manager@2026"}
HR_USER = {"email": "hr@projexino.com", "password": "HR@2026"}
MEMBER = {"email": "member@projexino.com", "password": "Member@2026"}

# Tiny 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


def _hdr(token):
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


# ===== PHASE E =====

class TestPhaseEAuth:
    def test_forgot_password_existing_user_returns_200(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": SUPER["email"]}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert "exists" in body.get("message", "").lower() or "reset" in body.get("message", "").lower()

    def test_forgot_password_unknown_email_still_200(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": f"nobody-{uuid.uuid4().hex[:8]}@example.com"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_reset_password_invalid_token_400(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": "definitely-not-real", "new_password": "Strong@Pass1"}, timeout=15)
        assert r.status_code == 400

    def test_change_password_wrong_current_400(self, member_token):
        r = requests.post(f"{API}/auth/change-password",
                          headers=_hdr(member_token),
                          json={"current_password": "WRONG_PW", "new_password": "Whatever@123"}, timeout=15)
        assert r.status_code == 400

    def test_change_password_correct_then_restore(self, member_token):
        tmp_pw = "TempPw@2026!"
        # 1) change to temp
        r = requests.post(f"{API}/auth/change-password",
                          headers=_hdr(member_token),
                          json={"current_password": MEMBER["password"], "new_password": tmp_pw}, timeout=15)
        assert r.status_code == 200
        # 2) Verify login with new pw works
        new_token = _login(MEMBER["email"], tmp_pw)
        # 3) Restore original (CRITICAL per request)
        r2 = requests.post(f"{API}/auth/change-password",
                           headers=_hdr(new_token),
                           json={"current_password": tmp_pw, "new_password": MEMBER["password"]}, timeout=15)
        assert r2.status_code == 200
        # 4) Confirm restore
        _login(MEMBER["email"], MEMBER["password"])

    def test_forgot_then_reset_full_flow(self):
        """Use the forgot-password token from DB (via super-admin lookup) to actually reset
        a transient newly-created user, then clean up."""
        # We create a throwaway admin to test the full forgot/reset round-trip without
        # disturbing the seeded accounts.
        super_tok = _login(SUPER["email"], SUPER["password"])
        email = f"test_pe_{uuid.uuid4().hex[:8]}@projexino.com"
        create = requests.post(f"{API}/rbac/admins", headers=_hdr(super_tok),
                               json={"email": email, "name": "PE Reset User",
                                     "password": "Initial@Pass1", "role": "team_member",
                                     "designation": "QA"}, timeout=15)
        assert create.status_code == 200, create.text
        user_id = create.json()["id"]

        # Trigger forgot-password
        r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
        assert r.status_code == 200

        # Read token directly from DB via mongo
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        rec = mc[dbn].password_reset_tokens.find_one({"user_id": user_id})
        assert rec is not None
        assert rec.get("used") is False
        token = rec["token"]

        new_pw = "Brand@New123"
        r2 = requests.post(f"{API}/auth/reset-password",
                           json={"token": token, "new_password": new_pw}, timeout=15)
        assert r2.status_code == 200
        # second use must 400
        r3 = requests.post(f"{API}/auth/reset-password",
                           json={"token": token, "new_password": "AnotherPw@1"}, timeout=15)
        assert r3.status_code == 400
        # login with the new pw works
        _login(email, new_pw)
        # cleanup: delete user + token row
        requests.delete(f"{API}/rbac/admins/{user_id}", headers=_hdr(super_tok), timeout=15)
        mc[dbn].password_reset_tokens.delete_many({"user_id": user_id})

    def test_expired_token_returns_400(self):
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        # Pull super admin user id
        u = mc[dbn].users.find_one({"email": SUPER["email"]})
        assert u is not None
        # Insert a directly-expired token
        token_str = f"expired-{uuid.uuid4().hex}"
        mc[dbn].password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": u["id"],
            "email": SUPER["email"],
            "token": token_str,
            "created_at": (dt.datetime.now(timezone.utc) - dt.timedelta(hours=10)).isoformat(),
            "expires_at": (dt.datetime.now(timezone.utc) - dt.timedelta(hours=1)).isoformat(),
            "used": False,
        })
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": token_str, "new_password": "X@123abcd"}, timeout=15)
        assert r.status_code == 400
        # Cleanup
        mc[dbn].password_reset_tokens.delete_many({"token": token_str})


class TestPhaseEProfile:
    def test_full_profile_super_admin_has_no_intern(self, super_token):
        r = requests.get(f"{API}/me/full-profile", headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "user" in body and "intern" in body
        assert body["user"]["email"] == SUPER["email"]
        assert body["intern"] is None

    def test_avatar_update_small_png(self, member_token):
        r = requests.post(f"{API}/me/profile/avatar", headers=_hdr(member_token),
                          json={"content_base64": TINY_PNG_B64, "mime_type": "image/png"}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True


class TestPhaseERbacAdminRoles:
    """Phase E: /api/rbac/admins now accepts manager/hr/team_member roles, and fires welcome email."""

    @pytest.mark.parametrize("role", ["manager", "hr", "team_member", "admin"])
    def test_create_user_each_role(self, super_token, role):
        email = f"test_role_{role}_{uuid.uuid4().hex[:6]}@projexino.com"
        r = requests.post(f"{API}/rbac/admins", headers=_hdr(super_token),
                          json={"email": email, "name": f"Test {role}",
                                "password": "Welcome@2026", "role": role,
                                "designation": role.title()}, timeout=20)
        assert r.status_code == 200, f"{role} creation failed: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body["role"] == role
        assert body["email"] == email
        # cleanup
        requests.delete(f"{API}/rbac/admins/{body['id']}", headers=_hdr(super_token), timeout=15)


# ===== PHASE F — Notif Permissions =====

class TestPhaseFNotifPermissions:
    def test_events_list_18_known(self, super_token):
        r = requests.get(f"{API}/notif-permissions/events", headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200
        ev = r.json().get("events", [])
        assert len(ev) >= 18
        keys = {e["key"] for e in ev}
        for k in ["project_started", "task_started", "payslip_generated",
                  "document_submitted", "invoice_generated", "login", "logout"]:
            assert k in keys

    def test_events_non_super_403(self, manager_token):
        r = requests.get(f"{API}/notif-permissions/events", headers=_hdr(manager_token), timeout=15)
        assert r.status_code == 403

    def test_get_perms_returns_rules_users_events(self, super_token):
        r = requests.get(f"{API}/notif-permissions", headers=_hdr(super_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "rules" in body and "users" in body and "events" in body
        assert isinstance(body["users"], list)
        assert len(body["events"]) >= 18

    def test_get_perms_non_super_403(self, hr_token):
        r = requests.get(f"{API}/notif-permissions", headers=_hdr(hr_token), timeout=15)
        assert r.status_code == 403

    def test_put_perms_persists(self, super_token):
        new_rules = {
            "project_progress": {"roles": ["hr", "manager"], "users": [], "active": True},
            "payslip_generated": {"roles": ["hr"], "users": [], "active": False},
        }
        r = requests.put(f"{API}/notif-permissions",
                         headers=_hdr(super_token),
                         json={"rules": new_rules}, timeout=15)
        assert r.status_code == 200
        # Verify persistence via GET
        g = requests.get(f"{API}/notif-permissions", headers=_hdr(super_token), timeout=15).json()
        assert "project_progress" in g["rules"]
        assert g["rules"]["project_progress"]["roles"] == ["hr", "manager"]
        assert g["rules"]["payslip_generated"]["active"] is False

    def test_put_perms_non_super_403(self, member_token):
        r = requests.put(f"{API}/notif-permissions",
                         headers=_hdr(member_token),
                         json={"rules": {}}, timeout=15)
        assert r.status_code == 403

    def test_get_extra_recipients_includes_super_admin(self):
        """Direct integration test on the helper."""
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from notif_permissions import get_extra_recipients

        async def run():
            mc = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            dbn = os.environ.get("DB_NAME", "test_database")
            db = mc[dbn]
            # Seed rule for project_progress to include hr role
            await db.notification_permissions.update_one(
                {"id": "active"},
                {"$set": {"id": "active", "rules": {
                    "project_progress": {"roles": ["hr"], "users": [], "active": True}
                }}},
                upsert=True,
            )
            recips = await get_extra_recipients(db, "project_progress")
            emails = {r["email"] for r in recips}
            return emails

        emails = asyncio.get_event_loop().run_until_complete(run()) if sys.version_info < (3, 10) else asyncio.run(run())
        assert SUPER["email"] in emails, f"Super admin must always be copied. Got: {emails}"
        assert HR_USER["email"] in emails, f"HR role must be added. Got: {emails}"


# ===== ITER-19 QUICK WINS =====

class TestQuickWinHtmlEscape:
    def test_lifecycle_progress_with_script_tag(self, manager_token, super_token):
        # Create a project as super admin
        proj = requests.post(f"{API}/projects",
                             headers=_hdr(super_token),
                             json={"name": "TEST_PE_QW_proj", "owner_email": MANAGER["email"]},
                             timeout=15)
        assert proj.status_code in (200, 201), proj.text
        pid = proj.json()["id"]
        # Start project (no-op safe)
        requests.post(f"{API}/lifecycle/project/{pid}/start",
                      headers=_hdr(manager_token), json={}, timeout=15)
        # Post a progress update with <script>
        message_with_script = "<script>alert('xss')</script>Hello"
        r = requests.post(f"{API}/lifecycle/project/{pid}/progress",
                          headers=_hdr(manager_token),
                          json={"message": message_with_script, "percent_complete": 25},
                          timeout=20)
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"

        # Verify event message in DB stored verbatim
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        ev = mc[dbn].lifecycle_events.find_one(
            {"entity": "project", "entity_id": pid, "kind": "progress"},
            sort=[("at", -1)]
        )
        assert ev is not None, "lifecycle progress event not persisted"
        assert ev.get("message") == message_with_script, \
            f"message must be stored verbatim. Got: {ev.get('message')!r}"
        # cleanup
        mc[dbn].lifecycle_events.delete_many({"entity_id": pid})
        mc[dbn].projects.delete_one({"id": pid})


class TestQuickWinDocVerification:
    def test_doc_verification_list_works_even_with_malformed_submitted_at(self, super_token):
        """Insert a malformed submitted_at; GET should NOT 500."""
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        # Inject a malformed doc record on any existing intern (or skip if none)
        intern = mc[dbn].interns.find_one({})
        if not intern:
            pytest.skip("no intern in DB; skipping malformed-sort safety test")
        owner_id = intern["id"]
        # Patch documents list with a malformed submitted_at
        bad_doc = {"doc_type": "TEST_BAD", "filename": "x.pdf",
                   "submitted_at": "not-a-date", "status": "submitted"}
        mc[dbn].interns.update_one({"id": owner_id},
                                   {"$push": {"documents": bad_doc}})
        try:
            r = requests.get(f"{API}/doc-verification", headers=_hdr(super_token), timeout=20)
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        finally:
            mc[dbn].interns.update_one({"id": owner_id},
                                       {"$pull": {"documents": {"doc_type": "TEST_BAD"}}})

    def test_doc_verification_decision_with_html_comment(self, super_token):
        """Seed a submitted_docs entry on any intern, then call /decision with HTML comment."""
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        intern = mc[dbn].interns.find_one({})
        if not intern:
            pytest.skip("no interns in DB to test against")
        doc_type = "TEST_DV"
        prev_submitted_docs = intern.get("submitted_docs") or {}
        prev_doc = prev_submitted_docs.get(doc_type)
        # Seed a synthetic submitted doc into submitted_docs dict
        synth = {
            "filename": "x.pdf",
            "content_base64": "",
            "submitted_at": dt.datetime.now(timezone.utc).isoformat(),
            "verified": False,
            "verification": {"status": "pending", "comments": []},
        }
        mc[dbn].interns.update_one(
            {"id": intern["id"]},
            {"$set": {f"submitted_docs.{doc_type}": synth}},
        )
        try:
            r = requests.post(
                f"{API}/doc-verification/intern/{intern['id']}/{doc_type}/decision",
                headers=_hdr(super_token),
                json={"decision": "approved", "comment": "<b>x</b>"},
                timeout=20,
            )
            assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
            # Verify legacy verified flag is mirrored true
            fresh = mc[dbn].interns.find_one({"id": intern["id"]})
            d = (fresh.get("submitted_docs") or {}).get(doc_type)
            assert d is not None
            assert d.get("verified") is True, "legacy 'verified' flag must be mirrored"
            assert d.get("verification", {}).get("status") == "approved"
            comments = d.get("verification", {}).get("comments") or []
            assert any("<b>x</b>" in (c.get("message") or "") for c in comments), \
                "comment must be stored (verbatim — escape happens only on email body)"
        finally:
            # Cleanup
            if prev_doc is None:
                mc[dbn].interns.update_one(
                    {"id": intern["id"]},
                    {"$unset": {f"submitted_docs.{doc_type}": ""}},
                )
            else:
                mc[dbn].interns.update_one(
                    {"id": intern["id"]},
                    {"$set": {f"submitted_docs.{doc_type}": prev_doc}},
                )


class TestQuickWinPayslipsIndex:
    def test_unique_index_on_slip_no(self):
        from pymongo import MongoClient
        mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
        dbn = os.environ.get("DB_NAME", "test_database")
        idx = mc[dbn].command("listIndexes", "hr_payslips")
        # idx is a CommandCursor-like dict response
        indexes = list(idx.get("cursor", {}).get("firstBatch", [])) if isinstance(idx, dict) and "cursor" in idx else list(idx)
        # PyMongo returns a CommandCursor we can iterate
        if not indexes:
            indexes = list(mc[dbn].hr_payslips.list_indexes())
        has_unique_slipno = any(
            (i.get("name") == "slip_no_1" or any(k[0] == "slip_no" for k in i.get("key", {}).items()))
            and i.get("unique") is True
            for i in indexes
        )
        assert has_unique_slipno, f"slip_no unique index missing. Got indexes: {indexes}"


class TestQuickWinSchedulerIdempotent:
    def test_bulk_generate_per_employee_idempotent(self):
        """Call _bulk_generate twice for the same month and assert no duplicates per employee."""
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from hr_module import _bulk_generate

        month = "2099-12"  # far-future test month

        async def run():
            mc = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
            dbn = os.environ.get("DB_NAME", "test_database")
            db = mc[dbn]
            # Cleanup any prior test data
            await db.hr_payslips.delete_many({"month": month})
            await _bulk_generate(db, month=month, auto_email=False)
            count_after_first = await db.hr_payslips.count_documents({"month": month})
            await _bulk_generate(db, month=month, auto_email=False)
            count_after_second = await db.hr_payslips.count_documents({"month": month})
            # Per-employee duplicates check
            emp_ids = await db.hr_payslips.distinct("employee.id", {"month": month})
            dup_count = 0
            for eid in emp_ids:
                c = await db.hr_payslips.count_documents({"month": month, "employee.id": eid})
                if c > 1:
                    dup_count += 1
            # Cleanup
            await db.hr_payslips.delete_many({"month": month})
            return count_after_first, count_after_second, dup_count

        first, second, dups = asyncio.run(run())
        assert second == first, f"Idempotency broken: first={first}, second={second}"
        assert dups == 0, f"Found {dups} employees with duplicate payslips after second run"
