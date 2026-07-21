"""
linkedin_publisher.py — LinkedIn Company Page auto-publisher for Projexino.

Capabilities
------------
1. 3-legged OAuth 2.0 connect flow for a Page Admin
     GET  /api/linkedin/authorize
     GET  /api/linkedin/callback
2. Connection status + organization picker
     GET  /api/linkedin/status
     POST /api/linkedin/select-organization { organization_urn }
     POST /api/linkedin/disconnect
3. Publish queue (admin/manager approval workflow)
     GET   /api/linkedin/queue
     POST  /api/linkedin/queue                 { blog_slug?, commentary, link_url, image_url?, scheduled_for?, kind? }
     POST  /api/linkedin/queue/{id}/approve    Mark approved → publishes at next slot
     POST  /api/linkedin/queue/{id}/skip       Skip / cancel a queued post
     DELETE /api/linkedin/queue/{id}
     POST  /api/linkedin/queue/{id}/publish-now  Force-publish immediately
4. Auto-drafter: every Mon & Thu the scheduler ensures 2 items are queued
   per week (one blog teaser + one AI-rewritten LinkedIn-native post)
5. Background scheduler `linkedin_scheduler_loop` runs every 60 s.

Notes
-----
* Uses the modern `/rest/posts` Posts API + Images API (NOT legacy /v2/ugcPosts).
* If app is not allowlisted for programmatic refresh tokens, access token is
  good for ~60 days then admin must reconnect.
* Tokens stored in MongoDB collection `linkedin_tokens` (singleton doc id="active").
* Queue stored in `linkedin_queue`.
"""
from __future__ import annotations
import asyncio
import logging
import os
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Body, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ai_provider import chat_completion

log = logging.getLogger("linkedin")

# ----- Configuration -----
CLIENT_ID = os.environ.get("LINKEDIN_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get(
    "LINKEDIN_REDIRECT_URI",
    "https://www.projexino.com/api/linkedin/callback",
)
API_VERSION = os.environ.get("LINKEDIN_API_VERSION", "202605")
PUBLIC_FRONTEND_URL = os.environ.get("PUBLIC_FRONTEND_URL", "https://www.projexino.com")

OAUTH_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization"
OAUTH_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
PROFILE_URL = "https://api.linkedin.com/v2/me"
ORG_ACLS_URL = "https://api.linkedin.com/rest/organizationAcls"
ORGS_URL = "https://api.linkedin.com/rest/organizations"
IMAGES_URL = "https://api.linkedin.com/rest/images"
POSTS_URL = "https://api.linkedin.com/rest/posts"

OAUTH_SCOPES = "w_organization_social r_organization_social r_liteprofile"

# Slot rule: Mon + Thu at 10:00 AM IST (= 04:30 UTC).
SLOT_DAYS_UTC = (0, 3)          # Mon=0, Thu=3 (UTC-day after IST shift; 10:00 IST → 04:30 UTC, still same weekday)
SLOT_HOUR_UTC = 4
SLOT_MINUTE_UTC = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


def _strip_mongo(d: Dict[str, Any]) -> Dict[str, Any]:
    d.pop("_id", None)
    return d


# ===========================================================================
# Pydantic models
# ===========================================================================

class QueueIn(BaseModel):
    """Manually enqueue a post (admin form)."""
    commentary: str = Field(..., min_length=10, max_length=2800)
    link_url: Optional[str] = ""
    image_url: Optional[str] = ""
    scheduled_for: Optional[datetime] = None  # if None, takes next available slot
    kind: str = "manual"                       # manual | blog-teaser | ai-native
    blog_slug: Optional[str] = None
    blog_post_id: Optional[str] = None
    auto_approve: bool = False                # Skip approval gate


class SelectOrgIn(BaseModel):
    organization_urn: str = Field(..., pattern=r"^urn:li:organization:\d+$")


# ===========================================================================
# Slot computation: Mon 10:00 IST + Thu 10:00 IST
# ===========================================================================

