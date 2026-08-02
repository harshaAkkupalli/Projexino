"""
Iteration 81 backend tests — HR sign-docs preview & sign with drag-drop signature placement.

Coverage:
- Create sign-doc (html-only + pdf-attachment variants)
- GET .../pdf with/without hide_placed for both variants
- POST sign with signature_data_url + x/y stamps image + typed name on page 1
- PATCH signatures for reposition: privileged can move any, non-priv only own (403 otherwise)
- QR flow: sign-link -> public info/pdf/sign (no auth)
- Typed-only regression: signing without image + xy still works
- Attachment download still works
- Cleanup deletes docs created here (never touches doc named 'test')
"""
import base64
import io
import os
import re
import time

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PW = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PW = "Intern@2026"

# Tiny 1x1 PNG (transparent) for signature drawings
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)
SIG_DATA_URL = f"data:image/png;base64,{TINY_PNG_B64}"


_PDF_CACHE = {}


def _minimal_pdf_b64():
    """Return a small valid PDF (base64). Cached because reportlab embeds timestamps that differ per call."""
    if "b64" in _PDF_CACHE:
        return _PDF_CACHE["b64"]
    from reportlab.pdfgen import canvas as rl_canvas
    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(400, 500))
    c.setFont("Helvetica", 16)
    c.drawString(60, 440, "TEST_iter81 attachment PDF base")
    c.showPage()
    c.save()
    _PDF_CACHE["b64"] = base64.b64encode(buf.getvalue()).decode()
    return _PDF_CACHE["b64"]


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PW)


@pytest.fixture(scope="module")
def intern_token():
    return _login(INTERN_EMAIL, INTERN_PW)


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def intern_h(intern_token):
    return {"Authorization": f"Bearer {intern_token}"}


# Track created doc ids for cleanup
_created_ids = []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_h):
    yield
    for did in _created_ids:
        try:
            requests.delete(f"{API}/hr/sign-docs/{did}", headers=admin_h, timeout=20)
        except Exception:
            pass


def _create_doc(admin_h, name, body_html="", attach=False):
    payload = {"name": name, "body_html": body_html or f"<p>{name} body</p>", "audience_role": "all"}
    if attach:
        payload["attachments"] = [{
            "name": "TEST_iter81.pdf", "mime_type": "application/pdf",
            "size": 1000, "content_base64": _minimal_pdf_b64(),
        }]
    r = requests.post(f"{API}/hr/sign-docs", json=payload, headers=admin_h, timeout=30)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text}"
    d = r.json()
    _created_ids.append(d["id"])
    return d


def _pdf_text_and_has_image(pdf_bytes):
    """Return (text, has_any_image) using pdfplumber."""
    import pdfplumber
    text = ""
    has_img = False
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for pg in pdf.pages:
            text += (pg.extract_text() or "") + "\n"
            if pg.images:
                has_img = True
    return text, has_img


# ---------- CREATE + PDF (both variants) ----------
class TestCreateAndPDF:
    def test_create_html_only_and_pdf_hide_placed(self, admin_h):
        d = _create_doc(admin_h, "TEST_iter81 HTML doc", body_html="<h2>Hello iter81</h2><p>Please sign.</p>")
        assert d["name"] == "TEST_iter81 HTML doc"
        assert d["signatures"] == []
        # PDF with hide_placed=true — must be valid PDF
        r = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf?hide_placed=true", headers=admin_h, timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", "not a PDF magic header"

    def test_create_pdf_attachment_pdf_returns_base_attachment(self, admin_h):
        d = _create_doc(admin_h, "TEST_iter81 PDF-attach doc", attach=True)
        r = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf?hide_placed=true", headers=admin_h, timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        text, _ = _pdf_text_and_has_image(r.content)
        assert "TEST_iter81 attachment PDF base" in text, f"attachment base not present in PDF text: {text[:200]}"


