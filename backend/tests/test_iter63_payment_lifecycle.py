"""
Iteration 63 — Complete payment lifecycle: tracking, approve, receipts, ZIP, emails.

Covers:
  Backend
  - POST /api/public/invoice-pay/{token}/track           (no-auth: page_view / pay_click / bank_transfer_claimed)
                                                          → 400 unknown, 404 bad token
                                                          → invoice pay_view_count/pay_click_count/bank_claimed_at increment
  - GET  /api/finance/invoices/{id}/pay-events           (auth; newest first)
  - POST /api/finance/invoices/{id}/approve-payment      (admin) → receipt RCP-2026-NNNNN, invoice→paid,
                                                                  payment pushed to project, second call 400
  - GET  /api/finance/receipts?finance_id=X              (list)
  - GET  /api/finance/receipts/{rid}/pdf                 (valid PDF)
  - GET  /api/public/finance-receipt/{share_token}       (no-auth PDF, 404 bad token)
  - POST /api/finance/receipts/{rid}/whatsapp            (structured wa_text w/ Receipt No / Invoice Ref / Amount Paid)
  - POST /api/finance/documents/zip {invoice_ids, receipt_ids} (valid ZIP w/ invoices/ + receipts/ folders; 400 empty)
  - POST /api/finance/invoices/{id}/payment-email        (400 Gmail not connected — graceful)
  - POST /api/finance/receipts/{rid}/email               (400 Gmail not connected)
  - POST /api/finance/documents/zip-email                (400 Gmail not connected)
  - Regression: invoice PDF download still works
"""
import io
import os
import re
import time
import zipfile
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

# Demo Web Build finance project — safe for payment-push validation
FINANCE_PROJECT_ID = "57419353-a008-4582-af6e-c6511d28c126"

# Existing PAID invoice from iter62 — has a receipt for read-only tests
PAID_INVOICE_ID = "4cf4410c-77f5-4070-b3dc-5337460365c4"
PAID_RECEIPT_ID = "a37d883188124c51a59204ebe35d6a14"


# ── Fixtures ───────────────────────────────────────────────────────────────
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def fresh_invoice(admin_session):
    """Creates a fresh TEST_ invoice on Demo Web Build for approve-payment tests."""
    payload = {
        "amount": 111.11,
        "currency": "INR",
        "notes": "TEST_iter63_lifecycle",
    }
    r = admin_session.post(
        f"{BASE_URL}/api/finance/projects/{FINANCE_PROJECT_ID}/invoices",
        json=payload, timeout=15)
    assert r.status_code in (200, 201), f"invoice create failed: {r.status_code} {r.text}"
    inv = r.json()
    assert inv.get("id") and inv.get("share_token")
    return inv


# ── Track events on public pay page ────────────────────────────────────────
class TestPublicTrack:
    def test_page_view_pay_click_bank_claim(self, admin_session, fresh_invoice):
        tok = fresh_invoice["share_token"]
        inv_id = fresh_invoice["id"]
        # 3 events
        for ev in ("page_view", "pay_click", "bank_transfer_claimed"):
            r = requests.post(f"{BASE_URL}/api/public/invoice-pay/{tok}/track",
                              json={"event": ev, "method": "web"}, timeout=10)
            assert r.status_code == 200, f"track {ev}: {r.status_code} {r.text}"
            assert r.json().get("ok") is True

        # events listed newest-first via authed endpoint
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices/{inv_id}/pay-events", timeout=10)
        assert r.status_code == 200, r.text
        events = r.json()
        assert isinstance(events, list) and len(events) >= 3
        types = [e["event"] for e in events[:3]]
        # newest-first order: bank_transfer_claimed, pay_click, page_view
        assert types[0] == "bank_transfer_claimed"
        assert set(types) == {"page_view", "pay_click", "bank_transfer_claimed"}

        # counters on invoice
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices/{inv_id}", timeout=10)
        # There may not be a single-invoice GET, so fetch list & filter
        if r.status_code != 200:
            r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
            assert r.status_code == 200
            inv = next((x for x in r.json() if x["id"] == inv_id), None)
        else:
            inv = r.json()
        assert inv is not None
        assert (inv.get("pay_view_count") or 0) >= 1
        assert (inv.get("pay_click_count") or 0) >= 1
        assert inv.get("bank_claimed_at")

    def test_unknown_event_400(self, fresh_invoice):
        tok = fresh_invoice["share_token"]
        r = requests.post(f"{BASE_URL}/api/public/invoice-pay/{tok}/track",
                          json={"event": "nope"}, timeout=10)
        assert r.status_code == 400

    def test_bad_token_404(self):
        r = requests.post(f"{BASE_URL}/api/public/invoice-pay/BAD_TOKEN_XYZ/track",
                          json={"event": "page_view"}, timeout=10)
        assert r.status_code == 404


