"""
stripe_invoices.py — Stripe Checkout for paying Projexino invoices.

Endpoints:
  POST   /api/finance/invoices/{invoice_id}/stripe-checkout
            Creates a Stripe Checkout Session for an existing invoice.
            Returns {url, session_id}. Frontend redirects user to url.
            Records initiated payment in db.payment_transactions.

  GET    /api/finance/invoices/{invoice_id}/stripe-status/{session_id}
            Polls Stripe for payment status. Updates payment_transactions
            and (on first success) marks the invoice as 'paid', writes
            a finance_activity log entry.

  POST   /api/webhook/stripe
            Stripe webhook for checkout.session.completed. Same idempotent
            mark-as-paid logic as the polling endpoint.

  GET    /api/finance/activity?invoice_id=<id>
            Returns the finance_activity audit trail for that invoice
            (or for all invoices if no invoice_id passed).

Public read for the invoice landing page (used after Stripe redirects):
  GET    /api/public/invoice/{invoice_id}
            Returns minimal invoice info {invoice_no, amount, currency,
            status, project_name}, no auth. Frontend uses this to show
            the "Thank you, payment received" screen.
"""
from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

router = APIRouter(tags=["stripe-invoices"])


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stripe_key() -> str:
    key = os.environ.get("STRIPE_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Stripe is not configured. Set STRIPE_API_KEY in backend/.env")
    return key


async def _ensure_payment_collections(db):
    """Idempotent index setup."""
    try:
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.payment_transactions.create_index("invoice_id")
        await db.finance_activity.create_index("invoice_id")
        await db.finance_activity.create_index("at")
    except Exception:
        pass


async def _log_finance_event(db, *, event: str, invoice_id: str, finance_id: Optional[str],
                             amount: float, currency: str, by: Optional[str] = None,
                             meta: Optional[dict] = None) -> str:
    """Append a row to db.finance_activity."""
    aid = str(uuid.uuid4())
    await db.finance_activity.insert_one({
        "id": aid,
        "event": event,
        "invoice_id": invoice_id,
        "finance_id": finance_id,
        "amount": float(amount),
        "currency": currency,
        "by": by,
        "meta": meta or {},
        "at": _now(),
    })
    return aid


async def _mark_invoice_paid_if_needed(db, invoice_id: str, session_id: str,
                                        amount: float, currency: str,
                                        stripe_metadata: dict) -> bool:
    """Idempotently mark invoice as paid and log the activity.
    Returns True if THIS call performed the update; False if already paid."""
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return False
    if inv.get("status") == "paid":
        return False
    now = _now()
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "status": "paid",
            "paid_at": now,
            "stripe_session_id": session_id,
            "stripe_metadata": stripe_metadata,
            "updated_at": now,
        }},
    )
    # Push a payment record onto the linked project_finance doc, if any
    finance_id = inv.get("finance_id")
    if finance_id:
        try:
            await db.project_finance.update_one(
                {"id": finance_id},
                {"$push": {"payments": {
                    "id": str(uuid.uuid4()),
                    "invoice_id": invoice_id,
                    "amount": float(amount),
                    "currency": currency,
                    "method": "stripe",
                    "stripe_session_id": session_id,
                    "received_at": now,
                }},
                 "$set": {"updated_at": now}},
            )
        except Exception:
            pass
    await _log_finance_event(
        db,
        event="stripe_payment_received",
        invoice_id=invoice_id,
        finance_id=finance_id,
        amount=float(amount),
        currency=currency,
        by="stripe",
        meta={"session_id": session_id, **(stripe_metadata or {})},
    )
    return True


def _stripe_checkout_client(request: Request):
    """Lazy import & build the StripeCheckout client."""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=_stripe_key(), webhook_url=webhook_url)


# ─────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────

class CheckoutIn(BaseModel):
    origin_url: str  # frontend will pass window.location.origin


# ─────────────────────────────────────────────────────────────
# Route registrar — called from server.py
# ─────────────────────────────────────────────────────────────

