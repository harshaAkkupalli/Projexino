import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import {
  Activity, Users, Clock, LogIn, Coffee, Circle, BarChart3, CalendarDays, RefreshCw,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Cell } from "recharts";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STATUS_DOT = { online: "#22c55e", on_break: "#f59e0b", offline: "#94a3b8" };
const STATUS_LABEL = { online: "Online", on_break: "On Break", offline: "Offline" };

function PresenceHero3D() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 4, 5]} intensity={0.9} />
        <Float speed={1.4} rotationIntensity={1.1} floatIntensity={1.6}>
          <mesh position={[-2.5, 0.4, 0]}>
            <torusGeometry args={[0.9, 0.28, 16, 80]} />
            <meshStandardMaterial color="#F97316" metalness={0.4} roughness={0.25} />
          </mesh>
        </Float>
        <Float speed={1.1} rotationIntensity={1.2} floatIntensity={1.4}>
          <mesh position={[2.2, -0.3, -1]}>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color="#A855F7" metalness={0.5} roughness={0.18} />
          </mesh>
        </Float>
        <Float speed={1.6} rotationIntensity={1.4} floatIntensity={1.8}>
          <mesh position={[0.4, -1.2, -0.5]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color="#22c55e" metalness={0.3} roughness={0.3} />
          </mesh>
        </Float>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.6} />
      </Canvas>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, testid }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid={testid}
      className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-full opacity-10" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{label}</div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}>
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-3 text-3xl font-bold text-[#0F2042]">{value}</div>
    </motion.div>
  );
}

