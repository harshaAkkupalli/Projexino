/**
 * Login.jsx — Unified, AI-themed 3D login.
 *
 * Single screen for every role. RBAC inside the portal decides what each
 * user can see — this screen is intentionally identical for everyone.
 *
 * AI-themed 3D scene (react-three-fiber):
 *   • A glowing wireframe "neural core" icosahedron at the centre.
 *   • A constellation of small floating cubes orbiting the core (data nodes).
 *   • Soft inner glow sphere with emissive cyan/amber.
 *   • Auto-rotate at a calm rate so the scene feels alive without distracting.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Mail, Lock, Eye, EyeOff, Sparkles, ShieldCheck, Brain, X, User, Phone, MessageSquare, CheckCircle2, Send } from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import Logo from "@/components/Logo";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { api, formatApiError } from "@/lib/api";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "admin@projexino.com",   pw: "Projexino@2026" },
  { role: "Manager",     email: "manager@projexino.com", pw: "Manager@2026"   },
  { role: "HR",          email: "hr@projexino.com",      pw: "HR@2026"        },
  { role: "Intern",      email: "intern@projexino.com",  pw: "Intern@2026"    },
  { role: "Team Member", email: "member@projexino.com",  pw: "Member@2026"    },
];

// ── AI-themed 3D pieces ────────────────────────────────────────────────
function NeuralCore() {
  const ref = useRef();
  useFrame((state, delta) => {
    if (!ref.current) return;
    ref.current.rotation.x += delta * 0.18;
    ref.current.rotation.y += delta * 0.22;
  });
  return (
    <group ref={ref}>
      {/* Glowing inner sphere — saturated for light backgrounds */}
      <mesh>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshStandardMaterial color="#FB923C" emissive="#F97316" emissiveIntensity={1.2} metalness={0.5} roughness={0.18} />
      </mesh>
      {/* Wireframe shell — magenta to pop against pastel bg */}
      <mesh>
        <icosahedronGeometry args={[1.4, 1]} />
        <meshStandardMaterial color="#EC4899" wireframe transparent opacity={0.95} />
      </mesh>
      {/* Outer cyan lattice */}
      <mesh>
        <icosahedronGeometry args={[2.0, 0]} />
        <meshStandardMaterial color="#06B6D4" wireframe transparent opacity={0.6} />
      </mesh>
    </group>
  );
}

function DataNode({ pos, color }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    ref.current.rotation.x = t * 0.6;
    ref.current.rotation.y = t * 0.4;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.6} floatIntensity={1.2}>
      <mesh ref={ref} position={pos}>
        <boxGeometry args={[0.34, 0.34, 0.34]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.45} metalness={0.85} roughness={0.18} />
      </mesh>
    </Float>
  );
}