# ---------- SIGN with drawn signature + placement, stamped in PDF (BOTH variants) ----------
class TestSignAndStamp:
    @pytest.mark.parametrize("attach", [False, True])
    def test_sign_with_placement_stamps_pdf(self, admin_h, intern_h, attach):
        d = _create_doc(admin_h, f"TEST_iter81 stamp {'attach' if attach else 'html'}", attach=attach)
        # Intern signs with drawn sig + x/y
        unique_name = f"Iter81 Signer {int(time.time())}"
        r = requests.post(
            f"{API}/hr/sign-docs/{d['id']}/sign",
            json={"signed_name": unique_name, "signature_data_url": SIG_DATA_URL, "x": 20.0, "y": 30.0},
            headers=intern_h, timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        sig = body["signature"]
        assert sig["typed_signature"] == unique_name
        assert sig["x"] == 20.0 and sig["y"] == 30.0
        assert sig["signature_data_url"].startswith("data:image/")

        # GET pdf WITHOUT hide_placed → must contain image + typed name
        r2 = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf", headers=admin_h, timeout=60)
        assert r2.status_code == 200
        assert r2.content[:4] == b"%PDF"
        text, has_img = _pdf_text_and_has_image(r2.content)
        assert unique_name[:20] in text, f"typed name missing in stamped PDF: text={text[:400]}"
        assert has_img, "no image detected in stamped PDF (signature not overlayed)"

        # GET pdf WITH hide_placed → typed name from placement must NOT appear (only base doc)
        r3 = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf?hide_placed=true", headers=admin_h, timeout=60)
        assert r3.status_code == 200
        text_hidden, _ = _pdf_text_and_has_image(r3.content)
        assert unique_name not in text_hidden, "hide_placed=true still shows placed signature name"


# ---------- PATCH reposition permissions ----------
class TestPatchReposition:
    def test_intern_can_move_own_but_not_others(self, admin_h, intern_h):
        d = _create_doc(admin_h, "TEST_iter81 patch perms")
        # intern signs
        r = requests.post(
            f"{API}/hr/sign-docs/{d['id']}/sign",
            json={"signed_name": "Intern Iter81", "signature_data_url": SIG_DATA_URL, "x": 10, "y": 10},
            headers=intern_h, timeout=30,
        )
        assert r.status_code == 200
        intern_sig_id = r.json()["signature"]["id"]

        # Intern moves OWN signature → 200
        r_own = requests.patch(
            f"{API}/hr/sign-docs/{d['id']}/signatures",
            json={"positions": [{"id": intern_sig_id, "x": 55.5, "y": 66.5}]},
            headers=intern_h, timeout=30,
        )
        assert r_own.status_code == 200, r_own.text
        moved_sig = next(s for s in r_own.json()["signatures"] if s["id"] == intern_sig_id)
        assert moved_sig["x"] == 55.5 and moved_sig["y"] == 66.5

        # Admin also signs on same doc
        r_a = requests.post(
            f"{API}/hr/sign-docs/{d['id']}/sign",
            json={"signed_name": "Admin Iter81", "signature_data_url": SIG_DATA_URL, "x": 40, "y": 40},
            headers=admin_h, timeout=30,
        )
        assert r_a.status_code == 200
        admin_sig_id = r_a.json()["signature"]["id"]

        # Intern tries to move ADMIN's signature → 403
        r_forbidden = requests.patch(
            f"{API}/hr/sign-docs/{d['id']}/signatures",
            json={"positions": [{"id": admin_sig_id, "x": 5, "y": 5}]},
            headers=intern_h, timeout=30,
        )
        assert r_forbidden.status_code == 403, f"expected 403, got {r_forbidden.status_code} {r_forbidden.text}"

        # Admin can move ANY signature → 200
        r_admin_move = requests.patch(
            f"{API}/hr/sign-docs/{d['id']}/signatures",
            json={"positions": [
                {"id": admin_sig_id, "x": 12.3, "y": 45.6},
                {"id": intern_sig_id, "x": 70, "y": 80},
            ]},
            headers=admin_h, timeout=30,
        )
        assert r_admin_move.status_code == 200
        sigs = {s["id"]: s for s in r_admin_move.json()["signatures"]}
        assert sigs[admin_sig_id]["x"] == 12.3 and sigs[admin_sig_id]["y"] == 45.6
        assert sigs[intern_sig_id]["x"] == 70 and sigs[intern_sig_id]["y"] == 80


# ---------- QR public flow ----------
class TestQRFlow:
    def test_qr_end_to_end(self, admin_h, intern_h):
        d = _create_doc(admin_h, "TEST_iter81 QR doc", body_html="<p>QR sign please</p>")
        # Intern requests a sign-link for themselves
        r = requests.post(f"{API}/hr/sign-docs/{d['id']}/sign-link", headers=intern_h, timeout=30)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        assert isinstance(token, str) and len(token) >= 8

        # public info (no auth)
        r_info = requests.get(f"{API}/public/doc-sign/{token}", timeout=30)
        assert r_info.status_code == 200, r_info.text
        info = r_info.json()
        assert info["doc_name"] == "TEST_iter81 QR doc"
        assert info["already_signed"] is False

        # public PDF (no auth)
        r_pdf = requests.get(f"{API}/public/doc-sign/{token}/pdf", timeout=60)
        assert r_pdf.status_code == 200
        assert r_pdf.content[:4] == b"%PDF"

        # public sign with sig + x/y (no auth)
        typed = f"QR Iter81 {int(time.time())}"
        r_sign = requests.post(
            f"{API}/public/doc-sign/{token}",
            json={"signed_name": typed, "signature_data_url": SIG_DATA_URL, "x": 33.3, "y": 44.4},
            timeout=30,
        )
        assert r_sign.status_code == 200, r_sign.text
        assert r_sign.json().get("ok") is True

        # verify via authenticated GET that signature persisted with x/y
        r_doc = requests.get(f"{API}/hr/sign-docs", headers=admin_h, timeout=30)
        docs = r_doc.json()
        target = next(x for x in docs if x["id"] == d["id"])
        s = next(x for x in target["signatures"] if x.get("typed_signature") == typed)
        assert s["x"] == 33.3 and s["y"] == 44.4
        assert s.get("via") == "qr"

        # already_signed becomes true
        r_info2 = requests.get(f"{API}/public/doc-sign/{token}", timeout=30)
        assert r_info2.json()["already_signed"] is True

        # signing again via same token → 400
        r_dup = requests.post(
            f"{API}/public/doc-sign/{token}",
            json={"signed_name": typed, "signature_data_url": SIG_DATA_URL, "x": 1, "y": 1},
            timeout=30,
        )
        assert r_dup.status_code == 400

        # Full PDF now contains typed name
        r_full = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf", headers=admin_h, timeout=60)
        text, has_img = _pdf_text_and_has_image(r_full.content)
        assert typed[:20] in text
        assert has_img


# ---------- Typed-only regression + attachment download ----------
class TestRegression:
    def test_typed_only_signing_still_works(self, admin_h, intern_h):
        d = _create_doc(admin_h, "TEST_iter81 typed only")
        r = requests.post(
            f"{API}/hr/sign-docs/{d['id']}/sign",
            json={"signed_name": "Only Typed Iter81"},  # no data_url, no x/y
            headers=intern_h, timeout=30,
        )
        assert r.status_code == 200, r.text
        sig = r.json()["signature"]
        assert sig["typed_signature"] == "Only Typed Iter81"
        assert sig.get("x") is None and sig.get("y") is None

        # PDF must still render & contain typed name in the signatures table
        r2 = requests.get(f"{API}/hr/sign-docs/{d['id']}/pdf", headers=admin_h, timeout=60)
        assert r2.status_code == 200 and r2.content[:4] == b"%PDF"
        text, _ = _pdf_text_and_has_image(r2.content)
        assert "Only Typed Iter81" in text

    def test_list_and_attachment_download(self, admin_h):
        d = _create_doc(admin_h, "TEST_iter81 attach dl", attach=True)
        r = requests.get(f"{API}/hr/sign-docs", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert any(x["id"] == d["id"] for x in r.json())
        att_id = d["attachments"][0]["id"]
        r_dl = requests.get(
            f"{API}/hr/sign-docs/{d['id']}/attachments/{att_id}/download",
            headers=admin_h, timeout=30,
        )
        assert r_dl.status_code == 200
        j = r_dl.json()
        assert j["name"].endswith(".pdf")
        assert j["content_base64"] == _minimal_pdf_b64()
