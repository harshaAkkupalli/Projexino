"""
Mass Email Campaigns module.

Endpoints (all under /api, admin/manager/hr only):
  GET    /email/campaigns                — list campaigns
  POST   /email/campaigns                — create draft / scheduled / immediate
  GET    /email/campaigns/{id}           — fetch one (with per-recipient delivery)
  POST   /email/campaigns/{id}/send      — send NOW (queues per-recipient delivery)
  DELETE /email/campaigns/{id}           — delete
  POST   /email/campaigns/ai-draft       — AI compose a body for the prompt

Recipient sources (any combination allowed):
  • emails      — manual array of email addresses
  • employees   — selected user_ids (resolved against users collection)
  • include_all_employees: bool — adds every user
  • clients     — selected client emails (resolved against finance.client_emails)
  • include_all_clients: bool — adds every finance client email

Scheduled campaigns are picked up by a background loop (kicked by the campaign scheduler in server.py).
"""
from __future__ import annotations

import os
import uuid
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("projexino.email_campaigns")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(d):
    if isinstance(d, dict):
        d.pop("_id", None)
    return d


class CampaignIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    subject: str = Field(..., min_length=1, max_length=300)
    body_html: str = Field(..., min_length=1)
    from_token_id: Optional[str] = ""
    from_name: Optional[str] = ""
    reply_to: Optional[str] = ""
    emails: List[str] = []
    employee_ids: List[str] = []
    include_all_employees: bool = False
    client_emails: List[str] = []
    include_all_clients: bool = False
    scheduled_at: Optional[str] = None   # ISO datetime, future
    send_now: bool = False               # if true, ignored unless scheduled_at empty


class AiDraftIn(BaseModel):
    prompt: str = Field(..., min_length=4, max_length=2000)
    audience: Optional[str] = "clients"     # "clients" | "employees" | "mixed"
    tone: Optional[str] = "professional"


async def _resolve_recipients(db, payload_or_doc) -> List[str]:
    out = set()
    for e in (payload_or_doc.get("emails") or []):
        if isinstance(e, str) and "@" in e:
            out.add(e.strip().lower())
    # employees
    emp_ids = payload_or_doc.get("employee_ids") or []
    if emp_ids:
        cur = db.users.find({"id": {"$in": list(emp_ids)}}, {"_id": 0, "email": 1})
        async for u in cur:
            if u.get("email"):
                out.add(u["email"].lower())
    if payload_or_doc.get("include_all_employees"):
        cur = db.users.find({}, {"_id": 0, "email": 1})
        async for u in cur:
            if u.get("email"):
                out.add(u["email"].lower())
    # clients (from finance.client_emails)
    cli = payload_or_doc.get("client_emails") or []
    for e in cli:
        if isinstance(e, str) and "@" in e:
            out.add(e.strip().lower())
    if payload_or_doc.get("include_all_clients"):
        cur = db.project_finance.find({}, {"_id": 0, "client_emails": 1})
        async for fdoc in cur:
            for ce in (fdoc.get("client_emails") or []):
                em = (ce.get("email") if isinstance(ce, dict) else ce) or ""
                if "@" in em:
                    out.add(em.lower())
    return sorted(out)


