import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X, Trash2, Clock3, AlertCircle, CheckCircle2, ListChecks, Mail, ExternalLink, GripVertical } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PortalInfographic from "@/components/PortalInfographic";
import EmailComposeModal from "@/components/EmailComposeModal";

const COLUMNS = [
  { id: "todo", title: "Todo", color: "#94A3B8" },
  { id: "in_progress", title: "In progress", color: "#3B82F6" },
  { id: "blocked", title: "Blocked", color: "#F59E0B" },
  { id: "review", title: "In review", color: "#F97316" },
  { id: "done", title: "Done", color: "#10B981" },
];

const APPROVAL_ROLES = new Set(["super_admin", "admin", "manager", "hr"]);

const PRIORITY_COLOR = {
  low: "#94A3B8",
  medium: "#3B82F6",
  high: "#F97316",
  urgent: "#EF4444",
};

export default function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [emailFor, setEmailFor] = useState(null);
  const [me, setMe] = useState(null);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tasks");
      setTasks(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    api.get("/auth/me").then(({ data }) => setMe(data)).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const g = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
    tasks.forEach((t) => g[t.status]?.push(t));
    return g;
  }, [tasks]);

  const summary = useMemo(() => ({
    todo: grouped.todo?.length || 0,
    in_progress: grouped.in_progress?.length || 0,
    blocked: grouped.blocked?.length || 0,
    review: grouped.review?.length || 0,
    done: grouped.done?.length || 0,
  }), [grouped]);

  const canApprove = me && APPROVAL_ROLES.has(me.role);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId) return;
    const newStatus = destination.droppableId;
    const task = tasks.find((t) => t.id === draggableId);

    // Guard 1: locked task can only be moved by approval-roles
    if (task?.is_locked && !canApprove) {
      toast.warning("This task is locked pending manager review.");
      return;
    }
    // Guard 2: interns/team members dragging to "done" → optimistic bounce-back.
    // Backend will auto-route to "review" anyway, but we keep them oriented.
    if (newStatus === "done" && !canApprove && task?.assignee_id === me?.id) {
      toast.info("Submitting for manager approval (interns can't close tasks directly).");
      setTasks((p) => p.map((t) => (t.id === draggableId ? { ...t, status: "review", is_locked: true } : t)));
      try {
        const { data } = await api.patch(`/tasks/${draggableId}`, { status: "review" });
        setTasks((p) => p.map((t) => (t.id === draggableId ? data : t)));
      } catch (e) {
        toast.error(formatApiError(e?.response?.data?.detail) || "Submit failed");
        fetchTasks();
      }
      return;
    }
    setTasks((p) => p.map((t) => (t.id === draggableId ? { ...t, status: newStatus } : t)));
    try {
      const { data } = await api.patch(`/tasks/${draggableId}`, { status: newStatus });
      setTasks((p) => p.map((t) => (t.id === draggableId ? data : t)));
      if (data.is_locked) toast.success("Submitted for manager review.");
    } catch (e) {
      const detail = e?.response?.data?.detail;
      toast.error(detail || "Move failed");
      fetchTasks();
    }
  };

  const remove = async (id) => {
    await api.delete(`/tasks/${id}`);
    setTasks((p) => p.filter((t) => t.id !== id));
  };

  return (
    <div data-testid="portal-tasks" className="space-y-6">
      {/* 3D Infographic Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-blue-50/40 p-6 shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(50% 50% at 80% 20%, rgba(249,115,22,0.18), transparent 60%), radial-gradient(50% 50% at 10% 90%, rgba(30,58,138,0.12), transparent 60%)",
          }}
        />
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// task management</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Move work through the board.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Drag cards across <span className="font-semibold text-[#0F2042]">Todo → In progress → Review → Done</span>.
              Priority and assignees stay synced live.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                data-testid="add-task-btn"
                onClick={() => setShowAdd(true)}
                className="btn-primary text-sm"
              >
                <Plus size={16} /> New Task
              </button>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Clock3 size={14} className="text-[#3B82F6]" />{summary.in_progress} in progress</span>
                <span className="inline-flex items-center gap-1.5"><AlertCircle size={14} className="text-[#F97316]" />{summary.review} in review</span>
                <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-[#10B981]" />{summary.done} done</span>
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <PortalInfographic variant="tasks" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Todo", v: summary.todo, c: "#94A3B8", icon: ListChecks },
          { l: "In progress", v: summary.in_progress, c: "#3B82F6", icon: Clock3 },
          { l: "In review", v: summary.review, c: "#F97316", icon: AlertCircle },
          { l: "Done", v: summary.done, c: "#10B981", icon: CheckCircle2 },
        ].map((s, i) => {
          const Ic = s.icon;
          return (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="rounded-xl p-2" style={{ background: `${s.c}1a`, color: s.c }}>
                  <Ic size={14} />
                </div>
                <div className="font-display text-2xl font-semibold" style={{ color: s.c }}>{s.v}</div>
              </div>
              <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">{s.l}</div>
            </motion.div>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          Loading tasks…
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <Droppable droppableId={col.id} key={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    data-testid={`task-col-${col.id}`}
                    className={`kanban-col flex-1 rounded-2xl border p-3 transition-colors ${
                      snapshot.isDraggingOver
                        ? "border-[#F97316] bg-orange-50/50"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: col.color }} />
                        <span className="text-sm font-semibold text-slate-700">{col.title}</span>
                      </div>
                      <span className="font-mono-pj text-xs text-slate-400">{grouped[col.id].length}</span>
                    </div>
                    <div className="space-y-2">
                      {grouped[col.id].map((t, idx) => (
                        <Draggable key={t.id} draggableId={t.id} index={idx}>
                          {(p, snap) => (
                            <div
                              ref={p.innerRef}
                              {...p.draggableProps}
                              data-testid={`task-card-${t.id}`}
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                // Don't navigate when the click started a drag, or clicked an action button.
                                if (snap.isDragging) return;
                                if (e.target.closest("button, a")) return;
                                navigate(`/app/tasks/${t.id}`);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  navigate(`/app/tasks/${t.id}`);
                                }
                              }}
                              className={`group cursor-pointer rounded-xl border bg-white p-3 shadow-sm transition hover:border-[#1E3A8A] hover:shadow-md ${
                                snap.isDragging ? "rotate-1 border-[#F97316] shadow-lg" : "border-slate-200"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                                  <span
                                    {...p.dragHandleProps}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Drag to move"
                                    className="-ml-1 mt-0.5 cursor-grab text-slate-300 hover:text-slate-500"
                                  >
                                    <GripVertical size={14} />
                                  </span>
                                  <div className="text-sm font-semibold text-[#0F172A]">{t.title}</div>
                                </div>
                                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                  <Link
                                    to={`/app/tasks/${t.id}`}
                                    data-testid={`task-open-${t.id}`}
                                    title="Open task"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink size={12} className="text-[#0F2042] hover:text-[#1E3A8A]" />
                                  </Link>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setEmailFor(t); }}
                                    data-testid={`task-email-${t.id}`}
                                    title="Send email"
                                  >
                                    <Mail size={12} className="text-[#F97316] hover:text-orange-600" />
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); remove(t.id); }} title="Delete">
                                    <Trash2 size={12} className="text-slate-400 hover:text-red-500" />
                                  </button>
                                </div>
                              </div>
                              {t.description && (
                                <div className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</div>
                              )}
                              {t.project_name && (
                                <div className="mt-1.5 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#1E3A8A]">
                                  📂 {t.project_name}
                                </div>
                              )}
                              <div className="mt-3 flex items-center justify-between">
                                <span
                                  className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                                  style={{ background: `${PRIORITY_COLOR[t.priority]}20`, color: PRIORITY_COLOR[t.priority] }}
                                >
                                  {t.priority}
                                </span>
                                {t.assignee && (
                                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#0F2042] text-[9px] font-bold text-white">
                                    {t.assignee[0]?.toUpperCase()}
                                  </div>
                                )}
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
      )}

      <AnimatePresence>
        {showAdd && <AddTaskModal onClose={() => setShowAdd(false)} onCreated={(t) => setTasks((p) => [t, ...p])} />}
      </AnimatePresence>
      <EmailComposeModal
        open={!!emailFor}
        onClose={() => setEmailFor(null)}
        defaults={emailFor ? {
          to: emailFor.assignee_email ? [emailFor.assignee_email] : [],
          cc: emailFor.reporting_manager_email ? [emailFor.reporting_manager_email] : [],
          templateSlug: "task_assigned",
          contextLabel: `Task: ${emailFor.title}${emailFor.assignee ? ` → ${emailFor.assignee}` : ""}`,
          variables: {
            name: emailFor.assignee || "",
            task_title: emailFor.title || "",
            project_name: emailFor.project_name || "—",
            deadline: emailFor.due_date || "—",
            priority: emailFor.priority || "medium",
          },
        } : {}}
      />
    </div>
  );
}

function AddTaskModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: "", description: "", priority: "medium",
    assignee_id: "", assignee: "",
    reporting_manager_id: "",
    project_id: "", project_name: "",
    due_date: "",
  });
  const [projects, setProjects] = useState([]);
  const [pool, setPool] = useState({ all: [], managers: [], members: [], interns: [] });
  const [projectPool, setProjectPool] = useState(null); // scoped to selected project's members
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/projects").then(({ data }) => setProjects(data)).catch(() => {});
    // Global fallback pool when no project is selected
    api.get("/projects/new/assignable-users").then(({ data }) => setPool(data || { all: [] })).catch(() => {});
  }, []);

  // When a project is picked, scope the dropdowns to that project's members/manager
  useEffect(() => {
    if (!form.project_id) { setProjectPool(null); return; }
    const proj = projects.find((p) => p.id === form.project_id);
    if (!proj) { setProjectPool(null); return; }
    const memberIds = new Set([
      proj.manager_user_id,
      ...(proj.member_user_ids || []),
      ...(proj.intern_user_ids || []),
    ].filter(Boolean));
    const filtered = (pool.all || []).filter((u) => memberIds.has(u.id));
    setProjectPool({ all: filtered, manager_id: proj.manager_user_id });
  }, [form.project_id, projects, pool]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Resolve assignee name from id (backend will also resolve, but keep UI consistent)
      const assignee = (pool.all || []).find((u) => u.id === form.assignee_id);
      const payload = {
        title: form.title,
        description: form.description,
        priority: form.priority,
        assignee_id: form.assignee_id || "",
        assignee_email: assignee?.email || "",
        assignee: assignee?.name || assignee?.email || form.assignee || "",
        reporting_manager_id: form.reporting_manager_id || "",
        project_id: form.project_id || "",
        project_name: form.project_name || "",
        due_date: form.due_date || "",
      };
      const { data } = await api.post("/tasks", payload);
      onCreated(data);
      toast.success("Task created · assignee &amp; manager notified");
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const peoplePool = projectPool ? projectPool.all : (pool.all || []);
  // Reporting manager hint: auto-suggest project manager when project picked
  const suggestedManager = projectPool?.manager_id;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <motion.form
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">New Task</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Title *</span>
            <input
              data-testid="task-title"
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Project</span>
            <select
              data-testid="task-project"
              value={form.project_id}
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value);
                setForm((f) => ({
                  ...f,
                  project_id: e.target.value,
                  project_name: p?.name || "",
                  // Reset assignee + manager when project changes so we don't keep a non-member
                  assignee_id: "",
                  reporting_manager_id: p?.manager_user_id || "",
                }));
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
              <option value="">— None (personal task) —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {projectPool && (
              <span className="mt-1 block text-[10px] text-slate-400">
                Showing only this project's {projectPool.all.length} team members.
              </span>
            )}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Description</span>
            <textarea
              data-testid="task-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Priority</span>
              <select
                data-testid="task-priority"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
              >
                {["low", "medium", "high", "urgent"].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Due date</span>
              <input
                type="date"
                data-testid="task-due-date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Assignee</span>
            <select
              data-testid="task-assignee"
              value={form.assignee_id}
              onChange={(e) => setForm({ ...form, assignee_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            >
              <option value="">— Unassigned —</option>
              {peoplePool.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}{m.role ? ` · ${m.role}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">
              Reporting manager {suggestedManager && form.reporting_manager_id === suggestedManager && <span className="text-[#F97316]">(project manager)</span>}
            </span>
            <select
              data-testid="task-reporting-manager"
              value={form.reporting_manager_id}
              onChange={(e) => setForm({ ...form, reporting_manager_id: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
            >
              <option value="">— Auto (use assignee's RM) —</option>
              {(pool.managers || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.email}{m.role ? ` · ${m.role}` : ""}
                </option>
              ))}
            </select>
          </label>
          {(form.assignee_id || form.reporting_manager_id) && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-2 text-[11px] text-orange-700" data-testid="task-notify-hint">
              ✨ {form.assignee_id ? "Assignee" : ""}{form.assignee_id && form.reporting_manager_id ? " + " : ""}{form.reporting_manager_id ? "Reporting manager" : ""} will get email + in-app notifications.
            </div>
          )}
        </div>
        <button data-testid="task-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Saving…" : "Create Task"}
        </button>
      </motion.form>
    </motion.div>
  );
}
