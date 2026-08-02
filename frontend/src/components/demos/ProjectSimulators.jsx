// Per-project interactive product simulators rendered inside the demo popup.
// Each simulator reacts to the `step` prop (which tile of the demoSteps is active)
// and exposes click-able UI so the visitor can actually "use" a mock of the product.

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Video, Stethoscope, Heart, Brain, Baby, Pill, Camera, Check, Phone,
  ShieldCheck, ArrowUpRight, DollarSign, Building2,
  MapPin, Truck, Clock, Activity,
  Sparkles, Zap, GraduationCap, BookOpen, MessageSquare,
  BatteryCharging, RefreshCw, Power, TrendingUp,
  ShoppingBag, Tag, Star, Plus, Minus, Send,
} from "lucide-react";

// === 1) LUMEN HEALTH — Telemedicine ============================================
function LumenHealthSim({ step, accent }) {
  const [joined, setJoined] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  useEffect(() => { setJoined(false); setUploaded(false); }, [step]);

  const specialties = [
    { icon: Heart, name: "Cardiology", free: true },
    { icon: Stethoscope, name: "GP", free: true },
    { icon: Brain, name: "Neuro", free: false },
    { icon: Baby, name: "Pediatrics", free: true },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-white p-4 shadow-inner ring-1 ring-emerald-100">
      {/* Phone-status-bar mock */}
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-700">
        <span>● Lumen Health</span>
        <span className="rounded-full bg-emerald-50 px-2 py-0.5">HIPAA · v3.2</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-3">
            <div className="text-[11px] text-slate-500">Pick a specialty</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {specialties.map((s) => (
                <motion.button
                  key={s.name}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setJoined(true)}
                  className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-2.5 text-left text-xs hover:border-emerald-400"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700"><s.icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[#0F2042]">{s.name}</div>
                    <div className={`text-[10px] font-bold ${s.free ? "text-emerald-600" : "text-amber-600"}`}>
                      {s.free ? "● 2 free now" : "● 18-min wait"}
                    </div>
                  </span>
                </motion.button>
              ))}
            </div>
            <AnimatePresence>
              {joined && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-lg"
                >
                  <Video size={14} /> Joining call… <span className="ml-auto text-[10px] opacity-80">4.2s</span>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-3 space-y-3">
            <button
              onClick={() => setUploaded(true)}
              className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 text-emerald-700 transition hover:border-emerald-500"
            >
              <Camera size={28} />
              <span className="text-xs font-bold">{uploaded ? "Symptoms uploaded ✓" : "Tap to upload symptom photos"}</span>
            </button>
            <AnimatePresence>
              {uploaded && (
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="space-y-1.5">
                  {[
                    { label: "AI Triage", val: "Dermatology — high confidence", color: "emerald" },
                    { label: "Routing", val: "Dr. Ravi (online)", color: "sky" },
                    { label: "Response ETA", val: "< 14 minutes", color: "amber" },
                  ].map((r, i) => (
                    <motion.div key={r.label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 * i }}
                      className="flex items-center justify-between rounded-lg bg-white p-2 text-xs ring-1 ring-slate-100">
                      <span className="text-slate-500">{r.label}</span>
                      <span className={`font-semibold text-${r.color}-700`}>{r.val}</span>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-3 space-y-2">
            <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <Pill size={14} /> <span className="text-[10px] font-bold uppercase tracking-wider">E-Prescription #LH-4421</span>
              </div>
              <div className="mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Patient</span><span className="font-semibold">Aisha K.</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Drug</span><span className="font-semibold">Cetirizine 10mg</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Dosage</span><span className="font-semibold">1 / day · 7 days</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pharmacy</span><span className="font-semibold text-emerald-700">Apollo · auto-sent</span></div>
              </div>
            </div>
            <motion.div animate={{ y: [0, -3, 0] }} transition={{ duration: 2.4, repeat: Infinity }}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white shadow-lg">
              <Phone size={14} /> SMS sent to patient · 48s ago
              <Check size={14} className="ml-auto" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === 2) NORTHWIND TRADE — Cross-border payments ================================
function NorthwindSim({ step }) {
  const [progress, setProgress] = useState(20);
  const [sent, setSent] = useState(false);
  useEffect(() => { setProgress(20); setSent(false); }, [step]);
  useEffect(() => {
    if (step !== 0) return;
    const id = setInterval(() => setProgress((p) => (p < 100 ? p + 8 : 100)), 280);
    return () => clearInterval(id);
  }, [step]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-sky-950 to-slate-900 p-4 text-white shadow-inner">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5"><Building2 size={12} /> Northwind · LIVE</span>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">SOC2</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="text-xs text-white/70">KYC progress — Acme Exports Ltd.</div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
              <motion.div className="h-full bg-gradient-to-r from-sky-400 to-emerald-400"
                animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
            </div>
            <div className="mt-1 text-right text-[10px] font-mono text-white/60">{progress}%</div>
            <div className="mt-3 space-y-1.5">
              {[
                { l: "Beneficial owner verified", done: progress > 30 },
                { l: "AML screening cleared", done: progress > 55 },
                { l: "Bank account linked (Plaid)", done: progress > 80 },
                { l: "Onboarding complete", done: progress >= 100 },
              ].map((r) => (
                <div key={r.l} className="flex items-center gap-2 text-xs">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${r.done ? "bg-emerald-500 text-white" : "bg-white/10 text-white/40"}`}>
                    {r.done ? <Check size={12} /> : "•"}
                  </span>
                  <span className={r.done ? "text-white" : "text-white/50"}>{r.l}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="text-[10px] uppercase tracking-wider text-white/60">You send</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold">$250,000</span>
                <span className="text-xs text-white/60">USD</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="text-white/60">FX rate</span>
                <span className="font-mono text-emerald-300">1 USD = ₹83.21</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs">
                <span className="text-white/60">Fees</span>
                <span className="font-mono text-amber-300">− $640</span>
              </div>
              <div className="my-2 border-t border-white/10" />
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white/80">Recipient gets</span>
                <span className="font-display text-lg font-bold text-emerald-300">₹2,07,49,440</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-white/60">
                <Clock size={11} /> Settles in <b className="text-white">5h 42m</b>
              </div>
              <button
                onClick={() => setSent(true)}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 py-2 text-xs font-bold text-slate-900 shadow-lg shadow-sky-900/40 active:scale-95"
              >
                {sent ? <>Initiated <Check size={14} /></> : <>Initiate transfer <ArrowUpRight size={14} /></>}
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            {[
              { t: "Initiated", time: "0s", done: true },
              { t: "FX locked · USD→INR", time: "0.4s", done: true },
              { t: "Compliance OK", time: "1.2s", done: true },
              { t: "In rails · Stripe Treasury", time: "12s", done: true, live: true },
              { t: "Cleared", time: "5h 42m", done: false },
              { t: "Final settlement", time: "ETA 5h 44m", done: false },
            ].map((r, i) => (
              <motion.div key={r.t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className={`flex items-center gap-2 rounded-lg p-2 text-xs ${r.live ? "bg-sky-500/20 ring-1 ring-sky-400/40" : "bg-white/5"}`}>
                <span className={`flex h-5 w-5 items-center justify-center rounded-full ${r.done ? "bg-emerald-500 text-white" : "bg-white/10 text-white/40"}`}>
                  {r.done ? <Check size={11} /> : "•"}
                </span>
                <span className="flex-1">{r.t}</span>
                <span className="font-mono text-[10px] text-white/50">{r.time}</span>
                {r.live && <span className="dot-pulse" style={{ background: "#38BDF8" }} />}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === 3) CINDER OPS — Field-service dispatcher =================================
function CinderSim({ step }) {
  const [dispatched, setDispatched] = useState(false);
  useEffect(() => { setDispatched(false); }, [step]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-4 shadow-inner ring-1 ring-orange-100">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-orange-700">
        <span>Cinder Ops · Dispatch</span>
        <span>● 12 crews online</span>
      </div>

      {/* Mock map */}
      <div className="relative mt-2 h-40 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_30%_40%,#FDE68A_0%,#FBBF24_45%,#F97316_100%)]">
        {/* grid */}
        <div className="absolute inset-0 opacity-30" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(0,0,0,0.06) 14px, rgba(0,0,0,0.06) 15px), repeating-linear-gradient(90deg, transparent, transparent 14px, rgba(0,0,0,0.06) 14px, rgba(0,0,0,0.06) 15px)"
        }} />
        {/* Geofence circle on step 1 */}
        <AnimatePresence>
          {step === 1 && (
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.1, 1], opacity: [0, 0.4, 0.25] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8 }}
              className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-emerald-500"
              style={{ background: "rgba(16,185,129,0.18)" }}
            />
          )}
        </AnimatePresence>
        {/* Pins */}
        {[
          { x: 24, y: 30, color: "#0F2042", label: "C-1" },
          { x: 70, y: 22, color: "#10B981", label: "C-2" },
          { x: 45, y: 60, color: "#F97316", label: "C-3" },
          { x: 80, y: 70, color: "#A855F7", label: "C-4" },
        ].map((p) => (
          <motion.div
            key={p.label}
            initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.15 + Math.random() * 0.3 }}
            style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.color }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white shadow-lg"
          >
            {p.label}
          </motion.div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-1.5">
            {[
              { c: "C-2", name: "Akash R.", skills: "Electrical · A2", eta: "4 min" },
              { c: "C-1", name: "Marta L.", skills: "Plumbing", eta: "9 min" },
            ].map((c, i) => (
              <button key={c.c} onClick={() => setDispatched(true)}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition ${i === 0 && dispatched ? "bg-emerald-500 text-white" : "bg-white ring-1 ring-orange-100 hover:ring-orange-300"}`}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-700">{c.c}</span>
                <span className="min-w-0 flex-1 text-left">
                  <div className={`truncate font-bold ${i === 0 && dispatched ? "text-white" : "text-[#0F2042]"}`}>{c.name}</div>
                  <div className={`truncate text-[10px] ${i === 0 && dispatched ? "text-white/80" : "text-slate-500"}`}>{c.skills}</div>
                </span>
                <span className={`text-[10px] font-bold ${i === 0 && dispatched ? "text-white" : "text-orange-600"}`}>{c.eta}</span>
                <Truck size={12} className={i === 0 && dispatched ? "text-white" : "text-slate-400"} />
              </button>
            ))}
            <div className="text-[10px] text-slate-500">Tap a crew to dispatch — closest, qualified.</div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 rounded-xl bg-white p-3 ring-1 ring-emerald-200">
            <div className="flex items-center gap-2 text-emerald-700">
              <Clock size={14} /> <span className="text-[10px] font-bold uppercase tracking-wider">Auto-clock-in</span>
              <span className="ml-auto text-[10px] text-slate-500">14:22</span>
            </div>
            <div className="mt-1 text-xs">
              <b className="text-[#0F2042]">Akash R.</b> entered geofence at <b>Sector 17 · MG Rd</b>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
              <div className="rounded-md bg-emerald-50 p-1.5 text-center"><div className="text-slate-500">Clock-in</div><div className="font-bold text-emerald-700">✓ auto</div></div>
              <div className="rounded-md bg-sky-50 p-1.5 text-center"><div className="text-slate-500">SLA</div><div className="font-bold text-sky-700">on-time</div></div>
              <div className="rounded-md bg-amber-50 p-1.5 text-center"><div className="text-slate-500">Photo</div><div className="font-bold text-amber-700">pending</div></div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-1.5">
            {[
              { id: "JOB-228", t: "En route", color: "sky" },
              { id: "JOB-229", t: "On-site", color: "emerald" },
              { id: "JOB-230", t: "SLA risk", color: "rose" },
              { id: "JOB-231", t: "Complete", color: "slate" },
            ].map((j) => (
              <div key={j.id} className="flex items-center justify-between rounded-md bg-white p-2 text-xs ring-1 ring-slate-100">
                <span className="font-mono text-slate-500">{j.id}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold bg-${j.color}-50 text-${j.color}-700`}>{j.t}</span>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === 4) HELIX LEARNING — Adaptive AI tutor ===================================
function HelixSim({ step }) {
  const [thinking, setThinking] = useState(false);
  const [answered, setAnswered] = useState(null);
  const [diff, setDiff] = useState(2);
  useEffect(() => { setThinking(false); setAnswered(null); setDiff(2); }, [step]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-950 to-violet-950 p-4 text-white shadow-inner">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5"><GraduationCap size={12} /> Helix · AI tutor</span>
        <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-violet-200">Grade 8 · Math</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-500/30 text-xs font-bold">A</span>
              <div className="rounded-2xl rounded-tl-sm bg-white/10 p-2.5 text-xs">Why does (a+b)² = a² + 2ab + b²?</div>
            </div>
            <button
              onClick={() => { setThinking(true); setTimeout(() => setThinking(false), 1200); }}
              className="ml-9 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-[10px] font-bold shadow-lg"
            >
              <Sparkles size={11} /> {thinking ? "Thinking…" : "Ask the tutor"}
            </button>
            <div className="flex items-start gap-2">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs"><Sparkles size={13} /></span>
              <div className="rounded-2xl rounded-tl-sm bg-white/10 p-2.5 text-xs">
                Imagine a square of side <b>a + b</b>. Slice it…
                <div className="mt-2 flex gap-1">
                  {["Text", "Whiteboard", "Voice"].map((m, i) => (
                    <span key={m} className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${i === 1 ? "bg-violet-400 text-violet-950" : "bg-white/10 text-white/70"}`}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-violet-200">Practice · level {diff}</div>
              <div className="mt-1 font-display text-base font-semibold">If x² = 49, what is x?</div>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {[
                  { v: "7", correct: true },
                  { v: "−7", correct: false },
                  { v: "±7", correct: false },
                  { v: "14", correct: false },
                ].map((o, i) => (
                  <button key={i} onClick={() => {
                    setAnswered(o.correct ? "right" : "wrong");
                    setDiff((d) => o.correct ? Math.min(5, d + 1) : Math.max(1, d - 1));
                  }}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                      answered && o.correct ? "bg-emerald-500 text-white" :
                      answered === "wrong" && !o.correct && o.v === "±7" ? "bg-amber-500 text-white" :
                      "bg-white/10 hover:bg-white/20"
                    }`}>{o.v}</button>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-violet-200">
                Difficulty <b>{diff}/5</b> — {answered === "right" ? "Levelling up ↑" : answered === "wrong" ? "Easing down ↓" : "Adapts after your answer"}
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-violet-200">Class 8A · Algebra mastery</div>
            <div className="mt-2 grid grid-cols-6 gap-0.5">
              {Array.from({ length: 36 }).map((_, i) => {
                const m = (i * 13) % 4;
                const c = ["#10B981", "#FBBF24", "#A78BFA", "#EF4444"][m];
                return <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }} className="h-5 w-5 rounded" style={{ background: c }} />;
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-[9px]">
              {[["#10B981", "Mastered"], ["#FBBF24", "Practising"], ["#A78BFA", "Started"], ["#EF4444", "Struggling"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1"><span className="h-2 w-2 rounded" style={{ background: c }} />{l}</span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === 5) VOLTLINE MOBILITY — EV charging ops ==================================
function VoltlineSim({ step }) {
  const [rebooting, setRebooting] = useState(false);
  const [rebooted, setRebooted] = useState(false);
  const [surge, setSurge] = useState(12);
  useEffect(() => { setRebooting(false); setRebooted(false); setSurge(12); }, [step]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950 to-fuchsia-900 p-4 text-white shadow-inner">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="flex items-center gap-1.5"><BatteryCharging size={12} /> Voltline · Ops</span>
        <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-fuchsia-200">1,237 stations</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="relative h-32 overflow-hidden rounded-xl"
              style={{ background: "radial-gradient(ellipse at 40% 30%, #4C1D95 0%, #1E1B4B 60%, #0F0524 100%)" }}>
              {[
                { x: 18, y: 30, s: "free" }, { x: 52, y: 18, s: "free" },
                { x: 78, y: 35, s: "busy" }, { x: 35, y: 60, s: "free" },
                { x: 65, y: 72, s: "busy" }, { x: 88, y: 65, s: "offline" },
              ].map((p, i) => (
                <motion.div key={i}
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: i * 0.1 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                    p.s === "free" ? "bg-emerald-400 text-emerald-950" :
                    p.s === "busy" ? "bg-amber-400 text-amber-950" :
                    "bg-rose-400 text-rose-950"
                  } shadow-lg`}>⚡</span>
                  {p.s === "free" && <span className="dot-pulse absolute inset-0" style={{ background: "rgba(52,211,153,0.5)" }} />}
                </motion.div>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-white/10 p-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span>Nearest free</span>
                <span className="font-bold text-emerald-300">Magrath Rd · 1.2km</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-white/60">Predicted free in</span>
                <span className="font-mono text-amber-300">8 min · 95% conf</span>
              </div>
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-3">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="text-[10px] uppercase tracking-wider text-fuchsia-200">Tariff · Whitefield Hub</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">₹{surge}</span>
                <span className="text-xs text-white/60">/kWh</span>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                  <TrendingUp size={10} /> {surge > 12 ? "Surge" : "Normal"}
                </span>
              </div>
              <input
                type="range" min={8} max={22} value={surge} onChange={(e) => setSurge(+e.target.value)}
                className="mt-3 w-full accent-fuchsia-400"
              />
              <div className="mt-1 flex justify-between text-[10px] text-white/50">
                <span>Off-peak ₹8</span><span>Peak ₹22</span>
              </div>
            </div>
            <div className="text-[10px] text-fuchsia-200">Drag to simulate live surge pricing</div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
            <div className="rounded-xl bg-white/10 p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${rebooted ? "bg-emerald-400" : rebooting ? "bg-amber-400 animate-pulse" : "bg-rose-400"}`} />
                <span className="text-xs font-bold">Charger #VL-887 · MG Rd</span>
                <span className="ml-auto text-[10px] text-white/60">OCPP 2.0.1</span>
              </div>
              <div className="mt-2 text-[10px] text-white/60">
                Status: <b className={rebooted ? "text-emerald-300" : rebooting ? "text-amber-300" : "text-rose-300"}>
                  {rebooted ? "Online · ready" : rebooting ? "Rebooting…" : "Offline · firmware fault"}
                </b>
              </div>
              <button
                disabled={rebooting || rebooted}
                onClick={() => { setRebooting(true); setTimeout(() => { setRebooting(false); setRebooted(true); }, 2200); }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-500 to-purple-500 py-2 text-xs font-bold shadow-lg disabled:opacity-60"
              >
                {rebooted ? <><Check size={13} /> Recovered</> :
                 rebooting ? <><RefreshCw size={13} className="animate-spin" /> Sending OCPP reset</> :
                 <><Power size={13} /> Remote reboot</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === 6) STRATUS COMMERCE — Personalised D2C storefront =======================
const PRODUCTS = [
  { id: "p1", name: "Aurora Hoodie", price: 89, ranked: "Top pick", img: "🧥" },
  { id: "p2", name: "Drift Joggers", price: 64, ranked: "Pairs well", img: "👖" },
  { id: "p3", name: "Cloud Sneakers", price: 129, ranked: "New" , img: "👟" },
];
function StratusSim({ step }) {
  const [bundle, setBundle] = useState([]);
  const [freq, setFreq] = useState("monthly");
  useEffect(() => { setBundle([]); setFreq("monthly"); }, [step]);
  const bundleTotal = bundle.reduce((s, id) => s + (PRODUCTS.find((p) => p.id === id)?.price || 0), 0);
  const discount = bundle.length >= 2 ? Math.round(bundleTotal * 0.15) : 0;
  const subscriptionPrice = { weekly: 86, monthly: 75, quarterly: 65 }[freq];

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-amber-50 p-4 shadow-inner ring-1 ring-amber-100">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-amber-700">
        <span className="flex items-center gap-1.5"><ShoppingBag size={12} /> Stratus · Studio</span>
        <span>For: Aisha · returning</span>
      </div>

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            {PRODUCTS.map((p, i) => (
              <motion.div key={p.id}
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}
                className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-amber-100">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-100 text-2xl">{p.img}</span>
                <span className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-[#0F2042]">{p.name}</span>
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                      <Star size={9} fill="currentColor" /> {p.ranked}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">${p.price}</div>
                </span>
                <button className="rounded-full bg-[#0F2042] px-2.5 py-1 text-[10px] font-bold text-white">Add</button>
              </motion.div>
            ))}
            <div className="rounded-lg bg-amber-100/60 p-2 text-[10px] text-amber-800">
              <b>Personalised:</b> ranking adapts to last 30 sessions.
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            <div className="text-[10px] text-slate-500">Tap products to add to bundle:</div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRODUCTS.map((p) => {
                const on = bundle.includes(p.id);
                return (
                  <button key={p.id} onClick={() => setBundle((b) => on ? b.filter((x) => x !== p.id) : [...b, p.id])}
                    className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] transition ${on ? "bg-amber-500 text-white ring-2 ring-amber-700" : "bg-white text-slate-700 ring-1 ring-amber-100 hover:ring-amber-300"}`}>
                    <span className="text-xl">{p.img}</span>
                    <span className="truncate font-bold">${p.price}</span>
                    {on ? <Minus size={10} /> : <Plus size={10} />}
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl bg-white p-3 ring-1 ring-amber-100">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Subtotal</span><span className="font-bold">${bundleTotal}</span></div>
              <div className="flex justify-between text-xs text-amber-700"><span><Tag size={10} className="mr-1 inline" />Bundle saving</span><span className="font-bold">− ${discount}</span></div>
              <div className="my-1 border-t border-slate-100" />
              <div className="flex justify-between text-sm font-bold text-[#0F2042]"><span>Total</span><span>${bundleTotal - discount}</span></div>
              {bundle.length >= 2 && <div className="mt-1 text-[10px] font-bold text-emerald-600">✓ Free shipping unlocked</div>}
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3 space-y-2">
            <div className="rounded-xl bg-white p-3 ring-1 ring-amber-100">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🧥</span>
                <div>
                  <div className="text-sm font-bold text-[#0F2042]">Aurora Hoodie</div>
                  <div className="text-[10px] text-slate-500">Refill subscription</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {[
                  { v: "weekly", l: "Weekly", p: 86 },
                  { v: "monthly", l: "Monthly", p: 75 },
                  { v: "quarterly", l: "Quarterly", p: 65 },
                ].map((o) => (
                  <button key={o.v} onClick={() => setFreq(o.v)}
                    className={`rounded-lg p-2 text-[10px] transition ${o.v === freq ? "bg-amber-500 text-white ring-2 ring-amber-700" : "bg-amber-50 text-slate-700 ring-1 ring-amber-100"}`}>
                    <div className="font-bold">{o.l}</div>
                    <div className={`mt-0.5 ${o.v === freq ? "text-white" : "text-amber-700"}`}>${o.p}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">First charge today</span>
                <span className="font-bold text-[#0F2042]">${subscriptionPrice}</span>
              </div>
              <button className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 py-2 text-xs font-bold text-white shadow-lg">
                <Send size={12} /> Confirm subscription
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// === Router ===
export default function ProductSimulator({ slug, step }) {
  const map = {
    "lumen-health":     LumenHealthSim,
    "northwind-trade":  NorthwindSim,
    "cinder-ops":       CinderSim,
    "helix-learning":   HelixSim,
    "voltline-mobility": VoltlineSim,
    "stratus-commerce": StratusSim,
  };
  const Sim = map[slug];
  if (!Sim) return null;
  return (
    <div data-testid={`sim-${slug}`} className="h-full w-full">
      <Sim step={step} />
    </div>
  );
}
