"""
Iter60 tests — Complete CDN migration to same-origin self-hosted assets.

Verifies:
  1) Backend Python source has ZERO references to customer-assets.emergentagent.com
     (excluding intentional test assertions).
  2) Frontend HTML at "/" and key routes have ZERO CDN references.
  3) index.html og/twitter/JSON-LD point to /projexino-logo.png (not CDN).
  4) Bundle JS has AT MOST 1 CDN reference (webSafeLogo defensive rewrite).
  5) email_module.PROJEXINO_BRAND['logo_url'] is an absolute URL, points to
     /projexino-logo.png and does NOT contain the CDN.
  6) finance._projexino_logo_url() and xino_ai._projexino_logo_url() helpers
     return absolute URLs ending with /projexino-logo.png (no CDN).
  7) The resolved logo URL is reachable and returns a >=20KB PNG.
  8) Finance invoice PDF renders with logo (>=1 /Image ref, >=20KB, %PDF).
  9) Contract PDF still >=60KB & >=2 /Image refs.
 10) HR letter PDF still >=60KB & >=4 /Image refs.
 11) Static assets (favicon, icons, manifest, logo) all serve 200.
"""

import os
import re
import subprocess

import pytest
import requests

# ── setup ──────────────────────────────────────────────────────────────
# Ensure env loaded before importing backend modules
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
PUB_URL = os.environ.get("PUBLIC_FRONTEND_URL", "").rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"

CONTRACT_ID = "d11920aac36d4d4abe6586d8644bc606"
HR_LETTER_ID = "54033f4ea7804938b8f15418b6e5df33"

CDN_STRING = "customer-assets.emergentagent.com"


@pytest.fixture(scope="module")
def http():
    s = requests.Session()
    s.headers.update({"User-Agent": "iter60-tests"})
    return s


@pytest.fixture(scope="module")
def token(http):
    r = http.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASS},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ── 1. Backend source grep ──────────────────────────────────────────────
