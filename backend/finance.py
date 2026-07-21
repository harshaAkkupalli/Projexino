"""
Project Finance — Admin-only.

Each "finance project" pairs 1:1 with a `projects` doc (optional — admin can also create
finance-only entries that auto-create a stub `projects` row so they show up in the Projects list).

Tracks:
  • client name & multiple client_emails (primary flag)
  • discussed_budget vs locked_budget (currency, payment_type)
  • category (development / design / consulting / retainer / …)
  • payments[] — each with amount, percent_of_locked, paid_at, method, note, invoice_id?
  • documents[] — folder groups, each holds files (base64 ≤ 10MB per file)
  • notes
Aggregates: total_paid, percent_paid, remaining, status (pending / partial / paid)

Invoices (db.invoices) — auto-incremented invoice_no per workspace, branded PDF via reportlab,
send via the existing email_module Gmail OAuth (silent no-op if not connected).

Endpoints (all admin-only except GET aggregate, which admin/manager/hr can view):
  GET    /api/finance/projects
  POST   /api/finance/projects                — create or upsert by project_id/name
  GET    /api/finance/projects/{id}
  PATCH  /api/finance/projects/{id}
  DELETE /api/finance/projects/{id}
  POST   /api/finance/projects/{id}/payments
  PATCH  /api/finance/projects/{id}/payments/{pid}
  DELETE /api/finance/projects/{id}/payments/{pid}
  POST   /api/finance/projects/{id}/client-emails
  DELETE /api/finance/projects/{id}/client-emails/{eid}
  POST   /api/finance/projects/{id}/folders
  DELETE /api/finance/projects/{id}/folders/{fid}
  POST   /api/finance/projects/{id}/folders/{fid}/files
  DELETE /api/finance/projects/{id}/folders/{fid}/files/{fileid}
  GET    /api/finance/projects/{id}/folders/{fid}/files/{fileid}/download
  POST   /api/finance/projects/{id}/invoices               — generate invoice PDF (returns invoice meta + invoice_id)
  GET    /api/finance/invoices/{invoice_id}/pdf            — download branded PDF
  POST   /api/finance/invoices/{invoice_id}/send           — send invoice to selected client emails
  POST   /api/finance/projects/{id}/reminder               — send a payment-reminder email
  GET    /api/finance/summary                              — workspace-wide rollup
"""
from __future__ import annotations

import io
import os
import re
import uuid
import base64
import logging
from datetime import datetime, timezone, date
from typing import Optional, List, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Response, Body, Request
from pydantic import BaseModel, Field, EmailStr


def _is_public_host(url: str) -> bool:
    """True when the URL host is a real public domain (not internal infra)."""
    try:
        from urllib.parse import urlsplit
        host = (urlsplit(url).hostname or "").lower()
    except Exception:
        return False
    if not host or host in ("localhost", "127.0.0.1", "0.0.0.0"):
        return False
    if host.endswith(".emergentcf.cloud") or ".cluster-" in host or host.endswith(".local") or host.endswith(".internal"):
        return False
    if all(c.isdigit() or c == "." for c in host):  # bare IP
        return False
    return True


