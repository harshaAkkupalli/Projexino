"""
hr_letters_module.py — HR Letters (LOI, Offer, Appointment, Relieving, Experience, Warning)
  · AI draft via Emergent LLM (Gemini)
  · WeasyPrint PDF with Projexino branding
  · Sign in-portal (canvas) OR scan QR to sign from mobile (15-min token)
  · Multiple draggable signature blocks per letter
"""
from __future__ import annotations
import os, base64, uuid, secrets, io
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Response
from pydantic import BaseModel, Field

PRIV = {"super_admin", "admin", "hr", "manager"}
UPLOAD_DIR = Path("/app/uploads/hr_letters")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
SIGN_TOKEN_TTL_MIN = 15
LOGO_URL = "/projexino-logo.png"  # served from /app/frontend/public; WeasyPrint uses base_url env to resolve

# Default company profile used the first time an admin opens the "Letterhead" settings.
# Any field the admin edits is persisted and reused across every future letter/PDF.
DEFAULT_COMPANY_PROFILE: Dict[str, Any] = {
    "id": "singleton",
    "logo_url": LOGO_URL,
    "company_name": "Projexino Solutions Pvt Ltd",
    "tagline": "",
    "address_line1": "",
    "address_line2": "",
    "city": "",
    "state": "",
    "pincode": "",
    "country": "India",
    "email": "",
    "phone": "",
    "website": "",
    "cin": "",
    "gstin": "",
    "footer_note": "Digital signatures affixed above are legally binding under the Information Technology Act, 2000.",
}


class CompanyProfileIn(BaseModel):
    logo_url: Optional[str] = None
    company_name: Optional[str] = None
    tagline: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    cin: Optional[str] = None
    gstin: Optional[str] = None
    footer_note: Optional[str] = None

TEMPLATES = {
    "letter_of_intent":   {"label": "Letter of Intent",    "tone": "warm, aspirational, position + start date + brief benefits"},
    "offer_letter":       {"label": "Offer Letter",        "tone": "formal offer with title, CTC breakdown, joining date, terms"},
    "appointment_letter": {"label": "Appointment Letter",  "tone": "post-joining confirmation with detailed responsibilities and reporting structure"},
    "relieving_letter":   {"label": "Relieving Letter",    "tone": "cordial exit confirmation with last working day and appreciation"},
    "experience_letter":  {"label": "Experience Letter",   "tone": "factual tenure + role summary suitable for future employers"},
    "warning_letter":     {"label": "Warning Letter",      "tone": "firm, respectful, cites specific behaviour + improvement expectation"},
}

# Per-template visual identity — used by the no-AI designer AND the PDF letterhead.
LETTER_DESIGNS = {
    "letter_of_intent":   {"accent": "#7C3AED", "soft": "#F5F3FF", "dark": "#4C1D95", "chip": "LETTER OF INTENT"},
    "offer_letter":       {"accent": "#F97316", "soft": "#FFF7ED", "dark": "#9A3412", "chip": "OFFER OF EMPLOYMENT"},
    "appointment_letter": {"accent": "#2563EB", "soft": "#EFF6FF", "dark": "#1E3A8A", "chip": "APPOINTMENT CONFIRMATION"},
    "relieving_letter":   {"accent": "#0D9488", "soft": "#F0FDFA", "dark": "#134E4A", "chip": "RELIEVING CONFIRMATION"},
    "experience_letter":  {"accent": "#059669", "soft": "#ECFDF5", "dark": "#064E3B", "chip": "EXPERIENCE CERTIFICATE"},
    "warning_letter":     {"accent": "#DC2626", "soft": "#FEF2F2", "dark": "#7F1D1D", "chip": "OFFICIAL WARNING · CONFIDENTIAL"},
}
DEFAULT_DESIGN = LETTER_DESIGNS["offer_letter"]


