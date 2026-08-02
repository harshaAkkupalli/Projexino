"""
Native W3C Web Push (VAPID) integration — replaces the prior FCM module.

Storage: collection `webpush_subscriptions`
  { id, user_id, endpoint (unique), keys: { p256dh, auth }, user_agent, created_at }

Sends pushes via pywebpush directly to the browser push services (FCM endpoint
for Chrome/Edge/Android, Mozilla autopush for Firefox, Apple Web Push for Safari).

Endpoints (mounted under /api):
  POST   /webpush/subscribe       body { subscription, user_agent? }
  POST   /webpush/unsubscribe     body { endpoint }
  GET    /webpush/status          { configured, my_subscriptions }
  POST   /webpush/test            admin/manager/hr — sends a push to my devices
  GET    /webpush/public-key      returns the VAPID public key (for clients without env)

Legacy aliases (so the existing frontend `/fcm/*` calls keep working):
  POST   /fcm/register-token  → wraps /webpush/subscribe (body: {token: stringified subscription})
  DELETE /fcm/unregister-token
  GET    /fcm/status
  POST   /fcm/test
"""
from __future__ import annotations

import os
import json
import base64
import logging
import asyncio
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("projexino.webpush")


# ---------------- VAPID config ----------------

def _vapid_private_pem() -> Optional[str]:
    b64 = os.environ.get("VAPID_PRIVATE_PEM_B64", "")
    if not b64:
        return None
    try:
        return base64.b64decode(b64).decode("utf-8")
    except Exception as e:
        logger.error("VAPID_PRIVATE_PEM_B64 invalid: %s", e)
        return None


def _vapid_claims() -> Dict[str, str]:
    return {"sub": os.environ.get("VAPID_SUBJECT", "mailto:hello@projexino.com")}


def _vapid_public_key() -> str:
    return os.environ.get("VAPID_PUBLIC_KEY_URLSAFE", "")


def is_webpush_configured() -> bool:
    return bool(_vapid_private_pem())


# ---------------- Send helpers ----------------

def _send_one_sync(subscription_info: Dict[str, Any], payload: Dict[str, Any], private_pem: str) -> bool:
    """Synchronous webpush send (runs in executor). Returns True on success."""
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=private_pem,
            vapid_claims=_vapid_claims(),
            ttl=86400,
        )
        return True
    except WebPushException as e:
        # 404/410 = subscription dead → tell caller to delete
        sc = getattr(e.response, "status_code", None) if hasattr(e, "response") and e.response is not None else None
        if sc in (404, 410):
            raise SubscriptionGone() from e
        logger.warning("webpush send failed (%s): %s", sc, str(e)[:200])
        return False
    except Exception as e:
        logger.warning("webpush send unexpected error: %s", e)
        return False


class SubscriptionGone(Exception):
    pass


async def send_push_to_user(db, user_id: str, title: str, body: str, link: str = "/app",
                            data: Optional[dict] = None, tag: Optional[str] = None) -> int:
    """Send a push to every active subscription for user_id. Returns success count."""
    if not is_webpush_configured():
        return 0
    pem = _vapid_private_pem()
    payload = {
        "title": title or "Projexino",
        "body": body or "",
        "link": link or "/app",
        "tag": tag or "default",
        **(data or {}),
    }
    cur = db.webpush_subscriptions.find({"user_id": user_id}, {"_id": 0})
    subs = await cur.to_list(50)
    if not subs:
        return 0
    loop = asyncio.get_event_loop()
    ok = 0
    dead = []
    for s in subs:
        sub_info = {"endpoint": s["endpoint"], "keys": s.get("keys", {})}
        try:
            success = await loop.run_in_executor(None, lambda si=sub_info: _send_one_sync(si, payload, pem))
            if success:
                ok += 1
        except SubscriptionGone:
            dead.append(s["endpoint"])
        except Exception as e:
            logger.warning("send failed for %s: %s", s.get("endpoint", "")[:50], e)
    if dead:
        await db.webpush_subscriptions.delete_many({"endpoint": {"$in": dead}})
    return ok


# ---------------- API ----------------

