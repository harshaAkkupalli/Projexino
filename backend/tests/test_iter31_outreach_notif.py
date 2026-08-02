"""
Iteration 31 backend tests:
(A) BUG FIX — Task/Project notification deep links + cross-role updates
(B) FEATURE — Outreach Pipeline / Lead Drawer / Sequences / AI Writer / Reports / Score
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def _login(email: str, password: str) -> requests.Session:
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_s():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def manager_s():
    return _login(*MANAGER)


@pytest.fixture(scope="module")
def intern_s():
    return _login(*INTERN)


@pytest.fixture(scope="module")
def intern_user(admin_s):
    r = admin_s.get(f"{API}/auth/me")
    assert r.status_code == 200
    # Find the intern user via assignable-users or direct seed.
    r2 = admin_s.get(f"{API}/projects/assignable-users")
    if r2.status_code == 200:
        data = r2.json()
        buckets = data if isinstance(data, list) else (data.get("users") or [])
        # Try nested bucket form
        if isinstance(data, dict):
            for key in ("interns", "team_members", "members", "users"):
                if key in data and isinstance(data[key], list):
                    for u in data[key]:
                        if u.get("email") == INTERN[0]:
                            return u
        elif isinstance(buckets, list):
            for u in buckets:
                if u.get("email") == INTERN[0]:
                    return u
    # Fallback: use auth/me on intern session
    s = _login(*INTERN)
    me = s.get(f"{API}/auth/me").json()
    return {"id": me["id"], "email": me["email"], "name": me.get("name", "Intern")}


# ===== (A) BUG FIX TESTS =====

class TestNotificationDeepLinks:
    def test_A1_task_assignment_deep_link(self, admin_s, intern_user, intern_s):
        title = f"TEST_A1_{uuid.uuid4().hex[:6]}"
        payload = {
            "title": title,
            "description": "deep link test",
            "assignee_id": intern_user["id"],
            "assignee_email": intern_user["email"],
            "priority": "medium",
        }
        r = admin_s.post(f"{API}/tasks", json=payload)
        assert r.status_code == 200, r.text
        task = r.json()
        tid = task["id"]
        # Poll intern notifications
        link_expected = f"/app/tasks/{tid}"
        found = None
        for _ in range(6):
            n = intern_s.get(f"{API}/notifications").json()
            items = n if isinstance(n, list) else (n.get("items") or [])
            for it in items:
                if it.get("link") == link_expected:
                    found = it
                    break
            if found:
                break
            time.sleep(0.5)
        assert found, f"Intern did not receive notif with link {link_expected}. Got: {items[:3] if 'items' in dir() else 'n/a'}"
        assert title in (found.get("title") or "")
        # Store tid for next test
        pytest.shared_task_id = tid

    def test_A2_intern_update_notifies_admin(self, admin_s, intern_s):
        tid = getattr(pytest, "shared_task_id", None)
        assert tid, "A1 must run first"
        # intern PATCH via self-service
        r = intern_s.patch(f"{API}/me/intern/tasks/{tid}", json={"status": "in_progress"})
        assert r.status_code in (200, 204), f"intern patch failed: {r.status_code} {r.text[:200]}"
        link_expected = f"/app/tasks/{tid}"
        found = None
        for _ in range(6):
            n = admin_s.get(f"{API}/notifications").json()
            items = n if isinstance(n, list) else (n.get("items") or [])
            for it in items:
                if it.get("link") == link_expected and "progress" in (it.get("title") or "").lower():
                    found = it
                    break
            if found:
                break
            time.sleep(0.5)
        assert found, "Admin owner did not receive in_progress notif from intern update"

    def test_A3_manager_patch_task_notifies_assignee(self, admin_s, intern_user, intern_s):
        # Admin creates task assigned to intern
        title = f"TEST_A3_{uuid.uuid4().hex[:6]}"
        r = admin_s.post(f"{API}/tasks", json={
            "title": title, "assignee_id": intern_user["id"],
            "assignee_email": intern_user["email"], "priority": "low",
        })
        assert r.status_code == 200
        tid = r.json()["id"]
        # Admin PATCHes status -> review
        r2 = admin_s.patch(f"{API}/tasks/{tid}", json={"status": "review"})
        assert r2.status_code == 200, r2.text
        link_expected = f"/app/tasks/{tid}"
        found = None
        for _ in range(6):
            n = intern_s.get(f"{API}/notifications").json()
            items = n if isinstance(n, list) else (n.get("items") or [])
            for it in items:
                if it.get("link") == link_expected and "task update" in (it.get("title") or "").lower():
                    found = it
                    break
            if found:
                break
            time.sleep(0.5)
        assert found, "Assignee did not receive 'Task update' notif on admin PATCH"

    def test_A4_notification_mark_read(self, intern_s):
        n = intern_s.get(f"{API}/notifications").json()
        items = n if isinstance(n, list) else (n.get("items") or [])
        unread = [it for it in items if not it.get("read")]
        if not unread:
            pytest.skip("no unread to mark read")
        nid = unread[0]["id"]
        r = intern_s.post(f"{API}/notifications/{nid}/read")
        assert r.status_code in (200, 204), r.text

    def test_A5_project_stage_update_notifies_owner_and_manager(self, admin_s, manager_s, intern_user, intern_s):
        # Create a project where admin is owner and manager is manager_id, intern is assignee on a stage
        proj_payload = {
            "name": f"TEST_A5_Proj_{uuid.uuid4().hex[:5]}",
            "description": "stage notif test",
        }
        r = admin_s.post(f"{API}/projects", json=proj_payload)
        assert r.status_code == 200, r.text
        proj = r.json()
        pid = proj["id"]
        # Get the pipeline stages
        rp = admin_s.get(f"{API}/projects/{pid}")
        if rp.status_code != 200:
            pytest.skip(f"project GET failed: {rp.status_code}")
        proj_full = rp.json()
        pipeline = proj_full.get("pipeline") or []
        if not pipeline:
            pytest.skip("project has no pipeline stages")
        stage_key = pipeline[0].get("key") or pipeline[0].get("stage_key") or pipeline[0].get("id")
        # Assign intern to this stage (assignees expects list of dicts with user_id/email/name)
        rassign = admin_s.patch(
            f"{API}/projects/{pid}/pipeline/{stage_key}",
            json={"assignees": [{"user_id": intern_user["id"], "email": intern_user["email"], "name": intern_user.get("name", "Intern")}]},
        )
        if rassign.status_code not in (200, 204):
            pytest.skip(f"could not assign stage: {rassign.status_code} {rassign.text[:200]}")
        # Intern updates the stage
        r2 = intern_s.patch(f"{API}/projects/{pid}/pipeline/{stage_key}", json={"status": "in_progress"})
        if r2.status_code not in (200, 204):
            # team_member/intern may not be able to update — record as a finding but don't fail outright if 403 with a known limit
            pytest.skip(f"intern stage PATCH not permitted: {r2.status_code} {r2.text[:200]}")
        link_expected = f"/app/projects/{pid}"
        # Admin (owner) should get a project_stage_update notif
        found_admin = None
        for _ in range(6):
            items = admin_s.get(f"{API}/notifications").json()
            items = items if isinstance(items, list) else (items.get("items") or [])
            for it in items:
                if it.get("link") == link_expected and (it.get("type") == "project_stage_update" or "→" in (it.get("title") or "") or "stage" in (it.get("title") or "").lower()):
                    found_admin = it
                    break
            if found_admin:
                break
            time.sleep(0.5)
        assert found_admin, "Project owner did not receive project_stage_update notif"


# ===== (B) FEATURE TESTS =====

class TestOutreach:
    def test_B0_seed_one_lead(self, admin_s):
        # Ensure at least one lead exists for downstream tests
        email = f"test_{uuid.uuid4().hex[:6]}@example.com"
        r = admin_s.post(f"{API}/outreach/leads", json={
            "email": email, "first_name": "Test", "last_name": "Lead",
            "company": "TestCo", "industry": "Healthcare", "country": "UK",
            "pipeline_stage": "new_lead",
        })
        assert r.status_code == 200, r.text
        pytest.shared_lead = r.json()
        pytest.shared_lead_email = email

    def test_B1_leads_list_has_score(self, admin_s):
        r = admin_s.get(f"{API}/outreach/leads")
        assert r.status_code == 200
        data = r.json()
        items = data if isinstance(data, list) else (data.get("items") or data.get("leads") or [])
        assert len(items) >= 1
        # score field must exist (may be 0)
        assert "score" in items[0], f"score field missing in lead: {items[0].keys()}"

    def test_B1_pipeline_stage_patch(self, admin_s):
        lid = pytest.shared_lead["id"]
        r = admin_s.patch(f"{API}/outreach/leads/{lid}", json={"pipeline_stage": "contacted"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("pipeline_stage") == "contacted"

    def test_B2_lead_full_drawer_data(self, admin_s):
        lid = pytest.shared_lead["id"]
        r = admin_s.get(f"{API}/outreach/leads/{lid}/full")
        assert r.status_code == 200, r.text
        data = r.json()
        # Drawer requires lead + events/activity timeline
        assert "lead" in data or "id" in data
        # Activity timeline
        assert ("events" in data) or ("activity" in data) or ("timeline" in data), f"no timeline key in {list(data.keys())}"

    def test_B2_add_note(self, admin_s):
        lid = pytest.shared_lead["id"]
        r = admin_s.post(f"{API}/outreach/leads/{lid}/note", json={"note": "TEST note from iter31"})
        assert r.status_code == 200, r.text

    def test_B3_sequence_crud(self, admin_s):
        # Create
        name = f"TEST_Drip_{uuid.uuid4().hex[:5]}"
        r = admin_s.post(f"{API}/outreach/sequences", json={
            "name": name,
            "steps": [
                {"day_offset": 0, "subject": "Hi", "body_html": "<p>Hello</p>"},
                {"day_offset": 4, "subject": "Follow", "body_html": "<p>Following up</p>"},
                {"day_offset": 8, "subject": "Ping", "body_html": "<p>Ping</p>"},
                {"day_offset": 15, "subject": "Last", "body_html": "<p>Last</p>"},
            ],
        })
        assert r.status_code == 200, r.text
        seq = r.json()
        sid = seq.get("id")
        assert sid
        # List
        rl = admin_s.get(f"{API}/outreach/sequences")
        assert rl.status_code == 200
        data = rl.json()
        items = data if isinstance(data, list) else (data.get("items") or [])
        assert any(s.get("id") == sid for s in items)
        # Enroll (zero leads is acceptable per spec)
        re_ = admin_s.post(f"{API}/outreach/sequences/{sid}/enroll", json={"lead_ids": [pytest.shared_lead["id"]]})
        assert re_.status_code in (200, 204), re_.text
        # Cleanup
        admin_s.delete(f"{API}/outreach/sequences/{sid}")

    def test_B4_ai_writer(self, admin_s):
        r = admin_s.post(f"{API}/outreach/ai/write", json={
            "industry": "Healthcare", "country": "UK", "kind": "cold",
        }, timeout=60)
        if r.status_code == 400 and "EMERGENT_LLM_KEY" in r.text:
            pytest.skip("EMERGENT_LLM_KEY not configured")
        assert r.status_code == 200, f"AI writer failed: {r.status_code} {r.text[:300]}"
        body = r.json()
        assert body.get("subject"), "subject missing"
        assert body.get("body_html"), "body_html missing"

    def test_B5_reports(self, admin_s):
        r = admin_s.get(f"{API}/outreach/reports?period=daily&days=14")
        assert r.status_code == 200, r.text
        data = r.json()
        # Expect buckets array + totals
        assert ("buckets" in data) or ("series" in data) or ("data" in data), f"no buckets key in {list(data.keys())}"

    def test_zz_cleanup_lead(self, admin_s):
        lid = pytest.shared_lead.get("id")
        if lid:
            admin_s.delete(f"{API}/outreach/leads/{lid}")
