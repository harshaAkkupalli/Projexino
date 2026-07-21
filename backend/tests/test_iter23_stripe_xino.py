"""Iteration 23 tests: Stripe-linked invoices + Multi-currency Xino + PDF + activity log.

Run:
  pytest /app/backend/tests/test_iter23_stripe_xino.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/iter23.xml
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "http://localhost:8001"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

REQUIRED_CURRENCIES = ["USD", "INR", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "ZAR", "JPY"]


# ---------- shared fixtures ----------
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


# ============================================================
# 1. Xino: 50% discount + multi-currency map
# ============================================================
class TestXinoMultiCurrency:
    @pytest.fixture(scope="class")
    def estimate(self):
        payload = {
            "name": "TEST_iter23_user",
            "email": f"TEST_iter23_{uuid.uuid4().hex[:6]}@example.com",
            "company": "TEST Corp",
            "phone": "+919999999999",
            "app_type": "web_mobile",
            "requirements": "Build an enterprise SaaS with multi-tenant RBAC, Stripe billing, real-time chat and AI-powered analytics. iOS+Android+Web.",
        }
        r = requests.post(f"{BASE_URL}/api/xino/estimate", json=payload, timeout=120)
        assert r.status_code == 200, f"estimate failed {r.status_code} {r.text[:300]}"
        return r.json()

    def test_50pct_discount(self, estimate):
        ml = estimate["market_low_usd"]
        mh = estimate["market_high_usd"]
        bl = estimate["budget_low_usd"]
        bh = estimate["budget_high_usd"]
        assert ml > 0 and mh > 0 and bl > 0 and bh > 0
        # Budget should be ~50% of market (allow ±5% for rounding to -100)
        ratio_low = bl / ml
        ratio_high = bh / mh
        assert 0.45 <= ratio_low <= 0.55, f"low ratio {ratio_low} not ~0.5 (mkt {ml}, budget {bl})"
        assert 0.45 <= ratio_high <= 0.55, f"high ratio {ratio_high} not ~0.5 (mkt {mh}, budget {bh})"

    def test_discount_pct_field(self, estimate):
        assert estimate.get("discount_pct") == 50

    def test_currencies_map_has_10(self, estimate):
        currencies = estimate.get("currencies") or {}
        for code in REQUIRED_CURRENCIES:
            assert code in currencies, f"Missing currency {code} in {list(currencies.keys())}"
            entry = currencies[code]
            assert "low" in entry and "high" in entry and "symbol" in entry and "code" in entry
            assert isinstance(entry["low"], int) and isinstance(entry["high"], int)
            assert entry["code"] == code
            assert entry["low"] > 0 and entry["high"] >= entry["low"]

    def test_inr_higher_than_usd(self, estimate):
        usd_low = estimate["currencies"]["USD"]["low"]
        inr_low = estimate["currencies"]["INR"]["low"]
        # INR should be ~80x USD (just sanity ratio)
        assert inr_low > usd_low * 50

    def test_lead_auto_created_with_market_ref(self, estimate, admin_session):
        email = None
        # Fetch leads list
        r = admin_session.get(f"{BASE_URL}/api/leads?limit=50", timeout=30)
        assert r.status_code == 200
        leads = r.json()
        # Find matching by source
        matched = [
            ld for ld in leads
            if ld.get("source") == "xino-ai-estimator"
            and "Projexino offer (50% off market)" in (ld.get("notes") or "")
            and "Market reference" in (ld.get("notes") or "")
        ]
        assert len(matched) >= 1, "No lead with the new 50% / Market reference notes found"


# ============================================================
# 2. Company Profile PDF (visual-heavy 5-page)
# ============================================================
class TestCompanyProfilePDF:
    def test_pdf_returns_valid_multipage(self):
        r = requests.get(f"{BASE_URL}/api/xino/company-profile.pdf", timeout=60)
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        # ~38KB visual-heavy
        assert len(r.content) >= 30 * 1024, f"PDF only {len(r.content)} bytes, expected >=30KB"
        body = r.content
        # PDF page detection — search for /Kids array in pages tree or /Count N
        import re
        m = re.search(rb"/Kids\s*\[([^\]]+)\]", body)
        page_count = 0
        if m:
            page_count = len(re.findall(rb"\d+\s+0\s+R", m.group(1)))
        if page_count == 0:
            cm = re.search(rb"/Count\s+(\d+)", body)
            if cm:
                page_count = int(cm.group(1))
        assert page_count >= 4, f"Only {page_count} pages detected — expected ~5"


# ============================================================
# 3. Stripe checkout + activity log
# ============================================================
class TestRegression:
    def test_public_invoice_unknown_404(self):
        r = requests.get(f"{BASE_URL}/api/public/invoice/nonexistent_xyz", timeout=15)
        assert r.status_code == 404

    def test_finance_activity_requires_auth(self):
        # Without auth — should be 401 or 403
        r = requests.get(f"{BASE_URL}/api/finance/activity", timeout=15)
        assert r.status_code in (401, 403)
