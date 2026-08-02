import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "react-router-dom";

/**
 * Sends a /me/heartbeat every 60s while the portal is open and the tab is visible.
 * Used by the backend to track active working minutes per day.
 * Mount once inside an authenticated layout.
 */
export default function useHeartbeat() {
  const { user } = useAuth();
  const location = useLocation();
  const lastPing = useRef(0);

  useEffect(() => {
    if (!user || user === false) return undefined;

    const ping = async () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastPing.current < 55_000) return;
      lastPing.current = now;
      try {
        await api.post("/me/heartbeat", { pathname: location.pathname });
      } catch {}
      try {
        await api.post("/presence/heartbeat");
      } catch {}
    };

    ping(); // initial
    const id = setInterval(ping, 60_000);
    const onVis = () => ping();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, location.pathname]);
}
