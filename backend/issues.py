"""
Issues & Errors tracker.

Admins/Managers create issues (with image + URL + priority + assignee).
Developers (assignee or any team member) update status to one of:
  open / in_progress / pending / closed / completed
Anyone in the tenant can post comments on an issue.

Endpoints (all under /api/issues):
  GET    /              — list all issues (filter by status/priority/assignee via query)
  POST   /              — create issue (admin / manager / hr only)
  GET    /{id}          — fetch full issue detail (incl. image + comments)
  PATCH  /{id}          — update status / fields (creator or assignee)
  POST   /{id}/comments — append comment
  DELETE /{id}          — delete (admin only)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional, List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field


# --------- Models ---------

ISSUE_STATUSES = ("open", "in_progress", "pending", "completed", "closed")


class IssueCommentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class IssueIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = ""
    type: Literal["task", "error"] = "task"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["open", "in_progress", "pending", "completed", "closed"] = "open"
    project_id: Optional[str] = ""
    project_name: Optional[str] = ""
    assignee: Optional[str] = ""   # display name or email
    url: Optional[str] = ""
    image_base64: Optional[str] = ""
    image_mime: Optional[str] = ""
    image_name: Optional[str] = ""
    deadline: Optional[str] = ""


class IssuePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    type: Optional[Literal["task", "error"]] = None
    priority: Optional[Literal["low", "medium", "high", "critical"]] = None
    status: Optional[Literal["open", "in_progress", "pending", "completed", "closed"]] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    assignee: Optional[str] = None
    url: Optional[str] = None
    image_base64: Optional[str] = None
    image_mime: Optional[str] = None
    image_name: Optional[str] = None
    deadline: Optional[str] = None


def _issue_summary(doc: dict) -> dict:
    """Lightweight row for list view — strips heavy image_base64 and internal fields."""
    out = {k: v for k, v in doc.items() if k not in ("image_base64", "_image_present", "_id")}
    out["has_image"] = bool(doc.get("image_base64") or doc.get("_image_present"))
    out["comments_count"] = len(doc.get("comments") or [])
    return out


def register_issues(api: APIRouter, db, get_current_user):

    @api.get("/issues")
    async def list_issues(
        status: Optional[str] = None,
        type_: Optional[str] = None,
        assignee: Optional[str] = None,
        project_id: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        # Issues are workspace-wide (any authenticated user can see them).
        q = {}
        if status:
            q["status"] = status
        if type_:
            q["type"] = type_
        if assignee:
            q["assignee"] = assignee
        if project_id:
            q["project_id"] = project_id
        cur = db.issues.find(q, {"_id": 0, "image_base64": 0, "_image_present": 0}).sort("created_at", -1)
        items = await cur.to_list(500)
        # Backfill assignee_email for legacy rows: resolve once from users collection
        unresolved_names = {(it.get("assignee") or "").strip() for it in items
                            if (it.get("assignee") or "").strip() and not it.get("assignee_email") and "@" not in (it.get("assignee") or "")}
        name_to_email = {}
        if unresolved_names:
            users = await db.users.find(
                {"name": {"$in": list(unresolved_names)}},
                {"_id": 0, "name": 1, "email": 1},
            ).to_list(1000)
            name_to_email = {(u.get("name") or "").lower(): (u.get("email") or "").lower() for u in users}
        for it in items:
            it["comments_count"] = len(it.get("comments") or [])
            it["has_image"] = bool(it.get("has_image", False))
            if it.get("image_name"):
                it["has_image"] = True
            # Ensure assignee_email is present for the frontend Email action
            if not it.get("assignee_email"):
                a = (it.get("assignee") or "").strip()
                if a and "@" in a:
                    it["assignee_email"] = a.lower()
                elif a:
                    it["assignee_email"] = name_to_email.get(a.lower(), "")
                else:
                    it["assignee_email"] = ""
        return items

    @api.post("/issues")
    async def create_issue(payload: IssueIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Only admins, managers or HR can create issues")
        now = datetime.now(timezone.utc).isoformat()
        # Resolve assignee_email up front so frontend email actions don't have to re-enter it.
        assignee_raw = (payload.assignee or "").strip()
        assignee_email = ""
        if assignee_raw:
            if "@" in assignee_raw:
                assignee_email = assignee_raw.lower()
            else:
                u = await db.users.find_one(
                    {"name": {"$regex": f"^{assignee_raw}$", "$options": "i"}},
                    {"_id": 0, "email": 1},
                )
                if u:
                    assignee_email = (u.get("email") or "").lower()
        doc = {
            "id": str(uuid.uuid4()),
            "title": payload.title,
            "description": payload.description or "",
            "type": payload.type,
            "priority": payload.priority,
            "status": payload.status,
            "project_id": payload.project_id or "",
            "project_name": payload.project_name or "",
            "assignee": payload.assignee or "",
            "assignee_email": assignee_email,
            "url": payload.url or "",
            "image_base64": payload.image_base64 or "",
            "image_mime": payload.image_mime or "",
            "image_name": payload.image_name or "",
            "has_image": bool(payload.image_base64),
            "deadline": payload.deadline or "",
            "comments": [],
            "created_by": user["name"],
            "created_by_email": user["email"],
            "created_at": now,
            "updated_at": now,
        }
        await db.issues.insert_one(doc)
        doc.pop("_id", None)
        # Auto-notify the assignee
        try:
            assignee = (doc.get("assignee") or "").strip()
            if assignee:
                target = await db.users.find_one(
                    {"$or": [
                        {"email": assignee.lower()},
                        {"name": {"$regex": f"^{assignee}$", "$options": "i"}},
                    ]},
                    {"_id": 0, "id": 1, "email": 1, "name": 1},
                )
                if target:
                    from notif_engine import notify
                    await notify(
                        db,
                        event="issue_assigned",
                        user_id=target["id"],
                        user_email=target["email"],
                        title=f"Issue assigned: {doc['title']}",
                        message=f"Priority {doc.get('priority','medium')}",
                        link="/app/issues",
                        variables={
                            "name": target.get("name", ""),
                            "issue_title": doc["title"],
                            "priority": doc.get("priority", "medium"),
                            "url": doc.get("url", ""),
                        },
                        triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                    )
        except Exception:
            import logging
            logging.getLogger("projexino.issues").exception("Issue-assigned notify failed")
        return _issue_summary(doc)

    @api.get("/issues/{issue_id}")
    async def get_issue(issue_id: str, user=Depends(get_current_user)):
        doc = await db.issues.find_one({"id": issue_id}, {"_id": 0, "_image_present": 0})
        if not doc:
            raise HTTPException(404, "Issue not found")
        return doc

    @api.patch("/issues/{issue_id}")
    async def patch_issue(issue_id: str, body: IssuePatch, user=Depends(get_current_user)):
        existing = await db.issues.find_one({"id": issue_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Issue not found")
        updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            return existing
        # Permission:
        #   - admin/manager/hr can update anything
        #   - assignee can update status + add details
        is_priv = user.get("role") in ("super_admin","admin","manager","hr")
        is_assignee = (existing.get("assignee") or "") and (
            existing["assignee"].lower() == (user.get("name") or "").lower()
            or existing["assignee"].lower() == (user.get("email") or "").lower()
        )
        if not is_priv and not is_assignee:
            raise HTTPException(403, "You can only modify issues assigned to you")
        if "image_base64" in updates:
            updates["has_image"] = bool(updates["image_base64"])
        # Keep assignee_email in sync whenever assignee changes
        if "assignee" in updates:
            a = (updates.get("assignee") or "").strip()
            if not a:
                updates["assignee_email"] = ""
            elif "@" in a:
                updates["assignee_email"] = a.lower()
            else:
                u = await db.users.find_one(
                    {"name": {"$regex": f"^{a}$", "$options": "i"}},
                    {"_id": 0, "email": 1},
                )
                updates["assignee_email"] = (u or {}).get("email", "").lower()
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.issues.update_one({"id": issue_id}, {"$set": updates})
        merged = {**existing, **updates}
        merged.pop("_id", None)
        return merged

    @api.post("/issues/{issue_id}/comments")
    async def add_comment(issue_id: str, body: IssueCommentIn, user=Depends(get_current_user)):
        existing = await db.issues.find_one({"id": issue_id}, {"_id": 0, "image_base64": 0})
        if not existing:
            raise HTTPException(404, "Issue not found")
        comment = {
            "id": str(uuid.uuid4()),
            "text": body.text,
            "author": user["name"],
            "author_email": user["email"],
            "author_role": user.get("role", "member"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.issues.update_one(
            {"id": issue_id},
            {"$push": {"comments": comment}, "$set": {"updated_at": comment["created_at"]}},
        )
        return comment

    @api.delete("/issues/{issue_id}")
    async def delete_issue(issue_id: str, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        await db.issues.delete_one({"id": issue_id})
        return {"ok": True}
