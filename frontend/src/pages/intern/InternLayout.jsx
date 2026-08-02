import { Outlet, NavLink, useNavigate, Link, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, FolderOpen, Award, MessagesSquare, Sparkles, LogOut, Menu, X, Bell, UserCircle } from "lucide-react";
import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import useHeartbeat from "@/hooks/useHeartbeat";

const NAV = [
  { to: "/intern/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/intern/tasks", label: "My Tasks", icon: ListChecks },
  { to: "/intern/documents", label: "My Documents", icon: FolderOpen },
  { to: "/intern/badges", label: "My Badges", icon: Award },
  { to: "/intern/chat", label: "Chat", icon: MessagesSquare },
  { to: "/intern/ai", label: "Xino AI", icon: Sparkles },
  { to: "/intern/profile", label: "Profile", icon: UserCircle },
];

export default function InternLayout() {
  useHeartbeat();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifsOpen, setNotifsOpen] = useState(false);

  useEffect(() => {
    let on = true;
    const tick = async () => {
      try {
        const { data } = await api.get("/notifications");
        if (on) setNotifs(data);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { on = false; clearInterval(id); };
  }, []);
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div data-testid="intern-portal" className="portal-scope flex min-h-screen bg-gradient-to-br from-[#FFF9F2] via-[#FDF4FF] to-[#F0F9FF] text-[#0F172A]">
      {open && (
        <div onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden" />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-orange-100 bg-white/90 backdrop-blur-xl transition-transform md:relative md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b border-orange-100 px-5">
          <Logo size={28} mode="light" />
          <button className="md:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <div className="px-5 py-3">
          <div className="rounded-xl bg-gradient-to-br from-[#F97316] to-[#A855F7] p-[1px]">
            <div className="rounded-[11px] bg-white px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">Intern Portal</div>
              <div className="font-display text-sm font-semibold text-[#0F2042]">Welcome, {user?.name?.split(" ")[0]}</div>
            </div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} onClick={() => setOpen(false)}
              data-testid={`intern-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}>
              <n.icon size={18} className="side-icon" />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-orange-100 p-3">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-orange-50/50 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#A855F7] text-sm font-bold text-white">
              {user?.name?.[0]?.toUpperCase() || "I"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{user?.name}</div>
              <div className="truncate text-xs text-slate-500">{user?.email}</div>
            </div>
          </div>
          <button onClick={async () => { await logout(); navigate("/"); }}
            data-testid="intern-logout-btn"
            className="side-link w-full hover:bg-orange-50 hover:text-[#F97316]">
            <LogOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-orange-100 bg-white/80 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setOpen(true)} data-testid="intern-menu-toggle">
              <Menu size={20} />
            </button>
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// intern</div>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/" className="text-sm text-slate-500 hover:text-[#0F2042]">← Marketing site</Link>
            <div className="relative">
              <button data-testid="intern-notif-btn" onClick={() => setNotifsOpen((v) => !v)}
                className="relative rounded-full border border-orange-100 bg-white p-2 hover:border-[#F97316] hover:text-[#F97316]">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#F97316] px-1 text-[9px] font-bold text-white">{unread}</span>
                )}
              </button>
              {notifsOpen && (
                <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-xl border border-orange-100 bg-white shadow-xl">
                  <div className="border-b border-orange-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-[#F97316]">Updates</div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifs.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">All caught up ✨</div> :
                      notifs.slice(0, 20).map((n) => (
                        <div key={n.id} className={`border-b border-slate-50 px-4 py-3 text-xs ${n.read ? "opacity-60" : ""}`}>
                          <div className="font-semibold text-[#0F172A]">{n.title}</div>
                          <div className="mt-0.5 text-slate-500">{n.message}</div>
                          <div className="mt-1 text-[10px] text-slate-400">{new Date(n.created_at).toLocaleString()}</div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:p-8">
          <Outlet />
        </main>
        <div className="border-t border-orange-100 bg-white/70 px-6 py-3 text-center text-[11px] text-slate-500">
          Developed by Projexino Solutions Pvt Ltd · © 2026 Projexino. All rights reserved.
        </div>
      </div>
    </div>
  );
}
