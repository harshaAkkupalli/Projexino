import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet, Plus, X, Trash2, Download, FileText, FolderPlus, Mail, Send,
  CheckCircle2, AlertCircle, Clock, TrendingUp, FilePlus2, Folder, ChevronRight,
  Receipt, BellRing, BadgePercent, Briefcase, Loader2, ChevronLeft, CreditCard,
  ListChecks, Lock, ThumbsUp, ThumbsDown, ShieldCheck, Copy, ArrowUp, ArrowDown,
  MessageCircle, Landmark, Save, Banknote, BadgeCheck, Archive, MousePointerClick, Eye, Search,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial } from "@react-three/drei";
import { useRef } from "react";
import { api, formatApiError } from "@/lib/api";
import { saveOrShareBlob, downloadApiPdf } from "@/lib/download";
import { PdfCanvasViewer } from "@/components/PdfCanvasViewer";
import { WhatsAppSendModal } from "@/components/WhatsAppSendModal";
import { PdfPreviewModal as SharedPdfPreviewModal } from "@/components/PdfPreviewModal";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const CURRENCIES = [
  { code: "INR", sym: "₹" }, { code: "USD", sym: "$" },
  { code: "EUR", sym: "€" }, { code: "GBP", sym: "£" },
  { code: "AED", sym: "د.إ" }, { code: "SGD", sym: "S$" },
  { code: "AUD", sym: "A$" }, { code: "CAD", sym: "C$" },
  { code: "JPY", sym: "¥" }, { code: "SAR", sym: "﷼" },
  { code: "ZAR", sym: "R" }, { code: "CHF", sym: "Fr" },
];
const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "AE", name: "UAE", currency: "AED" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
];
const PAYMENT_TYPES = [
  { v: "one_time", label: "One-time" },
  { v: "monthly", label: "Monthly" },
  { v: "quarterly", label: "Quarterly" },
  { v: "yearly", label: "Yearly" },
  { v: "milestone", label: "Milestone-based" },
];
const CATEGORIES = ["development", "design", "consulting", "retainer", "support", "marketing", "other"];

const sym = (cur) => (CURRENCIES.find((c) => c.code === cur)?.sym || cur || "");
const money = (a, cur = "INR") => `${sym(cur)}${Number(a || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_BADGE = {
  pending: { label: "Pending", color: "#EF4444", bg: "#FEF2F2", icon: AlertCircle },
  partial: { label: "Partial", color: "#F97316", bg: "#FFF7ED", icon: Clock },
  paid: { label: "Paid", color: "#10B981", bg: "#ECFDF5", icon: CheckCircle2 },
};

// ─── 3D scene (lightweight hero) ─────────────────────────────────
function Coin({ p = [0, 0, 0], color = "#F97316", speed = 1.5 }) {
  const ref = useRef();
  useFrame((s, d) => { if (ref.current) ref.current.rotation.y += d * speed; });
  return (
    <Float speed={1.3} rotationIntensity={0.6} floatIntensity={1.4}>
      <mesh ref={ref} position={p}>
        <torusGeometry args={[0.7, 0.22, 24, 60]} />
        <MeshDistortMaterial color={color} distort={0.18} speed={2.6} metalness={0.6} roughness={0.25} />
      </mesh>
    </Float>
  );
}
function Hero3D() {
  return (
    <Canvas camera={{ position: [0, 0, 6], fov: 45 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[4, 4, 6]} intensity={1.2} />
      <Coin p={[-2.2, 0.4, 0]} color="#F97316" speed={1.2} />
      <Coin p={[0, -0.3, 0]} color="#A855F7" speed={1.6} />
      <Coin p={[2.4, 0.5, 0]} color="#10B981" speed={2.0} />
    </Canvas>
  );
}

export default function Finance() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [activeId, setActiveId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [{ data: a }, { data: b }] = await Promise.all([
        api.get("/finance/projects"),
        api.get("/finance/summary"),
      ]);
      setItems(a);
      setSummary(b);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  if (!["admin","super_admin","manager","hr"].includes(user?.role)) {
    return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">Finance is admin/manager-only.</div>;
  }

  if (activeId) {
    return <FinanceDetail
      id={activeId}
      onClose={() => { setActiveId(null); refresh(); }}
    />;
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0F2042] via-[#1E1B4B] to-[#7C2D12] p-6 md:p-8">
        <div className="grid items-center gap-6 lg:grid-cols-[1fr,360px]">
          <div className="text-white">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] backdrop-blur-md">
              <Wallet size={12} /> Project Finance
            </div>
            <h1 className="font-display mt-3 text-3xl font-bold leading-tight md:text-4xl">
              Budgets, payments & legally crafted invoices —<br /> all in one studio.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-white/70">
              Track discussed vs. locked budgets, log payments by amount or percent, send
              Projexino-branded invoices and friendly reminders — all dynamic across one-time,
              monthly, quarterly, yearly or milestone billing.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {["admin","super_admin"].includes(user?.role) && (
                <>
                  <button
                    data-testid="finance-new-btn"
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-[#F97316] px-5 py-2.5 text-sm font-bold text-white shadow-lg hover:bg-orange-600"
                  >
                    <Plus size={16} /> New finance project
                  </button>
                  <button
                    data-testid="finance-bank-settings-btn"
                    onClick={() => setShowBank(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-md hover:bg-white/20"
                  >
                    <Landmark size={15} /> Bank & payment details
                  </button>
                  <button
                    data-testid="finance-bank-alerts-btn"
                    onClick={() => setShowAlerts(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-bold text-white backdrop-blur-md hover:bg-white/20"
                  >
                    <BellRing size={15} /> Bank alerts
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="h-44 md:h-56">
            <Hero3D />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid gap-3 md:grid-cols-4">
          <Kpi label="Projects" value={summary.total_projects} icon={Briefcase} color="#3B82F6" />
          <Kpi label="Locked (INR equiv.)" value={`₹${Number(summary.total_locked_inr || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} icon={Wallet} color="#0F2042" hint="across all currencies" />
          <Kpi label="Collected (INR equiv.)" value={`₹${Number(summary.total_paid_inr || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} icon={CheckCircle2} color="#10B981" pct={summary.percent_paid_inr} hint={`${summary.percent_paid_inr || 0}% paid`} />
          <Kpi label="Outstanding (INR equiv.)" value={`₹${Number(summary.remaining_inr || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} icon={AlertCircle} color="#F97316" hint="internal view" />
        </div>
      )}

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-500">Active engagements</div>
            <h2 className="font-display text-lg font-semibold text-[#0F2042]">All finance projects</h2>
          </div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center">
            <FilePlus2 size={32} className="mx-auto mb-3 text-slate-300" />
            <div className="text-sm text-slate-500">No finance projects yet. Create one to start tracking budgets & invoices.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((f, i) => (
              <FinanceCard
                key={f.id}
                f={f}
                idx={i}
                onOpen={() => setActiveId(f.id)}
                canDelete={["admin","super_admin"].includes(user?.role)}
                onDeleted={refresh}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateFinanceModal onClose={() => setShowCreate(false)} onSaved={async (fid) => { setShowCreate(false); await refresh(); setActiveId(fid); }} />}
        {showBank && <BankSettingsModal onClose={() => setShowBank(false)} />}
        {showAlerts && <BankAlertsModal onClose={() => setShowAlerts(false)} />}
      </AnimatePresence>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, pct, hint }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2.5" style={{ background: `${color}1a`, color }}><Icon size={18} /></div>
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      </div>
      <div className="mt-2 text-2xl font-bold text-[#0F2042]">{value}</div>
      {hint && <div className="text-[10px] uppercase tracking-wider text-slate-400">{hint}</div>}
      {pct !== undefined && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <motion.div className="h-full" initial={{ width: 0 }} animate={{ width: `${Math.min(pct, 100)}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ background: color }} />
        </div>
      )}
    </motion.div>
  );
}

function FinanceCard({ f, idx, onOpen, canDelete, onDeleted }) {
  const st = STATUS_BADGE[f.payment_status];
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete finance project "${f.project_name}"?\n\nThis will permanently remove all payments, invoices, contacts, and folders for this engagement. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/finance/projects/${f.id}`);
      toast.success(`Deleted "${f.project_name}"`);
      onDeleted?.();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <motion.div
      data-testid={`finance-card-${f.id}`}
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: idx * 0.04 }}
      whileHover={{ y: -3 }}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-lg"
    >
      <button
        onClick={onOpen}
        className="absolute inset-0 z-10 cursor-pointer"
        aria-label={`Open ${f.project_name}`}
      />
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={deleting}
          data-testid={`finance-delete-${f.id}`}
          title="Delete this finance project"
          className="absolute right-3 top-3 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-100 bg-white text-rose-500 opacity-0 shadow-sm transition group-hover:opacity-100 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      )}
      <div className="relative z-0">
      <div className="flex items-start justify-between gap-3 pr-8">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: st.color }}>
            <st.icon size={9} className="mr-1 inline" /> {st.label}
          </div>
          <h3 className="font-display mt-1 truncate text-lg font-semibold text-[#0F2042]">{f.project_name}</h3>
          {f.client_name && <div className="truncate text-xs text-slate-500">{f.client_name}</div>}
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          {PAYMENT_TYPES.find((t) => t.v === f.payment_type)?.label || f.payment_type}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-slate-50 p-2">
          <div className="text-[9px] uppercase tracking-wider text-slate-400">Locked</div>
          <div className="font-bold text-[#0F2042]">{money(f.locked_budget, f.currency)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-2">
          <div className="text-[9px] uppercase tracking-wider text-emerald-700">Paid</div>
          <div className="font-bold text-emerald-700">{money(f.total_paid, f.currency)}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <span>{f.percent_paid}% paid</span>
          <span>Remaining {money(f.remaining, f.currency)}</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${Math.min(f.percent_paid, 100)}%` }} transition={{ duration: 0.7, ease: "easeOut" }}
            className="h-full bg-gradient-to-r from-[#F97316] to-[#A855F7]"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
        <span>📂 {f.documents?.length || 0} folders · 📧 {f.client_emails?.length || 0} contacts</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#F97316] opacity-0 transition group-hover:opacity-100">
          Open <ChevronRight size={12} />
        </span>
      </div>
      </div>
    </motion.div>
  );
}

// ──────────────── Create modal ────────────────
function CreateFinanceModal({ onClose, onSaved }) {
  const [projects, setProjects] = useState([]);
  const [pickExisting, setPickExisting] = useState(false);
  const [form, setForm] = useState({
    project_id: "", project_name: "", client_name: "",
    client_email: "", client_email_name: "",
    discussed_budget: 0, locked_budget: 0,
    currency: "INR", country: "IN", payment_type: "one_time", category: "development",
    start_date: "", end_date: "", notes: "", gst_number: "", billing_address: "",
    payment_terms: "",
  });
  const [busy, setBusy] = useState(false);
  // Auto-pick currency when country changes
  useEffect(() => {
    const c = COUNTRIES.find((x) => x.code === form.country);
    if (c && c.currency !== form.currency) {
      setForm((p) => ({ ...p, currency: c.currency }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.country]);

  useEffect(() => { api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {}); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.project_name) { toast.error("Project name required"); return; }
    setBusy(true);
    try {
      const payload = {
        project_id: pickExisting ? form.project_id : "",
        project_name: form.project_name,
        client_name: form.client_name,
        client_emails: form.client_email ? [{ email: form.client_email, name: form.client_email_name, primary: true }] : [],
        discussed_budget: parseFloat(form.discussed_budget) || 0,
        locked_budget: parseFloat(form.locked_budget) || 0,
        currency: form.currency,
        country: form.country,
        payment_type: form.payment_type,
        category: form.category,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes,
        gst_number: form.gst_number,
        billing_address: form.billing_address,
        payment_terms: form.payment_terms,
      };
      const { data } = await api.post("/finance/projects", payload);
      toast.success("Finance project created");
      onSaved(data.id);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        data-testid="finance-create-modal"
        className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-2xl font-bold text-[#0F2042]">New finance project</h3>
          <button type="button" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-1 text-xs">
          <button type="button" onClick={() => setPickExisting(false)}
            className={`px-3 py-1.5 rounded-md ${!pickExisting ? "bg-white shadow font-semibold text-[#F97316]" : "text-slate-600"}`}>Create new project</button>
          <button type="button" onClick={() => setPickExisting(true)}
            className={`px-3 py-1.5 rounded-md ${pickExisting ? "bg-white shadow font-semibold text-[#F97316]" : "text-slate-600"}`}>Link existing project</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {pickExisting ? (
            <Field label="Existing project *" cls="md:col-span-2">
              <select value={form.project_id}
                onChange={(e) => {
                  const p = projects.find((x) => x.id === e.target.value);
                  setForm({ ...form, project_id: e.target.value, project_name: p?.name || form.project_name, client_name: p?.client || form.client_name });
                }}
                data-testid="fin-project-select"
                className="modal-input">
                <option value="">— pick a project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Project name *" cls="md:col-span-2">
              <input data-testid="fin-name" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} className="modal-input" />
            </Field>
          )}
          <Field label="Client name"><input data-testid="fin-client" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} className="modal-input" /></Field>
          <Field label="Category">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="modal-input">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Primary client email"><input data-testid="fin-email" type="email" value={form.client_email} onChange={(e) => setForm({ ...form, client_email: e.target.value })} className="modal-input" /></Field>
          <Field label="Contact name"><input value={form.client_email_name} onChange={(e) => setForm({ ...form, client_email_name: e.target.value })} className="modal-input" /></Field>

          <Field label="Discussed budget"><input type="number" min="0" step="0.01" value={form.discussed_budget} onChange={(e) => setForm({ ...form, discussed_budget: e.target.value })} className="modal-input" /></Field>
          <Field label="Locked budget *"><input data-testid="fin-locked" type="number" min="0" step="0.01" value={form.locked_budget} onChange={(e) => setForm({ ...form, locked_budget: e.target.value })} className="modal-input" /></Field>

          <Field label="Currency">
            <div className="flex gap-1">
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} data-testid="fin-currency" className="modal-input flex-1">
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.sym} {c.code}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Country (auto-picks currency)">
            <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} data-testid="fin-country" className="modal-input">
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.currency})</option>)}
            </select>
          </Field>
          <Field label="Payment type">
            <select data-testid="fin-paytype" value={form.payment_type} onChange={(e) => setForm({ ...form, payment_type: e.target.value })} className="modal-input">
              {PAYMENT_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="Start date"><input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="modal-input" /></Field>
          <Field label="End date"><input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="modal-input" /></Field>
          <Field label="GSTIN"><input value={form.gst_number} onChange={(e) => setForm({ ...form, gst_number: e.target.value })} className="modal-input" /></Field>
          <Field label="Billing address" cls="md:col-span-2"><textarea rows={2} value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} className="modal-input" /></Field>
          <Field label="Payment terms (editable; appears on every invoice)" cls="md:col-span-2">
            <textarea data-testid="fin-payment-terms" rows={3} value={form.payment_terms}
              onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
              placeholder="Net 14 days from issue. Late payments may attract interest at 1.5% per month. …"
              className="modal-input" />
          </Field>
          <Field label="Notes" cls="md:col-span-2"><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="modal-input" /></Field>
        </div>

        <button data-testid="fin-create-submit" disabled={busy}
          className="mt-5 w-full rounded-xl bg-gradient-to-r from-[#F97316] to-[#A855F7] py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60">
          {busy ? "Creating…" : "Create finance project"}
        </button>
        <style>{`.modal-input{width:100%;border:1px solid #E2E8F0;background:#F8FAFC;border-radius:10px;padding:8px 12px;font-size:14px;outline:none}.modal-input:focus{border-color:#F97316;box-shadow:0 0 0 1px #F97316}`}</style>
      </motion.form>
    </motion.div>
  );
}

