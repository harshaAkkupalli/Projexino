"""
PHASE E — Password reset (forgot/token), profile editing, and welcome emails
on Team / Intern / HR / Manager creation.

Endpoints:
  POST /api/auth/forgot-password               — any user, by email; emits a token email
  POST /api/auth/reset-password                — { token, new_password }
  POST /api/auth/change-password               — authed; { current_password, new_password }
  POST /api/me/profile/avatar                  — authed; { content_base64, mime_type } stores avatar inline
  GET  /api/me/profile                         — authed; full profile incl. linked intern doc if any
  PATCH /api/me/profile                        — wraps existing /rbac/me for clarity

Welcome-email hooks are exposed as `welcome_user(db, user, temp_password, role, manager)` and
called from create_team_member and /interns/with-login in extensions.py.
"""
from __future__ import annotations

import os
import uuid
import bcrypt
import secrets
import html
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field


# ---------- Models ----------
class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class AvatarIn(BaseModel):
    content_base64: str
    mime_type: str = "image/png"


# ---------- Helpers ----------
def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def _verify(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def _login_url(path: str = "/login") -> str:
    base = (os.environ.get("APP_PUBLIC_URL") or "").rstrip("/")
    return base + path if base else path


async def welcome_user(db, *, user: dict, temp_password: str, role: str,
                       manager: Optional[dict] = None) -> str:
    """Send a welcome email containing login URL + temp creds. Best-effort.
    Returns "" on success or an error string describing why the email failed."""
    try:
        from notif_engine import notify
        login_url = _login_url("/login")
        mgr_name = (manager or {}).get("name", "Projexino HR")
        mgr_email = (manager or {}).get("email", "")
        body_html = (
            f"<p>Hi <b>{html.escape(user.get('name',''))}</b>,</p>"
            f"<p>Welcome to <b>Projexino Solutions</b> 🎉 Your account has been created.</p>"
            f"<div style='background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;margin:14px 0;'>"
            f"<div style='font-size:11px;letter-spacing:0.24em;font-weight:800;color:#F97316;text-transform:uppercase;'>// your login</div>"
            f"<table style='width:100%;font-size:14px;margin-top:6px;'>"
            f"<tr><td style='color:#64748B;width:120px;padding:4px 0;'>Portal</td><td><a href='{login_url}' style='color:#F97316;font-weight:700;text-decoration:none;'>{login_url}</a></td></tr>"
            f"<tr><td style='color:#64748B;padding:4px 0;'>Login ID</td><td><b>{html.escape(user.get('email',''))}</b></td></tr>"
            f"<tr><td style='color:#64748B;padding:4px 0;'>Temp password</td><td><code style='background:white;padding:2px 6px;border-radius:4px;'>{html.escape(temp_password)}</code></td></tr>"
            f"</table>"
            f"<p style='margin:10px 0 0;font-size:12px;color:#9A3412;'>🔒 You will be asked to change this password on first sign-in.</p>"
            f"</div>"
            f"<p>Tap the link below to log in and reset your password right away. If anything doesn't work, reply to this email — "
            f"<b>{html.escape(mgr_name)}</b> ({html.escape(mgr_email)}) is your point of contact.</p>"
            f"<p style='text-align:center;margin:22px 0;'>"
            f"<a href='{login_url}' style='background:linear-gradient(135deg,#F97316,#EA580C);color:white;padding:13px 32px;border-radius:9999px;text-decoration:none;font-weight:800;'>Open my portal →</a>"
            f"</p>"
            f"<p style='color:#475569;font-size:13px;'>— The Projexino team</p>"
        )
        res = await notify(
            db,
            event=f"welcome_{role}",
            user_id=user["id"],
            user_email=user["email"],
            title=f"Welcome to Projexino — your {role.replace('_',' ').title()} account",
            message=f"Hi {user.get('name','')}, your account is ready.",
            link="/login",
            variables={
                "name": user.get("name", ""),
                "login_email": user.get("email", ""),
                "login_password": temp_password,
                "login_url": login_url,
                "role": role.replace("_", " ").title(),
                "designation": user.get("designation") or role.replace("_", " ").title(),
                "manager_name": mgr_name,
                "manager_email": mgr_email,
                "start_date": datetime.now(timezone.utc).strftime("%d %b %Y"),
                "subject": f"Welcome to Projexino — your {role.replace('_',' ').title()} account",
                "body_html": body_html,
            },
            triggered_by={"name": mgr_name, "email": mgr_email},
        )
        if isinstance(res, dict) and res.get("error"):
            return res["error"]
        return ""
    except Exception as e:
        return str(e)[:300]


# ---------- Routes ----------
def register_phase_e(api: APIRouter, db, get_current_user):

    @api.post("/auth/forgot-password")
    async def forgot_password(payload: ForgotIn):
        """Always returns 200 (don't reveal whether email exists). Stores a token if user found."""
        email = payload.email.lower()
        user = await db.users.find_one({"email": email})
        if user:
            token = secrets.token_urlsafe(32)
            await db.password_reset_tokens.update_one(
                {"user_id": user["id"]},
                {"$set": {
                    "id": str(uuid.uuid4()),
                    "user_id": user["id"],
                    "email": email,
                    "token": token,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=4)).isoformat(),
                    "used": False,
                }},
                upsert=True,
            )
            reset_link = _login_url(f"/reset-password?token={token}")
            try:
                from notif_engine import notify
                body_html = (
                    f"<p>Hi <b>{html.escape(user.get('name',''))}</b>,</p>"
                    f"<p>We received a request to reset your Projexino password. Click below to set a new one — this link is valid for <b>4 hours</b>.</p>"
                    f"<p style='text-align:center;margin:24px 0;'>"
                    f"<a href='{reset_link}' style='background:linear-gradient(135deg,#F97316,#EA580C);color:white;padding:13px 28px;border-radius:9999px;text-decoration:none;font-weight:800;'>Reset password</a>"
                    f"</p>"
                    f"<p style='font-size:12px;color:#64748B;'>If the button doesn't work, copy and paste this URL into your browser:<br/><code style='word-break:break-all;'>{reset_link}</code></p>"
                    f"<p style='font-size:12px;color:#64748B;margin-top:18px;'>Didn't request this? You can safely ignore this email — your password won't change.</p>"
                )
                await notify(
                    db,
                    event="password_reset_requested",
                    user_id=user["id"],
                    user_email=email,
                    title="Reset your Projexino password",
                    message="Your password reset link is inside (valid 4 hours).",
                    link=reset_link,
                    variables={
                        "name": user.get("name", ""),
                        "login_url": reset_link,
                        "subject": "Reset your Projexino password",
                        "body_html": body_html,
                    },
                    triggered_by={"name": "Projexino", "email": ""},
                )
            except Exception:
                pass
        return {"ok": True, "message": "If this email exists, a reset link has been sent."}

    @api.post("/auth/reset-password")
    async def reset_password(payload: ResetIn):
        rec = await db.password_reset_tokens.find_one({"token": payload.token}, {"_id": 0})
        if not rec or rec.get("used"):
            raise HTTPException(400, "Invalid or already used token")
        try:
            exp = datetime.fromisoformat(rec["expires_at"])
        except Exception:
            raise HTTPException(400, "Token expired")
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(400, "Token expired")
        await db.users.update_one(
            {"id": rec["user_id"]},
            {"$set": {"password_hash": _hash(payload.new_password),
                      "force_password_reset": False,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.password_reset_tokens.update_one(
            {"token": payload.token},
            {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True, "message": "Password updated. Please log in with your new password."}

    @api.post("/auth/change-password")
    async def change_password(payload: ChangePasswordIn, user=Depends(get_current_user)):
        rec = await db.users.find_one({"id": user["id"]})
        if not rec or not _verify(payload.current_password, rec["password_hash"]):
            raise HTTPException(400, "Current password is incorrect")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"password_hash": _hash(payload.new_password),
                      "force_password_reset": False,
                      "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True}

    @api.get("/me/full-profile")
    async def my_full_profile(user=Depends(get_current_user)):
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        # Optional linked intern record
        intern = await db.interns.find_one({"linked_user_id": user["id"]}, {"_id": 0})
        if not intern:
            intern = await db.interns.find_one({"email": u.get("email", "")}, {"_id": 0})
        return {"user": u, "intern": intern}

    @api.post("/me/profile/avatar")
    async def update_avatar(payload: AvatarIn, user=Depends(get_current_user)):
        if len(payload.content_base64) > 4_000_000:
            raise HTTPException(400, "Avatar too large (max ~3MB)")
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {
                "avatar_base64": payload.content_base64,
                "avatar_mime": payload.mime_type,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return {"ok": True}
