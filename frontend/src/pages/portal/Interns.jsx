import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, GraduationCap, Award, Calendar, FileText, ListChecks, CheckCircle2, Mail, Pencil, KeyRound, Loader2 } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import PageInfographic from "@/components/PageInfographic";
import EmailComposeModal from "@/components/EmailComposeModal";

const STATUS_COLOR = {
  assigned: "#94A3B8",
  in_progress: "#3B82F6",
  submitted: "#F97316",
  completed: "#10B981",
  overdue: "#EF4444",
};

export default function Interns() {
  return <InternsBoard heroVariant="full" />;
}

/**
 * Reusable interns board — used inside the unified Team page.
 * `heroVariant="compact"` skips the big hero (the parent owns its own header).
 */
export function InternsBoard({ heroVariant = "full" }) {
  const { user } = useAuth();
  const isAdmin = ["admin","super_admin"].includes(user?.role);
  const [interns, setInterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(null);
  const [emailFor, setEmailFor] = useState(null);
  const [editing, setEditing] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/interns");
      setInterns(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const onDelete = async (id) => {
    if (!window.confirm("Delete this intern and all their tasks?")) return;
    await api.delete(`/interns/${id}`);
    setInterns((p) => p.filter((i) => i.id !== id));
    toast.success("Removed");
  };

  const generatePdf = async (i) => {
    try {
      const url = `${process.env.REACT_APP_BACKEND_URL}/api/interns/${i.id}/certificate`;
      const token = localStorage.getItem("pj_token");
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${i.name.replace(/\s+/g, "_")}_Certificate.pdf`;
      a.click();
      toast.success("Certificate downloaded");
      refresh();
    } catch (e) {
      toast.error("Failed to generate PDF");
    }
  };

  return (
    <div data-testid="portal-interns" className="space-y-6">
      {heroVariant === "full" && (
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-purple-50/40 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// intern program</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Grow the next generation.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Onboard interns, assign tasks with deadlines, award badges for on-time delivery, and auto-generate certificates at the end of the program.
            </p>
            <button data-testid="add-intern-btn" onClick={() => setShow(true)} className="btn-primary mt-5 text-sm">
              <Plus size={16} /> Add intern
            </button>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="interns" className="h-56 w-full" />
          </div>
        </div>
      </div>
      )}
      {heroVariant === "compact" && (
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// interns</div>
            <div className="text-sm text-slate-600">Onboard interns, assign tasks, award badges, and issue certificates — all the intern-specific actions live here.</div>
          </div>
          <button data-testid="add-intern-btn" onClick={() => setShow(true)} className="btn-primary text-sm shrink-0">
            <Plus size={16} /> Add intern
          </button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>
      ) : interns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <GraduationCap className="mx-auto text-slate-300" size={36} />
          <div className="mt-3 text-sm font-semibold text-slate-700">No interns yet</div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {interns.map((i) => (
            <motion.div key={i.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              data-testid={`intern-card-${i.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-display text-lg font-semibold text-[#0F172A]">{i.name}</div>
                  <div className="text-xs text-slate-500">{i.designation} · {i.department}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${i.status === "completed" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                  {i.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-slate-500"><Calendar size={11} /> {i.start_date}</div>
                <div className="flex items-center gap-1.5 text-slate-500"><Calendar size={11} /> {i.end_date}</div>
                <div className="flex items-center gap-1.5 text-slate-500"><ListChecks size={11} /> {i.tasks_assigned} tasks</div>
                <div className="flex items-center gap-1.5 text-slate-500"><CheckCircle2 size={11} className="text-emerald-500" /> {i.tasks_on_time} on-time</div>
              </div>
              {i.reporting_manager && (
                <div className="mt-2 text-[11px] text-slate-500">
                  Manager: <span className="font-semibold text-[#0F2042]">{i.reporting_manager}</span>
                </div>
              )}
              <div className="mt-2 space-y-0.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[10px] text-slate-500" data-testid={`intern-audit-${i.id}`}>
                <div>
                  <span className="font-semibold text-slate-400">Added by:</span>{" "}
                  {i.created_by_name || i.created_by_email || <span className="text-rose-500">— unknown (legacy record)</span>}
                </div>
                <div>
                  <span className="font-semibold text-slate-400">Added at:</span>{" "}
                  {i.created_at ? new Date(i.created_at).toLocaleString() : <span className="text-rose-500">—</span>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(i.badges || []).slice(0, 4).map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${b.color}1f`, color: b.color }}>
                    <Award size={9} /> {b.name}
                  </span>
                ))}
                {i.badges?.length > 4 && <span className="text-[10px] text-slate-400">+{i.badges.length - 4}</span>}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button data-testid={`intern-edit-${i.id}`} onClick={() => setEditing(i)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0F2042] hover:bg-slate-50">
                  <Pencil size={11} className="mr-1 inline" /> Edit
                </button>
                <button data-testid={`intern-tasks-${i.id}`} onClick={() => setActive(i)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0F2042] hover:bg-slate-50">
                  Manage tasks
                </button>
                <button data-testid={`intern-cert-${i.id}`} onClick={() => generatePdf(i)} className="rounded-lg border border-[#F97316] px-3 py-1.5 text-xs font-semibold text-[#F97316] hover:bg-orange-50">
                  <FileText size={11} className="mr-1 inline" /> Issue certificate
                </button>
                <button data-testid={`intern-email-${i.id}`} onClick={() => setEmailFor(i)} className="rounded-lg border border-[#A855F7] px-3 py-1.5 text-xs font-semibold text-[#A855F7] hover:bg-purple-50">
                  <Mail size={11} className="mr-1 inline" /> Send email
                </button>
                <button data-testid={`intern-delete-${i.id}`} onClick={() => onDelete(i.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {show && <InternModal onClose={() => setShow(false)} onSaved={() => { setShow(false); refresh(); }} />}
        {active && <TasksDrawer intern={active} onClose={() => { setActive(null); refresh(); }} />}
        {editing && <InternEditModal intern={editing} isAdmin={isAdmin} onClose={() => setEditing(null)} onSaved={(updated) => {
          setInterns((prev) => prev.map((x) => x.id === updated.id ? updated : x));
          setEditing(null);
        }} />}
      </AnimatePresence>
      <EmailComposeModal
        open={!!emailFor}
        onClose={() => setEmailFor(null)}
        defaults={emailFor ? {
          to: emailFor.email,
          templateSlug: "welcome_intern",
          contextLabel: `Intern: ${emailFor.name}`,
          variables: {
            name: emailFor.name || "",
            designation: emailFor.designation || "Intern",
            start_date: emailFor.start_date || "",
            mentor: emailFor.reporting_manager || "",
          },
        } : {}}
      />
    </div>
  );
}

function InternModal({ onClose, onSaved }) {
  const [form, setForm] = useState({
    name: "", email: "", designation: "Frontend Intern",
    department: "Engineering", reporting_manager: "", reporting_manager_email: "",
    start_date: "", end_date: "", bio: "",
  });
  const [credentials, setCredentials] = useState(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post("/interns/with-login", form);
      setCredentials(data.credentials);
      toast.success("Intern created — share credentials!");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  if (credentials) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          data-testid="intern-credentials"
          className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold text-emerald-700">Intern account created ✓</h3>
            <button onClick={onSaved}><X size={18} /></button>
          </div>
          <p className="text-sm text-slate-600">
            Share these one-time credentials with the intern. They will be asked to change the password on first login.
          </p>
          <div className="mt-4 space-y-3">
            <CopyRow label="Login URL" value={`${window.location.origin}/login`} />
            <CopyRow label="Email" value={credentials.email} testid="cred-email" />
            <CopyRow label="Temporary password" value={credentials.password} testid="cred-password" mono />
          </div>
          <button onClick={onSaved} data-testid="cred-done-btn" className="btn-primary mt-6 w-full justify-center">Done</button>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="intern-modal"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl font-semibold">Add intern</h3>
            <p className="mt-0.5 text-xs text-slate-500">A login account will be created automatically.</p>
          </div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Inp testid="intern-name" label="Name *" v={form.name} on={(v) => setForm({ ...form, name: v })} required />
            <Inp testid="intern-email" label="Email *" type="email" v={form.email} on={(v) => setForm({ ...form, email: v })} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Inp testid="intern-designation" label="Designation *" v={form.designation} on={(v) => setForm({ ...form, designation: v })} required />
            <Inp testid="intern-department" label="Department" v={form.department} on={(v) => setForm({ ...form, department: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Inp testid="intern-manager" label="Reporting manager" v={form.reporting_manager} on={(v) => setForm({ ...form, reporting_manager: v })} />
            <Inp testid="intern-manager-email" label="Manager email" type="email" v={form.reporting_manager_email} on={(v) => setForm({ ...form, reporting_manager_email: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Inp testid="intern-start" label="Start date *" type="date" v={form.start_date} on={(v) => setForm({ ...form, start_date: v })} required />
            <Inp testid="intern-end" label="End date *" type="date" v={form.end_date} on={(v) => setForm({ ...form, end_date: v })} required />
          </div>
          <div className="rounded-lg border border-orange-100 bg-orange-50/40 p-3 text-xs text-slate-600">
            🔐 A secure dummy password (e.g. <code>Welcome-A4B9</code>) will be generated. The intern must change it on first login.
          </div>
        </div>
        <button data-testid="intern-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Creating account…" : "Create intern + login"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function CopyRow({ label, value, testid, mono }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <code data-testid={testid} className={`truncate ${mono ? "font-mono-pj text-base font-bold text-[#F97316]" : "text-sm text-[#0F2042]"}`}>{value}</code>
        <button type="button" onClick={copy} className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]">
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function TasksDrawer({ intern, onClose }) {
  const [tasks, setTasks] = useState([]);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/interns/${intern.id}/tasks`);
      setTasks(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const setStatus = async (t, status) => {
    const { data } = await api.patch(`/intern-tasks/${t.id}`, { status });
    setTasks((p) => p.map((x) => (x.id === t.id ? data : x)));
    toast.success(`Status → ${status}`);
  };

  const remove = async (id) => {
    await api.delete(`/intern-tasks/${id}`);
    setTasks((p) => p.filter((t) => t.id !== id));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="intern-tasks-drawer"
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// intern tasks</div>
            <h3 className="font-display mt-1 text-2xl font-semibold">{intern.name}</h3>
            <div className="text-xs text-slate-500">{intern.designation}</div>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <button data-testid="assign-task-btn" onClick={() => setShow(true)} className="btn-primary mt-4 text-sm">
          <Plus size={14} /> Assign task
        </button>

        <div className="mt-6 space-y-3">
          {loading ? <div className="text-sm text-slate-400">Loading…</div> :
            tasks.length === 0 ? <div className="text-sm text-slate-400">No tasks assigned.</div> :
              tasks.map((t) => {
                const c = STATUS_COLOR[t.status];
                return (
                  <div key={t.id} data-testid={`intern-task-${t.id}`} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-[#0F172A]">{t.title}</div>
                        {t.project_name && <div className="text-[11px] text-slate-500">📂 {t.project_name}</div>}
                        {t.description && <div className="mt-1 text-xs text-slate-600">{t.description}</div>}
                      </div>
                      <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={12} /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide"
                        style={{ background: `${c}1f`, color: c }}>{t.status}</span>
                      <span className="text-slate-500">Due: {t.deadline?.slice(0, 10) || "—"}</span>
                      {t.on_time === true && <span className="text-emerald-600">✓ On time</span>}
                      {t.on_time === false && <span className="text-red-500">✗ Late</span>}
                      <select data-testid={`intern-task-status-${t.id}`} value={t.status} onChange={(e) => setStatus(t, e.target.value)}
                        className="ml-auto rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] outline-none focus:border-[#F97316]">
                        {["assigned", "in_progress", "submitted", "completed", "overdue"].map((s) => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
        </div>

        <AnimatePresence>
          {show && <NewTaskModal intern={intern} onClose={() => setShow(false)} onSaved={refresh} />}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function NewTaskModal({ intern, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: "", description: "", deadline: "", priority: "medium", project_name: "",
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/intern-tasks", { intern_id: intern.id, ...form });
      toast.success("Task assigned");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="assign-task-modal"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Assign task</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Inp testid="itask-title" label="Title *" v={form.title} on={(v) => setForm({ ...form, title: v })} required />
          <Inp testid="itask-project" label="Project name" v={form.project_name} on={(v) => setForm({ ...form, project_name: v })} />
          <Inp testid="itask-description" label="Description" v={form.description} on={(v) => setForm({ ...form, description: v })} as="textarea" />
          <div className="grid grid-cols-2 gap-3">
            <Inp testid="itask-deadline" label="Deadline *" type="date" v={form.deadline} on={(v) => setForm({ ...form, deadline: v })} required />
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Priority</span>
              <select data-testid="itask-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
                {["low", "medium", "high"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
          </div>
        </div>
        <button data-testid="itask-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Saving…" : "Assign"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function Inp({ label, v, on, type = "text", testid, required, as }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {as === "textarea" ? (
        <textarea data-testid={testid} value={v} onChange={(e) => on(e.target.value)} rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
      ) : (
        <input data-testid={testid} type={type} required={required} value={v} onChange={(e) => on(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
      )}
    </label>
  );
}


// =================== Full-edit modal (super-admin) ===================
function InternEditModal({ intern, isAdmin, onClose, onSaved }) {
  const [form, setForm] = useState({
    name: intern.name || "",
    email: intern.email || "",
    designation: intern.designation || "",
    department: intern.department || "Engineering",
    reporting_manager: intern.reporting_manager || "",
    reporting_manager_email: intern.reporting_manager_email || "",
    start_date: intern.start_date || "",
    end_date: intern.end_date || "",
    status: intern.status || "active",
    bio: intern.bio || "",
    stipend: intern.stipend ?? "",
    salary: intern.salary ?? "",
    phone: intern.phone || "",
    location: intern.location || "",
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        stipend: form.stipend === "" ? null : Number(form.stipend),
        salary: form.salary === "" ? null : Number(form.salary),
      };
      const { data } = await api.patch(`/interns/${intern.id}`, body);
      toast.success("Intern updated");
      onSaved(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="intern-edit-modal"
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// super-admin · edit</div>
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">Edit intern: {intern.name}</h3>
            <p className="mt-0.5 text-xs text-slate-500">All fields are editable. Delete + reset-password available to admins.</p>
          </div>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          <Inp testid="iedit-name" label="Name *" v={form.name} on={(v) => setForm({ ...form, name: v })} required />
          <Inp testid="iedit-email" label="Email *" type="email" v={form.email} on={(v) => setForm({ ...form, email: v })} required />
          <Inp testid="iedit-designation" label="Designation" v={form.designation} on={(v) => setForm({ ...form, designation: v })} />
          <Inp testid="iedit-department" label="Department" v={form.department} on={(v) => setForm({ ...form, department: v })} />
          <Inp testid="iedit-manager" label="Reporting manager" v={form.reporting_manager} on={(v) => setForm({ ...form, reporting_manager: v })} />
          <Inp testid="iedit-manager-email" label="Manager email" type="email" v={form.reporting_manager_email} on={(v) => setForm({ ...form, reporting_manager_email: v })} />
          <Inp testid="iedit-start" label="Start date" type="date" v={form.start_date} on={(v) => setForm({ ...form, start_date: v })} />
          <Inp testid="iedit-end" label="End date" type="date" v={form.end_date} on={(v) => setForm({ ...form, end_date: v })} />
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Status</span>
            <select data-testid="iedit-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
              {["active", "on_leave", "completed", "terminated"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <Inp testid="iedit-phone" label="Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} />
          <Inp testid="iedit-location" label="Location" v={form.location} on={(v) => setForm({ ...form, location: v })} />
          <Inp testid="iedit-stipend" label="Stipend (₹ / month)" type="number" v={form.stipend} on={(v) => setForm({ ...form, stipend: v })} />
          <Inp testid="iedit-salary" label="Annual salary (optional)" type="number" v={form.salary} on={(v) => setForm({ ...form, salary: v })} />
          <div className="md:col-span-2">
            <Inp testid="iedit-bio" label="Bio / Notes" v={form.bio} on={(v) => setForm({ ...form, bio: v })} as="textarea" />
          </div>
        </div>

        {isAdmin && <ResetPasswordSection email={form.email} />}

        <div className="mt-4 flex flex-wrap gap-2">
          <button data-testid="iedit-save" disabled={saving} className="btn-primary justify-center">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : "Save changes"}
          </button>
          <button type="button" onClick={onClose} className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-400">
            Cancel
          </button>
        </div>
      </motion.form>
    </motion.div>
  );
}

// =================== Reset Password sub-section (admin only) ===================
function ResetPasswordSection({ email }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setBusy(true);
    try {
      await api.post("/admin/users/reset-password", { email, new_password: pw });
      toast.success("Password reset — share with the user");
      setOpen(false);
      setPw("");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Reset failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-rose-100 bg-rose-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-rose-700">
          <KeyRound size={14} />
          <div>
            <div className="text-xs font-bold">Reset login password</div>
            <div className="text-[10px] text-rose-600/80">Admin-only · for the linked user account ({email || "no email"})</div>
          </div>
        </div>
        {!open ? (
          <button type="button" data-testid="reset-pw-open" onClick={() => setOpen(true)} className="rounded-full bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700">
            Reset password
          </button>
        ) : (
          <button type="button" onClick={() => { setOpen(false); setPw(""); }} className="text-rose-600 hover:text-rose-800"><X size={16} /></button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            data-testid="reset-pw-input"
            type="text"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="New temporary password (min 8 chars)"
            className="flex-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-rose-500"
          />
          <button type="button" data-testid="reset-pw-confirm" onClick={reset} disabled={busy}
            className="rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60">
            {busy ? "Resetting…" : "Confirm reset"}
          </button>
        </div>
      )}
    </div>
  );
}
