"""
testimonials_module.py — Client feedback / testimonials request + management.

Collections
-----------
testimonial_requests  : {id, client_id, client_name, company, email, project_name,
                         token, status (pending/submitted/cancelled),
                         requested_by, sent_at, reminders_sent [int],
                         last_reminder_at, submitted_at, testimonial_id, expires_at}

testimonials          : {id, request_id?, client_name, company, project_name, email,
                         rating, message, format (text/video/both),
                         video_path (relative path in /app/uploads/testimonials),
                         status (pending/approved/rejected), featured (bool),
                         admin_note, source (manual/public_form),
                         submitted_at, approved_at, approved_by}

Admin endpoints (PRIV roles)
----------------------------
GET     /api/testimonials                    list+filter
POST    /api/testimonials                    admin create (status defaults pending)
GET     /api/testimonials/analytics          counts
GET     /api/testimonials/{id}               detail
PATCH   /api/testimonials/{id}               edit + approve/reject + feature
DELETE  /api/testimonials/{id}               delete (also removes file)

GET     /api/testimonials/requests           list pending requests
POST    /api/testimonials/requests           create request → email link via Gmail
POST    /api/testimonials/requests/{id}/remind   manual reminder
DELETE  /api/testimonials/requests/{id}      cancel a request

Public endpoints
----------------
GET     /api/public/testimonials             list approved (filters)
GET     /api/public/testimonials/by-token/{token}
POST    /api/public/testimonials/submit/{token}     (multipart form for text + optional video)
GET     /api/uploads/testimonials/{filename}   stream a stored video file
"""
from __future__ import annotations
import os
import re
import uuid
import mimetypes
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, EmailStr, field_validator
import asyncio
import logging

logger = logging.getLogger(__name__)

PRIV = {"super_admin", "admin", "manager", "hr", "sales"}
UPLOAD_DIR = Path("/app/uploads/testimonials")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_VIDEO_MB = 200  # generous cap for 3-min clips (~120MB at 720p H.264)

# Auto-reminder schedule (days after the initial send)
REMINDER_OFFSETS_DAYS = [2, 5, 10]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def _strip_id(d):
    if d:
        d.pop("_id", None)
    return d


def _slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-") or "video"


def _public_base_url() -> str:
    # Public site is served from the same origin as the API in this deployment.
    return (
        os.environ.get("PUBLIC_FRONTEND_URL")
        or os.environ.get("PUBLIC_BASE_URL")
        or ""
    ).rstrip("/")


# -------- Pydantic models --------
class TestimonialRequestIn(BaseModel):
    client_id: Optional[str] = ""
    client_name: str = Field(..., min_length=1, max_length=160)
    company: Optional[str] = ""
    email: EmailStr
    project_name: Optional[str] = ""
    send_email: bool = True  # POST also fires the Gmail invitation


class TestimonialIn(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=160)
    company: Optional[str] = ""
    designation: Optional[str] = ""
    project_name: Optional[str] = ""
    email: Optional[str] = ""
    rating: int = Field(5, ge=1, le=5)
    message: str = Field(..., min_length=4, max_length=4000)
    format: str = "text"   # text | video | both
    video_path: Optional[str] = ""
    avatar_path: Optional[str] = ""
    status: Optional[str] = "pending"

    @field_validator("format")
    @classmethod
    def _fmt(cls, v):
        v = (v or "text").lower()
        if v not in {"text", "video", "both"}:
            raise ValueError("format must be text|video|both")
        return v


class TestimonialPatch(BaseModel):
    client_name: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    project_name: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    message: Optional[str] = None
    status: Optional[str] = None   # pending | approved | rejected
    featured: Optional[bool] = None
    admin_note: Optional[str] = None


