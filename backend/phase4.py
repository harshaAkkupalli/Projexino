"""
Phase 4 — HR role, intern credentials, password change, heartbeat hours tracking,
manager dashboard feed, document verification.
"""
from __future__ import annotations

import os
import uuid
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("projexino.phase4")


def _hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def _verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _gen_password() -> str:
    """Generate a memorable dummy password like 'Welcome-A4B9'."""
    suffix = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(4))
    return f"Welcome-{suffix}"


def _fallback_badge_suggestion(ctx: dict) -> dict:
    """Heuristic when AI is unavailable — pick a slug based on metrics."""
    have = set(ctx.get("existing_badges") or [])
    if ctx.get("tasks_on_time", 0) >= 3 and "On-Time Achiever" not in have:
        return {"slug": "on_time_achiever", "reason": f"Completed {ctx['tasks_on_time']} task(s) before the deadline this period."}
    if ctx.get("docs_submitted", 0) >= 5 and "Document Diligence" not in have:
        return {"slug": "document_diligence", "reason": "Completed all required onboarding documents."}
    if ctx.get("hours_week", 0) >= 25 and "Professional" not in have:
        return {"slug": "professional", "reason": f"Logged {ctx['hours_week']}h on the platform this week — strong consistency."}
    if ctx.get("tasks_completed", 0) >= 2 and "Project Champion" not in have:
        return {"slug": "project_champion", "reason": f"Shipped {ctx['tasks_completed']} task(s) — clear forward momentum."}
    return {"slug": "team_player", "reason": "Steady engagement this week — keep the energy going!"}


class CreateInternWithLoginIn(BaseModel):
    name: str
    email: EmailStr
    designation: str
    department: str = "Engineering"
    reporting_manager: str = ""
    reporting_manager_email: str = ""
    start_date: str
    end_date: str
    bio: Optional[str] = ""
    dummy_password: Optional[str] = None  # auto-generated if missing


class ChangePasswordIn(BaseModel):
    current_password: Optional[str] = None  # not required for first-time changes
    new_password: str = Field(min_length=6)


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None


class HeartbeatIn(BaseModel):
    pathname: Optional[str] = ""


class VerifyDocIn(BaseModel):
    intern_id: str
    doc_type: Literal["bank_details", "pan_card", "id_proof", "address_proof", "resume"]
    verified: bool
    note: Optional[str] = ""


class AttachmentIn(BaseModel):
    name: str
    mime_type: str
    content_base64: str


class AssignTaskIn(BaseModel):
    intern_id: str
    title: str
    description: Optional[str] = ""
    project_id: Optional[str] = ""
    project_name: Optional[str] = ""
    deadline: str
    priority: Literal["low", "medium", "high"] = "medium"
    attachments: List[AttachmentIn] = []
    publish_to_project_docs: bool = False


class AssignProjectIn(BaseModel):
    intern_id: str
    project_id: str
    project_name: Optional[str] = ""
    role: Optional[str] = "Contributor"
    note: Optional[str] = ""
    attachments: List[AttachmentIn] = []
    publish_to_project_docs: bool = True


class SettingsPatchIn(BaseModel):
    show_demo_creds: Optional[bool] = None


