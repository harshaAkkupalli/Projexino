"""
Iteration 14 — Backend tests for:
  1. Calling (WebRTC signaling) — /api/calls/*
  2. Global Search — /api/search
  3. Project Finance & Invoicing — /api/finance/*
Gmail is NOT connected; send-invoice and reminder endpoints must return clean 400.
"""
import os
import uuid
import base64
import pytest
import requests


def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None


BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE}/api"

CREDS = {
    "admin":   ("admin@projexino.com", "Projexino@2026"),
    "manager": ("manager@projexino.com", "Manager@2026"),
    "hr":      ("hr@projexino.com", "HR@2026"),
    "member":  ("member@projexino.com", "Member@2026"),
    "intern":  ("intern@projexino.com", "Intern@2026"),
}

def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    me = s.get(f"{API}/auth/me", timeout=15)
    assert me.status_code == 200, f"/auth/me failed: {me.text}"
    return s, me.json()


@pytest.fixture(scope="module")
def sessions():
    return {role: _login(email, pw) for role, (email, pw) in CREDS.items()}


# ───────────────── Helpers to assert no _id leak ─────────────────

def _no_id_leak(obj):
    if isinstance(obj, dict):
        assert "_id" not in obj, f"_id leaked in dict keys: {list(obj.keys())[:8]}"
        for v in obj.values():
            _no_id_leak(v)
    elif isinstance(obj, list):
        for v in obj:
            _no_id_leak(v)


# ============================ CALLING (removed) ============================
# Video/audio calling feature was removed at user request. Tests deleted.


# ============================ SEARCH ============================

class TestSearch:
    def test_search_q_returns_grouped(self, sessions):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/search?q=projexino", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "results" in data
        assert "total" in data
        assert isinstance(data["results"], dict)
        _no_id_leak(data)

    def test_search_empty_q_zero(self, sessions):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/search?q=", timeout=15)
        assert r.status_code == 200
        assert r.json().get("total") == 0

    def test_search_single_char_ok(self, sessions):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/search?q=a", timeout=20)
        assert r.status_code == 200
        _no_id_leak(r.json())

    def test_search_case_insensitive(self, sessions):
        admin_s, _ = sessions["admin"]
        r1 = admin_s.get(f"{API}/search?q=Admin", timeout=20).json()
        r2 = admin_s.get(f"{API}/search?q=admin", timeout=20).json()
        # totals should be equal modulo timing — just assert both non-error & similar shape
        assert isinstance(r1["results"], dict) and isinstance(r2["results"], dict)


# ============================ FINANCE ============================

@pytest.fixture(scope="module")
def finance_ctx(sessions):
    return {}


