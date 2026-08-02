"""playbooks.py — Premium playbook builder (no AI).

Admins compose playbooks (title + themed sections), pick a predefined premium
theme, and get: a public customized URL (/playbook/{slug}), an auto-designed
cover (rendered in CSS on the web + drawn in ReportLab on the PDF cover page),
and a downloadable premium PDF. Everything is origin-relative → self-host safe.
"""
from __future__ import annotations
import base64
import io
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from pydantic import BaseModel, Field

ALLOWED_ROLES = ("super_admin", "admin", "manager", "hr")

THEMES = {
    "future_tech": {"label": "Future Tech", "bg": "#0A1428", "accent": "#3B82F6", "accent2": "#F97316",
                    "text": "#FFFFFF", "muted": "#7DA2D6", "tagline": "Innovate. Automate. Elevate.", "style": "tech"},
    "minimal_clean": {"label": "Minimal Clean", "bg": "#FFFFFF", "accent": "#2563EB", "accent2": "#1E3A8A",
                      "text": "#1E3A8A", "muted": "#64748B", "tagline": "Clarity in process. Excellence in execution.", "style": "minimal"},
    "creative_edge": {"label": "Creative Edge", "bg": "#FFFFFF", "accent": "#F97316", "accent2": "#7C3AED",
                      "text": "#111827", "muted": "#6B7280", "tagline": "Ideas. Design. Impact.", "style": "creative"},
    "corporate_pro": {"label": "Corporate Professional", "bg": "#123A8F", "accent": "#F97316", "accent2": "#0B2A6B",
                      "text": "#FFFFFF", "muted": "#9DB8E8", "tagline": "Professionalism. Reliability. Results.", "style": "corporate"},
    "nature": {"label": "Nature Inspired", "bg": "#F4F9EC", "accent": "#4C8C2B", "accent2": "#2F5E1A",
               "text": "#1E3A24", "muted": "#6B8F5E", "tagline": "Growing together. Building a sustainable future.", "style": "nature"},
    "none": {"label": "No Theme · Blank", "bg": "#FFFFFF", "accent": "#334155", "accent2": "#475569",
             "text": "#111827", "muted": "#94A3B8", "tagline": "", "style": "none"},
}
# Old theme keys from existing playbooks → new design system
THEME_ALIASES = {"midnight": "future_tech", "ivory": "minimal_clean", "noir": "creative_edge",
                 "royal": "corporate_pro", "emerald": "nature"}


def _resolve_theme(key: str) -> dict:
    return THEMES.get(THEME_ALIASES.get(key or "", key or ""), THEMES["future_tech"])


def _valid_theme(key: str) -> bool:
    return key in THEMES or key in THEME_ALIASES


def _linkify(safe_text: str, accent_hex: str) -> str:
    """Make URLs in PDF paragraphs clickable."""
    return re.sub(r"(https?://[^\s<]+)", rf'<a href="\1" color="{accent_hex}"><u>\1</u></a>', safe_text)


class SectionIn(BaseModel):
    heading: str = ""
    body: str = ""
    table: Optional[List[List[str]]] = None
    image_b64: Optional[str] = ""
    full_page: bool = False


