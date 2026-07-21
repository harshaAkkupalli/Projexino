"""
outreach.py — Projexino internal Lead Outreach & Sales Engagement.

Delivery 1 scope:
  • Leads CRUD + CSV import + dedupe + bulk ops
  • Campaigns CRUD + launch (queues emails via existing Gmail OAuth)
  • Reuses existing email_templates and gmail_tokens

Reserved for later deliveries (Group C):
  • Tracking pixels + click tracking + engagement scoring
  • Drip sequences (D1/D4/D8/D15)
  • Kanban pipeline + activity timeline
  • AI cold-email writer + Reports

Collections:
  outreach_leads:     {id, first_name, last_name, email, company, website, industry,
                       country, phone, linkedin_url, source, tags[], notes,
                       status (cold|warm|hot|qualified|unqualified),
                       pipeline_stage, score, last_contact_at, created_at, ...}
  outreach_campaigns: {id, name, type, status (draft|scheduled|active|paused|completed),
                       template_id, audience (filter/lead_ids), from_token_id,
                       throttle_per_min, scheduled_at, stats {to,sent,failed,opened,clicked,replied},
                       created_at, created_by, ...}
  outreach_events:    {id, lead_id, campaign_id, kind (sent|opened|clicked|replied|bounced),
                       at, meta}
"""
from __future__ import annotations
import base64
import csv
import io
import re
import httpx
import uuid
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from pydantic import BaseModel, EmailStr, Field

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SAFE_FIELDS = {
    "first_name", "last_name", "email", "company", "website", "industry",
    "country", "phone", "linkedin_url", "source", "tags", "notes",
    "status", "pipeline_stage", "score",
}
PIPELINE_STAGES = [
    "new_lead", "contacted", "engaged", "meeting_scheduled",
    "proposal_sent", "negotiation", "won", "lost",
]
LEAD_STATUSES = ["cold", "warm", "hot", "qualified", "unqualified"]
CAMPAIGN_TYPES = ["cold_outreach", "follow_up", "partnership", "re_engagement"]
CAMPAIGN_STATUSES = ["draft", "scheduled", "active", "paused", "completed"]


def _html_to_plain(html: str) -> str:
    import html as _h
    txt = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html or "", flags=re.S | re.I)
    txt = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</tr>|</h[1-6]>", "\n", txt, flags=re.I)
    txt = re.sub(r"<[^>]+>", "", txt)
    txt = _h.unescape(txt)
    return re.sub(r"\n{3,}", "\n\n", txt).strip()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ===== Pydantic =====
class LeadIn(BaseModel):
    first_name: Optional[str] = ""
    last_name: Optional[str] = ""
    email: EmailStr
    company: Optional[str] = ""
    website: Optional[str] = ""
    industry: Optional[str] = ""
    country: Optional[str] = ""
    phone: Optional[str] = ""
    linkedin_url: Optional[str] = ""
    source: Optional[str] = "manual"
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = ""
    status: Optional[str] = "cold"
    pipeline_stage: Optional[str] = "new_lead"


