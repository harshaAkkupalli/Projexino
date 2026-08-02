"""wa_outreach.py — WhatsApp click-to-chat outreach (Option A).

Lead-list driven wa.me deep links with reusable message templates and a send log.
Upgrade path: WhatsApp Business Cloud API inbox (Option B) can reuse the same
templates + log collections.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Body, Depends, HTTPException

PRIV_ROLES = ("super_admin", "admin", "manager")

DEFAULT_TEMPLATES = [
    {"name": "Intro — services", "body": "Hi {{FirstName}}! 👋 This is Projexino Solutions. We help companies like {{CompanyName}} build web & mobile products, automations and AI tools. Could we show you a quick 5-min demo relevant to {{Industry}}?"},
    {"name": "Follow-up", "body": "Hi {{FirstName}}, just following up on my earlier message about how Projexino can help {{CompanyName}}. Happy to share case studies from {{Industry}} — when works for a quick call?"},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        digits = "91" + digits
    if digits.startswith("0") and len(digits) == 11:
        digits = "91" + digits[1:]
    return digits


def register_wa_outreach(api: APIRouter, db, get_current_user):

    def _guard(user):
        if user.get("role") not in PRIV_ROLES:
            raise HTTPException(403, "WhatsApp outreach is for Admin / Manager")

    async def _seed_defaults():
        if await db.wa_templates.count_documents({}) == 0:
            for t in DEFAULT_TEMPLATES:
                await db.wa_templates.insert_one({"id": uuid.uuid4().hex, **t, "created_at": _now(), "updated_at": _now()})

    @api.get("/outreach/wa-templates")
    async def wa_templates(user=Depends(get_current_user)):
        _guard(user)
        await _seed_defaults()
        return await db.wa_templates.find({}, {"_id": 0}).sort("updated_at", -1).to_list(200)

    @api.post("/outreach/wa-templates")
    async def wa_template_create(payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        _guard(user)
        name = (payload.get("name") or "").strip()
        body = (payload.get("body") or "").strip()
        if not name or not body:
            raise HTTPException(400, "Name and message body are required")
        doc = {"id": uuid.uuid4().hex, "name": name[:80], "body": body[:2000],
               "created_at": _now(), "updated_at": _now()}
        await db.wa_templates.insert_one(dict(doc))
        return doc

    @api.patch("/outreach/wa-templates/{tid}")
    async def wa_template_update(tid: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        _guard(user)
        updates = {}
        if payload.get("name"):
            updates["name"] = payload["name"].strip()[:80]
        if payload.get("body"):
            updates["body"] = payload["body"].strip()[:2000]
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = _now()
        r = await db.wa_templates.update_one({"id": tid}, {"$set": updates})
        if not r.matched_count:
            raise HTTPException(404, "Template not found")
        return await db.wa_templates.find_one({"id": tid}, {"_id": 0})

    @api.delete("/outreach/wa-templates/{tid}")
    async def wa_template_delete(tid: str, user=Depends(get_current_user)):
        _guard(user)
        r = await db.wa_templates.delete_one({"id": tid})
        if not r.deleted_count:
            raise HTTPException(404, "Template not found")
        return {"ok": True}

    @api.post("/outreach/wa-log")
    async def wa_log(payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        _guard(user)
        phone = normalize_phone(payload.get("phone") or "")
        if not phone:
            raise HTTPException(400, "Valid phone required")
        doc = {
            "id": uuid.uuid4().hex,
            "lead_id": payload.get("lead_id") or "",
            "list_id": payload.get("list_id") or "",
            "template_id": payload.get("template_id") or "",
            "phone": phone,
            "by": {"id": user["id"], "name": user.get("name", "")},
            "at": _now(),
        }
        await db.wa_sends.insert_one(dict(doc))
        if doc["lead_id"]:
            await db.outreach_leads.update_one({"id": doc["lead_id"]}, {"$set": {"wa_last_contacted": doc["at"]}})
        return {"ok": True, "at": doc["at"]}

    @api.get("/outreach/wa-log")
    async def wa_log_list(list_id: str = "", user=Depends(get_current_user)):
        _guard(user)
        q: Dict[str, Any] = {}
        if list_id:
            q["list_id"] = list_id
        rows = await db.wa_sends.find(q, {"_id": 0}).sort("at", -1).to_list(2000)
        last: Dict[str, str] = {}
        for r in rows:
            key = r.get("lead_id") or r.get("phone")
            if key and key not in last:
                last[key] = r["at"]
        return {"sends": rows[:200], "last_contacted": last}
