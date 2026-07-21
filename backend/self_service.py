"""
Self-service endpoints — what a logged-in user can do for themselves.
- Intern: see their own data, submit documents, update own task status, weekly progress, progress PDF
- All: members directory for chat/team selection
- Manager/Admin: award manual badges
"""
from __future__ import annotations

import io
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

logger = logging.getLogger("projexino.self")

REQUIRED_DOC_TYPES = ["bank_details", "pan_card", "id_proof", "address_proof", "resume"]


class SubmitDocIn(BaseModel):
    doc_type: Literal["bank_details", "pan_card", "id_proof", "address_proof", "resume"]
    file_name: str
    mime_type: str
    content_base64: str
    note: Optional[str] = ""


class TaskStatusIn(BaseModel):
    status: Literal["assigned", "in_progress", "submitted", "completed"]
    completion_note: Optional[str] = ""


class ManualBadgeIn(BaseModel):
    intern_id: str
    name: str
    reason: str
    color: str = "#F97316"
    icon: str = "trophy"


def register_self_service(api: APIRouter, db, get_current_user):

    async def _find_my_intern(user):
        """Return the intern document linked to this user (or None)."""
        if not user:
            return None
        intern = await db.interns.find_one(
            {"$or": [{"linked_user_id": user["id"]}, {"email": user["email"].lower()}]},
            {"_id": 0},
        )
        return intern

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

    # =================================================================
    # MEMBERS DIRECTORY (visible to all logged-in users)
    # =================================================================
    @api.get("/members/directory")
    async def members_directory(user=Depends(get_current_user)):
        """All registered users (for chat/team picker)."""
        cur = db.users.find({}, {"_id": 0, "password_hash": 0})
        items = await cur.to_list(2000)
        return items

    # =================================================================
    # INTERN: SELF-SERVICE
    # =================================================================
    @api.get("/me/intern")
    async def me_intern(user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "No intern profile linked to this account")
        return intern

    @api.get("/me/intern/tasks")
    async def me_intern_tasks(user=Depends(get_current_user)):
        """
        Return every task assigned to this intern from BOTH sources:
        - `intern_tasks` (created via Intern Hub → Manage tasks)
        - `tasks` (created via the main Tasks board → assigned to this intern user)
        Surface them in a single, uniformly-shaped list so the intern's task
        board shows everything in one place.
        """
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        uid = user["id"]
        email = (user.get("email") or "").lower()
        name = (user.get("name") or "").strip()

        # 1) Native intern tasks
        intern_cur = db.intern_tasks.find(
            {"intern_id": intern["id"]}, {"_id": 0}
        ).sort("created_at", -1)
        intern_items = await intern_cur.to_list(500)
        for t in intern_items:
            atts = t.get("attachments") or []
            t["attachments"] = [{"id": a.get("id"), "name": a.get("name"), "mime_type": a.get("mime_type")} for a in atts]
            t["source"] = "intern_task"

        # 2) Main-board tasks assigned to this user (by id, email, or legacy name)
        or_clauses = [
            {"assignee_id": uid},
        ]
        if email:
            or_clauses.append({"assignee_email": email})
        if name:
            or_clauses.append({"assignee": {"$regex": f"^{name}$", "$options": "i"}})
        main_cur = db.tasks.find({"$or": or_clauses}, {"_id": 0}).sort("created_at", -1)
        main_items = await main_cur.to_list(500)
        # Normalize main tasks to look like intern tasks (so the UI doesn't need
        # to branch). Map fields: priority, deadline (from due_date), title,
        # description, status, project_name, etc.
        normalized_main = []
        for t in main_items:
            normalized_main.append({
                "id": t.get("id"),
                "intern_id": intern["id"],
                "title": t.get("title", ""),
                "description": t.get("description", ""),
                "status": t.get("status", "not_started"),
                "priority": t.get("priority", "medium"),
                "deadline": t.get("due_date") or t.get("deadline") or "",
                "completed_at": t.get("completed_at", ""),
                "on_time": t.get("on_time"),
                "completion_note": t.get("completion_note", ""),
                "attachments": [],
                "created_at": t.get("created_at"),
                "updated_at": t.get("updated_at"),
                "created_by": t.get("created_by") or t.get("owner_name") or "",
                "project_name": t.get("project_name", ""),
                "project_id": t.get("project_id", ""),
                "source": "main_task",
            })

        # Merge & de-dupe by id (intern_tasks win if both exist on same id, unlikely)
        seen = set()
        out = []
        for t in intern_items + normalized_main:
            tid = t.get("id")
            if not tid or tid in seen: continue
            seen.add(tid)
            out.append(t)
        # Re-sort by created_at desc
        out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return out

    @api.patch("/me/intern/tasks/{task_id}")
    async def me_intern_task_update(task_id: str, payload: TaskStatusIn,
                                    user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        # Try the intern_tasks collection first (legacy path)
        existing = await db.intern_tasks.find_one(
            {"id": task_id, "intern_id": intern["id"]}, {"_id": 0}
        )
        source = "intern_task"
        if not existing:
            # Fall back to main `tasks` collection if this user is the assignee.
            uid = user["id"]
            email = (user.get("email") or "").lower()
            name = (user.get("name") or "").strip()
            or_clauses = [{"assignee_id": uid}]
            if email:
                or_clauses.append({"assignee_email": email})
            if name:
                or_clauses.append({"assignee": {"$regex": f"^{name}$", "$options": "i"}})
            existing = await db.tasks.find_one(
                {"id": task_id, "$or": or_clauses}, {"_id": 0}
            )
            source = "main_task"
        if not existing:
            raise HTTPException(404, "Task not found")

        updates = {
            "status": payload.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if payload.completion_note:
            updates["completion_note"] = payload.completion_note

        if payload.status == "completed" and existing.get("status") != "completed":
            now = datetime.now(timezone.utc)
            updates["completed_at"] = now.isoformat()
            on_time = True
            try:
                dl_raw = existing.get("deadline") or existing.get("due_date")
                if dl_raw:
                    dl = dl_raw
                    if len(dl) == 10:
                        dl = dl + "T23:59:59+00:00"
                    deadline_dt = datetime.fromisoformat(dl.replace("Z", "+00:00"))
                    if deadline_dt.tzinfo is None:
                        deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)
                    on_time = now <= deadline_dt
            except Exception:
                on_time = True
            updates["on_time"] = on_time

            if on_time:
                # award badge
                badge = {
                    "id": str(uuid.uuid4()),
                    "name": "On-Time Achiever",
                    "reason": f"Completed '{existing['title']}' before deadline.",
                    "icon": "trophy",
                    "color": "#10B981",
                    "earned_at": now.isoformat(),
                }
                badges = (intern.get("badges") or []) + [badge]
                await db.interns.update_one(
                    {"id": intern["id"]},
                    {"$set": {"badges": badges}, "$inc": {"tasks_on_time": 1}},
                )
                await _create_notification(
                    intern["owner_id"], "intern_task_completed",
                    f"{intern['name']} earned 'On-Time Achiever'",
                    f"Task '{existing['title']}' submitted on time.",
                    "/app/interns",
                )
            else:
                await _create_notification(
                    intern["owner_id"], "intern_task_completed",
                    f"{intern['name']} submitted late",
                    f"Task '{existing['title']}' completed after deadline.",
                    "/app/interns",
                )

        # Write to whichever collection the task actually lives in
        if source == "intern_task":
            await db.intern_tasks.update_one({"id": task_id}, {"$set": updates})
            # Notify intern's reporting manager (intern["owner_id"] = the admin/manager who added this intern)
            # Already handled above for completed-on-time/late. For other status changes, notify too.
            if payload.status != "completed":
                owner_id = intern.get("owner_id")
                if owner_id and owner_id != user["id"]:
                    await _create_notification(
                        owner_id, "task_status_changed",
                        f"{user.get('name', 'Intern')} → {payload.status.replace('_', ' ')}",
                        f"Task '{existing.get('title', '')}' status updated.",
                        f"/app/tasks/{task_id}",
                    )
        else:
            await db.tasks.update_one({"id": task_id}, {"$set": updates})
            # Notify owner AND reporting manager when status changes (excluding self).
            actor_name = user.get("name") or user.get("email") or "Intern"
            recipients = set()
            for key in ("owner_id", "reporting_manager_id"):
                rid = existing.get(key)
                if rid and rid != user["id"]:
                    recipients.add(rid)
            for rid in recipients:
                await _create_notification(
                    rid, "task_status_changed",
                    f"{actor_name} → {payload.status.replace('_', ' ')}",
                    f"Task '{existing.get('title', '')}' status updated.",
                    f"/app/tasks/{task_id}",
                )
        merged = {**existing, **updates}
        return merged

    @api.get("/me/intern/documents")
    async def me_intern_docs(user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        docs = intern.get("submitted_docs", {}) or {}
        # Strip base64 content from response
        return {
            "required": REQUIRED_DOC_TYPES,
            "submitted": {k: {kk: vv for kk, vv in v.items() if kk != "content_base64"} for k, v in docs.items()},
        }

    @api.post("/me/intern/documents")
    async def me_submit_doc(payload: SubmitDocIn, user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        if len(payload.content_base64) > 14_000_000:  # rough 10 MB after base64
            raise HTTPException(400, "File too large (max 10MB)")

        doc_entry = {
            "doc_type": payload.doc_type,
            "file_name": payload.file_name,
            "mime_type": payload.mime_type,
            "content_base64": payload.content_base64,
            "note": payload.note or "",
            "submitted_at": datetime.now(timezone.utc).isoformat(),
            "verified": False,
        }
        submitted = (intern.get("submitted_docs") or {})
        submitted[payload.doc_type] = doc_entry

        new_badges = list(intern.get("badges") or [])
        diligence_check = all(t in submitted for t in REQUIRED_DOC_TYPES)
        already_has = any(b.get("name") == "Document Diligence" for b in new_badges)
        if diligence_check and not already_has:
            new_badges.append({
                "id": str(uuid.uuid4()),
                "name": "Document Diligence",
                "reason": "Submitted every required document.",
                "icon": "shield",
                "color": "#3B82F6",
                "earned_at": datetime.now(timezone.utc).isoformat(),
            })
            await _create_notification(
                intern["owner_id"], "intern_doc_complete",
                f"{intern['name']} completed document submissions",
                "All required documents have been submitted.",
                "/app/interns",
            )

        await db.interns.update_one(
            {"id": intern["id"]},
            {"$set": {"submitted_docs": submitted, "badges": new_badges,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await _create_notification(
            intern["owner_id"], "intern_doc_submitted",
            f"{intern['name']} submitted {payload.doc_type.replace('_', ' ')}",
            f"File: {payload.file_name}",
            "/app/interns",
        )
        return {"ok": True, "submitted_docs": list(submitted.keys()),
                "badges_count": len(new_badges)}

    @api.get("/me/intern/documents/{doc_type}/download")
    async def me_download_doc(doc_type: str, user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        d = (intern.get("submitted_docs") or {}).get(doc_type)
        if not d:
            raise HTTPException(404, "Not submitted")
        return {
            "name": d.get("file_name", doc_type),
            "mime_type": d.get("mime_type", "application/octet-stream"),
            "content_base64": d.get("content_base64", ""),
        }

    # =================================================================
    # WEEKLY PROGRESS REPORT
    # =================================================================
    @api.get("/me/intern/progress")
    async def me_intern_progress(user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        all_tasks = await db.intern_tasks.find(
            {"intern_id": intern["id"]}, {"_id": 0}
        ).to_list(1000)

        now = datetime.now(timezone.utc)
        # Find this week (Mon-Sun)
        weekday = now.weekday()  # 0=Mon
        week_start = (now - timedelta(days=weekday)).replace(hour=0, minute=0, second=0, microsecond=0)
        week_end = week_start + timedelta(days=7)

        completed = [t for t in all_tasks if t.get("status") == "completed"]
        completed_week = [t for t in completed if (t.get("completed_at") or "") >= week_start.isoformat()]
        pending = [t for t in all_tasks if t.get("status") in ("assigned", "in_progress", "submitted")]
        overdue = [t for t in pending if (t.get("deadline") or "9999") < now.date().isoformat()]

        # message activity
        msg_count = await db.chat_messages.count_documents({"author_email": intern["email"]})

        # Communicator badge auto-award at 20+ messages
        new_badges = list(intern.get("badges") or [])
        already_communicator = any(b.get("name") == "Communicator" for b in new_badges)
        if msg_count >= 20 and not already_communicator:
            new_badges.append({
                "id": str(uuid.uuid4()),
                "name": "Communicator",
                "reason": f"Sent {msg_count} chat messages — actively communicating.",
                "icon": "message",
                "color": "#A855F7",
                "earned_at": now.isoformat(),
            })
            await db.interns.update_one(
                {"id": intern["id"]}, {"$set": {"badges": new_badges}}
            )

        # AI suggestions (lightweight, no LLM call to save quota; manager can request full report)
        suggestions = []
        if overdue:
            suggestions.append(f"You have {len(overdue)} overdue task(s) — prioritize these first.")
        if not all(t in (intern.get("submitted_docs") or {}) for t in REQUIRED_DOC_TYPES):
            missing = [t for t in REQUIRED_DOC_TYPES if t not in (intern.get("submitted_docs") or {})]
            suggestions.append(f"Submit pending documents: {', '.join(missing)}.")
        if msg_count < 5:
            suggestions.append("Engage with your team in chat — collaboration is key.")
        if len(completed_week) == 0 and pending:
            suggestions.append("Aim to complete at least one task this week.")
        if not suggestions:
            suggestions.append("Great pace — keep it up! Try volunteering for an extra project task.")

        return {
            "intern": {k: v for k, v in intern.items() if k != "submitted_docs"},
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "summary": {
                "total_tasks": len(all_tasks),
                "completed": len(completed),
                "completed_this_week": len(completed_week),
                "pending": len(pending),
                "overdue": len(overdue),
                "on_time_rate": round(
                    (intern.get("tasks_on_time", 0) / max(len(completed), 1)) * 100, 1
                ),
                "messages_sent": msg_count,
                "badges_earned": len(new_badges),
            },
            "tasks_completed_this_week": completed_week,
            "pending_tasks": pending[:10],
            "overdue_tasks": overdue,
            "badges": new_badges,
            "suggestions": suggestions,
        }

    @api.get("/me/intern/progress/pdf")
    async def me_intern_progress_pdf(user=Depends(get_current_user)):
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        progress = await me_intern_progress(user)
        pdf_bytes = _build_progress_pdf(intern, progress)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{intern["name"].replace(" ", "_")}_Progress_Report.pdf"'},
        )

    @api.get("/me/intern/certificate")
    async def me_intern_certificate(user=Depends(get_current_user)):
        """Self-service Performance Certificate download for the logged-in intern."""
        intern = await _find_my_intern(user)
        if not intern:
            raise HTTPException(404, "Not an intern account")
        tasks_cur = db.intern_tasks.find({"intern_id": intern["id"]}, {"_id": 0}).sort("created_at", 1)
        tasks = await tasks_cur.to_list(500)
        from extensions import _build_intern_certificate_pdf  # local import to avoid cycle
        pdf_bytes = _build_intern_certificate_pdf(intern, tasks)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{intern["name"].replace(" ", "_")}_Performance_Certificate.pdf"'},
        )

    # =================================================================
    # MANAGER: AWARD MANUAL BADGES
    # =================================================================
    @api.post("/me/award-badge")
    async def award_badge(payload: ManualBadgeIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager"):
            raise HTTPException(403, "Only managers/admins can award badges")
        intern = await db.interns.find_one({"id": payload.intern_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Intern not found")
        badge = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "reason": payload.reason,
            "icon": payload.icon,
            "color": payload.color,
            "earned_at": datetime.now(timezone.utc).isoformat(),
        }
        badges = (intern.get("badges") or []) + [badge]
        await db.interns.update_one(
            {"id": payload.intern_id}, {"$set": {"badges": badges}}
        )
        await _create_notification(
            intern["owner_id"], "intern_badge_awarded",
            f"{intern['name']} earned '{payload.name}'",
            payload.reason,
            "/app/interns",
        )
        # Email the intern (if linked user exists)
        try:
            linked_user_id = intern.get("linked_user_id")
            target = None
            if linked_user_id:
                target = await db.users.find_one({"id": linked_user_id}, {"_id": 0, "id": 1, "email": 1, "name": 1})
            if not target and intern.get("email"):
                target = await db.users.find_one({"email": (intern["email"] or "").lower()},
                                                  {"_id": 0, "id": 1, "email": 1, "name": 1})
            if target:
                from notif_engine import notify
                await notify(
                    db,
                    event="badge_awarded",
                    user_id=target["id"],
                    user_email=target["email"],
                    title=f"You earned the {payload.name} badge!",
                    message=payload.reason,
                    link="/intern/badges",
                    variables={
                        "name": target.get("name", intern["name"]),
                        "badge_name": payload.name,
                        "reason": payload.reason,
                    },
                    triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                )
        except Exception:
            import logging
            logging.getLogger("projexino.selfsvc").exception("Badge notify failed")
        return {"ok": True, "badge": badge}


# ============== PDF helper for progress report ==============
def _build_progress_pdf(intern: dict, progress: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    )
    from reportlab.platypus.flowables import Flowable
    from reportlab.lib.units import cm

    NAVY = colors.HexColor("#0F2042")
    ORANGE = colors.HexColor("#F97316")
    GREEN = colors.HexColor("#10B981")
    SLATE = colors.HexColor("#475569")
    LIGHT = colors.HexColor("#F8FAFC")

    USABLE_W = 21 * cm - 4 * cm  # 17cm — margins 2cm each side

    class HeroBanner(Flowable):
        """Cover banner with isometric blocks + title overlay."""
        def __init__(self, w=USABLE_W, h=4.6 * cm):
            super().__init__(); self.width = w; self.height = h

        def draw(self):
            c = self.canv
            # Background panel
            c.setFillColor(colors.HexColor("#FFF4E6"))
            c.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=0)
            # Orange right block
            c.setFillColor(ORANGE)
            c.roundRect(self.width - 3.4 * cm, 0, 3.4 * cm, self.height, 10, fill=1, stroke=0)
            c.setFillColor(colors.HexColor("#FFF4E6"))
            c.rect(self.width - 3.4 * cm, 0, 0.4 * cm, self.height, fill=1, stroke=0)
            # Iso blocks (decorative)
            iso = [(1.2, 1.4, "#3B82F6"), (2.7, 2.2, "#F97316"),
                   (4.2, 1.6, "#A855F7"), (5.7, 2.8, "#10B981")]
            for x, h, col in iso:
                c.setFillColor(colors.HexColor(col))
                c.roundRect(x * cm, 0.5 * cm, 1.1 * cm, h * cm, 4, fill=1, stroke=0)
                c.setFillColor(colors.white)
                c.rect(x * cm + 0.12 * cm, 0.5 * cm + h * cm - 0.3 * cm,
                       0.86 * cm, 0.16 * cm, fill=1, stroke=0)
            # Sparkles on orange
            c.setStrokeColor(colors.white); c.setLineWidth(1.4)
            for i, sx in enumerate([self.width - 2.6 * cm, self.width - 1.9 * cm, self.width - 1.2 * cm]):
                sy = self.height - 0.9 * cm - i * 0.4 * cm
                c.line(sx, sy, sx + 0.3 * cm, sy + 0.3 * cm)
                c.line(sx + 0.3 * cm, sy, sx, sy + 0.3 * cm)
            # Title
            c.setFillColor(NAVY); c.setFont("Helvetica-Bold", 22)
            c.drawString(0.8 * cm, self.height - 1.7 * cm, "Weekly Progress Report")
            c.setFillColor(SLATE); c.setFont("Helvetica", 10)
            c.drawString(0.8 * cm, self.height - 2.4 * cm,
                         "Projexino Solutions Pvt Ltd · Intern Program")

    class StatBar(Flowable):
        """Horizontal stacked progress bar with legend below."""
        def __init__(self, completed, pending, overdue, w=USABLE_W, h=1.7 * cm):
            super().__init__()
            self.completed, self.pending, self.overdue = completed, pending, overdue
            self.width = w; self.height = h

        def draw(self):
            c = self.canv
            total = max(self.completed + self.pending + self.overdue, 1)
            segs = [
                (self.completed, GREEN, "Completed"),
                (self.pending, ORANGE, "Pending"),
                (self.overdue, colors.HexColor("#EF4444"), "Overdue"),
            ]
            # Bar
            bar_y = self.height - 0.95 * cm
            bar_h = 0.7 * cm
            # Background track
            c.setFillColor(colors.HexColor("#F1F5F9"))
            c.roundRect(0, bar_y, self.width, bar_h, 3.5, fill=1, stroke=0)
            x = 0
            for val, col, _ in segs:
                w = (val / total) * self.width
                if w <= 0:
                    continue
                c.setFillColor(col)
                # last segment uses end-rounded corners only via overlay
                c.roundRect(x, bar_y, w, bar_h, 3.5, fill=1, stroke=0)
                if w > 1.2 * cm:
                    c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 8)
                    c.drawString(x + 0.25 * cm, bar_y + 0.22 * cm, f"{val}")
                x += w
            # Legend
            c.setFont("Helvetica", 8)
            lx = 0
            seg_w = self.width / 3
            for val, col, lbl in segs:
                c.setFillColor(col)
                c.circle(lx + 0.15 * cm, 0.2 * cm, 0.08 * cm, fill=1, stroke=0)
                c.setFillColor(SLATE)
                c.drawString(lx + 0.35 * cm, 0.12 * cm, f"{lbl}: {val}")
                lx += seg_w

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=1.4 * cm, bottomMargin=1.4 * cm,
                            title=f"{intern['name']} — Progress Report")
    styles = getSampleStyleSheet()
    name_style = ParagraphStyle(
        "n", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=17,
        textColor=NAVY, spaceAfter=2, leading=20,
    )
    sub_style = ParagraphStyle(
        "sub", parent=styles["Normal"], fontName="Helvetica-Oblique", fontSize=10,
        textColor=SLATE, spaceAfter=10, leading=14,
    )
    h_style = ParagraphStyle(
        "h", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12,
        textColor=ORANGE, spaceBefore=14, spaceAfter=6,
    )
    body = ParagraphStyle(
        "b", parent=styles["Normal"], fontName="Helvetica", fontSize=10,
        textColor=colors.HexColor("#1F2937"), leading=14,
    )
    section_label = ParagraphStyle(
        "sl", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9,
        textColor=ORANGE, alignment=TA_LEFT, spaceAfter=4,
        letterSpacing=1,
    )

    story = [HeroBanner(), Spacer(1, 16)]
    story.append(Paragraph(intern["name"], name_style))
    story.append(Paragraph(
        f"{intern.get('designation','Intern')} · {intern.get('department','Engineering')} · "
        f"Reporting to {intern.get('reporting_manager', '—') or '—'}",
        sub_style,
    ))

    summary = progress["summary"]

    # Summary metrics grid (4 cards in a 2x4 layout)
    story.append(Paragraph("THIS WEEK AT A GLANCE", section_label))
    kpi_data = [
        ["Total tasks", "Completed (all)", "Completed this week", "Pending"],
        [str(summary["total_tasks"]), str(summary["completed"]),
         str(summary["completed_this_week"]), str(summary["pending"])],
        ["Overdue", "On-time rate", "Messages", "Badges"],
        [str(summary["overdue"]), f'{summary["on_time_rate"]}%',
         str(summary["messages_sent"]), str(summary["badges_earned"])],
    ]
    col_w = [USABLE_W / 4] * 4
    kpi = Table(kpi_data, colWidths=col_w, hAlign="LEFT")
    kpi.setStyle(TableStyle([
        # Label rows (0 and 2) — small slate
        ("FONT", (0, 0), (-1, 0), "Helvetica", 8.5),
        ("FONT", (0, 2), (-1, 2), "Helvetica", 8.5),
        ("TEXTCOLOR", (0, 0), (-1, 0), SLATE),
        ("TEXTCOLOR", (0, 2), (-1, 2), SLATE),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("BACKGROUND", (0, 2), (-1, 2), LIGHT),
        # Value rows (1 and 3) — big navy
        ("FONT", (0, 1), (-1, 1), "Helvetica-Bold", 14),
        ("FONT", (0, 3), (-1, 3), "Helvetica-Bold", 14),
        ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
        ("TEXTCOLOR", (0, 3), (-1, 3), NAVY),
        # value column highlights
        ("TEXTCOLOR", (1, 1), (1, 1), GREEN),  # completed all
        ("TEXTCOLOR", (2, 1), (2, 1), GREEN),  # completed week
        ("TEXTCOLOR", (3, 1), (3, 1), ORANGE), # pending
        ("TEXTCOLOR", (0, 3), (0, 3), colors.HexColor("#EF4444")),  # overdue
        ("TEXTCOLOR", (1, 3), (1, 3), GREEN),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
    ]))
    story.append(kpi)
    story.append(Spacer(1, 14))

    story.append(Paragraph("TASK DISTRIBUTION", section_label))
    story.append(StatBar(summary["completed"], summary["pending"], summary["overdue"]))
    story.append(Spacer(1, 14))

    # Completed this week
    if progress.get("tasks_completed_this_week"):
        story.append(Paragraph("Completed this week", h_style))
        rows = [["#", "Title", "Project", "On-time"]]
        for i, t in enumerate(progress["tasks_completed_this_week"][:10], 1):
            rows.append([
                str(i),
                Paragraph((t.get("title") or "")[:90], body),
                Paragraph(t.get("project_name") or "—", body),
                "Yes" if t.get("on_time") else "No",
            ])
        tbl = Table(rows, colWidths=[0.8 * cm, 8.6 * cm, 4.6 * cm, 3.0 * cm],
                    repeatRows=1, hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), GREEN),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 9.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (3, 0), (3, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)
        story.append(Spacer(1, 4))

    # Pending tasks
    if progress.get("pending_tasks"):
        story.append(Paragraph("Pending — do these next", h_style))
        rows = [["#", "Title", "Project", "Deadline", "Status"]]
        for i, t in enumerate(progress["pending_tasks"][:10], 1):
            rows.append([
                str(i),
                Paragraph((t.get("title") or "")[:90], body),
                Paragraph(t.get("project_name") or "—", body),
                (t.get("deadline") or "—")[:10],
                t.get("status", "assigned"),
            ])
        tbl = Table(rows, colWidths=[0.8 * cm, 7.6 * cm, 3.6 * cm, 2.4 * cm, 2.6 * cm],
                    repeatRows=1, hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), ORANGE),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9.5),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 9.5),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (3, 0), (4, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)

    # Badges section
    if progress.get("badges"):
        story.append(Paragraph("Badges earned", h_style))
        b_rows = []
        for b in progress["badges"]:
            color = b.get("color", "#F97316")
            b_rows.append([
                Paragraph(f'<b><font color="{color}">★ {b.get("name","")}</font></b>', body),
                Paragraph(b.get("reason", ""), body),
                (b.get("earned_at") or "")[:10],
            ])
        bt = Table(b_rows, colWidths=[4.2 * cm, 9.4 * cm, 3.4 * cm], hAlign="LEFT")
        bt.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TEXTCOLOR", (2, 0), (2, -1), SLATE),
            ("FONT", (2, 0), (2, -1), "Helvetica", 9),
        ]))
        story.append(bt)

    # Suggestions
    if progress.get("suggestions"):
        story.append(Paragraph("Coaching suggestions", h_style))
        for s in progress["suggestions"]:
            story.append(Paragraph(f"•&nbsp;&nbsp;{s}", body))
            story.append(Spacer(1, 1))

    story.append(Spacer(1, 16))
    foot = ParagraphStyle(
        "ft", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
        textColor=SLATE, alignment=TA_CENTER,
    )
    story.append(Paragraph(
        f"Issued {datetime.now(timezone.utc).strftime('%d %b %Y')}  ·  "
        f"Developed by Projexino Solutions Pvt Ltd  ·  © 2026 Projexino. All rights reserved.",
        foot,
    ))

    doc.build(story)
    return buf.getvalue()
