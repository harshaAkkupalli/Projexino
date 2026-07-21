/**
 * WebsiteExperienceManager.jsx — Iter 39 · Dynamic site personalization admin UI.
 *
 * Five sub-modules:
 *   • Profiles  — Industry × Country experience triples (links Theme + Hero + CTAs)
 *   • Themes    — colour / font / radius / hero-style presets
 *   • Heroes    — headline / sub / bg media / badge
 *   • CTAs      — reusable button label + URL + intent
 *   • Analytics — last-14-day detect hits per profile + Preview-As launcher
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Palette, Layers, MousePointer, BarChart3,
  Plus, Trash2, Pencil, Star, Eye, ExternalLink, Loader2, X, Globe2, Check,
  FileText, Send, Copy, Save, BookOpenCheck, Search,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const TABS = [
  { v: "pages",     label: "Pages",                icon: FileText, count: "pages" },
  { v: "profiles", label: "Experience Profiles", icon: Sparkles, count: "profiles" },
  { v: "themes",   label: "Themes",              icon: Palette,  count: "themes" },
  { v: "heroes",   label: "Heroes",              icon: Layers,   count: "heroes" },
  { v: "ctas",     label: "CTAs",                icon: MousePointer, count: "ctas" },
  { v: "analytics", label: "Analytics & Preview", icon: BarChart3 },
];

const INDUSTRIES = ["", "fintech", "healthcare", "automotive", "real_estate", "ecommerce", "education", "logistics", "saas", "agency", "manufacturing"];
const COUNTRIES = ["", "*", "US", "GB", "IN", "AE", "SG", "DE", "FR", "AU", "CA", "ZA"];
const AUDIENCES = ["", "startup", "smb", "enterprise", "agency", "consumer"];
const HERO_STYLES = ["split", "centered", "minimal", "video", "full-bleed"];
const CTA_STYLES = ["rounded", "pill", "sharp"];
const INTENTS = ["lead", "partnership", "estimate", "dedicated_team", "call"];

export default function WebsiteExperienceManager() {
  const [pages, setPages] = useState([]);
  const [themes, setThemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const refresh = async () => {
    setLoading(true);
    try {
      const [pg, t] = await Promise.all([
        api.get("/wxm/pages"),
        api.get("/wxm/themes"),
      ]);
      setPages(pg.data || []);
      setThemes(t.data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(() => {
    return (pages || []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (p.title || "").toLowerCase().includes(needle)
        || (p.slug || "").toLowerCase().includes(needle)
        || (p.meta_description || "").toLowerCase().includes(needle)
        || (p.meta_keywords || []).some((k) => (k || "").toLowerCase().includes(needle));
    });
  }, [pages, q, statusFilter]);

  const liveCount = pages.filter((p) => p.status === "published").length;
  const draftCount = pages.length - liveCount;

  return (
    <div className="space-y-5" data-testid="wxm-root">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0F2042] via-[#1a2d5c] to-[#0F2042] p-7 text-white shadow-lg">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-[#F97316]/30 blur-3xl"/>
        <div className="absolute -left-10 -bottom-12 h-56 w-56 rounded-full bg-[#A855F7]/25 blur-3xl"/>
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
              <FileText size={14}/> Website Pages · AI Studio
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">Spin up beautiful, SEO-optimised pages in 8 seconds.</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-200/80">Tell the AI a topic. It drafts the title, meta description, hero, features, process, and FAQ — all production-ready. Publish to <span className="font-mono text-amber-200">/page/&lt;slug&gt;</span> in one click.</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-bold text-emerald-200 ring-1 ring-emerald-400/40" data-testid="wxm-live-count">{liveCount} live</span>
              <span className="rounded-full bg-amber-500/20 px-3 py-1 font-bold text-amber-200 ring-1 ring-amber-400/40" data-testid="wxm-draft-count">{draftCount} draft{draftCount === 1 ? "" : "s"}</span>
              <span className="rounded-full bg-violet-500/20 px-3 py-1 font-bold text-violet-200 ring-1 ring-violet-400/40">Powered by Emergent LLM</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PagesAiCreateButton onCreated={refresh} themes={themes}/>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, slug, keywords…"
            data-testid="wxm-search"
            className="w-full rounded-full border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316] focus:bg-white"/>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-slate-100 p-1 text-[11px]">
          {[
            { v: "all", label: "All", n: pages.length },
            { v: "published", label: "Live", n: liveCount },
            { v: "draft", label: "Drafts", n: draftCount },
          ].map((f) => (
            <button key={f.v} onClick={() => setStatusFilter(f.v)} data-testid={`wxm-filter-${f.v}`}
              className={`rounded-full px-3 py-1 font-bold transition ${statusFilter === f.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              {f.label} · {f.n}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={32} className="animate-spin text-[#F97316]"/></div>
      ) : (
        <PagesPanel rows={filtered} themes={themes} refresh={refresh}/>
      )}
    </div>
  );
}

// Quick "Create with AI" launcher button that opens the editor pre-focused on the AI card.
function PagesAiCreateButton({ onCreated, themes }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="wxm-create-with-ai"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] via-[#FB923C] to-[#A855F7] px-5 py-2.5 text-sm font-bold text-white shadow-xl ring-1 ring-white/20 transition hover:scale-[1.02]">
        <Sparkles size={14}/> Create page with AI
      </button>
      <AnimatePresence>
        {open && (
          <PageEditor page={null} themes={themes} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onCreated && onCreated(); }}/>
        )}
      </AnimatePresence>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Profiles
// ──────────────────────────────────────────────────────────────────────
function ProfilesPanel({ rows, themes, heroes, ctas, refresh }) {
  const [modal, setModal] = useState(null); // { mode: 'create'|'edit', row }

  const remove = async (id) => {
    if (!window.confirm("Delete this experience profile?")) return;
    try { await api.delete(`/wxm/profiles/${id}`); toast.success("Profile deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">Visitors get routed to the highest-priority published profile that matches their industry &amp; country.</div>
        <button onClick={() => setModal({ mode: "create" })} data-testid="wxm-new-profile"
          className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]">
          <Plus size={12}/> New profile
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyHint title="No experience profiles yet" hint="Create your first one — e.g. 'Fintech US' linking a Theme + Hero + CTA."/>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const theme = themes.find((t) => t.id === p.theme_id);
            const hero = heroes.find((h) => h.id === p.hero_id);
            const cta = ctas.find((c) => c.id === p.primary_cta_id);
            return (
              <motion.div key={p.id} layout className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md" data-testid={`wxm-profile-card-${p.slug}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {p.is_default && <Star size={14} className="fill-amber-400 text-amber-400" title="Default"/>}
                      <span className="text-base font-bold text-[#0F2042]">{p.name}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">/{p.slug}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${p.is_published ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                    {p.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
                  {p.industry && <Chip color="sky">{p.industry}</Chip>}
                  {p.country && <Chip color="indigo">{p.country === "*" ? "Any country" : p.country}</Chip>}
                  {p.audience && <Chip color="violet">{p.audience}</Chip>}
                  <Chip color="amber">priority {p.priority || 0}</Chip>
                </div>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <Row label="Theme" value={theme ? <span className="inline-flex items-center gap-1.5"><Swatch color={theme.primary_color}/> {theme.name}</span> : <i className="text-slate-400">not linked</i>}/>
                  <Row label="Hero" value={hero ? <span className="line-clamp-1">{hero.headline}</span> : <i className="text-slate-400">not linked</i>}/>
                  <Row label="Primary CTA" value={cta ? <span>{cta.label} → {cta.url}</span> : <i className="text-slate-400">not linked</i>}/>
                </div>
                <div className="mt-4 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => window.open(`/?preview_profile_id=${p.id}`, "_blank")} title="Preview live" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0F2042]" data-testid={`wxm-profile-preview-${p.slug}`}>
                    <Eye size={14}/>
                  </button>
                  <button onClick={() => setModal({ mode: "edit", row: p })} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0F2042]" data-testid={`wxm-profile-edit-${p.slug}`}>
                    <Pencil size={14}/>
                  </button>
                  <button onClick={() => remove(p.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50" data-testid={`wxm-profile-delete-${p.slug}`}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      {modal && <ProfileModal mode={modal.mode} row={modal.row} themes={themes} heroes={heroes} ctas={ctas} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }}/>}
    </div>
  );
}

function ProfileModal({ mode, row, themes, heroes, ctas, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: row?.name || "",
    slug: row?.slug || "",
    industry: row?.industry || "",
    country: row?.country || "",
    audience: row?.audience || "",
    description: row?.description || "",
    theme_id: row?.theme_id || "",
    hero_id: row?.hero_id || "",
    primary_cta_id: row?.primary_cta_id || "",
    secondary_cta_id: row?.secondary_cta_id || "",
    is_published: row?.is_published ?? false,
    is_default: row?.is_default ?? false,
    priority: row?.priority || 0,
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      if (mode === "create") await api.post("/wxm/profiles", form);
      else await api.patch(`/wxm/profiles/${row.id}`, form);
      toast.success(mode === "create" ? "Profile created" : "Profile updated");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title={mode === "create" ? "New experience profile" : `Edit · ${row?.name}`} testid="wxm-profile-modal">
      <Field label="Name"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fintech US" data-testid="wxm-profile-name"/></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Industry"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} data-testid="wxm-profile-industry">{INDUSTRIES.map((i) => <option key={i} value={i}>{i || "—"}</option>)}</select></Field>
        <Field label="Country"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="wxm-profile-country">{COUNTRIES.map((i) => <option key={i} value={i}>{i || "—"}</option>)}</select></Field>
        <Field label="Audience"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} data-testid="wxm-profile-audience">{AUDIENCES.map((i) => <option key={i} value={i}>{i || "—"}</option>)}</select></Field>
      </div>
      <Field label="Description (admin-only)"><textarea rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Theme"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.theme_id} onChange={(e) => setForm({ ...form, theme_id: e.target.value })} data-testid="wxm-profile-theme"><option value="">— none —</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Hero"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.hero_id} onChange={(e) => setForm({ ...form, hero_id: e.target.value })} data-testid="wxm-profile-hero"><option value="">— none —</option>{heroes.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
        <Field label="Primary CTA"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.primary_cta_id} onChange={(e) => setForm({ ...form, primary_cta_id: e.target.value })} data-testid="wxm-profile-cta1"><option value="">— none —</option>{ctas.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.label}</option>)}</select></Field>
        <Field label="Secondary CTA"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.secondary_cta_id} onChange={(e) => setForm({ ...form, secondary_cta_id: e.target.value })}><option value="">— none —</option>{ctas.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.label}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Priority (higher wins)"><input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 0 })}/></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} data-testid="wxm-profile-published"/> Published</label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} data-testid="wxm-profile-default"/> Default fallback</label>
      </div>
      <ModalActions onClose={onClose} onSave={save} busy={busy} saveTestId="wxm-profile-save"/>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Themes
// ──────────────────────────────────────────────────────────────────────
function ThemesPanel({ rows, refresh }) {
  const [modal, setModal] = useState(null);
  const [activating, setActivating] = useState("");
  const remove = async (id) => {
    if (!window.confirm("Delete this theme?")) return;
    try { await api.delete(`/wxm/themes/${id}`); toast.success("Theme deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const activate = async (id, name) => {
    setActivating(id);
    try {
      await api.post(`/wxm/themes/${id}/activate`);
      const { invalidateActiveTheme } = await import("@/hooks/useActiveTheme");
      invalidateActiveTheme();
      toast.success(`"${name}" is now live on the public site.`);
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
    setActivating("");
  };
  const activeRow = rows.find((r) => r.is_site_active);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-600">
          Click <b>Apply to site</b> on any theme to instantly re-skin the public marketing site.
          {activeRow && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200" data-testid="wxm-active-theme-label"><Check size={10}/> Live: {activeRow.name}</span>}
        </div>
        <button onClick={() => setModal({ mode: "create" })} data-testid="wxm-new-theme" className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]"><Plus size={12}/> New theme</button>
      </div>
      {rows.length === 0 ? <EmptyHint title="No themes yet" hint="Themes are colour + font + shape presets that can be reused across experience profiles."/> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <motion.div key={t.id} layout className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition ${t.is_site_active ? "border-emerald-400 ring-2 ring-emerald-200" : "border-slate-200"}`} data-testid={`wxm-theme-card-${t.id}`}>
              <div className="relative flex h-24 items-center justify-center text-white" style={{ background: `linear-gradient(135deg, ${t.primary_color} 0%, ${t.secondary_color} 100%)` }}>
                <span className="rounded-full bg-white/25 px-3 py-1 text-xs font-bold backdrop-blur-sm" style={{ fontFamily: t.font_heading }}>{t.font_heading}</span>
                {t.is_site_active && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow ring-2 ring-white/40" data-testid={`wxm-active-badge-${t.id}`}>
                    <Check size={10}/> Active
                  </span>
                )}
                {t._preset && !t.is_site_active && (
                  <span className="absolute right-2 top-2 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 shadow">Preset</span>
                )}
              </div>
              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-base font-bold text-[#0F2042]">{t.name}</div>
                  <div className="flex gap-1">
                    <Swatch color={t.primary_color}/>
                    <Swatch color={t.secondary_color}/>
                    <Swatch color={t.accent_color}/>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <Chip color="slate">{t.hero_style} hero</Chip>
                  <Chip color="slate">{t.cta_style} cta</Chip>
                  <Chip color="slate">radius {t.radius}px</Chip>
                </div>
                <button
                  onClick={() => activate(t.id, t.name)}
                  disabled={activating === t.id || t.is_site_active}
                  data-testid={`wxm-apply-theme-${t.id}`}
                  className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed ${t.is_site_active ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300" : "bg-[#F97316] text-white hover:bg-[#ea6a0a] disabled:opacity-50"}`}>
                  {activating === t.id ? <Loader2 size={12} className="animate-spin"/> : t.is_site_active ? <Check size={12}/> : <Globe2 size={12}/>}
                  {t.is_site_active ? "Live on site" : "Apply to site"}
                </button>
              </div>
              <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => setModal({ mode: "edit", row: t })} className="rounded-lg bg-white/90 p-1.5 text-slate-600 backdrop-blur hover:text-[#0F2042]" data-testid={`wxm-theme-edit-${t.id}`}><Pencil size={14}/></button>
                <button onClick={() => remove(t.id)} className="rounded-lg bg-white/90 p-1.5 text-rose-500 backdrop-blur hover:bg-rose-50" data-testid={`wxm-theme-delete-${t.id}`}><Trash2 size={14}/></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {modal && <ThemeModal mode={modal.mode} row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }}/>}
    </div>
  );
}

function ThemeModal({ mode, row, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: row?.name || "", primary_color: row?.primary_color || "#F97316", secondary_color: row?.secondary_color || "#0F2042",
    accent_color: row?.accent_color || "#10B981", surface_color: row?.surface_color || "#FFFFFF", text_color: row?.text_color || "#0F2042",
    font_heading: row?.font_heading || "Manrope", font_body: row?.font_body || "Inter", radius: row?.radius || 16,
    hero_style: row?.hero_style || "split", cta_style: row?.cta_style || "rounded",
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setBusy(true);
    try {
      if (mode === "create") await api.post("/wxm/themes", form);
      else await api.patch(`/wxm/themes/${row.id}`, form);
      toast.success(mode === "create" ? "Theme created" : "Theme updated");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title={mode === "create" ? "New theme" : `Edit · ${row?.name}`} testid="wxm-theme-modal">
      <Field label="Name"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Sunset Fintech" data-testid="wxm-theme-name"/></Field>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {["primary_color", "secondary_color", "accent_color", "surface_color", "text_color"].map((k) => (
          <Field key={k} label={k.replace("_color", "").replace(/^./, (c) => c.toUpperCase()) + " colour"}>
            <div className="flex items-center gap-2">
              <input type="color" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="h-9 w-9 cursor-pointer rounded border border-slate-300"/>
              <input type="text" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"/>
            </div>
          </Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field label="Heading font"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.font_heading} onChange={(e) => setForm({ ...form, font_heading: e.target.value })}/></Field>
        <Field label="Body font"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.font_body} onChange={(e) => setForm({ ...form, font_body: e.target.value })}/></Field>
        <Field label="Radius (px)"><input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.radius} onChange={(e) => setForm({ ...form, radius: Number(e.target.value) || 0 })}/></Field>
        <Field label="Hero style"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.hero_style} onChange={(e) => setForm({ ...form, hero_style: e.target.value })}>{HERO_STYLES.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <Field label="CTA style"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.cta_style} onChange={(e) => setForm({ ...form, cta_style: e.target.value })}>{CTA_STYLES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} busy={busy} saveTestId="wxm-theme-save"/>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Heroes
// ──────────────────────────────────────────────────────────────────────
function HeroesPanel({ rows, ctas, refresh }) {
  const [modal, setModal] = useState(null);
  const remove = async (id) => {
    if (!window.confirm("Delete this hero?")) return;
    try { await api.delete(`/wxm/heroes/${id}`); toast.success("Hero deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">Headline + sub-head + background asset combinations that appear in the public hero section.</div>
        <button onClick={() => setModal({ mode: "create" })} data-testid="wxm-new-hero" className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]"><Plus size={12}/> New hero</button>
      </div>
      {rows.length === 0 ? <EmptyHint title="No heroes yet" hint="Each hero is a headline + sub-headline + (optional) background image / video + badge eyebrow."/> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((h) => (
            <motion.div key={h.id} layout className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`wxm-hero-card-${h.id}`}>
              {h.background_image && <img src={h.background_image} alt="" className="h-32 w-full object-cover"/>}
              <div className="space-y-2 p-4">
                {h.badge_text && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 ring-1 ring-amber-200">{h.badge_text}</span>}
                <div className="text-base font-bold text-[#0F2042]">{h.headline}</div>
                {h.subheadline && <div className="text-sm text-slate-600">{h.subheadline}</div>}
                <div className="text-[11px] text-slate-400">{h.name}</div>
              </div>
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => setModal({ mode: "edit", row: h })} className="rounded-lg bg-white/90 p-1.5 text-slate-600 backdrop-blur hover:text-[#0F2042]"><Pencil size={14}/></button>
                <button onClick={() => remove(h.id)} className="rounded-lg bg-white/90 p-1.5 text-rose-500 backdrop-blur hover:bg-rose-50"><Trash2 size={14}/></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {modal && <HeroModal mode={modal.mode} row={modal.row} ctas={ctas} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }}/>}
    </div>
  );
}

function HeroModal({ mode, row, ctas, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: row?.name || "", headline: row?.headline || "", subheadline: row?.subheadline || "",
    background_image: row?.background_image || "", background_video: row?.background_video || "",
    primary_cta_id: row?.primary_cta_id || "", secondary_cta_id: row?.secondary_cta_id || "",
    badge_text: row?.badge_text || "",
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim() || !form.headline.trim()) { toast.error("Name and headline are required"); return; }
    setBusy(true);
    try {
      if (mode === "create") await api.post("/wxm/heroes", form);
      else await api.patch(`/wxm/heroes/${row.id}`, form);
      toast.success(mode === "create" ? "Hero created" : "Hero updated");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title={mode === "create" ? "New hero" : `Edit · ${row?.name}`} testid="wxm-hero-modal">
      <Field label="Internal name"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Fintech-Hero-v1" data-testid="wxm-hero-name"/></Field>
      <Field label="Badge / eyebrow text (optional)"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.badge_text} onChange={(e) => setForm({ ...form, badge_text: e.target.value })} placeholder="Now serving Fintech teams"/></Field>
      <Field label="Headline"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-bold" value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Ship your fintech 3× faster" data-testid="wxm-hero-headline"/></Field>
      <Field label="Sub-headline"><textarea rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.subheadline} onChange={(e) => setForm({ ...form, subheadline: e.target.value })}/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Background image URL"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono" value={form.background_image} onChange={(e) => setForm({ ...form, background_image: e.target.value })} placeholder="https://…"/></Field>
        <Field label="Background video URL"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono" value={form.background_video} onChange={(e) => setForm({ ...form, background_video: e.target.value })} placeholder="https://…mp4"/></Field>
        <Field label="Primary CTA"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.primary_cta_id} onChange={(e) => setForm({ ...form, primary_cta_id: e.target.value })}><option value="">— none —</option>{ctas.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Secondary CTA"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.secondary_cta_id} onChange={(e) => setForm({ ...form, secondary_cta_id: e.target.value })}><option value="">— none —</option>{ctas.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
      </div>
      <ModalActions onClose={onClose} onSave={save} busy={busy} saveTestId="wxm-hero-save"/>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CTAs
// ──────────────────────────────────────────────────────────────────────
function CtasPanel({ rows, refresh }) {
  const [modal, setModal] = useState(null);
  const remove = async (id) => {
    if (!window.confirm("Delete this CTA?")) return;
    try { await api.delete(`/wxm/ctas/${id}`); toast.success("CTA deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">Reusable button labels and intents. Attach to heroes or profiles.</div>
        <button onClick={() => setModal({ mode: "create" })} data-testid="wxm-new-cta" className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]"><Plus size={12}/> New CTA</button>
      </div>
      {rows.length === 0 ? <EmptyHint title="No CTAs yet" hint="Define reusable call-to-actions like 'Book a demo' → /contact (intent: lead)."/> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <motion.div key={c.id} layout className="group relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`wxm-cta-card-${c.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-bold text-[#0F2042]">{c.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-slate-400">{c.url}</div>
                </div>
                <Chip color="violet">{c.intent}</Chip>
              </div>
              <div className="mt-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-4 py-1.5 text-sm font-bold text-white shadow">{c.label} {c.open_in_new_tab && <ExternalLink size={12}/>}</span>
              </div>
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => setModal({ mode: "edit", row: c })} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0F2042]"><Pencil size={14}/></button>
                <button onClick={() => remove(c.id)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {modal && <CtaModal mode={modal.mode} row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }}/>}
    </div>
  );
}

function CtaModal({ mode, row, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: row?.name || "", label: row?.label || "", url: row?.url || "/contact",
    intent: row?.intent || "lead", icon: row?.icon || "", open_in_new_tab: row?.open_in_new_tab ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim() || !form.label.trim()) { toast.error("Name and label are required"); return; }
    setBusy(true);
    try {
      if (mode === "create") await api.post("/wxm/ctas", form);
      else await api.patch(`/wxm/ctas/${row.id}`, form);
      toast.success(mode === "create" ? "CTA created" : "CTA updated");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal onClose={onClose} title={mode === "create" ? "New CTA" : `Edit · ${row?.name}`} testid="wxm-cta-modal">
      <Field label="Internal name"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Book a demo" data-testid="wxm-cta-name"/></Field>
      <Field label="Button label (visible to visitors)"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Book a demo →" data-testid="wxm-cta-label"/></Field>
      <Field label="URL"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="/contact"/></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Intent"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.intent} onChange={(e) => setForm({ ...form, intent: e.target.value })}>{INTENTS.map((i) => <option key={i}>{i}</option>)}</select></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={form.open_in_new_tab} onChange={(e) => setForm({ ...form, open_in_new_tab: e.target.checked })}/> Open in new tab</label>
      </div>
      <ModalActions onClose={onClose} onSave={save} busy={busy} saveTestId="wxm-cta-save"/>
    </Modal>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Analytics + Preview-As
// ──────────────────────────────────────────────────────────────────────
function AnalyticsPanel({ profiles }) {
  const [analytics, setAnalytics] = useState(null);
  const [days, setDays] = useState(14);
  const [previewId, setPreviewId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async (d) => {
    setLoading(true);
    try { const { data } = await api.get("/wxm/analytics", { params: { days: d } }); setAnalytics(data); }
    catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(days); }, [days]);

  const profileBySlug = useMemo(() => Object.fromEntries(profiles.map((p) => [p.slug, p])), [profiles]);
  const maxHits = Math.max(1, ...(analytics?.rows || []).map((r) => r.hits));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#0F2042]">Detection hits — last {days} days</h3>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-1 text-xs" data-testid="wxm-analytics-days">
            {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 size={24} className="animate-spin text-[#F97316]"/></div>
        ) : !analytics?.rows?.length ? (
          <EmptyHint title="No traffic recorded yet" hint="Publish a profile and traffic to the public site will start populating this report."/>
        ) : (
          <div className="space-y-2" data-testid="wxm-analytics-rows">
            {analytics.rows.map((r) => {
              const p = profileBySlug[r.profile_slug];
              return (
                <div key={r.profile_slug} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <div className="font-bold text-[#0F2042]">{p?.name || r.profile_slug}</div>
                    <div className="text-slate-500">{r.hits} hits · {r.country_count} countries</div>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-amber-400" style={{ width: `${(r.hits / maxHits) * 100}%` }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 to-rose-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-700"><Eye size={14}/> Preview as a visitor</div>
          <div className="mt-2 text-sm text-slate-600">Force-render a profile on the public site without changing what other visitors see.</div>
          <select className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={previewId} onChange={(e) => setPreviewId(e.target.value)} data-testid="wxm-preview-select">
            <option value="">Pick a profile…</option>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name} {p.is_default ? "★" : ""}</option>)}
          </select>
          <button disabled={!previewId} onClick={() => window.open(`/?preview_profile_id=${previewId}`, "_blank")} data-testid="wxm-preview-launch"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#0F2042] px-4 py-2 text-xs font-bold text-white disabled:opacity-40 hover:bg-[#162a55]">
            <ExternalLink size={12}/> Open public site
          </button>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"><Globe2 size={14}/> Detection endpoint</div>
          <div className="mt-2 break-all rounded-lg bg-slate-50 p-2 font-mono text-[11px] text-slate-700">GET /api/public/wxm/detect?country=US&amp;industry=fintech</div>
          <div className="mt-2 text-xs text-slate-500">Call this from the public site or any front-end to fetch the active experience for the visitor.</div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, testid }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" data-testid={testid}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-lg font-bold text-[#0F2042]">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" data-testid="wxm-modal-close"><X size={18}/></button>
        </div>
        <div className="space-y-3 pt-4">{children}</div>
      </motion.div>
    </div>
  );
}

function ModalActions({ onClose, onSave, busy, saveTestId }) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
      <button onClick={onClose} className="rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
      <button onClick={onSave} disabled={busy} data-testid={saveTestId} className="flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#ea6a0a] disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin"/> : null} Save
      </button>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }) {
  return <div className="flex items-center gap-2"><span className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span><span className="flex-1 truncate">{value}</span></div>;
}

function Swatch({ color }) {
  return <span className="inline-block h-4 w-4 rounded-full ring-1 ring-slate-200" style={{ background: color }} title={color}/>;
}

function Chip({ color, children }) {
  const palette = {
    sky: "bg-sky-50 text-sky-700 ring-sky-200",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    violet: "bg-violet-50 text-violet-700 ring-violet-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
  }[color] || "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${palette}`}>{children}</span>;
}

function EmptyHint({ title, hint }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500"><Sparkles size={20}/></div>
      <div className="text-base font-bold text-[#0F2042]">{title}</div>
      <div className="mt-1 text-sm text-slate-500">{hint}</div>
    </div>
  );
}


// ──────────────────────────────────────────────────────────────────────
// Pages — real visitable pages at /page/:slug, with AI assistance + SEO
// ──────────────────────────────────────────────────────────────────────
function PagesPanel({ rows, themes, refresh }) {
  const [editing, setEditing] = useState(null);

  const remove = async (id) => {
    if (!window.confirm("Delete this page? Visitors hitting the URL will see a 404.")) return;
    try { await api.delete(`/wxm/pages/${id}`); toast.success("Page deleted"); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const copyUrl = (slug) => {
    const url = `${window.location.origin}/page/${slug}`;
    navigator.clipboard.writeText(url);
    toast.success(`Copied · ${url}`);
  };

  return (
    <div className="space-y-3" data-testid="wxm-pages-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-600">
          Pages are real, publicly-visitable URLs at <span className="font-mono text-[#F97316]">/page/{"<slug>"}</span>. The renderer is SEO-friendly and auto-applies a theme.
        </div>
        <button onClick={() => setEditing({ _isNew: true })} data-testid="wxm-new-page"
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-4 py-1.5 text-xs font-bold text-white shadow hover:opacity-90">
          <Plus size={12}/> New page
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyHint title="No pages yet" hint="Click 'New page' and let the AI draft a fully SEO-optimised landing page for any topic in 8 seconds."/>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const published = p.status === "published";
            const url = `/page/${p.slug}`;
            return (
              <motion.div key={p.id} layout className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md" data-testid={`wxm-page-card-${p.slug}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {p.ai_generated && <Sparkles size={12} className="text-violet-500" title="AI generated"/>}
                      <span className="truncate text-base font-bold text-[#0F2042]">{p.title}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400 truncate">/page/{p.slug}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${published ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-500 ring-slate-200"}`}>
                    {published ? "Live" : "Draft"}
                  </span>
                </div>
                {p.meta_description && (
                  <p className="mt-2 line-clamp-2 text-[11px] text-slate-500">{p.meta_description}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                  {(p.meta_keywords || []).slice(0, 4).map((kw, i) => (
                    <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{kw}</span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between gap-1 border-t border-slate-100 pt-3">
                  <div className="text-[10px] text-slate-400">
                    {p.published_at ? `Live · ${new Date(p.published_at).toLocaleDateString()}` : `Updated · ${new Date(p.updated_at).toLocaleDateString()}`}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button onClick={() => copyUrl(p.slug)} title="Copy URL" data-testid={`wxm-page-copy-${p.slug}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0F2042]"><Copy size={13}/></button>
                    {published && (
                      <a href={url} target="_blank" rel="noreferrer" title="Open live page" data-testid={`wxm-page-open-${p.slug}`}
                        className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"><ExternalLink size={13}/></a>
                    )}
                    <button onClick={() => setEditing(p)} title="Edit" data-testid={`wxm-page-edit-${p.slug}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0F2042]"><Pencil size={13}/></button>
                    <button onClick={() => remove(p.id)} title="Delete" data-testid={`wxm-page-delete-${p.slug}`}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={13}/></button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editing && (
          <PageEditor
            page={editing._isNew ? null : editing}
            themes={themes}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); refresh(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const EMPTY_PAGE = {
  title: "", slug: "", meta_description: "", meta_keywords: [],
  hero_eyebrow: "", hero_headline: "", hero_subhead: "", hero_image_url: "",
  cta_label: "", cta_url: "", theme_id: "", sections: [],
};

function PageEditor({ page, themes, onClose, onSaved }) {
  const isNew = !page;
  const [form, setForm] = useState(page ? { ...page, meta_keywords: page.meta_keywords || [] } : EMPTY_PAGE);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState({ topic: "", audience: "engineering decision-makers", tone: "confident · concise · technical", primary_keyword: "" });
  const [showPreview, setShowPreview] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setKeyword = (v) =>
    setField("meta_keywords", v.split(",").map((x) => x.trim()).filter(Boolean));

  const aiDraft = async () => {
    if (!aiPrompt.topic.trim()) return toast.error("Add a topic — e.g. 'AI staff augmentation for fintech'");
    setAiBusy(true);
    let toastId;
    try {
      toastId = toast.loading("AI is drafting your page… (≈ 8s)");
      const { data } = await api.post("/wxm/pages/ai-draft", aiPrompt, { timeout: 60000 });
      if (!data || !data.title) throw new Error("Empty AI response");
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        // Prefer AI slug for a brand-new (no-id) page; keep existing slug on re-draft.
        slug: f.id ? (f.slug || data.slug || "") : (data.slug || f.slug || ""),
        meta_description: data.meta_description || f.meta_description,
        meta_keywords: data.meta_keywords?.length ? data.meta_keywords : f.meta_keywords,
        hero_eyebrow: data.hero_eyebrow || f.hero_eyebrow,
        hero_headline: data.hero_headline || f.hero_headline,
        hero_subhead: data.hero_subhead || f.hero_subhead,
        cta_label: data.cta_label || f.cta_label,
        sections: (data.sections && data.sections.length) ? data.sections : f.sections,
        ai_generated: true,
      }));
      toast.success("AI drafted — review and tweak", { id: toastId });
    } catch (e) {
      toast.error(formatApiError(e) || "AI drafting failed — please retry", { id: toastId });
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return null; }
    setBusy(true);
    try {
      if (isNew && !form.id) {
        const { data } = await api.post("/wxm/pages", form);
        toast.success("Page saved as draft");
        setForm(data);
        return data;
      }
      const id = form.id;
      const { data } = await api.patch(`/wxm/pages/${id}`, form);
      setForm(data);
      toast.success("Page updated");
      return data;
    } catch (e) { toast.error(formatApiError(e)); return null; }
    finally { setBusy(false); }
  };

  const publish = async () => {
    const saved = await save();
    if (!saved?.id) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/wxm/pages/${saved.id}/publish`);
      setForm(data);
      toast.success("Published — your page is now live");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const unpublish = async () => {
    if (!form.id) return;
    if (!window.confirm("Take this page offline?")) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/wxm/pages/${form.id}/unpublish`);
      setForm(data);
      toast.success("Page unpublished");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const livePath = form.slug ? `/page/${form.slug}` : "";
  const published = form.status === "published";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="wxm-page-editor"
      className="fixed inset-0 z-[70] flex items-stretch justify-end bg-slate-950/60 backdrop-blur-sm"
      onClick={onClose}>
      <motion.div initial={{ x: 80 }} animate={{ x: 0 }} exit={{ x: 80 }} transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-3xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#F97316]"><FileText size={10} className="inline mr-1"/> {isNew && !form.id ? "Create page" : "Edit page"}</div>
            <h3 className="font-display truncate text-lg font-bold text-[#0F2042]">{form.title || "Untitled page"}</h3>
            {livePath && (
              <a href={livePath} target="_blank" rel="noreferrer" className="text-[11px] text-slate-500 hover:text-[#F97316]">
                {window.location.origin}{livePath} {published && <ExternalLink size={9} className="inline ml-0.5"/>}
              </a>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" data-testid="wxm-page-editor-close"><X size={18}/></button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <button onClick={() => setShowPreview(true)} disabled={!form.title} data-testid="wxm-page-preview"
            className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-40">
            <Eye size={11}/> Preview & Save
          </button>
          <button onClick={save} disabled={busy} data-testid="wxm-page-save"
            className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin"/> : <Save size={11}/>} Save draft
          </button>
          {published ? (
            <button onClick={unpublish} disabled={busy} data-testid="wxm-page-unpublish"
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 disabled:opacity-50">
              Unpublish
            </button>
          ) : (
            <button onClick={publish} disabled={busy} data-testid="wxm-page-publish"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white shadow hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} Publish
            </button>
          )}
          {form.id && form.slug && (
            <a href={livePath} target="_blank" rel="noreferrer" data-testid="wxm-page-open-url"
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-200">
              <ExternalLink size={11}/> Open URL
            </a>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-orange-50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-violet-700">
                <Sparkles size={12}/> AI assistant · drafts SEO-optimised content
              </div>
              {form.ai_generated && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">AI generated</span>}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input value={aiPrompt.topic} onChange={(e) => setAiPrompt({ ...aiPrompt, topic: e.target.value })}
                placeholder="Topic — e.g. 'AI staff augmentation for fintech'" data-testid="wxm-ai-topic"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
              <input value={aiPrompt.primary_keyword} onChange={(e) => setAiPrompt({ ...aiPrompt, primary_keyword: e.target.value })}
                placeholder="Primary keyword (optional)" data-testid="wxm-ai-keyword"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
              <input value={aiPrompt.audience} onChange={(e) => setAiPrompt({ ...aiPrompt, audience: e.target.value })}
                placeholder="Audience" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
              <input value={aiPrompt.tone} onChange={(e) => setAiPrompt({ ...aiPrompt, tone: e.target.value })}
                placeholder="Tone" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
            </div>
            <button onClick={aiDraft} disabled={aiBusy} data-testid="wxm-ai-draft"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
              {aiBusy ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
              {aiBusy ? "Drafting…" : "Draft with AI"}
            </button>
            <div className="mt-2 text-[10px] text-slate-500">Fills title, meta description, hero, features, FAQ — all production-ready and SEO-tuned.</div>
          </div>

          <PageSection heading="SEO & identity">
            <PageField label="Title *">
              <input value={form.title} onChange={(e) => setField("title", e.target.value)} data-testid="wxm-page-title" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
            </PageField>
            <PageField label="URL slug" hint={form.slug ? `Live at /page/${form.slug}` : "Auto-derived from title"}>
              <input value={form.slug} onChange={(e) => setField("slug", e.target.value)} data-testid="wxm-page-slug" placeholder="auto" className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"/>
            </PageField>
            <PageField label="Meta description" hint={`${(form.meta_description || "").length}/280 — aim 150–160 for best SEO`}>
              <textarea rows={2} value={form.meta_description} onChange={(e) => setField("meta_description", e.target.value)} data-testid="wxm-page-meta-desc" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
            </PageField>
            <PageField label="Meta keywords (comma-separated)">
              <input value={(form.meta_keywords || []).join(", ")} onChange={(e) => setKeyword(e.target.value)} data-testid="wxm-page-keywords" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/>
            </PageField>
          </PageSection>

          <PageSection heading="Hero">
            <PageField label="Eyebrow"><input value={form.hero_eyebrow} onChange={(e) => setField("hero_eyebrow", e.target.value)} data-testid="wxm-page-eyebrow" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
            <PageField label="Headline"><input value={form.hero_headline} onChange={(e) => setField("hero_headline", e.target.value)} data-testid="wxm-page-headline" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
            <PageField label="Subhead"><textarea rows={2} value={form.hero_subhead} onChange={(e) => setField("hero_subhead", e.target.value)} data-testid="wxm-page-subhead" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
            <PageField label="Hero image URL (optional)"><input value={form.hero_image_url} onChange={(e) => setField("hero_image_url", e.target.value)} placeholder="https://…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
            <div className="grid gap-3 sm:grid-cols-2">
              <PageField label="CTA label"><input value={form.cta_label} onChange={(e) => setField("cta_label", e.target.value)} data-testid="wxm-page-cta-label" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
              <PageField label="CTA URL"><input value={form.cta_url} onChange={(e) => setField("cta_url", e.target.value)} placeholder="/contact" data-testid="wxm-page-cta-url" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></PageField>
            </div>
            <PageField label="Theme">
              <select value={form.theme_id || ""} onChange={(e) => setField("theme_id", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— Default Projexino —</option>
                {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </PageField>
          </PageSection>

          <PageSection heading="Content sections" subline="The AI drafts these for you. Click 'Draft with AI' above.">
            {(form.sections || []).length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-500">
                No sections yet — click <b>Draft with AI</b> above.
              </div>
            ) : (
              <ul className="space-y-2">
                {(form.sections || []).map((s, i) => (
                  <li key={i} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">{s.type}</span>
                      <button onClick={() => setField("sections", form.sections.filter((_, idx) => idx !== i))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={12}/></button>
                    </div>
                    {s.heading && <div className="mt-1 font-bold text-[#0F2042]">{s.heading}</div>}
                    {s.body && <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">{s.body}</p>}
                    {s.items && <div className="mt-1 text-[10px] text-slate-500">{s.items.length} item(s)</div>}
                    {s.steps && <div className="mt-1 text-[10px] text-slate-500">{s.steps.length} step(s)</div>}
                  </li>
                ))}
              </ul>
            )}
          </PageSection>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPreview && (
          <PagePreviewModal form={form} onClose={() => setShowPreview(false)} onSave={async () => { await save(); setShowPreview(false); }}/>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PageSection({ heading, subline, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{heading}</div>
      {subline && <div className="text-[11px] text-slate-500">{subline}</div>}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}
function PageField({ label, hint, children }) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function PagePreviewModal({ form, onClose, onSave }) {
  const livePath = form.slug ? `/page/${form.slug}` : "";
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="wxm-page-preview-modal"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 p-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500"><BookOpenCheck size={10} className="inline mr-1"/> Preview · {form.title || "Untitled"}</div>
            <div className="text-[11px] text-slate-400 font-mono">{livePath || "(slug auto-derived on save)"}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={onSave} data-testid="wxm-page-preview-save" className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800">
              <Save size={11}/> Save & keep editing
            </button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
          </div>
        </div>
        <iframe title="page-preview" srcDoc={renderPreviewHtml(form)} sandbox="allow-same-origin"
          className="flex-1 w-full bg-white"/>
      </motion.div>
    </motion.div>
  );
}

function renderPreviewHtml(form) {
  const primary = "#F97316", accent = "#A855F7", bg = "#0F2042";
  const escape = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
  const sectionsHtml = (form.sections || []).map((s) => {
    if (s.type === "intro" || s.type === "proof") {
      return `<section style="margin:80px auto;max-width:880px;padding:0 24px">
        ${s.heading ? `<h2 style="font-size:34px;font-weight:700;color:${bg};margin:0 0 16px">${escape(s.heading)}</h2>` : ""}
        ${s.body ? `<p style="font-size:18px;line-height:1.65;color:#334155;max-width:720px">${escape(s.body)}</p>` : ""}
      </section>`;
    }
    if (s.type === "features") {
      const items = (s.items || []).map((it, i) => `
        <div style="border:1px solid #E2E8F0;border-radius:18px;padding:24px;background:#fff">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:#fff;font-weight:700;background:linear-gradient(135deg,${primary},${accent})">${i + 1}</div>
          <h3 style="margin:16px 0 6px;color:${bg};font-size:18px;font-weight:700">${escape(it.title)}</h3>
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${escape(it.description)}</p>
        </div>`).join("");
      return `<section style="margin:80px auto;max-width:1040px;padding:0 24px">
        ${s.heading ? `<h2 style="font-size:34px;font-weight:700;color:${bg};margin:0 0 28px">${escape(s.heading)}</h2>` : ""}
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px">${items}</div>
      </section>`;
    }
    if (s.type === "process") {
      const steps = (s.steps || []).map((st, i) => `
        <div style="border:1px solid #E2E8F0;background:linear-gradient(135deg,#FFF7ED,#F5F3FF);border-radius:18px;padding:24px">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${primary}">Step ${i + 1}</div>
          <h3 style="margin:8px 0 6px;color:${bg};font-size:18px;font-weight:700">${escape(st.title)}</h3>
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.6">${escape(st.description)}</p>
        </div>`).join("");
      return `<section style="margin:80px auto;max-width:1040px;padding:0 24px">
        ${s.heading ? `<h2 style="font-size:34px;font-weight:700;color:${bg};margin:0 0 28px">${escape(s.heading)}</h2>` : ""}
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px">${steps}</div>
      </section>`;
    }
    if (s.type === "faq") {
      const faq = (s.items || []).map((q) => `
        <details style="border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;background:#fff;margin-bottom:8px">
          <summary style="cursor:pointer;font-weight:600;color:${bg};font-size:16px">${escape(q.q)}</summary>
          <p style="margin:10px 0 0;color:#475569;font-size:14px;line-height:1.6">${escape(q.a)}</p>
        </details>`).join("");
      return `<section style="margin:80px auto;max-width:880px;padding:0 24px">
        ${s.heading ? `<h2 style="font-size:34px;font-weight:700;color:${bg};margin:0 0 20px">${escape(s.heading)}</h2>` : ""}
        ${faq}
      </section>`;
    }
    return "";
  }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escape(form.title || "Preview")}</title>
<style>body{margin:0;font-family:Inter,Arial,sans-serif;color:#0f172a}</style></head><body>
<header style="background:linear-gradient(140deg,${bg} 0%,#0a1530 80%);color:#fff;padding:100px 24px 80px">
  <div style="max-width:1040px;margin:0 auto">
    ${form.hero_eyebrow ? `<div style="display:inline-block;padding:6px 14px;border-radius:999px;background:rgba(255,255,255,0.1);color:${primary};font-size:11px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase">${escape(form.hero_eyebrow)}</div>` : ""}
    <h1 style="margin:18px 0 12px;font-size:56px;font-weight:700;line-height:1.08;max-width:760px">${escape(form.hero_headline || form.title || "Untitled page")}</h1>
    ${form.hero_subhead ? `<p style="font-size:18px;line-height:1.6;color:#cbd5e1;max-width:680px">${escape(form.hero_subhead)}</p>` : ""}
    ${form.cta_label ? `<a href="${escape(form.cta_url || "#")}" style="display:inline-block;margin-top:28px;padding:14px 30px;border-radius:999px;background:linear-gradient(135deg,${primary},${accent});color:#fff;font-weight:700;text-decoration:none">${escape(form.cta_label)} →</a>` : ""}
  </div>
</header>
${sectionsHtml}
${form.cta_label ? `<section style="background:#F8FAFC;border-top:1px solid #E2E8F0;padding:64px 24px;text-align:center">
  <h3 style="font-size:32px;font-weight:700;color:${bg};margin:0">Ready when you are.</h3>
  <p style="color:#475569;margin:10px 0 20px">${escape(form.hero_subhead || "Talk to the team.")}</p>
  <a href="${escape(form.cta_url || "#")}" style="display:inline-block;padding:14px 30px;border-radius:999px;background:linear-gradient(135deg,${primary},${accent});color:#fff;font-weight:700;text-decoration:none">${escape(form.cta_label)} →</a>
</section>` : ""}
<footer style="padding:24px;text-align:center;color:#94a3b8;font-size:11px">© ${new Date().getFullYear()} Projexino</footer>
</body></html>`;
}
