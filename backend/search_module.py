"""
Unified global search across the workspace.

GET /api/search?q=<term>&limit=10  → grouped results dict.
Searches: projects, leads, tasks, issues, team, interns, documents, channels, users.
Auth required. Heavy fields (image_base64, content_base64) stripped from results.
"""
from __future__ import annotations

import re
from fastapi import APIRouter, Depends


def _safe_re(q: str) -> dict:
    """Build a case-insensitive Mongo regex query for substring match."""
    if not q:
        return {}
    pat = re.escape(q.strip())
    return {"$regex": pat, "$options": "i"}


def register_search(api: APIRouter, db, get_current_user):

    @api.get("/search")
    async def global_search(q: str = "", limit: int = 8, user=Depends(get_current_user)):
        q = (q or "").strip()
        if len(q) < 1:
            return {"q": q, "results": {}, "total": 0}

        rx = _safe_re(q)

        async def _find(coll, fields, proj, link_fn, kind, scope=None):
            base_q = {"$or": [{f: rx} for f in fields]}
            if scope:
                base_q = {"$and": [scope, base_q]}
            cur = db[coll].find(base_q, {"_id": 0, **proj}).sort("created_at", -1).limit(limit)
            rows = await cur.to_list(limit)
            return [{
                "kind": kind,
                "id": r.get("id"),
                "title": r.get(fields[0], "") or r.get("name", ""),
                "subtitle": _subtitle(r, fields),
                "link": link_fn(r),
                "meta": _meta(r, kind),
            } for r in rows]

        def _subtitle(r, fields):
            for f in fields[1:]:
                v = r.get(f)
                if v:
                    return str(v)[:140]
            return ""

        def _meta(r, kind):
            m = {}
            for k in ("status", "priority", "project_name", "category", "type", "role", "email"):
                if r.get(k):
                    m[k] = r[k]
            return m

        # Run searches in parallel scope (Mongo is fast on small datasets; sequential is fine here)
        results = {
            "projects": await _find(
                "projects", ["name", "description", "client", "tags"], {"name": 1, "description": 1, "status": 1, "client": 1},
                lambda r: f"/app/projects", "project"
            ),
            "leads": await _find(
                "leads", ["name", "company", "email", "phone", "notes"], {"name": 1, "company": 1, "email": 1, "status": 1},
                lambda r: f"/app/leads", "lead",
                scope={"owner_id": user["id"]},
            ),
            "tasks": await _find(
                "tasks", ["title", "description", "assignee", "project_name", "tags"],
                {"title": 1, "description": 1, "status": 1, "priority": 1, "project_name": 1},
                lambda r: f"/app/tasks", "task",
                scope={"owner_id": user["id"]},
            ),
            "issues": await _find(
                "issues", ["title", "description", "assignee", "project_name", "url"],
                {"title": 1, "description": 1, "status": 1, "priority": 1, "project_name": 1, "type": 1},
                lambda r: f"/app/issues", "issue"
            ),
            "team": await _find(
                "team", ["name", "email", "role", "department"], {"name": 1, "email": 1, "role": 1, "status": 1},
                lambda r: f"/app/team", "team_member",
                scope={"owner_id": user["id"]},
            ),
            "interns": await _find(
                "interns", ["name", "email", "designation", "department"],
                {"name": 1, "email": 1, "designation": 1, "department": 1, "status": 1},
                lambda r: f"/app/interns", "intern",
            ),
            "documents": await _find(
                "documents", ["name", "category", "uploader"], {"name": 1, "category": 1, "uploader": 1},
                lambda r: f"/app/documents", "document",
                scope={"owner_id": user["id"]},
            ),
            "channels": await _find(
                "channels", ["name", "kind"], {"name": 1, "kind": 1, "member_ids": 1},
                lambda r: f"/app/chat", "channel",
                scope={"$or": [{"member_ids": user["id"]}, {"owner_id": user["id"]}]},
            ),
            "users": await _find(
                "users", ["name", "email", "role"], {"name": 1, "email": 1, "role": 1},
                lambda r: f"/app/team", "user"
            ),
        }
        # Finance / invoices
        finance = await db.project_finance.find(
            {"$or": [
                {"project_name": rx},
                {"client_name": rx},
                {"client_emails.email": rx},
                {"notes": rx},
            ]},
            {"_id": 0, "id": 1, "project_id": 1, "project_name": 1, "client_name": 1, "locked_budget": 1, "currency": 1}
        ).limit(limit).to_list(limit)
        results["finance"] = [{
            "kind": "finance",
            "id": r.get("project_id") or r.get("id"),
            "title": r.get("project_name", ""),
            "subtitle": f"{r.get('client_name', '') or ''}",
            "link": "/app/finance",
            "meta": {"currency": r.get("currency"), "locked_budget": r.get("locked_budget")},
        } for r in finance]
        invoices = await db.invoices.find(
            {"$or": [{"invoice_no": rx}, {"project_name": rx}, {"client_name": rx}]},
            {"_id": 0, "id": 1, "invoice_no": 1, "project_name": 1, "client_name": 1, "amount": 1, "status": 1}
        ).limit(limit).to_list(limit)
        results["invoices"] = [{
            "kind": "invoice",
            "id": r.get("id"),
            "title": r.get("invoice_no", ""),
            "subtitle": f"{r.get('project_name','')} · {r.get('client_name','')}",
            "link": "/app/finance",
            "meta": {"amount": r.get("amount"), "status": r.get("status")},
        } for r in invoices]
        total = sum(len(v) for v in results.values())
        # drop empty groups
        results = {k: v for k, v in results.items() if v}
        return {"q": q, "results": results, "total": total}
