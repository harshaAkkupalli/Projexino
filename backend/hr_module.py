"""
PHASE D — HR Module.

Sub-modules:
  • Regulations CRUD                           — /api/hr/regulations
  • Payslips (India template) + generator      — /api/hr/payslips/*
  • Documents to sign                          — /api/hr/sign-docs/*
  • Yearly audit report                        — /api/hr/audit/*
  • Expense tracker (weekly/monthly)           — /api/hr/expenses

Access: super_admin / admin / hr  (some endpoints allow employees to view their own).

Payslip schedule: a single doc in `hr_settings.payslip_schedule` controls the
auto-run day of month. A background loop (in server.py startup) runs daily and
emits payslips for all active team members.
"""
from __future__ import annotations

import io
import os
import uuid
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List, Dict, Literal

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("projexino.hr")
PRIV_ROLES = ("super_admin", "admin", "hr")
PRIV_VIEW_ROLES = ("super_admin", "admin", "manager", "hr")


# ====================================================================
# Common helpers
# ====================================================================
def _priv(user, roles=PRIV_ROLES):
    if user.get("role") not in roles:
        raise HTTPException(403, "Not authorised")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ====================================================================
# Models
# ====================================================================
class RegulationIn(BaseModel):
    title: str = Field(min_length=1)
    category: str = "general"  # general, leave, conduct, payroll, benefits, security
    body_html: str = ""
    effective_from: Optional[str] = ""
    tags: List[str] = []


class RegulationUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    body_html: Optional[str] = None
    effective_from: Optional[str] = None
    tags: Optional[List[str]] = None
    archived: Optional[bool] = None


# --- Payslip ---
class PayslipFieldConfig(BaseModel):
    """Each payslip line item is configurable as mandatory/optional and a default formula."""
    key: str            # e.g. "basic", "hra", "special", "pf", "professional_tax", "tds"
    label: str
    type: Literal["earning", "deduction"] = "earning"
    default_percent: Optional[float] = None  # % of basic
    mandatory: bool = False
    visible: bool = True
    order: int = 0


DEFAULT_PAYSLIP_FIELDS: List[Dict] = [
    {"key": "basic", "label": "Basic", "type": "earning", "default_percent": 50.0, "mandatory": True, "visible": True, "order": 1},
    {"key": "hra", "label": "HRA (House Rent)", "type": "earning", "default_percent": 20.0, "mandatory": True, "visible": True, "order": 2},
    {"key": "special", "label": "Special Allowance", "type": "earning", "default_percent": 25.0, "mandatory": False, "visible": True, "order": 3},
    {"key": "conveyance", "label": "Conveyance", "type": "earning", "default_percent": 5.0, "mandatory": False, "visible": True, "order": 4},
    {"key": "medical", "label": "Medical", "type": "earning", "default_percent": 0.0, "mandatory": False, "visible": False, "order": 5},
    {"key": "pf", "label": "Provident Fund (PF)", "type": "deduction", "default_percent": 6.0, "mandatory": True, "visible": True, "order": 11},
    {"key": "professional_tax", "label": "Professional Tax", "type": "deduction", "default_percent": 0.4, "mandatory": True, "visible": True, "order": 12},
    {"key": "tds", "label": "TDS", "type": "deduction", "default_percent": 0.0, "mandatory": False, "visible": True, "order": 13},
    {"key": "loan", "label": "Loan recovery", "type": "deduction", "default_percent": 0.0, "mandatory": False, "visible": False, "order": 14},
]


class PayslipScheduleIn(BaseModel):
    enabled: bool = True
    day_of_month: int = Field(default=1, ge=1, le=28)  # day to auto-generate
    auto_email: bool = True
    employer_address: Optional[str] = "Projexino Solutions, India"


class PayslipFieldsIn(BaseModel):
    fields: List[PayslipFieldConfig]


class GeneratePayslipIn(BaseModel):
    employee_id: str
    month: str  # "YYYY-MM"
    gross_salary: Optional[float] = None  # override; defaults from user/team.salary
    days_paid: Optional[float] = 30
    fields_override: Optional[Dict[str, float]] = None  # per-key absolute amount override
    notes: Optional[str] = ""
    auto_email: bool = False


# --- Sign-docs ---
class SignDocIn(BaseModel):
    name: str
    body_html: str
    audience_role: Optional[str] = "all"  # all | intern | team_member | manager | hr | admin


class SignActionIn(BaseModel):
    signed_name: str  # what the user types as their "signature"


# --- Audit ---
class AuditYearIn(BaseModel):
    year: int = Field(default_factory=lambda: datetime.now(timezone.utc).year)


# --- Expenses ---
class ExpenseIn(BaseModel):
    title: str
    amount: float
    category: str = "operations"  # operations | salaries | infra | marketing | misc
    period: Literal["weekly", "monthly", "oneoff"] = "monthly"
    incurred_on: Optional[str] = None  # YYYY-MM-DD
    note: Optional[str] = ""