def parse_raw_content(text: str) -> List[dict]:
    """No-AI smart parser: paste anything → sections with headings, paragraphs,
    bullets and tables (| or tab separated). Numeric tables get auto-charts."""
    lines = (text or "").replace("\r\n", "\n").split("\n")
    sections: List[dict] = []
    cur = {"heading": "", "body": "", "table": None}
    body_parts: List[str] = []
    i = 0

    def flush():
        nonlocal cur, body_parts
        cur["body"] = "\n\n".join(body_parts).strip()
        if cur["heading"] or cur["body"] or cur["table"]:
            sections.append(dict(cur))
        cur = {"heading": "", "body": "", "table": None}
        body_parts = []

    def is_heading(ln: str) -> bool:
        s = ln.strip()
        if not s or len(s) > 70 or s.endswith((".", ",", ";", ":")):
            return False
        if s.startswith("#"):
            return True
        if re.match(r"^\d+[.)]\s+\S", s) and len(s) < 60:
            return True
        letters = [c for c in s if c.isalpha()]
        if letters and all(c.isupper() for c in letters) and len(s.split()) <= 8:
            return True
        return False

    def is_table_row(ln: str) -> bool:
        return ("|" in ln and len([c for c in ln.split("|") if c.strip()]) >= 2) or ("\t" in ln)

    while i < len(lines):
        s = lines[i].strip()
        if is_table_row(s) and i + 1 < len(lines) and is_table_row(lines[i + 1].strip()):
            rows = []
            while i < len(lines) and is_table_row(lines[i].strip()):
                r = lines[i].strip().strip("|")
                cells = [c.strip() for c in (r.split("|") if "|" in r else r.split("\t"))]
                if not all(set(c) <= set("-: ") for c in cells if c):  # skip md separator rows
                    rows.append(cells)
                i += 1
            if rows:
                if cur["table"]:
                    flush()
                cur["table"] = rows
            continue
        if is_heading(s):
            if cur["heading"] or body_parts or cur["table"]:
                flush()
            cur["heading"] = re.sub(r"^#+\s*|^\d+[.)]\s*", "", s).strip()
        elif s == "":
            if body_parts and body_parts[-1] != "":
                body_parts.append("")
        else:
            if body_parts and body_parts[-1] not in ("",):
                body_parts[-1] += "\n" + s
            else:
                if body_parts and body_parts[-1] == "":
                    body_parts.pop()
                body_parts.append(s)
        i += 1
    flush()
    return sections or [{"heading": "", "body": (text or "").strip(), "table": None}]


def _table_numeric_col(table):
    """(labels, series_name, values) for the first fully-numeric column, else None."""
    if not table or len(table) < 2:
        return None
    header, rows = table[0], table[1:]
    for col in range(1, len(header)):
        vals = []
        for r in rows:
            if col >= len(r):
                break
            v = re.sub(r"[^\d.\-]", "", r[col])
            try:
                vals.append(float(v))
            except Exception:
                break
        if len(vals) == len(rows) and vals:
            return [r[0][:14] for r in rows], header[col][:24], vals
    return None


