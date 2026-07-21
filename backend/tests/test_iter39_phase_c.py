"""
Iter 39 / Phase C — Sign-doc attachments + Documents upload regression.

Covers:
  • POST /api/hr/sign-docs with attachments  → 200, attachments stripped of content_base64
  • GET  /api/hr/sign-docs                   → list strips content_base64
  • GET  /api/hr/sign-docs/{id}/attachments/{aid}/download → returns base64
  • 10 MB cap → 400 with 'exceeds 10MB limit'
  • Unknown doc_id / att_id → 404
  • Regression: create sign-doc without attachments, sign, delete
  • Regression: /api/documents upload, download, delete still works
"""
import base64
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


# ─────────────────────────────────────────────────────────────────────
# HR Sign-Docs with attachments
# ─────────────────────────────────────────────────────────────────────
class TestHrSignDocAttachments:
    def test_create_with_attachments_strips_base64(self, admin_session):
        payload = {
            "name": "TEST_QA_NDA_with_attach",
            "body_html": "<p>Please sign.</p>",
            "audience_role": "all",
            "attachments": [
                {
                    "name": "nda_a.pdf",
                    "mime_type": "application/pdf",
                    "size": 11,
                    "content_base64": _b64(b"hello world"),
                },
                {
                    "name": "nda_b.txt",
                    "mime_type": "text/plain",
                    "size": 5,
                    "content_base64": _b64(b"world"),
                },
            ],
        }
        r = admin_session.post(f"{BASE_URL}/api/hr/sign-docs", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["name"] == "TEST_QA_NDA_with_attach"
        assert isinstance(doc.get("attachments"), list) and len(doc["attachments"]) == 2
        for a in doc["attachments"]:
            assert "content_base64" not in a, "content_base64 must not be returned in create response"
            assert "id" in a and a["name"] and a["mime_type"]
        # stash on class
        TestHrSignDocAttachments.doc_id = doc["id"]
        TestHrSignDocAttachments.att_id = doc["attachments"][0]["id"]

    def test_list_strips_base64(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/hr/sign-docs", timeout=30)
        assert r.status_code == 200
        docs = r.json()
        ours = next((d for d in docs if d["id"] == TestHrSignDocAttachments.doc_id), None)
        assert ours is not None
        for a in ours.get("attachments") or []:
            assert "content_base64" not in a

    def test_download_attachment_returns_base64(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/hr/sign-docs/{TestHrSignDocAttachments.doc_id}/attachments/{TestHrSignDocAttachments.att_id}/download",
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "nda_a.pdf"
        assert body["mime_type"] == "application/pdf"
        assert base64.b64decode(body["content_base64"]) == b"hello world"

    def test_download_unknown_att_404(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/hr/sign-docs/{TestHrSignDocAttachments.doc_id}/attachments/does-not-exist/download",
            timeout=30,
        )
        assert r.status_code == 404

    def test_download_unknown_doc_404(self, admin_session):
        r = admin_session.get(
            f"{BASE_URL}/api/hr/sign-docs/no-such-doc/attachments/whatever/download",
            timeout=30,
        )
        assert r.status_code == 404

    def test_create_over_10mb_rejected(self, admin_session):
        payload = {
            "name": "TEST_QA_NDA_oversize",
            "body_html": "x",
            "attachments": [
                {"name": "big.bin", "mime_type": "application/octet-stream",
                 "size": 10 * 1024 * 1024 + 1, "content_base64": _b64(b"x")},
            ],
        }
        r = admin_session.post(f"{BASE_URL}/api/hr/sign-docs", json=payload, timeout=30)
        assert r.status_code == 400, r.text
        assert "exceeds 10MB limit" in (r.json().get("detail") or "")

    def test_cleanup_sign_doc(self, admin_session):
        r = admin_session.delete(
            f"{BASE_URL}/api/hr/sign-docs/{TestHrSignDocAttachments.doc_id}", timeout=30
        )
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────────────
# Sign-doc regression — no-attachment flow
# ─────────────────────────────────────────────────────────────────────
class TestHrSignDocRegression:
    def test_create_sign_delete(self, admin_session):
        r = admin_session.post(
            f"{BASE_URL}/api/hr/sign-docs",
            json={"name": "TEST_QA_NoAttach", "body_html": "<p>x</p>", "audience_role": "all"},
            timeout=30,
        )
        assert r.status_code == 200
        doc = r.json()
        assert doc.get("attachments") == []
        did = doc["id"]

        # sign
        r2 = admin_session.post(
            f"{BASE_URL}/api/hr/sign-docs/{did}/sign",
            json={"signed_name": "QA Admin"},
            timeout=30,
        )
        assert r2.status_code == 200
        assert r2.json().get("ok") is True

        # already signed → 400
        r3 = admin_session.post(
            f"{BASE_URL}/api/hr/sign-docs/{did}/sign",
            json={"signed_name": "QA Admin"},
            timeout=30,
        )
        assert r3.status_code == 400

        # delete
        r4 = admin_session.delete(f"{BASE_URL}/api/hr/sign-docs/{did}", timeout=30)
        assert r4.status_code == 200


# ─────────────────────────────────────────────────────────────────────
# /api/documents regression
# ─────────────────────────────────────────────────────────────────────
class TestDocumentsRegression:
    created_id = None

    def test_upload_get_delete(self, admin_session):
        payload = {
            "name": "TEST_QA_doc.txt",
            "mime_type": "text/plain",
            "size": 11,
            "content_base64": _b64(b"hello world"),
            "description": "qa probe",
        }
        r = admin_session.post(f"{BASE_URL}/api/documents", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc["name"] == "TEST_QA_doc.txt"
        assert "id" in doc
        TestDocumentsRegression.created_id = doc["id"]

        # download
        r2 = admin_session.get(f"{BASE_URL}/api/documents/{doc['id']}/download", timeout=30)
        assert r2.status_code == 200
        body = r2.json()
        assert base64.b64decode(body["content_base64"]) == b"hello world"

        # list contains it
        r3 = admin_session.get(f"{BASE_URL}/api/documents", timeout=30)
        assert r3.status_code == 200
        assert any(d["id"] == doc["id"] for d in r3.json())

        # delete
        r4 = admin_session.delete(f"{BASE_URL}/api/documents/{doc['id']}", timeout=30)
        assert r4.status_code in (200, 204)
