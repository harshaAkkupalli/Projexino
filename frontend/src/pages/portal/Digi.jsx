/**
 * Digi.jsx — AI-powered Digital Marketing Operating System (Phase-1 MVP)
 *
 * Sub-modules (left rail nav):
 *   • Overview        — dashboard rollup
 *   • Clients         — onboard + manage brand clients
 *   • Brand Kit       — per-client palette / fonts / logo / voice
 *   • Strategy AI     — generate marketing/content/SEO/ad plans
 *   • Content AI      — captions, hashtags, blog, ad copy, video scripts
 *   • Creative AI     — branded poster/carousel/banner/story SVGs
 *   • Calendar        — month view with planned / scheduled / published
 *   • Approvals       — review queue (executive → client)
 *   • Performance     — manual metrics + ROI rollup
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Building2, Palette, Brain, FileText, ImageIcon,
  CalendarDays, CheckCircle2, BarChart3, Plus, Loader2, X,
  Globe2, Users, Mail, Phone, Link as LinkIcon, ChevronRight, Trash2, Edit3,
  LayoutTemplate, PenLine, Check, Download,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import TemplateStudioPanel, { downloadSvgAsPng } from "./DigiTemplateStudio";

const NAV = [
  { v: "overview",   label: "Overview",   icon: BarChart3 },
  { v: "clients",    label: "Clients",    icon: Building2 },
  { v: "brand",      label: "Brand Kit",  icon: Palette },
  { v: "strategy",   label: "AI Strategy", icon: Brain },
  { v: "content",    label: "Content AI", icon: FileText },
  { v: "creative",   label: "Creative AI", icon: ImageIcon },
  { v: "studio",     label: "Template Studio", icon: LayoutTemplate },
  { v: "calendar",   label: "Calendar",   icon: CalendarDays },
  { v: "approvals",  label: "Approvals",  icon: CheckCircle2 },
  { v: "performance", label: "Performance", icon: BarChart3 },
];

export default function Digi() {
  const [tab, setTab] = useState("overview");
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");

  const refreshClients = async () => {
    try { const { data } = await api.get("/digi/clients"); setClients(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { refreshClients(); }, []);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  return (
    <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-[220px,1fr]" data-testid="digi-root">
      {/* Mobile top bar — visible only < md */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:hidden">
        <div className="flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700">
          <Sparkles size={11}/> Digi · Marketing OS
        </div>
        <button onClick={() => setMobileNavOpen((v) => !v)} data-testid="digi-mobile-nav-toggle"
          className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700">
          {NAV.find((n) => n.v === tab)?.label || "Menu"} ↓
        </button>
      </div>
      {mobileNavOpen && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:hidden">
          {NAV.map((n) => (
            <button key={n.v} onClick={() => { setTab(n.v); setMobileNavOpen(false); }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-left text-xs font-bold ${tab === n.v ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" : "text-slate-600"}`}>
              <n.icon size={12}/> {n.label}
            </button>
          ))}
        </div>
      )}

      {/* Left rail — desktop only */}
      <aside className="hidden space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm md:block">
        <div className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700">
            <Sparkles size={11}/> Digi · Marketing OS
          </div>
          <div className="mt-0.5 text-[10px] text-slate-500">Phase 1 MVP</div>
        </div>
        {NAV.map((n) => (
          <button key={n.v} onClick={() => setTab(n.v)} data-testid={`digi-nav-${n.v}`}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition ${tab === n.v ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}>
            <n.icon size={13}/> {n.label}
          </button>
        ))}
      </aside>

      {/* Right pane */}
      <main className="overflow-y-auto">
        {tab === "overview"    && <Overview clients={clients}/>}
        {tab === "clients"     && <ClientsPanel rows={clients} refresh={refreshClients} onSelect={(id) => { setSelectedClientId(id); setTab("brand"); }}/>}
        {tab === "brand"       && <BrandKitPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
        {tab === "strategy"    && <StrategyPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} refresh={refreshClients}/>}
        {tab === "content"     && <ContentPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
        {tab === "creative"    && <CreativePanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
        {tab === "studio"      && <TemplateStudioPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId} Hero={Hero} ClientPicker={ClientPicker} Field={Field}/>}
        {tab === "calendar"    && <CalendarPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
        {tab === "approvals"   && <ApprovalsPanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
        {tab === "performance" && <PerformancePanel clients={clients} selectedId={selectedClientId} onSelect={setSelectedClientId}/>}
      </main>
    </div>
  );
}

// ───── Overview ───────────────────────────────────────────────
function Overview({ clients }) {
  const [stats, setStats] = useState(null);
  useEffect(() => { (async () => {
    try { const { data } = await api.get("/digi/dashboard"); setStats(data); } catch { /* ignore */ }
  })(); }, []);
  return (
    <div className="space-y-4">
      <Hero
        title="Run your agency on autopilot"
        subtitle="Onboard a brand, generate a quarter of strategy, content, and creatives in minutes — and let AI summarise client-ready performance reports each week."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Clients" value={stats?.clients?.total ?? clients.length} sub={`${stats?.clients?.active || 0} active · ${stats?.clients?.onboarding || 0} onboarding`} accent="from-violet-500 to-fuchsia-500"/>
        <Stat label="Pending approvals" value={stats?.pending_approvals ?? 0} sub="Executive + client queue" accent="from-amber-500 to-orange-500"/>
        <Stat label="Content drafts" value={stats?.content_drafts ?? 0} sub={`${stats?.creatives ?? 0} creatives`} accent="from-emerald-500 to-teal-500"/>
        <Stat label="ROI (all time)" value={`${stats?.metrics?.roi_pct ?? 0}%`} sub={`Spend $${(stats?.metrics?.spend || 0).toLocaleString()}`} accent="from-sky-500 to-indigo-500"/>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Calendar pipeline</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
          <PipelineCard label="Planned"   n={stats?.calendar?.planned   || 0} cls="bg-slate-50 ring-slate-200 text-slate-700"/>
          <PipelineCard label="Scheduled" n={stats?.calendar?.scheduled || 0} cls="bg-amber-50 ring-amber-200 text-amber-800"/>
          <PipelineCard label="Published" n={stats?.calendar?.published || 0} cls="bg-emerald-50 ring-emerald-200 text-emerald-800"/>
        </div>
      </div>
      {stats?.recent_clients?.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Recent client onboarded</div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {stats.recent_clients.map((c) => (
              <li key={c.id} className="rounded-xl border border-slate-200 p-3 hover:border-violet-300">
                <div className="text-sm font-bold text-[#0F2042]">{c.name} <span className="text-xs text-slate-400">· {c.industry || "—"}</span></div>
                <div className="mt-0.5 text-[11px] text-slate-500">{c.target_audience || "—"}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PipelineCard({ label, n, cls }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${cls}`}>
      <div className="text-3xl font-bold">{n}</div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.18em]">{label}</div>
    </div>
  );
}

function Hero({ title, subtitle }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0F2042] via-[#1a2d5c] to-[#0F2042] p-7 text-white shadow-lg">
      <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-violet-500/30 blur-3xl"/>
      <div className="absolute -left-10 -bottom-12 h-56 w-56 rounded-full bg-[#F97316]/25 blur-3xl"/>
      <div className="relative">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
          <Sparkles size={14}/> Digi · Marketing Operating System
        </div>
        <h2 className="mt-2 font-display text-3xl font-bold leading-tight sm:text-4xl">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-200/80">{subtitle}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className={`inline-flex h-1 w-10 rounded-full bg-gradient-to-r ${accent}`}/>
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-0.5 font-display text-3xl font-bold text-[#0F2042]">{value}</div>
      <div className="mt-1 text-[11px] text-slate-500">{sub}</div>
    </div>
  );
}

// ───── Clients (onboarding) ────────────────────────────────────
function ClientsPanel({ rows, refresh, onSelect }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyClient());

  function emptyClient() {
    return { name: "", company: "", industry: "", website: "", target_audience: "",
             locations: [], competitors: [], social_accounts: {},
             primary_email: "", primary_phone: "", account_manager_email: "" };
  }
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    try { await api.post("/digi/clients", form); toast.success("Client onboarded"); setForm(emptyClient()); setCreating(false); refresh(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this client + all their content/calendar/metrics?")) return;
    try { await api.delete(`/digi/clients/${id}`); refresh(); toast.success("Client deleted"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-4">
      <Hero title="Onboard a new brand in 2 minutes" subtitle="Capture the brand profile once — Digi remembers it for every AI generation, strategy, creative, and report."/>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-[#0F2042]">{rows.length} client{rows.length === 1 ? "" : "s"}</h3>
        <button onClick={() => setCreating(true)} data-testid="digi-add-client"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow"><Plus size={12}/> New client</button>
      </div>
      {rows.length === 0 ? (
        <Empty title="No brands onboarded yet" hint="Click 'New client' and walk through the wizard to capture company, audience, locations, competitors, and social handles."/>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => (
            <motion.div key={c.id} layout className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md" data-testid={`digi-client-${c.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-[#0F2042]">{c.name}</div>
                  <div className="text-[11px] text-slate-500">{c.company || c.industry || "—"}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${c.status === "active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : c.status === "paused" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>{c.status}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                {c.website && <div className="truncate"><Globe2 size={10} className="inline mr-1"/>{c.website}</div>}
                {c.primary_email && <div className="truncate"><Mail size={10} className="inline mr-1"/>{c.primary_email}</div>}
                {c.target_audience && <div className="line-clamp-2"><Users size={10} className="inline mr-1"/>{c.target_audience}</div>}
              </div>
              <div className="mt-3 flex items-center justify-between gap-1 border-t border-slate-100 pt-3">
                <button onClick={() => onSelect(c.id)} className="text-[11px] font-bold text-violet-600 hover:underline">Open brand kit →</button>
                <button onClick={() => remove(c.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={12}/></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {creating && (
          <Modal onClose={() => setCreating(false)} title="New client" testid="digi-new-client-modal" wide>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="digi-client-name" className="inp"/></Field>
                <Field label="Company"><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="inp"/></Field>
                <Field label="Industry"><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. fintech / healthcare" className="inp"/></Field>
                <Field label="Website"><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://…" className="inp"/></Field>
                <Field label="Primary email"><input value={form.primary_email} onChange={(e) => setForm({ ...form, primary_email: e.target.value })} className="inp"/></Field>
                <Field label="Primary phone"><input value={form.primary_phone} onChange={(e) => setForm({ ...form, primary_phone: e.target.value })} className="inp"/></Field>
              </div>
              <Field label="Target audience"><textarea rows={2} value={form.target_audience} onChange={(e) => setForm({ ...form, target_audience: e.target.value })} className="inp"/></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Locations (comma-separated)"><input value={form.locations.join(", ")} onChange={(e) => setForm({ ...form, locations: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="inp"/></Field>
                <Field label="Competitors (comma-separated)"><input value={form.competitors.join(", ")} onChange={(e) => setForm({ ...form, competitors: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} className="inp"/></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Instagram"><input value={form.social_accounts.instagram || ""} onChange={(e) => setForm({ ...form, social_accounts: { ...form.social_accounts, instagram: e.target.value } })} className="inp"/></Field>
                <Field label="LinkedIn"><input value={form.social_accounts.linkedin || ""} onChange={(e) => setForm({ ...form, social_accounts: { ...form.social_accounts, linkedin: e.target.value } })} className="inp"/></Field>
                <Field label="Facebook"><input value={form.social_accounts.facebook || ""} onChange={(e) => setForm({ ...form, social_accounts: { ...form.social_accounts, facebook: e.target.value } })} className="inp"/></Field>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700">Cancel</button>
                <button onClick={save} data-testid="digi-save-client" className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow">Save & onboard</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───── Brand Kit ──────────────────────────────────────────────
function BrandKitPanel({ clients, selectedId, onSelect }) {
  const [kit, setKit] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!selectedId) { setKit(null); return; }
    api.get(`/digi/clients/${selectedId}/brand-kit`).then(({ data }) => setKit(data || { client_id: selectedId })).catch(() => {});
  }, [selectedId]);

  const save = async () => {
    if (!selectedId || !kit) return;
    setSaving(true);
    try { const { data } = await api.put(`/digi/clients/${selectedId}/brand-kit`, kit); setKit(data); toast.success("Brand kit saved"); }
    catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Hero title="One brand kit. Every AI generation auto-applies it." subtitle="Logo, palette, fonts, voice and audience travel with every caption, blog, ad copy, and creative this client gets."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      {!selectedId ? <Empty title="Pick a client to edit their brand kit"/> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Palette</div>
            <div className="grid grid-cols-3 gap-2">
              <ColorField label="Primary" value={kit?.primary_color || "#F97316"} onChange={(v) => setKit({ ...kit, primary_color: v })}/>
              <ColorField label="Accent"  value={kit?.accent_color  || "#A855F7"} onChange={(v) => setKit({ ...kit, accent_color: v })}/>
              <ColorField label="Background" value={kit?.background_color || "#0F2042"} onChange={(v) => setKit({ ...kit, background_color: v })}/>
            </div>
            <Field label="Heading font"><input value={kit?.heading_font || ""} onChange={(e) => setKit({ ...kit, heading_font: e.target.value })} className="inp" placeholder="Inter"/></Field>
            <Field label="Body font"><input value={kit?.body_font || ""} onChange={(e) => setKit({ ...kit, body_font: e.target.value })} className="inp" placeholder="Inter"/></Field>
            <Field label="Logo URL"><input value={kit?.logo_url || ""} onChange={(e) => setKit({ ...kit, logo_url: e.target.value })} className="inp" placeholder="https://…/logo.png"/></Field>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Voice + audience</div>
            <Field label="Brand voice"><textarea rows={4} value={kit?.brand_voice || ""} onChange={(e) => setKit({ ...kit, brand_voice: e.target.value })} className="inp" placeholder="Bold · technical · slightly cheeky · always benefit-led"/></Field>
            <Field label="Target audience"><textarea rows={3} value={kit?.target_audience || ""} onChange={(e) => setKit({ ...kit, target_audience: e.target.value })} className="inp"/></Field>
            <Field label="Design guidelines"><textarea rows={3} value={kit?.design_guidelines || ""} onChange={(e) => setKit({ ...kit, design_guidelines: e.target.value })} className="inp" placeholder="Generous whitespace, asymmetric layouts, no purple gradients on white."/></Field>
            <div className="flex justify-end">
              <button onClick={save} disabled={saving} data-testid="digi-save-brand-kit"
                className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
                {saving ? <Loader2 size={11} className="inline animate-spin mr-1"/> : null}Save brand kit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-center gap-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-slate-200"/>
        <input value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[11px]"/>
      </div>
    </div>
  );
}

// ───── Strategy (AI) ──────────────────────────────────────────
function StrategyPanel({ clients, selectedId, onSelect, refresh }) {
  const [client, setClient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [timeframe, setTimeframe] = useState("monthly");
  useEffect(() => {
    if (!selectedId) { setClient(null); return; }
    api.get(`/digi/clients/${selectedId}`).then(({ data }) => setClient(data)).catch(() => {});
  }, [selectedId]);

  const strategies = client?.strategies || {};
  const hasStrategies = strategies?.executive_summary;

  const generate = async () => {
    if (!selectedId) return toast.error("Pick a client");
    setBusy(true);
    try { const { data } = await api.post(`/digi/clients/${selectedId}/strategies/generate`, { timeframe }); setClient((c) => ({ ...c, strategies: data })); refresh(); toast.success("Strategy ready"); }
    catch (e) { toast.error(formatApiError(e) || "AI failed — please top up Universal Key in Profile"); }
    setBusy(false);
  };

  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState(null);
  const openManual = () => {
    const s = client?.strategies || {};
    setMf({
      executive_summary: s.executive_summary || "",
      objective: s.marketing?.objective || "",
      pillars: (s.marketing?.pillars || []).join("\n"),
      kpis: (s.marketing?.kpis || []).join("\n"),
      themes: (s.content?.themes || []).join("\n"),
      primary_keywords: (s.seo?.primary_keywords || []).join("\n"),
      platforms: (s.ads?.recommended_platforms || []).join(", "),
      targeting: s.ads?.audience_targeting || "",
    });
    setManual(true);
  };
  const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const saveManual = async () => {
    if (!selectedId) return toast.error("Pick a client");
    setBusy(true);
    try {
      const s = client?.strategies || {};
      const strategies = {
        ...s,
        executive_summary: mf.executive_summary,
        marketing: { ...(s.marketing || {}), objective: mf.objective, pillars: lines(mf.pillars), kpis: lines(mf.kpis) },
        content: { ...(s.content || {}), themes: lines(mf.themes) },
        seo: { ...(s.seo || {}), primary_keywords: lines(mf.primary_keywords) },
        ads: { ...(s.ads || {}), recommended_platforms: mf.platforms.split(",").map((x) => x.trim()).filter(Boolean), audience_targeting: mf.targeting },
        timeframe,
      };
      const { data } = await api.put(`/digi/clients/${selectedId}/strategies`, { strategies });
      setClient((c) => ({ ...c, strategies: data }));
      setManual(false); refresh();
      toast.success("Strategy saved (manual)");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Hero title="Your AI Senior Marketing Consultant" subtitle="Pulls everything Digi knows about the brand (audience, locations, competitors, brand kit) and proposes channels, content, SEO and ad allocation."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      {!selectedId ? <Empty title="Pick a client to generate strategy"/> : (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Timeframe</div>
            {["weekly", "monthly", "quarterly"].map((t) => (
              <button key={t} onClick={() => setTimeframe(t)} data-testid={`digi-strategy-${t}`}
                className={`rounded-full px-3 py-1 text-[11px] font-bold capitalize ${timeframe === t ? "bg-[#0F2042] text-white shadow" : "bg-slate-100 text-slate-600"}`}>{t}</button>
            ))}
            <button onClick={openManual} data-testid="digi-strategy-manual"
              className="ml-auto inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white shadow">
              <PenLine size={11}/> Write manually
            </button>
            <button onClick={generate} disabled={busy} data-testid="digi-strategy-generate"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>} Generate strategy
            </button>
          </div>
          {manual && mf && (
            <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="digi-strategy-manual-form">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Manual strategy — no AI</div>
              <Field label="Executive summary"><textarea rows={3} value={mf.executive_summary} onChange={(e) => setMf({ ...mf, executive_summary: e.target.value })} className="inp resize-y" data-testid="digi-strategy-exec"/></Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Marketing objective"><input value={mf.objective} onChange={(e) => setMf({ ...mf, objective: e.target.value })} className="inp"/></Field>
                <Field label="Audience targeting"><input value={mf.targeting} onChange={(e) => setMf({ ...mf, targeting: e.target.value })} className="inp"/></Field>
                <Field label="Pillars (one per line)"><textarea rows={3} value={mf.pillars} onChange={(e) => setMf({ ...mf, pillars: e.target.value })} className="inp resize-y"/></Field>
                <Field label="KPIs (one per line)"><textarea rows={3} value={mf.kpis} onChange={(e) => setMf({ ...mf, kpis: e.target.value })} className="inp resize-y"/></Field>
                <Field label="Content themes (one per line)"><textarea rows={3} value={mf.themes} onChange={(e) => setMf({ ...mf, themes: e.target.value })} className="inp resize-y"/></Field>
                <Field label="SEO keywords (one per line)"><textarea rows={3} value={mf.primary_keywords} onChange={(e) => setMf({ ...mf, primary_keywords: e.target.value })} className="inp resize-y"/></Field>
                <Field label="Ad platforms (comma separated)"><input value={mf.platforms} onChange={(e) => setMf({ ...mf, platforms: e.target.value })} className="inp"/></Field>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setManual(false)} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
                <button onClick={saveManual} disabled={busy} data-testid="digi-strategy-manual-save"
                  className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                  {busy ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>} Save strategy
                </button>
              </div>
            </div>
          )}
          {hasStrategies && (
            <>
              <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-orange-50 p-5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">Executive summary</div>
                <p className="mt-2 text-sm leading-relaxed text-[#0F2042]">{strategies.executive_summary}</p>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <StrategyCard title="Marketing" icon={<BarChart3 size={14}/>}>
                  <KV k="Objective" v={strategies.marketing?.objective}/>
                  <KVList k="Pillars" items={strategies.marketing?.pillars}/>
                  <KVList k="KPIs"    items={strategies.marketing?.kpis}/>
                </StrategyCard>
                <StrategyCard title="Content" icon={<FileText size={14}/>}>
                  <KVList k="Themes" items={strategies.content?.themes}/>
                  <KV     k="Frequency" v={Object.entries(strategies.content?.post_frequency || {}).map(([p,f]) => `${p}: ${f}`).join(" · ")}/>
                  <KVList k="Types"   items={strategies.content?.content_types}/>
                </StrategyCard>
                <StrategyCard title="SEO" icon={<Globe2 size={14}/>}>
                  <KVList k="Primary keywords" items={strategies.seo?.primary_keywords}/>
                  <KVList k="Long-tail ideas"  items={strategies.seo?.long_tail_ideas}/>
                  <KVList k="Technical actions" items={strategies.seo?.technical_actions}/>
                </StrategyCard>
                <StrategyCard title="Ads" icon={<Sparkles size={14}/>}>
                  <KVList k="Platforms" items={strategies.ads?.recommended_platforms}/>
                  <KV     k="Budget split" v={Object.entries(strategies.ads?.monthly_budget_split || {}).map(([p,n]) => `${p} ${n}%`).join(" · ")}/>
                  <KV     k="Targeting" v={strategies.ads?.audience_targeting}/>
                </StrategyCard>
              </div>
            </>
          )}
          {!hasStrategies && <Empty title="No strategy yet" hint="Click ‘Generate strategy’ — Digi will draft channels, content, SEO and ad allocation."/>}
        </>
      )}
    </div>
  );
}
function StrategyCard({ title, icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{icon} {title}</div>
      <div className="mt-2 space-y-2 text-xs text-slate-700">{children}</div>
    </div>
  );
}
function KV({ k, v }) { if (!v) return null; return <div><span className="font-bold text-[#0F2042]">{k}:</span> {v}</div>; }
function KVList({ k, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <div className="font-bold text-[#0F2042]">{k}</div>
      <ul className="ml-4 list-disc">{items.map((x, i) => <li key={i}>{typeof x === "string" ? x : (x.name || JSON.stringify(x))}</li>)}</ul>
    </div>
  );
}

// ───── Content AI ─────────────────────────────────────────────
function ContentPanel({ clients, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "caption", platform: "instagram", topic: "", goal: "engagement", tone: "confident · concise" });
  useEffect(() => { (async () => {
    try { const { data } = await api.get("/digi/content", { params: selectedId ? { client_id: selectedId } : {} }); setItems(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  })(); }, [selectedId]);

  const generate = async () => {
    if (!form.topic.trim()) return toast.error("Topic is required");
    setBusy(true);
    try {
      const { data } = await api.post("/digi/content/generate", { ...form, client_id: selectedId });
      setItems((arr) => [data, ...arr]); toast.success("Content drafted");
    } catch (e) { toast.error(formatApiError(e) || "AI failed — please top up Universal Key"); }
    setBusy(false);
  };
  const remove = async (id) => { try { await api.delete(`/digi/content/${id}`); setItems((arr) => arr.filter((x) => x.id !== id)); } catch (e) { toast.error(formatApiError(e)); } };

  const [manual, setManual] = useState(false);
  const [mf, setMf] = useState({ title: "", kind: "caption", platform: "instagram", body: "", hashtags: "", cta: "" });
  const saveManual = async () => {
    if (!mf.body.trim()) return toast.error("Body is required");
    setBusy(true);
    try {
      const { data } = await api.post("/digi/content", { ...mf, client_id: selectedId });
      setItems((arr) => [data, ...arr]);
      setManual(false);
      setMf({ title: "", kind: "caption", platform: "instagram", body: "", hashtags: "", cta: "" });
      toast.success("Content saved (manual)");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Hero title="Platform-specific copy, on tap" subtitle="Captions, hashtags, blog posts, ad copy and video scripts — auto-applies brand voice and platform conventions."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
        <div className="grid gap-2 sm:grid-cols-5">
          <Field label="Kind">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="inp" data-testid="digi-content-kind">
              <option value="caption">Caption</option><option value="hashtags">Hashtags</option><option value="cta">CTA line</option>
              <option value="blog">Blog post</option><option value="ad_copy">Ad copy</option><option value="video_script">Video script</option>
            </select>
          </Field>
          <Field label="Platform">
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="inp" data-testid="digi-content-platform">
              {["instagram","linkedin","facebook","x","youtube","blog","google_ads"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Goal"><input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })} className="inp"/></Field>
          <Field label="Tone"><input value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })} className="inp"/></Field>
          <Field label="Topic"><input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="inp" data-testid="digi-content-topic" placeholder="Diwali festive sale promo"/></Field>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setManual((v) => !v)} data-testid="digi-content-manual"
            className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white shadow">
            <PenLine size={11}/> Write manually
          </button>
          <button onClick={generate} disabled={busy} data-testid="digi-content-generate"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>} Generate
          </button>
        </div>
      </div>
      {manual && (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="digi-content-manual-form">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Manual content — no AI</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Title"><input value={mf.title} onChange={(e) => setMf({ ...mf, title: e.target.value })} className="inp" data-testid="digi-content-manual-title"/></Field>
            <Field label="Kind">
              <select value={mf.kind} onChange={(e) => setMf({ ...mf, kind: e.target.value })} className="inp">
                <option value="caption">Caption</option><option value="hashtags">Hashtags</option><option value="cta">CTA line</option>
                <option value="blog">Blog post</option><option value="ad_copy">Ad copy</option><option value="video_script">Video script</option>
              </select>
            </Field>
            <Field label="Platform">
              <select value={mf.platform} onChange={(e) => setMf({ ...mf, platform: e.target.value })} className="inp">
                {["instagram","linkedin","facebook","x","youtube","blog","google_ads"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Body"><textarea rows={5} value={mf.body} onChange={(e) => setMf({ ...mf, body: e.target.value })} className="inp resize-y" data-testid="digi-content-manual-body" placeholder="Write your caption / copy here…"/></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Hashtags (space separated)"><input value={mf.hashtags} onChange={(e) => setMf({ ...mf, hashtags: e.target.value })} className="inp" placeholder="#projexino #buildfast"/></Field>
            <Field label="CTA"><input value={mf.cta} onChange={(e) => setMf({ ...mf, cta: e.target.value })} className="inp"/></Field>
          </div>
          <div className="flex justify-end">
            <button onClick={saveManual} disabled={busy} data-testid="digi-content-manual-save"
              className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {busy ? <Loader2 size={11} className="animate-spin"/> : <Check size={11}/>} Save content
            </button>
          </div>
        </div>
      )}
      {items.length === 0 ? <Empty title="No content drafts yet" hint="Pick a kind/platform and topic, then click Generate."/> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {items.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`digi-content-${c.id}`}>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide">
                <span className="text-slate-500">{c.kind} · {c.platform || "—"}</span>
                <button onClick={() => remove(c.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={11}/></button>
              </div>
              <div className="mt-1 font-bold text-[#0F2042]">{c.title}</div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
              {c.hashtags?.length > 0 && <div className="mt-2 text-xs text-slate-500">{c.hashtags.join(" ")}</div>}
              {c.cta && <div className="mt-1 text-xs"><span className="font-bold text-[#F97316]">CTA:</span> {c.cta}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───── Creative AI ────────────────────────────────────────────
function CreativePanel({ clients, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ kind: "poster", platform: "instagram", headline: "", prompt: "" });
  useEffect(() => { (async () => {
    try { const { data } = await api.get("/digi/creatives", { params: selectedId ? { client_id: selectedId } : {} }); setItems(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  })(); }, [selectedId]);

  const generate = async () => {
    if (!form.prompt.trim()) return toast.error("Prompt is required");
    setBusy(true);
    try {
      const { data } = await api.post("/digi/creatives/generate", { ...form, client_id: selectedId });
      setItems((arr) => [data, ...arr]); toast.success("Creative generated");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Hero title="Brand-safe creatives in seconds" subtitle="Phase-1 ships branded SVG posters with your palette + headline. Phase-2 swaps the engine to Nano Banana once Universal Key is topped up."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
        <div className="grid gap-2 sm:grid-cols-4">
          <Field label="Kind">
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="inp" data-testid="digi-creative-kind">
              {["poster","carousel","banner","story","ad"].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Platform">
            <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="inp">
              {["instagram","facebook","linkedin","x","youtube","google_ads"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Headline"><input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} className="inp" placeholder="Festive sale · 30% off"/></Field>
          <Field label="Prompt"><input value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} className="inp" data-testid="digi-creative-prompt" placeholder="Bold abstract festive theme"/></Field>
        </div>
        <div className="flex justify-end">
          <button onClick={generate} disabled={busy} data-testid="digi-creative-generate"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
            {busy ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>} Generate creative
          </button>
        </div>
      </div>
      {items.length === 0 ? <Empty title="No creatives yet" hint="Generate a brand-styled poster, carousel, banner, story or ad."/> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((cr) => (
            <div key={cr.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" data-testid={`digi-creative-${cr.id}`}>
              <div className="bg-slate-100">
                <img src={`data:${cr.mime_type};base64,${cr.image_base64}`} alt={cr.headline} className="block w-full"/>
              </div>
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{cr.kind} · {cr.platform}</div>
                  <div className="mt-0.5 truncate text-sm font-bold text-[#0F2042]">{cr.headline || cr.prompt}</div>
                </div>
                {cr.mime_type === "image/svg+xml" && (
                  <button data-testid={`digi-creative-dl-${cr.id}`}
                    onClick={() => {
                      try {
                        const svg = atob(cr.image_base64);
                        downloadSvgAsPng(svg, cr.size?.w || 1080, cr.size?.h || 1080, `${cr.kind}-${cr.id.slice(0, 6)}.png`);
                      } catch { toast.error("Download failed"); }
                    }}
                    className="ml-2 shrink-0 rounded-full bg-slate-100 p-2 text-slate-600 hover:bg-slate-200" title="Download PNG">
                    <Download size={13}/>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───── Calendar (simple list view) ────────────────────────────
function CalendarPanel({ clients, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", platform: "instagram", scheduled_at: "", kind: "post", status: "planned", notes: "" });
  const load = async () => {
    try { const { data } = await api.get("/digi/calendar", { params: selectedId ? { client_id: selectedId } : {} }); setItems(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedId]);

  const save = async () => {
    if (!form.title || !form.scheduled_at) return toast.error("Title + scheduled_at required");
    try { await api.post("/digi/calendar", { ...form, client_id: selectedId }); setCreating(false); setForm({ title: "", platform: "instagram", scheduled_at: "", kind: "post", status: "planned", notes: "" }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const setStatus = async (id, status) => { try { await api.patch(`/digi/calendar/${id}`, { status }); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const remove = async (id) => { try { await api.delete(`/digi/calendar/${id}`); load(); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <div className="space-y-4">
      <Hero title="One calendar across every channel" subtitle="See planned, scheduled and published posts in one view. Filter by client. Move between states with one click."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      <div className="flex items-center justify-end">
        <button onClick={() => setCreating(true)} data-testid="digi-calendar-add" className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow"><Plus size={11}/> New entry</button>
      </div>
      {items.length === 0 ? <Empty title="Calendar is empty" hint="Add your first entry — Digi keeps it in sync with content drafts and approvals."/> : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" data-testid={`digi-cal-${it.id}`}>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-center ring-1 ring-slate-200">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{(it.scheduled_at || "").slice(0,7)}</div>
                  <div className="font-display text-xl font-bold text-[#0F2042]">{(it.scheduled_at || "").slice(8,10)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-bold text-[#0F2042]">{it.title}</div>
                  <div className="text-[10px] text-slate-500">{it.platform} · {it.kind} · {it.scheduled_at}</div>
                </div>
                <select value={it.status} onChange={(e) => setStatus(it.id, e.target.value)} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">
                  {["planned","scheduled","approved","published"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => remove(it.id)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={12}/></button>
              </div>
              {it.notes && <div className="mt-1 text-[11px] text-slate-500">{it.notes}</div>}
            </li>
          ))}
        </ul>
      )}
      <AnimatePresence>
        {creating && (
          <Modal onClose={() => setCreating(false)} title="New calendar entry" testid="digi-cal-modal">
            <div className="space-y-3">
              <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="inp" data-testid="digi-cal-title"/></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Platform"><select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="inp">{["instagram","linkedin","facebook","x","youtube","blog"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
                <Field label="Kind"><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="inp">{["post","story","reel","blog","ad"].map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
              </div>
              <Field label="Scheduled at"><input type="date" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} className="inp" data-testid="digi-cal-date"/></Field>
              <Field label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp"/></Field>
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700">Cancel</button>
                <button onClick={save} data-testid="digi-cal-save" className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow">Save</button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───── Approvals ──────────────────────────────────────────────
function ApprovalsPanel({ clients, selectedId, onSelect }) {
  const [items, setItems] = useState([]);
  const load = async () => {
    try { const { data } = await api.get("/digi/approvals", { params: selectedId ? { client_id: selectedId } : {} }); setItems(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedId]);
  const transition = async (id, status) => { try { await api.post(`/digi/approvals/${id}/transition`, { status }); load(); toast.success(`→ ${status}`); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <div className="space-y-4">
      <Hero title="AI drafts → Executive review → Client approves → Publish" subtitle="Every AI-drafted artefact can be sent through this workflow before going live."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      {items.length === 0 ? <Empty title="No approvals pending" hint="Create approvals when you queue AI drafts for review (Phase-2 will auto-create them)."/> : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{a.item_type}</div>
                  <div className="font-bold text-[#0F2042]">{a.title}</div>
                </div>
                <div className="flex items-center gap-1">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{a.status}</span>
                  <button onClick={() => transition(a.id, "pending_client")} className="rounded-full bg-sky-500 px-3 py-1 text-[10px] font-bold text-white">→ Client</button>
                  <button onClick={() => transition(a.id, "approved")} className="rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-bold text-white">Approve</button>
                  <button onClick={() => transition(a.id, "rejected")} className="rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold text-white">Reject</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───── Performance ───────────────────────────────────────────
function PerformancePanel({ clients, selectedId, onSelect }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ date: "", platform: "all", reach: "", leads: "", spend: "", revenue: "" });
  const load = async () => {
    if (!selectedId) { setRows([]); return; }
    try { const { data } = await api.get("/digi/metrics", { params: { client_id: selectedId } }); setRows(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedId]);

  const upsert = async () => {
    if (!selectedId) return toast.error("Pick a client");
    if (!form.date) return toast.error("Date required");
    try {
      await api.post("/digi/metrics", { ...form, client_id: selectedId });
      setForm({ date: "", platform: "all", reach: "", leads: "", spend: "", revenue: "" });
      load(); toast.success("Metric saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const totals = rows.reduce((acc, r) => {
    acc.reach += r.reach || 0; acc.leads += r.leads || 0;
    acc.spend += r.spend || 0; acc.revenue += r.revenue || 0;
    return acc;
  }, { reach: 0, leads: 0, spend: 0, revenue: 0 });
  const roi = totals.spend > 0 ? Math.round(((totals.revenue - totals.spend) / totals.spend) * 100) : 0;

  return (
    <div className="space-y-4">
      <Hero title="Manual entry today · API connectors tomorrow" subtitle="Log daily reach/leads/spend/revenue. Phase-2 plugs into Meta/Google/LinkedIn APIs for auto-sync."/>
      <ClientPicker clients={clients} selectedId={selectedId} onSelect={onSelect}/>
      {selectedId && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Reach" value={totals.reach.toLocaleString()} sub="" accent="from-sky-500 to-indigo-500"/>
            <Stat label="Leads" value={totals.leads.toLocaleString()} sub="" accent="from-amber-500 to-orange-500"/>
            <Stat label="Spend" value={`$${totals.spend.toLocaleString()}`} sub="" accent="from-rose-500 to-pink-500"/>
            <Stat label="ROI" value={`${roi}%`} sub={`Revenue $${totals.revenue.toLocaleString()}`} accent="from-emerald-500 to-teal-500"/>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Log metrics</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-6">
              <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="inp" data-testid="digi-metric-date"/>
              <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })} className="inp">{["all","instagram","facebook","linkedin","google","youtube"].map((p) => <option key={p} value={p}>{p}</option>)}</select>
              <input type="number" placeholder="Reach" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} className="inp"/>
              <input type="number" placeholder="Leads" value={form.leads} onChange={(e) => setForm({ ...form, leads: e.target.value })} className="inp"/>
              <input type="number" placeholder="Spend" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} className="inp"/>
              <input type="number" placeholder="Revenue" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} className="inp"/>
            </div>
            <div className="mt-2 flex justify-end">
              <button onClick={upsert} data-testid="digi-metric-save" className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-1.5 text-xs font-bold text-white shadow">Save metric</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ───── shared bits ────────────────────────────────────────────
function ClientPicker({ clients, selectedId, onSelect }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Active client</div>
      <select value={selectedId} onChange={(e) => onSelect(e.target.value)} data-testid="digi-client-picker" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <option value="">— pick a client —</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.industry || "—"}</option>)}
      </select>
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</div>{children}</label>;
}
function Empty({ title, hint }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-50 text-violet-500"><Sparkles size={20}/></div>
      <div className="text-base font-bold text-[#0F2042]">{title}</div>
      {hint && <div className="mt-1 text-sm text-slate-500">{hint}</div>}
    </div>
  );
}
function Modal({ title, children, onClose, testid, wide }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
      data-testid={testid} onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
