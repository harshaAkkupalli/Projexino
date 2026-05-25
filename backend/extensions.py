"""
Projexino — Extension modules (Projects, Documents, Chat, Notifications, Interns, AI).
All Pydantic models declared at module scope so FastAPI OpenAPI works.
"""
from __future__ import annotations

import io
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Literal, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, ConfigDict, EmailStr

logger = logging.getLogger("projexino.ext")


# =================================================================
# PROJECTS — Models
# =================================================================
ProjectStatus = Literal["planning", "in_progress", "on_hold", "completed", "cancelled"]
ProjectPriority = Literal["low", "medium", "high", "critical"]

# Project pipeline stages (ordered). Each stage tracks its own assignees,
# status, and free-form notes. Non-assignees see the stage as "locked".
PIPELINE_STAGES = [
    {"key": "requirements", "label": "Requirements"},
    {"key": "rnd",          "label": "R&D"},
    {"key": "design",       "label": "Design"},
    {"key": "development",  "label": "Development"},
    {"key": "qa",           "label": "QA"},
    {"key": "deployment",   "label": "Deployment"},
    {"key": "maintenance",  "label": "Maintenance"},
]
PIPELINE_STAGE_KEYS = [s["key"] for s in PIPELINE_STAGES]
StageStatus = Literal["not_started", "in_progress", "blocked", "completed"]


class StageAssignee(BaseModel):
    """One person attached to a pipeline stage."""
    model_config = ConfigDict(extra="ignore")
    user_id: str = ""
    email: str = ""
    name: str = ""
    role: str = ""  # user.role at time of assignment, denormalized for display


class PipelineStage(BaseModel):
    """A single stage in the project pipeline."""
    model_config = ConfigDict(extra="ignore")
    key: str
    label: str
    status: StageStatus = "not_started"
    assignees: List[StageAssignee] = []
    notes: str = ""
    started_at: str = ""
    completed_at: str = ""
    updated_at: str = ""


def _default_pipeline() -> List[Dict[str, Any]]:
    return [
        {
            "key": s["key"], "label": s["label"], "status": "not_started",
            "assignees": [], "notes": "", "started_at": "",
            "completed_at": "", "updated_at": "",
        }
        for s in PIPELINE_STAGES
    ]


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    client: Optional[str] = ""
    client_email: Optional[str] = ""        # NEW — optional client email for quick comms
    cover_image_url: Optional[str] = ""    # NEW — uploaded URL or pasted https://
    cover_image_base64: Optional[str] = "" # NEW — alternative inline data URL
    status: ProjectStatus = "planning"
    priority: ProjectPriority = "medium"
    start_date: Optional[str] = ""
    deadline: Optional[str] = ""
    # NEW — structured assignment fields. `members` kept for backward compat.
    members: List[str] = []                # legacy free-text names/emails
    member_user_ids: List[str] = []        # NEW — strongly-typed team members
    intern_user_ids: List[str] = []        # NEW — interns assigned to project
    manager_user_id: Optional[str] = ""    # NEW — primary project manager
    manager: Optional[str] = ""            # legacy free-text manager name
    tags: List[str] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    client: Optional[str] = None
    client_email: Optional[str] = None
    cover_image_url: Optional[str] = None
    cover_image_base64: Optional[str] = None
    status: Optional[ProjectStatus] = None
    priority: Optional[ProjectPriority] = None
    start_date: Optional[str] = None
    deadline: Optional[str] = None
    members: Optional[List[str]] = None
    member_user_ids: Optional[List[str]] = None
    intern_user_ids: Optional[List[str]] = None
    manager_user_id: Optional[str] = None
    manager: Optional[str] = None
    tags: Optional[List[str]] = None
    progress: Optional[int] = None


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str = ""
    client: str = ""
    client_email: str = ""
    cover_image_url: str = ""
    cover_image_base64: str = ""
    status: ProjectStatus = "planning"
    priority: ProjectPriority = "medium"
    start_date: str = ""
    deadline: str = ""
    members: List[str] = []
    member_user_ids: List[str] = []
    intern_user_ids: List[str] = []
    manager_user_id: str = ""
    manager: str = ""
    manager_email: str = ""
    member_emails: List[str] = []     # NEW — denormalized for one-click email
    tags: List[str] = []
    progress: int = 0
    pipeline: List[PipelineStage] = []   # NEW — per-stage tracker
    owner_id: str
    created_by_email: str = ""
    created_by_name: str = ""
    created_at: str
    updated_at: str


class StageUpdate(BaseModel):
    status: Optional[StageStatus] = None
    notes: Optional[str] = None
    assignees: Optional[List[StageAssignee]] = None


# =================================================================
# DOCUMENTS — Models
# =================================================================
class DocumentCreate(BaseModel):
    name: str
    mime_type: str
    size: int
    content_base64: str
    project_id: Optional[str] = ""
    shared_with: List[str] = []
    description: Optional[str] = ""


class DocumentComment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    author: str
    message: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    mime_type: str
    size: int
    project_id: str = ""
    shared_with: List[str] = []
    description: str = ""
    comments: List[DocumentComment] = []
    uploader: str
    owner_id: str
    created_at: str


# =================================================================
# CHAT — Models
# =================================================================
class ChannelCreate(BaseModel):
    name: str
    kind: Literal["direct", "group", "project"] = "group"
    member_ids: List[str] = []
    project_id: Optional[str] = ""


