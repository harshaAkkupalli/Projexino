"""Iter 80 — Future-dating on HR letters, invoices, receipts + inline signature placement persistence.

Covers:
- HR letter creation with future letter_date, PDF contains '15 September 2026'
- HR letter signature block placement persistence + signature image embedded in PDF
- Finance invoice with future issue_date -> issued_at starts with future date, PDF contains that date
- Finance receipt with future receipt_date -> approved_at reflects date, PDF contains date
- Cleanup: created letters/invoices/receipts are deleted
"""
import base64
import io
import os
import re
import time
from datetime import datetime, timezone

import pytest
import requests
from pypdf import PdfReader


def _pdf_text(b: bytes) -> str:
    try:
        r = PdfReader(io.BytesIO(b))
        return "\n".join((p.extract_text() or "") for p in r.pages)
    except Exception as e:
        return ""

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}

# 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SIG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"

FUTURE_LETTER_DATE = "2026-09-15"
FUTURE_LETTER_DATE_HUMAN = "15 September 2026"
FUTURE_INVOICE_DATE = "2026-11-20"
FUTURE_RECEIPT_DATE = "2026-12-05"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def created():
    return {"letters": [], "invoices": [], "receipts": []}


# ---------------------------------------------------------------------------
class TestHRLetterFutureDate:
    def test_create_letter_with_future_date(self, sess, created):
        r = sess.post(f"{BASE_URL}/api/hr/letters", json={
            "template": "offer_letter",
            "employee_name": "TEST_FutureDate Emp",
            "employee_email": "test_futuredate@example.com",
            "position": "QA Engineer",
            "department": "Engineering",
        }, timeout=15)
        assert r.status_code == 200, r.text[:300]
        letter = r.json()
        lid = letter["id"]
        created["letters"].append(lid)

        # Patch letter with future letter_date and simple body
        r2 = sess.patch(f"{BASE_URL}/api/hr/letters/{lid}", json={
            "letter_date": FUTURE_LETTER_DATE,
            "body_html": "<p>Dear Test,</p><p>This is a test offer letter body.</p>",
        }, timeout=15)
        assert r2.status_code == 200, r2.text[:300]
        assert r2.json().get("letter_date") == FUTURE_LETTER_DATE

        # GET verifies persistence
        r3 = sess.get(f"{BASE_URL}/api/hr/letters/{lid}", timeout=15)
        assert r3.status_code == 200
        assert r3.json().get("letter_date") == FUTURE_LETTER_DATE

    def test_pdf_contains_future_date(self, sess, created):
        lid = created["letters"][-1]
        r = sess.get(f"{BASE_URL}/api/hr/letters/{lid}/pdf", timeout=45)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        pdf_bytes = r.content
        assert len(pdf_bytes) > 1000

        # Extract PDF text via pypdf
        text = _pdf_text(pdf_bytes)
        assert FUTURE_LETTER_DATE_HUMAN in text, \
            f"Expected '{FUTURE_LETTER_DATE_HUMAN}' in PDF text (got first 300 chars: {text[:300]!r})"


# ---------------------------------------------------------------------------
class TestHRLetterSignaturePlacement:
    def test_add_signature_and_placement_persists(self, sess, created):
        lid = created["letters"][-1]
        r = sess.get(f"{BASE_URL}/api/hr/letters/{lid}", timeout=15)
        letter = r.json()
        blocks = list(letter.get("signature_blocks") or [])
        assert blocks, "Newly created letter should have default signature blocks"
        blocks[0] = {
            **blocks[0],
            "signature_data_url": SIG_DATA_URL,
            "x": 55.0,
            "y": 70.0,
            "page": 1,
        }
        target_id = blocks[0]["id"]

        r2 = sess.patch(f"{BASE_URL}/api/hr/letters/{lid}",
                        json={"signature_blocks": blocks}, timeout=15)
        assert r2.status_code == 200, r2.text[:300]

        # Reload and confirm x,y persist
        r3 = sess.get(f"{BASE_URL}/api/hr/letters/{lid}", timeout=15)
        assert r3.status_code == 200
        saved = next((b for b in r3.json()["signature_blocks"] if b["id"] == target_id), None)
        assert saved is not None
        assert saved.get("x") == 55.0 and saved.get("y") == 70.0
        assert saved.get("signature_data_url", "").startswith("data:image/")

    def test_pdf_generation_with_placed_signature(self, sess, created):
        lid = created["letters"][-1]
        r = sess.get(f"{BASE_URL}/api/hr/letters/{lid}/pdf", timeout=45)
        assert r.status_code == 200
        pdf = r.content
        # At minimum, PDF should still be well-formed and > default (signature adds image)
        assert pdf.startswith(b"%PDF")
        # Verify an image stream is present (weasyprint embeds images as /Image XObjects)
        assert b"/Image" in pdf or b"/XObject" in pdf, "Expected embedded image in PDF"


