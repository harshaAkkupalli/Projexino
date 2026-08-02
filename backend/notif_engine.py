"""
Projexino — Notification engine.

Centralised helper for:
  • In-app notifications (db.notifications)
  • Workspace-wide notification settings (db.notification_settings, single doc id='workspace')
  • Triggered Gmail emails (via email_module helpers), gated by per-event settings

Plus REST API:
  GET    /api/notification-settings     — any authenticated user (so the frontend ringtone hook can read)
  PATCH  /api/notification-settings     — admin only

Settings shape (single doc, id='workspace'):
{
  id: "workspace",
  ringtones: { default: "chime", task_assigned: "bell", ... },  # per-event tone
  default_ringtone: "chime",
  volume: 0.6,
  sound_enabled: true,
  desktop_popup: true,
  events: {
     task_assigned:     {in_app: true, email: true},
     project_assigned:  {in_app: true, email: true},
     issue_assigned:    {in_app: true, email: true},
     badge_awarded:     {in_app: true, email: true},
     document_verified: {in_app: true, email: true},
     document_rejected: {in_app: true, email: true},
     welcome_employee:  {in_app: true, email: true},
     welcome_intern:    {in_app: true, email: true},
     chat_mention:      {in_app: true, email: false},
  }
}
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("projexino.notif")

WORKSPACE_KEY = "workspace"

ALLOWED_RINGTONES = ["chime", "bell", "ding", "pop", "soft", "alert", "none"]

DEFAULT_EVENTS = [
    "task_assigned",
    "project_assigned",
    "issue_assigned",
    "badge_awarded",
    "document_verified",
    "document_rejected",
    "welcome_employee",
    "welcome_intern",
    "chat_mention",
]

DEFAULT_SETTINGS = {
    "id": WORKSPACE_KEY,
    "default_ringtone": "chime",
    "ringtones": {e: "chime" for e in DEFAULT_EVENTS},
    "volume": 0.6,
    "sound_enabled": True,
    "desktop_popup": True,
    "events": {e: {"in_app": True, "email": True} for e in DEFAULT_EVENTS},
}


async def get_settings(db) -> dict:
    doc = await db.notification_settings.find_one({"id": WORKSPACE_KEY}, {"_id": 0})
    if not doc:
        doc = dict(DEFAULT_SETTINGS)
        await db.notification_settings.update_one(
            {"id": WORKSPACE_KEY}, {"$setOnInsert": doc}, upsert=True
        )
    # ensure all events present (forward-compat)
    events = doc.get("events", {})
    ringtones = doc.get("ringtones", {})
    changed = False
    for e in DEFAULT_EVENTS:
        if e not in events:
            events[e] = {"in_app": True, "email": True}
            changed = True
        if e not in ringtones:
            ringtones[e] = doc.get("default_ringtone", "chime")
            changed = True
    if changed:
        doc["events"] = events
        doc["ringtones"] = ringtones
        await db.notification_settings.update_one(
            {"id": WORKSPACE_KEY}, {"$set": {"events": events, "ringtones": ringtones}}
        )
    return doc


async def event_enabled(db, event: str, channel: str) -> bool:
    """channel in {'in_app','email'}"""
    s = await get_settings(db)
    ev = (s.get("events") or {}).get(event, {})
    return bool(ev.get(channel, True))


# ---------------- in-app notification helper ----------------

async def push_in_app(db, *, user_id: str, kind: str, title: str, message: str, link: str = "", ringtone: str = "") -> None:
    """Insert an in-app notification + fire FCM push (if configured). `ringtone` is optional override for client playback."""
    settings = await get_settings(db)
    tone = ringtone or (settings.get("ringtones") or {}).get(kind) or settings.get("default_ringtone", "chime")
    await db.notifications.insert_one({
        "id": str(uuid.uuid4()),
        "owner_id": user_id,
        "kind": kind,
        "title": title,
        "message": message,
        "link": link or "",
        "ringtone": tone,
        "read": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Fire web push (best-effort; no-op if VAPID not configured)
    try:
        from webpush_mod import send_push_to_user
        await send_push_to_user(db, user_id, title or "Projexino", message or "", link or "/app", tag=kind)
    except Exception:
        pass


# ---------------- email send wrapper ----------------

async def send_event_email(
    db,
    *,
    event: str,
    to_email: str,
    variables: Dict[str, Any],
    triggered_by: Optional[dict] = None,
) -> Optional[dict]:
    """Send a templated event email via Gmail. Silent no-op if disabled or Gmail not connected."""
    if not to_email:
        return None
    if not await event_enabled(db, event, "email"):
        return None
    # Find template by slug == event (welcome_* falls back to the generic welcome templates)
    tpl = await db.email_templates.find_one({"slug": event}, {"_id": 0})
    if not tpl and event.startswith("welcome"):
        fallback = "welcome_intern" if "intern" in event else "welcome_employee"
        tpl = (await db.email_templates.find_one({"slug": fallback}, {"_id": 0})
               or await db.email_templates.find_one({"slug": "welcome"}, {"_id": 0}))
    if not tpl:
        return {"error": f"No email template with slug '{event}'"}
    token = await db.email_tokens.find_one({"id": WORKSPACE_KEY}, {"_id": 0})
    if not token:
        # Try the default-flagged account
        token = await db.email_tokens.find_one({"default": True}, {"_id": 0})
    if not token:
        # Or any connected account
        token = await db.email_tokens.find_one({}, {"_id": 0})
    if not token:
        logger.info("Gmail not connected — skipping event email %s → %s", event, to_email)
        return {"error": "Gmail not connected"}
    try:
        # Avoid circular import — pull helpers from email_module at call-time.
        from email_module import (
            _refresh_if_needed,
            _build_gmail_service,
            _render_vars,
            _branded_template,
        )
        token = await _refresh_if_needed(db, token)
        subject = _render_vars(tpl.get("subject", ""), variables)
        body_html = _render_vars(tpl.get("body_html", ""), variables)
        if "<html" not in body_html.lower():
            body_html = _branded_template(subject, body_html)
        import base64
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        sender_email = token.get("email")
        from_name = token.get("from_name") or "Projexino"
        from_header = f'"{from_name}" <{sender_email}>'
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = from_header
        msg["To"] = to_email
        if token.get("reply_to"):
            msg["Reply-To"] = token["reply_to"]
        # CC super admins on HR-flow emails (welcome/onboarding, or HR-triggered)
        cc_emails = []
        try:
            hr_flow = event.startswith("welcome")
            if not hr_flow and triggered_by and triggered_by.get("email"):
                actor = await db.users.find_one(
                    {"email": str(triggered_by["email"]).lower()}, {"_id": 0, "role": 1})
                hr_flow = bool(actor and actor.get("role") == "hr")
            if hr_flow:
                sa = await db.users.find({"role": "super_admin"}, {"_id": 0, "email": 1}).to_list(10)
                skip = {to_email.lower(), (sender_email or "").lower()}
                cc_emails = sorted({a["email"] for a in sa
                                    if a.get("email") and a["email"].lower() not in skip})
        except Exception:
            cc_emails = []
        if cc_emails:
            msg["Cc"] = ", ".join(cc_emails)
        body_html, logo_part = _logo_cid_swap(body_html)
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body_html, "html"))
        msg.attach(alt)
        if logo_part:
            msg.attach(logo_part)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        service = _build_gmail_service(token)
        sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        log = {
            "id": str(uuid.uuid4()),
            "to": [to_email],
            "subject": subject,
            "from": from_header,
            "reply_to": token.get("reply_to", ""),
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "event": event,
            "auto": True,
            "sent_by": (triggered_by or {}).get("name", "system"),
            "sent_by_email": (triggered_by or {}).get("email", ""),
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_log.insert_one(log)
        log.pop("_id", None)
        return log
    except Exception as e:
        logger.exception("send_event_email failed (%s → %s): %s", event, to_email, e)
        return {"error": str(e)[:300]}


# Convenience: fire both in-app + email
async def notify(
    db,
    *,
    event: str,
    user_id: str,
    user_email: str,
    title: str,
    message: str,
    link: str = "",
    variables: Optional[Dict[str, Any]] = None,
    triggered_by: Optional[dict] = None,
) -> Optional[dict]:
    if await event_enabled(db, event, "in_app"):
        await push_in_app(db, user_id=user_id, kind=event, title=title, message=message, link=link)
    email_result = None
    if user_email and variables is not None:
        email_result = await send_event_email(db, event=event, to_email=user_email, variables=variables, triggered_by=triggered_by)

    # Parallel CC to reporting manager when route_comms_to_manager is enabled
    # on the recipient's user profile. Avoid recursing on the same manager.
    try:
        recipient = await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "route_comms_to_manager": 1, "reporting_manager_id": 1, "reporting_manager_email": 1},
        )
        if (recipient
                and recipient.get("route_comms_to_manager")
                and recipient.get("reporting_manager_id")
                and recipient["reporting_manager_id"] != user_id):
            mgr_id = recipient["reporting_manager_id"]
            mgr_email = recipient.get("reporting_manager_email") or ""
            if not mgr_email:
                mgr_row = await db.users.find_one({"id": mgr_id}, {"_id": 0, "email": 1})
                mgr_email = (mgr_row or {}).get("email", "")
            mgr_title = f"[FYI] {title}"
            mgr_message = f"(Copied to you as reporting manager) {message}"
            if await event_enabled(db, event, "in_app"):
                await push_in_app(db, user_id=mgr_id, kind=event, title=mgr_title, message=mgr_message, link=link)
            if mgr_email and variables is not None:
                await send_event_email(db, event=event, to_email=mgr_email, variables=variables, triggered_by=triggered_by)
    except Exception:
        # Never let CC failures break the primary notification
        pass
    return email_result

# ---------------- REST API ----------------

class SettingsPatch(BaseModel):
    default_ringtone: Optional[str] = None
    ringtones: Optional[Dict[str, str]] = None
    volume: Optional[float] = None
    sound_enabled: Optional[bool] = None
    desktop_popup: Optional[bool] = None
    events: Optional[Dict[str, Dict[str, bool]]] = None


def register_notif_settings(api: APIRouter, db, get_current_user):

    @api.get("/notification-settings")
    async def get_notif_settings(user=Depends(get_current_user)):
        s = await get_settings(db)
        return s

    @api.patch("/notification-settings")
    async def patch_notif_settings(payload: SettingsPatch, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        current = await get_settings(db)
        update: Dict[str, Any] = {}
        if payload.default_ringtone is not None:
            if payload.default_ringtone not in ALLOWED_RINGTONES:
                raise HTTPException(400, f"Invalid ringtone. Allowed: {ALLOWED_RINGTONES}")
            update["default_ringtone"] = payload.default_ringtone
        if payload.volume is not None:
            update["volume"] = max(0.0, min(1.0, float(payload.volume)))
        if payload.sound_enabled is not None:
            update["sound_enabled"] = bool(payload.sound_enabled)
        if payload.desktop_popup is not None:
            update["desktop_popup"] = bool(payload.desktop_popup)
        if payload.ringtones is not None:
            new_ringtones = dict(current.get("ringtones") or {})
            for k, v in payload.ringtones.items():
                if v in ALLOWED_RINGTONES:
                    new_ringtones[k] = v
            update["ringtones"] = new_ringtones
        if payload.events is not None:
            new_events = dict(current.get("events") or {})
            for k, v in payload.events.items():
                cur_v = dict(new_events.get(k, {"in_app": True, "email": True}))
                if "in_app" in v:
                    cur_v["in_app"] = bool(v["in_app"])
                if "email" in v:
                    cur_v["email"] = bool(v["email"])
                new_events[k] = cur_v
            update["events"] = new_events
        if update:
            update["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.notification_settings.update_one(
                {"id": WORKSPACE_KEY}, {"$set": update}, upsert=True
            )
        return await get_settings(db)

    @api.get("/notification-settings/ringtones")
    async def list_ringtones(user=Depends(get_current_user)):
        # Lightweight catalogue for the frontend picker.
        return {"ringtones": ALLOWED_RINGTONES}

