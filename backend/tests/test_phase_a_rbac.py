"""
Phase A — RBAC backend tests
Covers:
 - auth: admin@projexino.com is now super_admin
 - /api/rbac/permissions, /api/rbac/matrix (GET/PUT/reset)
 - /api/rbac/admins CRUD + promote-primary
 - /api/rbac/me GET/PATCH
 - Regression: /api/admin/users/reset-password, /api/notification-settings PATCH
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

SUPER = ("admin@projexino.com", "Projexino@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")
HR = ("hr@projexino.com", "HR@2026")
MEMBER = ("member@projexino.com", "Member@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    token = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s, r.json()


@pytest.fixture(scope="module")
def super_session():
    s, u = _login(*SUPER)
    return s, u


@pytest.fixture(scope="module")
def manager_session():
    s, u = _login(*MANAGER)
    return s, u


# ---------- Auth role ----------
class TestAuthRole:
    def test_super_admin_login_role(self):
        _, u = _login(*SUPER)
        assert u["role"] == "super_admin", f"Expected super_admin, got {u['role']}"
        assert u["email"] == SUPER[0]


# ---------- Permissions / Matrix ----------
class TestPermissionsMatrix:
    def test_permissions_super_admin(self, super_session):
        s, _ = super_session
        r = s.get(f"{API}/rbac/permissions")
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "super_admin"
        assert data["is_super_admin"] is True
        assert data["is_primary_super_admin"] is True
        perms = data["permissions"]
        # 25 modules expected
        assert len(perms) == 25
        # all actions True for some module
        for m, acts in perms.items():
            for a in ["view", "create", "edit", "delete"]:
                assert acts[a] is True, f"super_admin missing perm on {m}.{a}"

    def test_matrix_get(self, super_session):
        s, _ = super_session
        r = s.get(f"{API}/rbac/matrix")
        assert r.status_code == 200
        data = r.json()
        assert data["roles"] == ["super_admin", "admin", "manager", "hr", "team_member", "intern"]
        assert isinstance(data["modules"], list) and len(data["modules"]) == 25
        assert data["actions"] == ["view", "create", "edit", "delete"]
        assert isinstance(data["matrix"], dict)
        for role in data["roles"]:
            assert role in data["matrix"]
            for module in data["modules"]:
                assert module in data["matrix"][role]
                for action in data["actions"]:
                    assert isinstance(data["matrix"][role][module][action], bool)

    def test_matrix_get_forbidden_non_super(self, manager_session):
        s, _ = manager_session
        r = s.get(f"{API}/rbac/matrix")
        assert r.status_code == 403

    def test_matrix_put_and_persist(self, super_session):
        s, _ = super_session
        # GET current
        cur = s.get(f"{API}/rbac/matrix").json()
        matrix = cur["matrix"]
        # Flip manager.projects.delete from False -> True
        original = matrix["manager"]["projects"]["delete"]
        new_val = not original
        matrix["manager"]["projects"]["delete"] = new_val

        r = s.put(f"{API}/rbac/matrix", json={"matrix": matrix})
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # GET again to verify
        cur2 = s.get(f"{API}/rbac/matrix").json()
        assert cur2["matrix"]["manager"]["projects"]["delete"] == new_val

        # Manager re-login and check permissions reflect new value
        ms, _ = _login(*MANAGER)
        rp = ms.get(f"{API}/rbac/permissions").json()
        assert rp["permissions"]["projects"]["delete"] == new_val

    def test_matrix_reset(self, super_session):
        s, _ = super_session
        r = s.post(f"{API}/rbac/matrix/reset")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        # Verify manager.projects.delete back to default False
        cur = s.get(f"{API}/rbac/matrix").json()
        assert cur["matrix"]["manager"]["projects"]["delete"] is False


# ---------- Admin CRUD ----------
class TestAdminsCRUD:
    @pytest.fixture(scope="class")
    def created_admin(self, super_session):
        s, _ = super_session
        email = f"TEST_admin_{uuid.uuid4().hex[:8]}@projexino.com"
        payload = {
            "email": email,
            "name": "Test Admin",
            "password": "TestPass@2026",
            "role": "admin",
            "designation": "QA Admin",
        }
        r = s.post(f"{API}/rbac/admins", json=payload)
        assert r.status_code == 200, r.text
        admin = r.json()
        assert admin["email"] == email.lower()
        assert admin["role"] == "admin"
        assert "password_hash" not in admin
        yield admin
        # cleanup
        s.delete(f"{API}/rbac/admins/{admin['id']}")

    def test_list_admins(self, super_session, created_admin):
        s, _ = super_session
        r = s.get(f"{API}/rbac/admins")
        assert r.status_code == 200
        rows = r.json()
        ids = [x["id"] for x in rows]
        assert created_admin["id"] in ids
        # primary super_admin must be in list
        primaries = [x for x in rows if x.get("is_primary_super_admin")]
        assert len(primaries) >= 1

    def test_duplicate_email_400(self, super_session, created_admin):
        s, _ = super_session
        payload = {
            "email": created_admin["email"],
            "name": "Dup",
            "password": "TestPass@2026",
            "role": "admin",
        }
        r = s.post(f"{API}/rbac/admins", json=payload)
        assert r.status_code == 400

    def test_patch_admin_name_role(self, super_session, created_admin):
        s, _ = super_session
        r = s.patch(
            f"{API}/rbac/admins/{created_admin['id']}",
            json={"name": "Renamed Admin", "designation": "Senior QA"},
        )
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["name"] == "Renamed Admin"
        assert out["designation"] == "Senior QA"
        assert "password_hash" not in out

    def test_set_primary_super_admin_demotes_existing(self, super_session, created_admin):
        s, _ = super_session
        # First find the current primary (admin@projexino.com)
        admins = s.get(f"{API}/rbac/admins").json()
        prev_primary = next((a for a in admins if a.get("is_primary_super_admin")), None)
        assert prev_primary is not None

        # Promote our test admin to super_admin + primary via PATCH
        r = s.patch(
            f"{API}/rbac/admins/{created_admin['id']}",
            json={"role": "super_admin", "is_primary": True},
        )
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "super_admin"
        assert r.json()["is_primary_super_admin"] is True

        # Confirm previous primary demoted
        admins2 = s.get(f"{API}/rbac/admins").json()
        prev = next((a for a in admins2 if a["id"] == prev_primary["id"]), None)
        assert prev is not None
        assert prev.get("is_primary_super_admin") is False

        # Restore primary back to original admin via promote-primary endpoint
        r2 = s.post(f"{API}/rbac/admins/{prev_primary['id']}/promote-primary")
        assert r2.status_code == 200
        admins3 = s.get(f"{API}/rbac/admins").json()
        cur_primary = next((a for a in admins3 if a.get("is_primary_super_admin")), None)
        assert cur_primary is not None and cur_primary["id"] == prev_primary["id"]

    def test_cannot_delete_primary_super_admin(self, super_session):
        s, _ = super_session
        admins = s.get(f"{API}/rbac/admins").json()
        primary = next(a for a in admins if a.get("is_primary_super_admin"))
        r = s.delete(f"{API}/rbac/admins/{primary['id']}")
        assert r.status_code == 400

    def test_delete_admin(self, super_session, created_admin):
        s, _ = super_session
        r = s.delete(f"{API}/rbac/admins/{created_admin['id']}")
        assert r.status_code == 200
        # verify gone
        admins = s.get(f"{API}/rbac/admins").json()
        ids = [a["id"] for a in admins]
        assert created_admin["id"] not in ids


# ---------- /rbac/me ----------
class TestMeProfile:
    def test_get_me(self, super_session):
        s, u = super_session
        r = s.get(f"{API}/rbac/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == SUPER[0]
        assert "password_hash" not in data

    def test_patch_me(self, super_session):
        s, _ = super_session
        payload = {
            "name": "Super Admin",
            "phone": "+91-9000000000",
            "designation": "Founder",
            "location": "Bengaluru",
            "bio": "Phase A test bio",
        }
        r = s.patch(f"{API}/rbac/me", json=payload)
        assert r.status_code == 200, r.text
        out = r.json()
        assert "password_hash" not in out
        assert out["phone"] == "+91-9000000000"
        assert out["designation"] == "Founder"
        assert out["location"] == "Bengaluru"
        assert out["bio"] == "Phase A test bio"
        # verify persistence
        r2 = s.get(f"{API}/rbac/me").json()
        assert r2["phone"] == "+91-9000000000"


# ---------- Regression: admin-gated endpoints now accept super_admin ----------
class TestRegressionSuperAdminAccepted:
    def test_reset_password_super_admin(self, super_session):
        s, _ = super_session
        # find any non-primary user to reset
        admins = s.get(f"{API}/rbac/admins").json()
        target = next((a for a in admins if not a.get("is_primary_super_admin")), None)
        if not target:
            pytest.skip("no non-primary admin available")
        r = s.post(
            f"{API}/admin/users/reset-password",
            json={"user_id": target["id"], "new_password": "TempPass@2026"},
        )
        # accept either 200 or some other success; the key thing is NOT 403
        assert r.status_code != 403, f"super_admin denied: {r.text}"

    def test_notification_settings_patch_super_admin(self, super_session):
        s, _ = super_session
        # GET first to know payload shape (if endpoint exists)
        r0 = s.get(f"{API}/notification-settings")
        if r0.status_code == 404:
            pytest.skip("notification-settings endpoint not exposed")
        r = s.patch(f"{API}/notification-settings", json={})
        # not 403 = super_admin accepted
        assert r.status_code != 403, f"super_admin denied for notif settings: {r.text}"
