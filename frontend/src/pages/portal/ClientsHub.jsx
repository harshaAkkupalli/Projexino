/**
 * ClientsHub.jsx — Clients · Projects · Payments · Customer-Success AI emails.
 */
import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, X, Loader2, Building2, Wallet, FolderKanban, Trash2, Sparkles, Mail, Copy, Eye, Send, Globe2, CheckCircle2, ChevronRight, ChevronDown, Save, ListChecks, BadgeCheck, AlertTriangle, Clock, Star, MessageCircle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { WhatsAppSendModal } from "@/components/WhatsAppSendModal";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const STATUS_COLORS = {
  discovery: "bg-amber-50 text-amber-700 ring-amber-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  on_hold: "bg-slate-100 text-slate-600 ring-slate-200",
  completed: "bg-sky-50 text-sky-700 ring-sky-200",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-200",
};
const STATUSES = ["discovery", "active", "on_hold", "completed", "cancelled"];
const CCY = ["USD", "INR", "GBP", "EUR", "AED", "SGD", "AUD", "CAD"];

const fmtMoney = (n, ccy) => new Intl.NumberFormat("en-US", { style: "currency", currency: ccy || "USD", maximumFractionDigits: 0 }).format(n || 0);

export default function ClientsHub() {
  const [tab, setTab] = useState("clients");
  return (
    <div className="space-y-4" data-testid="clients-hub">
      <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 w-fit">
        {[
          { v: "clients", icon: Building2, label: "Clients" },
          { v: "cs", icon: Sparkles, label: "Customer Success" },
          { v: "testimonials", icon: Star, label: "Testimonials" },
        ].map((t) => (
          <button key={t.v} onClick={() => setTab(t.v)} data-testid={`clients-tab-${t.v}`}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"}`}>
            <t.icon size={12}/> {t.label}
          </button>
        ))}
      </div>
      {tab === "clients" && <ClientsList/>}
      {tab === "cs" && <CustomerSuccess/>}
      {tab === "testimonials" && <TestimonialsTabEmbed/>}
    </div>
  );
}

function TestimonialsTabEmbed() {
  // Lazy-import the dedicated hub so the heavy module only loads when the
  // user opens this tab.
  const Hub = React.useMemo(() => React.lazy(() => import("./TestimonialsHub")), []);
  return (
    <React.Suspense fallback={<div className="py-10 text-center text-xs text-slate-400">Loading…</div>}>
      <Hub />
    </React.Suspense>
  );
}

