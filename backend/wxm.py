"""
wxm.py — Iter 39 · Website Experience Manager (Foundation)

Goal: let admins ship 2–3 industry "experiences" per week without code changes.
Five modules in this iteration:

  • Experience Profiles      — Industry × Country × Audience triple
  • Themes                   — colour / font / radius / hero-style presets
  • Heroes                   — headline / subhead / CTA / bg image-or-video
  • CTAs                     — reusable button labels + URLs
  • Visitor Personalization  — picks the best profile from {country, utm_source,
                              utm_campaign, industry-hint} on each public hit
  • Preview-As               — admin can force-render a chosen profile
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field


PRIV_ROLES = ("super_admin", "admin", "manager")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9-]", "", re.sub(r"\s+", "-", (s or "").lower())).strip("-")[:60]


# ── models ────────────────────────────────────────────────────────────
class ExperienceProfile(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Optional[str] = ""
    industry: str = ""            # "healthcare" | "automotive" | "fintech" | …
    country: str = ""             # ISO-2 e.g. "GB" / "US"; "*" = anywhere
    audience: str = ""            # "agency" | "startup" | "enterprise" | …
    description: str = ""
    theme_id: Optional[str] = ""
    hero_id: Optional[str] = ""
    primary_cta_id: Optional[str] = ""
    secondary_cta_id: Optional[str] = ""
    enabled_services: List[str] = []   # service slugs filterable on the public site
    case_study_tags: List[str] = []
    is_published: bool = False
    is_default: bool = False
    priority: int = 0


class Theme(BaseModel):
    name: str
    primary_color: str = "#F97316"
    secondary_color: str = "#0F2042"
    accent_color: str = "#10B981"
    surface_color: str = "#FFFFFF"
    text_color: str = "#0F2042"
    font_heading: str = "Manrope"
    font_body: str = "Inter"
    radius: int = 16
    hero_style: str = "split"     # split | centered | minimal | video | full-bleed
    cta_style: str = "rounded"    # rounded | pill | sharp


class Hero(BaseModel):
    name: str
    headline: str
    subheadline: str = ""
    background_image: str = ""
    background_video: str = ""
    primary_cta_id: Optional[str] = ""
    secondary_cta_id: Optional[str] = ""
    badge_text: str = ""           # small eyebrow chip


class CTA(BaseModel):
    name: str
    label: str
    url: str = "/contact"
    intent: str = "lead"           # lead | partnership | estimate | dedicated_team | call
    icon: str = ""
    open_in_new_tab: bool = False


PRESET_THEMES: List[Dict[str, Any]] = [
    {
        "name": "Projexino Classic", "primary_color": "#F97316", "secondary_color": "#0F2042",
        "accent_color": "#10B981", "surface_color": "#FFFFFF", "text_color": "#0F2042",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 16,
        "hero_style": "split", "cta_style": "rounded", "_preset": True,
    },
    {
        "name": "Midnight Indigo", "primary_color": "#6366F1", "secondary_color": "#0B1437",
        "accent_color": "#22D3EE", "surface_color": "#FFFFFF", "text_color": "#0B1437",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 18,
        "hero_style": "centered", "cta_style": "pill", "_preset": True,
    },
    {
        "name": "Emerald Sprint", "primary_color": "#10B981", "secondary_color": "#064E3B",
        "accent_color": "#F59E0B", "surface_color": "#F8FAFC", "text_color": "#064E3B",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 14,
        "hero_style": "split", "cta_style": "rounded", "_preset": True,
    },
    {
        "name": "Crimson Pulse", "primary_color": "#EF4444", "secondary_color": "#1F1B2E",
        "accent_color": "#FACC15", "surface_color": "#FFFFFF", "text_color": "#1F1B2E",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 12,
        "hero_style": "video", "cta_style": "sharp", "_preset": True,
    },
    {
        "name": "Ocean Calm", "primary_color": "#0EA5E9", "secondary_color": "#082F49",
        "accent_color": "#E11D48", "surface_color": "#F0F9FF", "text_color": "#082F49",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 20,
        "hero_style": "minimal", "cta_style": "pill", "_preset": True,
    },
    {
        "name": "Slate Mono", "primary_color": "#0F172A", "secondary_color": "#475569",
        "accent_color": "#F97316", "surface_color": "#FFFFFF", "text_color": "#0F172A",
        "font_heading": "Manrope", "font_body": "Inter", "radius": 8,
        "hero_style": "minimal", "cta_style": "sharp", "_preset": True,
    },
]


async def _ensure_preset_themes(db):
    """One-time seed of curated click-to-apply themes (idempotent)."""
    for t in PRESET_THEMES:
        existing = await db.wxm_themes.find_one({"name": t["name"]}, {"_id": 0})
        if existing:
            continue
        doc = dict(t); doc["id"] = uuid.uuid4().hex
        doc["created_at"] = _now(); doc["updated_at"] = _now()
        await db.wxm_themes.insert_one(doc)


def register_wxm(api: APIRouter, db, get_current_user):
    import asyncio
    asyncio.create_task(_ensure_preset_themes(db))

    async def _priv(user: Dict[str, Any]) -> None:
        if user.get("role") not in PRIV_ROLES:
            raise HTTPException(403, "Not authorised")
    @api.get("/wxm/profiles")
    async def list_profiles(user=Depends(get_current_user)):
        await _priv(user)
        return await db.wxm_profiles.find({}, {"_id": 0}).sort([("is_default", -1), ("priority", -1), ("created_at", -1)]).to_list(500)

    @api.post("/wxm/profiles")
    async def create_profile(payload: ExperienceProfile, user=Depends(get_current_user)):
        await _priv(user)
        doc = payload.model_dump()
        doc["id"] = uuid.uuid4().hex
        doc["slug"] = doc.get("slug") or _slugify(doc["name"])
        doc["created_at"] = _now(); doc["updated_at"] = _now(); doc["created_by"] = user.get("email", "")
        # Only one default profile allowed
        if doc.get("is_default"):
            await db.wxm_profiles.update_many({}, {"$set": {"is_default": False}})
        await db.wxm_profiles.insert_one(dict(doc))
        return doc

    @api.patch("/wxm/profiles/{rid}")
    async def update_profile(rid: str, payload: ExperienceProfile, user=Depends(get_current_user)):
        await _priv(user)
        existing = await db.wxm_profiles.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Profile not found")
        updates = payload.model_dump(exclude_unset=True)
        updates["updated_at"] = _now()
        if updates.get("is_default"):
            await db.wxm_profiles.update_many({"id": {"$ne": rid}}, {"$set": {"is_default": False}})
        await db.wxm_profiles.update_one({"id": rid}, {"$set": updates})
        return {**existing, **updates}

    @api.delete("/wxm/profiles/{rid}")
    async def delete_profile(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        r = await db.wxm_profiles.delete_one({"id": rid})
        return {"ok": r.deleted_count == 1}

    # Themes / Heroes / CTAs — each set has explicitly-named handlers so FastAPI
    # doesn't shadow them with same-named closure functions.
    @api.get("/wxm/themes")
    async def list_themes(user=Depends(get_current_user)):
        await _priv(user); return await db.wxm_themes.find({}, {"_id": 0}).to_list(500)
    @api.post("/wxm/themes")
    async def create_theme(payload: Theme, user=Depends(get_current_user)):
        await _priv(user); d = payload.model_dump(); d["id"] = uuid.uuid4().hex; d["created_at"] = _now(); d["updated_at"] = _now()
        await db.wxm_themes.insert_one(dict(d)); return d
    @api.patch("/wxm/themes/{rid}")
    async def update_theme(rid: str, payload: Theme, user=Depends(get_current_user)):
        await _priv(user); ex = await db.wxm_themes.find_one({"id": rid}, {"_id": 0})
        if not ex: raise HTTPException(404, "Not found")
        u = payload.model_dump(exclude_unset=True); u["updated_at"] = _now()
        await db.wxm_themes.update_one({"id": rid}, {"$set": u}); return {**ex, **u}
    @api.delete("/wxm/themes/{rid}")
    async def delete_theme(rid: str, user=Depends(get_current_user)):
        await _priv(user); r = await db.wxm_themes.delete_one({"id": rid}); return {"ok": r.deleted_count == 1}

    @api.post("/wxm/themes/{rid}/activate")
    async def activate_theme(rid: str, user=Depends(get_current_user)):
        """One-click: make this theme the site-wide active theme.

        Sets is_site_active=true on this theme and clears it on every other.
        Public site reads /api/public/wxm/active-theme and swaps brand colours live.
        """
        await _priv(user)
        theme = await db.wxm_themes.find_one({"id": rid}, {"_id": 0})
        if not theme:
            raise HTTPException(404, "Theme not found")
        await db.wxm_themes.update_many({"id": {"$ne": rid}}, {"$set": {"is_site_active": False}})
        await db.wxm_themes.update_one({"id": rid}, {"$set": {"is_site_active": True, "activated_at": _now(), "activated_by": user.get("email", "")}})
        return {**theme, "is_site_active": True}

    @api.get("/public/wxm/active-theme")
    async def public_active_theme():
        """No-auth public read used by the marketing site to apply colours."""
        t = await db.wxm_themes.find_one({"is_site_active": True}, {"_id": 0})
        return t or {}

    @api.get("/wxm/heroes")
    async def list_heroes(user=Depends(get_current_user)):
        await _priv(user); return await db.wxm_heroes.find({}, {"_id": 0}).to_list(500)
    @api.post("/wxm/heroes")
    async def create_hero(payload: Hero, user=Depends(get_current_user)):
        await _priv(user); d = payload.model_dump(); d["id"] = uuid.uuid4().hex; d["created_at"] = _now(); d["updated_at"] = _now()
        await db.wxm_heroes.insert_one(dict(d)); return d
    @api.patch("/wxm/heroes/{rid}")
    async def update_hero(rid: str, payload: Hero, user=Depends(get_current_user)):
        await _priv(user); ex = await db.wxm_heroes.find_one({"id": rid}, {"_id": 0})
        if not ex: raise HTTPException(404, "Not found")
        u = payload.model_dump(exclude_unset=True); u["updated_at"] = _now()
        await db.wxm_heroes.update_one({"id": rid}, {"$set": u}); return {**ex, **u}
    @api.delete("/wxm/heroes/{rid}")
    async def delete_hero(rid: str, user=Depends(get_current_user)):
        await _priv(user); r = await db.wxm_heroes.delete_one({"id": rid}); return {"ok": r.deleted_count == 1}

    @api.get("/wxm/ctas")
    async def list_ctas(user=Depends(get_current_user)):
        await _priv(user); return await db.wxm_ctas.find({}, {"_id": 0}).to_list(500)
    @api.post("/wxm/ctas")
    async def create_cta(payload: CTA, user=Depends(get_current_user)):
        await _priv(user); d = payload.model_dump(); d["id"] = uuid.uuid4().hex; d["created_at"] = _now(); d["updated_at"] = _now()
        await db.wxm_ctas.insert_one(dict(d)); return d
    @api.patch("/wxm/ctas/{rid}")
    async def update_cta(rid: str, payload: CTA, user=Depends(get_current_user)):
        await _priv(user); ex = await db.wxm_ctas.find_one({"id": rid}, {"_id": 0})
        if not ex: raise HTTPException(404, "Not found")
        u = payload.model_dump(exclude_unset=True); u["updated_at"] = _now()
        await db.wxm_ctas.update_one({"id": rid}, {"$set": u}); return {**ex, **u}
    @api.delete("/wxm/ctas/{rid}")
    async def delete_cta(rid: str, user=Depends(get_current_user)):
        await _priv(user); r = await db.wxm_ctas.delete_one({"id": rid}); return {"ok": r.deleted_count == 1}

    # ── Visitor personalization ─────────────────────────────────────────
    @api.get("/public/wxm/detect")
    async def detect_experience(
        request: Request,
        country: Optional[str] = Query(None, description="ISO-2 e.g. GB / US"),
        industry: Optional[str] = None,
        utm_source: Optional[str] = None,
        utm_campaign: Optional[str] = None,
        preview_profile_id: Optional[str] = None,
    ):
        """Public — no auth. Used by the marketing site on every page load.

        Resolution order:
          1. preview_profile_id (admin Preview-As)
          2. utm_campaign exact-match against profile.slug
          3. (industry + country) match
          4. industry-only match
          5. country-only match
          6. is_default profile
        """
        all_profiles = await db.wxm_profiles.find({"is_published": True}, {"_id": 0}).to_list(500)
        chosen: Optional[Dict[str, Any]] = None

        if preview_profile_id:
            chosen = await db.wxm_profiles.find_one({"id": preview_profile_id}, {"_id": 0})

        def best_match(predicate):
            matches = [p for p in all_profiles if predicate(p)]
            matches.sort(key=lambda p: -int(p.get("priority", 0)))
            return matches[0] if matches else None

        if not chosen and utm_campaign:
            chosen = best_match(lambda p: p.get("slug", "").lower() == utm_campaign.lower())
        if not chosen and industry and country:
            chosen = best_match(lambda p: p.get("industry", "").lower() == industry.lower() and p.get("country", "").upper() in (country.upper(), "*", ""))
        if not chosen and industry:
            chosen = best_match(lambda p: p.get("industry", "").lower() == industry.lower())
        if not chosen and country:
            chosen = best_match(lambda p: p.get("country", "").upper() == country.upper())
        if not chosen:
            chosen = best_match(lambda p: p.get("is_default"))
        if not chosen and all_profiles:
            chosen = all_profiles[0]
        if not chosen:
            return {"profile": None, "theme": None, "hero": None, "primary_cta": None, "secondary_cta": None}

        async def _by_id(coll, rid):
            return await db[coll].find_one({"id": rid}, {"_id": 0}) if rid else None

        theme = await _by_id("wxm_themes", chosen.get("theme_id"))
        hero = await _by_id("wxm_heroes", chosen.get("hero_id"))
        primary = await _by_id("wxm_ctas", chosen.get("primary_cta_id") or (hero or {}).get("primary_cta_id"))
        secondary = await _by_id("wxm_ctas", chosen.get("secondary_cta_id") or (hero or {}).get("secondary_cta_id"))

        # Lightweight analytics tap — every public detect call gets recorded
        try:
            await db.wxm_detections.insert_one({
                "id": uuid.uuid4().hex,
                "profile_id": chosen["id"],
                "profile_slug": chosen.get("slug"),
                "country": (country or "").upper(),
                "industry": (industry or "").lower(),
                "utm_source": utm_source or "",
                "utm_campaign": utm_campaign or "",
                "ip": request.client.host if request.client else "",
                "ua": request.headers.get("user-agent", "")[:200],
                "at": _now(),
            })
        except Exception:
            pass

        return {
            "profile": chosen, "theme": theme, "hero": hero,
            "primary_cta": primary, "secondary_cta": secondary,
        }

    # ── Analytics summary ─────────────────────────────────────────
    @api.get("/wxm/analytics")
    async def analytics(days: int = 14, user=Depends(get_current_user)):
        await _priv(user)
        from datetime import timedelta
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        pipeline = [
            {"$match": {"at": {"$gte": since}}},
            {"$group": {
                "_id": "$profile_slug",
                "hits": {"$sum": 1},
                "countries": {"$addToSet": "$country"},
            }},
            {"$sort": {"hits": -1}},
        ]
        rows = await db.wxm_detections.aggregate(pipeline).to_list(200)
        return {"days": days, "rows": [{"profile_slug": r["_id"], "hits": r["hits"], "country_count": len([c for c in r["countries"] if c])} for r in rows]}

    # ── Pages ────────────────────────────────────────────────────────
    # Real visitable pages created from the admin. Schema covers everything
    # the public renderer (/page/:slug) needs: hero, sections (rich content
    # blocks), SEO meta, CTAs, theme. AI assist endpoint drafts SEO-optimised
    # title/description/sections from a single prompt.
    @api.get("/wxm/pages")
    async def list_pages(user=Depends(get_current_user)):
        await _priv(user)
        rows = await db.wxm_pages.find({}, {"_id": 0}).sort("updated_at", -1).to_list(200)
        return rows

    @api.get("/wxm/pages/{rid}")
    async def get_page(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        row = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Page not found")
        return row

    @api.post("/wxm/pages")
    async def create_page(payload: Dict[str, Any], user=Depends(get_current_user)):
        await _priv(user)
        title = (payload.get("title") or "").strip()
        if not title:
            raise HTTPException(400, "Title is required")
        slug = _slugify(payload.get("slug") or title)
        if not slug:
            raise HTTPException(400, "Slug could not be derived from title")
        # Slug uniqueness
        if await db.wxm_pages.find_one({"slug": slug}, {"_id": 0, "id": 1}):
            raise HTTPException(400, f"A page with slug '{slug}' already exists")
        doc = {
            "id": uuid.uuid4().hex,
            "title": title,
            "slug": slug,
            "meta_description": (payload.get("meta_description") or "").strip()[:280],
            "meta_keywords": [str(k).strip() for k in (payload.get("meta_keywords") or []) if str(k).strip()][:20],
            "hero_eyebrow": (payload.get("hero_eyebrow") or "").strip()[:80],
            "hero_headline": (payload.get("hero_headline") or title).strip()[:200],
            "hero_subhead": (payload.get("hero_subhead") or "").strip()[:400],
            "hero_image_url": (payload.get("hero_image_url") or "").strip(),
            "sections": payload.get("sections") or [],
            "cta_label": (payload.get("cta_label") or "").strip()[:60],
            "cta_url": (payload.get("cta_url") or "").strip(),
            "theme_id": (payload.get("theme_id") or "").strip(),
            "og_image_url": (payload.get("og_image_url") or "").strip(),
            "status": "draft",
            "ai_generated": bool(payload.get("ai_generated", False)),
            "created_at": _now(),
            "updated_at": _now(),
            "published_at": None,
            "created_by": user.get("email", ""),
        }
        await db.wxm_pages.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.patch("/wxm/pages/{rid}")
    async def update_page(rid: str, payload: Dict[str, Any], user=Depends(get_current_user)):
        await _priv(user)
        existing = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Page not found")
        updates: Dict[str, Any] = {}
        ALLOWED = {
            "title", "meta_description", "hero_eyebrow", "hero_headline",
            "hero_subhead", "hero_image_url", "cta_label", "cta_url",
            "theme_id", "og_image_url",
        }
        for k in ALLOWED:
            if k in payload:
                v = payload[k]
                if isinstance(v, str):
                    v = v.strip()
                updates[k] = v
        if "slug" in payload and payload["slug"]:
            new_slug = _slugify(payload["slug"])
            if new_slug != existing["slug"]:
                if await db.wxm_pages.find_one({"slug": new_slug, "id": {"$ne": rid}}, {"_id": 0, "id": 1}):
                    raise HTTPException(400, f"A page with slug '{new_slug}' already exists")
                updates["slug"] = new_slug
        if "meta_keywords" in payload:
            updates["meta_keywords"] = [str(k).strip() for k in (payload.get("meta_keywords") or []) if str(k).strip()][:20]
        if "sections" in payload:
            updates["sections"] = payload["sections"]
        updates["updated_at"] = _now()
        await db.wxm_pages.update_one({"id": rid}, {"$set": updates})
        row = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        return row

    @api.post("/wxm/pages/{rid}/publish")
    async def publish_page(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        existing = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Page not found")
        await db.wxm_pages.update_one(
            {"id": rid},
            {"$set": {"status": "published", "published_at": _now(), "updated_at": _now()}},
        )
        row = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        return row

    @api.post("/wxm/pages/{rid}/unpublish")
    async def unpublish_page(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        await db.wxm_pages.update_one(
            {"id": rid},
            {"$set": {"status": "draft", "updated_at": _now()}},
        )
        row = await db.wxm_pages.find_one({"id": rid}, {"_id": 0})
        return row

    @api.delete("/wxm/pages/{rid}")
    async def delete_page(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        r = await db.wxm_pages.delete_one({"id": rid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Page not found")
        return {"ok": True}

    # AI assist — drafts SEO-optimised page content from a single prompt.
    @api.post("/wxm/pages/ai-draft")
    async def page_ai_draft(payload: Dict[str, Any], user=Depends(get_current_user)):
        await _priv(user)
        topic = (payload.get("topic") or payload.get("title") or "").strip()
        if not topic:
            raise HTTPException(400, "Provide a topic or title")
        audience = (payload.get("audience") or "engineering decision-makers").strip()
        tone = (payload.get("tone") or "confident · concise · technical").strip()
        primary_kw = (payload.get("primary_keyword") or topic).strip()

        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Add EMERGENT_LLM_KEY / OPENAI / ANTHROPIC / GEMINI in Settings → AI.")

        system_msg = (
            "You are a senior B2B SaaS copywriter who writes SEO-optimised landing pages "
            "that convert. You always return STRICT JSON — no markdown fences, no commentary. "
            "Sections must be production-ready, scannable, and rich with proof + specifics."
        )
        user_msg = f"""Draft a complete SEO-optimised landing page for Projexino.

