import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Search, LogOut, Home, ChevronLeft, X, Menu,
} from "lucide-react";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import useHeartbeat from "@/hooks/useHeartbeat";
import { playRingtone } from "@/lib/ringtone";
import PresenceWidget from "@/components/PresenceWidget";
import { initFcm, listenForeground } from "@/lib/fcm";
import useSmartPopups from "@/hooks/useSmartPopups";

// Map known nested routes → friendly title for the back-arrow header.
const TITLE_MAP = {
  dashboard: "Dashboard",
  projects: "Projects",
  tasks: "Tasks",
  leads: "Leads",
  team: "Team",
  interns: "Interns",
  documents: "Documents",
  chat: "Chat",
  ai: "Xino AI",
  "website-config": "Website Config",
  manager: "Intern Hub",
  badges: "Badges",
  issues: "Issues & Errors",
  settings: "Settings",
  finance: "Finance",
  presence: "Presence",
  "email-campaigns": "Mass Email",
  "email-templates": "Email Templates",
  "access-control": "Access Control",
  "notifications-permissions": "Notification Permissions",
  "doc-verification": "Document Verification",
  "ai-settings": "AI Settings",
  calendly: "Booking",
  hr: "HR Module",
  "hr-letters": "HR Letters",
  profile: "Profile",
};

