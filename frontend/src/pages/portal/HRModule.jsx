import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ScrollText, Receipt, FileSignature, Calculator, PieChart, Plus, Trash2, Loader2,
  X, Save, Download, Settings as SettingsIcon, Calendar, CheckCircle2, FileDown, ExternalLink, Edit3,
  Plane, FolderOpen, FileSearch, BriefcaseBusiness, ShieldCheck, GraduationCap, Upload, Award,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf, downloadBrandedCsv } from "@/lib/download";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import Leave from "./Leave";
import Documents from "./Documents";
import DocVerification from "./DocVerification";
import HrOnboarding from "./HrOnboarding";
import HrLetters from "./HrLetters";
import HrCertificates from "./HrCertificates";
import { AdminsTab } from "./AccessControl";
import { InternsBoard } from "./Interns";

const TABS = [
  { v: "regulations", label: "Regulations", icon: ScrollText },
  { v: "onboarding",  label: "Onboarding",  icon: BriefcaseBusiness },
  { v: "letters",     label: "HR Letters",  icon: FileSignature },
  { v: "team-access", label: "Team Access", icon: ShieldCheck },
  { v: "interns",     label: "Interns",     icon: GraduationCap },
  { v: "certificates", label: "Certificates", icon: Award },
  { v: "leave",       label: "Leave & Time-Off", icon: Plane },
  { v: "payslips",    label: "Payslips",    icon: Receipt },
  { v: "sign-docs",   label: "Documents to sign", icon: FileSignature },
  { v: "documents",   label: "Documents",   icon: FolderOpen },
  { v: "doc-verify",  label: "Doc Verify",  icon: FileSearch },
  { v: "audit",       label: "Audit",       icon: PieChart },
  { v: "expenses",    label: "Expenses",    icon: Calculator },
];

