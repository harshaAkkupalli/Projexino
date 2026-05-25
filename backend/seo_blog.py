"""
seo_blog.py — SEO sitemap + Blog CMS for Projexino public site.

Endpoints:
  GET    /api/sitemap.xml              Dynamic sitemap (static routes + blog posts)
  GET    /api/blog/posts               Public list of published posts (paged)
  GET    /api/blog/posts/{slug}        Public single post by slug
  GET    /api/blog/tags                Public tag cloud
  POST   /api/admin/blog/posts         Admin create draft post
  PUT    /api/admin/blog/posts/{id}    Admin update post
  DELETE /api/admin/blog/posts/{id}    Admin delete
  POST   /api/admin/blog/posts/{id}/publish   Publish / unpublish
  GET    /api/admin/blog/posts         Admin list (all statuses)

Posts are stored in MongoDB `blog_posts` with the BlogPost schema below.
"""
from __future__ import annotations
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Body, Query, Response
from pydantic import BaseModel, Field

SITE_URL = "https://www.projexino.com"

# Static public routes included in the sitemap.
STATIC_ROUTES: List[Dict[str, Any]] = [
    {"loc": "/", "priority": "1.0", "changefreq": "weekly"},
    {"loc": "/services", "priority": "0.9", "changefreq": "weekly"},
    {"loc": "/services/ai-driven-development", "priority": "0.9", "changefreq": "monthly"},
    {"loc": "/services/app-development", "priority": "0.9", "changefreq": "monthly"},
    {"loc": "/services/chatgpt-solutions", "priority": "0.85", "changefreq": "monthly"},
    {"loc": "/services/cross-platform-development", "priority": "0.85", "changefreq": "monthly"},
    {"loc": "/services/saas-development", "priority": "0.9", "changefreq": "monthly"},
    {"loc": "/services/ios-android-development", "priority": "0.85", "changefreq": "monthly"},
    {"loc": "/services/industry-focused-solutions", "priority": "0.8", "changefreq": "monthly"},
    {"loc": "/services/app-maintenance-support", "priority": "0.8", "changefreq": "monthly"},
    {"loc": "/portfolio", "priority": "0.85", "changefreq": "weekly"},
    {"loc": "/about", "priority": "0.7", "changefreq": "monthly"},
    {"loc": "/contact", "priority": "0.75", "changefreq": "monthly"},
    {"loc": "/blog", "priority": "0.9", "changefreq": "daily"},
    {"loc": "/app-development-india", "priority": "0.95", "changefreq": "monthly"},
    {"loc": "/app-development-usa", "priority": "0.95", "changefreq": "monthly"},
    {"loc": "/app-development-uk", "priority": "0.95", "changefreq": "monthly"},
    {"loc": "/mobile-app-development-company", "priority": "0.95", "changefreq": "monthly"},
    {"loc": "/saas-development-company", "priority": "0.9", "changefreq": "monthly"},
    {"loc": "/ai-development-company", "priority": "0.95", "changefreq": "monthly"},
    {"loc": "/privacy", "priority": "0.3", "changefreq": "yearly"},
    {"loc": "/terms", "priority": "0.3", "changefreq": "yearly"},
]


def _slugify(text: str) -> str:
    t = (text or "").lower().strip()
    t = re.sub(r"[^a-z0-9\s-]", "", t)
    t = re.sub(r"\s+", "-", t)
    t = re.sub(r"-+", "-", t)
    return t.strip("-")[:80] or f"post-{uuid.uuid4().hex[:6]}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class BlogPostIn(BaseModel):
    title: str = Field(..., min_length=3, max_length=180)
    slug: Optional[str] = None
    excerpt: Optional[str] = ""
    cover_image: Optional[str] = ""
    content_html: str = Field(..., min_length=10)
    tags: List[str] = Field(default_factory=list)
    author_name: Optional[str] = "Projexino"
    seo_title: Optional[str] = ""
    seo_description: Optional[str] = ""
    seo_keywords: List[str] = Field(default_factory=list)
    status: str = "draft"  # draft | published


