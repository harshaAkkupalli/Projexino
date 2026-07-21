"""
Iteration 35 — HR Onboarding Engine backend tests.
Covers: POST/GET/PATCH/DELETE /api/hr/onboarding, PDF download, regenerate,
templates, prorated maths, dept task templates, RBAC, duplicate guard.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def intern_session():
    return _login(*INTERN)


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids
    # cleanup
    try:
        s = _login(*ADMIN)
        for rid in ids:
            s.delete(f"{API}/hr/onboarding/{rid}", timeout=15)
    except Exception:
        pass


# ── Prorated maths sanity ─────────────────────────────────────────────
def test_prorated_engineering_jun20(admin_session, created_ids):
    ts = int(time.time())
    payload = {
        "name": "TEST_QA_Eng_Jun20",
        "email": f"test_eng_jun20_{ts}@projexino.com",
        "designation": "Senior Engineer",
        "department": "engineering",
        "start_date": "2026-06-20",
        "base_salary": 120000,
        "currency": "INR",
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    created_ids.append(d["id"])
    assert d["status"] == "kickoff"
    p = d["prorated_first_pay"]
    assert p["days_worked"] == 11
    assert p["days_in_month"] == 30
    assert p["amount"] == 44000
    assert len(d["task_ids"]) == 6, "engineering template should be 6 tasks"
    assert d["offer_letter_size"] > 1000
    assert d["offer_letter_url"].endswith("/offer-letter.pdf")


def test_prorated_sales_feb15_nonleap(admin_session, created_ids):
    ts = int(time.time())
    payload = {
        "name": "TEST_QA_Sales_Feb15",
        "email": f"test_sales_feb15_{ts}@projexino.com",
        "designation": "AE",
        "department": "sales",
        "start_date": "2026-02-15",
        "base_salary": 90000,
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    created_ids.append(d["id"])
    p = d["prorated_first_pay"]
    assert p["days_in_month"] == 28, "2026 is non-leap"
    assert p["days_worked"] == 14
    assert p["amount"] == 45000
    assert len(d["task_ids"]) == 5, "sales template should be 5 tasks"


# ── Department template fallback ──────────────────────────────────────
def test_unknown_dept_falls_back_to_default(admin_session, created_ids):
    ts = int(time.time())
    payload = {
        "name": "TEST_QA_Unknown",
        "email": f"test_unknown_{ts}@projexino.com",
        "department": "invalid_dept",
        "start_date": "2026-04-10",
        "base_salary": 60000,
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    created_ids.append(d["id"])
    assert len(d["task_ids"]) == 4, "default template should be 4 tasks"


# ── Verify tasks actually created in db.tasks via /api/tasks ─────────
def test_tasks_persisted_for_onboarding(admin_session, created_ids):
    # Use an engineering record
    eng_id = created_ids[0]
    r = admin_session.get(f"{API}/hr/onboarding/{eng_id}", timeout=15)
    assert r.status_code == 200
    rec = r.json()
    assert "tasks" in rec, "GET /{id} should inline tasks"
    assert len(rec["tasks"]) == 6
    for t in rec["tasks"]:
        assert {"id", "title", "status", "priority", "due_date"}.issubset(t.keys())


# ── Duplicate guard ──────────────────────────────────────────────────
def test_duplicate_email_returns_400(admin_session, created_ids):
    eng_email = None
    # find an existing active record's email
    r = admin_session.get(f"{API}/hr/onboarding", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        if row["id"] in created_ids and row["status"] != "cancelled":
            eng_email = row["email"]
            break
    assert eng_email
    payload = {
        "name": "TEST_QA_Dup",
        "email": eng_email,
        "department": "engineering",
        "start_date": "2026-08-01",
        "base_salary": 50000,
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=15)
    assert r.status_code == 400, r.text
    assert "already exists" in r.text or "status" in r.text


# ── RBAC ──────────────────────────────────────────────────────────────
def test_rbac_intern_get_forbidden(intern_session):
    r = intern_session.get(f"{API}/hr/onboarding", timeout=15)
    assert r.status_code == 403, r.text


def test_rbac_intern_post_forbidden(intern_session):
    ts = int(time.time())
    r = intern_session.post(f"{API}/hr/onboarding", json={
        "name": "TEST_QA_Intern_Forbidden",
        "email": f"intern_forbidden_{ts}@projexino.com",
        "department": "engineering",
        "start_date": "2026-07-01",
        "base_salary": 40000,
    }, timeout=15)
    assert r.status_code == 403, r.text


# ── List & filter ─────────────────────────────────────────────────────
def test_list_and_filter(admin_session):
    r = admin_session.get(f"{API}/hr/onboarding", timeout=15)
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list)
    assert all("offer_letter_url" in row for row in rows)

    r2 = admin_session.get(f"{API}/hr/onboarding?status=kickoff", timeout=15)
    assert r2.status_code == 200
    for row in r2.json():
        assert row["status"] == "kickoff"


# ── GET single + 404 ──────────────────────────────────────────────────
def test_get_single_and_404(admin_session, created_ids):
    rid = created_ids[0]
    r = admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert r.status_code == 200
    assert r.json()["id"] == rid

    r404 = admin_session.get(f"{API}/hr/onboarding/does-not-exist-xyz", timeout=15)
    assert r404.status_code == 404


# ── PATCH ─────────────────────────────────────────────────────────────
def test_patch_status_valid(admin_session, created_ids):
    rid = created_ids[1]  # sales record
    r = admin_session.patch(f"{API}/hr/onboarding/{rid}", json={"status": "docs_pending"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "docs_pending"


def test_patch_invalid_status(admin_session, created_ids):
    rid = created_ids[1]
    r = admin_session.patch(f"{API}/hr/onboarding/{rid}", json={"status": "wat"}, timeout=15)
    assert r.status_code == 400, r.text


def test_patch_empty_body(admin_session, created_ids):
    rid = created_ids[1]
    r = admin_session.patch(f"{API}/hr/onboarding/{rid}", json={}, timeout=15)
    assert r.status_code == 400, r.text


# ── PDF download ─────────────────────────────────────────────────────
def test_pdf_download(admin_session, created_ids):
    rid = created_ids[0]
    r = admin_session.get(f"{API}/hr/onboarding/{rid}/offer-letter.pdf", timeout=20)
    assert r.status_code == 200, r.text[:200]
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 1000
    cd = r.headers.get("content-disposition", "")
    assert "TEST_QA_Eng_Jun20" in cd or "Projexino_Offer_" in cd


def test_pdf_download_404(admin_session):
    r = admin_session.get(f"{API}/hr/onboarding/nope-xyz/offer-letter.pdf", timeout=15)
    assert r.status_code == 404


# ── Regenerate ───────────────────────────────────────────────────────
def test_regenerate_offer_letter_twice(admin_session, created_ids):
    rid = created_ids[0]
    r1 = admin_session.post(f"{API}/hr/onboarding/{rid}/regenerate-offer-letter", timeout=30)
    assert r1.status_code == 200, r1.text
    d1 = r1.json()
    assert d1["ok"] is True
    assert d1["size"] > 1000
    t1 = d1["generated_at"]
    time.sleep(1.1)
    r2 = admin_session.post(f"{API}/hr/onboarding/{rid}/regenerate-offer-letter", timeout=30)
    assert r2.status_code == 200
    assert r2.json()["generated_at"] != t1


# ── Templates listing ────────────────────────────────────────────────
def test_templates_endpoint(admin_session):
    r = admin_session.get(f"{API}/hr/onboarding/templates", timeout=15)
    assert r.status_code == 200, f"templates endpoint failed (route ordering bug?): {r.status_code} {r.text[:200]}"
    d = r.json()
    for k in ["engineering", "sales", "design", "marketing", "hr", "operations", "default"]:
        assert k in d, f"missing template key: {k}"
        assert isinstance(d[k], list) and len(d[k]) > 0


# ── DELETE RBAC + cascade ────────────────────────────────────────────
def test_delete_as_intern_forbidden(intern_session, created_ids):
    rid = created_ids[-1]
    r = intern_session.delete(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert r.status_code == 403


def test_delete_cascade_removes_tasks(admin_session, created_ids):
    rid = created_ids[-1]  # last (unknown_dept default)
    # get task_ids first
    r = admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert r.status_code == 200
    task_ids = r.json().get("task_ids", [])
    assert len(task_ids) == 4

    rdel = admin_session.delete(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert rdel.status_code == 200, rdel.text
    assert rdel.json()["ok"] is True
    created_ids.remove(rid)

    # confirm record gone
    rget = admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert rget.status_code == 404
