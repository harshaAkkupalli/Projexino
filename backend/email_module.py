"""
Email module — Gmail OAuth + email templates + send + AI template generator.

Endpoints (all under /api):
  GET  /oauth/gmail/login           — start OAuth (admin only); returns Google consent URL
  GET  /oauth/gmail/callback        — Google redirects here; saves tokens; redirects to /app/settings
  GET  /email/status                — has the workspace connected Gmail?
  DELETE /email/disconnect          — revoke + delete saved tokens
  GET  /email/templates             — list templates
  POST /email/templates              — create template
  PATCH /email/templates/{id}       — update template
  DELETE /email/templates/{id}      — delete
  POST /email/templates/ai-generate — AI-generate full HTML from a prompt
  POST /email/send                  — send via gmail with body or template_id + variables
"""
from __future__ import annotations

import os
import re
import uuid
import base64
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
import mimetypes

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, EmailStr

logger = logging.getLogger("projexino.email")

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.compose",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GMAIL_REDIRECT_URI = os.environ.get("GMAIL_REDIRECT_URI", "")
FRONTEND_URL = os.environ.get("REACT_APP_BACKEND_URL", "")
WORKSPACE_KEY = "workspace"  # single tenant key in db.email_tokens

# Default templates seeded on first run
DEFAULT_TEMPLATES = [
    {
        "slug": "welcome_employee",
        "name": "Welcome new employee",
        "subject": "Welcome to Projexino, {{name}} 🎉",
        "category": "onboarding",
    },
    {
        "slug": "welcome_intern",
        "name": "Welcome new intern",
        "subject": "Welcome to the Projexino programme, {{name}}",
        "category": "onboarding",
    },
    {
        "slug": "task_assigned",
        "name": "Task assigned",
        "subject": "📋 New task assigned: {{task_title}}",
        "category": "task",
    },
    {
        "slug": "project_assigned",
        "name": "Project assigned",
        "subject": "🚀 You've been added to project: {{project_name}}",
        "category": "project",
    },
    {
        "slug": "badge_awarded",
        "name": "Badge awarded",
        "subject": "🏆 You earned the {{badge_name}} badge!",
        "category": "recognition",
    },
    {
        "slug": "issue_assigned",
        "name": "Issue / error assigned",
        "subject": "🛠️ Action needed: {{issue_title}}",
        "category": "issue",
    },
    {
        "slug": "document_verified",
        "name": "Document verified",
        "subject": "✅ Your {{doc_type}} has been verified",
        "category": "document",
    },
    {
        "slug": "document_rejected",
        "name": "Document needs attention",
        "subject": "⚠️ Please re-upload your {{doc_type}}",
        "category": "document",
    },
    {
        "slug": "invoice_send",
        "name": "Invoice — send to client",
        "subject": "Invoice {{invoice_no}} from {{company}} — {{amount}}",
        "category": "finance",
        "variables_hint": "client_name, invoice_no, project_name, amount, due_date, currency, company, extra_message",
        "body_html": """
        <p>Hi {{client_name}},</p>
        <p>Please find attached invoice <b>{{invoice_no}}</b> for our work on <b>{{project_name}}</b>.</p>
        <table style="width:100%;background:#FFF7ED;border-radius:12px;padding:18px;margin:14px 0;border-left:4px solid #F97316">
          <tr><td>
            <div style="font-size:11px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.18em">Amount due</div>
            <div style="font-size:24px;color:#F97316;font-weight:800;margin-top:4px">{{amount}}</div>
            <div style="font-size:13px;color:#475569;margin-top:6px">Due {{due_date}}</div>
          </td></tr>
        </table>
        <p>{{extra_message}}</p>
        <p style="color:#64748B;font-size:13px;margin-top:18px">Bank transfer is preferred; please reference the invoice number with your payment. Reply to this email if you have any questions.</p>
        <p style="color:#64748B;font-size:13px">Thank you for partnering with {{company}}.</p>
        """,
    },
    {
        "slug": "payment_reminder",
        "name": "Payment reminder",
        "subject": "Friendly reminder — outstanding balance on {{project_name}}",
        "category": "finance",
        "variables_hint": "client_name, project_name, outstanding, percent_paid, message, company",
        "body_html": """
        <p>Hi {{client_name}},</p>
        <p>This is a friendly nudge — there's still <b style="color:#F97316">{{outstanding}}</b> outstanding
        on <b>{{project_name}}</b>. So far, you've cleared {{percent_paid}}% of the locked budget — thank you for that.</p>
        <p>{{message}}</p>
        <p style="color:#64748B;font-size:13px">Let us know if you'd like a fresh invoice or want to discuss a revised schedule.
        We're happy to help.</p>
        <p style="color:#64748B;font-size:13px">Warm regards,<br/>{{company}}</p>
        """,
    },
]

def _projexino_logo_absolute() -> str:
    """Resolve the self-hosted logo to an absolute URL for outbound emails.
    Recipient email clients cannot resolve relative paths — always absolute here."""
    base = (os.environ.get("PUBLIC_FRONTEND_URL")
            or os.environ.get("REACT_APP_BACKEND_URL")
            or "").rstrip("/")
    return f"{base}/projexino-logo.png" if base else "/projexino-logo.png"


