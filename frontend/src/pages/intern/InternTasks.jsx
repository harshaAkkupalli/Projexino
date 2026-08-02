import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ListChecks, Clock3, CheckCircle2, Paperclip, Download, ChevronRight } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import InternInfographic from "@/components/InternInfographic";

const STATUS = ["assigned", "in_progress", "submitted", "completed"];
const STATUS_C = {
  assigned: "#94A3B8", in_progress: "#3B82F6", submitted: "#F97316", completed: "#10B981", overdue: "#EF4444",
};

export default function InternTasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/me/intern/tasks");
      setTasks(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const setStatus = async (t, status) => {
    try {
      const { data } = await api.patch(`/me/intern/tasks/${t.id}`, { status });
      setTasks((p) => p.map((x) => (x.id === t.id ? data : x)));
      toast.success(`Status → ${status}`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed");
    }
  };

  const downloadAttachment = async (taskId, att) => {
    try {
      const { data } = await api.get(`/intern-hub/task-attachment/${taskId}/${att.id}`);
      const a = document.createElement("a");
      a.href = `data:${data.mime_type};base64,${data.content_base64}`;
      a.download = data.name;
      a.click();
    } catch { toast.error("Download failed"); }
  };

  return (
    <div data-testid="intern-tasks-page" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// my tasks</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Move work forward.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Update task status as you go. Submit early to earn the <span className="font-semibold text-[#10B981]">On-Time Achiever</span> badge.
            </p>
          </div>
          <div className="lg:col-span-3">
            <InternInfographic variant="tasks" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-orange-100 bg-white p-10 text-center text-sm text-slate-500">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-white p-12 text-center">
          <ListChecks className="mx-auto text-slate-300" size={36} />
          <div className="mt-3 text-sm font-semibold text-slate-700">No tasks yet</div>
          <div className="mt-1 text-xs text-slate-500">Your manager will assign tasks shortly.</div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t, i) => {
            const isOverdue = t.deadline && t.status !== "completed" && t.deadline.slice(0, 10) < new Date().toISOString().slice(0, 10);
            const c = STATUS_C[isOverdue ? "overdue" : t.status];
            return (
              <motion.div key={t.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                data-testid={`my-task-${t.id}`}
                role="button" tabIndex={0}
                onClick={(e) => {
                  if (e.target.closest("button, a, select")) return;
                  navigate(`/intern/tasks/${t.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/intern/tasks/${t.id}`); }
                }}
                className="cursor-pointer rounded-2xl border border-orange-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 font-display text-base font-semibold text-[#0F172A]">
                      {t.title} <ChevronRight size={14} className="text-slate-300" />
                    </div>
                    {t.project_name && <div className="mt-0.5 text-xs text-slate-500">📂 {t.project_name}</div>}
                  </div>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${c}1f`, color: c }}>
                    {isOverdue ? "OVERDUE" : t.status}
                  </span>
                </div>
                {t.description && <p className="mt-2 line-clamp-3 text-xs text-slate-600">{t.description}</p>}
                {(t.attachments || []).length > 0 && (
                  <div className="mt-2 space-y-1" data-testid={`task-attachments-${t.id}`}>
                    {(t.attachments || []).map((a) => (
                      <button key={a.id} onClick={() => downloadAttachment(t.id, a)}
                        className="flex w-full items-center justify-between rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-700 hover:bg-orange-50">
                        <span className="flex items-center gap-1 truncate"><Paperclip size={10} /> {a.name}</span>
                        <Download size={10} className="text-[#F97316]" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-500">
                  <div className="flex items-center gap-1"><Clock3 size={11} /> Due {t.deadline?.slice(0, 10) || "—"}</div>
                  <div className="flex items-center gap-1">Priority: {t.priority}</div>
                  {t.on_time === true && <div className="col-span-2 flex items-center gap-1 text-emerald-600"><CheckCircle2 size={11} /> Completed on time</div>}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Update</span>
                  <select data-testid={`my-task-status-${t.id}`} value={t.status} onChange={(e) => setStatus(t, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-[#F97316]">
                    {STATUS.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
