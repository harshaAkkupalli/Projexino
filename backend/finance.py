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

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, EmailStr

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
    return out


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
    include_pay_link: bool = False  # admin manually opts-in to attach a Stripe Pay-Now link


class ReminderIn(BaseModel):
    to_email_ids: List[str] = []
    message: Optional[str] = ""
    from_token_id: Optional[str] = ""


# ─── PDF generation ─────────────────────────────────────────────────

PROJEXINO_LOGO = "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png"
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


def _fmt_money(amount: float, currency: str) -> str:
    sym = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency.upper(), currency.upper() + " ")
    try:
        return f"{sym}{amount:,.2f}"
    except Exception:
        return f"{sym}{amount}"


def _build_invoice_pdf(invoice: dict, finance: dict) -> bytes:
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
        topMargin=1.4 * cm, bottomMargin=1.4 * cm,
        title=invoice.get("invoice_no", "Invoice"),
        author=COMPANY_NAME,
    )
    story = []
    page_w = A4[0] - 3.0 * cm  # usable width

    # ── 1. Brand band ────────────────────────────────────────────
    try:
        import urllib.request
        with urllib.request.urlopen(PROJEXINO_LOGO, timeout=4) as resp:
            data = resp.read()
        logo = RLImage(io.BytesIO(data), width=3.8 * cm, height=1.4 * cm, kind="proportional")
    except Exception:
        logo = Paragraph("<font size=20 color='#0F2042'><b>PROJEXINO</b></font>", h_company)

    inv_no = invoice.get("invoice_no", "")
    inv_date = (invoice.get("issued_at") or "")[:10] or datetime.now(timezone.utc).date().isoformat()
    due = invoice.get("due_date") or "On receipt"

    left_block = [
        [logo],
        [Paragraph("<font size=8 color='#475569'>Design · Engineering · Strategy</font>", small)],
    ]
    left_tbl = Table(left_block, colWidths=[10 * cm], hAlign="LEFT")
    left_tbl.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))

    right_meta = Table([
        [Paragraph("INVOICE", h_invoice)],
        [Paragraph(
            f"<font size=7 color='#94A3B8'>INVOICE NO.</font>"
            f"<br/><font size=12 color='#0F2042'><b>{inv_no}</b></font>",
            ParagraphStyle("n", parent=body, alignment=TA_RIGHT))],
    ], colWidths=[7 * cm], hAlign="RIGHT")
    right_meta.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
    ]))

    header_tbl = Table([[left_tbl, right_meta]], colWidths=[10.5 * cm, 7.5 * cm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 4))
    # Brand gradient rule
    rule = Table([[""]], colWidths=[18 * cm], rowHeights=[3])
    rule.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ORANGE),
        ("LINEBELOW", (0, 0), (-1, -1), 0, ORANGE),
    ]))
    story.append(rule)
    story.append(Spacer(1, 14))

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
    story.append(Spacer(1, 12))

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
    story.append(Spacer(1, 12))

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
    story.append(Spacer(1, 14))

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
    items_tbl = Table(rows, colWidths=[0.9 * cm, 9.6 * cm, 1.6 * cm, 2.9 * cm, 3.0 * cm])
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
    totals_inner = Table([
        [Paragraph("<font size=8 color='#475569'>Subtotal</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>{_fmt_money(subtotal, cur)}</font>", money_right)],
        [Paragraph(f"<font size=8 color='#475569'>GST ({tax_pct:g}%)</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>{_fmt_money(tax, cur)}</font>", money_right)],
        [Paragraph("<font size=8 color='#475569'>Discount</font>", body),
         Paragraph(f"<font size=9 color='#0F2042'>− {_fmt_money(discount, cur)}</font>", money_right)],
        [Paragraph("<font size=10 color='white'><b>TOTAL DUE</b></font>", body),
         Paragraph(f"<font size=15 color='white'><b>{_fmt_money(total, cur)}</b></font>", money_right)],
    ], colWidths=[3.2 * cm, 3.6 * cm], hAlign="RIGHT")
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
    # Wrap totals card in a right-aligned row
    totals_row = Table([["", totals_inner]], colWidths=[11.2 * cm, 6.8 * cm])
    totals_row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(totals_row)
    story.append(Spacer(1, 14))

    # ── 7. Status callout ────────────────────────────────────────
    paid_so_far = sum(float(p.get("amount") or 0) for p in (finance.get("payments") or []))
    locked = float(finance.get("locked_budget") or 0)
    pct = (paid_so_far / locked * 100) if locked else 0
    is_paid = locked > 0 and paid_so_far >= locked
    status_color = GREEN if is_paid else ORANGE
    status_hex = "#10B981" if is_paid else "#F97316"
    status_label = "PAID IN FULL" if is_paid else f"{pct:.1f}% PAID · {_fmt_money(max(0, locked - paid_so_far), cur)} OUTSTANDING"
    callout = Table([[
        Paragraph(
            f"<font size=7.5 color='#94A3B8'><b>PROJECT STATUS</b></font>&nbsp;&nbsp;"
            f"<font size=9 color='{status_hex}'><b>● {status_label}</b></font>",
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
    story.append(Spacer(1, 12))

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
        story.append(Spacer(1, 12))

    # ── 9. Payment & legal block ─────────────────────────────────
    terms_text = (
        invoice.get("payment_terms")
        or finance.get("payment_terms")
        or DEFAULT_PAYMENT_TERMS
    )
    # Escape backslashes; ReportLab paragraphs respect simple HTML.
    legal = Paragraph(
        "<font size=7 color='#94A3B8'><b>PAYMENT TERMS</b></font><br/>"
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
    story.append(Spacer(1, 20))

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
    story.append(Spacer(1, 14))

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
        # Subtle watermark behind content
        canv.setFillColorRGB(0.97, 0.97, 0.97)
        canv.setFont(_BOLD_FONT, 90)
        canv.translate(A4[0] / 2 - 3 * cm, A4[1] / 2 - 2 * cm)
        canv.rotate(20)
        canv.drawString(0, 0, "PROJEXINO")
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
    async def create_invoice(fid: str, payload: InvoiceCreateIn, user=Depends(get_current_user)):
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
        }
        try:
            pdf = _build_invoice_pdf(invoice, finance)
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
    async def get_invoice_pdf(invoice_id: str, user=Depends(get_current_user)):
        _require_priv(user)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        pdf_b64 = inv.get("pdf_base64") or ""
        if not pdf_b64:
            # rebuild on the fly if missing
            finance = await db.project_finance.find_one({"id": inv.get("finance_id")}, {"_id": 0, "documents": 0}) or {}
            pdf = _build_invoice_pdf(inv, finance)
        else:
            pdf = base64.b64decode(pdf_b64)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{inv.get("invoice_no")}.pdf"'},
        )

    @api.post("/finance/invoices/{invoice_id}/send")
    async def send_invoice(invoice_id: str, payload: InvoiceSendIn, user=Depends(get_current_user)):
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
        token = await _refresh_if_needed(db, token)
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

        # Pay-Now link is added ONLY when admin opts in via include_pay_link
        pay_now_url = ""
        if payload.include_pay_link and inv.get("status") != "paid":
            pay_now_url = inv.get("stripe_pay_url") or ""
            if not pay_now_url:
                try:
                    import os as _os
                    stripe_key = (_os.environ.get("STRIPE_API_KEY") or "").strip()
                    public_origin = (_os.environ.get("PUBLIC_FRONTEND_URL") or "").rstrip("/")
                    if stripe_key and public_origin:
                        from emergentintegrations.payments.stripe.checkout import (
                            StripeCheckout, CheckoutSessionRequest,
                        )
                        sc = StripeCheckout(
                            api_key=stripe_key,
                            webhook_url=f"{public_origin}/api/webhook/stripe",
                        )
                        success_url = (
                            f"{public_origin}/invoice/{invoice_id}/paid"
                            f"?session_id={{CHECKOUT_SESSION_ID}}"
                        )
                        cancel_url = f"{public_origin}/invoice/{invoice_id}/paid?canceled=1"
                        req = CheckoutSessionRequest(
                            amount=float(inv["amount"]),
                            currency=cur.lower(),
                            success_url=success_url,
                            cancel_url=cancel_url,
                            metadata={
                                "invoice_id": invoice_id,
                                "invoice_no": str(inv.get("invoice_no") or ""),
                                "finance_id": str(inv.get("finance_id") or ""),
                                "project_id": str(inv.get("project_id") or ""),
                                "initiated_by": user.get("email") or "send_invoice",
                            },
                        )
                        session = await sc.create_checkout_session(req)
                        pay_now_url = session.url
                        await db.payment_transactions.insert_one({
                            "id": str(uuid.uuid4()),
                            "session_id": session.session_id,
                            "invoice_id": invoice_id,
                            "amount": float(inv["amount"]),
                            "currency": cur.upper(),
                            "metadata": req.metadata,
                            "payment_status": "initiated",
                            "status": "pending",
                            "checkout_url": session.url,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        })
                        await db.finance_activity.insert_one({
                            "id": str(uuid.uuid4()),
                            "event": "stripe_checkout_started",
                            "invoice_id": invoice_id,
                            "finance_id": inv.get("finance_id"),
                            "amount": float(inv["amount"]),
                            "currency": cur.upper(),
                            "by": user.get("email"),
                            "meta": {"session_id": session.session_id, "trigger": "send_invoice"},
                            "at": datetime.now(timezone.utc).isoformat(),
                        })
                        await db.invoices.update_one(
                            {"id": invoice_id},
                            {"$set": {
                                "stripe_pay_url": pay_now_url,
                                "stripe_session_id": session.session_id,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            }},
                        )
                except Exception as e:
                    logger.warning("Stripe link generation skipped for %s: %s", invoice_id, e)
        variables["pay_now_url"] = pay_now_url
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
        # Inject a Pay Now button (auto-appended if not already present in the template)
        if pay_now_url and "pay_now_url" not in (tpl.get("body_html", "") if tpl else ""):
            pay_btn = (
                f'<div style="margin:24px 0;text-align:center">'
                f'<a href="{pay_now_url}" '
                f'style="display:inline-block;background:linear-gradient(90deg,#F97316,#FBBF24);'
                f'color:#fff;padding:14px 36px;border-radius:999px;font-weight:700;'
                f'font-size:14px;text-decoration:none;letter-spacing:0.06em;text-transform:uppercase;'
                f'box-shadow:0 8px 20px rgba(249,115,22,0.35)">Pay {amount_str} now</a>'
                f'<div style="margin-top:8px;color:#64748B;font-size:11px">'
                f'Secure checkout · Powered by Stripe</div></div>'
            )
            body_html = body_html + pay_btn
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
                pdf_b64 = inv.get("pdf_base64") or ""
                pdf_bytes = base64.b64decode(pdf_b64) if pdf_b64 else _build_invoice_pdf(inv, finance)
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
