"""
onboarding.py — HR Onboarding Engine.

When HR creates a new-hire onboarding record:
  1. We generate a branded Offer Letter PDF (reportlab) and store it as a base64 asset
     on the record (downloadable via /api/hr/onboarding/{id}/offer-letter.pdf).
  2. We calculate the prorated first paycheck based on the start_date vs. days-in-month.
  3. We auto-assign a department-specific task template (creates rows in `tasks` collection
     owned by the assigned manager, linked back to the onboarding record).
  4. We create a portal user account with a randomly-generated dummy password,
     email a welcome message containing the temp creds, and store the dummy
     password back on the record so admins can copy it for testing.

Storage:
  • onboarding_records {id, name, email, role, designation, department, start_date,
                        base_salary, currency, manager_email, mentor_email, status,
                        offer_letter_pdf_b64, offer_letter_generated_at, prorated_first_pay,
                        prorated_calc {days_worked, days_in_month, rate}, task_ids,
                        portal_user_id, dummy_password, account_created,
                        created_at, created_by, updated_at}
  • Status flow: kickoff → docs_pending → tasks_pending → completed | cancelled
"""
from __future__ import annotations

import base64
import calendar as _cal
import html as _html
import io
import os
import secrets
import string
import uuid
from datetime import datetime, date, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

PRIV_ROLES = {"super_admin", "admin", "hr", "manager"}

# ──────────────────────────────────────────────────────────────────────
# Department task templates — auto-assigned to every new hire on "Hired"
# ──────────────────────────────────────────────────────────────────────
DEPT_TASK_TEMPLATES: Dict[str, List[Dict[str, Any]]] = {
    "engineering": [
        {"title": "Provision laptop · GitHub · cloud accounts", "priority": "high", "due_offset_days": 1},
        {"title": "Complete local dev-environment setup (clone repo, run on-boarding script)", "priority": "high", "due_offset_days": 2},
        {"title": "Read Engineering Handbook + Coding Standards", "priority": "medium", "due_offset_days": 3},
        {"title": "Pair with mentor on your first PR (any tiny fix)", "priority": "high", "due_offset_days": 5},
        {"title": "Architecture deep-dive with your tech lead", "priority": "medium", "due_offset_days": 7},
        {"title": "Ship your first staged feature behind a flag", "priority": "high", "due_offset_days": 14},
    ],
    "design": [
        {"title": "Get Figma · brand-kit · stock-photo access", "priority": "high", "due_offset_days": 1},
        {"title": "Review Projexino brand & design system", "priority": "high", "due_offset_days": 2},
        {"title": "Shadow a design review with the team", "priority": "medium", "due_offset_days": 4},
        {"title": "Audit one landing page, ship 3 improvements", "priority": "medium", "due_offset_days": 7},
        {"title": "Deliver first sprint design tickets", "priority": "high", "due_offset_days": 14},
    ],
    "sales": [
        {"title": "Get CRM (Outreach Hub) access + sales mailbox", "priority": "high", "due_offset_days": 1},
        {"title": "Pipeline walkthrough with your manager", "priority": "high", "due_offset_days": 2},
        {"title": "Watch top 5 discovery-call recordings", "priority": "medium", "due_offset_days": 3},
        {"title": "Shadow 3 live customer calls", "priority": "high", "due_offset_days": 7},
        {"title": "Own your first 10-lead outbound sequence", "priority": "high", "due_offset_days": 14},
    ],
    "marketing": [
        {"title": "Access blog · LinkedIn queue · newsletter studio", "priority": "high", "due_offset_days": 1},
        {"title": "Read positioning + ICP doc, write 1-pager response", "priority": "medium", "due_offset_days": 3},
        {"title": "Ship first blog draft using AI assist", "priority": "medium", "due_offset_days": 7},
        {"title": "Schedule first LinkedIn campaign", "priority": "high", "due_offset_days": 10},
    ],
    "hr": [
        {"title": "Review all HR policies, signing pending docs", "priority": "high", "due_offset_days": 1},
        {"title": "Set up your HR & Leave module access", "priority": "high", "due_offset_days": 2},
        {"title": "Conduct one shadow interview with senior HR", "priority": "medium", "due_offset_days": 7},
    ],
    "operations": [
        {"title": "Access finance + invoicing modules", "priority": "high", "due_offset_days": 1},
        {"title": "Walkthrough on vendor management and SOPs", "priority": "high", "due_offset_days": 3},
        {"title": "Own a small process improvement initiative", "priority": "medium", "due_offset_days": 14},
    ],
    "default": [
        {"title": "Complete employment paperwork & company-policy sign-off", "priority": "high", "due_offset_days": 1},
        {"title": "Meet your manager and team (1:1s scheduled)", "priority": "high", "due_offset_days": 2},
        {"title": "Complete the company-wide on-boarding course", "priority": "medium", "due_offset_days": 5},
        {"title": "Ship your first deliverable", "priority": "high", "due_offset_days": 14},
    ],
}


