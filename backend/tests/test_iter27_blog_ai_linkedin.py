"""Iteration 27 — Xino AI Blog Drafting + LinkedIn Auto-Publishing tests."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PASS = "Intern@2026"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def intern_token():
    return _login(INTERN_EMAIL, INTERN_PASS)


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------- AI: suggest-topics ----------------

class TestBlogAITopics:
    def test_suggest_topics_admin_ok(self, admin_token):
        r = requests.post(
            f"{API}/blog/ai/suggest-topics",
            headers=H(admin_token),
            json={"keyword": "app development", "count": 5, "audience": "startup founders"},
            timeout=120,
        )
        # Accept 200 OR 502 (Claude unreachable) per spec
        assert r.status_code in (200, 502), f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            data = r.json()
            assert "topics" in data
            assert isinstance(data["topics"], list)
            assert len(data["topics"]) >= 3
            first = data["topics"][0]
            assert "title" in first and first["title"]
            assert "primary_keyword" in first

    def test_suggest_topics_intern_forbidden(self, intern_token):
        r = requests.post(
            f"{API}/blog/ai/suggest-topics",
            headers=H(intern_token),
            json={"keyword": "app development", "count": 3},
            timeout=30,
        )
        assert r.status_code == 403


# ---------------- AI: draft ----------------

class TestBlogAIDraft:
    def test_draft_admin_ok(self, admin_token):
        r = requests.post(
            f"{API}/blog/ai/draft",
            headers=H(admin_token),
            json={
                "topic": "How to build a SaaS MVP in 8 weeks",
                "target_keywords": ["saas mvp", "mvp development"],
            },
            timeout=180,
        )
        assert r.status_code in (200, 502), f"{r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            d = r.json()
            for k in ("title", "slug", "excerpt", "content_html", "seo_title", "seo_description", "seo_keywords", "tags"):
                assert k in d, f"missing {k}"
            html = d["content_html"]
            assert "<h2" in html.lower(), "content should have h2"
            # internal link starting with '/services/' or '/'
            assert ("href=\"/" in html or "href='/" in html), "should contain at least one relative internal link"

    def test_draft_intern_forbidden(self, intern_token):
        r = requests.post(
            f"{API}/blog/ai/draft",
            headers=H(intern_token),
            json={"topic": "Anything", "target_keywords": []},
            timeout=30,
        )
        assert r.status_code == 403


# ---------------- LinkedIn: status / authorize ----------------

class TestLinkedInStatus:
    def test_status_admin(self, admin_token):
        r = requests.get(f"{API}/linkedin/status", headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        d = r.json()
        # Not yet OAuth-authed (likely) OR could be connected; both acceptable. Just structure.
        assert "connected" in d
        # If not connected → client_id_configured key must be there
        if not d["connected"]:
            assert d.get("client_id_configured") is True

    def test_status_intern_forbidden(self, intern_token):
        r = requests.get(f"{API}/linkedin/status", headers=H(intern_token), timeout=20)
        assert r.status_code == 403

    def test_authorize_url(self, admin_token):
        r = requests.get(f"{API}/linkedin/authorize", headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        url = r.json()["authorize_url"]
        assert url.startswith("https://www.linkedin.com/oauth/v2/authorization?")
        assert "client_id=86jwig1xpesgl8" in url
        assert "redirect_uri=https%3A%2F%2Fwww.projexino.com%2Fapi%2Flinkedin%2Fcallback" in url
        # scopes URL-encoded contain w_organization_social r_organization_social r_liteprofile
        assert "w_organization_social" in url
        assert "r_organization_social" in url
        assert "r_liteprofile" in url
        assert "state=" in url

    def test_callback_missing_code_redirects(self):
        # callback is unauthenticated
        r = requests.get(f"{API}/linkedin/callback", allow_redirects=False, timeout=20)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "/app/linkedin?linkedin=error" in loc
        assert "missing-code" in loc

    def test_select_org_not_connected(self, admin_token):
        # Only valid if not connected. Check status first.
        st = requests.get(f"{API}/linkedin/status", headers=H(admin_token), timeout=20).json()
        if st.get("connected"):
            pytest.skip("LinkedIn already connected - cannot test 'not connected' path")
        r = requests.post(
            f"{API}/linkedin/select-organization",
            headers=H(admin_token),
            json={"organization_urn": "urn:li:organization:123"},
            timeout=20,
        )
        assert r.status_code == 400


# ---------------- LinkedIn: queue CRUD ----------------

CREATED_IDS = []


class TestLinkedInQueue:
    def test_queue_list_admin(self, admin_token):
        r = requests.get(f"{API}/linkedin/queue", headers=H(admin_token), timeout=20)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_queue_list_intern_forbidden(self, intern_token):
        r = requests.get(f"{API}/linkedin/queue", headers=H(intern_token), timeout=20)
        assert r.status_code == 403

    def test_create_queue_item(self, admin_token):
        r = requests.post(
            f"{API}/linkedin/queue",
            headers=H(admin_token),
            json={
                "commentary": "TEST_ITER27 manual queue item — at least 10 chars",
                "link_url": "https://www.projexino.com/blog/test",
                "kind": "manual",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "queued"
        assert d.get("id")
        assert d.get("scheduled_for")
        # scheduled_for should be Mon (0) or Thu (3) at 04:30 UTC
        from datetime import datetime
        sf = d["scheduled_for"]
        # Parse — fastapi returns isoformat
        dt = datetime.fromisoformat(sf.replace("Z", "+00:00"))
        assert dt.weekday() in (0, 3), f"expected Mon/Thu, got weekday={dt.weekday()}"
        assert dt.hour == 4 and dt.minute == 30, f"expected 04:30 UTC got {dt.hour}:{dt.minute}"
        CREATED_IDS.append(d["id"])

    def test_approve_then_skip_then_delete(self, admin_token):
        # Create a fresh item for the lifecycle
        r = requests.post(
            f"{API}/linkedin/queue",
            headers=H(admin_token),
            json={"commentary": "TEST_ITER27 lifecycle item commentary text", "kind": "manual"},
            timeout=20,
        )
        assert r.status_code == 200
        item_id = r.json()["id"]
        CREATED_IDS.append(item_id)

        # approve
        ra = requests.post(f"{API}/linkedin/queue/{item_id}/approve", headers=H(admin_token), timeout=20)
        assert ra.status_code == 200, ra.text

        # We DON'T want it actually attempted. Immediately skip it.
        rs = requests.post(f"{API}/linkedin/queue/{item_id}/skip", headers=H(admin_token), timeout=20)
        assert rs.status_code == 200, rs.text

        # confirm in list
        lst = requests.get(f"{API}/linkedin/queue", headers=H(admin_token), timeout=20).json()["items"]
        match = next((x for x in lst if x["id"] == item_id), None)
        assert match is not None
        assert match["status"] == "skipped"

        # delete
        rd = requests.delete(f"{API}/linkedin/queue/{item_id}", headers=H(admin_token), timeout=20)
        assert rd.status_code == 200
        # gone
        lst2 = requests.get(f"{API}/linkedin/queue", headers=H(admin_token), timeout=20).json()["items"]
        assert not any(x["id"] == item_id for x in lst2)


# ---------------- LinkedIn: draft-from-blog ----------------

class TestDraftFromBlog:
    @pytest.fixture(scope="class")
    def published_post_id(self, admin_token):
        # Try to find an existing published post first
        r = requests.get(f"{API}/admin/blog/posts", headers=H(admin_token), timeout=20)
        if r.status_code == 200:
            posts = r.json().get("items") or r.json().get("posts") or r.json() if isinstance(r.json(), list) else r.json().get("items", [])
            if isinstance(r.json(), dict):
                posts = r.json().get("items") or r.json().get("posts") or []
            else:
                posts = r.json()
            pub = [p for p in posts if p.get("status") == "published"]
            if pub:
                return pub[0]["id"]

        # Else create one
        slug = f"test-iter27-{uuid.uuid4().hex[:8]}"
        payload = {
            "title": "TEST_ITER27 Published Post",
            "slug": slug,
            "excerpt": "Excerpt for iter27 test post.",
            "content_html": "<h2>Section</h2><p>Body.</p><p><a href='/services/app-development'>App Dev</a></p>",
            "status": "published",
            "tags": ["test"],
            "seo_title": "TEST_ITER27",
            "seo_description": "Test desc.",
            "seo_keywords": ["test"],
        }
        rc = requests.post(f"{API}/admin/blog/posts", headers=H(admin_token), json=payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        return rc.json()["id"]

    @pytest.fixture(scope="class")
    def draft_post_id(self, admin_token):
        slug = f"test-iter27-draft-{uuid.uuid4().hex[:8]}"
        payload = {
            "title": "TEST_ITER27 Draft Post",
            "slug": slug,
            "excerpt": "Draft excerpt.",
            "content_html": "<h2>Section</h2><p>Body.</p>",
            "status": "draft",
            "tags": ["test"],
        }
        rc = requests.post(f"{API}/admin/blog/posts", headers=H(admin_token), json=payload, timeout=20)
        assert rc.status_code in (200, 201), rc.text
        return rc.json()["id"]

    def test_draft_from_published_blog(self, admin_token, published_post_id):
        r = requests.post(
            f"{API}/linkedin/draft-from-blog/{published_post_id}",
            headers=H(admin_token),
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        items = d.get("items", [])
        assert len(items) == 2
        kinds = sorted([i["kind"] for i in items])
        assert kinds == ["ai-native", "blog-teaser"]
        # Different slots, both Mon/Thu @ 04:30 UTC
        from datetime import datetime
        slots = []
        for it in items:
            sf = it["scheduled_for"]
            if isinstance(sf, str):
                dt = datetime.fromisoformat(sf.replace("Z", "+00:00"))
            else:
                dt = sf
            assert dt.weekday() in (0, 3)
            assert dt.hour == 4 and dt.minute == 30
            slots.append(dt)
            CREATED_IDS.append(it["id"])
        assert slots[0] != slots[1], "two items must be in different slots"

    def test_draft_from_draft_blog_400(self, admin_token, draft_post_id):
        r = requests.post(
            f"{API}/linkedin/draft-from-blog/{draft_post_id}",
            headers=H(admin_token),
            timeout=30,
        )
        assert r.status_code == 400, r.text


# ---------------- Cleanup ----------------

def test_zz_cleanup(admin_token=None):
    """Final cleanup of created queue items (best effort)."""
    if admin_token is None:
        admin_token = _login(ADMIN_EMAIL, ADMIN_PASS)
    for iid in CREATED_IDS:
        try:
            requests.delete(f"{API}/linkedin/queue/{iid}", headers=H(admin_token), timeout=10)
        except Exception:
            pass
