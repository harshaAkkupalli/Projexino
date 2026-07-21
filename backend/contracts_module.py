"""
contracts_module.py — Enterprise Contract Configuration (Phase 1)

Collections
-----------
clients                — existing (from clients_module.py) reused as-is
contracts              — one row per contract (soft-deleted, versioned via contract_versions)
contract_versions      — immutable snapshots for full rollback history
contract_audit         — append-only activity feed

Data-model note
---------------
For Phase 1 there is at most one *active* contract per client. The schema
already carries `parent_id`, `add_on_of`, and `contract_kind` so Phase 2 can
attach multiple concurrent add-on contracts without migration.

Storage abstraction
-------------------
Signed PDFs / NDAs / DPAs are written to `/app/uploads/contracts/` via a small
StorageBackend helper — swap the implementation later for S3 / Azure Blob
without touching business logic.
"""
from __future__ import annotations
import os
import re
import uuid
import mimetypes
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body, Query, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

PRIV = {"super_admin"}        # Phase 1: only super_admin. Phase 4 opens up to finance/sales.
STORAGE_DIR = Path("/app/uploads/contracts")
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
MAX_PDF_MB = 20

VALID_STATES = {"draft", "pending_approval", "signed", "active", "suspended", "expired", "cancelled", "renewed"}
TRANSITIONS: Dict[str, set[str]] = {
    "draft":            {"pending_approval", "cancelled"},
    "pending_approval": {"signed", "draft", "cancelled"},
    "signed":           {"active", "cancelled"},
    "active":           {"suspended", "expired", "cancelled", "renewed"},
    "suspended":        {"active", "cancelled"},
    "expired":          {"renewed", "cancelled"},
    "cancelled":        set(),
    "renewed":          set(),
}


# ==================== Helpers ====================
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _now_dt() -> datetime:
    return datetime.now(timezone.utc)

def _strip_id(d):
    if d:
        d.pop("_id", None)
    return d

def _gen_contract_number(prefix="PJX") -> str:
    """PJX-2026-4F82CB — human-readable + collision-safe."""
    yr = _now_dt().year
    suffix = uuid.uuid4().hex[:6].upper()
    return f"{prefix}-{yr}-{suffix}"


# ==================== Pydantic models ====================
class ContractCreate(BaseModel):
    client_id: str = Field(..., min_length=1)
    agreement_name: str = Field(..., min_length=2, max_length=200)
    agreement_type: str = "subscription"      # subscription | enterprise | annual | monthly | pilot | trial | one_time
    contract_start: Optional[str] = ""        # ISO date
    contract_end: Optional[str] = ""
    contract_value: float = 0.0
    currency: str = "USD"


class ContractPatch(BaseModel):
    """Autosave-friendly patch. Every field optional; unset values are ignored.
    Fields are grouped by section so the UI can splat the whole section at once."""
    # --- Section 1 · Client Information (denormalised for contract snapshot) ---
    client_info: Optional[Dict[str, Any]] = None
    # --- Section 2 · Contract Details ---
    agreement_name: Optional[str] = None
    agreement_type: Optional[str] = None
    contract_start: Optional[str] = None
    contract_end: Optional[str] = None
    notice_period_days: Optional[int] = None
    renewal_type: Optional[str] = None
    auto_renew: Optional[bool] = None
    contract_owner: Optional[str] = None
    sales_representative: Optional[str] = None
    account_manager: Optional[str] = None
    # --- Section 3 · Subscription Modules (Phase 1 = list of {module, enabled, licenses, users, ...}) ---
    modules: Optional[List[Dict[str, Any]]] = None
    # --- Section 4 · Feature toggles (Phase 2 will expand — kept here as free-form dict for now) ---
    features: Optional[Dict[str, bool]] = None
    # --- Section 5 · Usage Limits ---
    limits: Optional[Dict[str, Any]] = None
    # --- Section 6 · Pricing ---
    pricing: Optional[Dict[str, Any]] = None
    # --- Meta ---
    internal_notes: Optional[str] = None


class StateTransition(BaseModel):
    action: str          # activate | suspend | renew | cancel | submit_for_approval | approve | reject
    reason: Optional[str] = ""


class ContractEmailPayload(BaseModel):
    to: List[str] = Field(default_factory=list)
    cc: Optional[List[str]] = Field(default_factory=list)
    subject: str
    body_html: str
    from_token_id: Optional[str] = None
    include_pdf: bool = True


class ContractAiEmailPayload(BaseModel):
    tone: Optional[str] = "professional"           # professional | warm | brief
    extra_notes: Optional[str] = ""


DEFAULT_LOGO_URL = "/projexino-logo.png"  # served from /app/frontend/public; WeasyPrint uses base_url env to resolve


