"""Iter 46 — Digi Marketing OS backend + WXM redesign smoke tests."""
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
INTERN = {"email": "intern@projexino.com", "password": "Intern@2026"}


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def intern_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=INTERN, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"intern login failed: {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ───── Digi · Dashboard ─────
def test_digi_dashboard(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/digi/dashboard", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("clients", "content_drafts", "creatives", "pending_approvals", "calendar", "metrics"):
        assert k in d, f"missing key {k}"


# ───── Digi · Clients CRUD ─────
@pytest.fixture(scope="module")
def created_client(admin_session):
    payload = {
        "name": "TEST_QA Brand",
        "industry": "fintech",
        "website": "https://example.com",
        "target_audience": "Series A founders",
        "locations": ["US", "IN"],
        "competitors": ["Stripe", "Razorpay"],
        "social_accounts": {"instagram": "@qatest"},
    }
    r = admin_session.post(f"{BASE_URL}/api/digi/clients", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    c = r.json()
    assert c["id"] and c["name"] == "TEST_QA Brand"
    assert c["status"] == "onboarding"
    yield c
    admin_session.delete(f"{BASE_URL}/api/digi/clients/{c['id']}", timeout=30)


def test_client_persisted(admin_session, created_client):
    r = admin_session.get(f"{BASE_URL}/api/digi/clients/{created_client['id']}", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["name"] == "TEST_QA Brand"
    assert d["industry"] == "fintech"
    assert "brand_kit" in d


def test_client_list(admin_session, created_client):
    r = admin_session.get(f"{BASE_URL}/api/digi/clients", timeout=30)
    assert r.status_code == 200
    rows = r.json()
    assert any(c["id"] == created_client["id"] for c in rows)


# ───── Brand Kit ─────
def test_brand_kit_upsert(admin_session, created_client):
    cid = created_client["id"]
    payload = {"primary_color": "#FF6600", "brand_voice": "Bold, no-nonsense", "accent_color": "#A855F7"}
    r = admin_session.put(f"{BASE_URL}/api/digi/clients/{cid}/brand-kit", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["primary_color"] == "#FF6600"
    assert d["brand_voice"] == "Bold, no-nonsense"
    # Persistence check
    r2 = admin_session.get(f"{BASE_URL}/api/digi/clients/{cid}/brand-kit", timeout=30)
    assert r2.status_code == 200
    assert r2.json()["primary_color"] == "#FF6600"


# ───── Strategy AI (graceful budget handling) ─────
def test_strategy_generate_graceful(admin_session, created_client):
    cid = created_client["id"]
    r = admin_session.post(f"{BASE_URL}/api/digi/clients/{cid}/strategies/generate",
                           json={"timeframe": "monthly"}, timeout=60)
    # Either AI succeeds (200) or budget/config error (400/502). Must NOT 500.
    assert r.status_code in (200, 400, 502), f"unexpected status {r.status_code}: {r.text}"
    if r.status_code == 200:
        d = r.json()
        assert "executive_summary" in d or "marketing" in d


# ───── Content AI (graceful budget handling) ─────
def test_content_generate_graceful(admin_session, created_client):
    r = admin_session.post(f"{BASE_URL}/api/digi/content/generate",
                           json={"client_id": created_client["id"], "kind": "caption",
                                 "platform": "instagram", "topic": "Diwali festive sale promo"},
                           timeout=60)
    assert r.status_code in (200, 400, 502), f"unexpected: {r.status_code} {r.text}"


def test_content_missing_topic(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/digi/content/generate",
                           json={"kind": "caption", "platform": "instagram"}, timeout=30)
    assert r.status_code == 400


# ───── Creative (SVG, no AI cost) ─────
def test_creative_generate(admin_session, created_client):
    r = admin_session.post(f"{BASE_URL}/api/digi/creatives/generate",
                           json={"client_id": created_client["id"], "kind": "poster",
                                 "platform": "instagram", "headline": "Festive · 30% off",
                                 "prompt": "Bold abstract festive theme"}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["mime_type"] == "image/svg+xml"
    assert d["image_base64"]
    assert d["engine"] == "svg_placeholder_v1"
    assert d["size"]["w"] == 1080 and d["size"]["h"] == 1350


def test_creative_missing_prompt(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/digi/creatives/generate",
                           json={"kind": "poster"}, timeout=30)
    assert r.status_code == 400


# ───── Calendar CRUD ─────
def test_calendar_crud(admin_session, created_client):
    cid = created_client["id"]
    r = admin_session.post(f"{BASE_URL}/api/digi/calendar",
                           json={"client_id": cid, "title": "TEST_Sept launch teaser",
                                 "platform": "instagram", "kind": "post", "scheduled_at": "2026-01-31"},
                           timeout=30)
    assert r.status_code == 200, r.text
    entry = r.json()
    assert entry["status"] == "planned"
    eid = entry["id"]
    # Update status
    r2 = admin_session.patch(f"{BASE_URL}/api/digi/calendar/{eid}", json={"status": "scheduled"}, timeout=30)
    assert r2.status_code == 200
    assert r2.json()["status"] == "scheduled"
    # Delete
    admin_session.delete(f"{BASE_URL}/api/digi/calendar/{eid}", timeout=30)


def test_calendar_missing_fields(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/digi/calendar", json={"title": "no date"}, timeout=30)
    assert r.status_code == 400


# ───── Approvals ─────
def test_approvals_empty_list(admin_session):
    r = admin_session.get(f"{BASE_URL}/api/digi/approvals", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


# ───── Metrics upsert + ROI ─────
def test_metrics_upsert(admin_session, created_client):
    cid = created_client["id"]
    r = admin_session.post(f"{BASE_URL}/api/digi/metrics",
                           json={"client_id": cid, "date": "2026-01-15", "platform": "instagram",
                                 "reach": 1500, "leads": 12, "spend": 250, "revenue": 900},
                           timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["reach"] == 1500 and d["revenue"] == 900
    # List
    rl = admin_session.get(f"{BASE_URL}/api/digi/metrics?client_id={cid}", timeout=30)
    assert rl.status_code == 200
    assert any(m["date"] == "2026-01-15" for m in rl.json())


def test_metrics_missing(admin_session):
    r = admin_session.post(f"{BASE_URL}/api/digi/metrics", json={"client_id": "x"}, timeout=30)
    assert r.status_code == 400


# ───── Role gating: intern blocked ─────
def test_intern_blocked_digi(intern_session):
    r = intern_session.get(f"{BASE_URL}/api/digi/clients", timeout=30)
    assert r.status_code == 403, f"intern should be 403, got {r.status_code}"


def test_intern_blocked_dashboard(intern_session):
    r = intern_session.get(f"{BASE_URL}/api/digi/dashboard", timeout=30)
    assert r.status_code == 403


# ───── Unauthenticated rejected ─────
def test_unauth_rejected():
    r = requests.get(f"{BASE_URL}/api/digi/clients", timeout=30)
    assert r.status_code in (401, 403)
