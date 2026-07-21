import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, ArrowLeft, Calendar, User, FolderKanban, Clock, Send, Paperclip,
  CheckCircle2, Activity, Loader2, X, Lock, ThumbsUp, ThumbsDown,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { PostProgressModal } from "./ProjectDetail";

const PRIORITY_COLOR = {
  low: "bg-slate-100 text-slate-600",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-rose-100 text-rose-700",
};
const STATUS_COLOR = {
  todo: "bg-slate-100 text-slate-600",
  in_progress: "bg-indigo-100 text-indigo-700",
  blocked: "bg-amber-100 text-amber-700",
  review: "bg-orange-100 text-orange-700",
  done: "bg-emerald-100 text-emerald-700",
};
const APPROVAL_ROLES = new Set(["super_admin", "admin", "manager", "hr"]);

export default function TaskDetail({ backTo = "/app/tasks" }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [approving, setApproving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/lifecycle/task/${id}/full`);
      setData(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to load");
      navigate(backTo);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); api.get("/auth/me").then(({ data }) => setMe(data)).catch(() => {}); /* eslint-disable-next-line */ }, [id]);

  const start = async () => {
    setPosting(true);
    try {
      const { data: r } = await api.post(`/lifecycle/task/${id}/start`);
      toast.success(r.already_started_at ? "Already started" : "Task started · RM and Super Admin notified");
      await load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Start failed"); }
    finally { setPosting(false); }
  };

  const approve = async () => {
    setApproving(true);
    try {
      await api.post(`/tasks/${id}/approve`);
      toast.success("✅ Approved & closed");
      await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Approve failed"); }
    finally { setApproving(false); }
  };
  const reject = async () => {
    if (!rejectReason.trim()) { toast.error("Add a rejection note"); return; }
    setApproving(true);
    try {
      await api.post(`/tasks/${id}/reject`, { reason: rejectReason.trim() });
      toast.success("Returned to assignee with notes");
      setRejectOpen(false); setRejectReason("");
      await load();
    } catch (e) { toast.error(formatApiError(e?.response?.data?.detail) || "Reject failed"); }
    finally { setApproving(false); }
  };

  if (loading || !data) {
    return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;
  }
  const t = data.task;
  const p = data.project;
  const started = !!data.my_started_at;
  const canApprove = me && APPROVAL_ROLES.has(me.role);
  const isApproverForThisTask = canApprove || (me && (t.owner_id === me.id || t.reporting_manager_id === me.id));
  const showApprovalButtons = t.status === "review" && isApproverForThisTask;

  return (
    <div data-testid="page-task-detail" className="space-y-5">
      <button onClick={() => navigate(backTo)} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#0F2042]">
        <ArrowLeft size={12} /> Back to tasks
      </button>

      {/* HERO */}
      <div className="rounded-3xl border border-indigo-100 bg-gradient-to-br from-[#0F2042] via-[#312E81] to-[#7C3AED] p-6 text-white shadow-xl">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-indigo-300">// task</div>
            <h1 className="font-display mt-1 text-3xl font-medium md:text-4xl">{t.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-0.5 font-bold uppercase ${STATUS_COLOR[t.status] || STATUS_COLOR.todo}`}>{(t.status || "").replace("_", " ")}</span>
              {t.priority && <span className={`rounded-full px-2 py-0.5 font-bold uppercase ${PRIORITY_COLOR[t.priority] || PRIORITY_COLOR.medium}`}>{t.priority}</span>}
              {t.due_date && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5"><Calendar size={10} /> due {t.due_date}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-2 md:items-end">
            {started ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 px-4 py-2 text-xs font-bold ring-1 ring-emerald-400/60">
                <CheckCircle2 size={14} /> Started {data.my_started_at?.slice(0, 10)}
              </div>
            ) : (
              <button
                onClick={start}
                disabled={posting}
                data-testid="task-start-btn"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/40 active:scale-95 disabled:opacity-60"
              >
                {posting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />} Start task
              </button>
            )}
            <button
              onClick={() => setProgressOpen(true)}
              data-testid="task-progress-btn"
              className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20"
            >
              <Send size={12} /> Post progress
            </button>
          </div>
        </div>
      </div>

      {/* Lifecycle banner: locked / rejected reason / approval prompt */}
      {t.is_locked && (
        <div data-testid="task-locked-banner" className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
          <Lock size={16} className="mt-0.5 shrink-0 text-amber-700"/>
          <div className="flex-1">
            <div className="font-bold text-amber-900">Awaiting manager approval</div>
            <div className="text-xs text-amber-700">This task is locked. The assigned manager will review and either approve to close or send back with notes.</div>
          </div>
        </div>
      )}
      {t.rejected_reason && t.status === "in_progress" && (
        <div data-testid="task-reject-banner" className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">// changes requested</div>
          <div className="mt-1 text-rose-900">{t.rejected_reason}</div>
        </div>
      )}
      {showApprovalButtons && (
        <div data-testid="task-approve-row" className="flex flex-col items-stretch gap-2 rounded-2xl border-2 border-orange-200 bg-orange-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#F97316]">// awaiting your decision</div>
            <div className="font-display text-sm font-semibold text-[#0F2042]">Approve to close, or reject with notes for revision.</div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRejectOpen(true)} disabled={approving}
              data-testid="task-reject-btn"
              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
              <ThumbsDown size={12}/> Reject with notes
            </button>
            <button onClick={approve} disabled={approving}
              data-testid="task-approve-btn"
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {approving ? <Loader2 size={12} className="animate-spin"/> : <ThumbsUp size={12}/>} Approve &amp; close
            </button>
          </div>
        </div>
      )}

      {/* Meta grid */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {p && (
          <Link to={`/app/projects/${p.id}`} data-testid="task-project-link"
            className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
            <FolderKanban size={16} className="text-violet-700" />
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-700">Project</div>
            <div className="text-base font-bold text-[#0F2042]">{p.name}</div>
            <div className="mt-1 text-[10px] text-slate-500">Tap to open project →</div>
          </Link>
        )}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <User size={16} className="text-rose-700" />
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-rose-700">Assignee</div>
          <div className="text-base font-bold text-[#0F2042]">{t.assignee_name || t.owner_name || "Unassigned"}</div>
          {t.assignee_email && <div className="text-[10px] text-slate-500">{t.assignee_email}</div>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <Clock size={16} className="text-teal-700" />
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-700">Created</div>
          <div className="text-base font-bold text-[#0F2042]">{(t.created_at || "").slice(0, 10) || "—"}</div>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// description</div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{t.description || t.notes || "No description provided."}</p>
        {t.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {t.tags.map((tag) => <span key={tag} className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">#{tag}</span>)}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[#F97316]" />
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// activity timeline</div>
        </div>
        {data.timeline.length === 0 ? (
          <div className="mt-4 text-sm text-slate-400">Nothing here yet. <b>Start</b> this task to log a milestone.</div>
        ) : (
          <ol className="mt-4 space-y-3 border-l-2 border-violet-200 pl-5">
            {data.timeline.map((ev) => (
              <li key={ev.id} data-testid={`task-event-${ev.id}`} className="relative">
                <span className="absolute -left-[27px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[8px] font-bold text-white">
                  {ev.kind === "started" ? "▶" : "•"}
                </span>
                <div className="rounded-xl bg-violet-50/60 p-3">
                  <div className="text-xs font-bold text-[#0F2042]">{ev.by_name} · <span className="font-normal text-slate-500">{ev.kind}</span></div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{ev.at}</div>
                  {ev.message && <div className="mt-2 text-sm text-slate-700">{ev.message}</div>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <AnimatePresence>
        {progressOpen && <PostProgressModal entityKind="task" entityId={id} onClose={() => setProgressOpen(false)} onPosted={() => { setProgressOpen(false); load(); }} />}
        {rejectOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRejectOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={(e) => e.stopPropagation()}
              data-testid="task-reject-modal"
              className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <h3 className="font-display text-base font-semibold text-[#0F2042]">Request changes</h3>
                <button onClick={() => setRejectOpen(false)} className="text-slate-400 hover:text-[#0F2042]"><X size={16}/></button>
              </div>
              <div className="space-y-3 p-5">
                <p className="text-xs text-slate-500">Add specific feedback. The assignee will be notified and the task moves back to In Progress.</p>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4}
                  data-testid="task-reject-reason"
                  placeholder="e.g. Need updated screenshots + sign-off email from client."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-rose-400"/>
                <button onClick={reject} disabled={approving || !rejectReason.trim()}
                  data-testid="task-reject-confirm"
                  className="w-full rounded-xl bg-rose-600 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  {approving ? <Loader2 size={14} className="inline animate-spin"/> : "Send back with notes"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
