/**
 * Contracts.jsx — Enterprise Contract Configuration Hub (Phase 1)
 *
 * Route: /app/contracts   (Super Admin only)
 *
 * Sub-navigation
 * --------------
 *   • Dashboard        — KPI cards + expiring soon
 *   • Contract List    — filterable, searchable
 *   • New Contract     — client picker + create draft
 *   • Configuration    — the full editable contract (sections 1-6 in Phase 1)
 *   • Renewals         — active + upcoming (contract_end within next 60 d)
 *   • Expiring         — active & contract_end <= 30 d
 *   • Audit Logs       — global timeline
 *
 * Right sidebar (inside Configuration) shows Live Contract Summary.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  FileText, LayoutDashboard, List, Plus, Sparkles, RefreshCw, AlertTriangle, Clock,
  Save, Upload, Download, Loader2, X, CheckCircle2, PauseCircle, PlayCircle,
  ShieldCheck, DollarSign, Users, Building2, ChevronRight, Copy, Package, Mail, Send,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf } from "@/lib/download";
import { useAuth } from "@/context/AuthContext";

/* ---------- constants ---------- */
const TABS = [
  { v: "dashboard",   l: "Dashboard",     icon: LayoutDashboard },
  { v: "list",        l: "Contracts",     icon: List },
  { v: "new",         l: "New",           icon: Plus },
  { v: "config",      l: "Configuration", icon: FileText },
  { v: "renewals",    l: "Renewals",      icon: RefreshCw },
  { v: "expiring",    l: "Expiring",      icon: AlertTriangle },
  { v: "audit",       l: "Audit Logs",    icon: Clock },
];
const STATUS_META = {
  draft:            { label: "Draft",            cls: "bg-slate-100 text-slate-700" },
  pending_approval: { label: "Pending Approval", cls: "bg-amber-100 text-amber-700" },
  signed:           { label: "Signed",           cls: "bg-sky-100 text-sky-700" },
  active:           { label: "Active",           cls: "bg-emerald-100 text-emerald-700" },
  suspended:        { label: "Suspended",        cls: "bg-orange-100 text-orange-700" },
  expired:          { label: "Expired",          cls: "bg-rose-100 text-rose-700" },
  cancelled:        { label: "Cancelled",        cls: "bg-slate-200 text-slate-500" },
  renewed:          { label: "Renewed",          cls: "bg-violet-100 text-violet-700" },
};

/* ---------- Root ---------- */
export default function Contracts() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "dashboard";
  const setTab = (v) => setParams((p) => { p.set("tab", v); return p; }, { replace: true });

  if ((user?.role || "") !== "super_admin") {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50/60 p-10 text-center" data-testid="contracts-forbidden">
        <ShieldCheck size={32} className="mx-auto text-rose-500"/>
        <h1 className="font-display mt-3 text-xl font-semibold text-[#0F2042]">Restricted</h1>
        <p className="mt-2 text-sm text-slate-600">Contract Configuration is available to super admins only.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="page-contracts">
      <header className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 md:p-7 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// enterprise · super admin</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Contract Configuration</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Single source of truth for every client contract. Changes activated here propagate to modules, features, limits, billing and branding across the platform.
        </p>
        <nav className="mt-5 inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)} data-testid={`ctr-tab-${t.v}`}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={12}/> {t.l}
            </button>
          ))}
        </nav>
      </header>
      {tab === "dashboard" && <DashboardView onJump={setTab} />}
      {tab === "list"      && <ListView filter={{}} onOpen={(id) => { setParams((p) => { p.set("tab", "config"); p.set("id", id); return p; }); }} />}
      {tab === "new"       && <NewContractView onCreated={(id) => setParams({ tab: "config", id })} />}
      {tab === "config"    && <ConfigurationView contractId={params.get("id") || ""} onOpenList={() => setTab("list")} />}
      {tab === "renewals"  && <ListView filter={{ within: 60 }} title="Renewals — next 60 days" onOpen={(id) => setParams({ tab: "config", id })} />}
      {tab === "expiring"  && <ListView filter={{ within: 30 }} title="Expiring — next 30 days" onOpen={(id) => setParams({ tab: "config", id })} />}
      {tab === "audit"     && <AuditGlobalView />}
    </div>
  );
}

