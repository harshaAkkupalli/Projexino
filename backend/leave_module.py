"""
leave_module.py — Iter 37 · Leave / PTO subsystem

Collections (MongoDB)
─────────────────────
  • leave_policies      One doc per role describing annual allowances by leave_type
  • pto_balances        Per-user running ledger {user_id, balances: {pto, sick, casual, ...}}
  • leave_requests      Workflow rows {employee, days, range, status, approver, reason, ...}

REST surface
────────────
  GET   /api/leave/policies                — admin only · current matrix
  PUT   /api/leave/policies                — admin only · update annual allowances
  GET   /api/leave/balance                 — caller's balance (priv may pass ?employee_id)
  POST  /api/leave/balance/seed            — admin reset/seed of any employee
  GET   /api/leave/requests                — own for employees, all for admin/manager/hr
  POST  /api/leave/requests                — submit (server-validates available balance)
  POST  /api/leave/requests/{id}/approve   — decrements ledger, fires OOO + notif
  POST  /api/leave/requests/{id}/reject    — body {reason}
  DELETE /api/leave/requests/{id}          — withdraw a pending OR own request

Rules
─────
  • Balance is decremented ONLY on approve, never on submit (TEST CASE 3 invariant).
  • Submitting 15 days when 10 left → server returns 400 "Insufficient leave balance"
    so the same rule is enforced even if a malicious client bypasses the UI.
  • Approving a request writes an `out_of_office` doc per day so the task assigner
    can refuse new tasks during that window (see server.py:create_task guard).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, date, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

logger = logging.getLogger("leave_module")

LEAVE_TYPES = ("pto", "sick", "casual", "unpaid")
PRIV_VIEW_ROLES = ("super_admin", "admin", "manager", "hr")

# Default annual allowances per role (days).
DEFAULT_POLICY: Dict[str, Dict[str, int]] = {
    "super_admin": {"pto": 25, "sick": 12, "casual": 6, "unpaid": 0},
    "admin":       {"pto": 22, "sick": 12, "casual": 6, "unpaid": 0},
    "manager":     {"pto": 20, "sick": 10, "casual": 6, "unpaid": 0},
    "hr":          {"pto": 22, "sick": 12, "casual": 6, "unpaid": 0},
    "team_member": {"pto": 15, "sick": 8,  "casual": 5, "unpaid": 0},
    "intern":      {"pto": 10, "sick": 6,  "casual": 3, "unpaid": 0},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _days_inclusive(start: str, end: str) -> int:
    """Calendar days between two ISO dates, inclusive. Weekend-blind by design — the
    operator's leave policy is the source of truth for what counts as a working day.
    """
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        if e < s:
            return 0
        return (e - s).days + 1
    except Exception:
        return 0


def _date_range(start: str, end: str) -> List[str]:
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
    except Exception:
        return []
    out, d = [], s
    while d <= e:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


# ---- Pydantic models ----
class PolicyMatrix(BaseModel):
    matrix: Dict[str, Dict[str, int]] = Field(default_factory=dict)


class LeaveRequestIn(BaseModel):
    leave_type: str = Field(..., pattern="^(pto|sick|casual|unpaid)$")
    start_date: str  # ISO YYYY-MM-DD
    end_date: str    # ISO YYYY-MM-DD
    reason: str = Field("", max_length=2000)


class RejectIn(BaseModel):
    reason: str = Field(..., min_length=2, max_length=2000)


class BalanceSeedIn(BaseModel):
    employee_id: str
    balances: Dict[str, int] = Field(default_factory=dict)


def register_leave(api: APIRouter, db, get_current_user):
    async def _priv(user: Dict[str, Any]) -> None:
        if user.get("role") not in PRIV_VIEW_ROLES:
            raise HTTPException(403, "Not authorised")

    async def _get_policy() -> Dict[str, Dict[str, int]]:
        doc = await db.leave_policies.find_one({"id": "active"}, {"_id": 0})
        if doc and isinstance(doc.get("matrix"), dict):
            # merge with defaults so newly-added roles fall back gracefully
            merged = {r: dict(DEFAULT_POLICY[r]) for r in DEFAULT_POLICY}
            for r, mods in doc["matrix"].items():
                merged.setdefault(r, {})
                for k, v in (mods or {}).items():
                    merged[r][k] = int(v)
            return merged
        return DEFAULT_POLICY

    async def _ensure_balance(user: Dict[str, Any]) -> Dict[str, Any]:
        """Lazy-seed a balance doc using the role policy if one doesn't exist."""
        existing = await db.pto_balances.find_one({"user_id": user["id"]}, {"_id": 0})
        if existing:
            return existing
        policy = await _get_policy()
        defaults = dict(policy.get(user.get("role") or "team_member", {}))
        doc = {
            "id": uuid.uuid4().hex,
            "user_id": user["id"],
            "user_email": user.get("email", ""),
            "role": user.get("role", ""),
            "year": datetime.now(timezone.utc).year,
            "balances": defaults,
            "consumed": {t: 0 for t in LEAVE_TYPES},
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.pto_balances.insert_one(dict(doc))
        return doc

    # ============== POLICY ==============
    @api.get("/leave/policies")
    async def get_policies(user=Depends(get_current_user)):
        await _priv(user)
        matrix = await _get_policy()
        return {"matrix": matrix, "roles": list(matrix.keys()), "leave_types": list(LEAVE_TYPES)}

    @api.put("/leave/policies")
    async def update_policies(payload: PolicyMatrix, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin"):
            raise HTTPException(403, "Only admins can update leave policies")
        # validate
        clean: Dict[str, Dict[str, int]] = {}
        for r, mods in (payload.matrix or {}).items():
            clean[r] = {}
            for t, v in (mods or {}).items():
                if t in LEAVE_TYPES:
                    clean[r][t] = max(0, int(v))
        await db.leave_policies.update_one(
            {"id": "active"},
            {"$set": {"id": "active", "matrix": clean, "updated_at": _now(), "updated_by": user.get("email")}},
            upsert=True,
        )
        return {"ok": True, "matrix": clean}

    # ============== BALANCE ==============
    @api.get("/leave/balance")
    async def get_balance(employee_id: Optional[str] = None, user=Depends(get_current_user)):
        # Privacy: non-priv users may only query their own
        if user.get("role") not in PRIV_VIEW_ROLES:
            if employee_id and employee_id != user["id"]:
                raise HTTPException(403, "Not authorised")
            employee_id = user["id"]
        if not employee_id:
            employee_id = user["id"]
        target = await db.users.find_one({"id": employee_id}, {"_id": 0, "id": 1, "email": 1, "role": 1, "name": 1})
        if not target:
            raise HTTPException(404, "Employee not found")
        bal = await _ensure_balance(target)
        # remaining = allowance - consumed
        remaining = {t: max(0, int(bal["balances"].get(t, 0)) - int(bal["consumed"].get(t, 0))) for t in LEAVE_TYPES}
        return {
            "employee": {"id": target["id"], "email": target["email"], "name": target.get("name", ""), "role": target.get("role", "")},
            "year": bal["year"],
            "allowance": bal["balances"],
            "consumed": bal["consumed"],
            "remaining": remaining,
        }

    @api.post("/leave/balance/seed")
    async def seed_balance(payload: BalanceSeedIn, user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin"):
            raise HTTPException(403, "Only admins may reset leave balances")
        target = await db.users.find_one({"id": payload.employee_id}, {"_id": 0, "id": 1, "email": 1, "role": 1})
        if not target:
            raise HTTPException(404, "Employee not found")
        policy = await _get_policy()
        defaults = dict(policy.get(target.get("role") or "team_member", {}))
        merged = {**defaults, **{k: int(v) for k, v in payload.balances.items() if k in LEAVE_TYPES}}
        await db.pto_balances.update_one(
            {"user_id": target["id"]},
            {"$set": {
                "user_id": target["id"], "user_email": target.get("email", ""),
                "role": target.get("role", ""), "year": datetime.now(timezone.utc).year,
                "balances": merged, "consumed": {t: 0 for t in LEAVE_TYPES},
                "updated_at": _now(),
            }},
            upsert=True,
        )
        return {"ok": True, "balances": merged}

    # ============== REQUEST ==============
    @api.get("/leave/requests")
    async def list_requests(
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        q: Dict[str, Any] = {}
        if user.get("role") not in PRIV_VIEW_ROLES:
            q["employee.id"] = user["id"]
        elif employee_id:
            q["employee.id"] = employee_id
        if status:
            q["status"] = status
        cur = db.leave_requests.find(q, {"_id": 0}).sort("submitted_at", -1)
        return await cur.to_list(500)

    @api.post("/leave/requests")
    async def submit_request(payload: LeaveRequestIn, user=Depends(get_current_user)):
        days = _days_inclusive(payload.start_date, payload.end_date)
        if days < 1:
            raise HTTPException(400, "end_date must be on or after start_date")
        bal = await _ensure_balance(user)
        allowance = int(bal["balances"].get(payload.leave_type, 0))
        consumed = int(bal["consumed"].get(payload.leave_type, 0))
        remaining = allowance - consumed
        # CRITICAL guard — same rule the UI enforces, but at API layer (TEST CASE 4)
        if days > remaining and payload.leave_type != "unpaid":
            raise HTTPException(
                400,
                f"Insufficient leave balance. You only have {remaining} day(s) remaining for {payload.leave_type}.",
            )
        # Reject if overlapping with another pending/approved request for same person
        overlap = await db.leave_requests.find_one(
            {
                "employee.id": user["id"],
                "status": {"$in": ["pending", "approved"]},
                "$and": [{"start_date": {"$lte": payload.end_date}}, {"end_date": {"$gte": payload.start_date}}],
            },
            {"_id": 0, "id": 1, "start_date": 1, "end_date": 1, "status": 1},
        )
        if overlap:
            raise HTTPException(409, f"Overlaps with an existing {overlap['status']} request ({overlap['start_date']} → {overlap['end_date']})")

        doc = {
            "id": uuid.uuid4().hex,
            "employee": {"id": user["id"], "email": user.get("email"), "name": user.get("name", ""), "role": user.get("role", "")},
            "leave_type": payload.leave_type,
            "start_date": payload.start_date,
            "end_date": payload.end_date,
            "days": days,
            "reason": payload.reason or "",
            "status": "pending",
            "submitted_at": _now(),
            "decided_at": "",
            "decided_by": "",
            "decision_reason": "",
        }
        await db.leave_requests.insert_one(dict(doc))

        # Notify the approver chain (manager/admin/hr) — anyone with PRIV_VIEW_ROLES
        try:
            from notif_engine import notify
            sa_cur = db.users.find(
                {"role": {"$in": list(PRIV_VIEW_ROLES)}},
                {"_id": 0, "id": 1, "email": 1, "name": 1, "role": 1},
            )
            recipients = []
            async for u in sa_cur:
                if u["id"] != user["id"]:
                    recipients.append(u)
            for r in recipients[:25]:
                await notify(
                    db, event="leave_requested",
                    user_id=r["id"], user_email=r.get("email", ""),
                    title=f"🏖️ Leave request: {doc['employee']['name'] or doc['employee']['email']}",
                    message=f"{days} day(s) of {payload.leave_type.upper()} from {payload.start_date} to {payload.end_date}.",
                    link="/app/leave?tab=approvals",
                    variables={"name": r.get("name", ""), "employee_name": doc["employee"]["name"], "days": days, "leave_type": payload.leave_type},
                    triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                )
        except Exception:
            logger.exception("leave_requested notify failed")
        return doc

    @api.post("/leave/requests/{rid}/approve")
    async def approve_request(rid: str, user=Depends(get_current_user)):
        await _priv(user)
        req = await db.leave_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Request not found")
        if req["status"] != "pending":
            raise HTTPException(400, f"Cannot approve from '{req['status']}'")
        # Recheck balance (race-safe)
        eid = req["employee"]["id"]
        bal = await db.pto_balances.find_one({"user_id": eid}, {"_id": 0})
        if not bal:
            # auto-seed for safety
            target = await db.users.find_one({"id": eid}, {"_id": 0, "id": 1, "email": 1, "role": 1, "name": 1})
            bal = await _ensure_balance(target)
        lt = req["leave_type"]
        if lt != "unpaid":
            allowance = int(bal["balances"].get(lt, 0))
            consumed = int(bal["consumed"].get(lt, 0))
            remaining = allowance - consumed
            if req["days"] > remaining:
                raise HTTPException(409, f"Insufficient {lt} balance — {remaining} remaining, {req['days']} requested.")
            await db.pto_balances.update_one(
                {"user_id": eid},
                {"$inc": {f"consumed.{lt}": int(req["days"])}, "$set": {"updated_at": _now()}},
            )
        now = _now()
        await db.leave_requests.update_one(
            {"id": rid},
            {"$set": {
                "status": "approved",
                "decided_at": now,
                "decided_by": {"id": user["id"], "email": user.get("email"), "name": user.get("name", "")},
                "decision_reason": "",
            }},
        )
        # Write Out-of-Office days so the task assigner can block new task assignments
        days_list = _date_range(req["start_date"], req["end_date"])
        await db.out_of_office.delete_many({"employee_id": eid, "leave_request_id": rid})
        await db.out_of_office.insert_many([
            {
                "id": uuid.uuid4().hex,
                "employee_id": eid,
                "employee_email": req["employee"]["email"],
                "leave_request_id": rid,
                "leave_type": lt,
                "date": d,
                "created_at": now,
            } for d in days_list
        ])
        # Push notification to employee
        try:
            from notif_engine import notify
            emp = await db.users.find_one({"id": eid}, {"_id": 0, "id": 1, "email": 1, "name": 1})
            if emp:
                await notify(
                    db, event="leave_approved",
                    user_id=emp["id"], user_email=emp.get("email", ""),
                    title=f"✅ Leave approved · {req['start_date']} → {req['end_date']}",
                    message=f"Your {lt.upper()} for {req['days']} day(s) is approved. Calendar updated.",
                    link="/app/leave",
                    variables={"name": emp.get("name", ""), "days": req["days"], "leave_type": lt},
                    triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
                )
        except Exception:
            logger.exception("leave_approved notify failed")
        return {"ok": True, "request_id": rid, "ooo_days_logged": len(days_list)}

    @api.post("/leave/requests/{rid}/reject")
    async def reject_request(rid: str, payload: RejectIn, user=Depends(get_current_user)):
        await _priv(user)
        req = await db.leave_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Request not found")
        if req["status"] != "pending":
            raise HTTPException(400, f"Cannot reject from '{req['status']}'")
        now = _now()
        await db.leave_requests.update_one(
            {"id": rid},
            {"$set": {
                "status": "rejected",
                "decided_at": now,
                "decided_by": {"id": user["id"], "email": user.get("email"), "name": user.get("name", "")},
                "decision_reason": payload.reason.strip(),
            }},
        )
        try:
            from notif_engine import notify
            await notify(
                db, event="leave_rejected",
                user_id=req["employee"]["id"], user_email=req["employee"]["email"],
                title="↩️ Leave request declined",
                message=f"{(user.get('name') or 'A manager')} declined your leave: {payload.reason}",
                link="/app/leave",
                variables={"name": req["employee"]["name"], "reason": payload.reason},
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
        except Exception:
            logger.exception("leave_rejected notify failed")
        return {"ok": True}

    @api.delete("/leave/requests/{rid}")
    async def withdraw_request(rid: str, user=Depends(get_current_user)):
        req = await db.leave_requests.find_one({"id": rid}, {"_id": 0})
        if not req:
            raise HTTPException(404, "Request not found")
        is_owner = req["employee"]["id"] == user["id"]
        if not is_owner and user.get("role") not in PRIV_VIEW_ROLES:
            raise HTTPException(403, "Not authorised")
        if req["status"] == "approved":
            # Restore the balance + clear OOO days
            if req["leave_type"] != "unpaid":
                await db.pto_balances.update_one(
                    {"user_id": req["employee"]["id"]},
                    {"$inc": {f"consumed.{req['leave_type']}": -int(req["days"])}, "$set": {"updated_at": _now()}},
                )
            await db.out_of_office.delete_many({"leave_request_id": rid})
        await db.leave_requests.delete_one({"id": rid})
        return {"ok": True}

    # ============== OOO LOOKUP (used by task assigner) ==============
    @api.get("/leave/ooo")
    async def list_ooo(
        employee_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        q: Dict[str, Any] = {}
        if employee_id:
            q["employee_id"] = employee_id
        if start_date and end_date:
            q["date"] = {"$gte": start_date, "$lte": end_date}
        elif start_date:
            q["date"] = {"$gte": start_date}
        elif end_date:
            q["date"] = {"$lte": end_date}
        # privacy: non-priv may only see their own
        if user.get("role") not in PRIV_VIEW_ROLES:
            if employee_id and employee_id != user["id"]:
                raise HTTPException(403, "Not authorised")
            q["employee_id"] = user["id"]
        cur = db.out_of_office.find(q, {"_id": 0}).sort("date", 1)
        return await cur.to_list(1000)


async def is_employee_ooo_on(db, employee_id: str, iso_date: str) -> Optional[Dict[str, Any]]:
    """Helper for the task assigner — returns the OOO doc if the employee is
    out on the given date (ISO YYYY-MM-DD), else None.
    """
    if not employee_id or not iso_date:
        return None
    return await db.out_of_office.find_one({"employee_id": employee_id, "date": iso_date}, {"_id": 0})
