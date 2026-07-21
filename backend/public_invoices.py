"""public_invoices.py — Public invoice endpoints + finance activity log.

Stripe payment processing has been removed from the system. Clients pay via
bank transfer / UPI on the public pay page; admins verify & approve manually.

Endpoints:
  GET /api/public/invoice-pay/{token}   Public pay-page info (bank details)
  GET /api/public/invoice/{invoice_id}  Minimal invoice info (no auth)
  GET /api/finance/activity             Finance audit trail (admin/manager)
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException


def register_public_invoices(api: APIRouter, db, get_current_user):

    @api.get("/public/invoice-pay/{token}")
    async def public_invoice_pay_info(token: str):
        inv = await db.invoices.find_one({"share_token": token}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invalid or expired link")
        bank = await db.finance_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
        return {
            "invoice_no": inv.get("invoice_no"), "project_name": inv.get("project_name"),
            "client_name": inv.get("client_name"), "amount": inv.get("amount"),
            "currency": inv.get("currency"), "status": inv.get("status"),
            "due_date": inv.get("due_date"), "issued_at": inv.get("issued_at"),
            "stripe_enabled": False,
            "bank": {k: bank.get(k, "") for k in ("bank_name", "account_name", "account_number", "ifsc", "swift", "branch", "upi_id", "payment_note")},
        }

    @api.get("/public/invoice/{invoice_id}")
    async def public_invoice(invoice_id: str):
        inv = await db.invoices.find_one(
            {"id": invoice_id},
            {"_id": 0, "id": 1, "invoice_no": 1, "amount": 1, "currency": 1,
             "status": 1, "project_id": 1, "paid_at": 1, "issued_at": 1,
             "client_name": 1, "client_email": 1},
        )
        if not inv:
            raise HTTPException(404, "Invoice not found")
        project_name = ""
        if inv.get("project_id"):
            proj = await db.projects.find_one({"id": inv["project_id"]}, {"_id": 0, "name": 1}) or {}
            project_name = proj.get("name", "")
        inv["project_name"] = project_name
        return inv

    @api.get("/finance/activity")
    async def get_finance_activity(invoice_id: Optional[str] = None, limit: int = 100,
                                    user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin", "manager"):
            raise HTTPException(403, "Finance log is admin/manager only")
        q = {"invoice_id": invoice_id} if invoice_id else {}
        cur = db.finance_activity.find(q, {"_id": 0}).sort("at", -1).limit(min(limit, 500))
        return await cur.to_list(min(limit, 500))
