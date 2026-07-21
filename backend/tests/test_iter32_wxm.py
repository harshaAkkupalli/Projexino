"""
Iter 32 — WXM (Website Experience Manager) backend tests.
Covers: Profiles, Themes, Heroes, CTAs CRUD; public /detect resolution; RBAC; analytics.
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def intern_token():
    return _login(INTERN)


@pytest.fixture(scope="module")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def state():
    return {}


# ── 1. List endpoints return 200 + array ───────────────────────────────
class TestList:
    @pytest.mark.parametrize("path", ["profiles", "themes", "heroes", "ctas"])
    def test_list_returns_array(self, H, path):
        r = requests.get(f"{BASE}/api/wxm/{path}", headers=H, timeout=20)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text}"
        assert isinstance(r.json(), list)

    def test_public_detect_no_auth(self):
        r = requests.get(f"{BASE}/api/public/wxm/detect", params={"country": "US", "industry": "fintech"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        for k in ("profile", "theme", "hero", "primary_cta", "secondary_cta"):
            assert k in body


# ── 2. Create theme / cta / hero / profile ─────────────────────────────
class TestCreate:
    def test_create_theme(self, H, state):
        payload = {"name": "TEST_Sky Theme", "primary_color": "#0066FF", "hero_style": "centered", "cta_style": "pill"}
        r = requests.post(f"{BASE}/api/wxm/themes", json=payload, headers=H, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["name"] == payload["name"]
        assert "id" in d
        state["theme_id"] = d["id"]

    def test_create_cta(self, H, state):
        payload = {"name": "TEST_Book Demo", "label": "Book a demo", "url": "/book", "intent": "lead", "open_in_new_tab": True}
        r = requests.post(f"{BASE}/api/wxm/ctas", json=payload, headers=H, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["label"] == "Book a demo"
        assert "id" in d
        state["cta_id"] = d["id"]

    def test_create_hero(self, H, state):
        payload = {"name": "TEST_FintechHero", "headline": "Banking, reimagined.", "subheadline": "Build faster.", "badge_text": "Fintech"}
        r = requests.post(f"{BASE}/api/wxm/heroes", json=payload, headers=H, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["headline"] == "Banking, reimagined."
        assert "id" in d
        state["hero_id"] = d["id"]

    def test_create_profile(self, H, state):
        payload = {
            "name": "TEST_Fintech US",
            "industry": "fintech",
            "country": "US",
            "audience": "enterprise",
            "theme_id": state["theme_id"],
            "hero_id": state["hero_id"],
            "primary_cta_id": state["cta_id"],
            "is_published": True,
            "is_default": True,
            "priority": 10,
        }
        r = requests.post(f"{BASE}/api/wxm/profiles", json=payload, headers=H, timeout=20)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["industry"] == "fintech"
        assert d["country"] == "US"
        assert d["is_default"] is True
        assert d.get("slug")
        state["profile_id"] = d["id"]
        state["profile_slug"] = d["slug"]

    def test_get_after_create(self, H, state):
        r = requests.get(f"{BASE}/api/wxm/profiles", headers=H, timeout=20)
        ids = [p["id"] for p in r.json()]
        assert state["profile_id"] in ids


# ── 3. Public detect resolution ─────────────────────────────────────────
class TestDetect:
    def test_industry_country_match(self, state):
        r = requests.get(f"{BASE}/api/public/wxm/detect",
                         params={"country": "US", "industry": "fintech"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body["profile"] is not None
        assert body["profile"]["id"] == state["profile_id"]
        assert body["theme"] is not None
        assert body["theme"]["id"] == state["theme_id"]
        assert body["hero"]["headline"] == "Banking, reimagined."
        assert body["primary_cta"]["label"] == "Book a demo"

    def test_default_fallback_on_no_match(self, state):
        r = requests.get(f"{BASE}/api/public/wxm/detect",
                         params={"country": "ZZ", "industry": "unknownXYZ"}, timeout=20)
        assert r.status_code == 200
        body = r.json()
        # since our profile is is_default=true, it should fallback to it
        assert body["profile"] is not None
        assert body["profile"]["id"] == state["profile_id"]

    def test_preview_profile_id_force(self, state):
        r = requests.get(f"{BASE}/api/public/wxm/detect",
                         params={"preview_profile_id": state["profile_id"]}, timeout=20)
        assert r.status_code == 200
        assert r.json()["profile"]["id"] == state["profile_id"]


# ── 4. Single-default invariant via PATCH ──────────────────────────────
class TestDefaultInvariant:
    def test_patch_sets_single_default(self, H, state):
        # create a 2nd profile
        payload = {"name": "TEST_Health UK", "industry": "healthcare", "country": "GB",
                   "is_published": True, "is_default": False, "priority": 5}
        r = requests.post(f"{BASE}/api/wxm/profiles", json=payload, headers=H, timeout=20)
        assert r.status_code in (200, 201)
        pid2 = r.json()["id"]
        state["profile_id_2"] = pid2

        # mark it default
        r = requests.patch(f"{BASE}/api/wxm/profiles/{pid2}",
                           json={"name": "TEST_Health UK", "is_default": True}, headers=H, timeout=20)
        assert r.status_code == 200, r.text

        # verify the original profile lost is_default
        r = requests.get(f"{BASE}/api/wxm/profiles", headers=H, timeout=20)
        profiles = {p["id"]: p for p in r.json()}
        assert profiles[pid2]["is_default"] is True
        assert profiles[state["profile_id"]]["is_default"] is False, "Original profile should have is_default unset"


# ── 5. RBAC ─────────────────────────────────────────────────────────────
class TestRBAC:
    def test_intern_forbidden(self, intern_token):
        h = {"Authorization": f"Bearer {intern_token}"}
        r = requests.get(f"{BASE}/api/wxm/profiles", headers=h, timeout=20)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_public_detect_no_auth_required(self):
        r = requests.get(f"{BASE}/api/public/wxm/detect", timeout=20)
        assert r.status_code == 200


# ── 6. Analytics ────────────────────────────────────────────────────────
class TestAnalytics:
    def test_analytics_shape(self, H, state):
        # trigger a few detects
        for _ in range(3):
            requests.get(f"{BASE}/api/public/wxm/detect",
                         params={"country": "US", "industry": "fintech"}, timeout=20)
        r = requests.get(f"{BASE}/api/wxm/analytics", params={"days": 14}, headers=H, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["days"] == 14
        assert "rows" in body and isinstance(body["rows"], list)
        # at least our profile slug should appear
        slugs = [row["profile_slug"] for row in body["rows"]]
        assert state["profile_slug"] in slugs

    def test_analytics_intern_forbidden(self, intern_token):
        h = {"Authorization": f"Bearer {intern_token}"}
        r = requests.get(f"{BASE}/api/wxm/analytics", headers=h, timeout=20)
        assert r.status_code == 403


# ── 7. Cleanup ──────────────────────────────────────────────────────────
class TestCleanup:
    def test_cleanup(self, H, state):
        for pid_key in ("profile_id", "profile_id_2"):
            pid = state.get(pid_key)
            if pid:
                r = requests.delete(f"{BASE}/api/wxm/profiles/{pid}", headers=H, timeout=20)
                assert r.status_code in (200, 204), r.text
        for tid_key, path in [("theme_id", "themes"), ("hero_id", "heroes"), ("cta_id", "ctas")]:
            tid = state.get(tid_key)
            if tid:
                r = requests.delete(f"{BASE}/api/wxm/{path}/{tid}", headers=H, timeout=20)
                assert r.status_code in (200, 204), r.text

    def test_delete_unknown_returns_ok_false_or_404(self, H):
        r = requests.delete(f"{BASE}/api/wxm/profiles/nonexistent-id-xyz", headers=H, timeout=20)
        # current impl returns 200 + {ok:false}; either is acceptable
        assert r.status_code in (200, 404)
