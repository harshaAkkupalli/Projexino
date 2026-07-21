"""Iter 70 backend tests — Playbooks module + Certificate QR sign flow."""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://projexino-hub.preview.emergentagent.com"

ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
HR = {"email": "hr@projexino.com", "password": "HR@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}

TINY_PNG = "data:image/png;base64," + base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
        "890000000d49444154789c6300010000000500010d0a2db40000000049454e44ae426082"
    )
).decode()


def _login(session, creds):
    r = session.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    if tok:
        session.headers.update({"Authorization": f"Bearer {tok}"})
    return data


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, ADMIN)
    return s


@pytest.fixture(scope="module")
def hr_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, HR)
    return s


@pytest.fixture(scope="module")
def intern_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    _login(s, INTERN)
    return s


# ============ PLAYBOOKS ============
class TestPlaybookThemes:
    def test_themes_returns_5(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/playbooks/themes")
        assert r.status_code == 200
        data = r.json()
        for k in ("midnight", "ivory", "emerald", "royal", "noir"):
            assert k in data, f"missing theme {k}"
            assert "label" in data[k] and "bg" in data[k] and "accent" in data[k]


class TestPlaybookCRUD:
    created_ids = []
    slugs = []

    def test_create_playbook(self, admin_client):
        payload = {
            "title": "TEST Iter70 Playbook Alpha",
            "subtitle": "test subtitle",
            "author": "Test Author",
            "category": "Testing",
            "theme": "midnight",
            "sections": [
                {"heading": "Intro", "body": "Welcome section body.\n- bullet one\n- bullet two"},
                {"heading": "Conclusion", "body": "Wrap up."},
            ],
        }
        r = admin_client.post(f"{BASE_URL}/api/playbooks", json=payload)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["theme"] == "midnight"
        assert data["slug"].startswith("test-iter70-playbook-alpha")
        assert "id" in data
        TestPlaybookCRUD.created_ids.append(data["id"])
        TestPlaybookCRUD.slugs.append(data["slug"])

    def test_duplicate_title_gets_2_suffix(self, admin_client):
        payload = {
            "title": "TEST Iter70 Playbook Alpha",
            "theme": "emerald",
            "sections": [{"heading": "Dup", "body": "dup body"}],
        }
        r = admin_client.post(f"{BASE_URL}/api/playbooks", json=payload)
        assert r.status_code in (200, 201)
        data = r.json()
        # first slug was test-iter70-playbook-alpha, second gets -2
        assert data["slug"].endswith("-2"), f"expected -2 suffix, got {data['slug']}"
        TestPlaybookCRUD.created_ids.append(data["id"])
        TestPlaybookCRUD.slugs.append(data["slug"])

    def test_invalid_theme_400(self, admin_client):
        r = admin_client.post(f"{BASE_URL}/api/playbooks", json={
            "title": "TEST bad theme", "theme": "notreal", "sections": []
        })
        assert r.status_code == 400

    def test_list_shows_section_count(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/playbooks")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        found = [p for p in items if p["id"] in TestPlaybookCRUD.created_ids]
        assert len(found) >= 1
        for p in found:
            assert "section_count" in p
            assert isinstance(p["section_count"], int)

    def test_patch_playbook(self, admin_client):
        pid = TestPlaybookCRUD.created_ids[0]
        r = admin_client.patch(f"{BASE_URL}/api/playbooks/{pid}", json={
            "title": "TEST Iter70 Playbook Alpha",
            "subtitle": "updated subtitle",
            "author": "Updated Author",
            "category": "Testing",
            "theme": "noir",
            "sections": [{"heading": "Only", "body": "one section left"}],
        })
        assert r.status_code == 200
        # confirm via list
        lst = admin_client.get(f"{BASE_URL}/api/playbooks").json()
        me = next(p for p in lst if p["id"] == pid)
        assert me["theme"] == "noir"
        assert me["subtitle"] == "updated subtitle"

    def test_public_playbook_no_auth(self):
        slug = TestPlaybookCRUD.slugs[0]
        r = requests.get(f"{BASE_URL}/api/public/playbooks/{slug}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["slug"] == slug
        assert "theme_def" in data
        assert data["theme_def"]["bg"].startswith("#")

    def test_public_playbook_unknown_slug_404(self):
        r = requests.get(f"{BASE_URL}/api/public/playbooks/does-not-exist-xyz", timeout=20)
        assert r.status_code == 404

    def test_public_pdf_valid(self):
        slug = TestPlaybookCRUD.slugs[0]
        r = requests.get(f"{BASE_URL}/api/public/playbooks/{slug}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 30 * 1024, f"pdf too small: {len(r.content)}"
        assert r.content.startswith(b"%PDF")
        # 2+ pages when sections exist (rough heuristic — count /Type /Page occurrences)
        pages = r.content.count(b"/Type /Page") + r.content.count(b"/Type/Page")
        assert pages >= 2, f"expected 2+ pages, got {pages}"

    def test_delete_playbook_cleanup(self, admin_client):
        # cleanup all created
        for pid in TestPlaybookCRUD.created_ids:
            r = admin_client.delete(f"{BASE_URL}/api/playbooks/{pid}")
            assert r.status_code == 200


class TestPlaybookRBAC:
    def test_intern_forbidden(self, intern_client):
        r = intern_client.get(f"{BASE_URL}/api/playbooks")
        assert r.status_code == 403, f"expected 403 for intern, got {r.status_code}"

    def test_intern_forbidden_create(self, intern_client):
        r = intern_client.post(f"{BASE_URL}/api/playbooks", json={
            "title": "TEST intern try", "theme": "midnight", "sections": []
        })
        assert r.status_code == 403


# ============ CERT QR SIGN ============
class TestCertQRSign:
    cert_id = None
    token = None

    def test_create_cert(self, hr_client):
        payload = {
            "recipient_name": "TEST Iter70 Recipient",
            "cert_type": "internship",
            "start_date": "2025-01-01",
            "end_date": "2025-06-01",
            "role_title": "Intern",
            "signer_name": "Admin",
            "signer_role": "HR",
            "content": "This is to certify that TEST Iter70 Recipient completed the internship program.",
        }
        r = hr_client.post(f"{BASE_URL}/api/hr/certificates", json=payload)
        assert r.status_code in (200, 201), r.text
        TestCertQRSign.cert_id = r.json()["id"]

    def test_sign_link_creates_token(self, hr_client):
        r = hr_client.post(f"{BASE_URL}/api/hr/certificates/{TestCertQRSign.cert_id}/sign-link")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and len(data["token"]) >= 8
        TestCertQRSign.token = data["token"]

    def test_sign_link_idempotent(self, hr_client):
        r = hr_client.post(f"{BASE_URL}/api/hr/certificates/{TestCertQRSign.cert_id}/sign-link")
        assert r.status_code == 200
        assert r.json()["token"] == TestCertQRSign.token, "token should be reused"

    def test_public_cert_sign_get(self):
        r = requests.get(f"{BASE_URL}/api/public/cert-sign/{TestCertQRSign.token}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["recipient_name"] == "TEST Iter70 Recipient"
        assert data["cert_type"] == "internship"
        assert data["signed"] is False

    def test_public_cert_sign_bad_token(self):
        r = requests.get(f"{BASE_URL}/api/public/cert-sign/badtokenxxxxxx", timeout=20)
        assert r.status_code == 404

    def test_public_cert_sign_invalid_payload_400(self):
        r = requests.post(f"{BASE_URL}/api/public/cert-sign/{TestCertQRSign.token}",
                          json={"signature_data_url": "not-a-data-url"}, timeout=20)
        assert r.status_code == 400

    def test_public_cert_sign_success(self):
        r = requests.post(f"{BASE_URL}/api/public/cert-sign/{TestCertQRSign.token}",
                          json={"signature_data_url": TINY_PNG, "signer_name": "QR Signer"}, timeout=20)
        assert r.status_code == 200
        # verify certificate is now signed
        r2 = requests.get(f"{BASE_URL}/api/public/cert-sign/{TestCertQRSign.token}", timeout=20)
        assert r2.json()["signed"] is True

    def test_verify_signed_via_hr_endpoint(self, hr_client):
        r = hr_client.get(f"{BASE_URL}/api/hr/certificates/{TestCertQRSign.cert_id}")
        # if singular endpoint missing, fall back to list
        if r.status_code == 404 or r.status_code == 405:
            lst = hr_client.get(f"{BASE_URL}/api/hr/certificates").json()
            me = next((c for c in lst if c["id"] == TestCertQRSign.cert_id), None)
            assert me is not None
            assert me.get("status") == "signed"
        else:
            assert r.status_code == 200
            data = r.json()
            assert data.get("status") == "signed"

    def test_cleanup_delete_cert(self, hr_client):
        r = hr_client.delete(f"{BASE_URL}/api/hr/certificates/{TestCertQRSign.cert_id}")
        assert r.status_code in (200, 204)
