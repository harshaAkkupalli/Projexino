"""Iter 65 — Digi manual paths (no-AI) + Template Studio backend tests.

Covers:
- POST /api/digi/content (manual content, source=manual)
- PUT  /api/digi/clients/{id}/strategies (manual strategy, source=manual)
- POST /api/digi/creatives/save (Template Studio SVG save, engine=template_studio_v1)
- GET  /api/digi/creatives filter by client
- GET  /api/digi/content    filter by client
"""
import os
import pytest
import requests
from pathlib import Path


def _read_env():
    p = Path("/app/frontend/.env")
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


BASE_URL = _read_env()
ADMIN = {"email": "admin@projexino.com", "password": "Projexino@2026"}


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def digi_client(admin_session):
    """Pick an existing digi client (create if none)."""
    r = admin_session.get(f"{BASE_URL}/api/digi/clients", timeout=30)
    assert r.status_code == 200, r.text
    rows = r.json() or []
    if rows:
        return rows[0]
    # create one
    payload = {"name": "TEST_iter65_client", "industry": "SaaS"}
    r = admin_session.post(f"{BASE_URL}/api/digi/clients", json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    return r.json()


# ── Manual content (POST /api/digi/content) ─────────────────────
class TestManualContent:
    def test_create_manual_content(self, admin_session, digi_client):
        payload = {
            "client_id": digi_client["id"],
            "title": "TEST_iter65 manual caption",
            "kind": "caption",
            "platform": "instagram",
            "body": "Handwritten body text for the manual content path.",
            "hashtags": "#projexino #manual",
            "cta": "Learn more",
        }
        r = admin_session.post(f"{BASE_URL}/api/digi/content", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("id")
        assert d["title"] == "TEST_iter65 manual caption"
        assert d["body"].startswith("Handwritten body")
        assert d.get("source") == "manual"
        assert d["kind"] == "caption"
        assert d["platform"] == "instagram"
        assert d["hashtags"] and "#projexino" in d["hashtags"]

        # GET verify persistence
        r2 = admin_session.get(
            f"{BASE_URL}/api/digi/content",
            params={"client_id": digi_client["id"]},
            timeout=30,
        )
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert d["id"] in ids

        # cleanup
        admin_session.delete(f"{BASE_URL}/api/digi/content/{d['id']}", timeout=30)

    def test_manual_content_missing_body_rejected(self, admin_session, digi_client):
        r = admin_session.post(
            f"{BASE_URL}/api/digi/content",
            json={"client_id": digi_client["id"], "title": "no body"},
            timeout=30,
        )
        assert r.status_code == 400, r.text


# ── Manual strategy (PUT /api/digi/clients/{id}/strategies) ─────
class TestManualStrategy:
    def test_put_manual_strategy(self, admin_session, digi_client):
        cid = digi_client["id"]
        payload = {
            "strategies": {
                "executive_summary": "TEST_iter65 manual exec summary.",
                "marketing": {
                    "objective": "Brand awareness",
                    "pillars": ["quality", "speed"],
                    "kpis": ["reach", "engagement"],
                },
                "content": {"themes": ["thought leadership"]},
                "seo": {"primary_keywords": ["react dev", "fastapi"]},
                "ads": {
                    "recommended_platforms": ["linkedin", "instagram"],
                    "audience_targeting": "SaaS founders 25-45",
                },
                "timeframe": "monthly",
            }
        }
        r = admin_session.put(
            f"{BASE_URL}/api/digi/clients/{cid}/strategies", json=payload, timeout=30
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("source") == "manual"
        assert d["executive_summary"] == "TEST_iter65 manual exec summary."
        assert d["timeframe"] == "monthly"
        assert d.get("generated_at")

        # GET verify persistence
        r2 = admin_session.get(f"{BASE_URL}/api/digi/clients/{cid}", timeout=30)
        assert r2.status_code == 200
        got = r2.json().get("strategies", {})
        assert got.get("executive_summary") == "TEST_iter65 manual exec summary."
        assert got.get("source") == "manual"

    def test_put_strategy_unknown_client_404(self, admin_session):
        r = admin_session.put(
            f"{BASE_URL}/api/digi/clients/does-not-exist-xyz/strategies",
            json={"strategies": {"executive_summary": "x"}},
            timeout=30,
        )
        assert r.status_code == 404


# ── Template Studio (POST /api/digi/creatives/save) ─────────────
SAMPLE_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" '
    'viewBox="0 0 1080 1080"><rect width="100%" height="100%" fill="#0F2042"/>'
    '<text x="60" y="120" fill="#fff" font-size="48">TEST_iter65</text></svg>'
)


class TestTemplateStudioSave:
    def test_save_template_creative(self, admin_session, digi_client):
        payload = {
            "client_id": digi_client["id"],
            "template_id": "announcement",
            "kind": "square",
            "platform": "instagram",
            "headline": "TEST_iter65 headline",
            "svg": SAMPLE_SVG,
            "size": {"w": 1080, "h": 1080},
        }
        r = admin_session.post(
            f"{BASE_URL}/api/digi/creatives/save", json=payload, timeout=30
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("id")
        assert d.get("engine") == "template_studio_v1"
        assert d.get("mime_type") == "image/svg+xml"
        assert d.get("template_id") == "announcement"
        assert d.get("headline") == "TEST_iter65 headline"
        assert d.get("size", {}).get("w") == 1080
        assert d.get("size", {}).get("h") == 1080
        assert d.get("image_base64")  # base64 svg

        # GET creatives — verify presence
        r2 = admin_session.get(
            f"{BASE_URL}/api/digi/creatives",
            params={"client_id": digi_client["id"]},
            timeout=30,
        )
        assert r2.status_code == 200
        ids = [x["id"] for x in r2.json()]
        assert d["id"] in ids

        # cleanup
        admin_session.delete(f"{BASE_URL}/api/digi/creatives/{d['id']}", timeout=30)

    def test_save_rejects_non_svg(self, admin_session, digi_client):
        r = admin_session.post(
            f"{BASE_URL}/api/digi/creatives/save",
            json={"client_id": digi_client["id"], "svg": "not svg"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_save_rejects_oversize_svg(self, admin_session, digi_client):
        big = "<svg " + "x" * 600_000 + "></svg>"
        r = admin_session.post(
            f"{BASE_URL}/api/digi/creatives/save",
            json={"client_id": digi_client["id"], "svg": big},
            timeout=30,
        )
        assert r.status_code == 400
