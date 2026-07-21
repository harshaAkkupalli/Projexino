import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, Shield, GraduationCap, Sliders, Search, Crown, Mail, MessageSquare,
  Award, Activity,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { AdminsTab, MatrixTab } from "@/pages/portal/AccessControl";
import { InternsBoard } from "@/pages/portal/Interns";
import Badges from "@/pages/portal/Badges";
import Presence from "@/pages/portal/Presence";

/**
 * UNIFIED PEOPLE PAGE — merges legacy Team + Access Control + Intern Hub.
 *
 * Tabs:
 *   • all    — every team account (uses the strict 7-role AdminsTab from Access Control)
 *   • interns — intern-specific actions (certificates, tasks drawer, badges)
 *   • matrix  — Permission Matrix (super-admin only)
 *
 * The legacy Team free-text role list (Engineer/Designer/etc.) is intentionally
 * dropped — roles are now the strict 7: Admin · HR · Manager · Developer · QA ·
 * Cloud Admin · Intern. Super Admin is seeded-only.
 */

const ROLE_LABELS = {
  super_admin: "Super Admin",
  admin: "Admin",
  manager: "Manager",
  hr: "HR",
  developer: "Developer",
  qa: "QA",
  cloud_admin: "Cloud Admin",
  intern: "Intern",
  team_member: "Team Member (legacy)",
};

const ROLE_COLORS = {
  super_admin: "bg-amber-100 text-amber-700",
  admin: "bg-violet-100 text-violet-700",
  manager: "bg-indigo-100 text-indigo-700",
  hr: "bg-pink-100 text-pink-700",
  developer: "bg-sky-100 text-sky-700",
  qa: "bg-emerald-100 text-emerald-700",
  cloud_admin: "bg-slate-200 text-slate-700",
  intern: "bg-orange-100 text-orange-700",
  team_member: "bg-amber-50 text-amber-800",
};

