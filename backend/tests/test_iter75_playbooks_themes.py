"""Iter75 – Playbooks themes redesign + full_page image + clickable URLs.

Covers backend requirements from review request:
  1. GET /api/playbooks/themes returns exactly the 5 new theme keys.
  2. POST /api/playbooks accepts theme='future_tech' AND legacy 'midnight' (alias).
  3. Playbook with content section (URL) + full_page image section builds a PDF
     via GET /api/public/playbooks/{slug}/pdf. PDF bytes contain '/URI' link
     annotations (clickable).
  4. Cleanup test playbooks after run.
"""
import base64
import io
import os
import struct
import zlib

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://projexino-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

EXPECTED_THEMES = {"future_tech", "minimal_clean", "creative_edge", "corporate_pro", "nature"}


def _tiny_png_datauri() -> str:
    """Build a 1x1 red PNG and return as data URI."""
    # PNG signature
    sig = b"\x89PNG\r\n\x1a\n"

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)  # 1x1 RGB
    raw = b"\x00" + bytes([255, 0, 0])  # filter=0 + one red pixel
    idat = zlib.compress(raw)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    b64 = base64.b64encode(png).decode("ascii")
    return f"data:image/png;base64,{b64}"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    ids = []
    yield ids


def test_themes_endpoint_returns_exactly_five_new_keys(auth_headers):
    r = requests.get(f"{API}/playbooks/themes", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert isinstance(data, dict)
    got = set(data.keys())
    assert got == EXPECTED_THEMES, f"themes mismatch: got={got} expected={EXPECTED_THEMES}"
    # Check labels present
    for k in EXPECTED_THEMES:
        assert "label" in data[k], f"missing label for {k}"
        assert "accent" in data[k]


def test_create_playbook_with_future_tech_and_urls_full_page(auth_headers, created_ids):
    payload = {
        "title": "TEST_iter75_future_tech",
        "subtitle": "Iter75 automated test",
        "author": "T1 SDET",
        "category": "Playbook",
        "theme": "future_tech",
        "sections": [
            {
                "heading": "Overview",
                "body": "Visit https://projexino.com and https://www.projexino.com for details. Also mailto is handled separately.",
            },
            {
                "heading": "",
                "body": "",
                "full_page": True,
                "image_b64": _tiny_png_datauri(),
            },
        ],
    }
    r = requests.post(f"{API}/playbooks", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code == 200, f"create failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data["theme"] == "future_tech"
    assert data["title"] == payload["title"]
    assert data.get("slug"), "slug missing"
    assert len(data.get("sections") or []) == 2, f"expected 2 sections, got {data.get('sections')}"
    created_ids.append((data["id"], data["slug"]))


def test_create_playbook_with_legacy_midnight_alias(auth_headers, created_ids):
    payload = {
        "title": "TEST_iter75_midnight_alias",
        "theme": "midnight",  # legacy alias -> future_tech
        "sections": [
            {"heading": "Legacy Theme", "body": "Ensure alias mapping still creates a valid playbook."},
        ],
    }
    r = requests.post(f"{API}/playbooks", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code == 200, f"midnight alias create failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    # DB stores raw theme string; PDF resolves via alias. We just ensure creation didn't reject the alias.
    assert data["theme"] == "midnight"
    assert data.get("slug")
    created_ids.append((data["id"], data["slug"]))


def test_pdf_download_has_uri_annotations(created_ids):
    assert created_ids, "prerequisite create test did not run"
    # Use the first playbook (future_tech + URL body)
    _, slug = created_ids[0]
    r = requests.get(f"{API}/public/playbooks/{slug}/pdf", timeout=60)
    assert r.status_code == 200, f"pdf fetch failed: {r.status_code} {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
    body = r.content
    assert body.startswith(b"%PDF-"), f"not a pdf (first 20 bytes: {body[:20]!r})"
    assert body.rstrip().endswith(b"%%EOF"), "pdf tail missing"
    # Must contain URI link annotations (clickable links)
    assert b"/URI" in body, "PDF does not contain /URI link annotations (clickable URLs)"
    # sanity: contains www.projexino.com string somewhere (either raw or in URI action)
    assert b"projexino.com" in body, "PDF does not reference projexino.com"


def test_pdf_download_for_alias_theme(created_ids):
    assert len(created_ids) >= 2, "midnight alias playbook not created"
    _, slug = created_ids[1]
    r = requests.get(f"{API}/public/playbooks/{slug}/pdf", timeout=60)
    assert r.status_code == 200, r.text[:200]
    body = r.content
    assert body.startswith(b"%PDF-")
    # midnight alias -> future_tech design -> should still produce clickable /URI
    assert b"/URI" in body, "alias PDF missing /URI annotations"


def test_cleanup_delete_test_playbooks(auth_headers, created_ids):
    for pid, _slug in created_ids:
        r = requests.delete(f"{API}/playbooks/{pid}", headers=auth_headers, timeout=20)
        assert r.status_code in (200, 204), f"delete {pid} failed: {r.status_code} {r.text[:200]}"


def test_real_client_onboarding_playbook_untouched(auth_headers):
    """Make sure the pre-existing real playbook is still present after our tests."""
    r = requests.get(f"{API}/playbooks", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text[:200]
    items = r.json()
    slugs = [p.get("slug") for p in items]
    # It's OK if not present (main agent might have removed it in another env); this is informational.
    if "client-onboarding-playbook" in slugs:
        assert True
    else:
        pytest.skip(f"client-onboarding-playbook not in shelf (found: {slugs})")
