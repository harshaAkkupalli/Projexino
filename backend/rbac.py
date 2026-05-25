"""
PHASE A — RBAC (Role-Based Access Control) module.

Adds:
  * `super_admin` role  — the top-level role. Existing admin@projexino.com is
    auto-promoted to super_admin (primary).
  * Primary vs Secondary super-admin flag.
  * Permission matrix in `role_permissions` (role × module × action).
  * Helpers to require a permission on any route.
  * Endpoints:
      POST   /api/rbac/admins            — super_admin creates an admin (any role)
      GET    /api/rbac/admins            — list admins
      PATCH  /api/rbac/admins/{id}       — edit admin (name/role/primary flag)
      DELETE /api/rbac/admins/{id}       — remove admin
      POST   /api/rbac/admins/{id}/promote-primary — make this user the primary super_admin
      GET    /api/rbac/matrix            — full permission matrix (super_admin only)
      PUT    /api/rbac/matrix            — update full permission matrix
      GET    /api/rbac/permissions       — current user's effective permission map
      GET    /api/rbac/me                — current user profile + super_admin flags
      PATCH  /api/rbac/me                — update own profile (name/phone/avatar/etc.)
"""
from __future__ import annotations

import os
import uuid
import bcrypt
from datetime import datetime, timezone
from typing import Optional, Dict, List

from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, EmailStr, Field

# ---------- Constants ----------
# Canonical roles surfaced as login cards. `super_admin` is seeded-only (not
# selectable). `team_member` is a legacy alias kept for backward compatibility
# with existing rows in `users` — new role assignments must pick from
# ASSIGNABLE_ROLES.
ROLES = ["super_admin", "admin", "manager", "hr",
         "developer", "qa", "cloud_admin", "intern",
         "team_member"]  # last entry = legacy

ASSIGNABLE_ROLES = ("admin", "hr", "manager", "developer", "qa", "cloud_admin", "intern")

# Mapping for UI labels (used by /api/rbac/roles)
ROLE_LABELS = {
    "super_admin": "Super Admin",
    "admin": "Admin",
    "manager": "Manager",
    "hr": "HR",
    "developer": "Developer",
    "qa": "QA",
    "cloud_admin": "Cloud Admin",
    "intern": "Intern",
    "team_member": "Team Member (legacy)",
}

MODULES = [
    "dashboard", "projects", "tasks", "chat", "leads", "team", "interns",
    "manager", "badges", "documents", "issues", "finance", "email-campaigns",
    "email-templates", "presence", "ai", "settings", "access-control",
    "hr-regulations", "hr-payslips", "hr-audit", "hr-expenses", "hr-documents",
    "notifications-permissions", "profile",
    # New module slugs (one per card in the Launchpad)
    "hr", "email", "calendly", "org-chart", "doc-verification",
    "ai-settings", "website-config", "blog", "linkedin",
]
ACTIONS = ["view", "create", "edit", "delete"]

# Default matrix — keys are "role" -> { "module" -> { action: bool } }
DEFAULT_MATRIX: Dict[str, Dict[str, Dict[str, bool]]] = {
    "super_admin": {m: {a: True for a in ACTIONS} for m in MODULES},
    "admin": {
        **{m: {a: True for a in ACTIONS} for m in MODULES},
        "access-control": {"view": False, "create": False, "edit": False, "delete": False},
        "notifications-permissions": {"view": False, "create": False, "edit": False, "delete": False},
    },
    "manager": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "projects", "tasks", "team", "interns", "manager", "badges",
                  "leads", "chat", "ai", "documents", "issues", "presence", "profile",
                  "calendly", "org-chart", "email", "email-campaigns", "email-templates"]
    },
    "hr": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "team", "interns", "leads", "chat", "ai", "documents", "issues",
                  "finance", "presence", "email-campaigns", "email-templates", "profile",
                  "hr-regulations", "hr-payslips", "hr-audit", "hr-expenses", "hr-documents",
                  "hr", "email", "calendly", "org-chart", "doc-verification"]
    },
    "developer": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "tasks", "projects", "chat", "ai", "documents", "issues",
                  "profile", "calendly"]
    },
    "qa": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "tasks", "projects", "chat", "ai", "documents", "issues",
                  "profile", "calendly"]
    },
    "cloud_admin": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "tasks", "projects", "chat", "ai", "documents", "issues",
                  "profile", "calendly", "presence"]
    },
    # Legacy alias — same permissions as developer so existing accounts keep working
    "team_member": {
        m: {"view": True, "create": True, "edit": True, "delete": False}
        for m in ["dashboard", "tasks", "projects", "chat", "ai", "documents", "profile",
                  "calendly"]
    },
    "intern": {
        m: {"view": True, "create": False, "edit": False, "delete": False}
        for m in ["dashboard", "tasks", "documents", "chat", "ai", "badges", "profile"]
    },
}
# normalise: fill missing modules per role with all-false
for _r, _mods in DEFAULT_MATRIX.items():
    for _m in MODULES:
        _mods.setdefault(_m, {a: False for a in ACTIONS})