# ──────────────────────────────────────────────────────────────────────
# Pydantic
# ──────────────────────────────────────────────────────────────────────
class OnboardingIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    role: str = Field("team_member", max_length=40)           # portal role
    designation: str = Field("", max_length=80)               # title
    department: str = Field("default", max_length=40)
    start_date: str = Field(..., description="ISO YYYY-MM-DD")
    base_salary: float = Field(..., gt=0)
    currency: str = Field("INR", max_length=4)
    manager_email: Optional[EmailStr] = None
    mentor_email: Optional[EmailStr] = None
    notes: Optional[str] = ""

    @field_validator("manager_email", "mentor_email", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class OnboardingPatch(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    manager_email: Optional[EmailStr] = None
    mentor_email: Optional[EmailStr] = None

    @field_validator("manager_email", "mentor_email", mode="before")
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_date(s: str) -> date:
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception as e:
        raise HTTPException(400, f"Invalid start_date '{s}', expected YYYY-MM-DD") from e


def _prorated_first_paycheck(base_salary: float, start: date) -> Dict[str, Any]:
    """Salary × (days_remaining_in_month / total_days_in_month). Inclusive of start day."""
    days_in_month = _cal.monthrange(start.year, start.month)[1]
    days_worked = days_in_month - start.day + 1
    rate = days_worked / days_in_month
    amount = round(base_salary * rate, 2)
    return {
        "amount": amount,
        "days_worked": days_worked,
        "days_in_month": days_in_month,
        "rate_pct": round(rate * 100, 2),
        "start_date": start.isoformat(),
    }


def _gen_dummy_password(length: int = 12) -> str:
    """Generate a strong but human-typable temp password.

    Format: 8 alphanumerics + '@' + 3 digits → 12 chars, always contains an
    uppercase letter, a lowercase letter, a digit, and a symbol so it passes
    every common password-policy filter.
    """
    alpha = string.ascii_letters + string.digits
    base = "".join(secrets.choice(alpha) for _ in range(max(8, length - 4)))
    # Guarantee at least one upper/lower/digit
    return f"{base[0].upper()}{base[1].lower()}{base[2:]}@{secrets.randbelow(900) + 100}"


async def _create_portal_user(db, rec: Dict[str, Any], dummy_pw: str, actor: Dict[str, Any]) -> tuple[Optional[str], bool, str]:
    """Insert a row into `users` so the new hire can sign in, and email them.

    Returns (user_id, created_new). `created_new=False` means the email already
    mapped to an existing portal user and we did NOT touch their password.
    """
    import logging
    log = logging.getLogger("onboarding")
    email = (rec.get("email") or "").lower().strip()
    if not email:
        return None, False, ""
    existing = await db.users.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        return existing.get("id"), False, ""
    try:
        from rbac import _hash as _hash_pw   # reuse the project's hasher
    except Exception as e:
        log.exception("rbac._hash import failed during onboarding user creation: %s", e)
        return None, False, ""
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": rec.get("name", ""),
        "role": rec.get("role", "team_member"),
        "is_primary_super_admin": False,
        "password_hash": _hash_pw(dummy_pw),
        "designation": rec.get("designation") or "",
        "phone": "",
        "reporting_manager_id": "",
        "reporting_manager_email": rec.get("manager_email") or "",
        "reporting_manager_name": "",
        "route_comms_to_manager": False,
        "created_at": _now(),
        "created_by": actor.get("email"),
        "created_by_name": actor.get("name", ""),
        "force_password_reset": True,
        "source": "hr_onboarding",
        "onboarding_id": rec.get("id"),
    }
    await db.users.insert_one(user_doc)
    # Fire welcome email (reuses the Phase E helper used by /rbac/admins).
    try:
        from phase_e import welcome_user
        email_error = await welcome_user(
            db,
            user={"id": user_id, "name": rec.get("name", ""), "email": email,
                  "designation": rec.get("designation") or ""},
            temp_password=dummy_pw,
            role=rec.get("role", "team_member"),
            manager={"name": actor.get("name", "HR"), "email": actor.get("email", "")},
        ) or ""
    except Exception as e:
        email_error = str(e)[:300]
    if email_error and ("deleted_client" in email_error or "invalid_grant" in email_error):
        email_error = ("Gmail connection is broken (Google OAuth client deleted/expired). "
                       "Reconnect Gmail in Settings → Email with valid Google credentials.")
    return user_id, True, email_error


def _logo_data_uri() -> str:
    for p in (os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "projexino-logo.png"),
              "/app/frontend/public/projexino-logo.png"):
        try:
            with open(p, "rb") as f:
                return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")
        except Exception:
            continue
    return ""


