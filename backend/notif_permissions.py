"""
PHASE F — Notification Permissions Center.

Lets Super Admin decide which roles/users get notified for which event types.
Super Admin is always copied by default.

DB: `notification_permissions` collection — single doc id="active" with:
  {
    id: "active",
    rules: {
      "<event_key>": {
        roles: ["super_admin","hr",...],   # broadcast to all users with these roles
        users: [user_id, ...],            # explicit users
        active: true,
      },
      ...
    }
  }

Endpoints:
  GET  /api/notif-permissions
  PUT  /api/notif-permissions
  GET  /api/notif-permissions/events   — list all known event keys + descriptions

Helper: `await get_extra_recipients(db, event)` returns a list of user dicts to
fan-out notifications to.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel


KNOWN_EVENTS = [
    {"key": "project_started",        "label": "Employee starts a project",  "category": "project"},
    {"key": "project_progress",       "label": "Project progress update",    "category": "project"},
    {"key": "task_started",           "label": "Employee starts a task",     "category": "task"},
    {"key": "task_progress",          "label": "Task progress update",       "category": "task"},
    {"key": "document_submitted",     "label": "Intern uploads a document",  "category": "hr"},
    {"key": "document_verification",  "label": "Document approved/rejected", "category": "hr"},
    {"key": "payslip_generated",      "label": "Payslip is generated",       "category": "hr"},
    {"key": "regulation_added",       "label": "New HR regulation",          "category": "hr"},
    {"key": "expense_added",          "label": "New expense logged",         "category": "hr"},
    {"key": "sign_doc_created",       "label": "New document-to-sign",       "category": "hr"},
    {"key": "sign_doc_signed",        "label": "Doc-to-sign signed",         "category": "hr"},
    {"key": "lead_won",               "label": "Lead marked as won",         "category": "sales"},
    {"key": "lead_lost",              "label": "Lead marked as lost",        "category": "sales"},
    {"key": "invoice_generated",      "label": "Invoice created",            "category": "finance"},
    {"key": "user_created",           "label": "New user account",           "category": "people"},
    {"key": "profile_updated",        "label": "User updates own profile",   "category": "people"},
    {"key": "login",                  "label": "User logs in",               "category": "presence"},
    {"key": "logout",                 "label": "User logs out",              "category": "presence"},
]


class RuleIn(BaseModel):
    roles: List[str] = []
    users: List[str] = []
    active: bool = True


class MatrixIn(BaseModel):
    rules: Dict[str, RuleIn]


async def get_extra_recipients(db, event: str) -> List[dict]:
    """Return user dicts (id, email, name) to notify for this event.
    Super_admins are always included."""
    out: Dict[str, dict] = {}
    # Always include all super admins
    async for u in db.users.find({"role": "super_admin"}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}):
        out[u["email"]] = u
    # Then add configured roles/users
    cfg = await db.notification_permissions.find_one({"id": "active"}, {"_id": 0})
    rules = (cfg or {}).get("rules") or {}
    rule = rules.get(event)
    if rule and rule.get("active") is not False:
        roles = rule.get("roles") or []
        if roles:
            async for u in db.users.find({"role": {"$in": roles}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}):
                out[u["email"]] = u
        user_ids = rule.get("users") or []
        if user_ids:
            async for u in db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}):
                out[u["email"]] = u
    return list(out.values())


def register_notif_permissions(api: APIRouter, db, get_current_user):

    @api.get("/notif-permissions/events")
    async def list_events(user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        return {"events": KNOWN_EVENTS}

    @api.get("/notif-permissions")
    async def get_perms(user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        doc = await db.notification_permissions.find_one({"id": "active"}, {"_id": 0}) or {"id": "active", "rules": {}}
        # Also include user directory for picker
        users_cur = db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1}).sort("name", 1)
        users = await users_cur.to_list(500)
        return {"rules": doc.get("rules", {}), "users": users, "events": KNOWN_EVENTS}

    @api.put("/notif-permissions")
    async def update_perms(payload: MatrixIn, user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        rules: Dict[str, Dict] = {}
        for k, r in payload.rules.items():
            rules[k] = r.model_dump()
        await db.notification_permissions.update_one(
            {"id": "active"},
            {"$set": {
                "id": "active",
                "rules": rules,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.get("email", ""),
            }},
            upsert=True,
        )
        return {"ok": True, "rules": rules}