# ── Approve payment: receipt + payment-push + idempotency ─────────────────
class TestApprovePayment:
    def test_approve_generates_receipt_and_pushes_payment(self, admin_session, fresh_invoice):
        inv_id = fresh_invoice["id"]
        amount = float(fresh_invoice["amount"])

        # Baseline: fetch project remaining
        r = admin_session.get(f"{BASE_URL}/api/finance/projects", timeout=15)
        assert r.status_code == 200
        proj_before = next((p for p in r.json() if p["id"] == FINANCE_PROJECT_ID), None)
        assert proj_before is not None
        remaining_before = float(proj_before.get("remaining") or 0)

        # Approve
        r = admin_session.post(
            f"{BASE_URL}/api/finance/invoices/{inv_id}/approve-payment",
            json={"method": "bank_transfer", "note": "TEST_iter63 approval"},
            timeout=15)
        assert r.status_code == 200, r.text
        rec = r.json()
        # store on module for later tests
        TestApprovePayment.receipt = rec
        assert re.match(r"^RCP-2026-\d{5}$", rec.get("receipt_no", "")), rec
        assert rec.get("invoice_id") == inv_id
        assert float(rec.get("amount")) == amount
        assert rec.get("share_token")

        # Invoice flipped to paid with receipt_no
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        inv = next(x for x in r.json() if x["id"] == inv_id)
        assert inv["status"] == "paid"
        assert inv.get("receipt_no") == rec["receipt_no"]

        # Payment pushed to project → remaining decreased
        r = admin_session.get(f"{BASE_URL}/api/finance/projects", timeout=15)
        proj_after = next(p for p in r.json() if p["id"] == FINANCE_PROJECT_ID)
        remaining_after = float(proj_after.get("remaining") or 0)
        assert remaining_after < remaining_before, \
            f"remaining did not decrease: {remaining_before} -> {remaining_after}"
        # payments[] contains the new entry (has invoice_id)
        pays = proj_after.get("payments") or []
        assert any(p.get("invoice_id") == inv_id for p in pays), "payment not pushed"

    def test_double_approve_returns_400(self, admin_session, fresh_invoice):
        inv_id = fresh_invoice["id"]
        r = admin_session.post(
            f"{BASE_URL}/api/finance/invoices/{inv_id}/approve-payment",
            json={"method": "bank_transfer"}, timeout=10)
        assert r.status_code == 400, r.text

    def test_bad_invoice_404(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/finance/invoices/does-not-exist/approve-payment",
            json={"method": "bank_transfer"}, timeout=10)
        assert r.status_code == 404