function ClientsList() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/clients", { params: q ? { q } : {} }); setRows(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, company, email…"
            data-testid="clients-search"
            className="w-72 rounded-full border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]"/>
        </div>
        <button onClick={() => setShowNew(true)} data-testid="clients-new"
          className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]">
          <Plus size={12}/> New client
        </button>
      </div>
      {loading ? <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[#F97316]"/></div>
        : rows.length === 0 ? <Empty label="No clients yet" hint="Add your first client to start tracking projects, payments and outreach."/> : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="clients-list">
          {rows.map((c) => (
            <div key={c.id} onClick={() => setSelected(c)} data-testid={`client-card-${c.id}`}
              className="cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-[#0F2042] hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-[#0F2042]">{c.name}</div>
                  <div className="truncate text-xs text-slate-500">{c.company || "—"}{c.email ? ` · ${c.email}` : ""}</div>
                </div>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-sky-200">{c.currency_default || "USD"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
                {c.country && <span className="rounded-full bg-slate-50 px-2 py-0.5 text-slate-600 ring-1 ring-slate-200"><Globe2 size={9} className="inline mr-1"/>{c.country}</span>}
                {c.industry && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700 ring-1 ring-violet-200">{c.industry}</span>}
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-amber-200"><FolderKanban size={9} className="inline mr-1"/>{c.project_count || 0} project{(c.project_count||0)===1?"":"s"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {showNew && <ClientModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }}/>}
        {selected && <ClientDrawer cid={selected.id} onClose={() => setSelected(null)} onChanged={load}/>}
      </AnimatePresence>
    </div>
  );
}

function ClientModal({ onClose, onSaved, edit }) {
  const [form, setForm] = useState(edit || { name: "", company: "", email: "", phone: "", country: "", industry: "", currency_default: "USD", notes: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      if (edit) await api.patch(`/clients/${edit.id}`, form);
      else await api.post("/clients", form);
      toast.success(edit ? "Updated" : "Client added");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal title={edit ? `Edit · ${edit.name}` : "New client"} onClose={onClose} testid="client-modal">
      <div className="grid grid-cols-2 gap-3">
        <F label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="client-name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Company"><input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Email"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Phone"><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Country"><input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Industry"><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
        <F label="Default currency"><select value={form.currency_default} onChange={(e) => setForm({ ...form, currency_default: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{CCY.map((c) => <option key={c}>{c}</option>)}</select></F>
      </div>
      <F label="Notes"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
      <Actions onClose={onClose} onSave={save} busy={busy} testid="client-save"/>
    </Modal>
  );
}

function ClientDrawer({ cid, onClose, onChanged }) {
  const [c, setC] = useState(null);
  const [showProj, setShowProj] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { const { data } = await api.get(`/clients/${cid}`); setC(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cid]);

  const remove = async () => {
    if (!window.confirm(`Delete ${c?.name}? This removes all linked projects and payments.`)) return;
    setBusy(true);
    try { await api.delete(`/clients/${cid}`); toast.success("Removed"); onChanged(); onClose(); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  if (!c) return <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-sm"><div className="h-full w-full max-w-2xl bg-white flex items-center justify-center"><Loader2 className="animate-spin text-[#F97316]" size={26}/></div></div>;
  const ccyKeys = Object.keys(c.summary?.by_currency || {});
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-sm" data-testid="client-drawer">
      <motion.div initial={{ x: 40 }} animate={{ x: 0 }} className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{c.industry || "Client"} · {c.country || "—"}</div>
            <h3 className="font-display text-xl font-bold text-[#0F2042]">{c.name}</h3>
            <div className="text-xs text-slate-500">{c.company || "—"}{c.email ? ` · ${c.email}` : ""}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={20}/></button>
        </div>
        <div className="space-y-5 p-5">
          {/* Summary */}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3" data-testid="client-summary">
            {ccyKeys.length === 0 ? <div className="md:col-span-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">No financial activity yet.</div>
              : ccyKeys.map((ccy) => {
                const v = c.summary.by_currency[ccy];
                return (
                  <div key={ccy} className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 text-xs">
                    <div className="text-[10px] font-bold uppercase text-slate-500">{ccy}</div>
                    <div className="mt-1 grid grid-cols-3 gap-1">
                      <div><div className="text-[9px] uppercase text-slate-400">Agreed</div><div className="font-bold text-[#0F2042]">{fmtMoney(v.agreed, ccy)}</div></div>
                      <div><div className="text-[9px] uppercase text-slate-400">Paid</div><div className="font-bold text-emerald-700">{fmtMoney(v.paid, ccy)}</div></div>
                      <div><div className="text-[9px] uppercase text-slate-400">Pending</div><div className="font-bold text-amber-700">{fmtMoney(v.pending, ccy)}</div></div>
                    </div>
                  </div>
                );
            })}
          </div>
          {/* Projects */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"><FolderKanban size={11}/> Billing projects ({(c.projects||[]).length})</div>
              <button onClick={() => setShowProj(true)} data-testid="client-new-project" className="rounded-full bg-[#F97316] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#ea6a0a]"><Plus size={9} className="inline"/> Add billing project</button>
            </div>
            <ul className="space-y-2" data-testid="client-projects">
              {(c.projects || []).map((p) => <ProjectRow key={p.id} p={p} onChanged={load}/>)}
              {(c.projects || []).length === 0 && <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">No billing projects yet.</li>}
            </ul>
          </div>

          {/* Engineering projects (db.projects → linked via client_id) */}
          <EngineeringProjectsSection cid={cid} clientName={c.name} clientEmail={c.email} />

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
            <button onClick={remove} disabled={busy} data-testid="client-delete" className="rounded-full bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"><Trash2 size={11} className="inline"/> Delete client</button>
          </div>
        </div>
        <AnimatePresence>
          {showProj && <ProjectModal cid={cid} defCcy={c.currency_default} onClose={() => setShowProj(false)} onSaved={() => { setShowProj(false); load(); }}/>}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function ProjectRow({ p, onChanged }) {
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState([]);
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showFinance, setShowFinance] = useState(false);

  const loadPayments = async () => {
    const { data } = await api.get(`/client-projects/${p.id}/payments`);
    setPayments(data || []);
  };
  useEffect(() => { if (open) loadPayments(); /* eslint-disable-next-line */ }, [open]);

  const addPay = async () => {
    const n = Number(amt);
    if (!n || n <= 0) return toast.error("Enter a positive amount");
    setBusy(true);
    try { await api.post(`/client-projects/${p.id}/payments`, { amount: n, currency: p.currency }); setAmt(""); await loadPayments(); onChanged(); toast.success("Payment logged"); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  const setStatus = async (s) => {
    try { await api.patch(`/client-projects/${p.id}`, { status: s }); onChanged(); toast.success(`Status → ${s}`); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const removeProj = async () => {
    if (!window.confirm(`Delete project "${p.name}"?`)) return;
    try { await api.delete(`/client-projects/${p.id}`); onChanged(); toast.success("Deleted"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const removePay = async (pmid) => {
    try { await api.delete(`/client-payments/${pmid}`); await loadPayments(); onChanged(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <li className="rounded-xl border border-slate-200 bg-white" data-testid={`project-row-${p.id}`}>
      <div onClick={() => setOpen((o) => !o)} className="flex cursor-pointer items-center gap-2 p-3">
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-bold text-[#0F2042]">{p.name}</div>
          <div className="text-[10px] text-slate-500">agreed {fmtMoney(p.agreed_amount, p.currency)} · paid {fmtMoney(p.paid, p.currency)} · pending {fmtMoney(p.pending, p.currency)}</div>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${STATUS_COLORS[p.status] || STATUS_COLORS.discovery}`}>{p.status}</span>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-slate-100">
            <div className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-1">
                {STATUSES.map((s) => (
                  <button key={s} disabled={p.status === s} onClick={() => setStatus(s)} data-testid={`project-set-${s}`}
                    className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase ring-1 transition ${p.status === s ? "bg-[#0F2042] text-white ring-[#0F2042]" : `${STATUS_COLORS[s]} hover:scale-105`}`}>{s}</button>
                ))}
                <button onClick={() => setShowReminder(true)} data-testid={`project-remind-${p.id}`} title="Send payment reminder email"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[9px] font-bold text-white hover:bg-amber-600"><Mail size={9}/> Reminder</button>
                <button onClick={() => setShowFinance(true)} data-testid={`project-push-finance-${p.id}`} title="Push to Finance"
                  className="inline-flex items-center gap-1 rounded-full bg-violet-500 px-2.5 py-0.5 text-[9px] font-bold text-white hover:bg-violet-600">
                  {p.finance_project_id ? <><CheckCircle2 size={9}/> In Finance</> : <>↗ Finance</>}
                </button>
                <button onClick={removeProj} className="ml-auto rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-700 ring-1 ring-rose-200"><Trash2 size={9} className="inline"/></button>
              </div>
              <div className="flex items-center gap-2">
                <input type="number" placeholder={`Log payment (${p.currency})`} value={amt} onChange={(e) => setAmt(e.target.value)}
                  data-testid={`project-pay-amt-${p.id}`}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs"/>
                <button onClick={addPay} disabled={busy} data-testid={`project-pay-add-${p.id}`}
                  className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{busy ? "…" : "Log"}</button>
              </div>
              {payments.length > 0 && (
                <ul className="space-y-1" data-testid={`project-payments-${p.id}`}>
                  {payments.map((pm) => (
                    <li key={pm.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11px]">
                      <span><Wallet size={9} className="inline text-emerald-600 mr-1"/> {fmtMoney(pm.amount, pm.currency)} <span className="text-slate-400">· {pm.method || "—"}</span></span>
                      <button onClick={() => removePay(pm.id)} className="text-rose-500 hover:bg-rose-50 rounded p-0.5"><X size={11}/></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showReminder && <ReminderEmailModal project={p} onClose={() => setShowReminder(false)} />}
        {showFinance && <PushFinanceModal project={p} onClose={() => setShowFinance(false)} onPushed={onChanged} />}
      </AnimatePresence>
    </li>
  );
}

// ─── Payment Reminder modal — preview + send Test or to Client ────
function ReminderEmailModal({ project, onClose }) {
  const { user: me } = useAuth();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingClient, setSendingClient] = useState(false);
  const [daysOverdue, setDaysOverdue] = useState(0);
  const [wa, setWa] = useState(null);

  const buildReminder = async (overdue = daysOverdue) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/client-projects/${project.id}/payment-reminder`, { days_overdue: Number(overdue) || 0 });
      setDraft(data);
    } catch (e) { toast.error(formatApiError(e) || "Couldn't build reminder"); }
    setLoading(false);
  };
  useEffect(() => { buildReminder(0); /* eslint-disable-next-line */ }, []);

  const sendTest = async () => {
    if (!draft) return;
    const myEmail = me?.email;
    if (!myEmail) return toast.error("Could not detect your email");
    setSendingTest(true);
    try {
      await api.post(`/email/send`, { to: [myEmail], subject: `[TEST] ${draft.subject}`, body_html: draft.body_html });
      toast.success(`Test sent to ${myEmail}`);
    } catch (e) { toast.error(formatApiError(e) || "Send failed — check Gmail in Settings"); }
    setSendingTest(false);
  };
  const sendToClient = async () => {
    if (!draft) return;
    if (!draft.client_email) return toast.error("This client has no email on file");
    if (!window.confirm(`Send payment reminder to ${draft.client_email}?`)) return;
    setSendingClient(true);
    try {
      await api.post(`/email/send`, { to: [draft.client_email], subject: draft.subject, body_html: draft.body_html });
      toast.success(`Sent to ${draft.client_email}`);
      onClose();
    } catch (e) { toast.error(formatApiError(e) || "Send failed — check Gmail in Settings"); }
    setSendingClient(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="reminder-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-amber-50 to-white p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700"><Mail size={10} className="inline mr-1"/> Payment reminder · {project.name}</div>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">{draft?.subject || "Building reminder…"}</h3>
            {draft?.client_email && <div className="text-[11px] text-slate-500">To: {draft.client_email}</div>}
            {!draft?.client_email && !loading && <div className="text-[11px] text-rose-600">⚠ No client email on file — can only send test</div>}
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" data-testid="reminder-close"><X size={20}/></button>
        </div>
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Days overdue</label>
          <input type="number" min="0" value={daysOverdue}
            onChange={(e) => setDaysOverdue(e.target.value)}
            onBlur={() => buildReminder(daysOverdue)}
            data-testid="reminder-overdue"
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"/>
          <button onClick={() => buildReminder(daysOverdue)} className="rounded-md bg-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-300">Rebuild</button>
          <div className="ml-auto flex gap-1.5">
            <button onClick={sendTest} disabled={!draft || sendingTest} data-testid="reminder-test"
              className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-600 disabled:opacity-50">
              {sendingTest ? <Loader2 size={11} className="animate-spin"/> : <Mail size={11}/>} Send test to me
            </button>
            <button onClick={sendToClient} disabled={!draft || !draft.client_email || sendingClient} data-testid="reminder-send-client"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-4 py-1.5 text-[11px] font-bold text-white shadow disabled:opacity-50">
              {sendingClient ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} Send to client
            </button>
            <button onClick={() => setWa({ text: draft?.wa_text || "", phone: draft?.client_phone || "" })} disabled={!draft?.wa_text} data-testid="reminder-whatsapp"
              className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1DA851] disabled:opacity-50">
              <MessageCircle size={11}/> WhatsApp
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500"><Loader2 size={20} className="mr-2 animate-spin"/> Building reminder…</div>
          ) : draft ? (
            <iframe title="reminder-preview" srcDoc={draft.body_html} sandbox="" className="h-[60vh] w-full bg-slate-50"/>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Couldn&apos;t build the reminder. Likely no outstanding balance.</div>
          )}
        </div>
        {wa && <WhatsAppSendModal title={`Payment reminder · ${project.name}`} subtitle={draft?.client_email || ""} text={wa.text} onTextChange={(t) => setWa({ ...wa, text: t })} phone={wa.phone} onClose={() => setWa(null)} />}
      </motion.div>
    </motion.div>
  );
}

// ─── Push to Finance modal — confirm + clear post-push state ──────
function PushFinanceModal({ project, onClose, onPushed }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const push = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/client-projects/${project.id}/push-to-finance`);
      setResult(data);
      if (data.already_pushed) {
        toast.info("Already pushed to Finance");
      } else {
        toast.success(`Pushed to Finance · ${data.payments_pushed} payment(s) bridged`);
      }
      onPushed && onPushed();
    } catch (e) { toast.error(formatApiError(e) || "Push failed"); }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="finance-modal"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4"
      onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white p-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700">↗ Push to Finance</div>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">{project.name}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" data-testid="finance-close"><X size={20}/></button>
        </div>
        <div className="space-y-3 p-5">
          {!result ? (
            <>
              <p className="text-sm text-slate-700">This will copy the project + all logged payments into the <b>Finance module</b> so it shows up alongside your invoices and finance dashboards.</p>
              <div className="rounded-xl bg-slate-50 p-3 text-[11px] ring-1 ring-slate-200">
                <div className="font-bold text-[#0F2042]">{project.name}</div>
                <div className="text-slate-600">Agreed: {fmtMoney(project.agreed_amount, project.currency)}</div>
                <div className="text-slate-600">Paid: {fmtMoney(project.paid, project.currency)} · Pending: {fmtMoney(project.pending, project.currency)}</div>
                {project.finance_project_id && (
                  <div className="mt-2 rounded bg-amber-50 px-2 py-1 text-amber-800 ring-1 ring-amber-200">
                    <AlertTriangle size={10} className="inline mr-1"/> Already pushed earlier — re-clicking will return the existing finance record.
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">Cancel</button>
                <button onClick={push} disabled={busy} data-testid="finance-confirm"
                  className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                  {busy ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} {project.finance_project_id ? "Confirm (already pushed)" : "Confirm push"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200" data-testid="finance-result">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 size={18}/>
                  <span className="font-bold">{result.already_pushed ? "Already in Finance" : "Pushed successfully"}</span>
                </div>
                <div className="mt-2 text-xs text-emerald-800">
                  <div><b>Finance project:</b> {result.finance_project_name || project.name}</div>
                  <div><b>Payments bridged:</b> {result.payments_pushed || 0}</div>
                  {result.pushed_at && <div><b>First pushed:</b> {new Date(result.pushed_at).toLocaleString()}</div>}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">Close</button>
                <a href="/app/finance" target="_blank" rel="noreferrer" data-testid="finance-open"
                  className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-4 py-1.5 text-xs font-bold text-white shadow">
                  View in Finance →
                </a>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function ProjectModal({ cid, defCcy, onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", description: "", status: "discovery", currency: defCcy || "USD", agreed_amount: 0 });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try { await api.post(`/clients/${cid}/projects`, { ...form, agreed_amount: Number(form.agreed_amount) }); toast.success("Project added"); onSaved(); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <Modal title="New project" onClose={onClose} testid="project-modal">
      <F label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="project-name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
      <div className="grid grid-cols-3 gap-3">
        <F label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></F>
        <F label="Currency"><select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{CCY.map((c) => <option key={c}>{c}</option>)}</select></F>
        <F label="Agreed amount"><input type="number" value={form.agreed_amount} onChange={(e) => setForm({ ...form, agreed_amount: e.target.value })} data-testid="project-amount" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
      </div>
      <F label="Description"><textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
      <Actions onClose={onClose} onSave={save} busy={busy} testid="project-save"/>
    </Modal>
  );
}

// ─── Customer Success AI emails ──────────────────────────────────
// Resolve a CTA URL to an absolute https:// URL so the link actually works
// when the email is opened in Gmail / Outlook / Apple Mail on any device.
const absUrl = (u) => {
  const s = (u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s) || /^mailto:/i.test(s) || /^tel:/i.test(s)) return s;
  const origin = (typeof window !== "undefined" && window.location?.origin) || "";
  if (s.startsWith("/")) return origin + s;
  return "https://" + s;
};

const CS_CTA_OPTIONS = [
  { id: "none",            label: "No CTA button",         text: "",                       url: "" },
  { id: "finance_updates", label: "💰 View finance updates", text: "View finance updates →", url: "/app/finance" },
  { id: "project_updates", label: "📋 See project updates", text: "See project updates →",  url: "/app/projects" },
  { id: "book_meeting",    label: "📅 Book a meeting",       text: "Book a meeting →",        url: "/book" },
  { id: "custom",          label: "🔗 Custom URL",            text: "Learn more →",            url: "" },
];

function CustomerSuccess() {
  const { user: me } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [purpose, setPurpose] = useState("monthly status update");
  const [tone, setTone] = useState("warm · concise · executive");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [wa, setWa] = useState(null);
  const [waBusy, setWaBusy] = useState(false);

  useEffect(() => {
    api.get("/clients").then(({ data }) => setClients(data || [])).catch((e) => toast.error(formatApiError(e)));
  }, []);

  // Load saved draft when client changes
  useEffect(() => {
    if (!selectedId) { setDraft(null); setSavedAt(""); return; }
    api.get(`/clients/${selectedId}/cs-email/draft`).then(({ data }) => {
      if (data && (data.subject || data.body_html)) {
        setDraft(data);
        setSavedAt(data.updated_at || "");
        if (data.purpose) setPurpose(data.purpose);
        if (data.tone) setTone(data.tone);
      } else {
        setDraft(null);
        setSavedAt("");
      }
    }).catch(() => {});
  }, [selectedId]);

  const draftEmail = async () => {
    if (!selectedId) return toast.error("Pick a client");
    setBusy(true);
    try { const { data } = await api.post(`/clients/${selectedId}/cs-email`, { purpose, tone }); setDraft(data); toast.success("AI draft ready — review and tweak below"); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const rebuildHtml = (d) => {
    const ctaOpt = CS_CTA_OPTIONS.find((c) => c.id === (d.cta_type || "none")) || CS_CTA_OPTIONS[0];
    const ctaLabel = (d.cta_label || "").trim() || ctaOpt.text;
    const ctaUrlRaw = (d.cta_url || "").trim() || ctaOpt.url;
    const ctaUrl = absUrl(ctaUrlRaw);
    const ctaHtml = (ctaOpt.id !== "none" && ctaLabel && ctaUrl)
      ? `<div style="text-align:center;margin:22px 0 6px"><a href="${ctaUrl}" target="_blank" rel="noopener" style="display:inline-block;background:linear-gradient(135deg,#F97316,#A855F7);color:#fff;text-decoration:none;font-weight:bold;font-size:15px;padding:14px 28px;border-radius:999px;box-shadow:0 4px 12px rgba(249,115,22,0.25)">${ctaLabel}</a></div>`
      : "";

    // Block-based body — if user has authored blocks, render them. Otherwise
    // fall back to the classic intro/highlights/ask layout.
    let bodyHtml = "";
    if (Array.isArray(d.blocks) && d.blocks.length) {
      bodyHtml = d.blocks.map((b) => {
        const text = (b.text || "").replace(/\n+/g, "<br/>");
        if (b.type === "heading") {
          return `<h2 style="margin:18px 0 6px;color:#0F2042;font-size:22px;font-weight:700">${text}</h2>`;
        }
        if (b.type === "paragraph") {
          return `<p style="margin:10px 0;color:#334155;font-size:15px;line-height:1.65">${text}</p>`;
        }
        if (b.type === "bullets") {
          const items = (b.items || []).map((i) => `<li style="margin:6px 0;color:#1F2937;font-size:14px;line-height:1.55">${i}</li>`).join("");
          return `<ul style="margin:10px 0 14px;padding-left:22px">${items}</ul>`;
        }
        if (b.type === "image" && b.url) {
          const src = absUrl(b.url);
          const cap = b.caption ? `<div style="margin-top:6px;color:#64748B;font-size:12px;text-align:center">${b.caption}</div>` : "";
          return `<div style="margin:18px 0;text-align:center"><img src="${src}" alt="${b.caption || ""}" style="max-width:100%;border-radius:12px;border:1px solid #E2E8F0"/>${cap}</div>`;
        }
        if (b.type === "divider") {
          return `<hr style="margin:22px 0;border:none;border-top:1px solid #E2E8F0"/>`;
        }
        return "";
      }).join("");
    } else {
      // Legacy fallback (intro + highlights + ask)
      const bullets = (d.highlights || []).map((h) => `<li style='margin:6px 0;color:#1F2937;font-size:14px;line-height:1.55'>${h}</li>`).join("");
      bodyHtml = `
        <p style="margin:10px 0;color:#334155;font-size:15px;line-height:1.6">${d.intro || ""}</p>
        ${bullets ? `<div style="margin:14px 0;padding:14px 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:12px">
          <div style="font-size:10px;font-weight:bold;letter-spacing:0.18em;color:#9A3412;text-transform:uppercase;margin-bottom:6px">Highlights</div>
          <ul style="margin:0;padding-left:18px">${bullets}</ul>
        </div>` : ""}
        ${d.ask_or_next_step ? `<p style="margin:14px 0;color:#0F2042;font-size:15px"><b>Next:</b> ${d.ask_or_next_step}</p>` : ""}`;
    }

    return `<div style="font-family:Inter,Arial,sans-serif;color:#0F2042;max-width:600px;margin:0 auto;padding:24px">
  <div style="font-size:11px;font-weight:bold;letter-spacing:0.28em;color:#F97316;text-transform:uppercase">// Projexino · Customer Success</div>
  <p style="margin:14px 0 0;font-size:15px;color:#0F2042"><b>${d.greeting || ""}</b></p>
  ${bodyHtml}
  ${ctaHtml}
  <p style="margin:20px 0 0;color:#475569;font-size:14px;white-space:pre-line">${d.closing || "Warmly,\nProjexino"}</p>
</div>`;
  };

  const updateField = (field, value) => {
    setDraft((d) => {
      const next = { ...(d || {}), [field]: value };
      next.body_html = rebuildHtml(next);
      return next;
    });
  };

  const saveDraft = async () => {
    if (!selectedId || !draft) return toast.error("Nothing to save");
    setSaving(true);
    try {
      const payload = { ...draft, purpose, tone, body_html: rebuildHtml(draft) };
      const { data } = await api.post(`/clients/${selectedId}/cs-email/save`, payload);
      setSavedAt(data.saved_at || new Date().toISOString());
      toast.success("Draft saved");
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  const sendTest = async () => {
    if (!draft?.subject) return toast.error("Add a subject first");
    setTesting(true);
    try {
      const body_html = rebuildHtml(draft);
      const myEmail = me?.email;
      if (!myEmail) { toast.error("Could not detect your email"); setTesting(false); return; }
      await api.post(`/email/send`, {
        to: [myEmail],
        subject: `[TEST] ${draft.subject}`,
        body_html,
      });
      toast.success(`Test email sent to ${myEmail}`);
    } catch (e) { toast.error(formatApiError(e) || "Send failed — check Gmail connection in Settings"); }
    setTesting(false);
  };

  const sendToClient = async () => {
    const client = clients.find((c) => c.id === selectedId);
    if (!client?.email) return toast.error("This client has no email on file");
    if (!draft?.subject) return toast.error("Add a subject first");
    if (!window.confirm(`Send this email to ${client.email}?`)) return;
    setSending(true);
    try {
      const body_html = rebuildHtml(draft);
      await api.post(`/email/send`, {
        to: [client.email],
        subject: draft.subject,
        body_html,
      });
      toast.success(`Sent to ${client.email}`);
      await api.delete(`/clients/${selectedId}/cs-email/draft`).catch(() => {});
      setSavedAt("");
    } catch (e) { toast.error(formatApiError(e) || "Send failed — check Gmail connection in Settings"); }
    setSending(false);
  };

  const copyHtml = () => {
    if (!draft) return;
    navigator.clipboard.writeText(rebuildHtml(draft));
    toast.success("HTML copied to clipboard");
  };

  const openWhatsApp = async () => {
    if (!draft) return toast.error("Draft the content first");
    setWaBusy(true);
    try {
      const { data } = await api.post(`/clients/${selectedId}/cs-whatsapp`, {
        subject: draft.subject, greeting: draft.greeting, intro: draft.intro,
        highlights: draft.highlights || [], ask_or_next_step: draft.ask_or_next_step,
        closing: draft.closing, blocks: draft.blocks || [],
      });
      setWa({ text: data.wa_text, phone: data.phone });
      if (data.used_ai) toast.success("Message restyled for WhatsApp by AI");
    } catch (e) { toast.error(formatApiError(e)); }
    setWaBusy(false);
  };

  const selectedClient = clients.find((c) => c.id === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[360px,1fr]" data-testid="cs-root">
      {/* LEFT — controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-700"><Sparkles size={11} className="inline"/> AI Customer Success</div>
        <h3 className="mt-1 font-display text-lg font-semibold text-[#0F2042]">Draft a polished client email</h3>
        <p className="mt-1 text-xs text-slate-500">Pulls the client&apos;s projects + payment status as AI context. Drafts auto-load if you saved one earlier.</p>
        <div className="mt-4 space-y-3">
          <F label="Client"><select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} data-testid="cs-client-select" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— pick a client —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company || c.email || ""}</option>)}
          </select></F>
          <F label="Purpose"><input value={purpose} onChange={(e) => setPurpose(e.target.value)} data-testid="cs-purpose" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="monthly status update"/></F>
          <F label="Tone"><input value={tone} onChange={(e) => setTone(e.target.value)} data-testid="cs-tone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
          <button onClick={draftEmail} disabled={busy || !selectedId} data-testid="cs-draft"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2 text-xs font-bold text-white shadow disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Sparkles size={12}/>}
            {busy ? "Drafting…" : draft ? "Re-draft with AI" : "Draft email with AI"}
          </button>
          {!draft && selectedId && (
            <button onClick={() => setDraft({
              subject: "Hello from Projexino",
              greeting: `Hi ${(selectedClient?.name || "there").split(" ")[0]},`,
              intro: "",
              blocks: [],
              closing: "Warmly,\nProjexino",
              cta_type: "none",
            })} data-testid="cs-blank"
              className="mt-1 w-full rounded-full bg-slate-100 px-4 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200">
              Or start from blank — no AI needed
            </button>
          )}
          {savedAt && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
              <BadgeCheck size={11} className="inline mr-1"/> Draft saved · {new Date(savedAt).toLocaleString()}
            </div>
          )}
          {selectedClient && (
            <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 ring-1 ring-slate-200">
              <div className="font-bold text-[#0F2042]">{selectedClient.name}</div>
              <div>{selectedClient.email || <span className="text-rose-600">No email on file</span>}</div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT — editor + actions */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="cs-preview">
        {!draft ? (
          <Empty label="AI draft will appear here" hint="Pick a client + click Draft. We'll pull projects + payments to ground the AI."/>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
              <div className="mr-auto min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Subject</div>
                <input value={draft.subject || ""} onChange={(e) => updateField("subject", e.target.value)}
                  data-testid="cs-subject-input"
                  className="w-full max-w-md rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-[#0F2042] outline-none focus:border-slate-200 focus:bg-slate-50"/>
              </div>
              <button onClick={() => setPreview(true)} data-testid="cs-preview-btn" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"><Eye size={11}/>Preview</button>
              <button onClick={copyHtml} data-testid="cs-copy" className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"><Copy size={11}/>Copy HTML</button>
              <button onClick={saveDraft} disabled={saving} data-testid="cs-save"
                className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                {saving ? <Loader2 size={11} className="animate-spin"/> : <Save size={11}/>} Save draft
              </button>
              <button onClick={sendTest} disabled={testing} data-testid="cs-test"
                className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-sky-600 disabled:opacity-50">
                {testing ? <Loader2 size={11} className="animate-spin"/> : <Mail size={11}/>} Send test
              </button>
              <button onClick={sendToClient} disabled={sending || !selectedClient?.email} data-testid="cs-send-client"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-4 py-1.5 text-[11px] font-bold text-white shadow hover:opacity-90 disabled:opacity-50">
                {sending ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} Send to client
              </button>
              <button onClick={openWhatsApp} disabled={waBusy} data-testid="cs-whatsapp"
                className="inline-flex items-center gap-1 rounded-full bg-[#25D366] px-4 py-1.5 text-[11px] font-bold text-white shadow hover:bg-[#1DA851] disabled:opacity-50">
                {waBusy ? <Loader2 size={11} className="animate-spin"/> : <MessageCircle size={11}/>} WhatsApp
              </button>
              {wa && <WhatsAppSendModal title="Customer Success · WhatsApp" subtitle={selectedClient ? `To ${selectedClient.name}${selectedClient.phone ? ` · ${selectedClient.phone}` : ""}` : ""} text={wa.text} onTextChange={(t) => setWa({ ...wa, text: t })} phone={wa.phone} onClose={() => setWa(null)} />}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <F label="Greeting"><input value={draft.greeting || ""} onChange={(e) => updateField("greeting", e.target.value)} data-testid="cs-greeting" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
              <F label="Closing"><input value={draft.closing || ""} onChange={(e) => updateField("closing", e.target.value)} data-testid="cs-closing" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>
            </div>
            <F label="Intro / opening paragraph (legacy)"><textarea rows={2} value={draft.intro || ""} onChange={(e) => updateField("intro", e.target.value)} data-testid="cs-intro" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>

            {/* Block-based body — paragraphs, headings, bullets, images, dividers */}
            <BlockEditor
              blocks={draft.blocks || []}
              onChange={(blocks) => updateField("blocks", blocks)}
            />

            <F label="Ask / Next step (only shows if Blocks empty)"><textarea rows={2} value={draft.ask_or_next_step || ""} onChange={(e) => updateField("ask_or_next_step", e.target.value)} data-testid="cs-ask" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"/></F>

            {/* CTA selector */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-orange-50 to-violet-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[#0F2042]">Call-to-action button (optional)</div>
                {draft.cta_type && draft.cta_type !== "none" && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700"><CheckCircle2 size={8} className="inline mr-0.5"/> visible in email</span>
                )}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <F label="CTA type">
                  <select value={draft.cta_type || "none"} onChange={(e) => {
                      const next = CS_CTA_OPTIONS.find((c) => c.id === e.target.value) || CS_CTA_OPTIONS[0];
                      setDraft((d) => {
                        const nd = { ...(d || {}), cta_type: next.id, cta_label: next.text, cta_url: next.url };
                        nd.body_html = rebuildHtml(nd);
                        return nd;
                      });
                    }} data-testid="cs-cta-type"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    {CS_CTA_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </F>
                <F label="Button label">
                  <input value={draft.cta_label || ""} onChange={(e) => updateField("cta_label", e.target.value)}
                    data-testid="cs-cta-label"
                    disabled={(draft.cta_type || "none") === "none"}
                    placeholder="View finance updates →"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"/>
                </F>
                <F label="Destination URL">
                  <input value={draft.cta_url || ""} onChange={(e) => updateField("cta_url", e.target.value)}
                    data-testid="cs-cta-url"
                    disabled={(draft.cta_type || "none") === "none"}
                    placeholder="https://…"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"/>
                </F>
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                💡 Tip: For Book Meeting, paste your Calendly link. For Finance/Project updates, use the live in-app URL so clients land on the right page after login.
              </div>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {preview && draft && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4" data-testid="cs-preview-modal" onClick={() => setPreview(false)}>
            <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-5xl h-[92vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Email preview</div>
                  <h3 className="font-display text-lg font-semibold text-[#0F2042]">{draft.subject}</h3>
                  <div className="text-[11px] text-slate-500">To: {selectedClient?.email || "(no email on file)"}</div>
                </div>
                <button onClick={() => setPreview(false)} className="rounded-lg p-2 hover:bg-slate-100" data-testid="cs-preview-close"><X size={20}/></button>
              </div>
              <iframe title="cs-preview" srcDoc={rebuildHtml(draft)} sandbox="" className="flex-1 w-full bg-slate-50"/>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Block editor — paragraphs / headings / bullets / images / dividers
function BlockEditor({ blocks, onChange }) {
  const [uploadingIdx, setUploadingIdx] = useState(null);

  const update = (i, patch) => {
    const next = [...blocks];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  };
  const remove = (i) => onChange(blocks.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = (type) => {
    const empty = type === "bullets" ? { type, items: [""] }
      : type === "image" ? { type, url: "", caption: "" }
      : type === "divider" ? { type }
      : { type, text: "" };
    onChange([...(blocks || []), empty]);
  };
  const uploadImage = async (i, file) => {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toast.error("Image must be ≤ 4 MB");
    setUploadingIdx(i);
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      update(i, { url: dataUrl, caption: blocks[i].caption || file.name });
    } catch (e) { toast.error("Image upload failed"); }
    setUploadingIdx(null);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Body sections</div>
        <div className="flex flex-wrap gap-1">
          {[
            { t: "heading", label: "H · Heading" },
            { t: "paragraph", label: "¶ Paragraph" },
            { t: "bullets", label: "• Bullets" },
            { t: "image", label: "🖼 Image" },
            { t: "divider", label: "— Divider" },
          ].map((b) => (
            <button key={b.t} onClick={() => add(b.t)} data-testid={`cs-add-block-${b.t}`}
              className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200">{b.label}</button>
          ))}
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
          Empty — click any chip above to add a block. The legacy intro/highlights/ask fields show only when no blocks exist.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="cs-blocks">
          {blocks.map((b, i) => (
            <li key={i} className="rounded-xl border border-slate-200 bg-white p-3" data-testid={`cs-block-${i}-${b.type}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">{b.type}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === blocks.length - 1} className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30">↓</button>
                  <button onClick={() => remove(i)} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><X size={11}/></button>
                </div>
              </div>

              {b.type === "heading" && (
                <input value={b.text || ""} onChange={(e) => update(i, { text: e.target.value })}
                  data-testid={`cs-block-heading-${i}`}
                  placeholder="Section heading…"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-base font-bold text-[#0F2042] outline-none focus:border-[#F97316]"/>
              )}
              {b.type === "paragraph" && (
                <textarea rows={3} value={b.text || ""} onChange={(e) => update(i, { text: e.target.value })}
                  data-testid={`cs-block-paragraph-${i}`}
                  placeholder="Write a paragraph… line breaks become <br/> in the email."
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"/>
              )}
              {b.type === "bullets" && (
                <div className="space-y-1.5">
                  {(b.items || []).map((it, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F97316]"/>
                      <input value={it} onChange={(e) => {
                          const items = [...(b.items || [])]; items[idx] = e.target.value; update(i, { items });
                        }} data-testid={`cs-block-bullet-${i}-${idx}`}
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:border-[#F97316]"/>
                      <button onClick={() => { const items = (b.items || []).filter((_, ix) => ix !== idx); update(i, { items }); }}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><X size={10}/></button>
                    </div>
                  ))}
                  <button onClick={() => update(i, { items: [...(b.items || []), ""] })}
                    data-testid={`cs-block-bullet-add-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200"><Plus size={9}/> Add bullet</button>
                </div>
              )}
              {b.type === "image" && (
                <div className="space-y-2">
                  {b.url ? (
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <img src={b.url} alt={b.caption || "preview"} className="block max-h-60 w-full object-cover"/>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-xs text-slate-500 hover:border-[#F97316] hover:bg-orange-50">
                      {uploadingIdx === i ? <Loader2 size={14} className="animate-spin"/> : "Click to upload an image (≤ 4 MB) — or paste a public URL below"}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={(e) => uploadImage(i, e.target.files?.[0])}
                        data-testid={`cs-block-image-upload-${i}`}/>
                    </label>
                  )}
                  <input value={b.url || ""} onChange={(e) => update(i, { url: e.target.value })}
                    data-testid={`cs-block-image-url-${i}`}
                    placeholder="https://… or data:image/…"
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs font-mono outline-none focus:border-[#F97316]"/>
                  <input value={b.caption || ""} onChange={(e) => update(i, { caption: e.target.value })}
                    data-testid={`cs-block-image-caption-${i}`}
                    placeholder="Caption (optional)"
                    className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-[#F97316]"/>
                </div>
              )}
              {b.type === "divider" && (
                <div className="my-2 border-t-2 border-dashed border-slate-300"/>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Engineering projects (linked via db.projects.client_id) ─────
function EngineeringProjectsSection({ cid, clientName, clientEmail }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openProject, setOpenProject] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/clients/${cid}/linked-projects`); setRows(data || []); }
    catch (e) { /* silent — endpoint exists since iter 41 */ }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [cid]);

  return (
    <div data-testid="eng-projects">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          <ListChecks size={11}/> Engineering projects ({rows.length})
        </div>
        <button onClick={load} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 hover:bg-slate-200">Refresh</button>
      </div>
      {loading ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500"><Loader2 size={12} className="inline animate-spin mr-1"/> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
          No engineering projects linked yet. Create one from <b>/app/projects</b> and pick this client in the Client dropdown.
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => (
            <EngineeringProjectRow key={p.id} p={p} cid={cid} clientName={clientName} clientEmail={clientEmail} onOpen={() => setOpenProject(p)} />
          ))}
        </ul>
      )}
      <AnimatePresence>
        {openProject && (
          <ProjectTasksPanel cid={cid} pid={openProject.id} pname={openProject.name} clientName={clientName} clientEmail={clientEmail} onClose={() => setOpenProject(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function EngineeringProjectRow({ p, onOpen }) {
  const pct = p.completion_pct || 0;
  const counts = p.task_counts || {};
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 hover:border-[#0F2042]" data-testid={`eng-row-${p.id}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ring-1 ${STATUS_COLORS[p.status] || STATUS_COLORS.discovery}`}>{p.status || "planning"}</span>
            <div className="truncate text-sm font-bold text-[#0F2042]">{p.name}</div>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {p.task_total || 0} tasks · {counts.done || 0} done · {counts.in_progress || 0} in progress
            {counts.blocked > 0 && <span className="ml-1 text-rose-600"><AlertTriangle size={9} className="inline"/> {counts.blocked} blocked</span>}
          </div>
        </div>
        <button onClick={onOpen} data-testid={`eng-open-${p.id}`}
          className="rounded-full bg-[#0F2042] px-3 py-1 text-[10px] font-bold text-white hover:bg-[#162a55]">
          View tasks <ChevronRight size={9} className="inline"/>
        </button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pct}%` }}/>
      </div>
      <div className="mt-1 text-right text-[9px] font-bold text-slate-500">{pct}% complete</div>
    </li>
  );
}

function ProjectTasksPanel({ cid, pid, pname, clientName, clientEmail, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [aiDraft, setAiDraft] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const { data } = await api.get(`/clients/${cid}/linked-projects/${pid}/tasks`); setData(data); }
      catch (e) { toast.error(formatApiError(e)); }
      setLoading(false);
    })();
  }, [cid, pid]);

  const summarise = async () => {
    setAiBusy(true);
    try { const { data: d } = await api.post(`/clients/${cid}/linked-projects/${pid}/ai-summary`, {}); setAiDraft(d); toast.success("AI summary ready"); }
    catch (e) { toast.error(formatApiError(e)); }
    setAiBusy(false);
  };

  const sendToClient = async () => {
    if (!aiDraft?.body_html) return toast.error("Generate the AI summary first");
    if (!clientEmail) return toast.error("This client has no email on file");
    if (!window.confirm(`Send this project update to ${clientEmail}?`)) return;
    setSending(true);
    try {
      await api.post(`/email/send`, { to: [clientEmail], subject: aiDraft.subject, body_html: aiDraft.body_html });
      toast.success(`Sent to ${clientEmail}`);
    } catch (e) { toast.error(formatApiError(e) || "Send failed — check Gmail connection in Settings"); }
    setSending(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[55] flex items-stretch justify-end bg-slate-950/60 backdrop-blur-sm" onClick={onClose} data-testid="eng-tasks-panel">
      <motion.div initial={{ x: 60 }} animate={{ x: 0 }} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Engineering project · {clientName}</div>
            <h3 className="font-display truncate text-lg font-bold text-[#0F2042]">{pname}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500"><Loader2 size={20} className="inline animate-spin mr-2"/>Loading tasks…</div>
          ) : data ? (
            <>
              <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                {Object.entries(data.counts || {}).map(([s, n]) => (
                  <div key={s} className={`rounded-lg p-2 ring-1 ${s === "done" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : s === "blocked" ? "bg-rose-50 text-rose-700 ring-rose-200" : s === "in_progress" ? "bg-sky-50 text-sky-700 ring-sky-200" : s === "review" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}>
                    <div className="font-bold text-lg">{n}</div>
                    <div className="uppercase tracking-wide">{s.replace("_"," ")}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Live tasks ({data.total})</div>
                  <a href={`/app/projects/${pid}`} target="_blank" rel="noreferrer" className="text-[10px] font-bold text-[#F97316] hover:underline">Open project →</a>
                </div>
                <ul className="space-y-1.5" data-testid="eng-tasks-list">
                  {(data.tasks || []).map((t) => (
                    <li key={t.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs" data-testid={`eng-task-${t.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <a href={`/app/tasks/${t.id}`} target="_blank" rel="noreferrer" className="truncate font-bold text-[#0F2042] hover:text-[#F97316]">{t.title}</a>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${t.status === "done" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : t.status === "blocked" ? "bg-rose-50 text-rose-700 ring-rose-200" : t.status === "in_progress" ? "bg-sky-50 text-sky-700 ring-sky-200" : t.status === "review" ? "bg-violet-50 text-violet-700 ring-violet-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>{t.status || "todo"}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">
                        {t.assignee || "Unassigned"} · {t.priority || "medium"}
                        {t.deadline && <span> · <Clock size={9} className="inline"/> {t.deadline}</span>}
                      </div>
                    </li>
                  ))}
                  {(data.tasks || []).length === 0 && <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">No tasks yet on this project.</li>}
                </ul>
              </div>

              <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-violet-700"><Sparkles size={11} className="inline"/> AI client update</div>
                  <button onClick={summarise} disabled={aiBusy} data-testid="eng-ai-summary"
                    className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-violet-700 disabled:opacity-50">
                    {aiBusy ? <Loader2 size={10} className="animate-spin"/> : <Sparkles size={10}/>} {aiDraft ? "Re-summarise" : "Summarise & draft email"}
                  </button>
                </div>
                {aiDraft && (
                  <div className="mt-3 space-y-2 text-xs">
                    <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Subject</div>
                      <div className="font-bold text-[#0F2042]">{aiDraft.subject}</div>
                    </div>
                    <div className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Highlights</div>
                      <ul className="ml-4 list-disc text-slate-700">
                        {(aiDraft.highlights || []).map((h, i) => <li key={i}>{h}</li>)}
                      </ul>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPreview(true)} data-testid="eng-ai-preview"
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-bold text-slate-700 hover:bg-slate-200"><Eye size={10}/>Full preview</button>
                      <button onClick={sendToClient} disabled={sending || !clientEmail} data-testid="eng-ai-send"
                        className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-3 py-1.5 text-[10px] font-bold text-white shadow disabled:opacity-50">
                        {sending ? <Loader2 size={10} className="animate-spin"/> : <Send size={10}/>} Send to {clientEmail || "client"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Couldn&apos;t load tasks.</div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {preview && aiDraft && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-md p-4" onClick={() => setPreview(false)} data-testid="eng-ai-preview-modal">
            <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-4xl h-[88vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 p-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Email preview</div>
                  <h3 className="font-display text-lg font-semibold text-[#0F2042]">{aiDraft.subject}</h3>
                </div>
                <button onClick={() => setPreview(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button>
              </div>
              <iframe title="eng-preview" srcDoc={aiDraft.body_html} sandbox="" className="flex-1 w-full bg-slate-50"/>
            </div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── shared ──────────────────────────────────────────────────────
function Modal({ title, children, onClose, testid }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm p-4" data-testid={testid}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3"><h3 className="text-lg font-bold text-[#0F2042]">{title}</h3><button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
        <div className="space-y-3 pt-4">{children}</div>
      </motion.div>
    </div>
  );
}
function Actions({ onClose, onSave, busy, testid }) {
  return <div className="flex justify-end gap-2 border-t border-slate-200 pt-4"><button onClick={onClose} className="rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={onSave} disabled={busy} data-testid={testid} className="flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#ea6a0a] disabled:opacity-50">{busy ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>}Save</button></div>;
}
function F({ label, children }) { return <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function Empty({ label, hint }) {
  return <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-500"><Building2 size={20}/></div><div className="text-base font-bold text-[#0F2042]">{label}</div><div className="mt-1 text-sm text-slate-500">{hint}</div></div>;
}