# ====================================================================
# PDF rendering helper (uses existing branded look)
# ====================================================================
def _amount_in_words_inr(n: float) -> str:
    """Indian Lakhs / Crores naming for amounts (e.g. 153500 → 'One Lakh Fifty Three Thousand Five Hundred')."""
    n = int(round(n))
    if n == 0:
        return "Zero"
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
             "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
             "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

    def two_digits(x: int) -> str:
        if x == 0: return ""
        if x < 20: return units[x]
        return (tens[x // 10] + (" " + units[x % 10] if x % 10 else "")).strip()

    def three_digits(x: int) -> str:
        if x == 0: return ""
        if x < 100: return two_digits(x)
        return (units[x // 100] + " Hundred" + ((" " + two_digits(x % 100)) if x % 100 else "")).strip()

    parts = []
    crore = n // 10000000
    if crore:
        parts.append(three_digits(crore) + " Crore")
        n %= 10000000
    lakh = n // 100000
    if lakh:
        parts.append(two_digits(lakh) + " Lakh")
        n %= 100000
    thousand = n // 1000
    if thousand:
        parts.append(two_digits(thousand) + " Thousand")
        n %= 1000
    rest = three_digits(n)
    if rest:
        parts.append(rest)
    return " ".join(parts).strip()


def _draw_payslip_pdf(payslip: Dict, employer_address: str = "Projexino Solutions, India") -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        # Reuse LiberationSans if available
        FONT_PATHS = [
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ]
        if os.path.exists(FONT_PATHS[0]):
            pdfmetrics.registerFont(TTFont("LSans", FONT_PATHS[0]))
            pdfmetrics.registerFont(TTFont("LSans-Bold", FONT_PATHS[1]))
            base_font = "LSans"
            bold_font = "LSans-Bold"
        else:
            base_font, bold_font = "Helvetica", "Helvetica-Bold"
    except Exception:
        base_font, bold_font = "Helvetica", "Helvetica-Bold"

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4

    # Lazy import the logo helper from xino_ai (already supports cached PNG download)
    try:
        from xino_ai import _draw_projexino_logo
    except Exception:
        _draw_projexino_logo = None

    # ─────────────────────────────────────────────────────────────
    # Header band — deep navy background + actual Projexino logo
    # ─────────────────────────────────────────────────────────────
    c.setFillColor(colors.HexColor("#0F2042"))
    c.rect(0, H - 32 * mm, W, 32 * mm, stroke=0, fill=1)
    # accent bar
    c.setFillColor(colors.HexColor("#F97316"))
    c.rect(0, H - 36 * mm, W, 1.5 * mm, stroke=0, fill=1)

    # White logo card top-left
    c.setFillColor(colors.white)
    c.roundRect(15 * mm, H - 27 * mm, 50 * mm, 17 * mm, 2 * mm, fill=1, stroke=0)
    if _draw_projexino_logo:
        _draw_projexino_logo(c, x_left=19 * mm, y_bottom=H - 24 * mm, height_mm=11 * mm)
    else:
        c.setFillColor(colors.HexColor("#F97316"))
        c.setFont(bold_font, 14)
        c.drawString(20 * mm, H - 17 * mm, "PROJEXINO")

    # Right column — payslip metadata
    c.setFillColor(colors.HexColor("#FBBF24"))
    c.setFont(bold_font, 8)
    c.drawRightString(W - 18 * mm, H - 11 * mm, "// PAYSLIP")
    c.setFillColor(colors.white)
    c.setFont(bold_font, 14)
    c.drawRightString(W - 18 * mm, H - 17 * mm, f"PAYSLIP · {payslip['month']}")
    c.setFont(base_font, 9)
    c.drawRightString(W - 18 * mm, H - 22 * mm, f"Slip No: {payslip.get('slip_no','')}")
    c.drawRightString(W - 18 * mm, H - 26 * mm, f"Generated: {payslip.get('generated_at','')[:10]}")

    # Employer name + address — directly below the navy band
    c.setFillColor(colors.HexColor("#0F2042"))
    c.setFont(bold_font, 12)
    c.drawString(18 * mm, H - 44 * mm, "PROJEXINO SOLUTIONS PRIVATE LIMITED")
    c.setFont(base_font, 8.5)
    c.setFillColor(colors.HexColor("#475569"))
    c.drawString(18 * mm, H - 48 * mm, employer_address)
    c.drawString(18 * mm, H - 52 * mm, "CIN: U72200MH2019PTC123456  ·  PAN: AAACP1234R  ·  GSTIN: 27AAACP1234R1ZK")

    # ─────────────────────────────────────────────────────────────
    # Employee + Pay period info — two columns of legal fields
    # ─────────────────────────────────────────────────────────────
    y = H - 60 * mm
    emp = payslip.get("employee", {}) or {}
    left_pairs = [
        ("Name",           emp.get("name", "")),
        ("Employee Code",  emp.get("employee_code") or emp.get("id", "")[:8].upper() or "—"),
        ("Designation",    emp.get("designation") or emp.get("role", "")),
        ("Department",     emp.get("department") or "Engineering"),
        ("Date of Joining",emp.get("joining_date") or emp.get("created_at", "")[:10] or "—"),
        ("Email",          emp.get("email", "")),
    ]
    right_pairs = [
        ("PAN",            emp.get("pan", "") or "—"),
        ("UAN",            emp.get("uan", "") or "—"),
        ("PF Number",      emp.get("pf_no", "") or "—"),
        ("ESI Number",     emp.get("esi_no", "") or "—"),
        ("Bank A/c",       emp.get("bank_account", "") or "—"),
        ("IFSC",           emp.get("ifsc", "") or "—"),
    ]
    # box around the metadata
    c.setStrokeColor(colors.HexColor("#E2E8F0"))
    c.setLineWidth(0.5)
    info_h = 6 * 6 * mm + 4 * mm
    c.roundRect(15 * mm, y - info_h + 2 * mm, W - 30 * mm, info_h, 2 * mm, fill=0, stroke=1)
    # divider
    c.line(W / 2, y - info_h + 2 * mm, W / 2, y + 2 * mm)

    label_x_l, value_x_l = 18 * mm, 50 * mm
    label_x_r, value_x_r = W / 2 + 3 * mm, W / 2 + 35 * mm
    for i, ((ll, lv), (rl, rv)) in enumerate(zip(left_pairs, right_pairs)):
        row_y = y - (i + 1) * 6 * mm + 2 * mm
        c.setFont(bold_font, 8); c.setFillColor(colors.HexColor("#64748B"))
        c.drawString(label_x_l, row_y, ll.upper())
        c.drawString(label_x_r, row_y, rl.upper())
        c.setFont(base_font, 9); c.setFillColor(colors.HexColor("#0F2042"))
        c.drawString(value_x_l, row_y, str(lv)[:38])
        c.drawString(value_x_r, row_y, str(rv)[:38])

    # ─────────────────────────────────────────────────────────────
    # Pay period strip
    # ─────────────────────────────────────────────────────────────
    pp_y = y - info_h - 4 * mm
    c.setFillColor(colors.HexColor("#FFF7ED"))
    c.rect(15 * mm, pp_y - 9 * mm, W - 30 * mm, 9 * mm, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#0F2042"))
    c.setFont(bold_font, 9)
    days_in_month = 30
    days_paid = payslip.get('days_paid', 30)
    c.drawString(20 * mm, pp_y - 6 * mm, "PAY PERIOD")
    c.setFont(base_font, 9)
    c.drawString(45 * mm, pp_y - 6 * mm, f"{payslip['month']}")
    c.setFont(bold_font, 9)
    c.drawString(80 * mm, pp_y - 6 * mm, "DAYS WORKED")
    c.setFont(base_font, 9)
    c.drawString(110 * mm, pp_y - 6 * mm, f"{days_paid} / {days_in_month}")
    c.setFont(bold_font, 9)
    c.drawString(140 * mm, pp_y - 6 * mm, "GROSS")
    c.setFont(bold_font, 9)
    c.setFillColor(colors.HexColor("#F97316"))
    c.drawRightString(W - 18 * mm, pp_y - 6 * mm, f"INR {payslip['gross_salary']:,.2f}")

    # ─────────────────────────────────────────────────────────────
    # Table — Earnings vs Deductions
    # ─────────────────────────────────────────────────────────────
    table_top = pp_y - 16 * mm
    col_left = 15 * mm
    col_right = W / 2 + 1 * mm
    col_w = (W - 30 * mm - 2 * mm) / 2  # equal halves with 2mm gutter

    # Section headers
    c.setFillColor(colors.HexColor("#F97316"))
    c.rect(col_left, table_top, col_w, 8 * mm, stroke=0, fill=1)
    c.rect(col_right, table_top, col_w, 8 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont(bold_font, 10)
    c.drawString(col_left + 4 * mm, table_top + 2.5 * mm, "EARNINGS")
    c.drawString(col_right + 4 * mm, table_top + 2.5 * mm, "DEDUCTIONS")
    c.drawRightString(col_left + col_w - 4 * mm, table_top + 2.5 * mm, "AMOUNT (INR)")
    c.drawRightString(col_right + col_w - 4 * mm, table_top + 2.5 * mm, "AMOUNT (INR)")

    earnings = [b for b in payslip["breakdown"] if b["type"] == "earning"]
    deductions = [b for b in payslip["breakdown"] if b["type"] == "deduction"]

    # Body rows (alternating row background)
    row_h = 6 * mm
    n_rows = max(len(earnings), len(deductions))
    for i in range(n_rows):
        row_y = table_top - (i + 1) * row_h
        if i % 2 == 0:
            c.setFillColor(colors.HexColor("#FFFBEB"))
            c.rect(col_left, row_y, col_w, row_h, stroke=0, fill=1)
            c.rect(col_right, row_y, col_w, row_h, stroke=0, fill=1)
        # text baseline = row_y + (row_h - cap)/2 + descender ≈ row_y + 2mm
        text_y = row_y + 2 * mm
        c.setFillColor(colors.HexColor("#1F2937"))
        c.setFont(base_font, 9)
        if i < len(earnings):
            c.drawString(col_left + 4 * mm, text_y, earnings[i]["label"])
            c.setFont(bold_font, 9)
            c.drawRightString(col_left + col_w - 4 * mm, text_y, f"{earnings[i]['amount']:,.2f}")
            c.setFont(base_font, 9)
        if i < len(deductions):
            c.drawString(col_right + 4 * mm, text_y, deductions[i]["label"])
            c.setFont(bold_font, 9)
            c.drawRightString(col_right + col_w - 4 * mm, text_y, f"{deductions[i]['amount']:,.2f}")
            c.setFont(base_font, 9)

    # Column totals — at the bottom of each column
    col_total_y = table_top - (n_rows + 1) * row_h
    c.setFillColor(colors.HexColor("#0F2042"))
    c.rect(col_left, col_total_y, col_w, row_h, stroke=0, fill=1)
    c.rect(col_right, col_total_y, col_w, row_h, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont(bold_font, 10)
    c.drawString(col_left + 4 * mm, col_total_y + 2 * mm, "TOTAL EARNINGS")
    c.drawString(col_right + 4 * mm, col_total_y + 2 * mm, "TOTAL DEDUCTIONS")
    c.drawRightString(col_left + col_w - 4 * mm, col_total_y + 2 * mm, f"{payslip['total_earnings']:,.2f}")
    c.drawRightString(col_right + col_w - 4 * mm, col_total_y + 2 * mm, f"{payslip['total_deductions']:,.2f}")

    # Net Pay highlight strip — full width, perfectly centred vertically
    net_y = col_total_y - 18 * mm
    c.setFillColor(colors.HexColor("#FFF7ED"))
    c.rect(col_left, net_y, W - 2 * col_left, 14 * mm, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#F97316"))
    c.setLineWidth(0.8)
    c.rect(col_left, net_y, W - 2 * col_left, 14 * mm, stroke=1, fill=0)
    c.setFillColor(colors.HexColor("#0F2042"))
    c.setFont(bold_font, 11)
    c.drawString(col_left + 6 * mm, net_y + 5 * mm, "NET PAY")
    c.setFont(base_font, 8)
    c.setFillColor(colors.HexColor("#64748B"))
    c.drawString(col_left + 6 * mm, net_y + 1.5 * mm, "(Total earnings − Total deductions)")
    c.setFillColor(colors.HexColor("#F97316"))
    c.setFont(bold_font, 18)
    c.drawRightString(W - col_left - 6 * mm, net_y + 4.5 * mm, f"INR {payslip['net_pay']:,.2f}")

    # Amount in words
    words = _amount_in_words_inr(payslip['net_pay'])
    c.setFillColor(colors.HexColor("#475569"))
    c.setFont(base_font, 8.5)
    c.drawString(col_left, net_y - 5 * mm, f"Amount in words: INR {words} only")

    # Notes / footer
    if payslip.get("notes"):
        c.setFillColor(colors.HexColor("#475569"))
        c.setFont(base_font, 9)
        c.drawString(col_left, net_y - 12 * mm, f"Notes: {payslip['notes']}")

    # Signature lines
    sig_y = 32 * mm
    c.setStrokeColor(colors.HexColor("#94A3B8"))
    c.setLineWidth(0.5)
    c.line(20 * mm, sig_y, 80 * mm, sig_y)
    c.line(W - 80 * mm, sig_y, W - 20 * mm, sig_y)
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont(base_font, 8)
    c.drawString(20 * mm, sig_y - 4 * mm, "Employee Signature")
    c.drawString(W - 80 * mm, sig_y - 4 * mm, "Authorised Signatory (Projexino Solutions)")

    # Legal footer
    c.setFillColor(colors.HexColor("#7C2D12"))
    c.setFont(base_font, 7)
    c.drawCentredString(W / 2, 16 * mm, "This is a computer-generated payslip. No physical signature is required for verification.")
    c.drawCentredString(W / 2, 12 * mm, "All amounts are in Indian Rupees (INR). Deductions are subject to applicable Indian labour and tax laws.")
    c.setFillColor(colors.HexColor("#F97316"))
    c.setFont(bold_font, 8)
    c.drawCentredString(W / 2, 7 * mm, "Projexino Solutions Private Limited  ·  projexino.com  ·  hello@projexino.com")
    c.showPage()
    c.save()
    return buf.getvalue()


# ====================================================================
# Routes
# ====================================================================
def register_hr_module(api: APIRouter, db, get_current_user):

    # ============== REGULATIONS ==============
    @api.get("/hr/regulations")
    async def list_regulations(user=Depends(get_current_user)):
        # All employees can read regulations
        cur = db.hr_regulations.find({}, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(500)

    @api.post("/hr/regulations")
    async def create_regulation(payload: RegulationIn, user=Depends(get_current_user)):
        _priv(user)
        doc = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "archived": False,
            "created_by": {"id": user["id"], "name": user.get("name", ""), "role": user.get("role", "")},
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.hr_regulations.insert_one(dict(doc))
        return doc

    @api.patch("/hr/regulations/{reg_id}")
    async def update_regulation(reg_id: str, payload: RegulationUpdate, user=Depends(get_current_user)):
        _priv(user)
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        updates["updated_at"] = _now_iso()
        res = await db.hr_regulations.update_one({"id": reg_id}, {"$set": updates})
        if not res.matched_count:
            raise HTTPException(404, "Regulation not found")
        return await db.hr_regulations.find_one({"id": reg_id}, {"_id": 0})

    @api.delete("/hr/regulations/{reg_id}")
    async def delete_regulation(reg_id: str, user=Depends(get_current_user)):
        _priv(user)
        await db.hr_regulations.delete_one({"id": reg_id})
        return {"ok": True}

    # ============== PAYSLIP CONFIG ==============
    @api.get("/hr/payslip-config")
    async def get_payslip_config(user=Depends(get_current_user)):
        _priv(user, PRIV_VIEW_ROLES)
        cfg = await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0})
        if not cfg:
            cfg = {
                "id": "payslip",
                "fields": DEFAULT_PAYSLIP_FIELDS,
                "schedule": {"enabled": False, "day_of_month": 1, "auto_email": True,
                             "employer_address": "Projexino Solutions, India"},
            }
        return cfg

    @api.put("/hr/payslip-config/fields")
    async def update_fields(payload: PayslipFieldsIn, user=Depends(get_current_user)):
        _priv(user)
        await db.hr_settings.update_one(
            {"id": "payslip"},
            {"$set": {"id": "payslip", "fields": [f.model_dump() for f in payload.fields], "updated_at": _now_iso()}},
            upsert=True,
        )
        return await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0})

    @api.put("/hr/payslip-config/schedule")
    async def update_schedule(payload: PayslipScheduleIn, user=Depends(get_current_user)):
        _priv(user)
        await db.hr_settings.update_one(
            {"id": "payslip"},
            {"$set": {"id": "payslip", "schedule": payload.model_dump(), "updated_at": _now_iso()}},
            upsert=True,
        )
        return await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0})

    # ============== PAYSLIP GENERATE ==============
    async def _resolve_employee(employee_id: str):
        u = await db.users.find_one({"id": employee_id}, {"_id": 0, "password_hash": 0})
        if not u:
            return None
        # Pull team record for salary/designation if any
        tm = await db.team.find_one({"email": u.get("email", "")}, {"_id": 0})
        return {
            "id": u["id"],
            "name": u.get("name", ""),
            "email": u.get("email", ""),
            "role": u.get("role", ""),
            "designation": (tm or {}).get("designation") or (tm or {}).get("role") or u.get("role", ""),
            "salary": (tm or {}).get("salary") or 0.0,
            "department": (tm or {}).get("department", ""),
        }

    def _compute_breakdown(fields: List[Dict], gross: float, override: Dict[str, float]) -> List[Dict]:
        # Anchor: basic acts as the percent-of-gross base for HRA, special etc.
        # But our fields use default_percent on GROSS for simplicity.
        out = []
        for f in fields:
            if not f.get("visible") and not f.get("mandatory"):
                continue
            k = f["key"]
            if override and k in override:
                amt = float(override[k] or 0)
            else:
                pct = float(f.get("default_percent") or 0)
                amt = round(gross * pct / 100.0, 2)
            out.append({"key": k, "label": f["label"], "type": f["type"], "amount": amt})
        return out

    async def _next_slip_no(db) -> str:
        ctr = await db.hr_payslip_counter.find_one_and_update(
            {"id": "counter"}, {"$inc": {"value": 1}}, upsert=True, return_document=True
        ) or {}
        n = (ctr.get("value") or 1)
        return f"PXP-{datetime.now(timezone.utc).year}-{n:05d}"

    @api.post("/hr/payslips/generate")
    async def generate_payslip(payload: GeneratePayslipIn, user=Depends(get_current_user)):
        _priv(user)
        emp = await _resolve_employee(payload.employee_id)
        if not emp:
            raise HTTPException(404, "Employee not found")
        cfg = await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0}) or {}
        fields = cfg.get("fields") or DEFAULT_PAYSLIP_FIELDS
        gross = payload.gross_salary or float(emp.get("salary") or 0.0)
        if gross <= 0:
            raise HTTPException(400, "No salary configured for this employee. Set in Team module or pass gross_salary.")
        breakdown = _compute_breakdown(fields, gross, payload.fields_override or {})
        total_earnings = sum(b["amount"] for b in breakdown if b["type"] == "earning")
        total_deductions = sum(b["amount"] for b in breakdown if b["type"] == "deduction")
        net_pay = round(total_earnings - total_deductions, 2)

        slip_no = await _next_slip_no(db)
        doc = {
            "id": str(uuid.uuid4()),
            "slip_no": slip_no,
            "employee": emp,
            "month": payload.month,
            "days_paid": payload.days_paid or 30,
            "gross_salary": round(gross, 2),
            "breakdown": breakdown,
            "total_earnings": round(total_earnings, 2),
            "total_deductions": round(total_deductions, 2),
            "net_pay": net_pay,
            "notes": payload.notes or "",
            "generated_at": _now_iso(),
            "generated_by": {"id": user["id"], "name": user.get("name", ""), "role": user.get("role", "")},
        }
        await db.hr_payslips.insert_one(dict(doc))

        # Auto-email if requested
        if payload.auto_email:
            try:
                pdf_bytes = _draw_payslip_pdf(doc, employer_address=(cfg.get("schedule") or {}).get("employer_address", "Projexino Solutions, India"))
                # Send via Gmail OAuth (best-effort)
                from email_module import _send_via_gmail_with_attachment  # may exist; else fallback to notify
                try:
                    await _send_via_gmail_with_attachment(  # type: ignore
                        db, to_email=emp["email"], subject=f"Your Projexino payslip — {doc['month']} ({slip_no})",
                        html_body=_payslip_email_html(doc),
                        attachment_bytes=pdf_bytes, attachment_name=f"Projexino_Payslip_{doc['month']}_{slip_no}.pdf",
                    )
                except Exception:
                    from notif_engine import notify
                    await notify(
                        db, event="payslip_generated",
                        user_id=emp["id"], user_email=emp["email"],
                        title=f"Payslip ready — {doc['month']} ({slip_no})",
                        message=f"Net pay INR {doc['net_pay']:.2f}",
                        link="/app/dashboard",
                        variables={"name": emp.get("name", ""), "amount": f"{doc['net_pay']:.2f}",
                                   "invoice_number": slip_no, "currency": "INR ", "due_date": doc["month"],
                                   "subject": f"Payslip — {doc['month']}", "body_html": _payslip_email_html(doc)},
                        triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                    )
            except Exception:
                logger.exception("Payslip email send failed")
        return doc

    @api.get("/hr/payslips")
    async def list_payslips(employee_id: Optional[str] = None, month: Optional[str] = None,
                            user=Depends(get_current_user)):
        # Employees can list only their own
        q = {}
        if user.get("role") not in PRIV_VIEW_ROLES:
            q["employee.id"] = user["id"]
        elif employee_id:
            q["employee.id"] = employee_id
        if month:
            q["month"] = month
        cur = db.hr_payslips.find(q, {"_id": 0}).sort("generated_at", -1)
        return await cur.to_list(500)

    @api.get("/hr/payslips/{slip_id}/pdf")
    async def payslip_pdf(slip_id: str, user=Depends(get_current_user)):
        doc = await db.hr_payslips.find_one({"id": slip_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Payslip not found")
        # Owner OR priv
        if user.get("role") not in PRIV_VIEW_ROLES and doc["employee"]["id"] != user["id"]:
            raise HTTPException(403, "Not your payslip")
        cfg = await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0}) or {}
        addr = (cfg.get("schedule") or {}).get("employer_address", "Projexino Solutions, India")
        pdf = _draw_payslip_pdf(doc, employer_address=addr)
        return StreamingResponse(
            io.BytesIO(pdf), media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="Projexino_Payslip_{doc["month"]}_{doc["slip_no"]}.pdf"'}
        )

    # ============== DOCUMENTS TO SIGN ==============
    @api.get("/hr/sign-docs")
    async def list_sign_docs(user=Depends(get_current_user)):
        cur = db.hr_sign_docs.find({}, {"_id": 0}).sort("created_at", -1)
        docs = await cur.to_list(500)
        # Add my-signed-status field
        for d in docs:
            d["i_have_signed"] = any(s.get("user_id") == user["id"] for s in d.get("signatures") or [])
        return docs

    @api.post("/hr/sign-docs")
    async def create_sign_doc(payload: SignDocIn, user=Depends(get_current_user)):
        _priv(user)
        doc = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "body_html": payload.body_html,
            "audience_role": payload.audience_role or "all",
            "signatures": [],
            "created_by": {"id": user["id"], "name": user.get("name", ""), "role": user.get("role", "")},
            "created_at": _now_iso(),
        }
        await db.hr_sign_docs.insert_one(dict(doc))
        return doc

    @api.post("/hr/sign-docs/{doc_id}/sign")
    async def sign_doc(doc_id: str, payload: SignActionIn, user=Depends(get_current_user)):
        d = await db.hr_sign_docs.find_one({"id": doc_id}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Doc not found")
        if any(s.get("user_id") == user["id"] for s in d.get("signatures") or []):
            raise HTTPException(400, "You've already signed this document")
        sig = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
            "typed_signature": payload.signed_name,
            "signed_at": _now_iso(),
        }
        await db.hr_sign_docs.update_one(
            {"id": doc_id},
            {"$push": {"signatures": sig}, "$set": {"updated_at": _now_iso()}},
        )
        return {"ok": True, "signature": sig}

    @api.delete("/hr/sign-docs/{doc_id}")
    async def delete_sign_doc(doc_id: str, user=Depends(get_current_user)):
        _priv(user)
        await db.hr_sign_docs.delete_one({"id": doc_id})
        return {"ok": True}

    # ============== AUDIT ==============
    @api.get("/hr/audit/{year}")
    async def audit_report(year: int, user=Depends(get_current_user)):
        _priv(user)
        start = datetime(year, 1, 1, tzinfo=timezone.utc).isoformat()
        end = datetime(year + 1, 1, 1, tzinfo=timezone.utc).isoformat()
        # Aggregate counts
        users_total = await db.users.count_documents({})
        team_total = await db.team.count_documents({})
        interns_total = await db.interns.count_documents({})
        leads_total = await db.leads.count_documents({})
        invoices_year = await db.invoices.count_documents({"issue_date": {"$gte": start, "$lt": end}})
        payslips_year = await db.hr_payslips.count_documents({"generated_at": {"$gte": start, "$lt": end}})
        expenses_cur = db.hr_expenses.find({"incurred_on": {"$gte": start[:10], "$lt": end[:10]}}, {"_id": 0})
        expenses = await expenses_cur.to_list(5000)
        total_expense = round(sum(float(e.get("amount") or 0) for e in expenses), 2)
        # Per month
        month_buckets: Dict[str, Dict[str, float]] = {}
        for m in range(1, 13):
            month_buckets[f"{year}-{m:02d}"] = {"expense": 0.0, "payslip_total": 0.0}
        for e in expenses:
            d = (e.get("incurred_on") or "")[:7]
            if d in month_buckets:
                month_buckets[d]["expense"] += float(e.get("amount") or 0)
        payslips_cur = db.hr_payslips.find({"generated_at": {"$gte": start, "$lt": end}}, {"_id": 0})
        ps_total = 0.0
        async for ps in payslips_cur:
            m = ps.get("month")
            if m in month_buckets:
                month_buckets[m]["payslip_total"] += float(ps.get("net_pay") or 0)
            ps_total += float(ps.get("net_pay") or 0)
        return {
            "year": year,
            "totals": {
                "users": users_total, "team": team_total, "interns": interns_total,
                "leads": leads_total, "invoices": invoices_year, "payslips": payslips_year,
                "expense_inr": total_expense, "payslip_inr": round(ps_total, 2),
            },
            "monthly": [{"month": k, **v} for k, v in sorted(month_buckets.items())],
        }

    # ============== EXPENSES ==============
    @api.get("/hr/expenses")
    async def list_expenses(period: Optional[str] = None, user=Depends(get_current_user)):
        _priv(user, PRIV_VIEW_ROLES)
        q: Dict = {}
        if period:
            q["period"] = period
        cur = db.hr_expenses.find(q, {"_id": 0}).sort("incurred_on", -1)
        return await cur.to_list(2000)

    @api.post("/hr/expenses")
    async def add_expense(payload: ExpenseIn, user=Depends(get_current_user)):
        _priv(user)
        doc = {
            "id": str(uuid.uuid4()),
            **payload.model_dump(),
            "incurred_on": payload.incurred_on or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "created_by": {"id": user["id"], "name": user.get("name", ""), "role": user.get("role", "")},
            "created_at": _now_iso(),
        }
        await db.hr_expenses.insert_one(dict(doc))
        return doc

    @api.delete("/hr/expenses/{expense_id}")
    async def delete_expense(expense_id: str, user=Depends(get_current_user)):
        _priv(user)
        await db.hr_expenses.delete_one({"id": expense_id})
        return {"ok": True}

    @api.get("/hr/expenses/summary")
    async def expense_summary(user=Depends(get_current_user)):
        _priv(user, PRIV_VIEW_ROLES)
        today = date.today()
        week_start = (today - timedelta(days=7)).isoformat()
        month_start = today.replace(day=1).isoformat()
        cur = db.hr_expenses.find({}, {"_id": 0})
        all_e = await cur.to_list(5000)
        wk = sum(float(e.get("amount") or 0) for e in all_e if (e.get("incurred_on") or "") >= week_start)
        mo = sum(float(e.get("amount") or 0) for e in all_e if (e.get("incurred_on") or "") >= month_start)
        by_cat: Dict[str, float] = {}
        for e in all_e:
            by_cat[e.get("category", "misc")] = by_cat.get(e.get("category", "misc"), 0) + float(e.get("amount") or 0)
        return {"week": round(wk, 2), "month": round(mo, 2), "by_category": by_cat, "count": len(all_e)}


