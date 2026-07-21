import { useEffect, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Play, X, Check, ArrowRight, Sparkles, Zap, Shield, Target,
  Clock, Layers, ChevronLeft, ChevronRight, ExternalLink,
} from "lucide-react";
import { Canvas } from "@react-three/fiber";
import { Float, OrbitControls } from "@react-three/drei";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { getProjectBySlug, PROJECTS } from "@/data/portfolioProjects";
import ProductSimulator from "@/components/demos/ProjectSimulators";

function HeroOrbs({ accent }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <Canvas camera={{ position: [0, 0, 6], fov: 55 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 4, 5]} intensity={1} />
        <Float speed={1.3} rotationIntensity={1.3} floatIntensity={1.8}>
          <mesh position={[-2.6, 1.1, 0]}>
            <torusKnotGeometry args={[0.7, 0.22, 80, 16]} />
            <meshStandardMaterial color={accent} metalness={0.65} roughness={0.2} />
          </mesh>
        </Float>
        <Float speed={1} rotationIntensity={1.1} floatIntensity={1.4}>
          <mesh position={[2.8, -0.5, -1]}>
            <icosahedronGeometry args={[0.85, 0]} />
            <meshStandardMaterial color="#FFFFFF" metalness={0.7} roughness={0.1} />
          </mesh>
        </Float>
        <Float speed={1.6} rotationIntensity={1.5} floatIntensity={2}>
          <mesh position={[0.5, 1.9, -1.5]}>
            <octahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial color={accent} metalness={0.7} roughness={0.18} />
          </mesh>
        </Float>
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.55} />
      </Canvas>
    </div>
  );
}