/* ---------- Dashboard ---------- */
function DashboardView({ onJump }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get("/contracts/dashboard").then(({ data }) => setD(data)).catch((e) => toast.error(formatApiError(e))); }, []);
  if (!d) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  const cards = [
    { l: "Total contracts",  v: d.total,                       color: "orange", icon: FileText,    jump: "list" },
    { l: "Active",           v: d.by_status?.active || 0,      color: "emerald", icon: PlayCircle,  jump: "list" },
    { l: "Drafts",           v: d.by_status?.draft || 0,       color: "slate",   icon: FileText,    jump: "list" },
    { l: "Pending Approval", v: d.by_status?.pending_approval || 0, color: "amber", icon: Clock,   jump: "list" },
    { l: "Suspended",        v: d.by_status?.suspended || 0,   color: "orange",  icon: PauseCircle, jump: "list" },
    { l: "Expiring 30 d",    v: d.expiring_30d || 0,           color: "rose",    icon: AlertTriangle, jump: "expiring" },
    { l: "Cancelled",        v: d.by_status?.cancelled || 0,   color: "slate",   icon: X,           jump: "list" },
    { l: "Total active value", v: `$${(d.total_active_value || 0).toLocaleString()}`, color: "violet", icon: DollarSign, jump: "list" },
  ];
  const tone = (c) => ({ orange:"#F97316", emerald:"#10B981", violet:"#7C3AED", rose:"#EF4444", amber:"#F59E0B", slate:"#0F2042" }[c] || "#0F2042");
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ctr-dashboard">
      {cards.map((c) => (
        <button key={c.l} type="button" onClick={() => onJump && onJump(c.jump)}
          data-testid={`ctr-stat-${c.l.replace(/\s+/g, "-").toLowerCase()}`}
          className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${tone(c.color)}22`, color: tone(c.color) }}>
              <c.icon size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{c.l}</div>
              <div className="font-display text-xl font-bold text-[#0F2042]">{c.v}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ---------- List ---------- */
function ListView({ onOpen, filter = {}, title }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/contracts", { params: { status, q, limit: 300 } });
      let list = data.items || [];
      if (filter.within) {
        const now = Date.now();
        const cap = now + filter.within * 86_400_000;
        list = list.filter((c) => c.status === "active" && c.contract_end && new Date(c.contract_end).getTime() <= cap);
      }
      setItems(list);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  }, [status, q, filter.within]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {title && <h2 className="font-display text-sm font-bold text-[#0F2042]">{title}</h2>}
        <div className="inline-flex gap-1 rounded-full bg-slate-100 p-1">
          {["", "draft", "active", "suspended", "expired"].map((s) => (
            <button key={s || "all"} onClick={() => setStatus(s)} data-testid={`ctr-list-filter-${s || "all"}`}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${status === s ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
              {s ? STATUS_META[s]?.label : "All"}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search agreement / number / owner…"
          data-testid="ctr-list-search"
          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#F97316]"/>
      </div>
      {loading ? <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div> :
       items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="ctr-list-empty">No contracts match.</div>
       ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Contract</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Value</th>
                <th className="px-3 py-2 text-left">End date</th>
                <th className="px-3 py-2 text-left">Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-orange-50/30" data-testid={`ctr-row-${c.id}`} onClick={() => onOpen(c.id)}>
                  <td className="px-3 py-2">
                    <div className="font-bold text-[#0F2042]">{c.agreement_name}</div>
                    <div className="font-mono text-[10px] text-slate-500">{c.contract_number} · v{c.version}</div>
                  </td>
                  <td className="px-3 py-2">{c.client?.name || "—"}</td>
                  <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_META[c.status]?.cls || "bg-slate-100 text-slate-700"}`}>{STATUS_META[c.status]?.label || c.status}</span></td>
                  <td className="px-3 py-2 capitalize text-slate-600">{(c.agreement_type || "").replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-slate-700">{c.pricing?.currency || "USD"} {(c.pricing?.contract_value || 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{c.contract_end ? new Date(c.contract_end).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-slate-500">{new Date(c.updated_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-right text-slate-400"><ChevronRight size={14}/></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
       )}
    </div>
  );
}

/* ---------- New contract ---------- */
function NewContractView({ onCreated }) {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ client_id: "", agreement_name: "", agreement_type: "subscription", contract_start: "", contract_end: "", contract_value: 0, currency: "USD" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/clients").then(({ data }) => setClients(data.items || data || [])).catch(() => {}); }, []);
  const submit = async () => {
    if (!form.client_id) return toast.error("Pick a client");
    if (!form.agreement_name.trim()) return toast.error("Agreement name is required");
    setBusy(true);
    try {
      const { data } = await api.post("/contracts", form);
      toast.success(`Draft created · ${data.contract_number}`);
      onCreated(data.id);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="ctr-new">
      <h2 className="font-display text-lg font-semibold text-[#0F2042]">Create a contract</h2>
      <p className="mt-1 text-xs text-slate-500">A new contract starts in <b>Draft</b>. You can activate it once all mandatory sections are filled.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Field label="Client *">
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} data-testid="ctr-new-client"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="">— Select a client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Agreement name *">
          <input value={form.agreement_name} onChange={(e) => setForm({ ...form, agreement_name: e.target.value })} data-testid="ctr-new-name"
            placeholder="e.g. Enterprise SaaS Q3 2026"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
        </Field>
        <Field label="Type">
          <select value={form.agreement_type} onChange={(e) => setForm({ ...form, agreement_type: e.target.value })} data-testid="ctr-new-type"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {["subscription", "enterprise", "annual", "monthly", "pilot", "trial", "one_time"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} data-testid="ctr-new-currency"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {["USD", "INR", "EUR", "GBP", "AUD", "CAD", "SGD"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Start date">
          <input type="date" value={form.contract_start} onChange={(e) => setForm({ ...form, contract_start: e.target.value })} data-testid="ctr-new-start"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
        </Field>
        <Field label="End date">
          <input type="date" value={form.contract_end} onChange={(e) => setForm({ ...form, contract_end: e.target.value })} data-testid="ctr-new-end"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
        </Field>
        <Field label="Contract value" cls="sm:col-span-2">
          <input type="number" min="0" step="0.01" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: parseFloat(e.target.value || 0) })} data-testid="ctr-new-value"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
        </Field>
      </div>
      <div className="mt-6 flex justify-end">
        <button onClick={submit} disabled={busy} data-testid="ctr-new-submit"
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-2 text-xs font-bold uppercase tracking-wider text-white shadow disabled:opacity-60">
          {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Create contract
        </button>
      </div>
    </div>
  );
}

/* ---------- Configuration (the beast) ---------- */
function ConfigurationView({ contractId, onOpenList }) {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState("");
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const contractRef = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    if (!contractId) { setLoading(false); return; }
    setLoading(true);
    try { const { data } = await api.get(`/contracts/${contractId}`); setC(data); contractRef.current = data; }
    catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  }, [contractId]);
  useEffect(() => { load(); }, [load]);

  // Autosave every 30 s if dirty
  useEffect(() => {
    const t = setInterval(async () => {
      if (!dirtyRef.current || !contractRef.current) return;
      await save({ silent: true });
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, []);

  // Unsaved-changes guard
  useEffect(() => {
    const beforeUnload = (e) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  const patch = (partial) => {
    setC((prev) => { const next = { ...prev, ...partial }; contractRef.current = next; return next; });
    setDirty(true); dirtyRef.current = true;
  };
  const patchSection = (key, obj) => {
    setC((prev) => { const next = { ...prev, [key]: { ...(prev[key] || {}), ...obj } }; contractRef.current = next; return next; });
    setDirty(true); dirtyRef.current = true;
  };

  const save = async ({ silent = false } = {}) => {
    if (!contractRef.current) return;
    setSaving(true);
    try {
      const body = {
        agreement_name: contractRef.current.agreement_name,
        agreement_type: contractRef.current.agreement_type,
        contract_start: contractRef.current.contract_start,
        contract_end:   contractRef.current.contract_end,
        notice_period_days: contractRef.current.notice_period_days,
        renewal_type:   contractRef.current.renewal_type,
        auto_renew:     contractRef.current.auto_renew,
        contract_owner: contractRef.current.contract_owner,
        sales_representative: contractRef.current.sales_representative,
        account_manager:      contractRef.current.account_manager,
        client_info: contractRef.current.client_info,
        modules:     contractRef.current.modules,
        features:    contractRef.current.features,
        limits:      contractRef.current.limits,
        pricing:     contractRef.current.pricing,
        internal_notes: contractRef.current.internal_notes,
      };
      const { data } = await api.patch(`/contracts/${contractId}`, body);
      setC(data); contractRef.current = data;
      setDirty(false); dirtyRef.current = false;
      setLastSaved(new Date().toLocaleTimeString());
      if (!silent) toast.success(`Saved · v${data.version}`);
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  const transition = async (action, reason = "") => {
    try {
      const { data } = await api.post(`/contracts/${contractId}/transition`, { action, reason });
      setC(data); contractRef.current = data;
      toast.success(`Contract is now ${data.status}`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const [showEmail, setShowEmail] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const downloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadApiPdf(`/contracts/${contractId}/pdf`, `${c.contract_number || "contract"}-${(c.agreement_name || "").replace(/\s+/g, "_")}.pdf`);
      toast.success("PDF ready");
    } catch (e) { toast.error(formatApiError(e)); }
    setDownloadingPdf(false);
  };

  if (!contractId) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-12 text-center" data-testid="ctr-config-empty">
        <FileText size={32} className="mx-auto text-slate-400"/>
        <h3 className="font-display mt-3 text-lg font-semibold text-[#0F2042]">Pick a contract</h3>
        <p className="mt-2 text-sm text-slate-500">Choose one from the Contracts tab or create a new one to start configuring.</p>
        <button onClick={onOpenList} className="mt-4 inline-flex items-center gap-1 rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-[#0F2042] hover:border-[#F97316]" data-testid="ctr-config-open-list">
          Browse contracts
        </button>
      </div>
    );
  }
  if (loading || !c) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;

  const stMeta = STATUS_META[c.status] || STATUS_META.draft;

  return (
    <div className="relative grid gap-5 lg:grid-cols-[1fr_320px]">
      {/* Main column */}
      <div className="space-y-5">
        {/* Header card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="ctr-config-header">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${stMeta.cls}`} data-testid="ctr-status-badge">{stMeta.label}</span>
                {dirty && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold uppercase text-amber-700" data-testid="ctr-draft-badge">Unsaved</span>}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-700" data-testid="ctr-version-badge">v{c.version}</span>
                <span className="font-mono text-[10px] text-slate-500">{c.contract_number}</span>
              </div>
              <h2 className="font-display mt-2 text-xl font-semibold text-[#0F2042]">{c.agreement_name}</h2>
              <div className="mt-1 text-xs text-slate-500">
                <b>{c.client?.name || "—"}</b> · {c.pricing?.currency || "USD"} {(c.pricing?.contract_value || 0).toLocaleString()}
                {c.contract_end && <> · Ends {new Date(c.contract_end).toLocaleDateString()}</>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionBtn onClick={downloadPdf} testId="ctr-btn-download-pdf" tone="ghost">
                {downloadingPdf ? <Loader2 size={11} className="animate-spin"/> : <Download size={11}/>} PDF
              </ActionBtn>
              <ActionBtn onClick={() => setShowEmail(true)} testId="ctr-btn-email-client" tone="orange">
                <Mail size={11}/> Email client
              </ActionBtn>
              {c.status === "draft" && <ActionBtn onClick={() => transition("submit_for_approval")} testId="ctr-btn-submit">Submit for approval</ActionBtn>}
              {c.status === "pending_approval" && <>
                <ActionBtn onClick={() => transition("approve")} testId="ctr-btn-approve" tone="emerald">Approve → Signed</ActionBtn>
                <ActionBtn onClick={() => transition("reject", "sent back to draft")} testId="ctr-btn-reject">Reject</ActionBtn>
              </>}
              {c.status === "signed"    && <ActionBtn onClick={() => transition("activate")} testId="ctr-btn-activate" tone="emerald"><PlayCircle size={11}/> Activate</ActionBtn>}
              {c.status === "active"    && <ActionBtn onClick={() => transition("suspend", "manual")} testId="ctr-btn-suspend"><PauseCircle size={11}/> Suspend</ActionBtn>}
              {c.status === "suspended" && <ActionBtn onClick={() => transition("resume")} testId="ctr-btn-resume" tone="emerald"><PlayCircle size={11}/> Resume</ActionBtn>}
              {(c.status === "active" || c.status === "expired") && <ActionBtn onClick={() => transition("renew")} testId="ctr-btn-renew"><RefreshCw size={11}/> Renew</ActionBtn>}
              {!["cancelled", "renewed"].includes(c.status) && <ActionBtn onClick={() => transition("cancel", "manual cancel")} testId="ctr-btn-cancel">Cancel</ActionBtn>}
            </div>
          </div>
        </section>

        {/* Section 1: Client Information */}
        <Card title="1 · Client Information" testId="ctr-sec-client">
          <div className="grid gap-3 sm:grid-cols-2">
            <TxtField label="Client name" v={c.client_info?.name} on={(v) => patchSection("client_info", { name: v })} test="ci-name" disabled/>
            <TxtField label="Industry" v={c.client_info?.industry} on={(v) => patchSection("client_info", { industry: v })} test="ci-industry"/>
            <TxtField label="Country" v={c.client_info?.country} on={(v) => patchSection("client_info", { country: v })} test="ci-country"/>
            <TxtField label="Time zone" v={c.client_info?.timezone} on={(v) => patchSection("client_info", { timezone: v })} test="ci-tz"/>
            <TxtField label="GST / VAT" v={c.client_info?.gst} on={(v) => patchSection("client_info", { gst: v })} test="ci-gst"/>
            <TxtField label="Website" v={c.client_info?.website} on={(v) => patchSection("client_info", { website: v })} test="ci-website"/>
            <TxtField label="Primary contact" v={c.client_info?.primary_contact_name} on={(v) => patchSection("client_info", { primary_contact_name: v })} test="ci-pc"/>
            <TxtField label="Contact email" v={c.client_info?.primary_contact_email} on={(v) => patchSection("client_info", { primary_contact_email: v })} test="ci-pcemail"/>
            <TxtField label="Contact phone" v={c.client_info?.primary_contact_phone} on={(v) => patchSection("client_info", { primary_contact_phone: v })} test="ci-pcphone"/>
            <TxtField label="Decision maker" v={c.client_info?.decision_maker} on={(v) => patchSection("client_info", { decision_maker: v })} test="ci-dm"/>
            <TxtField label="Billing address" v={c.client_info?.billing_address} on={(v) => patchSection("client_info", { billing_address: v })} test="ci-billing" cls="sm:col-span-2"/>
            <TxtField label="Service address" v={c.client_info?.service_address} on={(v) => patchSection("client_info", { service_address: v })} test="ci-service" cls="sm:col-span-2"/>
          </div>
        </Card>

        {/* Section 2: Contract Details */}
        <Card title="2 · Contract Details" testId="ctr-sec-details">
          <div className="grid gap-3 sm:grid-cols-2">
            <TxtField label="Agreement name" v={c.agreement_name} on={(v) => patch({ agreement_name: v })} test="cd-name"/>
            <div>
              <FieldLabel>Type</FieldLabel>
              <select value={c.agreement_type} onChange={(e) => patch({ agreement_type: e.target.value })} data-testid="cd-type"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {["subscription", "enterprise", "annual", "monthly", "pilot", "trial", "one_time"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <TxtField label="Start date" type="date" v={c.contract_start} on={(v) => patch({ contract_start: v })} test="cd-start"/>
            <TxtField label="End date"   type="date" v={c.contract_end}   on={(v) => patch({ contract_end: v })}   test="cd-end"/>
            <TxtField label="Notice period (days)" type="number" v={c.notice_period_days || 0} on={(v) => patch({ notice_period_days: parseInt(v || 0) })} test="cd-notice"/>
            <div>
              <FieldLabel>Renewal type</FieldLabel>
              <select value={c.renewal_type || "manual"} onChange={(e) => patch({ renewal_type: e.target.value })} data-testid="cd-renewal"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {["manual", "auto", "assisted"].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={!!c.auto_renew} onChange={(e) => patch({ auto_renew: e.target.checked })} data-testid="cd-auto-renew"/>
              Auto-renew on end date
            </label>
            <TxtField label="Contract owner"        v={c.contract_owner || ""}        on={(v) => patch({ contract_owner: v })}        test="cd-owner"/>
            <TxtField label="Sales representative" v={c.sales_representative || ""} on={(v) => patch({ sales_representative: v })} test="cd-sales"/>
            <TxtField label="Account manager"      v={c.account_manager || ""}      on={(v) => patch({ account_manager: v })}      test="cd-am"/>
          </div>
        </Card>

        {/* Section 3: Subscription Modules */}
        <Card title="3 · Subscription Modules" testId="ctr-sec-modules">
          <ModulesEditor value={c.modules || []} onChange={(m) => patch({ modules: m })} />
        </Card>

        {/* Section 6: Pricing (Phase 1 shortcut) */}
        <Card title="6 · Pricing" testId="ctr-sec-pricing">
          <PricingEditor pricing={c.pricing || {}} onChange={(pr) => patchSection("pricing", pr)} />
        </Card>

        <div className="pb-24"/>
      </div>

      {/* Right sidebar */}
      <SummarySidebar c={c}/>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 shadow-2xl backdrop-blur lg:left-auto lg:right-6 lg:bottom-6 lg:rounded-full lg:border" data-testid="ctr-save-bar">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 lg:justify-end">
          <span className="text-[10px] text-slate-500">
            {saving ? "Saving…" : lastSaved ? `Autosaved ${lastSaved}` : (dirty ? "Unsaved changes" : "All changes saved")}
          </span>
          <button onClick={() => save()} disabled={saving || !dirty} data-testid="ctr-save-btn"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow disabled:opacity-50">
            {saving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save draft
          </button>
        </div>
      </div>

      {showEmail && (
        <EmailContractModal contractId={contractId} contract={c} onClose={() => setShowEmail(false)}/>
      )}
    </div>
  );
}

/* ---------- Modules editor ---------- */
const MODULE_CATALOG = ["PulseAgent AI", "TileSphere", "CRM", "ERP", "Marketplace", "HRMS", "Inventory", "Finance", "Analytics", "Reports"];
function ModulesEditor({ value, onChange }) {
  const enabledMap = useMemo(() => Object.fromEntries((value || []).map((m) => [m.module, m])), [value]);
  const toggle = (mod) => {
    const exists = enabledMap[mod];
    const next = exists
      ? value.filter((m) => m.module !== mod)
      : [...value, { module: mod, enabled: true, licenses: 10, users: 10, storage_gb: 10, ai_credits: 1000, api_calls: 10000, expiry: "" }];
    onChange(next);
  };
  const patch = (mod, partial) => onChange(value.map((m) => m.module === mod ? { ...m, ...partial } : m));
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="ctr-modules-grid">
      {MODULE_CATALOG.map((mod) => {
        const cur = enabledMap[mod];
        const on = !!cur;
        return (
          <div key={mod} className={`rounded-2xl border p-3 transition ${on ? "border-[#F97316] bg-orange-50/40" : "border-slate-200 bg-white"}`} data-testid={`ctr-mod-${mod.replace(/\s+/g, "-").toLowerCase()}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={14} className={on ? "text-[#F97316]" : "text-slate-400"}/>
                <span className="font-display text-sm font-bold text-[#0F2042]">{mod}</span>
              </div>
              <button onClick={() => toggle(mod)} data-testid={`ctr-mod-toggle-${mod.replace(/\s+/g, "-").toLowerCase()}`}
                className={`inline-flex h-5 w-9 items-center rounded-full transition ${on ? "bg-[#F97316]" : "bg-slate-300"}`}>
                <span className={`h-4 w-4 rounded-full bg-white shadow transition ${on ? "translate-x-4" : "translate-x-0.5"}`}/>
              </button>
            </div>
            {on && (
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <MiniNum label="Licenses"  v={cur.licenses}    on={(v) => patch(mod, { licenses: v })}/>
                <MiniNum label="Users"     v={cur.users}       on={(v) => patch(mod, { users: v })}/>
                <MiniNum label="Storage GB" v={cur.storage_gb} on={(v) => patch(mod, { storage_gb: v })}/>
                <MiniNum label="AI credits/mo" v={cur.ai_credits} on={(v) => patch(mod, { ai_credits: v })}/>
                <MiniNum label="API calls/mo"  v={cur.api_calls}  on={(v) => patch(mod, { api_calls: v })}/>
                <label className="col-span-1">
                  <span className="text-[9px] font-bold uppercase text-slate-500">Expiry</span>
                  <input type="date" value={cur.expiry || ""} onChange={(e) => patch(mod, { expiry: e.target.value })}
                    className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"/>
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Pricing editor ---------- */
function PricingEditor({ pricing, onChange }) {
  const p = pricing || {};
  const recurring = Number(p.recurring_amount || 0);
  const oneTime = Number(p.one_time_charges || 0) + Number(p.setup_cost || 0) + Number(p.migration_cost || 0) + Number(p.training_cost || 0);
  const gross = recurring + oneTime;
  const discount = Number(p.discount || 0);
  const taxable = Math.max(0, gross - discount);
  const tax = taxable * (Number(p.tax_percent || 0) / 100);
  const final = taxable + tax;
  useEffect(() => {
    if (Math.abs((p.contract_value || 0) - final) > 0.01) onChange({ contract_value: Math.round(final * 100) / 100 });
    // eslint-disable-next-line
  }, [recurring, oneTime, discount, p.tax_percent]);
  return (
    <div className="grid gap-3 md:grid-cols-3" data-testid="ctr-pricing-grid">
      <div className="grid gap-3 md:col-span-2 sm:grid-cols-2">
        <div>
          <FieldLabel>Currency</FieldLabel>
          <select value={p.currency || "USD"} onChange={(e) => onChange({ currency: e.target.value })} data-testid="pr-currency"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {["USD", "INR", "EUR", "GBP", "AUD", "CAD", "SGD"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <FieldLabel>Billing cycle</FieldLabel>
          <select value={p.billing_cycle || "monthly"} onChange={(e) => onChange({ billing_cycle: e.target.value })} data-testid="pr-cycle"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            {["monthly", "quarterly", "half_yearly", "yearly"].map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
          </select>
        </div>
        <NumField label="Recurring amount"     v={p.recurring_amount}   on={(v) => onChange({ recurring_amount: v })}   test="pr-recurring"/>
        <NumField label="One-time charges"     v={p.one_time_charges}   on={(v) => onChange({ one_time_charges: v })}   test="pr-onetime"/>
        <NumField label="Setup cost"           v={p.setup_cost}         on={(v) => onChange({ setup_cost: v })}         test="pr-setup"/>
        <NumField label="Migration cost"       v={p.migration_cost}     on={(v) => onChange({ migration_cost: v })}     test="pr-migration"/>
        <NumField label="Training cost"        v={p.training_cost}      on={(v) => onChange({ training_cost: v })}      test="pr-training"/>
        <NumField label="Support cost"         v={p.support_cost}       on={(v) => onChange({ support_cost: v })}       test="pr-support"/>
        <NumField label="Discount"             v={p.discount}           on={(v) => onChange({ discount: v })}           test="pr-discount"/>
        <NumField label="Tax %"                v={p.tax_percent}        on={(v) => onChange({ tax_percent: v })}        test="pr-tax"/>
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4" data-testid="pr-preview">
        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">// live preview</div>
        <PreviewRow label="Recurring"   v={recurring} currency={p.currency}/>
        <PreviewRow label="One-time"    v={oneTime}   currency={p.currency}/>
        <PreviewRow label="Discount"    v={-discount} currency={p.currency}/>
        <PreviewRow label={`Tax (${p.tax_percent || 0}%)`} v={tax} currency={p.currency}/>
        <div className="mt-3 border-t border-emerald-200 pt-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Contract value</div>
          <div className="font-display text-2xl font-bold text-emerald-800">{p.currency || "USD"} {final.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </div>
  );
}
function PreviewRow({ label, v, currency }) {
  return (
    <div className="mt-1 flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-mono text-[#0F2042]">{currency || "USD"} {(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}

/* ---------- Summary sidebar ---------- */
function SummarySidebar({ c }) {
  const [audit, setAudit] = useState([]);
  useEffect(() => { api.get(`/contracts/${c.id}/audit`, { params: { limit: 25 } }).then(({ data }) => setAudit(data.items || [])).catch(() => {}); }, [c.id, c.version]);
  const stMeta = STATUS_META[c.status] || STATUS_META.draft;
  return (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-testid="ctr-sidebar">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// live summary</div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${stMeta.cls}`}>{stMeta.label}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-700">v{c.version}</span>
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <SumRow k="Contract value" v={`${c.pricing?.currency || "USD"} ${(c.pricing?.contract_value || 0).toLocaleString()}`}/>
          <SumRow k="Modules"        v={(c.modules || []).filter((m) => m.enabled).length}/>
          <SumRow k="Days remaining" v={c.days_remaining ?? "—"}/>
          <SumRow k="Health score"   v={<span className={`font-bold ${c.health_score >= 75 ? "text-emerald-600" : c.health_score >= 50 ? "text-amber-600" : "text-rose-600"}`}>{c.health_score}%</span>}/>
          <SumRow k="Owner"          v={c.contract_owner || "—"}/>
          <SumRow k="Renewal"        v={c.renewal_type || "manual"}/>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="ctr-sidebar-audit">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// recent activity</div>
        {audit.length === 0 ? <p className="mt-2 text-xs text-slate-400">No activity yet.</p> : (
          <ol className="mt-2 space-y-2">
            {audit.slice(0, 10).map((a) => (
              <li key={a.id} className="text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#F97316]"/>
                  <span className="font-bold text-[#0F2042]">{a.action}</span>
                </div>
                <div className="ml-3 text-slate-500">{a.user_email} · {new Date(a.at).toLocaleString()}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </aside>
  );
}
function SumRow({ k, v }) { return <div className="flex items-center justify-between gap-2"><span className="text-slate-500">{k}</span><span className="font-semibold text-[#0F2042]">{v}</span></div>; }

/* ---------- Global audit ---------- */
function AuditGlobalView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/contracts", { params: { limit: 500 } });
        const ids = (data.items || []).map((c) => c.id);
        const chunks = await Promise.all(ids.slice(0, 30).map((id) => api.get(`/contracts/${id}/audit`).then(({ data: d }) => (d.items || []).map((a) => ({ ...a, _cn: (data.items.find((c) => c.id === id) || {}).contract_number }))).catch(() => [])));
        const merged = chunks.flat().sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 300);
        setRows(merged);
      } finally { setLoading(false); }
    })();
  }, []);
  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white" data-testid="ctr-audit-global">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-left">User</th><th className="px-3 py-2 text-left">Contract</th><th className="px-3 py-2 text-left">Action</th><th className="px-3 py-2 text-left">Reason</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="px-3 py-2 text-slate-500">{new Date(a.at).toLocaleString()}</td>
              <td className="px-3 py-2 text-slate-700">{a.user_email}</td>
              <td className="px-3 py-2 font-mono text-[10px] text-slate-500">{a._cn}</td>
              <td className="px-3 py-2 font-bold text-[#0F2042]">{a.action}</td>
              <td className="px-3 py-2 text-slate-500">{a.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Small primitives ---------- */
function Field({ label, children, cls = "" }) {
  return <label className={`block ${cls}`}><FieldLabel>{label}</FieldLabel><div className="mt-1">{children}</div></label>;
}
function FieldLabel({ children }) { return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{children}</span>; }
function TxtField({ label, v, on, test, type = "text", cls = "", disabled = false }) {
  return (
    <label className={`block ${cls}`}>
      <FieldLabel>{label}</FieldLabel>
      <input type={type} value={v || ""} disabled={disabled} onChange={(e) => on(e.target.value)} data-testid={test}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316] disabled:bg-slate-50 disabled:text-slate-500"/>
    </label>
  );
}
function NumField({ label, v, on, test }) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <input type="number" min="0" step="0.01" value={v ?? 0} onChange={(e) => on(parseFloat(e.target.value || 0))} data-testid={test}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
    </label>
  );
}
function MiniNum({ label, v, on }) {
  return (
    <label className="block">
      <span className="text-[9px] font-bold uppercase text-slate-500">{label}</span>
      <input type="number" min="0" step="1" value={v ?? 0} onChange={(e) => on(parseInt(e.target.value || 0))}
        className="mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px]"/>
    </label>
  );
}
function Card({ title, testId, children }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm" data-testid={testId}>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// {title.split(" · ")[0]}</div>
      <h3 className="font-display text-lg font-semibold text-[#0F2042]">{title.split(" · ")[1] || title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}
function ActionBtn({ children, onClick, testId, tone }) {
  const bg = tone === "emerald"
    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
    : tone === "orange"
      ? "bg-gradient-to-r from-[#F97316] to-[#FB923C] text-white hover:brightness-110"
      : tone === "ghost"
        ? "border border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0F2042] hover:text-[#0F2042]"
        : "border border-slate-200 bg-white text-slate-700 hover:border-[#F97316] hover:text-[#F97316]";
  return (
    <button onClick={onClick} data-testid={testId} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider shadow-sm ${bg}`}>{children}</button>
  );
}

/* ---------- Email-to-client modal ---------- */
function EmailContractModal({ contractId, contract, onClose }) {
  const [to, setTo] = useState(contract?.client?.email || "");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState(
    `${contract?.contract_number || "Contract"} — ${contract?.agreement_name || ""} for your review`,
  );
  const [body, setBody] = useState(
    `<p>Hi ${contract?.client?.name || "there"},</p>
<p>Please find attached your contract <b>${contract?.contract_number || ""}</b> — <b>${contract?.agreement_name || ""}</b> for your review.</p>
<p>Do reach out with any questions or if you would like to schedule a walkthrough. We look forward to partnering with you.</p>
<p style="margin-top:14px;">Warm regards,<br/>${contract?.contract_owner || "Projexino"}</p>`,
  );
  const [includePdf, setIncludePdf] = useState(true);
  const [tone, setTone] = useState("warm");
  const [aiBusy, setAiBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const draftWithAI = async () => {
    setAiBusy(true);
    try {
      const { data } = await api.post(`/contracts/${contractId}/ai-draft-email`, { tone, extra_notes: "" });
      if (data.subject) setSubject(data.subject);
      if (data.body_html) setBody(data.body_html);
      toast.success("Xino AI drafted the email");
    } catch (e) { toast.error(formatApiError(e)); }
    setAiBusy(false);
  };
  const send = async () => {
    const toList = to.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    const ccList = cc.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!toList.length) return toast.error("Please add at least one recipient in 'To'");
    if (!subject.trim()) return toast.error("Subject is required");
    setSendBusy(true);
    try {
      await api.post(`/contracts/${contractId}/email`, {
        to: toList, cc: ccList, subject, body_html: body, include_pdf: includePdf,
      });
      toast.success(`Contract emailed to ${toList[0]}${toList.length > 1 ? ` +${toList.length - 1}` : ""}`);
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setSendBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" data-testid="ctr-email-modal">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// contracts · email to client</div>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">Email contract to client</h3>
            <p className="mt-0.5 text-xs text-slate-500">Sends the branded PDF as an attachment via your connected Gmail. Draft the body yourself or let Xino AI compose it for you.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" data-testid="ctr-email-close"><X size={18}/></button>
        </div>

        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <FieldLabel>To (comma or newline separated)</FieldLabel>
              <input value={to} onChange={(e) => setTo(e.target.value)} data-testid="ctr-email-to"
                placeholder="client@example.com" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
            </label>
            <label className="block">
              <FieldLabel>CC (optional)</FieldLabel>
              <input value={cc} onChange={(e) => setCc(e.target.value)} data-testid="ctr-email-cc"
                placeholder="cfo@example.com" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
            </label>
          </div>

          <label className="block">
            <FieldLabel>Subject</FieldLabel>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="ctr-email-subject"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/>
          </label>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// xino ai drafter</span>
              <select value={tone} onChange={(e) => setTone(e.target.value)} data-testid="ctr-email-tone"
                className="rounded-full border border-violet-200 bg-white px-2 py-1 text-[10px] font-bold uppercase">
                <option value="warm">Warm</option>
                <option value="professional">Professional</option>
                <option value="brief">Brief</option>
              </select>
              <button onClick={draftWithAI} disabled={aiBusy} data-testid="ctr-email-ai-draft"
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold uppercase text-white disabled:opacity-60">
                {aiBusy ? <Loader2 size={10} className="animate-spin"/> : <Sparkles size={10}/>} Draft with Xino AI
              </button>
              <button onClick={() => setShowPreview((v) => !v)} data-testid="ctr-email-toggle-preview"
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-bold uppercase text-slate-600">
                {showPreview ? "Edit HTML" : "Preview"}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">AI generates a friendly, contextual email using this contract&apos;s details. Feel free to tweak the output before sending.</p>
          </div>

          <label className="block">
            <FieldLabel>Message body (HTML)</FieldLabel>
            {showPreview ? (
              <div className="mt-1 min-h-[240px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm" data-testid="ctr-email-preview" dangerouslySetInnerHTML={{ __html: body }}/>
            ) : (
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={11} data-testid="ctr-email-body"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-[12px] leading-relaxed"/>
            )}
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={includePdf} onChange={(e) => setIncludePdf(e.target.checked)} data-testid="ctr-email-include-pdf" className="h-4 w-4 accent-[#F97316]"/>
            <span>Attach the branded contract PDF</span>
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <div className="text-[10px] text-slate-400">
            Sends via connected Gmail · replies land in the sender&apos;s inbox
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
            <button onClick={send} disabled={sendBusy} data-testid="ctr-email-send"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-1.5 text-xs font-bold uppercase text-white disabled:opacity-60">
              {sendBusy ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>} Send email
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
