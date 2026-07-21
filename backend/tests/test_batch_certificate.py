"""Batch (certificate + dashboard celebration + chat redesign) backend tests.

Focus:
- Performance certificate endpoint returns PDF with new filename.
- Regression: progress, progress/pdf, badge-catalog, award-badge, chat channels PATCH,
  manager interns, public settings.
- New badge awarded to intern is visible via /api/me/intern/progress.
"""
import os, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

API = f"{BASE_URL}/api"

ADMIN = ("admin@projexino.com", "Projexino@2026")
INTERN = ("intern@projexino.com", "Intern@2026")
MANAGER = ("manager@projexino.com", "Manager@2026")


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def intern_session():
    return login(*INTERN)


@pytest.fixture(scope="module")
def manager_session():
    return login(*MANAGER)


@pytest.fixture(scope="module")
def intern_record(admin_session):
    r = admin_session.get(f"{API}/manager/interns")
    assert r.status_code == 200
    data = r.json()
    interns = [x["intern"] for x in data.get("interns", [])]
    rec = next((i for i in interns if i.get("email") == "intern@projexino.com"), None)
    assert rec, "intern@projexino.com not found in /api/manager/interns"
    return rec


# ---------- Performance Certificate ----------
class TestPerformanceCertificate:
    def test_admin_can_download_intern_certificate(self, admin_session, intern_record):
        r = admin_session.get(f"{API}/interns/{intern_record['id']}/certificate")
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "application/pdf" in ct.lower(), f"content-type {ct}"
        cd = r.headers.get("content-disposition", "")
        # Filename must contain Performance_Certificate.pdf
        assert "Performance_Certificate.pdf" in cd, (
            f"expected Performance_Certificate.pdf in content-disposition; got {cd}"
        )
        body = r.content
        assert body.startswith(b"%PDF"), "Body does not start with %PDF"
        assert len(body) > 10_000, f"PDF too small: {len(body)} bytes"


# ---------- Regression endpoints ----------
class TestRegressionEndpoints:
    def test_intern_progress(self, intern_session):
        r = intern_session.get(f"{API}/me/intern/progress")
        assert r.status_code == 200
        data = r.json()
        assert "badges" in data or "intern" in data

    def test_intern_progress_pdf(self, intern_session):
        r = intern_session.get(f"{API}/me/intern/progress/pdf")
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "").lower()
        assert r.content.startswith(b"%PDF")

    def test_badge_catalog(self, admin_session):
        r = admin_session.get(f"{API}/intern-hub/badge-catalog")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 8

    def test_manager_interns(self, admin_session):
        r = admin_session.get(f"{API}/manager/interns")
        assert r.status_code == 200
        data = r.json()
        assert "interns" in data

    def test_public_settings(self):
        r = requests.get(f"{API}/settings/public")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, dict)

    def test_chat_channels_list(self, admin_session):
        r = admin_session.get(f"{API}/chat/channels")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- Award badge + progress reflection ----------
class TestAwardThenProgress:
    def test_award_and_progress_lists_badge(self, admin_session, intern_session, intern_record):
        unique_reason = "TEST_iter9 — performance cert flow"
        body = {
            "intern_id": intern_record["id"],
            "slug": "innovator",
            "reason": unique_reason,
        }
        r = admin_session.post(f"{API}/intern-hub/award-badge", json=body)
        assert r.status_code == 200, r.text
        awarded = r.json().get("badge", {})
        assert awarded.get("slug") == "innovator"
        assert awarded.get("name")
        assert awarded.get("color")
        assert awarded.get("icon")

        # Intern fetches own progress and sees it
        rp = intern_session.get(f"{API}/me/intern/progress")
        assert rp.status_code == 200
        badges = rp.json().get("badges", []) or rp.json().get("intern", {}).get("badges", [])
        assert any(
            b.get("slug") == "innovator" and (b.get("reason", "") == unique_reason)
            for b in badges
        ), f"newly awarded badge missing from intern progress; got {badges}"


# ---------- Chat channel PATCH (regression) ----------
class TestChatChannelPatchRegression:
    def test_patch_group_channel(self, admin_session):
        r = admin_session.post(
            f"{API}/chat/channels",
            json={"name": "TEST_iter9_squad", "kind": "group", "member_ids": []},
        )
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        rp = admin_session.patch(
            f"{API}/chat/channels/{cid}", json={"name": "TEST_iter9_renamed"}
        )
        assert rp.status_code == 200
        assert rp.json()["name"] == "TEST_iter9_renamed"
        admin_session.delete(f"{API}/chat/channels/{cid}")
