"""
Iter59 tests — WeasyPrint base_url fix restores logo in backend PDFs.

Fix applied by main agent:
  - hr_letters_module.py:335 and contracts_module.py:721 now pass
    `base_url = os.environ.get('PUBLIC_FRONTEND_URL') or REACT_APP_BACKEND_URL`
    to `weasyprint.HTML(...)`, allowing relative `/projexino-logo.png` paths
    to resolve to the same-origin static asset.

Verifies:
  1) Contract PDF (existing) restored: size >= 60 KB, >= 2 /Image refs,
     canonical body text still present.
  2) HR letter PDF (existing) restored: size >= 60 KB, >= 4 /Image refs,
     canonical body text still present.
  3) NEW HR letter (freshly created) gets the logo too: size >= 40 KB,
     >= 1 /Image ref. Cleanup after.
  4) ENV — PUBLIC_FRONTEND_URL present in backend .env.
  5) Singleton still `/projexino-logo.png` (iter58 migration preserved).
"""

import io
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
CONTRACT_ID = "d11920aac36d4d4abe6586d8644bc606"
HR_LETTER_ID = "54033f4ea7804938b8f15418b6e5df33"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"


@pytest.fixture(scope="module")
def http():
    return requests.Session()


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


def _pdf_text(pdf_bytes):
    try:
        import pdfplumber
    except ImportError:
        return ""
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for p in pdf.pages:
            text_parts.append(p.extract_text() or "")
    return "\n".join(text_parts)


# ---------------------------------------------------------------------------
# ENV
# ---------------------------------------------------------------------------
class TestEnv:
    def test_public_frontend_url_in_backend_env(self):
        with open("/app/backend/.env", "r") as f:
            content = f.read()
        assert "PUBLIC_FRONTEND_URL=" in content, ".env missing PUBLIC_FRONTEND_URL"
        # Should be an https URL
        for line in content.splitlines():
            if line.startswith("PUBLIC_FRONTEND_URL="):
                v = line.split("=", 1)[1].strip().strip('"').strip("'")
                assert v.startswith("http"), f"invalid PUBLIC_FRONTEND_URL={v!r}"


# ---------------------------------------------------------------------------
# DB singleton preserved
# ---------------------------------------------------------------------------
class TestSingletonPreserved:
    def test_logo_url_is_local_path(self, http, auth_headers):
        r = http.get(
            f"{BASE_URL}/api/hr/letters/company-profile",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("logo_url") == "/projexino-logo.png"


# ---------------------------------------------------------------------------
# Contract PDF — logo restored
# ---------------------------------------------------------------------------
class TestContractPdfLogoRestored:
    def test_contract_pdf_size_and_images(self, http, auth_headers):
        r = http.get(
            f"{BASE_URL}/api/contracts/{CONTRACT_ID}/pdf",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        size = len(r.content)
        img_count = r.content.count(b"/Image")
        assert size >= 60 * 1024, f"expected >=60KB after fix, got {size} B"
        assert img_count >= 2, f"expected >=2 /Image refs, got {img_count}"

    def test_contract_pdf_text(self, http, auth_headers):
        r = http.get(
            f"{BASE_URL}/api/contracts/{CONTRACT_ID}/pdf",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200
        text = _pdf_text(r.content)
        for needle in [
            "Projexino Solutions Pvt Ltd",
            "PJX-2026",
            "Enterprise Q3 2026",
            "Contract Value",
            "§ 1",
            "§ 2",
        ]:
            assert needle in text, f"missing {needle!r} in contract PDF text"


# ---------------------------------------------------------------------------
# HR letter PDF — logo restored
# ---------------------------------------------------------------------------
class TestHrLetterPdfLogoRestored:
    def test_hr_letter_pdf_size_and_images(self, http, auth_headers):
        r = http.get(
            f"{BASE_URL}/api/hr/letters/{HR_LETTER_ID}/pdf",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"
        size = len(r.content)
        img_count = r.content.count(b"/Image")
        assert size >= 60 * 1024, f"expected >=60KB after fix, got {size} B"
        assert img_count >= 4, f"expected >=4 /Image refs, got {img_count}"

    def test_hr_letter_pdf_text(self, http, auth_headers):
        r = http.get(
            f"{BASE_URL}/api/hr/letters/{HR_LETTER_ID}/pdf",
            headers=auth_headers,
            timeout=60,
        )
        assert r.status_code == 200
        text = _pdf_text(r.content)
        for needle in ["Projexino Solutions Pvt Ltd", "Anita Sharma", "Offer Letter"]:
            assert needle in text, f"missing {needle!r} in HR letter PDF text"


# ---------------------------------------------------------------------------
# NEW HR letter — logo present too
# ---------------------------------------------------------------------------
class TestNewHrLetterHasLogo:
    def test_create_patch_and_pdf_have_logo(self, http, auth_headers):
        # Create fresh offer letter
        payload = {
            "template": "offer_letter",
            "employee_name": "Iter59 Test",
        }
        r = http.post(
            f"{BASE_URL}/api/hr/letters",
            json=payload,
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code in (200, 201), f"create failed {r.status_code} {r.text[:200]}"
        letter = r.json()
        lid = letter.get("id") or letter.get("_id") or letter.get("letter_id")
        assert lid, f"no id in create response: {letter}"

        try:
            # Patch body
            r2 = http.patch(
                f"{BASE_URL}/api/hr/letters/{lid}",
                json={"body_html": "<p>Test body</p>"},
                headers=auth_headers,
                timeout=30,
            )
            assert r2.status_code == 200, f"patch failed {r2.status_code} {r2.text[:200]}"

            # Fetch PDF
            r3 = http.get(
                f"{BASE_URL}/api/hr/letters/{lid}/pdf",
                headers=auth_headers,
                timeout=60,
            )
            assert r3.status_code == 200
            assert r3.content[:5] == b"%PDF-"
            size = len(r3.content)
            img_count = r3.content.count(b"/Image")
            assert size >= 40 * 1024, f"new letter PDF too small: {size} B"
            assert img_count >= 1, f"new letter PDF missing logo: {img_count} /Image refs"
        finally:
            # Cleanup
            http.delete(
                f"{BASE_URL}/api/hr/letters/{lid}",
                headers=auth_headers,
                timeout=30,
            )
