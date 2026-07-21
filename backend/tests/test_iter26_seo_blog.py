"""
Backend tests for iteration 26 — SEO + Blog CMS endpoints.
Covers:
  - GET /api/sitemap.xml (public XML)
  - GET /api/blog/posts (public list)
  - GET /api/blog/tags (public tag cloud)
  - POST/PUT/DELETE /api/admin/blog/posts (admin only — 403 for intern)
  - POST /api/admin/blog/posts/{id}/publish
  - GET /api/blog/posts/{slug} (post fetch + views++)
  - sitemap inclusion of published post slug
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PASSWORD = "Intern@2026"


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_client():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def intern_client():
    try:
        return _login(INTERN_EMAIL, INTERN_PASSWORD)
    except AssertionError:
        pytest.skip("intern account unavailable")


@pytest.fixture(scope="module")
def created_post(admin_client):
    """Create a draft post that other tests can mutate. Returns dict."""
    rand = uuid.uuid4().hex[:6]
    payload = {
        "title": f"TEST_iter26 SEO Hub {rand}",
        "excerpt": "Test excerpt about app development for SEO",
        "content_html": "<p>This is a TEST_iter26 article for blog CMS validation. It contains enough content.</p>",
        "tags": ["TEST_iter26", "seo", "app-development"],
        "seo_title": "TEST iter26 SEO Title",
        "seo_description": "TEST iter26 description for SEO validation",
        "seo_keywords": ["app development", "seo"],
        "status": "draft",
    }
    r = admin_client.post(f"{BASE_URL}/api/admin/blog/posts", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    doc = r.json()
    assert doc["title"] == payload["title"]
    assert "seo-hub" in doc["slug"]  # slug strips underscores → testiter26-seo-hub-<rand>
    assert doc["status"] == "draft"
    yield doc
    # Cleanup
    try:
        admin_client.delete(f"{BASE_URL}/api/admin/blog/posts/{doc['id']}", timeout=10)
    except Exception:
        pass


# ---------- Public endpoints ----------

class TestPublicSitemap:
    def test_sitemap_xml(self):
        r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=15)
        assert r.status_code == 200
        ctype = r.headers.get("content-type", "")
        assert "xml" in ctype, f"content-type not xml: {ctype}"
        body = r.text
        assert body.startswith("<?xml")
        assert "<urlset" in body
        assert "https://www.projexino.com/" in body
        assert "https://www.projexino.com/app-development-india" in body
        assert "https://www.projexino.com/blog" in body


class TestPublicBlog:
    def test_list_posts_shape(self):
        r = requests.get(f"{BASE_URL}/api/blog/posts", timeout=15)
        assert r.status_code == 200
        data = r.json()
        for key in ("items", "total", "skip", "limit"):
            assert key in data, f"missing key {key}"
        assert isinstance(data["items"], list)
        assert isinstance(data["total"], int)

    def test_tag_cloud(self):
        r = requests.get(f"{BASE_URL}/api/blog/tags", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_no_auth_required(self):
        # explicit fresh session with no creds
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/blog/posts", timeout=15)
        assert r.status_code == 200


# ---------- RBAC ----------

class TestRBAC:
    def test_intern_cannot_create_post(self, intern_client):
        r = intern_client.post(
            f"{BASE_URL}/api/admin/blog/posts",
            json={"title": "Should not pass", "content_html": "<p>denied content here</p>"},
            timeout=15,
        )
        assert r.status_code == 403, f"expected 403, got {r.status_code} body={r.text}"

    def test_intern_cannot_list_admin_posts(self, intern_client):
        r = intern_client.get(f"{BASE_URL}/api/admin/blog/posts", timeout=15)
        assert r.status_code == 403

    def test_unauth_cannot_list_admin_posts(self):
        s = requests.Session()
        r = s.get(f"{BASE_URL}/api/admin/blog/posts", timeout=15)
        assert r.status_code in (401, 403)


# ---------- Admin CRUD + flows ----------

class TestAdminBlogFlow:
    def test_admin_can_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/blog/posts", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data

    def test_create_auto_slug(self, created_post):
        assert "id" in created_post
        assert created_post["slug"]
        assert created_post["status"] == "draft"
        assert created_post["views"] == 0

    def test_update_to_published(self, admin_client, created_post):
        pid = created_post["id"]
        payload = {
            "title": created_post["title"] + " (updated)",
            "content_html": created_post["content_html"] + "<p>extra para</p>",
            "excerpt": "Updated excerpt",
            "tags": created_post.get("tags", []),
            "status": "published",
        }
        r = admin_client.put(f"{BASE_URL}/api/admin/blog/posts/{pid}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "published"
        assert doc["title"].endswith("(updated)")
        # Verify via admin GET
        g = admin_client.get(f"{BASE_URL}/api/admin/blog/posts/{pid}", timeout=15)
        assert g.status_code == 200
        assert g.json()["status"] == "published"

    def test_published_post_public_fetch_increments_views(self, admin_client, created_post):
        slug = created_post["slug"]
        r1 = requests.get(f"{BASE_URL}/api/blog/posts/{slug}", timeout=15)
        assert r1.status_code == 200, r1.text
        doc1 = r1.json()
        assert doc1["slug"] == slug
        assert doc1["status"] == "published"
        v1 = doc1.get("views", 0)
        r2 = requests.get(f"{BASE_URL}/api/blog/posts/{slug}", timeout=15)
        assert r2.status_code == 200
        v2 = r2.json().get("views", 0)
        assert v2 >= v1 + 1, f"views did not increment: {v1} -> {v2}"

    def test_sitemap_includes_published_slug(self, created_post):
        slug = created_post["slug"]
        r = requests.get(f"{BASE_URL}/api/sitemap.xml", timeout=15)
        assert r.status_code == 200
        assert f"/blog/{slug}" in r.text, f"published slug {slug} missing from sitemap"

    def test_toggle_publish_unpublish(self, admin_client, created_post):
        pid = created_post["id"]
        # currently published, toggle -> draft
        r = admin_client.post(f"{BASE_URL}/api/admin/blog/posts/{pid}/publish", timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "draft"
        # toggle again -> published
        r2 = admin_client.post(f"{BASE_URL}/api/admin/blog/posts/{pid}/publish", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "published"

    def test_delete_post(self, admin_client):
        # create a fresh throwaway
        rand = uuid.uuid4().hex[:6]
        c = admin_client.post(
            f"{BASE_URL}/api/admin/blog/posts",
            json={
                "title": f"TEST_iter26 delete {rand}",
                "content_html": "<p>delete me content body</p>",
                "status": "draft",
            },
            timeout=15,
        )
        assert c.status_code in (200, 201)
        pid = c.json()["id"]
        d = admin_client.delete(f"{BASE_URL}/api/admin/blog/posts/{pid}", timeout=15)
        assert d.status_code == 200
        # GET should now 404
        g = admin_client.get(f"{BASE_URL}/api/admin/blog/posts/{pid}", timeout=15)
        assert g.status_code == 404
