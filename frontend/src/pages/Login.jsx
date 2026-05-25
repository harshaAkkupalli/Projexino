import { useEffect, useRef, useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from "framer-motion";
import {
  ArrowRight, Mail, Lock, Crown, Briefcase, Code2, GraduationCap, ShieldCheck,
  ChevronLeft, ChevronRight, X, Sparkles, Zap, Rocket, Eye, Brain,
  TestTube2, Cloud,
} from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api } from "@/lib/api";

const ROLES = [
  {
    id: "admin", label: "Admin", sub: "Full workspace control",
    demoEmail: "admin@projexino.com", demoPw: "Projexino@2026",
    icon: Crown,
    gradient: "from-[#0F2042] via-[#1E3A8A] to-[#3B82F6]",
    glow: "rgba(59,130,246,0.45)", decor: "👑",
    headline: "Command every pixel of your operation.",
    perks: ["Workspace control", "Audit-grade reporting", "Multi-Gmail broadcasts"],
  },
  {
    id: "manager", label: "Manager", sub: "Lead teams & projects",
    demoEmail: "manager@projexino.com", demoPw: "Manager@2026",
    icon: Briefcase,
    gradient: "from-[#7C2D12] via-[#EA580C] to-[#F97316]",
    glow: "rgba(249,115,22,0.5)", decor: "💼",
    headline: "Steer projects from idea to shipped.",
    perks: ["Live Kanban", "Cross-team chat", "Finance visibility"],
  },
  {
    id: "hr", label: "HR", sub: "Verify docs & people ops",
    demoEmail: "hr@projexino.com", demoPw: "HR@2026",
    icon: ShieldCheck,
    gradient: "from-[#5B21B6] via-[#7C3AED] to-[#A855F7]",
    glow: "rgba(168,85,247,0.5)", decor: "🛡️",
    headline: "Onboard, verify, retain.",
    perks: ["Document verification", "Intern lifecycle", "Branded emails"],
  },
  {
    id: "developer", label: "Developer", sub: "Ship code, daily",
    demoEmail: "", demoPw: "",
    icon: Code2,
    gradient: "from-[#065F46] via-[#059669] to-[#10B981]",
    glow: "rgba(16,185,129,0.45)", decor: "⚙️",
    headline: "Your day, on rails.",
    perks: ["Personal task board", "Messenger-style chat", "AI co-pilot"],
  },
  {
    id: "qa", label: "QA", sub: "Test, find, ship clean",
    demoEmail: "", demoPw: "",
    icon: TestTube2,
    gradient: "from-[#0E7490] via-[#0891B2] to-[#06B6D4]",
    glow: "rgba(6,182,212,0.5)", decor: "🧪",
    headline: "Catch every bug before users do.",
    perks: ["Issue tracker", "Project test plans", "AI test summaries"],
  },
  {
    id: "cloud_admin", label: "Cloud Admin", sub: "Infra, deploys, secrets",
    demoEmail: "", demoPw: "",
    icon: Cloud,
    gradient: "from-[#1E1B4B] via-[#4338CA] to-[#6366F1]",
    glow: "rgba(99,102,241,0.5)", decor: "☁️",
    headline: "Own the runtime end-to-end.",
    perks: ["Deployment console", "Secrets & vaults", "Presence & health"],
  },
  {
    id: "intern", label: "Intern", sub: "My tasks, docs, badges",
    demoEmail: "intern@projexino.com", demoPw: "Intern@2026",
    icon: GraduationCap,
    gradient: "from-[#BE185D] via-[#DB2777] to-[#F472B6]",
    glow: "rgba(244,114,182,0.5)", decor: "🎓",
    headline: "Level up. Earn badges.",
    perks: ["Weekly progress", "Skill badges", "AI mentor"],
  },
];