OFFER_DEFAULT_BENEFITS = [
    "Health insurance coverage as per company policy.",
    "Paid leave and public holidays in line with the Projexino leave policy.",
    "Learning & professional development support.",
    "Performance-based reviews with a defined growth path.",
]

OFFER_EDITABLE_KEYS = {"intro", "designation", "department", "start_date", "salary_line",
                       "first_pay_line", "reporting_to", "employment_type",
                       "benefits", "terms", "acceptance"}


def _offer_letter_content(rec: Dict[str, Any]) -> Dict[str, Any]:
    """Effective offer-letter content = computed defaults + saved custom overrides."""
    designation = rec.get("designation") or (rec.get("role", "") or "").replace("_", " ").title()
    dept = (rec.get("department") or "").title()
    start = rec.get("start_date", "")
    currency = rec.get("currency", "INR")
    try:
        salary = f"{float(rec.get('base_salary', 0)):,.2f}"
    except (TypeError, ValueError):
        salary = str(rec.get("base_salary", ""))
    pro = rec.get("prorated_first_pay") or {}
    try:
        pro_amt = f"{float(pro.get('amount', 0)):,.2f}"
    except (TypeError, ValueError):
        pro_amt = str(pro.get("amount", ""))
    pro_days = f"{pro.get('days_worked', '?')} of {pro.get('days_in_month', '?')} working days"
    manager = rec.get("manager_email") or "To be assigned"
    defaults = {
        "intro": (f"We are pleased to offer you the position of {designation} at Projexino Solutions. "
                  "We were impressed with your background and experience, and we are confident that your "
                  "skills and energy will be an excellent addition to our team."),
        "designation": designation,
        "department": dept or "—",
        "start_date": start,
        "salary_line": f"{currency} {salary} per month, paid monthly",
        "first_pay_line": f"{currency} {pro_amt} ({pro_days})",
        "reporting_to": manager,
        "employment_type": "Full-time",
        "benefits": list(OFFER_DEFAULT_BENEFITS),
        "terms": (f"This position is a full-time role. You will report to {manager}. Your employment with "
                  "Projexino is, at all times, subject to company policies communicated to you during "
                  "onboarding, and either party may terminate the employment by providing notice as per the "
                  "applicable notice period. This offer supersedes any prior discussions or representations "
                  "regarding the terms of your employment."),
        "acceptance": (f"To confirm your acceptance of this offer, please sign below and return this letter "
                       f"on or before your start date, {start}. Your full onboarding checklist and welcome kit "
                       "are waiting for you in the Projexino portal — we look forward to having you on board."),
    }
    custom = rec.get("offer_letter_custom") or {}
    out = dict(defaults)
    for k, v in custom.items():
        if k not in OFFER_EDITABLE_KEYS:
            continue
        if k == "benefits":
            if isinstance(v, list):
                cleaned = [str(x).strip() for x in v if str(x).strip()]
                if cleaned:
                    out["benefits"] = cleaned
        elif isinstance(v, str) and v.strip():
            out[k] = v.strip()
    return out


