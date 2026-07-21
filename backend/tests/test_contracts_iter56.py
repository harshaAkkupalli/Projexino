"""iter56 — Contracts PDF + email endpoints."""
import io
import os
import pytest
import requests
import pdfplumber

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL", "")
    if not v:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        v = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return v.rstrip("/")


BASE_URL = _load_backend_url()
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"
EXISTING_CID = "d11920aac36d4d4abe6586d8644bc606"
EXISTING_CLIENT_ID = "b5424870a18d435b8fb10be8b8b65593"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---------- PDF ----------
class TestContractPdf:
    def test_existing_contract_pdf(self, headers):
        r = requests.get(f"{BASE_URL}/api/contracts/{EXISTING_CID}/pdf", headers=headers, timeout=30)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        pdf = r.content
        assert pdf.startswith(b"%PDF"), f"missing PDF header: {pdf[:20]}"
        assert len(pdf) > 30 * 1024, f"pdf too small: {len(pdf)} bytes"
        with pdfplumber.open(io.BytesIO(pdf)) as p:
            text = "\n".join((pg.extract_text() or "") for pg in p.pages)
        # Required tokens
        needles = [
            "Enterprise Q3 2026", "PJX-2026", "Term", "Pricing",
            "Contract Value", "48,000",
            "Projexino",  # from letterhead
            "Page 1",
        ]
        missing = [n for n in needles if n.lower() not in text.lower()]
        assert not missing, f"missing tokens in PDF text: {missing}\nGot text sample:\n{text[:1500]}"
        # Party labels — either case OK
        assert ("service provider" in text.lower()) or ("provider" in text.lower())
        assert "client" in text.lower()
        # Currency
        assert ("USD" in text) or ("$" in text)
        # Tax percent
        assert "18" in text

    def test_route_not_swallowed_by_wildcard(self, headers):
        r = requests.get(f"{BASE_URL}/api/contracts/{EXISTING_CID}", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/json")
        body = r.json()
        assert body.get("id") == EXISTING_CID

    def test_pdf_from_fresh_contract(self, headers):
        # Create a fresh client since existing client already has an active contract
        cli_payload = {"name": "TEST_iter56_pdfclient", "email": "test.iter56@example.com"}
        rc = requests.post(f"{BASE_URL}/api/clients", headers=headers, json=cli_payload, timeout=15)
        assert rc.status_code in (200, 201), f"client create failed: {rc.status_code} {rc.text[:300]}"
        client_id = rc.json().get("id")
        assert client_id
        payload = {
            "client_id": client_id,
            "agreement_name": "Test Iter56 PDF",
            "agreement_type": "msa",
            "pricing": {"currency": "INR", "contract_value": 100000, "tax_percent": 18},
            "contract_start": "2026-01-01",
            "contract_end": "2026-12-31",
        }
        r = requests.post(f"{BASE_URL}/api/contracts", headers=headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:300]}"
        cid = r.json().get("id")
        assert cid
        # POST does not populate pricing (by design — configured in Section 2 UI); PATCH it
        rp = requests.patch(f"{BASE_URL}/api/contracts/{cid}", headers=headers,
                            json={"pricing": {"currency": "INR", "contract_value": 100000,
                                              "tax_percent": 18, "billing_cycle": "monthly"}},
                            timeout=15)
        assert rp.status_code == 200, f"patch failed: {rp.status_code} {rp.text[:200]}"
        try:
            r2 = requests.get(f"{BASE_URL}/api/contracts/{cid}/pdf", headers=headers, timeout=30)
            assert r2.status_code == 200
            assert r2.content.startswith(b"%PDF")
            assert len(r2.content) > 30 * 1024
            with pdfplumber.open(io.BytesIO(r2.content)) as p:
                text = "\n".join((pg.extract_text() or "") for pg in p.pages)
            assert "Test Iter56 PDF" in text
            assert "PJX-" in text
            assert "INR" in text
            assert ("100,000" in text) or ("100000" in text) or ("100 000" in text)
        finally:
            requests.delete(f"{BASE_URL}/api/contracts/{cid}", headers=headers, timeout=15)
            requests.delete(f"{BASE_URL}/api/clients/{client_id}", headers=headers, timeout=15)


# ---------- AI Draft ----------
class TestAiDraftEmail:
    @pytest.mark.parametrize("tone", ["warm", "brief", "professional"])
    def test_draft(self, headers, tone):
        r = requests.post(
            f"{BASE_URL}/api/contracts/{EXISTING_CID}/ai-draft-email",
            headers=headers,
            json={"tone": tone, "extra_notes": "first renewal"},
            timeout=45,
        )
        if r.status_code == 502:
            pytest.skip(f"LLM 502 (budget exhausted?): {r.text[:200]}")
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert d.get("subject", "").startswith("PJX-")
        assert "for your review" in d.get("subject", "").lower()
        body = d.get("body_html", "")
        assert body and "<p" in body.lower()


# ---------- Email Send ----------
class TestEmailSend:
    def test_missing_recipient_400(self, headers):
        r = requests.post(f"{BASE_URL}/api/contracts/{EXISTING_CID}/email",
                          headers=headers,
                          json={"to": [], "subject": "x", "body_html": "<p>x</p>"},
                          timeout=15)
        assert r.status_code == 400
        assert "recipient" in r.text.lower() or "to" in r.text.lower()

    def test_missing_subject_400(self, headers):
        r = requests.post(f"{BASE_URL}/api/contracts/{EXISTING_CID}/email",
                          headers=headers,
                          json={"to": ["a@b.com"], "subject": "   ", "body_html": "<p>x</p>"},
                          timeout=15)
        assert r.status_code == 400
        assert "subject" in r.text.lower()

    def test_gmail_disconnected_returns_400_not_500(self, headers):
        r = requests.post(f"{BASE_URL}/api/contracts/{EXISTING_CID}/email",
                          headers=headers,
                          json={"to": ["client@example.com"], "subject": "hello",
                                "body_html": "<p>Hi</p>", "include_pdf": True},
                          timeout=30)
        # Must NOT be a 500
        assert r.status_code != 500, f"got 500 instead of 400: {r.text[:300]}"
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:300]}"
        assert "gmail" in r.text.lower()
        assert "/app/settings" in r.text.lower() or "settings" in r.text.lower()


# ---------- Email Log ----------
class TestEmailLog:
    def test_emails_endpoint(self, headers):
        r = requests.get(f"{BASE_URL}/api/contracts/{EXISTING_CID}/emails",
                         headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        assert "total" in d
        assert isinstance(d["items"], list)
        for row in d["items"]:
            for k in ("id", "contract_id", "to", "subject", "sent_at", "sent_by"):
                assert k in row, f"missing key {k} in log row: {row}"


# ---------- Company profile still works ----------
class TestCompanyProfile:
    def test_get_company_profile(self, headers):
        r = requests.get(f"{BASE_URL}/api/hr/letters/company-profile", headers=headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)