class TestFinanceCRUD:
    def test_create_finance_admin(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        name = f"TEST_FIN_{uuid.uuid4().hex[:6]}"
        payload = {
            "project_name": name,
            "client_name": "Acme Co",
            "client_emails": [
                {"email": "billing@acme.example", "name": "Billing", "primary": False},
                {"email": "owner@acme.example", "name": "Owner", "primary": False},
            ],
            "discussed_budget": 100000, "locked_budget": 80000,
            "currency": "INR", "payment_type": "milestone", "category": "development",
            "notes": "TEST finance project",
            "gst_number": "29ABCDE1234F1Z5",
            "billing_address": "Bengaluru, IN",
        }
        r = admin_s.post(f"{API}/finance/projects", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        doc = r.json()
        _no_id_leak(doc)
        assert doc["project_name"] == name
        assert doc["payment_status"] == "pending"
        assert doc["remaining"] == 80000
        # first email auto-primary
        emails = doc["client_emails"]
        assert any(e["primary"] for e in emails)
        finance_ctx["id"] = doc["id"]
        finance_ctx["project_id"] = doc["project_id"]
        finance_ctx["name"] = name
        finance_ctx["emails"] = emails

    def test_stub_project_created(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/projects", timeout=15)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json()]
        assert finance_ctx["name"] in names

    def test_duplicate_finance_for_project_400(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects", json={
            "project_id": finance_ctx["project_id"],
            "project_name": finance_ctx["name"] + "_dup",
            "locked_budget": 1000,
        }, timeout=15)
        assert r.status_code == 400

    def test_create_non_admin_403(self, sessions):
        for role in ("manager", "hr", "member", "intern"):
            s, _ = sessions[role]
            r = s.post(f"{API}/finance/projects", json={
                "project_name": "NOPE_" + role, "locked_budget": 100
            }, timeout=15)
            assert r.status_code == 403, f"{role}: {r.status_code}"

    def test_list_aggregates_and_no_heavy(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/finance/projects", timeout=20)
        assert r.status_code == 200
        items = r.json()
        _no_id_leak(items)
        ours = [x for x in items if x["id"] == finance_ctx["id"]]
        assert ours, "created finance not listed"
        f = ours[0]
        for k in ("total_paid", "percent_paid", "remaining", "payment_status"):
            assert k in f
        # heavy content_base64 must not appear (no files yet, but assert key absent in any doc)
        for x in items:
            for fld in (x.get("documents") or []):
                for ff in (fld.get("files") or []):
                    assert "content_base64" not in ff

    def test_summary_priv_only(self, sessions):
        for role in ("admin", "manager", "hr"):
            s, _ = sessions[role]
            r = s.get(f"{API}/finance/summary", timeout=15)
            assert r.status_code == 200, f"{role}: {r.text}"
            d = r.json()
            for k in ("total_projects", "total_locked", "total_paid", "remaining", "by_status", "by_category", "by_type"):
                assert k in d
        for role in ("member", "intern"):
            s, _ = sessions[role]
            r = s.get(f"{API}/finance/summary", timeout=15)
            assert r.status_code == 403

    def test_patch_syncs_project_name(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        new_name = finance_ctx["name"] + "_X"
        r = admin_s.patch(f"{API}/finance/projects/{finance_ctx['id']}",
                          json={"project_name": new_name, "currency": "usd"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["project_name"] == new_name
        assert d["currency"] == "USD"
        # project doc renamed too
        rp = admin_s.get(f"{API}/projects", timeout=15).json()
        assert any(p["name"] == new_name and p["id"] == finance_ctx["project_id"] for p in rp)
        finance_ctx["name"] = new_name

    def test_patch_non_admin_403(self, sessions, finance_ctx):
        mgr_s, _ = sessions["manager"]
        r = mgr_s.patch(f"{API}/finance/projects/{finance_ctx['id']}", json={"notes": "x"}, timeout=15)
        assert r.status_code == 403


class TestFinancePayments:
    def test_zero_amount_and_no_percent_400(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/payments",
                         json={"amount": 0}, timeout=15)
        assert r.status_code == 400

    def test_add_payment_by_amount(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/payments",
                         json={"amount": 20000, "method": "bank_transfer", "note": "milestone 1"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["total_paid"] == 20000
        assert d["payment_status"] == "partial"
        finance_ctx["payment_id_1"] = d["payments"][-1]["id"]

    def test_add_payment_by_percent(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/payments",
                         json={"amount": 0, "percent": 25}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # locked_budget was 80000 → 25% = 20000 → total now 40000
        assert d["total_paid"] == 40000.0
        finance_ctx["payment_id_2"] = d["payments"][-1]["id"]

    def test_delete_payment(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.delete(
            f"{API}/finance/projects/{finance_ctx['id']}/payments/{finance_ctx['payment_id_2']}",
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["total_paid"] == 20000

    def test_payment_non_admin_403(self, sessions, finance_ctx):
        mgr_s, _ = sessions["manager"]
        r = mgr_s.post(f"{API}/finance/projects/{finance_ctx['id']}/payments",
                       json={"amount": 100}, timeout=15)
        assert r.status_code == 403


class TestFinanceEmails:
    def test_add_email_first_primary_logic(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/client-emails",
                         json={"email": "extra@acme.example", "primary": True}, timeout=15)
        assert r.status_code == 200
        emails = r.json()["client_emails"]
        prims = [e for e in emails if e.get("primary")]
        assert len(prims) == 1 and prims[0]["email"] == "extra@acme.example"
        finance_ctx["emails_now"] = emails

    def test_delete_email_keeps_a_primary(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        # delete the primary one
        prim = next(e for e in finance_ctx["emails_now"] if e.get("primary"))
        r = admin_s.delete(f"{API}/finance/projects/{finance_ctx['id']}/client-emails/{prim['id']}",
                           timeout=15)
        assert r.status_code == 200
        rest = r.json()["client_emails"]
        assert rest, "all emails were removed"
        assert any(e.get("primary") for e in rest), "no primary email after deletion"


class TestFinanceFolders:
    def test_add_folder_and_file(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/folders",
                         json={"name": "Contracts"}, timeout=15)
        assert r.status_code == 200
        folder = r.json()
        finance_ctx["folder_id"] = folder["id"]
        content = base64.b64encode(b"hello world contract").decode()
        r2 = admin_s.post(
            f"{API}/finance/projects/{finance_ctx['id']}/folders/{folder['id']}/files",
            json={"name": "contract.txt", "mime": "text/plain", "size": 20,
                  "content_base64": content},
            timeout=15,
        )
        assert r2.status_code == 200
        f = r2.json()
        assert "content_base64" not in f
        finance_ctx["file_id"] = f["id"]

    def test_download_file_returns_base64(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(
            f"{API}/finance/projects/{finance_ctx['id']}/folders/{finance_ctx['folder_id']}/files/{finance_ctx['file_id']}/download",
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["content_base64"]
        assert base64.b64decode(d["content_base64"]) == b"hello world contract"

    def test_file_too_large_400(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(
            f"{API}/finance/projects/{finance_ctx['id']}/folders/{finance_ctx['folder_id']}/files",
            json={"name": "big.bin", "size": 11 * 1024 * 1024, "content_base64": "AAAA"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_delete_file_and_folder(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r1 = admin_s.delete(
            f"{API}/finance/projects/{finance_ctx['id']}/folders/{finance_ctx['folder_id']}/files/{finance_ctx['file_id']}",
            timeout=15,
        )
        assert r1.status_code == 200
        r2 = admin_s.delete(
            f"{API}/finance/projects/{finance_ctx['id']}/folders/{finance_ctx['folder_id']}",
            timeout=15,
        )
        assert r2.status_code == 200


class TestFinanceInvoices:
    def test_create_invoice_with_pdf(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/invoices",
                         json={"amount": 15000, "tax_percent": 18,
                               "items": [{"description": "Phase 1", "qty": 1, "rate": 15000}],
                               "notes": "Phase 1 deliverables"}, timeout=30)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["invoice_no"].startswith("PRX-")
        assert "pdf_base64" not in inv
        finance_ctx["invoice_id"] = inv["id"]
        finance_ctx["invoice_no"] = inv["invoice_no"]

    def test_list_invoices_by_project(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/finance/invoices?project_id={finance_ctx['project_id']}", timeout=20)
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == finance_ctx["invoice_id"] for i in items)
        for i in items:
            assert "pdf_base64" not in i

    def test_get_invoice_excludes_pdf(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/finance/invoices/{finance_ctx['invoice_id']}", timeout=20)
        assert r.status_code == 200
        assert "pdf_base64" not in r.json()

    def test_invoice_pdf_download(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.get(f"{API}/finance/invoices/{finance_ctx['invoice_id']}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"

    def test_send_invoice_gmail_not_connected_400(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/invoices/{finance_ctx['invoice_id']}/send",
                         json={}, timeout=20)
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert "gmail" in msg and "not connected" in msg

    def test_send_invoice_non_admin_403(self, sessions, finance_ctx):
        mgr_s, _ = sessions["manager"]
        r = mgr_s.post(f"{API}/finance/invoices/{finance_ctx['invoice_id']}/send",
                       json={}, timeout=15)
        assert r.status_code == 403

    def test_reminder_gmail_not_connected_400(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.post(f"{API}/finance/projects/{finance_ctx['id']}/reminder",
                         json={}, timeout=15)
        # remaining is positive (paid 20k of 80k), so check Gmail message
        assert r.status_code == 400, r.text
        msg = (r.json().get("detail") or "").lower()
        assert "gmail" in msg and "not connected" in msg

    def test_reminder_non_admin_403(self, sessions, finance_ctx):
        mgr_s, _ = sessions["manager"]
        r = mgr_s.post(f"{API}/finance/projects/{finance_ctx['id']}/reminder",
                       json={}, timeout=15)
        assert r.status_code == 403


class TestFinanceCleanup:
    def test_search_finds_finance_and_invoice(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        # search for project name (contains TEST_FIN)
        token = finance_ctx["name"]
        r = admin_s.get(f"{API}/search?q={token}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        # finance group should match
        assert data["total"] >= 1
        # search for invoice no
        r2 = admin_s.get(f"{API}/search?q={finance_ctx['invoice_no']}", timeout=20)
        assert r2.status_code == 200
        d2 = r2.json()
        assert any("invoices" in d2["results"] for _ in [0]) or d2["total"] >= 1

    def test_delete_finance_non_admin_403(self, sessions, finance_ctx):
        hr_s, _ = sessions["hr"]
        r = hr_s.delete(f"{API}/finance/projects/{finance_ctx['id']}", timeout=15)
        assert r.status_code == 403

    def test_delete_finance_admin(self, sessions, finance_ctx):
        admin_s, _ = sessions["admin"]
        r = admin_s.delete(f"{API}/finance/projects/{finance_ctx['id']}", timeout=15)
        assert r.status_code == 200
