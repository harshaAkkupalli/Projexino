"""
Iter57 tests — Self-hosted Projexino logo (Android TWA/WebView fix).

Verifies:
  1) Static PNG assets serve at same-origin with proper Content-Type + magic bytes + size.
  2) manifest.json valid JSON with icons pointing to same-origin PNGs (NOT CDN).
  3) index.html favicon + apple-touch-icon reference the new local assets.
  4) Backend PDF path (which still uses the CDN LOGO_URL DB default) is unaffected —
     GET /api/contracts/{cid}/pdf still returns %PDF-1.7 and > 30 KB.
"""

import json
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CONTRACT_ID = "d11920aac36d4d4abe6586d8644bc606"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"User-Agent": "iter57-tests"})
    return s


@pytest.fixture(scope="module")
def admin_token(http):
    r = http.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
    )
    if r.status_code != 200:
        pytest.skip(f"Admin login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    return data.get("access_token") or data.get("token") or data.get("token_value")


# ---------------------------------------------------------------------------
# Static assets
# ---------------------------------------------------------------------------
class TestStaticAssets:
    """Self-hosted logo assets are reachable from the public URL."""

    def _fetch(self, http, path):
        return http.get(f"{BASE_URL}{path}", timeout=30)

    def test_logo_png_serves_ok(self, http):
        r = self._fetch(http, "/projexino-logo.png")
        assert r.status_code == 200, f"logo GET {r.status_code}"
        assert "image/png" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"\x89PNG", "logo not a PNG"
        assert len(r.content) >= 20 * 1024, f"logo too small: {len(r.content)}"

    def test_icon_192_serves_ok(self, http):
        r = self._fetch(http, "/projexino-icon-192.png")
        assert r.status_code == 200
        assert "image/png" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"\x89PNG"
        assert len(r.content) >= 5 * 1024

    def test_icon_512_serves_ok(self, http):
        r = self._fetch(http, "/projexino-icon-512.png")
        assert r.status_code == 200
        assert "image/png" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"\x89PNG"
        assert len(r.content) >= 20 * 1024

    def test_favicon_serves_ok(self, http):
        r = self._fetch(http, "/projexino-favicon-32.png")
        assert r.status_code == 200
        assert "image/png" in r.headers.get("content-type", "").lower()
        assert r.content[:4] == b"\x89PNG"

    def test_manifest_valid_and_points_to_local_icons(self, http):
        r = self._fetch(http, "/manifest.json")
        assert r.status_code == 200
        data = r.json()
        icons = data.get("icons") or []
        assert len(icons) >= 2
        srcs = {i.get("src"): i.get("sizes") for i in icons}
        assert "/projexino-icon-192.png" in srcs
        assert "/projexino-icon-512.png" in srcs
        assert srcs["/projexino-icon-192.png"] == "192x192"
        assert srcs["/projexino-icon-512.png"] == "512x512"
        # No CDN reference in icons
        for i in icons:
            assert "customer-assets.emergentagent.com" not in i.get("src", "")


# ---------------------------------------------------------------------------
# index.html
# ---------------------------------------------------------------------------
class TestIndexHtml:
    def test_favicon_and_apple_touch_icon_are_local(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        assert r.status_code == 200
        html = r.text
        # icon link -> /projexino-favicon-32.png
        m = re.search(
            r'<link[^>]+rel=["\']icon["\'][^>]+href=["\']([^"\']+)["\']',
            html,
            flags=re.I,
        )
        assert m, "no <link rel='icon'> found"
        assert m.group(1) == "/projexino-favicon-32.png", f"icon={m.group(1)}"
        # apple-touch-icon -> /projexino-icon-192.png
        m2 = re.search(
            r'<link[^>]+rel=["\']apple-touch-icon["\'][^>]+href=["\']([^"\']+)["\']',
            html,
            flags=re.I,
        )
        assert m2, "no <link rel='apple-touch-icon'> found"
        assert m2.group(1) == "/projexino-icon-192.png", f"apple={m2.group(1)}"

    def test_manifest_link_present(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        assert 'href="/manifest.json"' in r.text


# ---------------------------------------------------------------------------
# Backend PDF still works (unaffected by frontend-only fix)
# ---------------------------------------------------------------------------
class TestContractPdfUnaffected:
    def test_pdf_still_generates(self, http, admin_token):
        if not admin_token:
            pytest.skip("no admin token")
        r = http.get(
            f"{BASE_URL}/api/contracts/{CONTRACT_ID}/pdf",
            headers={"Authorization": f"Bearer {admin_token}"},
            timeout=60,
        )
        assert r.status_code == 200, f"pdf status {r.status_code} body={r.text[:200]}"
        assert r.content[:5] == b"%PDF-", "not a PDF"
        assert len(r.content) > 30 * 1024, f"pdf too small: {len(r.content)}"
