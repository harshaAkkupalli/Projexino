"""
xino_ai.py — Xino AI: client-facing estimator + branded Company Profile PDF.

Public endpoints (no auth):
  POST /api/xino/estimate            -> AI ballpark budget & timeline + save Lead
  GET  /api/xino/company-profile.pdf -> Branded auto-generated company profile PDF
  GET  /api/xino/company-profile/info-> Tells the frontend if a custom PDF is uploaded

Super-Admin endpoints:
  POST   /api/xino/company-profile/upload  -> upload a static branded PDF
  DELETE /api/xino/company-profile         -> revert to auto-generated
  GET    /api/xino/estimates               -> list all received estimates
"""
from __future__ import annotations
import io
import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional, Literal, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field, field_validator

from ai_provider import chat_completion, ai_configured

# ReportLab for the auto-generated company profile PDF
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image,
    KeepTogether,
)

router = APIRouter(prefix="/xino", tags=["xino-ai"])

PROJEXINO_ORANGE = colors.HexColor("#F97316")
PROJEXINO_DEEP = colors.HexColor("#0F2042")
PROJEXINO_AMBER = colors.HexColor("#FBBF24")
PROJEXINO_PURPLE = colors.HexColor("#A855F7")
PROJEXINO_GREEN = colors.HexColor("#10B981")
PROJEXINO_PINK = colors.HexColor("#F472B6")
SOFT_BG = colors.HexColor("#FFF7ED")


# ============================================================================
# Models
# ============================================================================

AppType = Literal["web", "ios", "android", "ios_android", "web_mobile"]


class EstimateRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=3, max_length=120)
    company: Optional[str] = ""
    phone: Optional[str] = ""
    app_type: AppType
    requirements: str = Field(..., min_length=20, max_length=4000)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, v: str) -> str:
        v = (v or "").strip()
        if "@" not in v or "." not in v.split("@", 1)[-1]:
            raise ValueError("Please enter a valid email address.")
        return v


class EstimateResult(BaseModel):
    id: str
    # Final Projexino price (50% off market) — what the client sees first
    budget_low_usd: int
    budget_high_usd: int
    budget_low_inr: int
    budget_high_inr: int
    # Full market price (for transparency: "you save X")
    market_low_usd: int
    market_high_usd: int
    # Multi-currency rendering: { "USD": {"low": ..., "high": ..., "symbol": "$"} , ... }
    currencies: dict
    discount_pct: int
    timeline_weeks_low: int
    timeline_weeks_high: int
    complexity: Literal["simple", "moderate", "complex", "enterprise"]
    confidence: Literal["low", "medium", "high"]
    summary: str
    modules: List[str]
    breakdown: List[dict]  # [{phase, weeks, cost_usd (already discounted)}]
    tech_stack: List[str]
    risks: List[str]
    next_step: str
    created_at: str


# ============================================================================
# Estimate endpoint
# ============================================================================

SYSTEM_PROMPT = """You are Xino AI, the senior solutions architect at Projexino — a premium but value-engineered software studio.
You produce BALLPARK estimates for client app/web projects. You MUST respond with valid JSON only — no markdown, no code fences.

⚠ PRICING POLICY (read carefully):
You output the FULL MARKET budget at typical 2026 agency rates. Projexino has its own engineering bench and will apply a 50% discount on the front-end — so the numbers you return must reflect the TRUE MARKET PRICE, not the discounted Projexino offer. Stick to the ranges below and do not pre-discount.

Market guardrails (USD, 2026 — FULL MARKET PRICE):
- Simple landing or marketing site:           $3k–$8k    | 3–5 weeks   | complexity=simple
- Standard web app w/ auth+dashboard:         $8k–$25k   | 6–10 weeks  | complexity=moderate
- Mobile app (one platform, mid features):    $12k–$30k  | 8–14 weeks  | complexity=moderate
- Cross-platform web + mobile MVP:            $25k–$60k  | 12–20 weeks | complexity=complex
- AI-heavy product (RAG, agents, fine-tune):  $35k–$90k  | 14–24 weeks | complexity=complex
- Enterprise SaaS (RBAC, billing, multi-tenant): $60k–$180k | 20–40 weeks | complexity=enterprise

Always:
- Use the upper-end of the range if requirements mention payments, AI, real-time chat, multi-role, or compliance.
- For "ios_android" or "web_mobile" multiply mobile-only estimate by ~1.6.
- timeline_weeks_low / _high must reflect calendar weeks (not man-weeks).
- breakdown sums of weeks must equal timeline_weeks_high.
- breakdown sums of cost_usd must be between budget_low_usd and budget_high_usd (FULL MARKET, do NOT discount).

Return JSON exactly in this shape (no extra keys):
{
  "budget_low_usd": int,
  "budget_high_usd": int,
  "timeline_weeks_low": int,
  "timeline_weeks_high": int,
  "complexity": "simple"|"moderate"|"complex"|"enterprise",
  "confidence": "low"|"medium"|"high",
  "summary": "2-3 sentence pitch on why this is the right range",
  "modules": ["Auth & onboarding", "Admin dashboard", ...],
  "breakdown": [
    {"phase": "Discovery & UX", "weeks": int, "cost_usd": int},
    {"phase": "Core build",     "weeks": int, "cost_usd": int},
    {"phase": "Hardening & QA", "weeks": int, "cost_usd": int},
    {"phase": "Launch & support","weeks": int, "cost_usd": int}
  ],
  "tech_stack": ["React 19", "FastAPI", ...],
  "risks": ["bullet 1", "bullet 2"],
  "next_step": "single-sentence call to action for the client"
}
"""

# Front-of-house Projexino discount applied AFTER the AI returns the market estimate.
PROJEXINO_DISCOUNT = 0.50  # 50% off market

# Currency conversion rates from USD (rough, ballpark — refreshed annually)
CURRENCY_RATES = {
    "USD": 1.0,
    "INR": 83.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "AED": 3.67,
    "SGD": 1.34,
    "AUD": 1.51,
    "CAD": 1.36,
    "ZAR": 18.5,
    "JPY": 156.0,
}
CURRENCY_SYMBOLS = {
    "USD": "$", "INR": "₹", "EUR": "€", "GBP": "£",
    "AED": "د.إ", "SGD": "S$", "AUD": "A$", "CAD": "C$",
    "ZAR": "R", "JPY": "¥",
}


