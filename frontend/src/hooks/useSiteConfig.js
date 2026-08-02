import { useEffect, useState } from "react";
import { api } from "@/lib/api";

// In-memory cache so multiple components don't re-fetch.
let _cache = null;
let _inflight = null;

/**
 * useSiteConfig — read the public site config (brand, hero, contact, socials, footer, …).
 * Returns the latest server value once fetched; falls back to safe defaults until then.
 * Components rendering critical fields should use the returned `config?.contact?.email`
 * pattern with their own static fallback to avoid empty UI on first paint.
 */
export default function useSiteConfig() {
  const [config, setConfig] = useState(_cache);

  useEffect(() => {
    if (_cache) { setConfig(_cache); return; }
    if (!_inflight) {
      _inflight = api.get("/website-config").then(({ data }) => {
        _cache = data; _inflight = null;
        return data;
      }).catch(() => {
        _inflight = null;
        return null;
      });
    }
    _inflight.then((data) => data && setConfig(data));
  }, []);

  return config;
}

export function invalidateSiteConfig() {
  _cache = null;
}
