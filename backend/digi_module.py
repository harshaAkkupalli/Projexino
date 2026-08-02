"""
digi_module.py — Digi · AI-powered Digital Marketing Operating System (Phase 1 MVP)

Collections (Mongo):
  digi_clients       — onboarded client brands with full profile + AI strategies
  digi_brand_kits    — logos / colours / fonts / voice / audience per client
  digi_content       — AI-generated captions / hashtags / blogs / ad copy / scripts
  digi_creatives     — AI-generated images (posters / carousels / banners)
  digi_calendar      — content calendar entries (planned / scheduled / published)
  digi_approvals     — approval workflow records
  digi_metrics       — performance metrics (reach / clicks / leads / ROI)

Endpoints (all behind super_admin/admin/manager/digi_* roles):
  /api/digi/clients                              — CRUD onboarded clients
  /api/digi/clients/{id}/strategies/generate     — AI marketing/content/SEO/ad strategy
  /api/digi/clients/{id}/brand-kit               — get/upsert brand kit
  /api/digi/content/generate                     — captions/hashtags/blog/ad-copy/script
  /api/digi/creatives/generate                   — image (Nano Banana)
  /api/digi/calendar                             — list + create entries
  /api/digi/calendar/{id}                        — update/delete + status transitions
  /api/digi/approvals                            — list + transition
  /api/digi/metrics                              — list + upsert manual metrics
  /api/digi/dashboard                            — single-shot rollup for the OS home
"""

from __future__ import annotations

import base64
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, Body, Depends, Query
from fastapi.responses import JSONResponse


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


_PRIV_ROLES = {"super_admin", "admin", "manager", "hr", "digi_account_manager", "digi_executive", "digi_designer"}