def register_testimonials(api: APIRouter, db, get_current_user):
    """Registers all testimonial routes on the shared APIRouter."""

    # ---- helpers ----
    def _require_priv():
        async def dep(user=Depends(get_current_user)):
            if (user or {}).get("role") not in PRIV:
                raise HTTPException(403, "Insufficient permissions")
            return user
        return dep

    def _build_email_body(req: Dict[str, Any]) -> tuple[str, str, str]:
        """Compose the Gmail HTML for a feedback request.

        Returns (title, inner_body_html, submission_link)."""
        base = _public_base_url()
        link = f"{base}/testimonial/{req['token']}"
        title = f"We'd love your feedback, {req.get('client_name','')}!"
        body = f"""
        <p>Hi <b>{req.get('client_name','')}</b>,</p>
        <p>Thank you again for working with us on <b>{req.get('project_name') or 'your project'}</b>.
        Your feedback means the world — and helps future clients pick us with confidence.</p>
        <p>Could you take 2 minutes to share a quick review? You can leave a short note,
        a star rating, or even <b>record a 60-second video</b> right in your browser.</p>
        """
        return title, body, link

    async def _send_request_email(req: Dict[str, Any], reminder: bool = False) -> bool:
        """Best-effort send via Gmail. Returns True on success."""
        try:
            from email_module import (
                _resolve_send_token, _refresh_if_needed,
                _build_gmail_service, _branded_template,
            )
            import base64 as _b64
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText

            token = await _resolve_send_token(db)
            if not token:
                logger.warning("Testimonial email skipped — Gmail not connected")
                return False
            token = await _refresh_if_needed(db, token)
            service = _build_gmail_service(token)
            title, body, link = _build_email_body(req)
            if reminder:
                title = f"Quick reminder — {title}"
                body = "<p><i>Just a friendly nudge in case our earlier email got buried 🙂</i></p>" + body
            html = _branded_template(
                title, body,
                cta_label="Leave my feedback",
                cta_url=link,
            )
            msg = MIMEMultipart("alternative")
            msg["Subject"] = title
            msg["From"] = f'"Projexino" <{token.get("email")}>'
            msg["To"] = req["email"]
            msg.attach(MIMEText(html, "html"))
            raw = _b64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
            service.users().messages().send(userId="me", body={"raw": raw}).execute()
            return True
        except Exception as e:
            logger.warning("send_request_email failed for %s: %s", req.get("email"), e)
            return False

    # ===== /testimonials (admin) =====
    @api.get("/testimonials")
    async def list_testimonials(
        status: str = Query("", description="pending|approved|rejected"),
        fmt: str = Query("", description="text|video|both"),
        q: str = Query(""),
        limit: int = Query(200, ge=1, le=1000),
        user=Depends(_require_priv()),
    ):
        flt: Dict[str, Any] = {}
        if status:
            flt["status"] = status
        if fmt:
            flt["format"] = fmt
        if q:
            r = {"$regex": re.escape(q), "$options": "i"}
            flt["$or"] = [
                {"client_name": r}, {"company": r}, {"project_name": r}, {"message": r},
            ]
        cur = db.testimonials.find(flt, {"_id": 0}).sort("submitted_at", -1).limit(limit)
        items = await cur.to_list(limit)
        return {"items": items, "total": len(items)}

    @api.post("/testimonials")
    async def create_testimonial(payload: TestimonialIn, user=Depends(_require_priv())):
        # Force admin-created entries through the standard approval gate unless
        # the caller is super_admin (then we honour their explicit status).
        role = (user or {}).get("role")
        status = (payload.status or "pending") if role == "super_admin" else "pending"
        doc = {
            "id": uuid.uuid4().hex,
            "request_id": "",
            "source": "manual",
            "rating": payload.rating,
            "client_name": payload.client_name,
            "company": payload.company or "",
            "designation": payload.designation or "",
            "project_name": payload.project_name or "",
            "email": payload.email or "",
            "message": payload.message,
            "format": payload.format,
            "video_path": payload.video_path or "",
            "avatar_path": payload.avatar_path or "",
            "status": status,
            "featured": False,
            "admin_note": "",
            "submitted_at": _now_iso(),
            "approved_at": _now_iso() if status == "approved" else "",
            "approved_by": user.get("email") if status == "approved" else "",
            "created_by": user.get("email"),
        }
        await db.testimonials.insert_one(doc)
        return _strip_id(doc)

    @api.get("/testimonials/analytics")
    async def testimonial_analytics(user=Depends(_require_priv())):
        total = await db.testimonials.count_documents({})
        approved = await db.testimonials.count_documents({"status": "approved"})
        pending = await db.testimonials.count_documents({"status": "pending"})
        rejected = await db.testimonials.count_documents({"status": "rejected"})
        requests_total = await db.testimonial_requests.count_documents({})
        requests_pending = await db.testimonial_requests.count_documents({"status": "pending"})
        requests_done = await db.testimonial_requests.count_documents({"status": "submitted"})
        with_video = await db.testimonials.count_documents({"format": {"$in": ["video", "both"]}})
        # Avg rating
        pipeline = [
            {"$match": {"status": "approved"}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}},
        ]
        avg_doc = await db.testimonials.aggregate(pipeline).to_list(1)
        avg_rating = round((avg_doc[0]["avg"] if avg_doc else 0) or 0, 2)
        return {
            "total": total,
            "approved": approved,
            "pending": pending,
            "rejected": rejected,
            "with_video": with_video,
            "avg_rating": avg_rating,
            "requests_total": requests_total,
            "requests_pending": requests_pending,
            "requests_completed": requests_done,
            "approval_rate": round((approved / total * 100) if total else 0, 1),
            "response_rate": round((requests_done / requests_total * 100) if requests_total else 0, 1),
        }

    @api.get("/testimonials/{tid}")
    async def get_testimonial(tid: str, user=Depends(_require_priv())):
        doc = await db.testimonials.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        return doc

    @api.patch("/testimonials/{tid}")
    async def patch_testimonial(tid: str, payload: TestimonialPatch, user=Depends(_require_priv())):
        doc = await db.testimonials.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if update.get("status") == "approved" and doc.get("status") != "approved":
            update["approved_at"] = _now_iso()
            update["approved_by"] = user.get("email")
        update["updated_at"] = _now_iso()
        await db.testimonials.update_one({"id": tid}, {"$set": update})
        doc.update(update)
        return doc

    @api.delete("/testimonials/{tid}")
    async def delete_testimonial(tid: str, user=Depends(_require_priv())):
        doc = await db.testimonials.find_one({"id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        # Best-effort delete the video file from disk
        vp = doc.get("video_path") or ""
        if vp:
            try:
                target = UPLOAD_DIR / Path(vp).name
                if target.exists():
                    target.unlink()
            except Exception:
                pass
        await db.testimonials.delete_one({"id": tid})
        return {"ok": True}

    # ===== /testimonial-requests (admin) =====
    @api.get("/testimonial-requests")
    async def list_requests(
        status: str = Query(""),
        limit: int = Query(200, ge=1, le=1000),
        user=Depends(_require_priv()),
    ):
        flt: Dict[str, Any] = {}
        if status:
            flt["status"] = status
        cur = db.testimonial_requests.find(flt, {"_id": 0}).sort("sent_at", -1).limit(limit)
        items = await cur.to_list(limit)
        return {"items": items, "total": len(items)}

    @api.post("/testimonial-requests")
    async def create_request(payload: TestimonialRequestIn, user=Depends(_require_priv())):
        token = secrets.token_urlsafe(24)
        rid = uuid.uuid4().hex
        doc = {
            "id": rid,
            "client_id": payload.client_id or "",
            "client_name": payload.client_name,
            "company": payload.company or "",
            "email": str(payload.email),
            "project_name": payload.project_name or "",
            "token": token,
            "status": "pending",
            "requested_by": user.get("email"),
            "sent_at": _now_iso(),
            "reminders_sent": 0,
            "last_reminder_at": "",
            "submitted_at": "",
            "testimonial_id": "",
            "expires_at": (_now_dt() + timedelta(days=60)).isoformat(),
        }
        await db.testimonial_requests.insert_one(doc)
        sent = False
        if payload.send_email:
            sent = await _send_request_email(doc)
        return {"request": _strip_id(doc), "email_sent": sent,
                "link": f"{_public_base_url()}/testimonial/{token}"}

    @api.post("/testimonial-requests/{rid}/remind")
    async def manual_remind(rid: str, user=Depends(_require_priv())):
        req = await db.testimonial_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Request not found")
        if req.get("status") != "pending":
            raise HTTPException(400, f"Cannot remind — status is '{req.get('status')}'")
        ok = await _send_request_email(req, reminder=True)
        if ok:
            await db.testimonial_requests.update_one(
                {"id": rid},
                {"$inc": {"reminders_sent": 1},
                 "$set": {"last_reminder_at": _now_iso()}},
            )
        return {"ok": ok}

    @api.post("/testimonial-requests/{rid}/whatsapp")
    async def request_whatsapp(rid: str, user=Depends(_require_priv())):
        """Structured WhatsApp message for a testimonial request (wa.me click-to-chat)."""
        req = await db.testimonial_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Request not found")
        phone = ""
        if req.get("client_id"):
            client = await db.clients.find_one({"id": req["client_id"]}, {"_id": 0, "phone": 1})
            phone = re.sub(r"[^\d]", "", (client or {}).get("phone") or "")
        link = f"{_public_base_url()}/testimonial/{req['token']}"
        first = ((req.get("client_name") or "there").split(" ") or ["there"])[0]
        wa_text = "\n".join([
            "⭐ *WE'D LOVE YOUR FEEDBACK*",
            "━━━━━━━━━━━━━━━",
            f"Hi {first} 👋",
            "",
            f"Thank you for working with *Projexino Solutions* on *{req.get('project_name') or 'your project'}*! 🙌",
            "",
            "Could you take *2 minutes* to share a quick review? You can:",
            "• Leave a short note ✍️",
            "• Give a star rating ⭐",
            "• Or record a 60-second video 🎥",
            "",
            "👉 *Share your feedback here:*",
            link,
            "",
            "━━━━━━━━━━━━━━━",
            "It means the world to us 🧡",
            "_Team Projexino_",
        ])
        return {"wa_text": wa_text, "phone": phone, "link": link}

    @api.delete("/testimonial-requests/{rid}")
    async def cancel_request(rid: str, user=Depends(_require_priv())):
        res = await db.testimonial_requests.update_one(
            {"id": rid}, {"$set": {"status": "cancelled", "cancelled_at": _now_iso()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    # ===== Public endpoints (no auth) =====
    @api.get("/public/testimonials")
    async def public_list(
        format: str = Query("", description="text|video|both"),
        featured_only: bool = Query(False),
        limit: int = Query(50, ge=1, le=200),
    ):
        flt: Dict[str, Any] = {"status": "approved"}
        if format:
            if format == "video":
                flt["format"] = {"$in": ["video", "both"]}
            elif format == "text":
                flt["format"] = "text"
        if featured_only:
            flt["featured"] = True
        cur = db.testimonials.find(
            flt,
            {"_id": 0, "email": 0, "admin_note": 0, "approved_by": 0},
        ).sort([("featured", -1), ("submitted_at", -1)]).limit(limit)
        items = await cur.to_list(limit)
        return {"items": items, "total": len(items)}

    @api.get("/public/testimonials/by-token/{token}")
    async def get_by_token(token: str):
        req = await db.testimonial_requests.find_one({"token": token}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Invalid or expired link")
        if req.get("status") == "submitted":
            return {"already_submitted": True, "client_name": req.get("client_name", "")}
        if req.get("status") == "cancelled":
            raise HTTPException(410, "This feedback request was cancelled by the team")
        # Light expiry check
        try:
            if _now_dt() > datetime.fromisoformat(req.get("expires_at", "")):
                raise HTTPException(410, "Link expired")
        except (ValueError, TypeError):
            pass
        return {
            "already_submitted": False,
            "client_name": req.get("client_name", ""),
            "company": req.get("company", ""),
            "project_name": req.get("project_name", ""),
            "email": req.get("email", ""),
        }

    @api.post("/public/testimonials/submit/{token}")
    async def public_submit(
        token: str,
        client_name: str = Form(...),
        company: str = Form(""),
        designation: str = Form(""),
        project_name: str = Form(""),
        rating: int = Form(5),
        message: str = Form(...),
        video: Optional[UploadFile] = File(None),
        avatar: Optional[UploadFile] = File(None),
    ):
        req = await db.testimonial_requests.find_one({"token": token}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Invalid link")
        if req.get("status") != "pending":
            raise HTTPException(400, f"Already {req.get('status')}")
        rating = max(1, min(5, int(rating or 5)))
        message = (message or "").strip()
        if len(message) < 4:
            raise HTTPException(400, "Message too short")

        video_path = ""
        fmt = "text"
        if video is not None and video.filename:
            ctype = (video.content_type or "").lower()
            if not (ctype.startswith("video/") or ctype in {"application/octet-stream"}):
                raise HTTPException(400, f"Unsupported video type: {ctype}")
            ext = (
                mimetypes.guess_extension(ctype)
                or os.path.splitext(video.filename)[1]
                or ".webm"
            )
            buf = bytearray()
            chunk = await video.read(1024 * 1024)
            while chunk:
                buf.extend(chunk)
                if len(buf) > MAX_VIDEO_MB * 1024 * 1024:
                    raise HTTPException(413, f"Video too large (>{MAX_VIDEO_MB} MB)")
                chunk = await video.read(1024 * 1024)
            stored_name = f"{uuid.uuid4().hex}-{_slugify(req.get('client_name',''))}{ext}"
            target = UPLOAD_DIR / stored_name
            target.write_bytes(bytes(buf))
            video_path = stored_name
            fmt = "both" if message else "video"

        avatar_path = ""
        if avatar is not None and avatar.filename:
            actype = (avatar.content_type or "").lower()
            if not actype.startswith("image/"):
                raise HTTPException(400, f"Avatar must be an image, got {actype}")
            aext = (
                mimetypes.guess_extension(actype)
                or os.path.splitext(avatar.filename)[1]
                or ".jpg"
            )
            abuf = await avatar.read()
            if len(abuf) > 6 * 1024 * 1024:  # 6 MB avatar cap
                raise HTTPException(413, "Avatar too large (>6 MB)")
            aname = f"avatar-{uuid.uuid4().hex}-{_slugify(req.get('client_name',''))}{aext}"
            (UPLOAD_DIR / aname).write_bytes(abuf)
            avatar_path = aname

        tid = uuid.uuid4().hex
        testimonial = {
            "id": tid,
            "request_id": req["id"],
            "source": "public_form",
            "client_name": (client_name or req.get("client_name", "")).strip()[:160],
            "company": (company or req.get("company", "")).strip()[:160],
            "designation": (designation or "").strip()[:120],
            "project_name": (project_name or req.get("project_name", "")).strip()[:200],
            "email": req.get("email", ""),
            "rating": rating,
            "message": message,
            "format": fmt,
            "video_path": video_path,
            "avatar_path": avatar_path,
            "status": "pending",       # admin must approve
            "featured": False,
            "admin_note": "",
            "submitted_at": _now_iso(),
            "approved_at": "",
            "approved_by": "",
        }
        await db.testimonials.insert_one(testimonial)
        await db.testimonial_requests.update_one(
            {"id": req["id"]},
            {"$set": {"status": "submitted", "submitted_at": _now_iso(), "testimonial_id": tid}},
        )
        # Notify the admin who requested it
        owner_email = req.get("requested_by") or ""
        if owner_email:
            owner = await db.users.find_one({"email": owner_email}, {"_id": 0, "id": 1})
            if owner:
                await db.notifications.insert_one({
                    "id": uuid.uuid4().hex,
                    "user_id": owner.get("id"),
                    "type": "testimonial_submitted",
                    "title": f"⭐ {testimonial['client_name']} left a testimonial",
                    "body": f"{rating}★ — review pending your approval.",
                    "link": "/app/testimonials?status=pending",
                    "read": False,
                    "created_at": _now_iso(),
                })
        return {"ok": True, "id": tid}

    @api.post("/testimonials/upload-avatar")
    async def upload_avatar(avatar: UploadFile = File(...), user=Depends(_require_priv())):
        """Admin-side helper: upload a client avatar and return the relative path
        that can be passed into POST /api/testimonials as `avatar_path`."""
        actype = (avatar.content_type or "").lower()
        if not actype.startswith("image/"):
            raise HTTPException(400, "Avatar must be an image")
        data = await avatar.read()
        if len(data) > 6 * 1024 * 1024:
            raise HTTPException(413, "Avatar too large (>6 MB)")
        ext = mimetypes.guess_extension(actype) or os.path.splitext(avatar.filename or "")[1] or ".jpg"
        name = f"avatar-{uuid.uuid4().hex}{ext}"
        (UPLOAD_DIR / name).write_bytes(data)
        return {"avatar_path": name}

    # ===== Streaming the stored video file =====
    @api.get("/uploads/testimonials/{filename}")
    async def serve_video(filename: str):
        safe = Path(filename).name  # strip any traversal
        target = UPLOAD_DIR / safe
        if not target.exists() or not target.is_file():
            raise HTTPException(404, "File not found")
        ctype, _ = mimetypes.guess_type(safe)
        return FileResponse(str(target), media_type=ctype or "application/octet-stream")

    # ===== Reminder background loop =====
    async def reminder_loop():
        """Walk pending requests and fire the next scheduled reminder."""
        await asyncio.sleep(20)  # let the rest of the app boot
        while True:
            try:
                now = _now_dt()
                cur = db.testimonial_requests.find(
                    {"status": "pending"}, {"_id": 0},
                )
                async for req in cur:
                    try:
                        sent_at_str = req.get("sent_at") or ""
                        sent_at = datetime.fromisoformat(sent_at_str)
                    except Exception:
                        continue
                    n = int(req.get("reminders_sent") or 0)
                    if n >= len(REMINDER_OFFSETS_DAYS):
                        continue
                    next_offset = REMINDER_OFFSETS_DAYS[n]
                    due_at = sent_at + timedelta(days=next_offset)
                    if now < due_at:
                        continue
                    ok = await _send_request_email(req, reminder=True)
                    if ok:
                        await db.testimonial_requests.update_one(
                            {"id": req["id"]},
                            {"$inc": {"reminders_sent": 1},
                             "$set": {"last_reminder_at": _now_iso()}},
                        )
            except Exception:
                logger.exception("testimonial reminder_loop tick failed")
            await asyncio.sleep(6 * 3600)  # check every 6 hours
    db._testimonial_reminder_loop = reminder_loop
