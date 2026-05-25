"""
PHASE G — Quick fixes & polish.

Endpoints:
  GET    /api/ai/config                                — current provider/model (super_admin only) (masked key)
  PUT    /api/ai/config                                — { provider, api_key, model? } sets runtime override
  DELETE /api/ai/config                                — clears DB override (falls back to env)
  POST   /api/ai/test                                  — { prompt } pings the active provider with a 1-shot call

  GET    /api/doc-verification/{kind}/{owner_id}/{doc_type}/file     — streams the document bytes (for reliable PDF preview in new tab)

  GET    /api/lifecycle/task/{task_id}/full            — full task details (mirrors /lifecycle/project/{id}/full)

  GET    /api/admin/users                              — super_admin only; list all users
  PATCH  /api/admin/users/{user_id}/profile            — super_admin only; edit any user's profile fields

This module is loaded last from server.py so it sees the existing db & dependencies.
"""
from __future__ import annotations

import os
import base64
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Path
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
import io

import ai_provider

logger = logging.getLogger("projexino.phase_g")


# =================== Models ===================
class AIConfigIn(BaseModel):
    provider: str = Field(pattern="^(openai|anthropic|gemini|emergent)$")
    api_key: str = Field(min_length=8)
    model: Optional[str] = None


class AITestIn(BaseModel):
    prompt: str = Field(default="Say hello in 5 words.")


class AdminUserUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    role: Optional[str] = None
    reporting_manager_id: Optional[str] = None  # link this user to a manager


def _mask(s: str) -> str:
    if not s:
        return ""
    if len(s) <= 8:
        return "•" * len(s)
    return s[:4] + "•" * (len(s) - 8) + s[-4:]


async def load_ai_config_from_db(db) -> None:
    """Called at startup. Loads any saved override into the in-process cache."""
    cfg = await db.ai_runtime_config.find_one({"id": "active"}, {"_id": 0})
    if cfg and cfg.get("api_key"):
        ai_provider.set_runtime_config(
            provider=cfg.get("provider", "openai"),
            api_key=cfg.get("api_key", ""),
            model=cfg.get("model"),
        )
    else:
        ai_provider.clear_runtime_config()