def register(api, db, get_current_user):
    """Mount Digi routes under the given FastAPI router."""

    async def _priv(user=Depends(get_current_user)):
        if (user.get("role") or "").lower() not in _PRIV_ROLES:
            raise HTTPException(403, "You don't have access to Digi")
        return user

    def _slugify(s: str) -> str:
        s = (s or "").lower().strip()
        s = re.sub(r"[^a-z0-9]+", "-", s)
        return s.strip("-")[:80] or uuid.uuid4().hex[:10]

    # ── Clients (Digi onboarded brands) ────────────────────────────
    @api.get("/digi/clients")
    async def digi_list_clients(user=Depends(_priv)):
        rows = await db.digi_clients.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        return rows

    @api.get("/digi/clients/{rid}")
    async def digi_get_client(rid: str, user=Depends(_priv)):
        row = await db.digi_clients.find_one({"id": rid}, {"_id": 0})
        if not row:
            raise HTTPException(404, "Digi client not found")
        # Hydrate brand-kit
        bk = await db.digi_brand_kits.find_one({"client_id": rid}, {"_id": 0})
        row["brand_kit"] = bk or {}
        return row

    @api.post("/digi/clients")
    async def digi_create_client(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Name is required")
        rid = uuid.uuid4().hex
        doc = {
            "id": rid,
            "name": name,
            "slug": _slugify(payload.get("slug") or name),
            "company": (payload.get("company") or "").strip(),
            "industry": (payload.get("industry") or "").strip(),
            "website": (payload.get("website") or "").strip(),
            "target_audience": (payload.get("target_audience") or "").strip(),
            "locations": payload.get("locations") or [],
            "competitors": payload.get("competitors") or [],
            "social_accounts": payload.get("social_accounts") or {},  # {platform: handle/url}
            "primary_email": (payload.get("primary_email") or "").strip(),
            "primary_phone": (payload.get("primary_phone") or "").strip(),
            "status": "onboarding",  # onboarding / active / paused
            "account_manager_email": (payload.get("account_manager_email") or "").strip(),
            "strategies": {},          # populated by /strategies/generate
            "metrics_snapshot": {},
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_clients.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.patch("/digi/clients/{rid}")
    async def digi_update_client(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        existing = await db.digi_clients.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Digi client not found")
        ALLOWED = {"name", "company", "industry", "website", "target_audience",
                   "locations", "competitors", "social_accounts", "primary_email",
                   "primary_phone", "status", "account_manager_email"}
        updates = {k: payload[k] for k in ALLOWED if k in payload}
        if updates:
            updates["updated_at"] = _now()
            await db.digi_clients.update_one({"id": rid}, {"$set": updates})
        row = await db.digi_clients.find_one({"id": rid}, {"_id": 0})
        return row

    @api.delete("/digi/clients/{rid}")
    async def digi_delete_client(rid: str, user=Depends(_priv)):
        r = await db.digi_clients.delete_one({"id": rid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Digi client not found")
        await db.digi_brand_kits.delete_many({"client_id": rid})
        await db.digi_content.delete_many({"client_id": rid})
        await db.digi_creatives.delete_many({"client_id": rid})
        await db.digi_calendar.delete_many({"client_id": rid})
        await db.digi_approvals.delete_many({"client_id": rid})
        await db.digi_metrics.delete_many({"client_id": rid})
        return {"ok": True}

    # ── Brand Kit (one per client) ─────────────────────────────────
    @api.get("/digi/clients/{rid}/brand-kit")
    async def digi_get_brand_kit(rid: str, user=Depends(_priv)):
        row = await db.digi_brand_kits.find_one({"client_id": rid}, {"_id": 0})
        return row or {"client_id": rid}

    @api.put("/digi/clients/{rid}/brand-kit")
    async def digi_upsert_brand_kit(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        if not await db.digi_clients.find_one({"id": rid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Digi client not found")
        doc = {
            "client_id": rid,
            "logo_url": (payload.get("logo_url") or "").strip(),
            "logo_base64": payload.get("logo_base64") or "",
            "primary_color": (payload.get("primary_color") or "#F97316").strip(),
            "accent_color": (payload.get("accent_color") or "#A855F7").strip(),
            "background_color": (payload.get("background_color") or "#0F2042").strip(),
            "heading_font": (payload.get("heading_font") or "Inter").strip(),
            "body_font": (payload.get("body_font") or "Inter").strip(),
            "brand_voice": (payload.get("brand_voice") or "").strip(),
            "target_audience": (payload.get("target_audience") or "").strip(),
            "design_guidelines": (payload.get("design_guidelines") or "").strip(),
            "updated_at": _now(),
            "updated_by": user.get("email", ""),
        }
        await db.digi_brand_kits.update_one(
            {"client_id": rid},
            {"$set": doc, "$setOnInsert": {"id": uuid.uuid4().hex, "created_at": _now()}},
            upsert=True,
        )
        out = await db.digi_brand_kits.find_one({"client_id": rid}, {"_id": 0})
        return out

    # ── AI Marketing Strategist ────────────────────────────────────
    @api.post("/digi/clients/{rid}/strategies/generate")
    async def digi_generate_strategies(rid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        client = await db.digi_clients.find_one({"id": rid}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Digi client not found")
        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Top up your Universal Key in Profile → Universal Key.")

        timeframe = (payload.get("timeframe") or "monthly").strip()
        system_msg = (
            "You are a senior digital marketing consultant at Projexino. "
            "Generate a complete marketing strategy in strict JSON — no markdown. "
            "Be specific, audience-aware, and grounded in the brand context."
        )
        user_msg = f"""Generate a {timeframe} digital marketing strategy.

CLIENT
  Name: {client.get('name')} · Company: {client.get('company') or '-'}
  Industry: {client.get('industry') or '-'}
  Website: {client.get('website') or '-'}
  Audience: {client.get('target_audience') or '-'}
  Locations: {', '.join(client.get('locations') or []) or '-'}
  Competitors: {', '.join(client.get('competitors') or []) or '-'}
  Social handles: {client.get('social_accounts') or {}}

Return JSON with EXACTLY these keys:
{{
  "marketing": {{
    "objective": "<1-sentence top objective>",
    "pillars": ["<pillar1>", "<pillar2>", "<pillar3>", "<pillar4>"],
    "channels": [{{"name":"<channel>","priority":"high|medium|low","notes":"<1-line>"}}],
    "kpis": ["<KPI 1>","<KPI 2>","<KPI 3>"]
  }},
  "content": {{
    "themes": ["<theme1>","<theme2>","<theme3>"],
    "post_frequency": {{"instagram":"3/wk","linkedin":"2/wk","blog":"1/wk"}},
    "content_types": ["reels","carousels","blog","case_study","newsletter"]
  }},
  "seo": {{
    "primary_keywords": ["<kw1>","<kw2>","<kw3>","<kw4>","<kw5>"],
    "long_tail_ideas": ["<lt1>","<lt2>","<lt3>"],
    "technical_actions": ["<action1>","<action2>","<action3>"]
  }},
  "ads": {{
    "recommended_platforms": ["meta","google","linkedin"],
    "monthly_budget_split": {{"meta":40,"google":35,"linkedin":25}},
    "audience_targeting": "<1-2 lines>",
    "creative_themes": ["<theme1>","<theme2>","<theme3>"]
  }},
  "executive_summary": "<3-sentence brief for the account manager>"
}}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.45)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        import json as _json
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            raise HTTPException(502, "AI returned non-JSON")
        try:
            strategies = _json.loads(m.group(0))
        except Exception:
            raise HTTPException(502, "AI JSON parse failed")
        strategies["generated_at"] = _now()
        strategies["timeframe"] = timeframe
        await db.digi_clients.update_one(
            {"id": rid},
            {"$set": {"strategies": strategies, "updated_at": _now()}},
        )
        return strategies

    # ── Manual strategy editor (no AI) ─────────────────────────────
    @api.put("/digi/clients/{rid}/strategies")
    async def digi_save_strategies(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        client = await db.digi_clients.find_one({"id": rid}, {"_id": 0, "id": 1})
        if not client:
            raise HTTPException(404, "Digi client not found")
        strategies = payload.get("strategies") if isinstance(payload.get("strategies"), dict) else payload
        if not isinstance(strategies, dict) or not strategies:
            raise HTTPException(400, "strategies object required")
        strategies = dict(strategies)
        strategies["generated_at"] = _now()
        strategies["source"] = "manual"
        strategies.setdefault("timeframe", "monthly")
        await db.digi_clients.update_one(
            {"id": rid},
            {"$set": {"strategies": strategies, "updated_at": _now()}},
        )
        return strategies

    # ── AI Content Generator ───────────────────────────────────────
    @api.post("/digi/content/generate")
    async def digi_generate_content(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        client_id = (payload.get("client_id") or "").strip()
        kind = (payload.get("kind") or "caption").strip().lower()  # caption/hashtags/cta/blog/ad_copy/video_script
        platform = (payload.get("platform") or "").strip().lower()  # instagram/linkedin/facebook/x/youtube/blog/google_ads
        topic = (payload.get("topic") or "").strip()
        goal = (payload.get("goal") or "engagement").strip()
        tone = (payload.get("tone") or "confident · concise").strip()
        if not topic:
            raise HTTPException(400, "Topic is required")

        client = None
        bk = None
        if client_id:
            client = await db.digi_clients.find_one({"id": client_id}, {"_id": 0})
            bk = await db.digi_brand_kits.find_one({"client_id": client_id}, {"_id": 0})

        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Top up your Universal Key.")

        platform_rules = {
            "instagram": "Hooky first line, 4–6 short paragraphs, 8–12 niche hashtags at end, 1 CTA emoji.",
            "linkedin":  "Pro tone, opinion + insight, 1 short story, 2–3 hashtags, no emojis.",
            "facebook":  "Conversational, 60–120 words, soft CTA.",
            "x":         "≤ 280 chars, 1 strong hook, 2 hashtags max, no fluff.",
            "youtube":   "Compelling 80-char title + 1-paragraph description with timestamps placeholders.",
            "blog":      "800–1200 words, SEO H2/H3 structure, intro/body/conclusion, 1 CTA.",
            "google_ads": "Headline ≤30 chars × 3, Description ≤90 chars × 2, sitelinks ≤25 chars.",
        }
        rules = platform_rules.get(platform, "Adapt the platform conventions tightly.")
        brand_context = ""
        if bk:
            brand_context = f"\nBRAND VOICE: {bk.get('brand_voice') or '-'}\nAUDIENCE: {bk.get('target_audience') or (client or {}).get('target_audience') or '-'}\n"

        system_msg = "You are a senior digital marketing copywriter. Return STRICT JSON only — no markdown fences."
        user_msg = f"""Write a {kind} for {platform or '(generic)'} about: {topic}.
GOAL: {goal}
TONE: {tone}
PLATFORM RULES: {rules}
{brand_context}

Return JSON with EXACTLY these keys (omit irrelevant ones with empty strings):
{{
  "title": "<short label e.g. 'IG Post · Diwali Hook'>",
  "body": "<the main copy>",
  "hashtags": ["#tag1", "#tag2"],
  "cta": "<single-line CTA>",
  "variants": ["<alt-take 1>", "<alt-take 2>"]
}}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.7)
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

        doc = {
            "id": uuid.uuid4().hex,
            "client_id": client_id,
            "kind": kind,
            "platform": platform,
            "topic": topic,
            "goal": goal,
            "tone": tone,
            "title": (data.get("title") or "")[:200],
            "body": data.get("body") or "",
            "hashtags": data.get("hashtags") or [],
            "cta": data.get("cta") or "",
            "variants": data.get("variants") or [],
            "status": "draft",
            "created_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_content.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ── Manual content create (no AI) ──────────────────────────────
    @api.post("/digi/content")
    async def digi_create_content(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        body = (payload.get("body") or "").strip()
        if not body:
            raise HTTPException(400, "Body is required")
        hashtags = payload.get("hashtags") or []
        if isinstance(hashtags, str):
            hashtags = [h.strip() for h in hashtags.replace(",", " ").split() if h.strip()]
        doc = {
            "id": uuid.uuid4().hex,
            "client_id": (payload.get("client_id") or "").strip(),
            "kind": (payload.get("kind") or "caption").strip().lower(),
            "platform": (payload.get("platform") or "").strip().lower(),
            "topic": (payload.get("topic") or "").strip(),
            "goal": (payload.get("goal") or "").strip(),
            "tone": (payload.get("tone") or "").strip(),
            "title": (payload.get("title") or payload.get("topic") or "Manual draft")[:200],
            "body": body[:20000],
            "hashtags": [str(h)[:60] for h in hashtags][:20],
            "cta": (payload.get("cta") or "")[:300],
            "variants": [],
            "status": "draft",
            "source": "manual",
            "created_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_content.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.get("/digi/content")
    async def digi_list_content(client_id: Optional[str] = None, kind: Optional[str] = None,
                                platform: Optional[str] = None, user=Depends(_priv)):
        q: Dict[str, Any] = {}
        if client_id:
            q["client_id"] = client_id
        if kind:
            q["kind"] = kind
        if platform:
            q["platform"] = platform
        rows = await db.digi_content.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return rows

    @api.delete("/digi/content/{rid}")
    async def digi_delete_content(rid: str, user=Depends(_priv)):
        await db.digi_content.delete_one({"id": rid})
        return {"ok": True}

    # ── AI Creative generator ──────────────────────────────────────
    # Phase-1 MVP: generates a brand-styled SVG placeholder with the brand
    # palette + headline overlay. Phase-2 will swap to Nano Banana once
    # Universal Key has budget + image-gen integration is wired.
    @api.post("/digi/creatives/generate")
    async def digi_generate_creative(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        client_id = (payload.get("client_id") or "").strip()
        kind = (payload.get("kind") or "poster").strip().lower()
        prompt = (payload.get("prompt") or "").strip()
        platform = (payload.get("platform") or "instagram").strip().lower()
        headline = (payload.get("headline") or prompt[:60]).strip()
        if not prompt:
            raise HTTPException(400, "Prompt is required")

        bk = None
        if client_id:
            bk = await db.digi_brand_kits.find_one({"client_id": client_id}, {"_id": 0})

        primary = (bk or {}).get("primary_color") or "#F97316"
        accent = (bk or {}).get("accent_color") or "#A855F7"
        bg = (bk or {}).get("background_color") or "#0F2042"

        size_map = {
            "poster": (1080, 1350),
            "carousel": (1080, 1080),
            "banner": (1200, 628),
            "story": (1080, 1920),
            "ad": (1080, 1080),
        }
        w, h = size_map.get(kind, (1080, 1080))

        def _xml_escape(s: str) -> str:
            return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;").replace("'", "&apos;")

        head_safe = _xml_escape(headline)[:80]
        prompt_safe = _xml_escape(prompt)[:140]

        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{bg}"/>
      <stop offset="100%" stop-color="#0a1530"/>
    </linearGradient>
    <radialGradient id="g1" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="{primary}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="{primary}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="15%" cy="85%" r="55%">
      <stop offset="0%" stop-color="{accent}" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="cta" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="{primary}"/>
      <stop offset="100%" stop-color="{accent}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
  <text x="60" y="100" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700"
        letter-spacing="6" fill="{primary}" opacity="0.85">// PROJEXINO · {kind.upper()} · {platform.upper()}</text>
  <foreignObject x="60" y="{int(h * 0.32)}" width="{w - 120}" height="{int(h * 0.45)}">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-family:Inter,Arial,sans-serif;color:#fff;font-size:{max(56, int(w / 18))}px;font-weight:800;line-height:1.05;">
      {head_safe}
    </div>
  </foreignObject>
  <foreignObject x="60" y="{int(h * 0.78)}" width="{w - 120}" height="120">
    <div xmlns="http://www.w3.org/1999/xhtml"
         style="font-family:Inter,Arial,sans-serif;color:#cbd5e1;font-size:22px;line-height:1.45;max-width:80%;">
      {prompt_safe}
    </div>
  </foreignObject>
  <rect x="60" y="{h - 130}" rx="44" ry="44" width="280" height="68" fill="url(#cta)"/>
  <text x="200" y="{h - 86}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">Learn more →</text>
</svg>"""
        import base64 as _b64
        svg_b64 = _b64.b64encode(svg.encode("utf-8")).decode("ascii")

        doc = {
            "id": uuid.uuid4().hex,
            "client_id": client_id,
            "kind": kind,
            "platform": platform,
            "prompt": prompt,
            "headline": headline,
            "image_base64": svg_b64,
            "mime_type": "image/svg+xml",
            "size": {"w": w, "h": h},
            "status": "draft",
            "engine": "svg_placeholder_v1",
            "created_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_creatives.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ── Template Studio save (no AI — SVG built client-side) ───────
    @api.post("/digi/creatives/save")
    async def digi_save_creative(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        svg = (payload.get("svg") or "").strip()
        if not svg.startswith("<svg"):
            raise HTTPException(400, "svg markup required")
        if len(svg) > 500_000:
            raise HTTPException(400, "svg too large")
        import base64 as _b64
        size = payload.get("size") or {}
        doc = {
            "id": uuid.uuid4().hex,
            "client_id": (payload.get("client_id") or "").strip(),
            "kind": (payload.get("kind") or "template").strip().lower(),
            "platform": (payload.get("platform") or "").strip().lower(),
            "prompt": "",
            "template_id": (payload.get("template_id") or "").strip(),
            "headline": (payload.get("headline") or "")[:120],
            "image_base64": _b64.b64encode(svg.encode("utf-8")).decode("ascii"),
            "mime_type": "image/svg+xml",
            "size": {"w": int(size.get("w") or 1080), "h": int(size.get("h") or 1080)},
            "status": "draft",
            "engine": "template_studio_v1",
            "created_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_creatives.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.get("/digi/creatives")
    async def digi_list_creatives(client_id: Optional[str] = None, user=Depends(_priv)):
        q: Dict[str, Any] = {}
        if client_id:
            q["client_id"] = client_id
        cur = db.digi_creatives.find(q, {"_id": 0}).sort("created_at", -1)
        rows = await cur.to_list(200)
        return rows

    @api.delete("/digi/creatives/{rid}")
    async def digi_delete_creative(rid: str, user=Depends(_priv)):
        await db.digi_creatives.delete_one({"id": rid})
        return {"ok": True}

    # ── Content Calendar ───────────────────────────────────────────
    @api.get("/digi/calendar")
    async def digi_list_calendar(client_id: Optional[str] = None,
                                  month: Optional[str] = Query(None, description="YYYY-MM"),
                                  user=Depends(_priv)):
        q: Dict[str, Any] = {}
        if client_id:
            q["client_id"] = client_id
        if month:
            q["scheduled_at"] = {"$gte": f"{month}-01", "$lt": f"{month}-32"}
        rows = await db.digi_calendar.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(500)
        return rows

    @api.post("/digi/calendar")
    async def digi_create_calendar(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        if not payload.get("title"):
            raise HTTPException(400, "Title is required")
        if not payload.get("scheduled_at"):
            raise HTTPException(400, "scheduled_at (YYYY-MM-DD[ HH:MM]) is required")
        doc = {
            "id": uuid.uuid4().hex,
            "client_id": (payload.get("client_id") or "").strip(),
            "title": payload.get("title").strip(),
            "platform": (payload.get("platform") or "").strip().lower(),
            "scheduled_at": payload.get("scheduled_at"),
            "kind": (payload.get("kind") or "post").strip().lower(),  # post/story/reel/blog/ad
            "content_id": payload.get("content_id") or "",
            "creative_id": payload.get("creative_id") or "",
            "notes": payload.get("notes") or "",
            "status": "planned",  # planned / scheduled / approved / published
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_calendar.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.patch("/digi/calendar/{rid}")
    async def digi_update_calendar(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        updates = {k: payload[k] for k in ("title", "platform", "scheduled_at", "kind",
                                            "content_id", "creative_id", "notes", "status") if k in payload}
        if updates:
            updates["updated_at"] = _now()
            await db.digi_calendar.update_one({"id": rid}, {"$set": updates})
        row = await db.digi_calendar.find_one({"id": rid}, {"_id": 0})
        return row

    @api.delete("/digi/calendar/{rid}")
    async def digi_delete_calendar(rid: str, user=Depends(_priv)):
        await db.digi_calendar.delete_one({"id": rid})
        return {"ok": True}

    # ── Approvals (lightweight workflow) ───────────────────────────
    @api.get("/digi/approvals")
    async def digi_list_approvals(client_id: Optional[str] = None, status: Optional[str] = None, user=Depends(_priv)):
        q: Dict[str, Any] = {}
        if client_id:
            q["client_id"] = client_id
        if status:
            q["status"] = status
        rows = await db.digi_approvals.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
        return rows

    @api.post("/digi/approvals")
    async def digi_create_approval(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        doc = {
            "id": uuid.uuid4().hex,
            "client_id": (payload.get("client_id") or "").strip(),
            "item_type": (payload.get("item_type") or "content").strip(),  # content / creative / calendar / campaign
            "item_id": (payload.get("item_id") or "").strip(),
            "title": (payload.get("title") or "").strip(),
            "summary": payload.get("summary") or "",
            "status": "pending_executive",  # pending_executive → pending_client → approved | rejected
            "history": [],
            "created_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.digi_approvals.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.post("/digi/approvals/{rid}/transition")
    async def digi_transition_approval(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        existing = await db.digi_approvals.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Approval not found")
        new_status = (payload.get("status") or "").strip()
        note = payload.get("note") or ""
        VALID = {"pending_executive", "pending_client", "approved", "rejected"}
        if new_status not in VALID:
            raise HTTPException(400, f"Invalid status. Must be one of {sorted(VALID)}")
        history = existing.get("history") or []
        history.append({"at": _now(), "by": user.get("email", ""), "to": new_status, "note": note})
        await db.digi_approvals.update_one(
            {"id": rid}, {"$set": {"status": new_status, "history": history, "updated_at": _now()}}
        )
        return await db.digi_approvals.find_one({"id": rid}, {"_id": 0})

    # ── Metrics (manual entry for MVP) ─────────────────────────────
    @api.get("/digi/metrics")
    async def digi_list_metrics(client_id: Optional[str] = None, user=Depends(_priv)):
        q: Dict[str, Any] = {}
        if client_id:
            q["client_id"] = client_id
        rows = await db.digi_metrics.find(q, {"_id": 0}).sort("date", -1).to_list(500)
        return rows

    @api.post("/digi/metrics")
    async def digi_upsert_metrics(payload: Dict[str, Any] = Body(...), user=Depends(_priv)):
        client_id = (payload.get("client_id") or "").strip()
        date = (payload.get("date") or "").strip()
        if not client_id or not date:
            raise HTTPException(400, "client_id and date are required")
        doc = {
            "client_id": client_id,
            "date": date,
            "platform": (payload.get("platform") or "all").strip().lower(),
            "reach": int(payload.get("reach") or 0),
            "impressions": int(payload.get("impressions") or 0),
            "clicks": int(payload.get("clicks") or 0),
            "engagement": int(payload.get("engagement") or 0),
            "leads": int(payload.get("leads") or 0),
            "conversions": int(payload.get("conversions") or 0),
            "spend": float(payload.get("spend") or 0),
            "revenue": float(payload.get("revenue") or 0),
            "updated_at": _now(),
            "updated_by": user.get("email", ""),
        }
        await db.digi_metrics.update_one(
            {"client_id": client_id, "date": date, "platform": doc["platform"]},
            {"$set": doc, "$setOnInsert": {"id": uuid.uuid4().hex, "created_at": _now()}},
            upsert=True,
        )
        out = await db.digi_metrics.find_one(
            {"client_id": client_id, "date": date, "platform": doc["platform"]}, {"_id": 0}
        )
        return out

    # ── Dashboard rollup ───────────────────────────────────────────
    @api.get("/digi/dashboard")
    async def digi_dashboard(user=Depends(_priv)):
        clients_total = await db.digi_clients.count_documents({})
        active = await db.digi_clients.count_documents({"status": "active"})
        onboarding = await db.digi_clients.count_documents({"status": "onboarding"})
        content_count = await db.digi_content.count_documents({})
        creatives_count = await db.digi_creatives.count_documents({})
        pending_approvals = await db.digi_approvals.count_documents(
            {"status": {"$in": ["pending_executive", "pending_client"]}}
        )
        cal_planned = await db.digi_calendar.count_documents({"status": "planned"})
        cal_scheduled = await db.digi_calendar.count_documents({"status": "scheduled"})
        cal_published = await db.digi_calendar.count_documents({"status": "published"})
        # Latest 5 clients
        recent_clients = await db.digi_clients.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
        # Aggregate metrics totals across all clients (last 90 days approx — string sort works for YYYY-MM-DD)
        metrics_cursor = db.digi_metrics.find({}, {"_id": 0, "reach": 1, "leads": 1, "spend": 1, "revenue": 1, "conversions": 1})
        totals = {"reach": 0, "leads": 0, "spend": 0.0, "revenue": 0.0, "conversions": 0}
        async for m in metrics_cursor:
            totals["reach"] += int(m.get("reach") or 0)
            totals["leads"] += int(m.get("leads") or 0)
            totals["spend"] += float(m.get("spend") or 0)
            totals["revenue"] += float(m.get("revenue") or 0)
            totals["conversions"] += int(m.get("conversions") or 0)
        roi = round(((totals["revenue"] - totals["spend"]) / totals["spend"]) * 100, 1) if totals["spend"] > 0 else 0
        return {
            "clients": {"total": clients_total, "active": active, "onboarding": onboarding},
            "content_drafts": content_count,
            "creatives": creatives_count,
            "pending_approvals": pending_approvals,
            "calendar": {"planned": cal_planned, "scheduled": cal_scheduled, "published": cal_published},
            "metrics": {**totals, "roi_pct": roi},
            "recent_clients": recent_clients,
        }

    return api
