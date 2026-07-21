/**
 * useActiveTheme.js — mounts once on the public site, fetches the active WXM
 * theme, and applies it live by:
 *   1. Setting CSS custom properties on <html> (--brand-primary, …)
 *   2. Injecting an override <style id="wxm-theme-override"> block that maps
 *      the legacy Tailwind arbitrary-value classes (`bg-[#F97316]`, `text-[#0F2042]`)
 *      to the new variables so the entire public site re-skins instantly without
 *      any component refactor.
 *
 * Network: 1 GET /api/public/wxm/active-theme · no auth · cached in module scope.
 */
import { useEffect } from "react";
import { api } from "@/lib/api";

let _cache = null;
let _inflight = null;
const STYLE_ID = "wxm-theme-override";

function applyTheme(t) {
  if (!t || !t.primary_color) return;
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", t.primary_color);
  root.style.setProperty("--brand-secondary", t.secondary_color || "#0F2042");
  root.style.setProperty("--brand-accent", t.accent_color || "#10B981");
  root.style.setProperty("--brand-surface", t.surface_color || "#FFFFFF");
  root.style.setProperty("--brand-text", t.text_color || "#0F2042");
  if (t.font_heading) root.style.setProperty("--font-heading", `'${t.font_heading}', system-ui, sans-serif`);
  if (t.font_body) root.style.setProperty("--font-body", `'${t.font_body}', system-ui, sans-serif`);

  // Override legacy hardcoded Tailwind arbitrary-color classes used throughout
  // the public site. Tailwind compiles `bg-[#F97316]` → `.bg-\[\#F97316\]`.
  const css = `
    :root {
      --brand-primary: ${t.primary_color};
      --brand-secondary: ${t.secondary_color || "#0F2042"};
      --brand-accent: ${t.accent_color || "#10B981"};
    }
    .bg-\\[\\#F97316\\]      { background-color: var(--brand-primary) !important; }
    .bg-\\[\\#F97316\\]\\/10 { background-color: color-mix(in srgb, var(--brand-primary) 10%, transparent) !important; }
    .bg-\\[\\#F97316\\]\\/20 { background-color: color-mix(in srgb, var(--brand-primary) 20%, transparent) !important; }
    .bg-\\[\\#F97316\\]\\/25 { background-color: color-mix(in srgb, var(--brand-primary) 25%, transparent) !important; }
    .bg-\\[\\#F97316\\]\\/60 { background-color: color-mix(in srgb, var(--brand-primary) 60%, transparent) !important; }
    .text-\\[\\#F97316\\]    { color: var(--brand-primary) !important; }
    .border-\\[\\#F97316\\]  { border-color: var(--brand-primary) !important; }
    .border-\\[\\#F97316\\]\\/60 { border-color: color-mix(in srgb, var(--brand-primary) 60%, transparent) !important; }
    .ring-\\[\\#F97316\\]    { --tw-ring-color: var(--brand-primary) !important; }
    .from-\\[\\#F97316\\]    { --tw-gradient-from: var(--brand-primary) var(--tw-gradient-from-position) !important; --tw-gradient-to: color-mix(in srgb, var(--brand-primary) 0%, transparent) var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
    .to-\\[\\#F97316\\]      { --tw-gradient-to: var(--brand-primary) var(--tw-gradient-to-position) !important; }
    .via-\\[\\#F97316\\]     { --tw-gradient-via-position: 50%; --tw-gradient-via: var(--brand-primary) !important; }
    .stroke-\\[\\#F97316\\]  { stroke: var(--brand-primary) !important; }
    .fill-\\[\\#F97316\\]    { fill: var(--brand-primary) !important; }
    .hover\\:bg-\\[\\#F97316\\]:hover       { background-color: var(--brand-primary) !important; }
    .hover\\:text-\\[\\#F97316\\]:hover     { color: var(--brand-primary) !important; }
    .hover\\:border-\\[\\#F97316\\]:hover   { border-color: var(--brand-primary) !important; }
    .group-open\\:text-\\[\\#F97316\\]      { color: var(--brand-primary) !important; }

    .bg-\\[\\#0F2042\\]      { background-color: var(--brand-secondary) !important; }
    .text-\\[\\#0F2042\\]    { color: var(--brand-secondary) !important; }
    .border-\\[\\#0F2042\\]  { border-color: var(--brand-secondary) !important; }
    .from-\\[\\#0F2042\\]    { --tw-gradient-from: var(--brand-secondary) var(--tw-gradient-from-position) !important; }
    .to-\\[\\#0F2042\\]      { --tw-gradient-to: var(--brand-secondary) var(--tw-gradient-to-position) !important; }
  `;
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

export default function useActiveTheme() {
  useEffect(() => {
    if (_cache) { applyTheme(_cache); return; }
    if (!_inflight) {
      _inflight = api.get("/public/wxm/active-theme").then(({ data }) => {
        _cache = data; _inflight = null; return data;
      }).catch(() => { _inflight = null; return null; });
    }
    _inflight.then((d) => d && applyTheme(d));
  }, []);
}

export function invalidateActiveTheme() {
  _cache = null;
  const el = document.getElementById(STYLE_ID);
  if (el) el.remove();
}
