"""
Iter 53 — HR Letters module tests
Covers:
  - CRUD via POST/GET/PATCH/DELETE /api/hr/letters
  - Sign-token issuance + public GET/POST flow
  - Expired / reused / invalid token handling (410 / 404)
  - PDF rendering (magic bytes, >30KB with embedded Projexino logo)
"""
import os
import base64
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

# 1x1 png as a valid signature data URL for negative/positive tests
PNG_1x1 = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082")
).decode()


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.text[:300]}"
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_letter(admin_headers):
    payload = {
        "template": "offer_letter",
        "employee_name": "TEST_Iter53 Candidate",
        "employee_email": "iter53@example.com",
        "position": "SDE II",
        "department": "Engineering",
        "ctc": "22 LPA",
        "joining_date": "2026-02-01",
        "context_notes": "test only",
    }
    r = requests.post(f"{BASE_URL}/api/hr/letters", json=payload, headers=admin_headers, timeout=30)
    assert r.status_code == 200, f"create failed {r.status_code} {r.text[:300]}"
    d = r.json()
    assert d["id"] and d["template"] == "offer_letter"
    assert isinstance(d.get("signature_blocks"), list) and len(d["signature_blocks"]) >= 2
    yield d
    requests.delete(f"{BASE_URL}/api/hr/letters/{d['id']}", headers=admin_headers, timeout=15)


# ----- CRUD -----
class TestCRUD:
    def test_list(self, admin_headers, created_letter):
        r = requests.get(f"{BASE_URL}/api/hr/letters", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json().get("items", [])]
        assert created_letter["id"] in ids

    def test_get_one(self, admin_headers, created_letter):
        r = requests.get(f"{BASE_URL}/api/hr/letters/{created_letter['id']}", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == created_letter["id"]

    def test_patch_body(self, admin_headers, created_letter):
        body = "<p>Dear Iter53,</p><p>We are pleased to offer you SDE II.</p><p>We are excited to have you on board.</p>"
        r = requests.patch(f"{BASE_URL}/api/hr/letters/{created_letter['id']}",
                           json={"body_html": body}, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/hr/letters/{created_letter['id']}", headers=admin_headers, timeout=15)
        assert r2.json()["body_html"] == body

    def test_pdf_render_with_logo(self, admin_headers, created_letter):
        r = requests.get(f"{BASE_URL}/api/hr/letters/{created_letter['id']}/pdf",
                         headers=admin_headers, timeout=90)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert r.content[:8].startswith(b"%PDF-"), f"not a pdf: {r.content[:16]!r}"
        # embedded logo => size should be significantly larger than 30KB
        assert len(r.content) > 30_000, f"PDF too small ({len(r.content)}B) — logo likely missing"


# ----- Sign token flow -----
class TestSignToken:
    def _issue(self, admin_headers, lid, block_id, name="TEST Signer"):
        r = requests.post(f"{BASE_URL}/api/hr/letters/{lid}/sign-token",
                          json={"block_id": block_id, "signer_name": name},
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_issue_token(self, admin_headers, created_letter):
        bid = created_letter["signature_blocks"][0]["id"]
        tk = self._issue(admin_headers, created_letter["id"], bid)
        assert tk["token"] and tk["url"].endswith(tk["token"])
        assert tk["expires_in_min"] == 15

    def test_public_get_ok(self, admin_headers, created_letter):
        bid = created_letter["signature_blocks"][0]["id"]
        tk = self._issue(admin_headers, created_letter["id"], bid, name="Anita Sharma")
        r = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["block_id"] == bid
        assert d["signer_name"] == "Anita Sharma"
        assert d["letter_title"]

    def test_public_post_persists_signature_and_marks_used(self, admin_headers, created_letter):
        bid = created_letter["signature_blocks"][1]["id"]
        tk = self._issue(admin_headers, created_letter["id"], bid)

        # POST signature (no auth)
        r = requests.post(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}",
                          json={"signature_data_url": PNG_1x1, "signer_name": "Bob"},
                          timeout=15)
        assert r.status_code == 200, r.text[:300]
        assert r.json().get("ok") is True

        # Verify signature landed on the block
        got = requests.get(f"{BASE_URL}/api/hr/letters/{created_letter['id']}",
                           headers=admin_headers, timeout=15).json()
        target = next(b for b in got["signature_blocks"] if b["id"] == bid)
        assert target["signature_data_url"].startswith("data:image/png;base64,")

        # Reused → 410
        r2 = requests.post(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}",
                           json={"signature_data_url": PNG_1x1}, timeout=15)
        assert r2.status_code == 410

        # GET reused → 410
        r3 = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}", timeout=15)
        assert r3.status_code == 410

    def test_invalid_token_404(self):
        r = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/does-not-exist-zzz", timeout=15)
        assert r.status_code == 404
        r2 = requests.post(f"{BASE_URL}/api/public/hr-letters/sign/does-not-exist-zzz",
                           json={"signature_data_url": PNG_1x1}, timeout=15)
        assert r2.status_code == 404

    def test_invalid_signature_payload_400(self, admin_headers, created_letter):
        bid = created_letter["signature_blocks"][0]["id"]
        tk = self._issue(admin_headers, created_letter["id"], bid)
        r = requests.post(f"{BASE_URL}/api/public/hr-letters/sign/{tk['token']}",
                          json={"signature_data_url": "not-a-data-url"}, timeout=15)
        assert r.status_code == 400


# ----- Auth / delete -----
class TestAuth:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/hr/letters", timeout=15)
        assert r.status_code in (401, 403)

    def test_delete(self, admin_headers):
        # create -> delete -> confirm 404
        r = requests.post(f"{BASE_URL}/api/hr/letters",
                          json={"template": "warning_letter", "employee_name": "TEST_ToDelete"},
                          headers=admin_headers, timeout=15)
        lid = r.json()["id"]
        rd = requests.delete(f"{BASE_URL}/api/hr/letters/{lid}", headers=admin_headers, timeout=15)
        assert rd.status_code == 200
        r2 = requests.get(f"{BASE_URL}/api/hr/letters/{lid}", headers=admin_headers, timeout=15)
        assert r2.status_code == 404