PROJEXINO_BRAND = {
    "logo_url": _projexino_logo_absolute(),
    "primary": "#F97316",
    "navy": "#0F2042",
    "accent": "#A855F7",
    "company": "Projexino Solutions Pvt Ltd",
    "tagline": "Engineering the Future of Operations",
    "website": os.environ.get("PUBLIC_FRONTEND_URL", "https://projexino.com"),
}

LOGO_FILE_CANDIDATES = (
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "projexino-logo.png"),
    "/app/frontend/public/projexino-logo.png",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "public", "projexino-logo.png"),
)
_LOGO_SRC_RE = re.compile(
    r'(?:\{\{\s*logo_url\s*\}\}|https?://[^"\'\s>]*projexino-logo\.png[^"\'\s>]*|(?<=[("\'])/projexino-logo\.png|cid:pjxlogo)'
)
# Refreshed brand header — warm cream band, logo PNG directly on it, visible tagline
EMAIL_BRAND_HEADER = (
    '<td style="background:#FFF7ED;border-top:6px solid #0F2042;'
    'border-bottom:3px solid #F97316;padding:22px 32px">'
    '<img src="{src}" alt="Projexino" height="40" style="display:block;max-width:230px">'
    '<div style="font-family:Arial,sans-serif;font-size:10px;font-weight:700;'
    'letter-spacing:0.14em;color:#475569;margin-top:8px">'
    'ENGINEERING STUDIOS &middot; DEDICATED TEAMS &middot; AI WORKFLOWS</div></td>'
)


def _logo_cid_swap(body_html: str):
    """Swap logo URL references for an inline CID attachment so the logo ALWAYS
    renders in recipient inboxes (Gmail/Outlook) regardless of hosting/domain.
    Returns (body_html, MIMEImage|None)."""
    body_html = body_html or ""
    if not _LOGO_SRC_RE.search(body_html):
        return body_html, None
    try:
        from email.mime.image import MIMEImage
        data = None
        for p in LOGO_FILE_CANDIDATES:
            try:
                with open(p, "rb") as f:
                    data = f.read()
                break
            except Exception:
                continue
        if not data:
            raise FileNotFoundError("logo file not found")
        img = MIMEImage(data, _subtype="png")
        img.add_header("Content-ID", "<pjxlogo>")
        img.add_header("Content-Disposition", "inline", filename="projexino-logo.png")
        return _LOGO_SRC_RE.sub("cid:pjxlogo", body_html), img
    except Exception:
        return _LOGO_SRC_RE.sub(PROJEXINO_BRAND["logo_url"], body_html), None



def _portal_url(path: str = "/login") -> str:
    base = (os.environ.get("PUBLIC_FRONTEND_URL") or "https://projexino.com").rstrip("/")
    return f"{base}{path}"

def _branded_template(title: str, body_html: str, cta_label: str = "", cta_url: str = "") -> str:
    """Wrap any inner HTML with the Projexino branded email shell."""
    cta_html = ""
    if cta_label and cta_url:
        cta_html = (
            f'<div style="text-align:center;margin:28px 0">'
            f'<a href="{cta_url}" style="display:inline-block;padding:12px 28px;background:{PROJEXINO_BRAND["primary"]};color:#FFFFFF;text-decoration:none;border-radius:10px;font-weight:bold;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:0.05em">{cta_label}</a>'
            f'</div>'
        )
    return f"""\
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFF7ED;font-family:Inter,Helvetica,Arial,sans-serif;color:#0F172A">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF7ED">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 8px 32px rgba(15,32,66,0.08)">
        <tr>{EMAIL_BRAND_HEADER.format(src=PROJEXINO_BRAND['logo_url'])}</tr>
        <tr><td style="padding:36px 36px 12px 36px">
          <h1 style="margin:0 0 8px 0;font-size:24px;color:{PROJEXINO_BRAND['navy']};font-weight:600;line-height:1.3">{title}</h1>
        </td></tr>
        <tr><td style="padding:0 36px 24px 36px;font-size:15px;line-height:1.6;color:#334155">{body_html}</td></tr>
        <tr><td style="padding:0 36px 32px 36px">{cta_html}</td></tr>
        <tr><td style="background:#F8FAFC;padding:20px 36px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;line-height:1.6">
          <div style="font-weight:600;color:{PROJEXINO_BRAND['navy']}">{PROJEXINO_BRAND['company']}</div>
          <div>{PROJEXINO_BRAND['tagline']}</div>
          <div style="margin-top:8px"><a href="{PROJEXINO_BRAND['website']}" style="color:{PROJEXINO_BRAND['primary']};text-decoration:none">{PROJEXINO_BRAND['website']}</a> &nbsp;·&nbsp; © 2026 Projexino. All rights reserved.</div>
        </td></tr>
      </table>
      <div style="margin-top:14px;font-size:11px;color:#94A3B8">You received this email from your Projexino workspace.</div>
    </td></tr>
  </table>
</body></html>"""


def _render_vars(text: str, variables: Dict[str, Any]) -> str:
    """Replace {{key}} placeholders with values from `variables`. Missing keys → blank."""
    def repl(m):
        return str(variables.get(m.group(1).strip(), ""))
    return re.sub(r"\{\{\s*([\w_]+)\s*\}\}", repl, text or "")


# --------- Pydantic models ---------

