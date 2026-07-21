"""
PHASE B — Project & Task Lifecycle.

Endpoints:
  POST /api/lifecycle/project/{project_id}/start          — employee starts a project (timestamped + emails)
  POST /api/lifecycle/task/{task_id}/start                — employee starts a task
  POST /api/lifecycle/project/{project_id}/progress       — post a progress update (text + attachments)
  POST /api/lifecycle/task/{task_id}/progress             — post a task progress update
  GET  /api/lifecycle/project/{project_id}/timeline       — timeline events for a project
  GET  /api/lifecycle/task/{task_id}/timeline             — timeline events for a task
  GET  /api/lifecycle/project/{project_id}/full           — full project incl. timeline, tasks & members (100% visibility)

Timeline events are stored in `lifecycle_events`:
  { id, kind: started|progress|completed|note, entity: "project"|"task",
    entity_id, by_user_id, by_name, by_email, at, message, attachments[] }

Attachments are base64 (small) — stored inline; large files use existing /api/documents
upload then attached by document_id.
"""
from __future__ import annotations

import uuid
import os
import html
from datetime import datetime, timezone
from typing import List, Optional, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field


# ---------- Models ----------
class Attachment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kind: Literal["image", "file", "document_ref"] = "file"
    name: str
    mime_type: str = "application/octet-stream"
    size: int = 0
    content_base64: Optional[str] = None
    document_id: Optional[str] = None  # ref to existing /documents


class ProgressIn(BaseModel):
    message: str
    attachments: List[Attachment] = []
    percent_complete: Optional[int] = None  # 0..100 (optional update to project.progress)


