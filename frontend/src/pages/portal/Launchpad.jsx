import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, ListChecks, UserSquare2, FolderKanban, FileText, MessagesSquare,
  Sparkles, GraduationCap, BarChart3, Award, AlertTriangle, Settings, Wallet, Megaphone, Activity,
  ChevronLeft, ChevronRight, RefreshCw, UserCircle, FolderOpen, Mail, Bell, FileSearch, Briefcase, Globe2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

// === Card catalog ===
// Each card has a distinct gradient + decor + role gate.
const CARDS_PORTAL = [
  { slug: "dashboard",       label: "Dashboard",  icon: LayoutDashboard, gradient: "from-[#0F2042] via-[#1E3A8A] to-[#3B82F6]",   glow: "rgba(59,130,246,0.45)", decor: "📊" },
  { slug: "projects",        label: "Projects",   icon: FolderKanban,    gradient: "from-[#7C2D12] via-[#EA580C] to-[#F97316]",   glow: "rgba(249,115,22,0.5)",  decor: "🚀" },
  { slug: "tasks",           label: "Tasks",      icon: ListChecks,      gradient: "from-[#065F46] via-[#059669] to-[#10B981]",   glow: "rgba(16,185,129,0.45)", decor: "✅" },
  { slug: "chat",            label: "Chat",       icon: MessagesSquare,  gradient: "from-[#5B21B6] via-[#7C3AED] to-[#A855F7]",   glow: "rgba(168,85,247,0.5)",  decor: "💬" },
  { slug: "leads",           label: "Leads",      icon: Users,           gradient: "from-[#BE185D] via-[#DB2777] to-[#F472B6]",   glow: "rgba(244,114,182,0.45)", decor: "🎯" },
  { slug: "team",            label: "Team",       icon: UserSquare2,     gradient: "from-[#0E7490] via-[#0891B2] to-[#06B6D4]",   glow: "rgba(6,182,212,0.45)",  decor: "👥" },
  // Intern Hub & Access Control are merged into the Team page as tabs (see /app/team?tab=interns and ?tab=matrix)
  { slug: "badges",          label: "Badges",     icon: Award,           gradient: "from-[#831843] via-[#BE185D] to-[#EC4899]",   glow: "rgba(236,72,153,0.45)", decor: "🏆",   roles: ["super_admin", "admin", "manager", "hr"] },
  { slug: "documents",       label: "Documents",  icon: FileText,        gradient: "from-[#1F2937] via-[#374151] to-[#6B7280]",   glow: "rgba(107,114,128,0.4)", decor: "📄" },
  { slug: "issues",          label: "Issues",     icon: AlertTriangle,   gradient: "from-[#7F1D1D] via-[#DC2626] to-[#F87171]",   glow: "rgba(248,113,113,0.5)", decor: "🚨" },
  { slug: "finance",         label: "Finance",    icon: Wallet,          gradient: "from-[#064E3B] via-[#047857] to-[#34D399]",   glow: "rgba(52,211,153,0.5)",  decor: "💰",   roles: ["super_admin", "admin", "manager", "hr"] },
  { slug: "email-campaigns", label: "Mass Email", icon: Megaphone,       gradient: "from-[#7E22CE] via-[#9333EA] to-[#C084FC]",   glow: "rgba(192,132,252,0.5)", decor: "📣",   roles: ["super_admin", "admin", "manager", "hr"] },
  { slug: "email-templates", label: "Email Templates", icon: Mail,       gradient: "from-[#9A3412] via-[#C2410C] to-[#FB923C]",   glow: "rgba(251,146,60,0.55)", decor: "✉️",   roles: ["super_admin", "admin", "manager", "hr"] },
  { slug: "presence",        label: "Presence",   icon: Activity,        gradient: "from-[#15803D] via-[#16A34A] to-[#86EFAC]",   glow: "rgba(134,239,172,0.55)",decor: "🟢",   roles: ["super_admin", "admin", "manager", "hr"] },
  { slug: "ai",              label: "Xino AI",  icon: Sparkles,        gradient: "from-[#0C0A09] via-[#292524] to-[#78716C]",   glow: "rgba(120,113,108,0.45)",decor: "✨" },
  { slug: "ai-settings",     label: "AI Settings", icon: Sparkles,       gradient: "from-[#312E81] via-[#7C3AED] to-[#A855F7]",   glow: "rgba(168,85,247,0.5)",  decor: "🤖",   roles: ["admin", "super_admin"] },
  { slug: "calendly",        label: "Booking",    icon: FolderKanban,    gradient: "from-[#155E75] via-[#0E7490] to-[#0891B2]",   glow: "rgba(8,145,178,0.5)",   decor: "📅",   roles: ["admin", "super_admin", "manager", "hr"] },
  { slug: "profile",         label: "My Profile", icon: UserCircle,      gradient: "from-[#0EA5E9] via-[#0284C7] to-[#0C4A6E]",   glow: "rgba(14,165,233,0.45)", decor: "👤" },
  { slug: "doc-verification", label: "Doc Verify", icon: FileSearch,     gradient: "from-[#854D0E] via-[#A16207] to-[#EAB308]",   glow: "rgba(234,179,8,0.45)",  decor: "🔎",   roles: ["admin", "super_admin", "manager", "hr"] },
  { slug: "hr",              label: "HR Module",  icon: Briefcase,       gradient: "from-[#831843] via-[#9D174D] to-[#DB2777]",   glow: "rgba(219,39,119,0.45)", decor: "🏛️",   roles: ["admin", "super_admin", "hr", "manager"] },
  // Access Control merged into /app/team (Permission Matrix tab)
  { slug: "notifications-permissions", label: "Notif. Permissions", icon: Bell, gradient: "from-[#312E81] via-[#4338CA] to-[#818CF8]", glow: "rgba(129,140,248,0.5)", decor: "🔔", roles: ["admin", "super_admin"] },
  { slug: "settings",        label: "Settings",   icon: Settings,        gradient: "from-[#1E293B] via-[#475569] to-[#94A3B8]",   glow: "rgba(148,163,184,0.4)", decor: "⚙️",   roles: ["admin", "super_admin"] },
  { slug: "website-config",  label: "Website Config", icon: Globe2,      gradient: "from-[#7C2D12] via-[#C2410C] to-[#F97316]",   glow: "rgba(249,115,22,0.5)",  decor: "🌐",   roles: ["super_admin"] },
  { slug: "blog",            label: "Blog",       icon: FileText,        gradient: "from-[#1E3A8A] via-[#3B82F6] to-[#60A5FA]",   glow: "rgba(96,165,250,0.5)",  decor: "📝",   roles: ["super_admin", "admin", "manager"] },
  { slug: "linkedin",        label: "LinkedIn",   icon: Megaphone,       gradient: "from-[#084d96] via-[#0A66C2] to-[#3b82f6]",   glow: "rgba(10,102,194,0.5)",  decor: "💼",   roles: ["super_admin", "admin", "manager"] },
];