def register_phase4(api: APIRouter, db, get_current_user):

    async def _notify(owner_id, kind, title, message, link=""):
        await db.notifications.insert_one({
            "id": str(uuid.uuid4()),
            "owner_id": owner_id, "kind": kind, "title": title, "message": message,
            "link": link, "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # ==============================
    # CREATE INTERN WITH LOGIN
    # ==============================
    @api.post("/interns/with-login")
    async def create_intern_with_login(payload: CreateInternWithLoginIn,
                                       user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

        email = payload.email.lower()
        if await db.interns.find_one({"owner_id": user["id"], "email": email}):
            raise HTTPException(400, "Intern with this email already exists")
        # If a previous intern was deleted but the linked user account survived
        # (e.g. legacy delete that didn't cascade), clean it up so the email can be reused.
        existing_user = await db.users.find_one({"email": email})
        if existing_user:
            if existing_user.get("role") == "intern":
                # Orphaned intern-role login → safe to remove and recreate.
                await db.users.delete_one({"id": existing_user["id"]})
            else:
                raise HTTPException(400, "A user account with this email already exists")

        password = payload.dummy_password or _gen_password()
        now = datetime.now(timezone.utc).isoformat()

        user_doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": payload.name,
            "role": "intern",
            "password_hash": _hash_password(password),
            "must_change_password": True,
            "created_at": now,
        }
        await db.users.insert_one(user_doc)

        intern_doc = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "email": email,
            "designation": payload.designation,
            "department": payload.department,
            "reporting_manager": payload.reporting_manager,
            "reporting_manager_email": payload.reporting_manager_email.lower() if payload.reporting_manager_email else "",
            "start_date": payload.start_date,
            "end_date": payload.end_date,
            "status": "active",
            "bio": payload.bio or "",
            "badges": [],
            "tasks_assigned": 0,
            "tasks_on_time": 0,
            "submitted_docs": {},
            "linked_user_id": user_doc["id"],
            "owner_id": user["id"],
            "created_at": now, "updated_at": now,
        }
        await db.interns.insert_one(intern_doc)
        intern_doc.pop("_id", None)
        # Welcome the intern via email + in-app
        try:
            from notif_engine import notify
            await notify(
                db,
                event="welcome_intern",
                user_id=user_doc["id"],
                user_email=email,
                title=f"Welcome to Projexino, {payload.name}",
                message="Your intern portal is ready.",
                link="/intern/dashboard",
                variables={
                    "name": payload.name,
                    "designation": payload.designation or "Intern",
                    "start_date": payload.start_date or "—",
                    "mentor": payload.reporting_manager or "—",
                },
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
        except Exception:
            import logging
            logging.getLogger("projexino.phase4").exception("Intern welcome email failed")
        return {"intern": intern_doc, "credentials": {"email": email, "password": password}}

    # ==============================
    # CHANGE PASSWORD + PROFILE
    # ==============================
    @api.post("/me/change-password")
    async def change_password(payload: ChangePasswordIn,
                              user=Depends(get_current_user)):
        u = await db.users.find_one({"id": user["id"]})
        if not u:
            raise HTTPException(404, "User not found")
        # If not first-time, require current password
        if not u.get("must_change_password"):
            if not payload.current_password or not _verify_password(payload.current_password, u["password_hash"]):
                raise HTTPException(400, "Current password incorrect")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "password_hash": _hash_password(payload.new_password),
                "must_change_password": False,
                "password_changed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return {"ok": True}

    @api.patch("/me/profile")
    async def update_profile(payload: ProfileUpdateIn,
                             user=Depends(get_current_user)):
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if updates:
            await db.users.update_one({"id": user["id"]}, {"$set": updates})
        # Mirror name + bio onto intern record if present
        intern = await db.interns.find_one({"linked_user_id": user["id"]}, {"_id": 0})
        if intern:
            intern_updates = {}
            if "name" in updates: intern_updates["name"] = updates["name"]
            if "bio" in updates: intern_updates["bio"] = updates["bio"]
            if intern_updates:
                intern_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
                await db.interns.update_one({"id": intern["id"]}, {"$set": intern_updates})
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return u

    @api.get("/me/profile")
    async def get_profile(user=Depends(get_current_user)):
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return u

    # ==============================
    # HEARTBEAT (hours tracking)
    # ==============================
    @api.post("/me/heartbeat")
    async def heartbeat(payload: HeartbeatIn, user=Depends(get_current_user)):
        """Called every 60s by the frontend while the portal is active.
        Records the bucket (date) and increments minutes by 1."""
        now = datetime.now(timezone.utc)
        date_key = now.date().isoformat()
        await db.work_sessions.update_one(
            {"user_id": user["id"], "date": date_key},
            {
                "$inc": {"minutes": 1},
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "email": user["email"],
                    "date": date_key,
                    "created_at": now.isoformat(),
                },
                "$set": {"last_ping_at": now.isoformat(),
                         "last_path": payload.pathname or ""},
            },
            upsert=True,
        )
        return {"ok": True}

    @api.get("/me/hours")
    async def me_hours(user=Depends(get_current_user)):
        cur = db.work_sessions.find({"user_id": user["id"]}, {"_id": 0}).sort("date", -1).limit(30)
        items = await cur.to_list(30)
        return items

    # ==============================
    # MANAGER DASHBOARD
    # ==============================
    @api.get("/manager/interns")
    async def manager_interns(user=Depends(get_current_user)):
        """Return all interns this manager/admin/hr should see + their activity summaries."""
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

        query = {} if user.get("role") in ("super_admin","admin","hr") else {
            "$or": [{"reporting_manager_email": user["email"]},
                    {"owner_id": user["id"]}]
        }
        cur = db.interns.find(query, {"_id": 0}).sort("created_at", -1)
        interns = await cur.to_list(500)

        now = datetime.now(timezone.utc)
        threshold_3d = (now - timedelta(days=3)).date().isoformat()

        result = []
        REQUIRED_DOCS = ["bank_details", "pan_card", "id_proof", "address_proof", "resume"]
        for intern in interns:
            # Hours last 7 days
            user_id = intern.get("linked_user_id")
            hours = []
            if user_id:
                ws = await db.work_sessions.find(
                    {"user_id": user_id}, {"_id": 0}
                ).sort("date", -1).limit(7).to_list(7)
                hours = list(reversed(ws))

            # Task stats
            tasks = await db.intern_tasks.find(
                {"intern_id": intern["id"]}, {"_id": 0}
            ).to_list(500)
            today_iso = now.date().isoformat()
            pending = [t for t in tasks if t.get("status") in ("assigned", "in_progress", "submitted")]
            overdue = [t for t in pending if (t.get("deadline") or "9999") < today_iso]

            docs_count = len(intern.get("submitted_docs", {}))
            doc_pct = round(docs_count / len(REQUIRED_DOCS) * 100, 0)

            # At-risk evaluation
            low_hours_days = 0
            recent3 = [w for w in hours if w["date"] >= threshold_3d]
            for w in recent3:
                if w.get("minutes", 0) < 120:  # < 2 hrs
                    low_hours_days += 1
            at_risk_reasons = []
            if overdue: at_risk_reasons.append(f"{len(overdue)} overdue task(s)")
            if low_hours_days >= 3: at_risk_reasons.append("Low activity 3+ days")
            if doc_pct < 60: at_risk_reasons.append(f"{int(doc_pct)}% docs submitted")

            result.append({
                "intern": intern,
                "hours_last_7d": hours,
                "total_hours_week": round(sum(w.get("minutes", 0) for w in hours) / 60, 1),
                "today_minutes": next((w["minutes"] for w in hours if w["date"] == today_iso), 0),
                "tasks_total": len(tasks),
                "tasks_completed": len([t for t in tasks if t.get("status") == "completed"]),
                "tasks_pending": len(pending),
                "tasks_overdue": len(overdue),
                "docs_submitted": docs_count,
                "docs_required": len(REQUIRED_DOCS),
                "doc_pct": doc_pct,
                "at_risk": bool(at_risk_reasons),
                "at_risk_reasons": at_risk_reasons,
                "badges_count": len(intern.get("badges", [])),
            })

        # Aggregate dashboard stats
        agg = {
            "total_interns": len(result),
            "active_today": sum(1 for r in result if r["today_minutes"] > 0),
            "at_risk": sum(1 for r in result if r["at_risk"]),
            "badges_total": sum(r["badges_count"] for r in result),
            "tasks_overdue_total": sum(r["tasks_overdue"] for r in result),
        }
        return {"summary": agg, "interns": result}

    @api.get("/manager/activity-feed")
    async def manager_activity_feed(user=Depends(get_current_user)):
        """Recent intern activity for the manager dashboard."""
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

        # Scope: interns visible to this manager
        query = {} if user.get("role") in ("super_admin","admin","hr") else {
            "$or": [{"reporting_manager_email": user["email"]},
                    {"owner_id": user["id"]}]
        }
        interns = await db.interns.find(query, {"_id": 0}).to_list(500)
        intern_ids = [i["id"] for i in interns]
        intern_emails = [i["email"] for i in interns]
        if not intern_ids:
            return []

        feed = []

        # Recent task completions / submissions
        tasks = await db.intern_tasks.find(
            {"intern_id": {"$in": intern_ids}}, {"_id": 0}
        ).sort("updated_at", -1).limit(60).to_list(60)
        intern_map = {i["id"]: i for i in interns}
        for t in tasks:
            if t.get("status") in ("completed", "submitted"):
                feed.append({
                    "kind": "task_status",
                    "at": t.get("completed_at") or t.get("updated_at"),
                    "intern": intern_map[t["intern_id"]]["name"],
                    "intern_id": t["intern_id"],
                    "title": f"Task {t['status']}",
                    "detail": t.get("title", ""),
                    "extra": {"on_time": t.get("on_time")},
                })

        # Recent document submissions (from intern.submitted_docs entries)
        for i in interns:
            for doc_type, d in (i.get("submitted_docs") or {}).items():
                feed.append({
                    "kind": "doc_submitted",
                    "at": d.get("submitted_at"),
                    "intern": i["name"],
                    "intern_id": i["id"],
                    "title": f"Document submitted: {doc_type.replace('_', ' ')}",
                    "detail": d.get("file_name", ""),
                    "extra": {"verified": d.get("verified", False)},
                })

        # Recent badges
        for i in interns:
            for b in (i.get("badges") or []):
                feed.append({
                    "kind": "badge",
                    "at": b.get("earned_at"),
                    "intern": i["name"],
                    "intern_id": i["id"],
                    "title": f"Badge: {b.get('name','')}",
                    "detail": b.get("reason", ""),
                    "extra": {"color": b.get("color", "#F97316")},
                })

        feed.sort(key=lambda x: x.get("at") or "", reverse=True)
        return feed[:50]

    # ==============================
    # HR / MANAGER: VERIFY INTERN DOCUMENT
    # ==============================
    @api.post("/manager/verify-document")
    async def verify_document(payload: VerifyDocIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern = await db.interns.find_one({"id": payload.intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        docs = intern.get("submitted_docs") or {}
        if payload.doc_type not in docs:
            raise HTTPException(404, "Document not yet submitted")
        docs[payload.doc_type]["verified"] = payload.verified
        docs[payload.doc_type]["verified_at"] = datetime.now(timezone.utc).isoformat()
        docs[payload.doc_type]["verified_by"] = user["name"]
        if payload.note:
            docs[payload.doc_type]["verifier_note"] = payload.note
        await db.interns.update_one(
            {"id": payload.intern_id},
            {"$set": {"submitted_docs": docs,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        # Notify intern's linked user
        if intern.get("linked_user_id"):
            await _notify(
                intern["linked_user_id"], "doc_verified",
                f"{'Verified' if payload.verified else 'Rejected'}: {payload.doc_type.replace('_',' ')}",
                payload.note or ("Document approved." if payload.verified else "Please re-submit."),
                "/intern/documents",
            )
            # Email the intern via configurable template
            try:
                target = await db.users.find_one({"id": intern["linked_user_id"]},
                                                  {"_id": 0, "id": 1, "email": 1, "name": 1})
                if target:
                    from notif_engine import notify
                    event = "document_verified" if payload.verified else "document_rejected"
                    await notify(
                        db,
                        event=event,
                        user_id=target["id"],
                        user_email=target["email"],
                        title=("Document verified" if payload.verified else "Document needs attention"),
                        message=payload.note or "",
                        link="/intern/documents",
                        variables={
                            "name": target.get("name", intern.get("name", "")),
                            "doc_type": payload.doc_type.replace("_", " ").title(),
                            "reason": payload.note or "",
                        },
                        triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                    )
            except Exception:
                import logging
                logging.getLogger("projexino.phase4").exception("Doc verify email failed")
        return {"ok": True}

    # ==============================
    # INTERN HUB — Assign Task / Project / DM / Detail
    # ==============================
    @api.get("/intern-hub/intern/{intern_id}")
    async def intern_hub_intern_detail(intern_id: str, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern = await db.interns.find_one({"id": intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        tasks = await db.intern_tasks.find({"intern_id": intern_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        # Strip attachment payloads in list (just expose count + names)
        for t in tasks:
            atts = t.get("attachments") or []
            t["attachments"] = [{"id": a.get("id"), "name": a.get("name"), "mime_type": a.get("mime_type")} for a in atts]
        project_ids = list({t.get("project_id") for t in tasks if t.get("project_id")})
        # Also include explicitly-assigned projects
        assigned = intern.get("assigned_projects") or []
        project_ids = list(set(project_ids + [p["project_id"] for p in assigned]))
        projects = []
        if project_ids:
            cur = db.projects.find({"id": {"$in": project_ids}}, {"_id": 0})
            projects = await cur.to_list(200)
        return {"intern": intern, "tasks": tasks, "projects": projects, "assigned_projects": assigned}

    @api.post("/intern-hub/assign-task")
    async def intern_hub_assign_task(payload: AssignTaskIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern = await db.interns.find_one({"id": payload.intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        now = datetime.now(timezone.utc).isoformat()
        # store attachments inline (size-bounded: limit 5 files / 10MB each total raw, we trust client to obey)
        atts = []
        for a in payload.attachments[:10]:
            atts.append({
                "id": str(uuid.uuid4()),
                "name": a.name,
                "mime_type": a.mime_type,
                "content_base64": a.content_base64,
                "uploaded_at": now,
            })
        doc = {
            "id": str(uuid.uuid4()),
            "intern_id": payload.intern_id,
            "title": payload.title,
            "description": payload.description or "",
            "project_id": payload.project_id or "",
            "project_name": payload.project_name or "",
            "deadline": payload.deadline,
            "priority": payload.priority,
            "status": "assigned",
            "attachments": atts,
            "owner_id": intern.get("owner_id") or user["id"],
            "assigned_by": user["name"],
            "created_at": now,
            "updated_at": now,
        }
        await db.intern_tasks.insert_one(doc)
        await db.interns.update_one({"id": payload.intern_id}, {"$inc": {"tasks_assigned": 1}})
        # Optionally publish each attachment to project docs as well
        if payload.publish_to_project_docs and payload.project_id:
            for a in atts:
                await db.documents.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": a["name"],
                    "mime_type": a["mime_type"],
                    "size": len(a.get("content_base64", "")) * 3 // 4,
                    "content_base64": a["content_base64"],
                    "project_id": payload.project_id,
                    "shared_with": [],
                    "description": f"Attached to intern task: {payload.title}",
                    "comments": [],
                    "uploader": user["name"],
                    "owner_id": user["id"],
                    "created_at": now,
                })
        # Notify the intern
        if intern.get("linked_user_id"):
            await _notify(
                intern["linked_user_id"], "intern_task_assigned",
                f"New task: {payload.title}",
                f"Project: {payload.project_name or '—'} · Due {payload.deadline[:10]}",
                "/intern/tasks",
            )
        doc.pop("_id", None)
        doc["attachments"] = [{"id": a["id"], "name": a["name"], "mime_type": a["mime_type"]} for a in atts]
        return doc

    @api.post("/intern-hub/assign-project")
    async def intern_hub_assign_project(payload: AssignProjectIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern = await db.interns.find_one({"id": payload.intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        project = await db.projects.find_one({"id": payload.project_id}, {"_id": 0})
        if not project:
            raise HTTPException(404, "Project not found")
        now = datetime.now(timezone.utc).isoformat()
        # Add to intern's assigned_projects list (dedup by project_id)
        assigned = intern.get("assigned_projects") or []
        assigned = [a for a in assigned if a.get("project_id") != payload.project_id]
        assigned.append({
            "project_id": payload.project_id,
            "project_name": project.get("name") or payload.project_name or "",
            "role": payload.role or "Contributor",
            "note": payload.note or "",
            "assigned_by": user["name"],
            "assigned_at": now,
        })
        # Also add intern as project member (use name for display, linked_user_id is fine)
        members = list(project.get("members") or [])
        marker = intern.get("name") or intern.get("email")
        if marker and marker not in members:
            members.append(marker)
            await db.projects.update_one({"id": payload.project_id}, {"$set": {"members": members, "updated_at": now}})
        # Publish attachments to project docs (default true)
        if payload.publish_to_project_docs:
            for a in payload.attachments[:10]:
                await db.documents.insert_one({
                    "id": str(uuid.uuid4()),
                    "name": a.name,
                    "mime_type": a.mime_type,
                    "size": len(a.content_base64) * 3 // 4,
                    "content_base64": a.content_base64,
                    "project_id": payload.project_id,
                    "shared_with": [],
                    "description": f"Onboarding doc for project: {project.get('name','')}",
                    "comments": [],
                    "uploader": user["name"],
                    "owner_id": user["id"],
                    "created_at": now,
                })
        await db.interns.update_one(
            {"id": payload.intern_id},
            {"$set": {"assigned_projects": assigned, "updated_at": now}},
        )
        if intern.get("linked_user_id"):
            await _notify(
                intern["linked_user_id"], "intern_project_assigned",
                f"You've been assigned: {project.get('name','project')}",
                payload.note or f"Role: {payload.role or 'Contributor'}",
                "/intern/dashboard",
            )
        return {"ok": True, "assigned_projects": assigned}

    @api.post("/intern-hub/dm-channel")
    async def intern_hub_dm_channel(body: dict, user=Depends(get_current_user)):
        """Find-or-create a direct chat channel between current manager/admin and the intern's linked user."""
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern_id = (body or {}).get("intern_id", "")
        intern = await db.interns.find_one({"id": intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        if not intern.get("linked_user_id"):
            raise HTTPException(400, "Intern has no linked login account")
        # We'll look for a 'direct' channel owned by current user that has both members
        member_ids = sorted([user["id"], intern["linked_user_id"]])
        existing = await db.channels.find_one(
            {"owner_id": user["id"], "kind": "direct", "member_ids": member_ids},
            {"_id": 0},
        )
        if existing:
            return existing
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "name": f"DM · {intern.get('name','Intern')}",
            "kind": "direct",
            "member_ids": member_ids,
            "project_id": "",
            "owner_id": user["id"],
            "created_at": now,
            "last_message_at": now,
        }
        await db.channels.insert_one(doc)
        doc.pop("_id", None)
        return doc

    # ==============================
    # WORKSPACE SETTINGS (admin-toggleable)
    # ==============================
    @api.get("/settings/public")
    async def settings_public():
        """Publicly readable settings (used by /login to know whether to show demo creds)."""
        s = await db.settings.find_one({"id": "workspace"}, {"_id": 0}) or {}
        return {"show_demo_creds": bool(s.get("show_demo_creds", True))}

    @api.get("/settings")
    async def settings_get(user=Depends(get_current_user)):
        s = await db.settings.find_one({"id": "workspace"}, {"_id": 0}) or {}
        s.setdefault("show_demo_creds", True)
        return s

    @api.patch("/settings")
    async def settings_patch(payload: SettingsPatchIn, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            return await settings_get(user)
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.settings.update_one(
            {"id": "workspace"},
            {"$set": updates, "$setOnInsert": {"id": "workspace"}},
            upsert=True,
        )
        s = await db.settings.find_one({"id": "workspace"}, {"_id": 0}) or {}
        s.setdefault("show_demo_creds", True)
        return s

    @api.get("/intern-hub/task-attachment/{task_id}/{att_id}")
    async def get_task_attachment(task_id: str, att_id: str, user=Depends(get_current_user)):
        t = await db.intern_tasks.find_one({"id": task_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Task not found")
        # Either the owner/manager OR the intern's linked user can fetch
        intern = await db.interns.find_one({"id": t.get("intern_id")}, {"_id": 0}) or {}
        if user.get("role") not in ("super_admin","admin","manager","hr") and user["id"] != intern.get("linked_user_id"):
            raise HTTPException(403, "Forbidden")
        att = next((a for a in (t.get("attachments") or []) if a.get("id") == att_id), None)
        if not att:
            raise HTTPException(404, "Attachment not found")
        return {"name": att["name"], "mime_type": att["mime_type"], "content_base64": att["content_base64"]}

    # ==============================
    # BADGES — Catalog + AI-suggestion + weekly award
    # ==============================
    BADGE_CATALOG = [
        {"slug": "on_time_achiever", "name": "On-Time Achiever",   "color": "#10B981", "icon": "trophy",   "tagline": "Submits tasks before the deadline."},
        {"slug": "communicator",     "name": "Communicator",        "color": "#3B82F6", "icon": "chat",     "tagline": "Engages actively in team chats and stand-ups."},
        {"slug": "document_diligence","name": "Document Diligence","color": "#A855F7", "icon": "shield",   "tagline": "Submits all onboarding documents promptly."},
        {"slug": "professional",     "name": "Professional",        "color": "#0F2042", "icon": "briefcase","tagline": "Demonstrates exceptional professionalism."},
        {"slug": "project_champion", "name": "Project Champion",    "color": "#F97316", "icon": "rocket",   "tagline": "Drives a project to a successful milestone."},
        {"slug": "innovator",        "name": "Innovator",           "color": "#EAB308", "icon": "spark",    "tagline": "Proposes a creative solution that ships."},
        {"slug": "team_player",      "name": "Team Player",         "color": "#EC4899", "icon": "heart",    "tagline": "Lifts teammates and unblocks others."},
        {"slug": "quick_learner",    "name": "Quick Learner",       "color": "#14B8A6", "icon": "bolt",     "tagline": "Picks up new tech fast and applies it."},
    ]

    @api.get("/intern-hub/badge-catalog")
    async def badge_catalog():
        return BADGE_CATALOG

    @api.post("/intern-hub/award-badge")
    async def award_badge(body: dict, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern_id = (body or {}).get("intern_id", "")
        slug = (body or {}).get("slug", "")
        reason = (body or {}).get("reason", "").strip()
        catalog = next((b for b in BADGE_CATALOG if b["slug"] == slug), None)
        if not catalog:
            raise HTTPException(400, "Unknown badge slug")
        intern = await db.interns.find_one({"id": intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        badge = {
            "id": str(uuid.uuid4()),
            "slug": catalog["slug"],
            "name": catalog["name"],
            "icon": catalog["icon"],
            "color": catalog["color"],
            "reason": reason or catalog["tagline"],
            "awarded_by": user["name"],
            "earned_at": datetime.now(timezone.utc).isoformat(),
        }
        badges = list(intern.get("badges") or []) + [badge]
        await db.interns.update_one(
            {"id": intern_id},
            {"$set": {"badges": badges, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        if intern.get("linked_user_id"):
            await _notify(
                intern["linked_user_id"], "badge_awarded",
                f"🏆 New badge: {badge['name']}",
                badge["reason"], "/intern/badges",
            )
        return {"ok": True, "badge": badge, "badges_count": len(badges)}

    @api.post("/intern-hub/badge-suggestion")
    async def badge_suggestion(body: dict, user=Depends(get_current_user)):
        """AI-suggest a badge slug + reason based on the intern's recent activity."""
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        intern_id = (body or {}).get("intern_id", "")
        intern = await db.interns.find_one({"id": intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        # Gather recent activity context
        tasks = await db.intern_tasks.find({"intern_id": intern_id}, {"_id": 0, "attachments": 0}).sort("created_at", -1).limit(20).to_list(20)
        hours_cur = await db.work_sessions.find({"user_id": intern.get("linked_user_id", "")}, {"_id": 0}).sort("date", -1).limit(7).to_list(7)
        ctx = {
            "intern_name": intern.get("name"),
            "tasks_completed": len([t for t in tasks if t.get("status") == "completed"]),
            "tasks_on_time": len([t for t in tasks if t.get("on_time")]),
            "tasks_overdue": len([t for t in tasks if t.get("status") != "completed" and t.get("deadline", "9999") < datetime.now(timezone.utc).date().isoformat()]),
            "docs_submitted": len(intern.get("submitted_docs") or {}),
            "hours_week": round(sum(h.get("minutes", 0) for h in hours_cur) / 60, 1),
            "existing_badges": [b.get("name") for b in (intern.get("badges") or [])],
            "catalog": [{"slug": b["slug"], "name": b["name"], "tagline": b["tagline"]} for b in BADGE_CATALOG],
        }
        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            return _fallback_badge_suggestion(ctx)
        if not ai_configured():
            return _fallback_badge_suggestion(ctx)
        try:
            import json as _json
            response_text = await chat_completion(
                system_message=(
                    "You are an HR coach for Projexino. Given an intern's recent activity, suggest ONE badge "
                    "from the provided catalog that best fits this week's performance. Return STRICT JSON: "
                    "{\"slug\":\"<catalog_slug>\",\"reason\":\"<1-2 sentence reason citing the metrics>\"}. "
                    "Avoid badges the intern already has unless the metric strongly justifies repeating."
                ),
                user_message=_json.dumps(ctx),
                session_id=f"badge-sugg-{intern_id}",
            )
            raw = str(response_text).strip()
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"): raw = raw[4:]
                raw = raw.strip("`\n ")
            data = _json.loads(raw)
            slug = data.get("slug")
            if not next((b for b in BADGE_CATALOG if b["slug"] == slug), None):
                return _fallback_badge_suggestion(ctx)
            return {"slug": slug, "reason": data.get("reason", "")[:300]}
        except Exception as e:
            logger.warning("AI badge suggestion failed: %s", e)
            return _fallback_badge_suggestion(ctx)
async def seed_hr_user(db):
    """Seed HR role account."""
    email = "hr@projexino.com"
    pw = "HR@2026"
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": email,
            "name": "Projexino HR",
            "role": "hr",
            "password_hash": _hash_password(pw),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded hr: %s", email)
    else:
        updates = {}
        if existing.get("role") != "hr":
            updates["role"] = "hr"
        if not _verify_password(pw, existing["password_hash"]):
            updates["password_hash"] = _hash_password(pw)
        if updates:
            await db.users.update_one({"email": email}, {"$set": updates})
