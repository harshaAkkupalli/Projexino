import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, X, Download, ArrowRight, ChevronLeft,
  Globe, Smartphone, Apple, Code2, Briefcase, Clock, IndianRupee,
  DollarSign, CheckCircle2, AlertTriangle, Rocket, Zap, FileDown,
} from "lucide-react";
import { toast } from "sonner";
import XinoLogo, { XinoLoader } from "./XinoLogo";
import { api } from "@/lib/api";

const PLATFORMS = [
  { id: "web",          label: "Web App",           sub: "React / Next.js",      icon: Globe,      grad: "from-[#F97316] to-[#FBBF24]" },
  { id: "ios",          label: "iOS Only",          sub: "Swift native",         icon: Apple,      grad: "from-[#0F2042] to-[#3B82F6]" },
  { id: "android",      label: "Android Only",      sub: "Kotlin native",        icon: Smartphone, grad: "from-[#065F46] to-[#10B981]" },
  { id: "ios_android",  label: "iOS + Android",     sub: "Cross-platform",       icon: Smartphone, grad: "from-[#7C3AED] to-[#F472B6]" },
  { id: "web_mobile",   label: "Web + Mobile",      sub: "Full ecosystem",       icon: Code2,      grad: "from-[#F97316] via-[#A855F7] to-[#3B82F6]" },
];

const STAGES = ["intro", "form", "loading", "result"];