def _payslip_email_html(doc: Dict) -> str:
    return (
        f"<p>Hi <b>{doc['employee'].get('name','')}</b>,</p>"
        f"<p>Your payslip for <b>{doc['month']}</b> ({doc['slip_no']}) is ready. "
        f"Net Pay: <b style='color:#F97316'>INR {doc['net_pay']:.2f}</b>.</p>"
        f"<p>PDF attached. You can also download it anytime from your portal under <i>HR → Payslips</i>.</p>"
        f"<p>Regards,<br/><b>Projexino HR</b></p>"
    )


# ====================================================================
# Background loop — auto-generate monthly payslips on configured day
# ====================================================================
async def payslip_scheduler_loop(db, interval_seconds: int = 3600):
    """Run hourly; if today is the configured day and we haven't run for this month, generate for everyone."""
    import asyncio
    while True:
        try:
            cfg = await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0}) or {}
            sched = cfg.get("schedule") or {}
            if sched.get("enabled"):
                today = datetime.now(timezone.utc)
                if today.day == int(sched.get("day_of_month") or 1):
                    month = today.strftime("%Y-%m")
                    # Check if we already ran for this month
                    existing = await db.hr_payslips.find_one({"month": month, "auto": True}, {"_id": 0})
                    if not existing:
                        await _bulk_generate(db, month=month, auto_email=bool(sched.get("auto_email", True)))
        except Exception:
            logger.exception("payslip_scheduler_loop error")
        await asyncio.sleep(interval_seconds)