class TemplateIn(BaseModel):
    slug: Optional[str] = ""
    name: str = Field(..., min_length=1, max_length=120)
    subject: str = Field(..., min_length=1, max_length=200)
    body_html: str = Field(..., min_length=1)
    category: Optional[str] = "general"
    variables_hint: Optional[List[str]] = []


class TemplatePatch(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    category: Optional[str] = None
    variables_hint: Optional[List[str]] = None


class AiTemplateIn(BaseModel):
    prompt: str = Field(..., min_length=4, max_length=2000)
    name: Optional[str] = ""
    save: bool = False


class AiRefineIn(BaseModel):
    body_html: str
    instruction: str = Field(..., min_length=1, max_length=2000)
    subject: Optional[str] = None


class SendEmailIn(BaseModel):
    to: List[str] = Field(..., min_length=1)
    cc: Optional[List[str]] = []
    bcc: Optional[List[str]] = []
    subject: Optional[str] = ""
    body_html: Optional[str] = ""
    template_id: Optional[str] = ""
    variables: Optional[Dict[str, Any]] = {}
    from_name: Optional[str] = ""
    reply_to: Optional[str] = ""
    from_token_id: Optional[str] = ""


class AttachmentIn(BaseModel):
    filename: str = Field(..., min_length=1, max_length=200)
    content_type: Optional[str] = ""
    data_b64: str = Field(..., min_length=4)


ATTACH_ALLOWED_EXT = {"png", "jpg", "jpeg", "webp", "gif", "pdf", "zip",
                      "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"}
ATTACH_MAX_FILE = 10 * 1024 * 1024   # 10 MB per file
ATTACH_MAX_TOTAL = 20 * 1024 * 1024  # 20 MB per template (Gmail cap is 25 MB)


# --------- Gmail token storage helpers ---------

async def _get_default_token(db) -> Optional[dict]:
    """Get default Gmail account. Prefers {default: True} → legacy {id: 'workspace'} → first account."""
    t = await db.email_tokens.find_one({"default": True}, {"_id": 0})
    if t:
        return t
    t = await db.email_tokens.find_one({"id": WORKSPACE_KEY}, {"_id": 0})
    if t:
        return t
    return await db.email_tokens.find_one({}, {"_id": 0}, sort=[("connected_at", 1)])


async def _get_token_by_id(db, token_id: str) -> Optional[dict]:
    return await db.email_tokens.find_one({"id": token_id}, {"_id": 0})


async def _resolve_send_token(db, from_token_id: Optional[str] = None) -> Optional[dict]:
    """Used by send endpoints. None → default account."""
    if from_token_id:
        t = await _get_token_by_id(db, from_token_id)
        if t:
            return t
    return await _get_default_token(db)


async def _get_tokens(db) -> Optional[dict]:
    """Back-compat alias used by older code paths."""
    return await _get_default_token(db)


async def _save_tokens(db, creds_dict: dict, profile: dict):
    now = datetime.now(timezone.utc)
    doc = {
        "id": WORKSPACE_KEY,
        "access_token": creds_dict["token"],
        "refresh_token": creds_dict.get("refresh_token") or "",
        "expires_at": (now + timedelta(seconds=creds_dict.get("expires_in", 3500))).isoformat(),
        "scope": " ".join(creds_dict.get("scopes") or GMAIL_SCOPES),
        "email": profile.get("email", ""),
        "name": profile.get("name", ""),
        "picture": profile.get("picture", ""),
        "from_name": doc_get_existing_from_name(db) if False else "",
        "reply_to": "",
        "connected_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.email_tokens.update_one({"id": WORKSPACE_KEY}, {"$set": doc}, upsert=True)


def doc_get_existing_from_name(db):
    return ""  # placeholder kept for symmetry; real preserve is handled in patch endpoint


async def _refresh_if_needed(db, token: dict) -> dict:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request as GoogleRequest

    expires = token.get("expires_at", "")
    needs = True
    if expires:
        try:
            exp = datetime.fromisoformat(expires)
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            needs = datetime.now(timezone.utc) >= exp - timedelta(seconds=60)
        except Exception:
            needs = True
    if not needs:
        return token
    if not token.get("refresh_token"):
        raise HTTPException(401, "Gmail token expired and no refresh_token saved. Reconnect Gmail.")
    creds = Credentials(
        token=token.get("access_token"),
        refresh_token=token["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
    )
    creds.refresh(GoogleRequest())
    await db.email_tokens.update_one(
        {"id": token.get("id", WORKSPACE_KEY)},
        {"$set": {
            "access_token": creds.token,
            "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=3500)).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    token["access_token"] = creds.token
    return token


def _build_gmail_service(token: dict):
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build
    creds = Credentials(
        token=token["access_token"],
        refresh_token=token.get("refresh_token") or None,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=GMAIL_SCOPES,
    )
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


async def _seed_templates(db):
    for t in DEFAULT_TEMPLATES:
        existing = await db.email_templates.find_one({"slug": t["slug"]}, {"_id": 0})
        if existing:
            continue
        body_html = _seed_body_for(t["slug"])
        doc = {
            "id": str(uuid.uuid4()),
            "slug": t["slug"],
            "name": t["name"],
            "subject": t["subject"],
            "body_html": body_html,
            "category": t["category"],
            "variables_hint": _seed_vars_for(t["slug"]),
            "is_default": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_templates.insert_one(doc)


def _seed_vars_for(slug: str) -> List[str]:
    return {
        "welcome_employee": ["name", "role", "start_date"],
        "welcome_intern": ["name", "designation", "start_date", "mentor"],
        "task_assigned": ["name", "task_title", "project_name", "deadline", "priority"],
        "project_assigned": ["name", "project_name", "role", "start_date"],
        "badge_awarded": ["name", "badge_name", "reason"],
        "issue_assigned": ["name", "issue_title", "priority", "url"],
        "document_verified": ["name", "doc_type"],
        "document_rejected": ["name", "doc_type", "reason"],
    }.get(slug, [])


def _seed_body_for(slug: str) -> str:
    if slug == "welcome_employee":
        body = '<p>Hi <b>{{name}}</b>,</p><p>Welcome to the team! We\'re excited to have you join us as our new <b>{{role}}</b>, starting <b>{{start_date}}</b>.</p><p>You\'ll find your workspace, projects, and onboarding documents waiting inside the portal. Reach out anytime — we\'re here to help you ramp up.</p>'
        return _branded_template("Welcome to Projexino", body, "Open Portal", _portal_url())
    if slug == "welcome_intern":
        body = '<p>Hi <b>{{name}}</b>,</p><p>A very warm welcome to the Projexino programme as a <b>{{designation}}</b> — starting <b>{{start_date}}</b>. Your mentor will be <b>{{mentor}}</b>.</p><p>Log in to upload your onboarding documents and explore your dashboard.</p>'
        return _branded_template("Welcome to the Projexino Internship Programme", body, "Open Intern Portal", _portal_url())
    if slug == "task_assigned":
        body = '<p>Hi <b>{{name}}</b>,</p><p>A new task has been assigned to you:</p><table style="width:100%;background:#FFF7ED;border-radius:10px;padding:14px;margin:12px 0"><tr><td><b style="color:#F97316">{{task_title}}</b><br><span style="color:#64748B;font-size:13px">Project: {{project_name}} · Due {{deadline}} · Priority {{priority}}</span></td></tr></table>'
        return _branded_template("New task assigned", body, "View Task", _portal_url())
    if slug == "project_assigned":
        body = '<p>Hi <b>{{name}}</b>,</p><p>You have been added to the <b>{{project_name}}</b> project as <b>{{role}}</b>, kickoff <b>{{start_date}}</b>.</p>'
        return _branded_template("You've been added to a project", body, "Open Project", _portal_url())
    if slug == "badge_awarded":
        body = '<p>Hi <b>{{name}}</b>,</p><p>🎉 Congratulations — you\'ve earned the <b style="color:#F97316">{{badge_name}}</b> badge!</p><p style="font-style:italic;color:#475569">"{{reason}}"</p>'
        return _branded_template("🏆 New badge earned!", body, "See Your Badges", _portal_url())
    if slug == "issue_assigned":
        body = '<p>Hi <b>{{name}}</b>,</p><p>An issue has been assigned to you:</p><table style="width:100%;background:#FEF2F2;border-radius:10px;padding:14px;margin:12px 0"><tr><td><b style="color:#EF4444">{{issue_title}}</b><br><span style="color:#64748B;font-size:13px">Priority: {{priority}}</span></td></tr></table>'
        return _branded_template("Action needed", body, "Open Issue", _portal_url())
    if slug == "document_verified":
        body = '<p>Hi <b>{{name}}</b>,</p><p>Your <b>{{doc_type}}</b> has been reviewed and verified. ✓</p>'
        return _branded_template("Document verified", body, "View Documents", _portal_url())
    if slug == "document_rejected":
        body = '<p>Hi <b>{{name}}</b>,</p><p>Your <b>{{doc_type}}</b> needs attention:</p><p style="font-style:italic;background:#FEF2F2;padding:12px;border-radius:10px;color:#991B1B">"{{reason}}"</p><p>Please re-upload a corrected copy at your convenience.</p>'
        return _branded_template("Please re-upload your document", body, "Re-upload Document", _portal_url())
    return _branded_template("Hello from Projexino", "<p>This is a template.</p>")


# ====================================================================
# Route registration
# ====================================================================

def register_email(api: APIRouter, db, get_current_user):

    # ---- OAuth ----
    @api.get("/oauth/gmail/login")
    async def gmail_login(user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        if not (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and GMAIL_REDIRECT_URI):
            raise HTTPException(500, "Gmail credentials not configured on server.")
        from google_auth_oauthlib.flow import Flow
        flow = Flow.from_client_config(
            {"web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }},
            scopes=GMAIL_SCOPES,
            redirect_uri=GMAIL_REDIRECT_URI,
        )
        url, state = flow.authorization_url(access_type="offline", prompt="consent", include_granted_scopes="true")
        # Persist the PKCE code_verifier so the callback can complete the token exchange.
        # Without this the token endpoint returns invalid_grant because the code_challenge
        # generated at login can't be matched without its verifier.
        code_verifier = getattr(flow, "code_verifier", None)
        await db.oauth_states.update_one(
            {"id": "gmail_state"},
            {"$set": {
                "id": "gmail_state",
                "state": state,
                "code_verifier": code_verifier,
                "user_id": user["id"],
                "at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
        return {"auth_url": url}

    @api.get("/oauth/gmail/callback")
    async def gmail_callback(code: str = "", state: str = "", error: str = ""):
        if error:
            return RedirectResponse(f"/app/settings?gmail=error&reason={error}", status_code=302)
        if not (code and state):
            return RedirectResponse("/app/settings?gmail=error&reason=missing_code", status_code=302)
        saved = await db.oauth_states.find_one({"id": "gmail_state"}, {"_id": 0})
        if not saved or saved.get("state") != state:
            return RedirectResponse("/app/settings?gmail=error&reason=bad_state", status_code=302)
        from google_auth_oauthlib.flow import Flow
        import warnings
        try:
            flow = Flow.from_client_config(
                {"web": {
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }},
                scopes=GMAIL_SCOPES,
                redirect_uri=GMAIL_REDIRECT_URI,
                state=state,
            )
            # Restore the PKCE code_verifier saved during /oauth/gmail/login —
            # required because google-auth-oauthlib enables PKCE by default and
            # the token endpoint rejects the exchange without the matching verifier.
            saved_verifier = saved.get("code_verifier")
            if saved_verifier:
                flow.code_verifier = saved_verifier
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                flow.fetch_token(code=code)
            creds = flow.credentials
            # Fetch profile
            from googleapiclient.discovery import build
            svc = build("oauth2", "v2", credentials=creds, cache_discovery=False)
            profile = svc.userinfo().get().execute()
        except Exception as e:
            logger.exception("Gmail OAuth failed: %s", e)
            # Surface a useful reason in the URL so the user sees the actual error
            reason = str(e)[:160].replace(" ", "_").replace("\n", "_")
            return RedirectResponse(f"/app/settings?gmail=error&reason=oauth_failed&detail={reason}", status_code=302)
        # Preserve any existing from_name/reply_to on reconnect
        email_l = (profile.get("email") or "").lower()
        token_id = email_l or WORKSPACE_KEY
        existing = await db.email_tokens.find_one({"id": token_id}, {"_id": 0}) or {}
        now = datetime.now(timezone.utc)
        # Check if there is already at least one account; promote this one as default if not.
        any_default = await db.email_tokens.find_one({"default": True}, {"_id": 0})
        is_default = bool(existing.get("default")) or (any_default is None)
        doc = {
            "id": token_id,
            "access_token": creds.token,
            "refresh_token": creds.refresh_token or existing.get("refresh_token", ""),
            "expires_at": (now + timedelta(seconds=3500)).isoformat(),
            "scope": " ".join(GMAIL_SCOPES),
            "email": profile.get("email", ""),
            "name": profile.get("name", ""),
            "picture": profile.get("picture", ""),
            "from_name": existing.get("from_name") or profile.get("name", ""),
            "reply_to": existing.get("reply_to") or profile.get("email", ""),
            "default": is_default,
            "connected_at": existing.get("connected_at") or now.isoformat(),
            "updated_at": now.isoformat(),
        }
        # Migrate legacy workspace doc if this is a new email-keyed entry
        if token_id != WORKSPACE_KEY:
            legacy = await db.email_tokens.find_one({"id": WORKSPACE_KEY}, {"_id": 0})
            if legacy and legacy.get("email", "").lower() == email_l:
                await db.email_tokens.delete_one({"id": WORKSPACE_KEY})
        await db.email_tokens.update_one({"id": token_id}, {"$set": doc}, upsert=True)
        # If this one is default, ensure no other carries default flag
        if is_default:
            await db.email_tokens.update_many(
                {"id": {"$ne": token_id}}, {"$set": {"default": False}}
            )
        await db.oauth_states.delete_one({"id": "gmail_state"})
        return RedirectResponse("/app/settings?gmail=connected", status_code=302)

    @api.get("/email/status")
    async def email_status(user=Depends(get_current_user)):
        t = await _get_default_token(db)
        if not t:
            return {"connected": False, "accounts": []}
        accts_cur = db.email_tokens.find({}, {"_id": 0, "access_token": 0, "refresh_token": 0}).sort("connected_at", 1)
        accts = await accts_cur.to_list(20)
        return {
            "connected": True,
            "email": t.get("email"),
            "name": t.get("name"),
            "picture": t.get("picture"),
            "from_name": t.get("from_name"),
            "reply_to": t.get("reply_to"),
            "connected_at": t.get("connected_at"),
            "default_id": t.get("id"),
            "accounts": [{
                "id": a.get("id"),
                "email": a.get("email"),
                "name": a.get("name"),
                "picture": a.get("picture"),
                "from_name": a.get("from_name"),
                "reply_to": a.get("reply_to"),
                "default": bool(a.get("default")),
                "connected_at": a.get("connected_at"),
            } for a in accts],
        }

    @api.get("/email/accounts")
    async def email_accounts(user=Depends(get_current_user)):
        accts_cur = db.email_tokens.find({}, {"_id": 0, "access_token": 0, "refresh_token": 0}).sort("connected_at", 1)
        accts = await accts_cur.to_list(20)
        return [{
            "id": a.get("id"),
            "email": a.get("email"),
            "name": a.get("name"),
            "picture": a.get("picture"),
            "from_name": a.get("from_name"),
            "reply_to": a.get("reply_to"),
            "default": bool(a.get("default")),
        } for a in accts]

    @api.post("/email/accounts/{token_id}/default")
    async def set_default_account(token_id: str, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        t = await db.email_tokens.find_one({"id": token_id}, {"_id": 0})
        if not t:
            raise HTTPException(404, "Account not connected")
        await db.email_tokens.update_many({}, {"$set": {"default": False}})
        await db.email_tokens.update_one({"id": token_id}, {"$set": {"default": True}})
        return {"ok": True, "default_id": token_id}

    @api.delete("/email/accounts/{token_id}")
    async def remove_account(token_id: str, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        await db.email_tokens.delete_one({"id": token_id})
        # If we removed the default, promote the oldest remaining one
        any_default = await db.email_tokens.find_one({"default": True})
        if not any_default:
            first = await db.email_tokens.find_one({}, sort=[("connected_at", 1)])
            if first:
                await db.email_tokens.update_one({"id": first["id"]}, {"$set": {"default": True}})
        return {"ok": True}

    @api.patch("/email/status")
    async def email_status_patch(body: dict, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        token_id = body.get("token_id") or (await _get_default_token(db) or {}).get("id")
        if not token_id:
            raise HTTPException(404, "No Gmail account connected")
        updates = {}
        if "from_name" in body and isinstance(body["from_name"], str):
            updates["from_name"] = body["from_name"].strip()[:120]
        if "reply_to" in body and isinstance(body["reply_to"], str):
            updates["reply_to"] = body["reply_to"].strip()[:120]
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.email_tokens.update_one({"id": token_id}, {"$set": updates})
        return await email_status(user)

    @api.delete("/email/disconnect")
    async def email_disconnect(user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        # Back-compat: remove the default account
        t = await _get_default_token(db)
        if t:
            await db.email_tokens.delete_one({"id": t["id"]})
        return {"ok": True}

    # ---- Templates ----
    @api.get("/email/templates")
    async def list_templates(user=Depends(get_current_user)):
        await _seed_templates(db)
        cur = db.email_templates.find({}, {"_id": 0}).sort("category", 1)
        items = await cur.to_list(500)
        counts: Dict[str, int] = {}
        async for row in db.email_template_attachments.aggregate(
            [{"$group": {"_id": "$template_id", "n": {"$sum": 1}}}]
        ):
            counts[row["_id"]] = row["n"]
        for t in items:
            t["attachment_count"] = counts.get(t["id"], 0)
        return items

    @api.post("/email/templates")
    async def create_template(payload: TemplateIn, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        now = datetime.now(timezone.utc).isoformat()
        doc = {
            "id": str(uuid.uuid4()),
            "slug": payload.slug or (re.sub(r"[^a-z0-9_]+", "_", (payload.name or "").lower().strip()))[:60],
            "name": payload.name,
            "subject": payload.subject,
            "body_html": payload.body_html,
            "category": payload.category or "general",
            "variables_hint": payload.variables_hint or [],
            "is_default": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.email_templates.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.patch("/email/templates/{tid}")
    async def patch_template(tid: str, body: TemplatePatch, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        existing = await db.email_templates.find_one({"id": tid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Template not found")
        updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.email_templates.update_one({"id": tid}, {"$set": updates})
        merged = {**existing, **updates}
        merged.pop("_id", None)
        return merged

    @api.delete("/email/templates/{tid}")
    async def delete_template(tid: str, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        await db.email_templates.delete_one({"id": tid, "is_default": {"$ne": True}})
        await db.email_template_attachments.delete_many({"template_id": tid})
        return {"ok": True}

    # --------- Template attachments (sent with every email using the template) ---------

    @api.get("/email/templates/{tid}/attachments")
    async def list_template_attachments(tid: str, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager", "hr"):
            raise HTTPException(403, "Forbidden")
        cur = db.email_template_attachments.find(
            {"template_id": tid}, {"_id": 0, "data_b64": 0}
        ).sort("created_at", 1)
        return await cur.to_list(50)

    @api.post("/email/templates/{tid}/attachments")
    async def add_template_attachment(tid: str, payload: AttachmentIn, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        tpl = await db.email_templates.find_one({"id": tid}, {"_id": 0, "id": 1})
        if not tpl:
            raise HTTPException(404, "Template not found")
        fname = payload.filename.strip()
        ext = fname.rsplit(".", 1)[-1].lower() if "." in fname else ""
        if ext not in ATTACH_ALLOWED_EXT:
            raise HTTPException(400, f"File type .{ext or '?'} not allowed. Allowed: {', '.join(sorted(ATTACH_ALLOWED_EXT))}")
        b64 = payload.data_b64.split(",")[-1]
        try:
            raw = base64.b64decode(b64)
        except Exception:
            raise HTTPException(400, "Invalid file data")
        if len(raw) > ATTACH_MAX_FILE:
            raise HTTPException(400, "Each attachment can be up to 10 MB")
        existing_total = 0
        async for row in db.email_template_attachments.aggregate(
            [{"$match": {"template_id": tid}}, {"$group": {"_id": None, "s": {"$sum": "$size"}}}]
        ):
            existing_total = row.get("s", 0)
        if existing_total + len(raw) > ATTACH_MAX_TOTAL:
            raise HTTPException(400, "Total attachments per template capped at 20 MB (Gmail limit)")
        ctype = payload.content_type or mimetypes.guess_type(fname)[0] or "application/octet-stream"
        doc = {
            "id": str(uuid.uuid4()),
            "template_id": tid,
            "filename": fname,
            "content_type": ctype,
            "size": len(raw),
            "data_b64": b64,
            "uploaded_by": user.get("email", ""),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_template_attachments.insert_one(doc)
        return {k: v for k, v in doc.items() if k not in ("_id", "data_b64")}

    @api.delete("/email/templates/{tid}/attachments/{aid}")
    async def delete_template_attachment(tid: str, aid: str, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        await db.email_template_attachments.delete_one({"id": aid, "template_id": tid})
        return {"ok": True}

    @api.get("/email/templates/{tid}/attachments/{aid}/download")
    async def download_template_attachment(tid: str, aid: str, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager", "hr"):
            raise HTTPException(403, "Forbidden")
        doc = await db.email_template_attachments.find_one({"id": aid, "template_id": tid}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Attachment not found")
        from fastapi.responses import Response as _Resp
        return _Resp(
            content=base64.b64decode(doc["data_b64"]),
            media_type=doc.get("content_type") or "application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{doc["filename"]}"'},
        )

    @api.post("/email/templates/ai-generate")
    async def ai_generate_template(payload: AiTemplateIn, user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        from ai_provider import chat_completion, ai_configured
        if not ai_configured():
            raise HTTPException(500, "AI not configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or EMERGENT_LLM_KEY)")
        try:
            system_msg = (
                "You are an expert HTML email designer for Projexino Solutions. "
                "Generate ONLY the INNER body HTML (no <html>, <head>, or <body> tags) for a transactional email "
                "based on the user's prompt. Use simple inline styles (color, font, padding, background) — no <style> tag, no external CSS. "
                "Use Projexino brand colours: primary #F97316, navy #0F2042, accent #A855F7, background #FFF7ED. "
                "Include {{variable}} placeholders where the prompt implies dynamic content (e.g., {{name}}, {{task_title}}). "
                "Keep paragraphs short, use <p>, <b>, <ul>/<li>, and one <table> if you need to highlight data. "
                "Respond with STRICT JSON: {\"subject\": \"...\", \"body_html\": \"...\", \"variables\": [\"name\", ...], \"name\": \"short label\"}. "
                "Do NOT include the outer email shell — that is added separately."
            )
            raw = await chat_completion(
                system_message=system_msg,
                user_message=payload.prompt,
                session_id=f"email-tpl-{uuid.uuid4()}",
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip("`\n ")
            import json as _json
            parsed = _json.loads(raw)
            inner_body = parsed.get("body_html", "")
            subject = parsed.get("subject", "Projexino update")
            variables = parsed.get("variables", []) or []
            name = payload.name or parsed.get("name") or "AI-generated template"
            wrapped = _branded_template(subject, inner_body, "Open Portal", _portal_url())
        except Exception as e:
            logger.exception("AI template generation failed: %s", e)
            raise HTTPException(502, f"AI generation failed: {str(e)[:200]}")
        tpl = {
            "id": str(uuid.uuid4()),
            "slug": re.sub(r"[^a-z0-9_]+", "_", name.lower().strip())[:60] or f"ai_{uuid.uuid4().hex[:8]}",
            "name": name,
            "subject": subject,
            "body_html": wrapped,
            "category": "ai",
            "variables_hint": variables,
            "is_default": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if payload.save:
            await db.email_templates.insert_one(tpl)
            tpl.pop("_id", None)
        return tpl

    @api.post("/email/templates/ai-refine")
    async def ai_refine_template(payload: AiRefineIn, user=Depends(get_current_user)):
        """Take an existing template body + a natural-language instruction
        and return a refined version. Used by the 'Edit with AI' button."""
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admin only")
        from ai_provider import chat_completion, ai_configured
        if not ai_configured():
            raise HTTPException(500, "AI not configured (set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or EMERGENT_LLM_KEY)")
        try:
            system_msg = (
                "You are an expert HTML email designer for Projexino Solutions. "
                "You will be given an EXISTING inner body HTML and an instruction describing how to refine it. "
                "Apply the instruction (rewrite copy, change layout, add CTA, tighten, etc.) but PRESERVE all existing "
                "{{variable}} placeholders and all <a href=...> links unless the instruction explicitly removes them. "
                "Use inline styles only — no <style> tags, no external CSS. Use Projexino brand colours "
                "(primary #F97316, navy #0F2042, accent #A855F7, background #FFF7ED). "
                "Respond with STRICT JSON: {\"subject\": \"...\", \"body_html\": \"...\", \"variables\": [\"name\", ...]}. "
                "If the instruction doesn't ask for a subject change, you may echo the original subject."
            )
            user_msg = (
                f"INSTRUCTION:\n{payload.instruction}\n\n"
                f"CURRENT SUBJECT:\n{payload.subject or '(no subject)'}\n\n"
                f"CURRENT BODY HTML:\n{payload.body_html}"
            )
            raw = await chat_completion(
                system_message=system_msg,
                user_message=user_msg,
                session_id=f"email-tpl-refine-{uuid.uuid4()}",
            )
            raw = raw.strip()
            if raw.startswith("```"):
                raw = raw.split("```", 2)[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip("`\n ")
            import json as _json
            parsed = _json.loads(raw)
            return {
                "subject": parsed.get("subject") or payload.subject or "",
                "body_html": parsed.get("body_html", payload.body_html),
                "variables": parsed.get("variables", []) or [],
            }
        except Exception as e:
            logger.exception("AI template refine failed: %s", e)
            raise HTTPException(502, f"AI refine failed: {str(e)[:200]}")

    # ---- Send ----
    async def _do_send(*, to: list, subject: str, body_html: str, from_name: str, reply_to: str, user=None, from_token_id: str = None, cc: list = None, bcc: list = None, attachments: list = None):
        cc = cc or []
        bcc = bcc or []
        # Dedupe and drop empty/None values; case-insensitively skip CC/BCC entries already in To
        def _clean(seq):
            out, seen = [], set()
            for e in seq or []:
                if not e: continue
                k = str(e).strip().lower()
                if not k or k in seen: continue
                seen.add(k)
                out.append(str(e).strip())
            return out
        to = _clean(to)
        to_set = {e.lower() for e in to}
        cc = [e for e in _clean(cc) if e.lower() not in to_set]
        cc_set = to_set | {e.lower() for e in cc}
        bcc = [e for e in _clean(bcc) if e.lower() not in cc_set]
        token = await _resolve_send_token(db, from_token_id)
        if not token:
            raise HTTPException(400, "Gmail not connected. Connect from /app/settings first.")
        try:
            token = await _refresh_if_needed(db, token)
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Gmail connection expired — please reconnect your Google account in Settings → Gmail. ({type(e).__name__})")
        service = _build_gmail_service(token)
        sender_email = token.get("email")
        from_header = f'"{from_name}" <{sender_email}>' if from_name else sender_email
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = from_header
        msg["To"] = ", ".join(to)
        if cc:
            msg["Cc"] = ", ".join(cc)
        if reply_to:
            msg["Reply-To"] = reply_to
        # Auto-brand: manual/blank drafts get the full branded shell (logo header + footer)
        body = body_html or ""
        if ("projexino-logo" not in body and "{{logo_url}}" not in body
                and not re.search(r"<html|<body", body, re.I)):
            body = _branded_template(subject or "Projexino", body)
        body, logo_part = _logo_cid_swap(body)
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "html"))
        msg.attach(alt)
        if logo_part:
            msg.attach(logo_part)
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        try:
            sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        except Exception as e:
            logger.exception("Gmail send failed: %s", e)
            raise HTTPException(502, f"Gmail send failed: {str(e)[:200]}")
        log = {
            "id": str(uuid.uuid4()),
            "to": to,
            "cc": cc,
            "bcc": bcc,
            "subject": subject,
            "from": from_header,
            "reply_to": reply_to,
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "attachments": [a["filename"] for a in (attachments or [])],
            "sent_by": (user or {}).get("name", ""),
            "sent_by_email": (user or {}).get("email", ""),
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.email_log.insert_one(log)
        log.pop("_id", None)
        return log

    @api.post("/email/send")
    async def email_send(payload: SendEmailIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        subject = payload.subject or ""
        body_html = payload.body_html or ""
        if payload.template_id:
            tpl = await db.email_templates.find_one({"id": payload.template_id}, {"_id": 0})
            if not tpl:
                raise HTTPException(404, "Template not found")
            subject = subject or tpl.get("subject", "")
            body_html = body_html or tpl.get("body_html", "")
        if not subject or not body_html:
            raise HTTPException(400, "subject + body_html (or template_id) required")
        # Render variables
        vars_ = payload.variables or {}
        subject = _render_vars(subject, vars_)
        body_html = _render_vars(body_html, vars_)
        # If body_html lacks the brand wrapper, wrap it for visual consistency.
        if "<html" not in body_html.lower():
            body_html = _branded_template(subject, body_html)
        from_token_id = getattr(payload, "from_token_id", None)
        token = await _resolve_send_token(db, from_token_id) or {}
        from_name = payload.from_name or token.get("from_name") or "Projexino"
        reply_to = payload.reply_to or token.get("reply_to") or token.get("email", "")
        # HR-sent mails always CC every super admin
        cc_list = list(payload.cc or [])
        if user.get("role") == "hr":
            sa = await db.users.find({"role": "super_admin"}, {"_id": 0, "email": 1}).to_list(10)
            seen = {e.lower() for e in (payload.to or [])} | {e.lower() for e in cc_list}
            for a in sa:
                em = (a.get("email") or "").lower()
                if em and em not in seen:
                    cc_list.append(a["email"])
                    seen.add(em)
        # Template attachments ride along on every send that uses the template
        attachments = []
        if payload.template_id:
            adocs = await db.email_template_attachments.find(
                {"template_id": payload.template_id}, {"_id": 0}
            ).sort("created_at", 1).to_list(50)
            for a in adocs:
                try:
                    attachments.append({
                        "filename": a["filename"],
                        "content_type": a.get("content_type"),
                        "data": base64.b64decode(a["data_b64"]),
                    })
                except Exception:
                    logger.warning("Skipping corrupt attachment %s", a.get("id"))
        log = await _do_send(
            to=payload.to, subject=subject, body_html=body_html,
            from_name=from_name, reply_to=reply_to, user=user, from_token_id=from_token_id,
            cc=cc_list, bcc=payload.bcc or [], attachments=attachments or None,
        )
        return log

    @api.get("/email/log")
    async def email_log_list(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        cur = db.email_log.find({}, {"_id": 0}).sort("sent_at", -1).limit(100)
        return await cur.to_list(100)