def register_stripe_invoices(api: APIRouter, db, get_current_user):
    """Attach all routes to the supplied /api router."""
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest

    # ---------- Authenticated: create checkout session ----------
    @api.post("/finance/invoices/{invoice_id}/stripe-checkout")
    async def create_invoice_checkout(invoice_id: str, payload: CheckoutIn, request: Request,
                                       user=Depends(get_current_user)):
        await _ensure_payment_collections(db)
        inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0, "pdf_base64": 0})
        if not inv:
            raise HTTPException(404, "Invoice not found")
        if inv.get("status") == "paid":
            raise HTTPException(400, "Invoice is already paid")

        # SECURITY: amount + currency come from the DB, NEVER from the request body.
        amount = float(inv.get("amount") or 0)
        currency = (inv.get("currency") or "USD").lower()
        if amount <= 0:
            raise HTTPException(400, "Invoice amount is zero or invalid")

        origin = payload.origin_url.rstrip("/")
        success_url = f"{origin}/invoice/{invoice_id}/paid?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/invoice/{invoice_id}/paid?canceled=1"
        metadata = {
            "invoice_id": invoice_id,
            "invoice_no": str(inv.get("invoice_no") or ""),
            "finance_id": str(inv.get("finance_id") or ""),
            "project_id": str(inv.get("project_id") or ""),
            "initiated_by": user.get("email") or user.get("id") or "",
        }

        stripe = _stripe_checkout_client(request)
        req = CheckoutSessionRequest(
            amount=amount, currency=currency,
            success_url=success_url, cancel_url=cancel_url,
            metadata=metadata,
        )
        try:
            session = await stripe.create_checkout_session(req)
        except Exception as e:
            raise HTTPException(502, f"Stripe checkout failed: {e}")

        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "invoice_id": invoice_id,
            "amount": amount,
            "currency": currency.upper(),
            "metadata": metadata,
            "payment_status": "initiated",
            "status": "pending",
            "checkout_url": session.url,
            "created_at": _now(),
            "updated_at": _now(),
        })
        await _log_finance_event(
            db,
            event="stripe_checkout_started",
            invoice_id=invoice_id,
            finance_id=inv.get("finance_id"),
            amount=amount,
            currency=currency.upper(),
            by=user.get("email"),
            meta={"session_id": session.session_id},
        )

        # Persist the pay link on the invoice so it can be embedded in
        # the next "send invoice" email/PDF.
        await db.invoices.update_one(
            {"id": invoice_id},
            {"$set": {"stripe_pay_url": session.url,
                      "stripe_session_id": session.session_id,
                      "updated_at": _now()}},
        )
        return {"url": session.url, "session_id": session.session_id}

    # ---------- Public: status polling (after Stripe redirects) ----------
    @api.get("/finance/invoices/{invoice_id}/stripe-status/{session_id}")
    async def invoice_stripe_status(invoice_id: str, session_id: str, request: Request):
        await _ensure_payment_collections(db)
        txn = await db.payment_transactions.find_one(
            {"session_id": session_id, "invoice_id": invoice_id}, {"_id": 0}
        )
        if not txn:
            raise HTTPException(404, "Unknown payment session")
        stripe = _stripe_checkout_client(request)
        try:
            status = await stripe.get_checkout_status(session_id)
        except Exception as e:
            raise HTTPException(502, f"Stripe status check failed: {e}")

        new_status = status.status
        new_pay_status = status.payment_status
        amount_total = (status.amount_total or 0) / 100.0
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {
                "status": new_status,
                "payment_status": new_pay_status,
                "amount_total": amount_total,
                "updated_at": _now(),
            }},
        )
        # Idempotent invoice mark-as-paid
        if new_pay_status == "paid":
            await _mark_invoice_paid_if_needed(
                db, invoice_id=invoice_id, session_id=session_id,
                amount=amount_total or float(txn.get("amount") or 0),
                currency=(status.currency or txn.get("currency") or "USD").upper(),
                stripe_metadata=status.metadata or {},
            )
        return {
            "status": new_status,
            "payment_status": new_pay_status,
            "amount_total": amount_total,
            "currency": (status.currency or "").upper(),
        }

    # ---------- Public: webhook (Stripe -> us) ----------
    @api.post("/webhook/stripe")
    async def stripe_webhook(request: Request):
        await _ensure_payment_collections(db)
        body = await request.body()
        sig = request.headers.get("Stripe-Signature", "")
        stripe = _stripe_checkout_client(request)
        try:
            evt = await stripe.handle_webhook(body, sig)
        except Exception as e:
            raise HTTPException(400, f"Invalid webhook: {e}")

        if evt.event_type == "checkout.session.completed" and evt.payment_status == "paid":
            invoice_id = (evt.metadata or {}).get("invoice_id")
            if invoice_id:
                # find txn → currency for accurate logging
                txn = await db.payment_transactions.find_one({"session_id": evt.session_id}, {"_id": 0}) or {}
                currency = (txn.get("currency") or "USD").upper()
                amount = float(txn.get("amount") or 0)
                await db.payment_transactions.update_one(
                    {"session_id": evt.session_id},
                    {"$set": {"payment_status": "paid", "status": "complete",
                              "updated_at": _now(), "webhook_event_id": evt.event_id}},
                )
                await _mark_invoice_paid_if_needed(
                    db, invoice_id=invoice_id, session_id=evt.session_id,
                    amount=amount, currency=currency,
                    stripe_metadata=evt.metadata or {},
                )
        return {"received": True}

    # ---------- Public: minimal invoice info for the thank-you page ----------
    @api.get("/public/invoice/{invoice_id}")
    async def public_invoice(invoice_id: str):
        inv = await db.invoices.find_one(
            {"id": invoice_id},
            {"_id": 0, "id": 1, "invoice_no": 1, "amount": 1, "currency": 1,
             "status": 1, "project_id": 1, "paid_at": 1, "issued_at": 1,
             "client_name": 1, "client_email": 1, "stripe_pay_url": 1, "stripe_session_id": 1},
        )
        if not inv:
            raise HTTPException(404, "Invoice not found")
        # also pull project name for a friendlier display
        project_name = ""
        if inv.get("project_id"):
            proj = await db.projects.find_one({"id": inv["project_id"]}, {"_id": 0, "name": 1}) or {}
            project_name = proj.get("name", "")
        inv["project_name"] = project_name
        return inv

    # ---------- Authenticated: finance activity log ----------
    @api.get("/finance/activity")
    async def get_finance_activity(invoice_id: Optional[str] = None, limit: int = 100,
                                    user=Depends(get_current_user)):
        if user.get("role") not in ("admin", "super_admin", "manager"):
            raise HTTPException(403, "Finance log is admin/manager only")
        q = {"invoice_id": invoice_id} if invoice_id else {}
        cur = db.finance_activity.find(q, {"_id": 0}).sort("at", -1).limit(min(limit, 500))
        return await cur.to_list(min(limit, 500))
