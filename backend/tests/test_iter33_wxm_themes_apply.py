"""
Iter 33 — WXM theme presets + one-click 'Apply to site' backend tests.

Covers:
  • Preset seeding idempotency (6 known presets present, _preset=true)
  • POST /api/wxm/themes/{id}/activate → is_site_active=true, single-active invariant
  • GET  /api/public/wxm/active-theme (no auth) returns currently-active theme
  • RBAC: intern → 403 on activate
  • 404 when activating non-existent id
"""
import os
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}

PRESET_NAMES = {
    "Projexino Classic", "Midnight Indigo", "Emerald Sprint",
    "Crimson Pulse", "Ocean Calm", "Slate Mono",
}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}"}


@pytest.fixture(scope="module")
def intern_h():
    return {"Authorization": f"Bearer {_login(INTERN)}"}


@pytest.fixture(scope="module")
def themes(admin_h):
    r = requests.get(f"{BASE}/api/wxm/themes", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


# ── 1. Preset seeding ─────────────────────────────────────────────────
class TestPresetSeeding:
    def test_themes_returns_list_with_min_6(self, themes):
        assert isinstance(themes, list)
        assert len(themes) >= 6, f"expected ≥6 themes, got {len(themes)}"

    def test_all_six_presets_seeded(self, themes):
        names = {t["name"] for t in themes}
        missing = PRESET_NAMES - names
        assert not missing, f"missing preset themes: {missing}"

    def test_presets_marked_with_flag(self, themes):
        for t in themes:
            if t["name"] in PRESET_NAMES:
                assert t.get("_preset") is True, f"{t['name']} missing _preset=true"

    def test_presets_have_required_fields(self, themes):
        for t in themes:
            if t["name"] in PRESET_NAMES:
                for k in ("id", "primary_color", "secondary_color", "accent_color"):
                    assert t.get(k), f"{t['name']} missing field {k}"

    def test_seeding_is_idempotent(self, admin_h):
        # The seed runs on every startup; verify no duplicates exist.
        r = requests.get(f"{BASE}/api/wxm/themes", headers=admin_h, timeout=20)
        themes_list = r.json()
        counts = {}
        for t in themes_list:
            if t["name"] in PRESET_NAMES:
                counts[t["name"]] = counts.get(t["name"], 0) + 1
        dupes = {n: c for n, c in counts.items() if c > 1}
        assert not dupes, f"duplicate presets seeded: {dupes}"


# ── 2. Activate endpoint ──────────────────────────────────────────────
class TestActivate:
    def test_activate_crimson_pulse_returns_200(self, admin_h, themes):
        crimson = next((t for t in themes if t["name"] == "Crimson Pulse"), None)
        assert crimson, "Crimson Pulse preset not found"
        rid = crimson["id"]
        r = requests.post(f"{BASE}/api/wxm/themes/{rid}/activate", headers=admin_h, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["is_site_active"] is True
        assert d["id"] == rid
        assert d["name"] == "Crimson Pulse"

    def test_single_active_invariant(self, admin_h, themes):
        # After activating Crimson Pulse above, no other theme should be is_site_active.
        r = requests.get(f"{BASE}/api/wxm/themes", headers=admin_h, timeout=20)
        active_ones = [t for t in r.json() if t.get("is_site_active")]
        assert len(active_ones) == 1, f"expected exactly 1 active theme, got {len(active_ones)}: {[t['name'] for t in active_ones]}"
        assert active_ones[0]["name"] == "Crimson Pulse"

    def test_switch_active_to_emerald(self, admin_h, themes):
        emerald = next((t for t in themes if t["name"] == "Emerald Sprint"), None)
        assert emerald, "Emerald Sprint preset not found"
        r = requests.post(f"{BASE}/api/wxm/themes/{emerald['id']}/activate", headers=admin_h, timeout=20)
        assert r.status_code == 200
        # verify only Emerald is now active
        r2 = requests.get(f"{BASE}/api/wxm/themes", headers=admin_h, timeout=20)
        active_ones = [t for t in r2.json() if t.get("is_site_active")]
        assert len(active_ones) == 1
        assert active_ones[0]["name"] == "Emerald Sprint"

    def test_activate_non_existent_returns_404(self, admin_h):
        r = requests.post(f"{BASE}/api/wxm/themes/this-id-does-not-exist-xyz/activate",
                          headers=admin_h, timeout=20)
        assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text}"


# ── 3. RBAC on activate ───────────────────────────────────────────────
class TestActivateRBAC:
    def test_intern_forbidden(self, intern_h, themes):
        rid = next(t for t in themes if t["name"] == "Crimson Pulse")["id"]
        r = requests.post(f"{BASE}/api/wxm/themes/{rid}/activate", headers=intern_h, timeout=20)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"

    def test_no_auth_forbidden(self, themes):
        rid = next(t for t in themes if t["name"] == "Crimson Pulse")["id"]
        r = requests.post(f"{BASE}/api/wxm/themes/{rid}/activate", timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"


# ── 4. Public active-theme endpoint ───────────────────────────────────
class TestPublicActiveTheme:
    def test_returns_currently_active_no_auth(self, admin_h, themes):
        # ensure Crimson Pulse is the active one for deterministic assertion
        crimson = next(t for t in themes if t["name"] == "Crimson Pulse")
        requests.post(f"{BASE}/api/wxm/themes/{crimson['id']}/activate", headers=admin_h, timeout=20)

        r = requests.get(f"{BASE}/api/public/wxm/active-theme", timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body, "active-theme returned empty body but a theme is active"
        assert body.get("name") == "Crimson Pulse"
        assert body.get("primary_color") == "#EF4444"
        assert body.get("is_site_active") is True

    def test_no_mongodb_id_leak(self):
        r = requests.get(f"{BASE}/api/public/wxm/active-theme", timeout=20)
        assert "_id" not in r.json()
