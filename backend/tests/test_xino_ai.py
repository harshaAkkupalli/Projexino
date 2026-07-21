"""Tests for Xino AI estimator + Company Profile PDF + Lead auto-creation."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to internal: tests should use external URL
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


# ===== Company Profile PDF =====
class TestCompanyProfile:
    def test_pdf_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/xino/company-profile.pdf", timeout=60)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 5000  # real PDF, not stub

    def test_info_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/xino/company-profile/info", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "custom" in data
        assert data["url"] == "/api/xino/company-profile.pdf"
        assert isinstance(data["custom"], bool)


# ===== Estimate endpoint =====
class TestEstimate:
    def test_invalid_short_requirements(self):
        r = requests.post(
            f"{BASE_URL}/api/xino/estimate",
            json={
                "name": "Test User",
                "email": "shorttest@test.com",
                "app_type": "web",
                "requirements": "too short",
            },
            timeout=30,
        )
        assert r.status_code == 422

    def test_invalid_email(self):
        r = requests.post(
            f"{BASE_URL}/api/xino/estimate",
            json={
                "name": "Test",
                "email": "notanemail",
                "app_type": "web",
                "requirements": "x" * 25,
            },
            timeout=30,
        )
        assert r.status_code == 422

    def test_invalid_app_type(self):
        r = requests.post(
            f"{BASE_URL}/api/xino/estimate",
            json={
                "name": "Test",
                "email": "ok@ok.com",
                "app_type": "blackberry",
                "requirements": "x" * 25,
            },
            timeout=30,
        )
        assert r.status_code == 422

    def test_valid_estimate_returns_result(self):
        unique_email = f"TEST_xino_{uuid.uuid4().hex[:8]}@example.com"
        payload = {
            "name": "Xino Tester",
            "email": unique_email,
            "company": "Test Co",
            "phone": "+1-555-0001",
            "app_type": "web_mobile",
            "requirements": (
                "Need a multi-tenant SaaS dashboard with Stripe billing, "
                "AI-powered analytics, real-time chat, admin panel, role-based access."
            ),
        }
        r = requests.post(
            f"{BASE_URL}/api/xino/estimate", json=payload, timeout=120,
        )
        assert r.status_code == 200, f"Estimate failed: {r.status_code} {r.text}"
        data = r.json()
        # Required keys
        for k in ("id", "budget_low_usd", "budget_high_usd", "timeline_weeks_low",
                  "timeline_weeks_high", "summary", "modules", "breakdown",
                  "tech_stack", "risks", "budget_low_inr", "budget_high_inr",
                  "complexity", "confidence", "next_step", "created_at"):
            assert k in data, f"missing key {k}"
        assert isinstance(data["budget_low_usd"], int)
        assert data["budget_high_usd"] >= data["budget_low_usd"]
        assert data["timeline_weeks_high"] >= data["timeline_weeks_low"]
        assert isinstance(data["modules"], list) and len(data["modules"]) >= 1
        assert isinstance(data["breakdown"], list) and len(data["breakdown"]) >= 1
        for b in data["breakdown"]:
            assert "phase" in b and "weeks" in b and "cost_usd" in b
        # Persist for lead-check
        pytest.xino_email = unique_email
        pytest.xino_estimate_id = data["id"]


# ===== Lead auto-creation =====
class TestLeadAutoCreate:
    def test_lead_created_for_estimate(self, admin_session):
        # Wait briefly for write to settle
        time.sleep(1.0)
        email = getattr(pytest, "xino_email", None)
        if not email:
            pytest.skip("estimate not created in prior test")
        r = admin_session.get(f"{BASE_URL}/api/leads", timeout=30)
        assert r.status_code == 200, f"leads list failed: {r.status_code} {r.text}"
        leads = r.json()
        # leads might be list or dict
        if isinstance(leads, dict):
            leads = leads.get("items") or leads.get("leads") or []
        match = [l for l in leads if l.get("email") == email]
        assert len(match) >= 1, f"No lead found for {email} in {len(leads)} leads"
        lead = match[0]
        assert lead.get("source") == "xino-ai-estimator"


# ===== Super-admin endpoints =====
class TestAdminEndpoints:
    def test_estimates_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/xino/estimates", timeout=30)
        assert r.status_code in (401, 403)

    def test_estimates_list_as_admin(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/xino/estimates", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Should contain our test estimate if any
        email = getattr(pytest, "xino_email", None)
        if email:
            assert any(d.get("email") == email for d in data), \
                "Submitted estimate not in /estimates list"