def _next_slot(after: datetime, used_slots: set[datetime]) -> datetime:
    """Find the next Mon/Thu 10:00 IST (= 04:30 UTC) slot after `after`
    that is not in `used_slots` (so we don't double-book)."""
    d = after.astimezone(timezone.utc)
    # walk day by day for at most 30 days
    for _ in range(60):
        if d.weekday() in SLOT_DAYS_UTC:
            slot = d.replace(hour=SLOT_HOUR_UTC, minute=SLOT_MINUTE_UTC, second=0, microsecond=0)
            if slot > after and slot not in used_slots:
                return slot
        d = d + timedelta(days=1)
        d = d.replace(hour=0, minute=0, second=0, microsecond=0)
    # Fallback — far future
    return after + timedelta(days=3)


async def _used_slots(db) -> set[datetime]:
    cur = db.linkedin_queue.find(
        {"status": {"$in": ["queued", "approved"]}},
        {"_id": 0, "scheduled_for": 1},
    )
    out: set[datetime] = set()
    async for d in cur:
        sf = d.get("scheduled_for")
        if isinstance(sf, datetime):
            out.add(sf.replace(tzinfo=timezone.utc) if sf.tzinfo is None else sf)
    return out


# ===========================================================================
# Token storage / refresh
# ===========================================================================

async def _save_token(db, token: Dict[str, Any]):
    token["updated_at"] = _now()
    await db.linkedin_tokens.update_one(
        {"id": "active"},
        {"$set": {"id": "active", **token}},
        upsert=True,
    )


async def _load_token(db) -> Optional[Dict[str, Any]]:
    return await db.linkedin_tokens.find_one({"id": "active"}, {"_id": 0})


async def _refresh_if_needed(db, tok: Dict[str, Any]) -> Dict[str, Any]:
    expires = tok.get("access_expires_at")
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires and expires - _now() > timedelta(hours=12):
        return tok
    rt = tok.get("refresh_token")
    if not rt:
        return tok  # let downstream call hit 401 if expired
    data = {
        "grant_type": "refresh_token",
        "refresh_token": rt,
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
    }
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(OAUTH_TOKEN_URL, data=data)
        r.raise_for_status()
        j = r.json()
    now = _now()
    tok["access_token"] = j["access_token"]
    tok["access_expires_at"] = now + timedelta(seconds=int(j.get("expires_in", 5184000)))
    if j.get("refresh_token"):
        tok["refresh_token"] = j["refresh_token"]
        tok["refresh_expires_at"] = now + timedelta(seconds=int(j.get("refresh_token_expires_in", 31536000)))
    await _save_token(db, tok)
    return tok


# ===========================================================================
# LinkedIn HTTP helpers
# ===========================================================================

def _li_headers(access_token: str, *, json_body: bool = False) -> Dict[str, str]:
    h = {
        "Authorization": f"Bearer {access_token}",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": API_VERSION,
    }
    if json_body:
        h["Content-Type"] = "application/json"
    return h


async def _fetch_member_urn(access_token: str) -> str:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.get(PROFILE_URL, headers=_li_headers(access_token))
        r.raise_for_status()
        j = r.json()
    return f"urn:li:person:{j['id']}"


async def _fetch_admin_orgs(access_token: str) -> List[Dict[str, str]]:
    """Return list of {urn, name} for pages this member can admin."""
    params = {
        "q": "roleAssignee",
        "role": "ADMINISTRATOR",
        "state": "APPROVED",
    }
    async with httpx.AsyncClient(timeout=25) as c:
        r = await c.get(ORG_ACLS_URL, headers=_li_headers(access_token), params=params)
        r.raise_for_status()
        data = r.json()
    urns: List[str] = []
    for el in data.get("elements", []):
        u = el.get("organization")
        if u and u.startswith("urn:li:organization:"):
            urns.append(u)
    orgs: List[Dict[str, str]] = []
    # Resolve to names via Organization Lookup (best effort)
    for urn in urns:
        oid = urn.split(":")[-1]
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.get(f"{ORGS_URL}/{oid}", headers=_li_headers(access_token))
                r.raise_for_status()
                jd = r.json()
            name = (jd.get("localizedName") or jd.get("name") or {}).get("localized", {}).get("en_US") \
                if isinstance(jd.get("name"), dict) else jd.get("localizedName") or oid
            orgs.append({"urn": urn, "name": name or f"Org {oid}"})
        except Exception:
            orgs.append({"urn": urn, "name": f"Org {oid}"})
    return orgs