def _design_letter_html(letter: Dict[str, Any], text: str) -> str:
    """100% no-AI letter designer: turns pasted raw content into a professionally
    styled, template-branded HTML body (inline CSS → renders in preview AND PDF)."""
    dz = LETTER_DESIGNS.get(letter.get("template", ""), DEFAULT_DESIGN)
    accent, soft, dark, chip = dz["accent"], dz["soft"], dz["dark"], dz["chip"]
    raw = (text or "").replace("\r\n", "\n").strip()
    lines = raw.split("\n")

    def esc(s: str) -> str:
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    subject = ""
    body_lines: List[str] = []
    has_salutation = False
    has_closing = False
    for ln in lines:
        s = ln.strip()
        low = s.lower()
        if not subject and low.startswith(("subject:", "sub:", "re:")):
            subject = s.split(":", 1)[1].strip()
            continue
        if low.startswith("dear "):
            has_salutation = True
        if low.startswith(("sincerely", "warm regards", "regards", "yours faithfully", "yours sincerely", "best regards")):
            has_closing = True
        body_lines.append(ln)
    if not subject:
        pos = letter.get("position") or ""
        subject = f"{TEMPLATES.get(letter.get('template', ''), {}).get('label', 'Letter')}" + (f" — {pos}" if pos else "")

    def is_subhead(s: str) -> bool:
        if not s or len(s) > 70 or s.lower().startswith("dear "):
            return False
        letters = [c for c in s if c.isalpha()]
        if s.endswith(":") and len(s.split()) <= 8:
            return True
        return bool(letters) and all(c.isupper() for c in letters) and len(s.split()) <= 8

    parts: List[str] = []
    today = datetime.now(timezone.utc).strftime("%d %B %Y")
    parts.append(f'<p style="text-align:right;color:#64748B;font-size:9.5pt;margin:0 0 10px">{today}</p>')
    parts.append(
        f'<div style="display:inline-block;background:{soft};color:{dark};border-left:4px solid {accent};'
        f'padding:6px 14px;font-weight:700;letter-spacing:.14em;font-size:8.5pt;margin-bottom:12px">{chip}</div>')
    parts.append(f'<p style="font-weight:700;color:{dark};font-size:12pt;margin:12px 0 4px">Subject: {esc(subject)}</p>')
    parts.append(f'<div style="height:2px;width:64px;background:{accent};margin:0 0 14px"></div>')
    if not has_salutation:
        parts.append(f'<p style="margin:0 0 10px">Dear <b>{esc(letter.get("employee_name") or "Sir/Madam")}</b>,</p>')

    paras = [p for p in "\n".join(body_lines).split("\n\n") if p.strip()]
    for para in paras:
        plines = [l for l in para.split("\n") if l.strip()]
        if all(l.strip().startswith(("-", "•", "*")) for l in plines):
            lis = "".join(
                f'<li style="margin:4px 0">{esc(l.strip().lstrip("-•*").strip())}</li>' for l in plines)
            parts.append(f'<ul style="margin:8px 0 12px;padding-left:20px;color:#1F2937">{lis}</ul>')
        elif len(plines) == 1 and is_subhead(plines[0].strip()):
            h = esc(plines[0].strip().rstrip(":"))
            parts.append(
                f'<p style="font-weight:700;color:{dark};font-size:11pt;margin:16px 0 4px;'
                f'border-bottom:1.5px solid {accent};display:inline-block;padding-bottom:2px">{h}</p>')
        else:
            joined = "<br/>".join(esc(l.strip()) for l in plines)
            parts.append(f'<p style="margin:8px 0;text-align:justify;color:#1F2937;line-height:1.7">{joined}</p>')

    if not has_closing:
        parts.append(
            f'<p style="margin:18px 0 0">Warm regards,</p>'
            f'<p style="margin:2px 0 0;font-weight:700;color:{dark}">Projexino Solutions Pvt Ltd</p>'
            f'<p style="margin:0;color:#64748B;font-size:9.5pt">Human Resources</p>')
    return "\n".join(parts)


def _now_iso(): return datetime.now(timezone.utc).isoformat()
def _now_dt():  return datetime.now(timezone.utc)


class LetterCreate(BaseModel):
    template: str
    employee_name: str
    employee_email: Optional[str] = ""
    position: Optional[str] = ""
    department: Optional[str] = ""
    ctc: Optional[str] = ""
    joining_date: Optional[str] = ""
    context_notes: Optional[str] = ""


class LetterPatch(BaseModel):
    title: Optional[str] = None
    body_html: Optional[str] = None
    signature_blocks: Optional[List[Dict[str, Any]]] = None  # [{id,label,name,role,x,y,page,signature_data_url}]
    status: Optional[str] = None
    template: Optional[str] = None
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    ctc: Optional[str] = None
    joining_date: Optional[str] = None
    context_notes: Optional[str] = None