def register_email_campaigns(api: APIRouter, db, get_current_user):

    def _require_priv(u):
        if u.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

    @api.get("/email/campaigns")
    async def list_campaigns(user=Depends(get_current_user)):
        _require_priv(user)
        cur = db.email_campaigns.find({}, {"_id": 0}).sort("created_at", -1).limit(200)
        return await cur.to_list(200)

    @api.get("/email/campaigns/{cid}")
    async def get_campaign(cid: str, user=Depends(get_current_user)):
        _require_priv(user)
        c = await db.email_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Not found")
        return c

    @api.post("/email/campaigns")
    async def create_campaign(payload: CampaignIn, user=Depends(get_current_user)):
        _require_priv(user)
        data = payload.model_dump()
        recipients = await _resolve_recipients(db, data)
        if not recipients:
            raise HTTPException(400, "No recipients resolved. Add emails or pick employees/clients.")

        scheduled_at = (data.get("scheduled_at") or "").strip()
        if scheduled_at:
            try:
                # Accept "YYYY-MM-DDTHH:mm" or full ISO
                if "T" in scheduled_at and len(scheduled_at) <= 16:
                    scheduled_at = scheduled_at + ":00"
                # Validate parse
                dt = datetime.fromisoformat(scheduled_at.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                scheduled_at = dt.isoformat()
                status = "scheduled"
            except Exception:
                raise HTTPException(400, "Invalid scheduled_at; use ISO datetime.")
        else:
            status = "sending" if data.get("send_now") else "draft"

        doc = {
            "id": str(uuid.uuid4()),
            "name": data["name"],
            "subject": data["subject"],
            "body_html": data["body_html"],
            "from_token_id": data.get("from_token_id") or "",
            "from_name": data.get("from_name") or "",
            "reply_to": data.get("reply_to") or "",
            "emails": data.get("emails") or [],
            "employee_ids": data.get("employee_ids") or [],
            "include_all_employees": bool(data.get("include_all_employees")),
            "client_emails": data.get("client_emails") or [],
            "include_all_clients": bool(data.get("include_all_clients")),
            "recipients": recipients,
            "total_recipients": len(recipients),
            "delivered": 0,
            "failed": 0,
            "status": status,             # draft | scheduled | sending | sent | partial
            "scheduled_at": scheduled_at or None,
            "created_at": _now_iso(),
            "created_by": user.get("name", ""),
            "created_by_email": user.get("email", ""),
            "sent_at": None,
            "deliveries": [],            # [{email, ok, error, at}]
        }
        await db.email_campaigns.insert_one(doc)
        _strip_id(doc)
        # If immediate, fire and forget
        if status == "sending":
            asyncio.create_task(_run_campaign(db, doc["id"]))
        return doc

    @api.post("/email/campaigns/{cid}/send")
    async def send_campaign(cid: str, user=Depends(get_current_user)):
        _require_priv(user)
        c = await db.email_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Not found")
        if c.get("status") in ("sending", "sent"):
            raise HTTPException(400, f"Campaign already {c['status']}")
        await db.email_campaigns.update_one({"id": cid}, {"$set": {"status": "sending"}})
        asyncio.create_task(_run_campaign(db, cid))
        return {"ok": True, "queued": c.get("total_recipients", 0)}

    @api.delete("/email/campaigns/{cid}")
    async def delete_campaign(cid: str, user=Depends(get_current_user)):
        _require_priv(user)
        r = await db.email_campaigns.delete_one({"id": cid})
        if not r.deleted_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    @api.post("/email/campaigns/ai-draft")
    async def ai_draft(payload: AiDraftIn, user=Depends(get_current_user)):
        _require_priv(user)
        from ai_provider import chat_completion, ai_configured
        if not ai_configured():
            raise HTTPException(500, "AI not configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or EMERGENT_LLM_KEY)")
        try:
            audience = payload.audience or "clients"
            tone = payload.tone or "professional"
            system_msg = (
                "You are an expert marketing-email copywriter for Projexino Solutions Pvt Ltd, "
                f"writing to {audience} in a {tone} tone. "
                "Generate ONLY inline-styled INNER HTML (no <html>, <head>, <body>, no <style> tag). "
                "Use brand colours: primary #F97316, navy #0F2042, accent #A855F7. "
                "Use <p>, <h2>, <ul>, <li>, <a> with inline styles. Mention 'Projexino' once subtly. "
                "Respond as STRICT JSON: {\"subject\": \"...\", \"body_html\": \"...\"} only."
            )
            raw = await chat_completion(
                system_message=system_msg,
                user_message=payload.prompt,
                session_id=f"campaign-{uuid.uuid4()}",
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip("`\n ")
            import json as _json
            parsed = _json.loads(raw)
            return {
                "subject": parsed.get("subject", "Update from Projexino"),
                "body_html": parsed.get("body_html", ""),
            }
        except Exception as e:
            logger.exception("AI draft failed: %s", e)
            raise HTTPException(502, f"AI draft failed: {str(e)[:200]}")


async def _run_campaign(db, campaign_id: str):
    """Run delivery for one campaign — sends one email per recipient via email_module helpers."""
    from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service, _branded_template
    import base64
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    c = await db.email_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        return
    token = await _resolve_send_token(db, c.get("from_token_id") or None)
    if not token:
        await db.email_campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "failed", "error": "Gmail not connected"}}
        )
        return
    token = await _refresh_if_needed(db, token)
    service = _build_gmail_service(token)
    sender_email = token.get("email")
    from_name = c.get("from_name") or token.get("from_name") or "Projexino"
    reply_to = c.get("reply_to") or token.get("reply_to") or sender_email
    from_header = f'"{from_name}" <{sender_email}>'

    body_html = c.get("body_html") or ""
    if "<html" not in body_html.lower():
        body_html = _branded_template(c.get("subject", ""), body_html)

    delivered = 0
    failed = 0
    deliveries = []
    for to in (c.get("recipients") or []):
        msg = MIMEMultipart("alternative")
        msg["Subject"] = c.get("subject", "")
        msg["From"] = from_header
        msg["To"] = to
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.attach(MIMEText(body_html, "html"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        try:
            sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
            delivered += 1
            deliveries.append({"email": to, "ok": True, "message_id": sent.get("id"), "at": _now_iso()})
            await db.email_log.insert_one({
                "id": str(uuid.uuid4()),
                "to": [to],
                "subject": c.get("subject", ""),
                "from": from_header,
                "reply_to": reply_to,
                "message_id": sent.get("id"),
                "thread_id": sent.get("threadId"),
                "sent_by": c.get("created_by", ""),
                "sent_by_email": c.get("created_by_email", ""),
                "sent_at": _now_iso(),
                "campaign_id": campaign_id,
            })
        except Exception as e:
            failed += 1
            deliveries.append({"email": to, "ok": False, "error": str(e)[:300], "at": _now_iso()})
            logger.warning("Campaign %s failed for %s: %s", campaign_id, to, e)
        # Light throttle to keep Gmail happy
        await asyncio.sleep(0.4)

    status = "sent" if failed == 0 else ("partial" if delivered > 0 else "failed")
    await db.email_campaigns.update_one(
        {"id": campaign_id},
        {"$set": {
            "status": status,
            "delivered": delivered,
            "failed": failed,
            "sent_at": _now_iso(),
            "deliveries": deliveries,
        }},
    )


async def scheduled_campaign_loop(db, interval_seconds: int = 30):
    """Background loop — checks for scheduled campaigns whose time has come and dispatches them."""
    while True:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            cur = db.email_campaigns.find(
                {"status": "scheduled", "scheduled_at": {"$lte": now_iso}},
                {"_id": 0, "id": 1},
            )
            due = await cur.to_list(50)
            for c in due:
                await db.email_campaigns.update_one(
                    {"id": c["id"], "status": "scheduled"}, {"$set": {"status": "sending"}}
                )
                asyncio.create_task(_run_campaign(db, c["id"]))
        except Exception as e:
            logger.warning("scheduled_campaign_loop tick failed: %s", e)
        await asyncio.sleep(interval_seconds)
