import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, ArrowLeft, Calendar, Users, Briefcase, Clock, Send, Paperclip,
  CheckCircle2, Activity, FileText, X, Loader2, MessageSquare,
  Lock, Lightbulb, Microscope, Palette, Code2, TestTube2, Rocket, Wrench,
  ChevronDown, ChevronRight, UserCircle2,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/lifecycle/project/${id}/full`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load");
      navigate("/app/projects");
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const start = async () => {
    setPosting(true);
    try {
      const { data: r } = await api.post(`/lifecycle/project/${id}/start`);
      toast.success(r.already_started_at ? "Already started" : "Project started · RM and Super Admin notified");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Start failed"); }
    finally { setPosting(false); }
  };

  if (loading || !data) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }
  const p = data.project;
  const started = !!data.my_started_at;

  return (
    <div data-testid="page-project-detail" className="space-y-5">
      <button onClick={() => navigate("/app/projects")} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#0F2042]">
        <ArrowLeft size={12} /> Back to projects
      </button>

      {/* HERO */}
      <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-[#0F2042] via-[#1E3A8A] to-[#7C3AED] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-300">// project</div>
            <h1 className="font-display mt-1 truncate text-3xl font-medium md:text-4xl">{p.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-85">
              <span className="rounded-full bg-white/10 px-2 py-0.5 capitalize">{p.status?.replace("_", " ")}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 capitalize">priority: {p.priority}</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">{p.progress || 0}% complete</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            {started ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 text-xs font-bold ring-1 ring-emerald-400/60">
                <CheckCircle2 size={14} /> You started this on {data.my_started_at?.slice(0, 10)}
              </div>
            ) : (
              <button
                onClick={start}
                disabled={posting}
                data-testid="proj-start-btn"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/40 active:scale-95 disabled:opacity-60"
              >
                {posting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Start project
              </button>
            )}
            <button
              onClick={() => setProgressOpen(true)}
              data-testid="proj-progress-btn"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
            >
              <Send size={12} /> Post progress
            </button>
          </div>
        </div>
        {/* progress bar */}
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-gradient-to-r from-orange-400 to-amber-300 transition-all" style={{ width: `${p.progress || 0}%` }} />
          </div>
        </div>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoCard icon={Briefcase} label="Client" value={p.client || "—"} color="violet" />
        <InfoCard icon={Calendar} label="Deadline" value={p.deadline || "—"} color="rose" />
        <InfoCard icon={Users} label="Manager" value={p.manager || "—"} color="teal" />
      </div>

      {/* Description */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// description</div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{p.description || "No description provided."}</p>
        {p.members?.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">Team</span>
            {p.members.map((m) => (
              <span key={m} className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">{m}</span>
            ))}
          </div>
        )}
        {p.tags?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.tags.map((t) => <span key={t} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">#{t}</span>)}
          </div>
        )}
      </div>

      {/* Pipeline tree — only assignees can edit a stage; others see locked */}
      <ProjectPipeline projectId={id} project={p} currentUser={user} onUpdated={load} />

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#F97316]" />
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// activity timeline</div>
        </div>
        {data.timeline.length === 0 ? (
          <div className="mt-4 text-sm text-slate-400">Nothing here yet. Be the first to <b>Start</b> this project.</div>
        ) : (
          <ol className="mt-4 space-y-3 border-l-2 border-orange-200 pl-5">
            {data.timeline.map((ev) => (
              <li key={ev.id} data-testid={`proj-event-${ev.id}`} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-[8px] font-bold text-white">
                  {ev.kind === "started" ? "▶" : "•"}
                </span>
                <div className="rounded-xl bg-orange-50/60 p-3">
                  <div className="text-xs font-bold text-[#0F2042]">{ev.by_name} · <span className="font-normal text-slate-500">{ev.kind}</span></div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{ev.at}</div>
                  {ev.message && <div className="mt-2 text-sm text-slate-700">{ev.message}</div>}
                  {ev.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ev.attachments.map((a) => <AttachmentChip key={a.id} att={a} eventId={ev.id} />)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AnimatePresence>
        {progressOpen && <PostProgressModal entityKind="project" entityId={id} onClose={() => setProgressOpen(false)} onPosted={() => { setProgressOpen(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    violet: "from-violet-50 to-violet-100 text-violet-700",
    rose: "from-rose-50 to-rose-100 text-rose-700",
    teal: "from-teal-50 to-teal-100 text-teal-700",
  };
  return (
    <div className={`rounded-2xl border border-slate-200 bg-gradient-to-br ${colorMap[color]} p-4`}>
      <Icon size={16} className="opacity-70" />
      <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{label}</div>
      <div className="text-base font-bold">{value}</div>
    </div>
  );
}

function AttachmentChip({ att, eventId }) {
  const open = async () => {
    try {
      let b64 = att.content_base64;
      let mime = att.mime_type || "application/octet-stream";
      let name = att.name || "attachment";
      if (!b64 && att.document_id) {
        const { data } = await api.get(`/documents/${att.document_id}/download`);
        b64 = data.content_base64; mime = data.mime_type; name = data.name;
      }
      if (!b64) { toast.info("No previewable content"); return; }
      // base64 → Blob → URL  (avoids large data-URI navigation blocks in Chrome)
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const w = window.open(url, "_blank");
      if (!w) { toast.error("Popup blocked"); URL.revokeObjectURL(url); return; }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast.error("Open failed"); }
  };
  return (
    <button onClick={open} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200 hover:ring-[#F97316]">
      <Paperclip size={10} /> {att.name}
    </button>
  );
}

export function PostProgressModal({ entityKind, entityId, onClose, onPosted }) {
  const [msg, setMsg] = useState("");
  const [pct, setPct] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);

  const pickFile = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const arr = await Promise.all(files.map(toAttachment));
    setAttachments((a) => [...a, ...arr]);
  };

  const send = async () => {
    if (!msg.trim() && attachments.length === 0) { toast.error("Add a message or attachment"); return; }
    setBusy(true);
    try {
      const body = { message: msg, attachments };
      if (pct !== "") body.percent_complete = parseInt(pct);
      await api.post(`/lifecycle/${entityKind}/${entityId}/progress`, body);
      toast.success("Progress posted · RM and Super Admin notified");
      onPosted();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} data-testid="progress-modal"
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// share progress</div>
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">Post a progress update</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
        </div>
        <div className="space-y-3 p-6">
          <textarea
            data-testid="progress-message"
            value={msg} onChange={(e) => setMsg(e.target.value)}
            rows={5} placeholder="What did you work on? Any blockers?"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">
              <Paperclip size={12} /> Add screenshot/file
              <input type="file" hidden multiple onChange={pickFile} data-testid="progress-file" />
            </label>
            <input
              data-testid="progress-percent"
              type="number" min="0" max="100" value={pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="% complete (optional)"
              className="w-44 rounded-full border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#F97316]"
            />
          </div>
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {attachments.map((a, i) => (
                <div key={i} className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                  {a.name}
                  <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          <button
            data-testid="progress-send"
            onClick={send} disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Post update
          </button>
          <p className="text-center text-[10px] text-slate-400">RM, Super Admin and project owner will be emailed automatically.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// Helper: file → Attachment
async function toAttachment(file) {
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
  const b64 = String(dataUrl).split(",", 2)[1] || "";
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2),
    name: file.name,
    mime_type: file.type || "application/octet-stream",
    size: file.size,
    content_base64: b64,
    kind: (file.type || "").startsWith("image/") ? "image" : "file",
  };
}

// ============================================================================
// ProjectPipeline — 7-stage tree (Requirements → R&D → Design → Development →
// QA → Deployment → Maintenance). Each stage is editable ONLY by:
//   * a user listed in the stage's assignees, OR
//   * the project manager / owner / admin / super-admin.
// Non-assignees see the stage card as a locked/disabled tile showing the
// label, status, and which people are working on it.
// ============================================================================

const STAGE_ICONS = {
  requirements: Lightbulb,
  rnd: Microscope,
  design: Palette,
  development: Code2,
  qa: TestTube2,
  deployment: Rocket,
  maintenance: Wrench,
};

const STAGE_STATUS_STYLE = {
  not_started: { label: "Not started", color: "#94A3B8", bg: "#F1F5F9" },
  in_progress: { label: "In progress", color: "#F97316", bg: "#FFEDD5" },
  blocked:     { label: "Blocked",     color: "#EF4444", bg: "#FEE2E2" },
  completed:   { label: "Completed",   color: "#10B981", bg: "#D1FAE5" },
};

function ProjectPipeline({ projectId, project, currentUser, onUpdated }) {
  const [pool, setPool] = useState({ managers: [], members: [], interns: [], all: [] });
  const [expanded, setExpanded] = useState(null);
  const stages = project?.pipeline || [];

  useEffect(() => {
    api.get(`/projects/${projectId}/assignable-users`)
      .then(({ data }) => setPool(data || { all: [] }))
      .catch(() => {});
  }, [projectId]);

  const role = currentUser?.role;
  const isManager = project?.manager_user_id === currentUser?.id;
  const isOwner = project?.owner_id === currentUser?.id;
  const isPrivileged = ["super_admin", "admin", "manager"].includes(role) || isManager || isOwner;

  const canEditStage = (stage) => {
    if (isPrivileged) return true;
    const myId = currentUser?.id;
    const myEmail = (currentUser?.email || "").toLowerCase();
    return (stage.assignees || []).some(
      (a) => a.user_id === myId || (a.email || "").toLowerCase() === myEmail,
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5" data-testid="project-pipeline">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// project pipeline</div>
          <h3 className="font-display mt-1 text-lg font-semibold text-[#0F2042]">Requirements → R&amp;D → Design → Dev → QA → Deploy → Maintenance</h3>
        </div>
        <div className="text-xs text-slate-500">
          {stages.filter((s) => s.status === "completed").length} / {stages.length} stages done
        </div>
      </div>

      <ol className="relative space-y-3">
        {stages.map((stage, idx) => {
          const Icon = STAGE_ICONS[stage.key] || Activity;
          const style = STAGE_STATUS_STYLE[stage.status] || STAGE_STATUS_STYLE.not_started;
          const locked = !canEditStage(stage);
          const open = expanded === stage.key;
          return (
            <li key={stage.key} data-testid={`pipeline-stage-${stage.key}`}>
              <button
                type="button"
                disabled={locked && !isPrivileged}
                onClick={() => setExpanded(open ? null : stage.key)}
                className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                  locked
                    ? "cursor-not-allowed border-slate-200 bg-slate-50/50 opacity-70"
                    : open
                    ? "border-[#F97316] bg-orange-50/30"
                    : "border-slate-200 bg-white hover:border-[#F97316]"
                }`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style={{ background: style.color }}>
                  {locked ? <Lock size={14} /> : <Icon size={16} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-400">Stage {idx + 1}</span>
                    <span className="font-display text-sm font-semibold text-[#0F2042]">{stage.label}</span>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: style.bg, color: style.color }}>
                      {style.label}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {(stage.assignees || []).length === 0 ? (
                      <span className="text-[11px] text-slate-400">Nobody assigned yet</span>
                    ) : (
                      stage.assignees.slice(0, 5).map((a, i) => (
                        <span key={(a.user_id || a.email || a.name) + i} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
                          <UserCircle2 size={10} /> {a.name || a.email || "—"}
                        </span>
                      ))
                    )}
                  </span>
                </span>
                {locked
                  ? <Lock size={14} className="text-slate-400" />
                  : (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
              </button>

              {open && !locked && (
                <StageEditor
                  projectId={projectId}
                  stage={stage}
                  pool={pool}
                  isPrivileged={isPrivileged}
                  onUpdated={onUpdated}
                />
              )}
              {open && locked && (
                <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500" data-testid={`pipeline-locked-msg-${stage.key}`}>
                  <Lock size={14} className="mx-auto mb-1 text-slate-400" />
                  This stage is locked — only the people assigned here can update it. Ask your project manager if you need access.
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StageEditor({ projectId, stage, pool, isPrivileged, onUpdated }) {
  const [status, setStatus] = useState(stage.status);
  const [notes, setNotes] = useState(stage.notes || "");
  const [assigneeIds, setAssigneeIds] = useState((stage.assignees || []).map((a) => a.user_id).filter(Boolean));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body = { status, notes };
      if (isPrivileged) {
        // Only privileged users can change assignees. Resolve ids → minimal user docs.
        const byId = Object.fromEntries((pool.all || []).map((u) => [u.id, u]));
        body.assignees = assigneeIds.map((id) => {
          const u = byId[id];
          return u ? { user_id: u.id, email: u.email, name: u.name || "", role: u.role || "" } : { user_id: id, email: "", name: "" };
        });
      }
      await api.patch(`/projects/${projectId}/pipeline/${stage.key}`, body);
      toast.success(`Stage "${stage.label}" updated`);
      onUpdated && onUpdated();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3" data-testid={`stage-editor-${stage.key}`}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Stage status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)}
            data-testid={`stage-status-${stage.key}`}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]">
            {Object.entries(STAGE_STATUS_STYLE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        {isPrivileged && (
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Assignees ({assigneeIds.length})</span>
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-xs text-slate-600">
                {assigneeIds.length === 0 ? "Choose people…" : `${assigneeIds.length} selected`}
              </summary>
              <div className="max-h-44 overflow-y-auto p-2">
                {(pool.all || []).map((u) => {
                  const active = assigneeIds.includes(u.id);
                  return (
                    <button key={u.id} type="button"
                      onClick={() => setAssigneeIds((a) => active ? a.filter((x) => x !== u.id) : [...a, u.id])}
                      data-testid={`stage-${stage.key}-assignee-${u.id}`}
                      className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${active ? "bg-orange-100 text-[#9A3412]" : "hover:bg-slate-50 text-slate-600"}`}>
                      <span className="flex h-4 w-4 items-center justify-center rounded-full text-[8px] text-white" style={{ background: active ? "#F97316" : "#94A3B8" }}>
                        {(u.name || u.email)[0]?.toUpperCase()}
                      </span>
                      {u.name || u.email} <span className="text-[9px] opacity-60">· {u.role}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          </label>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Stage notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
          data-testid={`stage-notes-${stage.key}`}
          placeholder={`What's happening in ${stage.label}? Blockers, decisions, next steps…`}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
      </label>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-400">
          {stage.started_at && <>Started {new Date(stage.started_at).toLocaleString()} · </>}
          {stage.completed_at && <>Completed {new Date(stage.completed_at).toLocaleString()}</>}
        </div>
        <button onClick={save} disabled={saving}
          data-testid={`stage-save-${stage.key}`}
          className="rounded-full bg-[#F97316] px-4 py-1.5 text-xs font-bold text-white shadow disabled:opacity-60">
          {saving ? <Loader2 size={12} className="inline animate-spin" /> : "Save stage"}
        </button>
      </div>
    </div>
  );
}

