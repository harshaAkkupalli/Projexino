"""Iter 68 backend tests.

Covers:
1) Stripe endpoints removed → 404 for former stripe routes; kept endpoints work.
2) POST /api/finance/invoices/{id}/send with no include_pay_link field must not
   422/500 due to the model change. (Gmail OAuth failure is expected & accepted.)
3) Intern certificate + tasks work for HR / Admin on any intern (privileged
   scope fix).
4) HR Certificates CRUD + sign + PDF + role guard for intern.
"""
import base64
import io
import os
import re
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN = ("admin@projexino.com", "Projexino@2026")
HR = ("hr@projexino.com", "HR@2026")
INTERN = ("intern@projexino.com", "Intern@2026")


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response for {email}: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="module")
def hr_h():
    return {"Authorization": f"Bearer {_login(*HR)}"}


@pytest.fixture(scope="module")
def intern_h():
    return {"Authorization": f"Bearer {_login(*INTERN)}"}


# ============================================================
# 1) Stripe endpoints removed
# ============================================================
class TestStripeRemoved:
    def test_stripe_checkout_endpoint_removed(self, admin_h):
        r = requests.post(f"{BASE_URL}/api/finance/invoices/does-not-matter/stripe-checkout",
                          headers=admin_h, json={}, timeout=15)
        assert r.status_code == 404, f"stripe-checkout must be 404, got {r.status_code}"

    def test_stripe_webhook_removed(self):
        r = requests.post(f"{BASE_URL}/api/webhook/stripe", json={}, timeout=15)
        assert r.status_code == 404

    def test_stripe_status_removed(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/finance/invoices/x/stripe-status/y", headers=admin_h, timeout=15)
        assert r.status_code == 404

    def test_public_stripe_checkout_removed(self):
        r = requests.post(f"{BASE_URL}/api/public/invoice-pay/anytoken/checkout", json={}, timeout=15)
        assert r.status_code == 404

    def test_finance_activity_still_works(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/finance/activity", headers=admin_h, timeout=15)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_public_invoice_unknown_404(self):
        r = requests.get(f"{BASE_URL}/api/public/invoice/nonexistent-xyz-123", timeout=15)
        assert r.status_code == 404

    def test_public_invoice_pay_page_stripe_disabled(self, admin_h):
        # find some invoice with share_token; if none, endpoint 404s → still fine (returns 404 not stripe url)
        r = requests.get(f"{BASE_URL}/api/finance/invoices?limit=25", headers=admin_h, timeout=20)
        if r.status_code != 200:
            pytest.skip("finance invoices list not accessible")
        invoices = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        share_token = None
        for inv in invoices:
            if inv.get("share_token"):
                share_token = inv["share_token"]
                break
        if not share_token:
            pytest.skip("no invoice with share_token available")
        r2 = requests.get(f"{BASE_URL}/api/public/invoice-pay/{share_token}", timeout=15)
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("stripe_enabled") is False
        assert "bank" in body
        assert set(body["bank"].keys()) >= {"bank_name", "account_name", "account_number", "ifsc"}


# ============================================================
# 2) InvoiceSendIn model change — no include_pay_link field
# ============================================================
class TestInvoiceSendNoPayLink:
    def test_send_invoice_no_422(self, admin_h):
        # Grab any invoice id
        r = requests.get(f"{BASE_URL}/api/finance/invoices?limit=5", headers=admin_h, timeout=20)
        if r.status_code != 200:
            pytest.skip("cannot list invoices")
        invoices = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not invoices:
            pytest.skip("no invoices available")
        inv_id = invoices[0]["id"]

        # Send with clean payload — must not 422 for missing include_pay_link
        r2 = requests.post(
            f"{BASE_URL}/api/finance/invoices/{inv_id}/send",
            headers=admin_h,
            json={"to": ["nowhere@example.com"], "subject": "T", "body_html": "<p>x</p>"},
            timeout=30,
        )
        assert r2.status_code != 422, f"model validation error: {r2.text}"
        # Expected: Gmail OAuth failure returns 4xx/5xx from Gmail step, but not model validation
        # Also: sending include_pay_link should still not 422 (Pydantic accepts extras by default in this model? test explicitly)
        r3 = requests.post(
            f"{BASE_URL}/api/finance/invoices/{inv_id}/send",
            headers=admin_h,
            json={"to": ["x@example.com"], "subject": "T", "body_html": "<p>y</p>", "include_pay_link": True},
            timeout=30,
        )
        # Pydantic ignores unknown fields by default → not 422. Any 500 seen here is the
        # known Gmail RefreshError from iter67 (OAuth client deleted), not the model change.
        assert r3.status_code != 422, f"unexpected 422 for legacy include_pay_link field: {r3.text}"


# ============================================================
# 3) Intern certificate — privileged scope fix
# ============================================================
class TestInternCertificatePrivileged:
    def _fetch_first_intern_id(self, headers):
        r = requests.get(f"{BASE_URL}/api/interns", headers=headers, timeout=20)
        assert r.status_code == 200, r.text
        items = r.json()
        if not items:
            return None
        return items[0]["id"]

    def _ensure_intern_exists(self, admin_h):
        iid = self._fetch_first_intern_id(admin_h)
        if iid:
            return iid
        # create one
        payload = {
            "name": "TEST_iter68_intern",
            "email": f"test_iter68_{uuid.uuid4().hex[:6]}@example.com",
            "role": "SDE Intern",
            "start_date": "2026-01-01",
            "end_date": "2026-03-31",
        }
        r = requests.post(f"{BASE_URL}/api/interns", headers=admin_h, json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        return r.json()["id"]

    def test_hr_can_fetch_any_intern_certificate(self, admin_h, hr_h):
        iid = self._ensure_intern_exists(admin_h)
        r = requests.get(f"{BASE_URL}/api/interns/{iid}/certificate", headers=hr_h, timeout=30)
        assert r.status_code == 200, f"HR cert 404 regression: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 5000  # non-trivial PDF

    def test_admin_can_fetch_any_intern_certificate(self, admin_h):
        iid = self._ensure_intern_exists(admin_h)
        r = requests.get(f"{BASE_URL}/api/interns/{iid}/certificate", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_hr_can_fetch_any_intern_tasks(self, admin_h, hr_h):
        iid = self._ensure_intern_exists(admin_h)
        r = requests.get(f"{BASE_URL}/api/interns/{iid}/tasks", headers=hr_h, timeout=20)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ============================================================
# 4) HR Certificates CRUD + sign + PDF + role guard
# ============================================================
# 1x1 transparent PNG (base64) — valid data URL for sign endpoint
_PNG_1PX_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAA"
    "SUVORK5CYII="
)
_SIG_DATAURL = f"data:image/png;base64,{_PNG_1PX_B64}"


class TestHRCertificatesCRUD:
    created_ids = []

    def test_intern_forbidden_list(self, intern_h):
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=intern_h, timeout=15)
        assert r.status_code == 403

    def test_intern_forbidden_create(self, intern_h):
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=intern_h,
                          json={"cert_type": "internship", "recipient_name": "x", "content": "y"}, timeout=15)
        assert r.status_code == 403

    def test_create_validation_missing_name(self, hr_h):
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=hr_h,
                          json={"cert_type": "internship", "recipient_name": "", "content": "Body"}, timeout=15)
        assert r.status_code == 400

    def test_create_validation_missing_content(self, hr_h):
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=hr_h,
                          json={"cert_type": "internship", "recipient_name": "TEST_iter68 Rec", "content": ""}, timeout=15)
        assert r.status_code == 400

    def test_create_validation_bad_type(self, hr_h):
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=hr_h,
                          json={"cert_type": "gibberish", "recipient_name": "x", "content": "y"}, timeout=15)
        assert r.status_code == 400

    def test_full_flow_create_list_patch_sign_pdf_delete(self, hr_h):
        # CREATE
        payload = {
            "cert_type": "internship",
            "recipient_name": "TEST_iter68 Recipient",
            "designation": "SDE Intern",
            "department": "Engineering",
            "period_from": "2026-01-01",
            "period_to": "2026-03-31",
            "content": "This is to certify that TEST_iter68 Recipient has successfully completed the internship.",
            "signer_name": "HR Head",
            "signer_role": "Head of Human Resources",
        }
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=hr_h, json=payload, timeout=20)
        assert r.status_code == 200, r.text
        cert = r.json()
        cid = cert["id"]
        TestHRCertificatesCRUD.created_ids.append(cid)
        assert cert["signed"] is False
        assert cert["status"] == "draft"
        assert "signature_data_url" not in cert  # secret should be stripped

        # LIST
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=hr_h, timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert any(i["id"] == cid for i in items)
        found = next(i for i in items if i["id"] == cid)
        assert found["signed"] is False

        # PATCH
        r = requests.patch(f"{BASE_URL}/api/hr/certificates/{cid}", headers=hr_h,
                          json={"recipient_name": "TEST_iter68 Recipient Updated"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["recipient_name"] == "TEST_iter68 Recipient Updated"

        # PDF (draft)
        r = requests.get(f"{BASE_URL}/api/hr/certificates/{cid}/pdf", headers=hr_h, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        draft_size = len(r.content)
        assert draft_size > 30_000, f"draft PDF too small: {draft_size}"

        # SIGN — invalid payload → 400
        r_bad = requests.post(f"{BASE_URL}/api/hr/certificates/{cid}/sign", headers=hr_h,
                              json={"signature_data_url": "not-a-data-url"}, timeout=15)
        assert r_bad.status_code == 400

        # SIGN — valid payload
        r = requests.post(f"{BASE_URL}/api/hr/certificates/{cid}/sign", headers=hr_h,
                          json={"signature_data_url": _SIG_DATAURL, "signer_name": "Test Signer",
                                "signer_role": "HR Head"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

        # LIST shows signed
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=hr_h, timeout=15)
        found = next(i for i in r.json() if i["id"] == cid)
        assert found["signed"] is True

        # PDF (signed) should be larger due to embedded signature image
        r = requests.get(f"{BASE_URL}/api/hr/certificates/{cid}/pdf", headers=hr_h, timeout=30)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        signed_size = len(r.content)
        # Signature is 1px PNG — but the "DIGITALLY SIGNED" chip + issue-metadata add bytes.
        # Loose check: signed PDF should be at least as large as draft.
        assert signed_size >= draft_size - 200, f"signed pdf shrank a lot: draft={draft_size} signed={signed_size}"

        # DELETE signature → back to draft
        r = requests.delete(f"{BASE_URL}/api/hr/certificates/{cid}/signature", headers=hr_h, timeout=15)
        assert r.status_code == 200
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=hr_h, timeout=15)
        found = next(i for i in r.json() if i["id"] == cid)
        assert found["signed"] is False
        assert found.get("status") == "draft"

        # DELETE cert
        r = requests.delete(f"{BASE_URL}/api/hr/certificates/{cid}", headers=hr_h, timeout=15)
        assert r.status_code == 200
        # Verify removed
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=hr_h, timeout=15)
        assert not any(i["id"] == cid for i in r.json())
        TestHRCertificatesCRUD.created_ids.remove(cid)

    def test_intern_forbidden_pdf(self, intern_h, hr_h):
        # create as HR, then verify intern can't pull the PDF
        r = requests.post(f"{BASE_URL}/api/hr/certificates", headers=hr_h,
                          json={"cert_type": "performance", "recipient_name": "TEST_iter68 Perf",
                                "content": "Great work."}, timeout=15)
        assert r.status_code == 200
        cid = r.json()["id"]
        try:
            r = requests.get(f"{BASE_URL}/api/hr/certificates/{cid}/pdf", headers=intern_h, timeout=15)
            assert r.status_code == 403
            r = requests.post(f"{BASE_URL}/api/hr/certificates/{cid}/sign", headers=intern_h,
                              json={"signature_data_url": _SIG_DATAURL}, timeout=15)
            assert r.status_code == 403
            r = requests.delete(f"{BASE_URL}/api/hr/certificates/{cid}", headers=intern_h, timeout=15)
            assert r.status_code == 403
        finally:
            requests.delete(f"{BASE_URL}/api/hr/certificates/{cid}", headers=hr_h, timeout=15)


# ============================================================
# Cleanup: nuke any leftover TEST_iter68 certificates
# ============================================================
def teardown_module(module):
    try:
        tok = _login(*ADMIN)
        h = {"Authorization": f"Bearer {tok}"}
        r = requests.get(f"{BASE_URL}/api/hr/certificates", headers=h, timeout=15)
        if r.status_code == 200:
            for c in r.json():
                if (c.get("recipient_name") or "").startswith("TEST_iter68"):
                    requests.delete(f"{BASE_URL}/api/hr/certificates/{c['id']}", headers=h, timeout=15)
    except Exception:
        pass
