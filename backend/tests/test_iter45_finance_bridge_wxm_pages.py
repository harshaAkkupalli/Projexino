"""Iter 45 — Backend tests for:
  Fix 1: Clients→Finance push (project_finance collection) + idempotency + payment sync
  Fix 3: WXM Pages CRUD + AI draft + publish/unpublish + public read
"""
import os
import time
import requests
import pytest

def _load_base():
    env_val = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if env_val:
        return env_val.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_base()
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def client_and_project(session):
    # Create test client + project
    cr = session.post(f"{BASE_URL}/api/clients", json={
        "name": "TEST_Iter45 Client",
        "company": "TEST_Iter45 Co",
        "email": "iter45@test.com",
        "country": "IN",
        "currency_default": "USD",
    })
    assert cr.status_code in (200, 201), cr.text
    cid = cr.json()["id"]

    pr = session.post(f"{BASE_URL}/api/clients/{cid}/projects", json={
        "name": "TEST_Iter45 Engagement",
        "description": "Bridge test",
        "status": "active",
        "currency": "USD",
        "agreed_amount": 12000.0,
    })
    assert pr.status_code in (200, 201), pr.text
    pid = pr.json()["id"]

    # Add an initial payment
    pay = session.post(f"{BASE_URL}/api/client-projects/{pid}/payments", json={
        "amount": 3000.0, "currency": "USD", "method": "bank_transfer", "note": "advance"
    })
    assert pay.status_code in (200, 201), pay.text

    yield cid, pid

    # Cleanup
    session.delete(f"{BASE_URL}/api/clients/{cid}")


# ─── Fix 1: Finance bridge ───────────────────────────────────────
class TestFinanceBridge:

    def test_push_creates_finance_project(self, session, client_and_project):
        cid, pid = client_and_project
        r = session.post(f"{BASE_URL}/api/client-projects/{pid}/push-to-finance")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["already_pushed"] is False
        assert "finance_project_id" in data
        fin_id = data["finance_project_id"]

        # Verify presence in /api/finance/projects
        fr = session.get(f"{BASE_URL}/api/finance/projects")
        assert fr.status_code == 200, fr.text
        projects = fr.json()
        matches = [p for p in projects if p.get("source_project_id") == pid]
        assert len(matches) == 1, f"Expected exactly 1 finance entry, got {len(matches)}"
        m = matches[0]
        assert m["id"] == fin_id
        assert m.get("source") == "clients_hub"
        assert m.get("project_name") == "TEST_Iter45 Engagement"
        assert float(m.get("locked_budget", 0)) == 12000.0
        assert len(m.get("payments", [])) == 1
        assert float(m["payments"][0]["amount"]) == 3000.0

    def test_idempotency_no_duplicate(self, session, client_and_project):
        cid, pid = client_and_project
        # First push (already happened) - call again
        r1 = session.post(f"{BASE_URL}/api/client-projects/{pid}/push-to-finance")
        assert r1.status_code == 200
        first_fin_id = r1.json()["finance_project_id"]

        r2 = session.post(f"{BASE_URL}/api/client-projects/{pid}/push-to-finance")
        assert r2.status_code == 200
        data2 = r2.json()
        assert data2["already_pushed"] is True
        assert data2["finance_project_id"] == first_fin_id

        # Only 1 record in finance for this source project
        fr = session.get(f"{BASE_URL}/api/finance/projects")
        matches = [p for p in fr.json() if p.get("source_project_id") == pid]
        assert len(matches) == 1, f"Idempotency broken — found {len(matches)} entries"

    def test_payment_sync_on_repush(self, session, client_and_project):
        cid, pid = client_and_project
        # Add a new payment
        new_pay = session.post(f"{BASE_URL}/api/client-projects/{pid}/payments", json={
            "amount": 4000.0, "currency": "USD", "method": "wire", "note": "milestone-1"
        })
        assert new_pay.status_code in (200, 201)

        # Re-push
        r = session.post(f"{BASE_URL}/api/client-projects/{pid}/push-to-finance")
        assert r.status_code == 200
        assert r.json()["payments_pushed"] == 2

        # Verify finance entry now has 2 payments
        fr = session.get(f"{BASE_URL}/api/finance/projects")
        matches = [p for p in fr.json() if p.get("source_project_id") == pid]
        assert len(matches) == 1
        assert len(matches[0].get("payments", [])) == 2
        amounts = sorted([float(p["amount"]) for p in matches[0]["payments"]])
        assert amounts == [3000.0, 4000.0]


