"""Iter 79 — HR Letters drag placement, inline PDF, shareable public sign, email fixes verification."""
import os
import re
import base64
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
LETTER_ID = "54033f4ea7804938b8f15418b6e5df33"

TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SIG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"


@pytest.fixture(scope="module")
def sess():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def state():
    return {"placed_block_ids": [], "notification_ids": [], "external_block_ids": []}


class TestPdfInline:
    def test_pdf_default_attachment(self, sess):
        r = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}/pdf", timeout=30)
        assert r.status_code == 200
        assert "attachment" in r.headers.get("content-disposition", "").lower()
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_pdf_inline(self, sess):
        r = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}/pdf?inline=true", timeout=30)
        assert r.status_code == 200
        assert "inline" in r.headers.get("content-disposition", "").lower()

    def test_pdf_hide_placed(self, sess):
        r = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}/pdf?hide_placed=true", timeout=30)
        assert r.status_code == 200


class TestPlacementPersistence:
    def test_patch_with_placed_signature_and_render(self, sess, state):
        # get current letter
        r = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}", timeout=15)
        assert r.status_code == 200
        letter = r.json()
        blocks = list(letter.get("signature_blocks") or [])
        assert blocks, "Letter should have at least one signature block"

        # Add x,y placement to first block (remember block id so we can clean up)
        target_id = blocks[0]["id"]
        state["placed_block_ids"].append(target_id)
        blocks[0] = {**blocks[0], "x": 60.0, "y": 75.0}

        r2 = sess.patch(f"{BASE_URL}/api/hr/letters/{LETTER_ID}",
                        json={"signature_blocks": blocks}, timeout=15)
        assert r2.status_code == 200
        saved = r2.json()
        found = next((b for b in saved["signature_blocks"] if b["id"] == target_id), None)
        assert found and found.get("x") == 60.0 and found.get("y") == 75.0

        # PDF still renders 200 with placed signature
        r3 = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}/pdf", timeout=30)
        assert r3.status_code == 200
        assert len(r3.content) > 1000


class TestShareableSignFlow:
    @pytest.fixture(scope="class")
    def token_bundle(self, sess):
        r = sess.post(f"{BASE_URL}/api/hr/letters/{LETTER_ID}/sign-token",
                      json={"shareable": True}, timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data.get("expires_in_min") == 20160
        assert data.get("url", "").endswith(f"/sign/{data.get('token')}")
        return data

    def test_public_get_no_auth(self, token_bundle):
        token = token_bundle["token"]
        # NO auth session
        r = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/{token}", timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j.get("shareable") is True
        assert j.get("letter_title")

    def test_public_pdf_no_auth(self, token_bundle):
        token = token_bundle["token"]
        r = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/{token}/pdf", timeout=30)
        assert r.status_code == 200
        assert "inline" in r.headers.get("content-disposition", "").lower()
        assert r.headers.get("content-type", "").startswith("application/pdf")

    def test_invalid_token_404(self):
        r = requests.get(f"{BASE_URL}/api/public/hr-letters/sign/notarealtoken123", timeout=15)
        assert r.status_code == 404

    def test_public_sign_success_and_reuse_410(self, sess, token_bundle, state):
        token = token_bundle["token"]
        r = requests.post(
            f"{BASE_URL}/api/public/hr-letters/sign/{token}",
            json={"signature_data_url": SIG_DATA_URL, "signer_name": "QA External"},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:200]
        j = r.json()
        assert j.get("ok") is True
        # email_notified may be False (Gmail disconnected) — expected
        # Verify letter state
        time.sleep(0.5)
        r2 = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}", timeout=15)
        assert r2.status_code == 200
        L = r2.json()
        assert L.get("sign_status") == "signed"
        assert (L.get("last_signed") or {}).get("name") == "QA External"

        # Find the newly-added external block (has signature_data_url + role External)
        for b in L.get("signature_blocks") or []:
            if b.get("role") == "External" and b.get("signature_data_url", "").startswith("data:image/"):
                state["external_block_ids"].append(b["id"])

        # Reuse must fail with 410
        r3 = requests.post(
            f"{BASE_URL}/api/public/hr-letters/sign/{token}",
            json={"signature_data_url": SIG_DATA_URL, "signer_name": "Attacker"},
            timeout=15,
        )
        assert r3.status_code == 410


class TestCleanup:
    """Restore letter to pre-test state — remove x/y from placed blocks, drop external block,
    reset sign_status/last_signed. Also purge notifications we created."""

    def test_cleanup(self, sess, state):
        r = sess.get(f"{BASE_URL}/api/hr/letters/{LETTER_ID}", timeout=15)
        assert r.status_code == 200
        L = r.json()
        blocks = L.get("signature_blocks") or []

        # Remove any external block we added
        ext_ids = set(state["external_block_ids"])
        cleaned = []
        for b in blocks:
            if b.get("id") in ext_ids:
                continue
            nb = {k: v for k, v in b.items() if k not in ("x", "y")}
            # Clear signature that we set through placement path
            cleaned.append(nb)

        r2 = sess.patch(
            f"{BASE_URL}/api/hr/letters/{LETTER_ID}",
            json={"signature_blocks": cleaned},
            timeout=15,
        )
        assert r2.status_code == 200
        # Note: we don't unset sign_status via API (no supported field), so leaving
        # it as 'signed' for now — main agent can add reset endpoint if needed.


# ------------------ Code review verifications (no external calls) ------------------
class TestCodeReviewOutreachPersonalise:
    def test_personalise_regex_and_aliases_present(self):
        with open("/app/backend/outreach.py") as f:
            src = f.read()
        # confirm re.sub for {{var}} and lowercase-lookup pattern
        assert re.search(r"re\.sub\(r\"\\\{\\\{\\s\*\(\[\\w \]\+\?\)\\s\*\\\}\\\}\"", src), \
            "Expected double-brace regex in _personalise"
        # Common aliases exist
        for key in ("firstname", "first_name", "company", "companyname", "name", "fullname"):
            assert f'"{key}"' in src, f"alias '{key}' missing from _personalise vars_"
        # Case-insensitive by lowercasing m.group in repl
        assert "m.group(1).strip().lower()" in src


class TestCodeReviewEmailMultipart:
    def test_do_send_builds_mixed_with_related_and_attachments(self):
        with open("/app/backend/email_module.py") as f:
            src = f.read()
        # multipart/mixed built when attachments present, containing related + MIMEBase attachments
        assert 'MIMEMultipart("mixed")' in src
        assert "mixed.attach(related)" in src
        assert 'MIMEBase(main or "application"' in src
        assert 'add_header("Content-Disposition", "attachment"' in src
