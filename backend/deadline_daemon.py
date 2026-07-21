"""
deadline_daemon.py — Iter 35

Runs in the background and once per day (default 08:00 local) compiles two
notification digests:

  • For each ASSIGNEE with one or more tasks due within the next 24h:
      "Your Daily Target Plan" — one in-app + email notification listing every
      task they need to ship today.

  • For each MANAGER / SUPER_ADMIN who owns tasks that are overdue OR have
    looming deadlines:
      "Slipped Schedule Risk Alert" — listing every at-risk task and its
      assignee, so they can rebalance work.

The loop checks every ~5 minutes whether the current local time falls inside
the firing window (08:00–08:10) and the last successful run was on a
different calendar day, then fires once. This keeps the worker idempotent
across pod restarts without needing a separate cron infrastructure.
"""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List

log = logging.getLogger("deadline_daemon")


def _today_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


def _within_window(now: datetime, hour: int = 8, window_minutes: int = 10) -> bool:
    return now.hour == hour and now.minute < window_minutes


async def _send_digest(db, user: Dict[str, Any], title: str, message: str, link: str, kind: str) -> None:
    try:
        from notif_engine import notify
        await notify(
            db,
            event=kind,
            user_id=user["id"],
            user_email=user.get("email", ""),
            title=title,
            message=message,
            link=link,
            variables={"name": user.get("name", ""), "summary": message},
            triggered_by={"name": "Projexino", "email": "scheduler@projexino"},
        )
    except Exception:
        log.exception("digest notify failed for %s", user.get("email"))


async def _run_once(db) -> Dict[str, int]:
    """Build & dispatch the two digests. Returns counts for logging."""
    now = datetime.now(timezone.utc)
    horizon = now + timedelta(hours=24)
    today_str = now.strftime("%Y-%m-%d")
    horizon_str = horizon.strftime("%Y-%m-%d")

    # Find every uncompleted task with a due_date inside today..+24h OR overdue
    pending_states = ["todo", "in_progress", "blocked", "review"]
    cur = db.tasks.find(
        {
            "status": {"$in": pending_states},
            "due_date": {"$ne": "", "$lte": horizon_str},
        },
        {"_id": 0},
    )
    tasks = await cur.to_list(2000)

    # Partition by assignee for "Daily Target Plan"
    by_assignee: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    overdue_for_manager: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for t in tasks:
        aid = t.get("assignee_id", "")
        if aid:
            by_assignee[aid].append(t)
        # Anyone with a due_date < today is overdue → manager attention.
        if t.get("due_date", "") < today_str:
            mid = t.get("reporting_manager_id") or t.get("owner_id")
            if mid:
                overdue_for_manager[mid].append(t)

    fired_assignee = 0
    fired_manager = 0

    for aid, items in by_assignee.items():
        user = await db.users.find_one({"id": aid}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        if not user:
            continue
        lines = []
        for t in sorted(items, key=lambda x: (x.get("priority", "medium"), x.get("due_date", ""))):
            lines.append(f"• [{t.get('priority','medium').upper()}] {t['title']} — due {t.get('due_date') or 'today'}")
        msg = "\n".join(lines[:25]) + (f"\n…and {len(items) - 25} more." if len(items) > 25 else "")
        await _send_digest(
            db, user,
            title=f"📌 Your Daily Target Plan ({len(items)} task{'s' if len(items) != 1 else ''})",
            message=msg,
            link="/app/tasks",
            kind="daily_target_plan",
        )
        fired_assignee += 1

    for mid, items in overdue_for_manager.items():
        user = await db.users.find_one({"id": mid}, {"_id": 0, "id": 1, "email": 1, "name": 1})
        if not user:
            continue
        lines = [
            f"• {t['title']} — assignee {t.get('assignee_email') or t.get('assignee') or 'unassigned'} — due {t.get('due_date', '')}"
            for t in items[:30]
        ]
        msg = "\n".join(lines) + (f"\n…and {len(items) - 30} more overdue." if len(items) > 30 else "")
        await _send_digest(
            db, user,
            title=f"⚠️ Slipped Schedule Risk Alert ({len(items)} task{'s' if len(items) != 1 else ''})",
            message=msg,
            link="/app/tasks",
            kind="slipped_schedule_alert",
        )
        fired_manager += 1

    await db.deadline_daemon_runs.insert_one({
        "ran_at": now.isoformat(),
        "day_key": _today_key(now),
        "fired_assignee_digests": fired_assignee,
        "fired_manager_digests": fired_manager,
        "total_tasks_scanned": len(tasks),
    })
    return {"fired_assignee": fired_assignee, "fired_manager": fired_manager, "scanned": len(tasks)}


async def deadline_scheduler_loop(db, fire_hour: int = 8, check_interval_seconds: int = 300):
    """Fire once per calendar day inside the [fire_hour:00, fire_hour:10] window."""
    log.info("deadline_scheduler_loop started (hour=%02d:00)", fire_hour)
    while True:
        try:
            now = datetime.now(timezone.utc)
            if _within_window(now, hour=fire_hour):
                last = await db.deadline_daemon_runs.find_one(
                    {"day_key": _today_key(now)}, {"_id": 0, "day_key": 1},
                )
                if not last:
                    result = await _run_once(db)
                    log.info("deadline_daemon ran: %s", result)
        except Exception:
            log.exception("deadline_scheduler_loop iteration failed")
        await asyncio.sleep(check_interval_seconds)


# Manual-fire helper — exposed via /api/tasks/deadlines/run (admin-only).
async def fire_now(db) -> Dict[str, int]:
    return await _run_once(db)