# ─── Fix 3: WXM Pages ────────────────────────────────────────────
class TestWxmPages:
    page_id = None
    slug = None

    def test_list_pages_empty_or_list(self, session):
        r = session.get(f"{BASE_URL}/api/wxm/pages")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_page(self, session):
        r = session.post(f"{BASE_URL}/api/wxm/pages", json={
            "title": "TEST_Iter45 AI staff augmentation",
            "meta_description": "Hire AI engineering teams fast.",
            "meta_keywords": ["ai", "staff augmentation"],
            "hero_eyebrow": "For modern teams",
            "hero_headline": "Ship AI features 3x faster",
            "hero_subhead": "Dedicated AI engineers embedded in your team.",
            "cta_label": "Book a call",
            "cta_url": "/contact",
            "sections": [
                {"type": "intro", "heading": "Why us", "body": "We deliver."},
            ],
        })
        assert r.status_code in (200, 201), r.text
        d = r.json()
        assert d.get("status") == "draft"
        assert d.get("slug")
        TestWxmPages.page_id = d["id"]
        TestWxmPages.slug = d["slug"]

    def test_duplicate_slug_rejected(self, session):
        r = session.post(f"{BASE_URL}/api/wxm/pages", json={
            "title": "TEST_Iter45 AI staff augmentation",
        })
        assert r.status_code == 400

    def test_update_page(self, session):
        r = session.patch(f"{BASE_URL}/api/wxm/pages/{TestWxmPages.page_id}", json={
            "meta_description": "Updated description.",
            "sections": [{"type": "intro", "heading": "New", "body": "Updated."}],
        })
        assert r.status_code == 200
        assert r.json()["meta_description"] == "Updated description."

    def test_public_unpublished_404(self, session):
        # Unauth public access
        r = requests.get(f"{BASE_URL}/api/public/wxm/pages/{TestWxmPages.slug}")
        assert r.status_code == 404, "Unpublished page must 404 on public route"

    def test_publish_page(self, session):
        r = session.post(f"{BASE_URL}/api/wxm/pages/{TestWxmPages.page_id}/publish")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "published"
        assert r.json().get("published_at")

    def test_public_published_accessible(self, session):
        r = requests.get(f"{BASE_URL}/api/public/wxm/pages/{TestWxmPages.slug}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["slug"] == TestWxmPages.slug
        assert d["status"] == "published"

    def test_unpublish(self, session):
        r = session.post(f"{BASE_URL}/api/wxm/pages/{TestWxmPages.page_id}/unpublish")
        assert r.status_code == 200
        assert r.json()["status"] == "draft"

        r2 = requests.get(f"{BASE_URL}/api/public/wxm/pages/{TestWxmPages.slug}")
        assert r2.status_code == 404

    def test_ai_draft(self, session):
        r = session.post(f"{BASE_URL}/api/wxm/pages/ai-draft", json={
            "topic": "AI staff augmentation for fintech",
            "primary_keyword": "AI staff augmentation",
            "audience": "fintech CTOs",
        }, timeout=60)
        # Could fail if no AI key, but should be configured per env
        if r.status_code == 400 and "AI provider" in r.text:
            pytest.skip("AI provider not configured")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("title")
        assert d.get("hero_headline")
        assert d.get("sections")
        assert d.get("ai_generated") is True
        assert isinstance(d.get("meta_keywords"), list)

    def test_delete_page(self, session):
        r = session.delete(f"{BASE_URL}/api/wxm/pages/{TestWxmPages.page_id}")
        assert r.status_code == 200
        # Verify gone
        r2 = session.get(f"{BASE_URL}/api/wxm/pages/{TestWxmPages.page_id}")
        assert r2.status_code == 404
