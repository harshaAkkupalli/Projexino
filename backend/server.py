from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import re
import uuid
import logging
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal, Dict, Any

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ----- Setup -----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

app = FastAPI(title="Projexino API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("projexino")


# ----- Helpers -----
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: str, email: str, ttl_minutes: int = 60 * 24 * 7) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_user_optional(request: Request):
    try:
        return await get_current_user(request)
    except Exception:
        return None


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


# ----- Models -----
class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    role: str = "member"
    created_at: str


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


LeadStatus = Literal["new", "contacted", "qualified", "won", "lost"]


class LeadActivity(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    kind: str  # note | status_change | created
    message: str
    at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    by: Optional[str] = None


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    company: Optional[str] = ""
    source: Optional[str] = "website"
    value: float = 0
    status: LeadStatus = "new"
    notes: Optional[str] = ""


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    source: Optional[str] = None
    value: Optional[float] = None
    status: Optional[LeadStatus] = None
    notes: Optional[str] = None


class Lead(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str = ""
    phone: str = ""
    company: str = ""
    source: str = "website"
    value: float = 0
    status: LeadStatus = "new"
    notes: str = ""
    activities: List[LeadActivity] = []
    owner_id: str
    created_at: str
    updated_at: str


TaskStatus = Literal["todo", "in_progress", "review", "done"]
TaskPriority = Literal["low", "medium", "high", "urgent"]


class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    assignee: Optional[str] = ""
    assignee_id: Optional[str] = ""        # NEW — user.id of the assignee (preferred)
    assignee_email: Optional[str] = ""     # NEW — denormalized for filtering
    reporting_manager_id: Optional[str] = ""   # NEW — manager to be notified in parallel
    reporting_manager_email: Optional[str] = ""
    due_date: Optional[str] = ""
    tags: List[str] = []
    project_id: Optional[str] = ""
    project_name: Optional[str] = ""


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee: Optional[str] = None
    assignee_id: Optional[str] = None
    assignee_email: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_email: Optional[str] = None
    due_date: Optional[str] = None
    tags: Optional[List[str]] = None
    project_id: Optional[str] = None
    project_name: Optional[str] = None


class Task(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    title: str
    description: str = ""
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    assignee: str = ""
    assignee_id: str = ""
    assignee_email: str = ""
    reporting_manager_id: str = ""
    reporting_manager_email: str = ""
    due_date: str = ""
    tags: List[str] = []
    project_id: str = ""
    project_name: str = ""
    owner_id: str
    created_at: str
    updated_at: str


class ContactIn(BaseModel):
    name: str
    email: EmailStr
    company: Optional[str] = ""
    message: str


TeamStatus = Literal["active", "away", "offline"]


class TeamMemberCreate(BaseModel):
    name: str
    email: EmailStr
    role: str = "Engineer"
    department: str = "Engineering"
    status: TeamStatus = "active"
    skills: List[str] = []
    bio: Optional[str] = ""
    designation: Optional[str] = ""
    joining_date: Optional[str] = ""  # ISO date
    salary: Optional[float] = None
    phone: Optional[str] = ""
    location: Optional[str] = ""


class TeamMemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    department: Optional[str] = None
    status: Optional[TeamStatus] = None
    skills: Optional[List[str]] = None
    bio: Optional[str] = None
    designation: Optional[str] = None
    joining_date: Optional[str] = None
    salary: Optional[float] = None
    phone: Optional[str] = None
    location: Optional[str] = None


class TeamMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    role: str
    department: str
    status: TeamStatus
    skills: List[str] = []
    bio: str = ""
    designation: str = ""
    joining_date: str = ""
    salary: Optional[float] = None
    phone: str = ""
    location: str = ""
    avatar_color: str
    owner_id: str
    created_at: str
    updated_at: str


# ----- Auth Routes -----
@api.post("/auth/register", response_model=UserPublic)
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "name": payload.name,
        "role": "member",
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_doc["id"], email)
    set_auth_cookie(response, token)
    # Fire-and-forget welcome email (gated by settings & Gmail connection)
    try:
        from notif_engine import notify
        await notify(
            db,
            event="welcome_employee",
            user_id=user_doc["id"],
            user_email=email,
            title=f"Welcome to Projexino, {payload.name}",
            message="Your workspace is ready. Explore your dashboard.",
            link="/app/dashboard",
            variables={
                "name": payload.name,
                "role": "Team Member",
                "start_date": datetime.now(timezone.utc).strftime("%d %b %Y"),
            },
            triggered_by={"name": "system", "email": ""},
        )
    except Exception:
        logger.exception("Welcome email failed")
    return UserPublic(**user_doc)


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"], email)
    set_auth_cookie(response, token)
    try:
        from presence import log_auth_event as _log_evt
        await _log_evt(db, user={
            "id": user["id"], "name": user.get("name", ""),
            "email": user["email"], "role": user.get("role", "member"),
        }, kind="login")
    except Exception:
        pass
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user.get("role", "member"),
        "created_at": user["created_at"],
        "token": token,
    }


@api.post("/auth/logout")
async def logout(response: Response, request: Request):
    try:
        from presence import log_auth_event as _log_evt
        user = await get_current_user_optional(request)
        if user:
            await _log_evt(db, user=user, kind="logout")
            # Age last_seen so they appear offline
            from datetime import datetime, timezone, timedelta
            await db.user_presence.update_one(
                {"user_id": user["id"]},
                {"$set": {"last_seen": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}},
            )
    except Exception:
        pass
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return UserPublic(**user)


# ----- Leads -----
def _lead_doc_to_model(doc: dict) -> Lead:
    return Lead(**doc)


@api.get("/leads", response_model=List[Lead])
async def list_leads(user=Depends(get_current_user)):
    cur = db.leads.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(1000)
    return [_lead_doc_to_model(d) for d in items]


@api.post("/leads", response_model=Lead)
async def create_lead(payload: LeadCreate, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc.update(
        {
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "created_at": now,
            "updated_at": now,
            "activities": [
                LeadActivity(kind="created", message=f"Lead created", by=user["name"]).model_dump()
            ],
        }
    )
    await db.leads.insert_one(doc)
    doc.pop("_id", None)
    return _lead_doc_to_model(doc)


@api.get("/leads/{lead_id}", response_model=Lead)
async def get_lead(lead_id: str, user=Depends(get_current_user)):
    doc = await db.leads.find_one({"id": lead_id, "owner_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _lead_doc_to_model(doc)


@api.patch("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, payload: LeadUpdate, user=Depends(get_current_user)):
    existing = await db.leads.find_one({"id": lead_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    activities = existing.get("activities", [])
    if "status" in updates and updates["status"] != existing.get("status"):
        activities.append(
            LeadActivity(
                kind="status_change",
                message=f"Status: {existing.get('status')} → {updates['status']}",
                by=user["name"],
            ).model_dump()
        )
    updates["activities"] = activities
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.leads.update_one({"id": lead_id}, {"$set": updates})
    merged = {**existing, **updates}
    return _lead_doc_to_model(merged)


@api.post("/leads/{lead_id}/notes", response_model=Lead)
async def add_lead_note(lead_id: str, body: dict, user=Depends(get_current_user)):
    note_text = (body or {}).get("message", "").strip()
    if not note_text:
        raise HTTPException(status_code=400, detail="Empty note")
    existing = await db.leads.find_one({"id": lead_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Lead not found")
    activities = existing.get("activities", [])
    activities.append(LeadActivity(kind="note", message=note_text, by=user["name"]).model_dump())
    await db.leads.update_one(
        {"id": lead_id},
        {"$set": {"activities": activities, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    existing["activities"] = activities
    return _lead_doc_to_model(existing)


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user=Depends(get_current_user)):
    res = await db.leads.delete_one({"id": lead_id, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {"ok": True}


@api.get("/leads/analytics/summary")
async def leads_analytics(user=Depends(get_current_user)):
    cur = db.leads.find({"owner_id": user["id"]}, {"_id": 0})
    leads = await cur.to_list(5000)
    by_status: dict = {}
    by_source: dict = {}
    total_value = 0.0
    won_value = 0.0
    for l in leads:
        by_status[l["status"]] = by_status.get(l["status"], 0) + 1
        by_source[l.get("source", "website")] = by_source.get(l.get("source", "website"), 0) + 1
        total_value += float(l.get("value", 0) or 0)
        if l["status"] == "won":
            won_value += float(l.get("value", 0) or 0)
    total = len(leads)
    won_count = by_status.get("won", 0)
    return {
        "total": total,
        "by_status": by_status,
        "by_source": by_source,
        "pipeline_value": round(total_value, 2),
        "won_value": round(won_value, 2),
        "conversion_rate": round((won_count / total * 100) if total else 0, 1),
    }


# ----- Tasks -----
@api.get("/tasks", response_model=List[Task])
async def list_tasks(user=Depends(get_current_user)):
    """Return tasks that the current user OWNS (created) OR is ASSIGNED to
    OR is the REPORTING MANAGER for. Match by id, by email (case-insensitive),
    or by name (case-insensitive) to be tolerant of legacy data that only set
    the free-text `assignee` field.
    """
    uid = user["id"]
    email = (user.get("email") or "").lower()
    name = (user.get("name") or "").strip()
    or_clauses: List[Dict[str, Any]] = [
        {"owner_id": uid},
        {"assignee_id": uid},
        {"reporting_manager_id": uid},
    ]
    if email:
        or_clauses.append({"assignee_email": email})
    if name:
        # Legacy free-text match (e.g. "John Doe")
        or_clauses.append({"assignee": {"$regex": f"^{re.escape(name)}$", "$options": "i"}})
        if email:
            or_clauses.append({"assignee": {"$regex": f"^{re.escape(email)}$", "$options": "i"}})
    cur = db.tasks.find({"$or": or_clauses}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(2000)
    # Backward-compat: ensure missing new fields don't break the Task model
    return [Task(**d) for d in items]


@api.post("/tasks", response_model=Task)
async def create_task(payload: TaskCreate, user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    # Resolve assignee to a user if not already linked by id
    assignee_user: Optional[Dict[str, Any]] = None
    if doc.get("assignee_id"):
        assignee_user = await db.users.find_one({"id": doc["assignee_id"]}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    elif doc.get("assignee_email"):
        assignee_user = await db.users.find_one({"email": doc["assignee_email"].lower()}, {"_id": 0, "id": 1, "email": 1, "name": 1})
    elif doc.get("assignee"):
        a = doc["assignee"].strip()
        assignee_user = await db.users.find_one(
            {"$or": [
                {"email": a.lower()},
                {"name": {"$regex": f"^{re.escape(a)}$", "$options": "i"}},
            ]},
            {"_id": 0, "id": 1, "email": 1, "name": 1},
        )
    if assignee_user:
        doc["assignee_id"] = assignee_user["id"]
        doc["assignee_email"] = assignee_user["email"]
        if not doc.get("assignee"):
            doc["assignee"] = assignee_user.get("name") or assignee_user["email"]
    # Resolve reporting manager if id passed
    manager_user: Optional[Dict[str, Any]] = None
    if doc.get("reporting_manager_id"):
        manager_user = await db.users.find_one(
            {"id": doc["reporting_manager_id"]},
            {"_id": 0, "id": 1, "email": 1, "name": 1},
        )
        if manager_user:
            doc["reporting_manager_email"] = manager_user["email"]
    elif assignee_user:
        # Fall back to the assignee's saved reporting_manager_id on their user profile
        full_assignee = await db.users.find_one({"id": assignee_user["id"]}, {"_id": 0, "reporting_manager_id": 1, "reporting_manager_email": 1})
        if full_assignee and full_assignee.get("reporting_manager_id"):
            manager_user = await db.users.find_one(
                {"id": full_assignee["reporting_manager_id"]},
                {"_id": 0, "id": 1, "email": 1, "name": 1},
            )
            if manager_user:
                doc["reporting_manager_id"] = manager_user["id"]
                doc["reporting_manager_email"] = manager_user["email"]

    doc.update({"id": str(uuid.uuid4()), "owner_id": user["id"], "created_at": now, "updated_at": now})
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)

    # Parallel notifications: assignee + reporting manager (each gets their own perspective)
    try:
        from notif_engine import notify
        if assignee_user:
            await notify(
                db,
                event="task_assigned",
                user_id=assignee_user["id"],
                user_email=assignee_user["email"],
                title=f"Task assigned: {doc['title']}",
                message=f"Due {doc.get('due_date') or 'soon'} · Priority {doc.get('priority','medium')}. Please start and communicate updates with your reporting manager.",
                link="/app/tasks",
                variables={
                    "name": assignee_user.get("name", ""),
                    "task_title": doc["title"],
                    "project_name": doc.get("project_name", "—"),
                    "deadline": doc.get("due_date", "—"),
                    "priority": doc.get("priority", "medium"),
                },
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
        if manager_user and assignee_user and manager_user["id"] != assignee_user["id"]:
            await notify(
                db,
                event="task_assigned_monitor",
                user_id=manager_user["id"],
                user_email=manager_user["email"],
                title=f"Monitor task: {doc['title']}",
                message=f"{assignee_user.get('name') or assignee_user['email']} has been assigned this task. Please monitor progress and provide guidance.",
                link="/app/tasks",
                variables={
                    "name": manager_user.get("name", ""),
                    "task_title": doc["title"],
                    "assignee_name": assignee_user.get("name", assignee_user.get("email", "")),
                    "project_name": doc.get("project_name", "—"),
                    "deadline": doc.get("due_date", "—"),
                    "priority": doc.get("priority", "medium"),
                },
                triggered_by={"name": user.get("name", ""), "email": user.get("email", "")},
            )
    except Exception:
        logger.exception("Task-assigned notify failed")
    return Task(**doc)


@api.patch("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, payload: TaskUpdate, user=Depends(get_current_user)):
    """Allow updates by owner, assignee, or reporting manager. Admins/managers always allowed."""
    uid = user["id"]
    role = user.get("role")
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    can_edit = (
        existing.get("owner_id") == uid
        or existing.get("assignee_id") == uid
        or existing.get("reporting_manager_id") == uid
        or role in ("super_admin", "admin", "manager", "hr")
    )
    if not can_edit:
        raise HTTPException(status_code=403, detail="Not allowed to edit this task")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tasks.update_one({"id": task_id}, {"$set": updates})
    merged = {**existing, **updates}
    return Task(**merged)


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user=Depends(get_current_user)):
    """Only the owner OR a privileged role can delete a task."""
    uid = user["id"]
    role = user.get("role")
    existing = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Task not found")
    if existing.get("owner_id") != uid and role not in ("super_admin", "admin", "manager"):
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


@api.get("/dashboard/stats")
async def dashboard_stats(user=Depends(get_current_user)):
    leads = await db.leads.count_documents({"owner_id": user["id"]})
    won = await db.leads.count_documents({"owner_id": user["id"], "status": "won"})
    qualified = await db.leads.count_documents({"owner_id": user["id"], "status": "qualified"})
    open_tasks = await db.tasks.count_documents(
        {"owner_id": user["id"], "status": {"$in": ["todo", "in_progress", "review"]}}
    )
    done_tasks = await db.tasks.count_documents({"owner_id": user["id"], "status": "done"})
    team_total = await db.team.count_documents({"owner_id": user["id"]})
    team_active = await db.team.count_documents({"owner_id": user["id"], "status": "active"})
    return {
        "leads_total": leads,
        "leads_won": won,
        "leads_qualified": qualified,
        "open_tasks": open_tasks,
        "done_tasks": done_tasks,
        "team_total": team_total,
        "team_active": team_active,
    }


# ----- Team Management -----
_AVATAR_COLORS = [
    "#F97316", "#1E3A8A", "#10B981", "#6366F1", "#0EA5E9",
    "#A855F7", "#EAB308", "#EF4444", "#14B8A6", "#D97706",
]


@api.get("/team", response_model=List[TeamMember])
async def list_team(user=Depends(get_current_user)):
    cur = db.team.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    items = await cur.to_list(1000)
    return [TeamMember(**d) for d in items]


@api.post("/team", response_model=TeamMember)
async def create_team_member(payload: TeamMemberCreate, user=Depends(get_current_user)):
    email = payload.email.lower()
    if await db.team.find_one({"owner_id": user["id"], "email": email}):
        raise HTTPException(status_code=400, detail="Team member with this email already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = payload.model_dump()
    doc["email"] = email
    color_idx = await db.team.count_documents({"owner_id": user["id"]})
    doc.update(
        {
            "id": str(uuid.uuid4()),
            "owner_id": user["id"],
            "avatar_color": _AVATAR_COLORS[color_idx % len(_AVATAR_COLORS)],
            "created_at": now,
            "updated_at": now,
        }
    )
    await db.team.insert_one(doc)
    doc.pop("_id", None)
    return TeamMember(**doc)


@api.patch("/team/{member_id}", response_model=TeamMember)
async def update_team_member(member_id: str, payload: TeamMemberUpdate, user=Depends(get_current_user)):
    existing = await db.team.find_one({"id": member_id, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Team member not found")
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in updates:
        updates["email"] = updates["email"].lower()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.team.update_one({"id": member_id}, {"$set": updates})
    merged = {**existing, **updates}
    return TeamMember(**merged)


@api.delete("/team/{member_id}")
async def delete_team_member(member_id: str, user=Depends(get_current_user)):
    res = await db.team.delete_one({"id": member_id, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Team member not found")
    return {"ok": True}


# ---------- Admin: reset password by email ----------
class AdminPasswordResetIn(BaseModel):
    email: EmailStr
    new_password: str


@api.post("/admin/users/reset-password")
async def admin_reset_user_password(payload: AdminPasswordResetIn, user=Depends(get_current_user)):
    """Admin-only endpoint — resets a user's password (used by Team / Intern edit modals)."""
    if user.get("role") not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Only admins can reset passwords")
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    email = payload.email.lower()
    target = await db.users.find_one({"email": email})
    if not target:
        raise HTTPException(status_code=404, detail="No user found with this email")
    await db.users.update_one(
        {"email": email},
        {"$set": {"password_hash": hash_password(payload.new_password), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"reset": True, "email": email}


@api.get("/team/analytics/summary")
async def team_analytics(user=Depends(get_current_user)):
    cur = db.team.find({"owner_id": user["id"]}, {"_id": 0})
    members = await cur.to_list(2000)
    by_dept: dict = {}
    by_status: dict = {"active": 0, "away": 0, "offline": 0}
    for m in members:
        by_dept[m["department"]] = by_dept.get(m["department"], 0) + 1
        by_status[m["status"]] = by_status.get(m["status"], 0) + 1
    return {
        "total": len(members),
        "by_department": by_dept,
        "by_status": by_status,
    }


# ----- Contact -----
@api.post("/contact")
async def contact(payload: ContactIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.contacts.insert_one(doc)

    # Also pipe into the admin's lead kanban as a "New" lead
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@projexino.com")
    admin = await db.users.find_one({"email": admin_email}, {"_id": 0, "id": 1, "name": 1})
    if admin:
        now = datetime.now(timezone.utc).isoformat()
        lead_doc = {
            "id": str(uuid.uuid4()),
            "name": payload.name,
            "email": payload.email,
            "phone": "",
            "company": payload.company or "",
            "source": "website-contact",
            "value": 0,
            "status": "new",
            "notes": payload.message,
            "owner_id": admin["id"],
            "created_at": now,
            "updated_at": now,
            "activities": [
                LeadActivity(
                    kind="created",
                    message="Lead captured from public contact form",
                    by="Website",
                ).model_dump(),
                LeadActivity(
                    kind="note",
                    message=payload.message,
                    by=payload.name,
                ).model_dump(),
            ],
        }
        await db.leads.insert_one(lead_doc)

    return {"ok": True}


@api.get("/")
async def root():
    return {"service": "projexino-api", "status": "ok"}


# ----- Startup -----
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.leads.create_index("owner_id")
    await db.tasks.create_index("owner_id")
    await db.team.create_index("owner_id")
    await db.projects.create_index("owner_id")
    await db.documents.create_index("owner_id")
    await db.channels.create_index("owner_id")
    await db.chat_messages.create_index([("channel_id", 1), ("created_at", 1)])
    await db.notifications.create_index([("owner_id", 1), ("created_at", -1)])
    await db.interns.create_index("owner_id")
    await db.intern_tasks.create_index([("owner_id", 1), ("intern_id", 1)])
    await db.ai_sessions.create_index([("owner_id", 1), ("updated_at", -1)])
    await db.ai_messages.create_index([("session_id", 1), ("created_at", 1)])

    # Seed all role users
    SEED_USERS = [
        (os.environ.get("ADMIN_EMAIL", "admin@projexino.com"),
         os.environ.get("ADMIN_PASSWORD", "Projexino@2026"),
         "Projexino Admin", "admin"),
        ("manager@projexino.com", "Manager@2026", "Projexino Manager", "manager"),
        ("member@projexino.com", "Member@2026", "Projexino Member", "team_member"),
        ("intern@projexino.com", "Intern@2026", "Projexino Intern", "intern"),
    ]
    for email, pw, name, role in SEED_USERS:
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "email": email,
                "name": name,
                "role": role,
                "password_hash": hash_password(pw),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded {role}: {email}")
        else:
            updates = {}
            if existing.get("role") != role:
                updates["role"] = role
            if not verify_password(pw, existing["password_hash"]):
                updates["password_hash"] = hash_password(pw)
            if updates:
                await db.users.update_one({"email": email}, {"$set": updates})

    # Legacy compat — keep team@projexino.com if present
    if not await db.users.find_one({"email": "team@projexino.com"}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": "team@projexino.com",
            "name": "Legacy Team",
            "role": "team_member",
            "password_hash": hash_password("Team@2026"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Seed HR user (phase 4)
    await seed_hr_user(db)
    await db.work_sessions.create_index([("user_id", 1), ("date", -1)])

    # Auto-link intern@projexino.com to an Intern record (owned by admin)
    intern_user = await db.users.find_one({"email": "intern@projexino.com"}, {"_id": 0})
    admin_user = await db.users.find_one({"email": "admin@projexino.com"}, {"_id": 0})
    if intern_user and admin_user:
        existing_intern = await db.interns.find_one({"email": "intern@projexino.com"}, {"_id": 0})
        if not existing_intern:
            from datetime import date
            await db.interns.insert_one({
                "id": str(uuid.uuid4()),
                "name": intern_user["name"],
                "email": intern_user["email"],
                "designation": "Software Intern",
                "department": "Engineering",
                "reporting_manager": "Projexino Manager",
                "reporting_manager_email": "manager@projexino.com",
                "start_date": "2026-01-01",
                "end_date": "2026-06-30",
                "status": "active",
                "bio": "",
                "badges": [],
                "tasks_assigned": 0,
                "tasks_on_time": 0,
                "submitted_docs": {},  # bank/pan/id_proof/address_proof/resume
                "linked_user_id": intern_user["id"],
                "owner_id": admin_user["id"],  # admin owns the workspace
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            })

    # Presence / auth-event indexes
    await db.user_presence.create_index("user_id", unique=True)
    await db.auth_events.create_index([("user_id", 1), ("at", -1)])
    await db.auth_events.create_index("at")
    await db.email_campaigns.create_index([("status", 1), ("scheduled_at", 1)])
    await db.webpush_subscriptions.create_index("endpoint", unique=True)
    await db.webpush_subscriptions.create_index("user_id")

    # Background loop: scheduled email campaigns
    import asyncio as _asyncio
    from email_campaigns import scheduled_campaign_loop
    _asyncio.create_task(scheduled_campaign_loop(db, interval_seconds=30))

    # Phase A: promote bootstrap admin to super_admin (primary)
    try:
        from rbac import seed_super_admin
        await seed_super_admin(db, os.environ.get("ADMIN_EMAIL", "admin@projexino.com"))
    except Exception:
        logger.exception("seed_super_admin failed")

    # Phase B/D: indexes + payslip scheduler
    try:
        await db.lifecycle_events.create_index([("entity", 1), ("entity_id", 1), ("at", -1)])
        await db.hr_payslips.create_index([("employee.id", 1), ("month", -1)])
        await db.hr_payslips.create_index("slip_no", unique=True)
        await db.hr_expenses.create_index("incurred_on")
        await db.password_reset_tokens.create_index("token", unique=True)
        await db.password_reset_tokens.create_index("user_id")
        from hr_module import payslip_scheduler_loop as _ps_loop
        _asyncio.create_task(_ps_loop(db, interval_seconds=3600))
    except Exception:
        logger.exception("HR phase setup failed")

    # Phase G: load AI runtime config override from DB
    try:
        await load_ai_config_from_db(db)
    except Exception:
        logger.exception("ai_config load failed")

    # LinkedIn publisher scheduler (twice-weekly post engine)
    try:
        from linkedin_publisher import linkedin_scheduler_loop
        _asyncio.create_task(linkedin_scheduler_loop(db))
    except Exception:
        logger.exception("linkedin_scheduler start failed")


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)

# ----- Register extension modules (projects, docs, chat, notifications, interns, AI) -----
from extensions import register_extensions
from self_service import register_self_service
from phase4 import register_phase4, seed_hr_user
from issues import register_issues
from email_module import register_email
from notif_engine import register_notif_settings
from search_module import register_search
from finance import register_finance
from presence import register_presence, log_auth_event
from email_campaigns import register_email_campaigns
from webpush_mod import register_webpush
from rbac import register_rbac
from project_lifecycle import register_lifecycle
from doc_verification import register_doc_verification
from hr_module import register_hr_module, payslip_scheduler_loop
from phase_e import register_phase_e, welcome_user
from notif_permissions import register_notif_permissions
from phase_g import register_phase_g, load_ai_config_from_db
from phase_h import register_phase_h
from xino_ai import router as xino_router
from stripe_invoices import register_stripe_invoices
from website_config import register_website_config
from seo_blog import register_seo_blog
from blog_ai import register_blog_ai
from linkedin_publisher import register_linkedin
ext_router = APIRouter(prefix="/api")
register_extensions(ext_router, db, get_current_user)
register_self_service(ext_router, db, get_current_user)
register_phase4(ext_router, db, get_current_user)
register_issues(ext_router, db, get_current_user)
register_email(ext_router, db, get_current_user)
register_notif_settings(ext_router, db, get_current_user)
register_search(ext_router, db, get_current_user)
register_finance(ext_router, db, get_current_user)
register_presence(ext_router, db, get_current_user)
register_email_campaigns(ext_router, db, get_current_user)
register_webpush(ext_router, db, get_current_user)
register_rbac(ext_router, db, get_current_user)
register_lifecycle(ext_router, db, get_current_user)
register_doc_verification(ext_router, db, get_current_user)
register_hr_module(ext_router, db, get_current_user)
register_phase_e(ext_router, db, get_current_user)
register_notif_permissions(ext_router, db, get_current_user)
register_phase_g(ext_router, db, get_current_user)
register_phase_h(ext_router, db, get_current_user)
register_stripe_invoices(ext_router, db, get_current_user)
register_website_config(ext_router, db, get_current_user)
register_seo_blog(ext_router, db, get_current_user)
register_blog_ai(ext_router, db, get_current_user)
register_linkedin(ext_router, db, get_current_user)
ext_router.include_router(xino_router)
app.include_router(ext_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=r"https?://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)
