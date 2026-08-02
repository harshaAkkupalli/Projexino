"""
Cross-role chat tests (iteration 12).

Verifies that:
- Channels & messages are shared by member_ids (not owner-scoped per user).
- Creator is auto-added to member_ids.
- Non-members get 403 on read/post.
- Members can rename, only owner/admin can change members.
- Attachments accessible to channel members only.
"""
import base64
import os
import time
import pytest
import requests

def _read_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env() or "").rstrip("/")
assert BASE, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE}/api"

CREDS = {
    "admin": ("admin@projexino.com", "Projexino@2026"),
    "member": ("member@projexino.com", "Member@2026"),
    "intern": ("intern@projexino.com", "Intern@2026"),
    "manager": ("manager@projexino.com", "Manager@2026"),
}

# 1x1 transparent PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


def _login(email, password):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    me = s.get(f"{API}/auth/me", timeout=15)
    assert me.status_code == 200, f"/auth/me failed: {me.text}"
    return s, me.json()


@pytest.fixture(scope="module")
def actors():
    admin_s, admin_me = _login(*CREDS["admin"])
    member_s, member_me = _login(*CREDS["member"])
    intern_s, intern_me = _login(*CREDS["intern"])
    return {
        "admin": (admin_s, admin_me),
        "member": (member_s, member_me),
        "intern": (intern_s, intern_me),
    }


@pytest.fixture(scope="module")
def channel(actors):
    """Admin creates a group channel with member; yields the channel doc."""
    admin_s, admin_me = actors["admin"]
    _, member_me = actors["member"]
    body = {
        "name": "QA-Cross-Role",
        "kind": "group",
        "member_ids": [member_me["id"]],
    }
    r = admin_s.post(f"{API}/chat/channels", json=body, timeout=15)
    assert r.status_code == 200, f"create channel failed: {r.status_code} {r.text}"
    ch = r.json()
    yield ch
    # teardown
    try:
        admin_s.delete(f"{API}/chat/channels/{ch['id']}", timeout=15)
    except Exception:
        pass


# ---------------- Tests ----------------

def test_login_all_actors(actors):
    for role, (_, me) in actors.items():
        assert me.get("id"), f"no id for {role}"
        assert me.get("email")


def test_create_channel_includes_creator_in_member_ids(actors, channel):
    _, admin_me = actors["admin"]
    _, member_me = actors["member"]
    mids = channel.get("member_ids") or []
    assert admin_me["id"] in mids, "creator not auto-added"
    assert member_me["id"] in mids, "explicit member missing"
    assert channel.get("owner_id") == admin_me["id"]
    assert channel.get("name") == "QA-Cross-Role"
    assert channel.get("kind") == "group"


def test_member_sees_channel_in_list(actors, channel):
    member_s, _ = actors["member"]
    r = member_s.get(f"{API}/chat/channels", timeout=15)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert channel["id"] in ids, "member cannot see channel they belong to"


def test_intern_does_not_see_channel(actors, channel):
    intern_s, _ = actors["intern"]
    r = intern_s.get(f"{API}/chat/channels", timeout=15)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert channel["id"] not in ids, "intern (non-member) should NOT see channel"


