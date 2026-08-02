"""Iteration 76 — Careers (Job Postings) backend E2E tests."""
import io
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASS = "Projexino@2026"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, r.text
    return tok


@pytest.fixture(scope="module")
def admin_hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def created_job(admin_hdr):
    payload = {
        "title": "TEST QA Engineer iter76",
        "department": "Engineering",
        "employment_type": "full_time",
        "work_mode": "hybrid",
        "location": "Bengaluru, IN",
        "timings": "Mon-Fri 10-7",
        "salary_text": "As per industry standards",
        "experience": "2-4 years",
        "openings": 2,
        "skills": ["Pytest", "Playwright", "Selenium"],
        "summary": "QA role for testing platforms",
        "responsibilities": "Write automated tests\nRun CI",
        "requirements": "2y experience\nPython",
        "benefits": "Health insurance\nRemote-friendly",
        "apply_email": "careers@projexino.com",
        "status": "open",
    }
    r = requests.post(f"{BASE}/api/careers/jobs", headers=admin_hdr, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "slug" in data and data["slug"].startswith("test-qa-engineer-iter76")
    yield data
    # cleanup
    try:
        requests.delete(f"{BASE}/api/careers/jobs/{data['id']}", headers=admin_hdr, timeout=10)
    except Exception:
        pass


class TestCareersCRUD:
    def test_list_jobs_admin(self, admin_hdr, created_job):
        r = requests.get(f"{BASE}/api/careers/jobs", headers=admin_hdr, timeout=10)
        assert r.status_code == 200
        jobs = r.json()
        assert any(j["id"] == created_job["id"] for j in jobs)

    def test_invalid_employment_type_rejected(self, admin_hdr):
        r = requests.post(f"{BASE}/api/careers/jobs", headers=admin_hdr,
                          json={"title": "TEST bad", "employment_type": "bogus"}, timeout=10)
        assert r.status_code == 400

    def test_invalid_work_mode_rejected(self, admin_hdr):
        r = requests.post(f"{BASE}/api/careers/jobs", headers=admin_hdr,
                          json={"title": "TEST bad2", "work_mode": "moon"}, timeout=10)
        assert r.status_code == 400

    def test_patch_status_to_closed_removes_from_public(self, admin_hdr, created_job):
        # First confirm public sees it
        r = requests.get(f"{BASE}/api/public/careers/jobs?q=TEST QA Engineer iter76", timeout=10)
        assert r.status_code == 200
        assert any(j["slug"] == created_job["slug"] for j in r.json())
        # Close
        r = requests.patch(f"{BASE}/api/careers/jobs/{created_job['id']}",
                           headers=admin_hdr, json={"status": "closed"}, timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "closed"
        # Public list no longer has it
        r2 = requests.get(f"{BASE}/api/public/careers/jobs?q=iter76", timeout=10)
        assert r2.status_code == 200
        assert not any(j["slug"] == created_job["slug"] for j in r2.json())
        # Reopen for downstream tests
        requests.patch(f"{BASE}/api/careers/jobs/{created_job['id']}",
                       headers=admin_hdr, json={"status": "open"}, timeout=10)

    def test_public_search_filter(self):
        r = requests.get(f"{BASE}/api/public/careers/jobs?q=react", timeout=10)
        assert r.status_code == 200
        jobs = r.json()
        # Should include the existing React Developer posting
        assert any("react" in (j.get("title", "") + j.get("slug", "")).lower() for j in jobs)
        # Negative search
        r2 = requests.get(f"{BASE}/api/public/careers/jobs?q=zzzzzzz-nomatch", timeout=10)
        assert r2.status_code == 200
        assert r2.json() == []

    def test_public_type_mode_filter(self):
        r = requests.get(f"{BASE}/api/public/careers/jobs?employment_type=full_time", timeout=10)
        assert r.status_code == 200
        for j in r.json():
            assert j["employment_type"] == "full_time"
        r2 = requests.get(f"{BASE}/api/public/careers/jobs?work_mode=hybrid", timeout=10)
        assert r2.status_code == 200
        for j in r2.json():
            assert j["work_mode"] == "hybrid"

    def test_public_jd_pdf_valid_with_annotations(self, created_job):
        r = requests.get(f"{BASE}/api/public/careers/jobs/{created_job['slug']}/jd.pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        content = r.content
        assert content.startswith(b"%PDF"), "PDF magic bytes missing"
        # Parse with pypdf and check for link annotations
        try:
            from pypdf import PdfReader
        except ImportError:
            from PyPDF2 import PdfReader  # fallback
        reader = PdfReader(io.BytesIO(content))
        uris = []
        for page in reader.pages:
            annots = page.get("/Annots")
            if not annots:
                continue
            for a in annots:
                obj = a.get_object() if hasattr(a, "get_object") else a
                A = obj.get("/A") if obj else None
                if A and A.get("/URI"):
                    uris.append(str(A.get("/URI")))
        assert any(u.startswith("mailto:") for u in uris), f"no mailto annotation found: {uris}"
        assert any(u.startswith("http") for u in uris), f"no https annotation found: {uris}"

    def test_delete_job(self, admin_hdr):
        # Create ephemeral job and delete
        r = requests.post(f"{BASE}/api/careers/jobs", headers=admin_hdr,
                          json={"title": "TEST delete me iter76"}, timeout=10)
        assert r.status_code == 200
        jid = r.json()["id"]
        r2 = requests.delete(f"{BASE}/api/careers/jobs/{jid}", headers=admin_hdr, timeout=10)
        assert r2.status_code == 200
        # Now delete again should 404
        r3 = requests.delete(f"{BASE}/api/careers/jobs/{jid}", headers=admin_hdr, timeout=10)
        assert r3.status_code == 404
