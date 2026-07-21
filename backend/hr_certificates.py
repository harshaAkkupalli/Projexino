"""hr_certificates.py — Manual Internship / Performance certificates for the HR module.

HR writes the content; the branded template (logo header, borders, footer ribbon,
signature block) is pre-designed. After creation the certificate can be digitally
signed (drawn or uploaded signature image) right from the UI.
"""
from __future__ import annotations
import base64
import io
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

ALLOWED_ROLES = ("super_admin", "admin", "hr", "manager")

CERT_TITLES = {
    "internship": "INTERNSHIP CERTIFICATE",
    "performance": "PERFORMANCE CERTIFICATE",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CertCreate(BaseModel):
    cert_type: str = "internship"  # internship | performance
    recipient_name: str
    designation: Optional[str] = ""
    department: Optional[str] = ""
    period_from: Optional[str] = ""
    period_to: Optional[str] = ""
    content: str
    signer_name: Optional[str] = ""
    signer_role: Optional[str] = "Authorized Signatory"


class CertUpdate(BaseModel):
    cert_type: Optional[str] = None
    recipient_name: Optional[str] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    period_from: Optional[str] = None
    period_to: Optional[str] = None
    content: Optional[str] = None
    signer_name: Optional[str] = None
    signer_role: Optional[str] = None


class SignIn(BaseModel):
    signature_data_url: str
    signer_name: Optional[str] = ""
    signer_role: Optional[str] = ""


def _build_certificate_pdf(cert: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.units import cm

    NAVY = colors.HexColor("#0F2042")
    ORANGE = colors.HexColor("#F97316")
    SLATE = colors.HexColor("#475569")

    PAGE_W, PAGE_H = A4
    LR_MARGIN = 2.2 * cm
    TB_MARGIN = 2.0 * cm
    USABLE_W = PAGE_W - 2 * LR_MARGIN

    def _draw_page_chrome(c, _doc):
        c.saveState()
        c.setStrokeColor(NAVY); c.setLineWidth(2)
        c.roundRect(1.0 * cm, 1.0 * cm, PAGE_W - 2 * cm, PAGE_H - 2 * cm, 12, stroke=1, fill=0)
        c.setStrokeColor(ORANGE); c.setLineWidth(0.5)
        c.roundRect(1.2 * cm, 1.2 * cm, PAGE_W - 2.4 * cm, PAGE_H - 2.4 * cm, 10, stroke=1, fill=0)
        c.setFillColor(ORANGE)
        ACC = 1.4 * cm
        p = c.beginPath()
        p.moveTo(1.0 * cm, PAGE_H - 1.0 * cm); p.lineTo(1.0 * cm, PAGE_H - 1.0 * cm - ACC); p.lineTo(1.0 * cm + ACC, PAGE_H - 1.0 * cm); p.close()
        c.drawPath(p, fill=1, stroke=0)
        p2 = c.beginPath()
        p2.moveTo(PAGE_W - 1.0 * cm, 1.0 * cm); p2.lineTo(PAGE_W - 1.0 * cm, 1.0 * cm + ACC); p2.lineTo(PAGE_W - 1.0 * cm - ACC, 1.0 * cm); p2.close()
        c.drawPath(p2, fill=1, stroke=0)
        c.setFillColor(NAVY)
        c.rect(1.0 * cm, 1.0 * cm, PAGE_W - 2 * cm, 0.5 * cm, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica", 7)
        c.drawCentredString(
            PAGE_W / 2, 1.18 * cm,
            "Projexino Solutions Pvt Ltd   •   www.projexino.com   •   © 2026 Projexino. All rights reserved.",
        )
        c.restoreState()

    buf = io.BytesIO()
    title_txt = CERT_TITLES.get(cert.get("cert_type"), "CERTIFICATE")
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=LR_MARGIN, rightMargin=LR_MARGIN,
        topMargin=TB_MARGIN, bottomMargin=TB_MARGIN,
        title=f"{cert.get('recipient_name', '')} — {title_txt.title()}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("t", parent=styles["Title"], fontName="Helvetica-Bold",
                                 fontSize=26, textColor=NAVY, alignment=TA_CENTER, leading=30)
    tag_style = ParagraphStyle("tag", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9,
                               textColor=ORANGE, alignment=TA_CENTER, spaceAfter=6, leading=11)
    sub_style = ParagraphStyle("s", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
                               textColor=SLATE, alignment=TA_CENTER, spaceAfter=12, leading=15)
    name_style = ParagraphStyle("n", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=26,
                                textColor=NAVY, alignment=TA_CENTER, spaceAfter=2, leading=32)
    role_style = ParagraphStyle("r", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=11,
                                textColor=SLATE, alignment=TA_CENTER, spaceAfter=6, leading=14)
    period_style = ParagraphStyle("p", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5,
                                  textColor=NAVY, alignment=TA_CENTER, spaceAfter=14, leading=12)
    body_style = ParagraphStyle("b", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
                                textColor=colors.HexColor("#1F2937"), leading=16,
                                alignment=TA_JUSTIFY, spaceAfter=8)
    company_style = ParagraphStyle("co", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10,
                                   textColor=NAVY, alignment=TA_CENTER, spaceAfter=2, leading=12)
    company_sub_style = ParagraphStyle("cos", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
                                       textColor=SLATE, alignment=TA_CENTER, spaceAfter=12, leading=10)

    story = []

    # ===== HEADER (pre-added template design: logo + company + divider) =====
    from extensions import _fetch_logo_bytes  # shared cached loader (local file first)
    logo_bytes = _fetch_logo_bytes()
    if logo_bytes:
        try:
            logo_img = Image(io.BytesIO(logo_bytes), width=4.2 * cm, height=2.0 * cm, kind="proportional")
            logo_img.hAlign = "CENTER"
            story.append(logo_img)
            story.append(Spacer(1, 4))
        except Exception:
            pass
    story.append(Paragraph("PROJEXINO SOLUTIONS PVT LTD", company_style))
    story.append(Paragraph("Engineering the Future of Operations", company_sub_style))

    divider = Table([[""]], colWidths=[USABLE_W * 0.35])
    divider.hAlign = "CENTER"
    divider.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), 1.5, ORANGE),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(divider)

    # ===== TITLE =====
    story.append(Paragraph("PROUDLY&nbsp;&nbsp;PRESENTS&nbsp;&nbsp;THE", tag_style))
    story.append(Paragraph(title_txt, title_style))
    story.append(Spacer(1, 8))
    story.append(Paragraph("This certificate is presented to", sub_style))

    # ===== AWARDEE =====
    story.append(Paragraph(cert.get("recipient_name", ""), name_style))
    role_bits = [b for b in (cert.get("designation"), cert.get("department")) if b]
    if role_bits:
        story.append(Paragraph("  •  ".join(role_bits), role_style))
    if cert.get("period_from") or cert.get("period_to"):
        story.append(Paragraph(
            f"PERIOD:&nbsp;&nbsp;<font color='#0F2042'>{cert.get('period_from') or '—'}</font>"
            f"&nbsp;&nbsp;<font color='#F97316'>→</font>&nbsp;&nbsp;"
            f"<font color='#0F2042'>{cert.get('period_to') or '—'}</font>",
            period_style,
        ))
    story.append(Spacer(1, 6))

    # ===== CONTENT (HR-authored, auto-aligned justified paragraphs) =====
    raw = (cert.get("content") or "").replace("\r\n", "\n").strip()
    paragraphs = [p.strip() for p in raw.split("\n\n") if p.strip()]
    for p in paragraphs:
        safe = p.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
        story.append(Paragraph(safe, body_style))
    story.append(Spacer(1, 24))

    # ===== SIGNATURE + ISSUE META =====
    sig_data = cert.get("signature_data_url") or ""
    signer_name = cert.get("signer_name") or "Authorized Signatory"
    signer_role = cert.get("signer_role") or "For Projexino Solutions Pvt Ltd"
    issued_on = datetime.now(timezone.utc).strftime("%d %B %Y")
    cert_id = (cert.get("id", "") or "")[:8].upper() or "PJX0000"

    sig_cell = []
    if sig_data.startswith("data:image/"):
        try:
            sig_bytes = base64.b64decode(sig_data.split(",", 1)[1])
            sig_img = Image(io.BytesIO(sig_bytes), width=4.4 * cm, height=1.7 * cm, kind="proportional")
            sig_img.hAlign = "LEFT"
            sig_cell.append(sig_img)
        except Exception:
            sig_cell.append(Spacer(1, 1.7 * cm))
    else:
        sig_cell.append(Spacer(1, 1.7 * cm))

    sig_line = Table([[""]], colWidths=[5.2 * cm])
    sig_line.hAlign = "LEFT"
    sig_line.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), 0.8, NAVY),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    sig_cell.append(sig_line)
    signer_style = ParagraphStyle("sg", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10,
                                  textColor=NAVY, alignment=TA_LEFT, leading=13)
    signer_sub = ParagraphStyle("sgs", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
                                textColor=SLATE, alignment=TA_LEFT, leading=11)
    sig_cell.append(Paragraph(signer_name, signer_style))
    sig_cell.append(Paragraph(signer_role, signer_sub))

    meta_r = ParagraphStyle("mr", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
                            textColor=SLATE, alignment=TA_RIGHT, leading=13)
    meta_cell = []
    if sig_data:
        chip = ParagraphStyle("chip", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.5,
                              textColor=colors.white, alignment=TA_CENTER, leading=11)
        chip_tbl = Table([[Paragraph('<font color="#FFFFFF">✓&nbsp;&nbsp;DIGITALLY SIGNED</font>', chip)]],
                         colWidths=[4.2 * cm])
        chip_tbl.hAlign = "RIGHT"
        chip_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("BOX", (0, 0), (-1, -1), 0.5, ORANGE),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        meta_cell.append(chip_tbl)
        meta_cell.append(Spacer(1, 6))
    meta_cell.append(Paragraph(f"Issued on <b><font color='#0F2042'>{issued_on}</font></b>", meta_r))
    meta_cell.append(Paragraph(f"Certificate ID: <b><font color='#0F2042'>PJX-CERT-{cert_id}</font></b>", meta_r))

    footer_tbl = Table([[sig_cell, meta_cell]], colWidths=[USABLE_W * 0.55, USABLE_W * 0.45])
    footer_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(footer_tbl)

    doc.build(story, onFirstPage=_draw_page_chrome, onLaterPages=_draw_page_chrome)
    return buf.getvalue()


