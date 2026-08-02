"""Batch 2 + 3 backend tests: badge catalog, award, suggestion, chat channel PATCH."""
import os, base64, requests, pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fall back to reading frontend/.env
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
MEMBER = ("member@projexino.com", "Member@2026")


def login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def member_session():
    return login(*MEMBER)


@pytest.fixture(scope="module")
def intern_record(admin_session):
    r = admin_session.get(f"{API}/manager/interns")
    assert r.status_code == 200
    data = r.json()
    interns = [x["intern"] for x in data.get("interns", [])]
    rec = next((i for i in interns if i.get("email") == "intern@projexino.com"), None)
    assert rec, "intern@projexino.com row not found in /api/manager/interns"
    return rec


# ---------- Badge Catalog ----------
class TestBadgeCatalog:
    def test_catalog_returns_8_items(self, admin_session):
        r = admin_session.get(f"{API}/intern-hub/badge-catalog")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) == 8
        for b in data:
            for k in ("slug", "name", "color", "icon", "tagline"):
                assert k in b, f"missing key {k} in badge {b}"
        slugs = {b["slug"] for b in data}
        assert "on_time_achiever" in slugs


# ---------- Award badge ----------
class TestAwardBadge:
    def test_award_valid(self, admin_session, intern_record):
        body = {"intern_id": intern_record["id"], "slug": "communicator",
                "reason": "TEST_batch23 — clear engagement in chat."}
        r = admin_session.post(f"{API}/intern-hub/award-badge", json=body)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        badge = data.get("badge", {})
        assert badge.get("slug") == "communicator"
        assert badge.get("name") == "Communicator"
        assert badge.get("icon") == "chat"
        assert badge.get("color") == "#3B82F6"
        assert badge.get("reason", "").startswith("TEST_batch23")
        assert "id" in badge and "earned_at" in badge and "awarded_by" in badge
        # Verify persistence via /manager/interns
        r2 = admin_session.get(f"{API}/manager/interns")
        ic = next(x["intern"] for x in r2.json()["interns"] if x["intern"]["id"] == intern_record["id"])
        assert any(b.get("slug") == "communicator" and b.get("reason", "").startswith("TEST_batch23")
                   for b in ic.get("badges", []))

    def test_award_bad_slug(self, admin_session, intern_record):
        r = admin_session.post(f"{API}/intern-hub/award-badge",
                               json={"intern_id": intern_record["id"], "slug": "nonsense_slug", "reason": "x"})
        assert r.status_code == 400

    def test_award_forbidden_for_member(self, member_session, intern_record):
        r = member_session.post(f"{API}/intern-hub/award-badge",
                                json={"intern_id": intern_record["id"], "slug": "communicator", "reason": "x"})
        assert r.status_code == 403


# ---------- Badge suggestion ----------
class TestBadgeSuggestion:
    def test_suggestion_returns_valid_slug(self, admin_session, intern_record):
        r = admin_session.post(f"{API}/intern-hub/badge-suggestion",
                               json={"intern_id": intern_record["id"]})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "slug" in data and "reason" in data
        catalog = admin_session.get(f"{API}/intern-hub/badge-catalog").json()
        valid_slugs = {b["slug"] for b in catalog}
        assert data["slug"] in valid_slugs


# ---------- Chat channel PATCH ----------
class TestChannelPatch:
    def test_patch_name_and_members(self, admin_session, member_session):
        # create group channel as admin
        r = admin_session.post(f"{API}/chat/channels",
                               json={"name": "TEST_batch23_squad", "kind": "group", "member_ids": []})
        assert r.status_code == 200, r.text
        ch = r.json()
        cid = ch["id"]
        assert ch["name"] == "TEST_batch23_squad"

        # admin gets users; find member id via /api/manager/interns->linked or fall back to /auth/me
        # Get member's id via login + /auth/me
        me = member_session.get(f"{API}/auth/me").json()
        member_id = me["id"]

        # other user (member) is not in member_ids and not owner -> forbidden
        rother = member_session.patch(f"{API}/chat/channels/{cid}",
                                      json={"name": "hacked"})
        assert rother.status_code in (403, 404)

        # admin patches name + member_ids
        rp = admin_session.patch(f"{API}/chat/channels/{cid}",
                                 json={"name": "Sprint Squad", "member_ids": [member_id]})
        assert rp.status_code == 200, rp.text
        out = rp.json()
        assert out["name"] == "Sprint Squad"
        assert member_id in out["member_ids"]

        # Verify persistence
        rl = admin_session.get(f"{API}/chat/channels").json()
        found = next((c for c in rl if c["id"] == cid), None)
        assert found and found["name"] == "Sprint Squad"
        assert member_id in found["member_ids"]

        # cleanup
        admin_session.delete(f"{API}/chat/channels/{cid}")


# ---------- Chat image attachment ----------
class TestChatImageAttachment:
    def test_send_inline_png(self, admin_session):
        # create a channel
        r = admin_session.post(f"{API}/chat/channels",
                               json={"name": "TEST_batch23_img", "kind": "group", "member_ids": []})
        cid = r.json()["id"]
        # 1x1 transparent PNG
        png_b64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
        msg = admin_session.post(f"{API}/chat/messages", json={
            "channel_id": cid, "text": "",
            "attachment_name": "pixel.png",
            "attachment_mime": "image/png",
            "attachment_base64": png_b64,
        })
        assert msg.status_code == 200, msg.text
        mid = msg.json()["id"]
        att = admin_session.get(f"{API}/chat/attachment/{mid}").json()
        assert att["mime_type"] == "image/png"
        assert att["content_base64"].startswith("iVBOR")
        admin_session.delete(f"{API}/chat/channels/{cid}")