# ---------- Models ----------
class AdminCreateIn(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    role: str = "admin"  # any value from ASSIGNABLE_ROLES (super_admin also accepted)
    is_primary: bool = False
    designation: Optional[str] = ""
    phone: Optional[str] = ""
    reporting_manager_id: Optional[str] = ""        # NEW — supervisor's user id
    route_comms_to_manager: Optional[bool] = False  # NEW — when True, all notifications CC the manager


class AdminUpdateIn(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_primary: Optional[bool] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    avatar_url: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    route_comms_to_manager: Optional[bool] = None


class ProfileUpdateIn(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class MatrixIn(BaseModel):
    matrix: Dict[str, Dict[str, Dict[str, bool]]]


# ---------- Helpers ----------
def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


async def get_role_matrix(db) -> Dict[str, Dict[str, Dict[str, bool]]]:
    """Return current matrix from DB, falling back to defaults."""
    doc = await db.role_permissions.find_one({"id": "active"}, {"_id": 0})
    if not doc or not isinstance(doc.get("matrix"), dict):
        return DEFAULT_MATRIX
    # Merge with defaults so newly-added modules/actions are present
    merged = {r: {m: {a: False for a in ACTIONS} for m in MODULES} for r in ROLES}
    for r in ROLES:
        for m in MODULES:
            base = DEFAULT_MATRIX.get(r, {}).get(m, {a: False for a in ACTIONS})
            saved = (doc.get("matrix", {}).get(r, {}) or {}).get(m, {})
            for a in ACTIONS:
                merged[r][m][a] = bool(saved.get(a, base.get(a, False)))
    return merged


async def has_permission(db, user: dict, module: str, action: str = "view") -> bool:
    role = user.get("role", "")
    if role == "super_admin":
        return True
    matrix = await get_role_matrix(db)
    return bool(matrix.get(role, {}).get(module, {}).get(action, False))


def require_perm(db_getter, module: str, action: str = "view"):
    """FastAPI dependency: ensures the current user has a given permission."""
    async def _dep(request: Request, user=Depends(_noop)):
        # Caller must pass user via Depends() outside this helper; we keep this stub
        # purely as a marker — actual enforcement is done inline in routes for now
        # to avoid circular deps with the main get_current_user.
        return user
    return _dep


async def _noop():
    return None


async def seed_super_admin(db, admin_email: str = "admin@projexino.com"):
    """Promote the bootstrap admin user to super_admin (primary) if not already."""
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        return
    updates: Dict = {}
    if existing.get("role") != "super_admin":
        updates["role"] = "super_admin"
    if not existing.get("is_primary_super_admin"):
        # only seed `is_primary` if no current primary exists
        has_primary = await db.users.find_one(
            {"is_primary_super_admin": True, "role": "super_admin"},
            {"_id": 0, "id": 1},
        )
        if not has_primary:
            updates["is_primary_super_admin"] = True
    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"email": admin_email}, {"$set": updates})


# ---------- Route registration ----------
def register_rbac(api: APIRouter, db, get_current_user):
    """Attach all RBAC routes to the API router."""

    async def _require_super(user):
        if user.get("role") != "super_admin":
            raise HTTPException(403, "Super admin only")

    # ===== Matrix =====
    @api.get("/rbac/matrix")
    async def get_matrix(user=Depends(get_current_user)):
        await _require_super(user)
        matrix = await get_role_matrix(db)
        return {
            "roles": ROLES,
            "modules": MODULES,
            "actions": ACTIONS,
            "matrix": matrix,
        }

    @api.put("/rbac/matrix")
    async def update_matrix(payload: MatrixIn, user=Depends(get_current_user)):
        await _require_super(user)
        # Validate keys
        clean: Dict[str, Dict[str, Dict[str, bool]]] = {}
        for r in ROLES:
            clean[r] = {}
            for m in MODULES:
                clean[r][m] = {}
                for a in ACTIONS:
                    val = (
                        payload.matrix.get(r, {}).get(m, {}).get(a)
                        if isinstance(payload.matrix, dict)
                        else None
                    )
                    base = DEFAULT_MATRIX.get(r, {}).get(m, {}).get(a, False)
                    clean[r][m][a] = bool(base if val is None else val)
        # super_admin always full
        clean["super_admin"] = {m: {a: True for a in ACTIONS} for m in MODULES}
        await db.role_permissions.update_one(
            {"id": "active"},
            {"$set": {
                "id": "active",
                "matrix": clean,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "updated_by": user.get("email"),
            }},
            upsert=True,
        )
        return {"ok": True, "matrix": clean}

    @api.post("/rbac/matrix/reset")
    async def reset_matrix(user=Depends(get_current_user)):
        await _require_super(user)
        await db.role_permissions.delete_one({"id": "active"})
        return {"ok": True, "matrix": DEFAULT_MATRIX}

    # ===== Permissions for current user =====
    @api.get("/rbac/permissions")
    async def my_permissions(user=Depends(get_current_user)):
        role = user.get("role", "")
        matrix = await get_role_matrix(db)
        # `super_admin` gets everything (matrix already reflects, but be explicit)
        if role == "super_admin":
            perms = {m: {a: True for a in ACTIONS} for m in MODULES}
        else:
            perms = matrix.get(role, {m: {a: False for a in ACTIONS} for m in MODULES})
        return {
            "role": role,
            "is_super_admin": role == "super_admin",
            "is_primary_super_admin": bool(user.get("is_primary_super_admin", False)),
            "permissions": perms,
        }

    # ===== Admins =====
    @api.get("/rbac/admins")
    async def list_admins(user=Depends(get_current_user)):
        """Returns ALL team accounts (every role except plain unverified users).
        This is the team roster Super Admin sees in Access Control."""
        await _require_super(user)
        cur = db.users.find(
            {"role": {"$in": list(set(ASSIGNABLE_ROLES) | {"super_admin", "team_member"})}},
            {"_id": 0, "password_hash": 0, "avatar_base64": 0},
        ).sort("created_at", 1)
        rows = await cur.to_list(1000)
        # Backfill missing fields so the UI can render uniformly
        for r in rows:
            r.setdefault("reporting_manager_id", "")
            r.setdefault("reporting_manager_name", "")
            r.setdefault("reporting_manager_email", "")
            r.setdefault("route_comms_to_manager", False)
            r.setdefault("created_by", "")
            r.setdefault("created_by_name", "")
        return rows

    @api.get("/rbac/roles")
    async def list_assignable_roles(user=Depends(get_current_user)):
        """Returns the 7 roles surfaced as login cards. `super_admin` is
        intentionally excluded — it's seeded-only."""
        return [{"value": r, "label": ROLE_LABELS.get(r, r)} for r in ASSIGNABLE_ROLES]

    @api.post("/rbac/admins")
    async def create_admin(payload: AdminCreateIn, user=Depends(get_current_user)):
        await _require_super(user)
        ALLOWED = set(ASSIGNABLE_ROLES) | {"super_admin"}
        if payload.role not in ALLOWED:
            raise HTTPException(400, f"role must be one of: {sorted(ALLOWED)}")
        email = payload.email.lower()
        if await db.users.find_one({"email": email}):
            raise HTTPException(400, "Email already registered")
        # if creating a primary super_admin, demote any existing primary
        if payload.is_primary and payload.role == "super_admin":
            await db.users.update_many(
                {"is_primary_super_admin": True},
                {"$set": {"is_primary_super_admin": False}},
            )
        doc = {
            "id": str(uuid.uuid4()),
            "email": email,
            "name": payload.name,
            "role": payload.role,
            "is_primary_super_admin": bool(payload.is_primary and payload.role == "super_admin"),
            "password_hash": _hash(payload.password),
            "designation": payload.designation or "",
            "phone": payload.phone or "",
            "reporting_manager_id": payload.reporting_manager_id or "",
            "reporting_manager_email": "",
            "reporting_manager_name": "",
            "route_comms_to_manager": bool(payload.route_comms_to_manager),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": user.get("email"),
            "created_by_name": user.get("name", ""),
            "force_password_reset": True,
        }
        # Resolve reporting manager details
        if payload.reporting_manager_id:
            mgr = await db.users.find_one(
                {"id": payload.reporting_manager_id},
                {"_id": 0, "email": 1, "name": 1, "role": 1},
            )
            if mgr:
                doc["reporting_manager_email"] = mgr.get("email", "")
                doc["reporting_manager_name"] = mgr.get("name", "")
        await db.users.insert_one(doc)
        # Fire welcome email via Phase E helper (HTML email with login link + temp creds)
        try:
            from phase_e import welcome_user
            await welcome_user(
                db,
                user={"id": doc["id"], "name": payload.name, "email": email,
                      "designation": payload.designation or ""},
                temp_password=payload.password,
                role=payload.role,
                manager={"name": user.get("name", "Super Admin"), "email": user.get("email", "")},
            )
        except Exception:
            pass
        doc.pop("password_hash", None)
        doc.pop("_id", None)
        return doc

    @api.patch("/rbac/admins/{admin_id}")
    async def update_admin(admin_id: str, payload: AdminUpdateIn, user=Depends(get_current_user)):
        await _require_super(user)
        target = await db.users.find_one({"id": admin_id})
        if not target:
            raise HTTPException(404, "Admin not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "role" in updates and updates["role"] not in (set(ASSIGNABLE_ROLES) | {"super_admin"}):
            raise HTTPException(400, f"role must be one of: {sorted(set(ASSIGNABLE_ROLES) | {'super_admin'})}")
        # Resolve reporting manager email/name when id changes
        if "reporting_manager_id" in updates:
            if updates["reporting_manager_id"]:
                mgr = await db.users.find_one(
                    {"id": updates["reporting_manager_id"]},
                    {"_id": 0, "email": 1, "name": 1},
                )
                updates["reporting_manager_email"] = mgr.get("email", "") if mgr else ""
                updates["reporting_manager_name"] = mgr.get("name", "") if mgr else ""
            else:
                updates["reporting_manager_email"] = ""
                updates["reporting_manager_name"] = ""
        if updates.get("is_primary") and (updates.get("role") or target.get("role")) == "super_admin":
            await db.users.update_many(
                {"is_primary_super_admin": True, "id": {"$ne": admin_id}},
                {"$set": {"is_primary_super_admin": False}},
            )
            updates["is_primary_super_admin"] = True
        if "is_primary" in updates:
            # explicit demotion path
            if not updates["is_primary"]:
                updates["is_primary_super_admin"] = False
        updates.pop("is_primary", None)
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": admin_id}, {"$set": updates})
        out = await db.users.find_one({"id": admin_id}, {"_id": 0, "password_hash": 0})
        return out

    @api.delete("/rbac/admins/{admin_id}")
    async def delete_admin(admin_id: str, user=Depends(get_current_user)):
        await _require_super(user)
        target = await db.users.find_one({"id": admin_id})
        if not target:
            raise HTTPException(404, "Admin not found")
        if target.get("is_primary_super_admin"):
            raise HTTPException(400, "Cannot remove the primary super admin. Promote another first.")
        if target.get("email") == user.get("email"):
            raise HTTPException(400, "You cannot delete your own account here.")
        await db.users.delete_one({"id": admin_id})
        return {"ok": True}

    @api.post("/rbac/admins/{admin_id}/promote-primary")
    async def promote_primary(admin_id: str, user=Depends(get_current_user)):
        await _require_super(user)
        target = await db.users.find_one({"id": admin_id})
        if not target:
            raise HTTPException(404, "Admin not found")
        if target.get("role") != "super_admin":
            # auto-promote to super_admin if currently admin
            await db.users.update_one({"id": admin_id}, {"$set": {"role": "super_admin"}})
        await db.users.update_many(
            {"is_primary_super_admin": True, "id": {"$ne": admin_id}},
            {"$set": {"is_primary_super_admin": False}},
        )
        await db.users.update_one(
            {"id": admin_id},
            {"$set": {"is_primary_super_admin": True, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    # ===== Self profile =====
    @api.get("/rbac/me")
    async def me_profile(user=Depends(get_current_user)):
        # ensure fields exist
        doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        return doc

    @api.patch("/rbac/me")
    async def update_me(payload: ProfileUpdateIn, user=Depends(get_current_user)):
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
        # Notify super_admin + HR + manager (best-effort)
        try:
            from notif_engine import notify
            notified = set()
            recipients = await db.users.find(
                {"role": {"$in": ["super_admin", "hr"]}},
                {"_id": 0, "id": 1, "email": 1, "name": 1},
            ).to_list(50)
            for r in recipients:
                if r["id"] in notified:
                    continue
                notified.add(r["id"])
                await notify(
                    db,
                    event="profile_updated",
                    user_id=r["id"],
                    user_email=r["email"],
                    title=f"{user.get('name', 'A user')} updated their profile",
                    message=f"{user.get('name','')} ({user.get('email','')}) changed: {', '.join(updates.keys())}",
                    link="/app/team",
                    triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                )
        except Exception:
            pass
        return await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
