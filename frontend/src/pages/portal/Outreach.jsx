/**
 * Outreach.jsx — Lead Outreach & Sales Engagement (Delivery 1-3 of Group C).
 *
 * Tabs:
 *   • Dashboard  — KPIs from /outreach/summary
 *   • Leads      — full CRUD, CSV paste import, dedupe, bulk actions, detail drawer
 *   • Pipeline   — drag-and-drop Kanban (New → … → Won / Lost) with engagement score
 *   • Campaigns  — list + create + launch (immediate send via Gmail)
 *   • Sequences  — D0/D4/D8/D15 drip builder + enroll leads
 *   • AI Writer  — Gemini-powered cold-email drafter
 *   • Reports    — opens/clicks/replies/sent over time
 *
 * Reuses existing email templates (loaded from /email/templates).
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, Users as UsersIcon, Send, KanbanSquare, Search,
  UploadCloud, Plus, Trash2, X, Loader2, Mail, Tag as TagIcon,
  Sparkles, MailOpen, MousePointerClick, MessageSquare, Megaphone, Copy,
  Clock, Activity, FileText, BarChart3, Zap, StopCircle, PlayCircle,
  Map as MapIcon, Globe, Phone, ExternalLink, Star, Inbox, RefreshCw, Reply,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import EmailTemplates from "@/pages/portal/EmailTemplates";
import { XinoEstimatesTab } from "@/pages/portal/XinoEstimatesTab";
import EmailCampaigns from "@/pages/portal/EmailCampaigns";
import { EmailBlastModal, CampaignAnalyticsModal } from "@/pages/portal/OutreachBlast";

const STATUS_PALETTE = {
  cold: { bg: "bg-slate-100", text: "text-slate-600" },
  warm: { bg: "bg-amber-100", text: "text-amber-700" },
  hot: { bg: "bg-rose-100", text: "text-rose-700" },
  qualified: { bg: "bg-emerald-100", text: "text-emerald-700" },
  unqualified: { bg: "bg-slate-200", text: "text-slate-500" },
};
const STAGES = [
  { key: "new_lead", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "engaged", label: "Engaged" },
  { key: "meeting_scheduled", label: "Meeting" },
  { key: "proposal_sent", label: "Proposal" },
  { key: "negotiation", label: "Negotiation" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

const TABS = [
  { v: "dashboard", label: "Dashboard", icon: TrendingUp },
  { v: "leads", label: "Lead Management", icon: UsersIcon },
  { v: "xino", label: "Xino Estimates", icon: Sparkles },
  { v: "pipeline", label: "Pipeline", icon: KanbanSquare },
  { v: "inbox", label: "Inbox", icon: Inbox },
  { v: "templates", label: "Templates", icon: FileText },
  { v: "campaigns", label: "Campaigns", icon: Megaphone },
  { v: "sequences", label: "Sequences", icon: Clock },
  { v: "ai", label: "AI Writer", icon: Sparkles },
  { v: "reports", label: "Reports", icon: BarChart3 },
];

export default function Outreach() {
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") || "dashboard";
  const validTabs = TABS.map((t) => t.v);
  const [tab, setTabState] = useState(validTabs.includes(initialTab) ? initialTab : "dashboard");
  const [drawerLead, setDrawerLead] = useState(null);
  const setTab = (v) => {
    setTabState(v);
    setParams((p) => { p.set("tab", v); return p; }, { replace: true });
  };
  const jumpTab = (v, extra = {}) => {
    setParams((p) => {
      p.set("tab", v);
      // Carry deep-link filters across as query params
      Object.entries(extra).forEach(([k, val]) => {
        if (val) p.set(k, val); else p.delete(k);
      });
      return p;
    }, { replace: true });
    setTabState(v);
  };
  // Honour URL changes (e.g. from /email-campaigns redirect)
  useEffect(() => {
    const t = params.get("tab");
    if (t && validTabs.includes(t) && t !== tab) setTabState(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  // Deep-link a lead drawer via ?lead=<id>
  useEffect(() => {
    const l = params.get("lead");
    if (l && l !== drawerLead) setDrawerLead(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  return (
    <div data-testid="page-outreach" className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 md:p-7 shadow-sm">
        <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// growth · email · outreach</div>
            <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Email &amp; Outreach Hub</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              One workspace for Lead Discovery (Google Maps), Pipeline, Templates, Mass Email, External Outreach,
              Drip Sequences, AI cold-email writer and Engagement Reports — all firing through your connected Gmail.
            </p>
          </div>
        </div>
        <div className="relative mt-5 inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button key={t.v} data-testid={`out-tab-${t.v}`} onClick={() => setTab(t.v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "dashboard" && <DashboardTab onOpenLead={setDrawerLead} onJumpTab={jumpTab} />}
      {tab === "leads" && <LeadsTab onOpenLead={setDrawerLead} initialStatus={params.get("status") || ""} />}
      {tab === "xino" && <XinoEstimatesTab />}
      {tab === "pipeline" && <PipelineTab onOpenLead={setDrawerLead} highlightStage={params.get("stage") || ""} />}
      {tab === "inbox" && <InboxTab onOpenLead={setDrawerLead} />}
      {tab === "templates" && <div data-testid="out-tab-templates-pane"><EmailTemplates /></div>}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "sequences" && <SequencesTab />}
      {tab === "ai" && <AiWriterTab />}
      {tab === "reports" && <ReportsTab />}
      <AnimatePresence>
        {drawerLead && <LeadDrawer leadId={drawerLead} onClose={() => {
          setDrawerLead(null);
          setParams((p) => { p.delete("lead"); return p; }, { replace: true });
        }} />}
      </AnimatePresence>
    </div>
  );
}

/* =================== Dashboard =================== */
function DashboardTab({ onOpenLead, onJumpTab }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    api.get("/outreach/summary").then(({ data }) => setStats(data)).catch(() => {});
  }, []);
  if (!stats) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  const go = (tab, extra = {}) => onJumpTab && onJumpTab(tab, extra);
  return (
    <div className="space-y-4" data-testid="out-dashboard">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={UsersIcon} label="Total leads" value={stats.total_leads} accent="orange"
          testId="dash-total-leads" onClick={() => go("leads")} />
        <Stat icon={Send} label="Emails sent today" value={stats.sent_today} accent="violet"
          testId="dash-sent-today" onClick={() => go("reports")} />
        <Stat icon={MailOpen} label="Open rate" value={`${stats.open_rate}%`} accent="emerald"
          testId="dash-open-rate" onClick={() => go("reports")} />
        <Stat icon={MessageSquare} label="Reply rate" value={`${stats.reply_rate}%`} accent="rose"
          testId="dash-reply-rate" onClick={() => go("inbox")} />
        <Stat icon={MousePointerClick} label="Click rate" value={`${stats.click_rate}%`}
          testId="dash-click-rate" onClick={() => go("reports")} />
        <Stat icon={Megaphone} label="Active campaigns" value={stats.active_campaigns} accent="violet"
          testId="dash-active-campaigns" onClick={() => go("campaigns")} />
        <Stat icon={Sparkles} label="Hot leads" value={stats.statuses?.hot || 0} accent="rose"
          testId="dash-hot-leads" onClick={() => go("leads", { status: "hot" })} />
        <Stat icon={Sparkles} label="Qualified" value={stats.statuses?.qualified || 0} accent="emerald"
          testId="dash-qualified" onClick={() => go("leads", { status: "qualified" })} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// pipeline distribution</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {STAGES.map((s) => (
            <button key={s.key} onClick={() => go("pipeline", { stage: s.key })}
              data-testid={`dash-stage-${s.key}`}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center transition hover:border-[#F97316] hover:bg-orange-50/50 hover:shadow-sm">
              <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{s.label}</div>
              <div className="font-display mt-1 text-xl font-bold text-[#0F2042]">{stats.pipeline?.[s.key] || 0}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent = "slate", onClick, testId }) {
  const map = {
    orange: ["#F97316", "#FFEDD5"], violet: ["#7C3AED", "#EDE9FE"],
    emerald: ["#10B981", "#D1FAE5"], rose: ["#EF4444", "#FEE2E2"],
    slate: ["#0F2042", "#E2E8F0"],
  };
  const [fg, bg] = map[accent] || map.slate;
  const interactive = !!onClick;
  return (
    <button type="button" onClick={onClick} disabled={!interactive} data-testid={testId}
      className={`rounded-2xl border border-slate-200 bg-white p-4 text-left transition ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md" : "cursor-default"}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: bg, color: fg }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="font-display text-xl font-bold text-[#0F2042]">{value}</div>
        </div>
      </div>
    </button>
  );
}

/* =================== Leads =================== */
function LeadsTab({ onOpenLead, initialStatus = "" }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [status, setStatus] = useState(initialStatus || "");
  const [selected, setSelected] = useState(new Set());
  const [show, setShow] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showSaveList, setShowSaveList] = useState(false);
  const [showBlast, setShowBlast] = useState(false);
  const [savingList, setSavingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [enriching, setEnriching] = useState(false);

  const saveAsList = async () => {
    const name = newListName.trim();
    if (!name) return toast.error("Give the list a name");
    if (selected.size === 0) return toast.error("Select leads first");
    setSavingList(true);
    try {
      await api.post("/outreach/lead-lists", { name, lead_ids: [...selected], source: "leads_tab" });
      toast.success(`Saved ${selected.size} lead(s) as "${name}"`);
      setShowSaveList(false);
      setNewListName("");
      setSelected(new Set());
    } catch (e) { toast.error(formatApiError(e)); }
    setSavingList(false);
  };

  const enrichSynthetic = async () => {
    if (!window.confirm("Crawl each Google-Maps lead's website to find emails + phones? (≈ a few seconds per lead)")) return;
    setEnriching(true);
    try {
      const { data } = await api.post("/outreach/leads/enrich-batch", { only_synthetic: true, limit: 25 });
      toast.success(`Enriched ${data.enriched}/${data.total} leads`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    setEnriching(false);
  };
  const enrichOne = async (id) => {
    try {
      const { data } = await api.post(`/outreach/leads/${id}/enrich`);
      if ((data.emails || []).length || (data.phones || []).length) {
        toast.success(`Found ${data.emails?.length || 0} email(s), ${data.phones?.length || 0} phone(s)`);
      } else {
        toast.message("No emails/phones found on the website");
      }
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/outreach/leads", { params: { q, stage, status } });
      setList(data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, stage, status]);

  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.email}"?`)) return;
    try { await api.delete(`/outreach/leads/${l.id}`); toast.success("Removed"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const toggleSel = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const selAll = () => setSelected(selected.size === list.length ? new Set() : new Set(list.map((l) => l.id)));

  const bulk = async (action, value) => {
    if (selected.size === 0) { toast.error("Select leads first"); return; }
    if (action === "delete" && !window.confirm(`Delete ${selected.size} leads?`)) return;
    try {
      const { data } = await api.post("/outreach/leads/bulk", { action, ids: [...selected], value });
      toast.success(`Bulk ${action} → ${data.updated || data.deleted || 0} leads`);
      setSelected(new Set());
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-3" data-testid="out-leads">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / email / company…"
            data-testid="leads-search"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
        </div>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" data-testid="leads-stage-filter">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" data-testid="leads-status-filter">
          <option value="">All temps</option>
          <option value="cold">Cold</option><option value="warm">Warm</option>
          <option value="hot">Hot</option><option value="qualified">Qualified</option>
        </select>
        <button onClick={() => setShowDiscover(true)} className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100" data-testid="leads-discover-gmaps">
          <MapIcon size={12}/> Discover from Google Maps
        </button>
        <button onClick={enrichSynthetic} disabled={enriching} className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 hover:border-violet-400 hover:bg-violet-100 disabled:opacity-50" data-testid="leads-enrich-all">
          {enriching ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Enrich Maps leads
        </button>
        <button onClick={() => setShowImport(true)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]" data-testid="leads-import">
          <UploadCloud size={12}/> Import CSV
        </button>
        <button onClick={() => setShow(true)} className="btn-primary text-xs" data-testid="leads-add">
          <Plus size={14}/> Add lead
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs">
          <span className="font-bold text-[#0F2042]">{selected.size} selected</span>
          <button onClick={() => bulk("delete")} className="rounded-full bg-rose-600 px-3 py-1 font-bold text-white">Delete</button>
          <button onClick={() => setShowSaveList(true)} data-testid="leads-save-to-list"
            className="rounded-full bg-violet-600 px-3 py-1 font-bold text-white">💾 Save as Lead List</button>
          <button onClick={() => setShowBlast(true)} data-testid="leads-email-blast"
            className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1 font-bold text-white"><Mail size={11} /> Email blast</button>
          <select onChange={(e) => e.target.value && bulk("stage", e.target.value)} className="rounded-full border border-slate-200 bg-white px-2 py-1">
            <option value="">Move to stage…</option>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select onChange={(e) => e.target.value && bulk("status", e.target.value)} className="rounded-full border border-slate-200 bg-white px-2 py-1">
            <option value="">Set status…</option>
            <option value="cold">Cold</option><option value="warm">Warm</option>
            <option value="hot">Hot</option><option value="qualified">Qualified</option>
          </select>
          <input placeholder="Add tag…" onKeyDown={(e) => { if (e.key === "Enter" && e.target.value.trim()) { bulk("tag", e.target.value.trim()); e.target.value = ""; } }}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" />
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
        ) : list.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500">No leads yet — import CSV or add your first lead.</div>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-10 px-3 py-3"><input type="checkbox" checked={selected.size === list.length && list.length > 0} onChange={selAll}/></th>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Company</th>
                <th className="px-3 py-3">Industry / Country</th>
                <th className="px-3 py-3">Stage</th>
                <th className="px-3 py-3">Temp</th>
                <th className="px-3 py-3">Score</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((l) => {
                const pal = STATUS_PALETTE[l.status] || STATUS_PALETTE.cold;
                return (
                  <tr key={l.id} className="border-t border-slate-100 hover:bg-orange-50/30" data-testid={`lead-row-${l.email}`}>
                    <td className="px-3 py-2.5"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} data-testid={`lead-select-${l.email}`}/></td>
                    <td className="px-3 py-2.5 font-bold text-[#0F2042]">
                      <button onClick={() => onOpenLead && onOpenLead(l.id)} data-testid={`lead-open-${l.email}`} className="text-left hover:text-[#F97316] hover:underline">
                        {[l.first_name, l.last_name].filter(Boolean).join(" ") || "—"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {l.email && (l.email.includes("@google-maps.lead") || l.email.startsWith("noemail+"))
                        ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800" title="Synthetic email — click Enrich to scrape the real one from the website">needs enrichment</span>
                        : l.email}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{l.phone || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 text-slate-600">{l.company || "—"}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{[l.industry, l.country].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {STAGES.find((s) => s.key === l.pipeline_stage)?.label || l.pipeline_stage}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${pal.bg} ${pal.text}`}>{l.status}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <ScoreBadge score={l.score || 0} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {l.website && (
                          <button onClick={() => enrichOne(l.id)} title="Crawl website for email + phone"
                            data-testid={`lead-enrich-${l.id}`}
                            className="rounded border border-violet-200 p-1 text-violet-600 hover:border-violet-400 hover:bg-violet-50"><Sparkles size={12}/></button>
                        )}
                        <button onClick={() => remove(l)} className="rounded border border-slate-200 p-1 text-rose-500 hover:border-rose-300 hover:bg-rose-50" data-testid={`lead-delete-${l.email}`}><Trash2 size={12}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {show && <AddLeadModal onClose={() => setShow(false)} onSaved={load} />}
      {showBlast && <EmailBlastModal leadIds={[...selected]} onClose={() => setShowBlast(false)}
        onSent={() => { setSelected(new Set()); load(); }} />}
      {showImport && <ImportCsvModal onClose={() => setShowImport(false)} onImported={load} />}
      {showDiscover && <DiscoverGMapsModal onClose={() => setShowDiscover(false)} onImported={load} />}
      {showSaveList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
             data-testid="save-lead-list-modal"
             onClick={() => setShowSaveList(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">💾 Save selection as Lead List</div>
            <h3 className="mt-1 font-display text-lg font-bold text-[#0F2042]">{selected.size} lead(s) selected</h3>
            <p className="mt-1 text-xs text-slate-500">Give this list a name — you can pick it later from the AI Writer / Campaign dropdown to scope a cold-email draft to these leads only.</p>
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)}
              data-testid="save-list-name"
              placeholder="e.g. Q1 Bangalore restaurants"
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
              autoFocus/>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSaveList(false)} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700">Cancel</button>
              <button onClick={saveAsList} disabled={savingList} data-testid="save-list-confirm"
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-50">
                {savingList ? <Loader2 size={11} className="animate-spin"/> : null}Save list
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddLeadModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ email: "", first_name: "", last_name: "", company: "", industry: "", country: "", phone: "", linkedin_url: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.post("/outreach/leads", form); toast.success("Lead added"); onSaved(); onClose(); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Add lead</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[
            ["first_name", "First name"], ["last_name", "Last name"],
            ["email", "Email *"], ["company", "Company"],
            ["industry", "Industry"], ["country", "Country"],
            ["phone", "Phone"], ["linkedin_url", "LinkedIn URL"],
          ].map(([k, label]) => (
            <label key={k} className={k === "linkedin_url" ? "col-span-2" : ""}>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
              <input data-testid={`lead-field-${k}`} value={form[k]} onChange={(e) => setForm({...form, [k]: e.target.value})}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy || !form.email} className="btn-primary text-xs" data-testid="lead-save">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ImportCsvModal({ onClose, onImported }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");

  const onFilePick = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error("CSV too large (max 8 MB)"); return; }
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!["csv", "tsv", "txt"].includes(ext)) {
      toast.error("Please pick a .csv or .tsv file");
      return;
    }
    setFileName(f.name);
    const text = await f.text();
    setCsv(text);
    toast.success(`Loaded ${f.name} — click Import to upload`);
  };

  const downloadTemplate = () => {
    const template = "First Name,Last Name,Email,Company,Industry,Country,Phone,LinkedIn URL,Source,Tags\nJane,Smith,jane@acme.com,Acme,Healthcare,UK,+44 20 1234 5678,https://linkedin.com/in/jane,manual,warm;founder\nJohn,Doe,john@beta.com,Beta,SaaS,US,+1 415 555 0100,,,cold";
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "projexino-leads-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/outreach/leads/import", { csv_text: csv });
      setResult(data);
      toast.success(`${data.created} added · ${data.skipped_duplicates} dupes · ${data.failed_invalid} invalid`);
      onImported();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Import leads (CSV)</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Upload a <code>.csv</code> file <b>or</b> paste rows below. Recognised headers:
          &nbsp;<code>First Name, Last Name, Email, Company, Industry, Country, Phone, LinkedIn URL, Source, Tags</code>.
          Duplicate emails are skipped automatically.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316]" data-testid="leads-csv-file-pick">
            <UploadCloud size={12}/> Choose CSV file
            <input type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values,text/plain" className="hidden" onChange={onFilePick} data-testid="leads-csv-file-input"/>
          </label>
          <button onClick={downloadTemplate} data-testid="leads-csv-template"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
            📥 Download template
          </button>
          {fileName && <span className="text-[11px] text-slate-500">📎 {fileName}</span>}
        </div>
        <textarea value={csv} onChange={(e) => { setCsv(e.target.value); setFileName(""); }} rows={10}
          data-testid="leads-csv-textarea"
          placeholder={"First Name,Last Name,Email,Company,Industry,Country\nJane,Smith,jane@acme.com,Acme,Healthcare,UK\nJohn,Doe,john@beta.com,Beta,SaaS,US"}
          className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs outline-none focus:border-[#F97316]" />
        {csv && <div className="mt-1 text-right text-[10px] text-slate-400">{csv.split("\n").filter((l) => l.trim()).length - 1} data rows detected</div>}
        {result && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs">
            ✅ Created <b>{result.created}</b> · Skipped duplicates <b>{result.skipped_duplicates}</b> · Invalid <b>{result.failed_invalid}</b> · Total processed <b>{result.total}</b>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Close</button>
          <button onClick={submit} disabled={busy || !csv.trim()} className="btn-primary text-xs" data-testid="leads-csv-import">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <UploadCloud size={12}/>} Import
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== Discover from Google Maps =================== */
function DiscoverGMapsModal({ onClose, onImported }) {
  const [query, setQuery] = useState("");
  const [noWebsiteOnly, setNoWebsiteOnly] = useState(false);
  const [regionCode, setRegionCode] = useState("IN");
  const [results, setResults] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSummary, setLastSummary] = useState(null);

  const examples = [
    'dentists in Mumbai without website',
    'wedding photographers in London',
    'small accounting firms Bangalore',
    'plumbers in Austin Texas no website',
    'gyms in Dubai',
  ];

  const search = async (pageToken = null) => {
    if (!query.trim()) { toast.error("Type a search query first"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/outreach/discover/google-maps", {
        query: query.trim(),
        no_website_only: noWebsiteOnly,
        page_token: pageToken,
        region_code: regionCode || null,
        auto_import: true,
      });
      const next = pageToken ? [...results, ...(data.leads || [])] : (data.leads || []);
      setResults(next);
      setNextToken(data.next_page_token || null);
      setLastSummary({ imported: data.imported, skipped: data.skipped_duplicates, total: data.total_returned });
      if (data.imported > 0) {
        toast.success(`Imported ${data.imported} lead${data.imported === 1 ? "" : "s"}${data.skipped_duplicates ? ` · ${data.skipped_duplicates} duplicate${data.skipped_duplicates === 1 ? "" : "s"} skipped` : ""}`);
        onImported && onImported();
      } else if (data.total_returned === 0) {
        toast.info("No results matched. Try a different query.");
      } else {
        toast.info(`${data.total_returned} result(s) · all duplicates skipped.`);
      }
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-emerald-50 p-2 text-emerald-600"><MapIcon size={18}/></div>
            <div>
              <h3 className="font-display text-lg font-semibold text-[#0F2042]">Discover leads from Google Maps</h3>
              <p className="text-xs text-slate-500">Type a plain-English query — industry, location, even constraints like &quot;no website&quot;. Results auto-import as leads with phone, address, website &amp; maps URL.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" data-testid="gmaps-close"><X size={16}/></button>
        </div>

        <div className="mt-4 space-y-3">
          <Label l="Search query">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(null); }}
              placeholder='e.g. "dentists in Mumbai without website"'
              data-testid="gmaps-query"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400" autoFocus/>
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label l="Region (ISO 2-letter, optional)">
              <input value={regionCode} onChange={(e) => setRegionCode(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="IN / US / GB …"
                data-testid="gmaps-region"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400"/>
            </Label>
            <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs">
              <input type="checkbox" checked={noWebsiteOnly} onChange={(e) => setNoWebsiteOnly(e.target.checked)} data-testid="gmaps-no-website"/>
              <span className="font-bold text-slate-700">Only show businesses <span className="text-emerald-700">without a website</span></span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-400">
            <span className="uppercase tracking-wider">Try:</span>
            {examples.map((ex) => (
              <button key={ex} onClick={() => setQuery(ex)} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600 transition hover:bg-emerald-100 hover:text-emerald-700">
                {ex}
              </button>
            ))}
          </div>

          <button onClick={() => search(null)} disabled={loading || !query.trim()}
            data-testid="gmaps-search"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-200 hover:shadow-emerald-300 disabled:opacity-50">
            {loading ? <Loader2 size={14} className="animate-spin"/> : <Search size={14}/>}
            {loading ? "Searching Google Maps…" : "Discover leads"}
          </button>
        </div>

        {lastSummary && (
          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs" data-testid="gmaps-summary">
            <span className="font-bold text-emerald-700">Imported {lastSummary.imported}</span>
            <span className="text-emerald-600"> · {lastSummary.skipped} duplicate{lastSummary.skipped === 1 ? "" : "s"} skipped</span>
            <span className="text-emerald-500"> · {lastSummary.total} returned</span>
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {results.map((r) => (
              <div key={r.place_id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-sm" data-testid={`gmaps-result-${r.place_id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm font-semibold text-[#0F2042]">{r.name || "—"}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{r.address || "—"}</div>
                  </div>
                  {r.rating != null && (
                    <div className="flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <Star size={9} className="fill-amber-500 text-amber-500"/>{r.rating} <span className="text-amber-400">({r.rating_count || 0})</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
                  {r.phone && (
                    <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 text-slate-600 hover:text-[#F97316]">
                      <Phone size={10}/>{r.phone}
                    </a>
                  )}
                  {r.website ? (
                    <a href={r.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 truncate text-slate-600 hover:text-[#F97316]">
                      <Globe size={10}/>{(r.website || "").replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-600">
                      <Globe size={9}/>no website
                    </span>
                  )}
                  {r.maps_url && (
                    <a href={r.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-slate-500 hover:text-emerald-600">
                      <ExternalLink size={10}/>Maps
                    </a>
                  )}
                  {r.primary_type && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] uppercase tracking-wider text-slate-600">{r.primary_type.replace(/_/g, " ")}</span>
                  )}
                </div>
              </div>
            ))}
            {nextToken && (
              <button onClick={() => search(nextToken)} disabled={loading}
                data-testid="gmaps-load-more"
                className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-500 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50">
                {loading ? "Loading…" : "Load more results"}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50/40 px-3 py-2 text-[10px] text-amber-700">
          Imported leads carry <code>source=google_maps</code> &amp; tag <code>google-maps</code>. Phone &amp; address are real; email is a placeholder (<code>noemail+…@google-maps.lead</code>) — you should enrich emails before launching campaigns.
        </div>
      </div>
    </div>
  );
}

/* =================== Unified Campaigns (Mass Email + Outreach) =================== */
// Combines two backends into one workspace:
//   • "outreach"  → /outreach/campaigns — audience pulled from outreach_leads (BD/cold).
//   • "mass"      → /email/campaigns    — audience = employees + clients + custom emails.
// Listed together in one feed with an audience-type badge. Single composer button asks the
// operator which audience to target, then opens the appropriate dedicated modal.
function CampaignsTab() {
  const [outList, setOutList] = useState([]);
  const [massList, setMassList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [outComposer, setOutComposer] = useState(false);
  const [massComposer, setMassComposer] = useState(false);
  const [massDetail, setMassDetail] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [filter, setFilter] = useState("all"); // all | outreach | mass

  const load = async () => {
    setLoading(true);
    try {
      const [out, mass] = await Promise.all([
        api.get("/outreach/campaigns").catch(() => ({ data: [] })),
        api.get("/email/campaigns").catch(() => ({ data: [] })),
      ]);
      setOutList(out.data || []);
      setMassList(mass.data || []);
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Normalise both shapes into a single render-friendly row.
  const combined = useMemo(() => {
    const rows = [];
    if (filter !== "mass") {
      outList.forEach((c) => rows.push({
        ...c,
        _kind: "outreach",
        _audience_label: `Leads · ${c.type?.replace("_", " ") || "cold"}`,
        _to: c.stats?.to || 0,
        _sent: c.stats?.sent || 0,
        _failed: c.stats?.failed || 0,
        _opened: c.stats?.opened || 0,
        _ts: c.launched_at || c.created_at || "",
      }));
    }
    if (filter !== "outreach") {
      massList.forEach((c) => rows.push({
        ...c,
        _kind: "mass",
        _audience_label: "Employees / Clients",
        _to: c.total_recipients || 0,
        _sent: c.delivered || 0,
        _failed: c.failed || 0,
        _opened: 0,
        _ts: c.scheduled_at || c.created_at || "",
      }));
    }
    return rows.sort((a, b) => (b._ts || "").localeCompare(a._ts || ""));
  }, [outList, massList, filter]);

  const launchOutreach = async (c) => {
    if (!window.confirm(`Launch "${c.name}"? Emails will be sent immediately via your connected Gmail.`)) return;
    try {
      const { data } = await api.post(`/outreach/campaigns/${c.id}/launch`);
      toast.success(`Sent ${data.stats.sent}/${data.stats.to} (${data.stats.failed} failed)`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const cloneOutreach = async (c) => {
    try { await api.post(`/outreach/campaigns/${c.id}/clone`); toast.success("Cloned as draft"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const removeOutreach = async (c) => {
    if (!window.confirm(`Delete campaign "${c.name}"?`)) return;
    try { await api.delete(`/outreach/campaigns/${c.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const sendMassNow = async (c) => {
    if (!window.confirm(`Send "${c.name}" now to ${c._to} recipients?`)) return;
    try { await api.post(`/email/campaigns/${c.id}/send`); toast.success("Queued for sending"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Send failed"); }
  };
  const removeMass = async (c) => {
    if (!window.confirm(`Delete "${c.name}"?`)) return;
    try { await api.delete(`/email/campaigns/${c.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Delete failed"); }
  };

  return (
    <div className="space-y-3" data-testid="out-campaigns">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {[
            { v: "all", label: `All (${outList.length + massList.length})` },
            { v: "outreach", label: `Outreach (${outList.length})` },
            { v: "mass", label: `Mass Email (${massList.length})` },
          ].map((f) => (
            <button key={f.v} onClick={() => setFilter(f.v)} data-testid={`camp-filter-${f.v}`}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${filter === f.v ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowPicker(true)} className="btn-primary text-xs" data-testid="campaign-new">
          <Plus size={14}/> New campaign
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : combined.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          No campaigns yet. Click <b>New campaign</b> to broadcast to employees / clients, or run cold-outreach to leads.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {combined.map((c) => (
            <UnifiedCampaignCard
              key={`${c._kind}-${c.id}`}
              c={c}
              onLaunch={() => c._kind === "outreach" ? launchOutreach(c) : sendMassNow(c)}
              onClone={c._kind === "outreach" ? () => cloneOutreach(c) : undefined}
              onRemove={() => c._kind === "outreach" ? removeOutreach(c) : removeMass(c)}
              onOpen={c._kind === "mass" ? () => setMassDetail(c) : () => setAnalytics(c)}
            />
          ))}
        </div>
      )}

      {showPicker && (
        <NewCampaignPicker
          onClose={() => setShowPicker(false)}
          onPick={(kind) => {
            setShowPicker(false);
            if (kind === "outreach") setOutComposer(true);
            else setMassComposer(true);
          }}
        />
      )}
      {outComposer && <NewCampaignModal onClose={() => setOutComposer(false)} onSaved={load} />}
      {massComposer && (
        <MassEmailComposerWrapper
          onClose={() => setMassComposer(false)}
          onCreated={() => { setMassComposer(false); load(); }}
        />
      )}
      {massDetail && (
        <MassEmailDetailWrapper id={massDetail.id} onClose={() => setMassDetail(null)} onChange={load} />
      )}
      {analytics && (
        <CampaignAnalyticsModal campaign={analytics} onClose={() => setAnalytics(null)} onChanged={load} />
      )}
    </div>
  );
}

function NewCampaignPicker({ onClose, onPick }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" data-testid="camp-picker">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// new campaign</div>
            <h3 className="font-display mt-1 text-lg font-semibold text-[#0F2042]">Who are you emailing?</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button onClick={() => onPick("outreach")} data-testid="camp-pick-outreach"
            className="group rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-emerald-50/60 to-white p-5 text-left transition hover:border-emerald-400 hover:shadow-lg">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700"><TrendingUp size={18}/></div>
              <div className="font-display text-base font-semibold text-[#0F2042]">Outreach to Leads</div>
            </div>
            <p className="mt-2 text-xs text-slate-600">Cold outreach, follow-up or partnership emails to leads in your <b>outreach_leads</b> pipeline. Audience filterable by industry / country / tags / stage / temperature.</p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
              <li>• Personalises {`{{FirstName}} {{CompanyName}} {{Industry}}`}</li>
              <li>• Tracks opens / clicks / replies</li>
              <li>• Engagement score auto-updates</li>
            </ul>
          </button>
          <button onClick={() => onPick("mass")} data-testid="camp-pick-mass"
            className="group rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-violet-50/60 to-white p-5 text-left transition hover:border-violet-400 hover:shadow-lg">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-violet-100 p-2 text-violet-700"><Megaphone size={18}/></div>
              <div className="font-display text-base font-semibold text-[#0F2042]">Mass Email Broadcast</div>
            </div>
            <p className="mt-2 text-xs text-slate-600">Send announcements, product updates or notifications to <b>employees</b>, <b>clients</b> (from Finance) or any custom email list. Schedule for later or send now.</p>
            <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
              <li>• AI-draft body from a one-line prompt</li>
              <li>• Schedule, pause, queue per-recipient delivery</li>
              <li>• Reply-to + From-name overrides</li>
            </ul>
          </button>
        </div>
      </div>
    </div>
  );
}

function UnifiedCampaignCard({ c, onLaunch, onClone, onRemove, onOpen }) {
  const isOutreach = c._kind === "outreach";
  const statusBg = c.status === "completed" || c.status === "sent"
    ? "bg-emerald-100 text-emerald-700"
    : c.status === "paused" || c.status === "partial"
      ? "bg-amber-100 text-amber-700"
      : c.status === "failed"
        ? "bg-rose-100 text-rose-700"
        : c.status === "scheduled" || c.status === "sending"
          ? "bg-sky-100 text-sky-700"
          : "bg-slate-100 text-slate-600";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      onClick={onOpen}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${onOpen ? "cursor-pointer hover:border-violet-300 hover:shadow-md" : ""}`}
      data-testid={`campaign-card-${c.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[#0F2042]">{c.name}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isOutreach ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}`}>
              {isOutreach ? <><TrendingUp size={9} className="mr-0.5 inline"/> Outreach</> : <><Megaphone size={9} className="mr-0.5 inline"/> Mass</>}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBg}`}>{c.status}</span>
            <span className="text-[10px] text-slate-500">{c._audience_label}</span>
            {c._ts && <span className="text-[10px] text-slate-400">· {c._ts.slice(0, 10)}</span>}
          </div>
          {c.subject && <p className="mt-2 truncate text-xs text-slate-500">📧 {c.subject}</p>}
        </div>
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          {onClone && <button onClick={onClone} className="rounded border border-slate-200 p-1 text-slate-500 hover:text-[#0F2042]" title="Clone"><Copy size={12}/></button>}
          <button onClick={onRemove} className="rounded border border-slate-200 p-1 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 size={12}/></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <MiniStat n={c._to} l="Audience" />
        <MiniStat n={c._sent} l="Sent" color="emerald" />
        {isOutreach ? <MiniStat n={c._opened} l="Opened" color="violet" /> : <MiniStat n={c._to - c._sent - c._failed} l="Queued" color="violet" />}
        <MiniStat n={c._failed} l="Failed" color="rose" />
      </div>
      {(c.status === "draft" || c.status === "ready" || c.status === "paused") && (
        <button onClick={(e) => { e.stopPropagation(); onLaunch(); }}
          data-testid={`campaign-launch-${c.id}`}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-[#F97316] to-[#FB923C] py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow hover:shadow-md">
          {isOutreach ? "Launch outreach" : "Send now"}
        </button>
      )}
    </motion.div>
  );
}

// Wraps the full EmailCampaigns page in a slide-in modal. It brings its own
// composer + list + detail — we just give it space and refresh on close.
function MassEmailComposerWrapper({ onClose, onCreated }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} data-testid="mass-email-composer-wrap">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// mass email · employees &amp; clients</div>
            <h3 className="font-display text-base font-semibold text-[#0F2042]">Broadcast workspace</h3>
            <p className="text-[11px] text-slate-500">Use the &quot;New Campaign&quot; button below to start composing. Close this dialog when done — your outreach list will refresh.</p>
          </div>
          <button onClick={() => { onCreated && onCreated(); onClose(); }} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" data-testid="mass-composer-close"><X size={16}/></button>
        </div>
        <div className="max-h-[82vh] overflow-y-auto p-5">
          <EmailCampaigns />
        </div>
      </div>
    </div>
  );
}

function MassEmailDetailWrapper({ id, onClose }) {
  // Auto-click the corresponding row to open EmailCampaigns' built-in detail modal.
  useEffect(() => {
    const tries = [40, 200, 500, 900];
    const timers = tries.map((delay) => setTimeout(() => {
      const row = document.querySelector(`.mass-detail-wrap [data-testid="campaign-row-${id}"]`);
      row?.click();
    }, delay));
    return () => timers.forEach(clearTimeout);
  }, [id]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Mass Email · details</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mass-detail-wrap max-h-[82vh] overflow-y-auto p-5">
          <EmailCampaigns />
        </div>
      </div>
    </div>
  );
}

/* =================== Legacy CampaignsTab removed (replaced by unified above) =================== */

function CampaignCard({ c, onLaunch, onClone, onRemove }) {
  const stats = c.stats || {};
  const isFinal = c.status === "completed";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`campaign-card-${c.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[#0F2042]">{c.name}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">{c.type.replace("_", " ")}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${c.status === "completed" ? "bg-emerald-100 text-emerald-700" : c.status === "paused" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
              {c.status}
            </span>
            {c.launched_at && <span className="text-slate-500">Sent {c.launched_at.slice(0, 10)}</span>}
          </div>
          {c.subject && <p className="mt-2 truncate text-xs text-slate-500">📧 {c.subject}</p>}
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onClone} className="rounded border border-slate-200 p-1 text-slate-500 hover:text-[#0F2042]" title="Clone"><Copy size={12}/></button>
          <button onClick={onRemove} className="rounded border border-slate-200 p-1 text-rose-500 hover:bg-rose-50" title="Delete"><Trash2 size={12}/></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        <MiniStat n={stats.to} l="Audience" />
        <MiniStat n={stats.sent} l="Sent" color="emerald" />
        <MiniStat n={stats.opened} l="Opened" color="violet" />
        <MiniStat n={stats.failed} l="Failed" color="rose" />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {!isFinal && (
          <button onClick={onLaunch} data-testid={`campaign-launch-${c.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow">
            <Send size={11}/> Launch now
          </button>
        )}
      </div>
    </motion.div>
  );
}

function MiniStat({ n = 0, l, color }) {
  const map = { emerald: "text-emerald-700", violet: "text-violet-700", rose: "text-rose-700" };
  return (
    <div className="rounded bg-slate-50 px-2 py-1">
      <div className={`font-display text-base font-bold ${map[color] || "text-[#0F2042]"}`}>{n}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{l}</div>
    </div>
  );
}

function NewCampaignModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("cold_outreach");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState("");
  const [audKind, setAudKind] = useState("filter");
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCountry, setFilterCountry] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/email/templates").then(({ data }) => setTemplates(data || [])).catch(() => {});
    api.get("/outreach/lead-lists").then(({ data }) => setLists(data || [])).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      let audience;
      if (audKind === "lead_list") {
        if (!listId) { toast.error("Pick a lead list"); setBusy(false); return; }
        audience = { kind: "lead_list", lead_list_id: listId };
      } else if (audKind === "all") {
        audience = { kind: "all" };
      } else {
        audience = { kind: "filter", filter: { industry: filterIndustry, country: filterCountry, status: filterStatus } };
      }
      await api.post("/outreach/campaigns", {
        name, type, subject, body_html: body,
        template_id: templateId,
        audience,
      });
      toast.success("Campaign created as draft");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">New campaign</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Label l="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="UK Healthcare Cold Q1"
              data-testid="camp-name"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
          </Label>
          <Label l="Type">
            <select value={type} onChange={(e) => setType(e.target.value)} data-testid="camp-type"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="cold_outreach">Cold Outreach</option>
              <option value="follow_up">Follow-up</option>
              <option value="partnership">Partnership</option>
              <option value="re_engagement">Re-engagement</option>
            </select>
          </Label>
          <Label l="Email template (optional)">
            <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} data-testid="camp-template"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">— Inline subject / body —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Label>
          <Label l="Audience">
            <select value={audKind} onChange={(e) => setAudKind(e.target.value)} data-testid="camp-audience-kind"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="filter">Filter leads</option>
              <option value="lead_list">Lead List</option>
              <option value="all">All leads</option>
            </select>
          </Label>
        </div>
        {audKind === "lead_list" && (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3">
            <Label l="Pick a saved Lead List">
              <select value={listId} onChange={(e) => setListId(e.target.value)} data-testid="camp-lead-list"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="">— Select a list —</option>
                {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.lead_count || (l.lead_ids || []).length} leads)</option>)}
              </select>
            </Label>
            {lists.length === 0 && (
              <p className="mt-2 text-[11px] text-amber-700">No Lead Lists yet — go to <b>Lead Management</b>, select some leads, and click <b>💾 Save as Lead List</b>.</p>
            )}
          </div>
        )}
        {audKind === "filter" && (
          <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
            <input value={filterIndustry} onChange={(e) => setFilterIndustry(e.target.value)} placeholder="Industry (e.g. Healthcare)"
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#F97316]"/>
            <input value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} placeholder="Country (e.g. UK)"
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#F97316]"/>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
              <option value="">Any temperature</option>
              <option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option>
            </select>
          </div>
        )}
        {!templateId && (
          <>
            <Label l="Subject" className="mt-3">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Hi {{FirstName}} — quick idea for {{CompanyName}}"
                data-testid="camp-subject"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
            </Label>
            <Label l="Body (HTML)">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8}
                data-testid="camp-body"
                placeholder="<p>Hi {{FirstName}}, we work with {{Industry}} teams in {{Country}}…</p>"
                className="w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs outline-none focus:border-[#F97316]"/>
            </Label>
            <p className="text-[10px] text-slate-400">Variables: {`{{FirstName}}, {{LastName}}, {{CompanyName}}, {{Industry}}, {{Country}}, {{Email}}`}</p>
          </>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy || !name || (!templateId && (!subject || !body))} className="btn-primary text-xs" data-testid="camp-save">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Save draft
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ l, children, className = "" }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{l}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* =================== Pipeline Kanban (drag-and-drop) =================== */
function PipelineTab({ onOpenLead, highlightStage = "" }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lists, setLists] = useState([]);
  const [activeList, setActiveList] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/outreach/leads", { params: { limit: 1000 } });
      setLeads(data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => {
    load();
    api.get("/outreach/lead-lists").then(({ data }) => setLists(data || [])).catch(() => {});
  }, []);

  // Auto-scroll to the highlighted stage when deep-linked
  useEffect(() => {
    if (!highlightStage) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-testid="pipeline-stage-${highlightStage}"]`);
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }, 300);
    return () => clearTimeout(t);
  }, [highlightStage, leads.length]);

  const visibleLeads = useMemo(() => {
    if (!activeList) return leads;
    const lst = lists.find((x) => x.id === activeList);
    if (!lst) return leads;
    const idSet = new Set(lst.lead_ids || []);
    return leads.filter((l) => idSet.has(l.id));
  }, [leads, lists, activeList]);

  const grouped = useMemo(() => {
    const m = Object.fromEntries(STAGES.map((s) => [s.key, []]));
    visibleLeads.forEach((l) => {
      const k = l.pipeline_stage || "new_lead";
      (m[k] || m.new_lead).push(l);
    });
    // Sort each column by score desc so hot leads bubble up.
    Object.values(m).forEach((arr) => arr.sort((a, b) => (b.score || 0) - (a.score || 0)));
    return m;
  }, [visibleLeads]);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;
    const newStage = destination.droppableId;
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === draggableId ? { ...l, pipeline_stage: newStage } : l)));
    try {
      await api.patch(`/outreach/leads/${draggableId}`, { pipeline_stage: newStage });
      toast.success(`Moved to ${STAGES.find((s) => s.key === newStage)?.label}`);
    } catch (e) {
      toast.error(formatApiError(e));
      load();
    }
  };

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;
  return (
    <div data-testid="out-pipeline" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200" data-testid="pipeline-list-tabs">
          <button onClick={() => setActiveList("")} data-testid="pipeline-list-all"
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${!activeList ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
            All Leads ({leads.length})
          </button>
          {lists.map((lst) => (
            <button key={lst.id} onClick={() => setActiveList(lst.id)} data-testid={`pipeline-list-${lst.id}`}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${activeList === lst.id ? "bg-[#F97316] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
              {lst.name} ({lst.lead_count ?? (lst.lead_ids || []).length})
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-slate-500">Drag a lead card across stages to update its pipeline. Sorted by engagement score within each column.{activeList ? " Showing only the selected lead list." : ""}</p>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-3">
          {STAGES.map((s) => (
            <Droppable droppableId={s.key} key={s.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef} {...provided.droppableProps}
                  data-testid={`pipeline-stage-${s.key}`}
                  className={`flex w-72 min-w-[18rem] flex-col rounded-2xl border p-2 transition ${snapshot.isDraggingOver ? "border-[#F97316] bg-orange-50/40" : highlightStage === s.key ? "border-[#F97316] bg-orange-50/40 ring-2 ring-[#F97316]/30" : "border-slate-200 bg-slate-50"}`}
                >
                  <div className="mb-2 flex items-center justify-between px-2">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{s.label}</div>
                    <div className="font-mono-pj text-xs text-slate-400">{(grouped[s.key] || []).length}</div>
                  </div>
                  <div className="space-y-2">
                    {(grouped[s.key] || []).map((l, idx) => (
                      <Draggable key={l.id} draggableId={l.id} index={idx}>
                        {(p, snap) => (
                          <div
                            ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                            onClick={() => onOpenLead && onOpenLead(l.id)}
                            data-testid={`pipeline-card-${l.id}`}
                            className={`cursor-pointer rounded-xl border bg-white p-3 text-xs shadow-sm transition hover:border-[#F97316] hover:shadow-md ${snap.isDragging ? "rotate-1 border-[#F97316] shadow-lg" : "border-slate-200"}`}
                          >
                            <div className="flex items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-bold text-[#0F2042]">{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.email}</div>
                                <div className="truncate text-[10px] text-slate-500">{l.company || l.email}</div>
                              </div>
                              <ScoreBadge score={l.score || 0} />
                            </div>
                            {(l.tags || []).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {l.tags.slice(0, 3).map((t) => (
                                  <span key={t} className="inline-flex items-center gap-0.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600"><TagIcon size={8}/>{t}</span>
                                ))}
                              </div>
                            )}
                            <div className="mt-2 flex items-center justify-between">
                              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${(STATUS_PALETTE[l.status] || STATUS_PALETTE.cold).bg} ${(STATUS_PALETTE[l.status] || STATUS_PALETTE.cold).text}`}>{l.status}</span>
                              {l.country && <span className="text-[9px] text-slate-400">{l.country}</span>}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

/* =================== Engagement score badge =================== */
function ScoreBadge({ score }) {
  const n = Number(score) || 0;
  let label = "cold", bg = "bg-slate-100", text = "text-slate-600";
  if (n >= 75) { label = "hot"; bg = "bg-rose-100"; text = "text-rose-700"; }
  else if (n >= 40) { label = "warm"; bg = "bg-amber-100"; text = "text-amber-700"; }
  else if (n >= 15) { label = "engaged"; bg = "bg-emerald-100"; text = "text-emerald-700"; }
  return (
    <span title={`Engagement score ${n}`} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${bg} ${text}`}>
      <Sparkles size={9}/> {n}
    </span>
  );
}

/* =================== Inbox (cross-lead inbound replies) =================== */
function InboxTab({ onOpenLead }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/outreach/inbox", { params: { limit: 100 } });
      setItems(data.items || []);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const refreshInbox = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/outreach/replies/sync");
      toast.success(`Found ${data.matched || 0} new replies`);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
    setSyncing(false);
  };

  return (
    <div className="space-y-3" data-testid="out-inbox">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// inbound replies</div>
          <p className="mt-1 text-xs text-slate-500">Lead replies pulled from Gmail. Auto-refreshes every 15 min — click <b>Refresh inbox</b> to pull now.</p>
        </div>
        <button onClick={refreshInbox} disabled={syncing} data-testid="inbox-refresh"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-[#F97316] hover:text-[#F97316] disabled:opacity-60">
          {syncing ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>} Refresh inbox
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="inbox-empty">
          No inbound replies yet. They appear here as soon as a lead replies to one of your outreach emails.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100">
            {items.map((r) => (
              <li key={r.id} className="cursor-pointer p-4 transition hover:bg-orange-50/30"
                data-testid={`inbox-row-${r.id}`}
                onClick={() => onOpenLead && onOpenLead(r.lead_id)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-sm font-bold text-[#0F2042]">{r.lead_name}</span>
                      {r.company && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">{r.company}</span>}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{r.lead_email}</div>
                    {r.subject && <div className="mt-1.5 line-clamp-1 text-xs font-semibold text-[#0F2042]">📩 {r.subject}</div>}
                    {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{r.snippet}</p>}
                  </div>
                  <div className="text-right text-[10px] text-slate-400">{new Date(r.at).toLocaleString()}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* =================== Lead Detail Drawer (activity timeline + score + note) =================== */
const EVENT_META = {
  sent: { icon: Send, color: "text-violet-600", label: "Email sent" },
  opened: { icon: MailOpen, color: "text-emerald-600", label: "Email opened" },
  clicked: { icon: MousePointerClick, color: "text-orange-600", label: "Link clicked" },
  replied: { icon: MessageSquare, color: "text-rose-600", label: "Replied" },
  note: { icon: FileText, color: "text-slate-600", label: "Note" },
  stage_change: { icon: Activity, color: "text-slate-600", label: "Stage change" },
  bounced: { icon: X, color: "text-rose-500", label: "Bounced" },
  unsubscribed: { icon: StopCircle, color: "text-slate-500", label: "Unsubscribed" },
};

function LeadDrawer({ leadId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerTab, setDrawerTab] = useState("activity"); // activity | conversation
  const [conv, setConv] = useState({ messages: [] });
  const [convLoading, setConvLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/outreach/leads/${leadId}/full`);
      setData(r.data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [leadId]);

  const loadConversation = async () => {
    setConvLoading(true);
    try {
      const r = await api.get(`/outreach/leads/${leadId}/conversation`);
      setConv(r.data || { messages: [] });
    } catch (e) { toast.error(formatApiError(e)); }
    setConvLoading(false);
  };
  useEffect(() => {
    if (drawerTab === "conversation") loadConversation();
    // eslint-disable-next-line
  }, [drawerTab, leadId]);

  const replyCount = (data?.events || []).filter((e) => e.kind === "replied").length;
  const sentCount = (data?.events || []).filter((e) => e.kind === "sent").length;

  const addNote = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/outreach/leads/${leadId}/note`, { note: note.trim() });
      setNote("");
      refresh();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const lead = data?.lead || {};
  const events = data?.events || [];
  const enrolments = data?.sequence_enrolments || [];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm"
      />
      <motion.div
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 30 }}
        data-testid="lead-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// lead detail</div>
            <h3 className="font-display mt-1 text-base font-semibold text-[#0F2042]">
              {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.email || "Lead"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100" data-testid="lead-drawer-close"><X size={16}/></button>
        </div>
        {loading || !data ? (
          <div className="flex flex-1 items-center justify-center"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 text-xs">
              <div><div className="text-[9px] uppercase text-slate-500">Email</div><div className="break-all font-bold text-[#0F2042]">{lead.email}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Company</div><div className="font-bold text-[#0F2042]">{lead.company || "—"}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Industry</div><div className="text-[#0F2042]">{lead.industry || "—"}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Country</div><div className="text-[#0F2042]">{lead.country || "—"}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Stage</div><div className="text-[#0F2042]">{STAGES.find((s) => s.key === lead.pipeline_stage)?.label || lead.pipeline_stage}</div></div>
              <div><div className="text-[9px] uppercase text-slate-500">Score</div><div><ScoreBadge score={lead.score || 0} /></div></div>
            </div>

            {/* Drawer-level tabs: Activity vs Conversation */}
            <div className="mt-3 inline-flex gap-1 rounded-full bg-slate-100 p-1">
              <button onClick={() => setDrawerTab("activity")} data-testid="drawer-tab-activity"
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${drawerTab === "activity" ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
                Activity
              </button>
              <button onClick={() => setDrawerTab("conversation")} data-testid="drawer-tab-conversation"
                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${drawerTab === "conversation" ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
                Conversation
                {replyCount > 0 && <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-700">{replyCount}</span>}
              </button>
            </div>

            {drawerTab === "activity" && (<>
            {enrolments.length > 0 && (
              <div className="mt-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// active sequences</div>
                <div className="mt-2 space-y-1">
                  {enrolments.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px]" data-testid={`drawer-enrol-${e.id}`}>
                      <span className="truncate text-slate-700">Step {e.current_step + 1} · {e.status}</span>
                      {e.status === "active" && (
                        <button onClick={async () => { try { await api.post(`/outreach/sequences/enrol/${e.id}/stop`); toast.success("Stopped"); refresh(); } catch (err) { toast.error(formatApiError(err)); } }}
                          className="rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700 hover:bg-rose-200" data-testid={`drawer-stop-${e.id}`}>Stop</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// activity timeline</div>
              <ol className="mt-3 space-y-3">
                {events.length === 0 && <li className="text-xs text-slate-400">No activity yet.</li>}
                {events.map((e) => {
                  const meta = EVENT_META[e.kind] || { icon: Activity, color: "text-slate-500", label: e.kind };
                  const Ic = meta.icon;
                  return (
                    <li key={e.id} className="relative flex gap-3 pl-1" data-testid={`drawer-event-${e.id}`}>
                      <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 ${meta.color}`}>
                        <Ic size={12}/>
                      </span>
                      <div className="flex-1 text-xs">
                        <div className="font-semibold text-[#0F2042]">{meta.label}{e.campaign_name && <span className="text-slate-500"> · {e.campaign_name}</span>}</div>
                        {e.meta?.note && <div className="mt-0.5 text-slate-600">{e.meta.note}</div>}
                        {e.meta?.subject && <div className="mt-0.5 truncate text-slate-500">{e.meta.subject}</div>}
                        <div className="text-[10px] text-slate-400">{new Date(e.at).toLocaleString()}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// add note</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Spoke with CTO, very interested…"
                data-testid="drawer-note-input"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs outline-none focus:border-[#F97316]"/>
              <div className="mt-2 flex justify-end">
                <button onClick={addNote} disabled={busy || !note.trim()} className="btn-primary text-xs" data-testid="drawer-note-save">
                  {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Add note
                </button>
              </div>
            </div>
            </>)}

            {drawerTab === "conversation" && (
              <ConversationPanel
                leadId={leadId}
                lead={lead}
                conv={conv}
                loading={convLoading}
                sentCount={sentCount}
                replyCount={replyCount}
                onAfterSend={async () => { await loadConversation(); refresh(); }}
              />
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}

/* =================== Conversation Panel (per-lead message thread + AI reply) =================== */
function ConversationPanel({ leadId, lead, conv, loading, sentCount, replyCount, onAfterSend }) {
  const [composer, setComposer] = useState(false);
  const [tone, setTone] = useState("professional");
  const [guidance, setGuidance] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);

  const messages = conv?.messages || [];
  const lastReply = [...messages].reverse().find((m) => m.direction === "in");

  const draftWithAI = async () => {
    if (sentCount === 0 && replyCount === 0) {
      toast.error("No history to analyse — send an email first.");
      return;
    }
    setDrafting(true);
    try {
      const { data } = await api.post(`/outreach/leads/${leadId}/ai-reply`, {
        tone, guidance: guidance.trim(),
      });
      setSubject(data.subject || "");
      setBody(data.body_html || "");
      toast.success("Reply drafted by AI — edit before sending");
      setComposer(true);
    } catch (e) { toast.error(formatApiError(e)); }
    setDrafting(false);
  };

  const sendReply = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    try {
      await api.post(`/outreach/leads/${leadId}/send-reply`, { subject, body_html: body });
      toast.success("Reply sent");
      setSubject(""); setBody(""); setComposer(false); setGuidance("");
      onAfterSend && onAfterSend();
    } catch (e) { toast.error(formatApiError(e)); }
    setSending(false);
  };

  return (
    <div className="mt-3 space-y-3" data-testid="drawer-conversation">
      {/* AI reply controls */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-3">
        <div className="flex items-center gap-2">
          <Sparkles size={12} className="text-violet-700"/>
          <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// ai reply assistant</div>
        </div>
        <p className="mt-1 text-[11px] text-slate-600">Analyses {sentCount + replyCount} message(s) in this thread and drafts a contextual reply you can edit before sending.</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Tone</div>
            <select value={tone} onChange={(e) => setTone(e.target.value)} data-testid="ai-reply-tone"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#7C3AED]">
              <option value="friendly">Friendly</option>
              <option value="professional">Professional</option>
              <option value="concise">Concise</option>
              <option value="persuasive">Persuasive</option>
            </select>
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">Extra guidance (optional)</div>
            <input value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="e.g. confirm a meeting Friday 4pm IST"
              data-testid="ai-reply-guidance"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-[#7C3AED]"/>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <button onClick={draftWithAI} disabled={drafting} data-testid="ai-reply-draft"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white shadow disabled:opacity-60">
            {drafting ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
            Draft AI reply
          </button>
          <button onClick={() => { setComposer((v) => !v); if (!subject) setSubject(lastReply?.subject ? (lastReply.subject.toLowerCase().startsWith("re:") ? lastReply.subject : `Re: ${lastReply.subject}`) : ""); }}
            data-testid="ai-reply-toggle-composer"
            className="text-[11px] font-bold text-violet-700 hover:underline">
            {composer ? "Hide composer" : "Write manually"}
          </button>
        </div>
      </div>

      {/* Composer */}
      {composer && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/40 p-3" data-testid="drawer-reply-composer">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// composer</div>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
            data-testid="reply-subject"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#F97316]"/>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="<p>Hi {{FirstName}}, …</p>"
            data-testid="reply-body"
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-[11px] outline-none focus:border-[#F97316]"/>
          <p className="mt-1 text-[10px] text-slate-400">HTML accepted. Variables: {`{{FirstName}}, {{CompanyName}}, {{Industry}}, {{Country}}`}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => { setBody(""); setSubject(""); }} className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600">Clear</button>
            <button onClick={sendReply} disabled={sending || !subject.trim() || !body.trim()} data-testid="reply-send"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow disabled:opacity-60">
              {sending ? <Loader2 size={12} className="animate-spin"/> : <Send size={11}/>}
              Send reply
            </button>
          </div>
        </div>
      )}

      {/* Thread */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">// thread ({messages.length})</div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-[#F97316]"/></div>
        ) : messages.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
            No messages yet. Once a campaign / sequence sends an email here and the lead replies, the thread shows up.
          </div>
        ) : (
          <ul className="mt-2 space-y-3">
            {messages.map((m) => (
              <li key={m.id} data-testid={`conv-msg-${m.id}`}
                className={`rounded-xl border p-3 text-xs ${m.direction === "out" ? "border-orange-100 bg-orange-50/40" : "border-rose-100 bg-rose-50/40"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {m.direction === "out"
                      ? <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-700"><Send size={9}/> Sent</span>
                      : <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-bold text-rose-700"><Reply size={9}/> Reply</span>}
                    {m.subject && <span className="line-clamp-1 font-bold text-[#0F2042]">{m.subject}</span>}
                  </div>
                  <span className="text-[9px] text-slate-400">{new Date(m.at).toLocaleString()}</span>
                </div>
                {(m.body_html || m.body_text || m.snippet) && (
                  <div className="mt-2 max-h-40 overflow-y-auto rounded bg-white p-2">
                    {m.body_html ? (
                      <div className="prose prose-xs max-w-none text-[11px] text-slate-700" dangerouslySetInnerHTML={{ __html: m.body_html }} />
                    ) : (
                      <p className="whitespace-pre-wrap text-[11px] text-slate-700">{m.body_text || m.snippet}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
/* =================== Sequences (D0/D4/D8/D15 drip builder) =================== */
function SequencesTab() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [enrollFor, setEnrollFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/outreach/sequences"); setList(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const remove = async (s) => {
    if (!window.confirm(`Delete sequence "${s.name}" and all enrolments?`)) return;
    try { await api.delete(`/outreach/sequences/${s.id}`); toast.success("Deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const runNow = async () => {
    try {
      const { data } = await api.post("/outreach/sequences/run-now");
      toast.success(`Processed ${data.processed || 0} due steps`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-3" data-testid="out-sequences">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={runNow} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]" data-testid="seq-run-now">
          <PlayCircle size={12}/> Run due steps now
        </button>
        <button onClick={() => setShow(true)} className="btn-primary text-xs" data-testid="seq-new"><Plus size={14}/> New sequence</button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500">
          No sequences yet. Build a Day 0 / 4 / 8 / 15 drip to nurture cold leads automatically.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" data-testid={`seq-card-${s.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-base font-semibold text-[#0F2042]">{s.name}</h3>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">{(s.steps || []).length} step{(s.steps || []).length === 1 ? "" : "s"} · {s.status}</div>
                </div>
                <button onClick={() => remove(s)} className="rounded border border-slate-200 p-1 text-rose-500 hover:bg-rose-50" data-testid={`seq-delete-${s.id}`}><Trash2 size={12}/></button>
              </div>
              <ol className="mt-3 space-y-1.5">
                {(s.steps || []).map((st, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs">
                    <span className="flex h-5 w-10 shrink-0 items-center justify-center rounded-full bg-[#0F2042] text-[9px] font-bold text-white">D{st.day_offset}</span>
                    <span className="line-clamp-1 text-slate-600">{st.subject}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex justify-end">
                <button onClick={() => setEnrollFor(s)} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow" data-testid={`seq-enroll-${s.id}`}>
                  <Zap size={10}/> Enroll leads
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {show && <NewSequenceModal onClose={() => setShow(false)} onSaved={load} />}
      {enrollFor && <EnrollSequenceModal seq={enrollFor} onClose={() => setEnrollFor(null)} />}
    </div>
  );
}

function NewSequenceModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState([
    { day_offset: 0, subject: "Hi {{FirstName}} — quick idea for {{CompanyName}}", body_html: "<p>Hi {{FirstName}},</p><p>We help {{Industry}} teams ship faster.</p><p>Worth a quick chat?</p>" },
    { day_offset: 4, subject: "Re: quick idea for {{CompanyName}}", body_html: "<p>Following up on my note — keen on a 15-min call?</p>" },
    { day_offset: 8, subject: "One last thought, {{FirstName}}", body_html: "<p>Sharing a 2-min case study that might help.</p>" },
    { day_offset: 15, subject: "Closing the loop", body_html: "<p>I'll stop reaching out — open to reconnect anytime.</p>" },
  ]);
  const [busy, setBusy] = useState(false);

  const updateStep = (i, k, v) => setSteps((p) => p.map((s, idx) => (idx === i ? { ...s, [k]: v } : s)));
  const addStep = () => setSteps((p) => [...p, { day_offset: (p[p.length - 1]?.day_offset || 0) + 7, subject: "", body_html: "" }]);
  const removeStep = (i) => setSteps((p) => p.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!name.trim() || steps.length === 0) { toast.error("Name + at least one step required"); return; }
    setBusy(true);
    try {
      await api.post("/outreach/sequences", { name: name.trim(), steps });
      toast.success("Sequence saved");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">New drip sequence</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <Label l="Sequence name" className="mt-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="UK Healthcare Drip"
            data-testid="seq-name"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
        </Label>
        <div className="mt-4 space-y-3">
          {steps.map((st, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/40 p-3" data-testid={`seq-step-${i}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase text-slate-500">Step {i + 1}</span>
                  <label className="text-[10px] uppercase text-slate-400">Day offset</label>
                  <input type="number" min={0} max={365} value={st.day_offset}
                    onChange={(e) => updateStep(i, "day_offset", parseInt(e.target.value || "0", 10))}
                    data-testid={`seq-step-${i}-day`}
                    className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#F97316]"/>
                </div>
                {steps.length > 1 && (
                  <button onClick={() => removeStep(i)} className="rounded border border-slate-200 p-1 text-rose-500 hover:bg-rose-50"><Trash2 size={11}/></button>
                )}
              </div>
              <input value={st.subject} onChange={(e) => updateStep(i, "subject", e.target.value)} placeholder="Subject"
                data-testid={`seq-step-${i}-subject`}
                className="mt-2 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-[#F97316]"/>
              <textarea value={st.body_html} onChange={(e) => updateStep(i, "body_html", e.target.value)} rows={3} placeholder="<p>Hi {{FirstName}}…</p>"
                data-testid={`seq-step-${i}-body`}
                className="mt-2 w-full rounded border border-slate-200 bg-white p-2 font-mono text-[11px] outline-none focus:border-[#F97316]"/>
            </div>
          ))}
          <button onClick={addStep} className="w-full rounded-xl border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-500 hover:border-[#F97316] hover:text-[#F97316]" data-testid="seq-add-step">
            <Plus size={12} className="inline"/> Add step
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary text-xs" data-testid="seq-save">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Save sequence
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrollSequenceModal({ seq, onClose }) {
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");

  useEffect(() => {
    api.get("/outreach/leads", { params: { limit: 500 } })
      .then(({ data }) => setLeads(data.items || []))
      .catch((e) => toast.error(formatApiError(e)))
      .finally(() => setLoading(false));
    api.get("/outreach/lead-lists").then(({ data }) => setLists(data || [])).catch(() => {});
  }, []);

  const visible = useMemo(() => {
    if (!q.trim()) return leads;
    const t = q.toLowerCase();
    return leads.filter((l) =>
      (l.email || "").toLowerCase().includes(t) ||
      (l.company || "").toLowerCase().includes(t) ||
      (`${l.first_name || ""} ${l.last_name || ""}`).toLowerCase().includes(t),
    );
  }, [q, leads]);

  const toggle = (id) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const applyList = async (lid) => {
    setListId(lid);
    if (!lid) return;
    try {
      const { data } = await api.get(`/outreach/lead-lists/${lid}`);
      const ids = (data?.lead_ids || []).filter(Boolean);
      setSelected(new Set(ids));
      toast.success(`Selected ${ids.length} leads from list`);
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const submit = async () => {
    try {
      if (listId && selected.size === 0) {
        // Enroll the entire list server-side
        const { data } = await api.post(`/outreach/sequences/${seq.id}/enroll`, { lead_list_id: listId });
        toast.success(`Enrolled ${data.enrolled} · skipped ${data.skipped}`);
      } else {
        if (selected.size === 0) { toast.error("Select at least one lead"); return; }
        const { data } = await api.post(`/outreach/sequences/${seq.id}/enroll`, { lead_ids: [...selected] });
        toast.success(`Enrolled ${data.enrolled} · skipped ${data.skipped}`);
      }
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Enroll leads — {seq.name}</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="border-b border-violet-100 bg-violet-50/40 px-5 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// pick a saved lead list</div>
          <select value={listId} onChange={(e) => applyList(e.target.value)} data-testid="enroll-lead-list"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#7C3AED]">
            <option value="">— Or pick individuals below —</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.lead_count || (l.lead_ids || []).length} leads)</option>)}
          </select>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…"
          data-testid="enroll-search"
          className="mx-5 mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? <Loader2 size={20} className="mx-auto animate-spin text-[#F97316]"/> :
           visible.length === 0 ? <div className="py-4 text-center text-xs text-slate-400">No matches.</div> :
           visible.map((l) => (
             <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 text-xs hover:bg-orange-50/40" data-testid={`enroll-lead-${l.email}`}>
               <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)}/>
               <div className="min-w-0 flex-1">
                 <div className="truncate font-bold text-[#0F2042]">{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.email}</div>
                 <div className="truncate text-[10px] text-slate-500">{l.email} · {l.company || "—"}</div>
               </div>
               <ScoreBadge score={l.score || 0}/>
             </label>
           ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <div className="text-xs text-slate-500">{selected.size} selected{listId && selected.size > 0 ? " (from list)" : ""}</div>
          <button onClick={submit} disabled={selected.size === 0 && !listId} className="btn-primary text-xs" data-testid="enroll-submit">
            <Zap size={12}/> Enroll
          </button>
        </div>
      </div>
    </div>
  );
}

/* =================== AI Cold-Email Writer =================== */
function AiWriterTab() {
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [valueProp, setValueProp] = useState("");
  const [kind, setKind] = useState("cold");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [lists, setLists] = useState([]);
  const [listId, setListId] = useState("");
  const [listPreview, setListPreview] = useState([]);

  useEffect(() => { api.get("/outreach/lead-lists").then(({ data }) => setLists(data || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (!listId) { setListPreview([]); return; }
    api.get(`/outreach/lead-lists/${listId}/leads`).then(({ data }) => {
      setListPreview(data.leads || []);
      // Auto-fill industry/country from the dominant value among list members
      const leads = data.leads || [];
      if (leads.length && !industry) {
        const inds = leads.map((l) => l.industry).filter(Boolean);
        if (inds.length) setIndustry(inds[0]);
      }
      if (leads.length && !country) {
        const cs = leads.map((l) => l.country).filter(Boolean);
        if (cs.length) setCountry(cs[0]);
      }
    }).catch(() => {});
    // eslint-disable-next-line
  }, [listId]);

  const generate = async () => {
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/outreach/ai/write", {
        industry, country, value_prop: valueProp, kind,
        lead_list_id: listId || undefined,
        lead_count: listPreview.length || undefined,
      });
      setResult({ ...data, _list: listId ? lists.find((l) => l.id === listId) : null });
      toast.success(listId ? `Draft generated for "${(lists.find((l) => l.id === listId) || {}).name}"` : "Draft generated");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const copy = (t) => { navigator.clipboard.writeText(t); toast.success("Copied"); };

  return (
    <div className="space-y-4" data-testid="out-ai">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// AI cold-email writer</div>
        <p className="mt-1 text-xs text-slate-500">Powered by Gemini via the Emergent LLM key. Output uses <code>{`{{FirstName}}`}</code>, <code>{`{{CompanyName}}`}</code> etc. so personalisation kicks in at send time.</p>

        {/* Lead-list picker — scope the draft to a saved list */}
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <Label l="Lead List (optional — scope the cold email to a saved list of leads)">
            <select value={listId} onChange={(e) => setListId(e.target.value)} data-testid="ai-lead-list"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="">— All leads (no list) —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.lead_count} lead(s)</option>)}
            </select>
          </Label>
          {listId && listPreview.length > 0 && (
            <div className="mt-2 text-[11px] text-slate-600">
              <b>Preview ({listPreview.length} leads):</b> {listPreview.slice(0, 4).map((l) => l.company || l.email).join(" · ")}
              {listPreview.length > 4 && <span className="text-slate-400"> + {listPreview.length - 4} more</span>}
            </div>
          )}
          {lists.length === 0 && (
            <div className="mt-2 text-[11px] text-amber-700">No Lead Lists yet — go to <b>Lead Management</b>, select some leads, and click <b>💾 Save as Lead List</b>.</div>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Label l="Industry"><input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Healthcare" data-testid="ai-industry" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/></Label>
          <Label l="Country"><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="UK" data-testid="ai-country" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/></Label>
          <Label l="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value)} data-testid="ai-kind" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="cold">Cold</option>
              <option value="follow_up">Follow-up</option>
              <option value="partnership">Partnership</option>
              <option value="re_engagement">Re-engagement</option>
            </select>
          </Label>
          <Label l="Value proposition (optional)">
            <input value={valueProp} onChange={(e) => setValueProp(e.target.value)} placeholder="Ship custom HIPAA-ready apps in 6 weeks" data-testid="ai-valueprop" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
          </Label>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={generate} disabled={busy} className="btn-primary text-xs" data-testid="ai-generate">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>} Generate draft
          </button>
        </div>
      </div>
      {result && (
        <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/40 p-5" data-testid="ai-result">
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// subject</div>
              <button onClick={() => copy(result.subject)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:border-[#F97316]" data-testid="ai-copy-subject"><Copy size={10} className="inline"/> Copy</button>
            </div>
            <div className="mt-1 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-[#0F2042]">{result.subject}</div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// body (HTML)</div>
              <button onClick={() => copy(result.body_html)} className="rounded border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600 hover:border-[#F97316]" data-testid="ai-copy-body"><Copy size={10} className="inline"/> Copy</button>
            </div>
            <pre className="mt-1 max-h-80 overflow-auto rounded-xl bg-white p-3 font-mono text-[11px] text-slate-700">{result.body_html}</pre>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-violet-700">// preview</div>
            <div className="mt-1 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700" dangerouslySetInnerHTML={{ __html: result.body_html }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== Reports =================== */
function ReportsTab() {
  const [period, setPeriod] = useState("daily");
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/outreach/reports", { params: { period, days } });
      setData(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period, days]);

  const buckets = data?.buckets || [];
  const totals = useMemo(() => buckets.reduce((acc, b) => ({
    sent: acc.sent + (b.sent || 0),
    opened: acc.opened + (b.opened || 0),
    clicked: acc.clicked + (b.clicked || 0),
    replied: acc.replied + (b.replied || 0),
  }), { sent: 0, opened: 0, clicked: 0, replied: 0 }), [buckets]);
  const maxVal = useMemo(() => Math.max(1, ...buckets.flatMap((b) => [b.sent, b.opened, b.clicked, b.replied])), [buckets]);
  const rate = (n, d) => d ? Math.round((n / d) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="out-reports">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <Label l="Period">
          <select value={period} onChange={(e) => setPeriod(e.target.value)} data-testid="reports-period" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </Label>
        <Label l="Days back">
          <input type="number" min={1} max={180} value={days} onChange={(e) => setDays(parseInt(e.target.value || "14", 10))} data-testid="reports-days"
            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
        </Label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Send} label="Sent" value={totals.sent} accent="violet"/>
        <Stat icon={MailOpen} label={`Opened (${rate(totals.opened, totals.sent)}%)`} value={totals.opened} accent="emerald"/>
        <Stat icon={MousePointerClick} label={`Clicked (${rate(totals.clicked, totals.sent)}%)`} value={totals.clicked} accent="orange"/>
        <Stat icon={MessageSquare} label={`Replied (${rate(totals.replied, totals.sent)}%)`} value={totals.replied} accent="rose"/>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// engagement over time</div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
        ) : buckets.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No events in the selected window yet.</div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[500px] text-xs">
              <thead className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="py-2">Bucket</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Replied</th></tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.bucket} className="border-t border-slate-100" data-testid={`report-row-${b.bucket}`}>
                    <td className="py-2 font-mono text-[11px] text-slate-600">{b.bucket}</td>
                    <td><Bar value={b.sent} max={maxVal} color="#7C3AED"/></td>
                    <td><Bar value={b.opened} max={maxVal} color="#10B981"/></td>
                    <td><Bar value={b.clicked} max={maxVal} color="#F97316"/></td>
                    <td><Bar value={b.replied} max={maxVal} color="#EF4444"/></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Bar({ value, max, color }) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }}/>
      </div>
      <span className="font-mono text-[10px] text-slate-600">{value}</span>
    </div>
  );
}