function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return `${Math.max(1, Math.floor(diff))}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleString();
}

export default function Presence() {
  const { user } = useAuth();
  const [tab, setTab] = useState("live");
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [daily, setDaily] = useState([]);
  const [hours, setHours] = useState([]);
  const [period, setPeriod] = useState("day"); // day | month for summary
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [s, p, e, sum, h] = await Promise.all([
          api.get("/admin/presence/stats"),
          api.get("/admin/presence"),
          api.get("/admin/auth-events?limit=200"),
          api.get(`/admin/auth-events/summary?period=${period}`),
          api.get(`/admin/presence/hours?period=month&days=30`),
        ]);
        if (!mounted) return;
        setStats(s.data);
        setRows(p.data || []);
        setEvents(e.data || []);
        setDaily((sum.data || []).slice().reverse());
        setHours(h.data || []);
      } catch {}
    };
    load();
    const id = setInterval(load, 20000);
    return () => { mounted = false; clearInterval(id); };
  }, [period, refreshKey]);

  if (user && !(["admin","super_admin"].includes(user.role)) && user.role !== "manager" && user.role !== "hr") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800">
        Presence tracking is restricted to Admin / Manager / HR.
      </div>
    );
  }

  const onlineCount = stats?.online_now || 0;
  const totalUsers = stats?.total_users || 0;
  const breakCount = stats?.by_status?.on_break || 0;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#FFF7ED] via-white to-[#FCE7F3] p-7">
        <PresenceHero3D />
        <div className="relative z-10 flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#F97316]">Live workforce</div>
            <h1 className="mt-1 text-3xl font-bold text-[#0F2042]">Presence Tracking</h1>
            <p className="mt-1 max-w-xl text-sm text-slate-600">
              Real-time map of every employee — who's online, who's on break, when they signed in,
              and total working hours per month.
            </p>
          </div>
          <button
            data-testid="presence-refresh"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-xs font-semibold text-[#0F2042] backdrop-blur hover:border-[#F97316] hover:text-[#F97316]"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard icon={Users}     label="Total Users"  value={totalUsers}  accent="#0F2042" testid="presence-kpi-users" />
        <StatCard icon={Activity}  label="Online Now"   value={onlineCount} accent="#22c55e" testid="presence-kpi-online" />
        <StatCard icon={Coffee}    label="On Break"     value={breakCount}  accent="#f59e0b" testid="presence-kpi-break" />
        <StatCard icon={LogIn}     label="Logins Today" value={stats?.logins_today ?? "—"} accent="#A855F7" testid="presence-kpi-logins" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {[
          { key: "live", label: "Live Status", icon: Circle },
          { key: "events", label: "Login Log", icon: LogIn },
          { key: "daily", label: "Daily Summary", icon: CalendarDays },
          { key: "hours", label: "Monthly Hours", icon: Clock },
        ].map((t) => {
          const I = t.icon;
          return (
            <button
              key={t.key}
              data-testid={`presence-tab-${t.key}`}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition ${
                tab === t.key ? "border-[#F97316] text-[#0F2042]" : "border-transparent text-slate-500 hover:text-[#0F2042]"
              }`}
            >
              <I size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "live" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <div className="col-span-4">User</div>
            <div className="col-span-2">Role</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Last seen</div>
            <div className="col-span-2">Session</div>
          </div>
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No users tracked yet.</div>
          ) : rows.map((r) => (
            <div key={r.id} data-testid={`presence-row-${r.id}`} className="grid grid-cols-12 items-center border-b border-slate-50 px-4 py-3 text-sm">
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0F2042] text-xs font-bold text-white">
                  {r.name?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-[#0F172A]">{r.name}</div>
                  <div className="truncate text-[11px] text-slate-500">{r.email}</div>
                </div>
              </div>
              <div className="col-span-2 text-[11px] uppercase tracking-wider text-slate-500">{r.role}</div>
              <div className="col-span-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{ backgroundColor: `${STATUS_DOT[r.online ? r.status : "offline"] || STATUS_DOT.offline}22`, color: STATUS_DOT[r.online ? r.status : "offline"] || STATUS_DOT.offline }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[r.online ? r.status : "offline"] || STATUS_DOT.offline }} />
                  {r.online ? (STATUS_LABEL[r.status] || "Online") : "Offline"}
                </span>
              </div>
              <div className="col-span-2 text-[12px] text-slate-500">{relTime(r.last_seen)}</div>
              <div className="col-span-2 text-[12px] text-slate-500">{r.session_started ? new Date(r.session_started).toLocaleTimeString() : "—"}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "events" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <div className="col-span-3">User</div>
            <div className="col-span-2">Event</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-3">When</div>
            <div className="col-span-2">Role</div>
          </div>
          {events.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No events yet. Sign in & out to populate the log.</div>
          ) : events.map((e) => (
            <div key={e.id} className="grid grid-cols-12 items-center border-b border-slate-50 px-4 py-2.5 text-sm">
              <div className="col-span-3 min-w-0">
                <div className="truncate font-semibold text-[#0F172A]">{e.name || "—"}</div>
                <div className="truncate text-[11px] text-slate-500">{e.email}</div>
              </div>
              <div className="col-span-2">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  e.kind === "login" ? "bg-emerald-100 text-emerald-700" :
                  e.kind === "logout" ? "bg-rose-100 text-rose-700" :
                  "bg-amber-100 text-amber-700"
                }`}>{e.kind}</span>
              </div>
              <div className="col-span-2 text-[11px] text-slate-500">{e.status || "—"}</div>
              <div className="col-span-3 text-[12px] text-slate-500">{new Date(e.at).toLocaleString()}</div>
              <div className="col-span-2 text-[11px] uppercase tracking-wider text-slate-500">{e.role}</div>
            </div>
          ))}
        </div>
      )}

      {tab === "daily" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {["day", "month"].map((p) => (
              <button key={p}
                data-testid={`presence-period-${p}`}
                onClick={() => setPeriod(p)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium capitalize transition ${
                  period === p ? "border-[#F97316] bg-[#F97316] text-white" : "border-slate-200 text-slate-600 hover:border-[#F97316]"
                }`}>{p === "day" ? "Daily" : "Monthly"}</button>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-bold text-[#0F2042]">Activity over time</h3>
            {daily.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-400">No data yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F97316" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0F2042" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#0F2042" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="logins" stroke="#F97316" fill="url(#g1)" name="Logins" />
                  <Area type="monotone" dataKey="logouts" stroke="#0F2042" fill="url(#g2)" name="Logouts" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {tab === "hours" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-[#0F2042]">Hours worked — last 30 days</h3>
          {hours.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">No work sessions logged yet.</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hours.slice(0, 12)} margin={{ top: 4, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total_hours" name="Hours" radius={[6, 6, 0, 0]}>
                    {hours.slice(0, 12).map((_, i) => <Cell key={i} fill={["#F97316", "#A855F7", "#0F2042", "#22c55e", "#0EA5E9"][i % 5]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
                <div className="grid grid-cols-12 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  <div className="col-span-4">User</div>
                  <div className="col-span-2">Role</div>
                  <div className="col-span-2">Days active</div>
                  <div className="col-span-2">Sessions</div>
                  <div className="col-span-2">Hours</div>
                </div>
                {hours.map((h) => (
                  <div key={h.user_id} data-testid={`hours-row-${h.user_id}`} className="grid grid-cols-12 border-b border-slate-50 px-3 py-2 text-sm">
                    <div className="col-span-4 min-w-0">
                      <div className="truncate font-semibold text-[#0F172A]">{h.name}</div>
                      <div className="truncate text-[11px] text-slate-500">{h.email}</div>
                    </div>
                    <div className="col-span-2 text-[11px] uppercase tracking-wider text-slate-500">{h.role}</div>
                    <div className="col-span-2 text-sm text-slate-600">{h.days_active}</div>
                    <div className="col-span-2 text-sm text-slate-600">{h.sessions}</div>
                    <div className="col-span-2 text-sm font-bold text-[#F97316]">{h.total_hours}h</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
