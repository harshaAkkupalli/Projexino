"""
Presence tracking + auth-event log.

Collections:
  • user_presence — {user_id, name, email, role, status, last_seen, session_started}
  • auth_events  — {id, user_id, name, email, role, kind, status?, at, meta}
                    kind: 'login' | 'logout' | 'status_change' | 'heartbeat_first'

Endpoints (auth required):
  • POST   /api/presence/heartbeat        — any user, called every minute by frontend
  • POST   /api/presence/status           — set own status (whitelist; offline blocked)
  • GET    /api/presence/me               — own presence
  • POST   /api/presence/logout-marker    — sent on tab close/logout intent (best-effort)

Admin / manager / hr endpoints:
  • GET    /api/admin/presence            — list current presence (every known user)
  • GET    /api/admin/auth-events         — filterable activity log
  • GET    /api/admin/auth-events/summary — aggregate (per day or per month)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel


# Statuses an employee may set (anything else rejected).
# Per requirement: only "online" or "on_break" can be self-selected.
# Offline / Out-of-office / Away are deliberately blocked.
EMPLOYEE_STATUSES = ["online", "on_break"]
ONLINE_THRESHOLD_SECONDS = 90   # heartbeat every 60s → 90s grace


class StatusIn(BaseModel):
    status: str


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(d: datetime) -> str:
    return d.isoformat()


def _is_online(presence: dict) -> bool:
    if not presence:
        return False
    last_seen = presence.get("last_seen")
    if not last_seen:
        return False
    try:
        last = datetime.fromisoformat(last_seen)
    except Exception:
        return False
    return (_now() - last).total_seconds() <= ONLINE_THRESHOLD_SECONDS


async def log_auth_event(db, *, user: dict, kind: str, status: Optional[str] = None, meta: Optional[dict] = None):
    """Append a row to db.auth_events. Safe to call repeatedly."""
    await db.auth_events.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": user.get("role", ""),
        "kind": kind,
        "status": status or "",
        "at": _iso(_now()),
        "meta": meta or {},
    })


def register_presence(api: APIRouter, db, get_current_user):

    @api.post("/presence/heartbeat")
    async def heartbeat(user=Depends(get_current_user)):
        now = _now()
        existing = await db.user_presence.find_one({"user_id": user["id"]}, {"_id": 0})
        was_online = _is_online(existing) if existing else False
        update = {
            "user_id": user["id"],
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "role": user.get("role", ""),
            "last_seen": _iso(now),
            "status": (existing or {}).get("status") or "online",
        }
        if not was_online:
            # transitioned offline → online
            update["session_started"] = _iso(now)
            await log_auth_event(db, user=user, kind="login",
                                 status=update["status"],
                                 meta={"reconnect": bool(existing)})
        await db.user_presence.update_one(
            {"user_id": user["id"]}, {"$set": update}, upsert=True,
        )
        return {"ok": True, "online": True, "status": update["status"]}

    @api.post("/presence/status")
    async def set_status(payload: StatusIn, user=Depends(get_current_user)):
        s = (payload.status or "").strip().lower()
        if s not in EMPLOYEE_STATUSES:
            raise HTTPException(400, f"Status must be one of {EMPLOYEE_STATUSES}")
        await db.user_presence.update_one(
            {"user_id": user["id"]},
            {"$set": {"status": s, "last_seen": _iso(_now())}},
            upsert=True,
        )
        await log_auth_event(db, user=user, kind="status_change", status=s)
        return {"ok": True, "status": s}

    @api.get("/presence/me")
    async def my_presence(user=Depends(get_current_user)):
        p = await db.user_presence.find_one({"user_id": user["id"]}, {"_id": 0}) or {}
        return {
            "status": p.get("status") or "online",
            "last_seen": p.get("last_seen"),
            "online": _is_online(p),
            "session_started": p.get("session_started"),
            "allowed_statuses": EMPLOYEE_STATUSES,
            "notice_shown": bool(p.get("notice_shown")),
        }

    @api.post("/presence/notice-ack")
    async def notice_ack(user=Depends(get_current_user)):
        await db.user_presence.update_one(
            {"user_id": user["id"]},
            {"$set": {"notice_shown": True, "notice_at": _iso(_now())}},
            upsert=True,
        )
        return {"ok": True}

    @api.post("/presence/logout-marker")
    async def logout_marker(user=Depends(get_current_user)):
        await log_auth_event(db, user=user, kind="logout")
        # Force them offline by aging last_seen
        await db.user_presence.update_one(
            {"user_id": user["id"]},
            {"$set": {"last_seen": (datetime.now(timezone.utc) - timedelta(seconds=ONLINE_THRESHOLD_SECONDS * 2)).isoformat()}},
        )
        return {"ok": True}

    # ───── Admin / privileged endpoints ─────
    def _require_priv(u):
        if u.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")

    @api.get("/admin/presence")
    async def admin_presence(user=Depends(get_current_user)):
        _require_priv(user)
        # Build a row per known user from `users` collection joined with `user_presence`
        users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}).to_list(1000)
        presence_docs = {p["user_id"]: p for p in await db.user_presence.find({}, {"_id": 0}).to_list(1000)}
        out = []
        for u in users:
            p = presence_docs.get(u["id"]) or {}
            out.append({
                **u,
                "status": p.get("status") or "offline",
                "last_seen": p.get("last_seen"),
                "session_started": p.get("session_started"),
                "online": _is_online(p),
            })
        out.sort(key=lambda r: (not r["online"], r.get("last_seen") or "", r["name"]))
        return out

    @api.get("/admin/auth-events")
    async def list_auth_events(
        user_id: Optional[str] = None,
        from_iso: Optional[str] = None,
        to_iso: Optional[str] = None,
        kind: Optional[str] = None,
        limit: int = 500,
        user=Depends(get_current_user),
    ):
        _require_priv(user)
        q: dict = {}
        if user_id:
            q["user_id"] = user_id
        if kind:
            q["kind"] = kind
        if from_iso or to_iso:
            q["at"] = {}
            if from_iso:
                q["at"]["$gte"] = from_iso
            if to_iso:
                q["at"]["$lte"] = to_iso
        cur = db.auth_events.find(q, {"_id": 0}).sort("at", -1).limit(min(limit, 2000))
        return await cur.to_list(min(limit, 2000))

    @api.get("/admin/auth-events/summary")
    async def auth_summary(
        period: Literal["day", "month"] = "day",
        user_id: Optional[str] = None,
        user=Depends(get_current_user),
    ):
        _require_priv(user)
        q: dict = {"kind": {"$in": ["login", "logout", "status_change"]}}
        if user_id:
            q["user_id"] = user_id
        # last 60 days for day buckets, last 12 months for month buckets
        if period == "day":
            since = (_now() - timedelta(days=60)).isoformat()
            q["at"] = {"$gte": since}
        else:
            since = (_now() - timedelta(days=365)).isoformat()
            q["at"] = {"$gte": since}
        cur = db.auth_events.find(q, {"_id": 0, "user_id": 1, "name": 1, "kind": 1, "at": 1, "status": 1})
        events = await cur.to_list(5000)
        # group: day = YYYY-MM-DD ; month = YYYY-MM
        buckets: dict = {}
        for ev in events:
            at = (ev.get("at") or "")[:10] if period == "day" else (ev.get("at") or "")[:7]
            if not at:
                continue
            b = buckets.setdefault(at, {"date": at, "logins": 0, "logouts": 0, "status_changes": 0, "unique_users": set()})
            if ev["kind"] == "login":
                b["logins"] += 1
            elif ev["kind"] == "logout":
                b["logouts"] += 1
            else:
                b["status_changes"] += 1
            if ev.get("user_id"):
                b["unique_users"].add(ev["user_id"])
        out = []
        for b in sorted(buckets.values(), key=lambda x: x["date"], reverse=True):
            b["unique_users"] = len(b["unique_users"])
            out.append(b)
        return out

    @api.get("/admin/presence/stats")
    async def presence_stats(user=Depends(get_current_user)):
        _require_priv(user)
        # Live snapshot stats
        all_users = await db.users.count_documents({})
        presence_docs = await db.user_presence.find({}, {"_id": 0}).to_list(1000)
        now = _now()
        online = 0
        by_status: dict = {}
        for p in presence_docs:
            if _is_online(p):
                online += 1
                s = p.get("status") or "online"
                by_status[s] = by_status.get(s, 0) + 1
        # Today's login events
        today_iso = now.date().isoformat()
        logins_today = await db.auth_events.count_documents({"kind": "login", "at": {"$gte": today_iso}})
        return {
            "total_users": all_users,
            "online_now": online,
            "by_status": by_status,
            "logins_today": logins_today,
        }

    @api.get("/admin/presence/hours")
    async def presence_hours(
        period: Literal["day", "month"] = "month",
        days: int = 30,
        user=Depends(get_current_user),
    ):
        """Aggregate working-hours per user by pairing login/logout events.
        Admin only — payroll-grade data."""
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Forbidden")
        # Choose lookback window
        if period == "day":
            since = (_now() - timedelta(days=max(1, days))).isoformat()
        else:
            since = (_now() - timedelta(days=max(30, days))).isoformat()
        cur = db.auth_events.find(
            {"at": {"$gte": since}, "kind": {"$in": ["login", "logout"]}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1, "kind": 1, "at": 1},
        ).sort("at", 1)
        events = await cur.to_list(10000)
        per_user: dict = {}
        active_logins: dict = {}  # user_id -> login_at
        for ev in events:
            uid = ev.get("user_id")
            if not uid:
                continue
            row = per_user.setdefault(uid, {
                "user_id": uid,
                "name": ev.get("name", ""),
                "email": ev.get("email", ""),
                "role": ev.get("role", ""),
                "sessions": 0,
                "total_seconds": 0,
                "days_active": set(),
            })
            at_str = ev.get("at") or ""
            try:
                at_dt = datetime.fromisoformat(at_str)
            except Exception:
                continue
            row["days_active"].add(at_str[:10])
            if ev["kind"] == "login":
                # Close any dangling login first (cap at 8h to avoid runaways)
                prev = active_logins.get(uid)
                if prev is not None:
                    dur = min(8 * 3600, (at_dt - prev).total_seconds())
                    if dur > 0:
                        row["total_seconds"] += dur
                        row["sessions"] += 1
                active_logins[uid] = at_dt
            elif ev["kind"] == "logout":
                login_at = active_logins.pop(uid, None)
                if login_at is not None:
                    dur = min(12 * 3600, max(0, (at_dt - login_at).total_seconds()))
                    row["total_seconds"] += dur
                    row["sessions"] += 1
        # Close remaining active sessions using "now"
        now = _now()
        for uid, login_at in active_logins.items():
            row = per_user.get(uid)
            if row:
                dur = min(12 * 3600, max(0, (now - login_at).total_seconds()))
                row["total_seconds"] += dur
                if dur > 0:
                    row["sessions"] += 1
        out = []
        for row in per_user.values():
            out.append({
                "user_id": row["user_id"],
                "name": row["name"],
                "email": row["email"],
                "role": row["role"],
                "sessions": row["sessions"],
                "total_seconds": int(row["total_seconds"]),
                "total_hours": round(row["total_seconds"] / 3600.0, 2),
                "days_active": len(row["days_active"]),
            })
        out.sort(key=lambda r: r["total_seconds"], reverse=True)
        return out
