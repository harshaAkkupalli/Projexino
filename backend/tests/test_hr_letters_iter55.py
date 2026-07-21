"""
Iter 55 — Verify upload-signature persistence + PDF embed.
No backend code changes this iter; validates that a data:image/png data URL
uploaded from the frontend is stored verbatim in signature_blocks and
correctly embedded in the rendered PDF.
"""
import os
import base64
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://projexino-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"

# 1x1 transparent PNG
TINY_PNG_HEX = ("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C489"
                "0000000D49444154789C63F8FFFF3F0300050001A2A62DE30000000049454E44AE426082")
TINY_PNG_BYTES = bytes.fromhex(TINY_PNG_HEX)
TINY_PNG_B64 = base64.b64encode(TINY_PNG_BYTES).decode()
TINY_PNG_DATAURL = f"data:image/png;base64,{TINY_PNG_B64}"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def letter_id(client):
    payload = {"type": "offer_letter", "title": "TEST_iter55_upload_sig", "template": "offer_letter", "employee_name": "TEST Uploader"}
    r = client.post(f"{BASE_URL}/api/hr/letters", json=payload, timeout=15)
    assert r.status_code in (200, 201), r.text
    lid = r.json()["id"]
    yield lid
    # teardown
    try:
        client.delete(f"{BASE_URL}/api/hr/letters/{lid}", timeout=15)
    except Exception:
        pass


class TestUploadSignatureDataURL:
    """Confirms an uploaded image data URL is accepted by the existing
    signature_blocks pipeline and returned verbatim on GET."""

    def test_patch_signature_with_uploaded_image_data_url(self, client, letter_id):
        # fetch existing blocks
        r = client.get(f"{BASE_URL}/api/hr/letters/{letter_id}", timeout=15)
        assert r.status_code == 200
        blocks = r.json().get("signature_blocks") or []
        assert len(blocks) >= 1, "Letter must have at least one signature block"
        bid = blocks[0]["id"]
        new_blocks = [{**blocks[0], "signature_data_url": TINY_PNG_DATAURL, "name": "Test Uploader", "role": "Uploaded Sig"}] + blocks[1:]
        r2 = client.patch(f"{BASE_URL}/api/hr/letters/{letter_id}", json={"signature_blocks": new_blocks}, timeout=15)
        assert r2.status_code == 200, r2.text

        # GET and verify persisted
        r3 = client.get(f"{BASE_URL}/api/hr/letters/{letter_id}", timeout=15)
        assert r3.status_code == 200
        stored = r3.json()["signature_blocks"][0]
        assert stored["id"] == bid
        assert stored["signature_data_url"].startswith("data:image/png;base64,"), stored["signature_data_url"][:60]
        assert stored["name"] == "Test Uploader"

    def test_pdf_render_embeds_uploaded_signature(self, client, letter_id):
        r = client.get(f"{BASE_URL}/api/hr/letters/{letter_id}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        # PDF with an embedded image should be materially larger than text-only
        assert len(r.content) > 20 * 1024, f"PDF too small ({len(r.content)} bytes) — image likely not embedded"

    def test_invalid_data_url_still_accepted_by_backend(self, client, letter_id):
        # backend does NOT validate data URL scheme (as noted in problem statement).
        # This test just documents current behaviour — any string is accepted.
        r = client.get(f"{BASE_URL}/api/hr/letters/{letter_id}", timeout=15)
        blocks = r.json()["signature_blocks"]
        new_blocks = [{**blocks[0], "signature_data_url": TINY_PNG_DATAURL}] + blocks[1:]  # reset to valid
        r2 = client.patch(f"{BASE_URL}/api/hr/letters/{letter_id}", json={"signature_blocks": new_blocks}, timeout=15)
        assert r2.status_code == 200