def register_hr_certificates(api: APIRouter, db, get_current_user):

    def _guard(user):
        if user.get("role") not in ALLOWED_ROLES:
            raise HTTPException(403, "HR certificates are for Super Admin, Admin, HR or Manager")

    @api.get("/hr/certificates")
    async def list_certificates(user=Depends(get_current_user)):
        _guard(user)
        cur = db.hr_certificates.find({}, {"_id": 0, "signature_data_url": 0}).sort("created_at", -1)
        items = await cur.to_list(500)
        for i in items:
            i["signed"] = bool(i.get("signed_at"))
        return items

    @api.post("/hr/certificates")
    async def create_certificate(payload: CertCreate, user=Depends(get_current_user)):
        _guard(user)
        if payload.cert_type not in CERT_TITLES:
            raise HTTPException(400, "cert_type must be 'internship' or 'performance'")
        if not payload.recipient_name.strip():
            raise HTTPException(400, "Recipient name is required")
        if not payload.content.strip():
            raise HTTPException(400, "Certificate content is required")
        now = _now_iso()
        doc = payload.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "status": "draft",
            "signature_data_url": "",
            "signed_at": "",
            "created_by": {"id": user["id"], "name": user.get("name", ""), "email": user.get("email", "")},
            "created_at": now,
            "updated_at": now,
        })
        await db.hr_certificates.insert_one(doc)
        doc.pop("_id", None)
        doc.pop("signature_data_url", None)
        doc["signed"] = False
        return doc

    @api.patch("/hr/certificates/{cid}")
    async def update_certificate(cid: str, payload: CertUpdate, user=Depends(get_current_user)):
        _guard(user)
        existing = await db.hr_certificates.find_one({"id": cid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Certificate not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if updates.get("cert_type") and updates["cert_type"] not in CERT_TITLES:
            raise HTTPException(400, "cert_type must be 'internship' or 'performance'")
        updates["updated_at"] = _now_iso()
        await db.hr_certificates.update_one({"id": cid}, {"$set": updates})
        merged = {**existing, **updates}
        merged.pop("signature_data_url", None)
        merged["signed"] = bool(merged.get("signed_at"))
        return merged

    @api.post("/hr/certificates/{cid}/sign")
    async def sign_certificate(cid: str, payload: SignIn, user=Depends(get_current_user)):
        _guard(user)
        existing = await db.hr_certificates.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not existing:
            raise HTTPException(404, "Certificate not found")
        sig = payload.signature_data_url or ""
        if not sig.startswith("data:image/"):
            raise HTTPException(400, "Invalid signature payload")
        updates = {
            "signature_data_url": sig,
            "signed_at": _now_iso(),
            "status": "signed",
            "updated_at": _now_iso(),
        }
        if payload.signer_name:
            updates["signer_name"] = payload.signer_name
        if payload.signer_role:
            updates["signer_role"] = payload.signer_role
        await db.hr_certificates.update_one({"id": cid}, {"$set": updates})
        return {"ok": True, "signed_at": updates["signed_at"]}

    @api.delete("/hr/certificates/{cid}/signature")
    async def remove_signature(cid: str, user=Depends(get_current_user)):
        _guard(user)
        res = await db.hr_certificates.update_one(
            {"id": cid},
            {"$set": {"signature_data_url": "", "signed_at": "", "status": "draft", "updated_at": _now_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Certificate not found")
        return {"ok": True}

    @api.delete("/hr/certificates/{cid}")
    async def delete_certificate(cid: str, user=Depends(get_current_user)):
        _guard(user)
        await db.hr_certificates.delete_one({"id": cid})
        return {"ok": True}

    @api.post("/hr/certificates/{cid}/sign-link")
    async def certificate_sign_link(cid: str, user=Depends(get_current_user)):
        """Get/create a tokenized public sign URL (rendered as a QR so any device can sign)."""
        _guard(user)
        cert = await db.hr_certificates.find_one({"id": cid}, {"_id": 0, "id": 1, "sign_token": 1})
        if not cert:
            raise HTTPException(404, "Certificate not found")
        token = cert.get("sign_token")
        if not token:
            token = uuid.uuid4().hex[:12]
            await db.hr_certificates.update_one({"id": cid}, {"$set": {"sign_token": token}})
        return {"token": token}

    @api.get("/public/cert-sign/{token}")
    async def public_cert_sign_info(token: str):
        cert = await db.hr_certificates.find_one(
            {"sign_token": token},
            {"_id": 0, "recipient_name": 1, "cert_type": 1, "signer_name": 1, "signer_role": 1, "signed_at": 1},
        )
        if not cert:
            raise HTTPException(404, "Invalid or expired sign link")
        cert["signed"] = bool(cert.get("signed_at"))
        cert.pop("signed_at", None)
        return cert

    @api.post("/public/cert-sign/{token}")
    async def public_cert_sign(token: str, payload: SignIn):
        cert = await db.hr_certificates.find_one({"sign_token": token}, {"_id": 0, "id": 1})
        if not cert:
            raise HTTPException(404, "Invalid or expired sign link")
        sig = payload.signature_data_url or ""
        if not sig.startswith("data:image/") or len(sig) > 4 * 1024 * 1024:
            raise HTTPException(400, "Invalid signature payload")
        updates = {
            "signature_data_url": sig,
            "signed_at": _now_iso(),
            "status": "signed",
            "updated_at": _now_iso(),
        }
        if payload.signer_name:
            updates["signer_name"] = payload.signer_name
        await db.hr_certificates.update_one({"sign_token": token}, {"$set": updates})
        return {"ok": True}

    @api.get("/hr/certificates/{cid}/pdf")
    async def certificate_pdf(cid: str, user=Depends(get_current_user)):
        _guard(user)
        cert = await db.hr_certificates.find_one({"id": cid}, {"_id": 0})
        if not cert:
            raise HTTPException(404, "Certificate not found")
        pdf_bytes = _build_certificate_pdf(cert)
        fname = f"{(cert.get('recipient_name') or 'Certificate').replace(' ', '_')}_{CERT_TITLES.get(cert.get('cert_type'), 'Certificate').title().replace(' ', '_')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        )