# ---------------------------------------------------------------------------
class TestFinanceInvoiceFutureDate:
    @pytest.fixture(scope="class")
    def finance_project(self, sess):
        # find an existing finance project
        r = sess.get(f"{BASE_URL}/api/finance/projects", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"finance/projects: {r.status_code}")
        projects = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not projects:
            pytest.skip("No finance projects available for invoice test")
        return projects[0]

    def test_create_invoice_future_date(self, sess, finance_project, created):
        fid = finance_project.get("id")
        r = sess.post(f"{BASE_URL}/api/finance/projects/{fid}/invoices", json={
            "amount": 1234.56,
            "issue_date": FUTURE_INVOICE_DATE,
            "due_date": "",
            "items": [{"desc": "Test line", "qty": 1, "rate": 1234.56}],
            "notes": "TEST_FUTURE_INVOICE",
            "tax_percent": 0,
            "discount": 0,
        }, timeout=45)
        assert r.status_code == 200, r.text[:300]
        inv = r.json()
        created["invoices"].append(inv["id"])
        assert inv.get("issued_at", "").startswith(FUTURE_INVOICE_DATE), \
            f"issued_at should start with {FUTURE_INVOICE_DATE}, got {inv.get('issued_at')}"

        # GET verifies persistence
        r2 = sess.get(f"{BASE_URL}/api/finance/invoices/{inv['id']}", timeout=15)
        assert r2.status_code == 200
        assert r2.json().get("issued_at", "").startswith(FUTURE_INVOICE_DATE)

    def test_invoice_pdf_shows_future_date(self, sess, created):
        inv_id = created["invoices"][-1]
        # Try common pdf endpoint patterns
        r = sess.get(f"{BASE_URL}/api/finance/invoices/{inv_id}/pdf", timeout=45)
        if r.status_code != 200:
            pytest.skip(f"invoice pdf endpoint not available: {r.status_code}")
        pdf = r.content
        assert pdf.startswith(b"%PDF")
        text = _pdf_text(pdf)
        variants = [FUTURE_INVOICE_DATE, "20 November 2026", "Nov 20, 2026",
                    "20/11/2026", "20-11-2026"]
        assert any(v in text for v in variants), \
            f"Invoice PDF should contain 2026-11-20. Text head: {text[:400]!r}"


# ---------------------------------------------------------------------------
class TestFinanceReceiptFutureDate:
    @pytest.fixture(scope="class")
    def finance_project(self, sess):
        r = sess.get(f"{BASE_URL}/api/finance/projects", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"finance/projects: {r.status_code}")
        projects = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not projects:
            pytest.skip("No finance projects for receipt test")
        return projects[0]

    def test_create_receipt_future_date(self, sess, finance_project, created):
        fid = finance_project.get("id")
        r = sess.post(f"{BASE_URL}/api/finance/receipts", json={
            "finance_id": fid,
            "amount": 500.0,
            "method": "bank_transfer",
            "note": "TEST_FUTURE_RECEIPT",
            "receipt_date": FUTURE_RECEIPT_DATE,
        }, timeout=30)
        assert r.status_code == 200, r.text[:300]
        rec = r.json()
        created["receipts"].append(rec["id"])
        assert rec.get("approved_at", "").startswith(FUTURE_RECEIPT_DATE), \
            f"approved_at should start with {FUTURE_RECEIPT_DATE}, got {rec.get('approved_at')}"
        assert rec.get("created_at", "").startswith(FUTURE_RECEIPT_DATE)

    def test_receipt_pdf_shows_future_date(self, sess, created):
        rid = created["receipts"][-1]
        r = sess.get(f"{BASE_URL}/api/finance/receipts/{rid}/pdf", timeout=30)
        if r.status_code != 200:
            pytest.skip(f"receipt pdf endpoint: {r.status_code}")
        pdf = r.content
        assert pdf.startswith(b"%PDF")
        text = _pdf_text(pdf)
        variants = [FUTURE_RECEIPT_DATE, "05 December 2026", "Dec 5, 2026",
                    "5 December 2026", "05/12/2026", "5/12/2026"]
        assert any(v in text for v in variants), \
            f"Receipt PDF should contain 2026-12-05. Text head: {text[:400]!r}"


# ---------------------------------------------------------------------------
class TestSmokeRegression:
    def test_hr_letters_list(self, sess):
        r = sess.get(f"{BASE_URL}/api/hr/letters", timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Accept either list or {items: [...]} shape
        items = data if isinstance(data, list) else data.get("items", [])
        assert isinstance(items, list)

    def test_invoice_list(self, sess):
        r = sess.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        assert r.status_code == 200

    def test_receipt_list(self, sess):
        r = sess.get(f"{BASE_URL}/api/finance/receipts", timeout=15)
        assert r.status_code == 200


# ---------------------------------------------------------------------------
class TestCleanup:
    def test_cleanup_letters(self, sess, created):
        for lid in created["letters"]:
            r = sess.delete(f"{BASE_URL}/api/hr/letters/{lid}", timeout=15)
            assert r.status_code in (200, 204, 404)

    def test_cleanup_invoices(self, sess, created):
        for iid in created["invoices"]:
            # try delete endpoint (may 404 if not supported)
            r = sess.delete(f"{BASE_URL}/api/finance/invoices/{iid}", timeout=15)
            # accept anything; we log but do not fail
            print(f"delete invoice {iid} -> {r.status_code}")

    def test_cleanup_receipts(self, sess, created):
        for rid in created["receipts"]:
            r = sess.delete(f"{BASE_URL}/api/finance/receipts/{rid}", timeout=15)
            print(f"delete receipt {rid} -> {r.status_code}")