def register_phase_g(api: APIRouter, db, get_current_user):

    # =================== AI config ===================
    @api.get("/ai/config")
    async def get_ai_config(user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        cfg = await db.ai_runtime_config.find_one({"id": "active"}, {"_id": 0}) or {}
        provider = cfg.get("provider")
        api_key = cfg.get("api_key", "")
        from_env_provider = ai_provider.active_provider()
        # If no DB override, surface env-based key (masked too)
        env_keys = {
            "openai": os.environ.get("OPENAI_API_KEY", ""),
            "anthropic": os.environ.get("ANTHROPIC_API_KEY", ""),
            "gemini": os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY", ""),
            "emergent": os.environ.get("EMERGENT_LLM_KEY", ""),
        }
        return {
            "source": "db" if (provider and api_key) else ("env" if from_env_provider != "none" else "none"),
            "provider": provider or from_env_provider if from_env_provider != "none" else None,
            "model": cfg.get("model"),
            "api_key_masked": _mask(api_key) if api_key else _mask(env_keys.get(from_env_provider, "")),
            "configured": ai_provider.ai_configured(),
            "env_providers_detected": [p for p, k in env_keys.items() if k],
        }

    @api.put("/ai/config")
    async def set_ai_config(payload: AIConfigIn, user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        await db.ai_runtime_config.update_one(
            {"id": "active"},
            {"$set": {
                "id": "active",
                "provider": payload.provider,
                "api_key": payload.api_key,
                "model": payload.model,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.get("email"),
            }},
            upsert=True,
        )
        ai_provider.set_runtime_config(
            provider=payload.provider,
            api_key=payload.api_key,
            model=payload.model,
        )
        return {"ok": True, "provider": payload.provider, "model": payload.model,
                "api_key_masked": _mask(payload.api_key)}

    @api.delete("/ai/config")
    async def clear_ai_config(user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        await db.ai_runtime_config.delete_one({"id": "active"})
        ai_provider.clear_runtime_config()
        return {"ok": True}

    @api.post("/ai/test")
    async def test_ai(payload: AITestIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin"):
            raise HTTPException(403, "Admin only")
        try:
            text = await ai_provider.chat_completion(
                system_message="You are a tester. Respond briefly.",
                user_message=payload.prompt,
                session_id=f"ai-test-{user['id']}",
            )
            return {"ok": True, "provider": ai_provider.active_provider(), "response": text}
        except Exception as e:
            return {"ok": False, "provider": ai_provider.active_provider(), "error": str(e)}

    # =================== Document streaming (reliable PDF preview) ===================
    @api.get("/doc-verification/{kind}/{owner_id}/{doc_type}/file")
    async def stream_doc(
        kind: str = Path(...),
        owner_id: str = Path(...),
        doc_type: str = Path(...),
        user=Depends(get_current_user),
    ):
        if kind != "intern":
            raise HTTPException(400, "Unsupported kind")
        intern = await db.interns.find_one({"id": owner_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Owner not found")
        priv = user.get("role") in ("super_admin", "admin", "manager", "hr")
        # Owner: either the intern's linked user OR an email match
        is_owner = (
            intern.get("linked_user_id") == user["id"]
            or (intern.get("email", "") or "").lower() == (user.get("email", "") or "").lower()
        )
        if not (priv or is_owner):
            raise HTTPException(403, "Not authorised")
        d = (intern.get("submitted_docs") or {}).get(doc_type)
        if not d or not d.get("content_base64"):
            raise HTTPException(404, "Document not found")
        try:
            raw = base64.b64decode(d["content_base64"])
        except Exception:
            raise HTTPException(500, "Corrupt document")
        mime = d.get("mime_type") or "application/octet-stream"
        fname = d.get("file_name") or f"{doc_type}.bin"
        return Response(
            content=raw,
            media_type=mime,
            headers={
                "Content-Disposition": f'inline; filename="{fname}"',
                "Cache-Control": "private, max-age=60",
                "X-Content-Type-Options": "nosniff",
            },
        )

    # =================== Task detail ===================
    @api.get("/lifecycle/task/{task_id}/full")
    async def get_task_full(task_id: str, user=Depends(get_current_user)):
        # First check regular tasks; fall back to intern_tasks for intern users.
        task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
        is_intern_task = False
        if not task:
            task = await db.intern_tasks.find_one({"id": task_id}, {"_id": 0})
            if task:
                is_intern_task = True
        if not task:
            raise HTTPException(404, "Task not found")
        priv = user.get("role") in ("super_admin", "admin", "manager", "hr")
        # Owner check: owner_id matches OR task is in a project where user is a member
        is_assignee = (
            task.get("owner_id") == user["id"]
            or task.get("assignee_email") == user.get("email", "")
            or task.get("assignee_id") == user["id"]
            or task.get("intern_id") == user["id"]
        )
        # For intern tasks, the task's intern_id refers to the interns-collection profile,
        # not the user.id. Resolve the profile and compare.
        if not is_assignee and is_intern_task and user.get("role") == "intern":
            intern_profile = await db.interns.find_one(
                {"$or": [{"linked_user_id": user["id"]},
                         {"email": (user.get("email") or "").lower()}]},
                {"_id": 0, "id": 1},
            )
            if intern_profile and task.get("intern_id") == intern_profile.get("id"):
                is_assignee = True
        is_member = False
        project = None
        if task.get("project_id"):
            project = await db.projects.find_one({"id": task["project_id"]}, {"_id": 0})
            if project:
                members = project.get("members") or []
                is_member = (
                    user.get("name", "") in members
                    or user.get("email", "") in members
                    or project.get("owner_id") == user["id"]
                    or project.get("manager", "") == user.get("name", "")
                )
        if not (priv or is_assignee or is_member):
            raise HTTPException(403, "Not authorised to view this task")
        # Surface the project name (used by intern detail view)
        if not project and task.get("project_name"):
            project = {"name": task.get("project_name"), "id": task.get("project_id")}
        events = await db.lifecycle_events.find(
            {"entity": "task", "entity_id": task_id}, {"_id": 0},
        ).sort("at", -1).to_list(500)
        my_start = await db.lifecycle_events.find_one(
            {"entity": "task", "entity_id": task_id, "kind": "started", "by_user_id": user["id"]},
            {"_id": 0},
        )
        return {
            "task": task,
            "project": project,
            "timeline": events,
            "my_started_at": my_start.get("at") if my_start else None,
        }

    # =================== Admin: edit any user's profile ===================
    @api.get("/admin/users")
    async def list_all_users(user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        cur = db.users.find(
            {}, {"_id": 0, "password_hash": 0, "avatar_base64": 0},
        ).sort("name", 1)
        rows = await cur.to_list(2000)
        return rows

    @api.patch("/admin/users/{user_id}/profile")
    async def edit_any_user(user_id: str, payload: AdminUserUpdate, user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        target = await db.users.find_one({"id": user_id}, {"_id": 0})
        if not target:
            raise HTTPException(404, "User not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "role" in updates and updates["role"] not in (
            "super_admin", "admin", "manager", "hr",
            "developer", "qa", "cloud_admin", "intern",
            "team_member",  # legacy
        ):
            raise HTTPException(400, "Invalid role")
        # Don't let SA accidentally demote the primary super admin via this endpoint
        if target.get("is_primary_super_admin") and updates.get("role") and updates["role"] != "super_admin":
            raise HTTPException(400, "Cannot demote the primary super admin. Promote another first.")
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        updates["updated_by"] = user.get("email")
        await db.users.update_one({"id": user_id}, {"$set": updates})
        out = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "avatar_base64": 0})
        # Notify the target user (best-effort)
        try:
            from notif_engine import notify
            await notify(
                db,
                event="profile_updated_by_admin",
                user_id=target["id"],
                user_email=target["email"],
                title="Your profile was updated by an admin",
                message=f"Fields changed: {', '.join([k for k in updates if k not in ('updated_at','updated_by')])}",
                link="/app/profile",
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
        except Exception:
            pass
        return out

    @api.post("/admin/users/{user_id}/avatar")
    async def set_any_user_avatar(user_id: str, payload: dict, user=Depends(get_current_user)):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")
        content_b64 = (payload or {}).get("content_base64", "")
        mime = (payload or {}).get("mime_type", "image/png")
        if not content_b64 or len(content_b64) > 4_000_000:
            raise HTTPException(400, "Invalid or too large avatar")
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"avatar_base64": content_b64, "avatar_mime": mime,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}
