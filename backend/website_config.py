"""
website_config.py — Super-admin-managed site CMS.

Edit headlines, taglines, contact info, social links, footer copy, etc., across
every public page without redeploying. A single MongoDB document at
`site_config` (id = "default") holds the structured config.

Public endpoint:
  GET    /api/website-config            — full config (no auth) for SSR / SPA hydration.

Super-admin endpoints:
  PUT    /api/admin/website-config      — replace the entire config (super_admin only).
  PATCH  /api/admin/website-config      — deep-merge a partial update.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Body

DEFAULT_CONFIG: Dict[str, Any] = {
    "brand": {
        "name": "Projexino",
        "tagline": "Engineering the Future of Operations.",
        "established": "2018",
        "primary_color": "#F97316",
        "deep_color": "#0F2042",
    },
    "contact": {
        "email": "hello@projexino.com",
        "phone": "+91 98765 43210",
        "address": "India",
        "website": "www.projexino.com",
        "support_email": "support@projexino.com",
        "billing_email": "billing@projexino.com",
        "office_hours": "Mon-Fri · 10:00 - 19:00 IST",
    },
    "socials": {
        "linkedin": "https://www.linkedin.com/company/projexino",
        "twitter": "https://twitter.com/projexino",
        "instagram": "https://www.instagram.com/projexino",
        "github": "",
        "youtube": "",
        "facebook": "https://www.facebook.com/projexino",
    },
    "hero": {
        "eyebrow": "Transforming Ideas into Digital Reality",
        "headline_1": "Next-Generation",
        "headline_2_italic": "Development",
        "headline_3": "Solutions.",
        "subheadline": (
            "Projexino crafts AI-driven, cross-platform mobile, web and SaaS products "
            "for ambitious startups and enterprises across India, USA, UK and globally. "
            "Senior engineers. Two-week sprints. Friday demos."
        ),
        "cta_primary_label": "Start your project",
        "cta_primary_link": "/contact",
        "cta_secondary_label": "See our work",
        "cta_secondary_link": "/portfolio",
    },
    "about": {
        "title": "Who we are",
        "body": (
            "Projexino is a senior-led digital engineering studio founded in 2018. "
            "We build production-grade mobile, web, AI and SaaS products for startups "
            "and enterprises across India, the USA, the UK and the Middle East. "
            "Our practice is anchored in two-week sprints with Friday demos so progress "
            "is always visible and measurable."
        ),
        "mission": "Ship the future of work for ambitious teams.",
        "values": [
            "Senior bench — no juniors hidden behind a project manager.",
            "Predictable two-week delivery cadence.",
            "AI-native — every feature considered through the lens of AI.",
            "You own the code, the cloud and the customers.",
        ],
    },
    "stats": [
        {"label": "Projects shipped", "value": "500+"},
        {"label": "Happy clients", "value": "100+"},
        {"label": "Years experience", "value": "7+"},
        {"label": "Support", "value": "24/7"},
    ],
    "services": [
        {"title": "AI-Driven Development",
         "slug": "ai-driven-development",
         "summary": "LLM apps, RAG pipelines, autonomous agents on Claude Sonnet 4.5, GPT-5.2 and Gemini 3 with eval harnesses and guardrails."},
        {"title": "App Development",
         "slug": "app-development",
         "summary": "End-to-end mobile + web app development with senior engineers, weekly demos and fixed-scope proposals."},
        {"title": "ChatGPT Solutions",
         "slug": "chatgpt-solutions",
         "summary": "Custom ChatGPT integrations, AI copilots, knowledge bots and workflow automation tailored to your data."},
        {"title": "Cross-Platform Development",
         "slug": "cross-platform-development",
         "summary": "Flutter and React Native apps that ship on iOS, Android and the web from a single codebase."},
        {"title": "SaaS Development",
         "slug": "saas-development",
         "summary": "Multi-tenant SaaS engineering with Stripe billing, RBAC, SSO, audit logs and metered usage."},
        {"title": "iOS & Android Development",
         "slug": "ios-android-development",
         "summary": "Native Swift and Kotlin engineering optimized for performance, App Store and Play Store success."},
        {"title": "Industry-Focused Solutions",
         "slug": "industry-focused-solutions",
         "summary": "Domain expertise in fintech, healthcare, e-commerce, real estate and logistics."},
        {"title": "App Maintenance & Support",
         "slug": "app-maintenance-support",
         "summary": "SLA-backed maintenance plans with 24×7 incident response and proactive monitoring."},
    ],
    "faq": [
        {"q": "What does Projexino do?",
         "a": "Projexino is an AI-driven app development company building production mobile, web and SaaS applications for startups and enterprises across India, the USA, the UK and globally."},
        {"q": "How long does an app take to build?",
         "a": "Most production-grade MVPs ship in 8 to 12 weeks. Complex SaaS or AI products take 16 to 24 weeks. We work in two-week sprints with Friday demos so progress is always visible and measurable."},
        {"q": "How much does app development cost?",
         "a": "A focused MVP usually lands between USD 15,000 and USD 45,000 depending on scope, integrations and platforms. We provide fixed-scope, fixed-price proposals after a free 30-minute discovery call."},
        {"q": "Do you build AI applications?",
         "a": "Yes — AI development is a core practice. We build LLM-powered apps, RAG pipelines and autonomous agents on Claude Sonnet 4.5, GPT-5.2 and Gemini 3."},
        {"q": "Do you sign NDAs and assign IP?",
         "a": "Yes. We sign mutual NDAs before any technical discussion and our standard MSA assigns 100% of the IP to you on payment."},
        {"q": "Which countries do you serve?",
         "a": "Projexino serves clients across India, the USA, the UK, the UAE, Singapore and Australia with time-zone-aligned squads and local-currency billing."},
    ],
    "cta_section": {
        "headline_1": "Ready to Transform Your Ideas Into",
        "headline_2_italic": "Reality",
        "subheadline": "Get a free 30-minute discovery call and a fixed-scope proposal within 48 hours.",
        "cta_label": "Talk to our team",
        "cta_link": "/contact",
    },
    "footer": {
        "tagline": "Engineering the future of operations for ambitious teams.",
        "copyright": "© 2026 Projexino Solutions. All rights reserved.",
        "legal_links": [
            {"label": "Privacy Policy", "href": "/privacy"},
            {"label": "Terms of Service", "href": "/terms"},
        ],
    },
    # Reserved sections that the frontend will read but the admin can extend:
    "industries": ["FinTech", "HealthTech", "EdTech", "SaaS", "E-commerce",
                   "Logistics", "Travel", "Real Estate"],
    "tech_stack": ["Claude 4.5", "GPT-5.2", "Gemini 3", "React 19", "Next.js",
                   "FastAPI", "Flutter", "Swift", "Kotlin", "PostgreSQL",
                   "MongoDB", "Redis", "Stripe", "Kubernetes"],
    "updated_at": None,
    "updated_by": None,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _deep_merge(base: dict, patch: dict) -> dict:
    """Recursively merge patch into base. Lists/scalars in patch fully replace base values."""
    out = dict(base)
    for k, v in (patch or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def register_website_config(api: APIRouter, db, get_current_user):

    async def _load() -> Dict[str, Any]:
        doc = await db.site_config.find_one({"id": "default"}, {"_id": 0}) or {}
        # merge stored over defaults so newly-added fields keep their defaults
        merged = _deep_merge(DEFAULT_CONFIG, doc)
        merged.pop("id", None)
        return merged

    async def _require_super_admin(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin"):
            raise HTTPException(403, "Website config is super-admin only")
        return user

    @api.get("/website-config")
    async def get_config():
        """Public — anyone visiting projexino.com can read the site copy."""
        return await _load()

    @api.put("/admin/website-config")
    async def replace_config(payload: Dict[str, Any] = Body(...), user=Depends(_require_super_admin)):
        merged = _deep_merge(DEFAULT_CONFIG, payload or {})
        merged["updated_at"] = _now()
        merged["updated_by"] = user.get("email") or user.get("id")
        await db.site_config.update_one(
            {"id": "default"},
            {"$set": {"id": "default", **merged}},
            upsert=True,
        )
        merged.pop("id", None)
        return merged

    @api.patch("/admin/website-config")
    async def patch_config(payload: Dict[str, Any] = Body(...), user=Depends(_require_super_admin)):
        current = await _load()
        merged = _deep_merge(current, payload or {})
        merged["updated_at"] = _now()
        merged["updated_by"] = user.get("email") or user.get("id")
        await db.site_config.update_one(
            {"id": "default"},
            {"$set": {"id": "default", **merged}},
            upsert=True,
        )
        merged.pop("id", None)
        return merged
