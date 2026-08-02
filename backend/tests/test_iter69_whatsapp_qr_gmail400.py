"""Iter 69 backend tests.

Covers:
1) POST /api/finance/invoices/{id}/whatsapp — new message format:
   - wa_text contains NO http/https URLs (bare)
   - unpaid: contains bank rows (A/C Name, A/C No, Bank, IFSC, UPI ID) and
     'Scan the attached *PhonePe QR*' line
   - paid: NO 'HOW TO PAY' section (no scan-QR line, no bank rows)
   - link_block contains /api/d/i/{token}
   - qr_attach true for unpaid, false for paid
   - download_url, share_token present

2) POST /api/finance/receipts/{id}/whatsapp — wa_text no URLs, mentions
   attached receipt PDF; link_block contains /api/d/r/{token}.

3) GET /api/public/payment-qr — 200 image/png ~300KB, no auth.

4) GET /api/d/i/{share_token} — public invoice PDF download works.

5) POST /api/finance/invoices/{id}/send — no Gmail conn / bad token returns
   clean 400 (not 500) with helpful message.
"""
import io
import os
import re
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN = ("admin@projexino.com", "Projexino@2026")

# invoice provided by main agent for testing (unpaid, share_token known)
UNPAID_INV_ID = "dc7ed04d-8295-4ee7-a29a-e2a9e21ad947"
UNPAID_INV_SHARE_TOKEN = "a1db0794122048cd8bb48c5bdcaf3832"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_h():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


URL_RE = re.compile(r"https?://\S+", re.I)


# ============================================================
# 3) Public payment QR (no auth required)
# ============================================================
class TestPublicPaymentQR:
    def test_qr_returns_png(self):
        r = requests.get(f"{BASE_URL}/api/public/payment-qr", timeout=20)
        assert r.status_code == 200, r.text[:200]
        ct = r.headers.get("content-type", "")
        assert ct.startswith("image/png"), f"unexpected content-type: {ct}"
        # ~300KB
        assert 200_000 < len(r.content) < 800_000, f"unexpected size: {len(r.content)}"
        # Verify PNG magic bytes
        assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


# ============================================================
# 4) Public tokenized invoice download (short /api/d/i/{token})
# ============================================================
class TestPublicInvoiceDownload:
    def test_short_invoice_download(self):
        r = requests.get(f"{BASE_URL}/api/d/i/{UNPAID_INV_SHARE_TOKEN}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 5000

    def test_short_invoice_download_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/d/i/{'0' * 32}", timeout=15)
        assert r.status_code == 404


# ============================================================
# 1) Invoice WhatsApp — new format
# ============================================================
class TestInvoiceWhatsApp:
    def test_unpaid_invoice_whatsapp_payload(self, admin_h):
        r = requests.post(
            f"{BASE_URL}/api/finance/invoices/{UNPAID_INV_ID}/whatsapp",
            headers=admin_h,
            json={},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()

        # Required fields
        for k in ("wa_text", "link_block", "qr_attach", "download_url", "share_token"):
            assert k in body, f"missing key {k} in whatsapp response"

        wa_text = body["wa_text"]

        # NO URLs in the wa_text
        urls_in_text = URL_RE.findall(wa_text)
        assert not urls_in_text, f"wa_text should have NO http URLs, found: {urls_in_text}"

        # Bank details must be present for unpaid (label anywhere on the line)
        assert "A/C Name" in wa_text
        assert "A/C No" in wa_text
        assert "Bank" in wa_text
        assert "IFSC" in wa_text
        assert "UPI ID" in wa_text

        # PhonePe QR scan hint
        assert "Scan the attached" in wa_text and "PhonePe QR" in wa_text

        # qr_attach true for unpaid
        assert body["qr_attach"] is True

        # link_block contains /api/d/i/{token}
        assert "/api/d/i/" in body["link_block"], body["link_block"]
        assert body["share_token"] in body["link_block"]

        # download_url contains the token
        assert body["download_url"].endswith(f"/api/d/i/{body['share_token']}")

    def test_paid_invoice_whatsapp_no_pay_section(self, admin_h):
        """Find a paid invoice and verify HOW TO PAY block is absent."""
        r = requests.get(f"{BASE_URL}/api/finance/invoices?limit=100", headers=admin_h, timeout=30)
        assert r.status_code == 200
        invoices = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        paid = [i for i in invoices if i.get("status") == "paid"]
        if not paid:
            pytest.skip("no paid invoices available in this env")
        inv_id = paid[0]["id"]
        r2 = requests.post(
            f"{BASE_URL}/api/finance/invoices/{inv_id}/whatsapp",
            headers=admin_h,
            json={},
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        wa_text = body["wa_text"]

        # No URLs
        assert not URL_RE.findall(wa_text), f"paid wa_text should be url-free: {wa_text}"
        # No HOW TO PAY
        assert "HOW TO PAY" not in wa_text
        # No scan QR line
        assert "Scan the attached" not in wa_text
        # No bank rows (labels) since paid
        assert "A/C No" not in wa_text
        assert "IFSC" not in wa_text
        assert "UPI ID" not in wa_text

        # qr_attach false
        assert body["qr_attach"] is False


# ============================================================
# 2) Receipt WhatsApp
# ============================================================
class TestReceiptWhatsApp:
    def test_receipt_whatsapp(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/finance/receipts?limit=25", headers=admin_h, timeout=20)
        if r.status_code != 200:
            pytest.skip("cannot list receipts")
        receipts = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if not receipts:
            pytest.skip("no receipts available")
        rid = receipts[0]["id"]
        r2 = requests.post(
            f"{BASE_URL}/api/finance/receipts/{rid}/whatsapp",
            headers=admin_h,
            timeout=20,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert "wa_text" in body and "link_block" in body and "download_url" in body

        wa_text = body["wa_text"]
        # No URLs in the wa_text
        urls_in_text = URL_RE.findall(wa_text)
        assert not urls_in_text, f"receipt wa_text should have no URLs, found: {urls_in_text}"

        # Mentions attached receipt PDF
        assert "receipt PDF is attached" in wa_text.lower() or "receipt pdf is attached" in wa_text.lower() or "attached" in wa_text.lower()

        # link_block contains /api/d/r/
        assert "/api/d/r/" in body["link_block"], body["link_block"]


# ============================================================
# 5) Invoice send → clean 400 when Gmail disconnected
# ============================================================
class TestInvoiceSendGmail400:
    def test_send_returns_clean_400_when_gmail_disconnected(self, admin_h):
        # Use the known unpaid invoice
        r = requests.post(
            f"{BASE_URL}/api/finance/invoices/{UNPAID_INV_ID}/send",
            headers=admin_h,
            json={"to": ["nowhere@example.com"], "subject": "T", "body_html": "<p>x</p>"},
            timeout=30,
        )
        # Should be a clean 4xx (400/401), NOT a 500
        assert r.status_code != 500, f"expected clean 4xx, got 500: {r.text[:300]}"
        assert 400 <= r.status_code < 500, f"expected 4xx, got {r.status_code}: {r.text[:300]}"
        # Should mention Gmail/reconnect in message
        text = r.text.lower()
        assert ("gmail" in text) or ("reconnect" in text) or ("connect" in text) or ("token" in text), \
            f"error message should mention Gmail reconnect, got: {r.text[:300]}"