const CARDS_INTERN = [
  { slug: "dashboard", label: "Dashboard",   icon: LayoutDashboard, gradient: "from-[#0F2042] via-[#1E3A8A] to-[#3B82F6]",   glow: "rgba(59,130,246,0.45)", decor: "📊" },
  { slug: "tasks",     label: "My Tasks",    icon: ListChecks,      gradient: "from-[#065F46] via-[#059669] to-[#10B981]",   glow: "rgba(16,185,129,0.45)", decor: "✅" },
  { slug: "documents", label: "My Documents",icon: FolderOpen,      gradient: "from-[#1F2937] via-[#374151] to-[#6B7280]",   glow: "rgba(107,114,128,0.4)", decor: "📄" },
  { slug: "badges",    label: "My Badges",   icon: Award,           gradient: "from-[#831843] via-[#BE185D] to-[#EC4899]",   glow: "rgba(236,72,153,0.5)",  decor: "🏆" },
  { slug: "chat",      label: "Chat",        icon: MessagesSquare,  gradient: "from-[#5B21B6] via-[#7C3AED] to-[#A855F7]",   glow: "rgba(168,85,247,0.5)",  decor: "💬" },
  { slug: "ai",        label: "Xino AI",   icon: Sparkles,        gradient: "from-[#0C0A09] via-[#292524] to-[#78716C]",   glow: "rgba(120,113,108,0.45)",decor: "✨" },
  { slug: "profile",   label: "Profile",     icon: UserCircle,      gradient: "from-[#7C2D12] via-[#EA580C] to-[#F97316]",   glow: "rgba(249,115,22,0.5)",  decor: "🧑" },
];

import usePermissions from "@/hooks/usePermissions";

const PAGE_SIZE = 6; // 2 cols × 3 rows — fits a phone screen with no scrolling

