"""
PHASE C — Document Verification.

Unified view of every uploaded document for HR / Reporting Manager / Super Admin
to approve or reject with a comment thread.

Endpoints (all require super_admin / admin / manager / hr):
  GET    /api/doc-verification              — list all documents pending / approved / rejected
  GET    /api/doc-verification/{kind}/{id}/{doc_type}  — fetch one doc (with content_base64) for new-tab view
  POST   /api/doc-verification/{kind}/{id}/{doc_type}/decision  — { decision: approved|rejected, comment }
  POST   /api/doc-verification/{kind}/{id}/{doc_type}/comment   — add a free comment to the doc thread

Doc sources today:
  • Interns — `interns.submitted_docs.{doc_type}`
  • Team    — future: a `team_documents` collection (placeholder for now, not yet uploaded)

The verification status + comment thread is stored alongside each doc entry:
  submitted_docs.{type}.verification = {
    status: "pending" | "approved" | "rejected",
    decided_by: { id, name, email },
    decided_at: iso,
    comments: [{ id, by_name, by_role, at, message }]
  }
"""
from __future__ import annotations

import uuid
import html
from datetime import datetime, timezone
from typing import Optional, Literal, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

PRIV_ROLES = ("super_admin", "admin", "manager", "hr")


class DecisionIn(BaseModel):
    decision: Literal["approved", "rejected"]
    comment: Optional[str] = ""


class CommentIn(BaseModel):
    message: str = Field(min_length=1)


def _check_priv(user):
    if user.get("role") not in PRIV_ROLES:
        raise HTTPException(403, "HR / Manager / Super Admin only")


async def _notify_uploader(db, *, user_email: str, user_id: str, name: str,
                           doc_type: str, decision: str, comment: str = "", decider: dict = None):
    try:
        from notif_engine import notify
        title = f"Your {doc_type.replace('_',' ')} was {decision}"
        message = comment or f"Your document submission was reviewed."
        decider_name = (decider or {}).get("name", "Reviewer")
        await notify(
            db,
            event="document_verification",
            user_id=user_id,
            user_email=user_email,
            title=title,
            message=message,
            link="/intern/documents",
            variables={
                "name": name,
                "doc_type": doc_type.replace("_", " ").title(),
                "decision": decision.title(),
                "comment": comment or "—",
                "reviewer_name": decider_name,
                "subject": title,
                "body_html": (
                    f"<p>Hi <b>{html.escape(name)}</b>,</p>"
                    f"<p>Your <b>{doc_type.replace('_',' ').title()}</b> document was "
                    f"<b style='color:{ '#10B981' if decision=='approved' else '#DC2626' }'>{decision.upper()}</b> "
                    f"by <b>{html.escape(decider_name)}</b>.</p>"
                    + (f"<p><b>Reviewer's note:</b></p><blockquote style='border-left:4px solid #F97316;padding:8px 14px;background:#FFF7ED;'>{html.escape(comment)}</blockquote>" if comment else "")
                    + "<p>You can re-upload from your portal if changes are needed.</p>"
                ),
            },
            triggered_by={"name": decider_name, "email": (decider or {}).get("email", "")},
        )
    except Exception:
        pass


