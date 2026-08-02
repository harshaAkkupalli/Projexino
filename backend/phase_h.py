"""
PHASE H — Connections (Org chart) + Calendly-style booking system.

------- CONNECTIONS -------
Each user can have `reporting_manager_id` — already added in phase_g.AdminUserUpdate.
This module exposes:
  GET /api/connections/me               — { manager, direct_reports } for the current user
  GET /api/connections/org-chart        — full tree (super_admin / hr / admin)

------- CALENDLY -------
Each admin can create a "booking page" (event type) and share its public URL.
A guest opens the URL, sees free slots based on the admin's working hours and
their connected Google Calendar's busy times, picks one, fills name/email/notes,
and a Google Calendar event is created with a Meet link if the admin has
Google Calendar connected.

Endpoints (auth required for admins; the public booking endpoints are open):
  GET    /api/booking/pages                  — list my booking pages
  POST   /api/booking/pages                  — create
  PATCH  /api/booking/pages/{slug}           — update
  DELETE /api/booking/pages/{slug}
  GET    /api/booking/pages/{slug}/slots     — PUBLIC; ?date=YYYY-MM-DD returns free slots
  POST   /api/booking/pages/{slug}/book      — PUBLIC; { guest_name, guest_email, slot_iso, notes }
  GET    /api/booking/my-bookings            — bookings owned by me (admin)
  GET    /api/booking/upcoming               — upcoming bookings across roles (for dashboard card)
  POST   /api/booking/{booking_id}/cancel    — cancel
  GET    /api/booking/pages/{slug}/public    — PUBLIC; metadata for the booking page

The booking page itself is a frontend route `/book/:slug` that calls the public APIs.

NOTE: To minimise risk we treat Google Calendar integration as "best effort" —
if the user has Gmail OAuth tokens that include the calendar.events scope, we
create a real GCal event with a Meet link. Otherwise we still record the booking
locally and send confirmation emails via Gmail.
"""
from __future__ import annotations

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta, time, date
from typing import List, Optional, Dict

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field

logger = logging.getLogger("projexino.phase_h")
PRIV_VIEW = ("super_admin", "admin", "manager", "hr")


# ====================================================================
# CONNECTIONS
# ====================================================================
def _safe_user(u: Optional[dict]) -> Optional[dict]:
    if not u:
        return None
    return {k: u.get(k) for k in ("id", "name", "email", "role", "designation", "avatar_base64", "avatar_mime", "reporting_manager_id")}


