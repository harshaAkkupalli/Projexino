"""
Bank credit-alert email watcher (no gateway / bank API needed).

Scans the connected Gmail inbox(es) for bank credit-alert emails
("Your a/c XX1234 credited with INR 15,000 ... UTR ..."), parses amount + UTR,
matches against unpaid INR invoices and either flags them
("₹ Credit detected — 1 click to approve") or auto-approves exact matches
when enabled in Finance → Bank & payment details.

Endpoints:
  POST /api/finance/bank-alerts/scan  — scan inbox now (admin)
  GET  /api/finance/bank-alerts       — recent parsed alerts (admin)
Background: bank_alert_loop(db) every 3 minutes.
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import Body, Depends, HTTPException

logger = logging.getLogger("bank_alerts")

_AMOUNT_RE = re.compile(r"(?:INR|Rs\.?|₹)\s*\.?\s*([\d,]+(?:\.\d{1,2})?)", re.I)
_UTR_RE = re.compile(r"(?:UTR|RRN|Ref(?:erence)?(?:\s*No)?\.?)[:\s\-]*([A-Za-z0-9]{6,22})", re.I)
_CREDIT_WORDS = re.compile(r"\bcredit(?:ed)?\b", re.I)
_DEBIT_WORDS = re.compile(r"\bdebit(?:ed)?\b", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_alert(text: str):
    """Return (amount, utr) if text looks like a credit alert, else (None, None)."""
    if not text or not _CREDIT_WORDS.search(text) or _DEBIT_WORDS.search(text):
        return None, None
    m = _AMOUNT_RE.search(text)
    if not m:
        return None, None
    try:
        amount = float(m.group(1).replace(",", ""))
    except ValueError:
        return None, None
    if amount <= 0:
        return None, None
    u = _UTR_RE.search(text)
    return amount, (u.group(1) if u else "")


async def scan_bank_alerts(db) -> Dict[str, int]:
    """Scan all connected Gmail inboxes for credit alerts. Returns counters."""
    from email_module import _refresh_if_needed, _build_gmail_service
    from finance import create_receipt_for_invoice, notify_finance_admins

    settings = await db.finance_settings.find_one({"id": "singleton"}, {"_id": 0}) or {}
    sender_filter = (settings.get("alert_sender") or "").strip()
    auto_approve = bool(settings.get("auto_approve_credits"))

    stats = {"scanned": 0, "alerts": 0, "flagged": 0, "auto_approved": 0, "no_match": 0}
    q = 'newer_than:3d ("credited" OR "credit")'
    if sender_filter:
        q += f" from:{sender_filter}"

    async for tok in db.gmail_tokens.find({}, {"_id": 0}):
        try:
            tok = await _refresh_if_needed(db, tok)
            service = _build_gmail_service(tok)
            resp = service.users().messages().list(userId="me", q=q, maxResults=30).execute()
            msgs = resp.get("messages") or []
        except Exception as e:
            logger.warning("bank_alerts: inbox scan skipped (%s)", str(e)[:120])
            continue
        for m in msgs:
            mid = m.get("id")
            if not mid:
                continue
            if await db.bank_credit_alerts.find_one({"gmail_message_id": mid}, {"_id": 0, "id": 1}):
                continue
            stats["scanned"] += 1
            try:
                full = service.users().messages().get(
                    userId="me", id=mid, format="metadata",
                    metadataHeaders=["Subject", "From", "Date"],
                ).execute()
            except Exception:
                continue
            headers = {h["name"].lower(): h["value"] for h in (full.get("payload", {}).get("headers") or [])}
            snippet = full.get("snippet") or ""
            text = f"{headers.get('subject', '')} {snippet}"
            amount, utr = _parse_alert(text)
            doc = {
                "id": uuid.uuid4().hex, "gmail_message_id": mid,
                "from": headers.get("from", ""), "subject": headers.get("subject", ""),
                "snippet": snippet[:400], "amount": amount, "utr": utr,
                "detected_at": _now(), "action": "not_credit", "matched_invoice_ids": [],
            }
            if amount is None:
                await db.bank_credit_alerts.insert_one(dict(doc))
                continue
            stats["alerts"] += 1
            matches = await db.invoices.find(
                {"status": {"$ne": "paid"}, "currency": "INR",
                 "amount": {"$gte": amount - 0.01, "$lte": amount + 0.01}},
                {"_id": 0, "pdf_base64": 0},
            ).to_list(10)
            doc["matched_invoice_ids"] = [i["id"] for i in matches]
            if len(matches) == 1:
                inv = matches[0]
                now = _now()
                if auto_approve:
                    rec = await create_receipt_for_invoice(
                        db, inv, "bank_transfer", "bank-alert-auto",
                        f"Auto-approved from bank credit alert{(' · UTR ' + utr) if utr else ''}")
                    await db.invoices.update_one(
                        {"id": inv["id"]},
                        {"$set": {"status": "paid", "paid_at": now,
                                  "payment_approved_by": "bank-alert-auto",
                                  "credit_detected_at": now,
                                  "credit_alert": {"amount": amount, "utr": utr, "gmail_message_id": mid}}})
                    if inv.get("finance_id"):
                        await db.project_finance.update_one(
                            {"id": inv["finance_id"]},
                            {"$push": {"payments": {
                                "id": uuid.uuid4().hex, "amount": amount, "method": "bank_transfer",
                                "note": f"Auto-approved via bank credit alert{(' · UTR ' + utr) if utr else ''}",
                                "paid_at": now, "invoice_id": inv["id"]}}})
                    doc["action"] = "auto_approved"
                    stats["auto_approved"] += 1
                    await notify_finance_admins(
                        db, "💰 Credit received — auto-approved",
                        f"INR {amount:,.2f} credited{(' (UTR ' + utr + ')') if utr else ''} matched {inv.get('invoice_no')} — receipt {rec['receipt_no']} generated automatically.")
                else:
                    await db.invoices.update_one(
                        {"id": inv["id"]},
                        {"$set": {"credit_detected_at": now,
                                  "credit_alert": {"amount": amount, "utr": utr, "gmail_message_id": mid}}})
                    doc["action"] = "flagged"
                    stats["flagged"] += 1
                    await notify_finance_admins(
                        db, "₹ Credit detected",
                        f"INR {amount:,.2f} credited{(' (UTR ' + utr + ')') if utr else ''} matches invoice {inv.get('invoice_no')} — 1 click to approve in Finance.")
            elif len(matches) > 1:
                doc["action"] = "ambiguous"
                await notify_finance_admins(
                    db, "₹ Credit detected (multiple matches)",
                    f"INR {amount:,.2f} credited{(' (UTR ' + utr + ')') if utr else ''} matches {len(matches)} open invoices — review and approve the right one.")
            else:
                doc["action"] = "no_match"
                stats["no_match"] += 1
            await db.bank_credit_alerts.insert_one(dict(doc))
    return stats


async def bank_alert_loop(db, interval_seconds: int = 180):
    await asyncio.sleep(20)
    while True:
        try:
            await scan_bank_alerts(db)
        except Exception:
            logger.exception("bank_alert_loop iteration failed")
        await asyncio.sleep(interval_seconds)


def register_bank_alerts(api, db, get_current_user):
    def _require_admin(user):
        if user.get("role") not in ("admin", "super_admin"):
            raise HTTPException(403, "Admins only")

    @api.post("/finance/bank-alerts/scan")
    async def manual_scan(user=Depends(get_current_user)):
        _require_admin(user)
        try:
            stats = await scan_bank_alerts(db)
        except Exception as e:
            raise HTTPException(400, f"Scan failed — is Gmail connected? ({str(e)[:120]})")
        return stats

    @api.get("/finance/bank-alerts")
    async def list_alerts(limit: int = 50, user=Depends(get_current_user)):
        _require_admin(user)
        return await db.bank_credit_alerts.find(
            {"action": {"$ne": "not_credit"}}, {"_id": 0},
        ).sort("detected_at", -1).to_list(min(limit, 200))
