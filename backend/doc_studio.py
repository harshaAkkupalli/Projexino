"""doc_studio.py — AI Document Studio (intern module, ported natively).

Generates SDD / Project Plan / SRS documents from a project description.
Works WITH AI (via portable ai_provider — any key) and WITHOUT AI
(deterministic template generation from the structured data).
"""
from __future__ import annotations

import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from fastapi.responses import Response

DOC_KINDS = ("sdd", "plan", "srs")
KIND_LABELS = {"sdd": "Software Design Document", "plan": "Project Plan", "srs": "Software Requirements Specification"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_list(items: Any, cap: int = 12) -> List[str]:
    if not items:
        return []
    if isinstance(items, str):
        items = [items]
    out, seen = [], set()
    for it in items:
        t = re.sub(r"\s+", " ", str(it or "")).strip(" -•*")
        if not t or t.lower() in {"n/a", "na", "none", "not specified", "string"}:
            continue
        if t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out[:cap]


def _normalize_data(raw: Dict[str, Any]) -> Dict[str, Any]:
    raw = raw or {}
    mods = []
    for m in (raw.get("modules") or [])[:12]:
        if isinstance(m, str):
            mods.append({"name": m, "purpose": "", "features": []})
        elif isinstance(m, dict):
            mods.append({"name": str(m.get("name") or "").strip()[:80],
                         "purpose": str(m.get("purpose") or "").strip()[:300],
                         "features": _clean_list(m.get("features"), 8)})
    ents = []
    for e in (raw.get("entities") or [])[:12]:
        if isinstance(e, dict):
            ents.append({"name": str(e.get("name") or "").strip()[:80],
                         "purpose": str(e.get("purpose") or "").strip()[:300],
                         "attributes": _clean_list(e.get("attributes"), 10)})
    return {
        "project_name": str(raw.get("project_name") or "Untitled Project").strip()[:120],
        "project_type": str(raw.get("project_type") or "Software Application").strip()[:80],
        "domain": str(raw.get("domain") or "General").strip()[:80],
        "problem_statement": str(raw.get("problem_statement") or "").strip()[:2000],
        "goals": _clean_list(raw.get("goals")),
        "modules": [m for m in mods if m["name"]],
        "entities": [e for e in ents if e["name"]],
        "requirements": _clean_list(raw.get("requirements")),
        "tech_stack": _clean_list(raw.get("tech_stack") or raw.get("tech_stack_hints")),
        "constraints": _clean_list(raw.get("constraints")),
        "risks": _clean_list(raw.get("risks") or raw.get("risk_hints")),
        "timeline_weeks": int(raw.get("timeline_weeks") or 6),
    }


# ---------------- Manual (no-AI) analysis ----------------
TECH_KEYWORDS = ["react", "angular", "vue", "next.js", "node", "express", "fastapi", "django", "flask",
                 "python", "java", "spring", "kotlin", "swift", "flutter", "react native", "mongodb",
                 "postgresql", "mysql", "firebase", "aws", "azure", "docker", "kubernetes", "tailwind",
                 "typescript", "javascript", "php", "laravel", ".net", "c#", "redis", "graphql", "ai", "ml"]


def _heuristic_analyze(text: str) -> Dict[str, Any]:
    lines = [l.strip() for l in (text or "").replace("\r\n", "\n").split("\n") if l.strip()]
    name = (lines[0][:100] if lines else "Untitled Project")
    name = re.sub(r"^(project\s*(name|title)?\s*[:\-]\s*)", "", name, flags=re.I).strip() or "Untitled Project"
    bullets = [re.sub(r"^[-•*\d.)\s]+", "", l) for l in lines if re.match(r"^\s*[-•*]|\d+[.)]", l)]
    low = (text or "").lower()
    stack = [k.title() if k not in (".net", "c#") else k for k in TECH_KEYWORDS if k in low]
    goals = [b for b in bullets if len(b) > 10][:8]
    return _normalize_data({
        "project_name": name,
        "problem_statement": " ".join(lines[1:4])[:1200] if len(lines) > 1 else (text or "")[:1200],
        "goals": goals,
        "tech_stack": stack,
    })


# ---------------- Template (no-AI) document generators ----------------
def _bullets(items: List[str], fallback: str) -> str:
    return "".join(f"- {i}\n" for i in items) if items else fallback


def _tpl_sdd(d: Dict[str, Any]) -> str:
    mods = "".join(
        f"\n### {i+1}. {m['name']}\n{m['purpose'] or 'Core module of the system.'}\n"
        + ("".join(f"- {f}\n" for f in m["features"]) if m["features"] else "")
        for i, m in enumerate(d["modules"])) or "\n_Add modules in the Structure step to enrich this section._\n"
    ents = "".join(
        f"\n### {e['name']}\n{e['purpose']}\n"
        + ("".join(f"- `{a}`\n" for a in e["attributes"]) if e["attributes"] else "")
        for e in d["entities"])
    goals = _bullets(d["goals"], "- Deliver a reliable, maintainable software product.\n")
    reqs = _bullets(d["requirements"], "- Performance: interactive responses under 2 seconds.\n- Security: authenticated access, encrypted transport (HTTPS).\n- Maintainability: modular codebase with documented interfaces.\n")
    cons = _bullets(d["constraints"], "- Timeline and resource availability as per the project plan.\n")
    risks = _bullets(d["risks"], "- Scope creep — mitigate with a locked requirements baseline and change control.\n")
    ents_sec = ents if ents else "\n_Define entities in the Structure step to generate the data model._"
    stack = ", ".join(d["tech_stack"]) or "To be finalized"
    return f"""# Software Design Document — {d['project_name']}

## 1. Introduction
**Project type:** {d['project_type']}  ·  **Domain:** {d['domain']}

{d['problem_statement'] or 'This document describes the software design for the project.'}

## 2. Goals & Objectives
{goals}
## 3. System Architecture
The system follows a layered architecture: presentation layer (client UI), application layer (business logic & APIs) and data layer (persistent storage). Components communicate over well-defined interfaces to keep modules independently testable and replaceable.

**Technology stack:** {stack}

## 4. Module Design
{mods}
## 5. Data Design{ents_sec}

## 6. Non-Functional Requirements
{reqs}
## 7. Constraints & Assumptions
{cons}
## 8. Risks
{risks}"""


def _tpl_plan(d: Dict[str, Any]) -> str:
    weeks = max(2, min(d.get("timeline_weeks") or 6, 24))
    phases = [
        ("Discovery & Requirements", "Finalize scope, requirements sign-off, environment setup", "Signed-off requirements & repo/CI ready"),
        ("Design", "Architecture, data model, UI wireframes", "Approved SDD & wireframes"),
        ("Core Development", "Build primary modules: " + (", ".join(m["name"] for m in d["modules"][:4]) or "core features"), "Working core feature set"),
        ("Secondary Development & Integration", "Remaining modules, integrations, admin features", "Feature-complete build"),
        ("Testing & Hardening", "Functional, regression and security testing; bug fixing", "Test report with sign-off"),
        ("Deployment & Handover", "Production deployment, documentation, training", "Live system + handover docs"),
    ]
    per = max(1, weeks // len(phases))
    rows, wk = "", 1
    for i, (phase, desc, deliverable) in enumerate(phases):
        end = weeks if i == len(phases) - 1 else min(wk + per - 1, weeks)
        rows += f"| W{wk}–W{end} | {phase} | {desc} | {deliverable} |\n"
        wk = end + 1
        if wk > weeks:
            break
    stack = ", ".join(d["tech_stack"]) or "To be finalized"
    risks = "".join(f"- **{r}** — assign an owner early and review mitigation progress weekly.\n" for r in d["risks"]) \
        or "- **Scope creep** — lock the baseline; route new asks through change control.\n- **Timeline slippage** — weekly burndown reviews; re-plan at each milestone.\n"
    accept = _bullets(d["goals"][:6], "- All planned modules implemented and passing QA.\n")
    return f"""# Project Plan — {d['project_name']}

**Duration:** {weeks} weeks  ·  **Tech stack:** {stack}

## 1. Milestones
| Weeks | Phase | Key Work | Deliverable |
|---|---|---|---|
{rows}
## 2. Team & Responsibilities
- Project owner — scope, priorities and approvals
- Development team — implementation & unit testing
- QA — test planning and execution
- Stakeholders — milestone reviews and UAT

## 3. Risks & Mitigations
{risks}
## 4. Acceptance Criteria
{accept}- Documentation and handover completed."""


def _tpl_srs(d: Dict[str, Any]) -> str:
    frs = ""
    n = 1
    for m in d["modules"]:
        for f in (m["features"] or [m["purpose"] or m["name"]]):
            frs += f"- **FR-{n:02d}** ({m['name']}): The system shall {f[0].lower() + f[1:] if f else ''}\n"
            n += 1
    if not frs:
        frs = "".join(f"- **FR-{i+1:02d}**: The system shall {g[0].lower() + g[1:]}\n" for i, g in enumerate(d["goals"])) or "- **FR-01**: The system shall implement the core workflow described in the problem statement.\n"
    nfrs = "".join(f"- **NFR-{i+1:02d}**: {r}\n" for i, r in enumerate(d["requirements"])) \
        or "- **NFR-01**: Responses to user actions within 2 seconds under normal load.\n- **NFR-02**: Role-based access control for all protected operations.\n- **NFR-03**: Daily automated backups of persistent data.\n"
    cons = _bullets(d["constraints"], "- Delivery within the agreed timeline and budget.\n")
    stack = ", ".join(d["tech_stack"]) or "a technology stack to be finalized"
    return f"""# Software Requirements Specification — {d['project_name']}

## 1. Introduction
**Purpose:** Define the functional and non-functional requirements for {d['project_name']} ({d['project_type']}, {d['domain']}).

**Scope:** {d['problem_statement'] or 'As described by the project stakeholders.'}

## 2. Overall Description
The product serves users in the {d['domain']} domain. It will be built with {stack} and organised into {len(d['modules']) or 'several'} functional modules.

## 3. Functional Requirements
{frs}
## 4. Non-Functional Requirements
{nfrs}
## 5. Constraints
{cons}
## 6. Acceptance
Each functional requirement is verified by at least one test case; UAT sign-off by the project owner concludes acceptance."""


TEMPLATE_GENERATORS = {"sdd": _tpl_sdd, "plan": _tpl_plan, "srs": _tpl_srs}


# ---------------- Markdown → branded PDF ----------------
def _md_to_html(md: str) -> str:
    import markdown as mdlib
    return mdlib.markdown(md or "", extensions=["tables", "fenced_code"])


def _doc_html(md: str, kind: str, d: Dict[str, Any], profile: Dict[str, Any]) -> str:
    esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;")
    logo = profile.get("logo_url") or "/projexino-logo.png"
    from extensions import logo_data_uri
    logo = logo_data_uri(logo)
    cname = profile.get("company_name") or "Projexino Solutions Pvt Ltd"
    body = _md_to_html(md)
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 15mm 20mm 15mm; }}
body {{ font-family: Helvetica, Arial, sans-serif; color:#1F2937; font-size:9.5pt; line-height:1.65; margin:0; }}
.brand {{ display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #F97316; padding-bottom:10px; margin-bottom:14px; }}
.brand img {{ height:34px; }}
.brand .co {{ text-align:right; }}
.brand .co .n {{ font-weight:700; color:#0F2042; font-size:11pt; }}
.brand .co .s {{ color:#64748B; font-size:8pt; }}
h1 {{ font-size:17pt; color:#0F2042; margin:8px 0 4px; }}
h2 {{ font-size:12pt; color:#0F2042; border-bottom:2px solid #F97316; display:inline-block; padding-bottom:2px; margin:16px 0 6px; }}
h3 {{ font-size:10.5pt; color:#C2410C; margin:12px 0 4px; }}
ul {{ margin:4px 0; padding-left:18px; }}
li {{ margin:2.5px 0; }}
table {{ border-collapse:collapse; width:100%; margin:8px 0; font-size:8.5pt; }}
th {{ background:#0F2042; color:#fff; padding:6px 8px; text-align:left; }}
td {{ border:1px solid #E2E8F0; padding:5px 8px; }}
code {{ background:#F1F5F9; border-radius:4px; padding:1px 5px; font-size:8.5pt; }}
.foot {{ margin-top:16px; text-align:center; color:#94A3B8; font-size:7.5pt; border-top:1px solid #E2E8F0; padding-top:8px; }}
</style></head><body>
<div class="brand">
  <img src="{logo}" alt="logo"/>
  <div class="co"><div class="n">{esc(cname)}</div><div class="s">{KIND_LABELS[kind].upper()} · {datetime.now(timezone.utc).strftime('%d %b %Y')}</div></div>
</div>
{body}
<div class="foot">{esc(cname)} · {esc(d.get('project_name',''))} · Generated by Projexino Doc Studio</div>
</body></html>"""


# ---------------- AI prompts ----------------
ANALYZE_SYS = (
    "You are an expert software analyst. Extract a structured project profile from the raw description. "
    "Return ONLY valid JSON with keys: project_name, project_type, domain, problem_statement, goals[], "
    "modules[{name,purpose,features[]}], entities[{name,purpose,attributes[]}], requirements[] (non-functional), "
    "tech_stack[], constraints[], risks[], timeline_weeks (int). "
    "No placeholders like 'Module 1' or 'N/A'. Stay faithful to the user's domain — never invent unrelated features."
)

GEN_SYS = {
    "sdd": "You are a senior software architect writing a Software Design Document. Use clean Markdown with '#' title and '##' numbered sections: Introduction, Goals, System Architecture, Module Design (### per module), Data Design, Non-Functional Requirements, Constraints, Risks. Be specific to the given project — no generic filler.",
    "plan": "You are a senior delivery manager writing a Project Plan in Markdown: '#' title, then sections Milestones (a Markdown table: Weeks | Phase | Key Work | Deliverable), Team & Responsibilities, Risks & Mitigations (specific to this project), Acceptance Criteria. Fit the plan to the given timeline_weeks.",
    "srs": "You are a requirements engineer writing an SRS in Markdown: '#' title, sections Introduction (purpose/scope), Overall Description, Functional Requirements (numbered FR-01... grouped by module, 'The system shall...'), Non-Functional Requirements (NFR-01...), Constraints, Acceptance. Specific and testable — no vague filler.",
}


def register_doc_studio(api: APIRouter, db, get_current_user):

    async def _profile() -> Dict[str, Any]:
        return await db.hr_letter_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}

    async def _job(jid: str, user) -> Dict[str, Any]:
        d = await db.doc_studio_jobs.find_one({"id": jid, "owner_id": user["id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Job not found")
        return d

    @api.get("/doc-studio/status")
    async def ds_status(user=Depends(get_current_user)):
        from ai_provider import ai_configured, active_provider
        return {"ai_available": ai_configured(), "provider": active_provider()}

    @api.post("/doc-studio/extract-text")
    async def ds_extract(file: UploadFile = File(...), user=Depends(get_current_user)):
        raw = await file.read()
        if len(raw) > 10 * 1024 * 1024:
            raise HTTPException(400, "File must be under 10 MB")
        name = (file.filename or "").lower()
        text = ""
        try:
            if name.endswith(".pdf"):
                from pypdf import PdfReader
                text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(raw)).pages[:30])
            elif name.endswith(".docx"):
                from docx import Document as Docx
                text = "\n".join(p.text for p in Docx(io.BytesIO(raw)).paragraphs)
            else:
                text = raw.decode("utf-8", errors="ignore")
        except Exception as e:
            raise HTTPException(400, f"Could not read file: {str(e)[:120]}")
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            raise HTTPException(400, "No readable text found in the file")
        return {"text": text[:20000], "chars": len(text)}

    @api.post("/doc-studio/analyze")
    async def ds_analyze(payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        description = (payload.get("description") or "").strip()
        mode = payload.get("mode") or "ai"
        if not description and mode != "blank":
            raise HTTPException(400, "Describe the project first")
        data = None
        used = "manual"
        if mode == "blank":
            data = _normalize_data({"project_name": payload.get("project_name") or "Untitled Project"})
        elif mode == "ai":
            from ai_provider import ai_configured, chat_completion
            if ai_configured():
                try:
                    raw = await chat_completion(system_message=ANALYZE_SYS,
                                                user_message=f"Project description:\n\n{description[:12000]}",
                                                session_id=f"docstudio-{uuid.uuid4().hex[:8]}")
                    block = re.search(r"\{[\s\S]*\}", str(raw))
                    if block:
                        data = _normalize_data(json.loads(block.group(0)))
                        used = "ai"
                except Exception:
                    data = None
        if data is None:
            data = _heuristic_analyze(description)
            used = "manual"
        job = {"id": uuid.uuid4().hex, "owner_id": user["id"], "owner_name": user.get("name", ""),
               "description": description[:20000], "data": data, "docs": {}, "analysis_mode": used,
               "created_at": _now(), "updated_at": _now()}
        await db.doc_studio_jobs.insert_one(dict(job))
        job.pop("_id", None)
        return job

    @api.get("/doc-studio/jobs")
    async def ds_jobs(user=Depends(get_current_user)):
        return await db.doc_studio_jobs.find(
            {"owner_id": user["id"]}, {"_id": 0, "docs": 0, "description": 0}
        ).sort("created_at", -1).to_list(100)

    @api.get("/doc-studio/jobs/{jid}")
    async def ds_job(jid: str, user=Depends(get_current_user)):
        return await _job(jid, user)

    @api.put("/doc-studio/jobs/{jid}")
    async def ds_update(jid: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        await _job(jid, user)
        data = _normalize_data(payload.get("data") or {})
        await db.doc_studio_jobs.update_one({"id": jid}, {"$set": {"data": data, "updated_at": _now()}})
        return {"ok": True, "data": data}

    @api.delete("/doc-studio/jobs/{jid}")
    async def ds_delete(jid: str, user=Depends(get_current_user)):
        r = await db.doc_studio_jobs.delete_one({"id": jid, "owner_id": user["id"]})
        if not r.deleted_count:
            raise HTTPException(404, "Job not found")
        return {"ok": True}

    @api.post("/doc-studio/jobs/{jid}/generate")
    async def ds_generate(jid: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        kind = payload.get("kind")
        mode = payload.get("mode") or "ai"
        if kind not in DOC_KINDS:
            raise HTTPException(400, "kind must be sdd | plan | srs")
        job = await _job(jid, user)
        d = job["data"]
        md, used = None, "template"
        if mode == "ai":
            from ai_provider import ai_configured, chat_completion
            if not ai_configured():
                raise HTTPException(400, "No AI provider configured — use Template mode or add a key in Settings → AI")
            try:
                md = await chat_completion(
                    system_message=GEN_SYS[kind],
                    user_message=f"Structured project data (JSON):\n{json.dumps(d, indent=1)}\n\nOriginal description:\n{(job.get('description') or '')[:4000]}\n\nWrite the {KIND_LABELS[kind]} now. Return ONLY Markdown.",
                    session_id=f"docstudio-{kind}-{jid[:8]}")
                md = re.sub(r"^```(markdown)?|```$", "", str(md).strip(), flags=re.M).strip()
                used = "ai"
            except Exception as e:
                raise HTTPException(502, f"AI generation failed: {str(e)[:180]}")
        if not md:
            md = TEMPLATE_GENERATORS[kind](d)
        await db.doc_studio_jobs.update_one({"id": jid}, {"$set": {f"docs.{kind}": md, f"docs_meta.{kind}": {"mode": used, "at": _now()}, "updated_at": _now()}})
        return {"kind": kind, "markdown": md, "mode": used}

    @api.put("/doc-studio/jobs/{jid}/docs/{kind}")
    async def ds_save_doc(jid: str, kind: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        if kind not in DOC_KINDS:
            raise HTTPException(400, "Invalid kind")
        await _job(jid, user)
        md = (payload.get("markdown") or "").strip()
        if not md:
            raise HTTPException(400, "markdown required")
        await db.doc_studio_jobs.update_one({"id": jid}, {"$set": {f"docs.{kind}": md[:200000], "updated_at": _now()}})
        return {"ok": True}

    @api.post("/doc-studio/jobs/{jid}/refine")
    async def ds_refine(jid: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        kind = payload.get("kind")
        instruction = (payload.get("instruction") or "").strip()
        if kind not in DOC_KINDS:
            raise HTTPException(400, "Invalid kind")
        if not instruction:
            raise HTTPException(400, "Tell me what to change")
        job = await _job(jid, user)
        md = (job.get("docs") or {}).get(kind)
        if not md:
            raise HTTPException(400, "Generate the document first")
        from ai_provider import ai_configured, chat_completion
        if not ai_configured():
            raise HTTPException(400, "AI refine needs an AI provider — or edit the document manually")
        try:
            out = await chat_completion(
                system_message=f"You are editing a {KIND_LABELS[kind]} written in Markdown. Apply the user's instruction while preserving the overall structure and everything they didn't ask to change. Return ONLY the full updated Markdown.",
                user_message=f"Current document:\n\n{md[:16000]}\n\nInstruction: {instruction[:1000]}",
                session_id=f"docstudio-refine-{jid[:8]}")
            out = re.sub(r"^```(markdown)?|```$", "", str(out).strip(), flags=re.M).strip()
        except Exception as e:
            raise HTTPException(502, f"AI refine failed: {str(e)[:180]}")
        await db.doc_studio_jobs.update_one({"id": jid}, {"$set": {f"docs.{kind}": out, "updated_at": _now()}})
        return {"kind": kind, "markdown": out}

    def _render_pdf(md: str, kind: str, d: Dict[str, Any], profile: Dict[str, Any]) -> bytes:
        import os
        from weasyprint import HTML
        base_url = (os.environ.get("PUBLIC_FRONTEND_URL") or "").rstrip("/")
        return HTML(string=_doc_html(md, kind, d, profile), base_url=base_url).write_pdf()

    @api.get("/doc-studio/jobs/{jid}/pdf")
    async def ds_pdf(jid: str, kind: str = "sdd", user=Depends(get_current_user)):
        if kind not in DOC_KINDS:
            raise HTTPException(400, "Invalid kind")
        job = await _job(jid, user)
        md = (job.get("docs") or {}).get(kind)
        if not md:
            raise HTTPException(400, "Generate the document first")
        try:
            pdf = _render_pdf(md, kind, job["data"], await _profile())
        except Exception as e:
            raise HTTPException(500, f"PDF render failed: {str(e)[:180]}")
        slug = re.sub(r"[^a-z0-9]+", "-", job["data"]["project_name"].lower()).strip("-")[:40]
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{kind.upper()}-{slug}.pdf"'})

    @api.post("/doc-studio/jobs/{jid}/save-to-documents")
    async def ds_save_documents(jid: str, payload: Dict[str, Any] = Body(...), user=Depends(get_current_user)):
        import base64
        kind = payload.get("kind")
        if kind not in DOC_KINDS:
            raise HTTPException(400, "Invalid kind")
        job = await _job(jid, user)
        md = (job.get("docs") or {}).get(kind)
        if not md:
            raise HTTPException(400, "Generate the document first")
        try:
            pdf = _render_pdf(md, kind, job["data"], await _profile())
        except Exception as e:
            raise HTTPException(500, f"PDF render failed: {str(e)[:180]}")
        name = f"{kind.upper()} — {job['data']['project_name'][:60]}.pdf"
        await db.documents.insert_one({
            "id": uuid.uuid4().hex, "owner_id": user["id"], "name": name,
            "mime_type": "application/pdf", "size": len(pdf),
            "content_base64": base64.b64encode(pdf).decode("ascii"),
            "project_id": "", "shared_with": [], "comments": [],
            "description": f"{KIND_LABELS[kind]} generated in Doc Studio",
            "folder": "Doc Studio", "uploader": user.get("name", ""),
            "created_at": _now(),
        })
        return {"ok": True, "name": name}