# ---------- Helpers ----------
async def _find_recipients(db, project: dict) -> List[dict]:
    """Find Reporting Manager + Super Admin emails for a project."""
    rcps: dict = {}  # by email
    # Super admins
    sa_cur = db.users.find(
        {"role": {"$in": ["super_admin"]}},
        {"_id": 0, "id": 1, "email": 1, "name": 1},
    )
    async for u in sa_cur:
        rcps[u["email"]] = u
    # Project manager (looked up via `manager` name → email)
    manager_name = (project.get("manager") or "").strip()
    if manager_name:
        m = await db.users.find_one(
            {"name": manager_name, "role": {"$in": ["manager", "admin", "super_admin", "hr"]}},
            {"_id": 0, "id": 1, "email": 1, "name": 1},
        )
        if m:
            rcps[m["email"]] = m
    # Project owner (admin who created it)
    owner = await db.users.find_one({"id": project.get("owner_id", "")}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    if owner:
        rcps[owner["email"]] = owner
    # Phase F: configured extra recipients for project_progress event
    try:
        from notif_permissions import get_extra_recipients
        for u in await get_extra_recipients(db, "project_progress"):
            rcps[u["email"]] = u
    except Exception:
        pass
    return list(rcps.values())


async def _push_timeline_event(db, *, entity: str, entity_id: str, kind: str,
                               user: dict, message: str = "", attachments: Optional[list] = None) -> dict:
    ev = {
        "id": str(uuid.uuid4()),
        "entity": entity,
        "entity_id": entity_id,
        "kind": kind,
        "by_user_id": user["id"],
        "by_name": user.get("name", ""),
        "by_email": user.get("email", ""),
        "by_role": user.get("role", ""),
        "message": message,
        "attachments": [a if isinstance(a, dict) else a.model_dump() for a in (attachments or [])],
        "at": datetime.now(timezone.utc).isoformat(),
    }
    await db.lifecycle_events.insert_one(dict(ev))  # copy so _id doesn't leak
    return ev


async def _email_event(db, *, recipients: List[dict], subject: str, html_body: str):
    """Notify recipients via existing notif_engine (best-effort)."""
    try:
        from notif_engine import notify
        for r in recipients:
            try:
                await notify(
                    db,
                    event="project_lifecycle",
                    user_id=r["id"],
                    user_email=r["email"],
                    title=subject,
                    message=html_body[:240],
                    link="/app/projects",
                    variables={
                        "name": r.get("name", ""),
                        "subject": subject,
                        "body_html": html_body,
                    },
                    triggered_by={"name": "system", "email": ""},
                )
            except Exception:
                pass
    except Exception:
        pass


# ---------- Route registration ----------
def register_lifecycle(api: APIRouter, db, get_current_user):

    # 7-stage default pipeline so legacy projects get a populated UI tree.
    _DEFAULT_PIPELINE_KEYS = [
        ("requirements", "Requirements"),
        ("rnd", "R&D"),
        ("design", "Design"),
        ("development", "Development"),
        ("qa", "QA"),
        ("deployment", "Deployment"),
        ("maintenance", "Maintenance"),
    ]

    def _default_pipeline_stages():
        return [
            {"key": k, "label": label, "status": "not_started", "assignees": [],
             "notes": "", "started_at": "", "completed_at": "", "updated_at": ""}
            for k, label in _DEFAULT_PIPELINE_KEYS
        ]

    # ===== Project: full details (100% visibility) =====
    @api.get("/lifecycle/project/{project_id}/full")
    async def get_project_full(project_id: str, user=Depends(get_current_user)):
        proj = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "Project not found")
        # Access: owner OR listed member OR admin/super_admin/manager/hr OR manager name match
        priv = user.get("role") in ("super_admin", "admin", "manager", "hr")
        is_member = (
            user.get("name", "") in (proj.get("members") or [])
            or user.get("email", "") in (proj.get("members") or [])
            or proj.get("owner_id") == user["id"]
            or proj.get("manager", "") == user.get("name", "")
        )
        if not (priv or is_member):
            raise HTTPException(403, "Not authorised to view this project")
        # Backfill pipeline so the UI always has the 7-stage tree
        if not proj.get("pipeline"):
            proj["pipeline"] = _default_pipeline_stages()
        # Sanitize any other new fields the frontend reads
        proj.setdefault("cover_image_url", "")
        proj.setdefault("cover_image_base64", "")
        proj.setdefault("member_user_ids", [])
        proj.setdefault("intern_user_ids", [])
        proj.setdefault("manager_user_id", "")
        # Pull project tasks
        tasks = await db.tasks.find({"project_id": project_id}, {"_id": 0}).to_list(500)
        # Timeline
        events_cur = db.lifecycle_events.find(
            {"entity": "project", "entity_id": project_id},
            {"_id": 0},
        ).sort("at", -1)
        events = await events_cur.to_list(500)
        # Has the current user already started it?
        my_start = await db.lifecycle_events.find_one(
            {"entity": "project", "entity_id": project_id, "kind": "started", "by_user_id": user["id"]},
            {"_id": 0},
        )
        return {
            "project": proj,
            "tasks": tasks,
            "timeline": events,
            "my_started_at": my_start.get("at") if my_start else None,
        }

    @api.post("/lifecycle/project/{project_id}/start")
    async def start_project(project_id: str, user=Depends(get_current_user)):
        proj = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "Project not found")
        # Idempotent — don't double-record
        already = await db.lifecycle_events.find_one(
            {"entity": "project", "entity_id": project_id, "kind": "started", "by_user_id": user["id"]},
            {"_id": 0},
        )
        if already:
            return {"ok": True, "already_started_at": already["at"], "event": already}
        ev = await _push_timeline_event(
            db, entity="project", entity_id=project_id, kind="started",
            user=user, message=f"{user.get('name','')} started working on {proj.get('name','this project')}.",
        )
        # bump project status if planning → in_progress
        if proj.get("status") == "planning":
            await db.projects.update_one(
                {"id": project_id},
                {"$set": {"status": "in_progress", "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        # Notify
        recipients = await _find_recipients(db, proj)
        await _email_event(
            db, recipients=recipients,
            subject=f"🚀 {user.get('name','A team member')} started project: {proj.get('name','')}",
            html_body=(
                f"<p><b>{user.get('name','')}</b> ({user.get('email','')}) just clicked <b>Start</b> "
                f"on project <b>{proj.get('name','')}</b>.</p>"
                f"<p><b>Timestamp:</b> {ev['at']}</p>"
                f"<p>Login to the Projexino portal to follow live progress and updates.</p>"
            ),
        )
        return {"ok": True, "event": ev}

    @api.post("/lifecycle/project/{project_id}/progress")
    async def project_progress(project_id: str, payload: ProgressIn, user=Depends(get_current_user)):
        proj = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "Project not found")
        if not payload.message.strip() and not payload.attachments:
            raise HTTPException(400, "Provide a message or attachment")
        ev = await _push_timeline_event(
            db, entity="project", entity_id=project_id, kind="progress",
            user=user, message=payload.message.strip(), attachments=payload.attachments,
        )
        # Optional progress %
        if payload.percent_complete is not None:
            p = max(0, min(100, int(payload.percent_complete)))
            await db.projects.update_one(
                {"id": project_id},
                {"$set": {"progress": p, "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        # Notify
        recipients = await _find_recipients(db, proj)
        attach_count = len(payload.attachments)
        await _email_event(
            db, recipients=recipients,
            subject=f"📊 Progress update on {proj.get('name','')} — by {user.get('name','')}",
            html_body=(
                f"<p><b>{html.escape(user.get('name',''))}</b> posted a progress update on <b>{html.escape(proj.get('name',''))}</b>:</p>"
                f"<blockquote style='border-left:4px solid #F97316;padding:8px 14px;background:#FFF7ED;'>"
                f"{html.escape(payload.message)}</blockquote>"
                + (f"<p>📎 {attach_count} attachment(s).</p>" if attach_count else "")
                + (f"<p><b>Completion:</b> {payload.percent_complete}%</p>" if payload.percent_complete is not None else "")
            ),
        )
        return {"ok": True, "event": ev}

    @api.get("/lifecycle/project/{project_id}/timeline")
    async def project_timeline(project_id: str, user=Depends(get_current_user)):
        events = await db.lifecycle_events.find(
            {"entity": "project", "entity_id": project_id}, {"_id": 0},
        ).sort("at", -1).to_list(500)
        return events

    # ===== Task =====
    @api.post("/lifecycle/task/{task_id}/start")
    async def start_task(task_id: str, user=Depends(get_current_user)):
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(404, "Task not found")
        already = await db.lifecycle_events.find_one(
            {"entity": "task", "entity_id": task_id, "kind": "started", "by_user_id": user["id"]},
            {"_id": 0},
        )
        if already:
            return {"ok": True, "already_started_at": already["at"], "event": already}
        ev = await _push_timeline_event(
            db, entity="task", entity_id=task_id, kind="started",
            user=user, message=f"{user.get('name','')} started task: {task.get('title','')}.",
        )
        if task.get("status") == "todo":
            await db.tasks.update_one(
                {"id": task_id},
                {"$set": {"status": "in_progress", "updated_at": datetime.now(timezone.utc).isoformat()}},
            )
        # Notify (RM/SA based on parent project, plus task owner)
        recipients: dict = {}
        sa_cur = db.users.find({"role": "super_admin"}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        async for u in sa_cur:
            recipients[u["email"]] = u
        owner = await db.users.find_one({"id": task.get("owner_id", "")}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        if owner:
            recipients[owner["email"]] = owner
        if task.get("project_id"):
            proj = await db.projects.find_one({"id": task["project_id"]}, {"_id": 0})
            if proj:
                for r in await _find_recipients(db, proj):
                    recipients[r["email"]] = r
        await _email_event(
            db, recipients=list(recipients.values()),
            subject=f"▶️ Task started: {task.get('title','')}",
            html_body=(
                f"<p><b>{user.get('name','')}</b> started task <b>{task.get('title','')}</b>"
                + (f" in project <b>{task.get('project_name','')}</b>" if task.get('project_name') else "")
                + f" at {ev['at']}.</p>"
            ),
        )
        return {"ok": True, "event": ev}

    @api.post("/lifecycle/task/{task_id}/progress")
    async def task_progress(task_id: str, payload: ProgressIn, user=Depends(get_current_user)):
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        if not task:
            raise HTTPException(404, "Task not found")
        if not payload.message.strip() and not payload.attachments:
            raise HTTPException(400, "Provide a message or attachment")
        ev = await _push_timeline_event(
            db, entity="task", entity_id=task_id, kind="progress",
            user=user, message=payload.message.strip(), attachments=payload.attachments,
        )
        # Recipients: super_admin + task owner + parent project's RM + SA
        recipients: dict = {}
        sa_cur = db.users.find({"role": "super_admin"}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        async for u in sa_cur:
            recipients[u["email"]] = u
        owner = await db.users.find_one({"id": task.get("owner_id", "")}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        if owner:
            recipients[owner["email"]] = owner
        if task.get("project_id"):
            proj = await db.projects.find_one({"id": task["project_id"]}, {"_id": 0})
            if proj:
                for r in await _find_recipients(db, proj):
                    recipients[r["email"]] = r
        attach_count = len(payload.attachments)
        await _email_event(
            db, recipients=list(recipients.values()),
            subject=f"📝 Task update — {task.get('title','')}",
            html_body=(
                f"<p><b>{html.escape(user.get('name',''))}</b> shared a progress update on task <b>{html.escape(task.get('title',''))}</b>:</p>"
                f"<blockquote style='border-left:4px solid #A855F7;padding:8px 14px;background:#FAF5FF;'>"
                f"{html.escape(payload.message)}</blockquote>"
                + (f"<p>📎 {attach_count} attachment(s).</p>" if attach_count else "")
            ),
        )
        return {"ok": True, "event": ev}

    @api.get("/lifecycle/task/{task_id}/timeline")
    async def task_timeline(task_id: str, user=Depends(get_current_user)):
        events = await db.lifecycle_events.find(
            {"entity": "task", "entity_id": task_id}, {"_id": 0},
        ).sort("at", -1).to_list(500)
        return events

    # ===== Attachments download =====
    @api.get("/lifecycle/event/{event_id}/attachment/{attachment_id}")
    async def get_attachment(event_id: str, attachment_id: str, user=Depends(get_current_user)):
        ev = await db.lifecycle_events.find_one({"id": event_id}, {"_id": 0})
        if not ev:
            raise HTTPException(404, "Event not found")
        for a in ev.get("attachments", []) or []:
            if a.get("id") == attachment_id:
                return a
        raise HTTPException(404, "Attachment not found")