function BackgroundScene() {
  // 8 floating "data nodes" around the central neural core
  const nodes = useMemo(() => ([
    { pos: [-3.4, 1.6, -1.2], color: "#FBBF24" },
    { pos: [3.6, -0.9, -1.8], color: "#22D3EE" },
    { pos: [-2.8, -2.0, -2.0], color: "#F472B6" },
    { pos: [3.0, 2.4, -2.6], color: "#A78BFA" },
    { pos: [-4.2, -0.4, -2.8], color: "#34D399" },
    { pos: [4.4, 0.7, -3.0], color: "#FB923C" },
    { pos: [0.4, 3.0, -3.2], color: "#60A5FA" },
    { pos: [-0.6, -3.0, -3.4], color: "#F9A8D4" },
  ]), []);
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas camera={{ position: [0, 0, 6.2], fov: 60 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 5, 5]} intensity={1.1} />
        <pointLight position={[-5, -3, 4]} intensity={0.85} color="#FBBF24" />
        <pointLight position={[4, 4, -2]} intensity={0.55} color="#22D3EE" />
        <NeuralCore />
        {nodes.map((n, i) => <DataNode key={i} pos={n.pos} color={n.color} />)}
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.42} />
      </Canvas>
    </div>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);

  useEffect(() => {
    api.get("/settings/public").then(({ data }) => setShowDemo(!!data.show_demo_creds)).catch(() => {});
  }, []);

  if (user && user !== false) {
    return <Navigate to={user.role === "intern" ? "/intern" : "/app"} replace />;
  }

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email || !password) { toast.error("Please enter your email and password"); return; }
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (result) {
      toast.success("Welcome back", { duration: 1500 });
      // Derive route from the login response directly (avoid localStorage races).
      const role = result?.role || JSON.parse(localStorage.getItem("pj_role") || '""');
      setTimeout(() => navigate(role === "intern" ? "/intern" : "/app"), 80);
    } else {
      toast.error("Invalid credentials — please try again");
    }
  };

  const fillDemo = (acc) => {
    setEmail(acc.email);
    setPassword(acc.pw);
    setDemoOpen(false);
  };

  return (
    <div data-testid="page-login" className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#FFF1E6] via-[#FFE4F1] to-[#E9DFFF] text-[#0F2042]">
      {/* Kill browser autofill grey/blue background */}
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
          -webkit-text-fill-color: #1e293b !important;
          transition: background-color 600000s 0s, color 600000s 0s;
          background-color: #ffffff !important;
        }
      `}</style>
      {/* Vibrant rotating mesh background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <motion.div className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 12% 18%, rgba(251,146,60,0.55), transparent 35%)," +
              "radial-gradient(circle at 85% 22%, rgba(244,114,182,0.45), transparent 38%)," +
              "radial-gradient(circle at 78% 88%, rgba(34,211,238,0.45), transparent 38%)," +
              "radial-gradient(circle at 18% 82%, rgba(167,139,250,0.45), transparent 38%)",
          }}
          animate={{ rotate: [0, 6, 0] }} transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
      <BackgroundScene />

      {/* Top-left brand strip */}
      <div className="absolute left-6 top-6 z-30 flex items-center gap-3 rounded-2xl bg-white/95 px-4 py-2.5 shadow-[0_12px_32px_rgba(15,23,42,0.18)] ring-1 ring-white/60 backdrop-blur-md md:left-10 md:top-8">
        <Logo size={36} asLink={true} />
        <div className="hidden flex-col leading-tight sm:flex">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// PROJEXINO</span>
          <span className="text-[10px] font-medium text-slate-500">Workspace OS</span>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-8 p-6 lg:grid lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:p-12">
        {/* Brand block */}
        <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}
          className="hidden flex-col gap-6 lg:flex">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#F97316]/30 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F97316] shadow-sm backdrop-blur-sm">
            <Brain size={12}/> AI-native workspace
          </div>
          <h1 className="font-display max-w-xl text-5xl font-medium leading-[1.05] text-[#0F2042] lg:text-6xl">
            Your whole workspace.
            <span className="block bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#A855F7] bg-clip-text italic text-transparent">
              One sign-in.
            </span>
          </h1>
          <p className="max-w-md text-base text-slate-700">
            Projects, leads, finance, chat, AI, presence — every team&apos;s cockpit. RBAC adapts the experience to your role automatically.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[#F97316] shadow-sm ring-1 ring-[#F97316]/20 backdrop-blur">
              <Sparkles size={13}/> AI co-pilot built-in
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-emerald-700 shadow-sm ring-1 ring-emerald-300/40 backdrop-blur">
              <ShieldCheck size={13}/> Audit-grade RBAC
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-cyan-700 shadow-sm ring-1 ring-cyan-300/40 backdrop-blur">
              <Brain size={13}/> Neural workflows
            </span>
          </div>
        </motion.div>

        {/* Login card */}
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 30, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          style={{ transformPerspective: 1000 }}
          whileHover={{ rotateX: -1, rotateY: 1 }}
          className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_-20px_rgba(15,23,42,0.35)] backdrop-blur-xl"
          data-testid="login-form"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F97316] ring-1 ring-orange-200">
                <Sparkles size={10}/> Sign in
              </div>
              <h2 className="mt-2 font-display text-2xl font-medium text-[#0F2042]">Welcome back.</h2>
              <p className="mt-1 text-xs text-slate-500">Use the credentials your HR team shared with you.</p>
            </div>
            <div className="flex h-14 w-14 items-center justify-center">
              <img src="/projexino-logo.png"
                alt="Projexino" className="h-12 w-auto object-contain"/>
            </div>
          </div>

          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Email</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-orange-100">
              <Mail size={16} className="text-slate-400"/>
              <input
                data-testid="login-email"
                type="email" autoComplete="username"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@projexino.com"
                style={{ WebkitBoxShadow: "0 0 0 1000px #ffffff inset", WebkitTextFillColor: "#1e293b" }}
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"
              />
            </div>
          </label>

          <label className="mt-4 block">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Password</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-orange-100">
              <Lock size={16} className="text-slate-400"/>
              <input
                data-testid="login-password"
                type={show ? "text" : "password"} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ WebkitBoxShadow: "0 0 0 1000px #ffffff inset", WebkitTextFillColor: "#1e293b" }}
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"
              />
              <button type="button" onClick={() => setShow(!show)} aria-label="Toggle password visibility"
                className="rounded-md p-1 text-slate-400 transition hover:text-slate-700">
                {show ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            data-testid="login-submit"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F97316] via-[#EC4899] to-[#A855F7] px-5 py-3 text-sm font-bold text-white shadow-[0_12px_30px_-8px_rgba(236,72,153,0.55)] transition hover:shadow-[0_18px_40px_-10px_rgba(236,72,153,0.65)] active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16}/>
          </button>

          {showDemo && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setDemoOpen((o) => !o)} data-testid="login-demo-toggle"
                className="flex w-full items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
                <span className="flex items-center gap-2"><Sparkles size={12} className="text-[#F97316]"/> Try a demo account</span>
                <span className="text-slate-400">{demoOpen ? "Hide" : "Show"}</span>
              </button>
              <AnimatePresence>
                {demoOpen && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="mt-2 space-y-1 overflow-hidden">
                    {DEMO_ACCOUNTS.map((a) => (
                      <button key={a.email} type="button" onClick={() => fillDemo(a)}
                        data-testid={`login-demo-${a.role.toLowerCase().replace(" ", "-")}`}
                        className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
                        <span className="font-bold">{a.role}</span>
                        <span className="font-mono text-[10px] text-slate-400">{a.email}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          <div className="mt-6 text-center text-xs text-slate-500">
            New here?{" "}
            <button type="button" onClick={() => setRequestOpen(true)} data-testid="login-request-account"
              className="font-bold text-[#F97316] transition hover:text-[#EA580C]">
              Request an account
            </button>
            {"  ·  "}
            <Link to="/forgot-password" className="font-bold text-[#F97316] transition hover:text-[#EA580C]">Forgot password?</Link>
          </div>
        </motion.form>
      </div>

      <div className="relative z-10 px-6 pb-6 text-center text-[10px] uppercase tracking-[0.32em] text-slate-500">
        // PROJEXINO · WORKSPACE OS
      </div>

      <AnimatePresence>
        {requestOpen && <RequestAccountModal onClose={() => setRequestOpen(false)}/>}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// Request-an-account modal
// ──────────────────────────────────────────────────────────────────
function RequestAccountModal({ onClose }) {
  const [form, setForm] = useState({ name: "", email: "", mobile: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!form.name.trim() || !form.email.trim() || form.reason.trim().length < 10) {
      toast.error("Please share your name, email, and a brief reason (min 10 chars)");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/request-account", form);
      setDone(true);
    } catch (e) {
      toast.error(formatApiError(e));
    }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4"
      data-testid="login-request-modal">
      <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96 }}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-[#F97316] via-[#EC4899] to-[#A855F7] p-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">// Request access</div>
              <h3 className="mt-1 font-display text-2xl font-medium">Tell us a bit about you</h3>
              <p className="mt-1 text-xs text-white/85">Our admin team reviews requests within 1 business day.</p>
            </div>
            <button onClick={onClose} className="rounded-full bg-white/20 p-1.5 text-white hover:bg-white/30" data-testid="login-request-close"><X size={18}/></button>
          </div>
        </div>
        {done ? (
          <div className="p-7 text-center" data-testid="login-request-success">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-4 ring-emerald-100"><CheckCircle2 size={32}/></div>
            <h4 className="font-display text-xl text-[#0F2042]">Request sent ✨</h4>
            <p className="mt-2 text-sm text-slate-600">Thanks — we&apos;ve emailed our team. You&apos;ll hear back at <b>{form.email}</b> shortly.</p>
            <button onClick={onClose} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#0F2042] px-5 py-2 text-xs font-bold text-white">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 p-6">
            <ReqField label="Full name *" icon={User}>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Priya Sharma"
                data-testid="login-request-name"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"/>
            </ReqField>
            <ReqField label="Work email *" icon={Mail}>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com"
                data-testid="login-request-email"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"/>
            </ReqField>
            <ReqField label="Mobile (optional)" icon={Phone}>
              <input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="+91 98xxxxxxxx"
                data-testid="login-request-mobile"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"/>
            </ReqField>
            <ReqField label="Why do you need access? *" icon={MessageSquare}>
              <textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="I am the project lead at Acme and we are starting an engagement…"
                data-testid="login-request-reason"
                className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-300"/>
            </ReqField>
            <button type="submit" disabled={busy} data-testid="login-request-submit"
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#F97316] to-[#EC4899] px-5 py-3 text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-60">
              {busy ? "Sending…" : <>Send request <Send size={14}/></>}
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

function ReqField({ label, icon: Icon, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      <div className="mt-1 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition focus-within:border-[#F97316] focus-within:ring-2 focus-within:ring-orange-100">
        <Icon size={15} className="mt-0.5 text-slate-400"/>
        {children}
      </div>
    </label>
  );
}
