import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users, ListChecks, Trophy, TrendingUp, ArrowRight, Settings, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import PortalInfographic from "@/components/PortalInfographic";
import { useAuth } from "@/context/AuthContext";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [projectAnalytics, setProjectAnalytics] = useState(null);
  const [hours, setHours] = useState([]);
  const [tasksAll, setTasksAll] = useState([]);
  const [settings, setSettings] = useState(null);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [approvalsQueue, setApprovalsQueue] = useState([]);

  const load = async () => {
    try {
      const [s, a, p, h, t, b, q] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/leads/analytics/summary"),
        api.get("/projects/analytics/summary").catch(() => ({ data: null })),
        api.get("/me/hours").catch(() => ({ data: [] })),
        api.get("/tasks").catch(() => ({ data: [] })),
        api.get("/booking/upcoming").catch(() => ({ data: [] })),
        api.get("/tasks/approvals/queue").catch(() => ({ data: [] })),
      ]);
      setStats(s.data);
      setAnalytics(a.data);
      setProjectAnalytics(p.data);
      setHours(h.data || []);
      setTasksAll(t.data || []);
      setUpcomingMeetings(b.data || []);
      setApprovalsQueue(q.data || []);
    } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (["admin","super_admin"].includes(user?.role)) {
      api.get("/settings").then(({ data }) => setSettings(data)).catch(() => {});
    }
  }, [user?.role]);

  const toggleDemoCreds = async () => {
    if (!settings) return;
    const next = !settings.show_demo_creds;
    try {
      const { data } = await api.patch("/settings", { show_demo_creds: next });
      setSettings(data);
      toast.success(next ? "Demo credentials will be visible on /login" : "Demo credentials hidden on /login");
    } catch {
      toast.error("Failed to update setting");
    }
  };

  const cards = [
    { icon: Users, label: "Total Leads", value: stats?.leads_total ?? "—", color: "#1E3A8A", link: "/app/leads" },
    { icon: Trophy, label: "Won Deals", value: stats?.leads_won ?? "—", color: "#F97316", link: "/app/leads" },
    { icon: ListChecks, label: "Open Tasks", value: stats?.open_tasks ?? "—", color: "#10B981", link: "/app/tasks" },
    { icon: TrendingUp, label: "Conversion", value: `${analytics?.conversion_rate ?? 0}%`, color: "#A855F7", link: "/app/leads" },
    { icon: Users, label: "Team Members", value: stats?.team_total ?? "—", color: "#6366F1", link: "/app/team" },
    { icon: Trophy, label: "Active Now", value: stats?.team_active ?? "—", color: "#10B981", link: "/app/team" },
  ];

  const statusOrder = ["new", "contacted", "qualified", "won", "lost"];

  return (
    <div data-testid="portal-dashboard" className="space-y-5">
      {/* Large-title header in iOS native style */}
      <div className="px-1 pt-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// dashboard</div>
        <h1 className="font-display mt-1 text-3xl font-semibold leading-tight text-[#0F2042]">
          Good day,
          <span className="block text-[#F97316]">{(user?.name || "Operator").split(" ")[0]}.</span>
        </h1>
      </div>

      {/* Stat list — iOS settings-style grouped rows */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Live numbers
        </div>
        {cards.map((c, i) => (
          <Link
            key={c.label}
            to={c.link}
            data-testid={`stat-card-${c.label.toLowerCase().replace(/\s+/g, "-")}`}
            className="flex items-center gap-3 border-b border-slate-50 px-4 py-3.5 transition active:bg-orange-50 last:border-b-0"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: `${c.color}15`, color: c.color }}>
              <c.icon size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[#0F172A]">{c.label}</div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Live</div>
            </div>
            <div className="text-lg font-bold text-[#0F2042]">{c.value}</div>
            <ArrowRight size={14} className="text-slate-300" />
          </Link>
        ))}
      </div>

      <LiveGraphs analytics={analytics} projectAnalytics={projectAnalytics} hours={hours} tasksAll={tasksAll} statusOrder={statusOrder} />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// funnel</div>
              <h2 className="font-display mt-1 text-xl font-semibold">Lead Pipeline</h2>
            </div>
            <Link to="/app/leads" className="text-sm text-[#F97316] hover:underline">
              Open board →
            </Link>
          </div>
          <div className="space-y-3">
            {statusOrder.map((s) => {
              const n = analytics?.by_status?.[s] ?? 0;
              const total = analytics?.total || 1;
              const pct = Math.round((n / total) * 100);
              return (
                <div key={s}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="capitalize text-slate-700">{s}</span>
                    <span className="font-mono-pj text-slate-500">{n} ({pct}%)</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full rounded-full"
                      style={{
                        background: s === "won" ? "#10B981" : s === "lost" ? "#EF4444" : "#F97316",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// value</div>
          <h2 className="font-display mt-1 text-xl font-semibold">Pipeline value</h2>
          <div className="mt-6 font-display text-4xl font-semibold text-[#0F2042]">
            ${(analytics?.pipeline_value ?? 0).toLocaleString()}
          </div>
          <div className="mt-1 text-sm text-slate-500">Closed: ${(analytics?.won_value ?? 0).toLocaleString()}</div>

          <div className="mt-6 space-y-3">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Top sources</div>
            {Object.entries(analytics?.by_source ?? {}).slice(0, 4).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="capitalize text-slate-700">{k}</span>
                <span className="font-mono-pj text-slate-500">{v}</span>
              </div>
            ))}
            {Object.keys(analytics?.by_source ?? {}).length === 0 && (
              <div className="text-sm text-slate-400">No leads yet — add one →</div>
            )}
          </div>
          <Link to="/app/leads" className="btn-primary mt-6 w-full justify-center text-sm">
            Add lead <ArrowRight size={16} />
          </Link>
        </div>
      </div>

      {["admin","super_admin"].includes(user?.role) && settings && (
        <motion.div
          data-testid="admin-settings-panel"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <div className="rounded-lg bg-[#F97316]/15 p-2 text-[#F97316]"><Settings size={16} /></div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// admin · workspace settings</div>
              <h3 className="font-display text-lg font-semibold">Workspace controls</h3>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div>
              <div className="text-sm font-semibold text-[#0F172A]">Show demo credentials on login</div>
              <div className="mt-0.5 text-xs text-slate-500">When OFF, the orange "Demo creds" box on `/login` is hidden — useful before showing the app to real users.</div>
            </div>
            <button
              data-testid="toggle-demo-creds"
              onClick={toggleDemoCreds}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition ${
                settings.show_demo_creds
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                  : "bg-slate-200 text-slate-600 hover:bg-slate-300"
              }`}
            >
              {settings.show_demo_creds ? <Eye size={14} /> : <EyeOff size={14} />}
              {settings.show_demo_creds ? "Visible" : "Hidden"}
            </button>
          </div>
        </motion.div>
      )}

      {/* Approvals Queue widget — shows tasks awaiting THIS user's manager sign-off */}
      {approvalsQueue.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          data-testid="dash-approvals-queue"
          className="rounded-3xl border border-orange-200 bg-gradient-to-br from-white via-orange-50/40 to-amber-50/40 p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// approvals queue</div>
              <h3 className="font-display text-xl font-semibold text-[#0F2042]">
                {approvalsQueue.length} task{approvalsQueue.length === 1 ? "" : "s"} awaiting your decision
              </h3>
              <p className="text-xs text-slate-500">Tap any row to approve, reject, or open the full task.</p>
            </div>
            <Link to="/app/tasks?status=review" className="text-xs font-bold text-[#F97316] hover:underline">View all →</Link>
          </div>
          <ul className="mt-4 space-y-2">
            {approvalsQueue.slice(0, 5).map((t) => (
              <li key={t.id} data-testid={`approval-row-${t.id}`}>
                <Link to={`/app/tasks/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-orange-100 bg-white px-3 py-2.5 transition hover:border-[#F97316] hover:shadow-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-[#0F2042]">{t.title}</div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                      {t.project_name || "—"} · {t.priority} · submitted {(t.submitted_for_review_at || "").slice(0, 10)}
                    </div>
                  </div>
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">REVIEW</span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Upcoming meetings card */}
      {upcomingMeetings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          data-testid="dash-upcoming-meetings"
          className="rounded-3xl border border-cyan-100 bg-gradient-to-br from-white via-cyan-50/40 to-sky-50/40 p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-cyan-700">// scheduling</div>
              <h3 className="font-display text-xl font-semibold text-[#0F2042]">Upcoming meetings</h3>
            </div>
            <Link to="/app/calendly" className="rounded-full bg-[#0F2042] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1E3A8A]">Manage →</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {upcomingMeetings.slice(0, 5).map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl bg-white p-3 ring-1 ring-cyan-100">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 font-bold">
                  {new Date(b.starts_at).getDate()}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-[#0F2042]">{b.page_title} · {b.guest_name}</div>
                  <div className="text-[10px] text-slate-500">{new Date(b.starts_at).toLocaleString()}</div>
                </div>
                {b.meet_link && <a href={b.meet_link} target="_blank" rel="noreferrer" className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Meet ↗</a>}
              </li>
            ))}
          </ul>
        </motion.div>
      )}
    </div>
  );
}

/* =================================================================
   LIVE GRAPHS — 4 Recharts panels, auto-refresh every 30s
================================================================= */
function LiveGraphs({ analytics, projectAnalytics, hours, tasksAll, statusOrder }) {
  const ORANGE = "#F97316"; const NAVY = "#0F2042"; const GREEN = "#10B981"; const PURPLE = "#A855F7"; const BLUE = "#3B82F6";

  // Lead pipeline area data
  const leadData = (statusOrder || ["new", "contacted", "qualified", "won", "lost"]).map((k) => ({
    name: k,
    value: analytics?.by_status?.[k] || 0,
  }));

  // Project donut data
  const PROJECT_COLOR = { planning: BLUE, in_progress: ORANGE, on_hold: "#94A3B8", completed: GREEN, cancelled: "#EF4444" };
  const projectData = Object.entries(projectAnalytics?.by_status || {}).map(([k, v]) => ({ name: k, value: v, color: PROJECT_COLOR[k] || NAVY }));

  // Tasks bar data
  const taskByStatus = ["todo", "in_progress", "review", "done"].map((s) => ({
    name: s,
    value: (tasksAll || []).filter((t) => t.status === s).length,
  }));
  const TASK_COLOR = { todo: "#94A3B8", in_progress: BLUE, review: ORANGE, done: GREEN };

  // Hours sparkline — last 14 days
  const today = new Date();
  const last14 = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(today); d.setDate(d.getDate() - (13 - i));
    const key = d.toISOString().slice(0, 10);
    const found = (hours || []).find((h) => h.date === key);
    return { date: key.slice(5), minutes: found ? found.minutes : 0 };
  });

  return (
    <div data-testid="live-graphs" className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Lead pipeline" subtitle="Live counts by status">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={leadData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="g-lead" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ORANGE} stopOpacity={0.5} />
                <stop offset="100%" stopColor={ORANGE} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke={ORANGE} strokeWidth={2} fill="url(#g-lead)" dot={{ r: 3, fill: ORANGE, stroke: ORANGE }} activeDot={{ r: 5, stroke: ORANGE, fill: "#fff" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Project status mix" subtitle={`${projectAnalytics?.total || 0} total projects`}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={projectData.length > 0 ? projectData : [{ name: "No projects yet", value: 1, color: "#E2E8F0" }]}
              dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} stroke="#fff" strokeWidth={2}
              isAnimationActive={projectData.length > 0}
            >
              {(projectData.length > 0 ? projectData : [{ name: "No projects yet", value: 1, color: "#E2E8F0" }]).map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            {projectData.length > 0 && <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />}
            <Legend iconType="circle" formatter={(v) => <span style={{ fontSize: 11, color: "#475569" }}>{v}</span>} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Tasks distribution" subtitle="Live by board column">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={taskByStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
              {taskByStatus.map((d) => <Cell key={d.name} fill={TASK_COLOR[d.name] || NAVY} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Your activity · last 14 days" subtitle="Minutes per day on the platform">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={last14} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="g-hours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURPLE} stopOpacity={0.55} />
                <stop offset="100%" stopColor={PURPLE} stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748B" }} allowDecimals={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 12 }} formatter={(v) => [`${v} min`, "Time logged"]} />
            <Area type="monotone" dataKey="minutes" stroke={PURPLE} strokeWidth={2} fill="url(#g-hours)" dot={{ r: 2.5, fill: PURPLE, stroke: PURPLE }} activeDot={{ r: 4, stroke: PURPLE, fill: "#fff" }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// chart</div>
        <h3 className="font-display mt-0.5 text-base font-semibold text-[#0F172A]">{title}</h3>
        {subtitle && <div className="mt-0.5 text-[11px] text-slate-500">{subtitle}</div>}
      </div>
      {children}
    </motion.div>
  );
}
