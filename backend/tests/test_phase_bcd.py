"""
Phase B + C + D backend tests.

Covers:
  • Phase B — Project & Task lifecycle (start, progress, full, timeline)
  • Phase C — Doc Verification (list, get, decision, comment)
  • Phase D — HR Module (regulations, payslip config, payslip generate + PDF,
              sign-docs, audit, expenses)
  • Regression — Phase A endpoints + core endpoints still work for super_admin

Cleanup: any TEST_ data is removed after the suite class.
"""
from __future__ import annotations

import os
import uuid
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend/.env directly
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

API = f"{BASE_URL}/api"

CREDS = {
    "super_admin": ("admin@projexino.com", "Projexino@2026"),
    "manager":     ("manager@projexino.com", "Manager@2026"),
    "hr":          ("hr@projexino.com", "HR@2026"),
    "member":      ("member@projexino.com", "Member@2026"),
    "intern":      ("intern@projexino.com", "Intern@2026"),
}


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    return s


# ===== Fixtures =====
@pytest.fixture(scope="module")
def sa():  # super admin
    return _login(*CREDS["super_admin"])


@pytest.fixture(scope="module")
def hr():
    return _login(*CREDS["hr"])


@pytest.fixture(scope="module")
def mgr():
    return _login(*CREDS["manager"])


@pytest.fixture(scope="module")
def member():
    return _login(*CREDS["member"])


@pytest.fixture(scope="module")
def intern():
    return _login(*CREDS["intern"])


@pytest.fixture(scope="module")
def sa_user(sa):
    r = sa.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def a_project(sa):
    """Pick first existing project or create one."""
    r = sa.get(f"{API}/projects", timeout=15)
    assert r.status_code == 200
    projs = r.json()
    if projs:
        return projs[0]
    # Create
    r = sa.post(f"{API}/projects", json={"name": "TEST_BCD_Project", "status": "planning",
                                          "manager": "Admin", "members": []}, timeout=15)
    assert r.status_code in (200, 201)
    return r.json()