# ==================== Registration ====================
def register_contracts(api: APIRouter, db, get_current_user):
    """Attach all contract routes to the shared API router."""

    async def _require_priv(user=Depends(get_current_user)):
        if (user or {}).get("role") not in PRIV:
            raise HTTPException(403, "Contract configuration is restricted to super_admin")
        return user

    async def _audit(contract_id: str, user: Dict[str, Any], action: str,
                     old: Any = None, new: Any = None, reason: str = ""):
        await db.contract_audit.insert_one({
            "id": uuid.uuid4().hex,
            "contract_id": contract_id,
            "at": _now_iso(),
            "user_email": (user or {}).get("email") or "system",
            "user_id": (user or {}).get("id") or "",
            "action": action,
            "old_value": old,
            "new_value": new,
            "reason": (reason or "")[:500],
        })

    async def _snapshot_version(contract: Dict[str, Any], user: Dict[str, Any], note: str = ""):
        """Persist an immutable snapshot in contract_versions."""
        snap = {**contract}
        snap.pop("_id", None)
        snap["snapshot_id"] = uuid.uuid4().hex
        snap["snapshot_of"] = contract["id"]
        snap["snapshot_at"] = _now_iso()
        snap["snapshot_by"] = (user or {}).get("email") or "system"
        snap["snapshot_note"] = note[:400]
        await db.contract_versions.insert_one(snap)

    def _blank_contract(client_id: str, agreement_name: str, agreement_type: str,
                       start: str, end: str, value: float, currency: str,
                       user: Dict[str, Any]) -> Dict[str, Any]:
        now = _now_iso()
        return {
            "id": uuid.uuid4().hex,
            "client_id": client_id,
            "contract_number": _gen_contract_number(),
            # Future-proof (Phase 2 add-ons)
            "contract_kind": "primary",
            "parent_id": "",
            "add_on_of": "",

            "agreement_name": agreement_name,
            "agreement_type": agreement_type,
            "status": "draft",
            "contract_start": start or "",
            "contract_end": end or "",
            "notice_period_days": 30,
            "renewal_type": "manual",
            "auto_renew": False,

            "contract_owner": (user or {}).get("email") or "",
            "sales_representative": "",
            "account_manager": "",

            "client_info": {},          # Section 1 snapshot
            "modules": [],              # Section 3
            "features": {},             # Section 4
            "limits": {},               # Section 5
            "pricing": {                # Section 6 seed
                "currency": currency,
                "billing_cycle": "monthly",
                "contract_value": float(value or 0),
                "recurring_amount": 0.0,
                "one_time_charges": 0.0,
                "setup_cost": 0.0,
                "discount": 0.0,
                "tax_percent": 0.0,
            },

            # File attachments
            "signed_agreement_path": "",
            "nda_path": "",
            "dpa_path": "",

            # Meta
            "version": 1,
            "is_deleted": False,
            "internal_notes": "",
            "created_at": now,
            "created_by": (user or {}).get("email") or "system",
            "updated_at": now,
            "updated_by": (user or {}).get("email") or "system",
            "signed_at": "",
            "activated_at": "",
            "suspended_at": "",
            "cancelled_at": "",
        }

    # ------------ Dashboard / analytics ------------
    @api.get("/contracts/dashboard")
    async def contracts_dashboard(user=Depends(_require_priv)):
        base = {"is_deleted": {"$ne": True}}
        total = await db.contracts.count_documents(base)
        by_status = {}
        for st in VALID_STATES:
            by_status[st] = await db.contracts.count_documents({**base, "status": st})
        # Expiring in the next 30 days
        soon = (_now_dt() + timedelta(days=30)).isoformat()
        expiring = await db.contracts.count_documents({
            **base, "status": "active",
            "contract_end": {"$lte": soon, "$gt": _now_iso()},
        })
        # Sum of active-contract value
        pipeline = [
            {"$match": {**base, "status": "active"}},
            {"$group": {"_id": None, "total_value": {"$sum": "$pricing.contract_value"}}},
        ]
        agg = await db.contracts.aggregate(pipeline).to_list(1)
        total_active_value = (agg[0]["total_value"] if agg else 0) or 0
        return {
            "total": total,
            "by_status": by_status,
            "expiring_30d": expiring,
            "total_active_value": round(total_active_value, 2),
        }

    # ------------ List / search ------------
    @api.get("/contracts")
    async def list_contracts(
        status: str = Query(""),
        client_id: str = Query(""),
        q: str = Query(""),
        limit: int = Query(200, ge=1, le=1000),
        user=Depends(_require_priv),
    ):
        flt: Dict[str, Any] = {"is_deleted": {"$ne": True}}
        if status:
            flt["status"] = status
        if client_id:
            flt["client_id"] = client_id
        if q:
            r = {"$regex": re.escape(q), "$options": "i"}
            flt["$or"] = [
                {"agreement_name": r}, {"contract_number": r},
                {"contract_owner": r}, {"sales_representative": r},
            ]
        cur = db.contracts.find(flt, {"_id": 0}).sort("updated_at", -1).limit(limit)
        items = await cur.to_list(limit)
        # Attach lightweight client info
        client_ids = list({i.get("client_id") for i in items if i.get("client_id")})
        clients_map: Dict[str, Dict[str, Any]] = {}
        if client_ids:
            ccur = db.clients.find({"id": {"$in": client_ids}}, {"_id": 0})
            async for c in ccur:
                clients_map[c["id"]] = {"id": c["id"], "name": c.get("name", ""), "logo": c.get("logo", "")}
        for i in items:
            i["client"] = clients_map.get(i.get("client_id") or "", {})
        return {"items": items, "total": len(items)}

    # ------------ Create ------------
    @api.post("/contracts")
    async def create_contract(payload: ContractCreate, user=Depends(_require_priv)):
        # Verify client exists
        client = await db.clients.find_one({"id": payload.client_id}, {"_id": 0})
        if not client:
            raise HTTPException(404, "Client not found")
        # Phase 1: block if another active contract already exists
        conflict = await db.contracts.find_one({
            "client_id": payload.client_id, "status": "active", "is_deleted": {"$ne": True},
        }, {"_id": 0, "id": 1, "contract_number": 1})
        if conflict:
            raise HTTPException(409, f"Client already has an active contract: {conflict.get('contract_number')}. Suspend or renew it first.")
        doc = _blank_contract(
            payload.client_id, payload.agreement_name, payload.agreement_type,
            payload.contract_start or "", payload.contract_end or "",
            payload.contract_value, payload.currency, user,
        )
        # Snapshot Section 1 from the client
        doc["client_info"] = {
            "name": client.get("name") or "",
            "industry": client.get("industry") or "",
            "country": client.get("country") or "",
            "website": client.get("website") or "",
            "primary_contact_name": client.get("contact_name") or "",
            "primary_contact_email": client.get("email") or "",
            "primary_contact_phone": client.get("phone") or "",
            "billing_address": client.get("billing_address") or "",
        }
        await db.contracts.insert_one(doc)
        await _snapshot_version(doc, user, note="initial draft")
        await _audit(doc["id"], user, "created", None, doc, "New contract created")
        return _strip_id(doc)

    # ------------ Detail / summary ------------
    @api.get("/contracts/{cid}")
    async def get_contract(cid: str, user=Depends(_require_priv)):
        doc = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Contract not found")
        client = await db.clients.find_one({"id": doc["client_id"]}, {"_id": 0}) or {}
        doc["client"] = {
            "id": client.get("id", ""), "name": client.get("name", ""), "logo": client.get("logo", ""),
        }
        # Health score + days_remaining for the sidebar
        try:
            end = datetime.fromisoformat(doc.get("contract_end") or "")
            days_remaining = max(0, (end - _now_dt()).days)
        except Exception:
            days_remaining = None
        doc["days_remaining"] = days_remaining
        # Health score = simple heuristic for Phase 1; Phase 2 will weight usage
        score = 100
        if doc["status"] == "suspended":
            score -= 40
        elif doc["status"] in {"expired", "cancelled"}:
            score = 0
        if days_remaining is not None and days_remaining < 15 and doc["status"] == "active":
            score -= 25
        doc["health_score"] = max(0, min(100, score))
        return doc

    # ------------ Patch (autosave-friendly) ------------
    @api.patch("/contracts/{cid}")
    async def patch_contract(cid: str, payload: ContractPatch, user=Depends(_require_priv)):
        doc = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Contract not found")
        if doc["status"] in {"cancelled", "expired", "renewed"}:
            raise HTTPException(400, f"Cannot edit a {doc['status']} contract")
        updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not updates:
            return doc
        # Validation
        if "contract_start" in updates and "contract_end" in updates:
            try:
                if updates["contract_end"] and updates["contract_start"] and \
                        updates["contract_end"] < updates["contract_start"]:
                    raise HTTPException(400, "Contract end date must be after start date")
            except HTTPException:
                raise
            except Exception:
                pass
        pricing = updates.get("pricing") or {}
        if pricing:
            for k in ("contract_value", "recurring_amount", "one_time_charges", "setup_cost", "discount"):
                if k in pricing and float(pricing[k] or 0) < 0:
                    raise HTTPException(400, f"{k} cannot be negative")
        # Deep-merge pricing / limits / features / client_info (partial updates)
        for merge_key in ("pricing", "limits", "features", "client_info"):
            if merge_key in updates and isinstance(updates[merge_key], dict):
                updates[merge_key] = {**(doc.get(merge_key) or {}), **updates[merge_key]}
        updates["updated_at"] = _now_iso()
        updates["updated_by"] = user.get("email") or "system"
        updates["version"] = int(doc.get("version") or 1) + 1
        await db.contracts.update_one({"id": cid}, {"$set": updates})
        doc.update(updates)
        # Only snapshot when the caller passes a substantive change (not tiny autosave noise)
        important = {"modules", "features", "limits", "pricing", "agreement_name", "agreement_type", "contract_end", "contract_start"}
        if important & set(payload.model_dump(exclude_unset=True).keys()):
            await _snapshot_version(doc, user, note="patch")
        await _audit(cid, user, "updated", None, list(updates.keys()))
        return doc

    # ------------ State transition (Draft → Pending → Signed → Active → Suspended → Renewed …) ------------
    @api.post("/contracts/{cid}/transition")
    async def transition(cid: str, payload: StateTransition, user=Depends(_require_priv)):
        doc = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Contract not found")
        current = doc["status"]
        action_map = {
            "submit_for_approval": "pending_approval",
            "approve":             "signed",
            "reject":              "draft",
            "activate":            "active",
            "suspend":             "suspended",
            "resume":              "active",
            "renew":               "renewed",
            "cancel":              "cancelled",
            "expire":              "expired",
        }
        target = action_map.get(payload.action)
        if not target:
            raise HTTPException(400, f"Unknown action '{payload.action}'")
        if target not in TRANSITIONS.get(current, set()):
            raise HTTPException(400, f"Cannot transition from '{current}' to '{target}'")
        # Guardrails on Activate — require essentials
        if target == "active":
            missing = []
            if not doc.get("contract_start"):
                missing.append("contract_start")
            if not doc.get("contract_end"):
                missing.append("contract_end")
            if not (doc.get("pricing") or {}).get("contract_value"):
                missing.append("pricing.contract_value")
            if missing:
                raise HTTPException(400, f"Cannot activate — missing: {', '.join(missing)}")
        now = _now_iso()
        update = {"status": target, "updated_at": now, "updated_by": user.get("email") or "system"}
        if target == "active":
            update["activated_at"] = now
        if target == "signed":
            update["signed_at"] = now
        if target == "suspended":
            update["suspended_at"] = now
        if target == "cancelled":
            update["cancelled_at"] = now
        await db.contracts.update_one({"id": cid}, {"$set": update})
        doc.update(update)
        await _snapshot_version(doc, user, note=f"state → {target}")
        await _audit(cid, user, f"transition:{payload.action}", current, target, payload.reason or "")
        return doc

    # ------------ PDF Upload / Download (signed / nda / dpa) ------------
    @api.post("/contracts/{cid}/upload/{kind}")
    async def upload_pdf(cid: str, kind: str, file: UploadFile = File(...), user=Depends(_require_priv)):
        if kind not in {"signed", "nda", "dpa"}:
            raise HTTPException(400, "kind must be one of signed | nda | dpa")
        doc = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0, "id": 1})
        if not doc:
            raise HTTPException(404, "Contract not found")
        data = await file.read()
        if len(data) > MAX_PDF_MB * 1024 * 1024:
            raise HTTPException(413, f"File too large (>{MAX_PDF_MB} MB)")
        ext = os.path.splitext(file.filename or "")[1] or mimetypes.guess_extension(file.content_type or "") or ".pdf"
        name = f"{cid}-{kind}-{uuid.uuid4().hex[:6]}{ext}"
        (STORAGE_DIR / name).write_bytes(data)
        await db.contracts.update_one({"id": cid}, {"$set": {f"{kind}_agreement_path" if kind == "signed" else f"{kind}_path": name, "updated_at": _now_iso()}})
        await _audit(cid, user, f"upload:{kind}", None, name)
        return {"ok": True, "path": name}

    @api.get("/contracts/uploads/{filename}")
    async def download_pdf(filename: str, user=Depends(_require_priv)):
        safe = Path(filename).name
        target = STORAGE_DIR / safe
        if not target.exists() or not target.is_file():
            raise HTTPException(404, "File not found")
        return FileResponse(str(target), media_type="application/pdf", filename=safe)

    # ------------ Audit log + version history ------------
    @api.get("/contracts/{cid}/audit")
    async def get_audit(cid: str, limit: int = Query(200, ge=1, le=1000), user=Depends(_require_priv)):
        cur = db.contract_audit.find({"contract_id": cid}, {"_id": 0}).sort("at", -1).limit(limit)
        rows = await cur.to_list(limit)
        return {"items": rows, "total": len(rows)}

    @api.get("/contracts/{cid}/versions")
    async def get_versions(cid: str, user=Depends(_require_priv)):
        cur = db.contract_versions.find({"snapshot_of": cid}, {"_id": 0}).sort("snapshot_at", -1)
        rows = await cur.to_list(500)
        return {"items": rows, "total": len(rows)}

    # ------------ Soft delete ------------
    @api.delete("/contracts/{cid}")
    async def delete_contract(cid: str, user=Depends(_require_priv)):
        doc = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0, "status": 1})
        if not doc:
            raise HTTPException(404, "Contract not found")
        if doc.get("status") == "active":
            raise HTTPException(400, "Cancel or suspend the contract before deleting")
        await db.contracts.update_one({"id": cid}, {"$set": {"is_deleted": True, "deleted_at": _now_iso(), "deleted_by": user.get("email") or "system"}})
        await _audit(cid, user, "deleted")
        return {"ok": True}

    # ================================================================
    # ============ PDF generation + email-to-client ==================
    # ================================================================

    async def _load_profile() -> Dict[str, Any]:
        """Reuse the same 'Letterhead' / Company Profile that HR uses so branding
        is consistent across HR letters *and* contracts. Bootstrap defaults if
        the singleton is missing."""
        doc = await db.hr_letter_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
        return {
            "logo_url": doc.get("logo_url") or DEFAULT_LOGO_URL,
            "company_name": doc.get("company_name") or "Projexino Solutions Pvt Ltd",
            "tagline": doc.get("tagline") or "",
            "address_line1": doc.get("address_line1") or "",
            "address_line2": doc.get("address_line2") or "",
            "city": doc.get("city") or "",
            "state": doc.get("state") or "",
            "pincode": doc.get("pincode") or "",
            "country": doc.get("country") or "",
            "email": doc.get("email") or "",
            "phone": doc.get("phone") or "",
            "website": doc.get("website") or "",
            "cin": doc.get("cin") or "",
            "gstin": doc.get("gstin") or "",
            "footer_note": doc.get("footer_note") or "This document is confidential and intended solely for the recipient.",
        }

    def _fmt_money(v, currency="INR"):
        try:
            n = float(v or 0)
            if n == int(n):
                return f"{currency} {int(n):,}"
            return f"{currency} {n:,.2f}"
        except Exception:
            return f"{currency} 0"

    def _contract_html(c: Dict[str, Any], client: Dict[str, Any], profile: Dict[str, Any]) -> str:
        addr_parts = [profile.get("address_line1"), profile.get("address_line2"),
                      ", ".join([x for x in [profile.get("city"), profile.get("state"), profile.get("pincode")] if x]),
                      profile.get("country")]
        addr_html = "<br/>".join([x for x in addr_parts if x]) or ""
        contact_bits = [profile.get("email"), profile.get("phone"), profile.get("website")]
        contact_html = "  ·  ".join([x for x in contact_bits if x])
        reg_bits = []
        if profile.get("cin"):   reg_bits.append(f"CIN: {profile['cin']}")
        if profile.get("gstin"): reg_bits.append(f"GSTIN: {profile['gstin']}")
        reg_html = "  ·  ".join(reg_bits)

        pricing = c.get("pricing") or {}
        cur = pricing.get("currency") or "INR"
        rows = [
            ("Contract Value",     _fmt_money(pricing.get("contract_value"), cur)),
            ("Billing Cycle",      (pricing.get("billing_cycle") or "monthly").title()),
            ("Recurring Amount",   _fmt_money(pricing.get("recurring_amount"), cur)),
            ("One-time Charges",   _fmt_money(pricing.get("one_time_charges"), cur)),
            ("Setup Cost",         _fmt_money(pricing.get("setup_cost"), cur)),
            ("Discount",           _fmt_money(pricing.get("discount"), cur)),
            ("Tax %",              f"{float(pricing.get('tax_percent') or 0):.2f}%"),
        ]
        pricing_rows_html = "".join([
            f'<tr><td class="k">{k}</td><td class="v">{v}</td></tr>' for k, v in rows
        ])

        modules = c.get("modules") or []
        modules_html = ""
        if modules:
            modules_html = "<ul class='mod'>" + "".join(
                f"<li><b>{m.get('name') if isinstance(m, dict) else str(m)}</b>"
                + (f" — <span class='mod-note'>{m.get('note','')}</span>" if isinstance(m, dict) and m.get('note') else "")
                + "</li>"
                for m in modules
            ) + "</ul>"

        features = c.get("features") or {}
        features_html = ""
        if features:
            features_html = "<div class='chips'>" + "".join(
                f"<span class='chip'>{k}: <b>{'Yes' if v is True else ('No' if v is False else str(v))}</b></span>"
                for k, v in features.items()
            ) + "</div>"

        limits = c.get("limits") or {}
        limits_html = ""
        if limits:
            limits_html = "<div class='chips'>" + "".join(
                f"<span class='chip'>{k}: <b>{v}</b></span>" for k, v in limits.items()
            ) + "</div>"

        client_name    = (client.get("name") or c.get("client_id") or "").strip() or "—"
        client_email   = client.get("email") or ""
        client_addr    = client.get("address") or ""
        client_contact = client.get("primary_contact") or client.get("contact_name") or ""

        # Status pill colour
        status = c.get("status") or "draft"
        status_colors = {
            "draft": ("#64748B", "#F1F5F9"), "pending_approval": ("#C2410C", "#FFEDD5"),
            "signed": ("#0369A1", "#DBEAFE"), "active": ("#047857", "#D1FAE5"),
            "suspended": ("#B91C1C", "#FEE2E2"), "expired": ("#4B5563", "#E5E7EB"),
            "cancelled": ("#4B5563", "#E5E7EB"), "renewed": ("#5B21B6", "#EDE9FE"),
        }
        sc = status_colors.get(status, ("#64748B", "#F1F5F9"))

        return f"""<!doctype html><html><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 22mm 20mm 26mm 20mm;
  @bottom-left  {{ content: "{profile.get('company_name','')}  ·  {c.get('contract_number','')}"; font-size: 8pt; color: #64748B; }}
  @bottom-center {{ content: "{contact_html}"; font-size: 8pt; color: #64748B; }}
  @bottom-right {{ content: "Page " counter(page) " of " counter(pages); font-size: 8pt; color: #64748B; }}
}}
body {{ font-family:'Helvetica','Arial',sans-serif; color:#0F2042; font-size:11pt; line-height:1.55; }}
.brand {{ display:flex; align-items:flex-start; justify-content:space-between; border-bottom:3px solid #F97316; padding-bottom:12px; margin-bottom:22px; }}
.brand .logo-img {{ height:44px; width:auto; }}
.brand .tag {{ font-size:8pt; color:#64748B; margin-top:4px; letter-spacing:.15em; text-transform:uppercase; }}
.brand .meta {{ text-align:right; font-size:8.5pt; color:#64748B; line-height:1.5; }}
.brand .meta .ref {{ display:inline-block; margin-top:2px; padding:2px 8px; border-radius:99px; background:#FFF7ED; color:#C2410C; font-weight:700; font-size:7.5pt; letter-spacing:.08em; }}
.subtitle {{ font-size:9pt; color:#F97316; letter-spacing:.28em; text-transform:uppercase; font-weight:700; margin-top:4px; }}
h1 {{ font-size:18pt; font-weight:700; margin:6px 0 4px; color:#0F2042; }}
.status-pill {{ display:inline-block; padding:3px 10px; border-radius:999px; font-size:8.5pt; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:{sc[0]}; background:{sc[1]}; }}
.parties {{ margin-top:14px; display:grid; grid-template-columns:1fr 1fr; gap:14px; }}
.party {{ padding:12px 14px; border:1px solid #E2E8F0; border-radius:10px; background:#F8FAFC; }}
.party .lbl {{ font-size:8pt; letter-spacing:.2em; text-transform:uppercase; color:#F97316; font-weight:700; }}
.party .nm {{ font-weight:700; font-size:11.5pt; color:#0F2042; margin-top:2px; }}
.party .sub {{ color:#64748B; font-size:9pt; margin-top:2px; }}
h2 {{ font-size:11.5pt; margin:22px 0 6px; padding-bottom:4px; border-bottom:1px solid #E2E8F0; color:#0F2042; }}
h2 .lbl {{ display:inline-block; padding:1px 8px; margin-right:6px; font-size:8pt; letter-spacing:.2em; color:#F97316; background:#FFF7ED; border-radius:99px; font-weight:700; }}
.grid2 {{ display:grid; grid-template-columns:repeat(2,1fr); gap:6px 20px; }}
.grid2 .k {{ color:#64748B; font-size:9pt; }}
.grid2 .v {{ color:#0F2042; font-weight:600; font-size:10pt; }}
table.pricing {{ width:100%; border-collapse:collapse; margin-top:6px; }}
table.pricing td {{ padding:6px 10px; border-bottom:1px solid #F1F5F9; font-size:10pt; }}
table.pricing td.k {{ color:#64748B; width:55%; }}
table.pricing td.v {{ text-align:right; font-weight:700; color:#0F2042; }}
ul.mod {{ margin:6px 0 0 0; padding-left:20px; }}
ul.mod li {{ margin:3px 0; font-size:10pt; }}
ul.mod .mod-note {{ color:#64748B; font-size:9pt; }}
.chips {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }}
.chip {{ font-size:8.5pt; padding:3px 9px; background:#F1F5F9; border-radius:99px; color:#0F2042; }}
.legal {{ margin-top:22px; padding:12px 14px; border-radius:8px; background:#F8FAFC; border-left:3px solid #F97316; font-size:9pt; color:#334155; }}
.sigs {{ margin-top:38px; display:grid; grid-template-columns:1fr 1fr; gap:30px; page-break-inside:avoid; }}
.sigblock {{ }}
.sigline {{ height:60px; border-bottom:1.5px solid #0F2042; }}
.signame {{ font-weight:700; margin-top:4px; }}
.sigrole {{ font-size:9pt; color:#64748B; }}
.footer-note {{ margin-top:36px; text-align:center; font-size:8.5pt; color:#94A3B8; border-top:1px solid #E2E8F0; padding-top:8px; }}
.reg {{ text-align:center; margin-top:3px; font-size:7.5pt; color:#94A3B8; }}
</style></head><body>
<div class="brand">
  <div>
    <img class="logo-img" src="{profile['logo_url']}" alt="{profile.get('company_name','')}"/>
    {f'<div class="tag">{profile.get("tagline")}</div>' if profile.get("tagline") else ''}
  </div>
  <div class="meta">
    <div style="font-weight:700; color:#0F2042;">{profile.get('company_name','')}</div>
    {f'<div>{addr_html}</div>' if addr_html else ''}
    {f'<div>{contact_html}</div>' if contact_html else ''}
    <div class="ref">{c.get('contract_number','')}</div>
    <div style="margin-top:2px;">Issued {(c.get('updated_at') or c.get('created_at') or _now_iso())[:10]}</div>
  </div>
</div>

<div class="subtitle">// contract · {(c.get('agreement_type') or 'MSA').upper()}</div>
<h1>{c.get('agreement_name','')}</h1>
<div style="margin-top:2px;"><span class="status-pill">{status.replace('_',' ')}</span> &nbsp; <span style="font-size:9pt; color:#64748B;">v{c.get('version',1)}</span></div>

<div class="parties">
  <div class="party">
    <div class="lbl">Service Provider</div>
    <div class="nm">{profile.get('company_name','')}</div>
    <div class="sub">{addr_html or '&nbsp;'}<br/>{contact_html or '&nbsp;'}</div>
  </div>
  <div class="party">
    <div class="lbl">Client</div>
    <div class="nm">{client_name}</div>
    <div class="sub">
      {(client_contact + '<br/>') if client_contact else ''}
      {(client_email + '<br/>') if client_email else ''}
      {client_addr or '&nbsp;'}
    </div>
  </div>
</div>

<h2><span class="lbl">§ 1</span>Term</h2>
<div class="grid2">
  <span class="k">Start Date</span><span class="v">{c.get('contract_start') or '—'}</span>
  <span class="k">End Date</span><span class="v">{c.get('contract_end') or '—'}</span>
  <span class="k">Notice Period</span><span class="v">{c.get('notice_period_days','30')} days</span>
  <span class="k">Renewal</span><span class="v">{c.get('renewal_type','manual').title()}{' · Auto-renew ON' if c.get('auto_renew') else ''}</span>
</div>

<h2><span class="lbl">§ 2</span>Pricing &amp; Billing</h2>
<table class="pricing">{pricing_rows_html}</table>

{f'<h2><span class="lbl">§ 3</span>Modules Included</h2>{modules_html}' if modules else ''}
{f'<h2><span class="lbl">§ 4</span>Feature Flags</h2>{features_html}' if features else ''}
{f'<h2><span class="lbl">§ 5</span>Usage Limits</h2>{limits_html}' if limits else ''}

<h2><span class="lbl">§ 6</span>General Terms</h2>
<div class="legal">
  This Agreement constitutes the entire understanding between the parties. It is governed by the laws of India and any disputes shall be subject to the exclusive jurisdiction of the courts in the city where the Service Provider is registered. Confidentiality obligations survive termination. Neither party shall be liable for indirect, incidental or consequential damages. Any modification must be in writing and signed by both parties.
</div>

<div class="sigs">
  <div class="sigblock">
    <div class="sigline">&nbsp;</div>
    <div class="signame">For {profile.get('company_name','Provider')}</div>
    <div class="sigrole">{c.get('contract_owner','') or 'Authorised Signatory'}</div>
  </div>
  <div class="sigblock">
    <div class="sigline">&nbsp;</div>
    <div class="signame">For {client_name}</div>
    <div class="sigrole">{client_contact or 'Authorised Signatory'}</div>
  </div>
</div>

<div class="footer-note">{profile.get('footer_note','')}</div>
{f'<div class="reg">{reg_html}</div>' if reg_html else ''}
</body></html>"""

    async def _render_contract_pdf(cid: str) -> tuple[bytes, str, Dict[str, Any]]:
        """Return (pdf_bytes, filename, contract_doc). Shared by GET/pdf and POST/email."""
        c = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Contract not found")
        client = await db.clients.find_one({"id": c["client_id"]}, {"_id": 0}) or {}
        profile = await _load_profile()
        try:
            from weasyprint import HTML  # deferred import
            # base_url resolves same-origin relative image paths (e.g. `/projexino-logo.png`)
            # from the frontend static server. Fixes the iter58 regression where
            # the migrated letterhead singleton dropped the logo silently.
            base_url = (os.environ.get("PUBLIC_FRONTEND_URL")
                        or os.environ.get("REACT_APP_BACKEND_URL")
                        or "").rstrip("/")
            pdf = HTML(string=_contract_html(c, client, profile), base_url=base_url).write_pdf()
        except Exception as e:
            raise HTTPException(500, f"PDF render failed: {str(e)[:200]}")
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{c.get('contract_number','contract')}-{c.get('agreement_name','')}")
        return pdf, f"{safe}.pdf", c

    @api.get("/contracts/{cid}/pdf")
    async def contract_pdf(cid: str, user=Depends(_require_priv)):
        from fastapi import Response  # local import
        pdf, fname, _ = await _render_contract_pdf(cid)
        return Response(content=pdf, media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    # -- AI draft the client email body --------------------------------
    @api.post("/contracts/{cid}/ai-draft-email")
    async def ai_draft_email(cid: str, payload: ContractAiEmailPayload, user=Depends(_require_priv)):
        c = await db.contracts.find_one({"id": cid, "is_deleted": {"$ne": True}}, {"_id": 0})
        if not c: raise HTTPException(404, "Contract not found")
        client = await db.clients.find_one({"id": c["client_id"]}, {"_id": 0}) or {}
        profile = await _load_profile()
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            key = os.environ.get("EMERGENT_LLM_KEY")
            if not key:
                raise HTTPException(400, "EMERGENT_LLM_KEY not configured")
            tone = (payload.tone or "professional").lower()
            sys_msg = (
                f"You are Xino, {profile.get('company_name','the Service Provider')}'s AI drafting assistant. Draft a {tone} "
                "email to a client that accompanies a contract PDF. Keep it under 180 words. "
                "Return ONLY the email body as clean HTML using <p> tags — no subject, no signature block "
                "(a signature is appended automatically), and NO greeting like 'Dear Team' — "
                "start with a short warm greeting using the client's contact name if available. "
                "Mention that the contract is attached, invite them to review, provide a friendly nudge to reach out with questions, "
                "and close warmly. Do NOT hallucinate pricing or dates — refer to them only in general terms."
            )
            ctx = (
                f"Client: {client.get('name','')}\n"
                f"Client contact: {client.get('primary_contact') or client.get('contact_name') or ''}\n"
                f"Contract: {c.get('agreement_name','')} ({c.get('agreement_type','MSA').upper()})\n"
                f"Contract #: {c.get('contract_number','')}\n"
                f"Owner: {c.get('contract_owner','')}\n"
                f"Extra notes: {payload.extra_notes or '—'}\n"
            )
            chat = LlmChat(api_key=key, session_id=f"contract-email-{cid}", system_message=sys_msg).with_model("gemini", "gemini-2.5-flash")
            raw = await chat.send_message(UserMessage(text=f"Draft the email now.\n\n{ctx}"))
            body_html = str(raw).strip()
            # Very light cleanup — if the model wrapped in <html> or <body>, strip them
            body_html = re.sub(r"</?(html|body|head)[^>]*>", "", body_html, flags=re.I).strip()
            # Append a friendly sign-off if none of the common closings are present
            if not re.search(r"(regards|sincerely|thanks|warm|best)\b", body_html, re.I):
                body_html += f'<p style="margin-top:14px;">Warm regards,<br/>{c.get("contract_owner") or profile.get("company_name","Team")}</p>'
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"AI drafting failed: {str(e)[:200]}")
        subject = f"{c.get('contract_number','Contract')} — {c.get('agreement_name','')} for your review"
        return {"subject": subject, "body_html": body_html}

    # -- Send the PDF to the client via Gmail --------------------------
    @api.post("/contracts/{cid}/email")
    async def email_contract(cid: str, payload: ContractEmailPayload, user=Depends(_require_priv)):
        if not payload.to:
            raise HTTPException(400, "At least one recipient (`to`) is required")
        if not payload.subject.strip():
            raise HTTPException(400, "Subject is required")

        pdf_bytes, fname, c = await _render_contract_pdf(cid)
        profile = await _load_profile()

        # Import gmail helpers from email_module (they are module-level)
        from email_module import _resolve_send_token, _refresh_if_needed, _build_gmail_service
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText
        from email.mime.application import MIMEApplication
        import base64 as _b64

        token = await _resolve_send_token(db, payload.from_token_id)
        if not token:
            raise HTTPException(400, "Gmail not connected. Connect from /app/settings first.")
        try:
            token = await _refresh_if_needed(db, token)
        except Exception as e:
            raise HTTPException(400, f"Gmail credentials invalid — please reconnect from /app/settings. ({str(e)[:120]})")
        service = _build_gmail_service(token)
        sender_email = token.get("email")
        from_name = profile.get("company_name") or "Projexino"
        from_header = f'"{from_name}" <{sender_email}>'

        # Clean lists
        def _clean(seq):
            out, seen = [], set()
            for e in seq or []:
                if not e: continue
                k = str(e).strip().lower()
                if k and k not in seen:
                    seen.add(k); out.append(str(e).strip())
            return out
        to = _clean(payload.to)
        cc = [e for e in _clean(payload.cc) if e.lower() not in {t.lower() for t in to}]

        # Multipart message with PDF attachment
        msg = MIMEMultipart("mixed")
        msg["Subject"] = payload.subject
        msg["From"] = from_header
        msg["To"] = ", ".join(to)
        if cc: msg["Cc"] = ", ".join(cc)
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(payload.body_html or "", "html"))
        msg.attach(alt)
        if payload.include_pdf:
            part = MIMEApplication(pdf_bytes, _subtype="pdf")
            part.add_header("Content-Disposition", "attachment", filename=fname)
            msg.attach(part)

        raw = _b64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")
        try:
            sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        except Exception as e:
            raise HTTPException(502, f"Gmail send failed: {str(e)[:200]}")

        # Store in outbound log + audit
        log_id = uuid.uuid4().hex
        await db.contract_emails.insert_one({
            "id": log_id,
            "contract_id": cid,
            "gmail_message_id": (sent or {}).get("id", ""),
            "to": to, "cc": cc,
            "subject": payload.subject,
            "body_html": payload.body_html or "",
            "attachment": fname if payload.include_pdf else "",
            "sent_by": user.get("email", ""),
            "sent_at": _now_iso(),
        })
        await _audit(cid, user, "emailed_client", None, {"to": to, "attachment": fname if payload.include_pdf else ""})
        return {"ok": True, "log_id": log_id, "message_id": (sent or {}).get("id", "")}

    @api.get("/contracts/{cid}/emails")
    async def list_contract_emails(cid: str, user=Depends(_require_priv)):
        cur = db.contract_emails.find({"contract_id": cid}, {"_id": 0}).sort("sent_at", -1)
        rows = await cur.to_list(200)
        return {"items": rows, "total": len(rows)}

    # ------------ Enforcement API (used by other modules in Phase 2) ------------
    @api.get("/contracts/enforce/{client_id}")
    async def enforce_limits(client_id: str, user=Depends(_require_priv)):
        """Return the effective active contract limits/features for a client.
        Other backend modules will proxy through this in Phase 2 to gate usage."""
        contract = await db.contracts.find_one({
            "client_id": client_id, "status": "active", "is_deleted": {"$ne": True},
        }, {"_id": 0})
        if not contract:
            return {"has_active_contract": False, "limits": {}, "features": {}, "modules": []}
        return {
            "has_active_contract": True,
            "contract_id": contract["id"],
            "contract_number": contract["contract_number"],
            "expires": contract.get("contract_end"),
            "modules": contract.get("modules") or [],
            "features": contract.get("features") or {},
            "limits": contract.get("limits") or {},
        }
