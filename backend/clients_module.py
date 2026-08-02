"""
clients_module.py — Clients hub backend.

Three collections:
  • clients               {id, name, company, email, phone, country, currency_default, notes, ...}
  • client_projects       {id, client_id, name, description, status, currency, agreed_amount, ...}
  • client_payments       {id, project_id, client_id, amount, currency, paid_at, method, note}

Routes (admin / manager / sales / hr can manage):
  GET/POST/PATCH/DELETE   /api/clients
  GET                     /api/clients/{id}
  GET                     /api/clients/{id}/summary           ← totals per currency
  GET/POST/PATCH/DELETE   /api/clients/{id}/projects
  GET                     /api/client-projects/{pid}
  GET/POST/DELETE         /api/client-projects/{pid}/payments
  POST                    /api/clients/{id}/cs-email          ← AI-drafted Customer Success email
"""
from __future__ import annotations
import uuid
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field, EmailStr, field_validator

PRIV = {"super_admin", "admin", "manager", "hr", "sales"}
PROJECT_STATUSES = {"discovery", "active", "on_hold", "completed", "cancelled"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(d):
    if d:
        d.pop("_id", None)
    return d


class ClientIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    company: Optional[str] = ""
    email: Optional[EmailStr] = None
    phone: Optional[str] = ""
    country: Optional[str] = ""
    currency_default: Optional[str] = "USD"
    notes: Optional[str] = ""
    industry: Optional[str] = ""

    @field_validator("email", mode="before")
    @classmethod
    def _blank(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ClientPatch(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    country: Optional[str] = None
    currency_default: Optional[str] = None
    notes: Optional[str] = None
    industry: Optional[str] = None

    @field_validator("email", mode="before")
    @classmethod
    def _blank(cls, v):
        if isinstance(v, str) and not v.strip():
            return None
        return v


class ProjectIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    description: Optional[str] = ""
    status: str = "discovery"
    currency: str = "USD"
    agreed_amount: float = 0.0
    started_at: Optional[str] = ""
    deadline: Optional[str] = ""


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    currency: Optional[str] = None
    agreed_amount: Optional[float] = None
    started_at: Optional[str] = None
    deadline: Optional[str] = None


class PaymentIn(BaseModel):
    amount: float = Field(..., gt=0)
    currency: str = "USD"
    paid_at: Optional[str] = ""
    method: Optional[str] = "bank_transfer"
    note: Optional[str] = ""


def register_clients(api: APIRouter, db, get_current_user):
    async def _priv(user=Depends(get_current_user)):
        if user.get("role") not in PRIV:
            raise HTTPException(403, "Not authorised")
        return user

    # ─── Clients CRUD ────────────────────────────────────────────────
    @api.get("/clients")
    async def list_clients(user=Depends(_priv), q: Optional[str] = None, limit: int = 200):
        query: Dict[str, Any] = {}
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            query["$or"] = [{"name": rx}, {"company": rx}, {"email": rx}]
        cur = db.clients.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
        rows = await cur.to_list(limit)
        # Attach project + payment rollups
        for r in rows:
            r["project_count"] = await db.client_projects.count_documents({"client_id": r["id"]})
        return rows

    @api.post("/clients", status_code=201)
    async def create_client(payload: ClientIn, user=Depends(_priv)):
        doc = payload.model_dump()
        doc["id"] = uuid.uuid4().hex
        doc["created_at"] = _now()
        doc["created_by"] = user.get("email")
        doc["updated_at"] = _now()
        await db.clients.insert_one(doc)
        return _strip_id(doc)

    @api.get("/clients/{cid}")
    async def get_client(cid: str, user=Depends(_priv)):
        c = await db.clients.find_one({"id": cid}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Client not found")
        # Inline projects & summary
        c["projects"] = await db.client_projects.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        c["summary"] = await _summary(db, cid)
        return c

    @api.patch("/clients/{cid}")
    async def patch_client(cid: str, payload: ClientPatch, user=Depends(_priv)):
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = _now()
        r = await db.clients.update_one({"id": cid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Client not found")
        return await db.clients.find_one({"id": cid}, {"_id": 0})

    @api.delete("/clients/{cid}")
    async def delete_client(cid: str, user=Depends(_priv)):
        if user.get("role") not in {"super_admin", "admin"}:
            raise HTTPException(403, "Only admin/super_admin can delete clients")
        # Cascade
        await db.client_payments.delete_many({"client_id": cid})
        await db.client_projects.delete_many({"client_id": cid})
        r = await db.clients.delete_one({"id": cid})
        return {"ok": r.deleted_count == 1}

    # ─── Summary helper ─────────────────────────────────────────────
    async def _summary(db, cid: str) -> Dict[str, Any]:
        projects = await db.client_projects.find({"client_id": cid}, {"_id": 0}).to_list(500)
        payments = await db.client_payments.find({"client_id": cid}, {"_id": 0}).to_list(2000)
        by_ccy: Dict[str, Dict[str, float]] = {}
        for p in projects:
            ccy = p.get("currency", "USD")
            by_ccy.setdefault(ccy, {"agreed": 0.0, "paid": 0.0, "pending": 0.0})
            by_ccy[ccy]["agreed"] += float(p.get("agreed_amount") or 0)
        for pay in payments:
            ccy = pay.get("currency", "USD")
            by_ccy.setdefault(ccy, {"agreed": 0.0, "paid": 0.0, "pending": 0.0})
            by_ccy[ccy]["paid"] += float(pay.get("amount") or 0)
        for ccy, row in by_ccy.items():
            row["pending"] = round(row["agreed"] - row["paid"], 2)
            row["agreed"] = round(row["agreed"], 2)
            row["paid"] = round(row["paid"], 2)
        return {
            "by_currency": by_ccy,
            "project_count": len(projects),
            "payment_count": len(payments),
        }

    @api.get("/clients/{cid}/summary")
    async def client_summary(cid: str, user=Depends(_priv)):
        if not await db.clients.find_one({"id": cid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Client not found")
        return await _summary(db, cid)

    # ─── Projects ───────────────────────────────────────────────────
    @api.get("/clients/{cid}/projects")
    async def list_projects(cid: str, user=Depends(_priv)):
        cur = db.client_projects.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1)
        rows = await cur.to_list(500)
        for r in rows:
            r["paid"] = round(sum((p.get("amount") or 0) for p in await db.client_payments.find({"project_id": r["id"]}, {"_id": 0, "amount": 1}).to_list(500)), 2)
            r["pending"] = round(float(r.get("agreed_amount") or 0) - r["paid"], 2)
        return rows

    @api.post("/clients/{cid}/projects", status_code=201)
    async def create_project(cid: str, payload: ProjectIn, user=Depends(_priv)):
        if not await db.clients.find_one({"id": cid}, {"_id": 0, "id": 1}):
            raise HTTPException(404, "Client not found")
        if payload.status not in PROJECT_STATUSES:
            raise HTTPException(400, f"Status must be one of {sorted(PROJECT_STATUSES)}")
        doc = payload.model_dump()
        doc["id"] = uuid.uuid4().hex
        doc["client_id"] = cid
        doc["created_at"] = _now()
        doc["created_by"] = user.get("email")
        doc["updated_at"] = _now()
        await db.client_projects.insert_one(doc)
        return _strip_id(doc)

    @api.get("/client-projects/{pid}")
    async def get_project(pid: str, user=Depends(_priv)):
        p = await db.client_projects.find_one({"id": pid}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Project not found")
        p["payments"] = await db.client_payments.find({"project_id": pid}, {"_id": 0}).sort("paid_at", -1).to_list(500)
        p["paid"] = round(sum((x.get("amount") or 0) for x in p["payments"]), 2)
        p["pending"] = round(float(p.get("agreed_amount") or 0) - p["paid"], 2)
        return p

    @api.patch("/client-projects/{pid}")
    async def patch_project(pid: str, payload: ProjectPatch, user=Depends(_priv)):
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "status" in updates and updates["status"] not in PROJECT_STATUSES:
            raise HTTPException(400, "Invalid status")
        if not updates:
            raise HTTPException(400, "Nothing to update")
        updates["updated_at"] = _now()
        r = await db.client_projects.update_one({"id": pid}, {"$set": updates})
        if r.matched_count == 0:
            raise HTTPException(404, "Project not found")
        return await db.client_projects.find_one({"id": pid}, {"_id": 0})

    @api.delete("/client-projects/{pid}")
    async def delete_project(pid: str, user=Depends(_priv)):
        await db.client_payments.delete_many({"project_id": pid})
        r = await db.client_projects.delete_one({"id": pid})
        return {"ok": r.deleted_count == 1}

    # ─── Payments ───────────────────────────────────────────────────
    @api.get("/client-projects/{pid}/payments")
    async def list_payments(pid: str, user=Depends(_priv)):
        cur = db.client_payments.find({"project_id": pid}, {"_id": 0}).sort("paid_at", -1)
        return await cur.to_list(500)

    @api.post("/client-projects/{pid}/payments", status_code=201)
    async def add_payment(pid: str, payload: PaymentIn, user=Depends(_priv)):
        proj = await db.client_projects.find_one({"id": pid}, {"_id": 0, "client_id": 1, "currency": 1})
        if not proj:
            raise HTTPException(404, "Project not found")
        doc = payload.model_dump()
        doc["id"] = uuid.uuid4().hex
        doc["project_id"] = pid
        doc["client_id"] = proj["client_id"]
        if not doc.get("paid_at"):
            doc["paid_at"] = _now()
        doc["created_at"] = _now()
        doc["created_by"] = user.get("email")
        await db.client_payments.insert_one(doc)
        return _strip_id(doc)

    @api.delete("/client-payments/{pmid}")
    async def delete_payment(pmid: str, user=Depends(_priv)):
        r = await db.client_payments.delete_one({"id": pmid})
        return {"ok": r.deleted_count == 1}

    # ─── Customer Success AI email ──────────────────────────────────
    @api.post("/clients/{cid}/cs-email")
    async def cs_email_draft(cid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Client not found")
        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Add EMERGENT_LLM_KEY / OPENAI / ANTHROPIC / GEMINI in Settings → AI.")

        purpose = (payload.get("purpose") or "weekly status update").strip()
        tone = (payload.get("tone") or "warm · concise · executive").strip()
        # Build context
        projects = await db.client_projects.find({"client_id": cid}, {"_id": 0}).to_list(50)
        summary = await _summary(db, cid)
        project_lines = []
        for p in projects[:6]:
            project_lines.append(
                f"- {p.get('name')} ({p.get('status')}) · agreed {p.get('currency')} {p.get('agreed_amount', 0)}"
            )
        summary_lines = [f"  · {ccy}: agreed {v['agreed']}, paid {v['paid']}, pending {v['pending']}" for ccy, v in summary["by_currency"].items()]

        system_msg = (
            "You are the Customer Success lead at Projexino, an engineering studio. "
            "Write warm, professional client emails that drive trust, transparency and renewals. "
            "Return STRICT JSON only — no markdown fences."
        )
        user_msg = f"""Draft a Customer Success email for our client. Purpose: {purpose}. Tone: {tone}.

CLIENT
  Name: {client.get('name')}
  Company: {client.get('company') or '-'}
  Country: {client.get('country') or '-'}
  Industry: {client.get('industry') or '-'}

PROJECTS
{chr(10).join(project_lines) or '  - (no projects yet)'}

FINANCIAL SUMMARY (by currency)
{chr(10).join(summary_lines) or '  - (no payments yet)'}

Return JSON with these exact keys:
{{
  "subject": "<<60 chars max>>",
  "greeting": "<<single line, e.g. 'Hi <FirstName>,'>>",
  "intro": "<<2 short sentences acknowledging the relationship>>",
  "highlights": ["<<3-5 punchy bullets the client will appreciate>>"],
  "ask_or_next_step": "<<1 clear ask or next step>>",
  "closing": "<<warm sign-off line>>"
}}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.5)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        import json as _json
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            raise HTTPException(502, "AI returned non-JSON")
        try:
            data = _json.loads(m.group(0))
        except Exception:
            raise HTTPException(502, "AI JSON parse failed")

        subject = (data.get("subject") or "Project update").strip()[:200]
        greeting = (data.get("greeting") or f"Hi {client.get('name','').split(' ')[0]},").strip()
        intro = (data.get("intro") or "").strip()
        highlights = [str(x).strip() for x in (data.get("highlights") or []) if str(x).strip()][:8]
        ask = (data.get("ask_or_next_step") or "").strip()
        closing = (data.get("closing") or "Warmly,\nProjexino").strip()

        bullets_html = "".join([f"<li style='margin:6px 0;color:#1F2937;font-size:14px;line-height:1.55'>{h}</li>" for h in highlights])
        body_html = f"""<div style="font-family:Inter,Arial,sans-serif;color:#0F2042;max-width:580px;margin:0 auto;padding:24px">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.28em;color:#F97316;text-transform:uppercase">// Projexino · Customer Success</div>
  <p style="margin:14px 0 0;font-size:15px;color:#0F2042"><b>{greeting}</b></p>
  <p style="margin:10px 0;color:#334155;font-size:15px;line-height:1.6">{intro}</p>
  <div style="margin:14px 0;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px">
    <div style="font-size:10px;font-weight:bold;letter-spacing:0.18em;color:#9A3412;text-transform:uppercase;margin-bottom:6px">Highlights</div>
    <ul style="margin:0;padding-left:18px">{bullets_html}</ul>
  </div>
  <p style="margin:14px 0;color:#0F2042;font-size:15px"><b>Next:</b> {ask}</p>
  <p style="margin:20px 0 0;color:#475569;font-size:14px;white-space:pre-line">{closing}</p>
</div>"""
        return {
            "subject": subject, "greeting": greeting, "intro": intro,
            "highlights": highlights, "ask_or_next_step": ask, "closing": closing,
            "body_html": body_html,
            "client_id": cid, "client_email": client.get("email"),
        }

    @api.post("/clients/{cid}/cs-whatsapp")
    async def cs_whatsapp(cid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        """Convert the current CS draft into a WhatsApp-ready message (AI-styled, deterministic fallback)."""
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Client not found")
        phone = re.sub(r"[^\d]", "", client.get("phone") or "")
        d = payload or {}
        first = ((client.get("name") or "there").split(" ") or ["there"])[0]

        hl = [str(x).strip() for x in (d.get("highlights") or []) if str(x).strip()]
        blocks_txt: List[str] = []
        for b in (d.get("blocks") or []):
            if b.get("type") == "bullets":
                blocks_txt += [f"- {i}" for i in (b.get("items") or []) if str(i).strip()]
            elif b.get("text"):
                blocks_txt.append(str(b.get("text")).strip())

        # Deterministic fallback conversion
        lines = ["✨ *PROJEXINO UPDATE*", "━━━━━━━━━━━━━━━", f"Hi {first} 👋", ""]
        if (d.get("intro") or "").strip():
            lines += [d["intro"].strip(), ""]
        for t in blocks_txt:
            lines.append(f"• {t[1:].strip()}" if t.startswith("-") else t)
        if blocks_txt:
            lines.append("")
        if hl:
            lines += ["*Highlights*"] + [f"• {h}" for h in hl] + [""]
        if (d.get("ask_or_next_step") or "").strip():
            lines += [f"👉 *Next Step:* {d['ask_or_next_step'].strip()}", ""]
        lines += ["━━━━━━━━━━━━━━━", "Warm regards,", "_Team Projexino_ 🧡"]
        wa_text = "\n".join(lines)
        used_ai = False

        try:
            from ai_provider import chat_completion, ai_configured
            if ai_configured():
                email_content = "\n".join(filter(None, [
                    f"Subject: {d.get('subject', '')}",
                    f"Greeting: {d.get('greeting', '')}",
                    f"Intro: {d.get('intro', '')}",
                    ("Highlights:\n" + "\n".join(f"- {h}" for h in hl)) if hl else "",
                    ("Body:\n" + "\n".join(blocks_txt)) if blocks_txt else "",
                    f"Next step: {d.get('ask_or_next_step', '')}",
                    f"Closing: {d.get('closing', '')}",
                ]))
                system_msg = (
                    "You rewrite customer-success emails into beautifully structured WhatsApp messages for Projexino Solutions. "
                    "Follow this EXACT structure:\n"
                    "Line 1: short header with emoji, e.g. '✨ *PROJEXINO UPDATE*' (adapt wording to the topic)\n"
                    "Line 2: divider of exactly '━━━━━━━━━━━━━━━'\n"
                    "Then: 'Hi <first name> 👋', blank line, a warm 1-2 sentence intro.\n"
                    "Then a '*Highlights*' section (or similar bold section title) with • bullet lines for the key facts.\n"
                    "Then a '👉 *Next Step:*' line if there is a call to action.\n"
                    "End with the same '━━━━━━━━━━━━━━━' divider, then 'Warm regards,' and '_Team Projexino_ 🧡'.\n"
                    "Use only WhatsApp formatting (*bold*, _italic_). Keep all key facts. Max ~140 words. "
                    "Return ONLY the plain message text — no markdown fences, no commentary."
                )
                user_msg = f"Client first name: {first}\n\nEMAIL CONTENT TO CONVERT:\n{email_content}"
                raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.5)
                if raw and raw.strip():
                    wa_text = raw.strip().strip("`").strip()
                    used_ai = True
        except Exception:
            pass

        return {"wa_text": wa_text, "phone": phone, "used_ai": used_ai, "client_name": client.get("name")}

    # ─── Linked engineering projects (db.projects with client_id FK) ─
    @api.get("/clients/{cid}/linked-projects")
    async def linked_projects(cid: str, user=Depends(_priv)):
        """Engineering Projects (from db.projects) that have client_id == cid.
        Plus inline task rollup so we can summarise status to the client."""
        proj = await db.projects.find({"client_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(200)
        for p in proj:
            tasks = await db.tasks.find({"project_id": p["id"]}, {"_id": 0, "status": 1, "title": 1, "id": 1}).to_list(500)
            counts = {"todo": 0, "in_progress": 0, "done": 0, "blocked": 0}
            for t in tasks:
                s = (t.get("status") or "todo").lower()
                counts[s] = counts.get(s, 0) + 1
            p["task_counts"] = counts
            p["task_total"] = len(tasks)
            p["completion_pct"] = round(100 * counts.get("done", 0) / max(1, len(tasks))) if tasks else 0
        return proj

    @api.post("/clients/{cid}/snapshot-email")
    async def client_snapshot_email(cid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        """Plain (no AI) status snapshot of all linked projects + payment status."""
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Client not found")
        eng = await db.projects.find({"client_id": cid}, {"_id": 0}).to_list(200)
        billing = await db.client_projects.find({"client_id": cid}, {"_id": 0}).to_list(200)
        summary = await _summary(db, cid)
        # Build engineering rows w/ task rollup
        eng_rows_html = ""
        for p in eng:
            tasks = await db.tasks.count_documents({"project_id": p["id"]})
            done = await db.tasks.count_documents({"project_id": p["id"], "status": "done"})
            pct = round(100 * done / max(1, tasks)) if tasks else 0
            eng_rows_html += f"<tr><td style='padding:6px;border-bottom:1px solid #E2E8F0'>{p.get('name','')}</td><td style='padding:6px;border-bottom:1px solid #E2E8F0;color:#475569'>{p.get('status','—')}</td><td style='padding:6px;border-bottom:1px solid #E2E8F0;color:#0F2042;text-align:right'>{pct}% ({done}/{tasks})</td></tr>"
        billing_rows_html = ""
        for b in billing:
            billing_rows_html += f"<tr><td style='padding:6px;border-bottom:1px solid #E2E8F0'>{b.get('name','')}</td><td style='padding:6px;border-bottom:1px solid #E2E8F0;color:#475569'>{b.get('status','—')}</td><td style='padding:6px;border-bottom:1px solid #E2E8F0;color:#0F2042;text-align:right'>{b.get('currency','')} {b.get('agreed_amount',0):,.0f}</td></tr>"
        sum_html = "".join([f"<li>{ccy}: agreed {v['agreed']:,.0f}, paid {v['paid']:,.0f}, pending <b>{v['pending']:,.0f}</b></li>" for ccy, v in summary["by_currency"].items()])
        subject = f"{client.get('company') or client.get('name')} · Project status snapshot"
        body_html = f"""<div style="font-family:Inter,Arial,sans-serif;color:#0F2042;max-width:600px;margin:0 auto;padding:24px">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.28em;color:#F97316;text-transform:uppercase">// Projexino · Status Snapshot</div>
  <h2 style="margin:12px 0 4px">Hi {client.get('name','')},</h2>
  <p style="color:#475569;font-size:14px">Here&apos;s where we are across our engagement as of today.</p>
  {f"<h3 style='margin-top:18px;color:#0F2042;font-size:15px'>Engineering projects</h3><table style='width:100%;border-collapse:collapse;font-size:13px'><tr style='background:#FFF7ED'><th style='text-align:left;padding:6px;color:#9A3412'>Project</th><th style='text-align:left;padding:6px;color:#9A3412'>Status</th><th style='text-align:right;padding:6px;color:#9A3412'>Completion</th></tr>{eng_rows_html}</table>" if eng_rows_html else ""}
  {f"<h3 style='margin-top:18px;color:#0F2042;font-size:15px'>Billing projects</h3><table style='width:100%;border-collapse:collapse;font-size:13px'><tr style='background:#FFF7ED'><th style='text-align:left;padding:6px;color:#9A3412'>Project</th><th style='text-align:left;padding:6px;color:#9A3412'>Status</th><th style='text-align:right;padding:6px;color:#9A3412'>Agreed</th></tr>{billing_rows_html}</table>" if billing_rows_html else ""}
  {f"<h3 style='margin-top:18px;color:#0F2042;font-size:15px'>Financial summary</h3><ul style='color:#475569'>{sum_html}</ul>" if sum_html else ""}
  <p style="margin-top:20px;color:#475569;font-size:14px">Warmly,<br/><b>Projexino</b></p>
</div>"""
        return {"subject": subject, "body_html": body_html, "client_email": client.get("email")}

    @api.post("/client-projects/{pid}/push-to-finance")
    async def push_to_finance(pid: str, user=Depends(_priv)):
        """1-click bridge: copy a billing project + its payments into the
        Finance module's `project_finance` collection (canonical schema)
        so it shows up under /app/finance with full progress + payments."""
        p = await db.client_projects.find_one({"id": pid}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Project not found")
        client = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0})
        client_payments = await db.client_payments.find({"project_id": pid}, {"_id": 0}).to_list(500)

        # Idempotency — if we already have a project_finance for this project,
        # SYNC its payments + locked_budget rather than insert a duplicate.
        existing = None
        if p.get("finance_project_id"):
            existing = await db.project_finance.find_one({"id": p["finance_project_id"]}, {"_id": 0})

        # Normalise payments into project_finance "payments" array shape.
        payments_arr = []
        for pay in client_payments:
            payments_arr.append({
                "id": pay.get("id") or uuid.uuid4().hex,
                "amount": float(pay.get("amount") or 0),
                "currency": pay.get("currency", p.get("currency", "USD")),
                "paid_at": pay.get("paid_at") or pay.get("created_at") or _now(),
                "method": pay.get("method", "bank_transfer"),
                "note": pay.get("note", ""),
                "source": "clients_hub",
                "source_payment_id": pay.get("id"),
            })

        if existing:
            # Re-sync payments + amount to keep finance up-to-date.
            await db.project_finance.update_one(
                {"id": existing["id"]},
                {"$set": {
                    "payments": payments_arr,
                    "locked_budget": float(p.get("agreed_amount") or 0),
                    "discussed_budget": float(p.get("agreed_amount") or 0),
                    "updated_at": _now(),
                }},
            )
            return {
                "ok": True,
                "already_pushed": True,
                "finance_project_id": existing["id"],
                "finance_project_name": existing.get("project_name"),
                "pushed_at": p.get("pushed_to_finance_at"),
                "payments_pushed": len(payments_arr),
            }

        # First push — create canonical project_finance doc + a stub project
        # so it appears in /app/projects AND /app/finance.
        stub_project_id = uuid.uuid4().hex
        await db.projects.insert_one({
            "id": stub_project_id,
            "owner_id": user.get("id") or user.get("email") or "system",
            "name": p.get("name"),
            "description": p.get("description") or "",
            "client": (client or {}).get("name", ""),
            "client_id": p.get("client_id"),
            "status": "planning",
            "priority": "medium",
            "start_date": "",
            "deadline": "",
            "members": [],
            "manager": "",
            "tags": ["clients_hub"],
            "progress": 0,
            "created_at": _now(),
            "updated_at": _now(),
        })

        # Client email object array (Finance UI expects {id,email,name,primary}).
        client_emails = []
        if (client or {}).get("email"):
            client_emails.append({
                "id": uuid.uuid4().hex,
                "email": client["email"],
                "name": client.get("name", ""),
                "primary": True,
            })

        fin_id = uuid.uuid4().hex
        fin_doc = {
            "id": fin_id,
            "project_id": stub_project_id,
            "project_name": p.get("name"),
            "client_name": (client or {}).get("name", ""),
            "client_emails": client_emails,
            "discussed_budget": float(p.get("agreed_amount") or 0),
            "locked_budget": float(p.get("agreed_amount") or 0),
            "currency": (p.get("currency") or "USD").upper(),
            "country": (client or {}).get("country", "")[:2].upper() or "IN",
            "payment_type": "one_time",
            "category": "client_engagement",
            "start_date": "",
            "end_date": "",
            "notes": f"Imported from Clients hub · source project id {pid}",
            "gst_number": "",
            "billing_address": "",
            "payment_terms": [],
            "payments": payments_arr,
            "documents": [],
            "milestones": [],
            "source": "clients_hub",
            "source_project_id": pid,
            "created_at": _now(),
            "updated_at": _now(),
            "created_by": user.get("email", ""),
        }
        await db.project_finance.insert_one(fin_doc)
        await db.client_projects.update_one(
            {"id": pid},
            {"$set": {"finance_project_id": fin_id, "pushed_to_finance_at": _now()}},
        )
        return {
            "ok": True,
            "already_pushed": False,
            "finance_project_id": fin_id,
            "finance_project_name": fin_doc["project_name"],
            "payments_pushed": len(payments_arr),
        }

    @api.post("/client-projects/{pid}/payment-reminder")
    async def payment_reminder(pid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        """Render a polite reminder email for the pending balance on this project."""
        p = await db.client_projects.find_one({"id": pid}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Project not found")
        client = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0})
        paid = sum((x.get("amount") or 0) for x in await db.client_payments.find({"project_id": pid}, {"_id": 0, "amount": 1}).to_list(500))
        pending = round(float(p.get("agreed_amount") or 0) - paid, 2)
        if pending <= 0:
            raise HTTPException(400, "No outstanding balance to remind on")
        ccy = p.get("currency", "USD")
        days_overdue = payload.get("days_overdue") or 0
        subject = f"Friendly reminder · {p.get('name')} pending payment ({ccy} {pending:,.0f})"
        body_html = f"""<div style="font-family:Inter,Arial,sans-serif;color:#0F2042;max-width:560px;margin:0 auto;padding:24px">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.28em;color:#F97316;text-transform:uppercase">// Projexino · Payment reminder</div>
  <h2 style="margin:12px 0 4px">Hi {(client or {}).get('name','')},</h2>
  <p style="color:#475569;font-size:14px;line-height:1.6">Just a friendly nudge — we noticed an outstanding balance on <b>{p.get('name','')}</b>. Your trust means a lot to us, and we wanted to gently bring this to your attention.</p>
  <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px;padding:14px;margin:14px 0">
    <div style="font-size:10px;font-weight:bold;color:#9A3412;letter-spacing:0.18em;text-transform:uppercase">Outstanding</div>
    <div style="font-size:24px;font-weight:bold;color:#0F2042;margin-top:4px">{ccy} {pending:,.2f}</div>
    {f"<div style='color:#B91C1C;font-size:12px;margin-top:4px'>{days_overdue} days past due</div>" if days_overdue else ""}
  </div>
  <p style="color:#475569;font-size:14px;line-height:1.6">If the payment is already in motion, please ignore this note. Otherwise, hit reply and we&apos;ll be happy to share invoice details or walk you through any blockers.</p>
  <p style="margin-top:20px;color:#475569;font-size:14px">Warmly,<br/><b>Projexino · Finance</b></p>
</div>"""
        # Log the reminder for audit
        await db.client_payment_reminders.insert_one({
            "id": uuid.uuid4().hex, "project_id": pid, "client_id": p["client_id"],
            "pending": pending, "currency": ccy, "days_overdue": days_overdue,
            "sent_by": user.get("email"), "sent_at": _now(),
        })
        first = ((client or {}).get("name") or "there").split(" ")[0] or "there"
        wa_lines = [
            "🔔 *PAYMENT REMINDER*",
            "━━━━━━━━━━━━━━━",
            f"Hi {first} 👋",
            "",
            "A gentle reminder from *Projexino Solutions* regarding:",
            "",
            f"▸ *Project:* {p.get('name', '')}",
            f"▸ *Outstanding:* {ccy} {pending:,.2f}",
        ]
        if days_overdue:
            wa_lines.append(f"▸ *Overdue by:* {days_overdue} days ⚠️")
        wa_lines += [
            "",
            "If the payment is already on its way, please ignore this message. Need the invoice or payment details? Just reply here 🙌",
            "",
            "━━━━━━━━━━━━━━━",
            "Thank you 🙏",
            "_Team Projexino_",
        ]
        wa_text = "\n".join(wa_lines)
        return {
            "subject": subject, "body_html": body_html, "client_email": (client or {}).get("email"),
            "pending": pending, "currency": ccy,
            "wa_text": wa_text, "client_phone": re.sub(r"[^\d]", "", (client or {}).get("phone") or ""),
        }

    # ─── CS Email — persist drafts, fetch tasks for linked projects, AI summary ──
    @api.post("/clients/{cid}/cs-email/save")
    async def cs_email_save_draft(cid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        client = await db.clients.find_one({"id": cid}, {"_id": 0, "id": 1})
        if not client:
            raise HTTPException(404, "Client not found")
        draft = {
            "client_id": cid,
            "subject": (payload.get("subject") or "").strip(),
            "greeting": (payload.get("greeting") or "").strip(),
            "intro": (payload.get("intro") or "").strip(),
            "highlights": [str(x).strip() for x in (payload.get("highlights") or []) if str(x).strip()],
            "ask_or_next_step": (payload.get("ask_or_next_step") or "").strip(),
            "closing": (payload.get("closing") or "").strip(),
            "blocks": payload.get("blocks") or [],
            "cta_type": (payload.get("cta_type") or "none").strip(),
            "cta_label": (payload.get("cta_label") or "").strip(),
            "cta_url": (payload.get("cta_url") or "").strip(),
            "body_html": payload.get("body_html") or "",
            "purpose": (payload.get("purpose") or "").strip(),
            "tone": (payload.get("tone") or "").strip(),
            "updated_at": _now(),
            "updated_by": user.get("email"),
        }
        await db.cs_email_drafts.update_one(
            {"client_id": cid},
            {"$set": draft, "$setOnInsert": {"id": uuid.uuid4().hex, "created_at": _now()}},
            upsert=True,
        )
        return {"ok": True, "saved_at": draft["updated_at"]}

    @api.get("/clients/{cid}/cs-email/draft")
    async def cs_email_get_draft(cid: str, user=Depends(_priv)):
        d = await db.cs_email_drafts.find_one({"client_id": cid}, {"_id": 0})
        return d or {}

    @api.delete("/clients/{cid}/cs-email/draft")
    async def cs_email_delete_draft(cid: str, user=Depends(_priv)):
        await db.cs_email_drafts.delete_many({"client_id": cid})
        return {"ok": True}

    @api.get("/clients/{cid}/linked-projects/{pid}/tasks")
    async def linked_project_tasks(cid: str, pid: str, user=Depends(_priv)):
        """Live tasks for a specific engineering project linked to this client.
        Same source-of-truth as /api/tasks?project_id=… so updates from the
        Tasks page automatically reflect here."""
        proj = await db.projects.find_one({"id": pid, "client_id": cid}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "Project not linked to this client")
        tasks = await db.tasks.find(
            {"project_id": pid},
            {"_id": 0, "id": 1, "title": 1, "status": 1, "priority": 1, "assignee": 1, "assignee_email": 1, "deadline": 1, "updated_at": 1, "description": 1},
        ).sort("updated_at", -1).to_list(500)
        counts = {"todo": 0, "in_progress": 0, "review": 0, "done": 0, "blocked": 0}
        for t in tasks:
            s = (t.get("status") or "todo").lower()
            counts[s] = counts.get(s, 0) + 1
        return {"project": proj, "tasks": tasks, "counts": counts, "total": len(tasks)}

    @api.post("/clients/{cid}/linked-projects/{pid}/ai-summary")
    async def linked_project_ai_summary(cid: str, pid: str, payload: Dict[str, Any] = Body(default={}), user=Depends(_priv)):
        """AI-summarise recent updates on this engineering project into a
        client-ready HTML email draft."""
        client = await db.clients.find_one({"id": cid}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Client not found")
        proj = await db.projects.find_one({"id": pid, "client_id": cid}, {"_id": 0})
        if not proj:
            raise HTTPException(404, "Project not linked to this client")
        tone = (payload.get("tone") or "warm · concise · executive").strip()

        tasks = await db.tasks.find(
            {"project_id": pid},
            {"_id": 0, "title": 1, "status": 1, "priority": 1, "assignee": 1, "updated_at": 1, "deadline": 1},
        ).sort("updated_at", -1).to_list(500)
        counts = {"todo": 0, "in_progress": 0, "review": 0, "done": 0, "blocked": 0}
        for t in tasks:
            counts[(t.get("status") or "todo").lower()] = counts.get((t.get("status") or "todo").lower(), 0) + 1
        pct = round(100 * counts.get("done", 0) / max(1, len(tasks))) if tasks else 0
        # Last 10 task updates as context
        recent_lines = []
        for t in tasks[:12]:
            recent_lines.append(f"- {t.get('title','(untitled)')} · {t.get('status','todo')} · assigned {t.get('assignee') or '—'}")

        try:
            from ai_provider import chat_completion, ai_configured
        except Exception:
            raise HTTPException(500, "AI provider not available")
        if not ai_configured():
            raise HTTPException(400, "No AI provider configured. Add EMERGENT_LLM_KEY / OPENAI / ANTHROPIC / GEMINI in Settings → AI.")

        system_msg = (
            "You are the engineering delivery lead at Projexino. "
            "Summarise a project's recent task activity into a client-friendly email. "
            "Be concrete (cite task names if relevant), confident, and forward-looking. "
            "Return STRICT JSON only — no markdown fences."
        )
        user_msg = f"""Draft an engineering progress update email for our client. Tone: {tone}.

CLIENT
  Name: {client.get('name')}
  Company: {client.get('company') or '-'}

PROJECT
  Name: {proj.get('name')}
  Status: {proj.get('status')}
  Priority: {proj.get('priority') or '-'}
  Deadline: {proj.get('deadline') or '-'}
  Description: {proj.get('description') or '-'}
  Task rollup: total {len(tasks)} · done {counts['done']} · in_progress {counts['in_progress']} · blocked {counts['blocked']} · review {counts['review']} · todo {counts['todo']} · completion {pct}%

RECENT TASK ACTIVITY (newest first)
{chr(10).join(recent_lines) or '  - (no tasks yet)'}

Return JSON with these exact keys:
{{
  "subject": "<<<60 chars max, mention the project>>>",
  "greeting": "<<single line, e.g. 'Hi <FirstName>,'>>",
  "intro": "<<2 sentences acknowledging the engagement and what this update covers>>",
  "highlights": ["<<3-5 bullets, mix wins + in-flight items, surface any blockers>>"],
  "ask_or_next_step": "<<1 clear next step / ask>>",
  "closing": "<<warm sign-off line>>"
}}
"""
        try:
            raw = await chat_completion(system_message=system_msg, user_message=user_msg, temperature=0.45)
        except RuntimeError as e:
            raise HTTPException(502, str(e))
        import json as _json
        m = re.search(r"\{[\s\S]*\}", raw or "")
        if not m:
            raise HTTPException(502, "AI returned non-JSON")
        try:
            data = _json.loads(m.group(0))
        except Exception:
            raise HTTPException(502, "AI JSON parse failed")

        subject = (data.get("subject") or f"{proj.get('name')} · progress update").strip()[:200]
        first_name = (client.get("name") or "").split(" ")[0]
        greeting = (data.get("greeting") or f"Hi {first_name},").strip()
        intro = (data.get("intro") or "").strip()
        highlights = [str(x).strip() for x in (data.get("highlights") or []) if str(x).strip()][:8]
        ask = (data.get("ask_or_next_step") or "").strip()
        closing = (data.get("closing") or "Warmly,\nProjexino").strip()

        bullets_html = "".join([f"<li style='margin:6px 0;color:#1F2937;font-size:14px;line-height:1.55'>{h}</li>" for h in highlights])
        body_html = f"""<div style="font-family:Inter,Arial,sans-serif;color:#0F2042;max-width:600px;margin:0 auto;padding:24px">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.28em;color:#F97316;text-transform:uppercase">// Projexino · Engineering update</div>
  <h2 style="margin:12px 0 4px;color:#0F2042">{proj.get('name')}</h2>
  <div style="color:#475569;font-size:12px">{pct}% complete · {counts['done']}/{len(tasks)} tasks done</div>
  <p style="margin:14px 0 0;font-size:15px"><b>{greeting}</b></p>
  <p style="margin:10px 0;color:#334155;font-size:15px;line-height:1.6">{intro}</p>
  <div style="margin:14px 0;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px">
    <div style="font-size:10px;font-weight:bold;letter-spacing:0.18em;color:#9A3412;text-transform:uppercase;margin-bottom:6px">This update</div>
    <ul style="margin:0;padding-left:18px">{bullets_html}</ul>
  </div>
  <p style="margin:14px 0;color:#0F2042;font-size:15px"><b>Next:</b> {ask}</p>
  <p style="margin:20px 0 0;color:#475569;font-size:14px;white-space:pre-line">{closing}</p>
</div>"""
        return {
            "subject": subject, "greeting": greeting, "intro": intro,
            "highlights": highlights, "ask_or_next_step": ask, "closing": closing,
            "body_html": body_html,
            "client_id": cid, "project_id": pid,
            "client_email": client.get("email"),
            "completion_pct": pct, "task_total": len(tasks), "task_counts": counts,
        }