export default function ProjectDemo() {
  const { slug } = useParams();
  const project = getProjectBySlug(slug);
  const [demoOpen, setDemoOpen] = useState(false);

  if (!project) return <Navigate to="/portfolio" replace />;

  const others = PROJECTS.filter((p) => p.slug !== slug).slice(0, 3);

  return (
    <div data-testid={`page-demo-${project.slug}`} className="relative min-h-screen bg-canvas-rose text-[#0F172A]">
      <SEO
        title={`${project.title} — Case Study | Projexino`}
        description={project.summary || project.tagline || `Case study for ${project.title} built by Projexino.`}
        canonical={`/portfolio/${project.slug}`}
        image={project.cover || project.hero || undefined}
        ogType="article"
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          "name": project.title,
          "url": `https://www.projexino.com/portfolio/${project.slug}`,
          "creator": { "@type": "Organization", "name": "Projexino" },
          "description": project.summary || project.tagline,
        }}
      />
      <Navbar />

      {/* HERO */}
      <section className="relative overflow-hidden pt-28 pb-16">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background: `linear-gradient(135deg, ${project.accent}22 0%, transparent 50%), radial-gradient(60% 50% at 80% 10%, ${project.accent}33, transparent 70%)`,
          }}
        />
        <HeroOrbs accent={project.accent} />
        <div className="relative mx-auto max-w-7xl px-6">
          <Link
            to="/portfolio"
            data-testid="demo-back-link"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F2042]/70 hover:text-[#0F2042]"
          >
            <ArrowLeft size={14} /> Back to portfolio
          </Link>
          <div className="mt-6 grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
            <div>
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em]"
                style={{ borderColor: `${project.accent}55`, background: `${project.accent}15`, color: project.accent }}
              >
                <Sparkles size={11} /> {project.tag}
              </span>
              <h1 className="font-display mt-4 text-5xl font-medium leading-tight text-[#0F2042] md:text-6xl">
                {project.name}
              </h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-700">
                {project.summary}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  data-testid="demo-launch-btn"
                  onClick={() => setDemoOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-xl transition active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${project.accent}, ${project.accent}cc)`,
                    boxShadow: `0 22px 40px -10px ${project.accent}80`,
                  }}
                >
                  <Play size={16} /> Try the live demo
                </button>
                <a
                  href="https://contact.projexino.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/80 px-6 py-3 text-sm font-semibold text-[#0F2042] backdrop-blur transition hover:border-[#0F2042]"
                >
                  Request case study <ExternalLink size={14} />
                </a>
              </div>
            </div>

            {/* Cover image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
              className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-2xl"
            >
              <img src={project.image} alt={project.name} className="h-72 w-full object-cover md:h-96" />
              <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${project.accent}30, transparent 60%)` }} />
            </motion.div>
          </div>
        </div>
      </section>

      {/* METRICS */}
      <section className="relative pb-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {project.metrics.map((m, i) => (
              <motion.div
                key={m.l}
                initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="font-display text-4xl font-semibold" style={{ color: project.accent }}>
                  {m.v}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{m.l}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CHALLENGE / SOLUTION */}
      <section className="py-16">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-2">
          <motion.div
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="rounded-3xl border border-slate-200 bg-white p-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-rose-600">
              <Target size={11} /> The Challenge
            </div>
            <p className="mt-4 text-lg leading-relaxed text-slate-700">{project.challenge}</p>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            transition={{ delay: 0.08 }}
            className="rounded-3xl border border-slate-200 bg-white p-8"
          >
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em]"
              style={{ background: `${project.accent}15`, color: project.accent }}
            >
              <Zap size={11} /> What We Built
            </div>
            <ul className="mt-4 space-y-3">
              {project.solution.map((s) => (
                <li key={s} className="flex gap-3 text-slate-700">
                  <Check size={18} className="mt-0.5 flex-shrink-0" style={{ color: project.accent }} />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* TECH STACK + TIMELINE */}
      <section className="py-12">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
              <Layers size={11} /> Tech stack
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {project.stack.map((s) => (
                <span
                  key={s}
                  className="rounded-full border px-3 py-1.5 text-xs font-mono-pj"
                  style={{ borderColor: `${project.accent}55`, background: `${project.accent}10`, color: project.accent }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-600">
              <Clock size={11} /> Engagement
            </div>
            <p className="mt-3 text-base font-medium text-[#0F2042]">{project.timeline}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
              <Shield size={12} /> NDA-protected, references on request.
            </div>
          </div>
        </div>
      </section>

      {/* OTHER PROJECTS */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-3xl font-medium text-[#0F2042]">More case studies</h2>
            <Link to="/portfolio" className="text-sm font-semibold text-[#F97316] hover:underline">View all →</Link>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {others.map((p) => (
              <Link
                key={p.slug}
                to={`/portfolio/${p.slug}`}
                data-testid={`demo-related-${p.slug}`}
                className="group overflow-hidden rounded-3xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="relative h-40 overflow-hidden">
                  <img src={p.image} alt={p.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${p.accent}30, transparent 60%)` }} />
                </div>
                <div className="p-5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: p.accent }}>{p.tag}</div>
                  <div className="font-display mt-1 text-lg font-semibold text-[#0F2042]">{p.name}</div>
                  <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#F97316]">
                    Experience demo <ArrowRight size={12} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />

      {/* DEMO POPUP */}
      <AnimatePresence>
        {demoOpen && <DemoExperienceModal project={project} onClose={() => setDemoOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}

// =================== Interactive Demo Modal ===================
function DemoExperienceModal({ project, onClose }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const total = project.demoSteps.length;
  const cur = project.demoSteps[step];

  const next = () => (step < total - 1 ? setStep((s) => s + 1) : setDone(true));
  const prev = () => step > 0 && setStep((s) => s - 1);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="demo-experience-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.92, y: 18 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {/* Top gradient bar */}
        <div
          className="relative h-2"
          style={{ background: `linear-gradient(90deg, ${project.accent} 0%, ${project.accent}aa 100%)` }}
        >
          <motion.div
            className="absolute inset-y-0 left-0 bg-white/30"
            initial={{ width: "0%" }}
            animate={{ width: `${((done ? total : step + 1) / total) * 100}%` }}
            transition={{ duration: 0.45 }}
          />
        </div>

        <button
          onClick={onClose}
          data-testid="demo-modal-close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow hover:text-[#0F2042]"
        >
          <X size={18} />
        </button>

        <div className="grid gap-0 md:grid-cols-[1.05fr_1fr]">
          {/* LEFT — Real interactive product simulator */}
          <div
            className="relative flex items-stretch justify-center overflow-hidden p-4 md:p-6"
            style={{ background: `linear-gradient(160deg, ${project.accent}22, ${project.accent}08 60%, ${project.accent}03)` }}
          >
            {/* decorative orbits */}
            <motion.div aria-hidden
              className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rounded-full border"
              style={{ borderColor: `${project.accent}40` }}
              animate={{ rotate: 360 }} transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
            />
            <motion.div aria-hidden
              className="pointer-events-none absolute -bottom-12 -left-10 h-32 w-32 rounded-full border"
              style={{ borderColor: `${project.accent}30` }}
              animate={{ rotate: -360 }} transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
            />

            <AnimatePresence mode="wait">
              {!done ? (
                <motion.div
                  key={`sim-${step}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4, type: "spring", stiffness: 200, damping: 24 }}
                  className="relative z-10 flex w-full max-w-sm flex-col"
                >
                  <ProductSimulator slug={project.slug} step={step} />
                  <div className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow"
                    style={{ color: project.accent }}>
                    <Play size={10} /> Interactive · step {step + 1}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="done"
                  initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="relative z-10 flex flex-col items-center justify-center"
                >
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-full text-white shadow-2xl"
                    style={{ background: project.accent, boxShadow: `0 24px 50px -8px ${project.accent}80` }}
                  >
                    <Check size={48} strokeWidth={3} />
                  </div>
                  <div className="font-display mt-4 text-2xl font-semibold text-[#0F2042]">You've seen the magic.</div>
                  <div className="mt-1 text-sm text-slate-600">Want it for your business?</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT — Copy + controls */}
          <div className="flex flex-col p-7">
            <div className="text-[10px] font-bold uppercase tracking-[0.32em]" style={{ color: project.accent }}>
              {project.name} · interactive demo
            </div>
            {!done ? (
              <>
                <h3 className="font-display mt-2 text-2xl font-medium text-[#0F2042]">{cur.title}</h3>
                <p className="mt-3 leading-relaxed text-slate-600">{cur.body}</p>
                <div className="mt-5 space-y-2">
                  {project.demoSteps.map((s, i) => (
                    <button
                      key={s.title}
                      onClick={() => setStep(i)}
                      data-testid={`demo-step-${i}`}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-xs transition ${
                        i === step
                          ? "border-transparent text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                      style={i === step ? { background: project.accent } : undefined}
                    >
                      <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        i === step ? "bg-white" : "bg-slate-100 text-slate-500"
                      }`}
                      style={i === step ? { color: project.accent } : undefined}>{i + 1}</span>
                      <span className="truncate">{s.title}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <button
                    onClick={prev}
                    disabled={step === 0}
                    data-testid="demo-prev-step"
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 disabled:opacity-30"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="text-xs font-semibold text-slate-500">
                    {step + 1} / {total}
                  </div>
                  <button
                    onClick={next}
                    data-testid="demo-next-step"
                    className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg active:scale-95"
                    style={{ background: project.accent, boxShadow: `0 12px 24px -8px ${project.accent}80` }}
                  >
                    {step === total - 1 ? "Finish" : "Next"} <ChevronRight size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col">
                <h3 className="font-display mt-2 text-2xl font-medium text-[#0F2042]">Like what you saw?</h3>
                <p className="mt-3 text-slate-600">
                  This is a small slice of <b>{project.name}</b>. We'd love to walk you through the real platform and discuss how a similar build could move your numbers.
                </p>
                <div className="mt-auto flex flex-col gap-2 pt-6 sm:flex-row">
                  <a
                    href="https://contact.projexino.com/"
                    target="_blank"
                    rel="noreferrer"
                    data-testid="demo-cta-contact"
                    className="flex flex-1 items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-lg"
                    style={{ background: project.accent, boxShadow: `0 16px 28px -8px ${project.accent}80` }}
                  >
                    Start a similar project <ArrowRight size={16} />
                  </a>
                  <button
                    onClick={onClose}
                    data-testid="demo-cta-close"
                    className="flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
