"""
Iteration 61 — WhatsApp click-to-chat backend tests.
Covers:
 - POST /api/clients/{cid}/cs-whatsapp
 - POST /api/client-projects/{pid}/payment-reminder (wa_text/client_phone extension)
 - POST /api/finance/invoices/{id}/whatsapp (invoice + receipt doc_type toggle)
 - GET  /api/public/finance-doc/{token}  (no auth, PDF, 404 on bad token)
 - POST /api/finance/projects/{fid}/whatsapp-reminder (400 if no balance)
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

FINANCE_PROJECT_ID = "387ed69e88ef41e08aa4b360609e91c6"
CLIENT_ID = "b5424870a18d435b8fb10be8b8b65593"  # naeema with billing project


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ── cs-whatsapp ────────────────────────────────────────────────────────────
class TestCsWhatsapp:
    def test_cs_whatsapp_ok(self, admin_session):
        payload = {
            "subject": "Weekly update",
            "greeting": "Hi Naeema,",
            "intro": "Quick update on your project this week.",
            "highlights": ["Payment gateway integrated", "Admin dashboard live"],
            "ask_or_next_step": "Please review the staging link",
            "closing": "Warm regards",
            "blocks": [{"type": "text", "text": "Everything is on track."}],
        }
        r = admin_session.post(f"{BASE_URL}/api/clients/{CLIENT_ID}/cs-whatsapp", json=payload, timeout=45)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "wa_text" in data and isinstance(data["wa_text"], str) and len(data["wa_text"]) > 20
        assert "phone" in data
        # phone must be digits only
        assert re.fullmatch(r"\d*", data["phone"] or "") is not None
        assert "used_ai" in data and isinstance(data["used_ai"], bool)

    def test_cs_whatsapp_404(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/clients/does-not-exist/cs-whatsapp", json={}, timeout=15)
        assert r.status_code == 404


# ── payment-reminder ───────────────────────────────────────────────────────
class TestPaymentReminder:
    def test_reminder_has_wa_text_and_phone(self, admin_session):
        # find a billing project for the seed client with outstanding balance
        pr = admin_session.get(f"{BASE_URL}/api/clients/{CLIENT_ID}/projects", timeout=15)
        assert pr.status_code == 200, pr.text
        projects = pr.json()
        assert isinstance(projects, list) and projects, "seed billing project missing"
        # pick the first one — main agent says it has pending balance
        picked = None
        for p in projects:
            r = admin_session.post(f"{BASE_URL}/api/client-projects/{p['id']}/payment-reminder", json={}, timeout=20)
            if r.status_code == 200:
                picked = (p, r.json())
                break
        assert picked is not None, "no project with outstanding balance found"
        _, data = picked
        assert "subject" in data and "body_html" in data
        assert "wa_text" in data and isinstance(data["wa_text"], str) and "Projexino" in data["wa_text"]
        assert "client_phone" in data
        assert re.fullmatch(r"\d*", data["client_phone"] or "") is not None
        assert "pending" in data and data["pending"] > 0


# ── finance invoice whatsapp ───────────────────────────────────────────────
class TestInvoiceWhatsapp:
    @pytest.fixture(scope="class")
    def invoice_id(self, admin_session):
        # Use any existing invoice (seed data varies across environments)
        r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        assert r.status_code == 200, r.text
        invoices = r.json()
        assert isinstance(invoices, list) and invoices, "no invoices at all in the system"
        return invoices[0]["id"]

    def test_invoice_wa_default(self, admin_session, invoice_id):
        r = admin_session.post(f"{BASE_URL}/api/finance/invoices/{invoice_id}/whatsapp", json={}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # iter62 redesign: "Invoice for" -> "Invoice — {Month}"
        assert "wa_text" in d and "*Invoice No:*" in d["wa_text"]
        assert d["doc_type"] in ("invoice", "receipt")
        assert d["download_url"].startswith("http")
        assert "/api/public/finance-doc/" in d["download_url"]
        assert d.get("share_token")

    def test_invoice_wa_receipt(self, admin_session, invoice_id):
        r = admin_session.post(f"{BASE_URL}/api/finance/invoices/{invoice_id}/whatsapp", json={"doc_type": "receipt"}, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["doc_type"] == "receipt"
        assert "*Receipt No:*" in d["wa_text"] or "Receipt —" in d["wa_text"]

    def test_invoice_wa_share_token_stable(self, admin_session, invoice_id):
        r1 = admin_session.post(f"{BASE_URL}/api/finance/invoices/{invoice_id}/whatsapp", json={}, timeout=20)
        r2 = admin_session.post(f"{BASE_URL}/api/finance/invoices/{invoice_id}/whatsapp", json={}, timeout=20)
        assert r1.status_code == r2.status_code == 200
        assert r1.json()["share_token"] == r2.json()["share_token"]


# ── public tokenized PDF download ──────────────────────────────────────────
class TestPublicFinanceDoc:
    def test_public_download_no_auth(self, admin_session):
        # first get a share token — use any existing invoice
        inv_r = admin_session.get(f"{BASE_URL}/api/finance/invoices", timeout=15)
        invoice_id = inv_r.json()[0]["id"]
        wa = admin_session.post(f"{BASE_URL}/api/finance/invoices/{invoice_id}/whatsapp", json={}, timeout=20)
        token = wa.json()["share_token"]

        # Fresh session — NO auth header
        r = requests.get(f"{BASE_URL}/api/public/finance-doc/{token}", timeout=25)
        assert r.status_code == 200, f"public download failed: {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", f"not a PDF, got {r.content[:20]!r}"
        assert len(r.content) > 500

    def test_public_download_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/public/finance-doc/invalid-token-xyz-12345", timeout=15)
        assert r.status_code == 404


# ── finance project whatsapp reminder ──────────────────────────────────────
class TestFinanceWhatsappReminder:
    def test_reminder_ok_or_400(self, admin_session):
        # Use each finance project until we hit a valid one
        pr = admin_session.get(f"{BASE_URL}/api/finance/projects", timeout=15)
        projects = pr.json() if pr.status_code == 200 else []
        assert isinstance(projects, list) and projects, "no finance projects in system"
        # try first project — expect 200 (has outstanding) or 400 (fully paid)
        seen_status = None
        seen_body = None
        for p in projects:
            r = admin_session.post(f"{BASE_URL}/api/finance/projects/{p['id']}/whatsapp-reminder", timeout=20)
            seen_status = r.status_code
            seen_body = r.text
            if r.status_code == 200:
                d = r.json()
                assert "wa_text" in d and "outstanding" in d["wa_text"].lower()
                assert d["remaining"] > 0
                assert d.get("currency")
                return
        # If we never hit a 200, at least one project must have responded 400
        assert seen_status == 400, f"expected 200 or 400 on at least one project, got last={seen_status} body={seen_body}"

    def test_reminder_404(self, admin_session):
        r = admin_session.post(f"{BASE_URL}/api/finance/projects/nope-nope-nope/whatsapp-reminder", timeout=15)
        assert r.status_code == 404
