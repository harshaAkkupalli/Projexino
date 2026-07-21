"""careers.py — Job Postings (admin CRUD) + public Careers listing + branded JD PDFs."""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

EMPLOYMENT_TYPES = ["full_time", "part_time", "freelancer", "internship", "contract"]
WORK_MODES = ["office", "wfh", "hybrid"]

TYPE_LABELS = {"full_time": "Full Time", "part_time": "Part Time", "freelancer": "Freelancer",
               "internship": "Internship", "contract": "Contract"}
MODE_LABELS = {"office": "In Office", "wfh": "Work From Home", "hybrid": "Hybrid"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(t: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (t or "").lower()).strip("-")
    return s or uuid.uuid4().hex[:8]


class JobIn(BaseModel):
    title: str
    department: str = ""
    employment_type: str = "full_time"
    work_mode: str = "office"
    location: str = ""
    timings: str = ""
    salary_text: str = ""
    experience: str = ""
    openings: int = 1
    skills: List[str] = []
    summary: str = ""
    responsibilities: str = ""
    requirements: str = ""
    benefits: str = ""
    apply_email: str = "careers@projexino.com"
    status: str = "open"


class JobPatch(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    employment_type: Optional[str] = None
    work_mode: Optional[str] = None
    location: Optional[str] = None
    timings: Optional[str] = None
    salary_text: Optional[str] = None
    experience: Optional[str] = None
    openings: Optional[int] = None
    skills: Optional[List[str]] = None
    summary: Optional[str] = None
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    benefits: Optional[str] = None
    apply_email: Optional[str] = None
    status: Optional[str] = None


class ApplicationIn(BaseModel):
    name: str
    email: str
    phone: str = ""
    portfolio: str = ""
    note: str = ""
    resume_filename: str
    resume_mime: str = "application/pdf"
    resume_b64: str


APP_STATUSES = ["new", "shortlisted", "interview", "hired", "rejected"]


def _bullets_html(text: str) -> str:
    lines = [l.strip().lstrip("-•*").strip() for l in (text or "").replace("\r\n", "\n").split("\n") if l.strip()]
    if not lines:
        return ""
    return "<ul>" + "".join(f"<li>{l}</li>" for l in lines) + "</ul>"


def _jd_html(job: Dict[str, Any], profile: Dict[str, Any]) -> str:
    esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;")
    logo = profile.get("logo_url") or "/projexino-logo.png"
    cname = profile.get("company_name") or "Projexino Solutions Pvt Ltd"
    site = (profile.get("website") or "https://www.projexino.com").strip()
    site_url = site if site.startswith("http") else f"https://{site}"
    details = [
        ("Employment Type", TYPE_LABELS.get(job.get("employment_type"), job.get("employment_type", ""))),
        ("Work Mode", MODE_LABELS.get(job.get("work_mode"), job.get("work_mode", ""))),
        ("Location", job.get("location") or "—"),
        ("Salary", job.get("salary_text") or "As per industry standards"),
        ("Timings", job.get("timings") or "—"),
        ("Experience", job.get("experience") or "—"),
        ("Openings", str(job.get("openings") or 1)),
        ("Department", job.get("department") or "—"),
    ]
    detail_cells = "".join(
        f'<div class="cell"><div class="k">{k}</div><div class="v">{esc(v)}</div></div>' for k, v in details)
    skills = "".join(f'<span class="chip">{esc(s)}</span>' for s in (job.get("skills") or []))
    sections = ""
    for label, key in [("About the Role", "summary"), ("Key Responsibilities", "responsibilities"),
                       ("Requirements", "requirements"), ("What We Offer", "benefits")]:
        val = (job.get(key) or "").strip()
        if not val:
            continue
        body = _bullets_html(val) if key != "summary" else f"<p>{esc(val)}</p>"
        sections += f'<div class="sec"><h2>{label}</h2>{body}</div>'
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 15mm 20mm 15mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: Helvetica, Arial, sans-serif; color:#1F2937; font-size:10pt; line-height:1.65; margin:0; }}
.brand {{ display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #F97316; padding-bottom:10px; }}
.brand img {{ height:34px; }}
.brand .co {{ text-align:right; }}
.brand .co .n {{ font-weight:700; color:#0F2042; font-size:11pt; }}
.brand .co .s {{ color:#64748B; font-size:8pt; }}
.chiprow {{ margin:14px 0 4px; }}
.tag {{ display:inline-block; background:#FFF7ED; color:#C2410C; border:1px solid #FED7AA; border-radius:99px; padding:2px 10px; font-size:8pt; font-weight:700; letter-spacing:.08em; margin-right:6px; }}
h1 {{ font-size:20pt; color:#0F2042; margin:6px 0 2px; }}
.dept {{ color:#F97316; font-weight:700; font-size:9.5pt; letter-spacing:.18em; text-transform:uppercase; }}
.grid {{ display:flex; flex-wrap:wrap; border:1px solid #E2E8F0; border-radius:10px; margin:14px 0; overflow:hidden; }}
.cell {{ width:25%; padding:9px 12px; border-right:1px solid #EDF2F7; border-bottom:1px solid #EDF2F7; }}
.cell .k {{ font-size:6.5pt; text-transform:uppercase; letter-spacing:.12em; color:#94A3B8; font-weight:700; }}
.cell .v {{ font-size:9pt; font-weight:700; color:#0F2042; margin-top:1px; }}
.chip {{ display:inline-block; background:#F1F5F9; color:#334155; border-radius:99px; padding:2px 9px; font-size:8pt; font-weight:700; margin:0 5px 5px 0; }}
.sec h2 {{ font-size:12pt; color:#0F2042; border-bottom:2px solid #F97316; display:inline-block; padding-bottom:2px; margin:16px 0 6px; }}
.sec ul {{ margin:4px 0; padding-left:18px; }}
.sec li {{ margin:3px 0; }}
.apply {{ margin-top:22px; background:#0F2042; color:#fff; border-radius:12px; padding:14px 18px; }}
.apply b {{ color:#F97316; }}
.apply a {{ color:#FDBA74; text-decoration:underline; }}
.foot {{ margin-top:14px; text-align:center; color:#94A3B8; font-size:7.5pt; }}
.foot a {{ color:#F97316; text-decoration:none; }}
</style></head><body>
<div class="brand">
  <img src="{logo}" alt="logo"/>
  <div class="co"><div class="n">{esc(cname)}</div><div class="s">JOB DESCRIPTION · {datetime.now(timezone.utc).strftime('%d %b %Y')}</div></div>
</div>
<div class="chiprow">
  <span class="tag">{TYPE_LABELS.get(job.get('employment_type'), '')}</span>
  <span class="tag">{MODE_LABELS.get(job.get('work_mode'), '')}</span>
  <span class="tag">{esc(job.get('status', 'open')).upper()}</span>
</div>
<div class="dept">{esc(job.get('department') or 'Careers')}</div>
<h1>{esc(job.get('title'))}</h1>
<div class="grid">{detail_cells}</div>
{f'<div class="sec"><h2>Skills</h2><div>{skills}</div></div>' if skills else ''}
{sections}
<div class="apply">
  <b>How to apply:</b> Send your resume &amp; portfolio to
  <a href="mailto:{esc(job.get('apply_email') or 'careers@projexino.com')}">{esc(job.get('apply_email') or 'careers@projexino.com')}</a>
  with the subject line “Application — {esc(job.get('title'))}”.
</div>
<div class="foot">{esc(cname)} · <a href="{site_url}">{esc(site_url.replace('https://','').replace('http://',''))}</a> · This JD is system-generated from the Projexino Careers portal.</div>
</body></html>"""


def register_careers(api: APIRouter, db, get_current_user):

    async def _require_priv(user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin", "manager", "hr"):
            raise HTTPException(403, "Not authorized")
        return user

    async def _profile() -> Dict[str, Any]:
        doc = await db.hr_letter_settings.find_one({"id": "singleton"}, {"_id": 0})
        return doc or {}

    def _render_pdf(job: Dict[str, Any], profile: Dict[str, Any]) -> bytes:
        from weasyprint import HTML
        base_url = (os.environ.get("PUBLIC_FRONTEND_URL") or os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
        return HTML(string=_jd_html(job, profile), base_url=base_url).write_pdf()

    # ---------- Admin ----------
    @api.get("/careers/jobs")
    async def list_jobs(user=Depends(_require_priv)):
        jobs = await db.job_postings.find({}, {"_id": 0}).sort("created_at", -1).to_list(300)
        counts = {c["_id"]: c["n"] async for c in db.job_applications.aggregate(
            [{"$group": {"_id": "$job_id", "n": {"$sum": 1}}}])}
        for j in jobs:
            j["application_count"] = counts.get(j["id"], 0)
        return jobs

    @api.post("/careers/jobs")
    async def create_job(payload: JobIn, user=Depends(_require_priv)):
        if payload.employment_type not in EMPLOYMENT_TYPES:
            raise HTTPException(400, "Invalid employment type")
        if payload.work_mode not in WORK_MODES:
            raise HTTPException(400, "Invalid work mode")
        base = _slugify(payload.title)
        slug, n = base, 2
        while await db.job_postings.find_one({"slug": slug}):
            slug = f"{base}-{n}"
            n += 1
        doc = {**payload.model_dump(), "id": uuid.uuid4().hex, "slug": slug,
               "created_at": _now(), "updated_at": _now(), "created_by": user.get("email", "")}
        await db.job_postings.insert_one(dict(doc))
        doc.pop("_id", None)
        return doc

    @api.patch("/careers/jobs/{jid}")
    async def patch_job(jid: str, payload: JobPatch, user=Depends(_require_priv)):
        d = await db.job_postings.find_one({"id": jid}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Job not found")
        upd = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        upd["updated_at"] = _now()
        await db.job_postings.update_one({"id": jid}, {"$set": upd})
        d.update(upd)
        return d

    @api.delete("/careers/jobs/{jid}")
    async def delete_job(jid: str, user=Depends(_require_priv)):
        r = await db.job_postings.delete_one({"id": jid})
        if not r.deleted_count:
            raise HTTPException(404, "Job not found")
        return {"ok": True}

    # ---------- Careers settings (ATS notification email) ----------
    @api.get("/careers/settings")
    async def get_careers_settings(user=Depends(_require_priv)):
        doc = await db.careers_settings.find_one({"id": "singleton"}, {"_id": 0})
        return doc or {"id": "singleton", "notify_email": ""}

    @api.put("/careers/settings")
    async def put_careers_settings(payload: Dict[str, Any], user=Depends(_require_priv)):
        email = ((payload or {}).get("notify_email") or "").strip()
        if email and "@" not in email:
            raise HTTPException(400, "Enter a valid email")
        await db.careers_settings.update_one(
            {"id": "singleton"},
            {"$set": {"notify_email": email, "updated_at": _now(), "updated_by": user.get("email", "")}},
            upsert=True)
        return {"ok": True, "notify_email": email}

    # ---------- Public (Careers page) ----------
    @api.get("/public/careers/jobs")
    async def public_jobs(q: str = "", employment_type: str = "", work_mode: str = ""):
        query: Dict[str, Any] = {"status": "open"}
        if employment_type in EMPLOYMENT_TYPES:
            query["employment_type"] = employment_type
        if work_mode in WORK_MODES:
            query["work_mode"] = work_mode
        if q.strip():
            rx = {"$regex": re.escape(q.strip()), "$options": "i"}
            query["$or"] = [{"title": rx}, {"department": rx}, {"location": rx},
                            {"skills": rx}, {"summary": rx}]
        return await db.job_postings.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

    @api.get("/public/careers/jobs/{slug}")
    async def public_job(slug: str):
        d = await db.job_postings.find_one({"slug": slug, "status": "open"}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Job not found")
        return d

    @api.get("/public/careers/jobs/{slug}/jd.pdf")
    async def public_jd_pdf(slug: str):
        d = await db.job_postings.find_one({"slug": slug}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Job not found")
        try:
            pdf = _render_pdf(d, await _profile())
        except Exception as e:
            raise HTTPException(500, f"PDF render failed: {str(e)[:200]}")
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="JD-{d["slug"]}.pdf"'})

    # ---------- Mini ATS: applications ----------
    @api.post("/public/careers/jobs/{slug}/apply")
    async def apply_job(slug: str, payload: ApplicationIn):
        import base64 as _b64
        job = await db.job_postings.find_one({"slug": slug, "status": "open"}, {"_id": 0})
        if not job:
            raise HTTPException(404, "This position is no longer open")
        if "@" not in payload.email:
            raise HTTPException(400, "Enter a valid email")
        try:
            resume_bytes = _b64.b64decode(payload.resume_b64, validate=True)
        except Exception:
            raise HTTPException(400, "Invalid resume file")
        if len(resume_bytes) > 5 * 1024 * 1024:
            raise HTTPException(400, "Resume must be under 5 MB")
        dup = await db.job_applications.find_one({"job_id": job["id"], "email": payload.email.strip().lower()})
        if dup:
            raise HTTPException(400, "You have already applied for this role")
        aid = uuid.uuid4().hex
        app_doc = {
            "id": aid, "job_id": job["id"], "job_slug": slug, "job_title": job["title"],
            "name": payload.name.strip(), "email": payload.email.strip().lower(),
            "phone": payload.phone.strip(), "portfolio": payload.portfolio.strip(),
            "note": payload.note.strip()[:2000],
            "resume_filename": payload.resume_filename[:120],
            "resume_mime": payload.resume_mime or "application/pdf",
            "resume_b64": payload.resume_b64,
            "status": "new", "created_at": _now(), "updated_at": _now(),
        }
        await db.job_applications.insert_one(dict(app_doc))
        # Drop resume into the Documents module (folder "Resumes") owned by super admin
        try:
            owner = await db.users.find_one({"role": "super_admin"}, {"_id": 0, "id": 1, "name": 1}) \
                or await db.users.find_one({"role": "admin"}, {"_id": 0, "id": 1, "name": 1})
            if owner:
                await db.documents.insert_one({
                    "id": uuid.uuid4().hex, "owner_id": owner["id"],
                    "name": f"{payload.name.strip()} — {payload.resume_filename[:80]}",
                    "mime_type": app_doc["resume_mime"], "size": len(resume_bytes),
                    "content_base64": payload.resume_b64,
                    "project_id": "", "shared_with": [], "comments": [],
                    "description": f"Resume · applied for {job['title']} ({payload.email})",
                    "folder": "Resumes", "uploader": payload.name.strip(),
                    "created_at": _now(),
                })
        except Exception:
            pass
        # Auto email notification to the hiring inbox (best effort — Gmail may be disconnected)
        notified = False
        try:
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            from email.mime.base import MIMEBase
            from email import encoders
            from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
            token = await _resolve_send_token(db, None)
            if token:
                token = await _refresh_if_needed(db, token)
                service = _build_gmail_service(token)
                msg = MIMEMultipart("mixed")
                html = (f"<h3>New application · {job['title']}</h3>"
                        f"<p><b>{payload.name}</b> · {payload.email} · {payload.phone or '—'}<br/>"
                        f"Portfolio: {payload.portfolio or '—'}</p>"
                        f"<p>{payload.note or ''}</p>"
                        f"<p style='color:#64748B;font-size:12px'>Resume attached · saved to Documents → Resumes and the Job Postings ATS.</p>")
                alt = MIMEMultipart("alternative")
                alt.attach(MIMEText(re.sub(r"<[^>]+>", "", html), "plain"))
                alt.attach(MIMEText(html, "html"))
                msg.attach(alt)
                part = MIMEBase("application", "octet-stream")
                part.set_payload(resume_bytes)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=app_doc["resume_filename"])
                msg.attach(part)
                msg["Subject"] = f"New application — {job['title']} — {payload.name}"
                msg["From"] = f'"Projexino Careers" <{token.get("email")}>'
                settings = await db.careers_settings.find_one({"id": "singleton"}) or {}
                msg["To"] = settings.get("notify_email") or job.get("apply_email") or "careers@projexino.com"
                import base64 as _bb
                raw = _bb.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
                service.users().messages().send(userId="me", body={"raw": raw}).execute()
                notified = True
        except Exception:
            pass
        return {"ok": True, "application_id": aid, "email_notified": notified}

    @api.get("/careers/applications")
    async def list_applications(job_id: str = "", user=Depends(_require_priv)):
        q = {"job_id": job_id} if job_id else {}
        return await db.job_applications.find(q, {"_id": 0, "resume_b64": 0}).sort("created_at", -1).to_list(500)

    @api.patch("/careers/applications/{aid}")
    async def patch_application(aid: str, payload: Dict[str, Any], user=Depends(_require_priv)):
        status = (payload or {}).get("status")
        if status not in APP_STATUSES:
            raise HTTPException(400, "Invalid status")
        r = await db.job_applications.update_one({"id": aid}, {"$set": {"status": status, "updated_at": _now()}})
        if not r.matched_count:
            raise HTTPException(404, "Application not found")
        return {"ok": True, "status": status}

    @api.get("/careers/applications/{aid}/resume")
    async def download_resume(aid: str, user=Depends(_require_priv)):
        d = await db.job_applications.find_one({"id": aid}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Application not found")
        return {"filename": d["resume_filename"], "mime": d.get("resume_mime") or "application/pdf",
                "b64": d.get("resume_b64") or ""}
