"""
Iter 48 — Customer Success email block-editor + CTA persistence.

Validates that POST /api/clients/{cid}/cs-email/save persists:
- blocks[] (heading / paragraph / bullets / image / divider)
- cta_type / cta_label / cta_url
- body_html
and that GET /api/clients/{cid}/cs-email/draft returns the same data.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def test_client_id(admin_session):
    """Create a TEST_ client for this module; clean up after."""
    name = f"TEST_iter48_{uuid.uuid4().hex[:8]}"
    payload = {"name": name, "email": f"{name.lower()}@example.com", "company": "TEST Co"}
    r = admin_session.post(f"{BASE_URL}/api/clients", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"create client failed: {r.status_code} {r.text[:200]}"
    cid = r.json().get("id")
    assert cid
    yield cid
    # cleanup (best-effort)
    try:
        admin_session.delete(f"{BASE_URL}/api/clients/{cid}", timeout=10)
    except Exception:
        pass


# ─── cs-email/save (block editor) ─────────────────────────────────
class TestCSEmailBlocksSave:

    def test_save_with_blocks_and_cta(self, admin_session, test_client_id):
        cid = test_client_id
        blocks = [
            {"type": "heading", "text": "Sept progress"},
            {"type": "paragraph", "text": "Hello world"},
            {"type": "bullets", "items": ["one", "two"]},
            {"type": "image", "url": "https://picsum.photos/600/300", "caption": "cap"},
            {"type": "divider"},
        ]
        body_html = "<h2>Sept progress</h2><p>Hello world</p>"
        payload = {
            "subject": "Hello",
            "greeting": "Hi there,",
            "closing": "Warmly,\nProjexino",
            "blocks": blocks,
            "cta_type": "finance_updates",
            "cta_label": "View finance updates →",
            "cta_url": "/app/finance",
            "body_html": body_html,
            "purpose": "monthly status update",
            "tone": "warm",
        }
        r = admin_session.post(
            f"{BASE_URL}/api/clients/{cid}/cs-email/save", json=payload, timeout=15
        )
        assert r.status_code == 200, f"save failed: {r.status_code} {r.text[:200]}"
        data = r.json()
        assert data.get("ok") is True
        assert "saved_at" in data

    def test_get_returns_persisted_blocks(self, admin_session, test_client_id):
        cid = test_client_id
        r = admin_session.get(f"{BASE_URL}/api/clients/{cid}/cs-email/draft", timeout=10)
        assert r.status_code == 200, f"get draft failed: {r.status_code} {r.text[:200]}"
        d = r.json()
        # blocks persisted
        assert isinstance(d.get("blocks"), list), f"blocks not a list: {d.get('blocks')}"
        assert len(d["blocks"]) == 5, f"expected 5 blocks, got {len(d['blocks'])}"
        types = [b.get("type") for b in d["blocks"]]
        assert types == ["heading", "paragraph", "bullets", "image", "divider"], types
        # specific fields
        assert d["blocks"][0]["text"] == "Sept progress"
        assert d["blocks"][2]["items"] == ["one", "two"]
        assert d["blocks"][3]["url"] == "https://picsum.photos/600/300"
        assert d["blocks"][3]["caption"] == "cap"
        # cta fields persisted
        assert d.get("cta_type") == "finance_updates"
        assert d.get("cta_label") == "View finance updates →"
        assert d.get("cta_url") == "/app/finance"
        # body_html persisted
        assert "Sept progress" in (d.get("body_html") or "")

    def test_save_with_custom_cta_url(self, admin_session, test_client_id):
        cid = test_client_id
        payload = {
            "subject": "Custom CTA",
            "greeting": "Hi,",
            "closing": "Best",
            "blocks": [{"type": "paragraph", "text": "Visit our calendar."}],
            "cta_type": "custom",
            "cta_label": "Learn more →",
            "cta_url": "https://calendly.com/projexino/intro",
            "body_html": "<p>Visit our calendar.</p>",
        }
        r = admin_session.post(
            f"{BASE_URL}/api/clients/{cid}/cs-email/save", json=payload, timeout=15
        )
        assert r.status_code == 200
        # verify GET
        r2 = admin_session.get(f"{BASE_URL}/api/clients/{cid}/cs-email/draft", timeout=10)
        assert r2.status_code == 200
        d = r2.json()
        assert d.get("cta_type") == "custom"
        assert d.get("cta_url") == "https://calendly.com/projexino/intro"

    def test_delete_draft(self, admin_session, test_client_id):
        cid = test_client_id
        r = admin_session.delete(
            f"{BASE_URL}/api/clients/{cid}/cs-email/draft", timeout=10
        )
        assert r.status_code == 200
        # GET should return empty
        r2 = admin_session.get(f"{BASE_URL}/api/clients/{cid}/cs-email/draft", timeout=10)
        assert r2.status_code == 200
        d = r2.json()
        # either empty dict or no blocks
        assert not d.get("blocks"), f"draft should be cleared, got {d}"
