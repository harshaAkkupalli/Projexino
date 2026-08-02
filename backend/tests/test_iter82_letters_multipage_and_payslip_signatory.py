"""
Iteration 82 backend tests:
- HR Letters multipage placement: stamp signature on page 2 of a 3+ page PDF,
  and text-only block on page 1; also verify clamping (page=99 -> last page)
  and hide_placed=true returns base PDF without stamps.
- Payslip signatory config: PUT /api/hr/payslip-config/signatory (priv only, intern 403).
  GET /api/hr/payslip-config returns signatory. Payslip PDF has no
  'Employee Signature', contains signatory name+designation and at least 2 images.

Cleanup: deletes letters we create. Restores signatory to Priya Sharma at end.
"""
import base64
import io
import os
import time

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PW = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PW = "Intern@2026"

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SIG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"

_created_letters = []


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN_EMAIL, ADMIN_PW)}"}


@pytest.fixture(scope="module")
def intern_h():
    return {"Authorization": f"Bearer {_login(INTERN_EMAIL, INTERN_PW)}"}


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_h):
    yield
    # Cleanup letters
    for lid in _created_letters:
        try:
            requests.delete(f"{API}/hr/letters/{lid}", headers=admin_h, timeout=20)
        except Exception:
            pass
    # Restore signatory to Priya Sharma
    try:
        requests.put(
            f"{API}/hr/payslip-config/signatory",
            json={
                "name": "Priya Sharma",
                "designation": "HR Manager",
                "signature_data_url": SIG_DATA_URL,
            },
            headers=admin_h,
            timeout=30,
        )
    except Exception:
        pass


def _pdf_pages(pdf_bytes):
    import pdfplumber
    pages = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pg in pdf.pages:
            pages.append({"text": pg.extract_text() or "", "images": list(pg.images or [])})
    return pages


# ---------- LETTERS MULTIPAGE ----------
class TestLettersMultiPage:
    def test_multipage_stamp_page2_and_page1_and_clamp(self, admin_h):
        # Create letter
        r = requests.post(
            f"{API}/hr/letters",
            json={"template": "offer_letter", "employee_name": "TEST_Iter82 Multi"},
            headers=admin_h, timeout=30,
        )
        assert r.status_code == 200, r.text
        letter = r.json()
        lid = letter["id"]
        _created_letters.append(lid)

        # Long body so PDF has 3+ pages
        para = "<p>This is a long paragraph used to force multi-page rendering for iter82 tests. " \
               "It repeats a bit to fill up the page across many lines and force pagination.</p>"
        long_body = "<h2>Iter82 Multipage Body</h2>" + (para * 150)

        # Get existing blocks (should have at least 2 default blocks for offer_letter)
        blocks = letter.get("signature_blocks") or []
        assert len(blocks) >= 2, f"expected 2+ default signature blocks, got {len(blocks)}"

        # Build updated blocks:
        # block[0] -> image on page 2 at x=20 y=60
        # block[1] -> text-only (no image) on page 1 at x=55 y=30
        # block[2] (if exists) -> page=99 to test clamping
        updated_blocks = []
        for i, b in enumerate(blocks):
            nb = dict(b)
            if i == 0:
                nb.update({"signature_data_url": SIG_DATA_URL, "x": 20.0, "y": 60.0, "page": 2,
                           "name": "TEST_Signer_P2", "role": "Manager"})
            elif i == 1:
                nb.update({"signature_data_url": "", "x": 55.0, "y": 30.0, "page": 1,
                           "name": "TEST_Signer_P1", "role": "HR"})
            else:
                nb.update({"signature_data_url": SIG_DATA_URL, "x": 30.0, "y": 40.0, "page": 99,
                           "name": "TEST_Signer_Clamp", "role": "Clamp"})
            updated_blocks.append(nb)

        r2 = requests.patch(
            f"{API}/hr/letters/{lid}",
            json={"body_html": long_body, "signature_blocks": updated_blocks},
            headers=admin_h, timeout=30,
        )
        assert r2.status_code == 200, r2.text

        # Fetch stamped PDF
        r3 = requests.get(f"{API}/hr/letters/{lid}/pdf", headers=admin_h, timeout=90)
        assert r3.status_code == 200, r3.text
        assert r3.content[:4] == b"%PDF"
        pages = _pdf_pages(r3.content)
        assert len(pages) >= 3, f"expected 3+ pages, got {len(pages)}"

        # Page 1 must contain block[1]'s name text
        assert "TEST_Signer_P1" in pages[0]["text"], f"P1 text missing name; got: {pages[0]['text'][:400]}"

        # Page 2 must contain an image (signature) and block[0]'s name text
        assert len(pages[1]["images"]) >= 1, "Page 2 has no images (signature not stamped)"
        assert "TEST_Signer_P2" in pages[1]["text"], f"P2 text missing name; got: {pages[1]['text'][:400]}"

        # Clamp test: if block[2] existed with page=99, it should appear on the last page (no 500)
        if len(blocks) >= 3:
            last = pages[-1]
            assert "TEST_Signer_Clamp" in last["text"], "clamp block did not stamp on last page"

        # Fetch base PDF with hide_placed=true - no stamped names
        r4 = requests.get(f"{API}/hr/letters/{lid}/pdf?hide_placed=true", headers=admin_h, timeout=60)
        assert r4.status_code == 200
        full_text = "\n".join(p["text"] for p in _pdf_pages(r4.content))
        assert "TEST_Signer_P1" not in full_text
        assert "TEST_Signer_P2" not in full_text


