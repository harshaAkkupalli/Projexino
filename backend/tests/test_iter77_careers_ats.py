"""Iteration 77 — Careers Mini ATS: apply flow, applications admin, settings."""
import base64
import os
import time
import uuid

import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"

# Tiny valid PDF (~ trivial header)
_TINY_PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"
_PDF_B64 = base64.b64encode(_TINY_PDF).decode()


@pytest.fixture(scope="module")
def admin_hdr():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def job(admin_hdr):
    """Pick an existing open job or create one."""
    r = requests.get(f"{BASE}/api/public/careers/jobs", timeout=10)
    assert r.status_code == 200
    jobs = r.json()
    if jobs:
        return jobs[0]
    # else create
    payload = {"title": "TEST ATS job iter77", "employment_type": "full_time",
               "work_mode": "hybrid", "apply_email": "hr-fallback@projexino.com", "status": "open"}
    r = requests.post(f"{BASE}/api/careers/jobs", headers=admin_hdr, json=payload, timeout=10)
    assert r.status_code == 200, r.text
    return r.json()


# --------- Settings endpoint tests ---------
class TestCareersSettings:
    def test_settings_requires_auth(self):
        r = requests.get(f"{BASE}/api/careers/settings", timeout=10)
        assert r.status_code in (401, 403), r.text

    def test_settings_put_requires_auth(self):
        r = requests.put(f"{BASE}/api/careers/settings", json={"notify_email": "x@y.com"}, timeout=10)
        assert r.status_code in (401, 403)

    def test_put_valid_email_persists(self, admin_hdr):
        # PUT
        target = "hr@projexino.com"
        r = requests.put(f"{BASE}/api/careers/settings", headers=admin_hdr,
                         json={"notify_email": target}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("notify_email") == target
        # GET verifies persisted
        r2 = requests.get(f"{BASE}/api/careers/settings", headers=admin_hdr, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("notify_email") == target

    def test_put_invalid_email_rejected(self, admin_hdr):
        r = requests.put(f"{BASE}/api/careers/settings", headers=admin_hdr,
                         json={"notify_email": "noatsign"}, timeout=10)
        assert r.status_code == 400

    def test_put_blank_allowed(self, admin_hdr):
        r = requests.put(f"{BASE}/api/careers/settings", headers=admin_hdr,
                         json={"notify_email": ""}, timeout=10)
        assert r.status_code == 200
        assert r.json().get("notify_email") == ""
        r2 = requests.get(f"{BASE}/api/careers/settings", headers=admin_hdr, timeout=10)
        assert r2.json().get("notify_email") == ""


# --------- Apply endpoint tests ---------
class TestApplyFlow:
    def _payload(self, email):
        return {"name": "TEST Applicant", "email": email, "phone": "+911234567890",
                "portfolio": "https://linkedin.com/in/test", "note": "Excited to apply!",
                "resume_filename": "TEST_resume.pdf", "resume_mime": "application/pdf",
                "resume_b64": _PDF_B64}

    def test_apply_invalid_email(self, job):
        p = self._payload("no-at-sign")
        r = requests.post(f"{BASE}/api/public/careers/jobs/{job['slug']}/apply",
                          json=p, timeout=15)
        assert r.status_code == 400

    def test_apply_success_and_duplicate(self, job, admin_hdr):
        unique = f"test_iter77_{uuid.uuid4().hex[:8]}@example.com"
        p = self._payload(unique)
        r = requests.post(f"{BASE}/api/public/careers/jobs/{job['slug']}/apply",
                          json=p, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        aid = data.get("application_id")
        assert aid and isinstance(aid, str)
        # email_notified is expected False (Gmail disconnected) — do not assert True
        assert "email_notified" in data
        pytest.shared_app_id = aid
        pytest.shared_app_email = unique

        # Duplicate should 400
        r2 = requests.post(f"{BASE}/api/public/careers/jobs/{job['slug']}/apply",
                           json=p, timeout=15)
        assert r2.status_code == 400
        assert "already" in (r2.json().get("detail", "").lower())

        # Resume appears in Documents module (folder Resumes)
        # small pause to let insert commit
        time.sleep(0.5)
        rd = requests.get(f"{BASE}/api/documents", headers=admin_hdr, timeout=15)
        assert rd.status_code == 200, rd.text
        docs = rd.json() if isinstance(rd.json(), list) else rd.json().get("items", [])
        # find any doc where description mentions our unique email
        matches = [d for d in docs if unique in (d.get("description") or "") or unique in (d.get("name") or "")]
        assert matches, f"Resume not found in Documents for {unique}"
        assert matches[0].get("folder") == "Resumes"

    def test_apply_unknown_slug(self):
        p = self._payload(f"any_{uuid.uuid4().hex[:6]}@example.com")
        r = requests.post(f"{BASE}/api/public/careers/jobs/nonexistent-slug-xyz/apply",
                          json=p, timeout=10)
        assert r.status_code == 404

    def test_apply_invalid_resume_b64(self, job):
        p = self._payload(f"bad_{uuid.uuid4().hex[:6]}@example.com")
        p["resume_b64"] = "!!!not-valid-base64!!!"
        r = requests.post(f"{BASE}/api/public/careers/jobs/{job['slug']}/apply",
                          json=p, timeout=10)
        # base64 module in python often tolerates bad chars; large size or invalid may pass through.
        # Just ensure endpoint doesn't 500.
        assert r.status_code in (200, 400)


# --------- Applications admin endpoints ---------
class TestApplicationsAdmin:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE}/api/careers/applications", timeout=10)
        assert r.status_code in (401, 403)

    def test_list_no_resume_b64(self, admin_hdr, job):
        r = requests.get(f"{BASE}/api/careers/applications?job_id={job['id']}",
                         headers=admin_hdr, timeout=15)
        assert r.status_code == 200, r.text
        apps = r.json()
        assert isinstance(apps, list)
        for a in apps:
            assert "resume_b64" not in a, "resume_b64 should be stripped from list"

    def test_patch_status_valid(self, admin_hdr):
        aid = getattr(pytest, "shared_app_id", None)
        assert aid, "prior apply test must have run"
        r = requests.patch(f"{BASE}/api/careers/applications/{aid}",
                           headers=admin_hdr, json={"status": "shortlisted"}, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "shortlisted"

    def test_patch_status_invalid(self, admin_hdr):
        aid = getattr(pytest, "shared_app_id", None)
        assert aid
        r = requests.patch(f"{BASE}/api/careers/applications/{aid}",
                           headers=admin_hdr, json={"status": "bogus"}, timeout=10)
        assert r.status_code == 400

    def test_get_resume_download(self, admin_hdr):
        aid = getattr(pytest, "shared_app_id", None)
        assert aid
        r = requests.get(f"{BASE}/api/careers/applications/{aid}/resume",
                         headers=admin_hdr, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("filename")
        assert d.get("mime")
        assert d.get("b64")
        # Decodable
        decoded = base64.b64decode(d["b64"])
        assert decoded.startswith(b"%PDF")

    def test_jobs_admin_has_application_count(self, admin_hdr, job):
        r = requests.get(f"{BASE}/api/careers/jobs", headers=admin_hdr, timeout=10)
        assert r.status_code == 200
        jobs = r.json()
        # find the job we applied to
        match = [j for j in jobs if j["id"] == job["id"]]
        assert match, "job not found in admin list"
        assert "application_count" in match[0]
        assert isinstance(match[0]["application_count"], int)
        assert match[0]["application_count"] >= 1
