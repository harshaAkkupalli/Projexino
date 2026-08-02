"""
Iter 54 — HR Letters Company Profile (Letterhead) tests
Covers:
  - GET/PUT /api/hr/letters/company-profile bootstrap + persistence
  - PDF reflects persisted profile values (verified via pdfplumber text extraction)
  - Non-privileged (intern) role rejected with 403
  - Cleanup: profile reset to defaults so app doesn't leak TestCo state
"""
import os
import io
import base64
import pytest
import requests
import pdfplumber

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PASSWORD = "Intern@2026"

DEFAULT_LOGO_URL = "/projexino-logo.png"

TEST_PROFILE = {
    "company_name": "TestCo Global Pvt Ltd",
    "tagline": "Building tomorrow",
    "address_line1": "99 Test Street",
    "address_line2": "",
    "city": "Chennai",
    "state": "TN",
    "pincode": "600001",
    "country": "India",
    "email": "ops@testco.io",
    "phone": "+91 44 9999 0000",
    "website": "www.testco.io",
    "cin": "U72900TN2020PTC999999",
    "gstin": "33TESTX1234A1Z5",
    "footer_note": "Test disclaimer.",
}

DEFAULT_PROFILE_RESET = {
    "logo_url": DEFAULT_LOGO_URL,
    "company_name": "Projexino Solutions Pvt Ltd",
    "tagline": "",
    "address_line1": "",
    "address_line2": "",
    "city": "",
    "state": "",
    "pincode": "",
    "country": "India",
    "email": "",
    "phone": "",
    "website": "",
    "cin": "",
    "gstin": "",
    "footer_note": "Digital signatures affixed above are legally binding under the Information Technology Act, 2000.",
}


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def admin_headers():
    tok = _login(ADMIN_EMAIL, ADMIN_PASSWORD)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def intern_headers():
    try:
        tok = _login(INTERN_EMAIL, INTERN_PASSWORD)
    except AssertionError:
        pytest.skip("intern account unavailable")
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def letter_id(admin_headers):
    payload = {
        "template": "offer_letter",
        "employee_name": "TEST_Iter54 Profile Candidate",
        "employee_email": "iter54@example.com",
        "position": "SDE II",
        "department": "Engineering",
        "ctc": "22 LPA",
        "joining_date": "2026-02-01",
    }
    r = requests.post(f"{BASE_URL}/api/hr/letters", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, r.text[:200]
    lid = r.json()["id"]
    # Set some body_html so the PDF has content
    body = "<p>Dear Iter54,</p><p>We are pleased to offer you SDE II.</p>"
    requests.patch(f"{BASE_URL}/api/hr/letters/{lid}",
                   json={"body_html": body}, headers=admin_headers, timeout=15)
    yield lid
    requests.delete(f"{BASE_URL}/api/hr/letters/{lid}", headers=admin_headers, timeout=15)


class TestCompanyProfile:
    """BUG FIX #1: company profile persistence"""

    def test_get_profile_returns_singleton(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/hr/letters/company-profile", headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        assert d.get("id") == "singleton"
        # All expected fields present
        for k in ["logo_url", "company_name", "tagline", "address_line1", "address_line2",
                  "city", "state", "pincode", "country", "email", "phone", "website",
                  "cin", "gstin", "footer_note"]:
            assert k in d, f"missing field {k}"

    def test_put_profile_persists(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/hr/letters/company-profile",
                         json=TEST_PROFILE, headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        for k, v in TEST_PROFILE.items():
            assert d.get(k) == v, f"field {k} not persisted: got {d.get(k)!r}"
        # Re-GET
        r2 = requests.get(f"{BASE_URL}/api/hr/letters/company-profile", headers=admin_headers, timeout=15)
        d2 = r2.json()
        for k, v in TEST_PROFILE.items():
            assert d2.get(k) == v, f"field {k} not reloaded: got {d2.get(k)!r}"

    def test_intern_put_forbidden(self, intern_headers):
        r = requests.put(f"{BASE_URL}/api/hr/letters/company-profile",
                         json={"company_name": "Hacked"}, headers=intern_headers, timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text[:200]}"

    def test_pdf_reflects_profile(self, admin_headers, letter_id):
        """BUG FIX #1b: PDF renders with persisted profile fields, no hardcoded placeholders."""
        # Make sure profile is still TEST_PROFILE (test order dep — put again to be safe)
        requests.put(f"{BASE_URL}/api/hr/letters/company-profile",
                     json=TEST_PROFILE, headers=admin_headers, timeout=15)

        r = requests.get(f"{BASE_URL}/api/hr/letters/{letter_id}/pdf", headers=admin_headers, timeout=90)
        assert r.status_code == 200
        assert r.content[:8].startswith(b"%PDF-"), f"not a pdf: {r.content[:16]!r}"

        with pdfplumber.open(io.BytesIO(r.content)) as pdf:
            text = "\n".join((p.extract_text() or "") for p in pdf.pages)

        expected = [
            "TestCo Global Pvt Ltd",
            "ops@testco.io",
            "+91 44 9999 0000",
            "www.testco.io",
            "Chennai",
            "TN",
            "99 Test Street",
            "U72900TN2020PTC999999",
            "33TESTX1234A1Z5",
            "Test disclaimer.",
        ]
        missing = [e for e in expected if e not in text]
        assert not missing, f"missing in PDF text: {missing}\n---TEXT---\n{text[:1500]}"

        # Old placeholders must be gone
        assert "Sattva Global City" not in text, "hardcoded placeholder leaked into PDF"
        assert "hello@projexino.com" not in text, "hardcoded placeholder leaked into PDF"


class TestRegression:
    """Basic regression on core HR letter flows after profile change."""

    def test_list_letters_still_works(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/hr/letters", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json().get("items"), list)

    def test_sign_token_flow(self, admin_headers, letter_id):
        # Get letter to grab block id
        r = requests.get(f"{BASE_URL}/api/hr/letters/{letter_id}", headers=admin_headers, timeout=15)
        blocks = r.json()["signature_blocks"]
        bid = blocks[0]["id"]
        tk = requests.post(f"{BASE_URL}/api/hr/letters/{letter_id}/sign-token",
                           json={"block_id": bid, "signer_name": "Iter54 Signer"},
                           headers=admin_headers, timeout=15).json()
        assert tk.get("token")
        # Public GET
        r2 = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}", timeout=15)
        assert r2.status_code == 200
        # Public POST
        png_1x1 = "data:image/png;base64," + base64.b64encode(
            bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
        ).decode()
        r3 = requests.post(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}",
                           json={"signature_data_url": png_1x1}, timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True


@pytest.fixture(scope="module", autouse=True)
def _cleanup_profile(admin_headers):
    """After all tests in this module, reset the company profile back to defaults
    so the running app does not show 'TestCo' state."""
    yield
    try:
        requests.put(f"{BASE_URL}/api/hr/letters/company-profile",
                     json=DEFAULT_PROFILE_RESET, headers=admin_headers, timeout=15)
    except Exception as e:
        print(f"cleanup profile reset failed: {e}")