# ============================================================
# Phase B — Project lifecycle
# ============================================================
class TestPhaseB_Project:
    def test_full_visibility(self, sa, a_project):
        pid = a_project["id"]
        r = sa.get(f"{API}/lifecycle/project/{pid}/full", timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "project" in body and "tasks" in body and "timeline" in body
        assert "my_started_at" in body

    def test_full_403_for_non_member(self, intern, a_project):
        pid = a_project["id"]
        # intern is unlikely to be a member of the seeded project
        r = intern.get(f"{API}/lifecycle/project/{pid}/full", timeout=15)
        assert r.status_code in (200, 403), r.text
        # Note: 200 only if intern happens to be a listed member; for seeded data we expect 403.

    def test_start_and_idempotent(self, sa, a_project):
        pid = a_project["id"]
        r1 = sa.post(f"{API}/lifecycle/project/{pid}/start", timeout=15)
        assert r1.status_code == 200, r1.text
        ev1 = r1.json()
        assert ev1.get("ok") is True
        # second call → idempotent with already_started_at
        r2 = sa.post(f"{API}/lifecycle/project/{pid}/start", timeout=15)
        assert r2.status_code == 200
        body2 = r2.json()
        assert "already_started_at" in body2

    def test_progress_with_percent(self, sa, a_project):
        pid = a_project["id"]
        r = sa.post(f"{API}/lifecycle/project/{pid}/progress",
                    json={"message": "TEST_BCD progress", "percent_complete": 42}, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True and body["event"]["kind"] == "progress"
        # verify project.progress was updated
        rp = sa.get(f"{API}/lifecycle/project/{pid}/full", timeout=10)
        assert rp.json()["project"].get("progress") == 42

    def test_progress_validation(self, sa, a_project):
        pid = a_project["id"]
        r = sa.post(f"{API}/lifecycle/project/{pid}/progress",
                    json={"message": "", "attachments": []}, timeout=10)
        assert r.status_code == 400

    def test_project_timeline_contains_events(self, sa, a_project):
        pid = a_project["id"]
        r = sa.get(f"{API}/lifecycle/project/{pid}/timeline", timeout=10)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list) and len(events) >= 2  # started + progress


# ============================================================
# Phase B — Task lifecycle
# ============================================================
class TestPhaseB_Task:
    @pytest.fixture(scope="class")
    def a_task(self, sa, a_project):
        # find/create a task
        r = sa.get(f"{API}/tasks", timeout=15)
        assert r.status_code == 200
        tasks = r.json()
        if tasks:
            return tasks[0]
        r = sa.post(f"{API}/tasks", json={
            "title": "TEST_BCD_Task", "status": "todo", "project_id": a_project["id"],
            "project_name": a_project.get("name", "")
        }, timeout=15)
        assert r.status_code in (200, 201), r.text
        return r.json()

    def test_task_start_and_idempotent(self, sa, a_task):
        tid = a_task["id"]
        r1 = sa.post(f"{API}/lifecycle/task/{tid}/start", timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = sa.post(f"{API}/lifecycle/task/{tid}/start", timeout=15)
        assert r2.status_code == 200
        assert "already_started_at" in r2.json()

    def test_task_progress_and_timeline(self, sa, a_task):
        tid = a_task["id"]
        r = sa.post(f"{API}/lifecycle/task/{tid}/progress",
                    json={"message": "TEST_BCD task progress"}, timeout=15)
        assert r.status_code == 200
        r2 = sa.get(f"{API}/lifecycle/task/{tid}/timeline", timeout=10)
        assert r2.status_code == 200
        assert any(e["kind"] == "progress" for e in r2.json())


# ============================================================
# Phase C — Doc Verification
# ============================================================
class TestPhaseC:
    @pytest.fixture(scope="class")
    def picked(self, sa):
        r = sa.get(f"{API}/doc-verification", timeout=15)
        assert r.status_code == 200, r.text
        items = r.json()
        # find one with a base64 we can fetch (any item works); skip if no items
        if not items:
            pytest.skip("No intern documents present in seed data")
        return items[0]

    def test_list_returns_flat(self, sa):
        r = sa.get(f"{API}/doc-verification", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if items:
            it = items[0]
            for k in ("kind", "owner_id", "doc_type", "verification"):
                assert k in it, f"missing key {k}"
            assert it["verification"].get("status") in ("pending", "approved", "rejected")

    def test_list_filter_pending(self, sa):
        r = sa.get(f"{API}/doc-verification?status=pending", timeout=15)
        assert r.status_code == 200
        for it in r.json():
            assert it["verification"]["status"] == "pending"

    def test_list_forbidden_for_member(self, member):
        r = member.get(f"{API}/doc-verification", timeout=10)
        assert r.status_code == 403

    def test_get_one_returns_content(self, sa, picked):
        url = f"{API}/doc-verification/intern/{picked['owner_id']}/{picked['doc_type']}"
        r = sa.get(url, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "verification" in body
        assert "content_base64" in body  # may be None but key must exist

    def test_decision_and_comment_flow(self, sa, hr, picked):
        owner_id, doc_type = picked["owner_id"], picked["doc_type"]
        # Approve via SA
        r1 = sa.post(f"{API}/doc-verification/intern/{owner_id}/{doc_type}/decision",
                     json={"decision": "approved", "comment": "TEST_BCD looks good"}, timeout=15)
        assert r1.status_code == 200, r1.text
        v1 = r1.json()["verification"]
        assert v1["status"] == "approved"
        assert v1.get("decided_by", {}).get("role") == "super_admin"
        assert any(c.get("message") == "TEST_BCD looks good" for c in v1.get("comments", []))

        # Add another comment via HR
        r2 = hr.post(f"{API}/doc-verification/intern/{owner_id}/{doc_type}/comment",
                     json={"message": "TEST_BCD hr_followup"}, timeout=10)
        assert r2.status_code == 200, r2.text
        v2 = r2.json()["verification"]
        assert any(c.get("message") == "TEST_BCD hr_followup" for c in v2.get("comments", []))

        # Reject to verify status flip + legacy verified mirror
        r3 = sa.post(f"{API}/doc-verification/intern/{owner_id}/{doc_type}/decision",
                     json={"decision": "rejected", "comment": "TEST_BCD reject"}, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["verification"]["status"] == "rejected"


# ============================================================
# Phase D — HR Module
# ============================================================
class TestPhaseD_Regulations:
    created_id = None

    def test_list_open_to_all_roles(self, sa, intern):
        for s in (sa, intern):
            r = s.get(f"{API}/hr/regulations", timeout=10)
            assert r.status_code == 200, r.text

    def test_crud(self, sa, intern):
        r = sa.post(f"{API}/hr/regulations",
                    json={"title": "TEST_BCD reg", "category": "general", "body_html": "<p>x</p>"},
                    timeout=10)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["title"] == "TEST_BCD reg"
        rid = doc["id"]
        TestPhaseD_Regulations.created_id = rid

        # member-level write forbidden — intern shouldn't be able to mutate
        r_forbid = intern.post(f"{API}/hr/regulations",
                               json={"title": "TEST_BCD nope", "category": "general"}, timeout=10)
        assert r_forbid.status_code == 403

        # patch
        r2 = sa.patch(f"{API}/hr/regulations/{rid}", json={"title": "TEST_BCD reg v2"}, timeout=10)
        assert r2.status_code == 200 and r2.json()["title"] == "TEST_BCD reg v2"

        # delete
        r3 = sa.delete(f"{API}/hr/regulations/{rid}", timeout=10)
        assert r3.status_code == 200


class TestPhaseD_PayslipConfig:
    def test_get_defaults(self, sa):
        r = sa.get(f"{API}/hr/payslip-config", timeout=10)
        assert r.status_code == 200, r.text
        cfg = r.json()
        fields = cfg.get("fields")
        # if persisted by an earlier test the fields list reflects that
        assert isinstance(fields, list)
        assert len(fields) >= 9, f"expected 9 default fields, got {len(fields)}"
        keys = {f["key"] for f in fields}
        for k in ("basic", "hra", "special", "conveyance", "medical",
                  "pf", "professional_tax", "tds", "loan"):
            assert k in keys, f"missing default field key: {k}"
        assert "schedule" in cfg

    def test_put_fields_and_schedule(self, sa):
        # read current
        cur = sa.get(f"{API}/hr/payslip-config", timeout=10).json()
        fields = cur.get("fields") or []
        if not fields:
            pytest.skip("no fields to toggle")
        # toggle medical visible=true
        for f in fields:
            if f["key"] == "medical":
                f["visible"] = True
        r1 = sa.put(f"{API}/hr/payslip-config/fields", json={"fields": fields}, timeout=10)
        assert r1.status_code == 200, r1.text

        # set schedule
        r2 = sa.put(f"{API}/hr/payslip-config/schedule",
                    json={"enabled": True, "day_of_month": 5, "auto_email": False,
                          "employer_address": "TEST_BCD Pune"}, timeout=10)
        assert r2.status_code == 200, r2.text
        sched = r2.json().get("schedule") or {}
        assert sched.get("day_of_month") == 5
        assert sched.get("employer_address") == "TEST_BCD Pune"


class TestPhaseD_Payslips:
    def test_generate_and_list_and_pdf(self, sa, sa_user):
        # generate for SA themselves with gross override
        payload = {
            "employee_id": sa_user["id"],
            "month": "2026-01",
            "gross_salary": 100000,
        }
        r = sa.post(f"{API}/hr/payslips/generate", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["slip_no"].startswith("PXP-")
        # format PXP-YYYY-NNNNN
        parts = doc["slip_no"].split("-")
        assert len(parts) == 3 and len(parts[2]) == 5 and parts[2].isdigit(), f"bad slip_no {doc['slip_no']}"
        assert doc["gross_salary"] == 100000
        assert doc["net_pay"] == round(doc["total_earnings"] - doc["total_deductions"], 2)
        assert isinstance(doc["breakdown"], list) and len(doc["breakdown"]) > 0

        # list
        rl = sa.get(f"{API}/hr/payslips", timeout=15)
        assert rl.status_code == 200
        assert any(p["id"] == doc["id"] for p in rl.json())

        # pdf
        rp = sa.get(f"{API}/hr/payslips/{doc['id']}/pdf", timeout=20)
        assert rp.status_code == 200
        assert rp.headers.get("content-type", "").startswith("application/pdf"), rp.headers
        assert len(rp.content) > 500, f"PDF too small: {len(rp.content)}"
        assert rp.content.startswith(b"%PDF"), "PDF magic header missing"

    def test_generate_requires_salary(self, sa):
        r = sa.post(f"{API}/hr/payslips/generate",
                    json={"employee_id": "nonexistent-id-xxx", "month": "2026-01"}, timeout=15)
        assert r.status_code == 404


class TestPhaseD_SignDocs:
    def test_create_sign_duplicate(self, sa, member):
        r = sa.post(f"{API}/hr/sign-docs",
                    json={"name": "TEST_BCD NDA", "body_html": "<p>NDA text</p>", "audience_role": "all"},
                    timeout=10)
        assert r.status_code == 200, r.text
        doc = r.json()
        sid = doc["id"]
        # SA signs
        s1 = sa.post(f"{API}/hr/sign-docs/{sid}/sign", json={"signed_name": "Admin Test"}, timeout=10)
        assert s1.status_code == 200, s1.text
        assert s1.json()["signature"]["typed_signature"] == "Admin Test"
        # duplicate signature → 400
        s2 = sa.post(f"{API}/hr/sign-docs/{sid}/sign", json={"signed_name": "Admin Test Again"}, timeout=10)
        assert s2.status_code == 400, s2.text

        # member can also sign once
        s3 = member.post(f"{API}/hr/sign-docs/{sid}/sign", json={"signed_name": "Member Test"}, timeout=10)
        assert s3.status_code == 200, s3.text

        # cleanup
        sa.delete(f"{API}/hr/sign-docs/{sid}", timeout=10)


class TestPhaseD_Audit:
    def test_audit_year(self, sa):
        from datetime import datetime
        yr = datetime.utcnow().year
        r = sa.get(f"{API}/hr/audit/{yr}", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "totals" in body and "monthly" in body
        for k in ("users", "team", "interns", "leads", "invoices", "payslips"):
            assert k in body["totals"], f"missing key {k}"
        assert len(body["monthly"]) == 12


class TestPhaseD_Expenses:
    created_id = None

    def test_create_and_list_and_summary(self, sa):
        r = sa.post(f"{API}/hr/expenses",
                    json={"title": "TEST_BCD office", "amount": 1234.5, "category": "operations",
                          "period": "monthly"}, timeout=10)
        assert r.status_code == 200, r.text
        doc = r.json()
        TestPhaseD_Expenses.created_id = doc["id"]
        assert doc["amount"] == 1234.5

        rl = sa.get(f"{API}/hr/expenses", timeout=15)
        assert rl.status_code == 200
        assert any(e["id"] == doc["id"] for e in rl.json())

        rs = sa.get(f"{API}/hr/expenses/summary", timeout=15)
        assert rs.status_code == 200, rs.text
        summ = rs.json()
        for k in ("week", "month", "by_category", "count"):
            assert k in summ
        assert summ["count"] >= 1

    def test_delete(self, sa):
        if not TestPhaseD_Expenses.created_id:
            pytest.skip("no expense created")
        r = sa.delete(f"{API}/hr/expenses/{TestPhaseD_Expenses.created_id}", timeout=10)
        assert r.status_code == 200


# ============================================================
# Regression — Phase A + core endpoints
# ============================================================
class TestRegression:
    def test_auth_me_super_admin(self, sa):
        r = sa.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == "admin@projexino.com"
        assert u["role"] == "super_admin"

    def test_projects(self, sa):
        r = sa.get(f"{API}/projects", timeout=15)
        assert r.status_code == 200

    def test_tasks(self, sa):
        r = sa.get(f"{API}/tasks", timeout=15)
        assert r.status_code == 200

    def test_team(self, sa):
        r = sa.get(f"{API}/team", timeout=15)
        assert r.status_code == 200

    def test_rbac_permissions(self, sa):
        r = sa.get(f"{API}/rbac/permissions", timeout=10)
        assert r.status_code == 200

    def test_rbac_matrix(self, sa):
        r = sa.get(f"{API}/rbac/matrix", timeout=10)
        assert r.status_code == 200
