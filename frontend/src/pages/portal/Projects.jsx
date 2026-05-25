import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, FolderKanban, Calendar, Tag, TrendingUp, Users2, Mail } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PageInfographic from "@/components/PageInfographic";
import EmailComposeModal from "@/components/EmailComposeModal";

const STATUS_LABELS = {
  planning: { label: "Planning", color: "#3B82F6" },
  in_progress: { label: "In Progress", color: "#F97316" },
  on_hold: { label: "On Hold", color: "#94A3B8" },
  completed: { label: "Completed", color: "#10B981" },
  cancelled: { label: "Cancelled", color: "#EF4444" },
};

const PRIORITY = {
  low: "#94A3B8", medium: "#3B82F6", high: "#F97316", critical: "#EF4444",
};

export default function Projects() {
  const [items, setItems] = useState([]);
  const [analytics, setAnalytics] = useState({ total: 0, by_status: {} });
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [emailFor, setEmailFor] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([api.get("/projects"), api.get("/projects/analytics/summary")]);
      setItems(p.data);
      setAnalytics(a.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = useMemo(
    () => filter === "all" ? items : items.filter((p) => p.status === filter),
    [items, filter],
  );

  const onDelete = async (id) => {
    if (!window.confirm("Delete this project?")) return;
    await api.delete(`/projects/${id}`);
    setItems((p) => p.filter((x) => x.id !== id));
    toast.success("Project deleted");
  };

  const setStatus = async (p, status) => {
    const { data } = await api.patch(`/projects/${p.id}`, { status });
    setItems((prev) => prev.map((x) => (x.id === p.id ? data : x)));
    toast.success(`Status → ${status}`);
    refresh();
  };

  return (
    <div data-testid="portal-projects" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-blue-50/40 to-orange-50/40 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// projects</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Run every project end-to-end.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Plan → Build → Review → Ship. Track deadlines, assign teams, and notify managers automatically on status updates.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button data-testid="add-project-btn" onClick={() => setShow(true)} className="btn-primary text-sm">
                <Plus size={16} /> New Project
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <TrendingUp size={14} className="text-[#10B981]" />
                {analytics.completed || 0} completed · {analytics.in_progress || 0} active
              </span>
            </div>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="projects" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(STATUS_LABELS).map(([k, v]) => (
          <button
            key={k}
            data-testid={`project-filter-${k}`}
            onClick={() => setFilter(filter === k ? "all" : k)}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${filter === k ? "border-[#F97316] ring-2 ring-orange-100" : "border-slate-200"}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: v.color }}>{v.label}</div>
            <div className="mt-1 font-display text-2xl font-semibold text-[#0F2042]">
              {analytics.by_status?.[k] || 0}
            </div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading projects…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FolderKanban className="mx-auto text-slate-300" size={36} />
          <div className="mt-3 text-sm font-semibold text-slate-700">No projects yet</div>
          <button onClick={() => setShow(true)} className="btn-primary mt-5 text-sm">
            <Plus size={16} /> Create your first project
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p, i) => {
            const s = STATUS_LABELS[p.status] || STATUS_LABELS.planning;
            return (
              <motion.div key={p.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                data-testid={`project-card-${p.id}`}
                className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md">
                {/* Cover image / logo strip */}
                {(p.cover_image_base64 || p.cover_image_url) ? (
                  <Link to={`/app/projects/${p.id}`} className="block">
                    <img
                      src={p.cover_image_base64 || p.cover_image_url}
                      alt={`${p.name} cover`}
                      data-testid={`project-cover-${p.id}`}
                      className="h-28 w-full object-cover"
                    />
                  </Link>
                ) : (
                  <Link to={`/app/projects/${p.id}`} className="flex h-28 items-center justify-center bg-gradient-to-br from-orange-100 via-rose-50 to-amber-50 text-3xl font-bold text-orange-300">
                    {(p.name || "?")[0].toUpperCase()}
                  </Link>
                )}
                <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: s.color }}>{s.label}</span>
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${PRIORITY[p.priority]}1f`, color: PRIORITY[p.priority] }}>
                        {p.priority}
                      </span>
                    </div>
                    <h3 className="font-display mt-1.5 truncate text-lg font-semibold text-[#0F172A]">{p.name}</h3>
                    {p.client && <div className="mt-0.5 text-xs text-slate-500">{p.client}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => setEmailFor(p)} data-testid={`project-email-${p.id}`} title="Send email" className="rounded-md p-1.5 text-[#F97316] hover:bg-orange-50">
                      <Mail size={14} />
                    </button>
                    <button onClick={() => setEditing(p)} data-testid={`project-edit-${p.id}`} className="rounded-md px-2 py-1 text-xs font-semibold text-[#0F2042] hover:bg-slate-100">Edit</button>
                    <button onClick={() => onDelete(p.id)} data-testid={`project-delete-${p.id}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {p.description && <p className="mt-3 line-clamp-2 text-sm text-slate-600">{p.description}</p>}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Calendar size={12} /> {p.deadline || "No deadline"}
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <Users2 size={12} /> {p.members?.length || 0} member(s)
                  </div>
                </div>
                {p.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.tags.slice(0, 4).map((t) => (
                      <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-mono-pj text-slate-600">
                        <Tag size={9} className="mr-0.5 inline" />{t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Set status</span>
                  <select
                    data-testid={`project-status-${p.id}`}
                    value={p.status}
                    onChange={(e) => setStatus(p, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#F97316]"
                  >
                    {Object.keys(STATUS_LABELS).map((k) => (
                      <option key={k} value={k}>{STATUS_LABELS[k].label}</option>
                    ))}
                  </select>
                  <Link to={`/app/projects/${p.id}`} data-testid={`project-open-${p.id}`}
                    className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-1 text-[11px] font-bold text-white shadow hover:shadow-md">
                    Open →
                  </Link>
                </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {(show || editing) && (
          <ProjectModal
            project={editing}
            onClose={() => { setShow(false); setEditing(null); }}
            onSaved={() => { refresh(); setShow(false); setEditing(null); }}
          />
        )}
      </AnimatePresence>
      <EmailComposeModal
        open={!!emailFor}
        onClose={() => setEmailFor(null)}
        defaults={emailFor ? {
          to: (() => {
            const list = [];
            if (emailFor.manager_email) list.push(emailFor.manager_email);
            (emailFor.member_emails || []).forEach((e) => { if (e && !list.includes(e)) list.push(e); });
            // Fallback: legacy free-text members that look like an email
            if (!list.length) {
              (emailFor.members || []).forEach((m) => { if (typeof m === "string" && /@/.test(m) && !list.includes(m)) list.push(m); });
            }
            return list;
          })(),
          cc: emailFor.client_email ? [emailFor.client_email] : [],
          templateSlug: "project_assigned",
          contextLabel: `Project: ${emailFor.name}${(emailFor.manager || emailFor.client) ? ` · ${emailFor.manager || emailFor.client}` : ""}`,
          variables: {
            name: emailFor.manager || "",
            project_name: emailFor.name || "",
            role: "Team member",
            start_date: emailFor.start_date || "",
            deadline: emailFor.deadline || "",
            client: emailFor.client || "",
          },
        } : {}}
      />
    </div>
  );
}

function ProjectModal({ project, onClose, onSaved }) {
  const editing = !!project;
  const [form, setForm] = useState({
    name: project?.name || "",
    description: project?.description || "",
    client: project?.client || "",
    status: project?.status || "planning",
    priority: project?.priority || "medium",
    start_date: project?.start_date || "",
    deadline: project?.deadline || "",
    tags: (project?.tags || []).join(", "),
    cover_image_url: project?.cover_image_url || "",
    cover_image_base64: project?.cover_image_base64 || "",
    manager_user_id: project?.manager_user_id || "",
    member_user_ids: project?.member_user_ids || [],
    intern_user_ids: project?.intern_user_ids || [],
  });
  const [saving, setSaving] = useState(false);
  // Assignable user buckets fetched from backend
  const [pool, setPool] = useState({ managers: [], members: [], interns: [] });
  const [files, setFiles] = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);

  useEffect(() => {
    api.get(`/projects/${project?.id || "new"}/assignable-users`)
      .catch(() => api.get("/projects/new/assignable-users"))
      .then(({ data }) => setPool(data || { managers: [], members: [], interns: [] }))
      .catch(() => {});
    if (editing) {
      api.get("/documents").then(({ data }) => {
        setExistingDocs((data || []).filter((d) => d.project_id === project.id));
      }).catch(() => {});
    }
  }, [editing, project?.id]);

  const toggleId = (bucket) => (id) => {
    setForm((f) => {
      const key = bucket === "members" ? "member_user_ids" : "intern_user_ids";
      const arr = f[key] || [];
      return { ...f, [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] };
    });
  };

  const pickCover = async (file) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Cover image > 5MB"); return; }
    const b64 = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => resolve(String(fr.result || ""));
      fr.readAsDataURL(file);
    });
    setForm((f) => ({ ...f, cover_image_base64: b64, cover_image_url: "" }));
  };

  const pickFiles = async (filelist) => {
    const next = [...files];
    for (const f of Array.from(filelist || [])) {
      if (f.size > 10 * 1024 * 1024) { toast.error(`${f.name} > 10MB — skipped`); continue; }
      const content_base64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onerror = reject;
        fr.onload = () => {
          const s = String(fr.result || "");
          resolve(s.includes(",") ? s.split(",")[1] : s);
        };
        fr.readAsDataURL(f);
      });
      next.push({ name: f.name, mime_type: f.type || "application/octet-stream", size: f.size, content_base64 });
    }
    setFiles(next.slice(0, 10));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        name: form.name, description: form.description, client: form.client,
        status: form.status, priority: form.priority,
        start_date: form.start_date, deadline: form.deadline,
        tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
        cover_image_url: form.cover_image_url || "",
        cover_image_base64: form.cover_image_base64 || "",
        manager_user_id: form.manager_user_id || "",
        member_user_ids: form.member_user_ids || [],
        intern_user_ids: form.intern_user_ids || [],
      };
      let saved;
      if (editing) {
        const { data } = await api.patch(`/projects/${project.id}`, body);
        saved = data;
      } else {
        const { data } = await api.post("/projects", body);
        saved = data;
      }
      for (const f of files) {
        try {
          await api.post("/documents", {
            name: f.name, mime_type: f.mime_type, size: f.size,
            content_base64: f.content_base64,
            project_id: saved.id, shared_with: [], description: `Project kickoff doc`,
          });
        } catch (err) {
          toast.error(`${f.name} upload failed`);
        }
      }
      onSaved();
      toast.success(editing ? "Project updated" : "Project created · team notified");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  const coverPreview = form.cover_image_base64 || form.cover_image_url;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="project-modal"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">{editing ? "Edit project" : "New project"}</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>

        {/* COVER IMAGE / LOGO */}
        <div className="mb-4">
          <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-slate-500">Client logo / cover</span>
          <div className="flex items-center gap-3">
            <div
              className="relative flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-orange-200 bg-orange-50/30 text-xs text-slate-400"
              data-testid="project-cover-preview"
            >
              {coverPreview ? (
                <img src={coverPreview} alt="cover" className="h-full w-full object-cover" />
              ) : (
                <span className="text-center">No logo<br/>(120×80 ideal)</span>
              )}
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-[#F97316] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#EA580C]">
                Upload logo
                <input type="file" accept="image/*" hidden onChange={(e) => pickCover(e.target.files?.[0])} data-testid="project-cover-input" />
              </label>
              <input
                type="url"
                placeholder="…or paste image URL"
                value={form.cover_image_url}
                onChange={(e) => setForm({ ...form, cover_image_url: e.target.value, cover_image_base64: "" })}
                data-testid="project-cover-url"
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#F97316]"
              />
              {coverPreview && (
                <button type="button" onClick={() => setForm({ ...form, cover_image_url: "", cover_image_base64: "" })}
                  className="text-[10px] text-slate-400 hover:text-red-500">Remove cover</button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Lbl label="Name *">
            <input data-testid="project-name" required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="inp" />
          </Lbl>
          <Lbl label="Description">
            <textarea data-testid="project-description" rows={2} value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="inp" />
          </Lbl>
          <div className="grid grid-cols-2 gap-3">
            <Lbl label="Client"><input data-testid="project-client" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} className="inp" /></Lbl>
            <Lbl label="Priority">
              <select data-testid="project-priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="inp">
                {["low", "medium", "high", "critical"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </Lbl>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Lbl label="Start date"><input data-testid="project-start" type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="inp" /></Lbl>
            <Lbl label="Deadline"><input data-testid="project-deadline" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="inp" /></Lbl>
          </div>
          <Lbl label="Status">
            <select data-testid="project-status-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="inp">
              {Object.keys(STATUS_LABELS).map((k) => <option key={k} value={k}>{STATUS_LABELS[k].label}</option>)}
            </select>
          </Lbl>
          <Lbl label="Tags (comma-separated)"><input data-testid="project-tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="inp" /></Lbl>

          {/* PROJECT MANAGER */}
          <Lbl label="Project manager (primary)">
            <select
              data-testid="project-manager-select"
              value={form.manager_user_id}
              onChange={(e) => setForm({ ...form, manager_user_id: e.target.value })}
              className="inp"
            >
              <option value="">— No manager —</option>
              {pool.managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>
              ))}
            </select>
          </Lbl>

          {/* TEAM MEMBERS (developers, qa, cloud_admin, etc.) */}
          <UserPicker
            label={`Team members (${form.member_user_ids.length} selected)`}
            users={pool.members.filter((u) => u.id !== form.manager_user_id)}
            selected={form.member_user_ids}
            onToggle={toggleId("members")}
            testId="project-members"
          />

          {/* INTERNS */}
          <UserPicker
            label={`Interns (${form.intern_user_ids.length} selected)`}
            users={pool.interns}
            selected={form.intern_user_ids}
            onToggle={toggleId("interns")}
            testId="project-interns"
            empty="No active interns yet — add them in /app/interns"
          />

          {editing && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-2 text-[11px] text-orange-700" data-testid="project-notify-info">
              ✨ Newly-added members and interns will get an email + in-app notification automatically.
            </div>
          )}

          <div>
            <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-slate-500">Kickoff files (≤10MB each)</span>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-200 bg-orange-50/30 p-3 text-xs text-[#F97316] hover:bg-orange-50">
              <Plus size={14} /> Add files
              <input type="file" hidden multiple onChange={(e) => pickFiles(e.target.files)} data-testid="project-files-input" />
            </label>
            {files.length > 0 && (
              <ul className="mt-2 space-y-1" data-testid="project-pending-files">
                {files.map((f, idx) => (
                  <li key={idx} className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                    <span>📎 {f.name}</span>
                    <button type="button" onClick={() => setFiles((p) => p.filter((_, k) => k !== idx))} className="text-slate-400 hover:text-red-500"><X size={11} /></button>
                  </li>
                ))}
              </ul>
            )}
            {editing && existingDocs.length > 0 && (
              <div className="mt-2 rounded-md border border-slate-200 bg-white p-2 text-[11px] text-slate-600">
                <div className="mb-1 font-semibold text-slate-500">Existing project documents ({existingDocs.length}):</div>
                <ul className="space-y-0.5">{existingDocs.map((d) => <li key={d.id}>📄 {d.name}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
        <button data-testid="project-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Saving…" : editing ? "Save changes" : "Create project & notify team"}
        </button>
        <style>{`.inp{width:100%;border:1px solid #E2E8F0;border-radius:8px;padding:8px 12px;font-size:14px;outline:none}.inp:focus{border-color:#F97316}`}</style>
      </motion.form>
    </motion.div>
  );
}

function UserPicker({ label, users, selected, onToggle, testId, empty }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <div data-testid={`${testId}-grid`} className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
        {users.length === 0 && <div className="text-xs text-slate-400">{empty || "No users in this role yet"}</div>}
        {users.map((m) => {
          const active = selected.includes(m.id);
          return (
            <button type="button" key={m.id} onClick={() => onToggle(m.id)}
              data-testid={`${testId}-toggle-${m.id}`}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                active ? "border-[#F97316] bg-orange-100 text-[#9A3412]" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200"
              }`}>
              <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white" style={{ background: active ? "#F97316" : "#94A3B8" }}>
                {(m.name || m.email)[0]?.toUpperCase()}
              </span>
              {m.name || m.email}
              {m.role && <span className="text-[9px] opacity-60">· {m.role}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Lbl({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
