"""Iteration 26 — Live RBAC permission matrix tests.

Covers:
  - GET /api/rbac/permissions for super_admin & intern
  - PUT /api/rbac/matrix flips a flag and is reflected immediately in /permissions
  - POST /api/rbac/matrix/reset restores defaults (intern.chat.view -> True)
  - GET /api/rbac/matrix exposes all new module slugs
  - Regression: non-super-admin gets 403 on /matrix
"""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}

NEW_MODULES = ["hr", "email", "calendly", "org-chart", "doc-verification",
               "ai-settings", "website-config"]
EXPECTED_INTERN_MODS = {"dashboard", "tasks", "documents", "chat", "ai", "badges", "profile"}


def _login(session, creds):
    r = session.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        session.headers["Authorization"] = f"Bearer {token}"
    return data


@pytest.fixture
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, ADMIN)
    return s


@pytest.fixture
def intern_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, INTERN)
    return s


# ===== GET /api/rbac/permissions =====
class TestPermissionsEndpoint:
    def test_super_admin_permissions(self, admin_client):
        r = admin_client.get(f"{API}/rbac/permissions")
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "super_admin"
        assert body["is_super_admin"] is True
        # every module should be fully True
        perms = body["permissions"]
        for m in NEW_MODULES + ["dashboard", "finance", "access-control"]:
            assert m in perms, f"module {m} missing from super_admin perms"
            assert perms[m]["view"] is True

    def test_intern_permissions_narrow(self, intern_client):
        r = intern_client.get(f"{API}/rbac/permissions")
        assert r.status_code == 200
        body = r.json()
        assert body["role"] == "intern"
        assert body["is_super_admin"] is False
        perms = body["permissions"]
        # Each expected intern module: view=True
        for m in EXPECTED_INTERN_MODS:
            assert perms.get(m, {}).get("view") is True, f"intern should have view on {m}"
        # Restricted modules: view=False
        for m in ["finance", "access-control", "website-config", "leads", "team"]:
            assert perms.get(m, {}).get("view") is False, f"intern should NOT view {m}"


# ===== GET /api/rbac/matrix (super_admin only) =====
class TestMatrixEndpoint:
    def test_matrix_includes_new_modules(self, admin_client):
        r = admin_client.get(f"{API}/rbac/matrix")
        assert r.status_code == 200
        body = r.json()
        modules = body.get("modules", [])
        for m in NEW_MODULES:
            assert m in modules, f"{m} missing from /rbac/matrix modules list"
        matrix = body["matrix"]
        # All roles must have all modules present
        for role in ["super_admin", "admin", "manager", "hr", "team_member", "intern"]:
            for m in NEW_MODULES:
                assert m in matrix[role], f"{role}.{m} missing in matrix"
                for a in ["view", "create", "edit", "delete"]:
                    assert a in matrix[role][m]

    def test_matrix_forbidden_for_intern(self, intern_client):
        r = intern_client.get(f"{API}/rbac/matrix")
        assert r.status_code == 403


# ===== PUT /api/rbac/matrix + reflection in /permissions =====
class TestMatrixUpdate:
    def test_flip_intern_chat_view_and_reflect(self, admin_client, intern_client):
        # 1. Fetch current matrix
        r = admin_client.get(f"{API}/rbac/matrix")
        assert r.status_code == 200
        matrix = copy.deepcopy(r.json()["matrix"])
        # Ensure baseline: intern.chat.view should be True
        assert matrix["intern"]["chat"]["view"] is True

        # 2. Flip it to False
        matrix["intern"]["chat"]["view"] = False
        put = admin_client.put(f"{API}/rbac/matrix", json={"matrix": matrix})
        assert put.status_code == 200, put.text
        assert put.json()["matrix"]["intern"]["chat"]["view"] is False

        # 3. Intern's /permissions should now show chat.view=False
        # Re-login intern to make sure (cache-busting from server side is automatic)
        ir = intern_client.get(f"{API}/rbac/permissions")
        assert ir.status_code == 200
        assert ir.json()["permissions"]["chat"]["view"] is False

        # 4. Reset matrix
        reset = admin_client.post(f"{API}/rbac/matrix/reset")
        assert reset.status_code == 200

        # 5. Confirm intern.chat.view back to True
        ir2 = intern_client.get(f"{API}/rbac/permissions")
        assert ir2.status_code == 200
        assert ir2.json()["permissions"]["chat"]["view"] is True

    def test_grant_intern_finance_then_reset(self, admin_client, intern_client):
        # Baseline check: intern.finance.view should be False
        ip = intern_client.get(f"{API}/rbac/permissions").json()
        assert ip["permissions"]["finance"]["view"] is False

        # Grant intern view on finance via matrix update
        r = admin_client.get(f"{API}/rbac/matrix").json()
        matrix = copy.deepcopy(r["matrix"])
        matrix["intern"]["finance"]["view"] = True
        put = admin_client.put(f"{API}/rbac/matrix", json={"matrix": matrix})
        assert put.status_code == 200

        # Verify intern now has finance.view
        ip2 = intern_client.get(f"{API}/rbac/permissions").json()
        assert ip2["permissions"]["finance"]["view"] is True

        # Reset
        admin_client.post(f"{API}/rbac/matrix/reset")
        ip3 = intern_client.get(f"{API}/rbac/permissions").json()
        assert ip3["permissions"]["finance"]["view"] is False
