// Native W3C Web Push helper — no Firebase dependency.
// Uses navigator.serviceWorker + PushManager + VAPID public key.
//
// Backend endpoints used (compat path /fcm/* — see backend webpush_mod.py):
//   POST /api/fcm/register-token { token: <stringified PushSubscription>, user_agent, platform }
//   DELETE /api/fcm/unregister-token { token: <stringified PushSubscription> }
//   GET /api/fcm/status
//   POST /api/fcm/test

import { api } from "@/lib/api";
import { toast } from "sonner";

const VAPID_PUBLIC = process.env.REACT_APP_WEBPUSH_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(b64) {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function ensureSwReady() {
  if (!("serviceWorker" in navigator)) return null;
  let reg = await navigator.serviceWorker.getRegistration("/webpush-sw.js");
  if (!reg) reg = await navigator.serviceWorker.register("/webpush-sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

export async function initFcm() {
  // Name kept for compat; no-op for native web-push but returns truthy when supported.
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  return true;
}

export async function requestAndRegisterToken() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    toast.error("Push notifications are not supported on this device/browser.");
    return null;
  }
  if (!VAPID_PUBLIC) {
    // Try fetching from backend in case .env wasn't propagated
    try {
      const { data } = await api.get("/webpush/public-key");
      if (!data.public_key) throw new Error("No VAPID key on server");
    } catch {
      toast.error("Push not configured on server.");
      return null;
    }
  }
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") {
    toast.error("Notifications permission denied.");
    return null;
  }
  try {
    const reg = await ensureSwReady();
    if (!reg) return null;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const subJson = sub.toJSON();
    await api.post("/fcm/register-token", {
      token: JSON.stringify(subJson),
      user_agent: navigator.userAgent.slice(0, 200),
      platform: "web",
    });
    try { localStorage.setItem("pj_webpush_sub", JSON.stringify(subJson)); } catch {}
    toast.success("Push notifications enabled");
    return subJson;
  } catch (e) {
    console.error("Web Push subscribe failed", e);
    toast.error("Could not enable push notifications");
    return null;
  }
}

export async function unregisterToken() {
  try {
    const reg = await ensureSwReady();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.delete(`/fcm/unregister-token`, { data: { token: JSON.stringify(sub.toJSON()) } });
        try { await sub.unsubscribe(); } catch {}
      }
    }
  } catch (e) {
    console.warn("unregister failed", e);
  } finally {
    try { localStorage.removeItem("pj_webpush_sub"); } catch {}
  }
}

// Foreground listener — show in-app toast for pushes that arrive while tab is active.
// Native Push API delivers to the SW only — we listen for SW messages.
export async function listenForeground(onMsg) {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (evt) => {
    const d = evt.data || {};
    if (d.type === "push") {
      toast(d.title || "Notification", { description: d.body });
      if (typeof onMsg === "function") onMsg(d);
    }
  });
}

export function fcmPermissionState() {
  if (!("Notification" in window) || !("PushManager" in window)) return "unsupported";
  return Notification.permission; // "default" | "granted" | "denied"
}