class LeadPatch(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    company: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    linkedin_url: Optional[str] = None
    source: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    pipeline_stage: Optional[str] = None
    score: Optional[int] = None


class CampaignIn(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    type: str = "cold_outreach"
    template_id: Optional[str] = ""
    subject: Optional[str] = ""
    body_html: Optional[str] = ""
    from_token_id: Optional[str] = ""  # which Gmail account
    audience: Dict[str, Any] = Field(default_factory=dict)  # {kind: "lead_ids"|"filter", lead_ids: [], filter: {...}}
    throttle_per_min: int = 20
    scheduled_at: Optional[str] = ""


class CampaignPatch(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    template_id: Optional[str] = None
    subject: Optional[str] = None
    body_html: Optional[str] = None
    from_token_id: Optional[str] = None
    audience: Optional[Dict[str, Any]] = None
    throttle_per_min: Optional[int] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None


class SequenceStepIn(BaseModel):
    day_offset: int = Field(..., ge=0, le=365)
    subject: str
    body_html: str


class SequenceIn(BaseModel):
    name: str
    steps: List[SequenceStepIn]
    from_token_id: Optional[str] = ""


class GMapsDiscoveryIn(BaseModel):
    """Free-text Google Maps lead search.

    Accepts a natural-language query like "dentists in Mumbai" or
    "law firms in London without website". The `no_website_only` flag, when
    true, filters server-side to leads where Google has no `websiteUri`.
    The endpoint also auto-imports results into `outreach_leads`
    (source="google_maps") and dedupes against existing emails / place_ids.
    """
    query: str = Field(..., min_length=2, max_length=300)
    no_website_only: bool = False
    page_token: Optional[str] = None
    region_code: Optional[str] = "IN"
    language_code: Optional[str] = "en"
    page_size: int = Field(default=20, ge=5, le=20)
    auto_import: bool = True


def register_outreach(api: APIRouter, db, get_current_user):

    async def _require_priv(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "manager", "hr"):
            raise HTTPException(403, "Outreach is admin / manager / HR only")
        return user

    # ===== Leads =====
    @api.get("/outreach/leads")
    async def list_leads(
        q: Optional[str] = "",
        status: Optional[str] = None,
        stage: Optional[str] = None,
        tag: Optional[str] = None,
        industry: Optional[str] = None,
        country: Optional[str] = None,
        limit: int = 1000,
        user=Depends(_require_priv),
    ):
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status
        if stage:
            query["pipeline_stage"] = stage
        if tag:
            query["tags"] = tag
        if industry:
            query["industry"] = {"$regex": f"^{re.escape(industry)}$", "$options": "i"}
        if country:
            query["country"] = {"$regex": f"^{re.escape(country)}$", "$options": "i"}
        if q:
            qs = q.strip()
            query["$or"] = [
                {"first_name": {"$regex": qs, "$options": "i"}},
                {"last_name": {"$regex": qs, "$options": "i"}},
                {"email": {"$regex": qs, "$options": "i"}},
                {"company": {"$regex": qs, "$options": "i"}},
            ]
        cur = db.outreach_leads.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
        items = await cur.to_list(limit)
        # Summary
        total = await db.outreach_leads.count_documents({})
        return {"items": items, "total": total, "filtered": len(items)}

    @api.post("/outreach/leads")
    async def create_lead(payload: LeadIn, user=Depends(_require_priv)):
        email = payload.email.lower().strip()
        existing = await db.outreach_leads.find_one({"email": email}, {"_id": 0, "id": 1})
        if existing:
            raise HTTPException(400, f"Lead with email {email} already exists")
        doc = payload.model_dump()
        doc["email"] = email
        doc.update({
            "id": uuid.uuid4().hex,
            "score": 0,
            "last_contact_at": "",
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
        })
        await db.outreach_leads.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.patch("/outreach/leads/{lid}")
    async def patch_lead(lid: str, payload: LeadPatch, user=Depends(_require_priv)):
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not upd:
            raise HTTPException(400, "Nothing to update")
        if "email" in upd:
            upd["email"] = upd["email"].lower().strip()
        upd["updated_at"] = _now()
        r = await db.outreach_leads.update_one({"id": lid}, {"$set": upd})
        if not r.matched_count:
            raise HTTPException(404, "Lead not found")
        doc = await db.outreach_leads.find_one({"id": lid}, {"_id": 0})
        return doc

    @api.delete("/outreach/leads/{lid}")
    async def delete_lead(lid: str, user=Depends(_require_priv)):
        r = await db.outreach_leads.delete_one({"id": lid})
        if not r.deleted_count:
            raise HTTPException(404, "Lead not found")
        return {"ok": True}

    @api.post("/outreach/leads/bulk")
    async def bulk_lead_action(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Bulk delete / tag / change stage on multiple leads.
        payload: {action: "delete"|"tag"|"untag"|"stage"|"status", ids: [..], value?: any}
        """
        action = payload.get("action")
        ids = payload.get("ids") or []
        if action not in ("delete", "tag", "untag", "stage", "status"):
            raise HTTPException(400, "Unknown action")
        if not ids:
            raise HTTPException(400, "ids required")
        if action == "delete":
            r = await db.outreach_leads.delete_many({"id": {"$in": ids}})
            return {"ok": True, "deleted": r.deleted_count}
        value = payload.get("value")
        if action == "tag":
            r = await db.outreach_leads.update_many({"id": {"$in": ids}}, {"$addToSet": {"tags": value}})
            return {"ok": True, "updated": r.modified_count}
        if action == "untag":
            r = await db.outreach_leads.update_many({"id": {"$in": ids}}, {"$pull": {"tags": value}})
            return {"ok": True, "updated": r.modified_count}
        if action == "stage":
            if value not in PIPELINE_STAGES:
                raise HTTPException(400, "Invalid stage")
            r = await db.outreach_leads.update_many(
                {"id": {"$in": ids}},
                {"$set": {"pipeline_stage": value, "updated_at": _now()}},
            )
            return {"ok": True, "updated": r.modified_count}
        if action == "status":
            if value not in LEAD_STATUSES:
                raise HTTPException(400, "Invalid status")
            r = await db.outreach_leads.update_many(
                {"id": {"$in": ids}},
                {"$set": {"status": value, "updated_at": _now()}},
            )
            return {"ok": True, "updated": r.modified_count}

    @api.post("/outreach/leads/import")
    async def import_leads(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Import leads from raw CSV text (or array of objects).
        payload: {csv_text?: str, rows?: [{...}], default_source?: str}
        Auto-dedupes by email; idempotent.
        Returns: {created, skipped (duplicates), failed (invalid email), total}
        """
        rows: List[Dict[str, Any]] = list(payload.get("rows") or [])
        csv_text = (payload.get("csv_text") or "").strip()
        default_source = payload.get("default_source") or "csv_import"
        if csv_text:
            try:
                reader = csv.DictReader(io.StringIO(csv_text))
                rows.extend([{k.strip().lower(): (v or "").strip() for k, v in r.items()} for r in reader if r])
            except Exception as e:
                raise HTTPException(400, f"CSV parse error: {str(e)[:200]}")
        if not rows:
            raise HTTPException(400, "Nothing to import")

        # Pre-fetch existing emails to dedupe in one query
        candidate_emails = sorted({(r.get("email") or "").lower().strip() for r in rows if r.get("email")})
        existing_emails = set()
        if candidate_emails:
            cur = db.outreach_leads.find(
                {"email": {"$in": candidate_emails}}, {"_id": 0, "email": 1}
            )
            existing_emails = {(d.get("email") or "").lower() async for d in cur}

        FIELD_MAP = {
            "first name": "first_name", "firstname": "first_name", "first_name": "first_name", "fname": "first_name",
            "last name": "last_name", "lastname": "last_name", "last_name": "last_name", "lname": "last_name",
            "email": "email", "e-mail": "email",
            "company": "company", "company name": "company", "organization": "company",
            "website": "website", "site": "website",
            "industry": "industry", "vertical": "industry",
            "country": "country",
            "phone": "phone", "mobile": "phone", "phone number": "phone",
            "linkedin": "linkedin_url", "linkedin url": "linkedin_url", "linkedin_url": "linkedin_url",
            "source": "source", "lead source": "source",
            "tags": "tags",
            "notes": "notes",
            "status": "status",
        }

        created, skipped, failed, dedupe_within_import = 0, 0, 0, set()
        docs: List[Dict[str, Any]] = []
        now = _now()
        for r in rows:
            normalised: Dict[str, Any] = {}
            for k, v in (r or {}).items():
                key = FIELD_MAP.get(str(k).lower().strip())
                if not key:
                    continue
                normalised[key] = v
            email = (normalised.get("email") or "").lower().strip()
            if not email or not EMAIL_RE.match(email):
                failed += 1
                continue
            if email in existing_emails or email in dedupe_within_import:
                skipped += 1
                continue
            dedupe_within_import.add(email)
            tags_raw = normalised.get("tags") or ""
            tags = [t.strip() for t in re.split(r"[,;|]", tags_raw) if t.strip()] if isinstance(tags_raw, str) else (tags_raw or [])
            docs.append({
                "id": uuid.uuid4().hex,
                "first_name": normalised.get("first_name") or "",
                "last_name": normalised.get("last_name") or "",
                "email": email,
                "company": normalised.get("company") or "",
                "website": normalised.get("website") or "",
                "industry": normalised.get("industry") or "",
                "country": normalised.get("country") or "",
                "phone": normalised.get("phone") or "",
                "linkedin_url": normalised.get("linkedin_url") or "",
                "source": normalised.get("source") or default_source,
                "tags": tags,
                "notes": normalised.get("notes") or "",
                "status": normalised.get("status") if normalised.get("status") in LEAD_STATUSES else "cold",
                "pipeline_stage": "new_lead",
                "score": 0,
                "last_contact_at": "",
                "created_at": now,
                "updated_at": now,
                "created_by": user.get("email", ""),
            })
            created += 1
        if docs:
            await db.outreach_leads.insert_many(docs)
        return {"created": created, "skipped_duplicates": skipped, "failed_invalid": failed,
                "total": len(rows)}

    # ===== Campaigns =====
    @api.get("/outreach/campaigns")
    async def list_campaigns(status: Optional[str] = None, user=Depends(_require_priv)):
        q: Dict[str, Any] = {}
        if status:
            q["status"] = status
        cur = db.outreach_campaigns.find(q, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(500)

    @api.post("/outreach/campaigns")
    async def create_campaign(payload: CampaignIn, user=Depends(_require_priv)):
        if payload.type not in CAMPAIGN_TYPES:
            raise HTTPException(400, "Invalid type")
        if not (payload.template_id or payload.body_html):
            raise HTTPException(400, "Either template_id or body_html is required")
        doc = payload.model_dump()
        doc.update({
            "id": uuid.uuid4().hex,
            "status": "draft",
            "stats": {"to": 0, "sent": 0, "failed": 0, "opened": 0, "clicked": 0, "replied": 0},
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
            "launched_at": "",
            "completed_at": "",
        })
        await db.outreach_campaigns.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.get("/outreach/campaigns/{cid}")
    async def get_campaign(cid: str, user=Depends(_require_priv)):
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        return c

    @api.patch("/outreach/campaigns/{cid}")
    async def patch_campaign(cid: str, payload: CampaignPatch, user=Depends(_require_priv)):
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not upd:
            raise HTTPException(400, "Nothing to update")
        upd["updated_at"] = _now()
        r = await db.outreach_campaigns.update_one({"id": cid}, {"$set": upd})
        if not r.matched_count:
            raise HTTPException(404, "Campaign not found")
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        return c

    @api.delete("/outreach/campaigns/{cid}")
    async def delete_campaign(cid: str, user=Depends(_require_priv)):
        r = await db.outreach_campaigns.delete_one({"id": cid})
        if not r.deleted_count:
            raise HTTPException(404, "Campaign not found")
        return {"ok": True}

    @api.post("/outreach/campaigns/{cid}/clone")
    async def clone_campaign(cid: str, user=Depends(_require_priv)):
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Not found")
        c["id"] = uuid.uuid4().hex
        c["name"] = f"{c.get('name', 'Campaign')} (copy)"
        c["status"] = "draft"
        c["stats"] = {"to": 0, "sent": 0, "failed": 0, "opened": 0, "clicked": 0, "replied": 0}
        c["created_at"] = _now()
        c["updated_at"] = _now()
        c["launched_at"] = ""
        c["completed_at"] = ""
        await db.outreach_campaigns.insert_one(c)
        c.pop("_id", None)
        return c

    async def _resolve_audience(audience: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Resolve a campaign audience descriptor into actual lead docs."""
        kind = (audience or {}).get("kind", "lead_ids")
        if kind == "lead_ids":
            ids = (audience or {}).get("lead_ids") or []
            if not ids:
                return []
            cur = db.outreach_leads.find({"id": {"$in": ids}}, {"_id": 0})
            return await cur.to_list(5000)
        if kind == "lead_list":
            lst_id = (audience or {}).get("lead_list_id") or ""
            if not lst_id:
                return []
            lst = await db.outreach_lead_lists.find_one({"id": lst_id}, {"_id": 0})
            if not lst:
                return []
            ids = lst.get("lead_ids") or []
            if not ids:
                return []
            cur = db.outreach_leads.find({"id": {"$in": ids}}, {"_id": 0})
            return await cur.to_list(5000)
        if kind == "filter":
            f = (audience or {}).get("filter") or {}
            q: Dict[str, Any] = {}
            if f.get("status"):
                q["status"] = f["status"]
            if f.get("pipeline_stage"):
                q["pipeline_stage"] = f["pipeline_stage"]
            if f.get("tag"):
                q["tags"] = f["tag"]
            if f.get("industry"):
                q["industry"] = {"$regex": f"^{re.escape(f['industry'])}$", "$options": "i"}
            if f.get("country"):
                q["country"] = {"$regex": f"^{re.escape(f['country'])}$", "$options": "i"}
            cur = db.outreach_leads.find(q, {"_id": 0})
            return await cur.to_list(5000)
        if kind == "all":
            cur = db.outreach_leads.find({}, {"_id": 0})
            return await cur.to_list(5000)
        return []

    def _personalise(html: str, subject: str, lead: Dict[str, Any]) -> tuple[str, str]:
        """Replace {{FirstName}} / {{LastName}} / {{CompanyName}} / {{Industry}} / {{Country}}."""
        vars_ = {
            "FirstName": (lead.get("first_name") or "").strip() or "there",
            "LastName": (lead.get("last_name") or "").strip(),
            "CompanyName": (lead.get("company") or "").strip() or "your team",
            "Industry": (lead.get("industry") or "").strip(),
            "Country": (lead.get("country") or "").strip(),
            "Email": lead.get("email", ""),
        }
        out_html, out_subj = html, subject
        for k, v in vars_.items():
            out_html = out_html.replace("{{" + k + "}}", v)
            out_subj = out_subj.replace("{{" + k + "}}", v)
        return out_subj, out_html

    # ── Tracking / scoring ────────────────────────────────────────
    SCORE_RULES = {"opened": 5, "clicked": 10, "replied": 25, "meeting_scheduled": 50}
    STATUS_PROMOTION = [(50, "qualified"), (35, "hot"), (15, "warm")]  # score → status

    def _public_base() -> str:
        import os as _os
        return (_os.environ.get("PUBLIC_SITE_URL") or _os.environ.get("REACT_APP_BACKEND_URL") or "https://www.projexino.com").rstrip("/")

    def _inject_tracking(html: str, event_id: str) -> str:
        """Append a 1×1 open-tracking pixel and rewrite every <a href> through
        the public click-tracking redirect, tagged with the campaign event id."""
        base = _public_base()
        # Rewrite hrefs
        def _rw(m):
            quote = m.group(1)
            url = m.group(2)
            if url.startswith("mailto:") or url.startswith("#") or "/api/track/click/" in url:
                return m.group(0)
            from urllib.parse import quote as _q
            return f'href={quote}{base}/api/track/click/{event_id}?url={_q(url, safe="")}{quote}'
        html = re.sub(r'href=(["\'])([^"\']+)\1', _rw, html)
        # Append pixel just before </body> if present, else at the end.
        pixel = (
            f'<img src="{base}/api/track/open/{event_id}" alt="" '
            'width="1" height="1" style="display:none;border:0;outline:none;text-decoration:none" />'
        )
        if "</body>" in html.lower():
            html = re.sub(r"</body>", pixel + "</body>", html, count=1, flags=re.I)
        else:
            html = html + pixel
        return html

    async def _bump_score(lead_id: str, kind: str, campaign_id: Optional[str] = None) -> Dict[str, Any]:
        """Add a scoring event, update the lead's score, auto-promote status,
        and emit a notification to the campaign owner when a hot lead crosses
        the threshold for the first time."""
        delta = SCORE_RULES.get(kind, 0)
        if not delta:
            return {}
        lead = await db.outreach_leads.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            return {}
        prev_score = int(lead.get("score") or 0)
        prev_status = lead.get("status") or "cold"
        new_score = prev_score + delta
        new_status = prev_status
        # First matching threshold wins (descending order)
        for threshold, label in STATUS_PROMOTION:
            if new_score >= threshold:
                new_status = label
                break
        upd = {
            "score": new_score,
            "status": new_status,
            "last_activity_at": _now(),
            "last_activity_kind": kind,
            "updated_at": _now(),
        }
        await db.outreach_leads.update_one({"id": lead_id}, {"$set": upd})
        # In-app notification when a lead becomes "hot" or "qualified" the first
        # time, so the BD team gets a banner toast.
        if new_status != prev_status and new_status in ("hot", "qualified"):
            owner_email = lead.get("created_by") or ""
            if owner_email:
                owner = await db.users.find_one({"email": owner_email}, {"_id": 0, "id": 1})
                if owner:
                    await db.notifications.insert_one({
                        "id": uuid.uuid4().hex,
                        "user_id": owner.get("id"),
                        "type": "lead_hot",
                        "title": f"🔥 Hot lead — {lead.get('first_name') or lead.get('email')}",
                        "body": f"{lead.get('email')} just crossed the {new_status.upper()} threshold (score {new_score}).",
                        "link": f"/app/outreach?lead={lead_id}",
                        "read": False,
                        "created_at": _now(),
                    })
        return {"score": new_score, "prev_score": prev_score, "status": new_status, "prev_status": prev_status}

    # ── Public tracking endpoints (no auth, idempotent) ───────────
    _TRACKING_PIXEL = base64.b64decode(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
    )

    @api.get("/track/open/{event_id}")
    async def track_open(event_id: str):
        from fastapi.responses import Response as _Resp
        ev = await db.outreach_events.find_one({"id": event_id}, {"_id": 0})
        if ev and ev.get("kind") == "sent":
            # Only count the first open for scoring; track every subsequent open
            # for stats. The very first open also writes an "opened" event.
            existing_open = await db.outreach_events.find_one(
                {"campaign_id": ev.get("campaign_id"), "lead_id": ev.get("lead_id"), "kind": "opened"},
                {"_id": 0, "id": 1},
            )
            now = _now()
            await db.outreach_events.insert_one({
                "id": uuid.uuid4().hex,
                "lead_id": ev.get("lead_id"),
                "campaign_id": ev.get("campaign_id"),
                "kind": "opened",
                "at": now,
                "meta": {"parent_event": event_id},
            })
            if not existing_open:
                await _bump_score(ev["lead_id"], "opened", ev.get("campaign_id"))
                if ev.get("campaign_id"):
                    await db.outreach_campaigns.update_one(
                        {"id": ev["campaign_id"]}, {"$inc": {"stats.opened": 1}}
                    )
        return _Resp(content=_TRACKING_PIXEL, media_type="image/gif",
                     headers={"Cache-Control": "no-store, max-age=0"})

    @api.get("/track/click/{event_id}")
    async def track_click(event_id: str, url: str = ""):
        from fastapi.responses import RedirectResponse
        if not url:
            url = "https://www.projexino.com"
        ev = await db.outreach_events.find_one({"id": event_id}, {"_id": 0})
        if ev and ev.get("kind") == "sent":
            existing_click = await db.outreach_events.find_one(
                {"campaign_id": ev.get("campaign_id"), "lead_id": ev.get("lead_id"), "kind": "clicked"},
                {"_id": 0, "id": 1},
            )
            await db.outreach_events.insert_one({
                "id": uuid.uuid4().hex,
                "lead_id": ev.get("lead_id"),
                "campaign_id": ev.get("campaign_id"),
                "kind": "clicked",
                "at": _now(),
                "meta": {"url": url, "parent_event": event_id},
            })
            if not existing_click:
                await _bump_score(ev["lead_id"], "clicked", ev.get("campaign_id"))
                if ev.get("campaign_id"):
                    await db.outreach_campaigns.update_one(
                        {"id": ev["campaign_id"]}, {"$inc": {"stats.clicked": 1}}
                    )
        return RedirectResponse(url=url, status_code=302)

    # Expose helpers to other endpoints
    _bump_score_fn = _bump_score
    _inject_tracking_fn = _inject_tracking

    @api.post("/outreach/campaigns/{cid}/launch")
    async def launch_campaign(cid: str, user=Depends(_require_priv)):
        """Resolves the audience and immediately sends via Gmail OAuth.
        For now we send synchronously with throttling — a background queue
        will be wired in Delivery 3.
        """
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        if c.get("status") not in ("draft", "scheduled", "paused"):
            raise HTTPException(400, f"Campaign is already {c.get('status')}")
        # Resolve template body if linked
        subject = c.get("subject") or ""
        body_html = c.get("body_html") or ""
        if c.get("template_id"):
            tpl = await db.email_templates.find_one({"id": c["template_id"]}, {"_id": 0})
            if tpl:
                subject = subject or tpl.get("subject", "")
                body_html = body_html or tpl.get("body_html", "")
        if not subject or not body_html:
            raise HTTPException(400, "Campaign has no subject/body — link a template or fill them in")

        leads = await _resolve_audience(c.get("audience") or {})
        if not leads:
            raise HTTPException(400, "Audience resolved to 0 leads")

        # Validate Gmail before queueing
        from email_module import _resolve_send_token, _refresh_if_needed
        token = await _resolve_send_token(db, c.get("from_token_id") or None)
        if not token:
            raise HTTPException(400, "Gmail not connected — connect from Settings")
        try:
            await _refresh_if_needed(db, token)
        except Exception as e:
            raise HTTPException(400, f"Gmail connection expired — reconnect in Settings ({type(e).__name__})")

        now = _now()
        await db.outreach_campaigns.update_one(
            {"id": cid},
            {"$set": {"status": "active", "launched_at": c.get("launched_at") or now,
                      "pending_lead_ids": [l["id"] for l in leads],
                      "stats": c.get("stats") or {"to": len(leads), "sent": 0, "failed": 0, "bounced": 0,
                                                   "opened": 0, "clicked": 0, "replied": 0},
                      "updated_at": now}},
        )
        import asyncio
        asyncio.create_task(_run_campaign_batch(cid, subject, body_html))
        return {"ok": True, "queued": len(leads), "status": "active",
                "note": f"Sending in the background in batches of {c.get('batch_size') or 300} (daily cap {c.get('daily_cap') or 2000})."}

    async def _sent_today_count() -> int:
        day = _now()[:10]
        return await db.outreach_events.count_documents({"kind": "sent", "at": {"$gte": day}})

    async def _run_campaign_batch(cid: str, subject: str, body_html: str):
        """Background sender — throttled, batch-limited, daily-capped, with template attachments."""
        import asyncio
        from email.mime.base import MIMEBase
        from email import encoders
        try:
            c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
            if not c or c.get("status") != "active":
                return
            batch_size = min(300, max(1, int(c.get("batch_size") or 300)))
            daily_cap = int(c.get("daily_cap") or 2000)
            pending_ids = c.get("pending_lead_ids") or []
            leads = await db.outreach_leads.find({"id": {"$in": pending_ids}}, {"_id": 0}).to_list(5000)
            attachments = []
            if c.get("template_id"):
                adocs = await db.email_template_attachments.find({"template_id": c["template_id"]}, {"_id": 0}).to_list(50)
                for a in adocs:
                    try:
                        attachments.append({"filename": a["filename"], "content_type": a.get("content_type") or "application/octet-stream",
                                            "data": base64.b64decode(a["data_b64"])})
                    except Exception:
                        pass
            for a in (c.get("extra_attachments") or []):
                try:
                    attachments.append({"filename": a["filename"], "content_type": a.get("content_type") or "application/pdf",
                                        "data": base64.b64decode(a["data_b64"])})
                except Exception:
                    pass
            from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
            token = await _resolve_send_token(db, c.get("from_token_id") or None)
            token = await _refresh_if_needed(db, token)
            service = _build_gmail_service(token)
            sender = token.get("email")
            from_header = f'"Projexino" <{sender}>'
            stats = c.get("stats") or {"to": len(pending_ids), "sent": 0, "failed": 0, "bounced": 0, "opened": 0, "clicked": 0, "replied": 0}
            stats.setdefault("bounced", 0)
            failures = c.get("failures") or []
            processed = []
            sent_in_batch = 0
            for lead in leads:
                if sent_in_batch >= batch_size:
                    break
                if await _sent_today_count() >= daily_cap:
                    await db.outreach_campaigns.update_one({"id": cid}, {"$set": {
                        "status": "paused", "pause_reason": f"Daily cap of {daily_cap} reached — resume tomorrow",
                        "updated_at": _now()}})
                    break
                try:
                    p_subj, p_body = _personalise(body_html, subject, lead)
                    event_id = uuid.uuid4().hex
                    tracked_body = _inject_tracking_fn(p_body, event_id)
                    alt = MIMEMultipart("alternative")
                    alt.attach(MIMEText(_html_to_plain(p_body), "plain"))
                    alt.attach(MIMEText(tracked_body, "html"))
                    if attachments:
                        msg = MIMEMultipart("mixed")
                        msg.attach(alt)
                        for a in attachments:
                            main, _, sub = a["content_type"].partition("/")
                            part = MIMEBase(main or "application", sub or "octet-stream")
                            part.set_payload(a["data"])
                            encoders.encode_base64(part)
                            part.add_header("Content-Disposition", "attachment", filename=a["filename"])
                            msg.attach(part)
                    else:
                        msg = alt
                    msg["Subject"] = p_subj
                    msg["From"] = from_header
                    msg["To"] = lead["email"]
                    msg["Reply-To"] = sender
                    msg["List-Unsubscribe"] = f"<mailto:{sender}?subject=Unsubscribe>"
                    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                    sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
                    stats["sent"] += 1
                    sent_in_batch += 1
                    await db.outreach_events.insert_one({
                        "id": event_id, "lead_id": lead["id"], "campaign_id": cid,
                        "kind": "sent", "at": _now(),
                        "meta": {"message_id": sent.get("id"), "thread_id": sent.get("threadId"),
                                 "subject": p_subj, "from": sender, "to": lead["email"],
                                 "attachments": [a["filename"] for a in attachments]},
                    })
                    await db.outreach_leads.update_one(
                        {"id": lead["id"]},
                        {"$set": {"last_contact_at": _now(), "updated_at": _now()}, "$addToSet": {"campaign_ids": cid}},
                    )
                except Exception as e:
                    stats["failed"] += 1
                    stats["bounced"] = stats.get("bounced", 0) + 1
                    failures.append({"lead_id": lead["id"], "email": lead.get("email"), "error": str(e)[:200]})
                processed.append(lead["id"])
                await asyncio.sleep(1.0)
                if len(processed) % 20 == 0:
                    remaining = [i for i in pending_ids if i not in set(processed)]
                    await db.outreach_campaigns.update_one({"id": cid}, {"$set": {
                        "stats": stats, "pending_lead_ids": remaining, "failures": failures[:300], "updated_at": _now()}})
            remaining = [i for i in pending_ids if i not in set(processed)]
            final = {"stats": stats, "pending_lead_ids": remaining, "failures": failures[:300], "updated_at": _now()}
            fresh = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0, "status": 1})
            if not remaining:
                final["status"] = "completed"
                final["completed_at"] = _now()
            elif (fresh or {}).get("status") == "active":
                final["status"] = "paused"
                final["pause_reason"] = f"Batch of {sent_in_batch} sent — click 'Send next batch' for the rest"
            await db.outreach_campaigns.update_one({"id": cid}, {"$set": final})
        except Exception as e:
            await db.outreach_campaigns.update_one({"id": cid}, {"$set": {
                "status": "paused", "pause_reason": f"Sender error: {str(e)[:180]}", "updated_at": _now()}})

    @api.post("/outreach/campaigns/{cid}/send-batch")
    async def send_next_batch(cid: str, user=Depends(_require_priv)):
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        if not (c.get("pending_lead_ids") or []):
            raise HTTPException(400, "Nothing pending — campaign is complete")
        subject = c.get("subject") or ""
        body_html = c.get("body_html") or ""
        if c.get("template_id"):
            tpl = await db.email_templates.find_one({"id": c["template_id"]}, {"_id": 0})
            if tpl:
                subject = subject or tpl.get("subject", "")
                body_html = body_html or tpl.get("body_html", "")
        await db.outreach_campaigns.update_one({"id": cid}, {"$set": {"status": "active", "updated_at": _now()}})
        import asyncio
        asyncio.create_task(_run_campaign_batch(cid, subject, body_html))
        return {"ok": True, "queued": len(c.get("pending_lead_ids") or [])}

    @api.post("/outreach/campaigns/{cid}/sync-replies")
    async def sync_replies(cid: str, user=Depends(_require_priv)):
        """Polls Gmail threads of sent emails — thread with >1 message = a reply."""
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
        token = await _resolve_send_token(db, c.get("from_token_id") or None)
        if not token:
            raise HTTPException(400, "Gmail not connected — connect from Settings")
        try:
            token = await _refresh_if_needed(db, token)
        except Exception:
            raise HTTPException(400, "Gmail connection expired — reconnect in Settings")
        service = _build_gmail_service(token)
        sent_events = await db.outreach_events.find(
            {"campaign_id": cid, "kind": "sent"}, {"_id": 0, "lead_id": 1, "meta.thread_id": 1}
        ).to_list(500)
        replied_leads = set(e["lead_id"] for e in await db.outreach_events.find(
            {"campaign_id": cid, "kind": "replied"}, {"_id": 0, "lead_id": 1}).to_list(2000))
        new_replies = 0
        for ev in sent_events:
            lead_id = ev.get("lead_id")
            tid = (ev.get("meta") or {}).get("thread_id")
            if not tid or lead_id in replied_leads:
                continue
            try:
                thread = service.users().threads().get(userId="me", id=tid, format="minimal").execute()
                if len(thread.get("messages") or []) > 1:
                    await db.outreach_events.insert_one({
                        "id": uuid.uuid4().hex, "lead_id": lead_id, "campaign_id": cid,
                        "kind": "replied", "at": _now(), "meta": {"thread_id": tid},
                    })
                    replied_leads.add(lead_id)
                    new_replies += 1
            except Exception:
                continue
        total_replied = len(replied_leads)
        await db.outreach_campaigns.update_one({"id": cid}, {"$set": {"stats.replied": total_replied, "updated_at": _now()}})
        return {"ok": True, "new_replies": new_replies, "total_replied": total_replied}

    @api.post("/outreach/leads/email-blast")
    async def email_blast(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Select leads → pick a template → bulk send with template attachments."""
        lead_ids = [str(x) for x in (payload.get("lead_ids") or []) if str(x).strip()]
        template_id = (payload.get("template_id") or "").strip()
        if not lead_ids:
            raise HTTPException(400, "Select at least one lead")
        if not template_id:
            raise HTTPException(400, "Pick an email template")
        tpl = await db.email_templates.find_one({"id": template_id}, {"_id": 0})
        if not tpl:
            raise HTTPException(404, "Template not found")
        att_count = await db.email_template_attachments.count_documents({"template_id": template_id})
        # Attach selected playbooks as branded PDFs
        extra_attachments = []
        for slug in [str(x) for x in (payload.get("playbook_slugs") or []) if str(x).strip()][:5]:
            pb = await db.playbooks.find_one({"slug": slug}, {"_id": 0})
            if not pb:
                continue
            try:
                from playbooks import _build_playbook_pdf
                pdf = _build_playbook_pdf(pb)
                extra_attachments.append({"filename": f"{slug}-playbook.pdf", "content_type": "application/pdf",
                                          "data_b64": base64.b64encode(pdf).decode("ascii")})
            except Exception:
                pass
        # Append selected blog posts as a "Recommended reading" block (tracked links)
        body_html = tpl.get("body_html", "")
        blog_ids = [str(x) for x in (payload.get("blog_ids") or []) if str(x).strip()]
        if blog_ids:
            posts = await db.blog_posts.find({"id": {"$in": blog_ids}},
                                             {"_id": 0, "title": 1, "slug": 1, "excerpt": 1}).to_list(20)
            if posts:
                base = _public_base()
                items = "".join(
                    f'<li style="margin-bottom:8px"><a href="{base}/blog/{p.get("slug", "")}" '
                    f'style="color:#F97316;font-weight:bold">{p.get("title", "")}</a>'
                    + (f'<br/><span style="color:#64748B;font-size:12px">{(p.get("excerpt") or "")[:140]}</span>'
                       if p.get("excerpt") else "") + "</li>"
                    for p in posts)
                body_html += ('<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E2E8F0">'
                              '<p style="font-weight:bold;color:#0F2042">Recommended reading from Projexino</p>'
                              f'<ul style="padding-left:18px">{items}</ul></div>')
        cid = uuid.uuid4().hex
        doc = {
            "id": cid,
            "name": f"Blast · {tpl.get('name', 'Template')} · {_now()[:10]}",
            "type": "blast",
            "status": "draft",
            "template_id": template_id,
            "subject": tpl.get("subject", ""),
            "body_html": body_html,
            "from_token_id": payload.get("from_token_id") or "",
            "audience": {"kind": "lead_ids", "lead_ids": lead_ids},
            "batch_size": min(300, max(1, int(payload.get("batch_size") or 300))),
            "daily_cap": int(payload.get("daily_cap") or 2000),
            "attachment_count": att_count + len(extra_attachments),
            "extra_attachments": extra_attachments,
            "playbook_slugs": payload.get("playbook_slugs") or [],
            "blog_ids": blog_ids,
            "created_at": _now(), "updated_at": _now(), "created_by": user.get("email", ""),
        }
        await db.outreach_campaigns.insert_one(dict(doc))
        result = await launch_campaign(cid, user)
        return {"ok": True, "campaign_id": cid, **result}

    @api.get("/outreach/campaigns/{cid}/analytics")
    async def campaign_analytics(cid: str, user=Depends(_require_priv)):
        """Detailed per-campaign analytics: opens, clicks, replies, bounces, event feed."""
        c = await db.outreach_campaigns.find_one({"id": cid}, {"_id": 0, "extra_attachments": 0})
        if not c:
            raise HTTPException(404, "Campaign not found")
        events = await db.outreach_events.find({"campaign_id": cid}, {"_id": 0}).sort("at", -1).to_list(2000)
        lead_ids = list({e.get("lead_id") for e in events if e.get("lead_id")})
        leads = await db.outreach_leads.find(
            {"id": {"$in": lead_ids}},
            {"_id": 0, "id": 1, "first_name": 1, "last_name": 1, "email": 1, "company": 1}).to_list(3000)
        lmap = {l["id"]: l for l in leads}
        by_kind: Dict[str, int] = {}
        uniq: Dict[str, set] = {}
        feed = []
        for e in events:
            k = e.get("kind") or ""
            by_kind[k] = by_kind.get(k, 0) + 1
            uniq.setdefault(k, set()).add(e.get("lead_id"))
            l = lmap.get(e.get("lead_id")) or {}
            feed.append({
                "kind": k, "at": e.get("at"),
                "lead_name": " ".join(filter(None, [l.get("first_name"), l.get("last_name")])) or l.get("email", ""),
                "lead_email": l.get("email", ""), "company": l.get("company", ""),
                "subject": (e.get("meta") or {}).get("subject", ""),
                "url": (e.get("meta") or {}).get("url", ""),
            })
        stats = c.get("stats") or {}
        sent = int(stats.get("sent") or 0)

        def _rate(k):
            return round(len(uniq.get(k) or set()) / sent * 100, 1) if sent else 0
        return {
            "campaign": c, "stats": stats, "by_kind": by_kind,
            "unique": {k: len(v) for k, v in uniq.items()},
            "rates": {"open_rate": _rate("opened"), "click_rate": _rate("clicked"), "reply_rate": _rate("replied")},
            "pending": len(c.get("pending_lead_ids") or []),
            "failures": (c.get("failures") or [])[:100],
            "events": feed[:400],
        }

    @api.post("/outreach/campaigns/{cid}/pause")
    async def pause_campaign(cid: str, user=Depends(_require_priv)):
        r = await db.outreach_campaigns.update_one(
            {"id": cid}, {"$set": {"status": "paused", "updated_at": _now()}}
        )
        if not r.matched_count:
            raise HTTPException(404, "Campaign not found")
        return {"ok": True}

    @api.post("/outreach/campaigns/{cid}/resume")
    async def resume_campaign(cid: str, user=Depends(_require_priv)):
        r = await db.outreach_campaigns.update_one(
            {"id": cid}, {"$set": {"status": "draft", "updated_at": _now()}}
        )
        if not r.matched_count:
            raise HTTPException(404, "Campaign not found")
        return {"ok": True}

    # ===== Dashboard / Summary =====
    @api.get("/outreach/summary")
    async def outreach_summary(user=Depends(_require_priv)):
        total_leads = await db.outreach_leads.count_documents({})
        # Pipeline counts
        pipeline = {}
        for st in PIPELINE_STAGES:
            pipeline[st] = await db.outreach_leads.count_documents({"pipeline_stage": st})
        statuses = {}
        for st in LEAD_STATUSES:
            statuses[st] = await db.outreach_leads.count_documents({"status": st})
        # Campaign aggregate stats
        agg_cursor = db.outreach_campaigns.find({}, {"_id": 0, "stats": 1, "status": 1})
        sent = opened = clicked = replied = failed = 0
        active = 0
        async for c in agg_cursor:
            s = c.get("stats") or {}
            sent += int(s.get("sent") or 0)
            opened += int(s.get("opened") or 0)
            clicked += int(s.get("clicked") or 0)
            replied += int(s.get("replied") or 0)
            failed += int(s.get("failed") or 0)
            if c.get("status") in ("active", "scheduled", "paused"):
                active += 1
        open_rate = round((opened / sent * 100), 1) if sent else 0
        click_rate = round((clicked / sent * 100), 1) if sent else 0
        reply_rate = round((replied / sent * 100), 1) if sent else 0
        # Sent today
        from datetime import datetime as _dt
        today = _dt.now(timezone.utc).date().isoformat()
        sent_today = await db.outreach_events.count_documents(
            {"kind": "sent", "at": {"$gte": today}}
        )
        return {
            "total_leads": total_leads,
            "pipeline": pipeline,
            "statuses": statuses,
            "sent_today": sent_today,
            "emails_sent": sent,
            "opened": opened,
            "clicked": clicked,
            "replied": replied,
            "failed": failed,
            "open_rate": open_rate,
            "click_rate": click_rate,
            "reply_rate": reply_rate,
            "active_campaigns": active,
        }


    # ===== Lead detail (full timeline) =====
    @api.get("/outreach/leads/{lid}/full")
    async def get_lead_full(lid: str, user=Depends(_require_priv)):
        lead = await db.outreach_leads.find_one({"id": lid}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        cur = db.outreach_events.find({"lead_id": lid}, {"_id": 0}).sort("at", -1).limit(500)
        events = await cur.to_list(500)
        # Annotate events with campaign name for the timeline
        campaign_ids = list({e.get("campaign_id") for e in events if e.get("campaign_id")})
        camp_names: Dict[str, str] = {}
        if campaign_ids:
            async for c in db.outreach_campaigns.find({"id": {"$in": campaign_ids}}, {"_id": 0, "id": 1, "name": 1}):
                camp_names[c["id"]] = c.get("name", "")
        for e in events:
            e["campaign_name"] = camp_names.get(e.get("campaign_id", ""), "")
        # Sequence enrollments
        enrols = await db.outreach_sequence_enrol.find(
            {"lead_id": lid}, {"_id": 0}
        ).sort("created_at", -1).to_list(200)
        return {"lead": lead, "events": events, "sequence_enrolments": enrols}

    @api.post("/outreach/leads/{lid}/note")
    async def add_lead_note(lid: str, payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        note = (payload.get("note") or "").strip()
        if not note:
            raise HTTPException(400, "note required")
        await db.outreach_events.insert_one({
            "id": uuid.uuid4().hex,
            "lead_id": lid, "campaign_id": "",
            "kind": "note", "at": _now(),
            "meta": {"note": note, "by": user.get("email", "")},
        })
        return {"ok": True}

    # ===== Google Maps Lead Discovery =====
    # Uses Google Places API (New) — set GOOGLE_PLACES_API_KEY in backend/.env.
    # Endpoint accepts a natural-language query; auto-imports results into
    # `outreach_leads` with source="google_maps" and dedupes by place_id + email.
    @api.post("/outreach/discover/google-maps")
    async def discover_google_maps(payload: GMapsDiscoveryIn, user=Depends(_require_priv)):
        import os
        import httpx

        api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(
                400,
                "GOOGLE_PLACES_API_KEY is not configured. Add it to backend/.env on your "
                "hosted server. Enable the Places API (New) in Google Cloud Console.",
            )

        field_mask = ",".join([
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.internationalPhoneNumber",
            "places.nationalPhoneNumber",
            "places.websiteUri",
            "places.googleMapsUri",
            "places.location",
            "places.types",
            "places.primaryType",
            "places.rating",
            "places.userRatingCount",
            "places.businessStatus",
            "nextPageToken",
        ])
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": field_mask,
        }
        body: Dict[str, Any] = {
            "textQuery": payload.query.strip(),
            "pageSize": payload.page_size,
            "languageCode": payload.language_code or "en",
        }
        if payload.region_code:
            body["regionCode"] = payload.region_code
        if payload.page_token:
            body["pageToken"] = payload.page_token

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://places.googleapis.com/v1/places:searchText",
                    headers=headers,
                    json=body,
                )
        except Exception as e:
            raise HTTPException(502, f"Google Maps request failed: {str(e)[:200]}")

        if resp.status_code != 200:
            # surface Google's error verbatim — it usually explains key/restriction issues
            raise HTTPException(
                resp.status_code,
                f"Google Maps error: {resp.text[:500]}",
            )

        data = resp.json() or {}
        places = data.get("places") or []
        next_token = data.get("nextPageToken")

        # Map Place → lead-shaped dict
        leads_preview: List[Dict[str, Any]] = []
        seen_place_ids = set()
        for p in places:
            pid = p.get("id") or ""
            if not pid or pid in seen_place_ids:
                continue
            seen_place_ids.add(pid)
            website = (p.get("websiteUri") or "").strip()
            if payload.no_website_only and website:
                continue
            display = p.get("displayName") or {}
            name = display.get("text") if isinstance(display, dict) else (display or "")
            phone = (p.get("internationalPhoneNumber") or p.get("nationalPhoneNumber") or "").strip()
            loc = p.get("location") or {}
            preview = {
                "place_id": pid,
                "name": name or "",
                "address": p.get("formattedAddress") or "",
                "phone": phone,
                "website": website,
                "maps_url": p.get("googleMapsUri") or "",
                "lat": loc.get("latitude"),
                "lng": loc.get("longitude"),
                "types": p.get("types") or [],
                "primary_type": p.get("primaryType") or "",
                "rating": p.get("rating"),
                "rating_count": p.get("userRatingCount"),
                "business_status": p.get("businessStatus") or "",
            }
            leads_preview.append(preview)

        imported = 0
        skipped_duplicates = 0
        created_lead_ids: List[str] = []
        if payload.auto_import and leads_preview:
            # dedupe against existing leads by place_id (preferred) or email
            existing_place_ids = set()
            cur = db.outreach_leads.find(
                {"google_place_id": {"$in": [lp["place_id"] for lp in leads_preview]}},
                {"_id": 0, "google_place_id": 1},
            )
            async for row in cur:
                if row.get("google_place_id"):
                    existing_place_ids.add(row["google_place_id"])

            for prev in leads_preview:
                if prev["place_id"] in existing_place_ids:
                    skipped_duplicates += 1
                    continue
                # Construct a synthetic email if missing — needed for outreach,
                # but flag as "no_email" so the operator knows to enrich.
                synthetic_email = ""
                if not synthetic_email:
                    # fall back to placeholder so unique-email indexes (if any) don't collide
                    synthetic_email = f"noemail+{prev['place_id'][:14]}@google-maps.lead"

                # Try to split a city/country out of the address for filtering later
                country = ""
                city = ""
                parts = [p.strip() for p in (prev["address"] or "").split(",") if p.strip()]
                if parts:
                    country = parts[-1]
                    if len(parts) >= 2:
                        city = parts[-2]

                lead_doc = {
                    "id": uuid.uuid4().hex,
                    "first_name": "",
                    "last_name": "",
                    "email": synthetic_email,
                    "company": prev["name"],
                    "website": prev["website"],
                    "industry": (prev["primary_type"] or "").replace("_", " "),
                    "country": country,
                    "city": city,
                    "phone": prev["phone"],
                    "linkedin_url": "",
                    "source": "google_maps",
                    "tags": ["google-maps"] + ([prev["primary_type"]] if prev["primary_type"] else []),
                    "notes": (
                        f"Imported from Google Maps. Address: {prev['address']}. "
                        f"Rating: {prev['rating'] or 'N/A'} ({prev['rating_count'] or 0} reviews). "
                        f"Maps: {prev['maps_url']}"
                    ),
                    "status": "cold",
                    "pipeline_stage": "new_lead",
                    "score": 0,
                    "google_place_id": prev["place_id"],
                    "google_maps_url": prev["maps_url"],
                    "geo": {"lat": prev["lat"], "lng": prev["lng"]} if prev["lat"] is not None else None,
                    "business_status": prev["business_status"],
                    "has_website": bool(prev["website"]),
                    "campaign_ids": [],
                    "last_contact_at": "",
                    "created_at": _now(),
                    "updated_at": _now(),
                    "created_by": user.get("email", ""),
                }
                await db.outreach_leads.insert_one(lead_doc)
                created_lead_ids.append(lead_doc["id"])
                imported += 1

        return {
            "query": payload.query,
            "imported": imported,
            "skipped_duplicates": skipped_duplicates,
            "no_website_only": payload.no_website_only,
            "next_page_token": next_token,
            "leads": leads_preview,
            "created_lead_ids": created_lead_ids,
            "total_returned": len(leads_preview),
        }

    # ──────────────────────────────────────────────────────────────────
    # Lead Lists — named, reusable collections of leads.
    # Used by AI Writer / Templates / Campaigns to scope a draft to one list.
    # ──────────────────────────────────────────────────────────────────
    @api.post("/outreach/leads/from-xino")
    async def lead_from_xino(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Upsert a Xino-estimate contact as a lead and add it to a named lead list."""
        email = (payload.get("email") or "").strip().lower()
        if not email:
            raise HTTPException(400, "Contact has no email")
        list_name = (payload.get("list_name") or "Xino Estimate Leads").strip()
        lead = await db.outreach_leads.find_one({"email": email}, {"_id": 0})
        if not lead:
            lead = {
                "id": uuid.uuid4().hex,
                "name": (payload.get("name") or "").strip() or email.split("@")[0],
                "email": email,
                "phone": (payload.get("phone") or "").strip(),
                "company": (payload.get("company") or "").strip(),
                "source": "xino_estimate",
                "status": "warm",
                "pipeline_stage": "new_lead",
                "score": 25,
                "tags": ["xino"],
                "notes": (payload.get("note") or "")[:2000],
                "created_at": _now(), "updated_at": _now(),
            }
            await db.outreach_leads.insert_one(dict(lead))
            lead.pop("_id", None)
        lst = await db.outreach_lead_lists.find_one({"name": list_name}, {"_id": 0})
        if not lst:
            lst = {"id": uuid.uuid4().hex, "name": list_name, "description": "Auto-created from Xino estimates",
                   "lead_ids": [], "tags": ["xino"], "source": "xino",
                   "created_at": _now(), "updated_at": _now(), "created_by": user.get("email", "")}
            await db.outreach_lead_lists.insert_one(dict(lst))
            lst.pop("_id", None)
        await db.outreach_lead_lists.update_one({"id": lst["id"]}, {"$addToSet": {"lead_ids": lead["id"]}, "$set": {"updated_at": _now()}})
        return {"ok": True, "lead_id": lead["id"], "list_id": lst["id"], "list_name": list_name}

    @api.get("/outreach/lead-lists")
    async def list_lead_lists(user=Depends(_require_priv)):
        rows = await db.outreach_lead_lists.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        # Hydrate count + sample names
        for r in rows:
            r["lead_count"] = len(r.get("lead_ids") or [])
        return rows

    @api.post("/outreach/lead-lists")
    async def create_lead_list(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        name = (payload.get("name") or "").strip()
        if not name:
            raise HTTPException(400, "Name is required")
        if await db.outreach_lead_lists.find_one({"name": name}, {"_id": 0, "id": 1}):
            raise HTTPException(400, f"A list named '{name}' already exists")
        ids = list({str(x) for x in (payload.get("lead_ids") or []) if str(x).strip()})
        doc = {
            "id": uuid.uuid4().hex,
            "name": name,
            "description": (payload.get("description") or "").strip(),
            "lead_ids": ids,
            "tags": payload.get("tags") or [],
            "source": (payload.get("source") or "").strip() or "manual",
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.outreach_lead_lists.insert_one(doc)
        doc.pop("_id", None)
        doc["lead_count"] = len(doc["lead_ids"])
        return doc

    @api.patch("/outreach/lead-lists/{rid}")
    async def update_lead_list(rid: str, payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        existing = await db.outreach_lead_lists.find_one({"id": rid}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Lead list not found")
        updates: Dict[str, Any] = {}
        if "name" in payload:
            new_name = (payload["name"] or "").strip()
            if new_name and new_name != existing["name"]:
                clash = await db.outreach_lead_lists.find_one({"name": new_name, "id": {"$ne": rid}}, {"_id": 0, "id": 1})
                if clash:
                    raise HTTPException(400, f"A list named '{new_name}' already exists")
                updates["name"] = new_name
        if "description" in payload:
            updates["description"] = (payload["description"] or "").strip()
        if "tags" in payload:
            updates["tags"] = payload["tags"] or []
        if "add_lead_ids" in payload:
            current = set(existing.get("lead_ids") or [])
            current.update(str(x) for x in (payload["add_lead_ids"] or []) if str(x).strip())
            updates["lead_ids"] = list(current)
        elif "remove_lead_ids" in payload:
            current = set(existing.get("lead_ids") or [])
            for x in (payload["remove_lead_ids"] or []):
                current.discard(str(x))
            updates["lead_ids"] = list(current)
        elif "lead_ids" in payload:
            updates["lead_ids"] = list({str(x) for x in payload["lead_ids"] if str(x).strip()})
        updates["updated_at"] = _now()
        await db.outreach_lead_lists.update_one({"id": rid}, {"$set": updates})
        row = await db.outreach_lead_lists.find_one({"id": rid}, {"_id": 0})
        row["lead_count"] = len(row.get("lead_ids") or [])
        return row

    @api.delete("/outreach/lead-lists/{rid}")
    async def delete_lead_list(rid: str, user=Depends(_require_priv)):
        r = await db.outreach_lead_lists.delete_one({"id": rid})
        if r.deleted_count == 0:
            raise HTTPException(404, "Lead list not found")
        return {"ok": True}

    @api.get("/outreach/lead-lists/{rid}/leads")
    async def get_lead_list_members(rid: str, user=Depends(_require_priv)):
        lst = await db.outreach_lead_lists.find_one({"id": rid}, {"_id": 0})
        if not lst:
            raise HTTPException(404, "Lead list not found")
        ids = lst.get("lead_ids") or []
        if not ids:
            return {"list": lst, "leads": []}
        leads = await db.outreach_leads.find({"id": {"$in": ids}}, {"_id": 0}).to_list(2000)
        return {"list": lst, "leads": leads}


    # ──────────────────────────────────────────────────────────────────
    # Website enrichment — scrapes emails + phones off a lead's website.
    # The only legitimate FREE way to enrich Google Maps leads since the
    # Places API never returns email and frequently omits phone.
    # ──────────────────────────────────────────────────────────────────
    EMAIL_REGEX = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
    PHONE_REGEX = re.compile(r"(\+?\d[\d\-\s().]{7,}\d)")
    OBFUSCATED_AT = re.compile(r"\s*(?:\[at\]|\(at\)|\s+at\s+)\s*", re.IGNORECASE)
    OBFUSCATED_DOT = re.compile(r"\s*(?:\[dot\]|\(dot\)|\s+dot\s+)\s*", re.IGNORECASE)
    BAD_EMAIL_SUFFIXES = (
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".zip",
    )
    GENERIC_LOCALPARTS = {"noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "mailer-daemon"}
    PREFERRED_LOCALPARTS = ("contact", "hello", "info", "sales", "team", "support", "admin", "office")

    async def _fetch(url: str) -> str:
        try:
            async with httpx.AsyncClient(timeout=10, follow_redirects=True,
                                        headers={"User-Agent": "Mozilla/5.0 ProjexinoEnricher/1.0"}) as cli:
                r = await cli.get(url)
                if r.status_code >= 400:
                    return ""
                ctype = r.headers.get("content-type", "")
                if "html" not in ctype and "text" not in ctype:
                    return ""
                return r.text[:600_000]
        except Exception:
            return ""

    def _candidate_urls(website: str) -> List[str]:
        website = (website or "").strip()
        if not website:
            return []
        if not website.startswith(("http://", "https://")):
            website = "https://" + website
        try:
            from urllib.parse import urlparse, urljoin
            p = urlparse(website)
            base = f"{p.scheme}://{p.netloc}"
        except Exception:
            return [website]
        paths = ["/", "/contact", "/contact-us", "/contact.html", "/about",
                 "/about-us", "/about.html", "/team", "/imprint", "/legal-notice"]
        return [base + path for path in paths]

    def _extract_emails(html: str, domain_hint: str = "") -> List[str]:
        if not html:
            return []
        # Deobfuscate common patterns
        deob = OBFUSCATED_AT.sub("@", OBFUSCATED_DOT.sub(".", html))
        # Pull from mailto: links first (higher signal)
        mailtos = re.findall(r"mailto:([^\"'>?\s]+)", deob, flags=re.IGNORECASE)
        raw = list(mailtos) + EMAIL_REGEX.findall(deob)
        out: List[str] = []
        seen = set()
        for e in raw:
            e = e.strip().strip(".,;:").lower()
            if not e or e in seen:
                continue
            if any(e.endswith(suf) for suf in BAD_EMAIL_SUFFIXES):
                continue
            if "@" not in e or e.split("@")[0] in GENERIC_LOCALPARTS:
                continue
            seen.add(e)
            out.append(e)
        # If we have a website domain, prefer emails on the same domain.
        if domain_hint:
            host = domain_hint.lower().lstrip("www.")
            on_domain = [e for e in out if e.endswith("@" + host) or e.endswith("." + host)]
            if on_domain:
                out = on_domain + [e for e in out if e not in on_domain]
        # Rank: prefer contact/hello/info/sales over random first-name@
        def rank(e: str) -> int:
            local = e.split("@")[0]
            for i, k in enumerate(PREFERRED_LOCALPARTS):
                if local == k:
                    return i
            return len(PREFERRED_LOCALPARTS) + 1
        out.sort(key=rank)
        return out[:6]

    def _extract_phones(html: str) -> List[str]:
        if not html:
            return []
        # Pull tel: links first
        tels = [re.sub(r"[^\d+]", "", t) for t in re.findall(r"tel:([^\"'>?\s]+)", html, flags=re.IGNORECASE)]
        more = PHONE_REGEX.findall(html)
        out: List[str] = []
        seen = set()
        for p in tels + more:
            cleaned = re.sub(r"[\s().\-]", "", str(p))
            if len(cleaned) < 8 or len(cleaned) > 17:
                continue
            if cleaned in seen:
                continue
            seen.add(cleaned)
            out.append(str(p).strip())
        return out[:5]

    async def _enrich_lead_doc(lead: Dict[str, Any]) -> Dict[str, Any]:
        website = lead.get("website") or ""
        if not website:
            return {"emails": [], "phones": [], "fetched_pages": 0, "reason": "no website on file"}
        try:
            from urllib.parse import urlparse
            domain = urlparse(website if "://" in website else "https://" + website).netloc
        except Exception:
            domain = ""
        urls = _candidate_urls(website)
        emails_all: List[str] = []
        phones_all: List[str] = []
        fetched = 0
        for u in urls:
            html = await _fetch(u)
            if not html:
                continue
            fetched += 1
            emails_all.extend(_extract_emails(html, domain))
            phones_all.extend(_extract_phones(html))
            # First good email on the homepage is usually enough; bail early.
            if fetched >= 2 and emails_all:
                break
        # Dedupe preserving order
        emails: List[str] = []
        for e in emails_all:
            if e not in emails:
                emails.append(e)
        phones: List[str] = []
        for p in phones_all:
            if p not in phones:
                phones.append(p)
        return {"emails": emails[:5], "phones": phones[:5], "fetched_pages": fetched}

    @api.post("/outreach/leads/{lead_id}/enrich")
    async def enrich_lead(lead_id: str, user=Depends(_require_priv)):
        lead = await db.outreach_leads.find_one({"id": lead_id}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        # Bound total wall-time at 25s so a slow/unreachable host can't stall a batch.
        try:
            import asyncio as _asyncio
            result = await _asyncio.wait_for(_enrich_lead_doc(lead), timeout=25)
        except Exception:
            result = {"emails": [], "phones": [], "fetched_pages": 0, "reason": "timeout"}
        updates: Dict[str, Any] = {}
        # Replace synthetic noemail+…@google-maps.lead OR empty with the best found
        cur_email = (lead.get("email") or "").lower()
        if result["emails"] and (cur_email.startswith("noemail+") or "@google-maps.lead" in cur_email or not cur_email):
            # Make sure the chosen email is unique among leads
            for cand in result["emails"]:
                dup = await db.outreach_leads.find_one({"email": cand, "id": {"$ne": lead_id}}, {"_id": 0, "id": 1})
                if not dup:
                    updates["email"] = cand
                    break
        if result["phones"] and not (lead.get("phone") or "").strip():
            updates["phone"] = result["phones"][0]
        updates["enrichment"] = {
            "emails_found": result["emails"],
            "phones_found": result["phones"],
            "fetched_pages": result["fetched_pages"],
            "enriched_at": _now(),
            "reason": result.get("reason"),
        }
        updates["updated_at"] = _now()
        await db.outreach_leads.update_one({"id": lead_id}, {"$set": updates})
        out = await db.outreach_leads.find_one({"id": lead_id}, {"_id": 0})
        return {"ok": True, "lead": out, **result}

    @api.post("/outreach/leads/enrich-batch")
    async def enrich_leads_batch(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Enrich multiple leads in one call. Accepts either:
          { "lead_ids": ["id1","id2",…] }        — explicit list, or
          { "only_synthetic": true, "limit": 25 } — auto-pick leads with synthetic emails.
        Sequentially fetches each website (best-effort, single-threaded to keep things
        polite for small hosting setups). Returns per-lead results."""
        ids = payload.get("lead_ids") or []
        if not ids and payload.get("only_synthetic"):
            limit = int(payload.get("limit") or 25)
            cur = db.outreach_leads.find(
                {"$or": [
                    {"email": {"$regex": "@google-maps\\.lead$", "$options": "i"}},
                    {"email": {"$regex": "^noemail\\+", "$options": "i"}},
                ]},
                {"_id": 0, "id": 1},
            ).sort("created_at", -1).limit(limit)
            ids = [d["id"] async for d in cur]
        results: List[Dict[str, Any]] = []
        enriched_count = 0
        for lid in ids:
            try:
                r = await enrich_lead(lid, user=user)
                summary = {"id": lid, "ok": True,
                           "emails": r.get("emails", []),
                           "phones": r.get("phones", []),
                           "fetched_pages": r.get("fetched_pages", 0)}
                if r.get("emails") or r.get("phones"):
                    enriched_count += 1
                results.append(summary)
            except HTTPException as e:
                results.append({"id": lid, "ok": False, "error": e.detail})
            except Exception as e:
                results.append({"id": lid, "ok": False, "error": str(e)[:200]})
        return {"total": len(ids), "enriched": enriched_count, "results": results}


    # ===== Sequences (D1/D4/D8/D15 drip) =====
    @api.get("/outreach/sequences")
    async def list_sequences(user=Depends(_require_priv)):
        cur = db.outreach_sequences.find({}, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(200)

    @api.post("/outreach/sequences")
    async def create_sequence(payload: SequenceIn, user=Depends(_require_priv)):
        if not payload.steps:
            raise HTTPException(400, "Add at least one step")
        doc = {
            "id": uuid.uuid4().hex,
            "name": payload.name,
            "steps": [s.model_dump() for s in payload.steps],
            "from_token_id": payload.from_token_id or "",
            "status": "active",
            "created_at": _now(), "updated_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.outreach_sequences.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @api.delete("/outreach/sequences/{sid}")
    async def del_sequence(sid: str, user=Depends(_require_priv)):
        r = await db.outreach_sequences.delete_one({"id": sid})
        if not r.deleted_count:
            raise HTTPException(404, "Sequence not found")
        await db.outreach_sequence_enrol.delete_many({"sequence_id": sid})
        return {"ok": True}

    @api.post("/outreach/sequences/{sid}/enroll")
    async def enroll_in_sequence(sid: str, payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        seq = await db.outreach_sequences.find_one({"id": sid}, {"_id": 0})
        if not seq:
            raise HTTPException(404, "Sequence not found")
        lead_ids = payload.get("lead_ids") or []
        # Expand from a saved Lead List if provided
        lst_id = payload.get("lead_list_id") or ""
        if lst_id and not lead_ids:
            lst = await db.outreach_lead_lists.find_one({"id": lst_id}, {"_id": 0})
            if not lst:
                raise HTTPException(404, "Lead list not found")
            lead_ids = lst.get("lead_ids") or []
        if not lead_ids:
            raise HTTPException(400, "lead_ids or lead_list_id required")
        now = _now()
        docs = []
        for lid in lead_ids:
            existing = await db.outreach_sequence_enrol.find_one(
                {"sequence_id": sid, "lead_id": lid, "status": {"$in": ["active", "scheduled"]}},
                {"_id": 0, "id": 1},
            )
            if existing:
                continue
            docs.append({
                "id": uuid.uuid4().hex,
                "sequence_id": sid, "lead_id": lid,
                "status": "active",        # active | completed | stopped_replied | stopped_manually
                "current_step": 0,
                "enrolled_at": now,
                "next_send_at": now,       # Day-0 step fires immediately
                "history": [],
                "created_at": now,
            })
        if docs:
            await db.outreach_sequence_enrol.insert_many(docs)
        return {"ok": True, "enrolled": len(docs), "skipped": len(lead_ids) - len(docs)}

    @api.post("/outreach/sequences/enrol/{enrol_id}/stop")
    async def stop_enrolment(enrol_id: str, user=Depends(_require_priv)):
        r = await db.outreach_sequence_enrol.update_one(
            {"id": enrol_id}, {"$set": {"status": "stopped_manually", "updated_at": _now()}}
        )
        if not r.matched_count:
            raise HTTPException(404, "Not found")
        return {"ok": True}

    # ===== Background processor (called from server loop) =====
    async def _process_sequences_due():
        """Find every active enrolment with next_send_at <= now, send the
        current step via Gmail, advance the step, schedule the next.
        Designed to be called from a 60s background loop in server.py.
        Returns a small summary used for logging."""
        now_iso = _now()
        pending = await db.outreach_sequence_enrol.find(
            {"status": "active", "next_send_at": {"$lte": now_iso}}, {"_id": 0}
        ).to_list(500)
        if not pending:
            return {"processed": 0}
        # Lazy gmail import
        from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
        from datetime import timedelta as _td
        from datetime import datetime as _dt
        # Cache tokens + services
        token_cache: Dict[str, Any] = {}
        sent_count = 0
        for enrol in pending:
            try:
                seq = await db.outreach_sequences.find_one({"id": enrol["sequence_id"]}, {"_id": 0})
                lead = await db.outreach_leads.find_one({"id": enrol["lead_id"]}, {"_id": 0})
                if not seq or not lead:
                    continue
                steps = seq.get("steps") or []
                idx = int(enrol.get("current_step") or 0)
                if idx >= len(steps):
                    await db.outreach_sequence_enrol.update_one(
                        {"id": enrol["id"]}, {"$set": {"status": "completed", "updated_at": now_iso}}
                    )
                    continue
                step = steps[idx]
                ttok_id = seq.get("from_token_id") or None
                if ttok_id not in token_cache:
                    tok = await _resolve_send_token(db, ttok_id)
                    if not tok:
                        continue
                    tok = await _refresh_if_needed(db, tok)
                    token_cache[ttok_id] = (tok, _build_gmail_service(tok))
                tok, service = token_cache[ttok_id]
                p_subj, p_body = _personalise(step.get("body_html", ""), step.get("subject", ""), lead)
                event_id = uuid.uuid4().hex
                tracked = _inject_tracking_fn(p_body, event_id)
                msg = MIMEMultipart("alternative")
                msg["Subject"] = p_subj
                msg["From"] = f'"Projexino" <{tok.get("email")}>'
                msg["To"] = lead["email"]
                msg.attach(MIMEText(tracked, "html"))
                raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
                await db.outreach_events.insert_one({
                    "id": event_id, "lead_id": lead["id"], "campaign_id": "",
                    "kind": "sent", "at": now_iso,
                    "meta": {"sequence_id": seq["id"], "sequence_step": idx,
                             "message_id": sent.get("id"), "thread_id": sent.get("threadId"),
                             "subject": p_subj, "body_html": p_body,
                             "from": tok.get("email"), "to": lead["email"]},
                })
                # Schedule next step (or complete)
                next_idx = idx + 1
                if next_idx >= len(steps):
                    await db.outreach_sequence_enrol.update_one(
                        {"id": enrol["id"]},
                        {"$set": {"status": "completed", "current_step": next_idx,
                                  "updated_at": now_iso},
                         "$push": {"history": {"step": idx, "at": now_iso, "event_id": event_id}}}
                    )
                else:
                    next_step = steps[next_idx]
                    next_send_at = (_dt.now(timezone.utc) + _td(days=int(next_step.get("day_offset", 1) - step.get("day_offset", 0)))).isoformat()
                    await db.outreach_sequence_enrol.update_one(
                        {"id": enrol["id"]},
                        {"$set": {"current_step": next_idx, "next_send_at": next_send_at, "updated_at": now_iso},
                         "$push": {"history": {"step": idx, "at": now_iso, "event_id": event_id}}}
                    )
                await db.outreach_leads.update_one(
                    {"id": lead["id"]}, {"$set": {"last_contact_at": now_iso, "updated_at": now_iso}}
                )
                sent_count += 1
            except Exception:
                # Soft-fail; the next loop tick will retry
                pass
        return {"processed": sent_count}

    @api.post("/outreach/sequences/run-now")
    async def manual_run_sequences(user=Depends(_require_priv)):
        return await _process_sequences_due()

    # Expose for the server loop
    db._outreach_process_sequences_due = _process_sequences_due

    # ===== AI cold-email writer =====
    @api.post("/outreach/ai/write")
    async def ai_write_email(payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Uses the Emergent LLM key + Gemini to draft a cold email.
        Inputs: industry, country, value_prop, kind (cold|follow_up|partnership)
        Returns: {subject, body_html}
        """
        industry = (payload.get("industry") or "").strip() or "the technology sector"
        country = (payload.get("country") or "").strip() or "your region"
        value_prop = (payload.get("value_prop") or "").strip() or "ship high-quality web & mobile apps in 4–8 weeks"
        kind = payload.get("kind") or "cold"
        try:
            import os as _os
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            key = _os.environ.get("EMERGENT_LLM_KEY")
            if not key:
                raise HTTPException(400, "EMERGENT_LLM_KEY not configured")
            chat = (LlmChat(api_key=key, session_id=f"outreach-ai-{uuid.uuid4().hex[:8]}",
                            system_message=(
                                "You are a senior B2B SDR at Projexino, a software studio in India. "
                                "Write concise, friendly, value-led cold emails. Always use the "
                                "variables {{FirstName}}, {{CompanyName}}, {{Industry}}, {{Country}} "
                                "exactly as shown so they personalise at send time. Keep the body "
                                "under 130 words, end with one clear ask, no jargon, no fake intimacy."
                            ))
                    .with_model("gemini", "gemini-2.5-flash"))
            user_msg = UserMessage(
                text=(
                    f"Draft a {kind.replace('_', ' ')} email for prospects in {industry} in {country}. "
                    f"Projexino's value proposition: {value_prop}. "
                    "Return a JSON object with exactly two keys: subject and body_html. "
                    "subject must be < 80 chars. body_html must be valid HTML (use <p>, <ul>, <li>, <strong>)."
                )
            )
            raw = await chat.send_message(user_msg)
            text = str(raw or "")
            # Extract JSON
            import json as _json
            json_block = re.search(r"\{[\s\S]*\}", text)
            if not json_block:
                raise ValueError("AI did not return JSON")
            data = _json.loads(json_block.group(0))
            return {"subject": data.get("subject", "")[:200], "body_html": data.get("body_html", "")}
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"AI writer failed: {str(e)[:200]}")

    # ===== Reports =====
    @api.get("/outreach/reports")
    async def outreach_reports(period: str = Query("daily", regex="^(daily|weekly|monthly)$"),
                               days: int = Query(14, ge=1, le=180),
                               user=Depends(_require_priv)):
        from datetime import datetime as _dt, timedelta as _td
        now = _dt.now(timezone.utc)
        bucket_fmt = {"daily": "%Y-%m-%d", "weekly": "%G-W%V", "monthly": "%Y-%m"}[period]
        start_date = (now - _td(days=days)).isoformat()
        cur = db.outreach_events.find({"at": {"$gte": start_date}}, {"_id": 0, "kind": 1, "at": 1})
        buckets: Dict[str, Dict[str, int]] = {}
        async for ev in cur:
            try:
                t = _dt.fromisoformat(ev["at"].replace("Z", "+00:00"))
            except Exception:
                continue
            key = t.strftime(bucket_fmt)
            buckets.setdefault(key, {"sent": 0, "opened": 0, "clicked": 0, "replied": 0})
            kind = ev.get("kind")
            if kind in buckets[key]:
                buckets[key][kind] += 1
        # Sort chronologically
        ordered = sorted(buckets.items())
        return {
            "period": period,
            "buckets": [{"bucket": k, **v} for k, v in ordered],
        }

    # ===== Gmail reply sync (manual + scheduled) =====
    def _decode_gmail_body(payload: Dict[str, Any]) -> tuple[str, str]:
        """Walk a Gmail message payload tree and return (text, html)."""
        import base64 as _b64
        text_out, html_out = "", ""

        def _walk(part):
            nonlocal text_out, html_out
            mime = (part or {}).get("mimeType") or ""
            body = (part or {}).get("body") or {}
            data = body.get("data") or ""
            if data and mime.startswith("text/"):
                try:
                    decoded = _b64.urlsafe_b64decode(data.encode("ascii") + b"==").decode("utf-8", errors="replace")
                    if mime == "text/plain" and not text_out:
                        text_out = decoded
                    elif mime == "text/html" and not html_out:
                        html_out = decoded
                except Exception:
                    pass
            for sub in (part or {}).get("parts") or []:
                _walk(sub)
        _walk(payload)
        return text_out, html_out

    async def _sync_replies() -> Dict[str, int]:
        """Scan recent INBOX threads in the connected Gmail accounts to detect
        replies to campaign messages. For each match, mark a "replied" event,
        store the full subject + body, bump score, stop any active sequence
        enrolment, and notify the lead owner."""
        from email_module import _refresh_if_needed, _build_gmail_service
        added = 0
        # Iterate every connected Gmail token
        cur = db.gmail_tokens.find({}, {"_id": 0})
        async for tok in cur:
            try:
                tok = await _refresh_if_needed(db, tok)
                service = _build_gmail_service(tok)
                # Pull last 50 inbox messages with replies
                resp = service.users().messages().list(
                    userId="me", q="in:inbox -from:me", maxResults=50,
                ).execute()
                msgs = resp.get("messages") or []
                for m in msgs:
                    mid = m.get("id")
                    if not mid:
                        continue
                    # Skip if already recorded
                    seen = await db.outreach_events.find_one(
                        {"kind": "replied", "meta.gmail_message_id": mid}, {"_id": 0, "id": 1},
                    )
                    if seen:
                        continue
                    # Pull the FULL message (we need the body, not just metadata)
                    full = service.users().messages().get(userId="me", id=mid, format="full").execute()
                    headers = {h["name"]: h["value"] for h in (full.get("payload") or {}).get("headers", [])}
                    from_addr = headers.get("From", "")
                    # Pull email between < >
                    m_email = re.search(r"<([^>]+)>", from_addr)
                    email = (m_email.group(1) if m_email else from_addr).lower().strip()
                    if not email:
                        continue
                    lead = await db.outreach_leads.find_one({"email": email}, {"_id": 0})
                    if not lead:
                        continue
                    # Match a prior "sent" event from us to this lead
                    parent = await db.outreach_events.find_one(
                        {"lead_id": lead["id"], "kind": "sent"},
                        sort=[("at", -1)], projection={"_id": 0},
                    )
                    if not parent:
                        continue
                    body_text, body_html = _decode_gmail_body(full.get("payload") or {})
                    snippet = full.get("snippet") or ""
                    await db.outreach_events.insert_one({
                        "id": uuid.uuid4().hex,
                        "lead_id": lead["id"],
                        "campaign_id": parent.get("campaign_id", ""),
                        "kind": "replied", "at": _now(),
                        "meta": {
                            "gmail_message_id": mid,
                            "thread_id": full.get("threadId", ""),
                            "subject": headers.get("Subject", ""),
                            "from": from_addr,
                            "to": headers.get("To", ""),
                            "snippet": snippet,
                            "body_text": body_text[:20000],
                            "body_html": body_html[:60000],
                            "in_reply_to": headers.get("In-Reply-To", ""),
                            "references": headers.get("References", ""),
                        },
                    })
                    await _bump_score_fn(lead["id"], "replied", parent.get("campaign_id"))
                    if parent.get("campaign_id"):
                        await db.outreach_campaigns.update_one(
                            {"id": parent["campaign_id"]}, {"$inc": {"stats.replied": 1}}
                        )
                    # Stop any active sequence enrolment
                    await db.outreach_sequence_enrol.update_many(
                        {"lead_id": lead["id"], "status": "active"},
                        {"$set": {"status": "stopped_replied", "updated_at": _now()}},
                    )
                    # Notify owner
                    owner_email = lead.get("created_by") or ""
                    if owner_email:
                        owner = await db.users.find_one({"email": owner_email}, {"_id": 0, "id": 1})
                        if owner:
                            await db.notifications.insert_one({
                                "id": uuid.uuid4().hex,
                                "user_id": owner.get("id"),
                                "type": "lead_replied",
                                "title": f"💬 {lead.get('first_name') or lead.get('email')} replied",
                                "body": (snippet or "")[:140] or f"{lead.get('email')} just replied — auto-paused their sequence.",
                                "link": f"/app/leads?tab=inbox&lead={lead['id']}",
                                "read": False,
                                "created_at": _now(),
                            })
                    added += 1
            except Exception:
                continue
        return {"matched": added}

    @api.post("/outreach/replies/sync")
    async def manual_reply_sync(user=Depends(_require_priv)):
        return await _sync_replies()

    db._outreach_sync_replies = _sync_replies

    # ===== Conversation views (per lead + global inbox) =====
    @api.get("/outreach/leads/{lid}/conversation")
    async def lead_conversation(lid: str, user=Depends(_require_priv)):
        """Return the merged sent/replied conversation timeline for one lead."""
        lead = await db.outreach_leads.find_one({"id": lid}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        cur = db.outreach_events.find(
            {"lead_id": lid, "kind": {"$in": ["sent", "replied"]}},
            {"_id": 0},
        ).sort("at", 1)
        events = await cur.to_list(500)
        msgs = []
        for e in events:
            meta = e.get("meta") or {}
            msgs.append({
                "id": e.get("id"),
                "direction": "out" if e.get("kind") == "sent" else "in",
                "at": e.get("at"),
                "subject": meta.get("subject", ""),
                "body_html": meta.get("body_html", ""),
                "body_text": meta.get("body_text", ""),
                "snippet": meta.get("snippet", ""),
                "from": meta.get("from", ""),
                "to": meta.get("to", ""),
                "thread_id": meta.get("thread_id", ""),
                "gmail_message_id": meta.get("gmail_message_id", "") or meta.get("message_id", ""),
                "campaign_id": e.get("campaign_id", ""),
            })
        return {"lead": lead, "messages": msgs}

    @api.get("/outreach/inbox")
    async def outreach_inbox(limit: int = Query(100, ge=1, le=500), user=Depends(_require_priv)):
        """Aggregated inbound replies across every lead — newest first."""
        cur = db.outreach_events.find(
            {"kind": "replied"}, {"_id": 0},
        ).sort("at", -1).limit(int(limit))
        replies = await cur.to_list(limit)
        lead_ids = list({r.get("lead_id") for r in replies if r.get("lead_id")})
        lead_map: Dict[str, Dict[str, Any]] = {}
        if lead_ids:
            lcur = db.outreach_leads.find({"id": {"$in": lead_ids}}, {"_id": 0})
            async for ldoc in lcur:
                lead_map[ldoc["id"]] = ldoc
        rows = []
        for r in replies:
            meta = r.get("meta") or {}
            lead = lead_map.get(r.get("lead_id") or "", {})
            rows.append({
                "id": r.get("id"),
                "lead_id": r.get("lead_id"),
                "lead_name": (f"{lead.get('first_name','')} {lead.get('last_name','')}").strip() or lead.get("email") or "Unknown",
                "lead_email": lead.get("email", ""),
                "company": lead.get("company", ""),
                "at": r.get("at"),
                "subject": meta.get("subject", ""),
                "snippet": (meta.get("snippet") or meta.get("body_text", "") or "")[:240],
                "campaign_id": r.get("campaign_id", ""),
            })
        return {"items": rows, "total": len(rows)}

    # ===== AI reply assistant =====
    @api.post("/outreach/leads/{lid}/ai-reply")
    async def ai_reply_draft(lid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_require_priv)):
        """Reads the lead's latest inbound reply + conversation context and
        drafts a contextual reply using Gemini via the Emergent LLM key.
        Optional payload.tone: friendly | professional | concise | persuasive.
        Optional payload.guidance: free-text instruction to steer the draft.
        Returns: {subject, body_html, body_text}."""
        lead = await db.outreach_leads.find_one({"id": lid}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        tone = (payload.get("tone") or "professional").lower()
        if tone not in {"friendly", "professional", "concise", "persuasive"}:
            tone = "professional"
        guidance = (payload.get("guidance") or "").strip()
        # Gather last 6 conversation items (newest last)
        cur = db.outreach_events.find(
            {"lead_id": lid, "kind": {"$in": ["sent", "replied"]}}, {"_id": 0},
        ).sort("at", 1)
        events = await cur.to_list(500)
        if not events:
            raise HTTPException(400, "No conversation history yet for this lead")
        tail = events[-6:]
        # Build a compact transcript
        transcript_parts: List[str] = []
        last_reply_subject = ""
        for e in tail:
            meta = e.get("meta") or {}
            who = "PROJEXINO" if e.get("kind") == "sent" else (lead.get("first_name") or lead.get("email") or "LEAD")
            body = (meta.get("body_text") or "").strip() or re.sub(r"<[^>]+>", " ", (meta.get("body_html") or "")).strip()
            if not body:
                body = meta.get("snippet", "") or ""
            body = re.sub(r"\s+", " ", body)[:1500]
            subj = meta.get("subject", "")
            if e.get("kind") == "replied":
                last_reply_subject = subj
            transcript_parts.append(f"[{who} · {e.get('at','')}] Subject: {subj}\n{body}")
        transcript = "\n\n".join(transcript_parts)
        try:
            import os as _os
            import json as _json
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            key = _os.environ.get("EMERGENT_LLM_KEY")
            if not key:
                raise HTTPException(400, "EMERGENT_LLM_KEY not configured")
            tone_hints = {
                "friendly": "warm, helpful, lightly conversational",
                "professional": "polite, crisp, business-formal",
                "concise": "short — under 90 words, no fluff",
                "persuasive": "confident, value-led, with a strong call to action",
            }[tone]
            sys_msg = (
                "You are a senior B2B SDR at Projexino. You are drafting a reply "
                "to a prospect's latest email. Analyse the conversation, identify "
                "what the prospect is asking or signalling, then write a reply that "
                f"is {tone_hints}. Keep the body under 130 words. Use the variable "
                "{{FirstName}} for personalisation. End with exactly one ask "
                "(e.g. a 15-min call). Do not add a signature."
            )
            if guidance:
                sys_msg += f" Extra guidance from the user: {guidance[:300]}"
            chat = (LlmChat(api_key=key, session_id=f"outreach-ai-reply-{uuid.uuid4().hex[:8]}",
                            system_message=sys_msg)
                    .with_model("gemini", "gemini-2.5-flash"))
            reply_subj_hint = last_reply_subject or "Re: our last email"
            if not reply_subj_hint.lower().startswith("re:"):
                reply_subj_hint = f"Re: {reply_subj_hint}"
            user_msg = UserMessage(text=(
                f"Conversation transcript (oldest first):\n\n{transcript}\n\n"
                "Now draft my reply. Return a JSON object with exactly two keys:\n"
                f"  subject — a short subject line (suggest: '{reply_subj_hint}')\n"
                "  body_html — valid HTML using <p>, optional <ul>/<li>, no <html>/<body> wrapper.\n"
                "Return only the JSON object."
            ))
            raw = await chat.send_message(user_msg)
            text = str(raw or "")
            json_block = re.search(r"\{[\s\S]*\}", text)
            if not json_block:
                raise ValueError("AI did not return JSON")
            data = _json.loads(json_block.group(0))
            body_html = data.get("body_html", "") or ""
            body_text = re.sub(r"<[^>]+>", " ", body_html)
            body_text = re.sub(r"\s+", " ", body_text).strip()
            return {
                "subject": (data.get("subject") or reply_subj_hint)[:200],
                "body_html": body_html,
                "body_text": body_text,
                "tone": tone,
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"AI reply failed: {str(e)[:200]}")

    @api.post("/outreach/leads/{lid}/send-reply")
    async def send_reply(lid: str, payload: Dict[str, Any] = Body(...), user=Depends(_require_priv)):
        """Send a (manually-edited or AI-drafted) reply to the lead via Gmail.
        Threads it onto the most recent inbound reply using In-Reply-To/References."""
        lead = await db.outreach_leads.find_one({"id": lid}, {"_id": 0})
        if not lead:
            raise HTTPException(404, "Lead not found")
        subject = (payload.get("subject") or "").strip()
        body_html = (payload.get("body_html") or "").strip()
        if not subject or not body_html:
            raise HTTPException(400, "subject and body_html required")
        from_token_id = payload.get("from_token_id") or None
        # Find the most-recent inbound reply for threading hints
        last_inbound = await db.outreach_events.find_one(
            {"lead_id": lid, "kind": "replied"},
            sort=[("at", -1)], projection={"_id": 0},
        )
        thread_id = (last_inbound or {}).get("meta", {}).get("thread_id") or ""
        gmail_mid = (last_inbound or {}).get("meta", {}).get("gmail_message_id") or ""
        from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
        token = await _resolve_send_token(db, from_token_id)
        if not token:
            raise HTTPException(400, "Gmail not connected — connect from Settings")
        try:
            token = await _refresh_if_needed(db, token)
            service = _build_gmail_service(token)
        except HTTPException:
            raise
        except Exception as e:
            # Stale / revoked OAuth client, expired refresh token, etc.
            raise HTTPException(400, f"Gmail not connected — reconnect from Settings ({str(e)[:120]})")
        # Personalise variables
        p_subj, p_body = _personalise(body_html, subject, lead)
        # Inject open/click tracking like normal outbound
        event_id = uuid.uuid4().hex
        tracked = _inject_tracking_fn(p_body, event_id)
        msg = MIMEMultipart("alternative")
        msg["Subject"] = p_subj
        msg["From"] = f'"Projexino" <{token.get("email")}>'
        msg["To"] = lead["email"]
        if gmail_mid:
            # In-Reply-To wants the RFC822 Message-ID; if we don't have it we
            # leave the headers off — Gmail still threads when threadId matches.
            in_reply = (last_inbound or {}).get("meta", {}).get("in_reply_to") or ""
            if in_reply:
                msg["In-Reply-To"] = in_reply
                msg["References"] = ((last_inbound or {}).get("meta", {}).get("references") or in_reply)
        msg.attach(MIMEText(tracked, "html"))
        body_bytes = msg.as_bytes()
        raw = base64.urlsafe_b64encode(body_bytes).decode("ascii")
        send_body: Dict[str, Any] = {"raw": raw}
        if thread_id:
            send_body["threadId"] = thread_id
        try:
            sent = service.users().messages().send(userId="me", body=send_body).execute()
        except Exception as e:
            raise HTTPException(502, f"Gmail send failed: {str(e)[:200]}")
        await db.outreach_events.insert_one({
            "id": event_id, "lead_id": lid, "campaign_id": "",
            "kind": "sent", "at": _now(),
            "meta": {"message_id": sent.get("id"), "thread_id": sent.get("threadId"),
                     "subject": p_subj, "body_html": p_body, "from": token.get("email"),
                     "to": lead["email"], "reply_to_event": (last_inbound or {}).get("id", "")},
        })
        await db.outreach_leads.update_one(
            {"id": lid}, {"$set": {"last_contact_at": _now(), "updated_at": _now()}}
        )
        return {"ok": True, "message_id": sent.get("id"), "thread_id": sent.get("threadId")}

