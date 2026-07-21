"""
Iter 49 — Website-crawler enrichment tests.

Strategy: spin up a tiny in-process HTTP server on 127.0.0.1:PORT that serves
canned HTML pages. The backend (same container) reaches it via the loopback,
so we exercise the real `_fetch` / httpx code path with deterministic responses.
"""
import os
import re
import time
import uuid
import threading
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"
INTERN_EMAIL = "intern@projexino.com"
INTERN_PASSWORD = "Intern@2026"


# ──────────────────────────── tiny local HTML host ─────────────────────────
PAGES = {}  # path -> (html, content_type)

def _add_page(path, html, ctype="text/html; charset=utf-8"):
    PAGES[path] = (html, ctype)


def _set_root_html(html):
    """Register HTML at '/' (and clear other pages) so the backend's first
    candidate URL hit ('/' on the lead's netloc) always returns our HTML."""
    PAGES.clear()
    PAGES["/"] = (html, "text/html; charset=utf-8")


class _Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Try exact path, otherwise fall back to root ("/") so that the
        # backend's _candidate_urls (which only knows netloc and tries "/",
        # "/contact", "/about", …) always lands on the registered canned HTML.
        page = PAGES.get(self.path) or PAGES.get("/")
        if not page:
            self.send_response(404); self.end_headers(); return
        html, ctype = page
        body = html.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a, **k):  # silent
        pass


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def html_server():
    port = _free_port()
    srv = ThreadingHTTPServer(("127.0.0.1", port), _Handler)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = f"http://127.0.0.1:{port}"
    yield base
    srv.shutdown()


# ───────────────────────────────── auth ────────────────────────────────────
def _login(email, password):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture(scope="module")
def intern():
    return _login(INTERN_EMAIL, INTERN_PASSWORD)


# ─────────────────────────── lead helpers ─────────────────────────────────
_CREATED_IDS = []

def _create_lead(client, **fields):
    payload = {"email": f"TEST_{uuid.uuid4().hex[:8]}@iter49.test", "name": "TEST lead"}
    payload.update(fields)
    r = client.post(f"{BASE_URL}/api/outreach/leads", json=payload, timeout=15)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    lid = data.get("id") or data.get("lead", {}).get("id")
    assert lid, f"no id in {data}"
    _CREATED_IDS.append((client, lid))
    return lid, data


@pytest.fixture(scope="module", autouse=True)
def cleanup_leads():
    yield
    for client, lid in _CREATED_IDS:
        try:
            client.delete(f"{BASE_URL}/api/outreach/leads/{lid}", timeout=10)
        except Exception:
            pass


# ───────────────────────────── TESTS ──────────────────────────────────────

# Test 1: single-lead enrichment basic shape (no emails on site → empty arrays, no error)
def test_single_enrich_empty_site_returns_ok(admin, html_server):
    _set_root_html("<html><body>nothing here</body></html>")
    lid, _ = _create_lead(admin,
        email=f"noemail+{uuid.uuid4().hex[:8]}@google-maps.lead",
        name="TEST Empty Site",
        website=html_server,
    )
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("ok") is True
    assert "lead" in j
    assert isinstance(j.get("emails"), list)
    assert isinstance(j.get("phones"), list)
    assert isinstance(j.get("fetched_pages"), int)
    assert j["fetched_pages"] >= 1  # confirms the loopback fetch worked


