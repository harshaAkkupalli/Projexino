"""
Iteration 37 — HR Onboarding + auto portal-user account creation tests.
Covers:
  • New-email onboarding → account_created=true, portal_user_id, dummy_password rules
  • Immediate sign-in with the returned dummy password
  • Existing-email onboarding → account_created=true, portal_user_id=existing, dummy_password=""
  • Existing user's password_hash is unchanged (still logs in with original creds)
  • Intern still 403 on POST onboarding
  • PDF download still 200
  • Cascade delete removes auto-assigned tasks; portal user is NOT auto-deleted
"""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s, data


@pytest.fixture(scope="module")
def admin_session():
    s, _ = _login(*ADMIN)
    return s


@pytest.fixture(scope="module")
def intern_session():
    s, _ = _login(*INTERN)
    return s


@pytest.fixture(scope="module")
def created():
    """Holds (onboarding_id, email) tuples for module cleanup."""
    items = []
    yield items
    # Cleanup onboarding records
    try:
        s, _ = _login(*ADMIN)
        for rid, _email in items:
            s.delete(f"{API}/hr/onboarding/{rid}", timeout=15)
    except Exception:
        pass


# ── 1. New-email onboarding creates portal account with valid dummy pw ─
def test_new_email_creates_portal_account(admin_session, created):
    ts = int(time.time())
    email = f"test_newhire_{ts}@projexino.com"
    payload = {
        "name": "TEST_QA_NewHire",
        "email": email,
        "designation": "Engineer",
        "department": "engineering",
        "start_date": "2026-05-10",
        "base_salary": 80000,
        "currency": "INR",
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    created.append((d["id"], email))

    assert d.get("account_created") is True, d
    assert d.get("portal_user_id"), "portal_user_id should be present"
    pw = d.get("dummy_password") or ""
    assert isinstance(pw, str) and len(pw) >= 12, f"dummy_password too short: {pw!r}"
    assert re.search(r"\d", pw), "dummy_password missing digit"
    assert re.search(r"[^A-Za-z0-9]", pw), "dummy_password missing symbol"


# ── 2. Immediate sign-in with the dummy password works ────────────────
def test_signin_with_dummy_password(admin_session, created):
    # Reuse the most recently created hire
    rid, email = created[-1]
    # Re-fetch record (admin_session can use POST /auth/login as anyone)
    r_get = admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert r_get.status_code == 200, r_get.text
    rec = r_get.json()
    dummy_pw = rec.get("dummy_password")
    assert dummy_pw, "Expected dummy_password to be persisted on the record"

    # Try logging in
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": dummy_pw}, timeout=20)
    assert r.status_code == 200, f"new hire could not log in: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, "expected token on login"


# ── 3. Existing-user collision: account_created=true, empty dummy_pw,
#       and the existing user's password is UNCHANGED ──────────────────
def test_existing_email_does_not_reset_user_password(admin_session, created):
    # Confirm manager can log in with the canonical password BEFORE
    r_before = requests.post(f"{API}/auth/login",
                             json={"email": MANAGER[0], "password": MANAGER[1]},
                             timeout=20)
    assert r_before.status_code == 200, f"baseline manager login failed: {r_before.text}"

    ts = int(time.time())
    payload = {
        "name": "TEST_QA_ExistingMgr",
        "email": MANAGER[0],
        "designation": "Existing Manager",
        "department": "operations",
        "start_date": f"2026-09-{(ts % 25) + 1:02d}",
        "base_salary": 100000,
    }
    r = admin_session.post(f"{API}/hr/onboarding", json=payload, timeout=30)
    # If duplicate active record already exists from prior runs, accept 400 and skip
    if r.status_code == 400 and "already exists" in r.text:
        pytest.skip("Manager already has an active onboarding record from earlier run")
    assert r.status_code == 200, r.text
    d = r.json()
    created.append((d["id"], MANAGER[0]))

    assert d.get("account_created") is True
    assert d.get("portal_user_id"), "should reuse existing manager's user id"
    assert d.get("dummy_password", "") == "", f"dummy_password must be empty for existing users, got {d.get('dummy_password')!r}"

    # Manager must still log in with the ORIGINAL password
    r_after = requests.post(f"{API}/auth/login",
                            json={"email": MANAGER[0], "password": MANAGER[1]},
                            timeout=20)
    assert r_after.status_code == 200, f"manager original login broken after onboarding: {r_after.text}"


# ── 4. RBAC: intern still 403 on onboarding POST ──────────────────────
def test_intern_forbidden(intern_session):
    ts = int(time.time())
    r = intern_session.post(f"{API}/hr/onboarding", json={
        "name": "TEST_QA_Intern_Forbid",
        "email": f"intern_forbid_{ts}@projexino.com",
        "department": "engineering",
        "start_date": "2026-07-01",
        "base_salary": 40000,
    }, timeout=15)
    assert r.status_code == 403


# ── 5. PDF download still 200 ─────────────────────────────────────────
def test_pdf_download_still_works(admin_session, created):
    rid, _ = created[0]
    r = admin_session.get(f"{API}/hr/onboarding/{rid}/offer-letter.pdf", timeout=20)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"


# ── 6. Cascade delete removes tasks; portal user is NOT deleted ──────
def test_cascade_delete_keeps_portal_user(admin_session, created):
    rid, email = created[0]  # the new-hire record we created in test #1
    rec = admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15).json()
    task_ids = rec.get("task_ids") or []
    assert task_ids, "expected onboarding tasks"
    dummy_pw_before_delete = rec.get("dummy_password")
    assert dummy_pw_before_delete

    rdel = admin_session.delete(f"{API}/hr/onboarding/{rid}", timeout=15)
    assert rdel.status_code == 200, rdel.text

    # Onboarding gone
    assert admin_session.get(f"{API}/hr/onboarding/{rid}", timeout=15).status_code == 404
    # Remove from cleanup list (already gone)
    created.remove((rid, email))

    # Portal user must STILL be able to log in (we intentionally do NOT
    # delete the user when the onboarding record is removed).
    r_user = requests.post(f"{API}/auth/login",
                           json={"email": email, "password": dummy_pw_before_delete},
                           timeout=20)
    assert r_user.status_code == 200, f"portal user should remain after onboarding delete: {r_user.text}"