export default function XinoEstimator({ autoOpen = true, showFloating = true }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState("intro");
  const [form, setForm] = useState({
    name: "", email: "", company: "", phone: "", app_type: "web", requirements: "",
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const firedRef = useRef(false);

  // Auto open once per browser
  useEffect(() => {
    if (!autoOpen) return;
    if (firedRef.current) return;
    firedRef.current = true;
    const seen = localStorage.getItem("xino_intro_seen");
    if (!seen) {
      const t = setTimeout(() => setOpen(true), 5000);
      return () => clearTimeout(t);
    }
  }, [autoOpen]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const closeAll = () => {
    setOpen(false);
    try { localStorage.setItem("xino_intro_seen", "1"); } catch {}
    setTimeout(() => { setStage("intro"); setResult(null); setError(""); }, 400);
  };

  const downloadProfile = () => {
    const base = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
    const url = `${base}/api/xino/company-profile.pdf`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("Company Profile opened in a new tab");
  };

  const submitForm = async (e) => {
    e.preventDefault();
    setError("");
    if (form.requirements.trim().length < 20) {
      setError("Please describe your requirements in at least 20 characters.");
      return;
    }
    setStage("loading");
    try {
      const { data } = await api.post("/xino/estimate", {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        app_type: form.app_type,
        requirements: form.requirements.trim(),
      });
      setResult(data);
      setStage("result");
    } catch (err) {
      const d = err?.response?.data?.detail;
      let msg = "Could not generate estimate. Please try again.";
      if (typeof d === "string") msg = d;
      else if (Array.isArray(d)) msg = d.map((x) => x.msg || JSON.stringify(x)).join("; ");
      else if (d) msg = JSON.stringify(d);
      setError(msg);
      setStage("form");
    }
  };

  return (
    <>
      {/* Floating CTA — fixed render */}
      {showFloating && !open && createPortal(
        <motion.button
          data-testid="xino-floating-btn"
          onClick={() => setOpen(true)}
          initial={{ opacity: 0, y: 24, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 180, damping: 18 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          aria-label="Get Instant Estimate"
          className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 rounded-full bg-gradient-to-br from-[#2456A6] via-[#16325C] to-[#0F2042] py-3 pl-3 pr-5 text-sm font-bold text-white shadow-[0_18px_40px_-12px_rgba(22,50,92,0.6)] ring-2 ring-[#E87B2C]/60 backdrop-blur-md hover:shadow-[0_24px_50px_-12px_rgba(232,123,44,0.55)]"
        >
          <XinoLogo size={36} animated />
          <span className="hidden sm:inline">Get Instant Estimate</span>
          <span className="sm:hidden">Estimate</span>
        </motion.button>,
        document.body
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              data-testid="xino-popup"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-md sm:p-6"
              onClick={(e) => { if (e.target === e.currentTarget) closeAll(); }}
            >
              <motion.div
                initial={{ scale: 0.94, y: 24, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.96, opacity: 0 }}
                transition={{ type: "spring", stiffness: 220, damping: 24 }}
                className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden overflow-y-auto rounded-3xl bg-white shadow-[0_40px_80px_-20px_rgba(15,32,66,0.6)] ring-1 ring-orange-200"
              >
                {/* Decorative gradient header */}
                <div className="relative h-28 overflow-hidden bg-gradient-to-br from-[#0F2042] via-[#7C3AED] to-[#F97316]">
                  <div className="absolute inset-0 opacity-30" style={{
                    backgroundImage:
                      "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.3) 0, transparent 35%)",
                  }} />
                  <motion.div
                    aria-hidden
                    animate={{ rotate: 360 }}
                    transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                    className="absolute -right-20 -top-20 h-60 w-60 rounded-full border border-white/15"
                  />
                  <button
                    onClick={closeAll}
                    data-testid="xino-close"
                    aria-label="Close"
                    type="button"
                    className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-white/15 text-white backdrop-blur-md transition hover:bg-white/30 hover:scale-110"
                  >
                    <X size={16} />
                  </button>
                  <div className="pointer-events-none relative flex h-full items-center gap-4 px-6 sm:px-8">
                    <XinoLogo size={64} animated />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-orange-200">// XINO AI · PROJEXINO</div>
                      <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">
                        {stage === "intro"   && "Hi, I'm Xino AI."}
                        {stage === "form"    && "Tell me about your project"}
                        {stage === "loading" && "Crunching numbers…"}
                        {stage === "result"  && "Your ballpark estimate"}
                      </h2>
                    </div>
                  </div>
                </div>

                {/* Stage content */}
                <div className="px-6 py-8 sm:px-10">
                  <AnimatePresence mode="wait">
                    {stage === "intro"   && <IntroStage key="intro"   onDownload={downloadProfile} onStart={() => setStage("form")} />}
                    {stage === "form"    && <FormStage  key="form"    form={form} setForm={setForm} onSubmit={submitForm} onBack={() => setStage("intro")} error={error} />}
                    {stage === "loading" && <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><XinoLoader /></motion.div>}
                    {stage === "result"  && <ResultStage key="result" result={result} onRestart={() => { setStage("form"); setResult(null); }} onDownload={downloadProfile} onClose={closeAll} />}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

// ────────────────────────── Intro Stage ──────────────────────────
function IntroStage({ onDownload, onStart }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.45 }}
      className="space-y-7"
    >
      <p className="text-base leading-relaxed text-slate-600">
        I'm <span className="font-bold text-[#0F2042]">Xino AI</span> — Projexino's in-house solutions architect.
        I can hand you our <span className="font-semibold text-[#F97316]">full company profile</span> right now, or
        give you a <span className="font-semibold text-[#A855F7]">ballpark budget & timeline</span> for your
        project in <em>seconds</em>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Company profile card */}
        <motion.button
          data-testid="xino-download-profile"
          onClick={onDownload}
          whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}
          className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-5 text-left shadow-md hover:shadow-xl"
          style={{ perspective: 600 }}
        >
          <motion.div
            aria-hidden
            className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-[#F97316]/30 to-[#FBBF24]/0 blur-2xl"
            animate={{ scale: [1, 1.15, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white shadow-lg shadow-orange-300/50">
            <FileDown size={22} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-[#0F2042]">Company Profile</div>
            <div className="text-sm text-slate-500">Branded PDF · auto-generated · 4 pages of what we do</div>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#F97316]">
            Download now <Download size={14} />
          </div>
        </motion.button>

        {/* Estimate magic card */}
        <motion.button
          data-testid="xino-start-estimate"
          onClick={onStart}
          whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }}
          className="group relative flex flex-col items-start gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F2042] via-[#7C3AED] to-[#F97316] p-5 text-left text-white shadow-xl"
        >
          <motion.div
            aria-hidden
            className="absolute -right-12 -bottom-12 h-40 w-40 rounded-full bg-white/15 blur-2xl"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 3.6, repeat: Infinity }}
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold">See the magic ✨</div>
            <div className="text-sm text-white/85">
              Get budget + timeline estimates compatible with the current market — in seconds.
            </div>
          </div>
          <div className="mt-1 inline-flex items-center gap-1 text-sm font-bold">
            Try Xino AI <ArrowRight size={14} />
          </div>
        </motion.button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-3 text-center">
        {[
          { k: "Avg time", v: "12s", c: "#F97316" },
          { k: "Backed by", v: "Claude 4.5", c: "#A855F7" },
          { k: "Updated", v: "2026 rates", c: "#10B981" },
        ].map((s) => (
          <div key={s.k} className="rounded-xl border border-slate-100 bg-white/70 px-3 py-2.5 shadow-sm">
            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400">{s.k}</div>
            <div className="font-display text-base font-semibold" style={{ color: s.c }}>{s.v}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ────────────────────────── Form Stage ──────────────────────────
function FormStage({ form, setForm, onSubmit, onBack, error }) {
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <motion.form
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      onSubmit={onSubmit}
      className="space-y-5"
      data-testid="xino-form"
    >
      <button
        type="button" onClick={onBack} data-testid="xino-form-back"
        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-[#F97316]"
      >
        <ChevronLeft size={14} /> Back
      </button>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Your name" required value={form.name} onChange={update("name")} placeholder="Jane Doe" testId="xino-name" />
        <FormField label="Email" required type="email" value={form.email} onChange={update("email")} placeholder="jane@example.com" testId="xino-email" />
        <FormField label="Company" value={form.company} onChange={update("company")} placeholder="(optional)" testId="xino-company" />
        <FormField label="Phone" value={form.phone} onChange={update("phone")} placeholder="(optional)" testId="xino-phone" />
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          What are you building?
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {PLATFORMS.map((p) => {
            const Icon = p.icon;
            const active = form.app_type === p.id;
            return (
              <motion.button
                type="button" key={p.id}
                data-testid={`xino-app-type-${p.id}`}
                onClick={() => setForm({ ...form, app_type: p.id })}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.95 }}
                className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition ${
                  active
                    ? "border-transparent text-white shadow-lg"
                    : "border-slate-200 bg-white text-slate-600 hover:border-orange-200"
                }`}
                style={active ? {
                  background: `linear-gradient(135deg, var(--tw-gradient-stops))`,
                } : {}}
              >
                {active && <div className={`absolute inset-0 rounded-xl bg-gradient-to-br ${p.grad}`} />}
                <div className="relative z-10">
                  <Icon size={18} className="mx-auto" />
                  <div className="mt-1 text-[11px] font-bold leading-tight">{p.label}</div>
                  <div className={`mt-0.5 text-[9px] ${active ? "text-white/80" : "text-slate-400"}`}>{p.sub}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          Brief your requirements <span className="text-[#F97316]">*</span>
        </label>
        <textarea
          data-testid="xino-requirements"
          required minLength={20}
          value={form.requirements}
          onChange={update("requirements")}
          rows={5}
          placeholder="e.g. A SaaS dashboard with Stripe billing, AI-powered analytics, multi-tenant teams, real-time chat, and admin panel."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#0F172A] outline-none transition focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>The more detail, the sharper the estimate.</span>
          <span>{form.requirements.length} / 4000</span>
        </div>
      </div>

      {error && (
        <div data-testid="xino-form-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <motion.button
        type="submit"
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
        data-testid="xino-submit"
        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-[#0F2042] via-[#7C3AED] to-[#F97316] px-6 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-white shadow-[0_18px_40px_-12px_rgba(249,115,22,0.55)] transition hover:shadow-[0_24px_50px_-12px_rgba(168,85,247,0.65)]"
      >
        <Sparkles size={16} /> Show me the magic <ArrowRight size={16} className="transition group-hover:translate-x-1" />
      </motion.button>

      <p className="text-center text-[11px] text-slate-400">
        Xino AI will use this brief to draft a ballpark. Your details create a lead in Projexino's CRM — we'll never spam you.
      </p>
    </motion.form>
  );
}

function FormField({ label, value, onChange, type = "text", required = false, placeholder, testId }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label} {required && <span className="text-[#F97316]">*</span>}
      </span>
      <input
        type={type} required={required} value={value} onChange={onChange} placeholder={placeholder}
        data-testid={testId}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-[#0F172A] outline-none transition focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
      />
    </label>
  );
}

// ────────────────────────── Result Stage ──────────────────────────
function ResultStage({ result, onRestart, onDownload, onClose }) {
  const [currency, setCurrency] = useState("USD");
  if (!result) return null;
  const fmt = (n) => n.toLocaleString("en-US");
  const totalWeeks = result.timeline_weeks_high;

  // Currency picker — falls back to USD if currency not present
  const currencies = result.currencies || {
    USD: { low: result.budget_low_usd, high: result.budget_high_usd, symbol: "$", code: "USD" },
    INR: { low: result.budget_low_inr, high: result.budget_high_inr, symbol: "₹", code: "INR" },
  };
  const cur = currencies[currency] || currencies.USD;
  const marketSavingsUsd = (result.market_high_usd || 0) - result.budget_high_usd;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      className="space-y-6"
      data-testid="xino-result"
    >
      {/* Currency picker — top of result */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-100 bg-white/80 p-3 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Show me in</div>
        <div className="flex flex-wrap gap-1.5" data-testid="xino-currency-picker">
          {Object.keys(currencies).map((code) => (
            <motion.button
              type="button"
              key={code}
              data-testid={`xino-currency-${code}`}
              onClick={() => setCurrency(code)}
              whileTap={{ scale: 0.94 }}
              className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
                currency === code
                  ? "bg-gradient-to-br from-[#0F2042] to-[#7C3AED] text-white shadow-md"
                  : "border border-slate-200 bg-white text-slate-500 hover:border-orange-300 hover:text-[#F97316]"
              }`}
            >
              {currencies[code].symbol} {code}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Headline cards (3D infographic feel) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Budget card */}
        <motion.div
          initial={{ rotateX: 30, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.55, type: "spring", stiffness: 120 }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F97316] via-[#FB923C] to-[#FBBF24] p-5 text-white shadow-2xl"
        >
          <motion.div
            aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl"
            animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 4, repeat: Infinity }}
          />
          {/* 50% off badge */}
          {result.discount_pct > 0 && (
            <div className="absolute right-3 top-3 z-10 rotate-6 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#F97316] shadow-lg">
              {result.discount_pct}% OFF
            </div>
          )}
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">// Projexino offer</div>
          <div data-testid="xino-budget-display" className="font-display mt-2 text-3xl font-semibold leading-tight">
            <span className="align-top text-xl">{cur.symbol}</span>
            {fmt(cur.low)} – {fmt(cur.high)}
          </div>
          {result.market_high_usd && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-white/85">
              <span>Market: <span className="line-through opacity-90">${fmt(result.market_low_usd)} – ${fmt(result.market_high_usd)}</span></span>
              {marketSavingsUsd > 0 && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] backdrop-blur-md">
                  Save ~${fmt(marketSavingsUsd)}
                </span>
              )}
            </div>
          )}
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-md">
            {result.complexity} · {result.confidence} confidence
          </div>
        </motion.div>

        {/* Timeline card */}
        <motion.div
          initial={{ rotateX: 30, opacity: 0 }} animate={{ rotateX: 0, opacity: 1 }}
          transition={{ duration: 0.55, delay: 0.1, type: "spring", stiffness: 120 }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0F2042] via-[#1E3A8A] to-[#7C3AED] p-5 text-white shadow-2xl"
        >
          <motion.div
            aria-hidden className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl"
            animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 4, repeat: Infinity, delay: 1 }}
          />
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">// Calendar weeks</div>
          <div className="font-display mt-2 text-3xl font-semibold leading-tight">
            <Clock size={20} className="inline align-top" />
            {result.timeline_weeks_low}–{result.timeline_weeks_high} weeks
          </div>
          <div className="mt-1 text-xs font-semibold text-white/85">
            ≈ {Math.ceil(result.timeline_weeks_high / 4)} calendar months end-to-end
          </div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] backdrop-blur-md">
            Sprint cadence · 2-week iterations
          </div>
        </motion.div>
      </div>

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="rounded-2xl border border-orange-100 bg-orange-50/50 p-4 text-sm leading-relaxed text-slate-700"
      >
        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// Xino AI summary</div>
        {result.summary}
      </motion.div>

      {/* Breakdown */}
      <div>
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Phase breakdown</div>
        <div className="space-y-2">
          {(result.breakdown || []).map((b, i) => {
            const wpct = totalWeeks ? Math.max(8, (b.weeks / totalWeeks) * 100) : 25;
            const cols = ["#0F2042", "#7C3AED", "#F97316", "#10B981"];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.08 }}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: cols[i % cols.length] }}>
                  <span className="font-bold">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-semibold text-[#0F2042]">{b.phase}</div>
                    <div className="flex-shrink-0 text-xs text-slate-500">{b.weeks} wks · ${fmt(b.cost_usd)}</div>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: cols[i % cols.length] }}
                      initial={{ width: 0 }} animate={{ width: `${wpct}%` }}
                      transition={{ delay: 0.4 + i * 0.1, duration: 0.7, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Modules + Tech stack pills */}
      {result.modules?.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Modules in scope</div>
          <div className="flex flex-wrap gap-2">
            {result.modules.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold text-[#9A3412]">
                <CheckCircle2 size={11} /> {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.tech_stack?.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Recommended stack</div>
          <div className="flex flex-wrap gap-2">
            {result.tech_stack.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-[11px] font-semibold text-[#5B21B6]">
                <Zap size={11} /> {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {result.risks?.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">// Risks to scope in discovery</div>
          <ul className="space-y-1.5">
            {result.risks.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-500" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* CTAs */}
      <div className="space-y-3 rounded-2xl bg-gradient-to-br from-[#FEF3C7] via-white to-orange-50 p-5 ring-1 ring-orange-100">
        <div className="flex items-start gap-3">
          <Rocket size={20} className="mt-0.5 flex-shrink-0 text-[#F97316]" />
          <div className="flex-1">
            <div className="font-display text-base font-semibold text-[#0F2042]">Next step</div>
            <div className="mt-1 text-sm text-slate-600">{result.next_step}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="/contact"
            data-testid="xino-cta-book"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#0F2042] to-[#7C3AED] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-white shadow-lg transition hover:shadow-xl"
          >
            <Briefcase size={14} /> Book a discovery call
          </a>
          <button
            type="button" onClick={onDownload} data-testid="xino-cta-download"
            className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-[#F97316] transition hover:bg-orange-50"
          >
            <Download size={14} /> Company profile
          </button>
          <button
            type="button" onClick={onRestart} data-testid="xino-cta-restart"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition hover:bg-slate-50"
          >
            Try another brief
          </button>
        </div>
      </div>

      <p className="text-center text-[10px] text-slate-400">
        Estimate ID <span className="font-mono">{result.id?.slice(0, 8)}</span> · saved to Projexino CRM · final scope locked in discovery sprint.
      </p>
    </motion.div>
  );
}
