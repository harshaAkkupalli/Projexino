"""Iter 34 — Newsletter: 'Compose from Blog' AI draft endpoint tests.

Covers:
  • POST /api/admin/newsletter/draft-from-blog/{post_id}        — success / 404 / RBAC
  • Payload overrides (tone, audience_hint) influence AI output
  • Branded HTML shell (#F97316, doctype, 600px shell)
  • POST /api/admin/newsletter/send-blog/{post_id}              — body_html override path
"""
from __future__ import annotations
import os
import uuid
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"Login {creds['email']} -> {r.status_code} {r.text[:200]}"
    return s


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def intern_session():
    return _login(INTERN)


@pytest.fixture(scope="module")
def seeded_post(admin_session):
    """Find an existing published post; else create one (TEST_ prefix)."""
    r = admin_session.get(f"{API}/admin/blog/posts", timeout=30)
    if r.status_code == 200:
        data = r.json()
        items = data if isinstance(data, list) else data.get("items", [])
        for p in items:
            if p.get("status") == "published":
                return p
    payload = {
        "title": f"TEST_iter34 Newsletter AI {uuid.uuid4().hex[:6]}",
        "slug": f"test-iter34-{uuid.uuid4().hex[:8]}",
        "excerpt": "How modern engineering studios cut sprint waste by 30% through async rituals.",
        "content_html": "<p>Async standups, written PR reviews, and AI-assisted triage can reclaim 6 hours a week per engineer. Here's how to roll it out without burning the team.</p>",
        "status": "published",
    }
    r = admin_session.post(f"{API}/admin/blog/posts", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Create post failed: {r.status_code} {r.text[:200]}"
    return r.json()


# ---------- DRAFT ENDPOINT ----------
class TestDraftFromBlog:
    def test_draft_success_shape(self, admin_session, seeded_post):
        pid = seeded_post["id"]
        r = admin_session.post(f"{API}/admin/newsletter/draft-from-blog/{pid}", json={}, timeout=120)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        d = r.json()
        for k in ["subject", "preheader", "intro", "key_points", "takeaway",
                  "cta_label", "body_html", "blog_post_id", "blog_post_slug", "blog_title"]:
            assert k in d, f"missing key: {k}"
        assert isinstance(d["key_points"], list)
        assert 1 <= len(d["key_points"]) <= 6, f"key_points len={len(d['key_points'])}"
        assert isinstance(d["subject"], str) and len(d["subject"]) > 0
        assert d["blog_post_id"] == pid

    def test_body_html_branded_shell(self, admin_session, seeded_post):
        pid = seeded_post["id"]
        r = admin_session.post(f"{API}/admin/newsletter/draft-from-blog/{pid}", json={}, timeout=120)
        assert r.status_code == 200
        html = r.json()["body_html"]
        # doctype
        assert "<!doctype html>" in html.lower(), "missing doctype"
        # brand colour
        assert "#F97316" in html, "missing brand colour"
        # 600px shell table
        assert "600" in html and "<table" in html.lower(), "missing 600px table shell"
        # at least one key_point text appears verbatim in HTML
        kps = r.json()["key_points"]
        assert any(kp.split()[0].lower() in html.lower() for kp in kps if kp), \
            "no key_point text found in body_html"

    def test_payload_override_audience(self, admin_session, seeded_post):
        """audience_hint should steer the model's output (best-effort check).
        We pass a strongly-flavoured hint and look for any of its tokens in
        subject + intro + key_points combined."""
        pid = seeded_post["id"]
        hint = "indie game developers shipping pixel art platformers"
        r = admin_session.post(
            f"{API}/admin/newsletter/draft-from-blog/{pid}",
            json={"tone": "playful · punchy", "audience_hint": hint},
            timeout=120,
        )
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        blob = (d.get("subject", "") + " " + d.get("intro", "") + " " + d.get("takeaway", "") + " " +
                " ".join(d.get("key_points", []))).lower()
        # Lenient — at least ONE distinctive token from the hint should land somewhere
        tokens = ["game", "indie", "pixel", "platformer", "developer", "dev"]
        assert any(t in blob for t in tokens), f"audience hint not reflected: {blob[:200]}"

    def test_draft_404_unknown_post(self, admin_session):
        r = admin_session.post(f"{API}/admin/newsletter/draft-from-blog/does-not-exist-xyz",
                               json={}, timeout=30)
        assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"

    def test_draft_rbac_intern_forbidden(self, intern_session, seeded_post):
        pid = seeded_post["id"]
        r = intern_session.post(f"{API}/admin/newsletter/draft-from-blog/{pid}", json={}, timeout=30)
        assert r.status_code in (401, 403), f"intern got {r.status_code}: {r.text[:200]}"


# ---------- SEND-BLOG WITH body_html OVERRIDE ----------
class TestSendBlogOverride:
    def test_send_blog_with_body_override_no_gmail(self, admin_session, seeded_post):
        """Either 400 (no gmail) or 200 (gmail connected). Either way endpoint accepts override."""
        pid = seeded_post["id"]
        custom = "<!doctype html><html><body><p>TEST_iter34 custom body marker</p></body></html>"
        r = admin_session.post(
            f"{API}/admin/newsletter/send-blog/{pid}",
            json={"body_html": custom, "subject": "TEST_iter34 override"},
            timeout=60,
        )
        # Accept 400 (gmail missing / no subscribers) — both prove the override didn't 500
        assert r.status_code in (200, 400), f"unexpected: {r.status_code}: {r.text[:200]}"

    def test_send_blog_404(self, admin_session):
        r = admin_session.post(f"{API}/admin/newsletter/send-blog/nope-xyz",
                               json={"body_html": "<p>x</p>"}, timeout=30)
        assert r.status_code == 404