def register_hr_letters(api: APIRouter, db, get_current_user):

    async def _require_priv(user=Depends(get_current_user)):
        if (user or {}).get("role") not in PRIV:
            raise HTTPException(403, "HR letters require admin/HR access")
        return user

    async def _load_profile() -> Dict[str, Any]:
        doc = await db.hr_letter_settings.find_one({"id": "singleton"}, {"_id": 0})
        if not doc:
            doc = {**DEFAULT_COMPANY_PROFILE}
            await db.hr_letter_settings.insert_one({**doc, "created_at": _now_iso(), "updated_at": _now_iso()})
            doc.pop("_id", None)
        # Merge with defaults so newly-added fields don't break older docs
        return {**DEFAULT_COMPANY_PROFILE, **doc}

    def _address_line(p: Dict[str, Any]) -> str:
        parts = [
            p.get("address_line1") or "",
            p.get("address_line2") or "",
            ", ".join([x for x in [p.get("city"), p.get("state"), p.get("pincode")] if x]),
            p.get("country") or "",
        ]
        return "<br/>".join([x for x in parts if x])

    def _contact_line(p: Dict[str, Any]) -> str:
        bits = [p.get("email") or "", p.get("phone") or "", p.get("website") or ""]
        return "  ·  ".join([x for x in bits if x])

    def _reg_line(p: Dict[str, Any]) -> str:
        bits = []
        if p.get("cin"):   bits.append(f"CIN: {p['cin']}")
        if p.get("gstin"): bits.append(f"GSTIN: {p['gstin']}")
        return "  ·  ".join(bits)

    def _brand_html(letter: Dict[str, Any], profile: Dict[str, Any]) -> str:
        """Return a fully branded HTML for WeasyPrint. Kept inline so styling
        travels with the module and never breaks after a frontend deploy.
        Company details are pulled from the admin-editable `hr_letter_settings.singleton`."""
        blocks = letter.get("signature_blocks") or []
        blocks_html = ""
        for i, b in enumerate(blocks):
            sig = b.get("signature_data_url") or ""
            blocks_html += f"""
            <div class="sigblock">
              <div class="sigline">{('<img src="' + sig + '" />') if sig else '&nbsp;'}</div>
              <div class="signame">{b.get('name', '')}</div>
              <div class="sigrole">{b.get('role', b.get('label', ''))}</div>
            </div>"""

        logo   = profile.get("logo_url") or LOGO_URL
        cname  = profile.get("company_name") or "Company"
        tag    = profile.get("tagline") or ""
        addr_h = _address_line(profile)
        contact= _contact_line(profile)
        reg    = _reg_line(profile)
        footer_note = profile.get("footer_note") or DEFAULT_COMPANY_PROFILE["footer_note"]
        dz = LETTER_DESIGNS.get(letter.get("template", ""), DEFAULT_DESIGN)
        ACC, SOFT, DARK = dz["accent"], dz["soft"], dz["dark"]

        # Footer strips used in @page bottom slots — need to be single-line strings
        page_footer_left  = f"{cname}"
        if profile.get("city") or profile.get("country"):
            page_footer_left += "  ·  " + ", ".join([x for x in [profile.get("address_line1"), profile.get("city"), profile.get("country")] if x])
        page_footer_center = contact

        return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 22mm 20mm 26mm 20mm;
  @top-right {{ content: ""; }}
  @bottom-left  {{ content: "{page_footer_left}"; font-size: 8pt; color: #64748B; }}
  @bottom-center {{ content: "{page_footer_center}"; font-size: 8pt; color: #64748B; }}
  @bottom-right {{ content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #64748B; }}
}}
body {{ font-family: 'Helvetica','Arial',sans-serif; color:#0F2042; font-size:11pt; line-height:1.6; }}
.brand {{ display:flex; align-items:flex-start; justify-content:space-between; border-bottom:3px solid {ACC}; padding-bottom:12px; margin-bottom:22px; }}
.brand .logo-img {{ height:44px; width:auto; }}
.brand .tag {{ font-size:8pt; color:#64748B; margin-top:4px; letter-spacing:.15em; text-transform:uppercase; }}
.brand .meta {{ text-align:right; font-size:8.5pt; color:#64748B; line-height:1.5; }}
.brand .meta .ref {{ display:inline-block; margin-top:2px; padding:2px 8px; border-radius:99px; background:{SOFT}; color:{DARK}; font-weight:700; font-size:7.5pt; letter-spacing:.08em; }}
h1 {{ font-size:16pt; font-weight:700; margin: 8px 0 4px; color:#0F2042; }}
.subtitle {{ font-size:9pt; color:{ACC}; letter-spacing:.25em; text-transform:uppercase; font-weight:700; }}
.recipient {{ margin-top: 10px; padding: 10px 14px; border-left: 3px solid {ACC}; background: {SOFT}; border-radius: 0 8px 8px 0; }}
.recipient .r-name {{ font-weight:700; font-size:11.5pt; color:#0F2042; }}
.recipient .r-meta {{ font-size:9pt; color:#64748B; margin-top:2px; }}
.body {{ margin-top: 18px; text-align: justify; }}
.body p {{ margin: 8px 0; }}
.sigs {{ margin-top: 48px; display:grid; grid-template-columns: repeat(2, 1fr); gap: 30px 40px; page-break-inside: avoid; }}
.sigblock {{ break-inside: avoid; }}
.sigline {{ height: 60px; border-bottom: 1.5px solid #0F2042; display:flex; align-items:flex-end; }}
.sigline img {{ max-height:60px; max-width:100%; }}
.signame {{ font-weight:700; margin-top:4px; }}
.sigrole {{ font-size:9pt; color:#64748B; }}
.footer-note {{ margin-top: 40px; font-size:8.5pt; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:10px; text-align:center; }}
.footer-note b {{ color:{ACC}; }}
.reg {{ margin-top: 4px; font-size: 7.5pt; color:#94A3B8; }}
</style></head><body>
<div class="brand">
  <div>
    <img class="logo-img" src="{logo}" alt="{cname}" />
    {f'<div class="tag">{tag}</div>' if tag else ''}
  </div>
  <div class="meta">
    <div style="font-weight:700; color:#0F2042;">{cname}</div>
    {f'<div>{addr_h}</div>' if addr_h else ''}
    {f'<div>{contact}</div>' if contact else ''}
    <div class="ref">REF · HR-{letter.get('id','')[:8].upper()}</div>
    <div style="margin-top:2px;">Issued {(letter.get('updated_at') or letter.get('created_at') or _now_iso())[:10]}</div>
  </div>
</div>
<div class="subtitle">// {TEMPLATES.get(letter.get('template',''),{}).get('label','Letter')}</div>
<h1>{letter.get('title','')}</h1>
<div class="recipient">
  <div class="r-name">{letter.get('employee_name','')}</div>
  <div class="r-meta">{letter.get('position','') or ''}{(' · ' + letter.get('department','')) if letter.get('department') else ''}{(' · ' + letter.get('employee_email','')) if letter.get('employee_email') else ''}</div>
</div>
<div class="body">{letter.get('body_html','')}</div>
<div class="sigs">{blocks_html}</div>
<div class="footer-note">This document is generated by <b>{cname}</b>. {footer_note}</div>
{f'<div class="reg">{reg}</div>' if reg else ''}
</body></html>"""

    # ---------- Company profile (letterhead) ----------
    @api.get("/hr/letters/company-profile")
    async def get_company_profile(user=Depends(_require_priv)):
        return await _load_profile()

    @api.put("/hr/letters/company-profile")
    async def update_company_profile(payload: CompanyProfileIn, user=Depends(_require_priv)):
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        upd["updated_at"] = _now_iso()
        upd["updated_by"] = user.get("email", "")
        await db.hr_letter_settings.update_one(
            {"id": "singleton"},
            {"$set": upd, "$setOnInsert": {"id": "singleton", "created_at": _now_iso()}},
            upsert=True,
        )
        return await _load_profile()

    # ---------- List / Create ----------
    @api.get("/hr/letters")
    async def list_letters(user=Depends(_require_priv)):
        cur = db.hr_letters.find({"is_deleted": {"$ne": True}}, {"_id": 0}).sort("updated_at", -1).limit(500)
        return {"items": await cur.to_list(500)}

    @api.post("/hr/letters")
    async def create_letter(payload: LetterCreate, user=Depends(_require_priv)):
        if payload.template not in TEMPLATES:
            raise HTTPException(400, f"Unknown template. Choose one of: {list(TEMPLATES.keys())}")
        now = _now_iso()
        doc = {
            "id": uuid.uuid4().hex,
            "template": payload.template,
            "title": f"{TEMPLATES[payload.template]['label']} — {payload.employee_name}",
            "employee_name": payload.employee_name,
            "employee_email": payload.employee_email or "",
            "position": payload.position or "",
            "department": payload.department or "",
            "ctc": payload.ctc or "",
            "joining_date": payload.joining_date or "",
            "context_notes": payload.context_notes or "",
            "body_html": "",
            "signature_blocks": [
                {"id": uuid.uuid4().hex, "label": "Candidate",    "name": payload.employee_name, "role": "Candidate",       "signature_data_url": ""},
                {"id": uuid.uuid4().hex, "label": "HR Manager",   "name": user.get("email",""),  "role": "For Projexino",    "signature_data_url": ""},
            ],
            "status": "draft",
            "is_deleted": False,
            "created_at": now, "updated_at": now,
            "created_by": user.get("email",""), "updated_by": user.get("email",""),
        }
        await db.hr_letters.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.get("/hr/letters/{lid}")
    async def get_letter(lid: str, user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        return d

    @api.patch("/hr/letters/{lid}")
    async def patch_letter(lid: str, payload: LetterPatch, user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "template" in upd and upd["template"] not in TEMPLATES:
            raise HTTPException(400, "Unknown template")
        upd["updated_at"] = _now_iso()
        upd["updated_by"] = user.get("email","")
        await db.hr_letters.update_one({"id": lid}, {"$set": upd})
        d.update(upd)
        return d

    @api.post("/hr/letters/{lid}/duplicate")
    async def duplicate_letter(lid: str, user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        now = _now_iso()
        copy = {**d, "id": uuid.uuid4().hex, "title": f"{d.get('title', 'Letter')} (copy)",
                "status": "draft", "created_at": now, "updated_at": now,
                "created_by": user.get("email", ""), "updated_by": user.get("email", ""),
                "signature_blocks": [{**b, "id": uuid.uuid4().hex, "signature_data_url": ""}
                                     for b in (d.get("signature_blocks") or [])]}
        await db.hr_letters.insert_one(dict(copy))
        copy.pop("_id", None)
        return copy

    @api.post("/hr/letters/{lid}/format")
    async def format_letter(lid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_require_priv)):
        """No-AI: turn pasted raw text into a professionally designed, template-branded body."""
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        text = (payload.get("text") or "").strip()
        if not text:
            raise HTTPException(400, "Paste the letter content first")
        html = _design_letter_html(d, text)
        await db.hr_letters.update_one({"id": lid}, {"$set": {"body_html": html, "updated_at": _now_iso(), "updated_by": user.get("email", "")}})
        return {"body_html": html}

    @api.delete("/hr/letters/{lid}")
    async def delete_letter(lid: str, user=Depends(_require_priv)):
        await db.hr_letters.update_one({"id": lid}, {"$set": {"is_deleted": True, "deleted_at": _now_iso()}})
        return {"ok": True}

    # ---------- AI draft via Emergent LLM ----------
    @api.post("/hr/letters/{lid}/ai-draft")
    async def ai_draft(lid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            key = os.environ.get("EMERGENT_LLM_KEY")
            if not key: raise HTTPException(400, "EMERGENT_LLM_KEY not configured")
            template = d.get("template","")
            tone = TEMPLATES.get(template,{}).get("tone","professional")
            extra = (payload.get("guidance") or "").strip()
            sys_msg = (
                "You are a senior HR partner at Projexino Solutions Pvt Ltd (a technology company based in India). "
                f"Write a {TEMPLATES.get(template,{}).get('label','letter')} with a {tone} tone. "
                "Keep it 180-320 words. Use <p> paragraphs (no headings or wrapper tags). "
                "Address the recipient by first name in the salutation. "
                "End with 'We are excited to have you on board.' (or the exit equivalent) but do NOT include signatures — they are handled separately."
            )
            if extra: sys_msg += f" Additional guidance: {extra[:400]}"
            chat = LlmChat(api_key=key, session_id=f"hr-letter-{lid}", system_message=sys_msg).with_model("gemini", "gemini-2.5-flash")
            ctx = (
                f"Employee: {d.get('employee_name','')}\n"
                f"Position: {d.get('position','')}\n"
                f"Department: {d.get('department','')}\n"
                f"CTC / Compensation: {d.get('ctc','')}\n"
                f"Joining date: {d.get('joining_date','')}\n"
                f"Notes: {d.get('context_notes','')}\n"
            )
            raw = await chat.send_message(UserMessage(text=f"Draft the {TEMPLATES.get(template,{}).get('label','letter')} based on:\n\n{ctx}"))
            body = str(raw or "").strip()
            if not body.startswith("<p>"): body = f"<p>{body.replace(chr(10)+chr(10),'</p><p>').replace(chr(10),' ')}</p>"
            await db.hr_letters.update_one({"id": lid}, {"$set": {"body_html": body, "updated_at": _now_iso()}})
            d["body_html"] = body
            return {"body_html": body}
        except HTTPException: raise
        except Exception as e:
            raise HTTPException(502, f"AI draft failed: {str(e)[:200]}")

    # ---------- PDF ----------
    @api.get("/hr/letters/{lid}/pdf")
    async def render_pdf(lid: str, user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not d: raise HTTPException(404, "Not found")
        profile = await _load_profile()
        try:
            from weasyprint import HTML
            # base_url lets WeasyPrint resolve relative image paths like
            # `/projexino-logo.png` served from the same-origin static frontend.
            # Prevents the iter57/58 regression where the logo silently dropped
            # from PDFs after the letterhead singleton was migrated to the
            # self-hosted asset. Absolute URLs (e.g. CDN) are unaffected.
            base_url = (os.environ.get("PUBLIC_FRONTEND_URL")
                        or os.environ.get("REACT_APP_BACKEND_URL")
                        or "").rstrip("/")
            pdf = HTML(string=_brand_html(d, profile), base_url=base_url).write_pdf()
        except Exception as e:
            raise HTTPException(500, f"PDF render failed: {str(e)[:200]}")
        fname = f"{d.get('template','letter')}-{d.get('employee_name','doc').replace(' ','_')}.pdf"
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    # ---------- Sign token (QR flow) ----------
    @api.post("/hr/letters/{lid}/sign-token")
    async def create_sign_token(lid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_require_priv)):
        d = await db.hr_letters.find_one({"id": lid, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1, "title": 1, "signature_blocks": 1})
        if not d: raise HTTPException(404, "Not found")
        block_id = (payload or {}).get("block_id") or ""
        signer_name = (payload or {}).get("signer_name") or ""
        token = secrets.token_urlsafe(24)
        await db.hr_sign_tokens.insert_one({
            "token": token, "letter_id": lid, "block_id": block_id, "signer_name": signer_name,
            "created_at": _now_iso(),
            "expires_at": (_now_dt() + timedelta(minutes=SIGN_TOKEN_TTL_MIN)).isoformat(),
            "used": False,
        })
        base = (os.environ.get("PUBLIC_FRONTEND_URL") or os.environ.get("PUBLIC_BASE_URL") or "").rstrip("/")
        return {"token": token, "url": f"{base}/sign/{token}", "expires_in_min": SIGN_TOKEN_TTL_MIN}

    @api.get("/public/hr-letters/sign/{token}")
    async def get_by_token(token: str):
        t = await db.hr_sign_tokens.find_one({"token": token}, {"_id": 0})
        if not t: raise HTTPException(404, "Invalid link")
        if t.get("used"): raise HTTPException(410, "This link has already been used")
        try:
            if _now_dt() > datetime.fromisoformat(t["expires_at"]): raise HTTPException(410, "Link expired")
        except (ValueError, TypeError): pass
        d = await db.hr_letters.find_one({"id": t["letter_id"]}, {"_id": 0, "id": 1, "title": 1, "signature_blocks": 1, "template": 1})
        return {"letter_title": (d or {}).get("title", ""), "signer_name": t.get("signer_name", ""), "block_id": t.get("block_id", "")}

    @api.post("/public/hr-letters/sign/{token}")
    async def public_sign(token: str, payload: Dict[str, Any] = Body(...)):
        t = await db.hr_sign_tokens.find_one({"token": token}, {"_id": 0})
        if not t: raise HTTPException(404, "Invalid link")
        if t.get("used"): raise HTTPException(410, "Already used")
        try:
            if _now_dt() > datetime.fromisoformat(t["expires_at"]): raise HTTPException(410, "Link expired")
        except (ValueError, TypeError): pass
        sig = (payload or {}).get("signature_data_url") or ""
        if not sig.startswith("data:image/"): raise HTTPException(400, "Invalid signature payload")
        d = await db.hr_letters.find_one({"id": t["letter_id"]}, {"_id": 0})
        if not d: raise HTTPException(404, "Letter not found")
        blocks = d.get("signature_blocks") or []
        for b in blocks:
            if b.get("id") == t.get("block_id"):
                b["signature_data_url"] = sig
                if not b.get("name") and t.get("signer_name"): b["name"] = t["signer_name"]
                break
        else:
            blocks.append({"id": uuid.uuid4().hex, "label": "Signer", "name": t.get("signer_name", ""), "role": "External", "signature_data_url": sig})
        await db.hr_letters.update_one({"id": d["id"]}, {"$set": {"signature_blocks": blocks, "updated_at": _now_iso()}})
        await db.hr_sign_tokens.update_one({"token": token}, {"$set": {"used": True, "used_at": _now_iso()}})
        return {"ok": True}
