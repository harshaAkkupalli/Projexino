import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus, X, AlertTriangle, ListChecks, ExternalLink, ImageIcon, Search,
  MessageSquare, Send, Paperclip, ChevronRight, Trash2, Mail,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import EmailComposeModal from "@/components/EmailComposeModal";

const STATUS_META = {
  open:        { label: "Open",        color: "#3B82F6", bg: "#EFF6FF" },
  in_progress: { label: "In Progress", color: "#F97316", bg: "#FFF7ED" },
  pending:     { label: "Pending",     color: "#EAB308", bg: "#FEF9C3" },
  completed:   { label: "Completed",   color: "#10B981", bg: "#ECFDF5" },
  closed:      { label: "Closed",      color: "#64748B", bg: "#F1F5F9" },
};
const PRIORITY_META = {
  low:      { color: "#64748B" },
  medium:   { color: "#3B82F6" },
  high:     { color: "#F97316" },
  critical: { color: "#EF4444" },
};
const TYPE_META = {
  task:  { label: "Task",  color: "#A855F7" },
  error: { label: "Error", color: "#EF4444" },
};

export default function Issues() {
  const { user } = useAuth();
  const isPriv = ["admin","super_admin","manager","hr"].includes(user?.role);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [emailFor, setEmailFor] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (typeFilter) params.set("type_", typeFilter);
      const { data } = await api.get(`/issues${params.toString() ? `?${params}` : ""}`);
      setItems(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, [statusFilter, typeFilter]);

  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((i) =>
      (i.title || "").toLowerCase().includes(s) ||
      (i.description || "").toLowerCase().includes(s) ||
      (i.assignee || "").toLowerCase().includes(s) ||
      (i.project_name || "").toLowerCase().includes(s)
    );
  }, [items, q]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, pending: 0, completed: 0, closed: 0, total: items.length };
    items.forEach((i) => { c[i.status] = (c[i.status] || 0) + 1; });
    return c;
  }, [items]);

  return (
    <div data-testid="portal-issues" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-rose-50/40 to-orange-50/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// engineering · issues & errors</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Track every task & error in one place.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Admins and managers log issues with screenshots and reference URLs. Developers update
              status and comment as they go. Everything searchable and filterable.
            </p>
          </div>
          {isPriv && (
            <button data-testid="add-issue-btn" onClick={() => setShowCreate(true)}
              className="btn-primary text-sm">
              <Plus size={16} /> Log new issue
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard label="Total" value={counts.total} color="#0F2042" icon={ListChecks} />
        {Object.entries(STATUS_META).map(([k, m]) => (
          <KpiCard key={k} label={m.label} value={counts[k] || 0} color={m.color} icon={AlertTriangle} />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input data-testid="issue-search" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Search title, description, assignee…"
                className="w-64 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-xs outline-none focus:border-[#F97316]" />
            </div>
            <select data-testid="issue-filter-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#F97316]">
              <option value="">All statuses</option>
              {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <select data-testid="issue-filter-type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-[#F97316]">
              <option value="">All types</option>
              <option value="task">Tasks only</option>
              <option value="error">Errors only</option>
            </select>
          </div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{filtered.length} of {items.length}</div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            No issues yet. {isPriv && (<button onClick={() => setShowCreate(true)} className="font-semibold text-[#F97316] underline">Log the first one →</button>)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3 hidden md:table-cell">Project</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Assignee</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Updated</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const sm = STATUS_META[i.status] || STATUS_META.open;
                  const pm = PRIORITY_META[i.priority] || PRIORITY_META.medium;
                  const tm = TYPE_META[i.type] || TYPE_META.task;
                  return (
                    <tr key={i.id} onClick={() => setDetailId(i.id)}
                      data-testid={`issue-row-${i.id}`}
                      className="cursor-pointer border-b border-slate-100 transition hover:bg-orange-50/30">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]"
                          style={{ background: `${tm.color}15`, color: tm.color }}>
                          {tm.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {i.has_image && <ImageIcon size={12} className="text-slate-400" title="Has image" />}
                          {i.url && <ExternalLink size={12} className="text-slate-400" title="Has URL" />}
                          <span className="font-display font-semibold text-[#0F2042]">{i.title}</span>
                        </div>
                        {i.description && <div className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">{i.description}</div>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-slate-600">{i.project_name || "—"}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-slate-600">{i.assignee || "—"}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold uppercase tracking-[0.15em]" style={{ color: pm.color }}>
                          {i.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: sm.bg, color: sm.color }}>
                          • {sm.label}
                        </span>
                        {i.comments_count > 0 && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <MessageSquare size={9} /> {i.comments_count}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[11px] text-slate-500">{ago(i.updated_at)}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setEmailFor(i); }}
                            data-testid={`issue-email-${i.id}`}
                            title="Send email"
                            className="rounded-md p-1 text-[#F97316] hover:bg-orange-50"
                          >
                            <Mail size={13} />
                          </button>
                          <ChevronRight size={14} className="text-slate-400" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateIssueModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refresh(); }} />}
        {detailId && <IssueDetailModal id={detailId} onClose={() => setDetailId(null)} onChanged={refresh} isPriv={isPriv} />}
      </AnimatePresence>
      <EmailComposeModal
        open={!!emailFor}
        onClose={() => setEmailFor(null)}
        defaults={emailFor ? {
          to: (() => {
            const a = (emailFor.assignee_email || "").trim() || (emailFor.assignee || "").trim();
            return /@/.test(a) ? [a] : [];
          })(),
          templateSlug: "issue_assigned",
          contextLabel: `Issue: ${emailFor.title}${emailFor.assignee ? ` → ${emailFor.assignee}` : ""}`,
          variables: {
            name: emailFor.assignee || "",
            issue_title: emailFor.title || "",
            priority: emailFor.priority || "medium",
            url: emailFor.url || "",
          },
        } : {}}
      />
    </div>
  );
}

/* ============================== KPI Card ============================== */
function KpiCard({ label, value, color, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-lg p-2" style={{ background: `${color}15`, color }}><Icon size={14} /></div>
        <div className="text-[9px] uppercase tracking-[0.2em] text-slate-400">live</div>
      </div>
      <div className="mt-3 font-display text-2xl font-semibold" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
    </div>
  );
}

/* ============================== Create Modal ============================== */
function CreateIssueModal({ onClose, onCreated }) {
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({
    title: "", description: "", type: "task", priority: "medium",
    project_id: "", project_name: "", assignee: "", url: "",
    image_base64: "", image_mime: "", image_name: "",
    deadline: defaultDeadline(),
  });
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {});
    api.get("/members/directory").then(({ data }) => setMembers(data)).catch(() => {});
  }, []);

  const pickImage = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Image must be ≤ 8MB"); return; }
    const b64 = await readBase64(file);
    setForm((f) => ({ ...f, image_base64: b64, image_mime: file.type || "image/png", image_name: file.name }));
    setImagePreview(`data:${file.type || "image/png"};base64,${b64}`);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/issues", form);
      toast.success(form.type === "error" ? "Error logged" : "Task logged");
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <ModalShell onClose={onClose} title="Log new issue" testId="create-issue-modal">
      <form onSubmit={submit} className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Type *" value={form.type} onChange={(v) => setForm({ ...form, type: v })}
            options={[{ value: "task", label: "Task" }, { value: "error", label: "Error / Bug" }]} testId="issue-type" />
          <Select label="Priority" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })}
            options={["low", "medium", "high", "critical"].map((p) => ({ value: p, label: p }))} testId="issue-priority" />
        </div>
        <Input label="Title *" required value={form.title} onChange={(v) => setForm({ ...form, title: v })} testId="issue-title" />
        <label className="block">
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Description / Steps to reproduce</span>
          <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#F97316]"
            data-testid="issue-description" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Project" value={form.project_id} onChange={(v) => {
            const p = projects.find((x) => x.id === v);
            setForm({ ...form, project_id: v, project_name: p?.name || "" });
          }} options={[{ value: "", label: "— None —" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} testId="issue-project" />
          <Select label="Assignee" value={form.assignee} onChange={(v) => setForm({ ...form, assignee: v })}
            options={[{ value: "", label: "— Unassigned —" }, ...members.map((m) => ({ value: m.name || m.email, label: `${m.name}${m.role ? ` · ${m.role}` : ""}` }))]}
            testId="issue-assignee" />
        </div>
        <Input label="Reference URL (issue tracker / live site / docs)" value={form.url}
          onChange={(v) => setForm({ ...form, url: v })} placeholder="https://…" testId="issue-url" />
        <Input label="Deadline" type="date" value={form.deadline} onChange={(v) => setForm({ ...form, deadline: v })} testId="issue-deadline" />

        <div>
          <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Screenshot / image (optional, ≤8MB)</span>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-200 bg-orange-50/30 p-3 text-xs text-[#F97316] hover:bg-orange-50">
            <ImageIcon size={14} /> {form.image_name || "Click to upload"}
            <input type="file" hidden accept="image/*" onChange={(e) => pickImage(e.target.files?.[0])} data-testid="issue-image" />
          </label>
          {imagePreview && (
            <div className="relative mt-2 inline-block">
              <img src={imagePreview} alt="preview" className="max-h-32 rounded-lg border border-slate-200" />
              <button type="button" onClick={() => { setImagePreview(""); setForm({ ...form, image_base64: "", image_mime: "", image_name: "" }); }}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 shadow"><X size={12} /></button>
            </div>
          )}
        </div>

        <button disabled={saving} data-testid="issue-submit" className="btn-primary mt-2 w-full justify-center">
          {saving ? "Logging…" : "Log issue"}
        </button>
      </form>
    </ModalShell>
  );
}

/* ============================== Detail Modal ============================== */
function IssueDetailModal({ id, onClose, onChanged, isPriv }) {
  const { user } = useAuth();
  const [issue, setIssue] = useState(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/issues/${id}`);
      setIssue(data);
    } catch { toast.error("Could not load issue"); onClose(); }
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status) => {
    try {
      const { data } = await api.patch(`/issues/${id}`, { status });
      setIssue(data); onChanged();
      toast.success(`Status → ${STATUS_META[status]?.label || status}`);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  const submitComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSaving(true);
    try {
      await api.post(`/issues/${id}/comments`, { text: comment });
      setComment("");
      await load(); onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setSaving(false); }
  };

  const deleteIssue = async () => {
    if (!window.confirm("Delete this issue permanently?")) return;
    try {
      await api.delete(`/issues/${id}`);
      onChanged(); onClose();
      toast.success("Issue deleted");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
  };

  if (!issue) {
    return (
      <ModalShell onClose={onClose} title="Loading…" testId="issue-detail-modal">
        <div className="py-10 text-center text-sm text-slate-400">Loading issue…</div>
      </ModalShell>
    );
  }

  const sm = STATUS_META[issue.status] || STATUS_META.open;
  const pm = PRIORITY_META[issue.priority] || PRIORITY_META.medium;
  const tm = TYPE_META[issue.type] || TYPE_META.task;
  const isAssignee = (issue.assignee || "").toLowerCase() === (user?.name || "").toLowerCase()
    || (issue.assignee || "").toLowerCase() === (user?.email || "").toLowerCase();
  const canEditStatus = isPriv || isAssignee;

  return (
    <ModalShell onClose={onClose} title="" testId="issue-detail-modal" wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em]"
                style={{ background: `${tm.color}15`, color: tm.color }}>{tm.label}</span>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: pm.color }}>{issue.priority}</span>
              {issue.project_name && <span className="text-[10px] text-slate-500">· {issue.project_name}</span>}
            </div>
            <h2 className="font-display mt-2 text-2xl font-semibold text-[#0F2042]">{issue.title}</h2>
            <div className="mt-1 text-[11px] text-slate-500">
              Logged by {issue.created_by} · {ago(issue.created_at)}
              {issue.assignee && ` · Assigned to ${issue.assignee}`}
            </div>
          </div>
          {isPriv && (
            <button onClick={deleteIssue} title="Delete" className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" data-testid="issue-delete">
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {issue.description && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Description</div>
            <p className="mt-1.5 whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{issue.description}</p>
          </div>
        )}

        {issue.url && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Reference URL</div>
            <a href={issue.url} target="_blank" rel="noreferrer"
              data-testid="issue-url-link"
              className="mt-1.5 inline-flex items-center gap-1.5 break-all text-sm font-semibold text-[#F97316] underline hover:text-orange-700">
              <ExternalLink size={12} /> {issue.url}
            </a>
          </div>
        )}

        {issue.image_base64 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Screenshot</div>
            <img src={`data:${issue.image_mime || "image/png"};base64,${issue.image_base64}`}
              alt={issue.image_name || "screenshot"}
              data-testid="issue-image-preview"
              className="mt-2 max-h-96 w-full rounded-lg border border-slate-200 object-contain" />
          </div>
        )}

        {/* Status switcher */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(STATUS_META).map(([k, m]) => (
              <button
                key={k}
                disabled={!canEditStatus}
                onClick={() => updateStatus(k)}
                data-testid={`issue-status-${k}`}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  issue.status === k ? "ring-2 ring-offset-1" : "opacity-70 hover:opacity-100"
                }`}
                style={{
                  background: issue.status === k ? m.color : m.bg,
                  color: issue.status === k ? "#fff" : m.color,
                  ringColor: m.color,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
          {!canEditStatus && (
            <div className="mt-2 text-[10px] text-slate-400">
              Only the assignee or an admin/manager can change status.
            </div>
          )}
        </div>

        {/* Comments */}
        <div>
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
              Comments · {(issue.comments || []).length}
            </div>
          </div>
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {(issue.comments || []).length === 0 && (
              <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-400">No comments yet — be the first.</div>
            )}
            {(issue.comments || []).map((c) => (
              <div key={c.id} data-testid={`issue-comment-${c.id}`}
                className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#0F2042] to-[#A855F7] text-[10px] font-bold text-white">
                    {c.author?.[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold text-[#0F172A]">{c.author}</span>
                  <span className="text-[9px] uppercase tracking-[0.15em] text-slate-400">{c.author_role}</span>
                  <span className="text-[9px] text-slate-400">· {ago(c.created_at)}</span>
                </div>
                <div className="mt-1.5 whitespace-pre-wrap text-slate-700">{c.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={submitComment} className="mt-3 flex gap-2">
            <input data-testid="issue-comment-input" value={comment} onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment…"
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            <button disabled={saving || !comment.trim()} data-testid="issue-comment-submit"
              className="btn-primary px-3"><Send size={14} /></button>
          </form>
        </div>
      </div>
    </ModalShell>
  );
}

/* ============================== Shared bits ============================== */
function ModalShell({ onClose, title, testId, children, wide }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        data-testid={testId}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl font-semibold">{title}</h3>
            <button onClick={onClose}><X size={18} /></button>
          </div>
        )}
        {!title && (
          <div className="-mt-2 mb-4 flex justify-end">
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-[#0F172A]"><X size={18} /></button>
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  );
}

function Input({ label, value, onChange, type = "text", required, placeholder, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <input type={type} required={required} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-[#F97316]" />
    </label>
  );
}

function Select({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 outline-none focus:border-[#F97316]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function defaultDeadline() {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    fr.readAsDataURL(file);
  });
}

function ago(iso) {
  if (!iso) return "—";
  const m = (Date.now() - new Date(iso).getTime()) / 60000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}