def register_connections(api: APIRouter, db, get_current_user):

    @api.get("/connections/me")
    async def my_connections(user=Depends(get_current_user)):
        u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
        manager = None
        if u.get("reporting_manager_id"):
            manager = await db.users.find_one({"id": u["reporting_manager_id"]}, {"_id": 0, "password_hash": 0})
        direct_reports = []
        async for r in db.users.find({"reporting_manager_id": user["id"]}, {"_id": 0, "password_hash": 0}).sort("name", 1):
            direct_reports.append(_safe_user(r))
        return {"me": _safe_user(u), "manager": _safe_user(manager), "direct_reports": direct_reports}

    @api.get("/connections/org-chart")
    async def org_chart(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin", "admin", "hr"):
            raise HTTPException(403, "Privileged roles only")
        # Fetch every user once (no password / avatar to keep payload small)
        cur = db.users.find({}, {"_id": 0, "password_hash": 0, "avatar_base64": 0})
        rows = await cur.to_list(2000)
        by_id = {u["id"]: _safe_user(u) for u in rows}
        # Build adjacency: parent -> [child_ids]
        children: Dict[str, List[str]] = {}
        roots: List[str] = []
        for u in rows:
            parent = u.get("reporting_manager_id")
            if parent and parent in by_id:
                children.setdefault(parent, []).append(u["id"])
            else:
                # roots = no manager OR explicitly super_admin
                roots.append(u["id"])
        # Sort children & roots by role weight then name
        ROLE_WEIGHT = {"super_admin": 0, "admin": 1, "manager": 2, "hr": 3, "team_member": 4, "intern": 5}
        for v in children.values():
            v.sort(key=lambda x: (ROLE_WEIGHT.get(by_id[x]["role"], 9), by_id[x]["name"] or ""))
        roots.sort(key=lambda x: (ROLE_WEIGHT.get(by_id[x]["role"], 9), by_id[x]["name"] or ""))

        def build(uid: str) -> dict:
            u = by_id[uid]
            node = {**u, "children": [build(c) for c in children.get(uid, [])]}
            return node
        return {"roots": [build(r) for r in roots], "total": len(rows)}


# ====================================================================
# CALENDLY MODELS
# ====================================================================
class WorkingHours(BaseModel):
    # day_of_week 0..6 (Mon..Sun)
    day_of_week: int
    start: str = "09:00"   # HH:MM
    end: str = "17:00"


class BookingPageIn(BaseModel):
    title: str
    slug: Optional[str] = None
    description: str = ""
    duration_minutes: int = 30
    buffer_minutes: int = 5
    timezone_name: str = "Asia/Kolkata"
    working_hours: List[WorkingHours] = [
        WorkingHours(day_of_week=i, start="09:00", end="17:00") for i in range(0, 5)
    ]
    advance_days: int = 21       # how far in future can guests book
    min_notice_minutes: int = 60
    color: str = "#F97316"
    featured: bool = False       # show on public contact page


class BookingPageUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    buffer_minutes: Optional[int] = None
    timezone_name: Optional[str] = None
    working_hours: Optional[List[WorkingHours]] = None
    advance_days: Optional[int] = None
    min_notice_minutes: Optional[int] = None
    color: Optional[str] = None
    archived: Optional[bool] = None
    featured: Optional[bool] = None


class BookIn(BaseModel):
    guest_name: str = Field(min_length=1)
    guest_email: EmailStr
    guest_phone: Optional[str] = ""
    slot_iso: str  # full ISO with TZ offset
    notes: Optional[str] = ""


def _slugify(s: str) -> str:
    out = []
    for ch in (s or "").lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in " -_":
            out.append("-")
    slug = "".join(out).strip("-")
    return (slug or "meet") + "-" + secrets.token_hex(3)


async def _existing_bookings(db, owner_id: str, day_iso: str) -> List[dict]:
    """Bookings for owner on a given YYYY-MM-DD."""
    cur = db.bookings.find(
        {"owner_id": owner_id, "starts_at": {"$gte": day_iso + "T00:00:00",
                                              "$lt": day_iso + "T23:59:59"},
         "status": {"$ne": "cancelled"}}, {"_id": 0},
    )
    return await cur.to_list(500)


def _generate_slots(date_obj: date, page: dict, busy: List[tuple]) -> List[str]:
    """Generate possible start times for a date given the page's working hours and busy windows."""
    day_idx = date_obj.weekday()
    wh = [w for w in (page.get("working_hours") or []) if w["day_of_week"] == day_idx]
    if not wh:
        return []
    duration = int(page.get("duration_minutes") or 30)
    buffer = int(page.get("buffer_minutes") or 0)
    step = duration + buffer
    slots: List[str] = []
    for w in wh:
        try:
            sh, sm = map(int, w["start"].split(":"))
            eh, em = map(int, w["end"].split(":"))
        except Exception:
            continue
        cursor = datetime.combine(date_obj, time(sh, sm), tzinfo=timezone.utc)
        window_end = datetime.combine(date_obj, time(eh, em), tzinfo=timezone.utc)
        while cursor + timedelta(minutes=duration) <= window_end:
            start = cursor
            end = cursor + timedelta(minutes=duration)
            overlap = False
            for bs, be in busy:
                if start < be and end > bs:
                    overlap = True
                    break
            if not overlap:
                slots.append(start.isoformat())
            cursor += timedelta(minutes=step)
    return slots


async def _send_booking_emails(db, booking: dict, page: dict, owner: dict):
    """Best-effort confirmation to both parties via existing Gmail sender."""
    try:
        from notif_engine import notify
        gcal_link = booking.get("meet_link") or booking.get("calendar_link") or ""
        when = booking["starts_at"].replace("T", " ")
        body_guest = (
            f"<p>Hi <b>{booking.get('guest_name','')}</b>,</p>"
            f"<p>Your meeting <b>{page.get('title','')}</b> with <b>{owner.get('name','')}</b> is confirmed.</p>"
            f"<table style='font-size:14px;margin:10px 0'><tr><td>When</td><td><b>{when}</b></td></tr>"
            f"<tr><td>Duration</td><td>{page.get('duration_minutes',30)} min</td></tr>"
            + (f"<tr><td>Meet link</td><td><a href='{gcal_link}'>{gcal_link}</a></td></tr>" if gcal_link else "")
            + f"</table>"
            f"<p>Add to your calendar: <a href='{booking.get('ics_url','#')}'>download .ics</a></p>"
            f"<p>Regards,<br/><b>Projexino</b></p>"
        )
        # Guest
        await notify(
            db, event="booking_confirmed_guest", user_id="guest", user_email=booking["guest_email"],
            title=f"Confirmed: {page.get('title','')} with {owner.get('name','')}",
            message=body_guest[:200], link=gcal_link or "/",
            variables={"name": booking.get("guest_name", ""), "subject": f"Confirmed: {page.get('title','')}",
                       "body_html": body_guest},
            triggered_by={"name": owner.get("name", ""), "email": owner.get("email", "")},
        )
        # Owner
        body_owner = (
            f"<p>Hi <b>{owner.get('name','')}</b>,</p>"
            f"<p><b>{booking.get('guest_name','')}</b> ({booking.get('guest_email','')}) just booked your <b>{page.get('title','')}</b>.</p>"
            f"<table style='font-size:14px;margin:10px 0'><tr><td>When</td><td><b>{when}</b></td></tr>"
            f"<tr><td>Duration</td><td>{page.get('duration_minutes',30)} min</td></tr></table>"
            + (f"<p><b>Guest note:</b> {booking.get('notes','')}</p>" if booking.get("notes") else "")
        )
        await notify(
            db, event="booking_confirmed_owner", user_id=owner["id"], user_email=owner["email"],
            title=f"New booking — {booking.get('guest_name','')}",
            message=body_owner[:200], link="/app/calendly",
            variables={"name": owner.get("name", ""), "subject": f"New booking — {booking.get('guest_name','')}",
                       "body_html": body_owner},
            triggered_by={"name": "Projexino", "email": ""},
        )
    except Exception:
        logger.exception("booking emails failed")


def register_booking(api: APIRouter, db, get_current_user):

    # ===== Manage pages =====
    @api.get("/booking/pages")
    async def list_pages(user=Depends(get_current_user)):
        if user.get("role") not in PRIV_VIEW:
            raise HTTPException(403, "Admins only")
        cur = db.booking_pages.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
        return await cur.to_list(200)

    @api.post("/booking/pages")
    async def create_page(payload: BookingPageIn, user=Depends(get_current_user)):
        if user.get("role") not in PRIV_VIEW:
            raise HTTPException(403, "Admins only")
        slug = payload.slug or _slugify(payload.title)
        # ensure unique
        while await db.booking_pages.find_one({"slug": slug}, {"_id": 0, "id": 1}):
            slug = _slugify(payload.title)
        doc = {
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "owner_name": user.get("name", ""),
            "owner_email": user.get("email", ""),
            "slug": slug,
            **payload.model_dump(exclude={"slug"}),
            "archived": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.booking_pages.insert_one(dict(doc))
        return doc

    @api.patch("/booking/pages/{slug}")
    async def update_page(slug: str, payload: BookingPageUpdate, user=Depends(get_current_user)):
        if user.get("role") not in PRIV_VIEW:
            raise HTTPException(403, "Admins only")
        existing = await db.booking_pages.find_one({"slug": slug, "owner_id": user["id"]}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Page not found")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if "working_hours" in updates:
            updates["working_hours"] = [w if isinstance(w, dict) else w.model_dump() for w in updates["working_hours"]]
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.booking_pages.update_one({"slug": slug}, {"$set": updates})
        return await db.booking_pages.find_one({"slug": slug}, {"_id": 0})

    @api.delete("/booking/pages/{slug}")
    async def delete_page(slug: str, user=Depends(get_current_user)):
        if user.get("role") not in PRIV_VIEW:
            raise HTTPException(403, "Admins only")
        await db.booking_pages.delete_one({"slug": slug, "owner_id": user["id"]})
        return {"ok": True}

    # ===== Public endpoints (no auth) =====
    @api.get("/booking/public/featured")
    async def public_featured():
        """Public list of booking pages flagged `featured: true`. Used by the marketing contact page."""
        cur = db.booking_pages.find(
            {"featured": True, "archived": {"$ne": True}}, {"_id": 0},
        ).sort("created_at", 1)
        pages = await cur.to_list(50)
        # Strip internal fields
        return [{
            "slug": p["slug"],
            "title": p["title"],
            "description": p.get("description", ""),
            "duration_minutes": p.get("duration_minutes", 30),
            "color": p.get("color", "#F97316"),
            "owner_name": p.get("owner_name", ""),
        } for p in pages]

    @api.get("/booking/pages/{slug}/public")
    async def public_page(slug: str):
        page = await db.booking_pages.find_one({"slug": slug, "archived": {"$ne": True}}, {"_id": 0})
        if not page:
            raise HTTPException(404, "Booking page not found")
        # don't expose owner_id directly
        return {
            "slug": page["slug"],
            "title": page["title"],
            "description": page.get("description", ""),
            "duration_minutes": page.get("duration_minutes", 30),
            "color": page.get("color", "#F97316"),
            "owner_name": page.get("owner_name", ""),
            "timezone_name": page.get("timezone_name", "Asia/Kolkata"),
            "advance_days": page.get("advance_days", 21),
            "min_notice_minutes": page.get("min_notice_minutes", 60),
        }

    @api.get("/booking/pages/{slug}/slots")
    async def public_slots(slug: str, date: str):
        page = await db.booking_pages.find_one({"slug": slug, "archived": {"$ne": True}}, {"_id": 0})
        if not page:
            raise HTTPException(404, "Booking page not found")
        try:
            from datetime import date as date_cls
            d = date_cls.fromisoformat(date)
        except Exception:
            raise HTTPException(400, "Invalid date")
        # Bounds check
        today = datetime.now(timezone.utc).date()
        if d < today:
            return {"slots": []}
        if (d - today).days > int(page.get("advance_days", 21)):
            return {"slots": []}
        # Already booked windows
        bk = await _existing_bookings(db, page["owner_id"], date)
        busy = []
        for b in bk:
            try:
                bs = datetime.fromisoformat(b["starts_at"])
                be = datetime.fromisoformat(b["ends_at"])
                busy.append((bs, be))
            except Exception:
                continue
        slots = _generate_slots(d, page, busy)
        # Apply min_notice
        min_notice = int(page.get("min_notice_minutes", 60))
        cutoff = datetime.now(timezone.utc) + timedelta(minutes=min_notice)
        slots = [s for s in slots if datetime.fromisoformat(s) >= cutoff]
        return {"slots": slots}

    @api.post("/booking/pages/{slug}/book")
    async def public_book(slug: str, payload: BookIn):
        page = await db.booking_pages.find_one({"slug": slug, "archived": {"$ne": True}}, {"_id": 0})
        if not page:
            raise HTTPException(404, "Booking page not found")
        try:
            starts = datetime.fromisoformat(payload.slot_iso)
        except Exception:
            raise HTTPException(400, "Invalid slot_iso")
        ends = starts + timedelta(minutes=int(page.get("duration_minutes", 30)))
        # Conflict check
        existing = await db.bookings.find_one({
            "owner_id": page["owner_id"],
            "starts_at": starts.isoformat(),
            "status": {"$ne": "cancelled"},
        })
        if existing:
            raise HTTPException(409, "That slot was just taken — please pick another.")
        booking = {
            "id": str(uuid.uuid4()),
            "owner_id": page["owner_id"],
            "owner_name": page.get("owner_name", ""),
            "owner_email": page.get("owner_email", ""),
            "page_slug": slug,
            "page_title": page["title"],
            "guest_name": payload.guest_name.strip(),
            "guest_email": payload.guest_email.lower(),
            "guest_phone": payload.guest_phone or "",
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
            "duration_minutes": int(page.get("duration_minutes", 30)),
            "notes": payload.notes or "",
            "status": "confirmed",
            "meet_link": "",
            "calendar_event_id": "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        # Try to create a Google Calendar event (best effort)
        try:
            await _create_gcal_event(db, page, booking)
        except Exception:
            logger.exception("GCal create failed; booking still saved locally")
        await db.bookings.insert_one(dict(booking))
        # Send confirmation emails
        owner = await db.users.find_one({"id": page["owner_id"]}, {"_id": 0})
        await _send_booking_emails(db, booking, page, owner or {"id": page["owner_id"],
                                                                "name": page.get("owner_name", ""),
                                                                "email": page.get("owner_email", "")})
        return {"ok": True, "booking_id": booking["id"], "meet_link": booking.get("meet_link", "")}

    # ===== Admin bookings =====
    @api.get("/booking/my-bookings")
    async def my_bookings(user=Depends(get_current_user)):
        if user.get("role") not in PRIV_VIEW:
            raise HTTPException(403, "Admins only")
        cur = db.bookings.find({"owner_id": user["id"]}, {"_id": 0}).sort("starts_at", -1)
        return await cur.to_list(500)

    @api.get("/booking/upcoming")
    async def upcoming(user=Depends(get_current_user)):
        """Used by the dashboard 'Upcoming meetings' card."""
        now_iso = datetime.now(timezone.utc).isoformat()
        q = {"status": "confirmed", "starts_at": {"$gte": now_iso}}
        # Admins see their own + guests with same email match if any
        q["$or"] = [{"owner_id": user["id"]}, {"guest_email": user.get("email", "").lower()}]
        cur = db.bookings.find(q, {"_id": 0}).sort("starts_at", 1)
        return await cur.to_list(20)

    @api.post("/booking/{booking_id}/cancel")
    async def cancel_booking(booking_id: str, user=Depends(get_current_user)):
        bk = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if not bk:
            raise HTTPException(404, "Booking not found")
        if user.get("role") not in PRIV_VIEW and bk["owner_id"] != user["id"]:
            raise HTTPException(403, "Not yours")
        await db.bookings.update_one({"id": booking_id}, {"$set": {
            "status": "cancelled",
            "cancelled_at": datetime.now(timezone.utc).isoformat(),
            "cancelled_by": user.get("email", ""),
        }})
        # Best-effort cancel GCal + notify both
        try:
            await _cancel_gcal_event(db, bk)
        except Exception:
            logger.exception("GCal cancel failed")
        try:
            from notif_engine import notify
            await notify(db, event="booking_cancelled", user_id="guest", user_email=bk["guest_email"],
                         title="Your meeting was cancelled",
                         message=f"Your meeting '{bk['page_title']}' was cancelled.",
                         link="/", variables={"name": bk.get("guest_name", ""),
                                              "subject": f"Cancelled: {bk['page_title']}",
                                              "body_html": f"<p>Hi {bk.get('guest_name','')},</p><p>Your meeting <b>{bk['page_title']}</b> on <b>{bk['starts_at']}</b> has been cancelled.</p>"})
        except Exception:
            pass
        return {"ok": True}


# ====================================================================
# Google Calendar integration (best effort, reuses Gmail OAuth tokens)
# ====================================================================
async def _gcal_creds(db, owner_id: str):
    """Build a google.oauth2 Credentials object from saved Gmail OAuth tokens.
    Adds calendar.events scope on the fly if needed (will require re-auth)."""
    acc = await db.gmail_accounts.find_one({"user_id": owner_id, "status": "active"}, {"_id": 0})
    if not acc:
        return None
    try:
        from google.oauth2.credentials import Credentials
    except ImportError:
        return None
    return Credentials(
        token=acc.get("access_token"),
        refresh_token=acc.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ.get("GOOGLE_CLIENT_ID", ""),
        client_secret=os.environ.get("GOOGLE_CLIENT_SECRET", ""),
        scopes=[
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/calendar.events",
        ],
    )


async def _create_gcal_event(db, page: dict, booking: dict):
    creds = await _gcal_creds(db, page["owner_id"])
    if not creds:
        return
    try:
        from googleapiclient.discovery import build
    except ImportError:
        return
    import asyncio
    def _go():
        svc = build("calendar", "v3", credentials=creds, cache_discovery=False)
        body = {
            "summary": f"{page['title']} — {booking['guest_name']}",
            "description": (booking.get("notes") or "") + f"\n\nBooked via Projexino · {page.get('slug')}",
            "start": {"dateTime": booking["starts_at"], "timeZone": page.get("timezone_name", "Asia/Kolkata")},
            "end":   {"dateTime": booking["ends_at"],   "timeZone": page.get("timezone_name", "Asia/Kolkata")},
            "attendees": [{"email": booking["guest_email"], "displayName": booking["guest_name"]}],
            "conferenceData": {"createRequest": {"requestId": booking["id"], "conferenceSolutionKey": {"type": "hangoutsMeet"}}},
            "reminders": {"useDefault": True},
        }
        return svc.events().insert(
            calendarId="primary", body=body,
            conferenceDataVersion=1, sendUpdates="all",
        ).execute()
    try:
        ev = await asyncio.to_thread(_go)
        booking["calendar_event_id"] = ev.get("id", "")
        booking["meet_link"] = (ev.get("hangoutLink", "")
                                or (ev.get("conferenceData", {}).get("entryPoints", [{}])[0].get("uri", "")))
        booking["calendar_link"] = ev.get("htmlLink", "")
    except Exception:
        logger.exception("gcal insert failed")


async def _cancel_gcal_event(db, booking: dict):
    if not booking.get("calendar_event_id"):
        return
    creds = await _gcal_creds(db, booking["owner_id"])
    if not creds:
        return
    try:
        from googleapiclient.discovery import build
    except ImportError:
        return
    import asyncio
    def _go():
        svc = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return svc.events().delete(calendarId="primary", eventId=booking["calendar_event_id"], sendUpdates="all").execute()
    try:
        await asyncio.to_thread(_go)
    except Exception:
        logger.exception("gcal delete failed")


# ====================================================================
# Single registration entry
# ====================================================================
def register_phase_h(api: APIRouter, db, get_current_user):
    register_connections(api, db, get_current_user)
    register_booking(api, db, get_current_user)