function Field({ label, children, cls = "" }) {
  return (
    <label className={`block ${cls}`}>
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

// ──────────────── Detail page ────────────────
function FinanceDetail({ id, onClose }) {
  const [f, setF] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [tab, setTab] = useState("overview");

  const reload = async () => {
    const [{ data: a }, { data: b }] = await Promise.all([
      api.get(`/finance/projects/${id}`),
      api.get(`/finance/invoices?finance_id=${id}`).catch(() => ({ data: [] })),
    ]);
    setF(a);
    setInvoices(b);
  };
  useEffect(() => { reload(); }, [id]);

  if (!f) return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  const st = STATUS_BADGE[f.payment_status];

  return (
    <div className="space-y-5">
      <button onClick={onClose} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-[#0F2042]">
        <ChevronLeft size={14} /> All finance projects
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="bg-gradient-to-r from-[#0F2042] to-[#1E1B4B] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] backdrop-blur-md">
                {PAYMENT_TYPES.find((t) => t.v === f.payment_type)?.label} · {f.category}
              </div>
              <h1 className="font-display mt-2 text-3xl font-bold">{f.project_name}</h1>
              <div className="text-sm text-white/70">{f.client_name || "—"}</div>
            </div>
            <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ background: st.bg, color: st.color }}>
              <st.icon size={11} className="mr-1 inline" /> {st.label}
            </span>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <MiniStat label="Locked budget" value={money(f.locked_budget, f.currency)} />
            <MiniStat label="Discussed" value={money(f.discussed_budget, f.currency)} />
            <MiniStat label="Collected" value={money(f.total_paid, f.currency)} positive />
            <MiniStat label="Remaining" value={money(f.remaining, f.currency)} warn />
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-white/70">
              <span>{f.percent_paid}% paid</span>
              <span>{money(f.total_paid, f.currency)} of {money(f.locked_budget, f.currency)}</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-white/10">
              <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(f.percent_paid, 100)}%` }} transition={{ duration: 0.8 }}
                className="h-full bg-gradient-to-r from-[#F97316] via-[#EAB308] to-[#10B981]" />
            </div>
          </div>
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-5 overflow-x-auto">
          {[
            { id: "overview", label: "Overview", icon: TrendingUp },
            { id: "milestones", label: "Milestones", icon: ListChecks },
            { id: "payments", label: "Payments", icon: BadgePercent },
            { id: "invoices", label: "Invoices", icon: Receipt },
            { id: "receipts", label: "Receipts", icon: BadgeCheck },
            { id: "contacts", label: "Client emails", icon: Mail },
            { id: "documents", label: "Documents", icon: Folder },
          ].map((t) => (
            <button key={t.id} data-testid={`fin-tab-${t.id}`} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition whitespace-nowrap ${tab === t.id ? "border-[#F97316] text-[#0F2042]" : "border-transparent text-slate-500 hover:text-[#0F2042]"}`}>
              <t.icon size={14} /> {t.label}
              {t.id === "milestones" && f.milestone_summary?.total > 0 && (
                <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-[#F97316]">{f.milestone_summary.total}</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "overview" && <OverviewPane f={f} reload={reload} />}
          {tab === "milestones" && <MilestonesPane f={f} reload={reload} />}
          {tab === "payments" && <PaymentsPane f={f} reload={reload} />}
          {tab === "invoices" && <InvoicesPane f={f} invoices={invoices} reload={reload} />}
          {tab === "receipts" && <ReceiptsPane f={f} />}
          {tab === "contacts" && <ContactsPane f={f} reload={reload} />}
          {tab === "documents" && <DocsPane f={f} reload={reload} />}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, positive, warn }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/60">{label}</div>
      <div className={`mt-0.5 text-xl font-bold ${positive ? "text-emerald-300" : warn ? "text-orange-300" : "text-white"}`}>{value}</div>
    </div>
  );
}

function OverviewPane({ f, reload }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Billing</div>
        <div className="mt-2 space-y-1.5 text-sm">
          <Row k="Currency" v={f.currency} />
          <Row k="Payment type" v={PAYMENT_TYPES.find((t) => t.v === f.payment_type)?.label} />
          <Row k="Category" v={f.category} />
          <Row k="GSTIN" v={f.gst_number || "—"} />
          <Row k="Start" v={f.start_date || "—"} />
          <Row k="End" v={f.end_date || "—"} />
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Address</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{f.billing_address || "—"}</div>
        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Notes</div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{f.notes || "—"}</div>
      </div>
    </div>
  );
}
function Row({ k, v }) {
  return <div className="flex justify-between"><span className="text-slate-500">{k}</span><span className="font-medium text-[#0F2042]">{v}</span></div>;
}