# ── Receipts list / PDF / public / whatsapp ────────────────────────────────
class TestReceipts:
    def test_list_receipts(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/finance/receipts", timeout=15)
        assert r.status_code == 200, r.text
        arr = r.json()
        assert isinstance(arr, list) and len(arr) >= 1
        # at least our known paid receipt or the fresh one
        assert any(re.match(r"^RCP-2026-\d{5}$", x.get("receipt_no", "")) for x in arr)

    def test_receipt_pdf_download(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/finance/receipts/{PAID_RECEIPT_ID}/pdf", timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        body = r.content
        assert body[:4] == b"%PDF", body[:8]
        assert len(body) > 20_000, f"too small: {len(body)}"

    def test_public_receipt_pdf_no_auth(self, admin_session):
        # get share_token from list
        r = admin_session.get(f"{BASE_URL}/api/finance/receipts", timeout=10)
        rec = next((x for x in r.json() if x["id"] == PAID_RECEIPT_ID), None)
        assert rec, "known receipt missing"
        tok = rec["share_token"]
        # unauthenticated request
        r2 = requests.get(f"{BASE_URL}/api/public/finance-receipt/{tok}", timeout=20)
        assert r2.status_code == 200
        assert r2.headers.get("content-type", "").startswith("application/pdf")
        assert r2.content[:4] == b"%PDF"

    def test_bad_receipt_id_404(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/finance/receipts/nope-nope/pdf", timeout=10)
        assert r.status_code == 404
        r = requests.get(f"{BASE_URL}/api/public/finance-receipt/badtoken", timeout=10)
        assert r.status_code == 404

    def test_receipt_whatsapp_wa_text(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/finance/receipts/{PAID_RECEIPT_ID}/whatsapp",
                               timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        wa = data.get("wa_text", "")
        assert "Receipt No:" in wa
        assert "Invoice Ref:" in wa
        assert "Amount Paid:" in wa
        assert "/api/public/finance-receipt/" in wa or "/api/public/finance-receipt/" in data.get("download_url", "")


# ── Documents ZIP ─────────────────────────────────────────────────────────
class TestDocumentsZip:
    def test_zip_invoices_and_receipts(self, admin_session):
        # gather one invoice id + one receipt id
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        inv = next((x for x in r.json() if x.get("status") == "paid"), r.json()[0])
        r2 = admin_session.post(
            f"{BASE_URL}/api/finance/documents/zip",
            json={"invoice_ids": [inv["id"]], "receipt_ids": [PAID_RECEIPT_ID]},
            timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.headers.get("content-type") == "application/zip"
        buf = io.BytesIO(r2.content)
        zf = zipfile.ZipFile(buf)
        names = zf.namelist()
        assert any(n.startswith("invoices/") and n.endswith(".pdf") for n in names), names
        assert any(n.startswith("receipts/") and n.endswith(".pdf") for n in names), names

    def test_zip_empty_400(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/finance/documents/zip",
                               json={"invoice_ids": [], "receipt_ids": []},
                               timeout=10)
        assert r.status_code == 400

    def test_zip_invalid_ids_400(self, admin_session):
        # ids that don't exist → should raise 400 no docs built
        r = admin_session.post(f"{BASE_URL}/api/finance/documents/zip",
                               json={"invoice_ids": ["nope"], "receipt_ids": ["nada"]},
                               timeout=10)
        assert r.status_code == 400


# ── Email endpoints — expect graceful 400 (Gmail not connected) ───────────
class TestEmailEndpointsGraceful:
    def test_payment_email_400(self, admin_session, fresh_invoice):
        r = admin_session.post(
            f"{BASE_URL}/api/finance/invoices/{fresh_invoice['id']}/payment-email",
            json={"to_email_ids": []}, timeout=10)
        # Because Gmail is broken we expect 400. Anything else (e.g. 500) is a bug.
        assert r.status_code == 400, f"expected graceful 400, got {r.status_code}: {r.text[:300]}"

    def test_receipt_email_400(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/finance/receipts/{PAID_RECEIPT_ID}/email",
            json={"to_email": "somebody@example.com"}, timeout=10)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"

    def test_zip_email_400(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/finance/documents/zip-email",
            json={"to_email": "somebody@example.com",
                  "invoice_ids": [PAID_INVOICE_ID],
                  "receipt_ids": [PAID_RECEIPT_ID]},
            timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"


# ── Regression: invoice PDF & public pay page still work ──────────────────
class TestRegression:
    def test_invoice_pdf_still_works(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices/{PAID_INVOICE_ID}/pdf", timeout=20)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 20_000

    def test_public_pay_page_endpoint(self, admin_session):
        # Use the fresh invoice's share_token — it's already paid by TestApprovePayment,
        # but the endpoint should still return the summary (with status=paid).
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        invs = r.json()
        # find one that is unpaid & has share_token, else any with share_token
        cand = next((x for x in invs if x.get("share_token") and x.get("status") != "paid"), None) \
               or next((x for x in invs if x.get("share_token")), None)
        assert cand, "no invoice with share_token"
        r2 = requests.get(f"{BASE_URL}/api/public/invoice-pay/{cand['share_token']}", timeout=10)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert "bank" in data
        assert data.get("stripe_enabled") is True
