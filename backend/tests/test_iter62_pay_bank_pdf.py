"""
Iteration 62 — Redesigned WhatsApp templates + public pay page + finance settings + PDF rebuild.

Covers:
  Backend
  - GET/PUT  /api/finance/settings                    (admin-only; persistence)
  - GET      /api/public/invoice-pay/{token}          (no-auth invoice summary + bank + stripe_enabled)
  - POST     /api/public/invoice-pay/{token}/checkout (no-auth Stripe live URL; 400 if paid)
  - POST     /api/finance/invoices/{id}/whatsapp      (structured wa_text w/ pay link + rows)
  - POST     /api/testimonial-requests/{rid}/whatsapp (structured wa_text w/ /testimonial/{token})
  - GET      /api/finance/invoices/{id}/pdf           (rebuilt PDF, %PDF + >20KB)
  - GET      /api/public/finance-doc/{token}          (rebuilt PDF, %PDF + >20KB)
  - POST     /api/finance/projects/{fid}/invoices     (new invoice auto-assigns share_token)
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

# Demo Web Build finance project — has 7 invoices in seed data
FINANCE_PROJECT_ID = "57419353-a008-4582-af6e-c6511d28c126"


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
def any_invoice(admin_session):
    """Returns an existing invoice dict (issued/unpaid preferred)."""
    r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
    assert r.status_code == 200, r.text
    invoices = r.json()
    assert invoices, "no invoices in system"
    # prefer unpaid so checkout test works
    unpaid = [i for i in invoices if i.get("status") != "paid"]
    return (unpaid or invoices)[0]


# ── Finance settings (bank) ────────────────────────────────────────────────
class TestFinanceSettings:
    def test_get_settings_admin_ok(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/finance/settings", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, dict)

    def test_put_and_persist(self, admin_session):
        # Snapshot current
        cur = admin_session.get(f"{BASE_URL}/api/finance/settings", timeout=10).json()

        new_payload = {
            "bank_name": "TEST_BANK_iter62",
            "account_name": cur.get("account_name") or "Projexino Solutions Pvt Ltd",
            "account_number": cur.get("account_number") or "1234567890",
            "ifsc": cur.get("ifsc") or "HDFC0000001",
            "swift": cur.get("swift") or "HDFCINBB",
            "branch": cur.get("branch") or "Test Branch",
            "upi_id": cur.get("upi_id") or "projexino@hdfc",
            "payment_note": "TEST_iter62_note",
        }
        r = admin_session.put(f"{BASE_URL}/api/finance/settings",
                              json=new_payload, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["bank_name"] == "TEST_BANK_iter62"
        assert d["payment_note"] == "TEST_iter62_note"

        # GET again — persisted
        r2 = admin_session.get(f"{BASE_URL}/api/finance/settings", timeout=10).json()
        assert r2["bank_name"] == "TEST_BANK_iter62"
        assert r2["payment_note"] == "TEST_iter62_note"

        # Restore original HDFC-ish snapshot (main agent's request)
        restore = {k: cur.get(k) or "" for k in
                   ("bank_name", "account_name", "account_number", "ifsc",
                    "swift", "branch", "upi_id", "payment_note")}
        # Default fallback if seed missing
        if not restore.get("bank_name"):
            restore = {
                "bank_name": "HDFC Bank",
                "account_name": "Projexino Solutions Pvt Ltd",
                "account_number": "50200012345678",
                "ifsc": "HDFC0000123",
                "swift": "HDFCINBB",
                "branch": "Mumbai — Andheri West",
                "upi_id": "projexino@hdfc",
                "payment_note": "Please share UTR/reference after payment.",
            }
        rr = admin_session.put(f"{BASE_URL}/api/finance/settings",
                               json=restore, timeout=10)
        assert rr.status_code == 200

    def test_non_admin_forbidden(self):
        """Try with unauth session — must NOT be 200."""
        r = requests.get(f"{BASE_URL}/api/finance/settings", timeout=10)
        # 401 (no auth) or 403 (auth required) both acceptable — anything but 200
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}"


# ── Public invoice-pay info ────────────────────────────────────────────────
class TestPublicInvoicePayInfo:
    def test_public_info_ok(self, admin_session, any_invoice):
        # Ensure the invoice has a share_token (call whatsapp lazily)
        inv_id = any_invoice["id"]
        wa = admin_session.post(f"{BASE_URL}/api/finance/invoices/{inv_id}/whatsapp",
                                json={}, timeout=20)
        assert wa.status_code == 200
        token = wa.json()["share_token"]

        # Fresh session — NO auth
        r = requests.get(f"{BASE_URL}/api/public/invoice-pay/{token}", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("invoice_no", "amount", "currency", "status",
                  "stripe_enabled", "bank"):
            assert k in d, f"missing key {k}"
        assert d["stripe_enabled"] is True
        assert isinstance(d["bank"], dict)
        for bk in ("bank_name", "account_name", "account_number", "ifsc"):
            assert bk in d["bank"]

    def test_public_info_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/public/invoice-pay/notarealtoken_xyz_iter62",
                         timeout=15)
        assert r.status_code == 404


# ── Public invoice-pay checkout (Stripe live URL) ──────────────────────────
class TestPublicInvoicePayCheckout:
    def test_checkout_returns_stripe_url(self, admin_session, any_invoice):
        # Get share token via whatsapp endpoint
        inv_id = any_invoice["id"]
        wa = admin_session.post(f"{BASE_URL}/api/finance/invoices/{inv_id}/whatsapp",
                                json={}, timeout=20)
        token = wa.json()["share_token"]

        # If the picked invoice is paid, checkout must be 400
        info = requests.get(f"{BASE_URL}/api/public/invoice-pay/{token}", timeout=15).json()
        payload = {"origin_url": BASE_URL}
        r = requests.post(f"{BASE_URL}/api/public/invoice-pay/{token}/checkout",
                          json=payload, timeout=30)

        if info.get("status") == "paid":
            assert r.status_code == 400
            return

        assert r.status_code == 200, f"expected 200, got {r.status_code} — {r.text[:300]}"
        d = r.json()
        assert "url" in d and "checkout.stripe.com" in d["url"], f"bad url: {d}"
        assert d.get("session_id")

    def test_checkout_bad_token(self):
        r = requests.post(f"{BASE_URL}/api/public/invoice-pay/no-such-token-xyz-62/checkout",
                          json={"origin_url": BASE_URL}, timeout=15)
        assert r.status_code == 404


# ── Invoice WhatsApp: structured template ──────────────────────────────────
class TestInvoiceWhatsappStructured:
    def test_wa_text_contains_pay_link_and_rows(self, admin_session, any_invoice):
        inv_id = any_invoice["id"]
        r = admin_session.post(f"{BASE_URL}/api/finance/invoices/{inv_id}/whatsapp",
                               json={}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        wa = d["wa_text"]
        assert "PROJEXINO SOLUTIONS" in wa
        assert "━━━" in wa  # divider
        assert "▸ *Invoice No:*" in wa or "▸ *Receipt No:*" in wa
        assert "▸ *Amount:*" in wa
        assert "💳 *Pay Securely" in wa
        assert f"/pay/invoice/{d['share_token']}" in wa
        assert d["share_token"]


# ── Testimonial request WhatsApp ───────────────────────────────────────────
class TestTestimonialRequestWhatsApp:
    def _find_or_create_request(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/testimonial-requests", timeout=15)
        if r.status_code != 200:
            pytest.skip(f"cannot list testimonial requests: {r.status_code}")
        items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
        if items:
            return items[0]["id"]

        # Create one for a client if none exist
        pytest.skip("no testimonial requests in system; skipping structured wa_text test")

    def test_request_whatsapp_structured(self, admin_session):
        rid = self._find_or_create_request(admin_session)
        r = admin_session.post(f"{BASE_URL}/api/testimonial-requests/{rid}/whatsapp",
                               json={}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "wa_text" in d and "link" in d and "phone" in d
        assert "/testimonial/" in d["link"]
        assert d["link"] in d["wa_text"]
        assert "WE'D LOVE YOUR FEEDBACK" in d["wa_text"] or "feedback" in d["wa_text"].lower()
        assert re.fullmatch(r"\d*", d["phone"] or "") is not None


# ── Rebuilt PDFs (admin auth + public token) ───────────────────────────────
class TestRebuiltPdfs:
    def test_admin_invoice_pdf(self, admin_session, any_invoice):
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices/{any_invoice['id']}/pdf",
                              timeout=25)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", f"not a PDF: {r.content[:20]!r}"
        assert len(r.content) > 20_000, f"PDF too small: {len(r.content)}"

    def test_public_finance_doc_pdf(self, admin_session, any_invoice):
        wa = admin_session.post(
            f"{BASE_URL}/api/finance/invoices/{any_invoice['id']}/whatsapp",
            json={}, timeout=20)
        token = wa.json()["share_token"]
        r = requests.get(f"{BASE_URL}/api/public/finance-doc/{token}", timeout=25)
        assert r.status_code == 200, r.text[:200]
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 20_000, f"PDF too small: {len(r.content)}"


# ── Newly created invoices auto-get share_token ────────────────────────────
class TestInvoiceAutoShareToken:
    def test_new_invoice_has_share_token(self, admin_session):
        payload = {"amount": 100.0, "notes": "TEST_iter62_autotoken",
                   "items": [{"description": "iter62 auto", "amount": 100.0}]}
        r = admin_session.post(
            f"{BASE_URL}/api/finance/projects/{FINANCE_PROJECT_ID}/invoices",
            json=payload, timeout=25)
        assert r.status_code == 200, r.text[:300]
        created = r.json()
        assert created.get("share_token"), "share_token missing from create response"
        inv_id = created["id"]

        # GET the invoice again — token must still be present
        g = admin_session.get(f"{BASE_URL}/api/finance/invoices/{inv_id}", timeout=15)
        assert g.status_code == 200
        assert g.json().get("share_token") == created["share_token"]

        # public info reachable with that token (no auth)
        p = requests.get(f"{BASE_URL}/api/public/invoice-pay/{created['share_token']}",
                         timeout=15)
        assert p.status_code == 200