// Intro popup slides
const SLIDES = [
  {
    title: "Welcome to Projexino",
    subtitle: "A single workspace for projects, people, money & messages.",
    icon: Sparkles, accent: "#F97316", emoji: "✨",
  },
  {
    title: "Built for every role",
    subtitle: "Admin, Manager, HR, Developer, QA, Cloud Admin, Intern — each gets a tailored cockpit.",
    icon: Crown, accent: "#3B82F6", emoji: "👥",
  },
  {
    title: "AI baked-in",
    subtitle: "Claude 4.5 + GPT-5.2 draft your emails, summarise your meetings, mentor your interns.",
    icon: Brain, accent: "#A855F7", emoji: "🧠",
  },
  {
    title: "Live presence & finance",
    subtitle: "Real-time online/break tracking, branded PDF invoices, multi-currency, scheduled broadcasts.",
    icon: Zap, accent: "#10B981", emoji: "⚡",
  },
  {
    title: "Ready when you are",
    subtitle: "Swipe a role card to sign in. Demo creds are pre-filled.",
    icon: Rocket, accent: "#EC4899", emoji: "🚀",
  },
];

// === 3D Background ===
function BackgroundScene() {
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas camera={{ position: [0, 0, 7], fov: 55 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <pointLight position={[-5, -3, 4]} intensity={0.8} color="#FBBF24" />
        <Float speed={1.2} rotationIntensity={1.2} floatIntensity={1.8}>
          <mesh position={[-3.5, 1.2, -1]}>
            <torusKnotGeometry args={[0.7, 0.22, 80, 16]} />
            <meshStandardMaterial color="#FBBF24" metalness={0.7} roughness={0.18} />
          </mesh>
        </Float>
        <Float speed={0.9} rotationIntensity={1} floatIntensity={1.4}>
          <mesh position={[3.4, -1.3, -1.5]}>
            <icosahedronGeometry args={[0.95, 0]} />
            <meshStandardMaterial color="#F472B6" metalness={0.7} roughness={0.15} />
          </mesh>
        </Float>
        <Float speed={1.5} rotationIntensity={1.4} floatIntensity={2}>
          <mesh position={[2.8, 2.2, -2.5]}>
            <octahedronGeometry args={[0.55, 0]} />
            <meshStandardMaterial color="#22D3EE" metalness={0.7} roughness={0.18} />
          </mesh>
        </Float>
        <Float speed={1.1} rotationIntensity={1.2} floatIntensity={1.5}>
          <mesh position={[-2.5, -2.2, -2]}>
            <dodecahedronGeometry args={[0.7, 0]} />
            <meshStandardMaterial color="#A78BFA" metalness={0.6} roughness={0.25} />
          </mesh>
        </Float>
        <Float speed={1.7} rotationIntensity={1.3} floatIntensity={1.9}>
          <mesh position={[0, 0, -3]}>
            <sphereGeometry args={[0.45, 32, 32]} />
            <meshStandardMaterial color="#FFFFFF" metalness={0.4} roughness={0.1} emissive="#FBBF24" emissiveIntensity={0.4} />
          </mesh>
        </Float>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div>
  );
}

export default function Login() {
  const { user, login, error } = useAuth();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(true);
  const [popupOpen, setPopupOpen] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    api.get("/settings/public").then(({ data }) => setShowDemo(!!data.show_demo_creds)).catch(() => {});
    // Show intro popup only once per browser
    const seen = localStorage.getItem("pj_intro_seen");
    if (!seen) {
      const t = setTimeout(() => setPopupOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  // Auto-advance popup slides
  useEffect(() => {
    if (!popupOpen) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 3000);
    return () => clearInterval(id);
  }, [popupOpen]);

  const closePopup = () => {
    setPopupOpen(false);
    try { localStorage.setItem("pj_intro_seen", "1"); } catch {}
  };

  const roleHome = (role) => (role === "intern" ? "/intern" : "/app");
  if (user && user !== false) return <Navigate to={roleHome(user.role)} replace />;

  const selectRole = (r) => {
    setSelected(r);
    if (showDemo) { setEmail(r.demoEmail); setPassword(r.demoPw); }
    else { setEmail(""); setPassword(""); }
  };

  const next = () => setIndex((i) => Math.min(ROLES.length - 1, i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      toast.success("Welcome back", { duration: 1500 });
      setTimeout(() => {
        const role = JSON.parse(localStorage.getItem("pj_role") || '""');
        navigate(role === "intern" ? "/intern" : "/app");
      }, 80);
    } else {
      toast.error("Invalid credentials");
    }
  };

  return (
    <div data-testid="page-login" className="login-cinema">
      {/* 3D background (mobile only — desktop uses split brand panel) */}
      <div className="md:hidden">
        <BackgroundScene />
      </div>

      {/* Animated gradient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div className="absolute -left-32 top-20 h-80 w-80 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(249,115,22,0.35), transparent 70%)" }}
          animate={{ x: [0, 60, 0], y: [0, 30, 0] }} transition={{ duration: 14, repeat: Infinity }} />
        <motion.div className="absolute right-0 top-60 h-96 w-96 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)" }}
          animate={{ x: [0, -50, 0], y: [0, 40, 0] }} transition={{ duration: 18, repeat: Infinity }} />
      </div>

      {/* === DESKTOP: Split-screen brand + form === */}
      <div className="relative mx-auto hidden min-h-screen w-full max-w-7xl items-stretch md:grid md:grid-cols-[1.05fr_1fr] lg:grid-cols-[1.15fr_1fr]">
        {/* LEFT brand panel */}
        <div className="relative flex flex-col justify-between overflow-hidden p-10 lg:p-14">
          <div className="absolute inset-0">
            <BackgroundScene />
          </div>
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-2 text-white">
              <Logo size={44} asLink={false} />
            </Link>
            <motion.h1
              initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="font-display mt-14 max-w-xl text-5xl font-medium leading-[1.05] text-white drop-shadow-[0_4px_24px_rgba(15,32,66,0.45)] lg:text-6xl"
            >
              Your whole workspace.
              <span className="block bg-gradient-to-r from-[#FEF3C7] via-[#FBBF24] to-[#FB923C] bg-clip-text text-transparent italic">
                One sign-in.
              </span>
            </motion.h1>
            <p className="mt-5 max-w-md text-base font-medium text-white/95 drop-shadow-[0_2px_12px_rgba(15,32,66,0.35)]">
              Projects, leads, finance, chat, AI, presence — every team's cockpit, calibrated to the role you signed in with.
            </p>
            <ul className="mt-8 space-y-3 max-w-sm">
              {[
                { t: "Multi-role security", d: "Admin · Manager · HR · Developer · QA · Cloud Admin · Intern" },
                { t: "AI-assisted day-to-day", d: "Drafts, summaries, mentor — built-in" },
                { t: "Live presence & finance", d: "Online/break tracking, branded invoices" },
              ].map((b) => (
                <li key={b.t} className="flex items-start gap-3">
                  <span className="mt-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                    <Sparkles size={12} className="text-white" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-white">{b.t}</div>
                    <div className="text-xs text-white/75">{b.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-12 text-[11px] uppercase tracking-[0.32em] text-white/60">
            // PROJEXINO · WORKSPACE OS
          </div>
        </div>

        {/* RIGHT form panel */}
        <div className="relative flex items-center justify-center bg-white/5 p-8 backdrop-blur-md lg:p-12">
          <div className="w-full max-w-lg">
            <AnimatePresence mode="wait">
              {!selected ? (
                <motion.div key="desktop-carousel"
                  initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <div className="text-left">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/25 px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.32em] text-white backdrop-blur-md shadow-lg">
                      <Sparkles size={12} /> Choose your role
                    </span>
                    <h2 className="font-display mt-4 text-3xl font-medium leading-tight text-white">
                      Sign in to your portal.
                    </h2>
                    <p className="mt-2 text-sm font-medium text-white/85">
                      Pick the card that matches your role — we'll take you straight there.
                    </p>
                  </div>
                  <RoleCarousel roles={ROLES} index={index} setIndex={setIndex} onSelect={selectRole} />
                  <div className="mt-6 flex items-center justify-center gap-4">
                    <button data-testid="carousel-prev-d" onClick={prev} disabled={index === 0}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md shadow-xl transition hover:bg-white/50 disabled:opacity-30">
                      <ChevronLeft size={20} />
                    </button>
                    <div className="flex gap-1.5">
                      {ROLES.map((_, i) => (
                        <button key={i} onClick={() => setIndex(i)} data-testid={`carousel-dot-d-${i}`}
                          className={`h-2 rounded-full transition-all ${i === index ? "w-8 bg-white" : "w-2 bg-white/50"}`} />
                      ))}
                    </div>
                    <button data-testid="carousel-next-d" onClick={next} disabled={index === ROLES.length - 1}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md shadow-xl transition hover:bg-white/50 disabled:opacity-30">
                      <ChevronRight size={20} />
                    </button>
                  </div>
                  <div className="mt-8 text-center text-xs font-medium text-white/90">
                    Don't have an account?{" "}
                    <Link to="/register" className="font-bold text-white underline hover:text-[#FEF3C7]">Create one</Link>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="desktop-form"
                  initial={{ opacity: 0, rotateY: 60 }} animate={{ opacity: 1, rotateY: 0 }} exit={{ opacity: 0, rotateY: -60 }}
                  transition={{ duration: 0.5, type: "spring", stiffness: 130 }}
                  style={{ transformStyle: "preserve-3d", perspective: 1200 }}>
                  <button onClick={() => setSelected(null)} data-testid="back-roles-btn-d"
                    className="mb-4 inline-flex items-center gap-1 text-sm text-white/80 hover:text-white">
                    <ChevronLeft size={16} /> Back to roles
                  </button>
                  <div className="glass-card overflow-hidden rounded-3xl shadow-2xl">
                    <div className={`relative flex items-center gap-4 bg-gradient-to-br ${selected.gradient} p-6 text-white`}>
                      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30" style={{ background: selected.glow }} />
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                        <selected.icon size={28} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/80">// {selected.id} login</div>
                        <h2 className="font-display text-2xl font-semibold">{selected.label}</h2>
                        <div className="truncate text-xs text-white/85">{selected.sub}</div>
                      </div>
                    </div>
                    <form onSubmit={submit} className="space-y-4 bg-white/95 p-6">
                      <Field icon={Mail} label="Email" type="email" value={email} onChange={setEmail} testId="login-email-d" />
                      <Field icon={Lock} label="Password" type="password" value={password} onChange={setPassword} testId="login-password-d" />
                      {error && <div data-testid="login-error-d" className="text-sm text-red-500">{error}</div>}
                      <button type="submit" disabled={loading} data-testid="login-submit-btn-d"
                        className="btn-primary w-full justify-center disabled:opacity-60">
                        {loading ? "Signing in…" : `Enter ${selected.label}`} <ArrowRight size={18} />
                      </button>
                      <Link to="/forgot-password" data-testid="login-forgot-d" className="block text-center text-xs font-bold text-slate-500 hover:text-[#F97316]">
                        Forgot your password?
                      </Link>
                      {showDemo && (
                        <div data-testid="demo-creds-box-d" className="rounded-lg border border-orange-100 bg-orange-50/60 p-3 text-[11px] text-slate-600">
                          <span className="font-bold text-[#F97316]">Demo creds:</span> {selected.demoEmail} · {selected.demoPw}
                        </div>
                      )}
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* === MOBILE: original carousel layout === */}
      <div className="md:hidden">
        {/* Brand strip */}
        <div className="relative mx-auto flex max-w-7xl items-center justify-center px-5 py-5">
          <Link to="/" className="flex items-center gap-2 text-white">
            <Logo size={40} asLink={false} />
          </Link>
        </div>

        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-5 pb-20 pt-4">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div key="carousel"
                initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="w-full">
                <div className="text-center">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/25 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.32em] text-white backdrop-blur-md shadow-lg">
                    <Sparkles size={12} /> Choose your role
                  </motion.div>
                  <h1 className="font-display mt-4 text-3xl font-medium leading-tight text-white drop-shadow-[0_4px_24px_rgba(15,32,66,0.45)] sm:text-4xl">
                    Sign in to your <span className="bg-gradient-to-r from-[#FFFFFF] via-[#FEF3C7] to-[#FBBF24] bg-clip-text text-transparent">Projexino</span> portal.
                  </h1>
                  <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-white/95 drop-shadow-[0_2px_12px_rgba(15,32,66,0.35)] sm:text-base">
                    Swipe the card that matches your role — we'll take you straight there.
                  </p>
                </div>

                <RoleCarousel roles={ROLES} index={index} setIndex={setIndex} onSelect={selectRole} />

                <div className="mt-6 flex items-center justify-center gap-4">
                  <button data-testid="carousel-prev" onClick={prev} disabled={index === 0}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md shadow-xl transition hover:bg-white/50 disabled:opacity-30">
                    <ChevronLeft size={22} />
                  </button>
                  <div className="flex gap-1.5">
                    {ROLES.map((_, i) => (
                      <button key={i} onClick={() => setIndex(i)} data-testid={`carousel-dot-${i}`}
                        className={`h-2 rounded-full transition-all ${i === index ? "w-8 bg-white shadow-lg" : "w-2 bg-white/50"}`} />
                    ))}
                  </div>
                  <button data-testid="carousel-next" onClick={next} disabled={index === ROLES.length - 1}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-white/30 text-white backdrop-blur-md shadow-xl transition hover:bg-white/50 disabled:opacity-30">
                    <ChevronRight size={22} />
                  </button>
                </div>

                <div className="mt-8 text-center text-xs font-medium text-white/90 drop-shadow-md">
                  Don't have an account?{" "}
                  <Link to="/register" className="font-bold text-white underline hover:text-[#FEF3C7]">Create one</Link>
                </div>
              </motion.div>
            ) : (
              <motion.div key="form"
                initial={{ opacity: 0, rotateY: 90 }}
                animate={{ opacity: 1, rotateY: 0 }}
                exit={{ opacity: 0, rotateY: -90 }}
                transition={{ duration: 0.55, type: "spring", stiffness: 120 }}
                style={{ transformStyle: "preserve-3d", perspective: 1200 }}
                className="mx-auto w-full max-w-md">
                <button onClick={() => setSelected(null)} data-testid="back-roles-btn"
                  className="mb-4 inline-flex items-center gap-1 text-sm text-white/80 hover:text-white">
                  <ChevronLeft size={16} /> Back to roles
                </button>
                <div className="glass-card overflow-hidden rounded-3xl shadow-2xl">
                  <div className={`relative flex items-center gap-4 bg-gradient-to-br ${selected.gradient} p-6 text-white`}>
                    <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-30" style={{ background: selected.glow }} />
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                      <selected.icon size={28} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/80">// {selected.id} login</div>
                      <h2 className="font-display text-2xl font-semibold">{selected.label}</h2>
                      <div className="truncate text-xs text-white/85">{selected.sub}</div>
                    </div>
                  </div>
                  <form onSubmit={submit} className="space-y-4 bg-white/95 p-6">
                    <Field icon={Mail} label="Email" type="email" value={email} onChange={setEmail} testId="login-email" />
                    <Field icon={Lock} label="Password" type="password" value={password} onChange={setPassword} testId="login-password" />
                    {error && <div data-testid="login-error" className="text-sm text-red-500">{error}</div>}
                    <button type="submit" disabled={loading} data-testid="login-submit-btn"
                      className="btn-primary w-full justify-center disabled:opacity-60">
                      {loading ? "Signing in…" : `Enter ${selected.label}`} <ArrowRight size={18} />
                    </button>
                    <Link to="/forgot-password" data-testid="login-forgot" className="block text-center text-xs font-bold text-white/70 hover:text-white">
                      Forgot your password?
                    </Link>
                    {showDemo && (
                      <div data-testid="demo-creds-box" className="rounded-lg border border-orange-100 bg-orange-50/60 p-3 text-[11px] text-slate-600">
                        <span className="font-bold text-[#F97316]">Demo creds:</span> {selected.demoEmail} · {selected.demoPw}
                      </div>
                    )}
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Intro popup */}
      <AnimatePresence>
        {popupOpen && <IntroPopup slide={slide} setSlide={setSlide} onSkip={closePopup} />}
      </AnimatePresence>
    </div>
  );
}

// ============= Swipeable carousel =============

function RoleCarousel({ roles, index, setIndex, onSelect }) {
  const dragX = useMotionValue(0);
  const containerRef = useRef(null);

  const handleDragEnd = (_, info) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    if (offset < -60 || velocity < -300) setIndex((i) => Math.min(roles.length - 1, i + 1));
    else if (offset > 60 || velocity > 300) setIndex((i) => Math.max(0, i - 1));
    animate(dragX, 0, { type: "spring", stiffness: 300, damping: 30 });
  };

  return (
    <div className="mt-8 select-none" ref={containerRef} style={{ perspective: 1400 }}>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={handleDragEnd}
        style={{ x: dragX }}
        className="relative mx-auto flex h-[440px] w-full max-w-md cursor-grab items-center justify-center active:cursor-grabbing"
      >
        {roles.map((r, i) => {
          const offset = i - index;
          const isActive = i === index;
          return (
            <motion.div
              key={r.id}
              data-testid={`role-card-${r.id}`}
              className={`absolute h-[420px] w-[300px] sm:w-[340px]`}
              animate={{
                x: offset * 70,
                scale: isActive ? 1 : 0.85,
                rotateY: offset * -18,
                zIndex: 100 - Math.abs(offset),
                opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.3,
              }}
              transition={{ type: "spring", stiffness: 200, damping: 26 }}
              style={{ transformStyle: "preserve-3d" }}
              onClick={() => isActive ? onSelect(r) : setIndex(i)}
            >
              <RoleCard role={r} isActive={isActive} onSelect={() => onSelect(r)} />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function RoleCard({ role, isActive, onSelect }) {
  const Icon = role.icon;
  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-[2rem] bg-gradient-to-br ${role.gradient} p-6 text-white shadow-2xl ring-1 ring-white/20`}
      style={{
        boxShadow: `0 30px 60px -20px ${role.glow}, 0 18px 40px -12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)`,
      }}
    >
      {/* Orbits */}
      <motion.div
        aria-hidden
        className="absolute -right-20 -top-20 h-56 w-56 rounded-full border border-white/15"
        animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/10"
        animate={{ rotate: -360 }} transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      />
      {/* Decor */}
      <motion.div
        aria-hidden
        animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity }}
        className="absolute right-5 top-5 text-5xl drop-shadow-lg"
      >
        {role.decor}
      </motion.div>
      <div className="relative flex h-full flex-col">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md">
          <Icon size={26} />
        </div>
        <div className="mt-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-white/80">// {role.id}</div>
          <h3 className="font-display mt-1.5 text-2xl font-semibold leading-tight">{role.label}</h3>
          <p className="mt-1 text-xs text-white/85">{role.sub}</p>
        </div>
        <p className="mt-5 text-sm leading-relaxed text-white/90">
          {role.headline}
        </p>
        <ul className="mt-4 space-y-1.5">
          {role.perks.map((p) => (
            <li key={p} className="flex items-center gap-2 text-[12px] text-white/85">
              <span className="h-1 w-1 rounded-full bg-white/80" /> {p}
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          <motion.button
            data-testid={`role-card-${role.id}-cta`}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            whileTap={{ scale: 0.96 }}
            disabled={!isActive}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-bold uppercase tracking-[0.2em] text-[#0F2042] transition ${
              isActive ? "shadow-xl hover:bg-white" : "opacity-0"
            }`}
          >
            Continue <ArrowRight size={16} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}

// ============= Intro popup =============

function IntroPopup({ slide, setSlide, onSkip }) {
  const s = SLIDES[slide];
  const Icon = s.icon;
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="intro-popup"
      data-pjx-no-anchor
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl bg-gradient-to-br from-[#FB923C] via-[#F472B6] to-[#8B5CF6] text-white shadow-2xl ring-1 ring-white/20"
      >
        <button
          onClick={onSkip}
          data-testid="intro-skip"
          className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 backdrop-blur-md hover:bg-white/20"
        >
          Skip <X size={12} />
        </button>

        {/* Animated visuals */}
        <div className="relative h-64 w-full overflow-hidden" style={{ background: `radial-gradient(circle at 50% 50%, ${s.accent}55, transparent 70%)` }}>
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="h-44 w-44 rounded-full border border-white/15" />
          </motion.div>
          <motion.div
            aria-hidden
            animate={{ rotate: -360 }} transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="h-60 w-60 rounded-full border border-white/8" />
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 1.4, opacity: 0, rotate: 20 }}
              transition={{ type: "spring", stiffness: 180, damping: 18 }}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ filter: `drop-shadow(0 12px 24px ${s.accent}aa)` }}
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-3xl"
                style={{ background: `linear-gradient(135deg, ${s.accent}, #ffffff20)` }}>
                <Icon size={44} className="text-white" />
              </div>
              <div className="absolute -right-3 -top-3 text-3xl">{s.emoji}</div>
            </motion.div>
          </AnimatePresence>

          <motion.div
            aria-hidden
            animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity }}
            className="absolute left-6 bottom-6 h-3 w-3 rounded-full bg-orange-400"
          />
          <motion.div
            aria-hidden
            animate={{ y: [0, 10, 0] }} transition={{ duration: 5, repeat: Infinity }}
            className="absolute right-10 top-10 h-2 w-2 rounded-full bg-purple-400"
          />
          <motion.div
            aria-hidden
            animate={{ y: [0, -6, 0] }} transition={{ duration: 3.4, repeat: Infinity }}
            className="absolute right-6 bottom-12 h-2 w-2 rounded-full bg-cyan-400"
          />
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div key={slide}
              initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }}
              transition={{ duration: 0.45 }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: s.accent }}>
                {slide + 1} / {SLIDES.length}
              </div>
              <h3 className="font-display mt-2 text-2xl font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{s.subtitle}</p>
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlide(i)}
                  data-testid={`intro-dot-${i}`}
                  className={`h-1.5 rounded-full transition-all ${
                    i === slide ? "w-8 bg-white" : "w-1.5 bg-white/30"
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              {slide < SLIDES.length - 1 ? (
                <button
                  onClick={() => setSlide((s) => Math.min(SLIDES.length - 1, s + 1))}
                  data-testid="intro-next"
                  className="flex items-center gap-1 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold backdrop-blur-md hover:bg-white/20"
                >
                  Next <ChevronRight size={12} />
                </button>
              ) : (
                <button
                  onClick={onSkip}
                  data-testid="intro-done"
                  className="flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-orange-500/30"
                >
                  Let's go <Rocket size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ icon: Icon, label, type, value, onChange, testId }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <div className="relative">
        <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          data-testid={testId} type={type} required value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        />
      </div>
    </label>
  );
}