class Channel(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    kind: str = "group"
    member_ids: List[str] = []
    project_id: str = ""
    owner_id: str
    created_at: str
    last_message_at: str = ""


class ChatMessageCreate(BaseModel):
    channel_id: str
    text: Optional[str] = ""
    attachment_name: Optional[str] = ""
    attachment_mime: Optional[str] = ""
    attachment_base64: Optional[str] = ""


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    channel_id: str
    author: str
    author_email: str
    text: str = ""
    attachment_name: str = ""
    attachment_mime: str = ""
    attachment_url_id: str = ""
    created_at: str


# =================================================================
# NOTIFICATIONS — Models
# =================================================================
class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    owner_id: str
    kind: str
    title: str
    message: str
    link: str = ""
    read: bool = False
    created_at: str


# =================================================================
# INTERNS — Models
# =================================================================
InternStatus = Literal["active", "completed", "terminated"]


class InternCreate(BaseModel):
    name: str
    email: EmailStr
    designation: str
    department: str = "Engineering"
    reporting_manager: str = ""
    reporting_manager_email: str = ""
    start_date: str
    end_date: str
    bio: Optional[str] = ""
    salary: Optional[float] = None
    stipend: Optional[float] = None
    phone: Optional[str] = ""
    location: Optional[str] = ""


class InternUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    designation: Optional[str] = None
    department: Optional[str] = None
    reporting_manager: Optional[str] = None
    reporting_manager_email: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[InternStatus] = None
    bio: Optional[str] = None
    salary: Optional[float] = None
    stipend: Optional[float] = None
    phone: Optional[str] = None
    location: Optional[str] = None


class Badge(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    reason: str
    icon: str = "trophy"
    color: str = "#F97316"
    earned_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Intern(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    designation: str
    department: str = "Engineering"
    reporting_manager: str = ""
    reporting_manager_email: str = ""
    start_date: str = ""
    end_date: str = ""
    status: InternStatus = "active"
    bio: str = ""
    salary: Optional[float] = None
    stipend: Optional[float] = None
    phone: str = ""
    location: str = ""
    badges: List[Badge] = []
    tasks_assigned: int = 0
    tasks_on_time: int = 0
    submitted_docs: dict = {}
    linked_user_id: str = ""
    owner_id: str
    created_by_email: str = ""   # email of the user (HR / admin) who added this intern
    created_by_name: str = ""    # display name of the user who added this intern
    created_at: str
    updated_at: str


InternTaskStatus = Literal["assigned", "in_progress", "submitted", "completed", "overdue"]


class InternTaskCreate(BaseModel):
    intern_id: str
    title: str
    description: Optional[str] = ""
    project_id: Optional[str] = ""
    project_name: Optional[str] = ""
    deadline: str
    priority: Literal["low", "medium", "high"] = "medium"


class InternTaskUpdate(BaseModel):
    status: Optional[InternTaskStatus] = None
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    completion_note: Optional[str] = None


class InternTask(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    intern_id: str
    title: str
    description: str = ""
    project_id: str = ""
    project_name: str = ""
    deadline: str
    priority: str = "medium"
    status: InternTaskStatus = "assigned"
    completion_note: str = ""
    completed_at: str = ""
    on_time: Optional[bool] = None
    owner_id: str
    created_at: str
    updated_at: str


# =================================================================
# AI — Models
# =================================================================
class AISend(BaseModel):
    session_id: str
    message: str
    mode: Literal["code", "doc", "general"] = "general"


class AISessionCreate(BaseModel):
    title: str = "New chat"
    mode: Literal["code", "doc", "general"] = "general"


# =================================================================
# Route registration
# =================================================================
def register_extensions(api: APIRouter, db, get_current_user):
    MAX_DOC_BYTES = 10 * 1024 * 1024

    async def _create_notification(owner_id, kind, title, message, link=""):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "owner_id": owner_id,
            "kind": kind,
            "title": title,
            "message": message,
            "link": link,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # -------- Projects --------
    # -------- Projects helpers --------
    async def _resolve_users_by_ids(user_ids: List[str]) -> List[Dict[str, Any]]:
        """Fetch minimal user docs for a list of ids."""
        if not user_ids:
            return []
        cur = db.users.find(
            {"id": {"$in": [u for u in user_ids if u]}},
            {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
        )
        return [u async for u in cur]

    async def _denormalize_project_recipients(doc: Dict[str, Any]) -> None:
        """Populate manager_email + member_emails on a project doc in-place.
        Used so the frontend Email button can pre-fill recipients without re-entry."""
        manager_email = ""
        if doc.get("manager_user_id"):
            mu = await db.users.find_one(
                {"id": doc["manager_user_id"]}, {"_id": 0, "email": 1},
            )
            manager_email = (mu or {}).get("email", "") or ""
        member_ids = list(doc.get("member_user_ids", []) or []) + list(doc.get("intern_user_ids", []) or [])
        member_emails: List[str] = []
        if member_ids:
            cur = db.users.find(
                {"id": {"$in": [u for u in member_ids if u]}},
                {"_id": 0, "email": 1},
            )
            async for u in cur:
                e = (u.get("email") or "").strip()
                if e and e.lower() != manager_email.lower():
                    member_emails.append(e)
        # Also include any free-text members that look like emails (legacy)
        for m in doc.get("members", []) or []:
            if isinstance(m, str) and "@" in m and m.strip().lower() not in {e.lower() for e in member_emails} and m.strip().lower() != manager_email.lower():
                member_emails.append(m.strip())
        doc["manager_email"] = manager_email
        doc["member_emails"] = member_emails
        doc.setdefault("client_email", doc.get("client_email", ""))

    async def _project_visibility_query(user: Dict[str, Any]) -> Dict[str, Any]:
        """Build a Mongo query that returns projects a user is allowed to see.
        Super-admins + admins see everything; others see what they own, manage,
        are members of, OR have a pipeline stage assignment on."""
        role = user.get("role")
        if role in ("super_admin", "admin"):
            return {}
        uid = user["id"]
        email = (user.get("email") or "").lower()
        name = user.get("name") or ""
        clauses: List[Dict[str, Any]] = [
            {"owner_id": uid},
            {"manager_user_id": uid},
            {"member_user_ids": uid},
            {"intern_user_ids": uid},
            {"pipeline.assignees.user_id": uid},
        ]
        if email:
            clauses.append({"pipeline.assignees.email": email})
            # legacy free-text fallback
            clauses.append({"members": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
        if name:
            clauses.append({"members": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
            clauses.append({"manager": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        return {"$or": clauses}

    @api.get("/projects/analytics/summary")
    async def project_analytics(user=Depends(get_current_user)):
        q = await _project_visibility_query(user)
        cur = db.projects.find(q, {"_id": 0})
        projects = await cur.to_list(2000)
        by_status: dict = {}
        for p in projects:
            by_status[p["status"]] = by_status.get(p["status"], 0) + 1
        return {
            "total": len(projects),
            "by_status": by_status,
            "completed": by_status.get("completed", 0),
            "in_progress": by_status.get("in_progress", 0),
        }

    @api.get("/projects", response_model=List[Project])
    async def list_projects(user=Depends(get_current_user)):
        q = await _project_visibility_query(user)
        cur = db.projects.find(q, {"_id": 0}).sort("created_at", -1)
        items = await cur.to_list(2000)
        # Backfill new fields for legacy rows so the Project model validates
        for it in items:
            it.setdefault("cover_image_url", "")
            it.setdefault("cover_image_base64", "")
            it.setdefault("member_user_ids", [])
            it.setdefault("intern_user_ids", [])
            it.setdefault("manager_user_id", "")
            it.setdefault("pipeline", _default_pipeline())
            it.setdefault("created_by_email", "")
            it.setdefault("created_by_name", "")
            it.setdefault("client_email", "")
        # Denormalize emails so the Email action prefills recipients
        for it in items:
            await _denormalize_project_recipients(it)
        return [Project(**d) for d in items]

    async def _notify_project_assignment(
        db, project: Dict[str, Any], assignees: List[Dict[str, Any]],
        triggered_by: Dict[str, Any], reason: str = "added",
    ):
        """Send in-app + email notification to each assignee of a project."""
        from notif_engine import notify
        for u in assignees:
            try:
                await notify(
                    db,
                    event="project_assigned",
                    user_id=u["id"],
                    user_email=u["email"],
                    title=f"{'Added' if reason == 'added' else 'Updated'} on project: {project['name']}",
                    message=(
                        f"You've been assigned to '{project['name']}'. "
                        "Open the Projects page to see the pipeline and start."
                    ),
                    link=f"/app/projects/{project['id']}",
                    variables={
                        "name": u.get("name", ""),
                        "project_name": project["name"],
                        "role": "Project Member",
                        "start_date": project.get("start_date", "—"),
                        "deadline": project.get("deadline", "—"),
                        "client": project.get("client", "—"),
                    },
                    triggered_by=triggered_by,
                )
            except Exception:
                logger.exception("project_assigned notify failed for %s", u.get("email"))

    @api.post("/projects", response_model=Project)
    async def create_project(payload: ProjectCreate, user=Depends(get_current_user)):
        now = datetime.now(timezone.utc).isoformat()
        doc = payload.model_dump()
        # Resolve manager + members for denormalized display
        manager_user = None
        if doc.get("manager_user_id"):
            manager_user = await db.users.find_one(
                {"id": doc["manager_user_id"]},
                {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
            )
            if manager_user and not doc.get("manager"):
                doc["manager"] = manager_user.get("name") or manager_user["email"]
        members_users = await _resolve_users_by_ids(doc.get("member_user_ids", []))
        interns_users = await _resolve_users_by_ids(doc.get("intern_user_ids", []))
        # Merge legacy `members` (free-text names) with resolved users for display
        merged_member_display = list(doc.get("members", []) or [])
        for u in members_users + interns_users:
            display = u.get("name") or u["email"]
            if display not in merged_member_display:
                merged_member_display.append(display)
        doc["members"] = merged_member_display
        doc.update({
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "created_by_email": user.get("email", ""),
            "created_by_name": user.get("name", ""),
            "progress": 0,
            "pipeline": _default_pipeline(),
            "created_at": now,
            "updated_at": now,
        })
        await db.projects.insert_one(doc)
        doc.pop("_id", None)
        # Notify creator (audit-style entry)
        try:
            await _create_notification(
                user["id"], "project_created",
                f"Project created: {doc['name']}",
                f"New project '{doc['name']}' was added to your workspace.",
                f"/app/projects/{doc['id']}",
            )
        except Exception:
            pass
        # Notify all assignees (manager, members, interns)
        all_assignees: List[Dict[str, Any]] = []
        if manager_user:
            all_assignees.append(manager_user)
        for u in members_users + interns_users:
            if u["id"] != user["id"] and not any(a["id"] == u["id"] for a in all_assignees):
                all_assignees.append(u)
        await _notify_project_assignment(
            db, doc, all_assignees,
            triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
        )
        await _denormalize_project_recipients(doc)
        return Project(**doc)

    @api.get("/projects/{project_id}", response_model=Project)
    async def get_project(project_id: str, user=Depends(get_current_user)):
        # Use the visibility query so members + interns + admins all get access
        q = await _project_visibility_query(user)
        q["id"] = project_id
        doc = await db.projects.find_one(q, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Project not found")
        # Backfill for legacy
        doc.setdefault("cover_image_url", "")
        doc.setdefault("cover_image_base64", "")
        doc.setdefault("member_user_ids", [])
        doc.setdefault("intern_user_ids", [])
        doc.setdefault("manager_user_id", "")
        doc.setdefault("pipeline", _default_pipeline())
        doc.setdefault("created_by_email", "")
        doc.setdefault("created_by_name", "")
        doc.setdefault("client_email", "")
        await _denormalize_project_recipients(doc)
        return Project(**doc)

    @api.patch("/projects/{project_id}", response_model=Project)
    async def update_project(project_id: str, payload: ProjectUpdate, user=Depends(get_current_user)):
        # Only owner / manager / admin can edit a project's top-level fields.
        existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Project not found")
        role = user.get("role")
        can_edit = (
            existing.get("owner_id") == user["id"]
            or existing.get("manager_user_id") == user["id"]
            or role in ("super_admin", "admin", "manager")
        )
        if not can_edit:
            raise HTTPException(403, "Not allowed to edit this project")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

        # If membership changed, find NEW additions and notify them
        new_assignees_to_notify: List[Dict[str, Any]] = []
        prev_member_ids = set(existing.get("member_user_ids") or [])
        prev_intern_ids = set(existing.get("intern_user_ids") or [])
        prev_manager_id = existing.get("manager_user_id") or ""

        if "manager_user_id" in updates and updates["manager_user_id"] and updates["manager_user_id"] != prev_manager_id:
            new_manager = await db.users.find_one(
                {"id": updates["manager_user_id"]},
                {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
            )
            if new_manager:
                new_assignees_to_notify.append(new_manager)
                if not updates.get("manager"):
                    updates["manager"] = new_manager.get("name") or new_manager["email"]

        if "member_user_ids" in updates:
            added = set(updates["member_user_ids"]) - prev_member_ids
            new_assignees_to_notify.extend(await _resolve_users_by_ids(list(added)))
        if "intern_user_ids" in updates:
            added = set(updates["intern_user_ids"]) - prev_intern_ids
            new_assignees_to_notify.extend(await _resolve_users_by_ids(list(added)))

        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one({"id": project_id}, {"$set": updates})
        if "status" in updates and updates["status"] != existing.get("status"):
            try:
                await _create_notification(
                    user["id"], "project_status_change",
                    f"{existing['name']}: status changed",
                    f"Status: {existing.get('status')} → {updates['status']}",
                    f"/app/projects/{project_id}",
                )
            except Exception:
                pass
        merged = {**existing, **updates}
        # Backfill before validating
        merged.setdefault("cover_image_url", "")
        merged.setdefault("cover_image_base64", "")
        merged.setdefault("member_user_ids", [])
        merged.setdefault("intern_user_ids", [])
        merged.setdefault("manager_user_id", "")
        merged.setdefault("pipeline", _default_pipeline())
        merged.setdefault("created_by_email", "")
        merged.setdefault("created_by_name", "")
        # Fire notifications for new additions
        if new_assignees_to_notify:
            await _notify_project_assignment(
                db, merged, new_assignees_to_notify,
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
        merged.setdefault("client_email", "")
        await _denormalize_project_recipients(merged)
        return Project(**merged)

    @api.delete("/projects/{project_id}")
    async def delete_project(project_id: str, user=Depends(get_current_user)):
        existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Project not found")
        role = user.get("role")
        if existing.get("owner_id") != user["id"] and role not in ("super_admin", "admin"):
            raise HTTPException(403, "Only the owner or an admin can delete this project")
        await db.projects.delete_one({"id": project_id})
        await db.tasks.update_many(
            {"project_id": project_id},
            {"$set": {"project_id": "", "project_name": ""}},
        )
        return {"ok": True}

    # -------- Pipeline stage management --------
    def _user_in_stage(stage: Dict[str, Any], user: Dict[str, Any]) -> bool:
        uid = user["id"]
        email = (user.get("email") or "").lower()
        for a in stage.get("assignees", []):
            if a.get("user_id") == uid:
                return True
            if email and (a.get("email") or "").lower() == email:
                return True
        return False

    @api.patch("/projects/{project_id}/pipeline/{stage_key}")
    async def update_pipeline_stage(
        project_id: str, stage_key: str, payload: StageUpdate,
        user=Depends(get_current_user),
    ):
        if stage_key not in PIPELINE_STAGE_KEYS:
            raise HTTPException(400, f"stage_key must be one of {PIPELINE_STAGE_KEYS}")
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project:
            raise HTTPException(404, "Project not found")
        role = user.get("role")
        pipeline = project.get("pipeline") or _default_pipeline()
        # Locate stage
        idx = next((i for i, s in enumerate(pipeline) if s["key"] == stage_key), -1)
        if idx == -1:
            raise HTTPException(404, "Stage not found")
        stage = pipeline[idx]
        # Permission: stage assignees OR project manager OR project owner OR admin can edit
        can_edit_stage = (
            _user_in_stage(stage, user)
            or project.get("manager_user_id") == user["id"]
            or project.get("owner_id") == user["id"]
            or role in ("super_admin", "admin", "manager")
        )
        if not can_edit_stage:
            raise HTTPException(403, "You are not assigned to this stage")
        # Only owner/manager/admin can change the assignees list
        updates_dict = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "assignees" in updates_dict and not (
            project.get("manager_user_id") == user["id"]
            or project.get("owner_id") == user["id"]
            or role in ("super_admin", "admin", "manager")
        ):
            raise HTTPException(403, "Only project owner/manager/admin can change stage assignees")
        now = datetime.now(timezone.utc).isoformat()
        if "status" in updates_dict:
            new_status = updates_dict["status"]
            if new_status == "in_progress" and not stage.get("started_at"):
                stage["started_at"] = now
            if new_status == "completed":
                stage["completed_at"] = now
            stage["status"] = new_status
        if "notes" in updates_dict:
            stage["notes"] = updates_dict["notes"]
        previous_assignee_ids: List[str] = []
        if "assignees" in updates_dict:
            previous_assignee_ids = [a.get("user_id", "") for a in stage.get("assignees", [])]
            stage["assignees"] = [a if isinstance(a, dict) else a.dict() for a in updates_dict["assignees"]]
        stage["updated_at"] = now
        pipeline[idx] = stage
        # Auto-compute project progress (each stage = 100/N % when completed)
        n = len(pipeline)
        if n:
            done = sum(1 for s in pipeline if s.get("status") == "completed")
            project_progress = int(round((done / n) * 100))
        else:
            project_progress = 0
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"pipeline": pipeline, "progress": project_progress, "updated_at": now}},
        )
        # Notify newly-added stage assignees
        if "assignees" in updates_dict:
            new_ids = [a.get("user_id", "") for a in stage["assignees"] if a.get("user_id")]
            added_ids = list(set(new_ids) - set(previous_assignee_ids))
            if added_ids:
                added_users = await _resolve_users_by_ids(added_ids)
                from notif_engine import notify
                for u in added_users:
                    try:
                        await notify(
                            db,
                            event="stage_assigned",
                            user_id=u["id"],
                            user_email=u["email"],
                            title=f"Assigned to stage: {stage['label']}",
                            message=f"You've been assigned to the '{stage['label']}' stage of project '{project['name']}'.",
                            link=f"/app/projects/{project_id}",
                            variables={
                                "name": u.get("name", ""),
                                "project_name": project["name"],
                                "stage_name": stage["label"],
                            },
                            triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                        )
                    except Exception:
                        logger.exception("stage_assigned notify failed")
        return {"ok": True, "progress": project_progress, "stage": stage}

    @api.get("/projects/{project_id}/assignable-users")
    async def list_assignable_users(project_id: str, user=Depends(get_current_user)):
        """Return all users that can be added to a project (filtered by role family)."""
        cur = db.users.find(
            {"role": {"$in": ["admin", "manager", "hr", "developer", "qa", "cloud_admin", "intern", "team_member"]}},
            {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
        ).sort("name", 1)
        users = await cur.to_list(2000)
        return {
            "managers": [u for u in users if u.get("role") in ("admin", "manager", "super_admin")],
            "members":  [u for u in users if u.get("role") in ("developer", "qa", "cloud_admin", "team_member", "hr", "manager", "admin")],
            "interns":  [u for u in users if u.get("role") == "intern"],
            "all":      users,
        }

    # -------- Documents --------
    @api.get("/documents", response_model=List[Document])
    async def list_documents(user=Depends(get_current_user)):
        cur = db.documents.find({"owner_id": user["id"]}, {"_id": 0, "content_base64": 0}).sort("created_at", -1)
        items = await cur.to_list(500)
        return [Document(**d) for d in items]

    @api.post("/documents", response_model=Document)
    async def upload_document(payload: DocumentCreate, user=Depends(get_current_user)):
        if payload.size > MAX_DOC_BYTES:
            raise HTTPException(400, "File too large (max 10MB)")
        now = datetime.now(timezone.utc).isoformat()
        doc = payload.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "uploader": user["name"],
            "owner_id": user["id"],
            "comments": [],
            "created_at": now,
        })
        await db.documents.insert_one(doc)
        if payload.shared_with:
            await _create_notification(
                user["id"], "doc_shared",
                f"Document shared: {payload.name}",
                f"{user['name']} shared a document with {len(payload.shared_with)} member(s).",
                "/app/documents",
            )
        out = {k: v for k, v in doc.items() if k != "content_base64"}
        out.pop("_id", None)
        return Document(**out)

    @api.get("/documents/{doc_id}/download")
    async def download_document(doc_id: str, user=Depends(get_current_user)):
        d = await db.documents.find_one({"id": doc_id, "owner_id": user["id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Document not found")
        return {
            "name": d["name"],
            "mime_type": d["mime_type"],
            "content_base64": d.get("content_base64", ""),
        }

    @api.post("/documents/{doc_id}/comments", response_model=Document)
    async def comment_document(doc_id: str, body: dict, user=Depends(get_current_user)):
        message = (body or {}).get("message", "").strip()
        if not message:
            raise HTTPException(400, "Empty comment")
        d = await db.documents.find_one({"id": doc_id, "owner_id": user["id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Document not found")
        comments = d.get("comments", [])
        comments.append(DocumentComment(author=user["name"], message=message).model_dump())
        await db.documents.update_one({"id": doc_id}, {"$set": {"comments": comments}})
        d["comments"] = comments
        d.pop("content_base64", None)
        return Document(**d)

    @api.delete("/documents/{doc_id}")
    async def delete_document(doc_id: str, user=Depends(get_current_user)):
        res = await db.documents.delete_one({"id": doc_id, "owner_id": user["id"]})
        if res.deleted_count == 0:
            raise HTTPException(404, "Document not found")
        return {"ok": True}

    # -------- Chat --------
    # Channels & messages are SHARED across the workspace (any user listed in
    # `member_ids` can see and post). The legacy `owner_id` field is preserved
    # for backwards compatibility but no longer filters reads.
    @api.get("/chat/channels", response_model=List[Channel])
    async def list_channels(user=Depends(get_current_user)):
        # A user can see a channel if they are listed in member_ids OR they own it.
        q = {"$or": [{"member_ids": user["id"]}, {"owner_id": user["id"]}]}
        cur = db.channels.find(q, {"_id": 0}).sort("last_message_at", -1)
        items = await cur.to_list(500)
        # Migrate older per-user direct channels: hide channels owned by other users
        # that don't include this user explicitly (legacy demo records).
        cleaned = []
        for c in items:
            mids = c.get("member_ids") or []
            if user["id"] in mids or c.get("owner_id") == user["id"]:
                cleaned.append(c)
        return [Channel(**c) for c in cleaned]

    @api.post("/chat/channels", response_model=Channel)
    async def create_channel(payload: ChannelCreate, user=Depends(get_current_user)):
        now = datetime.now(timezone.utc).isoformat()
        doc = payload.model_dump()
        # Always ensure the creator is part of the channel.
        mids = list(doc.get("member_ids") or [])
        if user["id"] not in mids:
            mids.append(user["id"])
        doc["member_ids"] = mids
        doc.update({
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "created_at": now,
            "last_message_at": now,
        })
        await db.channels.insert_one(doc)
        doc.pop("_id", None)
        return Channel(**doc)

    @api.delete("/chat/channels/{channel_id}")
    async def delete_channel(channel_id: str, user=Depends(get_current_user)):
        # Only the creator (or admin) can delete a channel.
        ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
        if not ch:
            return {"ok": True}
        if ch.get("owner_id") != user["id"] and user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Only the channel creator can delete it")
        await db.channels.delete_one({"id": channel_id})
        await db.chat_messages.delete_many({"channel_id": channel_id})
        return {"ok": True}

    @api.patch("/chat/channels/{channel_id}", response_model=Channel)
    async def update_channel(channel_id: str, body: dict, user=Depends(get_current_user)):
        existing = await db.channels.find_one({"id": channel_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Channel not found")
        # Any current member can edit the name; only owner/admin can change members.
        is_member = user["id"] in (existing.get("member_ids") or [])
        is_priv = existing.get("owner_id") == user["id"] or user.get("role") in ("admin", "super_admin")
        if not (is_member or is_priv):
            raise HTTPException(403, "Forbidden")
        updates = {}
        if isinstance(body.get("name"), str) and body["name"].strip():
            updates["name"] = body["name"].strip()
        if isinstance(body.get("member_ids"), list):
            if not is_priv:
                raise HTTPException(403, "Only the creator can modify members")
            mids = list(body["member_ids"])
            if existing.get("owner_id") and existing["owner_id"] not in mids:
                mids.append(existing["owner_id"])
            updates["member_ids"] = mids
        if not updates:
            return Channel(**existing)
        updates["last_message_at"] = datetime.now(timezone.utc).isoformat()
        await db.channels.update_one({"id": channel_id}, {"$set": updates})
        merged = {**existing, **updates}
        return Channel(**merged)

    async def _can_access_channel(channel_id: str, user) -> bool:
        ch = await db.channels.find_one({"id": channel_id}, {"_id": 0, "member_ids": 1, "owner_id": 1})
        if not ch:
            return False
        return user["id"] in (ch.get("member_ids") or []) or ch.get("owner_id") == user["id"]

    @api.get("/chat/channels/{channel_id}/messages", response_model=List[ChatMessage])
    async def list_messages(channel_id: str, user=Depends(get_current_user)):
        if not await _can_access_channel(channel_id, user):
            raise HTTPException(403, "Not a member of this channel")
        cur = (db.chat_messages
               .find({"channel_id": channel_id}, {"_id": 0, "attachment_base64": 0})
               .sort("created_at", 1))
        items = await cur.to_list(2000)
        return [ChatMessage(**m) for m in items]

    @api.post("/chat/messages", response_model=ChatMessage)
    async def send_message(payload: ChatMessageCreate, user=Depends(get_current_user)):
        if not payload.text and not payload.attachment_base64:
            raise HTTPException(400, "Message empty")
        if not await _can_access_channel(payload.channel_id, user):
            raise HTTPException(403, "Not a member of this channel")
        now = datetime.now(timezone.utc).isoformat()
        msg_id = str(uuid.uuid4())
        doc = {
            "id": msg_id,
            "channel_id": payload.channel_id,
            "author": user["name"],
            "author_email": user["email"],
            "text": payload.text or "",
            "attachment_name": payload.attachment_name or "",
            "attachment_mime": payload.attachment_mime or "",
            "attachment_base64": payload.attachment_base64 or "",
            "attachment_url_id": msg_id if payload.attachment_base64 else "",
            "owner_id": user["id"],
            "created_at": now,
        }
        await db.chat_messages.insert_one(doc)
        await db.channels.update_one(
            {"id": payload.channel_id},
            {"$set": {"last_message_at": now}},
        )
        out = {k: v for k, v in doc.items() if k != "attachment_base64"}
        out.pop("_id", None)
        return ChatMessage(**out)

    @api.get("/chat/attachment/{msg_id}")
    async def chat_attachment(msg_id: str, user=Depends(get_current_user)):
        m = await db.chat_messages.find_one({"id": msg_id}, {"_id": 0})
        if not m or not m.get("attachment_base64"):
            raise HTTPException(404, "Attachment not found")
        if not await _can_access_channel(m["channel_id"], user):
            raise HTTPException(403, "Forbidden")
        return {
            "name": m.get("attachment_name", "file"),
            "mime_type": m.get("attachment_mime", "application/octet-stream"),
            "content_base64": m.get("attachment_base64", ""),
        }

    # -------- Notifications --------
    @api.get("/notifications", response_model=List[Notification])
    async def list_notifications(user=Depends(get_current_user)):
        cur = db.notifications.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(100)
        items = await cur.to_list(100)
        return [Notification(**n) for n in items]

    @api.post("/notifications/{notif_id}/read")
    async def mark_read(notif_id: str, user=Depends(get_current_user)):
        await db.notifications.update_one(
            {"id": notif_id, "owner_id": user["id"]}, {"$set": {"read": True}}
        )
        return {"ok": True}

    @api.post("/notifications/read-all")
    async def mark_all_read(user=Depends(get_current_user)):
        await db.notifications.update_many({"owner_id": user["id"]}, {"$set": {"read": True}})
        return {"ok": True}

    # -------- Interns --------
    @api.get("/interns", response_model=List[Intern])
    async def list_interns(user=Depends(get_current_user)):
        # Super-admins, admins, and HR see ALL interns (regardless of who added).
        # Managers see only the interns they (or their HR) created via owner_id.
        # All other roles fall back to owner_id filter.
        role = user.get("role")
        if role in ("super_admin", "admin", "hr"):
            q: Dict[str, Any] = {}
        else:
            q = {"owner_id": user["id"]}
        cur = db.interns.find(q, {"_id": 0}).sort("created_at", -1)
        items = await cur.to_list(2000)
        # Backfill missing audit fields for legacy rows so the UI doesn't show "—"
        for i in items:
            i.setdefault("created_by_email", "")
            i.setdefault("created_by_name", "")
        return [Intern(**i) for i in items]

    @api.post("/interns", response_model=Intern)
    async def create_intern(payload: InternCreate, user=Depends(get_current_user)):
        email = payload.email.lower()
        # Email must be globally unique now (interns can be added by anyone)
        if await db.interns.find_one({"email": email}):
            raise HTTPException(400, "Intern with this email already exists")
        now = datetime.now(timezone.utc).isoformat()
        doc = payload.model_dump()
        doc["email"] = email
        doc.update({
            "id": str(uuid.uuid4()),
            "status": "active",
            "badges": [],
            "tasks_assigned": 0,
            "tasks_on_time": 0,
            "owner_id": user["id"],
            "created_by_email": user.get("email", ""),
            "created_by_name": user.get("name", ""),
            "created_at": now,
            "updated_at": now,
        })
        await db.interns.insert_one(doc)
        doc.pop("_id", None)
        return Intern(**doc)

    @api.patch("/interns/{intern_id}", response_model=Intern)
    async def update_intern(intern_id: str, payload: InternUpdate, user=Depends(get_current_user)):
        # Privileged roles can edit any intern; others only their own.
        role = user.get("role")
        q: Dict[str, Any] = {"id": intern_id}
        if role not in ("super_admin", "admin", "hr"):
            q["owner_id"] = user["id"]
        existing = await db.interns.find_one(q, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Intern not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "email" in updates:
            updates["email"] = updates["email"].lower()
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.interns.update_one({"id": intern_id}, {"$set": updates})
        merged = {**existing, **updates}
        return Intern(**merged)

    @api.delete("/interns/{intern_id}")
    async def delete_intern(intern_id: str, user=Depends(get_current_user)):
        role = user.get("role")
        q: Dict[str, Any] = {"id": intern_id}
        if role not in ("super_admin", "admin", "hr"):
            q["owner_id"] = user["id"]
        intern = await db.interns.find_one(q, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        await db.interns.delete_one({"id": intern["id"]})
        await db.intern_tasks.delete_many({"intern_id": intern_id})
        # Cascade: also remove the linked login account so the email can be reused.
        linked_uid = intern.get("linked_user_id")
        if linked_uid:
            await db.users.delete_one({"id": linked_uid, "role": "intern"})
        # Safety net — drop any stranded intern-role user account with this email.
        if intern.get("email"):
            await db.users.delete_one({"email": intern["email"].lower(), "role": "intern"})
        return {"ok": True}

    @api.get("/interns/{intern_id}/tasks", response_model=List[InternTask])
    async def list_intern_tasks(intern_id: str, user=Depends(get_current_user)):
        cur = db.intern_tasks.find(
            {"intern_id": intern_id, "owner_id": user["id"]}, {"_id": 0}
        ).sort("created_at", -1)
        items = await cur.to_list(500)
        return [InternTask(**t) for t in items]

    @api.post("/intern-tasks", response_model=InternTask)
    async def create_intern_task(payload: InternTaskCreate, user=Depends(get_current_user)):
        intern = await db.interns.find_one({"id": payload.intern_id, "owner_id": user["id"]}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        now = datetime.now(timezone.utc).isoformat()
        doc = payload.model_dump()
        doc.update({
            "id": str(uuid.uuid4()),
            "status": "assigned",
            "completion_note": "",
            "completed_at": "",
            "on_time": None,
            "owner_id": user["id"],
            "created_at": now,
            "updated_at": now,
        })
        await db.intern_tasks.insert_one(doc)
        await db.interns.update_one(
            {"id": payload.intern_id}, {"$inc": {"tasks_assigned": 1}}
        )
        doc.pop("_id", None)
        return InternTask(**doc)

    @api.patch("/intern-tasks/{task_id}", response_model=InternTask)
    async def update_intern_task(task_id: str, payload: InternTaskUpdate, user=Depends(get_current_user)):
        existing = await db.intern_tasks.find_one({"id": task_id, "owner_id": user["id"]}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Task not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        if updates.get("status") == "completed" and existing.get("status") != "completed":
            now = datetime.now(timezone.utc)
            updates["completed_at"] = now.isoformat()
            on_time = True
            try:
                if existing.get("deadline"):
                    dl_str = existing["deadline"]
                    if len(dl_str) == 10:
                        dl_str = dl_str + "T23:59:59+00:00"
                    deadline_dt = datetime.fromisoformat(dl_str.replace("Z", "+00:00"))
                    if deadline_dt.tzinfo is None:
                        deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
                    on_time = now <= deadline_dt
            except Exception:
                on_time = True
            updates["on_time"] = on_time

            if on_time:
                intern = await db.interns.find_one(
                    {"id": existing["intern_id"], "owner_id": user["id"]}, {"_id": 0}
                )
                if intern:
                    badge = Badge(
                        name="On-Time Achiever",
                        reason=f"Completed '{existing['title']}' on or before deadline.",
                        icon="trophy",
                        color="#10B981",
                    ).model_dump()
                    badges = intern.get("badges", []) + [badge]
                    await db.interns.update_one(
                        {"id": existing["intern_id"]},
                        {"$set": {"badges": badges}, "$inc": {"tasks_on_time": 1}},
                    )
                    await _create_notification(
                        user["id"], "intern_task_completed",
                        f"{intern['name']} earned a badge",
                        f"On-time completion: '{existing['title']}'. Manager: {intern.get('reporting_manager','—')}",
                        "/app/interns",
                    )
            else:
                await _create_notification(
                    user["id"], "intern_task_completed",
                    "Intern task completed late",
                    f"'{existing['title']}' submitted past deadline.",
                    "/app/interns",
                )

        await db.intern_tasks.update_one({"id": task_id}, {"$set": updates})
        merged = {**existing, **updates}
        return InternTask(**merged)

    @api.delete("/intern-tasks/{task_id}")
    async def delete_intern_task(task_id: str, user=Depends(get_current_user)):
        existing = await db.intern_tasks.find_one({"id": task_id, "owner_id": user["id"]}, {"_id": 0})
        if existing:
            await db.intern_tasks.delete_one({"id": task_id})
            await db.interns.update_one(
                {"id": existing["intern_id"]}, {"$inc": {"tasks_assigned": -1}}
            )
        return {"ok": True}

    @api.get("/interns/{intern_id}/certificate")
    async def intern_certificate(intern_id: str, user=Depends(get_current_user)):
        intern = await db.interns.find_one({"id": intern_id, "owner_id": user["id"]}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        tasks_cur = db.intern_tasks.find(
            {"intern_id": intern_id, "owner_id": user["id"]}, {"_id": 0}
        ).sort("created_at", 1)
        tasks = await tasks_cur.to_list(500)
        pdf_bytes = _build_intern_certificate_pdf(intern, tasks)
        await db.interns.update_one(
            {"id": intern_id},
            {"$set": {"status": "completed", "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _create_notification(
            user["id"], "intern_completed",
            f"Internship completed: {intern['name']}",
            f"Certificate generated. Reporting manager: {intern.get('reporting_manager','—')}",
            "/app/interns",
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{intern["name"].replace(" ", "_")}_Performance_Certificate.pdf"'},
        )

    # -------- AI --------
    @api.get("/ai/sessions")
    async def list_ai_sessions(user=Depends(get_current_user)):
        cur = db.ai_sessions.find({"owner_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).limit(50)
        items = await cur.to_list(50)
        return items

    @api.post("/ai/sessions")
    async def create_ai_session(payload: AISessionCreate, user=Depends(get_current_user)):
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "title": payload.title or "New chat",
            "mode": payload.mode,
            "owner_id": user["id"],
            "created_at": now,
            "updated_at": now,
        }
        await db.ai_sessions.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.delete("/ai/sessions/{session_id}")
    async def delete_ai_session(session_id: str, user=Depends(get_current_user)):
        await db.ai_sessions.delete_one({"id": session_id, "owner_id": user["id"]})
        await db.ai_messages.delete_many({"session_id": session_id, "owner_id": user["id"]})
        return {"ok": True}

    @api.get("/ai/status")
    async def ai_status(user=Depends(get_current_user)):
        """Tells the UI which AI provider is wired up — useful for self-hosted deployments."""
        from ai_provider import active_provider, ai_configured, OPENAI_MODEL_DEFAULT, ANTHROPIC_MODEL_DEFAULT, GEMINI_MODEL_DEFAULT
        provider = active_provider()
        model = {
            "openai": OPENAI_MODEL_DEFAULT,
            "anthropic": ANTHROPIC_MODEL_DEFAULT,
            "gemini": GEMINI_MODEL_DEFAULT,
            "emergent": ANTHROPIC_MODEL_DEFAULT + " (via Emergent universal key)",
            "none": None,
        }[provider]
        return {
            "configured": ai_configured(),
            "provider": provider,
            "model": model,
            "hint": (
                "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or EMERGENT_LLM_KEY in backend/.env"
                if not ai_configured() else f"Using {provider} with model {model}"
            ),
        }

    @api.get("/ai/sessions/{session_id}/messages")
    async def list_ai_messages(session_id: str, user=Depends(get_current_user)):
        cur = db.ai_messages.find(
            {"session_id": session_id, "owner_id": user["id"]}, {"_id": 0}
        ).sort("created_at", 1)
        items = await cur.to_list(1000)
        return items

    @api.post("/ai/send")
    async def ai_send(payload: AISend, user=Depends(get_current_user)):
        sess = await db.ai_sessions.find_one({"id": payload.session_id, "owner_id": user["id"]}, {"_id": 0})
        if not sess:
            raise HTTPException(404, "Session not found")

        now_iso = datetime.now(timezone.utc).isoformat()
        user_msg = {
            "id": str(uuid.uuid4()),
            "session_id": payload.session_id,
            "role": "user",
            "content": payload.message,
            "owner_id": user["id"],
            "created_at": now_iso,
        }
        await db.ai_messages.insert_one(dict(user_msg))

        system_msg = {
            "code": ("You are Projexino AI — an expert pair-programmer. Help engineers write, debug, "
                     "and refactor code. Prefer concise, production-ready snippets. Wrap code in fenced blocks."),
            "doc": ("You are Projexino AI — a technical writer. Help engineers draft documentation, README files, "
                    "API references, release notes and onboarding guides. Be structured and concise."),
            "general": ("You are Projexino AI — a helpful assistant for the Projexino engineering & operations team."),
        }[payload.mode]

        try:
            from ai_provider import chat_completion
            response_text = await chat_completion(
                system_message=system_msg,
                user_message=payload.message,
                session_id=payload.session_id,
            )
        except Exception as e:
            logger.exception("AI call failed")
            raise HTTPException(500, f"AI call failed: {e}")

        assistant_msg = {
            "id": str(uuid.uuid4()),
            "session_id": payload.session_id,
            "role": "assistant",
            "content": str(response_text),
            "owner_id": user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.ai_messages.insert_one(dict(assistant_msg))
        await db.ai_sessions.update_one(
            {"id": payload.session_id},
            {"$set": {"updated_at": assistant_msg["created_at"]}},
        )
        user_msg.pop("_id", None)
        assistant_msg.pop("_id", None)
        return {"user": user_msg, "assistant": assistant_msg}


# ----------- PDF helper -----------
_LOGO_CACHE = {"bytes": None}


def _fetch_logo_bytes():
    """Fetch Projexino logo PNG once and cache for the lifetime of the process."""
    if _LOGO_CACHE["bytes"] is not None:
        return _LOGO_CACHE["bytes"]
    try:
        import urllib.request
        url = (
            "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/"
            "k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png"
        )
        with urllib.request.urlopen(url, timeout=8) as r:
            _LOGO_CACHE["bytes"] = r.read()
    except Exception:
        _LOGO_CACHE["bytes"] = b""
    return _LOGO_CACHE["bytes"]


def _build_achievement_summary(intern: dict, tasks: list) -> str:
    """Compose a 2-3 sentence narrative summary of the intern's tenure."""
    name = (intern.get("name") or "the intern").split(" ")[0]
    completed = [t for t in tasks if t.get("status") == "completed"]
    on_time = sum(1 for t in completed if t.get("on_time"))
    project_names = sorted({(t.get("project_name") or "").strip() for t in tasks if t.get("project_name")})
    badge_names = [b.get("name") for b in (intern.get("badges") or [])]
    pieces = []
    if completed:
        pieces.append(
            f"During the internship, {name} completed {len(completed)} task{'s' if len(completed) != 1 else ''}"
            f"{' — ' + str(on_time) + ' on time' if on_time else ''}."
        )
    if project_names:
        joined = ", ".join(project_names[:4])
        more = "" if len(project_names) <= 4 else f" and {len(project_names) - 4} more"
        pieces.append(f"They contributed to {joined}{more}.")
    if badge_names:
        joined_b = ", ".join(badge_names[:5])
        more_b = "" if len(badge_names) <= 5 else f" plus {len(badge_names) - 5} more"
        pieces.append(f"Recognised with {joined_b}{more_b}.")
    if not pieces:
        pieces.append(
            f"{name} engaged with the Projexino programme, demonstrating a strong learning mindset and "
            f"willingness to take on new challenges."
        )
    return " ".join(pieces)


def _build_intern_certificate_pdf(intern: dict, tasks: list) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
    from reportlab.lib.units import cm

    NAVY = colors.HexColor("#0F2042")
    ORANGE = colors.HexColor("#F97316")
    SLATE = colors.HexColor("#475569")
    LIGHT = colors.HexColor("#F8FAFC")
    BORDER = colors.HexColor("#CBD5E1")

    PAGE_W, PAGE_H = A4
    LR_MARGIN = 2.2 * cm
    TB_MARGIN = 2.0 * cm
    USABLE_W = PAGE_W - 2 * LR_MARGIN

    def _draw_page_chrome(c, _doc):
        """Draw decorative outer border, small corner accents (no logo overlap), and footer ribbon."""
        c.saveState()
        # Outer border
        c.setStrokeColor(NAVY); c.setLineWidth(2)
        c.roundRect(1.0 * cm, 1.0 * cm, PAGE_W - 2 * cm, PAGE_H - 2 * cm, 12, stroke=1, fill=0)
        # Inner thin border
        c.setStrokeColor(ORANGE); c.setLineWidth(0.5)
        c.roundRect(1.2 * cm, 1.2 * cm, PAGE_W - 2.4 * cm, PAGE_H - 2.4 * cm, 10, stroke=1, fill=0)
        # Smaller corner accents (≤1.4cm so they don't interfere with logo or signature)
        c.setFillColor(ORANGE)
        ACC = 1.4 * cm
        # top-left
        p = c.beginPath()
        p.moveTo(1.0 * cm, PAGE_H - 1.0 * cm); p.lineTo(1.0 * cm, PAGE_H - 1.0 * cm - ACC); p.lineTo(1.0 * cm + ACC, PAGE_H - 1.0 * cm); p.close()
        c.drawPath(p, fill=1, stroke=0)
        # bottom-right
        p2 = c.beginPath()
        p2.moveTo(PAGE_W - 1.0 * cm, 1.0 * cm); p2.lineTo(PAGE_W - 1.0 * cm, 1.0 * cm + ACC); p2.lineTo(PAGE_W - 1.0 * cm - ACC, 1.0 * cm); p2.close()
        c.drawPath(p2, fill=1, stroke=0)
        # Footer ribbon — centered text
        c.setFillColor(NAVY)
        c.rect(1.0 * cm, 1.0 * cm, PAGE_W - 2 * cm, 0.5 * cm, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica", 7)
        c.drawCentredString(
            PAGE_W / 2, 1.18 * cm,
            "Projexino Solutions Pvt Ltd   •   www.projexino.com   •   © 2026 Projexino. All rights reserved.",
        )
        c.restoreState()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=LR_MARGIN, rightMargin=LR_MARGIN,
        topMargin=TB_MARGIN, bottomMargin=TB_MARGIN,
        title=f"{intern['name']} — Performance Certificate",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "t", parent=styles["Title"], fontName="Helvetica-Bold",
        fontSize=28, textColor=NAVY, alignment=TA_CENTER,
        spaceBefore=0, spaceAfter=0, leading=32,
    )
    tag_style = ParagraphStyle(
        "tag", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9,
        textColor=ORANGE, alignment=TA_CENTER, spaceAfter=8, leading=11,
    )
    sub_style = ParagraphStyle(
        "s", parent=styles["Normal"], fontName="Helvetica", fontSize=10.5,
        textColor=SLATE, alignment=TA_CENTER, spaceAfter=14, leading=15,
    )
    h_style = ParagraphStyle(
        "h", parent=styles["Heading2"], fontName="Helvetica-Bold",
        fontSize=10, textColor=ORANGE, spaceBefore=12, spaceAfter=8,
        alignment=TA_LEFT, leading=12,
    )
    body = ParagraphStyle(
        "b", parent=styles["Normal"], fontName="Helvetica", fontSize=10,
        textColor=colors.HexColor("#1F2937"), leading=14, alignment=TA_LEFT,
    )
    body_justified = ParagraphStyle(
        "bj", parent=body, alignment=TA_JUSTIFY, leading=15,
    )
    body_center = ParagraphStyle(
        "bc", parent=body, alignment=TA_CENTER,
    )
    name_style = ParagraphStyle(
        "n", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=28,
        textColor=NAVY, alignment=TA_CENTER, spaceAfter=2, leading=34,
    )
    role_style = ParagraphStyle(
        "r", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=11,
        textColor=SLATE, alignment=TA_CENTER, spaceAfter=16, leading=14,
    )
    company_style = ParagraphStyle(
        "co", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=10,
        textColor=NAVY, alignment=TA_CENTER, spaceAfter=2, leading=12,
    )
    company_sub_style = ParagraphStyle(
        "cos", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
        textColor=SLATE, alignment=TA_CENTER, spaceAfter=16, leading=10,
    )

    story = []

    # ===== HEADER: logo + company =====
    logo_bytes = _fetch_logo_bytes()
    if logo_bytes:
        try:
            logo_img = Image(io.BytesIO(logo_bytes), width=4.2 * cm, height=2.0 * cm, kind="proportional")
            logo_img.hAlign = "CENTER"
            story.append(logo_img)
            story.append(Spacer(1, 4))
        except Exception:
            pass
    story.append(Paragraph("PROJEXINO SOLUTIONS PVT LTD", company_style))
    story.append(Paragraph("Engineering the Future of Operations", company_sub_style))

    # Decorative divider — thin orange line, centered
    divider = Table([[""]], colWidths=[USABLE_W * 0.35])
    divider.hAlign = "CENTER"
    divider.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, -1), 1.5, ORANGE),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(divider)

    # ===== TITLE =====
    story.append(Paragraph("PRESENTS&nbsp;&nbsp;THE", tag_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("PERFORMANCE CERTIFICATE", title_style))
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This certificate is proudly presented in recognition of dedication, professionalism "
        "and outstanding contribution during the Projexino programme.",
        sub_style,
    ))

    # ===== AWARDEE =====
    story.append(Paragraph(intern["name"], name_style))
    story.append(Paragraph(
        f"{intern.get('designation', 'Intern')}  •  {intern.get('department', 'Engineering')}",
        role_style,
    ))

    # ===== INFO STRIP — single flat table for guaranteed column alignment =====
    badges_all = intern.get("badges", []) or []
    completed_list = [t for t in tasks if t.get("status") == "completed"]
    on_time_count = sum(1 for t in completed_list if t.get("on_time"))
    completion_rate = round((len(completed_list) / max(intern.get("tasks_assigned", 0) or len(tasks), 1)) * 100)
    start = (intern.get("start_date") or "—") or "—"
    end = (intern.get("end_date") or "—") or "—"
    label_style = ParagraphStyle(
        "lbl", parent=body, fontName="Helvetica-Bold", fontSize=7.5,
        textColor=SLATE, alignment=TA_CENTER, leading=10,
    )
    val_big = ParagraphStyle(
        "vb", parent=body, fontName="Helvetica-Bold", fontSize=20,
        alignment=TA_CENTER, leading=24,
    )
    val_small = ParagraphStyle(
        "vs", parent=body, fontName="Helvetica", fontSize=9,
        textColor=SLATE, alignment=TA_CENTER, leading=11,
    )
    val_period = ParagraphStyle(
        "vp", parent=body, fontName="Helvetica-Bold", fontSize=9.5,
        textColor=NAVY, alignment=TA_CENTER, leading=12,
    )

    info_rows = [
        [
            Paragraph("PERIOD", label_style),
            Paragraph("TASKS COMPLETED", label_style),
            Paragraph("ON-TIME RATE", label_style),
            Paragraph("BADGES EARNED", label_style),
        ],
        [
            Paragraph(f"<font color='#0F2042'>{start}</font>&nbsp;&nbsp;<font color='#F97316'><b>→</b></font>&nbsp;&nbsp;<font color='#0F2042'>{end}</font>", val_period),
            Paragraph(f"<font color='#10B981'>{len(completed_list)}</font>", val_big),
            Paragraph(f"<font color='#F97316'>{completion_rate}%</font>", val_big),
            Paragraph(f"<font color='#A855F7'>{len(badges_all)}</font>", val_big),
        ],
        [
            Paragraph("&nbsp;", val_small),
            Paragraph(f"of {len(tasks) or 0}", val_small),
            Paragraph(f"{on_time_count} on time", val_small),
            Paragraph("awarded", val_small),
        ],
    ]
    col_w = [(USABLE_W) / 4] * 4
    info_tbl = Table(info_rows, colWidths=col_w, rowHeights=[16, 42, 14], hAlign="CENTER")
    info_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        # Top label row — slim
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 4),
        # Middle big value row
        ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("BOTTOMPADDING", (0, 1), (-1, 1), 2),
        # Small footer row
        ("TOPPADDING", (0, 2), (-1, 2), 2),
        ("BOTTOMPADDING", (0, 2), (-1, 2), 10),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 14))

    # ===== ACHIEVEMENT SUMMARY =====
    story.append(Paragraph("ACHIEVEMENT SUMMARY", h_style))
    story.append(Paragraph(_build_achievement_summary(intern, tasks), body_justified))
    story.append(Spacer(1, 10))

    # ===== PROJECTS — uniform chip grid (2 cols, fixed height) =====
    project_names = sorted({(t.get("project_name") or "").strip() for t in tasks if t.get("project_name")})
    if project_names:
        story.append(Paragraph("PROJECTS CONTRIBUTED TO", h_style))
        chip_style = ParagraphStyle(
            "ch", parent=body, fontName="Helvetica-Bold", fontSize=9.5,
            textColor=colors.white, alignment=TA_CENTER, leading=12,
        )
        # Pair into rows of 2
        chips = [Paragraph(p[:60], chip_style) for p in project_names[:8]]
        rows = []
        for i in range(0, len(chips), 2):
            row = chips[i:i+2]
            if len(row) == 1:
                row.append("")
            rows.append(row)
        chip_w = (USABLE_W - 0.4 * cm) / 2
        chip_tbl = Table(rows, colWidths=[chip_w, chip_w], hAlign="LEFT")
        ts = [
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ]
        # Clear empty cells background
        for r_idx, r in enumerate(rows):
            for c_idx, cell in enumerate(r):
                if cell == "":
                    ts.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), colors.white))
        chip_tbl.setStyle(TableStyle(ts))
        story.append(chip_tbl)
        story.append(Spacer(1, 10))

    # ===== BADGES GRID — single flat table, uniform cells =====
    if badges_all:
        story.append(Paragraph("BADGES EARNED DURING THIS PERIOD", h_style))
        # Take at most 9 badges, pad to multiples of 3, build 3-col grid where every cell is
        # exactly one Paragraph with HTML-marked star + name + reason + date. This guarantees
        # equal row heights and clean column alignment.
        badges = badges_all[:9]
        # pad
        while len(badges) % 3 != 0:
            badges.append(None)

        def _badge_cell(b):
            if b is None:
                return ""
            color = b.get("color", "#F97316")
            name = (b.get("name") or "Badge")[:30]
            reason = (b.get("reason") or "")[:90]
            earned = (b.get("earned_at") or "")[:10]
            html = (
                f'<para alignment="center" leading="13">'
                f'<font color="{color}" size="20"><b>★</b></font><br/>'
                f'<font color="{color}" size="9.5"><b>{name}</b></font><br/>'
                f'<font color="#475569" size="8">{reason}</font><br/>'
                f'<font color="#94A3B8" size="7">{earned}</font>'
                f'</para>'
            )
            return Paragraph(html, body)

        rows = []
        for i in range(0, len(badges), 3):
            rows.append([_badge_cell(b) for b in badges[i:i+3]])
        col_w_b = (USABLE_W) / 3
        b_tbl = Table(rows, colWidths=[col_w_b] * 3, rowHeights=[78] * len(rows), hAlign="CENTER")
        ts = [
            ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
            ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]
        # Hide background on empty padding cells
        for r_idx, r in enumerate(rows):
            for c_idx, cell in enumerate(r):
                if cell == "":
                    ts.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), colors.white))
                    ts.append(("LINEBEFORE", (c_idx, r_idx), (c_idx, r_idx), 0.3, colors.white))
                    ts.append(("LINEAFTER", (c_idx, r_idx), (c_idx, r_idx), 0.3, colors.white))
        b_tbl.setStyle(TableStyle(ts))
        story.append(b_tbl)
        story.append(Spacer(1, 16))

    # ===== DIGITAL ISSUANCE BLOCK (replaces hand-signature) =====
    issued_on = datetime.now(timezone.utc).strftime("%d %B %Y")
    cert_id = (intern.get("id", "") or "")[:8].upper() or "PJX0000"

    stamp_title = ParagraphStyle(
        "stmpt", parent=body, fontName="Helvetica-Bold", fontSize=10,
        textColor=NAVY, alignment=TA_CENTER, leading=13, letterSpacing=2,
    )
    stamp_sub = ParagraphStyle(
        "stmps", parent=body, fontName="Helvetica", fontSize=8.5,
        textColor=SLATE, alignment=TA_CENTER, leading=12,
    )
    stamp_chip = ParagraphStyle(
        "stmpc", parent=body, fontName="Helvetica-Bold", fontSize=9,
        textColor=colors.white, alignment=TA_CENTER, leading=12,
    )

    # Build a compact 3-row centered block: chip badge / title / metadata
    chip_cell = Table([[Paragraph(
        '<font color="#FFFFFF">✓&nbsp;&nbsp;DIGITALLY ISSUED CERTIFICATE</font>', stamp_chip,
    )]], colWidths=[6.6 * cm])
    chip_cell.hAlign = "CENTER"
    chip_cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0.5, ORANGE),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))

    story.append(chip_cell)
    story.append(Spacer(1, 8))
    story.append(Paragraph("Projexino Solutions Pvt Ltd", stamp_title))
    story.append(Paragraph(
        "This document is digitally issued and does not require a physical signature.",
        stamp_sub,
    ))
    story.append(Spacer(1, 10))

    # ===== ISSUE META — fully centered =====
    meta_style = ParagraphStyle(
        "m", parent=body, fontName="Helvetica", fontSize=8.5,
        textColor=SLATE, alignment=TA_CENTER, leading=12,
    )
    story.append(Paragraph(
        f"Issued on <b><font color='#0F2042'>{issued_on}</font></b>"
        f"&nbsp;&nbsp;•&nbsp;&nbsp;"
        f"Certificate ID: <b><font color='#0F2042'>PJX-CERT-{cert_id}</font></b>",
        meta_style,
    ))

    doc.build(story, onFirstPage=_draw_page_chrome, onLaterPages=_draw_page_chrome)
    return buf.getvalue()