# Test 2: synthetic email replaced; mailto preferred local-part wins
def test_enrich_replaces_synthetic_email(admin, html_server):
    _set_root_html("""<html><body>
      Contact: contact@brand.io
      <a href="mailto:hello@brand.io">Email us</a>
    </body></html>""")
    syn = f"noemail+{uuid.uuid4().hex[:8]}@google-maps.lead"
    lid, _ = _create_lead(admin, email=syn, name="TEST Brand", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    emails = j.get("emails", [])
    assert "hello@brand.io" in emails or "contact@brand.io" in emails, f"emails={emails}"
    new_email = (j.get("lead") or {}).get("email", "")
    assert new_email in ("hello@brand.io", "contact@brand.io"), f"lead.email not replaced: {new_email}"
    assert new_email != syn
    enrich = (j.get("lead") or {}).get("enrichment") or {}
    assert "emails_found" in enrich and "enriched_at" in enrich


# Test 3: preserves real (non-synthetic) email
def test_enrich_preserves_real_email(admin, html_server):
    _set_root_html('<html><body><a href="mailto:hello@acme.io">x</a></body></html>')
    real = f"ceo{uuid.uuid4().hex[:6]}@acme.io"
    lid, _ = _create_lead(admin, email=real, name="TEST RealEmail", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    new_email = (r.json().get("lead") or {}).get("email", "")
    assert new_email == real, f"real email overwritten to {new_email}"


# Test 4: phone extraction — tel link + body number
def test_enrich_phone_extraction(admin, html_server):
    _set_root_html("""<html><body>
      <a href="tel:+14155551234">call</a>
      Reach us at +1 (415) 555-9876 anytime.
    </body></html>""")
    lid, _ = _create_lead(admin, email=f"phones{uuid.uuid4().hex[:8]}@iter49.io",
                           name="TEST Phones", website=html_server, phone="")
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    phones = r.json().get("phones", [])
    flat = [re.sub(r"[\s().\-]", "", str(p)) for p in phones]
    assert any("4155551234" in p for p in flat), f"missing +14155551234 in {phones}"
    assert any("4155559876" in p for p in flat), f"missing 4155559876 in {phones}"
    lead_phone = (r.json().get("lead") or {}).get("phone", "")
    assert lead_phone, "lead.phone should be populated when previously empty"


# Test 5: obfuscated emails decoded
def test_enrich_obfuscated_emails(admin, html_server):
    _set_root_html("""<html><body>
      Write to mark [at] foo.io
      or use mark (at) foo (dot) io
    </body></html>""")
    lid, _ = _create_lead(admin, email=f"noemail+{uuid.uuid4().hex[:8]}@google-maps.lead",
                           name="TEST Obf", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    emails = r.json().get("emails", [])
    assert "mark@foo.io" in emails, f"obfuscated not decoded: {emails}"


# Test 6: bad-email filtering (icon@image.png, noreply dropped; sales kept)
def test_enrich_filters_bad_emails(admin, html_server):
    _set_root_html("""<html><body>
      <img alt="icon@image.png"/>
      Email: noreply@brand.io or sales@brand.io
    </body></html>""")
    lid, _ = _create_lead(admin, email=f"noemail+{uuid.uuid4().hex[:8]}@google-maps.lead",
                           name="TEST Bad", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    emails = r.json().get("emails", [])
    assert "sales@brand.io" in emails
    assert "noreply@brand.io" not in emails
    assert not any(e.endswith(".png") for e in emails)


# Test 7: domain hint — verify both emails detected (loopback host means
# neither is on-domain, so we just verify discovery + ordering metadata).
def test_enrich_domain_hint(admin, html_server):
    _set_root_html("""<html><body>
      Contact: random@gmail.com
      Or: hi@acme.io
    </body></html>""")
    lid, _ = _create_lead(admin, email=f"noemail+{uuid.uuid4().hex[:8]}@google-maps.lead",
                           name="TEST Domain", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=30)
    assert r.status_code == 200, r.text
    emails = r.json().get("emails", [])
    assert "hi@acme.io" in emails and "random@gmail.com" in emails


# Test 8: bulk only_synthetic picks only synthetic leads
def test_enrich_batch_only_synthetic(admin, html_server):
    _set_root_html('<html><body><a href="mailto:contact@syn.io">x</a></body></html>')
    tag = uuid.uuid4().hex[:6]
    syn_ids = []
    for i in range(3):
        lid, _ = _create_lead(admin,
            email=f"noemail+{tag}-{i}@google-maps.lead",
            name=f"TEST Syn {tag} {i}",
            website=html_server,
        )
        syn_ids.append(lid)
    normal_id, _ = _create_lead(admin,
        email=f"normal{tag}@real.io",
        name=f"TEST Normal {tag}",
        website=html_server,
    )
    r = admin.post(f"{BASE_URL}/api/outreach/leads/enrich-batch",
                    json={"only_synthetic": True, "limit": 100}, timeout=180)
    assert r.status_code == 200, r.text
    j = r.json()
    res_ids = {x["id"] for x in j.get("results", [])}
    for sid in syn_ids:
        assert sid in res_ids, f"synthetic {sid} missing from batch results"
    assert normal_id not in res_ids, "normal lead should not be touched by only_synthetic batch"
    assert j.get("total", 0) >= 3


# Test 9: bulk with explicit lead_ids processes only listed ids
def test_enrich_batch_explicit_ids(admin, html_server):
    _set_root_html('<html><body><a href="mailto:hi@exp.io">x</a></body></html>')
    a, _ = _create_lead(admin, email=f"expa{uuid.uuid4().hex[:8]}@iter49.io",
                         name="TEST Exp A", website=html_server)
    b, _ = _create_lead(admin, email=f"expb{uuid.uuid4().hex[:8]}@iter49.io",
                         name="TEST Exp B", website=html_server)
    c, _ = _create_lead(admin, email=f"expc{uuid.uuid4().hex[:8]}@iter49.io",
                         name="TEST Exp C", website=html_server)
    r = admin.post(f"{BASE_URL}/api/outreach/leads/enrich-batch",
                    json={"lead_ids": [a, b]}, timeout=120)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("total") == 2
    ids = {x["id"] for x in j.get("results", [])}
    assert ids == {a, b}
    assert c not in ids


# Test 10: RBAC — intern user cannot enrich
def test_enrich_rbac_intern_forbidden(admin, intern, html_server):
    _set_root_html('<html><body>no emails</body></html>')
    lid, _ = _create_lead(admin, email=f"rbac{uuid.uuid4().hex[:8]}@iter49.io",
                           name="TEST RBAC", website=html_server)
    r = intern.post(f"{BASE_URL}/api/outreach/leads/{lid}/enrich", timeout=15)
    assert r.status_code == 403, f"expected 403 for intern, got {r.status_code}: {r.text[:200]}"