def test_admin_sends_then_member_reads_and_replies(actors, channel):
    admin_s, _ = actors["admin"]
    member_s, _ = actors["member"]

    # Admin posts message
    r = admin_s.post(
        f"{API}/chat/messages",
        json={"channel_id": channel["id"], "text": "Hello from admin"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    admin_msg = r.json()
    assert admin_msg["text"] == "Hello from admin"
    assert "_id" not in admin_msg

    # Member reads
    r = member_s.get(f"{API}/chat/channels/{channel['id']}/messages", timeout=15)
    assert r.status_code == 200
    texts = [m["text"] for m in r.json()]
    assert "Hello from admin" in texts

    # Member replies
    r = member_s.post(
        f"{API}/chat/messages",
        json={"channel_id": channel["id"], "text": "Hi admin, this is member"},
        timeout=15,
    )
    assert r.status_code == 200, r.text

    # Admin reads back
    r = admin_s.get(f"{API}/chat/channels/{channel['id']}/messages", timeout=15)
    assert r.status_code == 200
    texts = [m["text"] for m in r.json()]
    assert "Hello from admin" in texts
    assert "Hi admin, this is member" in texts


def test_non_member_intern_cannot_read_messages(actors, channel):
    intern_s, _ = actors["intern"]
    r = intern_s.get(f"{API}/chat/channels/{channel['id']}/messages", timeout=15)
    assert r.status_code == 403, f"expected 403 for non-member, got {r.status_code}: {r.text}"


def test_non_member_intern_cannot_post(actors, channel):
    intern_s, _ = actors["intern"]
    r = intern_s.post(
        f"{API}/chat/messages",
        json={"channel_id": channel["id"], "text": "I shouldn't be here"},
        timeout=15,
    )
    assert r.status_code == 403


def test_member_can_patch_name_but_not_members(actors, channel):
    member_s, _ = actors["member"]
    _, intern_me = actors["intern"]

    # rename - allowed (member is a member)
    r = member_s.patch(
        f"{API}/chat/channels/{channel['id']}",
        json={"name": "QA-Cross-Role-Renamed"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "QA-Cross-Role-Renamed"

    # member tries to change member_ids → 403
    r = member_s.patch(
        f"{API}/chat/channels/{channel['id']}",
        json={"member_ids": [intern_me["id"]]},
        timeout=15,
    )
    assert r.status_code == 403, f"expected 403 non-owner member_ids edit, got {r.status_code}"


def test_intern_cannot_patch_channel(actors, channel):
    intern_s, _ = actors["intern"]
    r = intern_s.patch(
        f"{API}/chat/channels/{channel['id']}",
        json={"name": "intern-rename"},
        timeout=15,
    )
    assert r.status_code in (403, 404), f"expected 403/404, got {r.status_code}"


def test_admin_adds_intern_then_intern_sees_channel(actors, channel):
    admin_s, _ = actors["admin"]
    _, admin_me = actors["admin"]
    _, member_me = actors["member"]
    intern_s, intern_me = actors["intern"]

    r = admin_s.patch(
        f"{API}/chat/channels/{channel['id']}",
        json={"member_ids": [admin_me["id"], member_me["id"], intern_me["id"]]},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    new_mids = r.json()["member_ids"]
    assert intern_me["id"] in new_mids

    # Intern now sees channel
    r = intern_s.get(f"{API}/chat/channels", timeout=15)
    assert r.status_code == 200
    ids = [c["id"] for c in r.json()]
    assert channel["id"] in ids, "intern should now see the channel after being added"

    # Intern can read messages
    r = intern_s.get(f"{API}/chat/channels/{channel['id']}/messages", timeout=15)
    assert r.status_code == 200

    # Remove intern again for next tests
    admin_s.patch(
        f"{API}/chat/channels/{channel['id']}",
        json={"member_ids": [admin_me["id"], member_me["id"]]},
        timeout=15,
    )


def test_attachment_flow(actors, channel):
    admin_s, _ = actors["admin"]
    member_s, _ = actors["member"]
    intern_s, _ = actors["intern"]

    r = admin_s.post(
        f"{API}/chat/messages",
        json={
            "channel_id": channel["id"],
            "text": "with image",
            "attachment_name": "pixel.png",
            "attachment_mime": "image/png",
            "attachment_base64": TINY_PNG_B64,
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    msg = r.json()
    assert msg.get("attachment_url_id"), "attachment_url_id should be set"
    assert "attachment_base64" not in msg or msg.get("attachment_base64") == ""

    msg_id = msg["id"]

    # Member fetches attachment - allowed
    r = member_s.get(f"{API}/chat/attachment/{msg_id}", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("content_base64") == TINY_PNG_B64
    assert body.get("mime_type") == "image/png"

    # Intern (non-member) - 403
    r = intern_s.get(f"{API}/chat/attachment/{msg_id}", timeout=15)
    assert r.status_code == 403


def test_no_objectid_leak_in_responses(actors, channel):
    admin_s, _ = actors["admin"]
    r = admin_s.get(f"{API}/chat/channels", timeout=15)
    assert r.status_code == 200
    for c in r.json():
        assert "_id" not in c
    r = admin_s.get(f"{API}/chat/channels/{channel['id']}/messages", timeout=15)
    assert r.status_code == 200
    for m in r.json():
        assert "_id" not in m
