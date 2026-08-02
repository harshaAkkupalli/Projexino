/**
 * HrOnboarding.jsx — Onboarding Engine UI inside HR Module.
 *
 * Lets HR / admin create a new-hire onboarding record. The backend
 * auto-generates a branded Offer Letter PDF, calculates the prorated
 * first paycheck, and seeds department-specific tasks. This view lists
 * every record with their live status and download links.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Loader2, X, Download, RefreshCw, Trash2, BriefcaseBusiness,
  Calendar, Wallet, ListChecks, Mail, FileText, Check, PenLine,
  KeyRound, Copy, CheckCheck,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const DEPTS = ["engineering", "design", "sales", "marketing", "hr", "operations", "default"];
const STATUSES = [
  { v: "kickoff", label: "Kickoff", color: "bg-amber-100 text-amber-800 ring-amber-200" },
  { v: "docs_pending", label: "Docs pending", color: "bg-sky-100 text-sky-800 ring-sky-200" },
  { v: "tasks_pending", label: "Tasks pending", color: "bg-violet-100 text-violet-800 ring-violet-200" },
  { v: "completed", label: "Completed", color: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  { v: "cancelled", label: "Cancelled", color: "bg-slate-100 text-slate-600 ring-slate-200" },
];

const apiBase = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

export default function HrOnboarding() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/hr/onboarding"); setRows(data || []); }
    catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const c = { total: rows.length, kickoff: 0, docs_pending: 0, tasks_pending: 0, completed: 0 };
    rows.forEach((r) => { if (c[r.status] != null) c[r.status]++; });
    return c;
  }, [rows]);

  return (
    <div className="space-y-4" data-testid="hr-onboarding-root">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {[
            ["Total", counts.total, "bg-slate-50 text-slate-700 ring-slate-200"],
            ["Kickoff", counts.kickoff, "bg-amber-50 text-amber-700 ring-amber-200"],
            ["Docs", counts.docs_pending, "bg-sky-50 text-sky-700 ring-sky-200"],
            ["Tasks", counts.tasks_pending, "bg-violet-50 text-violet-700 ring-violet-200"],
            ["Completed", counts.completed, "bg-emerald-50 text-emerald-700 ring-emerald-200"],
          ].map(([k, n, cls]) => (
            <span key={k} className={`rounded-full px-3 py-1 font-bold ring-1 ${cls}`} data-testid={`onb-stat-${k.toLowerCase()}`}>
              {k}: {n}
            </span>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} data-testid="onb-new-btn"
          className="flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#162a55]">
          <Plus size={12}/> New hire
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-[#F97316]"/></div>
      ) : rows.length === 0 ? (
        <Empty onNew={() => setShowNew(true)}/>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="onb-list">
          {rows.map((r) => (
            <RecordCard key={r.id} row={r} onOpen={() => setSelected(r)} onRefresh={load}/>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showNew && <NewHireDialog onClose={() => setShowNew(false)} onCreated={(rec) => { setShowNew(false); load(); setSelected(rec); }}/>}
        {selected && <DetailDrawer rid={selected.id} onClose={() => setSelected(null)} onChanged={load}/>}
      </AnimatePresence>
    </div>
  );
}

function statusPill(status) {
  const s = STATUSES.find((x) => x.v === status) || STATUSES[0];
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${s.color}`}>{s.label}</span>;
}

function fmtMoney(n, ccy) {
  if (n == null) return "—";
  try { return new Intl.NumberFormat("en-IN", { style: "currency", currency: ccy || "INR", maximumFractionDigits: 0 }).format(n); }
  catch { return `${ccy || ""} ${Number(n).toLocaleString()}`; }
}

function RecordCard({ row, onOpen, onRefresh }) {
  const pdfUrl = `${apiBase}${row.offer_letter_url}`;
  return (
    <motion.div layout
      className="group relative cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-[#0F2042]"
      onClick={onOpen} data-testid={`onb-card-${row.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-bold text-[#0F2042]">{row.name}</div>
          <div className="truncate text-xs text-slate-500"><Mail size={10} className="mr-1 inline"/>{row.email}</div>
        </div>
        {statusPill(row.status)}
      </div>
      <div className="mt-3 flex flex-wrap gap-1 text-[11px]">
        <span className="rounded-full bg-sky-50 px-2 py-0.5 font-bold text-sky-700 ring-1 ring-sky-200">{row.department}</span>
        {row.designation && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">{row.designation}</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Stat icon={Calendar} label="Start" value={row.start_date}/>
        <Stat icon={Wallet} label="First pay" value={fmtMoney(row.prorated_first_pay?.amount, row.currency)}/>
        <Stat icon={ListChecks} label="Tasks" value={(row.task_ids || []).length}/>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <a href={pdfUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} data-testid={`onb-download-${row.id}`}
          className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#ea6a0a]">
          <Download size={11}/> Offer letter
        </a>
        <span className="text-[10px] text-slate-400">{row.task_template_count || (row.task_ids || []).length} task template</span>
      </div>
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2">
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-slate-500"><Icon size={9}/> {label}</div>
      <div className="mt-0.5 truncate text-xs font-bold text-[#0F2042]">{value}</div>
    </div>
  );
}

function Empty({ onNew }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600"><BriefcaseBusiness size={20}/></div>
      <div className="text-base font-bold text-[#0F2042]">No onboarding records yet</div>
      <div className="mt-1 text-sm text-slate-500">Add your first new hire — we&apos;ll auto-generate the offer letter, prorated paycheck and dept task plan.</div>
      <button onClick={onNew} className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white">
        <Plus size={12}/> New hire
      </button>
    </div>
  );
}

function NewHireDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "", email: "", role: "team_member", designation: "", department: "engineering",
    start_date: new Date().toISOString().slice(0, 10),
    base_salary: 80000, currency: "INR",
    manager_email: "", mentor_email: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  // Live prorated preview
  useEffect(() => {
    try {
      const d = new Date(form.start_date);
      if (!isNaN(d) && form.base_salary > 0) {
        const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const dw = dim - d.getDate() + 1;
        setPreview({ days_worked: dw, days_in_month: dim, amount: Math.round(form.base_salary * (dw / dim)) });
      }
    } catch { /* ignore */ }
  }, [form.start_date, form.base_salary]);

  const save = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.start_date || !form.base_salary) {
      toast.error("Name, email, start date and salary are required"); return;
    }
    setBusy(true);
    try {
      const payload = { ...form, base_salary: Number(form.base_salary) };
      // EmailStr Optional rejects "" — convert empty optional emails to null/undefined
      if (!payload.manager_email) delete payload.manager_email;
      if (!payload.mentor_email) delete payload.mentor_email;
      const { data } = await api.post("/hr/onboarding", payload);
      toast.success(`Onboarding kicked off — ${data.task_ids?.length || 0} tasks assigned, offer letter generated.`);
      if (data.welcome_email_error) {
        toast.error(`Welcome email NOT sent: ${data.welcome_email_error}`, { duration: 12000 });
      }
      onCreated(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" data-testid="onb-new-dialog">
      <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-display text-lg font-bold text-[#0F2042]">New hire onboarding</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="space-y-3 pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Full name *"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Priya Sharma" data-testid="onb-input-name"/></Field>
            <Field label="Email *"><input type="email" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="priya@projexino.com" data-testid="onb-input-email"/></Field>
            <Field label="Designation"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Senior Engineer"/></Field>
            <Field label="Department"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} data-testid="onb-input-dept">{DEPTS.map((d) => <option key={d}>{d}</option>)}</select></Field>
            <Field label="Start date *"><input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} data-testid="onb-input-start"/></Field>
            <Field label="Portal role"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>team_member</option><option>manager</option><option>intern</option><option>hr</option></select></Field>
            <Field label="Base salary / month *"><input type="number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} data-testid="onb-input-salary"/></Field>
            <Field label="Currency"><select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>INR</option><option>USD</option><option>GBP</option><option>EUR</option><option>AED</option><option>SGD</option></select></Field>
            <Field label="Reporting manager"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.manager_email} onChange={(e) => setForm({ ...form, manager_email: e.target.value })} placeholder="manager@projexino.com"/></Field>
            <Field label="Mentor"><input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.mentor_email} onChange={(e) => setForm({ ...form, mentor_email: e.target.value })} placeholder="mentor@projexino.com"/></Field>
          </div>
          <Field label="Internal notes"><textarea rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}/></Field>
          {preview && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs" data-testid="onb-prorated-preview">
              <div className="flex items-center gap-2 font-bold text-amber-800"><Wallet size={12}/> First (prorated) paycheck preview</div>
              <div className="mt-1 text-slate-700">
                {fmtMoney(preview.amount, form.currency)} · {preview.days_worked} of {preview.days_in_month} days in the start month.
              </div>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button onClick={onClose} className="rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button onClick={save} disabled={busy} data-testid="onb-save"
            className="flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#ea6a0a] disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Check size={12}/>} Create &amp; generate offer letter
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DetailDrawer({ rid, onClose, onChanged }) {
  const [rec, setRec] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showEditLetter, setShowEditLetter] = useState(false);

  const load = async () => {
    try { const { data } = await api.get(`/hr/onboarding/${rid}`); setRec(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rid]);

  if (!rec) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-xl items-center justify-center bg-white"><Loader2 className="animate-spin text-[#F97316]" size={26}/></div>
      </div>
    );
  }
  const pdfUrl = `${apiBase}${rec.offer_letter_url}`;

  const setStatus = async (s) => {
    setBusy(true);
    try { await api.patch(`/hr/onboarding/${rid}`, { status: s }); await load(); onChanged(); toast.success(`Status → ${s}`); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const regenerate = async () => {
    setBusy(true);
    try { await api.post(`/hr/onboarding/${rid}/regenerate-offer-letter`); toast.success("Offer letter regenerated"); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const remove = async () => {
    if (!window.confirm(`Delete onboarding record for ${rec.name}? This also removes their ${rec.task_ids?.length || 0} auto-assigned tasks.`)) return;
    setBusy(true);
    try { await api.delete(`/hr/onboarding/${rid}`); toast.success("Removed"); onChanged(); onClose(); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-end bg-slate-950/40 backdrop-blur-sm" data-testid="onb-detail">
      <motion.div initial={{ x: 40 }} animate={{ x: 0 }}
        className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Onboarding · {rec.department}</div>
            <h3 className="font-display text-xl font-bold text-[#0F2042]">{rec.name}</h3>
            <div className="text-xs text-slate-500">{rec.email}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={20}/></button>
        </div>
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUSES.map((s) => (
              <button key={s.v} onClick={() => setStatus(s.v)} disabled={busy || rec.status === s.v}
                data-testid={`onb-set-status-${s.v}`}
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 transition ${rec.status === s.v ? "bg-[#0F2042] text-white ring-[#0F2042]" : `${s.color} hover:scale-105`}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={Calendar} label="Start" value={rec.start_date}/>
            <Stat icon={Wallet} label="First pay" value={fmtMoney(rec.prorated_first_pay?.amount, rec.currency)}/>
            <Stat icon={ListChecks} label="Tasks" value={(rec.tasks || []).length}/>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
            <div className="flex items-center gap-1 font-bold text-amber-800"><Wallet size={12}/> Prorated first paycheck</div>
            <div className="mt-1 text-slate-700">
              {fmtMoney(rec.prorated_first_pay?.amount, rec.currency)} · {rec.prorated_first_pay?.days_worked} of {rec.prorated_first_pay?.days_in_month} days
              ({rec.prorated_first_pay?.rate_pct}% of full salary)
            </div>
          </div>
          <CredentialsCard rec={rec}/>
          <div className="flex flex-wrap gap-2">
            <a href={pdfUrl} target="_blank" rel="noreferrer" data-testid="onb-detail-download"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-4 py-1.5 text-xs font-bold text-white"><Download size={12}/> Download offer letter PDF</a>
            <button onClick={() => setShowEditLetter(true)} disabled={busy} data-testid="onb-detail-edit-letter"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1E3A8A]">
              <PenLine size={12}/> Edit letter
            </button>
            <button onClick={regenerate} disabled={busy} data-testid="onb-detail-regen"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
              <RefreshCw size={12}/> Regenerate PDF
            </button>
            <button onClick={remove} disabled={busy} data-testid="onb-detail-delete"
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">
              <Trash2 size={12}/> Delete record
            </button>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500"><ListChecks size={11}/> Auto-assigned tasks</div>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white" data-testid="onb-detail-tasks">
              {(rec.tasks || []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 p-3 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-bold text-[#0F2042]">{t.title.replace(/^\[Onboarding · [^\]]+\]\s*/, "")}</div>
                    <div className="text-[10px] text-slate-500">Due {String(t.due_date || "").slice(0, 10)}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${t.priority === "high" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>{t.priority}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ring-1 ${t.status === "done" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-amber-200"}`}>{t.status}</span>
                </li>
              ))}
              {(!rec.tasks || rec.tasks.length === 0) && <li className="p-3 text-center text-xs text-slate-400">No tasks linked.</li>}
            </ul>
          </div>
          {rec.notes && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <div className="mb-1 flex items-center gap-1 font-bold uppercase tracking-wide text-slate-500"><FileText size={11}/> Notes</div>
              {rec.notes}
            </div>
          )}
        </div>
      </motion.div>
      <AnimatePresence>
        {showEditLetter && (
          <EditOfferLetterModal rid={rid} pdfUrl={pdfUrl} onClose={() => setShowEditLetter(false)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function EditOfferLetterModal({ rid, pdfUrl, onClose }) {
  const [c, setC] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/hr/onboarding/${rid}/offer-letter-content`);
      setC({ ...data.content, benefits: (data.content.benefits || []).join("\n") });
    } catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [rid]);

  const set = (k) => (e) => { setC((p) => ({ ...p, [k]: e.target.value })); setSaved(false); };

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/hr/onboarding/${rid}/offer-letter-content`, {
        ...c,
        benefits: c.benefits.split("\n").map((x) => x.trim()).filter(Boolean),
      });
      setSaved(true);
      toast.success("Offer letter saved — PDF updated");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const reset = async () => {
    if (!window.confirm("Reset the letter back to the auto-generated content?")) return;
    setBusy(true);
    try {
      await api.put(`/hr/onboarding/${rid}/offer-letter-content`, { reset: true });
      await load();
      setSaved(true);
      toast.success("Letter reset to defaults");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  const inputCls = "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-[#F97316] focus:outline-none";
  const areaCls = inputCls + " resize-y";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" data-testid="onb-edit-letter-modal">
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// offer letter</div>
            <h3 className="font-display text-lg font-bold text-[#0F2042]">Edit letter content</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
        </div>
        {!c ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="animate-spin text-[#F97316]" size={22}/></div>
        ) : (
          <div className="space-y-3">
            <Field label="Introduction paragraph">
              <textarea rows={3} value={c.intro} onChange={set("intro")} className={areaCls} data-testid="onb-letter-intro"/>
            </Field>
            <div className="grid grid-cols-2 gap-2.5">
              <Field label="Job title"><input value={c.designation} onChange={set("designation")} className={inputCls} data-testid="onb-letter-designation"/></Field>
              <Field label="Department"><input value={c.department} onChange={set("department")} className={inputCls} data-testid="onb-letter-department"/></Field>
              <Field label="Start date"><input value={c.start_date} onChange={set("start_date")} className={inputCls} data-testid="onb-letter-start"/></Field>
              <Field label="Employment type"><input value={c.employment_type} onChange={set("employment_type")} className={inputCls} data-testid="onb-letter-type"/></Field>
              <Field label="Base salary line"><input value={c.salary_line} onChange={set("salary_line")} className={inputCls} data-testid="onb-letter-salary"/></Field>
              <Field label="First (prorated) paycheck line"><input value={c.first_pay_line} onChange={set("first_pay_line")} className={inputCls} data-testid="onb-letter-firstpay"/></Field>
              <Field label="Reporting to"><input value={c.reporting_to} onChange={set("reporting_to")} className={inputCls} data-testid="onb-letter-reporting"/></Field>
            </div>
            <Field label="Benefits (one per line)">
              <textarea rows={4} value={c.benefits} onChange={set("benefits")} className={areaCls} data-testid="onb-letter-benefits"/>
            </Field>
            <Field label="Employment terms">
              <textarea rows={4} value={c.terms} onChange={set("terms")} className={areaCls} data-testid="onb-letter-terms"/>
            </Field>
            <Field label="Acceptance paragraph">
              <textarea rows={3} value={c.acceptance} onChange={set("acceptance")} className={areaCls} data-testid="onb-letter-acceptance"/>
            </Field>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button onClick={save} disabled={busy} data-testid="onb-letter-save"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-xs font-bold text-white disabled:opacity-50">
                {busy ? <Loader2 size={12} className="animate-spin"/> : <Check size={12}/>} Save letter
              </button>
              <a href={saved ? pdfUrl : undefined} target="_blank" rel="noreferrer" data-testid="onb-letter-download"
                onClick={(e) => { if (!saved) { e.preventDefault(); toast.info("Save your changes first"); } }}
                className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold ${saved ? "bg-[#0F2042] text-white" : "cursor-not-allowed bg-slate-100 text-slate-400"}`}>
                <Download size={12}/> Download PDF
              </a>
              <button onClick={reset} disabled={busy} data-testid="onb-letter-reset"
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">
                <RefreshCw size={12}/> Reset to defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function CredentialsCard({ rec }) {
  const [copied, setCopied] = useState("");
  const copy = (val, what) => {
    if (!val) return;
    try {
      navigator.clipboard.writeText(val);
      setCopied(what);
      toast.success(`${what} copied`);
      setTimeout(() => setCopied(""), 1500);
    } catch { /* ignore */ }
  };
  if (!rec.account_created) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800" data-testid="onb-creds-card">
        <div className="flex items-center gap-1.5 font-bold"><KeyRound size={12}/> Portal account NOT created</div>
        <div className="mt-1">Couldn&apos;t provision an account automatically. Create one manually from HR → Team Access.</div>
      </div>
    );
  }
  // Existing user reused — no new password to share
  if (!rec.dummy_password) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900" data-testid="onb-creds-card">
        <div className="flex items-center gap-1.5 font-bold"><KeyRound size={12}/> Existing portal account linked</div>
        <div className="mt-1">{rec.email} already had an account — we linked it to this onboarding record. Ask them to keep using their current password.</div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs" data-testid="onb-creds-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-emerald-800"><KeyRound size={12}/> Portal credentials emailed</div>
        <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">force-reset on first login</span>
      </div>
      <div className="mt-2 space-y-1.5 text-slate-700">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-emerald-200">
          <div className="min-w-0 truncate"><span className="text-[10px] font-bold uppercase text-slate-400">Email</span><div className="truncate font-mono text-[11px] text-slate-700">{rec.email}</div></div>
          <button onClick={() => copy(rec.email, "Email")} data-testid="onb-copy-email" className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100">{copied === "Email" ? <CheckCheck size={12}/> : <Copy size={12}/>}</button>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-emerald-200">
          <div className="min-w-0 truncate"><span className="text-[10px] font-bold uppercase text-slate-400">Dummy password</span><div className="truncate font-mono text-[11px] text-slate-700">{rec.dummy_password}</div></div>
          <button onClick={() => copy(rec.dummy_password, "Password")} data-testid="onb-copy-password" className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100">{copied === "Password" ? <CheckCheck size={12}/> : <Copy size={12}/>}</button>
        </div>
        <div className="text-[10px] text-emerald-700/80">Welcome email with these creds has been queued. The user will be forced to set a new password on first sign-in.</div>
      </div>
    </div>
  );
}