export default function Team() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isSuper = user?.role === "super_admin";
  const isPriv = ["super_admin", "admin", "hr", "manager"].includes(user?.role);

  // Tab from ?tab=… (defaults to "all"; matrix tab is gated to super_admin)
  const initialTab = (() => {
    const t = new URLSearchParams(location.search).get("tab");
    if (t === "matrix" && !isSuper) return "all";
    return t || "all";
  })();
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    const t = new URLSearchParams(location.search).get("tab") || "all";
    if (t !== tab) setTab(t === "matrix" && !isSuper ? "all" : t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const setTabAndUrl = (next) => {
    setTab(next);
    const sp = new URLSearchParams(location.search);
    if (next === "all") sp.delete("tab"); else sp.set("tab", next);
    navigate({ pathname: location.pathname, search: sp.toString() ? `?${sp.toString()}` : "" }, { replace: true });
  };

  const TABS = [
    { v: "all",     label: "All Team",          icon: Users },
    { v: "interns", label: "Interns",           icon: GraduationCap, gated: isPriv },
    { v: "badges",  label: "Badges",            icon: Award,         gated: isPriv },
    { v: "presence",label: "Presence",          icon: Activity,      gated: isPriv },
    { v: "matrix",  label: "Permission Matrix", icon: Sliders,       gated: isSuper },
  ].filter((t) => t.gated !== false);

  return (
    <div data-testid="page-team" className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-indigo-50/40 to-orange-50/40 p-6 md:p-7 shadow-sm">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(50% 50% at 80% 20%, rgba(30,58,138,0.18), transparent 60%), radial-gradient(50% 50% at 10% 90%, rgba(249,115,22,0.2), transparent 60%)",
          }}
        />
        <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// people · unified</div>
            <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">
              Team, Interns &amp; Permissions
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              One place to manage every account. Strict 7-role RBAC: <b>Admin · HR · Manager · Developer · QA · Cloud Admin · Intern</b>.
              Super Admin is seeded and never selectable from the role dropdown.
            </p>
          </div>
          <PeopleQuickStats />
        </div>

        <div className="relative mt-5 inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button
              key={t.v}
              data-testid={`team-tab-${t.v}`}
              onClick={() => setTabAndUrl(t.v)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                tab === t.v ? "bg-[#0F2042] text-white shadow" : "text-slate-500 hover:text-[#0F2042]"
              }`}
            >
              <t.icon size={12} /> {t.label}
              {t.v === "matrix" && <Crown size={10} className="text-amber-400" />}
            </button>
          ))}
        </div>
      </div>

      {/* Tab body */}
      {tab === "all" && <AllTeamTab />}
      {tab === "interns" && (
        isPriv
          ? <InternsBoard heroVariant="compact" canCreate={false} />
          : <Forbidden message="Only admins, managers, and HR can view the intern board." />
      )}
      {tab === "badges" && (
        isPriv
          ? <Badges />
          : <Forbidden message="Only admins, managers, and HR can view team badges." />
      )}
      {tab === "presence" && (
        isPriv
          ? <Presence />
          : <Forbidden message="Only admins, managers, and HR can view presence data." />
      )}
      {tab === "matrix" && (
        isSuper
          ? <MatrixTab />
          : <Forbidden message="Only the Super Admin can edit the permission matrix." />
      )}
    </div>
  );
}

/** Quick KPIs in hero — counts active accounts by role. */
function PeopleQuickStats() {
  const [stats, setStats] = useState({ total: 0, by_role: {} });
  useEffect(() => {
    api.get("/rbac/admins")
      .then(({ data }) => {
        const by_role = {};
        (data || []).forEach((u) => { by_role[u.role] = (by_role[u.role] || 0) + 1; });
        setStats({ total: (data || []).length, by_role });
      })
      .catch(() => {});
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" data-testid="team-quick-stats">
      <Pill icon={Users} label={`${stats.total} accounts`} />
      {stats.by_role.intern ? <Pill icon={GraduationCap} label={`${stats.by_role.intern} interns`} /> : null}
      {(stats.by_role.developer || 0) + (stats.by_role.qa || 0) + (stats.by_role.cloud_admin || 0) > 0 && (
        <Pill icon={Shield} label={`${(stats.by_role.developer || 0) + (stats.by_role.qa || 0) + (stats.by_role.cloud_admin || 0)} engineers`} />
      )}
    </div>
  );
}

function Pill({ icon: Icon, label }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 font-bold text-[#0F2042] ring-1 ring-slate-200 backdrop-blur">
      <Icon size={11} /> {label}
    </span>
  );
}

function Forbidden({ message }) {
  return (
    <div data-testid="team-forbidden" className="rounded-2xl border border-rose-200 bg-rose-50 p-10 text-center">
      <Shield size={32} className="mx-auto mb-2 text-rose-500" />
      <div className="font-display text-lg font-semibold text-rose-700">Restricted</div>
      <div className="mt-1 text-sm text-rose-600">{message}</div>
    </div>
  );
}

/**
 * "All Team" tab — wraps the strict 7-role AdminsTab from Access Control + adds
 * a search bar and role filter chips. This is what the user means by
 * "Team page updated as per the roles".
 */
function AllTeamTab() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  // The AdminsTab from AccessControl already loads /rbac/admins and renders cards.
  // It does its own gating, so wrap it.
  if (!isSuper) {
    return (
      <div className="space-y-4">
        <TeamDirectoryReadOnly />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 text-xs text-indigo-700">
        <b>Super Admin:</b> create accounts, set reporting managers, toggle CC, and promote primary. All actions audited.
      </div>
      <AdminsTab canCreate={false} />
    </div>
  );
}

/**
 * Read-only directory for non-super-admins so they can still SEE the team list
 * (browse, search, email) but cannot create/edit/delete accounts.
 */
function TeamDirectoryReadOnly() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.get("/rbac/admins")
      .then(({ data }) => setList(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list
      .filter((u) => role === "all" || u.role === role)
      .filter((u) => !s
        || (u.name || "").toLowerCase().includes(s)
        || (u.email || "").toLowerCase().includes(s)
        || (u.designation || "").toLowerCase().includes(s));
  }, [list, q, role]);

  const roles = useMemo(() => Array.from(new Set(list.map((u) => u.role))), [list]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="team-search-readonly"
            placeholder="Search name, email, designation…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]"
          />
        </div>
        <select
          data-testid="team-role-filter"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
        >
          <option value="all">All roles</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-500">
          No matches.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((u) => (
            <motion.div
              key={u.id}
              layout
              data-testid={`team-ro-card-${u.email}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#0F2042] to-[#7C3AED] text-base font-bold text-white">
                  {(u.name || u.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[#0F2042]">{u.name || u.email}</div>
                  <div className="truncate text-xs text-slate-500">{u.designation || ROLE_LABELS[u.role] || u.role}</div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                <span className={`rounded-full px-2 py-0.5 ${ROLE_COLORS[u.role] || "bg-slate-100 text-slate-600"}`}>
                  {ROLE_LABELS[u.role] || u.role}
                </span>
                {u.reporting_manager_name && (
                  <span className="text-slate-400">reports to {u.reporting_manager_name}</span>
                )}
              </div>
              <div className="mt-3 flex gap-1 border-t border-slate-100 pt-3">
                <a
                  href={`mailto:${u.email}`}
                  data-testid={`team-ro-email-${u.email}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-2 py-1 text-[11px] font-bold text-[#F97316] hover:bg-orange-100"
                >
                  <Mail size={11} /> Email
                </a>
                <Link
                  to={`/app/chat?dm=${encodeURIComponent(u.email)}`}
                  data-testid={`team-ro-chat-${u.email}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100"
                >
                  <MessageSquare size={11} /> Chat
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
