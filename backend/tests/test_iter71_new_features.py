"""Iter71 backend regression tests for:
   (1) Playbooks module (parse, PDF, sections with table+image)
   (2) HR sign-doc QR / public sign-link + public GET/POST
   (3) Outreach email-blast (create → 400 expected on launch since Gmail off) + analytics
   (4) Xino from-xino → creates lead + list
"""
import os
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@projexino.com"
ADMIN_PASSWORD = "Projexino@2026"

# 1x1 png
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return s


# --- Playbooks ------------------------------------------------------------

class TestPlaybooks:
    def test_create_with_table_and_image(self, session):
        payload = {
            "title": "TEST Iter71 API Playbook",
            "subtitle": "sub",
            "author": "TEST",
            "category": "Ops",
            "theme": "emerald",
            "sections": [
                {
                    "heading": "Intro",
                    "body": "para1\n\n- b1\n- b2",
                    "table": [["c1", "c2"], ["v1", "v2"]],
                    "image_b64": TINY_PNG_B64,
                }
            ],
        }
        r = session.post(f"{BASE_URL}/api/playbooks", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        pb = r.json()
        assert pb["slug"]
        assert pb["sections"][0]["heading"] == "Intro"
        pytest.pb_slug = pb["slug"]
        pytest.pb_id = pb["id"]

    def test_public_pdf(self, session):
        slug = pytest.pb_slug
        r = requests.get(f"{BASE_URL}/api/public/playbooks/{slug}/pdf", timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-", "should return PDF magic bytes"
        assert len(r.content) > 3000

    def test_parse_endpoint(self, session):
        r = session.post(f"{BASE_URL}/api/playbooks/parse",
                         json={"text": "HEADING ONE\n\npara\n\nHEADING TWO\n\nmore"}, timeout=30)
        assert r.status_code == 200
        secs = r.json().get("sections", [])
        assert len(secs) >= 1

    def test_delete_cleanup(self, session):
        r = session.delete(f"{BASE_URL}/api/playbooks/{pytest.pb_id}", timeout=30)
        assert r.status_code == 200


# --- HR sign-docs QR ------------------------------------------------------

class TestHRSignDocs:
    def test_create_signdoc(self, session):
        r = session.post(f"{BASE_URL}/api/hr/sign-docs", json={
            "name": "TEST Iter71 API SignDoc",
            "audience_role": "all",
            "body_html": "<p>sign please</p>",
        }, timeout=30)
        assert r.status_code == 200, r.text
        # Endpoint returns full list; find our doc
        pytest.sd_id = None
        for d in (r.json() if isinstance(r.json(), list) else []):
            if d.get("name") == "TEST Iter71 API SignDoc":
                pytest.sd_id = d["id"]
                break
        if pytest.sd_id is None:
            # try GET
            r2 = session.get(f"{BASE_URL}/api/hr/sign-docs", timeout=30)
            for d in r2.json():
                if d.get("name") == "TEST Iter71 API SignDoc":
                    pytest.sd_id = d["id"]
                    break
        assert pytest.sd_id, "created sign-doc not found"

    def test_sign_link_and_public(self, session):
        did = pytest.sd_id
        r = session.post(f"{BASE_URL}/api/hr/sign-docs/{did}/sign-link", timeout=30)
        assert r.status_code == 200
        token = r.json().get("token")
        assert token

        # Public GET (no cookies)
        r2 = requests.get(f"{BASE_URL}/api/public/doc-sign/{token}", timeout=30)
        assert r2.status_code == 200
        j2 = r2.json()
        # server returns 'doc_name' in public GET
        assert j2.get("doc_name") == "TEST Iter71 API SignDoc" or j2.get("name") == "TEST Iter71 API SignDoc"

        # Public POST — sign
        r3 = requests.post(f"{BASE_URL}/api/public/doc-sign/{token}",
                           json={"signed_name": "TEST Public Signer"}, timeout=30)
        assert r3.status_code == 200
        assert r3.json().get("ok") is True

        # Bad token should 404
        r4 = requests.get(f"{BASE_URL}/api/public/doc-sign/bad-token-xyz", timeout=30)
        assert r4.status_code in (400, 404)

    def test_cleanup_signdoc(self, session):
        r = session.delete(f"{BASE_URL}/api/hr/sign-docs/{pytest.sd_id}", timeout=30)
        assert r.status_code == 200


# --- Outreach email-blast + analytics -------------------------------------

class TestOutreachBlast:
    def test_create_lead_from_xino_and_blast(self, session):
        # Create a lead via from-xino
        r = session.post(f"{BASE_URL}/api/outreach/leads/from-xino", json={
            "estimate_id": "test-iter71-fake-est",
            "email": "test_iter71_blast@example.com",
            "name": "TEST Iter71 Blast Lead",
            "list_name": "TEST Iter71 BlastList",
        }, timeout=30)
        # Endpoint may respond {ok:true, lead_id, list_id} — accept 200
        assert r.status_code == 200, r.text
        body = r.json()
        pytest.lead_id = body.get("lead_id") or body.get("lead", {}).get("id")
        pytest.list_id = body.get("list_id") or body.get("list", {}).get("id")
        assert pytest.lead_id

        # Fetch a template
        rt = session.get(f"{BASE_URL}/api/email/templates", timeout=30)
        assert rt.status_code == 200
        tmpls = rt.json()
        assert len(tmpls) > 0
        pytest.tpl_id = tmpls[0]["id"]

        # Post email-blast
        rb = session.post(f"{BASE_URL}/api/outreach/leads/email-blast", json={
            "lead_ids": [pytest.lead_id],
            "template_id": pytest.tpl_id,
            "playbook_slugs": [],
            "blog_ids": [],
            "batch_size": 300,
        }, timeout=45)
        # Either 200 (campaign created; async launch may fail with Gmail) or 400 with Gmail error
        assert rb.status_code in (200, 400), rb.text
        pytest.blast_campaign_id = None
        if rb.status_code == 200:
            pytest.blast_campaign_id = rb.json().get("campaign_id") or rb.json().get("id")

    def test_analytics(self, session):
        # Get campaigns
        rc = session.get(f"{BASE_URL}/api/outreach/campaigns", timeout=30)
        assert rc.status_code == 200
        camps = rc.json()
        cid = None
        for c in camps:
            if (c.get("name") or "").startswith("Blast"):
                cid = c["id"]; break
        assert cid, "blast campaign not found"

        ra = session.get(f"{BASE_URL}/api/outreach/campaigns/{cid}/analytics", timeout=30)
        assert ra.status_code == 200
        js = ra.json()
        # stats + rates
        assert "audience" in js or "stats" in js
        pytest.blast_campaign_id = cid

    def test_cleanup_blast(self, session):
        # Delete campaign
        if getattr(pytest, "blast_campaign_id", None):
            session.delete(f"{BASE_URL}/api/outreach/campaigns/{pytest.blast_campaign_id}", timeout=30)
        # Delete lead
        if getattr(pytest, "lead_id", None):
            session.delete(f"{BASE_URL}/api/outreach/leads/{pytest.lead_id}", timeout=30)
        # Delete list
        if getattr(pytest, "list_id", None):
            session.delete(f"{BASE_URL}/api/outreach/lead-lists/{pytest.list_id}", timeout=30)