export default function AppShell() {
  useHeartbeat();
  useSmartPopups();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isIntern = location.pathname.startsWith("/intern");
  const base = isIntern ? "/intern" : (location.pathname.startsWith("/m") ? "/m" : "/app");
  const tail = location.pathname.replace(/\/+$/, "").split("/").pop();
  const isHome = location.pathname === base || location.pathname === `${base}/` || tail === "" || tail === base.slice(1);
  const title = isHome ? "Home" : (TITLE_MAP[tail] || "Projexino");

  // Global notifications
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifSettings, setNotifSettings] = useState(null);
  const lastIdsRef = useRef(new Set());
  const seededRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
    initFcm().then(() => listenForeground()).catch(() => {});
    return () => { mounted = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (!mounted) return;
        const seen = lastIdsRef.current;
        const fresh = data.filter((n) => !n.read && !seen.has(n.id));
        if (seededRef.current && fresh.length && notifSettings?.sound_enabled !== false) {
          const top = fresh[0];
          const tone = top.ringtone || (notifSettings?.ringtones || {})[top.kind] || notifSettings?.default_ringtone || "chime";
          playRingtone(tone, notifSettings?.volume ?? 0.6);
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

  const unread = notifs.filter((n) => !n.read).length;
  const markAllRead = async () => {
    await api.post("/notifications/read-all");
    setNotifs((p) => p.map((n) => ({ ...n, read: true })));
  };

  const handleLogout = async () => { await logout(); navigate("/"); };

  // Cross-device freshness: when the tab regains visibility after >30s away,
  // remount the current page so it refetches data (skips if a modal is open).
  const [outletKey, setOutletKey] = useState(0);
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) { hiddenAt = Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away > 30000 && !document.querySelector('.fixed.inset-0, [role="dialog"]')) {
        setOutletKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div className="portal-scope min-h-screen app-shell-bg text-[#0F172A]">
      <motion.div
        className="app-shell-frame"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {/* === Main column === */}
        <div className="app-main">
          {/* Unified status bar — works at every viewport. Cards-only navigation. */}
          <div className="app-status-bar flex items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-2 min-w-0">
              {!isHome ? (
                <button
                  data-testid="app-back-btn"
                  onClick={() => navigate(base)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F2042] transition hover:border-[#F97316] hover:text-[#F97316]"
                >
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <Logo size={28} mode="light" asLink={false} />
              )}
              <div className="min-w-0">
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">
                  {isHome ? "Workspace" : "// section"}
                </div>
                <div className="truncate text-sm font-bold text-[#0F2042] md:text-base" data-testid="app-page-title">
                  {isHome ? `Hi, ${user?.name?.split(" ")[0] || "there"}` : title}
                </div>
              </div>
            </div>

            <DesktopHeaderMenu
              unread={unread}
              onSearch={() => setSearchOpen(true)}
              onNotifs={() => setNotifsOpen(true)}
              user={user}
              onLogout={handleLogout}
            />
          </div>

          {/* Page body — vertical scroll only; horizontal swipe navigation removed */}
          {isHome ? (
            <main key={outletKey} className="app-page-launchpad">
              <Outlet />
            </main>
          ) : (
            <main key={outletKey} className="app-page">
              <Outlet />
            </main>
          )}

          {/* Sibling-page chevron navigation — only on mobile inner pages (CSS hides on md+) */}
          {/* FAB → Home (visible on every viewport since launchpad is THE nav) */}
          {!isHome && (
            <button
              data-testid="app-fab-home"
              onClick={() => navigate(base)}
              className="app-fab"
              aria-label="Go to launchpad"
            >
              <Home size={22} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Notifications Sheet (bottom slide-up on mobile, top-right popover on desktop) */}
      <NotificationSheet
        open={notifsOpen}
        onClose={() => setNotifsOpen(false)}
        notifs={notifs}
        unread={unread}
        onMarkAll={markAllRead}
        userRole={user?.role}
        onItemClick={async (n) => {
          // Optimistically mark this single notification as read
          setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
          try { await api.post(`/notifications/${n.id}/read`); } catch {}
        }}
      />

      {/* Search Sheet */}
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function DesktopHeaderMenu({ unread, onSearch, onNotifs, user, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-testid="header-menu-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open menu"
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F2042] transition hover:border-[#F97316] hover:text-[#F97316]"
      >
        <Menu size={18} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            data-testid="header-menu-dropdown"
            className="absolute right-0 top-12 z-40 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            {user && (
              <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-br from-orange-50/60 to-violet-50/40 px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-sm font-bold text-white">
                  {user.name?.[0]?.toUpperCase() || "P"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[#0F2042]">{user.name}</div>
                  <div className="truncate text-[10px] uppercase tracking-wider text-[#F97316]">{user.role}</div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <div className="text-xs font-bold text-[#0F2042]">Your presence</div>
                <div className="text-[11px] text-slate-500">Online or on-break status</div>
              </div>
              <PresenceWidget />
            </div>
            <button
              data-testid="header-menu-search"
              onClick={() => { setOpen(false); onSearch(); }}
              className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-orange-50/40"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F2042]/5 text-[#0F2042]">
                <Search size={16} />
              </span>
              <span className="flex-1">
                <span className="block text-xs font-bold text-[#0F2042]">Search workspace</span>
                <span className="block text-[11px] text-slate-500">Projects, leads, tasks, issues…</span>
              </span>
              <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">⌘K</kbd>
            </button>
            <button
              data-testid="header-menu-notifs"
              onClick={() => { setOpen(false); onNotifs(); }}
              className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-orange-50/40"
            >
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#F97316]/10 text-[#F97316]">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </span>
              <span className="flex-1">
                <span className="block text-xs font-bold text-[#0F2042]">Notifications</span>
                <span className="block text-[11px] text-slate-500">{unread > 0 ? `${unread} unread` : "All caught up"}</span>
              </span>
            </button>
            {onLogout && (
              <button
                data-testid="header-menu-logout"
                onClick={() => { setOpen(false); onLogout(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-rose-50/60"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                  <LogOut size={16} />
                </span>
                <span className="flex-1">
                  <span className="block text-xs font-bold text-rose-600">Sign out</span>
                  <span className="block text-[11px] text-slate-500">End your session</span>
                </span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationSheet({ open, onClose, notifs, unread, onMarkAll, userRole, onItemClick }) {
  // Interns now share the same /app/* portal as Admin (iter 34). Notification
  // links generated by the backend already point to /app/* so no rewriting is
  // needed. We keep the userRole prop for future role-specific UX hooks.
  void userRole;
  const rewriteLinkForRole = (raw) => raw || "#";
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            data-testid="app-notif-sheet"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-hidden rounded-t-3xl bg-white shadow-2xl md:inset-x-auto md:right-6 md:top-20 md:bottom-auto md:w-96 md:rounded-3xl"
          >
            <div className="mx-auto mt-2 h-1 w-12 rounded-full bg-slate-200 md:hidden" />
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">Notifications</div>
                <div className="text-base font-bold text-[#0F2042]">{unread} unread</div>
              </div>
              <div className="flex gap-2">
                <button onClick={onMarkAll} className="text-xs text-slate-500 hover:text-[#0F2042]">Mark all read</button>
                <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {notifs.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-400">No notifications yet.</div>
              ) : notifs.slice(0, 40).map((n) => (
                <Link
                  key={n.id}
                  to={rewriteLinkForRole(n.link)}
                  data-testid={`notif-item-${n.id}`}
                  onClick={() => { onItemClick && onItemClick(n); onClose(); }}
                  className={`block border-b border-slate-50 px-5 py-3 text-sm hover:bg-orange-50/40 ${n.read ? "opacity-60" : ""}`}
                >
                  <div className="font-semibold text-[#0F172A]">{n.title}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{n.message}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function SearchSheet({ open, onClose }) {
  const [q, setQ] = useState("");
  const [data, setData] = useState({ results: {}, total: 0 });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const tRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
    if (!open) { setQ(""); setData({ results: {}, total: 0 }); }
  }, [open]);

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

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }}
            data-testid="app-search-sheet"
            className="fixed inset-x-4 top-6 z-50 overflow-hidden rounded-3xl bg-white shadow-2xl md:left-1/2 md:right-auto md:w-[560px] md:-translate-x-1/2"
          >
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <Search size={16} className="text-slate-400" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search projects, leads, tasks, issues…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                data-testid="app-search-input"
              />
              <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={16} /></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-xs text-slate-400">Searching…</div>
              ) : !q.trim() ? (
                <div className="p-6 text-center text-xs text-slate-400">Type to search across the workspace.</div>
              ) : data.total === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No results for "{q}"</div>
              ) : (
                Object.entries(data.results).map(([group, items]) => (
                  <div key={group}>
                    <div className="bg-orange-50/40 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">
                      {group}
                    </div>
                    {items.map((it) => (
                      <button
                        key={`${group}-${it.id}`}
                        onClick={() => { navigate(it.link); onClose(); }}
                        className="block w-full border-b border-slate-50 px-4 py-2.5 text-left text-xs hover:bg-orange-50/30"
                      >
                        <div className="truncate text-sm font-semibold text-[#0F2042]">{it.title}</div>
                        {it.subtitle && <div className="truncate text-[11px] text-slate-500">{it.subtitle}</div>}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