async def _upload_image(access_token: str, owner_urn: str, image_bytes: bytes, content_type: str = "image/jpeg") -> str:
    init_body = {"initializeUploadRequest": {"owner": owner_urn}}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"{IMAGES_URL}?action=initializeUpload",
            headers=_li_headers(access_token, json_body=True),
            json=init_body,
        )
        r.raise_for_status()
        val = r.json().get("value") or {}
        upload_url = val.get("uploadUrl")
        image_urn = val.get("image")
        if not (upload_url and image_urn):
            raise RuntimeError("LinkedIn did not return uploadUrl/image")
        # Upload binary
        up = await c.put(upload_url, content=image_bytes, headers={"Content-Type": content_type})
        up.raise_for_status()
    return image_urn


async def _download(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as c:
        r = await c.get(url)
        r.raise_for_status()
        return r.content, r.headers.get("content-type", "image/jpeg")


async def _create_post(
    access_token: str,
    author_urn: str,
    commentary: str,
    image_urn: Optional[str] = None,
) -> str:
    """Create a /rest/posts entry. Returns the resulting post URN."""
    body: Dict[str, Any] = {
        "author": author_urn,
        "commentary": commentary,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if image_urn:
        body["content"] = {"media": {"id": image_urn}}
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(POSTS_URL, headers=_li_headers(access_token, json_body=True), json=body)
        r.raise_for_status()
        return r.headers.get("x-restli-id") or r.headers.get("X-RestLi-Id") or ""


# ===========================================================================
# AI: rewrite a blog into a LinkedIn-native post
# ===========================================================================

async def _ai_native_linkedin_post(blog_post: Dict[str, Any]) -> str:
    """Rewrite a blog into a strong LinkedIn-native post (commentary text only)."""
    sys = (
        "You are a senior LinkedIn copywriter for Projexino — an AI-driven app, web "
        "and SaaS development company. Rewrite the provided blog post into a strong "
        "LinkedIn-native post for a B2B company page audience.\n"
        "Rules:\n"
        "• 900-1300 characters total (LinkedIn limit 3000).\n"
        "• First line is a hook (curiosity / counter-intuitive / bold stat).\n"
        "• Short lines, lots of line breaks for mobile reading.\n"
        "• 3-5 punchy body paragraphs with a single insight each.\n"
        "• End with a soft CTA + the link to the full article.\n"
        "• 4-6 relevant hashtags on the last line (#AppDevelopment etc).\n"
        "• Do NOT use markdown. Plain text + emoji bullets okay.\n"
        "Output ONLY the post text — no JSON, no commentary."
    )
    user = (
        f"Title: {blog_post.get('title','')}\n"
        f"Excerpt: {blog_post.get('excerpt','')}\n"
        f"Tags: {', '.join(blog_post.get('tags') or [])}\n"
        f"Article URL: https://www.projexino.com/blog/{blog_post.get('slug','')}\n\n"
        f"Body (truncated):\n{(blog_post.get('content_html','') or '')[:3000]}"
    )
    out = await chat_completion(
        system_message=sys, user_message=user,
        session_id=f"li-native-{blog_post.get('slug','')}",
        temperature=0.7,
    )
    return out.strip()


def _teaser_commentary(blog_post: Dict[str, Any]) -> str:
    title = blog_post.get("title", "").strip()
    excerpt = (blog_post.get("excerpt") or "").strip()
    tags = blog_post.get("tags") or []
    link = f"https://www.projexino.com/blog/{blog_post.get('slug','')}"
    hashtags = " ".join(f"#{t.replace(' ', '')}" for t in tags[:5]) or "#AppDevelopment #SaaS #AI"
    body = f"🚀 New on the Projexino journal:\n\n{title}\n"
    if excerpt:
        body += f"\n{excerpt}\n"
    body += f"\nRead the full article → {link}\n\n{hashtags}"
    return body


# ===========================================================================
# Router registration
# ===========================================================================

def _derive_redirect_uri(request: Optional[Request]) -> str:
    """Use the explicit env value if set; otherwise auto-derive from the
    incoming request (so hosting on www.projexino.com vs. preview vs. localhost
    all 'just work' without env tweaks).
    """
    if os.environ.get("LINKEDIN_REDIRECT_URI"):
        return os.environ["LINKEDIN_REDIRECT_URI"]
    if request is not None:
        # Honor reverse-proxy headers from nginx/ingress
        proto = (request.headers.get("x-forwarded-proto")
                 or request.url.scheme or "https")
        host = (request.headers.get("x-forwarded-host")
                or request.headers.get("host")
                or request.url.netloc)
        if host:
            return f"{proto}://{host}/api/linkedin/callback"
    return REDIRECT_URI  # final fallback (module-level default)


def register_linkedin(api: APIRouter, db, get_current_user):

    async def _require_admin(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager"):
            raise HTTPException(403, "Admin / manager only")
        return user

    # ---------- OAuth ----------

    @api.get("/linkedin/authorize")
    async def authorize(request: Request, user=Depends(_require_admin)):
        if not CLIENT_ID:
            raise HTTPException(500, "LinkedIn integration not configured")
        state = secrets.token_urlsafe(18)
        redirect_uri = _derive_redirect_uri(request)
        await db.linkedin_oauth_states.insert_one({
            "state": state,
            "user_id": user.get("id"),
            "redirect_uri": redirect_uri,
            "created_at": _now(),
        })
        params = {
            "response_type": "code",
            "client_id": CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": OAUTH_SCOPES,
            "state": state,
        }
        return {"authorize_url": f"{OAUTH_AUTH_URL}?{urlencode(params)}",
                "redirect_uri": redirect_uri}

    @api.get("/linkedin/callback")
    async def callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
        # Land users back on the *same domain* they started from, not a hard-coded preview URL.
        derived_redir = _derive_redirect_uri(request)
        # Strip the /api/linkedin/callback suffix to get the site root
        ui_base = derived_redir.replace("/api/linkedin/callback", "").rstrip("/") or PUBLIC_FRONTEND_URL.rstrip("/")
        if error or not code or not state:
            return RedirectResponse(f"{ui_base}/app/linkedin?linkedin=error&reason={error or 'missing-code'}")
        st = await db.linkedin_oauth_states.find_one_and_delete({"state": state})
        if not st:
            return RedirectResponse(f"{ui_base}/app/linkedin?linkedin=error&reason=invalid-state")
        # Use the SAME redirect_uri that was sent at authorize-time (LinkedIn requires exact match)
        redirect_uri = st.get("redirect_uri") or derived_redir
        # Exchange code for token
        try:
            async with httpx.AsyncClient(timeout=25) as c:
                r = await c.post(OAUTH_TOKEN_URL, data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": redirect_uri,
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                })
                if r.status_code >= 400:
                    log.warning("LinkedIn token exchange failed: %s %s", r.status_code, r.text)
                    # Surface LinkedIn's error to the UI so the admin can see it
                    try:
                        err_j = r.json()
                        reason = (err_j.get("error_description") or err_j.get("error") or "")[:200]
                    except Exception:
                        reason = r.text[:200]
                    return RedirectResponse(f"{ui_base}/app/linkedin?linkedin=error&reason={reason}")
                r.raise_for_status()
                tok_j = r.json()
            access_token = tok_j["access_token"]
            now = _now()
            tok_doc = {
                "access_token": access_token,
                "access_expires_at": now + timedelta(seconds=int(tok_j.get("expires_in", 5184000))),
                "refresh_token": tok_j.get("refresh_token"),
                "refresh_expires_at": now + timedelta(seconds=int(tok_j["refresh_token_expires_in"]))
                if tok_j.get("refresh_token_expires_in") else None,
                "scope": tok_j.get("scope", OAUTH_SCOPES),
                "connected_at": now,
            }
            # Fetch member URN + admined orgs
            try:
                tok_doc["member_urn"] = await _fetch_member_urn(access_token)
            except Exception as e:
                log.exception("fetch_member_urn failed: %s", e)
            try:
                orgs = await _fetch_admin_orgs(access_token)
                tok_doc["organizations"] = orgs
                if orgs and not tok_doc.get("selected_org_urn"):
                    tok_doc["selected_org_urn"] = orgs[0]["urn"]
                    tok_doc["selected_org_name"] = orgs[0]["name"]
            except Exception as e:
                log.exception("fetch_admin_orgs failed: %s", e)
                tok_doc["organizations"] = []
            await _save_token(db, tok_doc)
            return RedirectResponse(f"{ui_base}/app/linkedin?linkedin=connected")
        except Exception as e:
            log.exception("LinkedIn callback error")
            return RedirectResponse(f"{ui_base}/app/linkedin?linkedin=error&reason={str(e)[:80]}")

    # ---------- Status / org selection ----------

    @api.get("/linkedin/status")
    async def status(user=Depends(_require_admin)):
        tok = await _load_token(db)
        if not tok:
            return {"connected": False, "client_id_configured": bool(CLIENT_ID)}
        return {
            "connected": True,
            "member_urn": tok.get("member_urn"),
            "organizations": tok.get("organizations", []),
            "selected_org_urn": tok.get("selected_org_urn"),
            "selected_org_name": tok.get("selected_org_name"),
            "scope": tok.get("scope"),
            "access_expires_at": _iso(tok.get("access_expires_at")),
            "connected_at": _iso(tok.get("connected_at")),
        }

    @api.post("/linkedin/select-organization")
    async def select_org(payload: SelectOrgIn, user=Depends(_require_admin)):
        tok = await _load_token(db)
        if not tok:
            raise HTTPException(400, "Not connected")
        match = next((o for o in tok.get("organizations", []) if o["urn"] == payload.organization_urn), None)
        if not match:
            raise HTTPException(400, "URN not in admined organizations list")
        await db.linkedin_tokens.update_one(
            {"id": "active"},
            {"$set": {"selected_org_urn": match["urn"], "selected_org_name": match["name"]}},
        )
        return {"ok": True, "selected_org_urn": match["urn"], "selected_org_name": match["name"]}

    @api.post("/linkedin/disconnect")
    async def disconnect(user=Depends(_require_admin)):
        await db.linkedin_tokens.delete_many({})
        return {"ok": True}

    # ---------- Queue ----------

    @api.get("/linkedin/queue")
    async def get_queue(
        status: Optional[str] = None,
        user=Depends(_require_admin),
        limit: int = Query(50, ge=1, le=200),
    ):
        q: Dict[str, Any] = {}
        if status:
            q["status"] = status
        cur = db.linkedin_queue.find(q, {"_id": 0}).sort("scheduled_for", 1).limit(limit)
        items = [d async for d in cur]
        return {"items": items}

    @api.post("/linkedin/queue")
    async def add_to_queue(payload: QueueIn, user=Depends(_require_admin)):
        item_id = uuid.uuid4().hex
        used = await _used_slots(db)
        scheduled = payload.scheduled_for or _next_slot(_now(), used)
        if scheduled.tzinfo is None:
            scheduled = scheduled.replace(tzinfo=timezone.utc)
        item = {
            "id": item_id,
            "commentary": payload.commentary,
            "link_url": payload.link_url or "",
            "image_url": payload.image_url or "",
            "scheduled_for": scheduled,
            "kind": payload.kind,
            "blog_slug": payload.blog_slug,
            "blog_post_id": payload.blog_post_id,
            "status": "approved" if payload.auto_approve else "queued",
            "created_at": _now(),
            "created_by": user.get("email"),
            "last_error": None,
            "posted_at": None,
            "linkedin_post_urn": None,
        }
        await db.linkedin_queue.insert_one(item)
        return _strip_mongo(item)

    @api.post("/linkedin/queue/{item_id}/approve")
    async def approve_item(item_id: str, user=Depends(_require_admin)):
        r = await db.linkedin_queue.update_one(
            {"id": item_id, "status": {"$in": ["queued", "skipped"]}},
            {"$set": {"status": "approved", "approved_by": user.get("email"), "approved_at": _now()}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Not found or not approvable")
        return {"ok": True}

    @api.post("/linkedin/queue/{item_id}/skip")
    async def skip_item(item_id: str, user=Depends(_require_admin)):
        r = await db.linkedin_queue.update_one(
            {"id": item_id, "status": {"$in": ["queued", "approved"]}},
            {"$set": {"status": "skipped", "skipped_by": user.get("email"), "skipped_at": _now()}},
        )
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @api.delete("/linkedin/queue/{item_id}")
    async def del_item(item_id: str, user=Depends(_require_admin)):
        r = await db.linkedin_queue.delete_one({"id": item_id})
        if not r.deleted_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @api.post("/linkedin/queue/{item_id}/publish-now")
    async def publish_now(item_id: str, user=Depends(_require_admin)):
        item = await db.linkedin_queue.find_one({"id": item_id}, {"_id": 0})
        if not item:
            raise HTTPException(404, "Not found")
        result = await _publish_one(db, item)
        return result

    @api.post("/linkedin/draft-from-blog/{post_id}")
    async def draft_from_blog(post_id: str, user=Depends(_require_admin)):
        """Create both a teaser queue item AND an AI-native queue item for the given blog post."""
        post = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Blog post not found")
        if post.get("status") != "published":
            raise HTTPException(400, "Publish the blog post first before drafting LinkedIn")
        used = await _used_slots(db)
        slot1 = _next_slot(_now(), used)
        used.add(slot1)
        slot2 = _next_slot(slot1, used)

        teaser = {
            "id": uuid.uuid4().hex,
            "commentary": _teaser_commentary(post),
            "link_url": f"https://www.projexino.com/blog/{post['slug']}",
            "image_url": post.get("cover_image") or "",
            "scheduled_for": slot1,
            "kind": "blog-teaser",
            "blog_slug": post["slug"],
            "blog_post_id": post["id"],
            "status": "queued",
            "created_at": _now(),
            "created_by": user.get("email"),
        }
        try:
            native_text = await _ai_native_linkedin_post(post)
        except Exception as e:
            log.exception("ai_native_linkedin_post failed: %s", e)
            native_text = _teaser_commentary(post)
        native = {
            "id": uuid.uuid4().hex,
            "commentary": native_text,
            "link_url": f"https://www.projexino.com/blog/{post['slug']}",
            "image_url": post.get("cover_image") or "",
            "scheduled_for": slot2,
            "kind": "ai-native",
            "blog_slug": post["slug"],
            "blog_post_id": post["id"],
            "status": "queued",
            "created_at": _now(),
            "created_by": user.get("email"),
        }
        await db.linkedin_queue.insert_many([teaser, native])
        return {"ok": True, "items": [_strip_mongo(teaser), _strip_mongo(native)]}


# ===========================================================================
# Publishing engine + scheduler loop
# ===========================================================================

async def _publish_one(db, item: Dict[str, Any]) -> Dict[str, Any]:
    tok = await _load_token(db)
    if not tok:
        return await _mark_failed(db, item, "LinkedIn not connected")
    org_urn = tok.get("selected_org_urn")
    if not org_urn:
        return await _mark_failed(db, item, "No organization selected")
    try:
        tok = await _refresh_if_needed(db, tok)
    except Exception as e:
        return await _mark_failed(db, item, f"Token refresh failed: {e}")
    access = tok["access_token"]

    image_urn = None
    if item.get("image_url"):
        try:
            data, ctype = await _download(item["image_url"])
            image_urn = await _upload_image(access, org_urn, data, ctype)
        except Exception as e:
            log.warning("image upload failed (%s) — posting without image", e)
            image_urn = None

    try:
        post_urn = await _create_post(access, org_urn, item["commentary"], image_urn)
    except httpx.HTTPStatusError as e:
        return await _mark_failed(db, item, f"LinkedIn API {e.response.status_code}: {e.response.text[:300]}")
    except Exception as e:
        return await _mark_failed(db, item, str(e))

    await db.linkedin_queue.update_one(
        {"id": item["id"]},
        {"$set": {
            "status": "posted",
            "posted_at": _now(),
            "linkedin_post_urn": post_urn,
            "last_error": None,
        }},
    )
    return {"ok": True, "linkedin_post_urn": post_urn}


async def _mark_failed(db, item: Dict[str, Any], reason: str) -> Dict[str, Any]:
    await db.linkedin_queue.update_one(
        {"id": item["id"]},
        {"$set": {"status": "failed", "last_error": reason[:500], "updated_at": _now()}},
    )
    log.warning("LinkedIn publish failed (%s): %s", item.get("id"), reason)
    return {"ok": False, "error": reason}


async def linkedin_scheduler_loop(db):
    """Run forever — poll every 60s for approved items whose slot has arrived."""
    log.info("linkedin_scheduler_loop started")
    while True:
        try:
            cur = db.linkedin_queue.find(
                {"status": "approved", "scheduled_for": {"$lte": _now()}},
                {"_id": 0},
            ).limit(5)
            items = [d async for d in cur]
            for it in items:
                await _publish_one(db, it)
        except Exception:
            log.exception("linkedin_scheduler_loop iteration failed")
        await asyncio.sleep(60)