/* =========== Milestones Pane =========== */
function MilestonesPane({ f, reload }) {
  const milestones = f.milestones || [];
  const summary = f.milestone_summary || {};
  const nextId = summary.next_unlocked_id || "";
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");

  const sendForConfirmation = async (m) => {
    setBusy(m.id + ":send");
    try {
      const { data } = await api.post(`/finance/projects/${f.id}/milestones/${m.id}/send-for-confirmation`);
      toast.success(`Sent for approval (${data.emailed_to} client${data.emailed_to !== 1 ? "s" : ""} emailed)`);
      try {
        await navigator.clipboard.writeText(data.confirm_link);
        toast.success("Public link copied to clipboard", { duration: 2200 });
      } catch {  /* clipboard may be blocked — link still emailed */  }
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const markPaid = async (m) => {
    if (!window.confirm(`Mark "${m.title}" as paid (${money(m.amount, f.currency)})?\n\nThis auto-creates a payment entry and unlocks the next milestone.`)) return;
    setBusy(m.id + ":paid");
    try {
      await api.post(`/finance/projects/${f.id}/milestones/${m.id}/mark-paid`, {});
      toast.success("Milestone paid — next milestone is unlocked");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete milestone "${m.title}"?`)) return;
    try {
      await api.delete(`/finance/projects/${f.id}/milestones/${m.id}`);
      toast.success("Removed");
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const copyLink = async (m) => {
    const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/api$/, "");
    const link = `${base}/milestone/confirm?t=${m.confirmation_token}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Public confirm link copied");
    } catch { toast.error("Couldn't copy — link: " + link); }
  };

  const move = async (m, delta) => {
    try {
      await api.patch(`/finance/projects/${f.id}/milestones/${m.id}`, { order: (m.order || 0) + delta });
      reload();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const reachableTotal = (milestones || []).reduce((s, m) => s + (m.amount || 0), 0);
  const lockedDelta = Math.round((f.locked_budget || 0) - reachableTotal);

  return (
    <div data-testid="finance-milestones-pane" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/40 via-white to-violet-50/30 p-4">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// MILESTONE BILLING</div>
          <div className="mt-1 text-sm text-slate-700">
            Quote broken into <b>{summary.total || 0}</b> milestones · 
            <b className="text-emerald-700"> {summary.paid || 0}</b> paid · 
            <b className="text-violet-700"> {summary.confirmed || 0}</b> confirmed · 
            <b className="text-amber-700"> {summary.awaiting_confirmation || 0}</b> awaiting · 
            <b className="text-slate-500"> {summary.planned || 0}</b> planned
            {summary.rejected > 0 && <b className="text-rose-700"> · {summary.rejected} rejected</b>}
          </div>
          {milestones.length > 0 && Math.abs(lockedDelta) > 0 && (
            <p className="mt-1 text-[11px] text-rose-600">
              ⚠ Milestone total ({money(reachableTotal, f.currency)}) is {lockedDelta > 0 ? "below" : "over"} the locked budget by {money(Math.abs(lockedDelta), f.currency)}.
            </p>
          )}
        </div>
        <button onClick={() => setShow(true)} className="btn-primary text-xs" data-testid="finance-add-milestone">
          <Plus size={14} /> Add milestone
        </button>
      </div>

      {milestones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <ListChecks size={32} className="mx-auto text-slate-300" />
          <div className="mt-2 font-display text-base font-semibold text-[#0F2042]">No milestones yet</div>
          <p className="mt-1 text-xs text-slate-500">Break the quote into 2–6 milestones. Clients approve each one in order — payment unlocks the next.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {milestones.map((m, i) => (
            <MilestoneCard key={m.id} m={m} idx={i} f={f}
              isNext={m.id === nextId}
              busy={busy}
              onSend={() => sendForConfirmation(m)}
              onMarkPaid={() => markPaid(m)}
              onCopyLink={() => copyLink(m)}
              onRemove={() => remove(m)}
              onMoveUp={i > 0 ? () => move(m, -1) : null}
              onMoveDown={i < milestones.length - 1 ? () => move(m, 1) : null}
            />
          ))}
        </div>
      )}

      {show && <NewMilestoneModal f={f} onClose={() => setShow(false)} onSaved={reload} />}
    </div>
  );
}

function MilestoneCard({ m, idx, f, isNext, busy, onSend, onMarkPaid, onCopyLink, onRemove, onMoveUp, onMoveDown }) {
  const palette = {
    planned: { label: "Planned", bg: "bg-slate-100", text: "text-slate-600", icon: Clock },
    awaiting_confirmation: { label: "Awaiting Client", bg: "bg-amber-100", text: "text-amber-700", icon: Mail },
    confirmed: { label: "Confirmed", bg: "bg-violet-100", text: "text-violet-700", icon: ThumbsUp },
    invoiced: { label: "Invoiced", bg: "bg-blue-100", text: "text-blue-700", icon: Receipt },
    paid: { label: "Paid", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
    rejected: { label: "Rejected", bg: "bg-rose-100", text: "text-rose-700", icon: ThumbsDown },
  }[m.status] || { label: m.status, bg: "bg-slate-100", text: "text-slate-600", icon: Clock };
  const isLocked = !isNext && m.status === "planned";
  const isFinal = m.status === "paid";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      data-testid={`finance-milestone-${m.id}`}
      className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition ${isFinal ? "border-emerald-200" : isLocked ? "border-slate-200 opacity-70" : "border-orange-200"}`}
    >
      {isLocked && (
        <div className="absolute inset-0 z-10 cursor-not-allowed bg-slate-50/10 backdrop-blur-[1px]" />
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${palette.bg} ${palette.text}`}>
          {m.order || idx + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-base font-semibold text-[#0F2042]">{m.title}</h3>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${palette.bg} ${palette.text}`}>
              <palette.icon size={9} className="mr-1 inline" /> {palette.label}
            </span>
            {isLocked && <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600"><Lock size={9}/> Locked</span>}
            {isNext && m.status === "planned" && <span className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-2 py-0.5 text-[9px] font-bold uppercase text-white">Next up</span>}
          </div>
          {m.description && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{m.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span><b className="text-[#0F2042]">{money(m.amount, f.currency)}</b></span>
            {m.due_date && <span>Due {m.due_date}</span>}
            {m.client_confirmed_at && m.status === "confirmed" && <span className="text-violet-600">Client approved {m.client_confirmed_at.slice(0, 10)}</span>}
            {m.client_decision_note && (
              <span className="rounded bg-slate-50 px-2 py-0.5 italic">&ldquo;{m.client_decision_note.slice(0, 80)}&rdquo;</span>
            )}
          </div>
        </div>
        <div className="relative z-20 flex flex-wrap items-center gap-1.5">
          {!isFinal && (
            <div className="flex flex-col gap-0.5">
              <button onClick={onMoveUp} disabled={!onMoveUp} className="rounded border border-slate-200 p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30"><ArrowUp size={11}/></button>
              <button onClick={onMoveDown} disabled={!onMoveDown} className="rounded border border-slate-200 p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30"><ArrowDown size={11}/></button>
            </div>
          )}
          {m.status === "planned" && !isLocked && (
            <button onClick={onSend} disabled={busy === m.id + ":send"} data-testid={`milestone-send-${m.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow disabled:opacity-50">
              {busy === m.id + ":send" ? <Loader2 size={11} className="animate-spin"/> : <Send size={11}/>} Send for approval
            </button>
          )}
          {m.status === "awaiting_confirmation" && (
            <button onClick={onCopyLink} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-amber-800 hover:bg-amber-200" data-testid={`milestone-copy-${m.id}`}>
              <Copy size={11}/> Copy approval link
            </button>
          )}
          {(m.status === "confirmed" || m.status === "invoiced") && (
            <button onClick={onMarkPaid} disabled={busy === m.id + ":paid"} data-testid={`milestone-paid-${m.id}`}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white shadow disabled:opacity-50 hover:bg-emerald-700">
              {busy === m.id + ":paid" ? <Loader2 size={11} className="animate-spin"/> : <CheckCircle2 size={11}/>} Mark paid
            </button>
          )}
          {m.status === "rejected" && (
            <button onClick={onSend} className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white" data-testid={`milestone-resend-${m.id}`}>
              <Send size={11}/> Resend revised
            </button>
          )}
          {!isFinal && (
            <button onClick={onRemove} className="rounded-full border border-slate-200 p-1.5 text-slate-400 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-500" data-testid={`milestone-delete-${m.id}`}>
              <Trash2 size={11}/>
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function NewMilestoneModal({ f, onClose, onSaved }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim() || !amount) { toast.error("Title and amount required"); return; }
    setBusy(true);
    try {
      await api.post(`/finance/projects/${f.id}/milestones`, {
        title: title.trim(),
        description: description.trim(),
        amount: parseFloat(amount),
        due_date: dueDate,
      });
      toast.success("Milestone added");
      onSaved(); onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" data-testid="finance-new-milestone-modal">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">New Milestone</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-4 space-y-3">
          <MField label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Discovery & Scope"
              data-testid="milestone-title-input"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </MField>
          <MField label={`Amount (${f.currency})`}>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="30000"
              data-testid="milestone-amount-input"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </MField>
          <MField label="Target date (optional)">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </MField>
          <MField label="Scope / deliverable description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              placeholder="What the client gets when this milestone is approved…"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </MField>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary text-xs" data-testid="milestone-save">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Add milestone
          </button>
        </div>
      </div>
    </div>
  );
}

function MField({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function BankAlertsModal({ onClose }) {
  const [alerts, setAlerts] = useState(null);
  const [scanning, setScanning] = useState(false);
  const load = () => api.get("/finance/bank-alerts").then(({ data }) => setAlerts(data)).catch((e) => { toast.error(formatApiError(e)); setAlerts([]); });
  useEffect(() => { load(); }, []);
  const ACTION_STYLE = {
    flagged: "bg-emerald-100 text-emerald-700",
    auto_approved: "bg-emerald-600 text-white",
    ambiguous: "bg-amber-100 text-amber-700",
    no_match: "bg-slate-100 text-slate-500",
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="bank-alerts-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60"><BellRing size={11} /> Watcher audit</div>
            <div className="font-display text-lg font-bold">Bank credit alerts</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                setScanning(true);
                try {
                  const { data } = await api.post("/finance/bank-alerts/scan");
                  toast.success(`Scan done — ${data.alerts} alert(s): ${data.flagged} flagged, ${data.auto_approved} auto-approved, ${data.no_match} unmatched`);
                  load();
                } catch (e) { toast.error(formatApiError(e)); }
                setScanning(false);
              }}
              disabled={scanning} data-testid="bank-alerts-scan"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {scanning ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Scan now
            </button>
            <button onClick={onClose} className="rounded-full p-1.5 text-white/80 hover:bg-white/10" data-testid="bank-alerts-close"><X size={18} /></button>
          </div>
        </header>
        <div className="overflow-y-auto p-5">
          {alerts === null ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]" /></div>
          ) : alerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">
              <BellRing size={26} className="mx-auto mb-2 text-slate-300" />
              No credit alerts parsed yet. The watcher scans your Gmail every 3 minutes once connected — or hit "Scan now".
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="rounded-xl border border-slate-200 p-3" data-testid={`bank-alert-${a.id}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${ACTION_STYLE[a.action] || "bg-slate-100 text-slate-500"}`}>
                      {String(a.action || "").replace(/_/g, " ")}
                    </span>
                    {a.amount != null && <span className="font-bold text-emerald-700">₹{Number(a.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>}
                    {a.utr && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">UTR {a.utr}</span>}
                    <span className="ml-auto text-[10px] text-slate-400">{(a.detected_at || "").slice(0, 16).replace("T", " ")}</span>
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-[#0F2042]">{a.subject || "(no subject)"}</div>
                  <div className="truncate text-[11px] text-slate-500">{a.from}</div>
                  {a.snippet && <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{a.snippet}</p>}
                  {(a.matched_invoice_ids || []).length > 0 && (
                    <div className="mt-1 text-[10px] font-bold text-emerald-600">Matched {a.matched_invoice_ids.length} invoice(s)</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function BankSettingsModal({ onClose }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    api.get("/finance/settings")
      .then(({ data }) => setForm({
        bank_name: data.bank_name || "", account_name: data.account_name || "",
        account_number: data.account_number || "", ifsc: data.ifsc || "",
        swift: data.swift || "", branch: data.branch || "",
        upi_id: data.upi_id || "", payment_note: data.payment_note || "",
        alert_sender: data.alert_sender || "", auto_approve_credits: !!data.auto_approve_credits,
      }))
      .catch((e) => { toast.error(formatApiError(e)); onClose(); });
  }, []);
  const save = async () => {
    setSaving(true);
    try { await api.put("/finance/settings", form); toast.success("Payment details saved — they now appear on every invoice PDF & pay page"); onClose(); }
    catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };
  const FIELDS = [
    ["bank_name", "Bank name", "HDFC Bank"],
    ["account_name", "Account holder name", "Projexino Solutions Pvt Ltd"],
    ["account_number", "Account number", "50100XXXXXXXXX"],
    ["ifsc", "IFSC code", "HDFC0001234"],
    ["swift", "SWIFT code (intl.)", "HDFCINBB"],
    ["branch", "Branch", "Hyderabad"],
    ["upi_id", "UPI ID", "projexino@hdfcbank"],
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="bank-settings-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/60"><Landmark size={11} /> Payment settings</div>
            <div className="font-display text-lg font-bold">Bank & payment details</div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/80 hover:bg-white/10" data-testid="bank-settings-close"><X size={18} /></button>
        </header>
        <div className="space-y-3 overflow-y-auto p-5">
          <p className="rounded-lg bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
            These details appear on every invoice PDF and the client payment page, so clients can pay you directly by bank transfer or UPI.
          </p>
          {!form ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-[#F97316]" /></div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([k, label, ph]) => (
                  <label key={k} className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
                    <input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} placeholder={ph}
                      data-testid={`bank-field-${k}`}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
                  </label>
                ))}
              </div>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Note shown to clients (optional)</span>
                <input value={form.payment_note} onChange={(e) => setForm({ ...form, payment_note: e.target.value })}
                  placeholder="Please share the payment reference after transfer" data-testid="bank-field-payment_note"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
              </label>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  <BellRing size={11} /> Bank credit-alert watcher (via Gmail)
                </div>
                <p className="mb-2 text-[11px] text-emerald-800">
                  Scans your connected Gmail for bank credit alerts every 3 minutes, matches amounts against unpaid INR invoices and notifies you — "1 click to approve". Requires Gmail connected with read access.
                </p>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Bank alert sender email (optional filter)</span>
                  <input value={form.alert_sender} onChange={(e) => setForm({ ...form, alert_sender: e.target.value })}
                    placeholder="alerts@hdfcbank.net" data-testid="bank-field-alert_sender"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                </label>
                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input type="checkbox" checked={form.auto_approve_credits} data-testid="bank-field-auto_approve"
                    onChange={(e) => setForm({ ...form, auto_approve_credits: e.target.checked })} />
                  Auto-approve exact matches (marks invoice paid + generates receipt automatically)
                </label>
                <button
                  onClick={async () => {
                    setScanning(true);
                    try {
                      const { data } = await api.post("/finance/bank-alerts/scan");
                      toast.success(`Scan done — ${data.alerts} alert(s): ${data.flagged} flagged, ${data.auto_approved} auto-approved, ${data.no_match} unmatched`);
                    } catch (e) { toast.error(formatApiError(e)); }
                    setScanning(false);
                  }}
                  disabled={scanning} data-testid="bank-scan-now"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {scanning ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />} Scan inbox now
                </button>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
                <button onClick={save} disabled={saving} data-testid="bank-settings-save"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-5 py-2 text-xs font-bold text-white hover:bg-[#1a3560] disabled:opacity-60">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save details
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function PaymentsPane({ f, reload }) {  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [waReminder, setWaReminder] = useState(null);
  const add = async () => {
    setBusy(true);
    try {
      await api.post(`/finance/projects/${f.id}/payments`, {
        amount: parseFloat(amount) || 0,
        percent: percent ? parseFloat(percent) : null,
        method, note,
      });
      setAmount(""); setPercent(""); setNote("");
      await reload();
      toast.success("Payment recorded");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  const del = async (pid) => {
    if (!window.confirm("Remove this payment?")) return;
    try { await api.delete(`/finance/projects/${f.id}/payments/${pid}`); await reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Record a payment</div>
        <div className="mt-2 grid gap-2 md:grid-cols-5">
          <input data-testid="pay-amount" placeholder={`Amount (${f.currency})`} type="number" min="0" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)} className="modal-input" />
          <input data-testid="pay-percent" placeholder="or %" type="number" min="0" max="100"
            value={percent} onChange={(e) => setPercent(e.target.value)} className="modal-input" />
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="modal-input">
            <option value="bank_transfer">Bank transfer</option>
            <option value="upi">UPI</option>
            <option value="card">Card</option>
            <option value="cheque">Cheque</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
          <input placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} className="modal-input md:col-span-1" />
          <button onClick={add} disabled={busy} data-testid="pay-add-btn" className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">
            {busy ? "…" : "Record"}
          </button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">%</th><th className="px-3 py-2">Method</th><th className="px-3 py-2 text-left">Note</th><th></th></tr>
          </thead>
          <tbody>
            {(f.payments || []).length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-400">No payments recorded yet</td></tr>
            ) : (f.payments || []).map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-600">{p.paid_at}</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700">{money(p.amount, f.currency)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{p.percent?.toFixed(1)}%</td>
                <td className="px-3 py-2 text-slate-600">{p.method}</td>
                <td className="px-3 py-2 text-slate-600">{p.note || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <button data-testid={`pay-del-${p.id}`} onClick={() => del(p.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {f.remaining > 0 && (
        <div className="flex flex-wrap gap-2">
          <button data-testid="send-reminder-btn"
            onClick={async () => {
              try { const { data } = await api.post(`/finance/projects/${f.id}/reminder`, { message: "" });
                toast.success(`Reminder sent to ${data.sent_to?.join(", ")}`);
              } catch (e) { toast.error(formatApiError(e)); }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#F97316] bg-orange-50 px-4 py-2 text-sm font-semibold text-[#F97316] hover:bg-orange-100">
            <BellRing size={14} /> Send payment reminder
          </button>
          <button data-testid="whatsapp-reminder-btn"
            onClick={async () => {
              try { const { data } = await api.post(`/finance/projects/${f.id}/whatsapp-reminder`);
                setWaReminder({ text: data.wa_text });
              } catch (e) { toast.error(formatApiError(e)); }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#25D366] bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
            <MessageCircle size={14} /> Remind on WhatsApp
          </button>
        </div>
      )}
      {waReminder && <WhatsAppSendModal title="Payment reminder · WhatsApp" subtitle={f.client_name || f.project_name} text={waReminder.text} onTextChange={(t) => setWaReminder({ ...waReminder, text: t })} onClose={() => setWaReminder(null)} />}
    </div>
  );
}

function InvoicesPane({ f, invoices, reload }) {
  const [show, setShow] = useState(false);
  const [showSend, setShowSend] = useState(null);
  const [previewInv, setPreviewInv] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [wa, setWa] = useState(null);
  const [sel, setSel] = useState([]);
  const [payReq, setPayReq] = useState(null);
  const [approve, setApprove] = useState(null);
  const primaryEmail = (f.client_emails || []).find((e) => e.primary)?.email || (f.client_emails || [])[0]?.email || "";
  const openWa = async (inv) => {
    try {
      const { data } = await api.post(`/finance/invoices/${inv.id}/whatsapp`, {});
      setWa({ inv, text: data.wa_text, download_url: data.download_url, link_block: data.link_block, qr_attach: data.qr_attach });
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const download = async (inv) => {
    try {
      await downloadApiPdf(`/finance/invoices/${inv.id}/pdf`, `${inv.invoice_no}.pdf`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const preview = async (inv) => {
    try {
      const res = await api.get(`/finance/invoices/${inv.id}/pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
      setPreviewInv(inv);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl("");
    setPreviewInv(null);
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{invoices.length} invoice{invoices.length !== 1 ? "s" : ""}</div>
        <button data-testid="new-invoice-btn" onClick={() => setShow(true)} className="inline-flex items-center gap-1 rounded-lg bg-[#0F2042] px-4 py-2 text-sm font-bold text-white hover:bg-[#1E293B]">
          <Plus size={14} /> Create invoice
        </button>
      </div>
      <ZipBar count={sel.length} onClear={() => setSel([])} invoiceIds={sel} defaultEmail={primaryEmail} />
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">
          <Receipt size={28} className="mx-auto mb-2 text-slate-300" />
          No invoices yet — create one to see a branded PDF preview here
        </div>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-[#F97316] hover:shadow-md"
            >
              <input type="checkbox" checked={sel.includes(inv.id)} data-testid={`inv-check-${inv.id}`}
                onChange={(e) => setSel(e.target.checked ? [...sel, inv.id] : sel.filter((x) => x !== inv.id))} />
              <button
                data-testid={`inv-preview-${inv.id}`}
                onClick={() => preview(inv)}
                title="Preview PDF"
                className="relative flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 transition hover:border-[#F97316]"
              >
                <FileText size={20} className="text-[#F97316]" />
                <span className="absolute bottom-0 left-0 right-0 bg-[#0F2042] py-0.5 text-center text-[7px] font-bold uppercase tracking-wider text-white">PDF</span>
              </button>
              <div className="min-w-[170px] flex-1">
                <button onClick={() => preview(inv)} className="text-left">
                  <div className="font-bold text-[#0F2042]">{inv.invoice_no}</div>
                  <div className="text-xs text-slate-500">
                    Issued {inv.issued_at?.slice(0, 10)} · Due {inv.due_date || "—"}
                    <span className={`ml-2 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${inv.status === "sent" ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-[#F97316]"}`}>
                      {inv.status}
                    </span>
                  </div>
                </button>
                {(inv.pay_view_count > 0 || inv.pay_click_count > 0 || inv.bank_claimed_at) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {inv.pay_view_count > 0 && (
                      <span data-testid={`inv-views-${inv.id}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">
                        <Eye size={9} /> Viewed ×{inv.pay_view_count}
                      </span>
                    )}
                    {inv.pay_click_count > 0 && (
                      <span data-testid={`inv-payclicks-${inv.id}`} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-[#F97316]">
                        <MousePointerClick size={9} /> Pay clicked ×{inv.pay_click_count} · {inv.last_pay_click_at?.slice(0, 10)}
                      </span>
                    )}
                    {inv.credit_detected_at && inv.status !== "paid" && (
                      <span data-testid={`inv-credit-${inv.id}`} className="inline-flex animate-pulse items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                        ₹ Credit detected{inv.credit_alert?.utr ? ` · UTR ${inv.credit_alert.utr}` : ""} — approve to confirm
                      </span>
                    )}
                    {inv.bank_claimed_at && inv.status !== "paid" && (
                      <span data-testid={`inv-bankclaim-${inv.id}`} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                        <Landmark size={9} /> Client says paid · {inv.bank_claimed_at.slice(0, 10)} — verify & approve
                      </span>
                    )}
                  </div>
                )}
              </div>
              <span className="shrink-0 font-bold text-[#F97316]">{money(inv.amount, inv.currency)}</span>
              <div className="ml-auto flex items-center gap-1">
                <button data-testid={`inv-pdf-${inv.id}`} onClick={() => download(inv)} title="Download PDF"
                  className="rounded-lg border border-slate-200 p-2 hover:border-[#F97316] hover:text-[#F97316]"><Download size={14} /></button>
                {inv.status === "paid" && (
                  <span data-testid={`inv-paid-${inv.id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    <CheckCircle2 size={11}/> Paid
                  </span>
                )}
                {inv.status !== "paid" && (
                  <>
                    <button data-testid={`inv-payreq-${inv.id}`} onClick={() => setPayReq(inv)} title="Request payment (email with Pay Now button)"
                      className="rounded-lg border border-orange-300 bg-orange-50 p-2 text-[#F97316] hover:bg-orange-100"><Banknote size={14} /></button>
                    <button data-testid={`inv-approve-${inv.id}`} onClick={() => setApprove(inv)} title="Approve payment & generate receipt"
                      className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700"><BadgeCheck size={14} /></button>
                  </>
                )}
                <button data-testid={`inv-send-${inv.id}`} onClick={() => setShowSend(inv)} title="Send to client"
                  className="rounded-lg bg-[#F97316] p-2 text-white hover:bg-orange-600"><Send size={14} /></button>
                <button data-testid={`inv-wa-${inv.id}`} onClick={() => openWa(inv)} title="Send via WhatsApp"
                  className="rounded-lg bg-[#25D366] p-2 text-white hover:bg-[#1DA851]"><MessageCircle size={14} /></button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {payReq && <PaymentRequestModal f={f} inv={payReq} onClose={() => setPayReq(null)} onSent={async () => { setPayReq(null); await reload(); }} />}
        {approve && <ApprovePaymentModal inv={approve} onClose={() => setApprove(null)} onApproved={async () => { setApprove(null); await reload(); }} />}
        {show && <CreateInvoiceModal f={f} onClose={() => setShow(false)} onSaved={async (newInv) => { setShow(false); await reload(); if (newInv) preview(newInv); }} />}
        {showSend && <SendInvoiceModal f={f} inv={showSend} onClose={() => setShowSend(null)} onSent={async () => { setShowSend(null); await reload(); }} />}
        {previewInv && <PdfPreviewModal inv={previewInv} url={previewUrl} f={f} onClose={closePreview}
          onDownload={() => download(previewInv)} onSend={() => { closePreview(); setShowSend(previewInv); }}
          onWhatsApp={() => { const inv = previewInv; closePreview(); openWa(inv); }} />}
        {wa && (
          <WhatsAppSendModal
            title={`${wa.inv.invoice_no} · Invoice`}
            subtitle={`${f.client_name || ""} · ${money(wa.inv.amount, wa.inv.currency)}`}
            text={wa.text}
            onTextChange={(t) => setWa({ ...wa, text: t })}
            downloadUrl={wa.download_url}
            linkBlock={wa.link_block}
            attachments={[
              { path: `/finance/invoices/${wa.inv.id}/pdf`, filename: `${wa.inv.invoice_no}.pdf`, type: "application/pdf" },
              ...(wa.qr_attach ? [{ url: "/phonepe-qr.png", filename: "Projexino-PhonePe-QR.png", type: "image/png" }] : []),
            ]}
            onClose={() => setWa(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

async function downloadZip(invoiceIds, receiptIds) {
  const res = await api.post("/finance/documents/zip", { invoice_ids: invoiceIds, receipt_ids: receiptIds }, { responseType: "blob" });
  await saveOrShareBlob(new Blob([res.data], { type: "application/zip" }),
    `projexino-documents-${new Date().toISOString().slice(0, 10)}.zip`, "application/zip");
}

function EmailZipModal({ invoiceIds, receiptIds, defaultEmail, onClose }) {
  const [to, setTo] = useState(defaultEmail || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!to.trim()) return toast.error("Enter the recipient email");
    setBusy(true);
    try {
      const { data } = await api.post("/finance/documents/zip-email", { invoice_ids: invoiceIds, receipt_ids: receiptIds, to_email: to.trim(), message });
      toast.success(`ZIP with ${data.count} document${data.count !== 1 ? "s" : ""} sent to ${to.trim()}`);
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="zip-email-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div className="font-display text-lg font-bold">Email documents as ZIP</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/80 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="space-y-3 p-5">
          <p className="text-[11px] text-slate-500">{invoiceIds.length + receiptIds.length} document{invoiceIds.length + receiptIds.length !== 1 ? "s" : ""} will be zipped and attached.</p>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" data-testid="zip-email-to"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Optional message to include…" data-testid="zip-email-message"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={send} disabled={busy} data-testid="zip-email-send"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send ZIP
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ZipBar({ count, onClear, invoiceIds = [], receiptIds = [], defaultEmail = "" }) {
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  if (!count) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0F2042]/20 bg-[#0F2042]/5 px-3 py-2" data-testid="zip-bar">
      <span className="text-xs font-bold text-[#0F2042]">{count} selected</span>
      <button data-testid="zip-download-btn" disabled={busy}
        onClick={async () => { setBusy(true); try { await downloadZip(invoiceIds, receiptIds); toast.success("ZIP downloaded"); } catch (e) { toast.error(formatApiError(e)); } setBusy(false); }}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-[#1a3560] disabled:opacity-60">
        {busy ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />} Download ZIP
      </button>
      <button data-testid="zip-email-btn" onClick={() => setShowEmail(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-4 py-1.5 text-[11px] font-bold text-white hover:bg-orange-600">
        <Mail size={11} /> Email ZIP
      </button>
      <button onClick={onClear} data-testid="zip-clear-btn" className="ml-auto text-[11px] font-bold text-slate-500 hover:text-slate-800">Clear</button>
      <AnimatePresence>
        {showEmail && <EmailZipModal invoiceIds={invoiceIds} receiptIds={receiptIds} defaultEmail={defaultEmail} onClose={() => setShowEmail(false)} />}
      </AnimatePresence>
    </div>
  );
}

function PaymentRequestModal({ f, inv, onClose, onSent }) {
  const emails = f.client_emails || [];
  const [ids, setIds] = useState(emails.filter((e) => e.primary).map((e) => e.id));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/finance/invoices/${inv.id}/payment-email`, { to_email_ids: ids, extra_message: extra });
      toast.success(`Payment request sent to ${data.sent_to.join(", ")}`);
      onSent();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="payment-request-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-[#F97316] to-[#FBBF24] px-5 py-4 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Request payment</div>
          <div className="font-display text-lg font-bold">{inv.invoice_no} · {money(inv.amount, inv.currency)}</div>
        </header>
        <div className="space-y-3 p-5">
          <p className="text-[11px] text-slate-500">Sends a branded email with a <b>PAY NOW</b> button. The client can pay by bank transfer, UPI or card — every view & click is tracked here.</p>
          <div className="space-y-1.5">
            {emails.length === 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">No client emails on this project — add one in the Contacts tab first.</p>}
            {emails.map((e) => (
              <label key={e.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <input type="checkbox" checked={ids.includes(e.id)} data-testid={`payreq-email-${e.id}`}
                  onChange={(ev) => setIds(ev.target.checked ? [...ids, e.id] : ids.filter((x) => x !== e.id))} />
                <span className="min-w-0 flex-1 truncate">{e.email}</span>
                {e.primary && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold uppercase text-[#F97316]">Primary</span>}
              </label>
            ))}
          </div>
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={2} placeholder="Optional note to the client…" data-testid="payreq-message"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={send} disabled={busy || ids.length === 0} data-testid="payreq-send"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send payment request
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ApprovePaymentModal({ inv, onClose, onApproved }) {
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const approve = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/finance/invoices/${inv.id}/approve-payment`, { method, note });
      toast.success(`Payment approved — receipt ${data.receipt_no} generated`);
      onApproved(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="approve-payment-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-emerald-600 px-5 py-4 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Approve payment</div>
          <div className="font-display text-lg font-bold">{inv.invoice_no} · {money(inv.amount, inv.currency)}</div>
        </header>
        <div className="space-y-3 p-5">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
            Confirm only after verifying the amount is credited to your bank account. This marks the invoice <b>paid</b>, records the payment, and generates an official receipt.
          </p>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="approve-method"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600">
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference / UTR number (optional)" data-testid="approve-note"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={approve} disabled={busy} data-testid="approve-confirm"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />} Approve & generate receipt
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EmailReceiptModal({ rec, defaultEmail, onClose }) {
  const [to, setTo] = useState(defaultEmail || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!to.trim()) return toast.error("Enter the recipient email");
    setBusy(true);
    try {
      await api.post(`/finance/receipts/${rec.id}/email`, { to_email: to.trim(), message });
      toast.success(`Receipt ${rec.receipt_no} emailed to ${to.trim()}`);
      onClose();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="receipt-email-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div className="font-display text-lg font-bold">Email receipt {rec.receipt_no}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/80 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="space-y-3 p-5">
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" data-testid="receipt-email-to"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Optional message…" data-testid="receipt-email-message"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0F2042]" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={send} disabled={busy} data-testid="receipt-email-send"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send receipt
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateReceiptModal({ f, onClose, onCreated }) {
  const [invoices, setInvoices] = useState([]);
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [note, setNote] = useState("");
  const [recordPayment, setRecordPayment] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get(`/finance/invoices?finance_id=${f.id}`)
      .then(({ data }) => setInvoices(data.filter((i) => i.status !== "paid")))
      .catch(() => {});
  }, [f.id]);
  const create = async () => {
    if (!invoiceId && !(parseFloat(amount) > 0)) return toast.error("Select an invoice or enter the paid amount");
    setBusy(true);
    try {
      const payload = invoiceId
        ? { invoice_id: invoiceId, method, note }
        : { finance_id: f.id, amount: parseFloat(amount), method, note, record_payment: recordPayment };
      const { data } = await api.post("/finance/receipts", payload);
      toast.success(`Receipt ${data.receipt_no} created`);
      onCreated();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" onClick={onClose} data-testid="create-receipt-modal">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-emerald-600 px-5 py-4 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">New receipt</div>
          <div className="font-display text-lg font-bold">{f.project_name}</div>
        </header>
        <div className="space-y-3 p-5">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Against invoice</span>
            <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} data-testid="receipt-invoice-select"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600">
              <option value="">No invoice — standalone receipt</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>{i.invoice_no} · {money(i.amount, i.currency)} · {i.status}</option>
              ))}
            </select>
          </label>
          {invoiceId ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              The invoice will be marked <b>paid</b>, the payment recorded, and the receipt generated with its amount.
            </p>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Amount received ({f.currency})</span>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="receipt-amount"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} data-testid="receipt-record-payment" />
                Also record this as a payment on the project
              </label>
            </>
          )}
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment method</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} data-testid="receipt-method"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600">
              <option value="bank_transfer">Bank transfer</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reference / UTR number (optional)" data-testid="receipt-note"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={create} disabled={busy} data-testid="receipt-create-confirm"
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <BadgeCheck size={12} />} Create receipt
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReceiptsPane({ f }) {
  const [receipts, setReceipts] = useState(null);
  const [sel, setSel] = useState([]);
  const [wa, setWa] = useState(null);
  const [previewRec, setPreviewRec] = useState(null);
  const [emailRec, setEmailRec] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const primaryEmail = (f.client_emails || []).find((e) => e.primary)?.email || (f.client_emails || [])[0]?.email || "";
  const load = () => api.get(`/finance/receipts?finance_id=${f.id}`).then(({ data }) => setReceipts(data)).catch((e) => { toast.error(formatApiError(e)); setReceipts([]); });
  useEffect(() => { load(); }, [f.id]);
  const download = async (rec) => {
    try {
      await downloadApiPdf(`/finance/receipts/${rec.id}/pdf`, `${rec.receipt_no}.pdf`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const openWa = async (rec) => {
    try {
      const { data } = await api.post(`/finance/receipts/${rec.id}/whatsapp`);
      setWa({ rec, text: data.wa_text, download_url: data.download_url, link_block: data.link_block });
    } catch (e) { toast.error(formatApiError(e)); }
  };
  if (receipts === null) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]" /></div>;
  return (
    <div className="space-y-3" data-testid="receipts-pane">
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{receipts.length} receipt{receipts.length !== 1 ? "s" : ""} — generated on approval, or create one manually</div>
        <button data-testid="receipts-create-btn" onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">
          <Plus size={14} /> Create receipt
        </button>
      </div>
      <ZipBar count={sel.length} onClear={() => setSel([])} receiptIds={sel} defaultEmail={primaryEmail} />
      {receipts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">
          <BadgeCheck size={28} className="mx-auto mb-2 text-slate-300" />
          No receipts yet — approve a payment on an invoice to generate the first one
        </div>
      ) : (
        <div className="space-y-2">
          {receipts.map((rec) => (
            <div key={rec.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition hover:border-emerald-400 hover:shadow-md" data-testid={`receipt-row-${rec.id}`}>
              <input type="checkbox" checked={sel.includes(rec.id)} data-testid={`receipt-check-${rec.id}`}
                onChange={(e) => setSel(e.target.checked ? [...sel, rec.id] : sel.filter((x) => x !== rec.id))} />
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><BadgeCheck size={18} /></div>
              <div className="min-w-[170px] flex-1 cursor-pointer" onClick={() => setPreviewRec(rec)} data-testid={`receipt-open-${rec.id}`} title="Click to open the receipt PDF">
                <div className="font-bold text-[#0F2042]">{rec.receipt_no}</div>
                <div className="text-xs text-slate-500">
                  Ref {rec.invoice_no} · {rec.approved_at?.slice(0, 10)} · {String(rec.method || "").replace(/_/g, " ")}
                  {rec.emailed_to && <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">Emailed</span>}
                </div>
              </div>
              <span className="shrink-0 font-bold text-emerald-600">{money(rec.amount, rec.currency)}</span>
              <div className="ml-auto flex items-center gap-1">
                <button data-testid={`receipt-pdf-${rec.id}`} onClick={() => download(rec)} title="Download PDF"
                  className="rounded-lg border border-slate-200 p-2 hover:border-emerald-500 hover:text-emerald-600"><Download size={14} /></button>
                <button data-testid={`receipt-email-${rec.id}`} onClick={() => setEmailRec(rec)} title="Email receipt"
                  className="rounded-lg bg-[#F97316] p-2 text-white hover:bg-orange-600"><Mail size={14} /></button>
                <button data-testid={`receipt-wa-${rec.id}`} onClick={() => openWa(rec)} title="Send via WhatsApp"
                  className="rounded-lg bg-[#25D366] p-2 text-white hover:bg-[#1DA851]"><MessageCircle size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {showCreate && <CreateReceiptModal f={f} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
        {previewRec && <SharedPdfPreviewModal title={`${previewRec.receipt_no} · Receipt`} fetchPath={`/finance/receipts/${previewRec.id}/pdf`}
          filename={`${previewRec.receipt_no}.pdf`} onClose={() => setPreviewRec(null)} />}
        {emailRec && <EmailReceiptModal rec={emailRec} defaultEmail={primaryEmail} onClose={() => setEmailRec(null)} />}
        {wa && (
          <WhatsAppSendModal
            title={`${wa.rec.receipt_no} · Receipt`}
            subtitle={`${wa.rec.client_name || ""} · ${money(wa.rec.amount, wa.rec.currency)}`}
            text={wa.text}
            onTextChange={(t) => setWa({ ...wa, text: t })}
            downloadUrl={wa.download_url}
            linkBlock={wa.link_block}
            attachments={[
              { path: `/finance/receipts/${wa.rec.id}/pdf`, filename: `${wa.rec.receipt_no}.pdf`, type: "application/pdf" },
            ]}
            onClose={() => setWa(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function PdfPreviewModal({ inv, url, f, onClose, onDownload, onSend, onWhatsApp }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
        data-testid="invoice-preview-modal"
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-[#0F2042] to-[#1E1B4B] px-4 py-3 text-white sm:px-5">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/60">Invoice preview</div>
            <div className="truncate text-base font-bold sm:text-lg">{inv.invoice_no} · {money(inv.amount, inv.currency)}</div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button onClick={onDownload} data-testid="preview-download" className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-2 text-[11px] font-semibold hover:bg-white/20 sm:px-3 sm:text-xs"><Download size={13} /> Download</button>
            <button onClick={onSend} data-testid="preview-send" className="inline-flex items-center gap-1 rounded-lg bg-[#F97316] px-2.5 py-2 text-[11px] font-bold hover:bg-orange-600 sm:px-3 sm:text-xs"><Send size={13} /> Send</button>
            {onWhatsApp && <button onClick={onWhatsApp} data-testid="preview-whatsapp" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366] px-2.5 py-2 text-[11px] font-bold hover:bg-[#1DA851] sm:px-3 sm:text-xs"><MessageCircle size={13} /> WhatsApp</button>}
            <button onClick={onClose} className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={18} /></button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden bg-slate-200">
          {url ? (
            <PdfCanvasViewer url={url} />
          ) : (
            <div className="flex h-[78vh] items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 animate-spin" size={16} /> Loading PDF…</div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CreateInvoiceModal({ f, onClose, onSaved }) {
  const [items, setItems] = useState([{ description: f.project_name + " — milestone", qty: 1, rate: f.remaining || f.locked_budget || 0 }]);
  const [tax, setTax] = useState(18);
  const [discount, setDiscount] = useState(0);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(f.payment_terms || "");
  const [busy, setBusy] = useState(false);
  const subtotal = items.reduce((s, x) => s + (parseFloat(x.qty) || 0) * (parseFloat(x.rate) || 0), 0);
  const total = subtotal + subtotal * (parseFloat(tax) || 0) / 100 - (parseFloat(discount) || 0);
  const updateItem = (idx, k, v) => setItems((p) => p.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));
  const addRow = () => setItems((p) => [...p, { description: "", qty: 1, rate: 0 }]);
  const delRow = (idx) => setItems((p) => p.filter((_, i) => i !== idx));
  const submit = async () => {
    if (subtotal <= 0) { toast.error("Invoice must have a positive amount"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/finance/projects/${f.id}/invoices`, {
        amount: subtotal, items,
        tax_percent: parseFloat(tax) || 0,
        discount: parseFloat(discount) || 0,
        due_date: due, notes,
        payment_terms: terms,
      });
      toast.success(`Invoice ${data.invoice_no} generated`);
      onSaved(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-[#0F2042]">Create invoice</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-12 items-center gap-2">
              <input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Description"
                data-testid={`inv-line-desc-${idx}`}
                className="col-span-6 modal-input" />
              <input type="number" min="0" step="0.01" value={it.qty} onChange={(e) => updateItem(idx, "qty", e.target.value)}
                className="col-span-2 modal-input" placeholder="Qty" />
              <input type="number" min="0" step="0.01" value={it.rate} onChange={(e) => updateItem(idx, "rate", e.target.value)}
                className="col-span-3 modal-input" placeholder={`Rate (${f.currency})`} />
              <button onClick={() => delRow(idx)} className="col-span-1 rounded p-1 text-rose-400 hover:bg-rose-50"><Trash2 size={14} /></button>
            </div>
          ))}
          <button onClick={addRow} className="text-xs font-semibold text-[#F97316] hover:underline">+ Add line</button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <Field label={`Tax % (GST)`}><input type="number" min="0" max="100" value={tax} onChange={(e) => setTax(e.target.value)} className="modal-input" /></Field>
          <Field label={`Discount (${f.currency})`}><input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} className="modal-input" /></Field>
          <Field label="Due date"><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="modal-input" /></Field>
        </div>
        <Field label="Notes" cls="mt-2"><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="modal-input" /></Field>
        <Field label="Payment terms (overrides default for THIS invoice)" cls="mt-2">
          <textarea data-testid="inv-payment-terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)}
            placeholder="Net 14 days from issue. Late payments may attract interest at 1.5% per month. …"
            className="modal-input" />
        </Field>
        <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-semibold">{money(subtotal, f.currency)}</span></div>
          <div className="flex justify-between text-slate-500"><span>GST ({tax}%)</span><span>{money(subtotal * (parseFloat(tax) || 0) / 100, f.currency)}</span></div>
          <div className="flex justify-between text-slate-500"><span>Discount</span><span>− {money(discount, f.currency)}</span></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-base font-bold text-[#0F2042]"><span>Total</span><span>{money(total, f.currency)}</span></div>
        </div>
        <button data-testid="inv-create-submit" onClick={submit} disabled={busy}
          className="mt-5 w-full rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">
          {busy ? <Loader2 className="animate-spin mx-auto" size={16} /> : "Generate invoice PDF"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function SendInvoiceModal({ f, inv, onClose, onSent }) {
  const [selected, setSelected] = useState((f.client_emails || []).filter((e) => e.primary).map((e) => e.id));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [fromTokenId, setFromTokenId] = useState("");
  useEffect(() => {
    api.get("/email/status").then(({ data }) => {
      setAccounts(data.accounts || []);
      setFromTokenId(data.default_id || "");
    }).catch(() => {});
  }, []);
  const send = async () => {
    if (selected.length === 0) { toast.error("Pick at least one recipient"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/finance/invoices/${inv.id}/send`, {
        to_email_ids: selected,
        extra_message: extra,
        from_token_id: fromTokenId || "",
      });
      toast.success(`Sent from ${data.from || "Projexino"} to ${data.sent_to.join(", ")}`);
      onSent();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ scale: 0.95 }} animate={{ scale: 1 }}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-[#0F2042]">Send invoice {inv.invoice_no}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        {accounts.length > 1 && (
          <Field label="Send from" cls="mb-3">
            <select data-testid="send-from-account" value={fromTokenId} onChange={(e) => setFromTokenId(e.target.value)} className="modal-input">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.email} {a.default ? "· default" : ""}</option>
              ))}
            </select>
          </Field>
        )}
        {(f.client_emails || []).length === 0 ? (
          <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800">Add a client email first (Contacts tab).</div>
        ) : (
          <div className="space-y-2">
            {(f.client_emails || []).map((e) => (
              <label key={e.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm hover:bg-slate-50">
                <input type="checkbox" data-testid={`send-pick-${e.email}`}
                  checked={selected.includes(e.id)} onChange={() => setSelected((p) => p.includes(e.id) ? p.filter((x) => x !== e.id) : [...p, e.id])} />
                <span className="flex-1">
                  <div className="font-semibold text-[#0F2042]">{e.name || e.email}</div>
                  <div className="text-xs text-slate-500">{e.email}</div>
                </span>
                {e.primary && <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-[#F97316]">PRIMARY</span>}
              </label>
            ))}
            <Field label="Additional message (optional)" cls="mt-3"><textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} className="modal-input" /></Field>
          </div>
        )}
        <button data-testid="send-invoice-confirm" onClick={send} disabled={busy || (f.client_emails || []).length === 0 || accounts.length === 0}
          className="mt-4 w-full rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">
          {busy ? "Sending…" : accounts.length === 0 ? "Connect Gmail first" : "Send email with PDF attached"}
        </button>
      </motion.div>
    </motion.div>
  );
}

function ContactsPane({ f, reload }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const add = async () => {
    if (!email) { toast.error("Enter an email"); return; }
    try { await api.post(`/finance/projects/${f.id}/client-emails`, { email, name }); setEmail(""); setName(""); await reload(); toast.success("Added"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const setPrimary = async (eid) => {
    try { await api.patch(`/finance/projects/${f.id}/client-emails/${eid}`, { primary: true }); await reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (eid) => {
    if (!window.confirm("Remove this contact?")) return;
    try { await api.delete(`/finance/projects/${f.id}/client-emails/${eid}`); await reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">Add client email</div>
        <div className="mt-2 grid gap-2 md:grid-cols-[1fr,1fr,auto]">
          <input data-testid="contact-email" type="email" placeholder="email@client.com" value={email} onChange={(e) => setEmail(e.target.value)} className="modal-input" />
          <input data-testid="contact-name" placeholder="Contact name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="modal-input" />
          <button data-testid="contact-add" onClick={add} className="rounded-lg bg-[#F97316] px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">Add</button>
        </div>
      </div>
      {(f.client_emails || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">No client emails yet</div>
      ) : (
        <div className="space-y-2">
          {(f.client_emails || []).map((e) => (
            <div key={e.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3">
              <div>
                <div className="font-semibold text-[#0F2042]">{e.name || e.email}</div>
                <div className="text-xs text-slate-500">{e.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {e.primary ? (
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-[#F97316]">PRIMARY</span>
                ) : (
                  <button data-testid={`contact-primary-${e.email}`} onClick={() => setPrimary(e.id)} className="text-[10px] text-slate-500 hover:text-[#F97316]">Make primary</button>
                )}
                <button data-testid={`contact-del-${e.email}`} onClick={() => del(e.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocsPane({ f, reload }) {
  const [folderName, setFolderName] = useState("");
  const [openFid, setOpenFid] = useState(null);
  const addFolder = async () => {
    if (!folderName) return;
    try { await api.post(`/finance/projects/${f.id}/folders`, { name: folderName }); setFolderName(""); await reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const delFolder = async (fid) => {
    if (!window.confirm("Delete folder & all its files?")) return;
    try { await api.delete(`/finance/projects/${f.id}/folders/${fid}`); await reload(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const uploadFile = async (folderId, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB per file"); return; }
    const b64 = await new Promise((res) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] || "");
      r.readAsDataURL(file);
    });
    try {
      await api.post(`/finance/projects/${f.id}/folders/${folderId}/files`, {
        name: file.name, mime: file.type || "application/octet-stream", size: file.size, content_base64: b64,
      });
      await reload();
      toast.success("Uploaded");
    } catch (err) { toast.error(formatApiError(err)); }
  };
  const downloadFile = async (folderId, fileId, name) => {
    try {
      const { data } = await api.get(`/finance/projects/${f.id}/folders/${folderId}/files/${fileId}/download`);
      const a = document.createElement("a");
      a.href = `data:${data.mime_type};base64,${data.content_base64}`;
      a.download = data.name || name; a.click();
    } catch (err) { toast.error(formatApiError(err)); }
  };
  const delFile = async (folderId, fileId) => {
    if (!window.confirm("Delete this file?")) return;
    try { await api.delete(`/finance/projects/${f.id}/folders/${folderId}/files/${fileId}`); await reload(); }
    catch (err) { toast.error(formatApiError(err)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input data-testid="folder-name" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="New folder name" className="modal-input flex-1" />
        <button data-testid="folder-add" onClick={addFolder} className="inline-flex items-center gap-1 rounded-lg bg-[#0F2042] px-4 py-2 text-sm font-bold text-white">
          <FolderPlus size={14} /> Add folder
        </button>
      </div>
      {(f.documents || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">No document folders yet</div>
      ) : (
        <div className="space-y-2">
          {(f.documents || []).map((folder) => (
            <div key={folder.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-4 py-3">
                <button data-testid={`folder-${folder.id}`} onClick={() => setOpenFid((v) => v === folder.id ? null : folder.id)} className="flex items-center gap-2 text-left">
                  <Folder size={16} className="text-[#F97316]" />
                  <div>
                    <div className="font-semibold text-[#0F2042]">{folder.name}</div>
                    <div className="text-[11px] text-slate-500">{folder.files?.length || 0} file(s)</div>
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <label className="cursor-pointer rounded-md border border-slate-200 px-3 py-1 text-xs hover:border-[#F97316] hover:text-[#F97316]">
                    + Upload
                    <input type="file" hidden onChange={(e) => uploadFile(folder.id, e)} data-testid={`upload-${folder.id}`} />
                  </label>
                  <button onClick={() => delFolder(folder.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
              </div>
              {openFid === folder.id && (
                <div className="border-t border-slate-100 p-3">
                  {(folder.files || []).length === 0 ? (
                    <div className="rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-400">Empty</div>
                  ) : (
                    <div className="space-y-1.5">
                      {folder.files.map((file) => (
                        <div key={file.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <div className="flex items-center gap-2 text-xs">
                            <FileText size={13} className="text-slate-400" />
                            <span className="font-medium text-[#0F2042]">{file.name}</span>
                            <span className="text-[10px] text-slate-400">{Math.round((file.size || 0) / 1024)} KB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => downloadFile(folder.id, file.id, file.name)} className="text-[10px] font-semibold text-[#F97316] hover:underline">Download</button>
                            <button onClick={() => delFile(folder.id, file.id)} className="text-slate-400 hover:text-rose-500"><Trash2 size={12} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
