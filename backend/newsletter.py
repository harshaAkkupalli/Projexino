"""
newsletter.py — Projexino newsletter module.

Workflows supported:
  • Public visitor subscribes via a footer / blog widget    → POST /newsletter/subscribe
  • Visitor unsubscribes via the link in any newsletter      → GET  /newsletter/unsubscribe
  • Admin lists / segments subscribers                       → GET  /admin/newsletter/subscribers
  • Admin sends a custom newsletter                          → POST /admin/newsletter/send
  • Admin sends an existing blog post as a newsletter        → POST /admin/newsletter/send-blog/{post_id}

Storage:
  • newsletter_subscribers {id, email, name, source, tags, status, unsubscribe_token, subscribed_at}
  • newsletter_sends {id, subject, body_html, to_count, success_count, fail_count, sent_at,
                      sent_by, source ("custom" | "blog"), blog_post_id, blog_post_slug}

The actual delivery uses the project's existing Gmail OAuth pipeline
(`email_module._do_send`-style flow). We resolve the active token once
per batch to avoid 429s.
"""
from __future__ import annotations
import base64
import re
import uuid
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query, Request
from pydantic import BaseModel, EmailStr, Field

# Re-use Gmail send plumbing already wired in email_module
from googleapiclient.discovery import build as _build_service
from google.oauth2.credentials import Credentials

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _render_blog_email_shell(
    *, title: str, excerpt: str, cover: str, cta_label: str, cta_link: str,
    public_url: str, slug: str,
    intro: str = "", key_points: Optional[List[str]] = None, takeaway: str = "",
    content_html: str = "", preheader: str = "",
) -> str:
    """Render a polished, mobile-friendly newsletter HTML body around a blog post.

    Inline styles only (most email clients strip <style>). Uses a 640px container,
    Projexino brand colours, a hero cover image, an editorial intro, a bulleted
    "Why this matters" block, a primary CTA pill, optional inline reading preview,
    and a takeaway tile. A hidden preheader spans the inbox preview line.
    """
    key_points = key_points or []
    points_html = ""
    if key_points:
        items = "".join([
            f'<tr><td valign="top" width="22" style="padding:6px 0;color:#F97316;font-weight:bold;font-size:13px;line-height:1.5">▸</td>'
            f'<td style="padding:6px 0;color:#1F2937;font-size:15px;line-height:1.55">{p}</td></tr>'
            for p in key_points
        ])
        points_html = (
            '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" '
            'style="margin:18px 0 6px;padding:18px 20px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:14px">'
            f'<tr><td style="padding-bottom:8px;color:#9A3412;font-size:11px;font-weight:bold;letter-spacing:0.18em;text-transform:uppercase">// Why this matters</td></tr>'
            f'<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">{items}</table></td></tr>'
            '</table>'
        )

    takeaway_html = ""
    if takeaway:
        takeaway_html = (
            f'<div style="margin:18px 0 6px;padding:16px 18px;background:#0F2042;border-radius:14px;color:#E2E8F0;font-size:14px;line-height:1.6">'
            f'<div style="color:#FDBA74;font-size:10px;font-weight:bold;letter-spacing:0.22em;text-transform:uppercase;margin-bottom:6px">// Takeaway</div>'
            f'{takeaway}</div>'
        )

    intro_html = (
        f'<p style="color:#334155;font-size:16px;line-height:1.65;margin:18px 0 0">{intro}</p>'
        if intro else
        f'<p style="color:#334155;font-size:16px;line-height:1.65;margin:18px 0 0">{excerpt}</p>'
    )

    cover_html = (
        f'<img src="{cover}" alt="" width="600" style="display:block;width:100%;max-width:600px;border-radius:14px;margin:18px 0 0"/>'
        if cover else ""
    )

    inline_preview = ""
    if content_html:
        inline_preview = (
            f'<div style="margin-top:20px;padding-top:18px;border-top:1px dashed #E2E8F0;color:#475569;font-size:14px;line-height:1.7">{content_html}</div>'
        )

    pre = (
        f'<div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0;font-size:1px;line-height:1px">{preheader}</div>'
        if preheader else ""
    )

    return f"""<!doctype html>
<html><body style="margin:0;padding:0;background:#F8FAFC;font-family:'Inter',Arial,sans-serif">
{pre}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F8FAFC;padding:28px 12px">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:18px;box-shadow:0 8px 28px rgba(15,32,66,0.06);overflow:hidden">
      <tr><td style="padding:24px 28px 8px;background:linear-gradient(135deg,#FFF7ED 0%,#FFFFFF 60%);border-bottom:1px solid #FDE2C9">
        <div style="font-size:11px;font-weight:bold;letter-spacing:0.32em;color:#F97316;text-transform:uppercase">// PROJEXINO · INSIGHTS</div>
        <div style="margin-top:4px;color:#475569;font-size:12px">A short read for builders</div>
      </td></tr>
      <tr><td style="padding:24px 28px 4px">
        {cover_html}
        <h1 style="font-family:'Manrope',Arial,sans-serif;font-size:26px;line-height:1.25;color:#0F2042;margin:18px 0 0;font-weight:700">{title}</h1>
        {intro_html}
        {points_html}
        <div style="margin:22px 0 8px">
          <a href="{cta_link}" style="display:inline-block;background:#F97316;color:#FFFFFF;font-weight:700;padding:14px 26px;border-radius:999px;text-decoration:none;font-size:14px;box-shadow:0 6px 14px rgba(249,115,22,0.35)">{cta_label}</a>
        </div>
        {takeaway_html}
        {inline_preview}
      </td></tr>
      <tr><td style="padding:24px 28px 18px;background:#0F2042;color:#94A3B8;font-size:12px;line-height:1.6">
        <div style="color:#FFFFFF;font-weight:bold;font-size:13px;letter-spacing:0.14em">PROJEXINO</div>
        <div style="margin-top:4px">Engineering studios, dedicated teams &amp; AI workflow builders.</div>
        <div style="margin-top:14px">You're reading this because you subscribed at <a href="{public_url}" style="color:#FDBA74">{public_url.replace('https://','').replace('http://','')}</a>.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


# ===== Pydantic =====
class SubscribeIn(BaseModel):
    email: EmailStr
    name: Optional[str] = ""
    source: Optional[str] = "footer"  # footer | blog | landing | manual


class SendNewsletterIn(BaseModel):
    subject: str = Field(..., min_length=2, max_length=200)
    body_html: str = Field(..., min_length=10)
    audience: str = "all"  # all | tag:<tag>
    tag: Optional[str] = None
    from_name: Optional[str] = "Projexino"


def register_newsletter(api: APIRouter, db, get_current_user):

    async def _require_admin(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager", "hr"):
            raise HTTPException(403, "Admin / manager / HR only")
        return user

    # ===== Public subscribe / unsubscribe =====
    @api.post("/newsletter/subscribe")
    async def subscribe(payload: SubscribeIn, request: Request):
        email = payload.email.lower().strip()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "Invalid email")
        existing = await db.newsletter_subscribers.find_one({"email": email}, {"_id": 0})
        if existing:
            # Re-activate if previously unsubscribed
            if existing.get("status") != "active":
                await db.newsletter_subscribers.update_one(
                    {"email": email},
                    {"$set": {"status": "active", "resubscribed_at": _now()}},
                )
                return {"ok": True, "status": "resubscribed"}
            return {"ok": True, "status": "already_subscribed"}
        doc = {
            "id": uuid.uuid4().hex,
            "email": email,
            "name": (payload.name or "").strip(),
            "source": payload.source or "footer",
            "tags": [],
            "status": "active",
            "unsubscribe_token": uuid.uuid4().hex,
            "subscribed_at": _now(),
            "ip": request.client.host if request.client else "",
        }
        await db.newsletter_subscribers.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "status": "subscribed"}

    @api.get("/newsletter/unsubscribe")
    async def unsubscribe(token: str = Query(...)):
        if not token:
            raise HTTPException(400, "Missing token")
        sub = await db.newsletter_subscribers.find_one(
            {"unsubscribe_token": token}, {"_id": 0}
        )
        if not sub:
            # Idempotent — pretend success so we don't leak whether the
            # token exists.
            return {"ok": True, "status": "ok"}
        await db.newsletter_subscribers.update_one(
            {"unsubscribe_token": token},
            {"$set": {"status": "unsubscribed", "unsubscribed_at": _now()}},
        )
        return {"ok": True, "status": "unsubscribed", "email": sub.get("email")}

    # ===== Admin: list / tag / delete subscribers =====
    @api.get("/admin/newsletter/subscribers")
    async def list_subscribers(
        status: Optional[str] = None,
        tag: Optional[str] = None,
        user=Depends(_require_admin),
    ):
        q: Dict[str, Any] = {}
        if status in ("active", "unsubscribed"):
            q["status"] = status
        if tag:
            q["tags"] = tag
        cur = db.newsletter_subscribers.find(q, {"_id": 0}).sort("subscribed_at", -1)
        items = await cur.to_list(5000)
        # Aggregate stats
        total = len(items)
        active = sum(1 for s in items if s.get("status") == "active")
        return {"items": items, "total": total, "active": active}

    @api.post("/admin/newsletter/subscribers")
    async def admin_add_subscriber(
        payload: SubscribeIn,
        user=Depends(_require_admin),
    ):
        """Admin manual add — also used by CSV import on the frontend."""
        # Reuse the public subscribe logic but mark source 'manual' if blank
        email = payload.email.lower().strip()
        if not EMAIL_RE.match(email):
            raise HTTPException(400, "Invalid email")
        existing = await db.newsletter_subscribers.find_one({"email": email}, {"_id": 0})
        if existing:
            return {"ok": True, "status": "already_subscribed"}
        doc = {
            "id": uuid.uuid4().hex,
            "email": email,
            "name": (payload.name or "").strip(),
            "source": payload.source or "manual",
            "tags": [],
            "status": "active",
            "unsubscribe_token": uuid.uuid4().hex,
            "subscribed_at": _now(),
            "added_by": user.get("email"),
        }
        await db.newsletter_subscribers.insert_one(doc)
        doc.pop("_id", None)
        return {"ok": True, "status": "subscribed", "subscriber": {k: v for k, v in doc.items() if k != "_id"}}

    @api.patch("/admin/newsletter/subscribers/{sub_id}")
    async def admin_update_subscriber(
        sub_id: str,
        payload: Dict[str, Any] = Body(...),
        user=Depends(_require_admin),
    ):
        allowed = {"name", "tags", "status"}
        updates = {k: v for k, v in (payload or {}).items() if k in allowed}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        r = await db.newsletter_subscribers.update_one({"id": sub_id}, {"$set": updates})
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @api.delete("/admin/newsletter/subscribers/{sub_id}")
    async def admin_delete_subscriber(sub_id: str, user=Depends(_require_admin)):
        r = await db.newsletter_subscribers.delete_one({"id": sub_id})
        if not r.deleted_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    # ===== Admin: send a newsletter =====
    async def _resolve_send_token() -> Optional[Dict[str, Any]]:
        """Pick the primary Gmail token. Returns None if no token connected."""
        token = await db.gmail_tokens.find_one({"is_primary": True}, {"_id": 0})
        if not token:
            token = await db.gmail_tokens.find_one({}, {"_id": 0})
        return token

    async def _refresh_if_needed(token: Dict[str, Any]) -> Dict[str, Any]:
        # Lazy import — avoid circular imports at module load
        from email_module import _refresh_if_needed as _ref
        return await _ref(db, token)

    def _gmail_service(token: Dict[str, Any]):
        creds = Credentials(
            token=token.get("access_token"),
            refresh_token=token.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=token.get("client_id"),
            client_secret=token.get("client_secret"),
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        )
        return _build_service("gmail", "v1", credentials=creds, cache_discovery=False)

    def _wrap_for_unsubscribe(body_html: str, sub: Dict[str, Any], public_url: str) -> str:
        """Append a clean unsubscribe footer with a token-link."""
        token = sub.get("unsubscribe_token", "")
        unsub_link = f"{public_url.rstrip('/')}/unsubscribe?token={token}"
        footer = f"""
