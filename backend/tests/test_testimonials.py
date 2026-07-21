"""Testimonials module backend tests (Iter 52).

Covers admin CRUD, requests flow, public submission, analytics, video stream and auth gating.
"""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}


# --------------- Fixtures ---------------
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return s


@pytest.fixture(scope="module")
def intern_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=INTERN, timeout=20)
    if r.status_code != 200:
        pytest.skip("intern user not available for auth gating tests")
    return s


@pytest.fixture(scope="module")
def created_ids():
    return {"testimonials": [], "requests": []}


# --------------- Tests ---------------
class TestAdminCRUD:
    def test_create_testimonial(self, admin_session, created_ids):
        payload = {
            "client_name": "TEST_Acme Corp",
            "company": "Acme",
            "project_name": "TEST_Website Refresh",
            "rating": 5,
            "message": "TEST_amazing work and on time delivery",
            "format": "text",
        }
        r = admin_session.post(f"{API}/testimonials", json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["client_name"] == "TEST_Acme Corp"
        assert data["status"] == "pending"
        assert "id" in data
        created_ids["testimonials"].append(data["id"])

    def test_list_filters(self, admin_session):
        r = admin_session.get(f"{API}/testimonials?status=pending", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)

    def test_patch_approve_feature(self, admin_session, created_ids):
        tid = created_ids["testimonials"][0]
        r = admin_session.patch(f"{API}/testimonials/{tid}", json={"status": "approved", "featured": True}, timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "approved"
        assert d["featured"] is True
        assert d.get("approved_at")
        # GET to verify persistence
        r2 = admin_session.get(f"{API}/testimonials/{tid}", timeout=20)
        assert r2.status_code == 200
        assert r2.json()["status"] == "approved"

    def test_patch_reject(self, admin_session, created_ids):
        # Create a second one to reject
        r = admin_session.post(f"{API}/testimonials", json={
            "client_name": "TEST_Reject Co", "rating": 3, "message": "TEST_okay-ish work",
        }, timeout=20)
        assert r.status_code in (200, 201)
        tid = r.json()["id"]
        created_ids["testimonials"].append(tid)
        r2 = admin_session.patch(f"{API}/testimonials/{tid}", json={"status": "rejected"}, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["status"] == "rejected"


class TestRequests:
    def test_create_request(self, admin_session, created_ids):
        r = admin_session.post(f"{API}/testimonial-requests", json={
            "client_name": "TEST_RequestUser",
            "company": "TEST_Co",
            "email": "test_request_user@example.com",
            "project_name": "TEST_Project X",
            "send_email": False,
        }, timeout=20)
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert "request" in body and "link" in body and "email_sent" in body
        assert "/testimonial/" in body["link"]
        created_ids["requests"].append(body["request"]["id"])
        created_ids["token"] = body["request"]["token"]
        created_ids["link"] = body["link"]

    def test_list_requests(self, admin_session):
        r = admin_session.get(f"{API}/testimonial-requests?status=pending", timeout=20)
        assert r.status_code == 200
        assert "items" in r.json()

    def test_manual_remind(self, admin_session, created_ids):
        rid = created_ids["requests"][0]
        r = admin_session.post(f"{API}/testimonial-requests/{rid}/remind", timeout=20)
        # ok=false when Gmail not connected is acceptable
        assert r.status_code == 200
        assert "ok" in r.json()


class TestPublicSubmit:
    def test_by_token_prefill(self, created_ids):
        token = created_ids.get("token")
        if not token:
            pytest.skip("no token from previous test")
        r = requests.get(f"{API}/public/testimonials/by-token/{token}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["client_name"] == "TEST_RequestUser"
        assert data["already_submitted"] is False

    def test_by_token_invalid(self):
        r = requests.get(f"{API}/public/testimonials/by-token/INVALID_TOKEN_XYZ", timeout=20)
        assert r.status_code == 404

    def test_submit_text_then_duplicate_fails(self, created_ids):
        token = created_ids.get("token")
        if not token:
            pytest.skip("no token")
        # First submission with a tiny synthetic video
        fake_video = b"\x1aE\xdf\xa3" + b"\x00" * 2048  # webm-ish bytes
        files = {"video": ("test.webm", io.BytesIO(fake_video), "video/webm")}
        data = {
            "client_name": "TEST_RequestUser",
            "company": "TEST_Co",
            "project_name": "TEST_Project X",
            "rating": "5",
            "message": "TEST_loved working with the projexino team — great delivery!",
        }
        r = requests.post(f"{API}/public/testimonials/submit/{token}", data=data, files=files, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "id" in body
        created_ids["public_tid"] = body["id"]

        # Second attempt should fail
        r2 = requests.post(f"{API}/public/testimonials/submit/{token}", data=data, timeout=20)
        assert r2.status_code == 400


class TestPublicListing:
    def test_public_list_approved_only(self):
        r = requests.get(f"{API}/public/testimonials", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        for it in data["items"]:
            assert it["status"] == "approved"
            # email/admin_note should be stripped
            assert "email" not in it or it.get("email") in ("", None)


class TestVideoStream:
    def test_path_traversal_rejected(self):
        r = requests.get(f"{API}/uploads/testimonials/..%2F..%2Fetc%2Fpasswd", timeout=20)
        # Should not return the passwd file; either 404 or a route mismatch
        assert r.status_code in (404, 400)

    def test_serves_uploaded_file(self, admin_session, created_ids):
        tid = created_ids.get("public_tid")
        if not tid:
            pytest.skip("no public submission video to verify")
        # fetch admin record to get video_path
        r = admin_session.get(f"{API}/testimonials/{tid}", timeout=20)
        assert r.status_code == 200
        vp = r.json().get("video_path")
        if not vp:
            pytest.skip("no video_path stored")
        r2 = requests.get(f"{API}/uploads/testimonials/{vp}", timeout=20)
        assert r2.status_code == 200
        assert len(r2.content) > 0


class TestAnalytics:
    def test_analytics_shape(self, admin_session):
        r = admin_session.get(f"{API}/testimonials/analytics", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["total", "approved", "pending", "rejected", "with_video", "avg_rating",
                  "approval_rate", "requests_total", "requests_pending", "requests_completed",
                  "response_rate"]:
            assert k in d, f"missing {k}"


class TestAuthGating:
    def test_no_auth_create_blocked(self):
        r = requests.post(f"{API}/testimonials", json={
            "client_name": "X", "message": "TEST_ should fail", "rating": 5
        }, timeout=20)
        assert r.status_code in (401, 403)

    def test_intern_blocked(self, intern_session):
        r = intern_session.post(f"{API}/testimonials", json={
            "client_name": "X", "message": "TEST_intern blocked", "rating": 5
        }, timeout=20)
        assert r.status_code == 403

    def test_public_listing_works_unauth(self):
        r = requests.get(f"{API}/public/testimonials", timeout=20)
        assert r.status_code == 200


class TestCleanupAndCancel:
    def test_cancel_request(self, admin_session):
        # Create a request, cancel it
        r = admin_session.post(f"{API}/testimonial-requests", json={
            "client_name": "TEST_Cancel", "email": "cancel@example.com", "send_email": False,
        }, timeout=20)
        rid = r.json()["request"]["id"]
        r2 = admin_session.delete(f"{API}/testimonial-requests/{rid}", timeout=20)
        assert r2.status_code == 200

    def test_delete_testimonials(self, admin_session, created_ids):
        for tid in created_ids["testimonials"]:
            r = admin_session.delete(f"{API}/testimonials/{tid}", timeout=20)
            assert r.status_code == 200
        # delete public-submitted one
        pid = created_ids.get("public_tid")
        if pid:
            admin_session.delete(f"{API}/testimonials/{pid}", timeout=20)
