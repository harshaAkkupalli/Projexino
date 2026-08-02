"""Iter 78 — Doc Studio (backend). Tests analyze/generate/edit/pdf/save-docs, RBAC, ownership."""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
INTERN = ("intern@projexino.com", "Intern@2026")
MEMBER = ("member@projexino.com", "Member@2026")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers():
    return {"Authorization": f"Bearer {_login(*ADMIN)}"}


@pytest.fixture(scope="module")
def intern_headers():
    return {"Authorization": f"Bearer {_login(*INTERN)}"}


@pytest.fixture(scope="module")
def member_headers():
    return {"Authorization": f"Bearer {_login(*MEMBER)}"}


# --- Status ---
def test_status(admin_headers):
    r = requests.get(f"{API}/doc-studio/status", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    j = r.json()
    assert "ai_available" in j and "provider" in j
    print("Doc Studio status:", j)


def test_status_requires_auth():
    r = requests.get(f"{API}/doc-studio/status", timeout=15)
    assert r.status_code in (401, 403)


# --- Analyze ---
DESC = """Hostel Management System
A web-based system to manage hostel operations across multiple blocks.
- Room allocation and vacancy tracking
- Fee payment and receipts
- Maintenance requests and status
- Warden dashboard with alerts
Tech: React frontend, FastAPI backend, MongoDB, Tailwind"""


def test_analyze_missing_description(admin_headers):
    r = requests.post(f"{API}/doc-studio/analyze", headers=admin_headers, json={"mode": "manual"}, timeout=20)
    assert r.status_code == 400


def test_analyze_manual(admin_headers):
    r = requests.post(f"{API}/doc-studio/analyze", headers=admin_headers,
                      json={"mode": "manual", "description": DESC}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["analysis_mode"] == "manual"
    assert j["id"]
    d = j["data"]
    assert "Hostel" in d["project_name"]
    assert len(d["goals"]) >= 2
    stack_lower = [s.lower() for s in d["tech_stack"]]
    assert any("react" in s for s in stack_lower)
    assert any("mongodb" in s for s in stack_lower)
    pytest.job_id = j["id"]


def test_analyze_ai(admin_headers):
    r = requests.post(f"{API}/doc-studio/analyze", headers=admin_headers,
                      json={"mode": "ai", "description": DESC}, timeout=90)
    # AI may be budget-limited -> falls back to manual per code; still 200
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert j["analysis_mode"] in ("ai", "manual")
    print("AI analyze mode:", j["analysis_mode"])


# --- Generate templates for all kinds ---
@pytest.mark.parametrize("kind", ["sdd", "plan", "srs"])
def test_generate_template(admin_headers, kind):
    r = requests.post(f"{API}/doc-studio/jobs/{pytest.job_id}/generate", headers=admin_headers,
                      json={"kind": kind, "mode": "template"}, timeout=30)
    assert r.status_code == 200, r.text[:200]
    j = r.json()
    assert j["kind"] == kind and j["mode"] == "template"
    assert j["markdown"].startswith("#")
    assert len(j["markdown"]) > 200


def test_generate_invalid_kind(admin_headers):
    r = requests.post(f"{API}/doc-studio/jobs/{pytest.job_id}/generate", headers=admin_headers,
                      json={"kind": "bogus", "mode": "template"}, timeout=15)
    assert r.status_code == 400


def test_job_persists_docs(admin_headers):
    r = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    docs = r.json().get("docs") or {}
    assert set(docs.keys()) >= {"sdd", "plan", "srs"}


# --- Update structure ---
def test_update_structure(admin_headers):
    r = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    data = r.json()["data"]
    data["project_name"] = "TEST_Hostel Updated"
    r2 = requests.put(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers,
                      json={"data": data}, timeout=15)
    assert r2.status_code == 200
    r3 = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    assert r3.json()["data"]["project_name"] == "TEST_Hostel Updated"


def test_save_manual_doc_edit(admin_headers):
    edited = "# TEST edit\n\nManual override content."
    r = requests.put(f"{API}/doc-studio/jobs/{pytest.job_id}/docs/plan", headers=admin_headers,
                     json={"markdown": edited}, timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    assert r2.json()["docs"]["plan"] == edited


def test_save_doc_empty_rejected(admin_headers):
    r = requests.put(f"{API}/doc-studio/jobs/{pytest.job_id}/docs/plan", headers=admin_headers,
                     json={"markdown": " "}, timeout=15)
    assert r.status_code == 400


# --- PDF ---
def test_pdf_download(admin_headers):
    # Regenerate plan template so PDF has real content (previous test overwrote)
    requests.post(f"{API}/doc-studio/jobs/{pytest.job_id}/generate", headers=admin_headers,
                  json={"kind": "plan", "mode": "template"}, timeout=30)
    r = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}/pdf?kind=plan",
                     headers=admin_headers, timeout=60)
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    assert len(r.content) > 10_000
    assert "application/pdf" in r.headers.get("content-type", "")


def test_save_to_documents(admin_headers):
    r = requests.post(f"{API}/doc-studio/jobs/{pytest.job_id}/save-to-documents",
                      headers=admin_headers, json={"kind": "sdd"}, timeout=60)
    assert r.status_code == 200
    name = r.json()["name"]
    assert name.startswith("SDD")
    # Verify in documents list
    d = requests.get(f"{API}/documents", headers=admin_headers, timeout=20)
    assert d.status_code == 200
    docs = d.json() if isinstance(d.json(), list) else d.json().get("items", [])
    assert any(x.get("name") == name and x.get("folder") == "Doc Studio" for x in docs), \
        f"saved doc not found in /api/documents (folder=Doc Studio)"


# --- Extract text ---
def test_extract_text_txt(admin_headers):
    files = {"file": ("sample.txt", io.BytesIO(b"Project X\n- goal one\n- goal two"), "text/plain")}
    r = requests.post(f"{API}/doc-studio/extract-text", headers=admin_headers, files=files, timeout=20)
    assert r.status_code == 200
    j = r.json()
    assert "Project X" in j["text"]
    assert j["chars"] > 0


# --- Ownership isolation ---
def test_job_isolation_intern_cannot_access_admin_job(intern_headers):
    r = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=intern_headers, timeout=15)
    assert r.status_code == 404