def _render_offer_letter_pdf(rec: Dict[str, Any]) -> bytes:
    """Branded A4 offer letter (WeasyPrint) — official Projexino logo,
    formal letter structure: To block, Position Details, Benefits,
    Employment Terms, Acceptance, signatures."""
    from weasyprint import HTML

    esc = _html.escape
    name = esc(rec.get("name", ""))
    first = esc((rec.get("name", "").strip().split(" ") or [""])[0])
    content = _offer_letter_content(rec)
    designation = esc(content["designation"])
    dept = esc(content["department"])
    start = esc(content["start_date"])
    salary_line = esc(content["salary_line"])
    first_pay_line = esc(content["first_pay_line"])
    manager = esc(content["reporting_to"])
    employment_type = esc(content["employment_type"])
    intro = esc(content["intro"])
    terms = esc(content["terms"])
    acceptance = esc(content["acceptance"])
    benefits_html = "".join(f"<li>{esc(b)}</li>" for b in content["benefits"])
    email = esc(rec.get("email", ""))
    issued = datetime.now(timezone.utc).strftime("%d %b %Y")
    ref = f"ONB-{(rec.get('id') or '')[:8].upper()}"
    logo = _logo_data_uri()
    logo_html = (f'<img src="{logo}" style="height:44px;width:auto"/>' if logo
                 else '<div style="font-size:20pt;font-weight:800;color:#0F2042">PROJEXINO</div>')

    html_str = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 18mm 20mm 18mm;
  @bottom-left  {{ content: "Projexino Solutions · hello@projexino.com · projexino.com"; font-size: 7.5pt; color: #94A3B8; }}
  @bottom-right {{ content: "Ref: {ref} · Page " counter(page) " of " counter(pages); font-size: 7.5pt; color: #94A3B8; }}
}}
body {{ font-family: 'Helvetica','Arial',sans-serif; color:#334155; font-size:9.5pt; line-height:1.5; }}
.letterhead {{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #F97316; padding-bottom:12px; }}
.letterhead .co {{ text-align:right; font-size:8pt; color:#64748B; line-height:1.5; }}
.letterhead .co .nm {{ font-weight:700; color:#0F2042; font-size:9.5pt; }}
.doc-meta {{ display:flex; justify-content:space-between; margin-top:14px; font-size:9pt; color:#64748B; }}
.doc-meta .badge {{ background:#FFF7ED; color:#C2410C; font-weight:700; letter-spacing:.14em; font-size:8pt; padding:3px 12px; border-radius:99px; text-transform:uppercase; }}
.to-block {{ margin-top:16px; }}
.to-block .lbl {{ font-size:7.5pt; letter-spacing:.24em; color:#F97316; font-weight:700; text-transform:uppercase; }}
.to-block .nm {{ font-weight:700; color:#0F2042; font-size:11.5pt; margin-top:2px; }}
.to-block .em {{ font-size:9pt; color:#64748B; }}
h2 {{ font-size:8.5pt; letter-spacing:.2em; text-transform:uppercase; color:#F97316; margin:14px 0 4px; }}
p {{ margin: 6px 0; text-align: justify; }}
table.terms {{ width:100%; border-collapse:collapse; margin:4px 0; }}
table.terms td {{ padding:4px 10px 4px 0; vertical-align:top; font-size:9.5pt; border-bottom:1px solid #F1F5F9; }}
table.terms td.k {{ width:52mm; color:#64748B; text-transform:uppercase; font-size:8pt; letter-spacing:.06em; padding-top:6px; }}
table.terms td.v {{ font-weight:700; color:#0F2042; }}
ul.benefits {{ margin:2px 0 0 0; padding-left:16px; }}
ul.benefits li {{ margin:2px 0; }}
.sigs {{ margin-top:22px; display:flex; justify-content:space-between; page-break-inside:avoid; }}
.sig {{ width:70mm; }}
.sig .line {{ border-bottom:1.4px solid #94A3B8; height:12mm; }}
.sig .who {{ font-size:8pt; color:#64748B; margin-top:3px; }}
.sig .nm {{ font-weight:700; color:#0F2042; font-size:10pt; }}
.salut {{ margin-top:14px; font-weight:700; color:#0F2042; font-size:11pt; }}
</style></head><body>
<div class="letterhead">
  <div>{logo_html}
    <div style="font-size:7.5pt;color:#64748B;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">Engineering studios · Dedicated teams · AI workflows</div>
  </div>
  <div class="co">
    <div class="nm">Projexino Solutions Pvt Ltd</div>
    <div>hello@projexino.com · projexino.com</div>
  </div>
</div>
<div class="doc-meta">
  <span class="badge">Offer Letter</span>
  <span>Issued · {issued}</span>
</div>
<div class="to-block">
  <div class="lbl">// To</div>
  <div class="nm">{name}</div>
  <div class="em">{email}</div>
</div>
<div class="salut">Dear {first},</div>
<p>{intro}</p>

<h2>// Position Details</h2>
<table class="terms">
  <tr><td class="k">Job Title</td><td class="v">{designation}</td></tr>
  <tr><td class="k">Department</td><td class="v">{dept}</td></tr>
  <tr><td class="k">Start Date</td><td class="v">{start}</td></tr>
  <tr><td class="k">Base Salary</td><td class="v">{salary_line}</td></tr>
  <tr><td class="k">First (Prorated) Paycheck</td><td class="v">{first_pay_line}</td></tr>
  <tr><td class="k">Reporting To</td><td class="v">{manager}</td></tr>
  <tr><td class="k">Employment Type</td><td class="v">{employment_type}</td></tr>
</table>

<h2>// Benefits</h2>
<ul class="benefits">{benefits_html}</ul>

<h2>// Employment Terms</h2>
<p>{terms}</p>

<h2>// Acceptance</h2>
<p>{acceptance}</p>

<div class="sigs">
  <div class="sig">
    <div class="line"></div>
    <div class="who">Candidate signature &amp; date</div>
    <div class="nm">{name}</div>
  </div>
  <div class="sig">
    <div class="line"></div>
    <div class="who">For Projexino Solutions · HR</div>
    <div class="nm">People Operations</div>
  </div>
</div>
</body></html>"""
    return HTML(string=html_str).write_pdf()


# ──────────────────────────────────────────────────────────────────────
# Router
# ──────────────────────────────────────────────────────────────────────
def register_onboarding(api: APIRouter, db, get_current_user):
    async def _priv(user=Depends(get_current_user)):
        if user.get("role") not in PRIV_ROLES:
            raise HTTPException(403, "Not authorised")
        return user

    @api.post("/hr/onboarding")
    async def create_onboarding(payload: OnboardingIn, user=Depends(_priv)):
        # Prevent duplicate active onboarding for the same email
        existing = await db.onboarding_records.find_one(
            {"email": payload.email.lower(), "status": {"$ne": "cancelled"}}, {"_id": 0}
        )
        if existing:
            raise HTTPException(400, f"An onboarding record for {payload.email} already exists (status: {existing.get('status')})")

        start = _parse_date(payload.start_date)
        prorated = _prorated_first_paycheck(payload.base_salary, start)
        dept_key = (payload.department or "default").lower().strip()
        template = DEPT_TASK_TEMPLATES.get(dept_key, DEPT_TASK_TEMPLATES["default"])

        rec_id = uuid.uuid4().hex
        rec = {
            "id": rec_id,
            "name": payload.name.strip(),
            "email": payload.email.lower(),
            "role": payload.role,
            "designation": payload.designation,
            "department": dept_key,
            "start_date": start.isoformat(),
            "base_salary": payload.base_salary,
            "currency": payload.currency.upper(),
            "manager_email": payload.manager_email,
            "mentor_email": payload.mentor_email,
            "notes": payload.notes or "",
            "status": "kickoff",
            "prorated_first_pay": prorated,
            "task_ids": [],
            "task_template_count": len(template),
            "created_at": _now(),
            "created_by": user.get("email"),
            "updated_at": _now(),
        }

        # Generate offer-letter PDF inline (single-page reportlab → b64)
        pdf_bytes = _render_offer_letter_pdf(rec)
        rec["offer_letter_pdf_b64"] = base64.b64encode(pdf_bytes).decode("ascii")
        rec["offer_letter_generated_at"] = _now()
        rec["offer_letter_size"] = len(pdf_bytes)

        # Auto-assign tasks from template (write to existing `tasks` collection)
        owner_id = user.get("id")
        assignee_email = (payload.manager_email or user.get("email") or "").lower()
        task_ids: List[str] = []
        for t in template:
            due = (datetime.now(timezone.utc) + _td(days=t["due_offset_days"]))
            tdoc = {
                "id": uuid.uuid4().hex,
                "title": f"[Onboarding · {rec['name']}] {t['title']}",
                "description": f"Auto-generated for new hire {rec['name']} ({rec['email']}) — {dept_key} dept · starting {rec['start_date']}.",
                "status": "todo",
                "priority": t["priority"],
                "owner_id": owner_id,
                "assignee_email": assignee_email,
                "due_date": due.isoformat(),
                "tags": ["onboarding", dept_key],
                "source": "onboarding",
                "onboarding_id": rec_id,
                "onboarding_for_email": rec["email"],
                "created_at": _now(),
                "updated_at": _now(),
            }
            await db.tasks.insert_one(tdoc)
            task_ids.append(tdoc["id"])

        rec["task_ids"] = task_ids

        # Create the portal user account with a dummy password & email them.
        dummy_pw = _gen_dummy_password()
        portal_uid, created_new, email_error = await _create_portal_user(
            db, rec, dummy_pw,
            actor={"email": user.get("email"), "name": user.get("name", "HR")},
        )
        rec["portal_user_id"] = portal_uid
        rec["account_created"] = portal_uid is not None
        rec["account_is_new"] = created_new
        rec["welcome_email_sent"] = created_new and not email_error
        rec["welcome_email_error"] = email_error
        # Only surface the dummy password when WE created the user. For an
        # existing-email collision we leave the field empty so HR can't accidentally
        # share a useless credential.
        rec["dummy_password"] = dummy_pw if created_new else ""

        await db.onboarding_records.insert_one(rec)
        rec.pop("_id", None)
        out = {k: v for k, v in rec.items() if k != "offer_letter_pdf_b64"}
        out["offer_letter_url"] = f"/api/hr/onboarding/{rec_id}/offer-letter.pdf"
        return out

    @api.get("/hr/onboarding")
    async def list_onboarding(user=Depends(_priv), status: Optional[str] = None, limit: int = 100):
        q: Dict[str, Any] = {}
        if status:
            q["status"] = status
        cur = db.onboarding_records.find(q, {"_id": 0, "offer_letter_pdf_b64": 0}).sort("created_at", -1).limit(limit)
        rows = await cur.to_list(limit)
        for r in rows:
            r["offer_letter_url"] = f"/api/hr/onboarding/{r['id']}/offer-letter.pdf"
        return rows

    @api.get("/hr/onboarding/templates")
    async def list_templates_early(user=Depends(_priv)):
        # Registered BEFORE /{rid} so the literal path wins over the path-param route.
        return {k: v for k, v in DEPT_TASK_TEMPLATES.items()}

    @api.get("/hr/onboarding/{rid}")
    async def get_onboarding(rid: str, user=Depends(_priv)):
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0, "offer_letter_pdf_b64": 0})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        rec["offer_letter_url"] = f"/api/hr/onboarding/{rid}/offer-letter.pdf"
        # Inline live task statuses for the UI
        if rec.get("task_ids"):
            t_cur = db.tasks.find({"id": {"$in": rec["task_ids"]}}, {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1, "due_date": 1})
            rec["tasks"] = await t_cur.to_list(50)
        return rec

    @api.patch("/hr/onboarding/{rid}")
    async def patch_onboarding(rid: str, payload: OnboardingPatch, user=Depends(_priv)):
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        if "status" in updates and updates["status"] not in {"kickoff", "docs_pending", "tasks_pending", "completed", "cancelled"}:
            raise HTTPException(400, "Invalid status")
        updates["updated_at"] = _now()
        r = await db.onboarding_records.update_one({"id": rid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Onboarding record not found")
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0, "offer_letter_pdf_b64": 0})
        rec["offer_letter_url"] = f"/api/hr/onboarding/{rid}/offer-letter.pdf"
        return rec

    @api.delete("/hr/onboarding/{rid}")
    async def delete_onboarding(rid: str, user=Depends(_priv)):
        if user.get("role") not in {"super_admin", "admin", "hr"}:
            raise HTTPException(403, "Only HR/admin can delete onboarding records")
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0, "task_ids": 1})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        # Cascade: remove the auto-assigned tasks too
        if rec.get("task_ids"):
            await db.tasks.delete_many({"id": {"$in": rec["task_ids"]}, "source": "onboarding"})
        await db.onboarding_records.delete_one({"id": rid})
        return {"ok": True}

    @api.get("/hr/onboarding/{rid}/offer-letter.pdf")
    async def download_offer_letter(rid: str, user=Depends(_priv)):
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        b64 = rec.get("offer_letter_pdf_b64")
        # Always render fresh so older records pick up the latest letter design
        try:
            pdf = _render_offer_letter_pdf(rec)
        except Exception:
            if not b64:
                raise HTTPException(500, "Offer letter render failed")
            pdf = base64.b64decode(b64)
        safe_name = (rec.get("name", "offer") or "offer").replace(" ", "_")
        return Response(
            content=pdf, media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="Projexino_Offer_{safe_name}.pdf"'},
        )

    @api.get("/hr/onboarding/{rid}/offer-letter-content")
    async def get_offer_letter_content(rid: str, user=Depends(_priv)):
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        return {
            "content": _offer_letter_content(rec),
            "has_custom": bool(rec.get("offer_letter_custom")),
        }

    @api.put("/hr/onboarding/{rid}/offer-letter-content")
    async def save_offer_letter_content(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        if payload.get("reset"):
            await db.onboarding_records.update_one(
                {"id": rid}, {"$unset": {"offer_letter_custom": ""}, "$set": {"updated_at": _now()}})
            rec.pop("offer_letter_custom", None)
        else:
            custom: Dict[str, Any] = {}
            for k in OFFER_EDITABLE_KEYS:
                if k not in payload:
                    continue
                v = payload[k]
                if k == "benefits":
                    if isinstance(v, list):
                        custom[k] = [str(x).strip()[:300] for x in v if str(x).strip()][:12]
                elif isinstance(v, str):
                    custom[k] = v.strip()[:2000]
            await db.onboarding_records.update_one(
                {"id": rid}, {"$set": {"offer_letter_custom": custom, "updated_at": _now()}})
            rec["offer_letter_custom"] = custom
        # Regenerate the stored PDF with the new content
        pdf = _render_offer_letter_pdf(rec)
        await db.onboarding_records.update_one({"id": rid}, {"$set": {
            "offer_letter_pdf_b64": base64.b64encode(pdf).decode("ascii"),
            "offer_letter_generated_at": _now(),
            "offer_letter_size": len(pdf),
        }})
        return {"ok": True, "content": _offer_letter_content(rec),
                "has_custom": bool(rec.get("offer_letter_custom"))}

    @api.post("/hr/onboarding/{rid}/regenerate-offer-letter")
    async def regenerate_offer_letter(rid: str, user=Depends(_priv)):
        rec = await db.onboarding_records.find_one({"id": rid}, {"_id": 0})
        if not rec:
            raise HTTPException(404, "Onboarding record not found")
        pdf = _render_offer_letter_pdf(rec)
        await db.onboarding_records.update_one({"id": rid}, {"$set": {
            "offer_letter_pdf_b64": base64.b64encode(pdf).decode("ascii"),
            "offer_letter_generated_at": _now(),
            "offer_letter_size": len(pdf),
            "updated_at": _now(),
        }})
        return {"ok": True, "size": len(pdf), "generated_at": _now()}

    @api.get("/hr/onboarding/templates_full")
    async def list_templates(user=Depends(_priv)):
        return {k: v for k, v in DEPT_TASK_TEMPLATES.items()}


# Late import to avoid top-of-file import cycles with server.py
from datetime import timedelta as _td  # noqa: E402
