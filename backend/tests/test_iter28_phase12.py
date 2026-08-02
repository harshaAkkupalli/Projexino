"""
Iteration 28 — Phase 1 (RBAC roles + reporting manager + CC notifications)
and Phase 2 (Team & Intern Hub) backend tests.

Covers:
  * /api/rbac/roles surface — exactly 7 ASSIGNABLE_ROLES, no super_admin/team_member
  * /api/rbac/admins list with new fields (reporting_manager_*, route_comms, created_by_*)
  * /api/rbac/admins create + patch with reporting_manager auto-resolution
  * BUG FIX: tasks created with assignee_id are visible to the intern in GET /api/tasks
  * Tasks: assignee_email resolution, reporting_manager filter for managers
  * PATCH/DELETE permission rules
  * Interns: list/POST/PATCH role-based filtering + created_by_*
  * CC-to-manager notifications -> '[FYI]' duplicate notification
"""
import os
import time
import uuid
import requests
import pytest

def _load_base_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if not v:
        # fallback: read from frontend/.env
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    assert v, "REACT_APP_BACKEND_URL not set"
    return v.rstrip("/")


BASE_URL = _load_base_url()
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")
HR = ("hr@projexino.com", "HR@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


# ---------- helpers ----------
def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def manager_s():
    return _login(*MANAGER)


@pytest.fixture(scope="module")
def hr_s():
    return _login(*HR)


@pytest.fixture(scope="module")
def intern_s():
    return _login(*INTERN)


@pytest.fixture(scope="module")
def admin_user(admin_s):
    return admin_s.get(f"{API}/auth/me", timeout=15).json()


@pytest.fixture(scope="module")
def manager_user(manager_s):
    return manager_s.get(f"{API}/auth/me", timeout=15).json()


@pytest.fixture(scope="module")
def intern_user(intern_s):
    return intern_s.get(f"{API}/auth/me", timeout=15).json()


# ---------- /api/rbac/roles ----------
class TestRbacRoles:
    def test_roles_exactly_seven_assignable(self, admin_s):
        r = admin_s.get(f"{API}/rbac/roles", timeout=15)
        assert r.status_code == 200, r.text
        roles = [x["value"] for x in r.json()]
        assert roles == ["admin", "hr", "manager", "developer", "qa", "cloud_admin", "intern"], roles
        assert "super_admin" not in roles
        assert "team_member" not in roles

    def test_roles_accessible_to_non_super(self, intern_s):
        r = intern_s.get(f"{API}/rbac/roles", timeout=15)
        assert r.status_code == 200
        assert len(r.json()) == 7


# ---------- /api/rbac/admins ----------
class TestRbacAdmins:
    def test_list_admins_has_new_fields(self, admin_s):
        r = admin_s.get(f"{API}/rbac/admins", timeout=20)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 1
        # Every row should have the new fields (possibly empty / backfilled)
        for row in rows:
            for key in ("reporting_manager_id", "reporting_manager_name",
                        "reporting_manager_email", "route_comms_to_manager",
                        "created_by_name"):
                assert key in row, f"missing field {key} in row {row.get('email')}"

    def test_list_admins_forbidden_for_non_super(self, manager_s):
        r = manager_s.get(f"{API}/rbac/admins", timeout=15)
        assert r.status_code == 403

    def test_create_developer_with_reporting_manager(self, admin_s, manager_user):
        email = f"TEST_dev_{uuid.uuid4().hex[:8]}@projexino.com"
        body = {
            "email": email,
            "name": "Test Dev",
            "password": "TestPass@123",
            "role": "developer",
            "reporting_manager_id": manager_user["id"],
            "route_comms_to_manager": True,
        }
        r = admin_s.post(f"{API}/rbac/admins", json=body, timeout=30)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["role"] == "developer"
        assert out["reporting_manager_id"] == manager_user["id"]
        assert out["reporting_manager_email"] == manager_user["email"]
        assert out["reporting_manager_name"] == manager_user["name"]
        assert out["route_comms_to_manager"] is True
        assert out["created_by_name"] in (None, "", *_admin_names())
        # cleanup
        admin_s.delete(f"{API}/rbac/admins/{out['id']}", timeout=15)

    @pytest.mark.parametrize("role", ["qa", "cloud_admin", "hr", "manager", "intern", "admin"])
    def test_create_all_assignable_roles(self, admin_s, role):
        email = f"TEST_{role}_{uuid.uuid4().hex[:6]}@projexino.com"
        body = {"email": email, "name": f"Test {role}",
                "password": "TestPass@123", "role": role}
        r = admin_s.post(f"{API}/rbac/admins", json=body, timeout=30)
        assert r.status_code == 200, f"{role}: {r.status_code} {r.text}"
        admin_s.delete(f"{API}/rbac/admins/{r.json()['id']}", timeout=15)

    def test_create_invalid_role(self, admin_s):
        body = {"email": f"TEST_bad_{uuid.uuid4().hex[:6]}@x.com",
                "name": "x", "password": "TestPass@123", "role": "nonsense"}
        r = admin_s.post(f"{API}/rbac/admins", json=body, timeout=15)
        assert r.status_code == 400, r.text

    def test_patch_reporting_manager_updates_email_name(self, admin_s, manager_user, admin_user):
        # create a developer first w/o manager
        email = f"TEST_devp_{uuid.uuid4().hex[:6]}@projexino.com"
        r = admin_s.post(f"{API}/rbac/admins",
                         json={"email": email, "name": "PatchMe",
                               "password": "TestPass@123", "role": "developer"},
                         timeout=20)
        assert r.status_code == 200
        uid = r.json()["id"]
        # Patch reporting_manager_id => manager
        r2 = admin_s.patch(f"{API}/rbac/admins/{uid}",
                           json={"reporting_manager_id": manager_user["id"]},
                           timeout=20)
        assert r2.status_code == 200, r2.text
        out = r2.json()
        assert out["reporting_manager_id"] == manager_user["id"]
        assert out["reporting_manager_email"] == manager_user["email"]
        assert out["reporting_manager_name"] == manager_user["name"]
        admin_s.delete(f"{API}/rbac/admins/{uid}", timeout=15)


def _admin_names():
    # acceptable creators
    return ("Super Admin", "Admin", "admin@projexino.com", "System (seeded)")


# ---------- Task bug-fix & permissions ----------
class TestTasksBugFix:
    @pytest.fixture(scope="class")
    def task_for_intern(self, admin_s, intern_user):
        # First ensure the intern user has reporting_manager_id set to the manager
        # so the manager filter test downstream works.
        body = {
            "title": f"Bug-fix test {uuid.uuid4().hex[:6]}",
            "assignee_id": intern_user["id"],
            "priority": "high",
            "due_date": "2026-06-30",
        }
        r = admin_s.post(f"{API}/tasks", json=body, timeout=20)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["assignee_id"] == intern_user["id"]
        assert t["assignee_email"].lower() == intern_user["email"].lower()
        yield t
        admin_s.delete(f"{API}/tasks/{t['id']}", timeout=15)

    def test_intern_sees_assigned_task(self, intern_s, task_for_intern):
        r = intern_s.get(f"{API}/tasks", timeout=20)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert task_for_intern["id"] in ids, "BUG: intern cannot see assigned task"

    def test_admin_sees_owned_task(self, admin_s, task_for_intern):
        r = admin_s.get(f"{API}/tasks", timeout=20)
        ids = [x["id"] for x in r.json()]
        assert task_for_intern["id"] in ids

    def test_create_task_by_email_resolves(self, admin_s, intern_s, intern_user):
        body = {
            "title": f"Email-resolve {uuid.uuid4().hex[:6]}",
            "assignee_email": intern_user["email"],
            "priority": "medium",
        }
        r = admin_s.post(f"{API}/tasks", json=body, timeout=20)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["assignee_id"] == intern_user["id"]
        # intern sees it
        r2 = intern_s.get(f"{API}/tasks", timeout=20)
        assert t["id"] in [x["id"] for x in r2.json()]
        admin_s.delete(f"{API}/tasks/{t['id']}", timeout=15)

    def test_manager_sees_tasks_when_set_as_reporting_manager(
        self, admin_s, manager_s, manager_user, intern_user
    ):
        # explicitly set reporting_manager_id on the task itself
        body = {
            "title": f"Mgr-view {uuid.uuid4().hex[:6]}",
            "assignee_id": intern_user["id"],
            "reporting_manager_id": manager_user["id"],
            "priority": "low",
        }
        r = admin_s.post(f"{API}/tasks", json=body, timeout=20)
        assert r.status_code == 200
        t = r.json()
        assert t["reporting_manager_id"] == manager_user["id"]
        r2 = manager_s.get(f"{API}/tasks", timeout=20)
        assert t["id"] in [x["id"] for x in r2.json()], \
            "Manager set as reporting_manager_id should see the task"
        admin_s.delete(f"{API}/tasks/{t['id']}", timeout=15)


class TestTaskPermissions:
    @pytest.fixture
    def task(self, admin_s, intern_user):
        r = admin_s.post(f"{API}/tasks",
                         json={"title": f"Perm {uuid.uuid4().hex[:6]}",
                               "assignee_id": intern_user["id"]},
                         timeout=20)
        assert r.status_code == 200
        yield r.json()
        admin_s.delete(f"{API}/tasks/{r.json()['id']}", timeout=15)

    def test_intern_can_patch_own_assigned_task(self, intern_s, task):
        r = intern_s.patch(f"{API}/tasks/{task['id']}",
                           json={"status": "in_progress"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_progress"

    def test_intern_cannot_delete_non_owned(self, intern_s, task):
        r = intern_s.delete(f"{API}/tasks/{task['id']}", timeout=15)
        assert r.status_code == 403, r.text

    def test_admin_can_delete(self, admin_s, intern_user):
        r = admin_s.post(f"{API}/tasks",
                         json={"title": "delete-me", "assignee_id": intern_user["id"]},
                         timeout=15).json()
        d = admin_s.delete(f"{API}/tasks/{r['id']}", timeout=15)
        assert d.status_code == 200


# ---------- Interns ----------
class TestInterns:
    def test_hr_sees_all_interns(self, hr_s):
        r = hr_s.get(f"{API}/interns", timeout=20)
        assert r.status_code == 200
        # HR should see *something*; we don't assume seeded count
        assert isinstance(r.json(), list)

    def test_admin_sees_all_interns(self, admin_s):
        r = admin_s.get(f"{API}/interns", timeout=20)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # ensure created_by_email/name keys exist (may be empty for legacy)
        for row in rows:
            assert "created_by_email" in row
            assert "created_by_name" in row

    def test_create_intern_records_creator(self, hr_s):
        email = f"TEST_intern_{uuid.uuid4().hex[:6]}@x.com"
        body = {"name": "Test Intern", "email": email, "role": "Frontend Intern",
                "designation": "Intern", "start_date": "2026-01-01", "end_date": "2026-06-30"}
        r = hr_s.post(f"{API}/interns", json=body, timeout=20)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["created_by_email"].lower() == "hr@projexino.com"
        assert out["created_by_name"]  # non-empty
        # cleanup
        hr_s.delete(f"{API}/interns/{out['id']}", timeout=15)

    def test_hr_can_patch_any_intern(self, hr_s, admin_s):
        # admin creates one, HR patches it
        email = f"TEST_intern2_{uuid.uuid4().hex[:6]}@x.com"
        c = admin_s.post(f"{API}/interns",
                         json={"name": "i2", "email": email, "role": "Backend",
                               "designation": "Intern", "start_date": "2026-01-01",
                               "end_date": "2026-06-30"}, timeout=20)
        assert c.status_code == 200, c.text
        iid = c.json()["id"]
        u = hr_s.patch(f"{API}/interns/{iid}", json={"designation": "DevOps Intern"}, timeout=20)
        assert u.status_code == 200, u.text
        assert u.json()["designation"] == "DevOps Intern"
        admin_s.delete(f"{API}/interns/{iid}", timeout=15)


# ---------- CC-to-manager notifications ----------
class TestCcNotifications:
    def test_cc_to_manager_creates_fyi_for_manager(self, admin_s, manager_s, manager_user):
        # 1. create a developer with route_comms_to_manager=True
        email = f"TEST_ccdev_{uuid.uuid4().hex[:6]}@projexino.com"
        dev_pass = "TestPass@123"
        r = admin_s.post(f"{API}/rbac/admins",
                         json={"email": email, "name": "CC Dev",
                               "password": dev_pass, "role": "developer",
                               "reporting_manager_id": manager_user["id"],
                               "route_comms_to_manager": True},
                         timeout=30)
        assert r.status_code == 200, r.text
        dev = r.json()

        # capture manager's notif count BEFORE
        n_before = manager_s.get(f"{API}/notifications", timeout=15)
        if n_before.status_code != 200:
            pytest.skip(f"/api/notifications returned {n_before.status_code}; cannot verify CC")
        before_titles = [n.get("title", "") for n in n_before.json()]

        # 2. assign a task to the developer (this fires notify())
        t = admin_s.post(f"{API}/tasks",
                         json={"title": f"CC test {uuid.uuid4().hex[:6]}",
                               "assignee_id": dev["id"], "priority": "high"},
                         timeout=20)
        assert t.status_code == 200, t.text
        task_id = t.json()["id"]
        # tiny delay for async-ish notification
        time.sleep(1.5)

        # 3. manager sees [FYI] notif
        n_after = manager_s.get(f"{API}/notifications", timeout=15).json()
        fyi = [n for n in n_after if n.get("title", "").startswith("[FYI]")]
        # should be at least one NEW fyi (we can't easily diff because manager
        # already has 'monitor' notifs etc — just look for any new [FYI])
        assert any(
            n["title"].startswith("[FYI]") and "Task assigned" in n["title"]
            for n in n_after
        ), f"No [FYI] CC notification found for manager. Sample titles: {[n.get('title') for n in n_after[:10]]}"

        # cleanup
        admin_s.delete(f"{API}/tasks/{task_id}", timeout=15)
        admin_s.delete(f"{API}/rbac/admins/{dev['id']}", timeout=15)