# ---------- PAYSLIP SIGNATORY ----------
class TestPayslipSignatory:
    def test_intern_cannot_update_signatory(self, intern_h):
        r = requests.put(
            f"{API}/hr/payslip-config/signatory",
            json={"name": "Blocked", "designation": "Nope", "signature_data_url": SIG_DATA_URL},
            headers=intern_h, timeout=30,
        )
        assert r.status_code == 403, f"expected 403 for intern, got {r.status_code}: {r.text}"

    def test_admin_updates_signatory_and_get(self, admin_h):
        payload = {"name": "QA Signer", "designation": "HR Manager", "signature_data_url": SIG_DATA_URL}
        r = requests.put(f"{API}/hr/payslip-config/signatory", json=payload, headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{API}/hr/payslip-config", headers=admin_h, timeout=30)
        assert r2.status_code == 200
        cfg = r2.json()
        sig = cfg.get("signatory") or {}
        assert sig.get("name") == "QA Signer"
        assert sig.get("designation") == "HR Manager"
        assert (sig.get("signature_data_url") or "").startswith("data:image/")

    def test_existing_payslip_pdf_uses_signatory_no_employee_sig(self, admin_h):
        # Get any existing payslip
        r = requests.get(f"{API}/hr/payslips", headers=admin_h, timeout=30)
        assert r.status_code == 200
        items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
        if not items:
            pytest.skip("No existing payslips to test PDF against")
        slip = items[0]
        slip_id = slip.get("id") or slip.get("_id") or slip.get("slip_id")
        assert slip_id, f"no id in payslip: {slip}"

        rp = requests.get(f"{API}/hr/payslips/{slip_id}/pdf", headers=admin_h, timeout=60)
        assert rp.status_code == 200, rp.text
        assert rp.content[:4] == b"%PDF"
        pages = _pdf_pages(rp.content)
        text = "\n".join(p["text"] for p in pages)
        images = sum(len(p["images"]) for p in pages)

        assert "Employee Signature" not in text, "Employee Signature line still present in payslip PDF"
        assert "QA Signer" in text, f"signatory name not in PDF text; got: {text[:600]}"
        assert "HR Manager" in text, "signatory designation missing"
        assert images >= 2, f"expected >=2 images (logo + signature), got {images}"


# ---------- REGRESSION SPOT CHECKS ----------
class TestRegression:
    def test_sign_doc_pdf_pre_existing(self, admin_h):
        r = requests.get(f"{API}/hr/sign-docs", headers=admin_h, timeout=30)
        assert r.status_code == 200
        docs = r.json()
        target = next((d for d in docs if d.get("name") == "test"), None)
        if not target:
            pytest.skip("No pre-existing 'test' sign-doc found")
        r2 = requests.get(f"{API}/hr/sign-docs/{target['id']}/pdf", headers=admin_h, timeout=60)
        assert r2.status_code == 200
        assert r2.content[:4] == b"%PDF"

    def test_single_page_letter_still_works(self, admin_h):
        r = requests.post(
            f"{API}/hr/letters",
            json={"template": "offer_letter", "employee_name": "TEST_Iter82 SinglePage"},
            headers=admin_h, timeout=30,
        )
        assert r.status_code == 200
        lid = r.json()["id"]
        _created_letters.append(lid)
        # Short body -> should be 1 page. Place image on page 1.
        blocks = r.json().get("signature_blocks") or []
        if blocks:
            b0 = dict(blocks[0])
            b0.update({"signature_data_url": SIG_DATA_URL, "x": 15.0, "y": 70.0, "page": 1,
                       "name": "TEST_Single_P1"})
            requests.patch(f"{API}/hr/letters/{lid}",
                           json={"signature_blocks": [b0] + blocks[1:]},
                           headers=admin_h, timeout=30)
        r2 = requests.get(f"{API}/hr/letters/{lid}/pdf", headers=admin_h, timeout=60)
        assert r2.status_code == 200
        pages = _pdf_pages(r2.content)
        assert len(pages) >= 1
        if blocks:
            assert "TEST_Single_P1" in pages[0]["text"]