def _public_view(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Strip Mongo internals for response."""
    doc.pop("_id", None)
    return doc


def register_seo_blog(api: APIRouter, db, get_current_user):

    async def _require_admin(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager"):
            raise HTTPException(403, "Admin / manager only")
        return user

    # ---------- SITEMAP ----------
    @api.get("/sitemap.xml")
    async def sitemap():
        rows = []
        rows.append('<?xml version="1.0" encoding="UTF-8"?>')
        rows.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
        for r in STATIC_ROUTES:
            rows.append(
                f'  <url><loc>{SITE_URL}{r["loc"]}</loc>'
                f'<changefreq>{r["changefreq"]}</changefreq>'
                f'<priority>{r["priority"]}</priority></url>'
            )
        # Append published blog posts
        cursor = db.blog_posts.find(
            {"status": "published"},
            {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1},
        ).sort("published_at", -1).limit(5000)
        async for post in cursor:
            slug = post.get("slug")
            if not slug:
                continue
            lastmod = post.get("updated_at") or post.get("published_at") or ""
            lm_xml = f"<lastmod>{xml_escape(lastmod)}</lastmod>" if lastmod else ""
            rows.append(
                f'  <url><loc>{SITE_URL}/blog/{xml_escape(slug)}</loc>'
                f'{lm_xml}<changefreq>monthly</changefreq><priority>0.7</priority></url>'
            )
        rows.append("</urlset>")
        xml = "\n".join(rows)
        return Response(content=xml, media_type="application/xml")

    # ---------- PUBLIC BLOG ----------
    @api.get("/blog/posts")
    async def list_published(
        tag: Optional[str] = None,
        q: Optional[str] = None,
        limit: int = Query(20, ge=1, le=100),
        skip: int = Query(0, ge=0),
    ):
        query: Dict[str, Any] = {"status": "published"}
        if tag:
            query["tags"] = tag
        if q:
            query["$or"] = [
                {"title": {"$regex": re.escape(q), "$options": "i"}},
                {"excerpt": {"$regex": re.escape(q), "$options": "i"}},
                {"tags": {"$regex": re.escape(q), "$options": "i"}},
            ]
        cursor = (
            db.blog_posts.find(
                query,
                {"_id": 0, "content_html": 0},
            )
            .sort("published_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = [doc async for doc in cursor]
        total = await db.blog_posts.count_documents(query)
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    @api.get("/blog/posts/{slug}")
    async def get_published(slug: str):
        doc = await db.blog_posts.find_one(
            {"slug": slug, "status": "published"}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(404, "Post not found")
        # Increment view counter (best-effort)
        try:
            await db.blog_posts.update_one(
                {"slug": slug}, {"$inc": {"views": 1}}
            )
        except Exception:
            pass
        return doc

    @api.get("/blog/tags")
    async def tag_cloud():
        pipeline = [
            {"$match": {"status": "published"}},
            {"$unwind": "$tags"},
            {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 50},
        ]
        out = []
        async for row in db.blog_posts.aggregate(pipeline):
            out.append({"tag": row["_id"], "count": row["count"]})
        return out

    # ---------- ADMIN BLOG ----------
    @api.get("/admin/blog/posts")
    async def admin_list_all(
        status: Optional[str] = None,
        user=Depends(_require_admin),
        limit: int = Query(50, ge=1, le=200),
        skip: int = Query(0, ge=0),
    ):
        query: Dict[str, Any] = {}
        if status in ("draft", "published"):
            query["status"] = status
        cursor = (
            db.blog_posts.find(query, {"_id": 0, "content_html": 0})
            .sort("updated_at", -1)
            .skip(skip)
            .limit(limit)
        )
        items = [doc async for doc in cursor]
        total = await db.blog_posts.count_documents(query)
        return {"items": items, "total": total}

    @api.get("/admin/blog/posts/{post_id}")
    async def admin_get(post_id: str, user=Depends(_require_admin)):
        doc = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        return doc

    @api.post("/admin/blog/posts")
    async def admin_create(payload: BlogPostIn, user=Depends(_require_admin)):
        post_id = uuid.uuid4().hex
        slug = _slugify(payload.slug or payload.title)
        # ensure slug uniqueness
        if await db.blog_posts.find_one({"slug": slug}, {"_id": 1}):
            slug = f"{slug}-{post_id[:5]}"
        now = _now()
        doc = {
            "id": post_id,
            "slug": slug,
            "title": payload.title,
            "excerpt": payload.excerpt or "",
            "cover_image": payload.cover_image or "",
            "content_html": payload.content_html,
            "tags": [t.strip() for t in (payload.tags or []) if t.strip()],
            "author_name": payload.author_name or "Projexino",
            "author_email": user.get("email"),
            "seo_title": payload.seo_title or payload.title,
            "seo_description": payload.seo_description or (payload.excerpt or "")[:160],
            "seo_keywords": payload.seo_keywords or [],
            "status": "draft",
            "views": 0,
            "created_at": now,
            "updated_at": now,
            "published_at": now if payload.status == "published" else None,
        }
        if payload.status == "published":
            doc["status"] = "published"
        await db.blog_posts.insert_one(doc)
        return _public_view(doc)

    @api.put("/admin/blog/posts/{post_id}")
    async def admin_update(post_id: str, payload: BlogPostIn, user=Depends(_require_admin)):
        existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        new_slug = _slugify(payload.slug or existing.get("slug") or payload.title)
        if new_slug != existing.get("slug"):
            clash = await db.blog_posts.find_one(
                {"slug": new_slug, "id": {"$ne": post_id}}, {"_id": 1}
            )
            if clash:
                new_slug = f"{new_slug}-{post_id[:5]}"
        update = {
            "slug": new_slug,
            "title": payload.title,
            "excerpt": payload.excerpt or "",
            "cover_image": payload.cover_image or "",
            "content_html": payload.content_html,
            "tags": [t.strip() for t in (payload.tags or []) if t.strip()],
            "author_name": payload.author_name or existing.get("author_name", "Projexino"),
            "seo_title": payload.seo_title or payload.title,
            "seo_description": payload.seo_description or (payload.excerpt or "")[:160],
            "seo_keywords": payload.seo_keywords or [],
            "updated_at": _now(),
        }
        if payload.status == "published" and existing.get("status") != "published":
            update["status"] = "published"
            update["published_at"] = _now()
        elif payload.status == "draft":
            update["status"] = "draft"
        await db.blog_posts.update_one({"id": post_id}, {"$set": update})
        merged = {**existing, **update}
        return _public_view(merged)

    @api.delete("/admin/blog/posts/{post_id}")
    async def admin_delete(post_id: str, user=Depends(_require_admin)):
        r = await db.blog_posts.delete_one({"id": post_id})
        if not r.deleted_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @api.post("/admin/blog/posts/{post_id}/publish")
    async def admin_publish(post_id: str, user=Depends(_require_admin)):
        existing = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Not found")
        new_status = "draft" if existing.get("status") == "published" else "published"
        update: Dict[str, Any] = {"status": new_status, "updated_at": _now()}
        if new_status == "published":
            update["published_at"] = existing.get("published_at") or _now()
        await db.blog_posts.update_one({"id": post_id}, {"$set": update})
        return {"id": post_id, "status": new_status}
