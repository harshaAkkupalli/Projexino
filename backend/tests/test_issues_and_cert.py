"""Tests for new Issues & Errors tracker + certificate signatory removal."""
import os
import re
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
MEMBER = ("member@projexino.com", "Member@2026")
INTERN = ("intern@projexino.com", "Intern@2026")

# 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, r.json()


@pytest.fixture(scope="module")
def admin_s():
    s, _ = _login(*ADMIN)
    return s


@pytest.fixture(scope="module")
def member_s():
    s, _ = _login(*MEMBER)
    return s


@pytest.fixture(scope="module")
def intern_s():
    s, _ = _login(*INTERN)
    return s


# ---- Issues feature ----
class TestIssues:
    created_id = None

    def test_create_issue_admin(self, admin_s):
        payload = {
            "title": f"TEST_Issue_{uuid.uuid4().hex[:6]}",
            "description": "Image-upload regression on safari",
            "type": "error",
            "priority": "critical",
            "assignee": "Team Member",
            "url": "https://example.com/bug",
            "image_base64": TINY_PNG_B64,
            "image_mime": "image/png",
            "image_name": "screenshot.png",
        }
        r = admin_s.post(f"{API}/issues", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data and isinstance(data["id"], str)
        assert data["title"] == payload["title"]
        assert data["type"] == "error"
        assert data["priority"] == "critical"
        assert data["has_image"] is True
        assert data["comments_count"] == 0
        assert "_id" not in data
        # heavy field omitted from create summary
        assert "image_base64" not in data
        TestIssues.created_id = data["id"]

    def test_list_issues_admin(self, admin_s):
        r = admin_s.get(f"{API}/issues")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        ids = [i["id"] for i in items]
        assert TestIssues.created_id in ids
        # no _id keys in any item
        for it in items:
            assert "_id" not in it
            assert "image_base64" not in it

    def test_list_issues_filter_status(self, admin_s):
        r = admin_s.get(f"{API}/issues", params={"status": "open"})
        assert r.status_code == 200
        for it in r.json():
            assert it["status"] == "open"

    def test_list_issues_filter_type(self, admin_s):
        r = admin_s.get(f"{API}/issues", params={"type_": "error"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1
        for it in items:
            assert it["type"] == "error"

    def test_get_issue_full(self, admin_s):
        r = admin_s.get(f"{API}/issues/{TestIssues.created_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == TestIssues.created_id
        assert data["image_base64"] == TINY_PNG_B64
        assert isinstance(data["comments"], list)

    def test_patch_status_admin(self, admin_s):
        r = admin_s.patch(f"{API}/issues/{TestIssues.created_id}", json={"status": "in_progress"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_progress"
        # verify GET reflects the change
        r2 = admin_s.get(f"{API}/issues/{TestIssues.created_id}")
        assert r2.json()["status"] == "in_progress"

    def test_member_cannot_patch_when_not_assignee(self, member_s):
        # assignee was 'Team Member' (display name). Check the actual user name.
        me = member_s.get(f"{API}/auth/me").json()
        # If member's name matches "Team Member" they CAN patch; otherwise 403.
        r = member_s.patch(
            f"{API}/issues/{TestIssues.created_id}", json={"status": "completed"}
        )
        if me.get("name", "").lower() == "team member":
            assert r.status_code == 200
        else:
            assert r.status_code == 403, f"expected 403 for non-assignee, got {r.status_code}: {r.text}"

    def test_add_comment(self, admin_s):
        r = admin_s.post(
            f"{API}/issues/{TestIssues.created_id}/comments", json={"text": "Reproduced"}
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["text"] == "Reproduced"
        assert c["author_role"] == "admin"
        assert "author" in c and "id" in c
        # verify it shows in detail
        r2 = admin_s.get(f"{API}/issues/{TestIssues.created_id}")
        comments = r2.json()["comments"]
        assert any(cc["id"] == c["id"] for cc in comments)

    def test_comment_by_member(self, member_s):
        r = member_s.post(
            f"{API}/issues/{TestIssues.created_id}/comments", json={"text": "I will look at it"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["author_role"] in ("team_member", "member")

    def test_delete_non_admin_forbidden(self, member_s):
        r = member_s.delete(f"{API}/issues/{TestIssues.created_id}")
        assert r.status_code == 403

    def test_delete_admin_ok(self, admin_s):
        r = admin_s.delete(f"{API}/issues/{TestIssues.created_id}")
        assert r.status_code == 200
        assert r.json().get("ok") is True
        # verify gone
        r2 = admin_s.get(f"{API}/issues/{TestIssues.created_id}")
        assert r2.status_code == 404


# ---- Certificate signatory removal ----
class TestCertificate:
    def test_intern_certificate_pdf(self, intern_s):
        r = intern_s.get(f"{API}/me/intern/certificate")
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert "application/pdf" in ctype, ctype
        body = r.content
        assert body[:4] == b"%PDF"

        # Try pdfminer if available; else fall back to byte search.
        text = ""
        try:
            from pdfminer.high_level import extract_text
            import io
            text = extract_text(io.BytesIO(body))
        except Exception:
            text = body.decode("latin-1", errors="ignore")

        # Should NOT contain removed signature copy
        forbidden = ["Authorized Signatory", "Reporting Manager", "SEAL OF EXCELLENCE"]
        for word in forbidden:
            assert word not in text, f"PDF still contains forbidden text: {word!r}"

        # Should contain new chip / tagline
        # PDFs sometimes split text on spaces; do a lax check
        assert re.search(r"DIGITALLY\s*ISSUED\s*CERTIFICATE", text, re.I), "Missing 'DIGITALLY ISSUED CERTIFICATE'"
        assert re.search(r"digitally\s*issued", text, re.I), "Missing 'This document is digitally issued' tagline"


# ---- Regression smoke ----
class TestRegression:
    def test_dashboard(self, admin_s):
        r = admin_s.get(f"{API}/dashboard/stats")
        assert r.status_code == 200

    def test_leads(self, admin_s):
        r = admin_s.get(f"{API}/leads")
        assert r.status_code == 200

    def test_tasks(self, admin_s):
        r = admin_s.get(f"{API}/tasks")
        assert r.status_code == 200

    def test_team(self, admin_s):
        r = admin_s.get(f"{API}/team")
        assert r.status_code == 200

    def test_projects(self, admin_s):
        r = admin_s.get(f"{API}/projects")
        assert r.status_code == 200

    def test_manager_interns(self, admin_s):
        r = admin_s.get(f"{API}/manager/interns")
        assert r.status_code == 200

    def test_settings(self, admin_s):
        r = admin_s.get(f"{API}/settings")
        assert r.status_code in (200, 404)  # endpoint optional

    def test_badges(self, admin_s):
        r = admin_s.get(f"{API}/badges")
        assert r.status_code in (200, 404)