async def _bulk_generate(db, month: str, auto_email: bool):
    cfg = await db.hr_settings.find_one({"id": "payslip"}, {"_id": 0}) or {}
    fields = cfg.get("fields") or DEFAULT_PAYSLIP_FIELDS
    team_cur = db.team.find({"status": "active"}, {"_id": 0})
    team = await team_cur.to_list(2000)
    for tm in team:
        u = await db.users.find_one({"email": tm.get("email", "").lower()}, {"_id": 0})
        if not u:
            continue
        # Per-employee idempotency: skip if a payslip for this employee+month already exists
        existing_emp = await db.hr_payslips.find_one(
            {"employee.id": u["id"], "month": month}, {"_id": 0, "id": 1}
        )
        if existing_emp:
            continue
        gross = float(tm.get("salary") or 0)
        if gross <= 0:
            continue
        # Compute & insert directly (don't recurse over the endpoint)
        breakdown = []
        for f in fields:
            if not f.get("visible") and not f.get("mandatory"):
                continue
            pct = float(f.get("default_percent") or 0)
            amt = round(gross * pct / 100.0, 2)
            breakdown.append({"key": f["key"], "label": f["label"], "type": f["type"], "amount": amt})
        te = sum(b["amount"] for b in breakdown if b["type"] == "earning")
        td = sum(b["amount"] for b in breakdown if b["type"] == "deduction")
        ctr = await db.hr_payslip_counter.find_one_and_update(
            {"id": "counter"}, {"$inc": {"value": 1}}, upsert=True, return_document=True
        ) or {}
        slip_no = f"PXP-{datetime.now(timezone.utc).year}-{(ctr.get('value') or 1):05d}"
        doc = {
            "id": str(uuid.uuid4()),
            "slip_no": slip_no,
            "employee": {
                "id": u["id"], "name": u.get("name", ""), "email": u.get("email", ""),
                "role": u.get("role", ""), "designation": tm.get("designation") or tm.get("role", ""),
                "salary": gross, "department": tm.get("department", ""),
            },
            "month": month, "days_paid": 30, "gross_salary": round(gross, 2),
            "breakdown": breakdown, "total_earnings": round(te, 2),
            "total_deductions": round(td, 2), "net_pay": round(te - td, 2),
            "notes": "Auto-generated by Projexino scheduler",
            "generated_at": _now_iso(),
            "generated_by": {"id": "system", "name": "Projexino Scheduler", "role": "system"},
            "auto": True,
        }
        await db.hr_payslips.insert_one(dict(doc))
        if auto_email:
            try:
                from notif_engine import notify
                await notify(
                    db, event="payslip_generated",
                    user_id=u["id"], user_email=u["email"],
                    title=f"Payslip — {month}",
                    message=f"Net pay INR {doc['net_pay']:.2f}",
                    link="/app/dashboard",
                    variables={"name": u.get("name", ""), "subject": f"Payslip — {month}",
                               "body_html": _payslip_email_html(doc)},
                    triggered_by={"name": "system", "email": ""},
                )
            except Exception:
                pass