def test_jobs_list_owner_scoped(admin_headers):
    r = requests.get(f"{API}/doc-studio/jobs", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    ids = [j["id"] for j in r.json()]
    assert pytest.job_id in ids


# --- RBAC — non-admin roles ---
def test_intern_can_analyze(intern_headers):
    r = requests.post(f"{API}/doc-studio/analyze", headers=intern_headers,
                      json={"mode": "manual", "description": "TEST_Intern app\n- feature one\n- feature two"},
                      timeout=20)
    assert r.status_code == 200
    jid = r.json()["id"]
    r2 = requests.post(f"{API}/doc-studio/jobs/{jid}/generate", headers=intern_headers,
                       json={"kind": "sdd", "mode": "template"}, timeout=20)
    assert r2.status_code == 200
    # cleanup
    requests.delete(f"{API}/doc-studio/jobs/{jid}", headers=intern_headers, timeout=15)


def test_member_can_analyze(member_headers):
    r = requests.post(f"{API}/doc-studio/analyze", headers=member_headers,
                      json={"mode": "manual", "description": "TEST_Member proj\n- x\n- y"}, timeout=20)
    assert r.status_code == 200
    jid = r.json()["id"]
    requests.delete(f"{API}/doc-studio/jobs/{jid}", headers=member_headers, timeout=15)


# --- Delete cleanup ---
def test_delete_job(admin_headers):
    r = requests.delete(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/doc-studio/jobs/{pytest.job_id}", headers=admin_headers, timeout=15)
    assert r2.status_code == 404


def test_delete_nonexistent(admin_headers):
    r = requests.delete(f"{API}/doc-studio/jobs/nonexistent-id-xyz", headers=admin_headers, timeout=15)
    assert r.status_code == 404
