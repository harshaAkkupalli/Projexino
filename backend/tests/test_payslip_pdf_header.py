"""
Backend test for payslip PDF header rendering (Iteration 66).
Verifies:
  - HR login works
  - Employee id can be resolved from directory
  - POST /api/hr/payslips/generate returns 200 with expected slip_no / gross / net
  - GET /api/hr/payslips/{id}/pdf returns a valid PDF
  - PDF page-1 rasterised via PyMuPDF (fitz) contains logo image AND
    the 'ENGINEERING STUDIOS ... AI WORKFLOWS' tagline in dark ink (legible)
  - Extracted text contains 'ENGINEERING STUDIOS' and 'PAYSLIP'
Cleanup: deletes generated payslip(s) for the target employee for 2026-07 plus
the known leftover slip id from the previous main-agent run.
"""
import os
import io
import re
import asyncio

import fitz  # PyMuPDF
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # Fallback: read frontend/.env directly (do not hardcode)
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

HR_EMAIL = "hr@projexino.com"
HR_PASSWORD = "HR@2026"
TARGET_EMPLOYEE_EMAIL = "msairam963@gmail.com"
TARGET_MONTH = "2026-07"
LEFTOVER_SLIP_ID = "e76332ef-9cc8-4627-b4c6-c183306f8365"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ── shared state across tests ────────────────────────────────────────────────
STATE: dict = {"generated_ids": []}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def hr_token(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": HR_EMAIL, "password": HR_PASSWORD},
    )
    assert r.status_code == 200, f"HR login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No token in login response: {data}"
    session.headers.update({"Authorization": f"Bearer {tok}"})
    return tok


@pytest.fixture(scope="module")
def employee_id(session, hr_token):
    r = session.get(f"{API}/members/directory")
    assert r.status_code == 200, f"directory failed: {r.status_code} {r.text[:200]}"
    payload = r.json()
    # tolerate list or {items: [...]}
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("members") or []
    target = None
    for m in items:
        email = (m.get("email") or "").lower()
        if email == TARGET_EMPLOYEE_EMAIL:
            target = m
            break
    assert target, f"Employee {TARGET_EMPLOYEE_EMAIL} not found. Sample keys={list(items[0].keys()) if items else 'empty'}"
    emp_id = target.get("id") or target.get("_id") or target.get("user_id")
    assert emp_id, f"No id in member record: {target}"
    return emp_id


# ── 1. payslip generation ────────────────────────────────────────────────────
def test_generate_payslip(session, hr_token, employee_id):
    r = session.post(
        f"{API}/hr/payslips/generate",
        json={"employee_id": employee_id, "month": TARGET_MONTH, "auto_email": False},
    )
    assert r.status_code == 200, f"generate failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert data.get("slip_no"), f"missing slip_no: {data}"
    # spec: gross 80000, net 74880
    assert float(data.get("gross_salary", 0)) == 80000, f"gross mismatch: {data.get('gross_salary')}"
    assert float(data.get("net_pay", 0)) == 74880, f"net mismatch: {data.get('net_pay')}"
    slip_id = data.get("id") or data.get("_id")
    assert slip_id, f"no id in generated slip: {data}"
    STATE["generated_ids"].append(slip_id)
    STATE["slip_no"] = data["slip_no"]
    STATE["month"] = data.get("month")