export default function HRModule() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const urlTab = params.get("tab");
  const [tab, setTab] = useState(urlTab && TABS.some((t) => t.v === urlTab) ? urlTab : "regulations");

  // Keep URL in sync so deep-links (e.g. /app/hr?tab=letters) land on the right tab
  useEffect(() => {
    if (urlTab && urlTab !== tab && TABS.some((t) => t.v === urlTab)) setTab(urlTab);
  }, [urlTab]);
  const setTabAndUrl = (v) => {
    setTab(v);
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  if (!["super_admin", "admin", "hr", "manager"].includes(user?.role)) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center text-rose-700">
        HR module is for Super Admin, Admin, HR or Manager.
      </div>
    );
  }

  return (
    <div data-testid="page-hr" className="space-y-5">
      <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-white via-amber-50/40 to-rose-50/40 p-5 md:p-7">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-amber-600">// hr · operations</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">HR Module</h1>
        <p className="mt-1 text-sm text-slate-600">Regulations, payslips, signatures, expenses and yearly audit — all in one place. Super Admin controls every option.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.v}
              data-testid={`hr-tab-${t.v}`}
              onClick={() => setTabAndUrl(t.v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                tab === t.v ? "bg-[#0F2042] text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#0F2042]"
              }`}
            >
              <t.icon size={12} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "regulations" && <RegulationsTab />}
      {tab === "onboarding"  && <HrOnboarding />}
      {tab === "letters"     && <HrLetters embedded={true} />}
      {tab === "team-access" && <AdminsTab canCreate={true} />}
      {tab === "interns"     && <InternsBoard heroVariant="compact" canCreate={true} />}
      {tab === "certificates" && <HrCertificates />}
      {tab === "leave"       && <Leave />}
      {tab === "payslips"    && <PayslipsTab />}
      {tab === "sign-docs"   && <SignDocsTab />}
      {tab === "documents"   && <Documents />}
      {tab === "doc-verify"  && <DocVerification />}
      {tab === "audit"       && <AuditTab />}
      {tab === "expenses"    && <ExpensesTab />}
    </div>
  );
}

// ============ Regulations ============
function RegulationsTab() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [editor, setEditor] = useState(null);
  const canEdit = ["super_admin", "admin", "hr"].includes(user?.role);

  const load = async () => {
    try { const { data } = await api.get("/hr/regulations"); setList(data); }
    catch { toast.error("Failed"); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this regulation?")) return;
    await api.delete(`/hr/regulations/${id}`);
    load(); toast.success("Deleted");
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <button data-testid="hr-reg-new" onClick={() => setEditor({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2 text-sm font-bold text-white shadow">
          <Plus size={14} /> New regulation
        </button>
      )}
      {list.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No regulations yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((r) => (
            <div key={r.id} data-testid={`hr-reg-${r.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">{r.category}</div>
                  <div className="font-bold text-[#0F2042]">{r.title}</div>
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => setEditor(r)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600"><Edit3 size={11} /></button>
                    <button onClick={() => remove(r.id)} className="rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-600"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
              <div className="prose prose-sm mt-3 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: r.body_html || "" }} />
              {r.effective_from && <div className="mt-2 text-[10px] text-slate-400">Effective: {r.effective_from}</div>}
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>{editor && <RegEditor reg={editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}</AnimatePresence>
    </div>
  );
}

function RegEditor({ reg, onClose, onSaved }) {
  const [form, setForm] = useState({ title: reg.title || "", category: reg.category || "general",
    body_html: reg.body_html || "", effective_from: reg.effective_from || "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (reg.id) await api.patch(`/hr/regulations/${reg.id}`, form);
      else await api.post("/hr/regulations", form);
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <ModalShell title={reg.id ? "Edit regulation" : "New regulation"} onClose={onClose}>
      <div className="space-y-3">
        <TF label="Title *" v={form.title} on={(v) => setForm({ ...form, title: v })} testId="hr-reg-title" />
        <div className="grid grid-cols-2 gap-3">
          <TS label="Category" v={form.category} on={(v) => setForm({ ...form, category: v })}
            options={[{v:"general",label:"General"},{v:"leave",label:"Leave"},{v:"conduct",label:"Code of Conduct"},{v:"payroll",label:"Payroll"},{v:"benefits",label:"Benefits"},{v:"security",label:"Security"}]} testId="hr-reg-cat" />
          <TF label="Effective from" v={form.effective_from} on={(v) => setForm({ ...form, effective_from: v })} testId="hr-reg-eff" placeholder="YYYY-MM-DD" />
        </div>
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Body (HTML allowed)</span>
          <textarea rows={8} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })}
            data-testid="hr-reg-body"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#F97316]" />
        </label>
        <button onClick={save} disabled={busy} data-testid="hr-reg-save"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
    </ModalShell>
  );
}