<hr style="margin:32px 0 16px;border:none;border-top:1px solid #e5e7eb"/>
<p style="font-family:Inter,Arial,sans-serif;font-size:11px;color:#94a3b8;text-align:center;line-height:1.5">
  You're receiving this because you subscribed to the Projexino newsletter
  ({sub.get('email')}). <a href="{unsub_link}" style="color:#F97316">Unsubscribe</a>.
</p>
"""
        return body_html + footer

    async def _send_to_audience(
        *,
        subject: str,
        body_html: str,
        audience: str,
        tag: Optional[str],
        from_name: str,
        actor: Dict[str, Any],
        meta: Dict[str, Any],
    ) -> Dict[str, Any]:
        # Pick recipients
        q: Dict[str, Any] = {"status": "active"}
        if audience == "tag" and tag:
            q["tags"] = tag
        cursor = db.newsletter_subscribers.find(q, {"_id": 0})
        subs = await cursor.to_list(5000)
        if not subs:
            raise HTTPException(400, "No active subscribers in the selected audience")

        token = await _resolve_send_token()
        if not token:
            raise HTTPException(400, "Gmail not connected — connect from Settings first")
        token = await _refresh_if_needed(token)
        service = _gmail_service(token)
        sender_email = token.get("email")
        from_header = f'"{from_name}" <{sender_email}>'

        # Public base URL for unsubscribe link
        import os
        public_url = (os.environ.get("PUBLIC_SITE_URL") or "https://www.projexino.com").rstrip("/")

        success, failures = 0, []
        for sub in subs:
            try:
                personal_html = _wrap_for_unsubscribe(body_html, sub, public_url)
                # Replace common variables
                personal_html = personal_html.replace("{{FirstName}}",
                                                     (sub.get("name") or "there").split(" ")[0])
                personal_html = personal_html.replace("{{Email}}", sub.get("email", ""))
                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = from_header
                msg["To"] = sub["email"]
                msg.attach(MIMEText(personal_html, "html"))
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                service.users().messages().send(userId="me", body={"raw": raw}).execute()
                success += 1
            except Exception as e:
                failures.append({"email": sub.get("email"), "error": str(e)[:200]})

        # Log the send
        send_doc = {
            "id": uuid.uuid4().hex,
            "subject": subject,
            "audience": audience,
            "tag": tag or "",
            "to_count": len(subs),
            "success_count": success,
            "fail_count": len(failures),
            "failures": failures[:50],  # cap log size
            "from": from_header,
            "sent_by": actor.get("email"),
            "sent_by_name": actor.get("name"),
            "sent_at": _now(),
            **meta,
        }
        await db.newsletter_sends.insert_one(send_doc)
        send_doc.pop("_id", None)
        return send_doc

    @api.post("/admin/newsletter/send")
    async def admin_send_newsletter(
        payload: SendNewsletterIn,
        user=Depends(_require_admin),
    ):
        return await _send_to_audience(
            subject=payload.subject,
            body_html=payload.body_html,
            audience=payload.audience or "all",
            tag=payload.tag,
            from_name=payload.from_name or "Projexino",
            actor={"email": user.get("email"), "name": user.get("name")},
            meta={"source": "custom"},
        )

    @api.post("/admin/newsletter/send-blog/{post_id}")
    async def admin_send_blog_as_newsletter(
        post_id: str,
        payload: Dict[str, Any] = Body(default={}),
        user=Depends(_require_admin),
    ):
        post = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Blog post not found")
        subject = (payload.get("subject") or post.get("title") or "Projexino Newsletter").strip()
        # If caller supplied custom body_html (e.g. AI-drafted then edited), use it as-is.
        if payload.get("body_html"):
            body_html = payload["body_html"]
        else:
            import os
            public_url = (os.environ.get("PUBLIC_SITE_URL") or "https://www.projexino.com").rstrip("/")
            slug = post.get("slug", "")
            cover = post.get("cover_image") or ""
            excerpt = post.get("excerpt") or ""
            cta_label = post.get("cta_label") or "Read on Projexino →"
            cta_link_raw = post.get("cta_link") or f"/blog/{slug}"
            cta_link = f"{public_url}{cta_link_raw}" if cta_link_raw.startswith("/") else cta_link_raw
            body_html = _render_blog_email_shell(
                title=post.get("title", ""), excerpt=excerpt, cover=cover,
                cta_label=cta_label, cta_link=cta_link, public_url=public_url, slug=slug,
                intro="", key_points=[], takeaway="",
                content_html=(post.get("content_html") or "")[:6000],
            )
        return await _send_to_audience(
            subject=subject,
            body_html=body_html,
            audience=payload.get("audience") or "all",
            tag=payload.get("tag"),
            from_name=payload.get("from_name") or "Projexino",
            actor={"email": user.get("email"), "name": user.get("name")},
            meta={"source": "blog", "blog_post_id": post_id, "blog_post_slug": post.get("slug", "")},
        )

    @api.post("/admin/newsletter/draft-from-blog/{post_id}")
    async def admin_draft_from_blog(
        post_id: str,
        payload: Dict[str, Any] = Body(default={}),
        user=Depends(_require_admin),
    ):
        """Use the configured AI provider to rewrite a blog post as an email-friendly
        newsletter (subject + preheader + intro + 3-5 key points + takeaway + CTA),
        then wrap it in a branded HTML shell ready to send.
        """
        post = await db.blog_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(404, "Blog post not found")
        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider helper not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Add an OPENAI / ANTHROPIC / GEMINI / EMERGENT_LLM_KEY in Settings → AI.")

        # Strip HTML for the prompt so the model focuses on substance, not markup
        plain = re.sub(r"<[^>]+>", " ", post.get("content_html") or "")
        plain = re.sub(r"\s+", " ", plain).strip()[:6000]

        tone = (payload.get("tone") or "editorial · friendly · concise").strip()
        audience_hint = (payload.get("audience_hint") or "founders, CTOs and engineering leaders").strip()

        system_msg = (
            "You are a senior B2B newsletter editor for an engineering studio called Projexino. "
            "Your job is to rewrite a blog post as a 1-screen-tall email newsletter that earns the click-through. "
            "You will respond with STRICT JSON ONLY — no markdown fences, no commentary."
        )
        user_msg = f"""Convert the following blog into a newsletter for {audience_hint}. Tone: {tone}.