class PlaybookIn(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    subtitle: Optional[str] = ""
    author: Optional[str] = "Projexino Solutions"
    category: Optional[str] = "Playbook"
    theme: str = "future_tech"
    sections: List[SectionIn] = []


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(title: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:80] or "playbook"


def _build_playbook_pdf(pb: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
    from reportlab.lib.utils import simpleSplit
    from reportlab.platypus import (SimpleDocTemplate, BaseDocTemplate, PageTemplate, Frame,
                                    NextPageTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Image)
    from reportlab.lib.units import cm

    theme = _resolve_theme(pb.get("theme"))
    light = theme.get("style") in ("minimal", "creative", "nature")
    no_theme = theme.get("style") == "none"
    BG = colors.HexColor(theme["bg"])
    ACCENT = colors.HexColor(theme["accent"])
    AC2 = colors.HexColor(theme.get("accent2", theme["accent"]))
    TEXT = colors.HexColor(theme["text"])
    MUTED = colors.HexColor(theme["muted"])
    INK = colors.HexColor("#1F2937")
    PAGE_W, PAGE_H = A4

    def _cover(c, _doc):
        from reportlab.lib.utils import ImageReader
        c.saveState()
        c.setFillColor(BG)
        c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        st = theme.get("style")
        if st == "tech":
            c.setStrokeColor(colors.Color(0.23, 0.51, 0.96, alpha=0.4))
            for r in (1.4, 2.1, 2.8):
                c.setLineWidth(1.1)
                c.circle(PAGE_W - 4.3 * cm, PAGE_H - 7.0 * cm, r * cm, stroke=1, fill=0)
            c.setFillColor(colors.Color(0.23, 0.51, 0.96, alpha=0.55))
            c.circle(PAGE_W - 4.3 * cm, PAGE_H - 7.0 * cm, 0.55 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.07))
            for gx in range(7):
                for gy in range(9):
                    c.circle(PAGE_W - 8.2 * cm + gx * 0.45 * cm, 8.2 * cm + gy * 0.45 * cm, 0.03 * cm, stroke=0, fill=1)
        elif st == "minimal":
            c.setFillColor(colors.Color(0.93, 0.95, 0.98, alpha=1))
            c.ellipse(PAGE_W - 10.5 * cm, PAGE_H - 11 * cm, PAGE_W + 2.5 * cm, PAGE_H - 3.2 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.15, 0.39, 0.92, alpha=0.9))
            c.circle(PAGE_W - 4.8 * cm, PAGE_H - 7.0 * cm, 1.5 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.98, 0.45, 0.09, alpha=0.95))
            c.rect(PAGE_W - 4.1 * cm, PAGE_H - 6.3 * cm, 0.8 * cm, 0.8 * cm, fill=1, stroke=0)
        elif st == "creative":
            c.setFillColor(colors.Color(0.49, 0.23, 0.93, alpha=0.75))
            c.circle(PAGE_W - 4.4 * cm, PAGE_H - 6.4 * cm, 2.5 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.98, 0.45, 0.09, alpha=0.8))
            c.circle(PAGE_W - 6.9 * cm, PAGE_H - 5.1 * cm, 1.7 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.49, 0.23, 0.93, alpha=0.3))
            c.circle(PAGE_W - 2.5 * cm, PAGE_H - 4.1 * cm, 1.2 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.98, 0.45, 0.09, alpha=0.35))
            c.circle(PAGE_W - 5.6 * cm, PAGE_H - 8.8 * cm, 0.9 * cm, stroke=0, fill=1)
        elif st == "corporate":
            p = c.beginPath()
            p.moveTo(PAGE_W * 0.60, 0); p.lineTo(PAGE_W, 0); p.lineTo(PAGE_W, PAGE_H); p.lineTo(PAGE_W * 0.78, PAGE_H)
            p.close()
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.10))
            c.drawPath(p, fill=1, stroke=0)
            c.setStrokeColor(ACCENT)
            c.setLineWidth(3.2)
            c.line(PAGE_W * 0.78, PAGE_H, PAGE_W * 0.60, 0)
        elif st == "nature":
            c.setFillColor(colors.Color(0.55, 0.72, 0.36, alpha=0.22))
            c.ellipse(PAGE_W - 11 * cm, PAGE_H - 11.5 * cm, PAGE_W + 3 * cm, PAGE_H - 3.4 * cm, stroke=0, fill=1)
            c.setFillColor(colors.Color(0.30, 0.55, 0.17, alpha=0.85))
            c.circle(PAGE_W - 4.7 * cm, PAGE_H - 7.2 * cm, 1.5 * cm, stroke=0, fill=1)
            c.setStrokeColor(colors.Color(0.30, 0.55, 0.17, alpha=0.5))
            c.setLineWidth(1)
            c.circle(PAGE_W - 4.7 * cm, PAGE_H - 7.2 * cm, 2.2 * cm, stroke=1, fill=0)
        # top accent bar
        c.setFillColor(ACCENT)
        c.rect(0, PAGE_H - 0.28 * cm, PAGE_W, 0.28 * cm, fill=1, stroke=0)
        # official logo top-left
        try:
            from extensions import _fetch_logo_bytes
            lb = _fetch_logo_bytes()
            if lb:
                img = ImageReader(io.BytesIO(lb))
                iw, ih = img.getSize()
                h = 1.35 * cm
                w = h * iw / ih
                if not light:
                    c.setFillColor(colors.white)
                    c.roundRect(1.8 * cm, PAGE_H - 3.65 * cm, w + 0.7 * cm, h + 0.5 * cm, 8, fill=1, stroke=0)
                    c.drawImage(img, 2.15 * cm, PAGE_H - 3.4 * cm, width=w, height=h, mask="auto")
                else:
                    c.drawImage(img, 1.9 * cm, PAGE_H - 3.4 * cm, width=w, height=h, mask="auto")
        except Exception:
            pass
        # version chip
        c.setFillColor(colors.Color(0.5, 0.5, 0.5, alpha=0.16))
        c.roundRect(PAGE_W - 4.9 * cm, PAGE_H - 3.35 * cm, 3.1 * cm, 1.0 * cm, 14, fill=1, stroke=0)
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawCentredString(PAGE_W - 3.35 * cm, PAGE_H - 3.0 * cm, f"VERSION 1.0  ·  {datetime.now(timezone.utc).year}")
        # two-tone display title
        words = (pb.get("title") or "Playbook").upper().split()
        cut = max(1, len(words) // 2)
        first, second = " ".join(words[:cut]), " ".join(words[cut:])
        y = PAGE_H - 8.2 * cm
        for line in simpleSplit(first, "Helvetica-Bold", 30, PAGE_W - 6 * cm)[:2]:
            c.setFillColor(TEXT)
            c.setFont("Helvetica-Bold", 30)
            c.drawString(1.9 * cm, y, line)
            y -= 1.25 * cm
        for line in simpleSplit(second, "Helvetica-Bold", 30, PAGE_W - 6 * cm)[:2]:
            c.setFillColor(ACCENT)
            c.setFont("Helvetica-Bold", 30)
            c.drawString(1.9 * cm, y, line)
            y -= 1.25 * cm
        c.setFillColor(TEXT)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(1.9 * cm, y, f"{(pb.get('category') or 'PLAYBOOK').upper()} TEMPLATE")
        y -= 0.55 * cm
        c.setFillColor(ACCENT)
        c.rect(1.9 * cm, y, 2.2 * cm, 0.12 * cm, fill=1, stroke=0)
        y -= 0.95 * cm
        tag = (pb.get("subtitle") or theme.get("tagline", "")).strip()
        c.setFillColor(MUTED)
        for line in simpleSplit(tag, "Helvetica", 11.5, PAGE_W - 6 * cm)[:2]:
            c.setFont("Helvetica", 11.5)
            c.drawString(1.9 * cm, y, line)
            y -= 0.62 * cm
        # feature strip from section headings
        feats = [s.get("heading") for s in (pb.get("sections") or []) if (s.get("heading") or "").strip()][:5]
        if feats:
            box_y, box_h = 3.4 * cm, 2.7 * cm
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.95 if light else 0.06))
            c.setStrokeColor(colors.Color(0.6, 0.6, 0.6, alpha=0.35))
            c.setLineWidth(0.7)
            c.roundRect(1.9 * cm, box_y, PAGE_W - 3.8 * cm, box_h, 10, fill=1, stroke=1)
            colw = (PAGE_W - 3.8 * cm) / len(feats)
            for i, ftxt in enumerate(feats):
                cx = 1.9 * cm + colw * i + colw / 2
                c.setFillColor(ACCENT)
                c.setFont("Helvetica-Bold", 13)
                c.drawCentredString(cx, box_y + box_h - 0.95 * cm, f"{i + 1:02d}")
                c.setFillColor(colors.HexColor("#1F2937") if light else TEXT)
                c.setFont("Helvetica-Bold", 6.8)
                for li, line in enumerate(simpleSplit(ftxt.upper(), "Helvetica-Bold", 6.8, colw - 0.5 * cm)[:2]):
                    c.drawCentredString(cx, box_y + box_h - 1.5 * cm - li * 0.33 * cm, line)
                if i:
                    c.setStrokeColor(colors.Color(0.6, 0.6, 0.6, alpha=0.3))
                    c.setLineWidth(0.5)
                    c.line(1.9 * cm + colw * i, box_y + 0.35 * cm, 1.9 * cm + colw * i, box_y + box_h - 0.35 * cm)
        # bottom info bar — CLICKABLE links
        bar_h = 1.15 * cm
        c.setFillColor(AC2 if light else colors.Color(1, 1, 1, alpha=0.08))
        c.rect(0, 0, PAGE_W, bar_h, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8.5)
        seg = PAGE_W / 3
        c.drawCentredString(seg * 0.5, bar_h / 2 - 0.1 * cm, "www.projexino.com")
        c.linkURL("https://www.projexino.com", (seg * 0.5 - 2.6 * cm, 0, seg * 0.5 + 2.6 * cm, bar_h), relative=0)
        c.drawCentredString(seg * 1.5, bar_h / 2 - 0.1 * cm, "hello@projexino.com")
        c.linkURL("mailto:hello@projexino.com", (seg * 1.5 - 2.8 * cm, 0, seg * 1.5 + 2.8 * cm, bar_h), relative=0)
        c.drawCentredString(seg * 2.5, bar_h / 2 - 0.1 * cm,
                            f"{datetime.now(timezone.utc).year}  ·  {(pb.get('author') or 'Projexino Solutions')[:28]}")
        c.restoreState()

    def _content_page(c, doc_):
        c.saveState()
        HEADER = AC2 if light else BG
        c.setFillColor(HEADER)
        c.rect(0, PAGE_H - 0.9 * cm, PAGE_W, 0.9 * cm, fill=1, stroke=0)
        try:
            from extensions import _fetch_logo_bytes
            lb = _fetch_logo_bytes()
            if lb:
                from reportlab.lib.utils import ImageReader
                img = ImageReader(io.BytesIO(lb))
                iw, ih = img.getSize()
                h = 0.55 * cm
                w = h * iw / ih
                c.setFillColor(colors.white)
                c.roundRect(0.55 * cm, PAGE_H - 0.82 * cm, w + 0.3 * cm, h + 0.2 * cm, 3, fill=1, stroke=0)
                c.drawImage(img, 0.7 * cm, PAGE_H - 0.72 * cm, width=w, height=h, mask="auto")
        except Exception:
            pass
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(3.4 * cm, PAGE_H - 0.62 * cm, (pb.get("title") or "")[:70].upper())
        c.setFillColor(ACCENT)
        c.rect(0, PAGE_H - 1.02 * cm, PAGE_W, 0.12 * cm, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#94A3B8"))
        c.setFont("Helvetica", 8)
        c.drawCentredString(PAGE_W / 2, 0.9 * cm, f"Projexino Solutions  ·  {pb.get('title', '')[:50]}  ·  Page {doc_.page - 1}")
        c.setFillColor(ACCENT)
        c.rect(0, 0, PAGE_W, 0.28 * cm, fill=1, stroke=0)
        c.restoreState()

    buf = io.BytesIO()
    doc = BaseDocTemplate(buf, pagesize=A4, title=pb.get("title", "Playbook"))
    frame_content = Frame(2.2 * cm, 2.0 * cm, PAGE_W - 4.4 * cm, PAGE_H - 4.2 * cm, id="cf",
                          leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    frame_full = Frame(0, 0, PAGE_W, PAGE_H, id="ff",
                       leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    if no_theme:
        # Blank mode — no cover, no branded headers/footers; just the user's pages.
        def _plain_page(c, doc_):
            c.saveState()
            c.setFillColor(colors.HexColor("#94A3B8"))
            c.setFont("Helvetica", 8)
            c.drawCentredString(PAGE_W / 2, 0.8 * cm, f"Page {doc_.page}")
            c.restoreState()
        _secs = pb.get("sections") or []
        _first_full = bool(_secs) and bool(_secs[0].get("full_page")) and (_secs[0].get("image_b64") or "").startswith("data:image/")
        _tmpls = [PageTemplate(id="content", frames=[frame_content], onPage=_plain_page),
                  PageTemplate(id="full", frames=[frame_full])]
        if _first_full:
            _tmpls.reverse()
        doc.addPageTemplates(_tmpls)
    else:
        doc.addPageTemplates([
            PageTemplate(id="cover", frames=[frame_content], onPage=_cover),
            PageTemplate(id="content", frames=[frame_content], onPage=_content_page),
            PageTemplate(id="full", frames=[frame_full]),  # true full-bleed page, no header/footer
        ])
    styles = getSampleStyleSheet()
    h_style = ParagraphStyle("h", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17,
                             textColor=AC2 if light else BG, spaceBefore=18, spaceAfter=4, leading=21)
    num_style = ParagraphStyle("n", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9,
                               textColor=ACCENT, spaceBefore=14, spaceAfter=2, leading=11)
    body_style = ParagraphStyle("b", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
                                textColor=INK, leading=16.5, alignment=TA_JUSTIFY, spaceAfter=8)
    bullet_style = ParagraphStyle("bl", parent=body_style, leftIndent=14, bulletIndent=2,
                                  alignment=TA_LEFT, spaceAfter=4)

    if no_theme:
        story = []
        needs_content_break = False  # page 1 already carries the right template
        first_flowable = True
    else:
        story = [Spacer(1, 1)]
        needs_content_break = True  # first flowable after the cover must jump to a new page
        first_flowable = False
    for idx, sec in enumerate(pb.get("sections") or [], start=1):
        # FULL-PAGE image section → the image IS the page (edge-to-edge, no header/footer)
        if sec.get("full_page") and (sec.get("image_b64") or "").startswith("data:image/"):
            try:
                from reportlab.lib.utils import ImageReader
                img_bytes = base64.b64decode(sec["image_b64"].split(",", 1)[1])
                ir = ImageReader(io.BytesIO(img_bytes))
                iw, ih = ir.getSize()
                ratio_img, ratio_page = iw / ih, PAGE_W / PAGE_H
                if abs(ratio_img - ratio_page) / ratio_page <= 0.12:
                    w, h = PAGE_W, PAGE_H  # designed at A4 ratio → stretch full-bleed
                else:
                    s = min(PAGE_W / iw, PAGE_H / ih)  # keep proportions, fit page
                    w, h = iw * s, ih * s
                im = Image(io.BytesIO(img_bytes), width=w, height=h)
                im.hAlign = "CENTER"
                if not first_flowable:
                    story.append(NextPageTemplate("full"))
                    story.append(PageBreak())
                story.append(im)
                needs_content_break = True
                first_flowable = False
            except Exception:
                pass
            continue
        if needs_content_break:
            story.append(NextPageTemplate("content"))
            story.append(PageBreak())
            needs_content_break = False
        first_flowable = False
        if sec.get("heading"):
            story.append(Paragraph(f"SECTION&nbsp;{idx:02d}", num_style))
            story.append(Paragraph(sec["heading"].replace("&", "&amp;").replace("<", "&lt;"), h_style))
            rule = Table([[""]], colWidths=[3.2 * cm])
            rule.hAlign = "LEFT"
            rule.setStyle(TableStyle([("LINEABOVE", (0, 0), (-1, -1), 2, ACCENT),
                                      ("TOPPADDING", (0, 0), (-1, -1), 0),
                                      ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
            story.append(rule)
        raw = (sec.get("body") or "").replace("\r\n", "\n")
        for para in [p for p in raw.split("\n\n") if p.strip()]:
            lines = para.split("\n")
            if all(l.strip().startswith(("-", "•", "*")) for l in lines if l.strip()):
                for l in lines:
                    if l.strip():
                        safe = _linkify(l.strip().lstrip("-•*").strip().replace("&", "&amp;").replace("<", "&lt;"), theme["accent"])
                        story.append(Paragraph(safe, bullet_style, bulletText="•"))
                story.append(Spacer(1, 6))
            else:
                safe = _linkify(para.strip().replace("&", "&amp;").replace("<", "&lt;"), theme["accent"]).replace("\n", "<br/>")
                story.append(Paragraph(safe, body_style))
        # Styled data table + auto chart for numeric tables
        tbl = sec.get("table")
        if tbl and len(tbl) >= 1:
            ncols = max(len(r) for r in tbl)
            norm = [r + [""] * (ncols - len(r)) for r in tbl]
            cell_style = ParagraphStyle("tc", parent=styles["Normal"], fontName="Helvetica", fontSize=8.5,
                                        textColor=INK, leading=11)
            head_style = ParagraphStyle("th", parent=cell_style, fontName="Helvetica-Bold",
                                        textColor=colors.white)
            data = [[Paragraph(str(c).replace("&", "&amp;").replace("<", "&lt;"), head_style if ri == 0 else cell_style)
                     for c in row] for ri, row in enumerate(norm)]
            t = Table(data, colWidths=[(PAGE_W - 4.4 * cm) / ncols] * ncols, repeatRows=1)
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BG),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F6F8")]),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D8DCE3")),
                ("LINEBELOW", (0, 0), (-1, 0), 1.4, ACCENT),
                ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(Spacer(1, 6))
            story.append(t)
            num = _table_numeric_col(tbl)
            if num:
                labels, series, vals = num
                try:
                    from reportlab.graphics.shapes import Drawing, String
                    from reportlab.graphics.charts.barcharts import VerticalBarChart
                    d = Drawing(PAGE_W - 4.4 * cm, 150)
                    ch = VerticalBarChart()
                    ch.x, ch.y, ch.width, ch.height = 10, 22, PAGE_W - 4.4 * cm - 30, 105
                    ch.data = [vals]
                    ch.categoryAxis.categoryNames = labels[:12]
                    ch.categoryAxis.labels.fontName = "Helvetica"
                    ch.categoryAxis.labels.fontSize = 6.5
                    ch.valueAxis.labels.fontSize = 6.5
                    ch.valueAxis.valueMin = 0
                    ch.bars[0].fillColor = ACCENT
                    ch.bars[0].strokeColor = None
                    d.add(ch)
                    d.add(String(10, 138, f"{series} — auto analysis", fontName="Helvetica-Bold",
                                 fontSize=8, fillColor=BG))
                    story.append(Spacer(1, 8))
                    story.append(d)
                except Exception:
                    pass
            story.append(Spacer(1, 8))
        # Optional section image (base64, self-host safe)
        img_b64 = sec.get("image_b64") or ""
        if img_b64.startswith("data:image/"):
            try:
                img_bytes = base64.b64decode(img_b64.split(",", 1)[1])
                im = Image(io.BytesIO(img_bytes), width=PAGE_W - 4.4 * cm, height=7.5 * cm, kind="proportional")
                im.hAlign = "CENTER"
                story.append(Spacer(1, 6))
                story.append(im)
                story.append(Spacer(1, 8))
            except Exception:
                pass
    if len(story) == (0 if no_theme else 1):  # no sections at all
        story.append(NextPageTemplate("content"))
        story.append(PageBreak())
        story.append(Paragraph("This playbook has no sections yet.", body_style))

    doc.build(story)
    return buf.getvalue()


def register_playbooks(api: APIRouter, db, get_current_user):

    def _guard(user):
        if user.get("role") not in ALLOWED_ROLES:
            raise HTTPException(403, "Playbooks are for Super Admin, Admin, Manager or HR")

    @api.get("/playbooks/themes")
    async def playbook_themes():
        return THEMES

    @api.post("/playbooks/parse")
    async def playbook_parse(payload: dict = Body(...), user=Depends(get_current_user)):
        """No-AI smart paste → auto-designed sections (headings, paragraphs, tables, auto-charts)."""
        _guard(user)
        sections = parse_raw_content(payload.get("text") or "")
        return {"sections": sections}

    @api.post("/playbooks/ai-edit")
    async def playbook_ai_edit(payload: dict = Body(...), user=Depends(get_current_user)):
        """Optional AI section edit — uses whatever provider is configured in ai_provider (self-host friendly)."""
        _guard(user)
        instruction = (payload.get("instruction") or "").strip()
        body = payload.get("body") or ""
        if not instruction:
            raise HTTPException(400, "Tell me what to change")
        try:
            from ai_provider import chat_completion
            revised = await chat_completion(
                system="You are a precise editor for business playbooks. Apply the user's instruction to the section text. "
                       "Return ONLY the revised section text — plain text, blank line between paragraphs, '-' for bullets. No preamble.",
                user_text=f"INSTRUCTION: {instruction}\n\nSECTION HEADING: {payload.get('heading') or ''}\n\nSECTION TEXT:\n{body}",
            )
            if not (revised or "").strip():
                raise ValueError("empty response")
            return {"body": revised.strip()}
        except Exception as e:
            raise HTTPException(400, f"AI edit unavailable: {str(e)[:160]}")

    @api.get("/playbooks")
    async def list_playbooks(user=Depends(get_current_user)):
        _guard(user)
        cur = db.playbooks.find({}, {"_id": 0}).sort("created_at", -1)
        items = await cur.to_list(200)
        for p in items:
            p["section_count"] = len(p.get("sections") or [])
        return items

    @api.post("/playbooks")
    async def create_playbook(payload: PlaybookIn, user=Depends(get_current_user)):
        _guard(user)
        if not _valid_theme(payload.theme):
            raise HTTPException(400, "Unknown theme")
        base_slug = _slugify(payload.title)
        slug, n = base_slug, 2
        while await db.playbooks.find_one({"slug": slug}, {"_id": 0, "id": 1}):
            slug = f"{base_slug}-{n}"
            n += 1
        doc = payload.model_dump()
        doc["sections"] = [s for s in doc["sections"] if (s.get("heading") or "").strip() or (s.get("body") or "").strip() or s.get("table") or (s.get("image_b64") or "").strip()]
        doc.update({
            "id": str(uuid.uuid4()), "slug": slug,
            "created_by": {"id": user["id"], "name": user.get("name", "")},
            "created_at": _now(), "updated_at": _now(),
        })
        await db.playbooks.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @api.patch("/playbooks/{pid}")
    async def update_playbook(pid: str, payload: PlaybookIn, user=Depends(get_current_user)):
        _guard(user)
        existing = await db.playbooks.find_one({"id": pid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Playbook not found")
        if not _valid_theme(payload.theme):
            raise HTTPException(400, "Unknown theme")
        updates = payload.model_dump()
        updates["sections"] = [s for s in updates["sections"] if (s.get("heading") or "").strip() or (s.get("body") or "").strip() or s.get("table") or (s.get("image_b64") or "").strip()]
        updates["updated_at"] = _now()
        await db.playbooks.update_one({"id": pid}, {"$set": updates})
        return {**existing, **updates}

    @api.delete("/playbooks/{pid}")
    async def delete_playbook(pid: str, user=Depends(get_current_user)):
        _guard(user)
        await db.playbooks.delete_one({"id": pid})
        return {"ok": True}

    @api.get("/public/playbooks/{slug}")
    async def public_playbook(slug: str):
        pb = await db.playbooks.find_one({"slug": slug}, {"_id": 0})
        if not pb:
            raise HTTPException(404, "Playbook not found")
        pb["theme_def"] = _resolve_theme(pb.get("theme"))
        return pb

    @api.get("/public/playbooks/{slug}/pdf")
    async def public_playbook_pdf(slug: str):
        pb = await db.playbooks.find_one({"slug": slug}, {"_id": 0})
        if not pb:
            raise HTTPException(404, "Playbook not found")
        pdf = _build_playbook_pdf(pb)
        fname = f"{pb['slug']}-playbook.pdf"
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})