class SubscriptionIn(BaseModel):
    subscription: Dict[str, Any] = Field(..., description="PushSubscription.toJSON() output")
    user_agent: Optional[str] = ""
    platform: Optional[str] = "web"


class EndpointIn(BaseModel):
    endpoint: str


# Legacy compat shapes
class LegacyRegisterIn(BaseModel):
    token: str = Field(..., description="JSON-stringified PushSubscription")
    user_agent: Optional[str] = ""
    platform: Optional[str] = "web"


class LegacyTokenIn(BaseModel):
    token: str


def register_webpush(api: APIRouter, db, get_current_user):

    async def _subscribe(user, sub: Dict[str, Any], user_agent: str, platform: str):
        endpoint = sub.get("endpoint")
        keys = sub.get("keys") or {}
        if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
            raise HTTPException(400, "Invalid PushSubscription payload")
        now = datetime.now(timezone.utc).isoformat()
        await db.webpush_subscriptions.update_one(
            {"endpoint": endpoint},
            {
                "$set": {
                    "user_id": user["id"],
                    "email": user.get("email", ""),
                    "keys": {"p256dh": keys["p256dh"], "auth": keys["auth"]},
                    "user_agent": (user_agent or "")[:200],
                    "platform": platform or "web",
                    "updated_at": now,
                },
                "$setOnInsert": {"created_at": now},
            },
            upsert=True,
        )
        return {"ok": True, "configured": is_webpush_configured()}

    # ---- Modern endpoints ----
    @api.post("/webpush/subscribe")
    async def subscribe(payload: SubscriptionIn, user=Depends(get_current_user)):
        return await _subscribe(user, payload.subscription, payload.user_agent or "", payload.platform or "web")

    @api.post("/webpush/unsubscribe")
    async def unsubscribe(payload: EndpointIn, user=Depends(get_current_user)):
        r = await db.webpush_subscriptions.delete_one({"endpoint": payload.endpoint, "user_id": user["id"]})
        return {"ok": True, "deleted": r.deleted_count}

    @api.get("/webpush/status")
    async def status(user=Depends(get_current_user)):
        n = await db.webpush_subscriptions.count_documents({"user_id": user["id"]})
        return {"configured": is_webpush_configured(), "my_subscriptions": n, "my_tokens": n}

    @api.get("/webpush/public-key")
    async def public_key():
        return {"public_key": _vapid_public_key()}

    @api.post("/webpush/test")
    async def test_push(user=Depends(get_current_user)):
        if user.get("role") not in ("super_admin","admin","manager","hr"):
            raise HTTPException(403, "Forbidden")
        if not is_webpush_configured():
            raise HTTPException(400, "Web Push not configured. Set VAPID_PRIVATE_PEM_B64 on the backend.")
        n = await send_push_to_user(
            db, user["id"],
            title="Projexino test push",
            body=f"Hello {user.get('name','operator')} — push pipeline is live!",
            link="/app",
            tag="test",
        )
        return {"sent": n}

    # ---- Legacy /fcm/* aliases for backward-compat with the Settings frontend ----

    @api.post("/fcm/register-token")
    async def legacy_register(payload: LegacyRegisterIn, user=Depends(get_current_user)):
        try:
            sub = json.loads(payload.token)
        except Exception:
            raise HTTPException(400, "Invalid token payload — expected JSON-stringified PushSubscription.")
        return await _subscribe(user, sub, payload.user_agent or "", payload.platform or "web")

    @api.delete("/fcm/unregister-token")
    async def legacy_unregister(payload: LegacyTokenIn, user=Depends(get_current_user)):
        try:
            sub = json.loads(payload.token)
            endpoint = sub.get("endpoint")
        except Exception:
            endpoint = payload.token
        await db.webpush_subscriptions.delete_one({"endpoint": endpoint, "user_id": user["id"]})
        return {"ok": True}

    @api.get("/fcm/status")
    async def legacy_status(user=Depends(get_current_user)):
        n = await db.webpush_subscriptions.count_documents({"user_id": user["id"]})
        return {"configured": is_webpush_configured(), "my_tokens": n}

    @api.post("/fcm/test")
    async def legacy_test(user=Depends(get_current_user)):
        return await test_push(user)
