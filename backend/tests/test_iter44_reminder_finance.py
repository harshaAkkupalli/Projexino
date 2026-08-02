"""Iter 44 - Payment reminder modal + Push-to-Finance idempotency.

Verifies:
- POST /api/client-projects/{pid}/payment-reminder renders body_html with
  outstanding balance and respects days_overdue payload.
- POST /api/client-projects/{pid}/push-to-finance creates a finance record
  on first call (already_pushed=False) and returns the SAME finance_project_id
  on subsequent calls (already_pushed=True) — idempotent.
- GET /api/finance/projects exposes ONLY ONE record with this source_project_id.
- /api/client-projects/{pid} returns finance_project_id after push.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(*ADMIN)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def client_and_project(admin_headers):
    # CREATE client
    cl_payload = {
        "name": "TEST_QAClient_iter44",
        "email": "qa_iter44@example.com",
        "company": "TestCo iter44",
    }
    rc = requests.post(f"{API}/clients", json=cl_payload, headers=admin_headers, timeout=20)
    assert rc.status_code in (200, 201), f"client create failed: {rc.status_code} {rc.text[:200]}"
    cid = rc.json()["id"]

    # CREATE billing project with agreed_amount so there's pending balance.
    pr_payload = {
        "name": "TEST_BILL_iter44",
        "status": "discovery",
        "currency": "USD",
        "agreed_amount": 5000,
    }
    rp = requests.post(f"{API}/clients/{cid}/projects", json=pr_payload, headers=admin_headers, timeout=20)
    assert rp.status_code in (200, 201), f"project create failed: {rp.status_code} {rp.text[:200]}"
    pid = rp.json()["id"]

    yield cid, pid

    # Teardown
    requests.delete(f"{API}/client-projects/{pid}", headers=admin_headers, timeout=20)
    requests.delete(f"{API}/clients/{cid}", headers=admin_headers, timeout=20)


# ── Payment Reminder ──────────────────────────────────────────────
class TestPaymentReminder:
    def test_reminder_default_overdue(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.post(
            f"{API}/client-projects/{pid}/payment-reminder",
            json={}, headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert "subject" in data and "body_html" in data
        assert "pending" in data and data["pending"] > 0
        assert data["currency"] == "USD"
        # default 0 days overdue -> no "past due" string
        assert "days past due" not in data["body_html"]
        assert "5,000" in data["body_html"] or "5000" in data["body_html"]

    def test_reminder_with_overdue(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.post(
            f"{API}/client-projects/{pid}/payment-reminder",
            json={"days_overdue": 7}, headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert "7 days past due" in data["body_html"]


# ── Push to Finance idempotency ────────────────────────────────────
class TestPushFinanceIdempotent:
    def test_first_push_creates_record(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.post(
            f"{API}/client-projects/{pid}/push-to-finance",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        data = r.json()
        assert data["ok"] is True
        assert data["already_pushed"] is False
        assert data["finance_project_id"]
        # Cache for subsequent tests
        pytest.fin_id_iter44 = data["finance_project_id"]

    def test_second_push_idempotent(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.post(
            f"{API}/client-projects/{pid}/push-to-finance",
            headers=admin_headers, timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["already_pushed"] is True
        assert data["finance_project_id"] == pytest.fin_id_iter44
        assert "payments_pushed" in data

    def test_project_has_finance_id(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.get(f"{API}/client-projects/{pid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json().get("finance_project_id") == pytest.fin_id_iter44

    def test_finance_projects_only_one_record(self, admin_headers, client_and_project):
        cid, pid = client_and_project
        r = requests.get(f"{API}/finance/projects", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        matched = [x for x in rows if x.get("source_project_id") == pid or x.get("id") == pytest.fin_id_iter44]
        assert len(matched) == 1, f"Expected exactly 1 finance record, found {len(matched)}"