# ── 2. PDF download + header verification ────────────────────────────────────
def test_pdf_download_and_header(session, hr_token):
    assert STATE["generated_ids"], "generation test must have run first"
    slip_id = STATE["generated_ids"][0]
    r = session.get(f"{API}/hr/payslips/{slip_id}/pdf")
    assert r.status_code == 200, f"pdf download failed: {r.status_code} {r.text[:200]}"
    body = r.content
    assert body[:4] == b"%PDF", "not a valid PDF magic header"
    assert len(body) > 5000, f"pdf too small: {len(body)} bytes"

    # Parse PDF
    doc = fitz.open(stream=body, filetype="pdf")
    assert doc.page_count >= 1
    page = doc.load_page(0)

    # 2a. Text extraction — must contain tagline + PAYSLIP + slip no
    txt = page.get_text("text")
    assert "PAYSLIP" in txt, f"'PAYSLIP' not in extracted text. Excerpt:\n{txt[:400]}"
    assert "ENGINEERING STUDIOS" in txt, f"'ENGINEERING STUDIOS' missing from text. Excerpt:\n{txt[:400]}"
    assert "DEDICATED TEAMS" in txt, "'DEDICATED TEAMS' missing"
    assert "AI WORKFLOWS" in txt, "'AI WORKFLOWS' missing"
    assert TARGET_MONTH in txt, f"month {TARGET_MONTH} missing from PDF text"
    assert STATE["slip_no"] in txt, f"slip_no {STATE['slip_no']} missing from PDF text"

    # 2b. Tagline color check — locate the span and inspect its fill color
    tagline_color = None
    tagline_size = None
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                if "ENGINEERING STUDIOS" in span.get("text", ""):
                    tagline_color = span.get("color")
                    tagline_size = span.get("size")
                    break
    assert tagline_color is not None, "tagline span not found in PDF dict"
    # decode int -> rgb
    r_c = (tagline_color >> 16) & 0xFF
    g_c = (tagline_color >> 8) & 0xFF
    b_c = tagline_color & 0xFF
    print(f"Tagline color rgb=({r_c},{g_c},{b_c}) size={tagline_size}")
    # legibility rule: not a light gray. #94A3B8 (~148,163,184) was the bug.
    # Expected #475569 (~71,85,105). Assert luminance < 130.
    luminance = 0.299 * r_c + 0.587 * g_c + 0.114 * b_c
    assert luminance < 130, (
        f"tagline appears too light (lum={luminance:.1f} rgb=({r_c},{g_c},{b_c})); "
        f"visibility regression"
    )
    # Also assert size roughly 7.5pt (the fix)
    assert 7.0 <= (tagline_size or 0) <= 8.5, f"tagline size unexpected: {tagline_size}"

    # 2c. Logo image present in header — page must have at least one embedded image
    imgs = page.get_images(full=True)
    assert len(imgs) >= 1, "no images embedded on page 1 (logo missing)"

    # 2d. Rasterise page 1 as sanity — ensure header band is not blank
    pix = page.get_pixmap(dpi=150)
    png_bytes = pix.tobytes("png")
    assert len(png_bytes) > 20_000, f"rendered image suspiciously small: {len(png_bytes)}"

    # sample a pixel where tagline text should appear (~16mm, H-30mm from top)
    # page size in points; A4 = 595 x 842. dpi=150 → px = pt * 150/72
    # tagline y (from top) ≈ 30mm ≈ 30*72/25.4 = 85pt → ~85 * 150/72 ≈ 177 px
    # x range 16mm..90mm → 45..255 pt → 94..532 px. Sample many pixels; ensure some dark ones.
    from PIL import Image
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = img.size
    # Scan a vertical band around the expected tagline row (approx y=170..210 px @150dpi)
    dark_count = 0
    total = 0
    for y_px in range(int(75 * 150 / 72), int(100 * 150 / 72), 2):
        for x_px in range(int(45 * 150 / 72), int(260 * 150 / 72), 3):
            pr, pg, pb = img.getpixel((x_px, y_px))
            total += 1
            if 0.299 * pr + 0.587 * pg + 0.114 * pb < 130:
                dark_count += 1
    print(f"Tagline band: {dark_count}/{total} dark pixels sampled")
    assert dark_count >= 20, f"tagline band appears mostly light (dark={dark_count}/{total})"

    doc.close()


# ── 3. Text-only assertion (extra) ───────────────────────────────────────────
def test_pdf_text_has_key_strings(session, hr_token):
    assert STATE["generated_ids"], "generation must have happened"
    slip_id = STATE["generated_ids"][0]
    r = session.get(f"{API}/hr/payslips/{slip_id}/pdf")
    assert r.status_code == 200
    doc = fitz.open(stream=r.content, filetype="pdf")
    txt = "\n".join(p.get_text("text") for p in doc)
    doc.close()
    assert "ENGINEERING STUDIOS" in txt
    assert "PAYSLIP" in txt


# ── 4. cleanup ───────────────────────────────────────────────────────────────
def test_cleanup_generated_payslips():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    ids_to_delete = list(STATE.get("generated_ids", []))
    if LEFTOVER_SLIP_ID not in ids_to_delete:
        ids_to_delete.append(LEFTOVER_SLIP_ID)

    user = db.users.find_one({"email": TARGET_EMPLOYEE_EMAIL})
    extra_query = None
    if user:
        uid = user.get("id") or str(user.get("_id"))
        extra_query = {"month": TARGET_MONTH, "$or": [
            {"employee_id": uid},
            {"user_id": uid},
            {"employee.email": TARGET_EMPLOYEE_EMAIL},
        ]}

    total_deleted = 0
    if ids_to_delete:
        r1 = db.hr_payslips.delete_many({"$or": [
            {"id": {"$in": ids_to_delete}},
            {"_id": {"$in": ids_to_delete}},
        ]})
        total_deleted += r1.deleted_count
        print(f"Deleted by id: {r1.deleted_count}")

    if extra_query:
        r2 = db.hr_payslips.delete_many(extra_query)
        total_deleted += r2.deleted_count
        print(f"Deleted by employee+month sweep: {r2.deleted_count}")

    print(f"Total payslips deleted: {total_deleted}")
    assert total_deleted >= 1, "expected at least 1 payslip deleted during cleanup"
    client.close()
