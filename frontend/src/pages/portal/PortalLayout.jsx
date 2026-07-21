import { Outlet, NavLink, useNavigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, ListChecks, UserSquare2, LogOut, Menu, X, Bell, Search, FolderKanban, FileText, MessagesSquare, Sparkles, GraduationCap, BarChart3, Award, AlertTriangle, Settings, Wallet, Megaphone, Activity, Globe2 } from "lucide-react";
import usePermissions from "@/hooks/usePermissions";
import { useEffect, useRef, useState } from "react";
import { useNavigate as _useNav } from "react-router-dom";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import useHeartbeat from "@/hooks/useHeartbeat";
import { playRingtone } from "@/lib/ringtone";
import PresenceWidget from "@/components/PresenceWidget";

const NAV_ITEMS = [
  { slug: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { slug: "interns", label: "Intern Hub", icon: GraduationCap },
  { slug: "badges", label: "Badges", icon: Award, roles: ["admin","super_admin","manager","hr"] },
  { slug: "projects", label: "Projects", icon: FolderKanban },
  { slug: "finance", label: "Finance", icon: Wallet, roles: ["admin","super_admin","manager","hr"] },
  { slug: "tasks", label: "Tasks", icon: ListChecks },
  { slug: "issues", label: "Issues & Errors", icon: AlertTriangle },
  { slug: "leads", label: "Leads", icon: Users },
  { slug: "team", label: "Team", icon: UserSquare2 },
  { slug: "interns", label: "Intern Hub", icon: GraduationCap },
  { slug: "documents", label: "Documents", icon: FileText },
  { slug: "chat", label: "Chat", icon: MessagesSquare },
  { slug: "ai", label: "Xino AI", icon: Sparkles },
  { slug: "email-campaigns", label: "Mass Email", icon: Megaphone, roles: ["admin","super_admin","manager","hr"] },
  { slug: "presence", label: "Presence", icon: Activity, roles: ["admin","super_admin","manager","hr"] },
  { slug: "settings", label: "Settings", icon: Settings, roles: ["admin"] },
  { slug: "website-config", label: "Website Config", icon: Globe2, roles: ["super_admin"] },
  { slug: "blog", label: "Blog", icon: FileText, roles: ["super_admin","admin","manager"] },
  { slug: "linkedin", label: "LinkedIn", icon: Megaphone, roles: ["super_admin","admin","manager"] },
];

export default function PortalLayout() {
  useHeartbeat();
  const { user, logout } = useAuth();
  const location = useLocation();
  const perms = usePermissions();
  const base = location.pathname.startsWith("/m") ? "/m" : "/app";
  const nav = NAV_ITEMS
    .filter((n) => {
      if (!perms.loaded) return false;
      if (perms.is_super_admin) return true;
      const live = perms.can(n.slug, "view");
      if (live === true) return true;
      if (live === false) return false;
      return !n.roles || (user && n.roles.includes(user.role));
    })
    .map((n) => ({ ...n, to: `${base}/${n.slug}` }));
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifSettings, setNotifSettings] = useState(null);
  const lastIdsRef = useRef(new Set());
  const seededRef = useRef(false);
  const navigate = useNavigate();

  // Fetch global notification settings once (refresh every 60s so admin changes propagate)
  useEffect(() => {
    let mounted = true;
    const fetchSettings = async () => {
      try {
        const { data } = await api.get("/notification-settings");
        if (mounted) setNotifSettings(data);
      } catch {}
    };
    fetchSettings();
    const id = setInterval(fetchSettings, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!mounted) return;
        // Detect newly-arrived unread notifications and play ringtone(s)
        const seen = lastIdsRef.current;
        const fresh = data.filter((n) => !n.read && !seen.has(n.id));
        // First run: don't ring for pre-existing items, just seed.
        if (seededRef.current && fresh.length && notifSettings?.sound_enabled !== false) {
          // Play the ringtone of the most-recent fresh one
          const top = fresh[0];
          const tone =
            top.ringtone ||
            (notifSettings?.ringtones || {})[top.kind] ||
            notifSettings?.default_ringtone ||
            "chime";
          playRingtone(tone, notifSettings?.volume ?? 0.6);
          if (notifSettings?.desktop_popup !== false && typeof Notification !== "undefined") {
            if (Notification.permission === "granted") {
              try { new Notification(top.title, { body: top.message || "" }); } catch {}
            }
          }
        }
        data.forEach((n) => seen.add(n.id));
        seededRef.current = true;
        setNotifs(data);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { mounted = false; clearInterval(id); };
  }, [notifSettings]);

  // Ask for desktop notification permission once (silent if denied)
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { Notification.requestPermission().catch(() => {}); } catch {}
    }
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    setNotifs((p) => p.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="portal-scope flex min-h-screen bg-[#F8FAFC] text-[#0F172A]">
      {/* Mobile backdrop when sidebar open */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
          aria-label="Close menu"
        />
      )}
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform md:relative md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <Logo size={28} mode="light" />
          <button className="lg:hidden" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
        <nav className="space-y-1 p-3">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              data-testid={`portal-nav-${n.label.toLowerCase()}`}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              <n.icon size={18} className="side-icon" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0F2042] text-sm font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || "P"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.name}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate("/");
            }}
            data-testid="portal-logout-btn"
            className="side-link w-full hover:bg-orange-50 hover:text-[#F97316]"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="portal-menu-toggle">
              <Menu size={20} />
            </button>
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-3">
            <PresenceWidget />
            <Link to="/" className="hidden text-sm text-slate-500 hover:text-[#0F2042] sm:inline">← Marketing site</Link>
            <div className="relative">
              <button
                data-testid="portal-notif-btn"
                onClick={() => setNotifsOpen((v) => !v)}
                className="relative rounded-full border border-slate-200 p-2 hover:border-[#F97316] hover:text-[#F97316]"
              >
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
              {notifsOpen && (
                <div className="fixed left-1/2 top-16 z-50 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-80 sm:translate-x-0">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                    <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#F97316]">Notifications</div>
                    <button onClick={markAllRead} className="text-[10px] text-slate-500 hover:text-[#0F2042]">Mark all read</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">No notifications yet.</div>
                    ) : notifs.slice(0, 30).map((n) => (
                      <Link
                        key={n.id}
                        to={n.link || "#"}
                        onClick={() => setNotifsOpen(false)}
                        className={`block border-b border-slate-100 px-4 py-3 text-xs hover:bg-slate-50 ${n.read ? "opacity-60" : ""}`}
                      >
                        <div className="font-semibold text-[#0F172A]">{n.title}</div>
                        <div className="mt-0.5 text-slate-500">{n.message}</div>
                        <div className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6 lg:p-8">
          <RouteGuard perms={perms} nav={nav}><Outlet /></RouteGuard>
        </main>
        <div data-testid="portal-footer" className="border-t border-slate-200 bg-white px-6 py-3 text-center text-[11px] text-slate-500">
          Developed by Projexino Solutions Pvt Ltd · © 2026 Projexino. All rights reserved.
        </div>
      </div>
    </div>
  );
}


const GROUP_LABEL = {
  projects: "Projects", leads: "Leads", tasks: "Tasks", issues: "Issues",
  team: "Team", interns: "Interns", documents: "Documents",
  channels: "Channels", users: "People", finance: "Finance", invoices: "Invoices",
};

/**
 * RouteGuard — read the live RBAC matrix and block navigation to modules
 * the current user has no `view` permission for. Allows nested routes
 * (e.g. `/app/tasks/:id`) by matching only the top-level slug.
 * Always allows `/app` (the Launchpad) and `/app/profile`.
 */
function RouteGuard({ perms, nav, children }) {
  const loc = useLocation();
  if (!perms.loaded) return null;        // wait for matrix
  if (perms.is_super_admin) return children;
  const seg = loc.pathname.split("/").filter(Boolean); // ["app", "tasks", ...]
  if (seg.length < 2) return children;
  const slug = seg[1];
  if (slug === "profile") return children;
  const live = perms.can(slug, "view");
  if (live === true) return children;
  if (live === false) {
    return (
      <div data-testid="route-guard-blocked" className="mx-auto max-w-md rounded-2xl border border-orange-200 bg-orange-50 p-6 text-center shadow-sm">
        <div className="text-3xl">🔒</div>
        <h2 className="font-display mt-2 text-xl font-semibold text-[#0F2042]">Access restricted</h2>
        <p className="mt-2 text-sm text-slate-600">
          The super admin hasn't granted your role permission to view <b>{slug}</b>.
          Ask them to enable it in <b>Access Control</b>.
        </p>
      </div>
    );
  }
  return children; // unknown slug → allow (back-compat)
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ results: {}, total: 0 });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const tRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = _useNav();

  useEffect(() => {
    clearTimeout(tRef.current);
    if (!q.trim()) { setData({ results: {}, total: 0 }); return; }
    setLoading(true);
    tRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/search?q=${encodeURIComponent(q.trim())}&limit=6`);
        setData(data);
      } catch {}
      setLoading(false);
    }, 220);
    return () => clearTimeout(tRef.current);
  }, [q]);

  // Ctrl/Cmd+K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="relative block">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        data-testid="portal-search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Search…"
        className="w-36 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316] sm:w-56 lg:w-80"
      />
      {open && q.trim() && (
        <div data-testid="global-search-results" className="fixed left-1/2 top-16 z-50 max-h-[70vh] w-[min(480px,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl lg:absolute lg:left-0 lg:top-12 lg:translate-x-0">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-400">Searching…</div>
          ) : data.total === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400">No results for "{q}"</div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                {data.total} result{data.total !== 1 ? "s" : ""}
              </div>
              {Object.entries(data.results).map(([group, items]) => (
                <div key={group}>
                  <div className="bg-slate-50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                    {GROUP_LABEL[group] || group}
                  </div>
                  {items.map((it) => (
                    <button
                      key={`${group}-${it.id}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { navigate(it.link); setOpen(false); setQ(""); }}
                      data-testid={`search-result-${group}-${it.id}`}
                      className="block w-full border-b border-slate-50 px-4 py-2.5 text-left text-xs hover:bg-orange-50"
                    >
                      <div className="truncate font-semibold text-[#0F2042]">{it.title}</div>
                      {it.subtitle && <div className="truncate text-[11px] text-slate-500">{it.subtitle}</div>}
                      {Object.keys(it.meta || {}).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(it.meta).slice(0, 3).map(([k, v]) => (
                            <span key={k} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-600">
                              {k}: {String(v).slice(0, 24)}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