export default function Launchpad({ variant = "portal" }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const perms = usePermissions();
  const base = variant === "intern" ? "/intern" : (location.pathname.startsWith("/m") ? "/m" : "/app");

  const allCards = useMemo(() => {
    const src = variant === "intern" ? CARDS_INTERN : CARDS_PORTAL;
    // Interns use a small fixed deck — still filter by RBAC view permission.
    // Portal cards: gate strictly by the live RBAC matrix from /api/rbac/permissions.
    // While permissions are loading we hide cards (better UX than flashing then disappearing).
    if (!perms.loaded) return [];
    return src.filter((c) => {
      // Super admin sees everything
      if (perms.is_super_admin) return true;
      // Check live permission; if module unknown, fall back to legacy `roles` array for safety.
      const live = perms.can(c.slug, "view");
      if (live === true) return true;
      if (live === false) return false;
      return c.roles ? (user && c.roles.includes(user.role)) : true;
    });
  }, [user, variant, perms.loaded, perms.is_super_admin, perms.permissions]);

  const [page, setPage] = useState(0);
  const pages = useMemo(() => {
    // Pack cards into pages of PAGE_SIZE — last page may have fewer.
    // User requirement: every visible page must show exactly 6 cards.
    // If the last batch has < 6, we overlap with the previous batch so the
    // tail page still renders 6 cards (the last card is the "real" last one).
    const arr = [];
    if (allCards.length === 0) return arr;
    if (allCards.length <= PAGE_SIZE) {
      arr.push(allCards);
      return arr;
    }
    for (let i = 0; i < allCards.length; i += PAGE_SIZE) {
      const batch = allCards.slice(i, i + PAGE_SIZE);
      if (batch.length < PAGE_SIZE && arr.length > 0) {
        // backfill from prior cards to keep page full
        const need = PAGE_SIZE - batch.length;
        const backfill = allCards.slice(Math.max(0, i - need), i);
        arr.push([...backfill, ...batch]);
      } else {
        arr.push(batch);
      }
    }
    return arr;
  }, [allCards]);
  const pageCount = pages.length;

  // Pull-to-refresh
  const pullY = useMotionValue(0);
  const indicatorOp = useTransform(pullY, [0, 70], [0, 1]);
  const indicatorRot = useTransform(pullY, [0, 90], [0, 360]);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState(null);

  const loadStats = async () => {
    try {
      const { data } = await api.get("/dashboard/stats").catch(() => ({ data: null }));
      setStats(data);
    } catch {}
  };
  useEffect(() => { loadStats(); }, []);

  const doRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), new Promise((r) => setTimeout(r, 700))]);
    setRefreshing(false);
    animate(pullY, 0, { type: "spring", stiffness: 200, damping: 22 });
  };

  // Swipe between pages (drag horizontal)
  const dragX = useMotionValue(0);
  const handleDragEnd = (_, info) => {
    const off = info.offset.x;
    const v = info.velocity.x;
    if (off < -60 || v < -300) setPage((p) => Math.min(pageCount - 1, p + 1));
    else if (off > 60 || v > 300) setPage((p) => Math.max(0, p - 1));
    animate(dragX, 0, { type: "spring", stiffness: 240, damping: 26 });
  };

  return (
    <div data-testid="launchpad" className="relative flex h-full flex-col">
      {/* Pull-to-refresh indicator */}
      <motion.div
        style={{ opacity: indicatorOp }}
        className="pointer-events-none absolute left-0 right-0 top-2 z-10 flex justify-center md:hidden"
      >
        <motion.div style={{ rotate: refreshing ? 0 : indicatorRot }} className={`flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-lg ${refreshing ? "animate-spin" : ""}`}>
          <RefreshCw size={16} className="text-[#F97316]" />
        </motion.div>
      </motion.div>

      {/* Hero (compact, fits in viewport) */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F2042] via-[#1E1B4B] to-[#7C3AED] p-4 text-white md:p-7"
      >
        <motion.div aria-hidden
          className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl md:h-48 md:w-48"
          animate={{ scale: [1, 1.15, 1], rotate: [0, 60, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div aria-hidden
          className="absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-[#F97316]/40 blur-2xl md:h-40 md:w-40"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-200">// launchpad</div>
          <div className="mt-1 flex items-end justify-between gap-4">
            <h1 className="font-display text-xl font-semibold leading-tight md:text-3xl">
              Hi {user?.name?.split(" ")[0] || "there"},
              <span className="block text-[12px] font-normal text-white/70 md:text-sm">{variant === "intern" ? "Your intern cockpit." : "Pick a card to dive in."}</span>
            </h1>
            {stats && (
              <div className="text-right">
                <div className="text-[9px] uppercase tracking-[0.22em] text-orange-200 md:text-[10px]">// live</div>
                <div className="text-base font-bold md:text-2xl">{stats?.open_tasks ?? 0} <span className="text-[10px] text-white/70 md:text-xs">tasks</span></div>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* === DESKTOP: full wide grid, all cards, vertical scroll === */}
      <div className="hidden md:block mt-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 auto-rows-[120px]">
          {allCards.map((c, i) => (
            <NavCard3D
              key={`d-${c.slug}`}
              card={c}
              index={i}
              onClick={() => navigate(`${base}/${c.slug}`)}
            />
          ))}
        </div>
      </div>

      {/* === MOBILE: Paginated horizontal swipe deck === */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.0001, bottom: 0.4 }}
        onDragEnd={async (_, info) => {
          if (info.offset.y > 80) {
            await doRefresh();
          }
          animate(pullY, 0, { type: "spring", stiffness: 200, damping: 22 });
        }}
        onDrag={(_, info) => { if (info.offset.y > 0) pullY.set(info.offset.y); }}
        style={{ y: pullY }}
        className="flex-1 mt-4 flex min-h-0 flex-col md:hidden"
      >
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <motion.div
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.16}
            onDragEnd={handleDragEnd}
            style={{ x: dragX }}
            className="flex h-full"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.28 }}
                className="grid h-full w-full grid-cols-2 auto-rows-fr gap-3 sm:gap-4"
              >
                {pages[page]?.map((c, i) => (
                  <NavCard3D
                    key={`${page}-${c.slug}-${i}`}
                    card={c}
                    index={i}
                    onClick={() => navigate(`${base}/${c.slug}`)}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Bottom pager */}
        {pageCount > 1 && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              data-testid="launchpad-prev"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F2042] shadow-sm transition hover:border-[#F97316] hover:text-[#F97316] disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-1 items-center justify-center gap-1.5">
              {Array.from({ length: pageCount }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  data-testid={`launchpad-dot-${i}`}
                  className={`h-2 rounded-full transition-all ${i === page ? "w-8 bg-[#F97316]" : "w-2 bg-slate-300"}`}
                />
              ))}
            </div>
            <button
              data-testid="launchpad-next"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page === pageCount - 1}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#0F2042] shadow-sm transition hover:border-[#F97316] hover:text-[#F97316] disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function NavCard3D({ card, index, onClick }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotX = useSpring(useTransform(y, [-30, 30], [10, -10]), { stiffness: 220, damping: 18 });
  const rotY = useSpring(useTransform(x, [-30, 30], [-12, 12]), { stiffness: 220, damping: 18 });

  const handleMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = (e.clientX || e.touches?.[0]?.clientX || 0) - rect.left;
    const py = (e.clientY || e.touches?.[0]?.clientY || 0) - rect.top;
    x.set(((px / rect.width) - 0.5) * 60);
    y.set(((py / rect.height) - 0.5) * 60);
  };
  const reset = () => { x.set(0); y.set(0); };
  const Icon = card.icon;

  return (
    <motion.button
      ref={ref}
      data-testid={`launch-card-${card.slug}`}
      onClick={onClick}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      onTouchMove={handleMove}
      onTouchEnd={reset}
      initial={{ opacity: 0, y: 12, rotateY: -6 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.4, type: "spring", stiffness: 130 }}
      whileTap={{ scale: 0.95 }}
      className={`nav-card-3d bg-gradient-to-br ${card.gradient}`}
      style={{
        rotateX: rotX,
        rotateY: rotY,
        boxShadow: `0 22px 30px -16px ${card.glow}, 0 8px 14px -6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.2)`,
      }}
    >
      <div className="nav-card-orbit spin-slow" style={{ width: 72, height: 72, top: -16, right: -16 }} />
      <div className="nav-card-orbit" style={{ width: 50, height: 50, top: -8, right: -4, opacity: 0.55 }} />

      <motion.div
        aria-hidden
        animate={{ y: [0, -3, 0] }} transition={{ duration: 3.6 + (index % 5) * 0.2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute right-2 top-1 text-lg drop-shadow-[0_4px_8px_rgba(0,0,0,0.25)]"
        style={{ transform: "translateZ(40px)" }}
      >
        {card.decor}
      </motion.div>

      <div className="relative flex h-full flex-col justify-between" style={{ transform: "translateZ(20px)" }}>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 backdrop-blur-md">
          <Icon size={13} />
        </div>
        <div className="mt-2">
          <div className="text-[7.5px] font-bold uppercase tracking-[0.22em] text-white/80">// {card.slug}</div>
          <div className="font-display mt-0.5 text-sm font-semibold leading-tight">{card.label}</div>
        </div>
      </div>
    </motion.button>
  );
}