// ============ Payslips ============
function PayslipsTab() {
  const { user } = useAuth();
  const isHR = ["super_admin", "admin", "hr"].includes(user?.role);
  const [cfg, setCfg] = useState(null);
  const [slips, setSlips] = useState([]);
  const [showCfg, setShowCfg] = useState(false);
  const [showGen, setShowGen] = useState(false);

  const load = async () => {
    try {
      const [c, s] = await Promise.all([api.get("/hr/payslip-config"), api.get("/hr/payslips")]);
      setCfg(c.data); setSlips(s.data);
    } catch { toast.error("Failed"); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      {isHR && (
        <div className="flex flex-wrap gap-2">
          <button data-testid="hr-payslip-cfg" onClick={() => setShowCfg(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-2 text-xs font-bold text-white">
            <SettingsIcon size={12} /> Configure fields &amp; schedule
          </button>
          <button data-testid="hr-payslip-gen" onClick={() => setShowGen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-2 text-xs font-bold text-white shadow">
            <Plus size={12} /> Generate payslip
          </button>
          {cfg?.schedule?.enabled && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700">
              <Calendar size={11} /> Auto-runs on day {cfg.schedule.day_of_month} of each month
            </span>
          )}
        </div>
      )}
      {slips.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No payslips yet.</div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2 text-left">Slip #</th><th className="px-4 py-2 text-left">Employee</th><th className="px-4 py-2 text-left">Month</th><th className="px-4 py-2 text-right">Net pay</th><th className="px-4 py-2"></th></tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id} data-testid={`hr-slip-${s.slip_no}`} className="border-t border-slate-100 hover:bg-orange-50/40">
                  <td className="px-4 py-2 font-mono text-xs text-[#F97316]">{s.slip_no}</td>
                  <td className="px-4 py-2"><div className="font-bold text-[#0F2042]">{s.employee.name}</div><div className="text-xs text-slate-500">{s.employee.email}</div></td>
                  <td className="px-4 py-2 text-xs">{s.month}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-700">INR {s.net_pay.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={async () => {
                        try { await downloadApiPdf(`/hr/payslips/${s.id}/pdf`, `Projexino_Payslip_${s.month}_${s.slip_no}.pdf`); }
                        catch (e) { toast.error(formatApiError(e)); }
                      }}
                      data-testid={`hr-slip-pdf-${s.slip_no}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#1E3A8A]">
                      <FileDown size={11} /> PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AnimatePresence>
        {showCfg && cfg && <PayslipConfigModal cfg={cfg} onClose={() => setShowCfg(false)} onSaved={() => { setShowCfg(false); load(); }} />}
        {showGen && <GeneratePayslipModal onClose={() => setShowGen(false)} onDone={() => { setShowGen(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function PayslipConfigModal({ cfg, onClose, onSaved }) {
  const [fields, setFields] = useState(cfg.fields || []);
  const [sch, setSch] = useState(cfg.schedule || { enabled: false, day_of_month: 1, auto_email: true, employer_address: "Projexino Solutions, India" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.put("/hr/payslip-config/fields", { fields });
      await api.put("/hr/payslip-config/schedule", sch);
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error("Failed"); }
    finally { setBusy(false); }
  };
  const upd = (i, k, v) => { const c = [...fields]; c[i] = { ...c[i], [k]: v }; setFields(c); };
  return (
    <ModalShell title="Payslip configuration" onClose={onClose} max="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Toggle which fields are visible &amp; which are mandatory. Default % is applied to <b>gross salary</b> when generating.
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Default %</th><th className="px-3 py-2">Visible</th><th className="px-3 py-2">Mandatory</th></tr>
            </thead>
            <tbody>
              {fields.map((f, i) => (
                <tr key={f.key} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-bold text-[#0F2042]">{f.label}</td>
                  <td className="px-3 py-2 capitalize">{f.type}</td>
                  <td className="px-3 py-2"><input type="number" step="0.1" value={f.default_percent ?? 0}
                    onChange={(e) => upd(i, "default_percent", parseFloat(e.target.value) || 0)}
                    data-testid={`hr-cfg-pct-${f.key}`}
                    className="w-20 rounded border border-slate-200 px-2 py-1 text-right" /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" checked={!!f.visible} onChange={(e) => upd(i, "visible", e.target.checked)} data-testid={`hr-cfg-visible-${f.key}`} /></td>
                  <td className="px-3 py-2 text-center"><input type="checkbox" checked={!!f.mandatory} onChange={(e) => upd(i, "mandatory", e.target.checked)} data-testid={`hr-cfg-mandatory-${f.key}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-amber-50 p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">Auto-schedule</div>
          <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4">
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={sch.enabled} onChange={(e) => setSch({ ...sch, enabled: e.target.checked })} data-testid="hr-sch-enabled" />
              Auto-generate monthly
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={sch.auto_email} onChange={(e) => setSch({ ...sch, auto_email: e.target.checked })} data-testid="hr-sch-email" />
              Email PDF to employee
            </label>
            <label className="flex items-center gap-2 text-xs">
              Day of month: <input type="number" min={1} max={28} value={sch.day_of_month} onChange={(e) => setSch({ ...sch, day_of_month: parseInt(e.target.value) || 1 })} data-testid="hr-sch-day" className="w-16 rounded border border-slate-200 px-2 py-1" />
            </label>
            <TF label="Employer address" v={sch.employer_address || ""} on={(v) => setSch({ ...sch, employer_address: v })} testId="hr-sch-addr" />
          </div>
        </div>

        <button onClick={save} disabled={busy} data-testid="hr-cfg-save"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save configuration
        </button>
      </div>
    </ModalShell>
  );
}

function GeneratePayslipModal({ onClose, onDone }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ employee_id: "", month: new Date().toISOString().slice(0, 7), gross_salary: "", auto_email: true, notes: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // Portal users directory = the real employee accounts
    api.get("/members/directory")
      .then(({ data }) => setEmployees((data || []).filter((u) => u.email)))
      .catch(() => toast.error("Could not load employees"));
  }, []);
  const generate = async () => {
    if (!form.employee_id || !form.month) { toast.error("Pick employee + month"); return; }
    setBusy(true);
    try {
      const body = { ...form, gross_salary: form.gross_salary ? parseFloat(form.gross_salary) : null };
      await api.post("/hr/payslips/generate", body);
      toast.success("Payslip generated"); onDone();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <ModalShell title="Generate payslip" onClose={onClose}>
      <div className="space-y-3">
        <TS label="Employee *" v={form.employee_id} on={(v) => setForm({ ...form, employee_id: v })}
          testId="hr-gen-emp"
          options={[{v:"",label:"— pick —"}, ...employees.map((e) => ({ v: e.id, label: `${e.name} · ${e.email}` }))]} />
        <div className="grid grid-cols-2 gap-3">
          <TF label="Month (YYYY-MM) *" v={form.month} on={(v) => setForm({ ...form, month: v })} testId="hr-gen-month" />
          <TF label="Gross salary (INR)" v={form.gross_salary} on={(v) => setForm({ ...form, gross_salary: v })} testId="hr-gen-gross" placeholder="leave blank for team default" />
        </div>
        <TF label="Notes" v={form.notes} on={(v) => setForm({ ...form, notes: v })} testId="hr-gen-notes" />
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={form.auto_email} onChange={(e) => setForm({ ...form, auto_email: e.target.checked })} data-testid="hr-gen-email" />
          Auto-email PDF to employee
        </label>
        <button onClick={generate} disabled={busy} data-testid="hr-gen-go"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Receipt size={14} />} Generate
        </button>
      </div>
    </ModalShell>
  );
}

// ============ Sign Docs ============
function SignDocsTab() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [editor, setEditor] = useState(null);
  const [signing, setSigning] = useState(null);
  const [qrDoc, setQrDoc] = useState("");
  const [qrToken, setQrToken] = useState("");
  const canEdit = ["super_admin", "admin", "hr"].includes(user?.role);

  const load = async () => {
    try { const { data } = await api.get("/hr/sign-docs"); setList(data); }
    catch { toast.error("Failed"); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      {canEdit && (
        <button data-testid="hr-sign-new" onClick={() => setEditor({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2 text-sm font-bold text-white shadow">
          <Plus size={14} /> New document
        </button>
      )}
      {list.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">No documents yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((d) => (
            <div key={d.id} data-testid={`hr-sign-${d.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">audience: {d.audience_role}</div>
                  <div className="font-bold text-[#0F2042]">{d.name}</div>
                </div>
                {d.i_have_signed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={10} /> Signed</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={async () => {
                        if (qrDoc === d.id) { setQrDoc(""); return; }
                        try {
                          const { data } = await api.post(`/hr/sign-docs/${d.id}/sign-link`);
                          setQrToken(data.token); setQrDoc(d.id);
                        } catch (e) { toast.error(formatApiError(e)); }
                      }} data-testid={`hr-sign-qr-${d.id}`}
                      title="Scan to sign from mobile / iPad"
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-[#F97316]">QR</button>
                    <button onClick={() => setSigning(d)} data-testid={`hr-sign-go-${d.id}`}
                      className="rounded-full bg-[#0F2042] px-3 py-1 text-[11px] font-bold text-white">Sign</button>
                  </div>
                )}
              </div>
              {qrDoc === d.id && qrToken && (
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3" data-testid={`hr-sign-qr-panel-${d.id}`}>
                  <div className="rounded-lg bg-white p-2 shadow"><QRCodeSVG value={`${window.location.origin}/doc-sign/${qrToken}`} size={92} fgColor="#0F2042" /></div>
                  <div className="text-[11px] leading-relaxed text-orange-900">
                    <b>Sign "{d.name}" from any device.</b><br />Scan with a phone or iPad camera — a signing page opens instantly for you, no login needed.
                  </div>
                </div>
              )}
              <div className="prose prose-sm mt-3 max-h-48 max-w-none overflow-auto text-slate-700" dangerouslySetInnerHTML={{ __html: d.body_html || "" }} />
              {Array.isArray(d.attachments) && d.attachments.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3" data-testid={`hr-sign-${d.id}-attachments`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Attachments</div>
                  {d.attachments.map((a) => (
                    <button key={a.id} onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { data } = await api.get(`/hr/sign-docs/${d.id}/attachments/${a.id}/download`);
                          const link = document.createElement("a");
                          link.href = `data:${data.mime_type};base64,${data.content_base64}`;
                          link.download = data.name;
                          link.click();
                        } catch { toast.error("Download failed"); }
                      }}
                      data-testid={`hr-sign-download-${a.id}`}
                      className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-orange-50 hover:ring-1 hover:ring-orange-200">
                      <Download size={11} className="text-[#F97316]"/>
                      <span className="flex-1 truncate font-bold text-[#0F2042]">{a.name}</span>
                      <span className="text-[10px] text-slate-500">{(a.size/1024).toFixed(0)} KB</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 text-[10px] text-slate-400">{d.signatures?.length || 0} signature(s)</div>
            </div>
          ))}
        </div>
      )}
      <AnimatePresence>
        {editor && <SignDocEditor onClose={() => setEditor(null)} onSaved={() => { setEditor(null); load(); }} />}
        {signing && <SignNowModal doc={signing} onClose={() => setSigning(null)} onSigned={() => { setSigning(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}
function SignDocEditor({ onClose, onSaved }) {
  const [form, setForm] = useState({ name: "", body_html: "", audience_role: "all" });
  const [files, setFiles] = useState([]); // [{file, b64, name, mime, size}]
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const MAX = 10 * 1024 * 1024;

  const readB64 = (file) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => res(String(fr.result || "").split(",")[1] || "");
    fr.readAsDataURL(file);
  });

  const addFiles = async (list) => {
    const arr = Array.from(list || []);
    for (const f of arr) {
      if (f.size > MAX) { toast.error(`${f.name} > 10MB — skipped`); continue; }
      try {
        const b64 = await readB64(f);
        setFiles((s) => [...s, { name: f.name, mime: f.type || "application/octet-stream", size: f.size, b64 }]);
      } catch { toast.error(`Couldn't read ${f.name}`); }
    }
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name required");
    setBusy(true);
    try {
      await api.post("/hr/sign-docs", {
        ...form,
        attachments: files.map((f) => ({ name: f.name, mime_type: f.mime, size: f.size, content_base64: f.b64 })),
      });
      toast.success("Document created");
      onSaved();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <ModalShell title="New document to sign" onClose={onClose}>
      <div className="space-y-3">
        <TF label="Name *" v={form.name} on={(v) => setForm({ ...form, name: v })} testId="hr-sd-name" />
        <TS label="Audience" v={form.audience_role} on={(v) => setForm({ ...form, audience_role: v })} testId="hr-sd-aud"
          options={[{v:"all",label:"Everyone"},{v:"intern",label:"Interns"},{v:"team_member",label:"Team Members"},{v:"manager",label:"Managers"},{v:"hr",label:"HR"},{v:"admin",label:"Admins"}]} />
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Body (HTML, optional)</span>
          <textarea rows={6} value={form.body_html} onChange={(e) => setForm({ ...form, body_html: e.target.value })}
            data-testid="hr-sd-body" className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-[#F97316]" />
        </label>
        <div>
          <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">Attachments (≤10MB each)</span>
          <div
            onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            data-testid="hr-sd-dropzone"
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${dragOver ? "border-[#F97316] bg-orange-50" : "border-slate-300 bg-slate-50"}`}>
            <Upload size={20} className="mb-1 text-[#F97316]"/>
            <div className="text-xs font-bold text-[#0F2042]">Drop files here, or
              <label className="ml-1 cursor-pointer text-[#F97316] underline">
                browse
                <input type="file" multiple className="hidden" data-testid="hr-sd-file-input" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}/>
              </label>
            </div>
          </div>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs" data-testid="hr-sd-attached">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5">
                  <FileSignature size={11} className="text-slate-400"/>
                  <span className="flex-1 truncate font-bold text-[#0F2042]">{f.name}</span>
                  <span className="text-[10px] text-slate-500">{(f.size/1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setFiles((s) => s.filter((_, idx) => idx !== i))} className="text-rose-500 hover:bg-rose-50 rounded p-0.5"><X size={11}/></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={save} disabled={busy} data-testid="hr-sd-save"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
        </button>
      </div>
    </ModalShell>
  );
}
function SignNowModal({ doc, onClose, onSigned }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const sign = async () => {
    if (!name.trim()) return toast.error("Type your name to sign");
    setBusy(true);
    try { await api.post(`/hr/sign-docs/${doc.id}/sign`, { signed_name: name }); toast.success("Signed"); onSigned(); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <ModalShell title={`Sign: ${doc.name}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="prose prose-sm max-h-64 max-w-none overflow-auto rounded-xl bg-slate-50 p-3" dangerouslySetInnerHTML={{ __html: doc.body_html }} />
        <TF label="Type your full name to sign *" v={name} on={setName} testId="hr-sd-signname" placeholder="e.g. Jane Doe" />
        <button onClick={sign} disabled={busy} data-testid="hr-sd-sign-go"
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 py-3 text-sm font-bold text-white disabled:opacity-60">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSignature size={14} />} Sign &amp; submit
        </button>
      </div>
    </ModalShell>
  );
}

// ============ Audit ============
function AuditTab() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const load = async () => {
    try { const { data } = await api.get(`/hr/audit/${year}`); setData(data); }
    catch { toast.error("Failed"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [year]);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Year</span>
        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value) || year)} data-testid="hr-audit-year"
          className="w-28 rounded-full border border-slate-200 px-3 py-1.5 text-sm" />
        <button data-testid="hr-audit-csv" onClick={() => downloadBrandedCsv({
            filename: `Projexino_Audit_${year}.csv`,
            title: `Yearly Audit Report — ${year}`,
            headers: ["Metric", "Value"],
            rows: [
              ...Object.entries(data.totals).map(([k, v]) => [k.replace(/_/g, " "), v]),
              ["", ""],
              ["Month", "Expenses (INR)", "Payslip outflow (INR)"],
              ...data.monthly.map((m) => [m.month, m.expense || 0, m.payslip_total || 0]),
            ],
          }).then(() => toast.success("Audit CSV ready"))}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-4 py-2 text-xs font-bold text-white hover:bg-[#1a3060]">
          <FileDown size={12} /> Download CSV
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Object.entries(data.totals).map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-gradient-to-br from-white to-slate-50 p-4 ring-1 ring-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{k.replace(/_/g, " ")}</div>
            <div className="mt-1 text-2xl font-bold text-[#0F2042]">{typeof v === "number" && k.includes("inr") ? `₹${v.toLocaleString()}` : v}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">Expenses</th><th className="px-3 py-2 text-right">Payslip outflow</th></tr>
          </thead>
          <tbody>
            {data.monthly.map((m) => (
              <tr key={m.month} className="border-t border-slate-100">
                <td className="px-3 py-2 text-xs">{m.month}</td>
                <td className="px-3 py-2 text-right">₹{(m.expense || 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-right">₹{(m.payslip_total || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Expenses ============
function ExpensesTab() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ title: "", amount: "", category: "operations", period: "monthly", incurred_on: "", note: "" });
  const canEdit = ["super_admin", "admin", "hr"].includes(user?.role);
  const load = async () => {
    try {
      const [l, s] = await Promise.all([api.get("/hr/expenses"), api.get("/hr/expenses/summary")]);
      setList(l.data); setSummary(s.data);
    } catch { toast.error("Failed"); }
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!form.title || !form.amount) return toast.error("Title + amount required");
    try {
      await api.post("/hr/expenses", { ...form, amount: parseFloat(form.amount) });
      setForm({ title: "", amount: "", category: "operations", period: "monthly", incurred_on: "", note: "" });
      load(); toast.success("Added");
    } catch { toast.error("Failed"); }
  };
  const remove = async (id) => {
    await api.delete(`/hr/expenses/${id}`); load();
  };
  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-orange-50 p-4 ring-1 ring-rose-200">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700">This week</div>
            <div className="text-2xl font-bold text-[#0F2042]">₹{summary.week.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 p-4 ring-1 ring-amber-200">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-700">This month</div>
            <div className="text-2xl font-bold text-[#0F2042]">₹{summary.month.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-rose-50 p-4 ring-1 ring-violet-200">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">Total entries</div>
            <div className="text-2xl font-bold text-[#0F2042]">{summary.count}</div>
          </div>
        </div>
      )}
      {canEdit && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">// add expense</div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-6">
            <TF label="Title *" v={form.title} on={(v) => setForm({ ...form, title: v })} testId="hr-exp-title" />
            <TF label="Amount (INR) *" v={form.amount} on={(v) => setForm({ ...form, amount: v })} testId="hr-exp-amt" type="number" />
            <TS label="Category" v={form.category} on={(v) => setForm({ ...form, category: v })} testId="hr-exp-cat"
              options={["operations","salaries","infra","marketing","misc"].map((c) => ({ v: c, label: c }))} />
            <TS label="Period" v={form.period} on={(v) => setForm({ ...form, period: v })} testId="hr-exp-period"
              options={[{v:"weekly",label:"Weekly"},{v:"monthly",label:"Monthly"},{v:"oneoff",label:"One-off"}]} />
            <TF label="Incurred on" v={form.incurred_on} on={(v) => setForm({ ...form, incurred_on: v })} testId="hr-exp-date" placeholder="YYYY-MM-DD" />
            <button onClick={add} data-testid="hr-exp-add" className="self-end rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-2 text-sm font-bold text-white">Add</button>
          </div>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{list.length} expense entries</span>
          <button data-testid="hr-exp-csv" onClick={() => downloadBrandedCsv({
              filename: `Projexino_Expenses_${new Date().toISOString().slice(0, 10)}.csv`,
              title: "Expense Tracker Export",
              headers: ["Title", "Category", "Period", "Incurred on", "Amount (INR)", "Note"],
              rows: list.map((e) => [e.title, e.category, e.period, e.incurred_on, e.amount, e.note || ""]),
            }).then(() => toast.success("Expenses CSV ready"))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-3.5 py-1.5 text-[11px] font-bold text-white hover:bg-[#1a3060]">
            <FileDown size={11} /> Download CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2">Cat.</th><th className="px-3 py-2">Period</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} data-testid={`hr-exp-${e.id}`} className="border-t border-slate-100">
                <td className="px-3 py-2 font-bold text-[#0F2042]">{e.title}{e.note ? <div className="text-[10px] text-slate-500">{e.note}</div> : null}</td>
                <td className="px-3 py-2 text-xs capitalize">{e.category}</td>
                <td className="px-3 py-2 text-xs capitalize">{e.period}</td>
                <td className="px-3 py-2 text-xs">{e.incurred_on}</td>
                <td className="px-3 py-2 text-right font-bold text-rose-700">₹{Number(e.amount).toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{canEdit && <button onClick={() => remove(e.id)} className="text-rose-600 hover:text-rose-800"><Trash2 size={12} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============ Shared ============
function ModalShell({ children, title, onClose, max = "max-w-xl" }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} className={`w-full ${max} overflow-hidden rounded-3xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="font-display text-xl font-semibold text-[#0F2042]">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
        </div>
        <div className="max-h-[78vh] overflow-y-auto p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}
function TF({ label, v, on, type = "text", testId, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input type={type} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
    </label>
  );
}
function TS({ label, v, on, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <select value={v} onChange={(e) => on(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}
