import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Award, Clock3, AlertCircle, CheckCircle2, MessageSquare, FileText, Download, TrendingUp, Lightbulb, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import InternInfographic from "@/components/InternInfographic";
import Badge3D from "@/components/Badge3D";
import { Link } from "react-router-dom";

const LATEST_BADGE_KEY = "pj_latest_badge_seen";

export default function InternDashboard() {
  const [data, setData] = useState(null);
  const [hours, setHours] = useState([]);
  const [loading, setLoading] = useState(true);
  const [celebrate, setCelebrate] = useState(null); // newest badge to celebrate (if any)

  useEffect(() => {
    Promise.all([
      api.get("/me/intern/progress").then(({ data }) => setData(data)),
      api.get("/me/hours").then(({ data }) => setHours(data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Detect newly-earned badge and trigger celebration banner
  useEffect(() => {
    if (!data?.badges?.length) return;
    const latest = data.badges[data.badges.length - 1];
    const lastSeen = localStorage.getItem(LATEST_BADGE_KEY);
    if (latest.id && latest.id !== lastSeen) {
      setCelebrate(latest);
    }
  }, [data?.badges?.length]);

  const dismissCelebration = () => {
    if (celebrate?.id) localStorage.setItem(LATEST_BADGE_KEY, celebrate.id);
    setCelebrate(null);
  };

  const downloadCertificate = async () => {
    try {
      const token = localStorage.getItem("pj_token");
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me/intern/certificate`,
        { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Performance_Certificate.pdf`;
      a.click();
      toast.success("Performance certificate downloaded");
    } catch {
      toast.error("Could not generate certificate");
    }
  };

  const downloadReport = async () => {
    try {
      const token = localStorage.getItem("pj_token");
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/me/intern/progress/pdf`,
        { headers: { Authorization: `Bearer ${token}` }, credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Progress_Report.pdf`;
      a.click();
      toast.success("Progress report downloaded");
    } catch {
      toast.error("Could not generate report");
    }
  };

  if (loading) return <div className="rounded-2xl border border-orange-100 bg-white p-10 text-center text-sm text-slate-500">Loading your progress…</div>;
  if (!data) return <div className="rounded-2xl border border-orange-100 bg-white p-10 text-center">No intern profile linked yet.</div>;

  const s = data.summary;
  const friday = nextFriday();

  return (
    <div data-testid="intern-dashboard" className="space-y-6">
      {/* Celebration banner */}
      <AnimatePresence>
        {celebrate && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.96 }}
            data-testid="badge-celebration"
            className="relative overflow-hidden rounded-3xl border-2 p-6 shadow-xl"
            style={{ borderColor: celebrate.color, background: `linear-gradient(135deg, ${celebrate.color}15 0%, ${celebrate.color}05 60%, white 100%)` }}>
            {/* Confetti dots */}
            {[...Array(18)].map((_, i) => (
              <motion.div key={i}
                initial={{ y: -20, x: Math.random() * 300, opacity: 0 }}
                animate={{ y: 200, opacity: [0, 1, 0] }}
                transition={{ duration: 2.5, delay: i * 0.08, repeat: Infinity, repeatDelay: 3 }}
                className="absolute h-2 w-2 rounded-full"
                style={{ background: ["#F97316", "#A855F7", "#10B981", "#EAB308", "#3B82F6"][i % 5], left: `${(i * 6) % 100}%`, top: 0 }} />
            ))}
            <div className="relative grid items-center gap-6 sm:grid-cols-[140px_1fr_auto]">
              <div className="flex justify-center">
                <Badge3D icon={celebrate.icon || "trophy"} color={celebrate.color} size={120} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: celebrate.color }}>
                  ✨ NEW BADGE EARNED
                </div>
                <h2 className="font-display mt-1 text-2xl font-bold text-[#0F2042]">{celebrate.name}</h2>
                <p className="mt-1 text-sm text-slate-600">"{celebrate.reason}"</p>
                <div className="mt-1 text-[11px] text-slate-400">
                  Awarded by {celebrate.awarded_by || "Reviewer"} · {(celebrate.earned_at || "").slice(0, 10)}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Link to="/intern/badges" className="rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white" style={{ background: celebrate.color }}>
                  View all badges
                </Link>
                <button onClick={dismissCelebration} className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 hover:text-slate-600">
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// my progress</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Welcome back, {data.intern.name.split(" ")[0]}.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Your weekly progress refresh — drops every Friday. Next refresh: <span className="font-semibold text-[#0F2042]">{friday}</span>.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button data-testid="download-report-btn" onClick={downloadReport} className="btn-primary text-sm">
                <Download size={16} /> Progress report
              </button>
              <button data-testid="download-cert-btn" onClick={downloadCertificate}
                className="inline-flex items-center gap-2 rounded-lg border border-[#F97316] bg-orange-50 px-4 py-2 text-sm font-bold text-[#F97316] hover:bg-orange-100">
                <Award size={16} /> Performance certificate
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <TrendingUp size={14} className="text-[#10B981]" /> {s.on_time_rate}% on-time rate
              </span>
              {hours[0]?.date === new Date().toISOString().slice(0, 10) && (
                <span data-testid="today-hours-chip" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-3 py-1 text-xs font-bold text-white">
                  ⏱ {fmtMin(hours[0].minutes)} today
                </span>
              )}
            </div>
          </div>
          <div className="lg:col-span-3">
            <InternInfographic variant="dashboard" className="h-56 w-full" />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={CheckCircle2} label="Completed" value={s.completed} sub={`${s.completed_this_week} this week`} c="#10B981" />
        <Kpi icon={Clock3} label="Pending" value={s.pending} sub="Keep moving!" c="#F97316" />
        <Kpi icon={AlertCircle} label="Overdue" value={s.overdue} sub={s.overdue ? "Needs attention" : "All on track"} c={s.overdue ? "#EF4444" : "#94A3B8"} />
        <Kpi icon={Award} label="Badges" value={s.badges_earned} sub="Earned so far" c="#A855F7" />
      </div>

      {/* Two-up: pending tasks + suggestions */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// next up</div>
              <h2 className="font-display mt-1 text-xl font-semibold">Pending tasks · how to proceed</h2>
            </div>
            <Link to="/intern/tasks" className="text-sm text-[#F97316] hover:underline">All tasks →</Link>
          </div>
          <div className="space-y-3">
            {data.pending_tasks.length === 0 ? (
              <div className="rounded-xl bg-orange-50/40 p-4 text-sm text-slate-500">
                🎉 No pending tasks — ask your manager for the next assignment!
              </div>
            ) : data.pending_tasks.slice(0, 5).map((t) => {
              const isOverdue = t.deadline && t.deadline.slice(0, 10) < new Date().toISOString().slice(0, 10);
              return (
                <div key={t.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-[#0F172A]">{t.title}</div>
                      {t.project_name && <div className="mt-0.5 text-xs text-slate-500">📂 {t.project_name}</div>}
                      {t.description && <div className="mt-2 text-xs text-slate-600">{t.description}</div>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${isOverdue ? "bg-red-100 text-red-600" : "bg-orange-100 text-[#F97316]"}`}>
                      {isOverdue ? "OVERDUE" : t.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Deadline: {t.deadline?.slice(0, 10) || "—"}</span>
                    <span>Priority: {t.priority}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-purple-50 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Lightbulb size={18} className="text-[#F97316]" />
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// coaching</div>
          </div>
          <h2 className="font-display mt-1 text-xl font-semibold">Suggestions for this week</h2>
          <ul className="mt-4 space-y-2">
            {data.suggestions.map((s, i) => (
              <motion.li key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="flex items-start gap-2 text-sm text-slate-700">
                <span className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#F97316]" />
                {s}
              </motion.li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl bg-white/70 p-3 text-xs text-slate-500">
            💬 <span className="font-semibold">{s.messages_sent}</span> chat messages so far · {s.messages_sent >= 20 ? "✅ Communicator badge unlocked" : `${20 - s.messages_sent} away from Communicator badge`}
          </div>
        </div>
      </div>

      {/* Badge gallery preview */}
      <div className="rounded-2xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// achievements</div>
            <h2 className="font-display mt-1 text-xl font-semibold">My badges</h2>
          </div>
          <Link to="/intern/badges" className="text-sm text-[#F97316] hover:underline">View all →</Link>
        </div>
        {data.badges.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-400">
            No badges yet — finish a task before its deadline to earn your first ⭐
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
            {data.badges.slice(-6).reverse().map((b, i) => (
              <motion.div key={b.id || `${b.name}-${i}`}
                initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 120 }}
                data-testid={`dashboard-badge-${b.slug || b.name?.replace(/\s+/g, '-').toLowerCase()}`}
                className="flex flex-col items-center rounded-2xl border-2 p-4 pb-7 text-center"
                style={{ borderColor: b.color, background: `${b.color}08` }}>
                <Badge3D icon={b.icon || "trophy"} color={b.color || "#F97316"} size={90} />
                <div className="mt-7 text-[11px] font-bold leading-tight" style={{ color: b.color }}>{b.name}</div>
                <div className="mt-0.5 text-[9px] uppercase tracking-[0.15em] text-slate-400">{(b.earned_at || "").slice(0, 10)}</div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, c }) {
  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="rounded-xl p-2.5" style={{ background: `${c}15`, color: c }}>
          <Icon size={18} />
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400">live</div>
      </div>
      <div className="mt-5 font-display text-3xl font-semibold" style={{ color: c }}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

function nextFriday() {
  const d = new Date();
  const day = d.getDay();
  const diff = (5 - day + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
}

function fmtMin(m) {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return h ? `${h}h ${mm}m` : `${mm}m`;
}