TOPIC: {topic}
AUDIENCE: {audience}
TONE: {tone}
PRIMARY KEYWORD: {primary_kw}

Return JSON with EXACTLY these keys:
{{
  "title": "<title tag, 50–60 chars, includes primary keyword>",
  "slug": "<url-slug-lowercase-hyphenated>",
  "meta_description": "<150–160 chars, primary keyword in first 100 chars, ends with a CTA>",
  "meta_keywords": ["<5–8 relevant keywords>"],
  "hero_eyebrow": "<2-4 word kicker, e.g. 'For modern teams'>",
  "hero_headline": "<8–12 word value-prop headline>",
  "hero_subhead": "<25–35 words elaborating value, no fluff>",
  "cta_label": "<3–5 word action button, e.g. 'Book a demo'>",
  "sections": [
    {{"type": "intro", "heading": "<H2>", "body": "<2–3 sentences, mention primary keyword>"}},
    {{"type": "features", "heading": "Why teams pick us", "items": [
      {{"title": "<feature>", "description": "<1-sentence benefit>"}},
      {{"title": "<feature>", "description": "<1-sentence benefit>"}},
      {{"title": "<feature>", "description": "<1-sentence benefit>"}},
      {{"title": "<feature>", "description": "<1-sentence benefit>"}}
    ]}},
    {{"type": "proof", "heading": "Built for outcomes", "body": "<2–3 sentences with concrete metrics or quotes>"}},
    {{"type": "process", "heading": "How it works", "steps": [
      {{"title": "<step name>", "description": "<one sentence>"}},
      {{"title": "<step name>", "description": "<one sentence>"}},
      {{"title": "<step name>", "description": "<one sentence>"}}
    ]}},
    {{"type": "faq", "heading": "Common questions", "items": [
      {{"q": "<question 1>", "a": "<answer 1>"}},
      {{"q": "<question 2>", "a": "<answer 2>"}},
      {{"q": "<question 3>", "a": "<answer 3>"}}
    ]}}
  ]
}}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.55)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        import json as _json
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            raise HTTPException(502, "AI returned non-JSON")
        try:
            data = _json.loads(m.group(0))
        except Exception:
            raise HTTPException(502, "AI JSON parse failed")
        # Sanitise
        data["title"] = (data.get("title") or topic)[:120]
        data["slug"] = _slugify(data.get("slug") or topic)
        data["meta_description"] = (data.get("meta_description") or "")[:280]
        data["meta_keywords"] = (data.get("meta_keywords") or [])[:20]
        data["ai_generated"] = True
        return data

    # Public read — for the renderer at /page/:slug
    @api.get("/public/wxm/pages/{slug}")
    async def public_get_page(slug: str):
        row = await db.wxm_pages.find_one({"slug": slug, "status": "published"}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Page not found")
        # Hydrate theme if attached
        if row.get("theme_id"):
            theme = await db.wxm_themes.find_one({"id": row["theme_id"]}, {"_id": 0})
            row["theme"] = theme
        return row

