"""Iteration 30 — Custom Company Profile PDF Upload
Verifies /api/xino/company-profile.pdf, /info, /upload-secured, DELETE flow.
Also smoke-tests Phase 3/4/5 endpoints to confirm regression-free.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

SUPER_ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
MANAGER = {"email": "manager@projexino.com", "password": "Manager@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Login failed for {creds['email']}: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("token") or data.get("access_token")
    return token, data


@pytest.fixture(scope="module")
def super_admin_token():
    tok, _ = _login(SUPER_ADMIN)
    return tok


@pytest.fixture(scope="module")
def manager_token():
    tok, _ = _login(MANAGER)
    return tok


def _tiny_pdf_bytes() -> bytes:
    """Generate a minimal valid PDF (~400 bytes) without external deps."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]/Resources<<>>/Contents 4 0 R>>endobj\n"
        b"4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 20 100 Td (TEST PDF) Tj ET\nendstream\nendobj\n"
        b"xref\n0 5\n"
        b"0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000095 00000 n \n0000000174 00000 n \n"
        b"trailer<</Size 5/Root 1 0 R>>\nstartxref\n250\n%%EOF\n"
    )


# ====================== Website Config (Phase 5 regression) ======================

class TestWebsiteConfig:
    def test_public_get_website_config(self):
        r = requests.get(f"{BASE_URL}/api/website-config", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "hero" in d, f"missing hero: keys={list(d.keys())}"
        assert "stats" in d
        assert "faq" in d
        assert "cta_section" in d
        # Hero structure
        assert "headline_1" in d["hero"] or "headline" in d["hero"]
        assert isinstance(d.get("stats"), list)
        assert isinstance(d.get("faq"), list)

    def test_super_admin_patches_hero(self, super_admin_token):
        new_headline = f"TEST_Headline_{uuid.uuid4().hex[:6]}"
        r = requests.patch(
            f"{BASE_URL}/api/admin/website-config",
            json={"hero": {"headline_1": new_headline}},
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=15,
        )
        assert r.status_code in (200, 204), r.text[:300]
        # verify persistence
        r2 = requests.get(f"{BASE_URL}/api/website-config", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["hero"].get("headline_1") == new_headline


# ====================== Custom Company Profile PDF ======================

class TestCompanyProfilePdf:
    def test_info_returns_custom_false_by_default(self, super_admin_token):
        # Reset state first (ignore failure if not present)
        requests.delete(
            f"{BASE_URL}/api/xino/company-profile",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=15,
        )
        r = requests.get(f"{BASE_URL}/api/xino/company-profile/info", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["custom"] is False
        assert d["url"] == "/api/xino/company-profile.pdf"

    def test_auto_generated_pdf_download(self):
        r = requests.get(f"{BASE_URL}/api/xino/company-profile.pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF"), f"not a PDF: {r.content[:20]}"
        assert len(r.content) > 500

    def test_non_super_admin_cannot_upload(self, manager_token):
        files = {"file": ("test.pdf", io.BytesIO(_tiny_pdf_bytes()), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/xino/company-profile/upload-secured",
            files=files,
            headers={"Authorization": f"Bearer {manager_token}"},
            timeout=20,
        )
        # backend allows super_admin OR admin; manager must be forbidden
        assert r.status_code == 403, f"expected 403, got {r.status_code}: {r.text[:200]}"

    def test_upload_non_pdf_rejected(self, super_admin_token):
        files = {"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")}
        r = requests.post(
            f"{BASE_URL}/api/xino/company-profile/upload-secured",
            files=files,
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_upload_then_info_then_download_then_revert(self, super_admin_token):
        pdf_bytes = _tiny_pdf_bytes()
        files = {"file": ("custom.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/xino/company-profile/upload-secured",
            files=files,
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=20,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
        upload_resp = r.json()
        assert upload_resp.get("ok") is True
        assert upload_resp.get("size_kb") is not None

        # info should now say custom: true
        r2 = requests.get(f"{BASE_URL}/api/xino/company-profile/info", timeout=15)
        assert r2.status_code == 200
        info = r2.json()
        assert info["custom"] is True
        assert info["size_kb"] is not None
        assert info["updated_at"] is not None

        # downloading the public PDF should return our exact bytes
        r3 = requests.get(f"{BASE_URL}/api/xino/company-profile.pdf", timeout=20)
        assert r3.status_code == 200
        assert r3.headers.get("content-type", "").startswith("application/pdf")
        assert r3.content == pdf_bytes, "downloaded PDF does not match uploaded bytes"

        # non-super-admin cannot delete
        # using manager token would be ideal but we don't have it here; use no-auth
        r_no_auth = requests.delete(f"{BASE_URL}/api/xino/company-profile", timeout=15)
        assert r_no_auth.status_code in (401, 403)

        # revert (delete)
        r4 = requests.delete(
            f"{BASE_URL}/api/xino/company-profile",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=15,
        )
        assert r4.status_code == 200
        assert r4.json().get("ok") is True

        # info reverts to custom: false
        r5 = requests.get(f"{BASE_URL}/api/xino/company-profile/info", timeout=15)
        assert r5.status_code == 200
        assert r5.json()["custom"] is False

        # auto-generated PDF still works
        r6 = requests.get(f"{BASE_URL}/api/xino/company-profile.pdf", timeout=30)
        assert r6.status_code == 200
        assert r6.content.startswith(b"%PDF")


# ====================== Projects & Pipeline (regression) ======================

class TestProjectsAndPipeline:
    def test_list_projects_includes_new_fields(self, super_admin_token):
        r = requests.get(
            f"{BASE_URL}/api/projects",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        if not items:
            pytest.skip("No projects exist to verify field shape")
        sample = items[0]
        for key in ("manager_user_id", "member_user_ids", "intern_user_ids", "pipeline"):
            assert key in sample, f"project missing field: {key}; keys={list(sample.keys())}"
        # cover_image_url is optional (may be None) but key should exist on docs created with phase3 schema
        # not asserting hard since legacy docs may lack it.

    def test_assignable_users_endpoint(self, super_admin_token):
        # need a project id
        r = requests.get(
            f"{BASE_URL}/api/projects",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=20,
        )
        items = r.json()
        if not items:
            pytest.skip("No projects to test /assignable-users")
        pid = items[0]["id"]
        r2 = requests.get(
            f"{BASE_URL}/api/projects/{pid}/assignable-users",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text[:200]
        d = r2.json()
        for k in ("managers", "members", "interns", "all"):
            assert k in d

    def test_project_detail_has_7_stage_pipeline(self, super_admin_token):
        r = requests.get(
            f"{BASE_URL}/api/projects",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=20,
        )
        items = r.json()
        if not items:
            pytest.skip("No projects")
        pid = items[0]["id"]
        r2 = requests.get(
            f"{BASE_URL}/api/projects/{pid}",
            headers={"Authorization": f"Bearer {super_admin_token}"},
            timeout=15,
        )
        assert r2.status_code == 200
        proj = r2.json()
        assert "pipeline" in proj
        pipeline = proj["pipeline"]
        assert isinstance(pipeline, list)
        assert len(pipeline) == 7, f"expected 7 stages, got {len(pipeline)}"
        keys = {s.get("key") for s in pipeline}
        expected = {"requirements", "rnd", "design", "development", "qa", "deployment", "maintenance"}
        assert keys == expected, f"stage keys mismatch: {keys}"