class TestBackendSourceNoCdn:
    def test_backend_python_zero_cdn_refs_excluding_tests(self):
        out = subprocess.check_output(
            [
                "grep", "-rn", CDN_STRING,
                "/app/backend",
                "--include=*.py",
                "--exclude-dir=__pycache__",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip().splitlines() if _grep_matches("/app/backend") else []
        # Filter out intentional test-file assertions
        non_test = [ln for ln in out if "/tests/" not in ln]
        assert non_test == [], f"unexpected CDN refs in backend: {non_test}"


def _grep_matches(root):
    r = subprocess.run(
        ["grep", "-rn", CDN_STRING, root, "--include=*.py"],
        capture_output=True, text=True,
    )
    return r.returncode == 0 and r.stdout.strip() != ""


# ── 2. Frontend HTML endpoints ──────────────────────────────────────────
class TestFrontendHtmlNoCdn:
    @pytest.mark.parametrize("path", ["/", "/login", "/blog", "/about", "/contact", "/services"])
    def test_route_has_no_cdn_refs(self, http, path):
        r = http.get(f"{BASE_URL}{path}", timeout=30, params={"nocache": "iter60"})
        assert r.status_code == 200, f"GET {path} => {r.status_code}"
        assert CDN_STRING not in r.text, f"{path} contains CDN ref"

    def test_index_html_og_image_local(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        assert r.status_code == 200
        m = re.search(
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r.text, flags=re.I,
        )
        assert m and "/projexino-logo.png" in m.group(1)
        assert CDN_STRING not in m.group(1)

    def test_index_html_twitter_image_local(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        m = re.search(
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r.text, flags=re.I,
        )
        assert m and "/projexino-logo.png" in m.group(1)
        assert CDN_STRING not in m.group(1)

    def test_index_html_jsonld_logo_local(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        # Naive extract of first JSON-LD script
        m = re.search(
            r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
            r.text, flags=re.I | re.S,
        )
        assert m
        payload = m.group(1)
        assert "/projexino-logo.png" in payload
        assert CDN_STRING not in payload

    def test_no_dns_prefetch_for_cdn(self, http):
        r = http.get(f"{BASE_URL}/", timeout=30)
        assert 'href="https://customer-assets.emergentagent.com"' not in r.text
        assert "customer-assets.emergentagent.com" not in r.text


# ── 3. Frontend JS bundle ──────────────────────────────────────────────
class TestFrontendBundleNoCdn:
    def test_bundle_has_at_most_one_cdn_ref(self, http):
        # Find all js chunks in index.html
        r = http.get(f"{BASE_URL}/", timeout=30)
        js_paths = sorted(set(re.findall(r'/static/js/[a-zA-Z0-9._-]+\.js', r.text)))
        assert js_paths, "no JS chunks found in index.html"
        total_cdn = 0
        for p in js_paths:
            b = http.get(f"{BASE_URL}{p}", timeout=60)
            assert b.status_code == 200
            total_cdn += b.text.count(CDN_STRING)
        assert total_cdn <= 1, f"bundle CDN refs = {total_cdn} (expected <=1 defensive)"


# ── 4. email_module ────────────────────────────────────────────────────
class TestEmailModuleLogo:
    def test_logo_url_absolute_and_local(self):
        import email_module
        v = email_module.PROJEXINO_BRAND["logo_url"]
        assert v.startswith(("http://", "https://")), f"not absolute: {v}"
        assert "/projexino-logo.png" in v, f"wrong path: {v}"
        assert CDN_STRING not in v, f"CDN ref present: {v}"


# ── 5. finance / xino_ai helpers ────────────────────────────────────────
class TestBackendLogoHelpers:
    def test_finance_helper(self):
        import finance
        u = finance._projexino_logo_url()
        assert u.startswith(("http://", "https://"))
        assert u.endswith("/projexino-logo.png")
        assert CDN_STRING not in u
        if PUB_URL:
            assert u.startswith(PUB_URL) or u.startswith(BASE_URL)

    def test_xino_ai_helper(self):
        # Cannot import xino_ai top-level without event loop; parse the source.
        with open("/app/backend/xino_ai.py", "r") as f:
            src = f.read()
        assert "def _projexino_logo_url" in src, "helper missing"
        assert "/projexino-logo.png" in src, "helper does not reference /projexino-logo.png"
        # No CDN literal anywhere in module
        assert CDN_STRING not in src, "CDN string present in xino_ai.py"

    def test_extensions_has_no_cdn(self):
        with open("/app/backend/extensions.py", "r") as f:
            src = f.read()
        assert CDN_STRING not in src
        assert "/projexino-logo.png" in src


# ── 6. Static assets reachable ─────────────────────────────────────────
class TestStaticAssetsReachable:
    @pytest.mark.parametrize(
        "path,min_size,content_type_substr",
        [
            ("/projexino-logo.png", 20 * 1024, "image/png"),
            ("/projexino-icon-192.png", 5 * 1024, "image/png"),
            ("/projexino-icon-512.png", 20 * 1024, "image/png"),
            ("/projexino-favicon-32.png", 100, "image/png"),
            ("/manifest.json", 100, "application/json"),
        ],
    )
    def test_asset_serves(self, http, path, min_size, content_type_substr):
        r = http.get(f"{BASE_URL}{path}", timeout=30)
        assert r.status_code == 200, f"{path} => {r.status_code}"
        assert content_type_substr in r.headers.get("content-type", "").lower()
        assert len(r.content) >= min_size, f"{path} size {len(r.content)} < {min_size}"


# ── 7. Finance invoice PDF ─────────────────────────────────────────────
class TestFinanceInvoicePdf:
    def test_first_invoice_pdf_has_logo(self, http, auth_headers):
        lst = http.get(f"{BASE_URL}/api/finance/invoices", headers=auth_headers, timeout=30)
        assert lst.status_code == 200
        items = lst.json() if isinstance(lst.json(), list) else lst.json().get("items") or lst.json().get("invoices") or []
        if not items:
            pytest.skip("no invoices to test")
        inv_id = items[0].get("id") or items[0].get("_id")
        assert inv_id
        r = http.get(f"{BASE_URL}/api/finance/invoices/{inv_id}/pdf",
                     headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-", "not a PDF"
        assert len(r.content) >= 20 * 1024, f"invoice PDF too small: {len(r.content)}"
        assert r.content.count(b"/Image") >= 1, "no logo image in invoice PDF"


# ── 8. Contract & HR letter PDF regression ─────────────────────────────
class TestContractAndHrLetterPdfRegression:
    def test_contract_pdf_size_and_images(self, http, auth_headers):
        r = http.get(f"{BASE_URL}/api/contracts/{CONTRACT_ID}/pdf",
                     headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) >= 60 * 1024
        assert r.content.count(b"/Image") >= 2

    def test_hr_letter_pdf_size_and_images(self, http, auth_headers):
        r = http.get(f"{BASE_URL}/api/hr/letters/{HR_LETTER_ID}/pdf",
                     headers=auth_headers, timeout=60)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        assert len(r.content) >= 60 * 1024
        assert r.content.count(b"/Image") >= 4


# ── 9. HR letters singleton preserved ──────────────────────────────────
class TestHrLettersSingleton:
    def test_singleton_still_local(self, http, auth_headers):
        r = http.get(f"{BASE_URL}/api/hr/letters/company-profile",
                     headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json().get("logo_url") == "/projexino-logo.png"