def _platform_label(t: str) -> str:
    return {
        "web": "Web application",
        "ios": "iOS mobile app",
        "android": "Android mobile app",
        "ios_android": "iOS + Android mobile app",
        "web_mobile": "Web app + Mobile app",
    }.get(t, t)


def _fallback_estimate(req: EstimateRequest) -> dict:
    """Used when AI is unavailable. Static market-based math."""
    txt = (req.requirements or "").lower()
    base_low, base_high, weeks_low, weeks_high = 12000, 28000, 8, 14
    complexity = "moderate"

    if req.app_type in ("ios_android", "web_mobile"):
        base_low, base_high, weeks_low, weeks_high = 28000, 55000, 14, 22
        complexity = "complex"
    if any(k in txt for k in ["ai", "ml", "gpt", "claude", "rag", "llm", "chatbot"]):
        base_low = int(base_low * 1.4); base_high = int(base_high * 1.5); complexity = "complex"
    if any(k in txt for k in ["stripe", "payment", "billing", "subscription"]):
        base_low += 4000; base_high += 8000
    if any(k in txt for k in ["enterprise", "multi-tenant", "saas", "compliance", "hipaa"]):
        base_low = max(base_low, 60000); base_high = max(base_high, 120000)
        weeks_low, weeks_high = max(weeks_low, 18), max(weeks_high, 32)
        complexity = "enterprise"

    return {
        "budget_low_usd": base_low,
        "budget_high_usd": base_high,
        "timeline_weeks_low": weeks_low,
        "timeline_weeks_high": weeks_high,
        "complexity": complexity,
        "confidence": "low",
        "summary": (
            f"Based on a {_platform_label(req.app_type)} of {complexity} complexity, "
            "this ballpark covers discovery, build, QA and launch. "
            "Final scope after a 30-min discovery call."
        ),
        "modules": ["Authentication", "Core feature set", "Admin dashboard", "Notifications"],
        "breakdown": [
            {"phase": "Discovery & UX",     "weeks": max(1, weeks_high // 5),     "cost_usd": int(base_high * 0.15)},
            {"phase": "Core build",         "weeks": max(2, weeks_high // 2),     "cost_usd": int(base_high * 0.55)},
            {"phase": "Hardening & QA",     "weeks": max(1, weeks_high // 5),     "cost_usd": int(base_high * 0.20)},
            {"phase": "Launch & support",   "weeks": max(1, weeks_high - (weeks_high // 5)*2 - weeks_high // 2), "cost_usd": int(base_high * 0.10)},
        ],
        "tech_stack": ["React 19", "FastAPI", "MongoDB", "Tailwind", "Framer Motion"],
        "risks": ["Scope creep on undefined requirements", "Third-party integration timelines"],
        "next_step": "Book a 30-minute discovery call to lock the scope and timeline.",
    }


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
    text = text.strip()
    # strip ```json fences if present
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    try:
        return json.loads(text)
    except Exception:
        pass
    # try to find first {...} block
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


def _coerce_estimate(raw: dict, fallback: dict) -> dict:
    """Make sure all required keys exist and have safe values."""
    out = dict(fallback)
    for k in ("budget_low_usd", "budget_high_usd", "timeline_weeks_low", "timeline_weeks_high"):
        v = raw.get(k)
        try:
            if v is not None:
                out[k] = int(v)
        except Exception:
            pass
    for k in ("complexity", "confidence", "summary", "next_step"):
        v = raw.get(k)
        if isinstance(v, str) and v.strip():
            out[k] = v.strip()
    for k in ("modules", "tech_stack", "risks"):
        v = raw.get(k)
        if isinstance(v, list) and v:
            out[k] = [str(x) for x in v][:12]
    bd = raw.get("breakdown")
    if isinstance(bd, list) and bd:
        cleaned = []
        for it in bd:
            if not isinstance(it, dict): continue
            try:
                cleaned.append({
                    "phase": str(it.get("phase", "Phase"))[:60],
                    "weeks": int(it.get("weeks", 1)),
                    "cost_usd": int(it.get("cost_usd", 0)),
                })
            except Exception:
                continue
        if cleaned:
            out["breakdown"] = cleaned
    return out


def get_db():
    from server import db
    return db


@router.post("/estimate", response_model=EstimateResult)
async def create_estimate(payload: EstimateRequest):
    db = get_db()
    fallback = _fallback_estimate(payload)
    estimate_data = fallback

    if ai_configured():
        try:
            user_msg = (
                f"Client name: {payload.name}\n"
                f"Email: {payload.email}\n"
                f"Company: {payload.company or '(individual)'}\n"
                f"Project type: {_platform_label(payload.app_type)}\n"
                f"Requirements: {payload.requirements}\n\n"
                "Return JSON only."
            )
            text = await chat_completion(
                system_message=SYSTEM_PROMPT,
                user_message=user_msg,
                session_id=f"xino-estimate-{payload.email}",
                temperature=0.4,
            )
            parsed = _extract_json(text)
            if parsed:
                estimate_data = _coerce_estimate(parsed, fallback)
        except Exception as e:
            # silently fall back to deterministic estimate
            estimate_data = fallback
            estimate_data["risks"] = list(estimate_data.get("risks") or []) + [f"AI fallback used ({e.__class__.__name__})"]

    # Ensure budget sanity
    if estimate_data["budget_high_usd"] < estimate_data["budget_low_usd"]:
        estimate_data["budget_low_usd"], estimate_data["budget_high_usd"] = (
            estimate_data["budget_high_usd"], estimate_data["budget_low_usd"],
        )
    if estimate_data["timeline_weeks_high"] < estimate_data["timeline_weeks_low"]:
        estimate_data["timeline_weeks_low"], estimate_data["timeline_weeks_high"] = (
            estimate_data["timeline_weeks_high"], estimate_data["timeline_weeks_low"],
        )

    rate = CURRENCY_RATES["INR"]
    # Capture FULL market values before discount
    market_low_usd = int(estimate_data["budget_low_usd"])
    market_high_usd = int(estimate_data["budget_high_usd"])

    # Apply Projexino's 50% discount to client-facing budget + phase costs
    disc = 1.0 - PROJEXINO_DISCOUNT
    estimate_data["budget_low_usd"] = int(round(market_low_usd * disc, -2))
    estimate_data["budget_high_usd"] = int(round(market_high_usd * disc, -2))
    for ph in estimate_data.get("breakdown", []):
        try:
            ph["cost_usd"] = int(round(float(ph.get("cost_usd", 0)) * disc, -2))
        except Exception:
            pass

    estimate_data["budget_low_inr"] = int(round(estimate_data["budget_low_usd"] * rate, -3))
    estimate_data["budget_high_inr"] = int(round(estimate_data["budget_high_usd"] * rate, -3))
    estimate_data["market_low_usd"] = market_low_usd
    estimate_data["market_high_usd"] = market_high_usd
    estimate_data["discount_pct"] = int(PROJEXINO_DISCOUNT * 100)

    # Build the multi-currency lookup so the frontend can switch instantly without re-calling AI.
    def _round(v: float, currency: str) -> int:
        if currency in ("INR", "JPY", "ZAR"):
            return int(round(v, -3))
        return int(round(v, -2))
    estimate_data["currencies"] = {
        code: {
            "low": _round(estimate_data["budget_low_usd"] * mult, code),
            "high": _round(estimate_data["budget_high_usd"] * mult, code),
            "symbol": CURRENCY_SYMBOLS.get(code, code + " "),
            "code": code,
        }
        for code, mult in CURRENCY_RATES.items()
    }

    est_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": est_id,
        "name": payload.name,
        "email": payload.email,
        "company": payload.company or "",
        "phone": payload.phone or "",
        "app_type": payload.app_type,
        "requirements": payload.requirements,
        "result": estimate_data,
        "created_at": now,
    }
    await db.xino_estimates.insert_one(doc)

    # Auto-create a Lead assigned to the primary super admin
    try:
        admin = await db.users.find_one(
            {"is_primary_super_admin": True}, {"_id": 0, "id": 1}
        ) or await db.users.find_one({"role": "super_admin"}, {"_id": 0, "id": 1}) \
          or await db.users.find_one({"role": "admin"}, {"_id": 0, "id": 1})
        if admin:
            avg_value = float((estimate_data["budget_low_usd"] + estimate_data["budget_high_usd"]) / 2)
            lead_doc = {
                "id": str(uuid.uuid4()),
                "name": payload.name,
                "email": payload.email,
                "phone": payload.phone or "",
                "company": payload.company or "",
                "source": "xino-ai-estimator",
                "value": avg_value,
                "status": "new",
                "notes": (
                    f"Projexino offer (50% off market): ${estimate_data['budget_low_usd']:,}–${estimate_data['budget_high_usd']:,} · "
                    f"Market reference: ${estimate_data['market_low_usd']:,}–${estimate_data['market_high_usd']:,}\n"
                    f"Timeline: {estimate_data['timeline_weeks_low']}–{estimate_data['timeline_weeks_high']} wks · "
                    f"Complexity: {estimate_data['complexity']}\n\n"
                    f"Platform: {_platform_label(payload.app_type)}\n\n"
                    f"Requirements:\n{payload.requirements}"
                ),
                "activities": [{
                    "id": str(uuid.uuid4()),
                    "kind": "created",
                    "message": f"Lead auto-created from Xino AI estimator (estimate id {est_id})",
                    "at": now,
                    "by": "xino-ai",
                }],
                "owner_id": admin["id"],
                "created_at": now,
                "updated_at": now,
            }
            await db.leads.insert_one(lead_doc)
    except Exception:
        pass

    return EstimateResult(id=est_id, created_at=now, **estimate_data)


PROJEXINO_LOGO_URL = None  # lazily resolved from env — see _projexino_logo_url()


def _projexino_logo_url() -> str:
    base = (os.environ.get("PUBLIC_FRONTEND_URL")
            or os.environ.get("REACT_APP_BACKEND_URL")
            or "").rstrip("/")
    return f"{base}/projexino-logo.png" if base else "/projexino-logo.png"

_PROJEXINO_LOGO_CACHE: Optional[bytes] = None


def _fetch_projexino_logo() -> Optional[bytes]:
    """Load the Projexino logo PNG — local file first (100% reliable), then network."""
    global _PROJEXINO_LOGO_CACHE
    if _PROJEXINO_LOGO_CACHE:
        return _PROJEXINO_LOGO_CACHE
    for p in (
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "projexino-logo.png"),
        "/app/frontend/public/projexino-logo.png",
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "projexino-logo.png"),
    ):
        try:
            with open(p, "rb") as f:
                _PROJEXINO_LOGO_CACHE = f.read()
            return _PROJEXINO_LOGO_CACHE
        except Exception:
            continue
    try:
        import urllib.request
        with urllib.request.urlopen(_projexino_logo_url(), timeout=5) as resp:
            _PROJEXINO_LOGO_CACHE = resp.read()
    except Exception:
        return None
    return _PROJEXINO_LOGO_CACHE or None


def _draw_projexino_logo(c, x_left, y_bottom, height_mm):
    """Draw the actual Projexino logo PNG at the given position.
    Returns the drawn width in PDF units (mm), or None if the network fetch failed."""
    data = _fetch_projexino_logo()
    if not data:
        # Fallback: a small "P" emblem in brand colors
        h = height_mm
        c.setFillColor(PROJEXINO_ORANGE)
        c.circle(x_left + h/2, y_bottom + h/2, h/2, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", h * 0.6)
        c.drawCentredString(x_left + h/2, y_bottom + h/2 - h*0.18, "P")
        return h
    try:
        from reportlab.lib.utils import ImageReader
        img = ImageReader(io.BytesIO(data))
        iw, ih = img.getSize()
        scale = height_mm / ih
        draw_w = iw * scale
        c.drawImage(img, x_left, y_bottom, width=draw_w, height=height_mm, mask="auto")
        return draw_w
    except Exception:
        return None


# ============================================================================
# Branded company-profile PDF (auto-generated)
# Visual-first design (~60% imagery / 40% text) using direct canvas drawing
# ============================================================================

def _radial_disc(c, cx, cy, r, color_inner, color_outer, steps=14):
    """Fake radial gradient by stacking concentric discs from outer→inner."""
    for i in range(steps, -1, -1):
        t = i / steps
        col = colors.Color(
            color_outer.red + (color_inner.red - color_outer.red) * (1 - t),
            color_outer.green + (color_inner.green - color_outer.green) * (1 - t),
            color_outer.blue + (color_inner.blue - color_outer.blue) * (1 - t),
        )
        c.setFillColor(col)
        c.setStrokeColor(col)
        c.circle(cx, cy, r * (i / steps + 0.001), fill=1, stroke=0)


def _shadow_disc(c, cx, cy, r, color):
    """Disc with a soft outer shadow."""
    for k in range(6, 0, -1):
        c.setFillColor(colors.Color(0.06, 0.13, 0.26, alpha=0.04))
        c.circle(cx + 0.6, cy - 0.6, r + k * 0.6, fill=1, stroke=0)
    c.setFillColor(color)
    c.circle(cx, cy, r, fill=1, stroke=0)


def _logo_mark(c, cx, cy, size=22*mm):
    """Draw the Projexino 'X' logo mark — gradient disc + bold X + orbit ring."""
    _radial_disc(c, cx, cy, size/2, PROJEXINO_ORANGE, PROJEXINO_PURPLE)
    # orbit ring
    c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.85))
    c.setLineWidth(1.0)
    c.setDash(2, 4)
    c.ellipse(cx - size*0.55, cy - size*0.18, cx + size*0.55, cy + size*0.18, fill=0, stroke=1)
    c.setDash()  # reset
    # X
    c.setStrokeColor(PROJEXINO_DEEP)
    c.setLineWidth(size * 0.13)
    c.setLineCap(1)
    off = size * 0.30
    c.line(cx - off, cy - off, cx + off, cy + off)
    c.line(cx - off, cy + off, cx + off, cy - off)
    c.setStrokeColor(colors.white)
    c.setLineWidth(size * 0.08)
    c.line(cx - off, cy - off, cx + off, cy + off)
    c.line(cx - off, cy + off, cx + off, cy - off)
    # center node
    c.setFillColor(colors.white); c.circle(cx, cy, size*0.07, fill=1, stroke=0)
    c.setFillColor(PROJEXINO_ORANGE); c.circle(cx, cy, size*0.03, fill=1, stroke=0)
    c.setLineCap(0)


def _iso_card(c, x, y, w, h, top_color, side_color, accent=None):
    """Isometric '3D' card — top face + right face + accent dot."""
    depth = 4 * mm
    # right (side) face
    p = c.beginPath()
    p.moveTo(x + w, y); p.lineTo(x + w + depth, y + depth)
    p.lineTo(x + w + depth, y + h + depth); p.lineTo(x + w, y + h); p.close()
    c.setFillColor(side_color); c.setStrokeColor(side_color)
    c.drawPath(p, fill=1, stroke=0)
    # top (back) face
    p = c.beginPath()
    p.moveTo(x, y + h); p.lineTo(x + w, y + h)
    p.lineTo(x + w + depth, y + h + depth); p.lineTo(x + depth, y + h + depth); p.close()
    c.setFillColor(side_color.clone(alpha=0.7) if hasattr(side_color, 'clone') else side_color)
    c.drawPath(p, fill=1, stroke=0)
    # front face
    c.setFillColor(top_color)
    c.roundRect(x, y, w, h, 3*mm, fill=1, stroke=0)
    if accent:
        c.setFillColor(accent)
        c.circle(x + w - 8*mm, y + h - 8*mm, 2.6*mm, fill=1, stroke=0)


def _hex_tile(c, cx, cy, r, fill_color, text="", icon_char=""):
    """Draw a flat hex tile with optional icon glyph + label."""
    import math
    pts = []
    for i in range(6):
        a = math.radians(60 * i - 30)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    p = c.beginPath()
    p.moveTo(*pts[0])
    for pt in pts[1:]:
        p.lineTo(*pt)
    p.close()
    # subtle shadow
    c.setFillColor(colors.Color(0.06, 0.13, 0.26, alpha=0.06))
    p2 = c.beginPath()
    for i, pt in enumerate(pts):
        if i == 0: p2.moveTo(pt[0] + 1, pt[1] - 1)
        else:      p2.lineTo(pt[0] + 1, pt[1] - 1)
    p2.close()
    c.drawPath(p2, fill=1, stroke=0)
    # main
    c.setFillColor(fill_color); c.setStrokeColor(fill_color)
    c.drawPath(p, fill=1, stroke=0)
    if icon_char:
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", r * 0.9)
        c.drawCentredString(cx, cy - r*0.3, icon_char)
    if text:
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(cx, cy - r*0.7, text.upper())


def _page_chrome(c, doc_w, doc_h, page_num, total_pages, section_title):
    """Draw header + footer chrome on every page."""
    # left vertical brand strip
    c.setFillColor(PROJEXINO_DEEP)
    c.rect(0, 0, 14*mm, doc_h, fill=1, stroke=0)
    # accent stripe
    c.setFillColor(PROJEXINO_ORANGE)
    c.rect(14*mm, doc_h - 26*mm, 4*mm, 26*mm, fill=1, stroke=0)
    # rotated brand text on left strip
    c.saveState()
    c.translate(8.5*mm, 16*mm)
    c.rotate(90)
    c.setFillColor(colors.HexColor("#FED7AA"))
    c.setFont("Helvetica-Bold", 8)
    c.drawString(0, 0, "PROJEXINO · COMPANY PROFILE · 2026")
    c.restoreState()
    # page number badge
    c.setFillColor(PROJEXINO_ORANGE)
    c.circle(doc_w - 14*mm, doc_h - 14*mm, 7*mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(doc_w - 14*mm, doc_h - 15.5*mm, f"{page_num:02d}")
    c.setFont("Helvetica", 6)
    c.drawCentredString(doc_w - 14*mm, doc_h - 19*mm, f"/ {total_pages:02d}")
    # section title top-right
    c.setFillColor(PROJEXINO_DEEP)
    c.setFont("Helvetica-Bold", 9)
    c.drawRightString(doc_w - 26*mm, doc_h - 14*mm, section_title.upper())
    c.setFillColor(colors.HexColor("#94A3B8"))
    c.setFont("Helvetica", 7)
    c.drawRightString(doc_w - 26*mm, doc_h - 18*mm, "// PROJEXINO STUDIO")
    # footer line
    c.setStrokeColor(colors.HexColor("#E2E8F0"))
    c.setLineWidth(0.5)
    c.line(20*mm, 12*mm, doc_w - 20*mm, 12*mm)
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 7)
    c.drawString(20*mm, 7*mm, "projexino.com  ·  hello@projexino.com")
    c.setFillColor(PROJEXINO_ORANGE)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(doc_w - 20*mm, 7*mm, "ENGINEERED FOR SCALE.")


def _para(c, x, y, w, text, font="Helvetica", size=10, color=colors.HexColor("#334155"), leading=14):
    """Draw wrapped text in a box; returns final y after drawing."""
    from reportlab.lib.utils import simpleSplit
    c.setFillColor(color)
    c.setFont(font, size)
    lines = simpleSplit(text, font, size, w)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def _build_company_profile_pdf() -> bytes:
    import math
    buf = io.BytesIO()
    w, h = A4
    c = rl_canvas.Canvas(buf, pagesize=A4)
    c.setTitle("Projexino · Company Profile 2026")
    c.setAuthor("Projexino")
    TOTAL = 5

    # ─────────────────────────────────────────────────────────────
    # PAGE 1 — COVER
    # ─────────────────────────────────────────────────────────────
    # Deep background top half
    c.setFillColor(PROJEXINO_DEEP)
    c.rect(0, h * 0.45, w, h * 0.55, fill=1, stroke=0)
    # Diagonal orange wedge
    p = c.beginPath()
    p.moveTo(0, h * 0.45); p.lineTo(w * 0.75, h * 0.45)
    p.lineTo(w * 0.55, h * 0.30); p.lineTo(0, h * 0.30); p.close()
    c.setFillColor(PROJEXINO_ORANGE)
    c.drawPath(p, fill=1, stroke=0)
    # Glowing "planet" decoration top-right (3D-style)
    _radial_disc(c, w * 0.82, h * 0.78, 32*mm, PROJEXINO_AMBER, PROJEXINO_PURPLE, steps=16)
    # orbit rings
    c.setStrokeColor(colors.Color(1, 1, 1, alpha=0.25)); c.setLineWidth(0.6)
    for ang in (-15, 30, 75):
        c.saveState()
        c.translate(w * 0.82, h * 0.78); c.rotate(ang)
        c.ellipse(-40*mm, -10*mm, 40*mm, 10*mm, fill=0, stroke=1)
        c.restoreState()
    # stars / sparkles
    c.setFillColor(colors.white)
    import random; random.seed(7)
    for _ in range(30):
        x_s = random.uniform(0.18, 0.98) * w
        y_s = random.uniform(0.48, 0.98) * h
        c.circle(x_s, y_s, random.uniform(0.2, 0.7), fill=1, stroke=0)

    # Logo + brand — use the actual Projexino logo (white background card so it's legible on dark)
    c.setFillColor(colors.white)
    c.roundRect(24*mm, h - 50*mm, 56*mm, 18*mm, 3*mm, fill=1, stroke=0)
    _draw_projexino_logo(c, x_left=28*mm, y_bottom=h - 47*mm, height_mm=12*mm)
    c.setFillColor(PROJEXINO_AMBER)
    c.setFont("Helvetica", 8)
    c.drawString(28*mm, h - 55*mm, "// DIGITAL ENGINEERING STUDIO · EST. 2019")

    # Big headline
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 38)
    c.drawString(28*mm, h * 0.58, "Engineered for")
    c.setFillColor(PROJEXINO_AMBER)
    c.setFont("Helvetica-BoldOblique", 38)
    c.drawString(28*mm, h * 0.51, "what's next.")

    c.setFillColor(colors.white)
    c.setFont("Helvetica", 11)
    txt = "AI-native software, beautiful design, audit-grade delivery — for founders, scale-ups and enterprises."
    _para(c, 28*mm, h * 0.46 - 4*mm, w - 56*mm, txt, color=colors.HexColor("#E2E8F0"), size=11, leading=15)

    # Stat dials — bottom area as 3D circles
    stats = [
        ("100+", "HAPPY CLIENTS",      PROJEXINO_ORANGE),
        ("500+", "PROJECTS SHIPPED",   PROJEXINO_PURPLE),
        ("7+",   "YEARS BUILDING",     PROJEXINO_GREEN),
        ("24/7", "SUPPORT",            PROJEXINO_PINK),
    ]
    base_y = h * 0.18
    for i, (val, lbl, col) in enumerate(stats):
        cx = 38*mm + i * 42*mm
        _shadow_disc(c, cx, base_y, 14*mm, col)
        # ring
        c.setStrokeColor(colors.white); c.setLineWidth(0.8)
        c.circle(cx, base_y, 12*mm, fill=0, stroke=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16); c.drawCentredString(cx, base_y - 2*mm, val)
        c.setFillColor(PROJEXINO_DEEP)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(cx, base_y - 19*mm, lbl)

    # Pull-quote band
    c.setFillColor(PROJEXINO_DEEP)
    c.roundRect(20*mm, 22*mm, w - 40*mm, 14*mm, 2*mm, fill=1, stroke=0)
    c.setFillColor(PROJEXINO_AMBER)
    c.setFont("Helvetica-Bold", 10); c.drawString(26*mm, 30*mm, "“")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Oblique", 9.5)
    c.drawString(30*mm, 30*mm, "We ship in two-week sprints. Friday demos. Predictable, auditable, shippable.")

    _page_chrome(c, w, h, 1, TOTAL, "Cover")
    c.showPage()

    # ─────────────────────────────────────────────────────────────
    # PAGE 2 — WHAT WE DO  (60% icons grid + 40% text below)
    # ─────────────────────────────────────────────────────────────
    # Top headline
    c.setFillColor(PROJEXINO_DEEP)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(28*mm, h - 32*mm, "What we do")
    c.setFillColor(PROJEXINO_ORANGE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(28*mm, h - 38*mm, "// SIX CAPABILITIES · ONE TEAM")

    # 3D-style isometric cards grid (3 × 2)
    services = [
        ("AI Engineering",  "Claude · GPT · Gemini · RAG · agents",       PROJEXINO_PURPLE, "α"),
        ("Web Apps",        "React 19 · Next.js · FastAPI · multi-tenant", PROJEXINO_ORANGE, "</>"),
        ("Mobile Apps",     "Swift · Kotlin · Flutter · App Store",        PROJEXINO_GREEN,  "◌"),
        ("Cloud & DevOps",  "K8s · CI/CD · Sentry · Datadog",              PROJEXINO_DEEP,   "☁"),
        ("Product Design",  "Figma → tokens → shipped",                    PROJEXINO_PINK,   "✦"),
        ("Compliance",      "SOC-2 · HIPAA · GDPR",                        PROJEXINO_AMBER,  "✓"),
    ]
    grid_x = 28*mm; grid_y = h - 130*mm
    card_w = (w - 56*mm - 16*mm) / 3
    card_h = 38*mm
    for i, (name, sub, col, icon) in enumerate(services):
        col_i = i % 3; row_i = i // 3
        x = grid_x + col_i * (card_w + 8*mm)
        y = grid_y - row_i * (card_h + 10*mm)
        side = colors.Color(col.red * 0.65, col.green * 0.65, col.blue * 0.65)
        _iso_card(c, x, y, card_w, card_h, col, side)
        # icon circle
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.25))
        c.circle(x + 10*mm, y + card_h - 12*mm, 6.5*mm, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(x + 10*mm, y + card_h - 14*mm, icon)
        # text
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 11)
        c.drawString(x + 4*mm, y + 12*mm, name)
        c.setFillColor(colors.Color(1, 1, 1, alpha=0.85))
        c.setFont("Helvetica", 7.5)
        c.drawString(x + 4*mm, y + 6*mm, sub)

    # bottom 40% — content
    y_text = h - 220*mm
    c.setFillColor(PROJEXINO_ORANGE); c.setFont("Helvetica-Bold", 9)
    c.drawString(28*mm, y_text + 14*mm, "// HOW WE STAY DIFFERENT")
    c.setFillColor(PROJEXINO_DEEP); c.setFont("Helvetica-Bold", 14)
    c.drawString(28*mm, y_text + 6*mm, "Senior bench. AI-native. Owned by you, hosted on you.")
    _para(c, 28*mm, y_text, w - 56*mm,
          "Projexino pairs your team with senior engineers, designers and AI architects — daily standups, two-week sprints, "
          "public Friday demos. Every engagement ends with hardened, observable, documented systems in your repos, on your cloud — never locked to us.",
          size=10, color=colors.HexColor("#475569"), leading=14)

    _page_chrome(c, w, h, 2, TOTAL, "Capabilities")
    c.showPage()

    # ─────────────────────────────────────────────────────────────
    # PAGE 3 — HOW WE WORK (arched 4-phase journey, 60% visual)
    # ─────────────────────────────────────────────────────────────
    c.setFillColor(PROJEXINO_DEEP)
    c.setFont("Helvetica-Bold", 26)
    c.drawString(28*mm, h - 32*mm, "How we work")
    c.setFillColor(PROJEXINO_ORANGE)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(28*mm, h - 38*mm, "// 4-PHASE DELIVERY · 9 WEEKS TO LAUNCH")

    # Arched journey - 4 planets connected by dashed curve
    phases = [
        ("01", "Discovery",   "Week 1",     PROJEXINO_DEEP),
        ("02", "Prototype",   "Weeks 2-3",  PROJEXINO_PURPLE),
        ("03", "Harden",      "Weeks 4-8",  PROJEXINO_ORANGE),
        ("04", "Ship & Grow", "Week 9+",    PROJEXINO_GREEN),
    ]
    # curve background
    curve_y = h - 100*mm
    c.setStrokeColor(colors.HexColor("#FED7AA"))
    c.setLineWidth(2)
    c.setDash(3, 5)
    p = c.beginPath()
    p.moveTo(34*mm, curve_y - 6*mm)
    p.curveTo(60*mm, curve_y + 30*mm, 130*mm, curve_y - 28*mm, w - 34*mm, curve_y + 6*mm)
    c.drawPath(p, stroke=1, fill=0)
    c.setDash()

    coords = [
        (34*mm, curve_y - 6*mm),
        (80*mm, curve_y + 18*mm),
        (130*mm, curve_y - 16*mm),
        (w - 34*mm, curve_y + 6*mm),
    ]
    for (px, py), (num, name, when, col) in zip(coords, phases):
        _shadow_disc(c, px, py, 14*mm, col)
        c.setStrokeColor(colors.white); c.setLineWidth(0.8)
        c.circle(px, py, 12*mm, stroke=1, fill=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 13); c.drawCentredString(px, py - 2*mm, num)
        c.setFillColor(PROJEXINO_DEEP)
        c.setFont("Helvetica-Bold", 9); c.drawCentredString(px, py - 20*mm, name.upper())
        c.setFillColor(colors.HexColor("#94A3B8"))
        c.setFont("Helvetica", 7); c.drawCentredString(px, py - 25*mm, when)

    # under each phase — short caption (5-line content block, 40% of page)
    desc = [
        ("DISCOVERY",   "Scope workshop, success metrics, technical spike. We exit with a clickable wireframe and a signed scope doc."),
        ("PROTOTYPE",   "Clickable Figma + first working slice on staging. Real auth, real data, real UX — no Lorem Ipsum."),
        ("HARDEN",      "Eval harnesses, CI/CD, automated regression, QA, performance budgets, security review."),
        ("SHIP & GROW", "Production launch on your cloud, SLA-backed 24/7 maintenance, monthly feature roadmap reviews."),
    ]
    y_text = h - 175*mm
    c.setFillColor(PROJEXINO_ORANGE); c.setFont("Helvetica-Bold", 9)
    c.drawString(28*mm, y_text + 18*mm, "// THE PROJEXINO METHOD")
    col_w = (w - 56*mm - 18*mm) / 4
    for i, (title, body) in enumerate(desc):
        x = 28*mm + i * (col_w + 6*mm)
        # mini iso block on top
        col = [PROJEXINO_DEEP, PROJEXINO_PURPLE, PROJEXINO_ORANGE, PROJEXINO_GREEN][i]
        side = colors.Color(col.red * 0.6, col.green * 0.6, col.blue * 0.6)
        _iso_card(c, x, y_text + 10*mm, col_w, 6*mm, col, side)
        c.setFillColor(PROJEXINO_DEEP)
        c.setFont("Helvetica-Bold", 9); c.drawString(x, y_text + 4*mm, title)
        _para(c, x, y_text - 1*mm, col_w, body, size=7.5, color=colors.HexColor("#475569"), leading=10)

    _page_chrome(c, w, h, 3, TOTAL, "Delivery")
    c.showPage()

    # ─────────────────────────────────────────────────────────────
    # PAGE 4 — TECH + INDUSTRIES (hexagonal grid, 60% pictorial)
    # ─────────────────────────────────────────────────────────────
    c.setFillColor(PROJEXINO_DEEP)
    c.setFont("Helvetica-Bold", 26); c.drawString(28*mm, h - 32*mm, "Stack & Industries")
    c.setFillColor(PROJEXINO_ORANGE); c.setFont("Helvetica-Bold", 10)
    c.drawString(28*mm, h - 38*mm, "// MODERN TOOLS · DEEP DOMAIN")

    # Hex grid of tech (4 cols × 3 rows)
    techs = [
        ("AI", "α", PROJEXINO_PURPLE),
        ("React", "R", PROJEXINO_ORANGE),
        ("Python", "py", PROJEXINO_DEEP),
        ("Mobile", "◌", PROJEXINO_GREEN),
        ("Cloud", "☁", PROJEXINO_PINK),
        ("Mongo", "🍃", PROJEXINO_DEEP),
        ("Stripe", "$", PROJEXINO_PURPLE),
        ("CI/CD", "⚙", PROJEXINO_ORANGE),
        ("Sentry", "▲", PROJEXINO_AMBER),
        ("Figma", "✦", PROJEXINO_PINK),
        ("K8s", "⎈", PROJEXINO_DEEP),
        ("Vercel", "▲", PROJEXINO_GREEN),
    ]
    hex_r = 10*mm
    start_x = 38*mm
    start_y = h - 60*mm
    dx = hex_r * 1.85
    dy = hex_r * 1.6
    for i, (lbl, glyph, col) in enumerate(techs):
        row = i // 4; cidx = i % 4
        cx = start_x + cidx * dx + (row % 2) * (dx / 2)
        cy = start_y - row * dy
        _hex_tile(c, cx, cy, hex_r, col, text=lbl, icon_char=glyph)

    # Industries — colored bars
    y_ind = h - 130*mm
    c.setFillColor(PROJEXINO_DEEP); c.setFont("Helvetica-Bold", 13)
    c.drawString(28*mm, y_ind + 14*mm, "Industries we serve")
    inds = [
        ("FinTech",   PROJEXINO_ORANGE),
        ("HealthTech",PROJEXINO_GREEN),
        ("EdTech",    PROJEXINO_PURPLE),
        ("SaaS",      PROJEXINO_DEEP),
        ("Commerce",  PROJEXINO_PINK),
        ("Logistics", PROJEXINO_AMBER),
        ("Travel",    PROJEXINO_ORANGE),
        ("RealEstate",PROJEXINO_GREEN),
    ]
    ind_w = (w - 56*mm - 14*mm) / 4
    for i, (name, col) in enumerate(inds):
        row = i // 4; cidx = i % 4
        x = 28*mm + cidx * (ind_w + 5*mm)
        y = y_ind - row * 18*mm
        side = colors.Color(col.red * 0.6, col.green * 0.6, col.blue * 0.6)
        _iso_card(c, x, y, ind_w, 12*mm, col, side)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(x + 4*mm, y + 4.5*mm, name.upper())

    # bottom content (40%)
    y_text = h - 230*mm
    c.setFillColor(PROJEXINO_ORANGE); c.setFont("Helvetica-Bold", 9)
    c.drawString(28*mm, y_text + 14*mm, "// WHY THIS STACK")
    c.setFillColor(PROJEXINO_DEEP); c.setFont("Helvetica-Bold", 13)
    c.drawString(28*mm, y_text + 6*mm, "Boring tech for the parts that matter, sharp tech where it differentiates.")
    _para(c, 28*mm, y_text, w - 56*mm,
          "We pick stacks that hire well, scale well and don't lock you in. AI is a first-class citizen — never bolted on — "
          "with evaluation harnesses and observable orchestration for every Claude / GPT / Gemini touchpoint.",
          size=10, color=colors.HexColor("#475569"), leading=14)

    _page_chrome(c, w, h, 4, TOTAL, "Stack")
    c.showPage()

    # ─────────────────────────────────────────────────────────────
    # PAGE 5 — CTA / Let's build (big visual hero + contact band)
    # ─────────────────────────────────────────────────────────────
    # Background gradient panel
    _radial_disc(c, w - 50*mm, h - 70*mm, 70*mm, PROJEXINO_ORANGE, PROJEXINO_PURPLE, steps=20)
    # additional planets
    _shadow_disc(c, 50*mm, h - 130*mm, 18*mm, PROJEXINO_DEEP)
    _shadow_disc(c, 120*mm, h - 80*mm, 9*mm, PROJEXINO_GREEN)
    # orbiting dots
    c.setStrokeColor(colors.Color(15/255, 32/255, 66/255, alpha=0.2))
    c.setLineWidth(0.8); c.setDash(1, 3)
    c.circle(w - 50*mm, h - 70*mm, 90*mm, fill=0, stroke=1)
    c.setDash()
    c.setFillColor(colors.white)
    c.circle(w - 130*mm, h - 60*mm, 1.5, fill=1, stroke=0)
    c.circle(w - 55*mm, h - 145*mm, 2, fill=1, stroke=0)
    c.circle(w - 130*mm, h - 110*mm, 1.5, fill=1, stroke=0)

    # Logo + headline (Projexino logo only)
    _draw_projexino_logo(c, x_left=28*mm, y_bottom=h - 50*mm, height_mm=15*mm)
    c.setFillColor(PROJEXINO_DEEP); c.setFont("Helvetica-Bold", 32)
    c.drawString(28*mm, h - 95*mm, "Let's build")
    c.setFillColor(PROJEXINO_ORANGE); c.setFont("Helvetica-BoldOblique", 32)
    c.drawString(28*mm, h - 110*mm, "something rare.")

    _para(c, 28*mm, h - 122*mm, 90*mm,
          "Bring an idea, a deck, or just a problem. We come back with a ballpark budget, a phased timeline, "
          "and a path to a working prototype within two weeks.",
          size=11, color=colors.HexColor("#334155"), leading=15)

    # CTA stack
    y_cta = h - 170*mm
    cta_items = [
        ("EMAIL",       "hello@projexino.com",     PROJEXINO_ORANGE,   "@"),
        ("WEB",         "projexino.com",           PROJEXINO_DEEP,     "⌘"),
        ("BOOK A CALL", "projexino.com/contact",   PROJEXINO_PURPLE,   "→"),
    ]
    for i, (lbl, val, col, glyph) in enumerate(cta_items):
        y_i = y_cta - i * 16*mm
        # disc icon
        _shadow_disc(c, 36*mm, y_i + 3*mm, 5*mm, col)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(36*mm, y_i + 1*mm, glyph)
        # label + value
        c.setFillColor(colors.HexColor("#64748B")); c.setFont("Helvetica-Bold", 7)
        c.drawString(46*mm, y_i + 6*mm, lbl)
        c.setFillColor(PROJEXINO_DEEP); c.setFont("Helvetica-Bold", 13)
        c.drawString(46*mm, y_i - 1*mm, val)

    # Brand promo strip (Projexino branding only)
    c.setFillColor(PROJEXINO_DEEP)
    c.roundRect(20*mm, 28*mm, w - 40*mm, 22*mm, 3*mm, fill=1, stroke=0)
    # Small "P" emblem instead of the Xino mark — uses Projexino brand only
    c.setFillColor(PROJEXINO_ORANGE)
    c.circle(34*mm, 39*mm, 8*mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(34*mm, 36.5*mm, "P")
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 12)
    c.drawString(50*mm, 44*mm, "Already curious about budget?")
    c.setFillColor(PROJEXINO_AMBER); c.setFont("Helvetica", 9)
    c.drawString(50*mm, 36*mm, "Get a real-time estimate at projexino.com — takes about 12 seconds.")
    c.setFillColor(PROJEXINO_ORANGE)
    c.roundRect(w - 70*mm, 33*mm, 45*mm, 11*mm, 5*mm, fill=1, stroke=0)
    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(w - 47.5*mm, 37*mm, "GET ESTIMATE →")

    _page_chrome(c, w, h, 5, TOTAL, "Get in touch")
    c.showPage()

    c.save()
    return buf.getvalue()


@router.get("/company-profile.pdf")
async def company_profile_pdf():
    db = get_db()
    custom = await db.xino_assets.find_one({"id": "company_profile_pdf"}, {"_id": 0})
    if custom and custom.get("data_b64"):
        import base64
        return Response(
            content=base64.b64decode(custom["data_b64"]),
            media_type="application/pdf",
            headers={"Content-Disposition": 'inline; filename="Projexino-Company-Profile.pdf"'},
        )
    pdf_bytes = _build_company_profile_pdf()
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="Projexino-Company-Profile.pdf"'},
    )


@router.get("/company-profile/info")
async def company_profile_info():
    db = get_db()
    custom = await db.xino_assets.find_one({"id": "company_profile_pdf"}, {"_id": 0})
    return {
        "custom": bool(custom),
        "url": "/api/xino/company-profile.pdf",
        "updated_at": custom.get("updated_at") if custom else None,
        "size_kb": custom.get("size_kb") if custom else None,
    }


# ============================================================================
# Admin-only endpoints
# ============================================================================

def _require_super_admin():
    from server import get_current_user
    async def _dep(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin"):
            raise HTTPException(status_code=403, detail="Super-admin only")
        return user
    return _dep


@router.post("/company-profile/upload-secured")
async def upload_company_profile_secured(
    file: UploadFile = File(...),
    user=Depends(_require_super_admin()),
):
    if file.content_type not in ("application/pdf", "application/x-pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")
    data = await file.read()
    if len(data) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="PDF too large (max 12 MB)")
    import base64
    db = get_db()
    await db.xino_assets.update_one(
        {"id": "company_profile_pdf"},
        {"$set": {
            "id": "company_profile_pdf",
            "data_b64": base64.b64encode(data).decode("ascii"),
            "filename": file.filename,
            "size_kb": round(len(data) / 1024, 1),
            "uploaded_by": user.get("email"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return {"ok": True, "size_kb": round(len(data) / 1024, 1)}


@router.delete("/company-profile")
async def delete_custom_profile(user=Depends(_require_super_admin())):
    db = get_db()
    await db.xino_assets.delete_one({"id": "company_profile_pdf"})
    return {"ok": True}


@router.get("/estimates")
async def list_estimates(user=Depends(_require_super_admin())):
    db = get_db()
    cur = db.xino_estimates.find({}, {"_id": 0}).sort("created_at", -1).limit(500)
    return await cur.to_list(500)