def register_doc_verification(api: APIRouter, db, get_current_user):

    @api.get("/doc-verification")
    async def list_docs(status: Optional[str] = None, user=Depends(get_current_user)):
        """status filter: pending | approved | rejected | None (= all)."""
        _check_priv(user)
        out: List[dict] = []
        # Pull every intern with submitted_docs
        cur = db.interns.find({}, {"_id": 0})
        async for intern in cur:
            docs = intern.get("submitted_docs") or {}
            for doc_type, d in docs.items():
                v = d.get("verification") or {"status": "pending", "comments": []}
                if status and v.get("status") != status:
                    continue
                out.append({
                    "kind": "intern",
                    "owner_id": intern["id"],
                    "owner_name": intern.get("name"),
                    "owner_email": intern.get("email"),
                    "owner_role": "intern",
                    "doc_type": doc_type,
                    "file_name": d.get("file_name"),
                    "mime_type": d.get("mime_type"),
                    "submitted_at": d.get("submitted_at"),
                    "note": d.get("note", ""),
                    "verification": v,
                })
        # Sort: pending first, then by submitted_at desc (safe-parse)
        def _safe_ts(s):
            if not s:
                return 0.0
            try:
                return datetime.fromisoformat(s).timestamp()
            except Exception:
                return 0.0
        out.sort(key=lambda x: (
            0 if (x["verification"].get("status", "pending") == "pending") else 1,
            -_safe_ts(x.get("submitted_at")),
        ))
        return out

    @api.get("/doc-verification/{kind}/{owner_id}/{doc_type}")
    async def get_doc(kind: str, owner_id: str, doc_type: str, user=Depends(get_current_user)):
        _check_priv(user)
        if kind != "intern":
            raise HTTPException(400, "Unsupported kind")
        intern = await db.interns.find_one({"id": owner_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Owner not found")
        d = (intern.get("submitted_docs") or {}).get(doc_type)
        if not d:
            raise HTTPException(404, "Document not found")
        v = d.get("verification") or {"status": "pending", "comments": []}
        return {
            "file_name": d.get("file_name"),
            "mime_type": d.get("mime_type"),
            "content_base64": d.get("content_base64"),
            "submitted_at": d.get("submitted_at"),
            "note": d.get("note", ""),
            "owner_name": intern.get("name"),
            "owner_email": intern.get("email"),
            "doc_type": doc_type,
            "verification": v,
        }

    @api.post("/doc-verification/{kind}/{owner_id}/{doc_type}/decision")
    async def submit_decision(kind: str, owner_id: str, doc_type: str,
                              payload: DecisionIn, user=Depends(get_current_user)):
        _check_priv(user)
        if kind != "intern":
            raise HTTPException(400, "Unsupported kind")
        intern = await db.interns.find_one({"id": owner_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Owner not found")
        docs = intern.get("submitted_docs") or {}
        d = docs.get(doc_type)
        if not d:
            raise HTTPException(404, "Document not found")

        now = datetime.now(timezone.utc).isoformat()
        v = d.get("verification") or {"status": "pending", "comments": []}
        v["status"] = payload.decision
        v["decided_by"] = {"id": user["id"], "name": user.get("name", ""), "email": user.get("email", ""), "role": user.get("role", "")}
        v["decided_at"] = now
        comments = list(v.get("comments") or [])
        if payload.comment and payload.comment.strip():
            comments.append({
                "id": str(uuid.uuid4()),
                "by_name": user.get("name", ""),
                "by_role": user.get("role", ""),
                "at": now,
                "message": payload.comment.strip(),
            })
        v["comments"] = comments
        d["verification"] = v
        # legacy: mirror `verified` flag for backwards compat
        d["verified"] = payload.decision == "approved"
        docs[doc_type] = d

        await db.interns.update_one(
            {"id": intern["id"]},
            {"$set": {"submitted_docs": docs, "updated_at": now}},
        )
        # Notify intern (use linked user if any)
        target_email = intern.get("email", "")
        target_user_id = intern.get("linked_user_id") or intern["id"]
        await _notify_uploader(
            db, user_email=target_email, user_id=target_user_id, name=intern.get("name", ""),
            doc_type=doc_type, decision=payload.decision, comment=payload.comment or "",
            decider={"name": user.get("name", ""), "email": user.get("email", "")},
        )
        return {"ok": True, "verification": v}

    @api.post("/doc-verification/{kind}/{owner_id}/{doc_type}/comment")
    async def add_comment(kind: str, owner_id: str, doc_type: str,
                          payload: CommentIn, user=Depends(get_current_user)):
        _check_priv(user)
        if kind != "intern":
            raise HTTPException(400, "Unsupported kind")
        intern = await db.interns.find_one({"id": owner_id}, {"_id": 0})
        if not intern:
            raise HTTPException(404, "Owner not found")
        docs = intern.get("submitted_docs") or {}
        d = docs.get(doc_type)
        if not d:
            raise HTTPException(404, "Document not found")
        v = d.get("verification") or {"status": "pending", "comments": []}
        comments = list(v.get("comments") or [])
        comments.append({
            "id": str(uuid.uuid4()),
            "by_name": user.get("name", ""),
            "by_role": user.get("role", ""),
            "at": datetime.now(timezone.utc).isoformat(),
            "message": payload.message.strip(),
        })
        v["comments"] = comments
        d["verification"] = v
        docs[doc_type] = d
        await db.interns.update_one(
            {"id": intern["id"]},
            {"$set": {"submitted_docs": docs, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"ok": True, "verification": v}
