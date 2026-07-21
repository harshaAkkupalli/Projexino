"""
Public account-deletion flow (Google Play data-safety compliance).

  POST /api/public/account-deletion/request  {email}               → email OTP
  POST /api/public/account-deletion/confirm  {email, code, reason} → deactivate + log request
  GET  /api/admin/account-deletion-requests                        → admin audit list
"""
import base64
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

from fastapi import Body, Depends, HTTPException

logger = logging.getLogger("account_deletion")

OTP_TTL_MIN = 15
MAX_ATTEMPTS = 5


def _now():
    return datetime.now(timezone.utc)


async def _send_otp_email(db, to_email: str, code: str):
    from email.mime.text import MIMEText
    from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service, _branded_template
    unavailable = HTTPException(
        503, "Email service is temporarily unavailable — please contact support@projexino.com to delete your account.")
    token = await _resolve_send_token(db, None)
    if not token:
        raise unavailable
    try:
        token = await _refresh_if_needed(db, token)
        service = _build_gmail_service(token)
        html = _branded_template(
            "Account deletion verification",
            f"<p>You (or someone using your email) requested deletion of your Projexino account.</p>"
            f"<p>Your verification code is:</p>"
            f"<h1 style='letter-spacing:10px;color:#0F2042;font-size:34px;margin:12px 0'>{code}</h1>"
            f"<p>This code expires in {OTP_TTL_MIN} minutes. If you didn't request this, you can safely ignore this email — nothing will happen.</p>",
            "Visit Projexino", "https://projexino.com")
        msg = MIMEText(html, "html")
        msg["Subject"] = "Your Projexino account deletion code"
        msg["From"] = f'"Projexino Accounts" <{token.get("email")}>'
        msg["To"] = to_email
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("OTP email failed: %s", str(e)[:150])
        raise unavailable


def register_account_deletion(api, db, get_current_user):

    @api.post("/public/account-deletion/request")
    async def request_deletion(payload: Dict[str, Any] = Body(default={})):
        email = str(payload.get("email") or "").strip().lower()
        if not email or "@" not in email:
            raise HTTPException(400, "Enter a valid email address")
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "disabled": 1})
        generic = {"ok": True, "message": "If an account exists for this email, a verification code has been sent."}
        if not user or user.get("disabled"):
            return generic
        code = f"{random.randint(0, 999999):06d}"
        await db.account_deletion_otps.update_one(
            {"email": email},
            {"$set": {"email": email, "code": code, "attempts": 0,
                      "expires_at": (_now() + timedelta(minutes=OTP_TTL_MIN)).isoformat(),
                      "created_at": _now().isoformat()}},
            upsert=True)
        await _send_otp_email(db, email, code)
        return generic

    @api.post("/public/account-deletion/confirm")
    async def confirm_deletion(payload: Dict[str, Any] = Body(default={})):
        email = str(payload.get("email") or "").strip().lower()
        code = str(payload.get("code") or "").strip()
        reason = str(payload.get("reason") or "").strip()[:500]
        rec = await db.account_deletion_otps.find_one({"email": email}, {"_id": 0})
        if not rec:
            raise HTTPException(400, "No verification code was requested for this email")
        if rec.get("attempts", 0) >= MAX_ATTEMPTS:
            raise HTTPException(429, "Too many attempts — request a new code")
        if _now().isoformat() > rec.get("expires_at", ""):
            raise HTTPException(400, "Code expired — request a new one")
        if code != rec.get("code"):
            await db.account_deletion_otps.update_one({"email": email}, {"$inc": {"attempts": 1}})
            raise HTTPException(400, "Incorrect code")
        user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1, "role": 1})
        if not user:
            raise HTTPException(404, "Account not found")
        now = _now().isoformat()
        await db.users.update_one(
            {"email": email},
            {"$set": {"disabled": True, "deletion_requested_at": now, "deletion_reason": reason}})
        await db.account_deletion_requests.insert_one({
            "id": uuid.uuid4().hex, "user_id": user["id"], "email": email,
            "name": user.get("name", ""), "role": user.get("role", ""),
            "reason": reason, "status": "pending_purge",
            "requested_at": now,
            "purge_by": (_now() + timedelta(days=30)).isoformat(),
        })
        await db.account_deletion_otps.delete_one({"email": email})
        try:
            from notif_engine import push_in_app
            admins = await db.users.find(
                {"role": {"$in": ["admin", "super_admin"]}, "disabled": {"$ne": True}},
                {"_id": 0, "id": 1}).to_list(20)
            for a in admins:
                await push_in_app(
                    db, user_id=a["id"], kind="system", title="🗑️ Account deletion requested",
                    message=f"{user.get('name') or email} ({email}) confirmed account deletion. Account deactivated — purge personal data within 30 days.",
                    link="/app/settings")
        except Exception:
            pass
        return {"ok": True, "message": "Your account has been deactivated. All personal data will be permanently deleted within 30 days."}

    @api.get("/admin/account-deletion-requests")
    async def list_deletion_requests(user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admins only")
        return await db.account_deletion_requests.find({}, {"_id": 0}).sort("requested_at", -1).to_list(200)
