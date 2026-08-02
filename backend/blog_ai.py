"""
blog_ai.py — AI-powered blog drafter & topic suggester for Projexino.

Uses Claude Sonnet 4.5 (via Emergent LLM key + ai_provider) to:
  1. Suggest 5 SEO-optimized blog topics for a given keyword / pillar.
  2. Draft a complete SEO blog post (title, slug, excerpt, body HTML with H2/H3
     hierarchy, internal links to /services/* pages, FAQ, SEO meta).

Endpoints (admin/manager only):
  POST /api/blog/ai/suggest-topics    { keyword, count?, audience? }
  POST /api/blog/ai/draft             { topic, target_keywords[], tone? }

Drafts are returned to the client (NOT auto-saved) so the editor can review
before saving via the existing /api/admin/blog/posts CRUD.
"""
from __future__ import annotations
import json
import re
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ai_provider import chat_completion

# Service slugs are baked in so the AI can construct internal links.
SERVICE_SLUGS = [
    ("ai-driven-development", "AI-Driven Development"),
    ("app-development", "App Development"),
    ("chatgpt-solutions", "ChatGPT Solutions"),
    ("cross-platform-development", "Cross-Platform Development"),
    ("saas-development", "SaaS Development"),
    ("ios-android-development", "iOS / Android Development"),
    ("industry-focused-solutions", "Industry-Focused Solutions"),
    ("app-maintenance-support", "App Maintenance & Support"),
]
LOCATION_SLUGS = [
    "app-development-india", "app-development-usa", "app-development-uk",
    "mobile-app-development-company", "saas-development-company", "ai-development-company",
]


class SuggestTopicsIn(BaseModel):
    keyword: str = Field(..., min_length=2, max_length=120)
    count: int = Field(5, ge=3, le=10)
    audience: Optional[str] = "startup founders and product leaders"


class DraftIn(BaseModel):
    topic: str = Field(..., min_length=5, max_length=240)
    target_keywords: List[str] = Field(default_factory=list)
    tone: Optional[str] = "expert, friendly, practical"


def _extract_json(text: str) -> dict:
    """Tolerantly extract a single JSON object from the LLM output."""
    if not text:
        raise ValueError("Empty AI output")
    # Strip code fences if any
    text = re.sub(r"^```(?:json)?", "", text.strip(), flags=re.IGNORECASE)
    text = re.sub(r"```$", "", text.strip())
    # Find the first { ... } block
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        raise ValueError("AI output did not contain JSON")
    return json.loads(m.group(0))


