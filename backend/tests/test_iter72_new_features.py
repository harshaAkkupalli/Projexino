"""Iter72 backend regression tests for:
   (1) HR Letters format endpoint (no-AI paste-and-design) → themed body_html
   (2) HR Letters PATCH accepts employee_name / template etc.
   (3) HR Letters duplicate endpoint clones the letter
   (4) HR Letters PDF endpoint returns PDF bytes
   (5) Documents CRUD with folder field
   (6) Documents /move endpoint (bulk move)
   (7) Documents /share-email endpoint (fails at Gmail stage — expected)
"""
import os, base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

TINY_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --------------------- HR Letters ---------------------

class TestHRLettersNewFeatures:
    def test_create_test_letter(self, session):
        payload = {
            "template": "warning_letter",
            "employee_name": "TEST Iter72 Emp",
            "employee_email": "test.iter72@example.com",
            "position": "Software Engineer",
            "department": "Engineering",
            "ctc": "10 LPA",
        }
        r = session.post(f"{BASE_URL}/api/hr/letters", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["id"]
        assert data["template"] == "warning_letter"
        pytest.letter_id = data["id"]

    def test_format_endpoint_returns_themed_html(self, session):
        lid = pytest.letter_id
        raw = (
            "Subject: Test warning notice\n\n"
            "OFFICIAL WARNING HEADING\n\n"
            "Dear TEST Iter72 Emp,\n\n"
            "This is paragraph one about attendance.\n\n"
            "- Missed 3 stand-ups\n- Late arrivals\n- Unresponsive on Slack\n\n"
            "Please improve within 30 days.\n\n"
            "Regards,\nHR Team"
        )
        r = session.post(f"{BASE_URL}/api/hr/letters/{lid}/format", json={"text": raw}, timeout=30)
        assert r.status_code == 200, r.text
        body_html = r.json().get("body_html", "")
        assert body_html, "body_html should not be empty"
        # Warning-letter accent color should be present
        assert "#DC2626" in body_html or "dc2626" in body_html.lower(), "warning accent color missing"
        # Chip / heading text for warning letter
        assert "OFFICIAL WARNING" in body_html.upper()
        # Subject line should appear
        assert "Test warning notice" in body_html
        # Bullets rendered
        assert "<li" in body_html.lower() or "•" in body_html

        # Verify persistence via GET
        rg = session.get(f"{BASE_URL}/api/hr/letters/{lid}", timeout=30)
        assert rg.status_code == 200
        assert rg.json().get("body_html", "").startswith(body_html[:50])

    def test_patch_updates_details(self, session):
        lid = pytest.letter_id
        r = session.patch(f"{BASE_URL}/api/hr/letters/{lid}", json={
            "employee_name": "TEST Iter72 Renamed",
            "position": "Senior SDE",
            "department": "Platform",
            "template": "experience_letter",
        }, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["employee_name"] == "TEST Iter72 Renamed"
        assert d["position"] == "Senior SDE"
        assert d["template"] == "experience_letter"

        # Verify GET persistence
        rg = session.get(f"{BASE_URL}/api/hr/letters/{lid}", timeout=30)
        assert rg.json()["employee_name"] == "TEST Iter72 Renamed"
        assert rg.json()["template"] == "experience_letter"

    def test_duplicate(self, session):
        lid = pytest.letter_id
        r = session.post(f"{BASE_URL}/api/hr/letters/{lid}/duplicate", timeout=30)
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d["id"] != lid
        assert "copy" in d.get("title", "").lower() or "copy" in d.get("employee_name", "").lower()
        pytest.dup_letter_id = d["id"]

    def test_pdf_download(self, session):
        lid = pytest.letter_id
        r = session.get(f"{BASE_URL}/api/hr/letters/{lid}/pdf", timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.content[:5] == b"%PDF-", "should return PDF magic bytes"
        assert len(r.content) > 2000

    def test_cleanup_letters(self, session):
        for lid_attr in ("letter_id", "dup_letter_id"):
            lid = getattr(pytest, lid_attr, None)
            if lid:
                r = session.delete(f"{BASE_URL}/api/hr/letters/{lid}", timeout=30)
                assert r.status_code in (200, 204), r.text


# --------------------- Documents folder / move / share-email ---------------------

class TestDocumentsFolderShare:
    def test_upload_two_documents_with_folder(self, session):
        content_b64 = base64.b64encode(b"Hello Iter72 test file content").decode()
        pytest.doc_ids = []
        for i, folder in enumerate(["TEST Iter72 Folder", ""]):
            payload = {
                "name": f"TEST_iter72_doc_{i}.txt",
                "mime_type": "text/plain",
                "size": len("Hello Iter72 test file content"),
                "content_base64": content_b64,
                "description": "iter72 test",
                "folder": folder,
            }
            r = session.post(f"{BASE_URL}/api/documents", json=payload, timeout=30)
            assert r.status_code in (200, 201), r.text
            d = r.json()
            assert d["name"] == payload["name"]
            assert d.get("folder", "") == folder
            pytest.doc_ids.append(d["id"])

        # GET verify persistence
        rg = session.get(f"{BASE_URL}/api/documents", timeout=30)
        assert rg.status_code == 200
        all_docs = rg.json()
        found = [d for d in all_docs if d["id"] in pytest.doc_ids]
        assert len(found) == 2
        folders = {d["folder"] for d in found}
        assert "TEST Iter72 Folder" in folders

    def test_move_endpoint(self, session):
        # Move the unfoldered doc (index 1) to TEST Iter72 Folder
        target = pytest.doc_ids[1]
        r = session.post(f"{BASE_URL}/api/documents/move", json={
            "ids": [target],
            "folder": "TEST Iter72 Folder",
        }, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("moved", 0) >= 1

        # Verify folder updated
        rg = session.get(f"{BASE_URL}/api/documents", timeout=30)
        moved_doc = next((d for d in rg.json() if d["id"] == target), None)
        assert moved_doc is not None
        assert moved_doc["folder"] == "TEST Iter72 Folder"

    def test_share_email_expected_gmail_error(self, session):
        # By folder
        r = session.post(f"{BASE_URL}/api/documents/share-email", json={
            "to": "test@example.com",
            "subject": "Iter72 test",
            "message": "hi",
            "folder": "TEST Iter72 Folder",
            "doc_ids": [],
        }, timeout=45)
        # Expected 400 (Gmail disconnected in this environment) — build succeeded, only send failed
        assert r.status_code in (400, 200), r.text
        if r.status_code == 400:
            assert "gmail" in r.text.lower() or "connect" in r.text.lower() or "google" in r.text.lower()

        # By doc_ids
        r2 = session.post(f"{BASE_URL}/api/documents/share-email", json={
            "to": "test@example.com",
            "subject": "Iter72 test 2",
            "message": "hi2",
            "folder": "",
            "doc_ids": pytest.doc_ids,
        }, timeout=45)
        assert r2.status_code in (400, 200), r2.text

    def test_cleanup_docs(self, session):
        for did in getattr(pytest, "doc_ids", []):
            r = session.delete(f"{BASE_URL}/api/documents/{did}", timeout=30)
            assert r.status_code in (200, 204, 404)