Return JSON with these exact keys:
{{
  "subject": "<<55 chars max, no emoji unless it earns it>>",
  "preheader": "<<90 chars, complements the subject, no repetition>>",
  "intro": "<<2 short editorial sentences hooking the reader>>",
  "key_points": ["<<5–9 word punchy bullet>>", "<<...>>", "<<3 to 5 bullets total>>"],
  "takeaway": "<<1 sentence, why this matters to {audience_hint}>>",
  "cta_label": "<<short verb-led CTA, e.g. 'Read the full teardown'>>"
}}

BLOG TITLE: {post.get('title','')}
BLOG EXCERPT: {post.get('excerpt','')}
BLOG BODY (plain text, may be truncated): {plain}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.4)
        except RuntimeError as e:
            raise HTTPException(502, str(e))

        # Tolerant JSON extraction (model sometimes wraps in ```json)
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            raise HTTPException(502, "AI returned a non-JSON response")
        try:
            import json
            data = json.loads(m.group(0))
        except Exception:
            raise HTTPException(502, "AI returned malformed JSON")

        # Sanitise & normalise
        subject = (data.get("subject") or post.get("title") or "Projexino Newsletter").strip()[:200]
        preheader = (data.get("preheader") or "").strip()[:140]
        intro = (data.get("intro") or "").strip()
        key_points = [str(p).strip() for p in (data.get("key_points") or []) if str(p).strip()][:6]
        takeaway = (data.get("takeaway") or "").strip()
        cta_label = (data.get("cta_label") or post.get("cta_label") or "Read the full article →").strip()

        import os
        public_url = (os.environ.get("PUBLIC_SITE_URL") or "https://www.projexino.com").rstrip("/")
        slug = post.get("slug", "")
        cta_link_raw = post.get("cta_link") or f"/blog/{slug}"
        cta_link = f"{public_url}{cta_link_raw}" if cta_link_raw.startswith("/") else cta_link_raw

        body_html = _render_blog_email_shell(
            title=post.get("title", ""), excerpt=post.get("excerpt") or "",
            cover=post.get("cover_image") or "",
            cta_label=cta_label, cta_link=cta_link, public_url=public_url, slug=slug,
            intro=intro, key_points=key_points, takeaway=takeaway, preheader=preheader,
        )
        return {
            "subject": subject, "preheader": preheader, "intro": intro,
            "key_points": key_points, "takeaway": takeaway, "cta_label": cta_label,
            "body_html": body_html,
            "blog_post_id": post_id, "blog_post_slug": slug, "blog_title": post.get("title", ""),
        }

    # ===== Admin: send history =====
    @api.get("/admin/newsletter/sends")
    async def admin_list_sends(user=Depends(_require_admin), limit: int = 50):
        cur = db.newsletter_sends.find({}, {"_id": 0, "failures": 0}).sort("sent_at", -1).limit(limit)
        return await cur.to_list(limit)