def register_blog_ai(api: APIRouter, db, get_current_user):

    async def _require_writer(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager"):
            raise HTTPException(403, "Admin / manager only")
        return user

    @api.post("/blog/ai/suggest-topics")
    async def suggest_topics(payload: SuggestTopicsIn, user=Depends(_require_writer)):
        sys_msg = (
            "You are a senior SEO content strategist for Projexino, an AI-driven app, "
            "web and SaaS development company serving India, USA, UK and globally. "
            "Suggest blog topics with high SEO ranking potential — they must combine "
            "search intent + a credible angle the company can write authoritatively "
            "about. Output ONLY valid JSON in this exact shape:\n"
            '{ "topics": [ { "title": "...", "search_intent": "informational|commercial|transactional", '
            '"primary_keyword": "...", "secondary_keywords": ["...","..."], "outline": ["H2 ...","H2 ..."], '
            '"estimated_difficulty": "easy|medium|hard", "why_it_will_rank": "1-sentence reason" } ] }\n'
            "Do not include any prose, only JSON."
        )
        user_msg = (
            f"Pillar keyword: {payload.keyword}\n"
            f"Target audience: {payload.audience}\n"
            f"Suggest {payload.count} topics that have realistic ranking potential for a "
            "mid-authority company site. Mix evergreen guides, listicles, comparison "
            "posts and case-study-style angles. Avoid clickbait. Prefer long-tail."
        )
        try:
            raw = await chat_completion(
                system_message=sys_msg,
                user_message=user_msg,
                session_id=f"blog-topics-{uuid.uuid4().hex[:8]}",
                temperature=0.7,
            )
            data = _extract_json(raw)
            topics = data.get("topics") or []
            if not isinstance(topics, list) or not topics:
                raise ValueError("AI returned no topics")
            return {"topics": topics[: payload.count]}
        except Exception as e:
            raise HTTPException(502, f"AI topic suggestion failed: {e}")

    @api.post("/blog/ai/draft")
    async def draft_post(payload: DraftIn, user=Depends(_require_writer)):
        service_lines = "\n".join(
            f"- /services/{slug} — {title}" for slug, title in SERVICE_SLUGS
        )
        location_lines = "\n".join(f"- /{s}" for s in LOCATION_SLUGS)
        sys_msg = (
            "You are a senior content writer + SEO strategist for Projexino — an AI-driven "
            "app, web and SaaS development company. Write a complete, SEO-optimized blog "
            "post on the topic the user provides. Optimize for Google ranking:\n"
            "1. H1 title with primary keyword near the start, 50-65 chars, compelling.\n"
            "2. Engaging intro paragraph (60-100 words) ending with what the post promises.\n"
            "3. 6-9 H2 sections; use H3 sub-sections where helpful. Each H2 should target a "
            "long-tail variation of the primary keyword.\n"
            "4. ~1,500-2,200 words total. Concrete, specific, practical — no fluff.\n"
            "5. Include at least 2 INTERNAL LINKS from this list (only from this list, no "
            "made-up URLs) where contextually relevant:\n"
            f"{service_lines}\n"
            f"{location_lines}\n"
            "6. End with a 4-question FAQ section (h2='Frequently Asked Questions' + h3 per question).\n"
            "7. End with a short CTA paragraph linking to /contact.\n\n"
            "Output ONLY valid JSON in this exact shape (no prose, no markdown fences):\n"
            "{\n"
            '  "title": "...",\n'
            '  "slug": "kebab-case-slug",\n'
            '  "excerpt": "120-160 char meta description",\n'
            '  "seo_title": "≤ 60 chars",\n'
            '  "seo_description": "≤ 160 chars",\n'
            '  "seo_keywords": ["...","..."],\n'
            '  "tags": ["...","..."],\n'
            '  "content_html": "<h2>...</h2><p>...</p>... (the full article body in HTML; do NOT include the H1 title — the title field is rendered separately)"\n'
            "}\n"
            "All HTML must be clean: <h2>, <h3>, <p>, <ul>, <li>, <ol>, <strong>, <em>, <a href=...>, <blockquote>. "
            "Internal links MUST start with '/' (relative). No images. No script tags."
        )
        kw_line = (
            f"Target keywords (prioritise the first): {', '.join(payload.target_keywords)}"
            if payload.target_keywords else "Target keywords: pick 3-5 high-intent long-tail variations."
        )
        user_msg = (
            f"Topic: {payload.topic}\n"
            f"{kw_line}\n"
            f"Tone: {payload.tone}\n"
            "Write the full post now. Return ONLY the JSON object."
        )
        try:
            raw = await chat_completion(
                system_message=sys_msg,
                user_message=user_msg,
                session_id=f"blog-draft-{uuid.uuid4().hex[:8]}",
                temperature=0.65,
            )
            data = _extract_json(raw)
            # Minimal sanity check
            for required in ("title", "content_html"):
                if not data.get(required):
                    raise ValueError(f"AI output missing '{required}'")
            # Trim oversize fields
            if data.get("seo_title") and len(data["seo_title"]) > 70:
                data["seo_title"] = data["seo_title"][:67] + "..."
            if data.get("seo_description") and len(data["seo_description"]) > 170:
                data["seo_description"] = data["seo_description"][:167] + "..."
            # Ensure tags is a list
            data.setdefault("tags", [])
            data.setdefault("seo_keywords", [])
            data.setdefault("excerpt", "")
            data.setdefault("slug", "")
            return data
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"AI blog draft failed: {e}")