def _public_base(request=None) -> str:
    """Absolute public base URL. Browser-supplied headers (Origin, Referer) are
    trusted first — but only when they carry a real public domain — so links
    always match the domain the admin is actually using (preview, projexino.com
    self-host, or the Android app). Env vars are the fallback."""
    if request is not None:
        origin = (request.headers.get("origin") or "").rstrip("/")
        if origin.startswith("http") and _is_public_host(origin):
            return origin
        referer = request.headers.get("referer") or ""
        if referer.startswith("http"):
            try:
                from urllib.parse import urlsplit
                p = urlsplit(referer)
                cand = f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else ""
                if cand and _is_public_host(cand):
                    return cand
            except Exception:
                pass
    base = (os.environ.get("PUBLIC_FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
    if base.startswith("http"):
        return base
    if request is not None:
        xf_host = (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
        if xf_host:
            proto = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip() or "https"
            return f"{proto}://{xf_host}"
        return str(request.base_url).rstrip("/")
    return base

logger = logging.getLogger("projexino.finance")

MAX_FILE_BYTES = 10 * 1024 * 1024

PaymentType = Literal["one_time", "monthly", "quarterly", "yearly", "milestone"]
Category    = Literal["development", "design", "consulting", "retainer", "support", "marketing", "other"]


def _scrub(d: dict) -> dict:
    if not d:
        return d
    d.pop("_id", None)
    return d


def _aggregate(fp: dict) -> dict:
    """Compute totals on a finance-project doc."""
    locked = float(fp.get("locked_budget") or 0)
    paid = sum(float(p.get("amount") or 0) for p in (fp.get("payments") or []))
    pct = (paid / locked * 100) if locked > 0 else 0.0
    remaining = max(0.0, locked - paid)
    status = "paid" if locked > 0 and paid >= locked else ("partial" if paid > 0 else "pending")
    out = dict(fp)
    out["total_paid"] = round(paid, 2)
    out["percent_paid"] = round(pct, 2)
    out["remaining"] = round(remaining, 2)
    out["payment_status"] = status
    # Milestone summary — surfaces stage-level progress for the UI.
    ms = out.get("milestones") or []
    if ms:
        total_amt = sum(float(m.get("amount") or 0) for m in ms)
        paid_amt = sum(float(m.get("amount") or 0) for m in ms if m.get("status") == "paid")
        out["milestone_summary"] = {
            "total": len(ms),
            "paid": sum(1 for m in ms if m.get("status") == "paid"),
            "invoiced": sum(1 for m in ms if m.get("status") == "invoiced"),
            "awaiting_confirmation": sum(1 for m in ms if m.get("status") == "awaiting_confirmation"),
            "confirmed": sum(1 for m in ms if m.get("status") == "confirmed"),
            "planned": sum(1 for m in ms if m.get("status") == "planned"),
            "rejected": sum(1 for m in ms if m.get("status") == "rejected"),
            "total_amount": round(total_amt, 2),
            "paid_amount": round(paid_amt, 2),
            "next_unlocked_id": _next_unlocked_milestone_id(ms),
        }
    return out


def _next_unlocked_milestone_id(ms: list) -> str:
    """Return the id of the first milestone the team can act on right now.
    Rule: a milestone is locked until all earlier (by `order`) milestones
    are `paid`. Once a milestone is `paid`, the next planned one unlocks."""
    sorted_ms = sorted(ms, key=lambda m: (m.get("order", 0), m.get("created_at", "")))
    for m in sorted_ms:
        st = m.get("status", "planned")
        if st in ("paid",):
            continue
        return m.get("id", "")
    return ""


# ─── Models ─────────────────────────────────────────────────────────

class ClientEmailIn(BaseModel):
    email: str
    name: Optional[str] = ""
    primary: bool = False


class FolderIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = ""


class FileIn(BaseModel):
    name: str
    mime: str = ""
    size: int = 0
    content_base64: str


class PaymentIn(BaseModel):
    amount: float = Field(..., ge=0)
    percent: Optional[float] = None      # optional helper; locked-budget × percent/100 if amount=0
    paid_at: Optional[str] = ""
    method: Optional[str] = "bank_transfer"
    note: Optional[str] = ""
    invoice_id: Optional[str] = ""


# ─── Milestone-based billing ──────────────────────────────────────
# A milestone is a planned, sequential chunk of the project quote.
# Statuses cycle: planned → awaiting_confirmation → confirmed → invoiced → paid
# (rejected sends it back to planned with a note from the client)
MilestoneStatus = Literal[
    "planned", "awaiting_confirmation", "confirmed",
    "invoiced", "paid", "rejected",
]


class MilestoneIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = ""
    amount: float = Field(..., ge=0)
    due_date: Optional[str] = ""
    order: Optional[int] = 0


class MilestonePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[str] = None
    order: Optional[int] = None
    status: Optional[MilestoneStatus] = None
    notes: Optional[str] = None


class FinanceCreate(BaseModel):
    project_id: Optional[str] = ""             # link to existing project; if empty + project_name → create stub project
    project_name: str = Field(..., min_length=1, max_length=200)
    client_name: Optional[str] = ""
    client_emails: List[ClientEmailIn] = []
    discussed_budget: float = 0
    locked_budget: float = 0
    currency: str = "INR"
    country: Optional[str] = "IN"
    payment_type: PaymentType = "one_time"
    category: Category = "development"
    start_date: Optional[str] = ""
    end_date: Optional[str] = ""
    notes: Optional[str] = ""
    gst_number: Optional[str] = ""
    billing_address: Optional[str] = ""
    payment_terms: Optional[str] = ""


class FinancePatch(BaseModel):
    project_name: Optional[str] = None
    client_name: Optional[str] = None
    discussed_budget: Optional[float] = None
    locked_budget: Optional[float] = None
    currency: Optional[str] = None
    country: Optional[str] = None
    payment_type: Optional[PaymentType] = None
    category: Optional[Category] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    gst_number: Optional[str] = None
    billing_address: Optional[str] = None
    payment_terms: Optional[str] = None


class InvoiceCreateIn(BaseModel):
    amount: float = Field(..., gt=0)
    due_date: Optional[str] = ""
    items: List[Dict[str, Any]] = []
    notes: Optional[str] = ""
    tax_percent: Optional[float] = 0
    discount: Optional[float] = 0
    payment_terms: Optional[str] = ""           # editable per invoice; falls back to finance.payment_terms or default


class InvoiceSendIn(BaseModel):
    to_email_ids: List[str] = []
    extra_message: Optional[str] = ""
    from_token_id: Optional[str] = ""


class ReminderIn(BaseModel):
    to_email_ids: List[str] = []
    message: Optional[str] = ""
    from_token_id: Optional[str] = ""


# ─── PDF generation ─────────────────────────────────────────────────

# Logo served from /app/frontend/public via PUBLIC_FRONTEND_URL — see iter57/59 for context
def _projexino_logo_url() -> str:
    base = (os.environ.get("PUBLIC_FRONTEND_URL")
            or os.environ.get("REACT_APP_BACKEND_URL")
            or "").rstrip("/")
    return f"{base}/projexino-logo.png" if base else "/projexino-logo.png"

PROJEXINO_LOGO = _projexino_logo_url()
COMPANY_NAME = "Projexino Solutions Pvt Ltd"
COMPANY_ADDR = "Hyderabad, Telangana, India"
COMPANY_GST  = ""
COMPANY_EMAIL = "billing@projexino.com"
COMPANY_WEB  = "projexino.com"

DEFAULT_PAYMENT_TERMS = (
    "Net 14 days from issue unless otherwise stated. Please reference the invoice number with your remittance. "
    "Late payments may attract interest at 1.5% per month. Disputes must be raised within 7 days of receipt. "
    "All amounts are in the currency shown above. This is a system-generated invoice and is valid without a physical signature."
)

# Country (ISO-3166-1 alpha-2) → preferred currency code (subset of common business markets).
COUNTRY_TO_CURRENCY = {
    "IN": "INR", "US": "USD", "GB": "GBP", "UK": "GBP",
    "DE": "EUR", "FR": "EUR", "IT": "EUR", "ES": "EUR", "NL": "EUR",
    "AE": "AED", "SG": "SGD", "AU": "AUD", "CA": "CAD", "JP": "JPY",
    "SA": "SAR", "ZA": "ZAR", "BR": "BRL", "MX": "MXN", "CH": "CHF",
}

# Static FX rates (rough, admin-editable). Used ONLY for internal dashboard INR-equivalent.
# All amounts are "1 unit of currency → X INR".
DEFAULT_FX_TO_INR = {
    "INR": 1.0, "USD": 83.0, "EUR": 90.0, "GBP": 105.0,
    "AED": 22.6, "SGD": 61.5, "AUD": 54.0, "CAD": 60.0, "JPY": 0.55,
    "SAR": 22.1, "ZAR": 4.5, "BRL": 16.5, "MXN": 4.9, "CHF": 94.0,
}


async def _get_fx_rates(db) -> dict:
    """Return {currency: rate_to_inr}. Admin overrides stored in db.fx_rates (single doc id='inr')."""
    doc = await db.fx_rates.find_one({"id": "inr"}, {"_id": 0}) or {}
    overrides = doc.get("rates") or {}
    merged = {**DEFAULT_FX_TO_INR, **{k.upper(): float(v) for k, v in overrides.items() if v}}
    return merged


def _to_inr(amount: float, currency: str, fx: dict) -> float:
    rate = fx.get((currency or "INR").upper(), 1.0)
    return float(amount or 0) * rate


def _next_invoice_no(db_sync_year: int, last_no: int) -> str:
    return f"PRX-{db_sync_year}-{last_no:05d}"


async def _allocate_invoice_no(db) -> str:
    year = datetime.now(timezone.utc).year
    last = await db.invoice_counter.find_one({"id": str(year)}, {"_id": 0})
    next_no = (last.get("seq", 0) + 1) if last else 1
    await db.invoice_counter.update_one(
        {"id": str(year)}, {"$set": {"id": str(year), "seq": next_no}}, upsert=True
    )
    return _next_invoice_no(year, next_no)


async def _allocate_receipt_no(db) -> str:
    year = datetime.now(timezone.utc).year
    last = await db.receipt_counter.find_one({"id": str(year)}, {"_id": 0})
    next_no = (last.get("seq", 0) + 1) if last else 1
    await db.receipt_counter.update_one(
        {"id": str(year)}, {"$set": {"id": str(year), "seq": next_no}}, upsert=True
    )
    return f"RCP-{year}-{next_no:05d}"


async def create_receipt_for_invoice(db, inv: dict, method: str, approved_by: str, note: str = "") -> dict:
    """Shared: allocate receipt no, insert receipt, link back onto the invoice."""
    now = datetime.now(timezone.utc).isoformat()
    receipt_no = await _allocate_receipt_no(db)
    rec = {
        "id": uuid.uuid4().hex, "receipt_no": receipt_no,
        "invoice_id": inv["id"], "invoice_no": inv.get("invoice_no"),
        "finance_id": inv.get("finance_id"), "project_name": inv.get("project_name"),
        "client_name": inv.get("client_name"),
        "amount": float(inv.get("amount") or 0), "currency": inv.get("currency", "INR"),
        "method": method, "note": note,
        "approved_by": approved_by, "approved_at": now,
        "share_token": uuid.uuid4().hex, "created_at": now,
    }
    await db.receipts.insert_one(dict(rec))
    await db.invoices.update_one({"id": inv["id"]}, {"$set": {"receipt_id": rec["id"], "receipt_no": receipt_no}})
    return rec


async def notify_finance_admins(db, title: str, message: str, link: str = "/app/finance") -> None:
    """In-app + push notification to every admin/super_admin (best-effort)."""
    try:
        from notif_engine import push_in_app
        admins = await db.users.find({"role": {"$in": ["admin", "super_admin"]}}, {"_id": 0, "id": 1}).to_list(20)
        for a in admins:
            await push_in_app(db, user_id=a["id"], kind="finance", title=title, message=message, link=link)
    except Exception:
        pass


def _fmt_money(amount: float, currency: str) -> str:
    sym = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency.upper(), currency.upper() + " ")
    try:
        return f"{sym}{amount:,.2f}"
    except Exception:
        return f"{sym}{amount}"


def _build_invoice_pdf(invoice: dict, finance: dict, bank: dict = None, receipt: dict = None, public_base: str = "") -> bytes:
    """Premium, legally-correct A4 invoice PDF using ReportLab.

    Layout (top → bottom):
      1. Brand band: logo + tagline (left)   |  INVOICE wordmark + meta (right)
      2. Bill-to + Bill-from cards (two columns, equal heights, gradient borders)
      3. Project context strip
      4. Itemised line-items table (zebra rows)
      5. Totals card (subtotal / GST / discount / TOTAL DUE) right-aligned hero
      6. Status callout (paid / partial)
      7. Notes
      8. Legal terms footer
      9. Authorised-signatory line + branded footer
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, KeepTogether,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    # === Register a Unicode-capable font family so currency symbols (₹ € £ ¥)
    # actually render instead of becoming black squares. The PDF default
    # Helvetica/Times/Courier Type-1 fonts do NOT contain the rupee glyph. ===
    _BODY_FONT = "Helvetica"      # safe fallback if TTF loading fails
    _BOLD_FONT = "Helvetica-Bold"
    try:
        if "ProjexinoBody" not in pdfmetrics.getRegisteredFontNames():
            _font_candidates = [
                ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
                 "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
                ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
                ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
                 "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
                ("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
                 "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"),
            ]
            import os as _os
            for reg, bold in _font_candidates:
                if _os.path.exists(reg) and _os.path.exists(bold):
                    pdfmetrics.registerFont(TTFont("ProjexinoBody", reg))
                    pdfmetrics.registerFont(TTFont("ProjexinoBody-Bold", bold))
                    try:
                        from reportlab.pdfbase.pdfmetrics import registerFontFamily
                        registerFontFamily("ProjexinoBody", normal="ProjexinoBody",
                                           bold="ProjexinoBody-Bold")
                    except Exception:
                        pass
                    break
        if "ProjexinoBody" in pdfmetrics.getRegisteredFontNames():
            _BODY_FONT = "ProjexinoBody"
            _BOLD_FONT = "ProjexinoBody-Bold"
    except Exception:
        # If anything goes wrong with font registration we silently fall back
        # to Helvetica (currency symbols will be missing, but the PDF still renders).
        pass

    NAVY = colors.HexColor("#0F2042")
    ORANGE = colors.HexColor("#F97316")
    PURPLE = colors.HexColor("#A855F7")
    LIGHT_BG = colors.HexColor("#FAFAFA")
    CARD_BG = colors.HexColor("#F8FAFC")
    BORDER = colors.HexColor("#E2E8F0")
    SLATE = colors.HexColor("#475569")
    MUTED = colors.HexColor("#94A3B8")
    GREEN = colors.HexColor("#10B981")
    AMBER = colors.HexColor("#F59E0B")

    # --- Style sheet -------------------------------------------------
    sheet = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=sheet["Normal"], fontName=_BODY_FONT,
                          fontSize=9, leading=12, textColor=NAVY)
    body_sl = ParagraphStyle("body_sl", parent=body, textColor=SLATE)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, leading=10, textColor=MUTED)
    micro_label = ParagraphStyle("micro_label", parent=body, fontSize=6.5, leading=9,
                                  textColor=MUTED, spaceAfter=3,
                                  fontName=_BOLD_FONT)
    h_company = ParagraphStyle("h_company", parent=body, fontSize=11, leading=14,
                                textColor=NAVY, fontName=_BOLD_FONT)
    h_invoice = ParagraphStyle("h_invoice", parent=body, fontSize=34, leading=36,
                                textColor=ORANGE, alignment=TA_RIGHT, fontName=_BOLD_FONT)
    h_card_title = ParagraphStyle("h_card_title", parent=body, fontSize=12, leading=15,
                                    textColor=NAVY, fontName=_BOLD_FONT)
    money_right = ParagraphStyle("money_right", parent=body, alignment=TA_RIGHT)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.2 * cm, bottomMargin=1.0 * cm,
        title=invoice.get("invoice_no", "Invoice"),
        author=COMPANY_NAME,
    )
    story = []
    page_w = A4[0] - 3.0 * cm  # usable width

    # ── 1. Brand band ────────────────────────────────────────────
    # Logo sits on a navy/white split band for maximum contrast vs.
    # transparent or light-on-light brand marks.
    try:
        import os as _os
        data = None
        for _logo_path in (
            _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "assets", "projexino-logo.png"),
            "/app/frontend/public/projexino-logo.png",
            _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "frontend", "public", "projexino-logo.png"),
        ):
            try:
                with open(_logo_path, "rb") as _lf:
                    data = _lf.read()
                break
            except Exception:
                continue
        if not data:
            import urllib.request
            with urllib.request.urlopen(PROJEXINO_LOGO, timeout=4) as resp:
                data = resp.read()
        logo = RLImage(io.BytesIO(data), width=4.6 * cm, height=1.7 * cm, kind="proportional")
    except Exception:
        logo = Paragraph("<font size=18 color='#0F2042'><b>PROJEXINO</b></font>",
                         ParagraphStyle("logo_fb", parent=body, fontSize=18, leading=22))

    inv_no = invoice.get("invoice_no", "")
    doc_title = "RECEIPT" if receipt else "INVOICE"
    doc_no = (receipt or {}).get("receipt_no") or inv_no
    inv_date = (invoice.get("issued_at") or "")[:10] or datetime.now(timezone.utc).date().isoformat()
    due = invoice.get("due_date") or "On receipt"

    left_block = [
        [logo],
        [Paragraph("<font size=8 color='#475569'><b>ENGINEERING STUDIOS · DEDICATED TEAMS · AI WORKFLOWS</b></font>", small)],
    ]
    left_tbl = Table(left_block, colWidths=[10 * cm], hAlign="LEFT")
    left_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))

    right_meta = Table([
        [Paragraph(doc_title, h_invoice)],
        [Paragraph(
            f"<font size=7 color='#94A3B8'>{doc_title} NO.</font>"
            f"<br/><font size=12 color='#0F2042'><b>{doc_no}</b></font>"
            + (f"<br/><font size=7 color='#94A3B8'>REF INVOICE {inv_no}</font>" if (receipt and inv_no) else ""),
            ParagraphStyle("n", parent=body, alignment=TA_RIGHT))],
    ], colWidths=[7 * cm], hAlign="RIGHT")
    right_meta.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 0),
    ]))

    header_tbl = Table([[left_tbl, right_meta]], colWidths=[10.5 * cm, 7.5 * cm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        # Refreshed brand band: warm cream bg, navy strip above, orange rule below
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF7ED")),
        ("LINEABOVE", (0, 0), (-1, 0), 4, colors.HexColor("#0F2042")),
        ("LINEBELOW", (0, -1), (-1, -1), 2.5, colors.HexColor("#F97316")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 10))
    # Brand gradient rule
    rule = Table([[""]], colWidths=[18 * cm], rowHeights=[3])
    rule.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ORANGE),
        ("LINEBELOW", (0, 0), (-1, -1), 0, ORANGE),
    ]))
    story.append(rule)
    story.append(Spacer(1, 10))

    # ── 2. Meta strip (dates) ────────────────────────────────────
    cur = finance.get("currency", "INR")
    meta_strip = Table([
        [Paragraph("<font size=7 color='#94A3B8'>ISSUED ON</font>", micro_label),
         Paragraph("<font size=7 color='#94A3B8'>DUE DATE</font>", micro_label),
         Paragraph("<font size=7 color='#94A3B8'>CURRENCY</font>", micro_label),
         Paragraph("<font size=7 color='#94A3B8'>STATUS</font>", micro_label)],
        [Paragraph(f"<b>{inv_date}</b>", body),
         Paragraph(f"<b>{due}</b>", body),
         Paragraph(f"<b>{cur}</b>", body),
         Paragraph(f"<b><font color='#F97316'>{(invoice.get('status') or 'ISSUED').upper()}</font></b>", body)],
    ], colWidths=[4.5 * cm, 4.5 * cm, 4.5 * cm, 4.5 * cm])
    meta_strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
        ("BOX", (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(meta_strip)
    story.append(Spacer(1, 9))

    # ── 3. Bill-from + Bill-to cards (equal columns) ─────────────
    client_name = finance.get("client_name") or "—"
    primary_email = next((e["email"] for e in (finance.get("client_emails") or []) if e.get("primary")), "")
    if not primary_email and (finance.get("client_emails") or []):
        primary_email = finance["client_emails"][0].get("email", "")
    billing = (finance.get("billing_address") or "").replace("\n", "<br/>")
    gst = finance.get("gst_number") or ""

    from_card = Paragraph(
        f"<font size=7 color='#94A3B8'><b>FROM</b></font><br/>"
        f"<font size=11 color='#0F2042'><b>{COMPANY_NAME}</b></font><br/>"
        f"<font size=8.5 color='#475569'>{COMPANY_ADDR}<br/>"
        f"{COMPANY_EMAIL}<br/>{COMPANY_WEB}</font>",
        body,
    )
    to_card = Paragraph(
        f"<font size=7 color='#94A3B8'><b>BILL TO</b></font><br/>"
        f"<font size=11 color='#0F2042'><b>{client_name}</b></font><br/>"
        f"<font size=8.5 color='#475569'>{primary_email}"
        f"{('<br/>' + billing) if billing else ''}"
        f"{('<br/>GSTIN: ' + gst) if gst else ''}</font>",
        body,
    )
    bill_tbl = Table([[from_card, to_card]], colWidths=[9 * cm, 9 * cm])
    bill_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("BOX", (0, 0), (0, -1), 0.6, BORDER),
        ("BOX", (1, 0), (1, -1), 0.6, BORDER),
        ("LINEBEFORE", (0, 0), (0, -1), 2, NAVY),
        ("LINEBEFORE", (1, 0), (1, -1), 2, ORANGE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
    ]))
    story.append(bill_tbl)
    story.append(Spacer(1, 9))

    # ── 4. Project context strip ─────────────────────────────────
    project_strip = Table([[
        Paragraph(
            f"<font size=7 color='#94A3B8'><b>PROJECT</b></font>&nbsp;&nbsp;&nbsp;"
            f"<font size=10 color='#0F2042'><b>{finance.get('project_name','')}</b></font>"
            f"&nbsp;&nbsp;<font size=8 color='#475569'>· {finance.get('category','').title()}</font>"
            f"&nbsp;&nbsp;<font size=8 color='#475569'>· {(finance.get('payment_type','one_time') or '').replace('_',' ').title()}</font>",
            body,
        )
    ]], colWidths=[18 * cm])
    project_strip.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF7ED")),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBEFORE", (0, 0), (0, -1), 2, ORANGE),
    ]))
    story.append(project_strip)
    story.append(Spacer(1, 10))

    # ── 5. Itemised lines ────────────────────────────────────────
    items = invoice.get("items") or [
        {"description": invoice.get("notes") or f"{finance.get('project_name')} — {finance.get('payment_type','one_time').replace('_',' ').title()} fee",
         "qty": 1, "rate": invoice.get("amount", 0)},
    ]
    head = [
        Paragraph("<font size=7.5 color='white'><b>#</b></font>", body),
        Paragraph("<font size=7.5 color='white'><b>DESCRIPTION</b></font>", body),
        Paragraph("<font size=7.5 color='white'><b>QTY</b></font>", ParagraphStyle("h_qty", parent=body, alignment=TA_RIGHT)),
        Paragraph("<font size=7.5 color='white'><b>RATE</b></font>", ParagraphStyle("h_rate", parent=body, alignment=TA_RIGHT)),
        Paragraph("<font size=7.5 color='white'><b>AMOUNT</b></font>", ParagraphStyle("h_amt", parent=body, alignment=TA_RIGHT)),
    ]
    rows = [head]
    subtotal = 0.0
    for idx, it in enumerate(items, 1):
        qty = float(it.get("qty") or 1)
        rate = float(it.get("rate") or 0)
        line = qty * rate
        subtotal += line
        rows.append([
            Paragraph(f"<font color='#94A3B8'>{idx:02d}</font>", body),
            Paragraph(f"<font color='#0F2042'>{(it.get('description') or '').strip() or '—'}</font>", body),
            Paragraph(f"<font color='#475569'>{qty:g}</font>", ParagraphStyle("q", parent=body, alignment=TA_RIGHT)),
            Paragraph(f"<font color='#475569'>{_fmt_money(rate, cur)}</font>", ParagraphStyle("r", parent=body, alignment=TA_RIGHT)),
            Paragraph(f"<font color='#0F2042'><b>{_fmt_money(line, cur)}</b></font>", ParagraphStyle("a", parent=body, alignment=TA_RIGHT)),
        ])
    items_tbl = Table(rows, colWidths=[1.3 * cm, 9.2 * cm, 1.6 * cm, 2.9 * cm, 3.0 * cm])
    items_style = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, 0), 0, NAVY),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("VALIGN", (0, 0), (-1, 0), "MIDDLE"),
        ("LINEBELOW", (0, -1), (-1, -1), 0.6, BORDER),
    ]
    # zebra rows
    for r in range(1, len(rows)):
        if r % 2 == 0:
            items_style.append(("BACKGROUND", (0, r), (-1, r), LIGHT_BG))
        items_style.append(("LINEBELOW", (0, r), (-1, r), 0.3, BORDER))
    items_tbl.setStyle(TableStyle(items_style))
    story.append(items_tbl)
    story.append(Spacer(1, 8))

    # Snap subtotal to invoice.amount if mismatch
    if abs(subtotal - float(invoice.get("amount", 0))) > 0.01:
        subtotal = float(invoice.get("amount", 0))

    tax_pct = float(invoice.get("tax_percent") or 0)
    discount = float(invoice.get("discount") or 0)
    tax = subtotal * tax_pct / 100.0
    total = max(0.0, subtotal + tax - discount)

    # ── 6. Totals card (right-aligned hero) ──────────────────────
    # Widen the value column so 7+ digit currency totals (e.g. ₹10,00,000.00)
    # stay on one line and use a slightly smaller hero font.
    totals_inner = Table([
        [Paragraph("<font size=8 color='#475569'>Subtotal</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>{_fmt_money(subtotal, cur)}</font>", money_right)],
        [Paragraph(f"<font size=8 color='#475569'>GST ({tax_pct:g}%)</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>{_fmt_money(tax, cur)}</font>", money_right)],
        [Paragraph("<font size=8 color='#475569'>Discount</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>− {_fmt_money(discount, cur)}</font>", money_right)],
        [Paragraph(f"<font size=9 color='white'><b>{'TOTAL PAID' if receipt else 'TOTAL DUE'}</b></font>", body),
         Paragraph(f"<font size=13 color='white'><b>{_fmt_money(total, cur)}</b></font>", money_right)],
    ], colWidths=[3.0 * cm, 5.2 * cm], hAlign="RIGHT")
    totals_inner.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, 0), 0.4, BORDER),
        ("LINEBELOW", (0, 1), (-1, 1), 0.4, BORDER),
        ("LINEBELOW", (0, 2), (-1, 2), 0.4, BORDER),
        ("BACKGROUND", (0, 3), (-1, 3), NAVY),
        ("TOPPADDING", (0, 3), (-1, 3), 10),
        ("BOTTOMPADDING", (0, 3), (-1, 3), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    # Wrap totals card in a right-aligned row (card width = 8.2cm → outer left col 9.8cm)
    totals_row = Table([["", totals_inner]], colWidths=[9.8 * cm, 8.2 * cm])
    totals_row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(totals_row)
    story.append(Spacer(1, 10))

    # ── 7. Status callout ────────────────────────────────────────
    inv_status = (invoice.get("status") or "").lower()
    if receipt:
        is_paid = True
        status_color, status_hex = GREEN, "#10B981"
        _method = str(receipt.get("method", "")).replace("_", " ").upper() or "BANK TRANSFER"
        status_label = f"PAYMENT RECEIVED IN FULL · {_method} · {str(receipt.get('approved_at', ''))[:10]}"
        callout_header = "PAYMENT CONFIRMATION"
    elif inv_status == "paid":
        is_paid = True
        status_color, status_hex = GREEN, "#10B981"
        status_label = f"PAID · {str(invoice.get('paid_at', ''))[:10]}" if invoice.get("paid_at") else "PAID"
        callout_header = "PAYMENT STATUS"
    else:
        is_paid = False
        status_color, status_hex = ORANGE, "#F97316"
        due = invoice.get("due_date")
        status_label = f"AWAITING PAYMENT · PLEASE PAY BY {due}" if due else "AWAITING PAYMENT"
        callout_header = "PAYMENT STATUS"
    callout = Table([[
        Paragraph(
            f"<font size=7.5 color='#94A3B8'><b>{callout_header}</b></font>&nbsp;&nbsp;"
            f"<font size=9 color='{status_hex}'><b>• {status_label}</b></font>",
            body,
        )
    ]], colWidths=[18 * cm])
    callout.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F0FDF4" if is_paid else "#FFF7ED")),
        ("BOX", (0, 0), (-1, -1), 0.4, status_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(callout)
    story.append(Spacer(1, 9))

    # ── 7b. Payment details (bank transfer + online pay page) ────
    bank = bank or {}
    _pay_base = (public_base or os.environ.get("PUBLIC_FRONTEND_URL") or "").rstrip("/")
    pay_url = f"{_pay_base}/pay/invoice/{invoice.get('share_token')}" if (invoice.get("share_token") and _pay_base) else ""
    bank_rows = []
    for lbl, key in (("Bank", "bank_name"), ("Account Name", "account_name"), ("Account No", "account_number"),
                     ("IFSC", "ifsc"), ("SWIFT", "swift"), ("Branch", "branch"), ("UPI ID", "upi_id")):
        val = (bank.get(key) or "").strip()
        if val:
            bank_rows.append(f"<font size=7.5 color='#94A3B8'>{lbl}:</font>&nbsp;&nbsp;<font size=8.5 color='#0F2042'><b>{val}</b></font>")
    if (bank_rows or pay_url) and not receipt and inv_status != "paid":
        left_html = ("<font size=7 color='#94A3B8'><b>PAY BY BANK TRANSFER</b></font><br/>" + "<br/>".join(bank_rows)) if bank_rows else ""
        right_html = (
            "<font size=7 color='#94A3B8'><b>PAY ONLINE (UPI QR / BANK TRANSFER)</b></font><br/>"
            "<font size=8.5 color='#475569'>Open the secure payment page below to scan &amp; pay instantly:</font><br/>"
            f"<font size=8 color='#F97316'><b>{pay_url}</b></font>"
        ) if pay_url else ""
        note = (bank.get("payment_note") or "").strip()
        if note and left_html:
            left_html += f"<br/><font size=7.5 color='#475569'><i>{note}</i></font>"
        if left_html and right_html:
            pay_cells, pay_widths = [Paragraph(left_html, body), Paragraph(right_html, body)], [9 * cm, 9 * cm]
        else:
            pay_cells, pay_widths = [Paragraph(left_html or right_html, body)], [18 * cm]
        pay_tbl = Table([pay_cells], colWidths=pay_widths)
        pay_style = [
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LINEBEFORE", (0, 0), (0, -1), 2, GREEN),
        ]
        if len(pay_cells) == 2:
            pay_style.append(("LINEBEFORE", (1, 0), (1, -1), 2, ORANGE))
        pay_tbl.setStyle(TableStyle(pay_style))
        story.append(pay_tbl)
        story.append(Spacer(1, 9))

    # ── 8. Notes (if any) ────────────────────────────────────────
    if invoice.get("notes"):
        notes_card = Table([[
            Paragraph(f"<font size=7 color='#94A3B8'><b>NOTES</b></font><br/>"
                       f"<font size=9 color='#0F2042'>{invoice['notes']}</font>", body)
        ]], colWidths=[18 * cm])
        notes_card.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), CARD_BG),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LINEBEFORE", (0, 0), (0, -1), 2, PURPLE),
        ]))
        story.append(notes_card)
        story.append(Spacer(1, 9))

    # ── 9. Payment & legal block ─────────────────────────────────
    if receipt:
        legal_header = "RECEIPT ACKNOWLEDGEMENT"
        terms_text = (
            f"This receipt acknowledges payment received in full against invoice {invoice.get('invoice_no', '')}. "
            "This is a computer-generated document issued by Projexino Solutions Pvt Ltd and does not require a physical signature. "
            "Please retain it for your records."
        )
    else:
        legal_header = "PAYMENT TERMS"
        terms_text = (
            invoice.get("payment_terms")
            or finance.get("payment_terms")
            or DEFAULT_PAYMENT_TERMS
        )
    # Escape backslashes; ReportLab paragraphs respect simple HTML.
    legal = Paragraph(
        f"<font size=7 color='#94A3B8'><b>{legal_header}</b></font><br/>"
        f"<font size=7.5 color='#475569'>{terms_text}</font>",
        small,
    )
    legal_tbl = Table([[legal]], colWidths=[18 * cm])
    legal_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(legal_tbl)
    story.append(Spacer(1, 10))

    # ── 10. Signatory + footer ───────────────────────────────────
    sig = Table([
        [Paragraph("<font size=7 color='#94A3B8'><b>AUTHORISED SIGNATORY</b></font>", micro_label), ""],
        [Paragraph(f"<font size=9 color='#0F2042'><b>For {COMPANY_NAME}</b></font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>{inv_date}</font>", ParagraphStyle("d", parent=body, alignment=TA_RIGHT))],
    ], colWidths=[11 * cm, 7 * cm])
    sig.setStyle(TableStyle([
        ("LINEABOVE", (0, 1), (0, 1), 0.6, NAVY),
        ("LINEABOVE", (1, 1), (1, 1), 0.6, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 1), (-1, 1), 6),
    ]))
    story.append(sig)
    story.append(Spacer(1, 8))

    footer = Paragraph(
        f"<para alignment='center'>"
        f"<font size=7 color='#94A3B8'>{COMPANY_NAME} · {COMPANY_WEB} · "
        f"Thank you for partnering with Projexino · © {datetime.now().year}</font>"
        f"</para>",
        small,
    )
    story.append(footer)

    # Page decoration: thin gradient band at top of every page via onPage
    def on_page(canv, doc_):
        canv.saveState()
        # Top gradient band
        canv.setFillColor(NAVY)
        canv.rect(0, A4[1] - 0.5 * cm, A4[0], 0.5 * cm, fill=1, stroke=0)
        canv.restoreState()
        # Footer page no
        canv.saveState()
        canv.setFont(_BODY_FONT, 7)
        canv.setFillColor(MUTED)
        canv.drawRightString(A4[0] - 1.5 * cm, 1.0 * cm, f"Page {canv.getPageNumber()}")
        canv.drawString(1.5 * cm, 1.0 * cm, inv_no)
        canv.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    pdf = buf.getvalue()
    buf.close()
    return pdf


# ─── Routes ─────────────────────────────────────────────────────────

def register_finance(api: APIRouter, db, get_current_user):

    def _require_admin(user):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")

    def _require_priv(user):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

    async def _bank_settings():
        return await db.finance_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}

    @api.get("/finance/settings")
    async def get_finance_settings(user=Depends(get_current_user)):
        _require_admin(user)
        return await _bank_settings()

    @api.put("/finance/settings")
    async def put_finance_settings(payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        _require_admin(user)
        allowed = ("bank_name", "account_name", "account_number", "ifsc", "swift", "branch", "upi_id", "payment_note", "alert_sender")
        doc = {k: str(payload.get(k) or "").strip() for k in allowed}
        doc["auto_approve_credits"] = bool(payload.get("auto_approve_credits"))
        doc["id"] = "singleton"
        doc["updated_at"] = datetime.now(timezone.utc).isoformat()
        doc["updated_by"] = user.get("email")
        await db.finance_settings.update_one({"id": "singleton"}, {"$set": doc}, upsert=True)
        return doc

    @api.get("/finance/projects")
    async def list_finance(user=Depends(get_current_user)):
        _require_priv(user)
        cur = db.project_finance.find(
            {}, {"_id": 0, "documents.files.content_base64": 0}
        ).sort("updated_at", -1)
        items = await cur.to_list(500)
        return [_aggregate(_scrub(i)) for i in items]

    @api.get("/finance/summary")
    async def finance_summary(user=Depends(get_current_user)):
        _require_priv(user)
        cur = db.project_finance.find({}, {"_id": 0, "documents": 0})
        items = await cur.to_list(500)
        fx = await _get_fx_rates(db)
        total_locked = sum(float(i.get("locked_budget") or 0) for i in items)
        total_paid = sum(sum(float(p.get("amount") or 0) for p in (i.get("payments") or [])) for i in items)
        # INR-normalised totals (internal dashboard)
        total_locked_inr = 0.0
        total_paid_inr = 0.0
        for i in items:
            c = i.get("currency", "INR")
            locked_c = float(i.get("locked_budget") or 0)
            paid_c = sum(float(p.get("amount") or 0) for p in (i.get("payments") or []))
            total_locked_inr += _to_inr(locked_c, c, fx)
            total_paid_inr += _to_inr(paid_c, c, fx)
        by_status = {"pending": 0, "partial": 0, "paid": 0}
        by_category: Dict[str, float] = {}
        by_type: Dict[str, float] = {}
        for i in items:
            aggr = _aggregate(i)
            by_status[aggr["payment_status"]] = by_status.get(aggr["payment_status"], 0) + 1
            cat = (i.get("category") or "other")
            by_category[cat] = by_category.get(cat, 0) + _to_inr(float(i.get("locked_budget") or 0), i.get("currency", "INR"), fx)
            t = (i.get("payment_type") or "one_time")
            by_type[t] = by_type.get(t, 0) + _to_inr(float(i.get("locked_budget") or 0), i.get("currency", "INR"), fx)
        return {
            "total_projects": len(items),
            "total_locked": round(total_locked, 2),
            "total_paid": round(total_paid, 2),
            "remaining": round(max(0.0, total_locked - total_paid), 2),
            "percent_paid": round((total_paid / total_locked * 100) if total_locked else 0, 2),
            # INR-normalised aggregates (mixed-currency safe — internal only)
            "total_locked_inr": round(total_locked_inr, 2),
            "total_paid_inr": round(total_paid_inr, 2),
            "remaining_inr": round(max(0.0, total_locked_inr - total_paid_inr), 2),
            "percent_paid_inr": round((total_paid_inr / total_locked_inr * 100) if total_locked_inr else 0, 2),
            "by_status": by_status,
            "by_category": by_category,
            "by_type": by_type,
        }

    @api.post("/finance/projects")
    async def create_finance(payload: FinanceCreate, user=Depends(get_current_user)):
        _require_admin(user)
        now = datetime.now(timezone.utc).isoformat()
        project_id = payload.project_id or ""
        # If no project_id, create a stub in `projects` so the project appears in the Projects list.
        if not project_id:
            stub_id = str(uuid.uuid4())
            stub = {
                "id": stub_id,
                "owner_id": user["id"],
                "name": payload.project_name,
                "description": payload.notes or "",
                "client": payload.client_name or "",
                "status": "planning",
                "priority": "medium",
                "start_date": payload.start_date or "",
                "deadline": payload.end_date or "",
                "members": [],
                "manager": "",
                "tags": [payload.category],
                "progress": 0,
                "created_at": now,
                "updated_at": now,
            }
            await db.projects.insert_one(stub)
            project_id = stub_id
        # Avoid duplicate finance for same project
        existing = await db.project_finance.find_one({"project_id": project_id}, {"_id": 0})
        if existing:
            raise HTTPException(400, "Finance already exists for this project — open it to edit.")
        emails = []
        for e in (payload.client_emails or []):
            emails.append({"id": str(uuid.uuid4()), "email": e.email.strip().lower(), "name": e.name or "", "primary": e.primary})
        if emails and not any(e["primary"] for e in emails):
            emails[0]["primary"] = True
        doc = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "project_name": payload.project_name,
            "client_name": payload.client_name or "",
            "client_emails": emails,
            "discussed_budget": float(payload.discussed_budget or 0),
            "locked_budget": float(payload.locked_budget or 0),
            "currency": (payload.currency or "INR").upper(),
            "country": (payload.country or "").upper()[:2] or "IN",
            "payment_type": payload.payment_type,
            "category": payload.category,
            "start_date": payload.start_date or "",
            "end_date": payload.end_date or "",
            "notes": payload.notes or "",
            "gst_number": payload.gst_number or "",
            "billing_address": payload.billing_address or "",
            "payment_terms": payload.payment_terms or DEFAULT_PAYMENT_TERMS,
            "payments": [],
            "documents": [],
            "milestones": [],
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("email", ""),
        }
        await db.project_finance.insert_one(doc)
        return _aggregate(_scrub(doc))

    @api.get("/finance/projects/{fid}")
    async def get_finance(fid: str, user=Depends(get_current_user)):
        _require_priv(user)
        # exclude heavy base64 blobs from default GET
        doc = await db.project_finance.find_one(
            {"id": fid}, {"_id": 0, "documents.files.content_base64": 0}
        )
        if not doc:
            raise HTTPException(404, "Finance project not found")
        return _aggregate(doc)

    @api.patch("/finance/projects/{fid}")
    async def patch_finance(fid: str, payload: FinancePatch, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Finance project not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "currency" in updates:
            updates["currency"] = updates["currency"].upper()
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.project_finance.update_one({"id": fid}, {"$set": updates})
        # Keep project_name in projects collection in sync
        if "project_name" in updates and existing.get("project_id"):
            await db.projects.update_one(
                {"id": existing["project_id"]}, {"$set": {"name": updates["project_name"]}}
            )
        merged = await db.project_finance.find_one(
            {"id": fid}, {"_id": 0, "documents.files.content_base64": 0}
        )
        return _aggregate(merged)

    @api.delete("/finance/projects/{fid}")
    async def delete_finance(fid: str, user=Depends(get_current_user)):
        _require_admin(user)
        await db.project_finance.delete_one({"id": fid})
        return {"ok": True}

    # ── Client emails ─────────────────────────────────────────────
    @api.post("/finance/projects/{fid}/client-emails")
    async def add_email(fid: str, payload: ClientEmailIn, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0, "client_emails": 1})
        if not existing:
            raise HTTPException(404, "Not found")
        emails = existing.get("client_emails") or []
        new_email = {
            "id": str(uuid.uuid4()),
            "email": payload.email.strip().lower(),
            "name": payload.name or "",
            "primary": payload.primary,
        }
        if new_email["primary"]:
            for e in emails:
                e["primary"] = False
        emails.append(new_email)
        if not any(e.get("primary") for e in emails):
            emails[0]["primary"] = True
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"client_emails": emails, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"client_emails": emails}

    @api.patch("/finance/projects/{fid}/client-emails/{eid}")
    async def patch_email(fid: str, eid: str, body: dict, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0, "client_emails": 1})
        if not existing:
            raise HTTPException(404, "Not found")
        emails = existing.get("client_emails") or []
        for e in emails:
            if e["id"] == eid:
                if "email" in body:
                    e["email"] = str(body["email"]).strip().lower()
                if "name" in body:
                    e["name"] = body["name"]
                if body.get("primary"):
                    for x in emails:
                        x["primary"] = False
                    e["primary"] = True
                break
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"client_emails": emails, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"client_emails": emails}

    @api.delete("/finance/projects/{fid}/client-emails/{eid}")
    async def del_email(fid: str, eid: str, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0, "client_emails": 1})
        if not existing:
            raise HTTPException(404, "Not found")
        emails = [e for e in (existing.get("client_emails") or []) if e["id"] != eid]
        if emails and not any(e.get("primary") for e in emails):
            emails[0]["primary"] = True
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"client_emails": emails, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"client_emails": emails}

    # ── Payments ──────────────────────────────────────────────────
    @api.post("/finance/projects/{fid}/payments")
    async def add_payment(fid: str, payload: PaymentIn, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        amount = float(payload.amount or 0)
        if amount <= 0 and payload.percent and existing.get("locked_budget"):
            amount = round(float(existing["locked_budget"]) * float(payload.percent) / 100.0, 2)
        if amount <= 0:
            raise HTTPException(400, "Provide a positive amount or a percent of a locked budget")
        item = {
            "id": str(uuid.uuid4()),
            "amount": amount,
            "percent": float(payload.percent) if payload.percent is not None else round(
                (amount / float(existing.get("locked_budget") or 0) * 100) if existing.get("locked_budget") else 0, 2
            ),
            "paid_at": payload.paid_at or datetime.now(timezone.utc).date().isoformat(),
            "method": payload.method or "bank_transfer",
            "note": payload.note or "",
            "invoice_id": payload.invoice_id or "",
            "recorded_by": user.get("email", ""),
            "recorded_at": datetime.now(timezone.utc).isoformat(),
        }
        payments = (existing.get("payments") or []) + [item]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"payments": payments, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        existing["payments"] = payments
        return _aggregate(_scrub(existing))

    @api.delete("/finance/projects/{fid}/payments/{pid}")
    async def del_payment(fid: str, pid: str, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        payments = [p for p in (existing.get("payments") or []) if p["id"] != pid]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"payments": payments, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        existing["payments"] = payments
        return _aggregate(_scrub(existing))

    # ── Milestones ────────────────────────────────────────────────
    # Quote → ordered milestones. Each milestone progresses:
    #   planned → awaiting_confirmation → confirmed → invoiced → paid
    # The next milestone unlocks only once the previous one is `paid`.

    def _ms_check_unlock(milestones: list, target_id: str) -> tuple[bool, str]:
        """Return (unlocked, reason). A milestone is unlocked when every
        earlier-ordered milestone is `paid`."""
        ordered = sorted(milestones, key=lambda m: (m.get("order", 0), m.get("created_at", "")))
        for m in ordered:
            if m.get("id") == target_id:
                return True, ""
            if m.get("status") != "paid":
                return False, f"Locked: complete '{m.get('title')}' first (status: {m.get('status')})."
        return False, "Milestone not found"

    @api.post("/finance/projects/{fid}/milestones")
    async def add_milestone(fid: str, payload: MilestoneIn, user=Depends(get_current_user)):
        _require_priv(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        ms = existing.get("milestones") or []
        now = datetime.now(timezone.utc).isoformat()
        order = payload.order if payload.order is not None else (max([m.get("order", 0) for m in ms] + [0]) + 1)
        m = {
            "id": str(uuid.uuid4()),
            "title": payload.title,
            "description": payload.description or "",
            "amount": float(payload.amount or 0),
            "due_date": payload.due_date or "",
            "order": int(order),
            "status": "planned",
            "notes": "",
            "confirmation_token": str(uuid.uuid4()),  # public confirm link
            "sent_to_client_at": "",
            "client_confirmed_at": "",
            "client_decision_note": "",
            "invoice_id": "",
            "paid_at": "",
            "created_at": now,
            "updated_at": now,
            "created_by": user.get("email", ""),
        }
        ms.append(m)
        ms.sort(key=lambda x: (x.get("order", 0), x.get("created_at", "")))
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"milestones": ms, "updated_at": now, "payment_type": "milestone"}}
        )
        existing["milestones"] = ms
        existing["payment_type"] = "milestone"
        return _aggregate(_scrub(existing))

    @api.patch("/finance/projects/{fid}/milestones/{mid}")
    async def patch_milestone(fid: str, mid: str, payload: MilestonePatch, user=Depends(get_current_user)):
        _require_priv(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        ms = existing.get("milestones") or []
        idx = next((i for i, m in enumerate(ms) if m.get("id") == mid), -1)
        if idx < 0:
            raise HTTPException(404, "Milestone not found")
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "amount" in upd:
            upd["amount"] = float(upd["amount"])
        ms[idx] = {**ms[idx], **upd, "updated_at": datetime.now(timezone.utc).isoformat()}
        ms.sort(key=lambda x: (x.get("order", 0), x.get("created_at", "")))
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"milestones": ms, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        existing["milestones"] = ms
        return _aggregate(_scrub(existing))

    @api.delete("/finance/projects/{fid}/milestones/{mid}")
    async def del_milestone(fid: str, mid: str, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        ms = [m for m in (existing.get("milestones") or []) if m.get("id") != mid]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"milestones": ms, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        existing["milestones"] = ms
        return _aggregate(_scrub(existing))

    @api.post("/finance/projects/{fid}/milestones/{mid}/send-for-confirmation")
    async def send_milestone_for_confirmation(fid: str, mid: str, user=Depends(get_current_user)):
        """Mark milestone awaiting_confirmation and email all client_emails
        with the public confirm/reject link.
        Enforces the previous-milestone-paid lock.
        """
        _require_priv(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        ms = existing.get("milestones") or []
        unlocked, reason = _ms_check_unlock(ms, mid)
        if not unlocked:
            raise HTTPException(400, reason)
        idx = next((i for i, m in enumerate(ms) if m.get("id") == mid), -1)
        m = ms[idx]
        m["status"] = "awaiting_confirmation"
        m["sent_to_client_at"] = datetime.now(timezone.utc).isoformat()
        m["client_decision_note"] = ""
        ms[idx] = m
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"milestones": ms, "updated_at": m["sent_to_client_at"]}}
        )
        # Send email
        public_url = (os.environ.get("PUBLIC_SITE_URL") or "https://www.projexino.com").rstrip("/")
        confirm_link = f"{public_url}/milestone/confirm?t={m['confirmation_token']}"
        client_emails = [e["email"] for e in (existing.get("client_emails") or []) if e.get("email")]
        subject = f"Approve milestone: {m['title']} — {existing.get('project_name', '')}"
        body_html = f"""
<div style='font-family:Inter,Arial,sans-serif;max-width:580px;margin:0 auto;color:#0F2042'>
  <div style='text-align:center;padding:18px 0;border-bottom:1px solid #fde2c9'>
    <div style='font-size:11px;font-weight:bold;letter-spacing:.28em;color:#F97316'>// PROJEXINO · MILESTONE APPROVAL</div>
  </div>
  <h2 style='margin:24px 0 6px;font-size:22px'>{m['title']}</h2>
  <p style='margin:0;color:#475569;font-size:14px'><b>Project:</b> {existing.get('project_name', '')}</p>
  <p style='margin:6px 0 0;color:#475569;font-size:14px'><b>Amount:</b> {existing.get('currency', 'INR')} {m['amount']:,.2f}</p>
  <p style='margin:6px 0 0;color:#475569;font-size:14px'><b>Target date:</b> {m.get('due_date') or 'TBD'}</p>
  <p style='margin:18px 0;color:#475569;font-size:14px;line-height:1.6'>{m.get('description') or ''}</p>
  <div style='margin:24px 0;text-align:center'>
    <a href='{confirm_link}' style='display:inline-block;padding:12px 22px;background:#F97316;color:white;font-weight:bold;border-radius:999px;text-decoration:none'>Review &amp; Approve →</a>
  </div>
  <p style='color:#94a3b8;font-size:11px;text-align:center;margin-top:32px'>If you have questions, just reply to this email.</p>
</div>
"""
        sent_to = 0
        try:
            from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
            import base64
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            token = await _resolve_send_token(db, None)
            if token and client_emails:
                token = await _refresh_if_needed(db, token)
                service = _build_gmail_service(token)
                sender = token.get("email")
                for to in client_emails:
                    msg = MIMEMultipart("alternative")
                    msg["Subject"] = subject
                    msg["From"] = f'"Projexino" <{sender}>'
                    msg["To"] = to
                    msg.attach(MIMEText(body_html, "html"))
                    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                    service.users().messages().send(userId="me", body={"raw": raw}).execute()
                    sent_to += 1
        except Exception:
            pass
        return {"ok": True, "milestone": m, "emailed_to": sent_to, "confirm_link": confirm_link}

    @api.post("/finance/projects/{fid}/milestones/{mid}/mark-paid")
    async def mark_milestone_paid(
        fid: str, mid: str,
        payload: Dict[str, Any] = Body(default={}),
        user=Depends(get_current_user),
    ):
        """Marks a milestone paid AND auto-creates a Payment entry on the
        finance project (so existing totals/aggregates stay in sync)."""
        _require_priv(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        ms = existing.get("milestones") or []
        idx = next((i for i, m in enumerate(ms) if m.get("id") == mid), -1)
        if idx < 0:
            raise HTTPException(404, "Milestone not found")
        m = ms[idx]
        now = datetime.now(timezone.utc).isoformat()
        amount = float(payload.get("amount") or m.get("amount") or 0)
        method = payload.get("method") or "bank_transfer"
        note = payload.get("note") or f"Milestone payment: {m.get('title', '')}"
        m["status"] = "paid"
        m["paid_at"] = payload.get("paid_at") or now
        m["updated_at"] = now
        ms[idx] = m
        # Auto-add a payment so the finance project totals reconcile.
        payments = list(existing.get("payments") or [])
        payments.append({
            "id": str(uuid.uuid4()),
            "amount": amount,
            "paid_at": m["paid_at"],
            "method": method,
            "note": note,
            "milestone_id": mid,
            "added_by": user.get("email", ""),
            "added_at": now,
        })
        await db.project_finance.update_one(
            {"id": fid},
            {"$set": {"milestones": ms, "payments": payments, "updated_at": now}},
        )
        existing["milestones"] = ms
        existing["payments"] = payments
        return _aggregate(_scrub(existing))

    # ── Public — client confirms / rejects a milestone ──────────────
    @api.get("/finance/milestones/by-token/{token}")
    async def public_milestone_lookup(token: str):
        fp = await db.project_finance.find_one(
            {"milestones.confirmation_token": token},
            {"_id": 0, "documents": 0},
        )
        if not fp:
            raise HTTPException(404, "Invalid or expired link")
        ms = fp.get("milestones") or []
        m = next((x for x in ms if x.get("confirmation_token") == token), None)
        if not m:
            raise HTTPException(404, "Milestone not found")
        return {
            "project_name": fp.get("project_name", ""),
            "client_name": fp.get("client_name", ""),
            "currency": fp.get("currency", "INR"),
            "milestone": m,
            "is_decided": m.get("status") in ("confirmed", "invoiced", "paid", "rejected"),
        }

    @api.post("/finance/milestones/by-token/{token}/decision")
    async def public_milestone_decide(token: str, payload: Dict[str, Any] = Body(...)):
        decision = (payload.get("decision") or "").lower()
        if decision not in ("confirmed", "rejected"):
            raise HTTPException(400, "decision must be confirmed|rejected")
        note = (payload.get("note") or "").strip()
        fp = await db.project_finance.find_one({"milestones.confirmation_token": token}, {"_id": 0})
        if not fp:
            raise HTTPException(404, "Invalid or expired link")
        ms = fp.get("milestones") or []
        idx = next((i for i, m in enumerate(ms) if m.get("confirmation_token") == token), -1)
        if idx < 0:
            raise HTTPException(404, "Milestone not found")
        m = ms[idx]
        if m.get("status") in ("paid", "invoiced"):
            raise HTTPException(400, "Milestone is already finalised")
        now = datetime.now(timezone.utc).isoformat()
        m["status"] = "confirmed" if decision == "confirmed" else "rejected"
        m["client_confirmed_at"] = now
        m["client_decision_note"] = note
        m["updated_at"] = now
        # Rotate the token so the link can't be reused after a decision
        m["confirmation_token"] = str(uuid.uuid4())
        ms[idx] = m
        await db.project_finance.update_one(
            {"id": fp["id"]}, {"$set": {"milestones": ms, "updated_at": now}}
        )
        return {"ok": True, "status": m["status"]}

    # ── Folders / Documents ───────────────────────────────────────
    @api.post("/finance/projects/{fid}/folders")
    async def add_folder(fid: str, payload: FolderIn, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 1})
        if not existing:
            raise HTTPException(404, "Not found")
        folder = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "description": payload.description or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "files": [],
        }
        documents = (existing.get("documents") or []) + [folder]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"documents": documents, "updated_at": folder["created_at"]}}
        )
        return folder

    @api.delete("/finance/projects/{fid}/folders/{folder_id}")
    async def del_folder(fid: str, folder_id: str, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 1})
        if not existing:
            raise HTTPException(404, "Not found")
        documents = [f for f in (existing.get("documents") or []) if f["id"] != folder_id]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"documents": documents, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True}

    @api.post("/finance/projects/{fid}/folders/{folder_id}/files")
    async def add_file(fid: str, folder_id: str, payload: FileIn, user=Depends(get_current_user)):
        _require_admin(user)
        if payload.size > MAX_FILE_BYTES:
            raise HTTPException(400, "File too large (max 10MB)")
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        documents = existing.get("documents") or []
        target = next((f for f in documents if f["id"] == folder_id), None)
        if not target:
            raise HTTPException(404, "Folder not found")
        file_entry = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "mime": payload.mime or "application/octet-stream",
            "size": int(payload.size or 0),
            "content_base64": payload.content_base64,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": user.get("email", ""),
        }
        target["files"] = (target.get("files") or []) + [file_entry]
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"documents": documents, "updated_at": file_entry["uploaded_at"]}}
        )
        out = {k: v for k, v in file_entry.items() if k != "content_base64"}
        return out

    @api.delete("/finance/projects/{fid}/folders/{folder_id}/files/{file_id}")
    async def del_file(fid: str, folder_id: str, file_id: str, user=Depends(get_current_user)):
        _require_admin(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        documents = existing.get("documents") or []
        for f in documents:
            if f["id"] == folder_id:
                f["files"] = [x for x in (f.get("files") or []) if x["id"] != file_id]
                break
        await db.project_finance.update_one(
            {"id": fid}, {"$set": {"documents": documents, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        return {"ok": True}

    @api.get("/finance/projects/{fid}/folders/{folder_id}/files/{file_id}/download")
    async def download_file(fid: str, folder_id: str, file_id: str, user=Depends(get_current_user)):
        _require_priv(user)
        existing = await db.project_finance.find_one({"id": fid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        for f in (existing.get("documents") or []):
            if f["id"] == folder_id:
                for x in (f.get("files") or []):
                    if x["id"] == file_id:
                        return {
                            "name": x["name"], "mime_type": x.get("mime"),
                            "content_base64": x.get("content_base64", ""),
                            "size": x.get("size", 0),
                        }
        raise HTTPException(404, "File not found")

    # ── Invoices ──────────────────────────────────────────────────
    @api.post("/finance/projects/{fid}/invoices")
    async def create_invoice(fid: str, payload: InvoiceCreateIn, request: Request, user=Depends(get_current_user)):
        _require_admin(user)
        finance = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 0})
        if not finance:
            raise HTTPException(404, "Not found")
        inv_no = await _allocate_invoice_no(db)
        now = datetime.now(timezone.utc).isoformat()
        invoice = {
            "id": str(uuid.uuid4()),
            "invoice_no": inv_no,
            "project_id": finance.get("project_id", ""),
            "project_name": finance.get("project_name", ""),
            "client_name": finance.get("client_name", ""),
            "amount": float(payload.amount),
            "currency": finance.get("currency", "INR"),
            "tax_percent": float(payload.tax_percent or 0),
            "discount": float(payload.discount or 0),
            "items": payload.items or [],
            "notes": payload.notes or "",
            "due_date": payload.due_date or "",
            "payment_terms": (payload.payment_terms or finance.get("payment_terms") or DEFAULT_PAYMENT_TERMS).strip(),
            "status": "issued",
            "issued_at": now,
            "issued_by": user.get("email", ""),
            "sent_to": [],
            "sent_at": None,
            "finance_id": fid,
            "share_token": uuid.uuid4().hex,
        }
        try:
            pdf = _build_invoice_pdf(invoice, finance, await _bank_settings(), public_base=_public_base(request))
            invoice["pdf_base64"] = base64.b64encode(pdf).decode("ascii")
        except Exception as e:
            logger.exception("Invoice PDF build failed: %s", e)
            raise HTTPException(500, f"PDF build failed: {str(e)[:200]}")
        await db.invoices.insert_one(invoice)
        out = {k: v for k, v in invoice.items() if k not in ("pdf_base64", "_id")}
        return out

    @api.get("/finance/invoices")
    async def list_invoices(project_id: Optional[str] = None, finance_id: Optional[str] = None, user=Depends(get_current_user)):
        _require_priv(user)
        q = {}
        if finance_id:
            q["finance_id"] = finance_id
        elif project_id:
            q["project_id"] = project_id
        cur = db.invoices.find(q, {"_id": 0, "pdf_base64": 0}).sort("issued_at", -1).limit(300)
        return await cur.to_list(300)

    @api.get("/finance/invoices/{invoice_id}")
    async def get_invoice(invoice_id: str, user=Depends(get_current_user)):
        _require_priv(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        return inv

    @api.get("/finance/invoices/{invoice_id}/pdf")
    async def get_invoice_pdf(invoice_id: str, request: Request, user=Depends(get_current_user)):
        _require_priv(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        # Always rebuild so design/bank-detail updates propagate; fall back to cached copy.
        finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
        try:
            pdf = _build_invoice_pdf(inv, finance, await _bank_settings(), public_base=_public_base(request))
        except Exception:
            pdf_b64 = inv.get("pdf_base64") or ""
            if not pdf_b64:
                raise HTTPException(500, "PDF build failed")
            pdf = base64.b64decode(pdf_b64)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_no")}.pdf"'},
        )

    @api.post("/finance/invoices/{invoice_id}/whatsapp")
    async def invoice_whatsapp(invoice_id: str, request: Request, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        """Build a WhatsApp-ready message + tokenized public download link for an invoice.
        Receipts are shared separately (only after admin approves the payment)."""
        _require_admin(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        token = inv.get("share_token")
        if not token:
            token = uuid.uuid4().hex
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"share_token": token, "share_created_at": datetime.now(timezone.utc).isoformat()}},
            )
        doc_type = "invoice"
        base = _public_base(request)
        download_url = f"{base}/api/d/i/{token}"
        try:
            _issued = datetime.fromisoformat((inv.get("issued_at") or "").replace("Z", "+00:00"))
        except Exception:
            _issued = datetime.now(timezone.utc)
        month = _issued.strftime("%B %Y")
        service = inv.get("project_name") or "Projexino Services"
        label = "Invoice"
        amount = f"{inv.get('currency', 'INR')} {float(inv.get('amount') or 0):,.2f}"
        is_paid = inv.get("status") == "paid"
        lines = [
            "🧾 *PROJEXINO SOLUTIONS*",
            "━━━━━━━━━━━━━━━",
            f"*{service} {label} — {month}*",
            "",
            f"Hi {inv.get('client_name') or 'there'} 👋",
            f"Your {label.lower()} is ready. Quick summary:",
            "",
            f"▸ *{label} No:* {inv.get('invoice_no')}",
            f"▸ *Service:* {service}",
            f"▸ *Billing Month:* {month}",
            f"▸ *Amount:* {amount}",
        ]
        if inv.get("due_date"):
            lines.append(f"▸ *Due Date:* {inv.get('due_date')}")
        if is_paid:
            lines.append("▸ *Status:* Paid ✅")
        lines += [
            "",
            "📎 _Your invoice PDF is attached with this message._",
        ]
        if not is_paid:
            bank = await _bank_settings()
            lines += ["", "💳 *HOW TO PAY*", "📱 Scan the attached *PhonePe QR* to pay instantly"]
            bank_rows = [
                ("A/C Name", bank.get("account_name")),
                ("A/C No", bank.get("account_number")),
                ("Bank", bank.get("bank_name")),
                ("IFSC", bank.get("ifsc")),
                ("UPI ID", bank.get("upi_id")),
            ]
            bank_lines = [f"▸ *{k}:* {v}" for k, v in bank_rows if (v or "").strip()]
            if bank_lines:
                lines.append("🏦 *Or pay by Bank Transfer:*")
                lines += bank_lines
        lines += [
            "",
            "━━━━━━━━━━━━━━━",
            "Thank you for choosing Projexino! 🧡",
            "_Questions? Just reply to this message._",
        ]
        link_block = f"📥 *Download Invoice (PDF):*\n{download_url}"
        return {
            "wa_text": "\n".join(lines),
            "download_url": download_url,
            "link_block": link_block,
            "qr_attach": not is_paid,
            "doc_type": doc_type,
            "share_token": token,
            "month": month,
        }

    @api.get("/public/payment-qr")
    async def public_payment_qr():
        """PhonePe scan-&-pay QR — served from backend assets so it also works self-hosted."""
        import os as _os
        p = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "assets", "phonepe-qr.png")
        try:
            with open(p, "rb") as fh:
                data = fh.read()
        except Exception:
            raise HTTPException(404, "Payment QR not configured")
        return Response(content=data, media_type="image/png",
                        headers={"Cache-Control": "public, max-age=86400"})

    @api.get("/public/finance-doc/{token}")
    async def public_finance_doc(token: str, request: Request):
        """Public tokenized PDF download — used in WhatsApp share links (no auth)."""
        inv = await db.invoices.find_one({"share_token": token}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Document not found or link expired")
        finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
        try:
            pdf = _build_invoice_pdf(inv, finance, await _bank_settings(), public_base=_public_base(request))
        except Exception:
            pdf_b64 = inv.get("pdf_base64") or ""
            if not pdf_b64:
                raise HTTPException(500, "PDF build failed")
            pdf = base64.b64decode(pdf_b64)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_no")}-Invoice.pdf"'},
        )

    @api.post("/finance/projects/{fid}/whatsapp-reminder")
    async def finance_whatsapp_reminder(fid: str, user=Depends(get_current_user)):
        """WhatsApp-ready polite payment reminder for the outstanding balance."""
        _require_admin(user)
        fp = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 0})
        if not fp:
            raise HTTPException(404, "Not found")
        agg = _aggregate(fp)
        remaining = float(agg.get("remaining") or 0)
        if remaining <= 0:
            raise HTTPException(400, "No outstanding balance to remind on")
        ccy = fp.get("currency", "INR")
        first = ((fp.get("client_name") or "there").split(" ") or ["there"])[0]
        wa_text = "\n".join([
            "🔔 *PAYMENT REMINDER*",
            "━━━━━━━━━━━━━━━",
            f"Hi {first} 👋",
            "",
            "A gentle reminder from *Projexino Solutions* regarding:",
            "",
            f"▸ *Project:* {fp.get('project_name', 'your project')}",
            f"▸ *Outstanding:* {ccy} {remaining:,.2f}",
            "",
            "If the payment is already on its way, please ignore this message. Need the invoice or payment details? Just reply here 🙌",
            "",
            "━━━━━━━━━━━━━━━",
            "Thank you 🙏",
            "_Team Projexino_",
        ])
        return {"wa_text": wa_text, "remaining": remaining, "currency": ccy}

    # ═══ Payment lifecycle: click tracking → approval → receipts → ZIP ═══

    async def _gmail_token_or_400(from_token_id=None):
        try:
            from email_module import _resolve_send_token, _refresh_if_needed
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _resolve_send_token(db, from_token_id or None)
        if not token:
            raise HTTPException(400, "Gmail not connected.")
        try:
            return await _refresh_if_needed(db, token)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "Gmail connection expired — please reconnect Gmail in Settings → Email.")

    async def _receipt_pdf_bytes(rec: dict) -> bytes:
        inv = await db.invoices.find_one({"id": rec.get("invoice_id")}, {"_id": 0, "pdf_base64": 0}) or {}
        if not inv:
            inv = {"invoice_no": rec.get("invoice_no"), "amount": rec.get("amount"),
                   "currency": rec.get("currency"), "issued_at": rec.get("approved_at"),
                   "client_name": rec.get("client_name"), "project_name": rec.get("project_name")}
        finance = await db.project_finance.find_one({"id": rec.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
        return _build_invoice_pdf(inv, finance, await _bank_settings(), receipt=rec)

    @api.post("/public/invoice-pay/{token}/track")
    async def track_pay_event(token: str, payload: Dict[str, Any] = Body(default={})):
        """Public: records client activity on the pay page (view / pay click / bank claim)."""
        inv = await db.invoices.find_one({"share_token": token}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invalid link")
        event = str(payload.get("event") or "").strip()
        if event not in ("page_view", "pay_click", "bank_transfer_claimed"):
            raise HTTPException(400, "Unknown event")
        now = datetime.now(timezone.utc).isoformat()
        await db.invoice_pay_events.insert_one({
            "id": uuid.uuid4().hex, "invoice_id": inv["id"], "invoice_no": inv.get("invoice_no"),
            "finance_id": inv.get("finance_id"), "event": event,
            "method": str(payload.get("method") or ""), "at": now,
        })
        if event == "page_view":
            await db.invoices.update_one({"id": inv["id"]}, {"$inc": {"pay_view_count": 1}, "$set": {"last_pay_view_at": now}})
        elif event == "pay_click":
            await db.invoices.update_one({"id": inv["id"]}, {"$inc": {"pay_click_count": 1}, "$set": {"last_pay_click_at": now}})
            await notify_finance_admins(
                db, "🖱️ Client clicked Pay",
                f"{inv.get('client_name') or 'Client'} clicked Pay Now on {inv.get('invoice_no')} ({inv.get('currency', 'INR')} {float(inv.get('amount') or 0):,.2f}).",
            )
        else:
            await db.invoices.update_one({"id": inv["id"]}, {"$set": {"bank_claimed_at": now}})
            await notify_finance_admins(
                db, "🏦 Client says payment done",
                f"{inv.get('client_name') or 'Client'} marked the bank transfer done for {inv.get('invoice_no')} — verify the credit and approve to generate the receipt.",
            )
        return {"ok": True}

    @api.get("/finance/invoices/{invoice_id}/pay-events")
    async def list_pay_events(invoice_id: str, user=Depends(get_current_user)):
        _require_priv(user)
        return await db.invoice_pay_events.find({"invoice_id": invoice_id}, {"_id": 0}).sort("at", -1).to_list(200)

    @api.post("/finance/invoices/{invoice_id}/approve-payment")
    async def approve_payment(invoice_id: str, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        """Admin verified the credit — mark paid, record payment, generate receipt."""
        _require_admin(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        if inv.get("status") == "paid":
            raise HTTPException(400, "Invoice is already approved/paid")
        method = str(payload.get("method") or "bank_transfer")
        note = str(payload.get("note") or "")
        now = datetime.now(timezone.utc).isoformat()
        rec = await create_receipt_for_invoice(db, inv, method, user.get("email"), note)
        receipt_no = rec["receipt_no"]
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"status": "paid", "paid_at": now, "payment_approved_by": user.get("email")}},
        )
        if inv.get("finance_id"):
            await db.project_finance.update_one(
                {"id": inv["finance_id"]},
                {"$push": {"payments": {
                    "id": uuid.uuid4().hex, "amount": float(inv.get("amount") or 0),
                    "method": method,
                    "note": f"Approved via invoice {inv.get('invoice_no')}" + (f" — {note}" if note else ""),
                    "paid_at": now, "invoice_id": invoice_id,
                }}},
            )
        await db.finance_activity.insert_one({
            "id": str(uuid.uuid4()), "event": "payment_approved", "invoice_id": invoice_id,
            "finance_id": inv.get("finance_id"), "amount": float(inv.get("amount") or 0),
            "currency": inv.get("currency", "INR"), "by": user.get("email"),
            "meta": {"receipt_no": receipt_no, "method": method}, "at": now,
        })
        return rec

    @api.get("/finance/receipts")
    async def list_receipts(finance_id: str = "", user=Depends(get_current_user)):
        _require_priv(user)
        q = {"finance_id": finance_id} if finance_id else {}
        return await db.receipts.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)

    @api.post("/finance/receipts")
    async def create_receipt_manual(payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        """Manually create a receipt — from an unpaid invoice (dropdown) or standalone (no invoice)."""
        _require_admin(user)
        method = str(payload.get("method") or "bank_transfer")
        note = str(payload.get("note") or "")
        invoice_id = str(payload.get("invoice_id") or "").strip()
        now = datetime.now(timezone.utc).isoformat()
        if invoice_id:
            inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
            if not inv:
                raise HTTPException(404, "Invoice not found")
            if inv.get("status") == "paid":
                raise HTTPException(400, "Invoice is already paid — its receipt already exists")
            rec = await create_receipt_for_invoice(db, inv, method, user.get("email"), note)
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"status": "paid", "paid_at": now, "payment_approved_by": user.get("email")}})
            if inv.get("finance_id"):
                await db.project_finance.update_one({"id": inv["finance_id"]}, {"$push": {"payments": {
                    "id": uuid.uuid4().hex, "amount": float(inv.get("amount") or 0), "method": method,
                    "note": f"Receipt {rec['receipt_no']} (manual)" + (f" — {note}" if note else ""),
                    "paid_at": now, "invoice_id": invoice_id}}})
            return rec
        fid = str(payload.get("finance_id") or "").strip()
        amount = float(payload.get("amount") or 0)
        if not fid or amount <= 0:
            raise HTTPException(400, "finance_id and a positive amount are required for a standalone receipt")
        fp = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 0})
        if not fp:
            raise HTTPException(404, "Finance project not found")
        receipt_no = await _allocate_receipt_no(db)
        rec = {
            "id": uuid.uuid4().hex, "receipt_no": receipt_no,
            "invoice_id": "", "invoice_no": "",
            "finance_id": fid, "project_name": fp.get("project_name"),
            "client_name": fp.get("client_name"),
            "amount": amount, "currency": fp.get("currency", "INR"),
            "method": method, "note": note,
            "approved_by": user.get("email"), "approved_at": now,
            "share_token": uuid.uuid4().hex, "created_at": now,
        }
        await db.receipts.insert_one(dict(rec))
        if payload.get("record_payment"):
            await db.project_finance.update_one({"id": fid}, {"$push": {"payments": {
                "id": uuid.uuid4().hex, "amount": amount, "method": method,
                "note": f"Receipt {receipt_no}" + (f" — {note}" if note else ""),
                "paid_at": now}}})
        return rec

    @api.get("/finance/receipts/{rid}/pdf")
    async def receipt_pdf(rid: str, user=Depends(get_current_user)):
        _require_priv(user)
        rec = await db.receipts.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Receipt not found")
        pdf = await _receipt_pdf_bytes(rec)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{rec["receipt_no"]}.pdf"'})

    @api.get("/public/finance-receipt/{token}")
    async def public_receipt_doc(token: str):
        rec = await db.receipts.find_one({"share_token": token}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Document not found or link expired")
        pdf = await _receipt_pdf_bytes(rec)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{rec["receipt_no"]}.pdf"'})

    @api.get("/d/i/{token}")
    async def short_invoice_download(token: str, request: Request):
        """Short public alias used in WhatsApp messages."""
        return await public_finance_doc(token, request)

    @api.get("/d/r/{token}")
    async def short_receipt_download(token: str):
        """Short public alias used in WhatsApp messages."""
        return await public_receipt_doc(token)

    @api.post("/finance/receipts/{rid}/whatsapp")
    async def receipt_whatsapp(rid: str, request: Request, user=Depends(get_current_user)):
        _require_admin(user)
        rec = await db.receipts.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Receipt not found")
        base = _public_base(request)
        download_url = f"{base}/api/d/r/{rec['share_token']}"
        try:
            _appr = datetime.fromisoformat((rec.get("approved_at") or "").replace("Z", "+00:00"))
        except Exception:
            _appr = datetime.now(timezone.utc)
        month = _appr.strftime("%B %Y")
        date_label = _appr.strftime("%d %b %Y")
        method_label = str(rec.get("method", "")).replace("_", " ").title() or "Bank Transfer"
        _proj = rec.get("project_name") or "Projexino Services"
        lines = [
            "🧾 *PROJEXINO SOLUTIONS*",
            "━━━━━━━━━━━━━━━",
            f"*{_proj} Receipt — {month}*",
            "",
            f"Hi {rec.get('client_name') or 'there'} 👋",
            "We've received your payment — thank you! Here's your receipt:",
            "",
            f"▸ *Receipt No:* {rec['receipt_no']}",
        ]
        if rec.get("invoice_no"):
            lines.append(f"▸ *Invoice Ref:* {rec.get('invoice_no')}")
        lines += [
            f"▸ *Amount Paid:* {rec.get('currency', 'INR')} {float(rec.get('amount') or 0):,.2f}",
            f"▸ *Payment Method:* {method_label}",
            f"▸ *Date:* {date_label}",
            "",
            "📎 _Your official receipt PDF is attached with this message._",
            "",
            "━━━━━━━━━━━━━━━",
            "We appreciate your business! 🧡",
            "_Team Projexino_",
        ]
        link_block = f"📥 *Download Receipt (PDF):*\n{download_url}"
        return {"wa_text": "\n".join(lines), "download_url": download_url, "link_block": link_block}

    @api.post("/finance/receipts/{rid}/email")
    async def receipt_email(rid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        _require_admin(user)
        rec = await db.receipts.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Receipt not found")
        to_email = str(payload.get("to_email") or "").strip()
        if not to_email:
            raise HTTPException(400, "to_email is required")
        try:
            from email_module import _build_gmail_service, _branded_template
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _gmail_token_or_400(payload.get("from_token_id"))
        amount_str = f"{rec.get('currency', 'INR')} {float(rec.get('amount') or 0):,.2f}"
        subject = f"Payment Receipt {rec['receipt_no']} — {rec.get('project_name')}"
        extra = str(payload.get("message") or "").strip()
        body_html = (
            f"<p>Hi {rec.get('client_name') or 'there'},</p>"
            f"<p>Thank you for your payment! Please find your official receipt attached.</p>"
            f"<table style='border-collapse:collapse;margin:16px 0;font-size:14px'>"
            f"<tr><td style='padding:6px 16px 6px 0;color:#64748B'>Receipt No</td><td style='font-weight:700;color:#0F2042'>{rec['receipt_no']}</td></tr>"
            f"<tr><td style='padding:6px 16px 6px 0;color:#64748B'>Invoice Ref</td><td style='font-weight:700;color:#0F2042'>{rec.get('invoice_no')}</td></tr>"
            f"<tr><td style='padding:6px 16px 6px 0;color:#64748B'>Amount Paid</td><td style='font-weight:700;color:#F97316'>{amount_str}</td></tr>"
            f"<tr><td style='padding:6px 16px 6px 0;color:#64748B'>Method</td><td style='color:#0F2042'>{str(rec.get('method', '')).replace('_', ' ').title()}</td></tr>"
            f"<tr><td style='padding:6px 16px 6px 0;color:#64748B'>Date</td><td style='color:#0F2042'>{str(rec.get('approved_at', ''))[:10]}</td></tr>"
            f"</table>"
            + (f"<p>{extra}</p>" if extra else "")
            + "<p>We appreciate your business!</p>"
        )
        body_html = _branded_template(subject, body_html, "Visit Projexino", "https://projexino.com")
        try:
            service = _build_gmail_service(token)
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            from email.mime.application import MIMEApplication
            msg = MIMEMultipart()
            msg["Subject"] = subject
            msg["From"] = f'"{token.get("from_name") or "Projexino Billing"}" <{token.get("email")}>'
            msg["To"] = to_email
            if token.get("reply_to"):
                msg["Reply-To"] = token["reply_to"]
            msg.attach(MIMEText(body_html, "html"))
            attach = MIMEApplication(await _receipt_pdf_bytes(rec), _subtype="pdf")
            attach.add_header("Content-Disposition", "attachment", filename=f"{rec['receipt_no']}.pdf")
            msg.attach(attach)
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
            service.users().messages().send(userId="me", body={"raw": raw}).execute()
            now = datetime.now(timezone.utc).isoformat()
            await db.receipts.update_one({"id": rid}, {"$set": {"emailed_to": to_email, "emailed_at": now}})
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()), "to": [to_email], "subject": subject,
                "event": "receipt_sent", "receipt_no": rec["receipt_no"], "sent_at": now,
                "sent_by_email": user.get("email", ""), "from": token.get("email"),
            })
            return {"ok": True, "sent_to": to_email}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Receipt email failed: %s", e)
            raise HTTPException(502, f"Send failed: {str(e)[:200]}")

    @api.post("/finance/invoices/{invoice_id}/payment-email")
    async def payment_request_email(invoice_id: str, request: Request, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        """Branded 'Pay Now' email — button routes to the public pay page (bank / UPI / card)."""
        _require_admin(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
        emails_meta = finance.get("client_emails") or []
        to_ids = payload.get("to_email_ids") or []
        if to_ids:
            targets = [e["email"] for e in emails_meta if e["id"] in to_ids]
        else:
            primary = [e["email"] for e in emails_meta if e.get("primary")]
            targets = primary or [e["email"] for e in emails_meta[:1]]
        extra_to = str(payload.get("to_email") or "").strip()
        if extra_to:
            targets = list(dict.fromkeys(targets + [extra_to]))
        if not targets:
            raise HTTPException(400, "No client emails on file — add one or pass to_email.")
        token_share = inv.get("share_token")
        if not token_share:
            token_share = uuid.uuid4().hex
            await db.invoices.update_one({"id": invoice_id}, {"$set": {"share_token": token_share}})
        base = _public_base(request)
        pay_url = f"{base}/pay/invoice/{token_share}?src=email"
        try:
            from email_module import _build_gmail_service
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _gmail_token_or_400(payload.get("from_token_id"))
        bank = await _bank_settings()
        amount_str = f"{inv.get('currency', 'INR')} {float(inv.get('amount') or 0):,.2f}"
        extra = str(payload.get("extra_message") or "").strip()
        bank_html = ""
        bank_pairs = [(l, (bank.get(k) or "").strip()) for l, k in (
            ("Bank", "bank_name"), ("Account Name", "account_name"), ("Account No", "account_number"),
            ("IFSC", "ifsc"), ("SWIFT", "swift"), ("UPI ID", "upi_id"))]
        bank_pairs = [(l, v) for l, v in bank_pairs if v]
        if bank_pairs:
            rows = "".join(
                f"<tr><td style='padding:4px 14px 4px 0;color:#64748B;font-size:12px'>{l}</td>"
                f"<td style='font-weight:700;color:#0F2042;font-size:12px'>{v}</td></tr>" for l, v in bank_pairs)
            bank_html = (
                f"<div style='margin:20px 0;padding:16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px'>"
                f"<div style='font-size:11px;font-weight:700;letter-spacing:0.1em;color:#94A3B8;margin-bottom:8px'>PREFER A DIRECT BANK TRANSFER?</div>"
                f"<table style='border-collapse:collapse'>{rows}</table></div>")
        subject = f"Payment request — {inv.get('project_name')} · {inv['invoice_no']} ({amount_str})"
        body_html = f"""<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#0F2042;border-radius:16px 16px 0 0;padding:24px 28px;text-align:left">
    <img src="{base}/projexino-logo.png" alt="Projexino" height="36" style="display:block;background:#fff;border-radius:6px;padding:4px 8px"/>
  </div>
  <div style="background:#ffffff;padding:28px;border-radius:0 0 16px 16px">
    <h2 style="margin:0 0 6px;color:#0F2042;font-size:20px">Payment request</h2>
    <p style="color:#475569;font-size:14px;line-height:1.6">Hi {inv.get('client_name') or 'there'},<br/>
    Here's your invoice for <b>{inv.get('project_name')}</b>. You can pay securely in under a minute.</p>
    <table style="width:100%;border-collapse:collapse;margin:18px 0;background:#F8FAFC;border-radius:12px">
      <tr><td style="padding:12px 18px;color:#64748B;font-size:12px">INVOICE NO</td><td style="padding:12px 18px;text-align:right;font-weight:700;color:#0F2042">{inv['invoice_no']}</td></tr>
      <tr><td style="padding:0 18px 12px;color:#64748B;font-size:12px">AMOUNT DUE</td><td style="padding:0 18px 12px;text-align:right;font-weight:700;font-size:20px;color:#F97316">{amount_str}</td></tr>
      {f'<tr><td style="padding:0 18px 12px;color:#64748B;font-size:12px">DUE DATE</td><td style="padding:0 18px 12px;text-align:right;color:#0F2042">{inv.get("due_date")}</td></tr>' if inv.get('due_date') else ''}
    </table>
    <div style="text-align:center;margin:26px 0">
      <a href="{pay_url}" style="display:inline-block;background:linear-gradient(90deg,#F97316,#FBBF24);color:#fff;padding:16px 44px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;letter-spacing:0.05em;box-shadow:0 8px 20px rgba(249,115,22,0.35)">PAY {amount_str} NOW</a>
      <div style="margin-top:10px;color:#64748B;font-size:12px">Bank Transfer · UPI · Netbanking · Cards — all on one secure page</div>
    </div>
    {bank_html}
    {f'<p style="color:#475569;font-size:13px">{extra}</p>' if extra else ''}
    <p style="color:#94A3B8;font-size:12px;margin-top:24px">The invoice PDF is attached for your records. Questions? Just reply to this email.</p>
  </div>
  <p style="text-align:center;color:#94A3B8;font-size:11px;margin-top:14px">Projexino Solutions Pvt Ltd · Hyderabad, India</p>
</div></body></html>"""
        try:
            service = _build_gmail_service(token)
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            from email.mime.application import MIMEApplication
            pdf_bytes = _build_invoice_pdf(inv, finance, bank, public_base=_public_base(request))
            for tgt in targets:
                msg = MIMEMultipart()
                msg["Subject"] = subject
                msg["From"] = f'"{token.get("from_name") or "Projexino Billing"}" <{token.get("email")}>'
                msg["To"] = tgt
                if token.get("reply_to"):
                    msg["Reply-To"] = token["reply_to"]
                msg.attach(MIMEText(body_html, "html"))
                attach = MIMEApplication(pdf_bytes, _subtype="pdf")
                attach.add_header("Content-Disposition", "attachment", filename=f"{inv['invoice_no']}.pdf")
                msg.attach(attach)
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                service.users().messages().send(userId="me", body={"raw": raw}).execute()
            now = datetime.now(timezone.utc).isoformat()
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"payment_requested_at": now, "payment_requested_to": targets,
                          "status": inv.get("status") if inv.get("status") == "paid" else "sent"}},
            )
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()), "to": targets, "subject": subject,
                "event": "payment_request_sent", "invoice_no": inv["invoice_no"], "sent_at": now,
                "sent_by_email": user.get("email", ""), "from": token.get("email"),
            })
            return {"ok": True, "sent_to": targets, "pay_url": pay_url}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Payment request email failed: %s", e)
            raise HTTPException(502, f"Send failed: {str(e)[:200]}")

    async def _collect_pdfs_zip(invoice_ids: list, receipt_ids: list, public_base: str = ""):
        import zipfile
        buf = io.BytesIO()
        bank = await _bank_settings()
        count = 0
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for iid in invoice_ids or []:
                inv = await db.invoices.find_one({"id": iid}, {"_id": 0})
                if not inv:
                    continue
                finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
                try:
                    pdf = _build_invoice_pdf(inv, finance, bank, public_base=public_base)
                except Exception:
                    pdf_b64 = inv.get("pdf_base64") or ""
                    if not pdf_b64:
                        continue
                    pdf = base64.b64decode(pdf_b64)
                zf.writestr(f"invoices/{inv.get('invoice_no', 'invoice')}.pdf", pdf)
                count += 1
            for rid in receipt_ids or []:
                rec = await db.receipts.find_one({"id": rid}, {"_id": 0})
                if not rec:
                    continue
                try:
                    pdf = await _receipt_pdf_bytes(rec)
                except Exception:
                    continue
                zf.writestr(f"receipts/{rec.get('receipt_no', 'receipt')}.pdf", pdf)
                count += 1
        if count == 0:
            raise HTTPException(400, "No documents could be built for the selection")
        buf.seek(0)
        return buf.read(), count

    @api.post("/finance/documents/zip")
    async def download_documents_zip(request: Request, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        _require_priv(user)
        data, count = await _collect_pdfs_zip(payload.get("invoice_ids") or [], payload.get("receipt_ids") or [], public_base=_public_base(request))
        fname = f"projexino-documents-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.zip"
        return Response(content=data, media_type="application/zip",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"',
                                 "X-Doc-Count": str(count)})

    @api.post("/finance/documents/zip-email")
    async def email_documents_zip(request: Request, payload: Dict[str, Any] = Body(default={}), user=Depends(get_current_user)):
        _require_admin(user)
        to_email = str(payload.get("to_email") or "").strip()
        if not to_email:
            raise HTTPException(400, "to_email is required")
        data, count = await _collect_pdfs_zip(payload.get("invoice_ids") or [], payload.get("receipt_ids") or [], public_base=_public_base(request))
        try:
            from email_module import _build_gmail_service, _branded_template
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _gmail_token_or_400(payload.get("from_token_id"))
        subject = str(payload.get("subject") or "").strip() or f"Your documents from Projexino Solutions ({count} file{'s' if count != 1 else ''})"
        message = str(payload.get("message") or "").strip() or "Please find the requested invoices and receipts attached as a ZIP archive."
        body_html = _branded_template(subject, f"<p>Hi,</p><p>{message}</p><p>The archive contains <b>{count}</b> document{'s' if count != 1 else ''}.</p>", "Visit Projexino", "https://projexino.com")
        try:
            service = _build_gmail_service(token)
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            from email.mime.application import MIMEApplication
            msg = MIMEMultipart()
            msg["Subject"] = subject
            msg["From"] = f'"{token.get("from_name") or "Projexino Billing"}" <{token.get("email")}>'
            msg["To"] = to_email
            if token.get("reply_to"):
                msg["Reply-To"] = token["reply_to"]
            msg.attach(MIMEText(body_html, "html"))
            attach = MIMEApplication(data, _subtype="zip")
            attach.add_header("Content-Disposition", "attachment",
                              filename=f"projexino-documents-{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip")
            msg.attach(attach)
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
            service.users().messages().send(userId="me", body={"raw": raw}).execute()
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()), "to": [to_email], "subject": subject,
                "event": "documents_zip_sent", "doc_count": count,
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "sent_by_email": user.get("email", ""), "from": token.get("email"),
            })
            return {"ok": True, "sent_to": to_email, "count": count}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("ZIP email failed: %s", e)
            raise HTTPException(502, f"Send failed: {str(e)[:200]}")

    @api.post("/finance/invoices/{invoice_id}/send")
    async def send_invoice(invoice_id: str, payload: InvoiceSendIn, request: Request, user=Depends(get_current_user)):
        _require_admin(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0})
        if not finance:
            raise HTTPException(404, "Finance project missing")
        emails_meta = finance.get("client_emails") or []
        if payload.to_email_ids:
            targets = [e["email"] for e in emails_meta if e["id"] in payload.to_email_ids]
        else:
            primary = [e["email"] for e in emails_meta if e.get("primary")]
            targets = primary or [e["email"] for e in emails_meta[:1]]
        if not targets:
            raise HTTPException(400, "No client emails to send to. Add one first.")
        # Resolve Gmail account — admin-selectable
        try:
            from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service, _branded_template, _render_vars
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _resolve_send_token(db, payload.from_token_id or None)
        if not token:
            raise HTTPException(400, "Gmail not connected. Connect from /app/settings first.")
        try:
            token = await _refresh_if_needed(db, token)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Gmail connection expired — please reconnect your Google account in Settings → Gmail. ({type(e).__name__})")
        # Build subject/body — use the editable `invoice_send` template if present
        tpl = await db.email_templates.find_one({"slug": "invoice_send"}, {"_id": 0})
        cur = inv.get("currency", "INR")
        sym_ = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(cur.upper(), cur.upper() + " ")
        amount_str = f"{sym_}{float(inv['amount']):,.2f}"
        variables = {
            "client_name": finance.get("client_name") or "there",
            "invoice_no": inv["invoice_no"],
            "project_name": finance.get("project_name", ""),
            "amount": amount_str,
            "due_date": inv.get("due_date") or "on receipt",
            "currency": cur,
            "company": COMPANY_NAME,
            "extra_message": payload.extra_message or "Please reach out if you have any questions.",
            "pay_now_url": "",
        }

        if tpl:
            subject = _render_vars(tpl.get("subject", ""), variables)
            body_html = _render_vars(tpl.get("body_html", ""), variables)
        else:
            subject = f"Invoice {inv['invoice_no']} — {finance.get('project_name')}"
            body_html = (
                f"<p>Hi {variables['client_name']},</p>"
                f"<p>Please find attached invoice <b>{inv['invoice_no']}</b> for the project "
                f"<b>{finance.get('project_name')}</b>.</p>"
                f"<p><b style='color:#F97316'>{amount_str}</b><br/>"
                f"<span style='color:#64748B;font-size:13px'>Due {variables['due_date']}</span></p>"
                f"<p>{variables['extra_message']}</p>"
            )
        if "<html" not in body_html.lower():
            body_html = _branded_template(subject, body_html, "View Project", "https://projexino.com")
        try:
            service = _build_gmail_service(token)
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            from email.mime.application import MIMEApplication
            sender_email = token.get("email")
            from_name = token.get("from_name") or "Projexino Billing"
            sent_records = []
            for tgt in targets:
                msg = MIMEMultipart()
                msg["Subject"] = subject
                msg["From"] = f'"{from_name}" <{sender_email}>'
                msg["To"] = tgt
                if token.get("reply_to"):
                    msg["Reply-To"] = token["reply_to"]
                msg.attach(MIMEText(body_html, "html"))
                pdf_bytes = b""
                try:
                    pdf_bytes = _build_invoice_pdf(inv, finance, await _bank_settings(), public_base=_public_base(request))
                except Exception:
                    pdf_b64 = inv.get("pdf_base64") or ""
                    if pdf_b64:
                        pdf_bytes = base64.b64decode(pdf_b64)
                attach = MIMEApplication(pdf_bytes, _subtype="pdf")
                attach.add_header("Content-Disposition", "attachment", filename=f"{inv['invoice_no']}.pdf")
                msg.attach(attach)
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
                sent_records.append({"to": tgt, "message_id": sent.get("id"), "thread_id": sent.get("threadId")})
            now = datetime.now(timezone.utc).isoformat()
            await db.invoices.update_one(
                {"id": invoice_id},
                {"$set": {"sent_at": now, "sent_to": targets, "status": "sent"},
                 "$push": {"deliveries": {"$each": sent_records}}},
            )
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()), "to": targets, "subject": subject,
                "event": "invoice_sent", "invoice_no": inv["invoice_no"], "sent_at": now,
                "sent_by_email": user.get("email", ""), "from": sender_email,
            })
            return {"ok": True, "sent_to": targets, "deliveries": sent_records, "from": sender_email}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Invoice send failed: %s", e)
            raise HTTPException(502, f"Send failed: {str(e)[:200]}")

    @api.post("/finance/projects/{fid}/reminder")
    async def send_reminder(fid: str, payload: ReminderIn, user=Depends(get_current_user)):
        _require_admin(user)
        finance = await db.project_finance.find_one({"id": fid}, {"_id": 0, "documents": 0})
        if not finance:
            raise HTTPException(404, "Not found")
        aggr = _aggregate(finance)
        if aggr["remaining"] <= 0:
            raise HTTPException(400, "No outstanding amount to remind for.")
        emails_meta = finance.get("client_emails") or []
        if payload.to_email_ids:
            targets = [e["email"] for e in emails_meta if e["id"] in payload.to_email_ids]
        else:
            primary = [e["email"] for e in emails_meta if e.get("primary")]
            targets = primary or [e["email"] for e in emails_meta[:1]]
        if not targets:
            raise HTTPException(400, "No client emails on file.")
        try:
            from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service, _branded_template, _render_vars
        except Exception as e:
            raise HTTPException(500, f"Email module unavailable: {e}")
        token = await _resolve_send_token(db, payload.from_token_id or None)
        if not token:
            raise HTTPException(400, "Gmail not connected.")
        token = await _refresh_if_needed(db, token)
        cur = finance.get("currency", "INR")
        sym_ = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(cur.upper(), cur.upper() + " ")
        outstanding_str = f"{sym_}{aggr['remaining']:,.2f}"
        variables = {
            "client_name": finance.get("client_name") or "there",
            "project_name": finance.get("project_name", ""),
            "outstanding": outstanding_str,
            "percent_paid": f"{aggr['percent_paid']:.1f}",
            "message": payload.message or "Please let us know if you have any questions or need a fresh invoice.",
            "company": COMPANY_NAME,
        }
        tpl = await db.email_templates.find_one({"slug": "payment_reminder"}, {"_id": 0})
        if tpl:
            subject = _render_vars(tpl.get("subject", ""), variables)
            body_html = _render_vars(tpl.get("body_html", ""), variables)
        else:
            subject = f"Payment reminder — {finance.get('project_name')}"
            body_html = (
                f"<p>Hi {variables['client_name']},</p>"
                f"<p>A friendly reminder: <b>{outstanding_str}</b> is currently outstanding "
                f"on the <b>{finance.get('project_name')}</b> engagement "
                f"({variables['percent_paid']}% paid so far).</p>"
                f"<p>{variables['message']}</p>"
            )
        if "<html" not in body_html.lower():
            body_html = _branded_template(subject, body_html, "Reach out", "mailto:" + (token.get('email') or ''))
        try:
            service = _build_gmail_service(token)
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            sender_email = token.get("email")
            from_name = token.get("from_name") or "Projexino Billing"
            for tgt in targets:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = f'"{from_name}" <{sender_email}>'
                msg["To"] = tgt
                if token.get("reply_to"):
                    msg["Reply-To"] = token["reply_to"]
                msg.attach(MIMEText(body_html, "html"))
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                service.users().messages().send(userId="me", body={"raw": raw}).execute()
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()), "to": targets, "subject": subject,
                "event": "payment_reminder", "finance_id": fid, "from": sender_email,
                "sent_at": datetime.now(timezone.utc).isoformat(),
                "sent_by_email": user.get("email", ""),
            })
            return {"ok": True, "sent_to": targets, "outstanding": aggr["remaining"], "from": sender_email}
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("Reminder send failed: %s", e)
            raise HTTPException(502, f"Send failed: {str(e)[:200]}")

    # ── Country / currency helpers ──────────────────────────────
    @api.get("/finance/countries")
    async def list_countries(user=Depends(get_current_user)):
        _require_priv(user)
        return [{"code": k, "currency": v} for k, v in sorted(COUNTRY_TO_CURRENCY.items())]

    @api.get("/finance/fx-rates")
    async def get_fx(user=Depends(get_current_user)):
        _require_priv(user)
        rates = await _get_fx_rates(db)
        return {"base": "INR", "rates": rates}

    @api.put("/finance/fx-rates")
    async def put_fx(body: dict, user=Depends(get_current_user)):
        _require_admin(user)
        rates = body.get("rates") or {}
        clean = {str(k).upper(): float(v) for k, v in rates.items() if v}
        await db.fx_rates.update_one(
            {"id": "inr"},
            {"$set": {"id": "inr", "rates": clean, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
        return await get_fx(user)

