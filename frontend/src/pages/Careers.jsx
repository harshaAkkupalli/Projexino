/** Careers.jsx — public careers page: 3D layered hero, global job search, job preview + branded JD PDF download. */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, MapPin, Clock, IndianRupee, Users, BriefcaseBusiness, X, Download, Loader2,
  Sparkles, ArrowRight, Building2, Laptop,
} from "lucide-react";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { saveOrShareBlob } from "@/lib/download";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TYPE_LABELS = { full_time: "Full Time", part_time: "Part Time", freelancer: "Freelancer", internship: "Internship", contract: "Contract" };
const MODE_LABELS = { office: "In Office", wfh: "Work From Home", hybrid: "Hybrid" };

export default function Careers() {
  const [jobs, setJobs] = useState(null);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [mode, setMode] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/careers/jobs`).then(({ data }) => {
      setJobs(data);
      const slug = new URLSearchParams(window.location.search).get("job");
      if (slug) { const j = data.find((x) => x.slug === slug); if (j) setActive(j); }
    }).catch(() => setJobs([]));
  }, []);

  const filtered = useMemo(() => {
    let list = jobs || [];
    if (type) list = list.filter((j) => j.employment_type === type);
    if (mode) list = list.filter((j) => j.work_mode === mode);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((j) => [j.title, j.department, j.location, j.summary, ...(j.skills || [])].join(" ").toLowerCase().includes(s));
    }
    return list;
  }, [jobs, q, type, mode]);

  return (
    <div className="min-h-screen bg-[#070D1A] text-white">
      <SEO title="Careers — Projexino Solutions" description="Join Projexino — explore open roles across engineering, design and marketing. Download branded job descriptions and apply today." />
      <Navbar />

      {/* ============ 3D LAYERED HERO ============ */}
      <section className="relative overflow-hidden pb-16 pt-28 sm:pt-32" style={{ perspective: "1200px" }} data-testid="careers-hero">
        {/* 3D grid floor */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 opacity-30"
          style={{ background: "linear-gradient(transparent, rgba(59,130,246,0.15))", transform: "rotateX(60deg) translateY(40%)", transformOrigin: "bottom", backgroundImage: "linear-gradient(rgba(59,130,246,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.25) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        {/* floating 3D orbs */}
        <motion.div animate={{ y: [0, -18, 0], rotateZ: [0, 8, 0] }} transition={{ duration: 7, repeat: Infinity }}
          className="pointer-events-none absolute left-[8%] top-24 h-32 w-32 rounded-full opacity-40 blur-2xl" style={{ background: "radial-gradient(circle at 30% 30%, #F97316, transparent 70%)" }} />
        <motion.div animate={{ y: [0, 16, 0] }} transition={{ duration: 8, repeat: Infinity }}
          className="pointer-events-none absolute right-[6%] top-36 h-44 w-44 rounded-full opacity-40 blur-2xl" style={{ background: "radial-gradient(circle at 30% 30%, #3B82F6, transparent 70%)" }} />
        {/* floating tilted cards */}
        <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 5.5, repeat: Infinity }}
          className="pointer-events-none absolute left-[4%] top-[46%] hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md lg:block"
          style={{ transform: "rotateY(18deg) rotateX(6deg)" }}>
          <Laptop size={18} className="text-[#3B82F6]" />
          <div className="mt-1 text-[10px] font-bold text-white/80">Remote friendly</div>
        </motion.div>
        <motion.div animate={{ y: [0, 14, 0] }} transition={{ duration: 6.5, repeat: Infinity }}
          className="pointer-events-none absolute right-[5%] top-[52%] hidden rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md lg:block"
          style={{ transform: "rotateY(-18deg) rotateX(6deg)" }}>
          <Sparkles size={18} className="text-[#F97316]" />
          <div className="mt-1 text-[10px] font-bold text-white/80">Build with AI</div>
        </motion.div>

        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <div className="mx-auto w-fit rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#F97316] backdrop-blur">// we're hiring</div>
          <h1 className="font-display mt-5 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Build the future <span className="text-[#F97316]">with us</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-300">
            Join Projexino Solutions — a team crafting web, mobile & AI products. Find your role, preview the full job description and apply in minutes.
          </p>
          {/* Global search */}
          <div className="relative mx-auto mt-8 max-w-xl" data-testid="careers-search-wrap">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="careers-search"
              placeholder="Search roles, skills, departments…"
              className="w-full rounded-full border border-white/15 bg-white/10 py-3.5 pl-11 pr-4 text-sm text-white placeholder-slate-400 outline-none backdrop-blur focus:border-[#F97316]" />
          </div>
          {/* Filters */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5">
            <button onClick={() => setType("")} data-testid="careers-type-all"
              className={`rounded-full px-3 py-1 text-[11px] font-bold ${!type ? "bg-[#F97316] text-white" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>All types</button>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setType(type === v ? "" : v)} data-testid={`careers-type-${v}`}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${type === v ? "bg-[#F97316] text-white" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>{l}</button>
            ))}
            <span className="mx-1 hidden h-4 w-px bg-white/20 sm:block" />
            {Object.entries(MODE_LABELS).map(([v, l]) => (
              <button key={v} onClick={() => setMode(mode === v ? "" : v)} data-testid={`careers-mode-${v}`}
                className={`rounded-full px-3 py-1 text-[11px] font-bold ${mode === v ? "bg-[#3B82F6] text-white" : "bg-white/10 text-slate-300 hover:bg-white/15"}`}>{l}</button>
            ))}
          </div>
        </div>
      </section>

      {/* ============ JOB GRID ============ */}
      <section className="relative mx-auto max-w-6xl px-4 pb-24" data-testid="careers-grid">
        {!jobs ? (
          <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-slate-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-14 text-center backdrop-blur" data-testid="careers-empty">
            <BriefcaseBusiness size={36} className="mx-auto mb-3 text-slate-500" />
            <div className="font-display text-lg font-bold text-slate-300">{q || type || mode ? "No roles match your search" : "No open positions right now"}</div>
            <p className="mt-1 text-xs text-slate-500">Drop your resume at <a href="mailto:careers@projexino.com" className="font-bold text-[#F97316]">careers@projexino.com</a> — we'll reach out when something opens up.</p>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((j, i) => (
              <motion.button key={j.id} onClick={() => setActive(j)} data-testid={`careers-job-${j.slug}`}
                initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileHover={{ rotateY: -5, rotateX: 3, scale: 1.02 }}
                style={{ transformStyle: "preserve-3d" }}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 text-left backdrop-blur transition hover:border-[#F97316]/60 hover:bg-white/10">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-[#F97316]/15 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#F97316]">{j.department || "Careers"}</span>
                  <span className="text-[9px] font-bold text-slate-400">{j.openings} opening{j.openings === 1 ? "" : "s"}</span>
                </div>
                <div className="mt-2 font-display text-lg font-bold text-white group-hover:text-[#F97316]">{j.title}</div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] font-bold">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{TYPE_LABELS[j.employment_type]}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{MODE_LABELS[j.work_mode]}</span>
                  {j.experience && <span className="rounded-full bg-white/10 px-2 py-0.5 text-slate-300">{j.experience}</span>}
                </div>
                <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                  {j.location && <div className="flex items-center gap-1.5"><MapPin size={11} /> {j.location}</div>}
                  {j.salary_text && <div className="flex items-center gap-1.5"><IndianRupee size={11} /> {j.salary_text}</div>}
                  {j.timings && <div className="flex items-center gap-1.5"><Clock size={11} /> {j.timings}</div>}
                </div>
                <div className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold text-[#F97316]">
                  View role & JD <ArrowRight size={12} className="transition group-hover:translate-x-1" />
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      <AnimatePresence>
        {active && <JobModal job={active} onClose={() => setActive(null)} />}
      </AnimatePresence>
      <Footer />
    </div>
  );
}

function Bullets({ text }) {
  const lines = (text || "").split("\n").map((l) => l.trim().replace(/^[-•*]\s*/, "")).filter(Boolean);
  return (
    <ul className="mt-1 space-y-1.5 text-sm text-slate-600">
      {lines.map((l, i) => <li key={i} className="flex gap-2"><span className="mt-0.5 text-[#F97316]">•</span>{l}</li>)}
    </ul>
  );
}

function JobModal({ job, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const dl = async () => {
    setDownloading(true);
    try {
      const res = await axios.get(`${API}/public/careers/jobs/${job.slug}/jd.pdf`, { responseType: "blob" });
      await saveOrShareBlob(new Blob([res.data], { type: "application/pdf" }), `JD-${job.slug}.pdf`);
    } catch { toast.error("Could not download the JD right now"); }
    setDownloading(false);
  };
  const details = [
    ["Type", TYPE_LABELS[job.employment_type]], ["Mode", MODE_LABELS[job.work_mode]],
    ["Location", job.location || "—"], ["Salary", job.salary_text || "Competitive"],
    ["Timings", job.timings || "—"], ["Experience", job.experience || "—"],
  ];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" data-testid="careers-job-modal">
      <motion.div initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-slate-800 shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 bg-[#0F2042] px-5 py-4 text-white">
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">{job.department || "Careers"}</div>
            <div className="truncate font-display text-xl font-bold">{job.title}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={dl} disabled={downloading} data-testid="careers-jd-download"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-4 py-2 text-xs font-bold hover:bg-orange-600 disabled:opacity-50">
              {downloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Download JD (PDF)
            </button>
            <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10"><X size={18} /></button>
          </div>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5" data-testid="careers-jd-body">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {details.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-2.5">
                <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400">{k}</div>
                <div className="text-xs font-bold text-[#0F2042]">{v}</div>
              </div>
            ))}
          </div>
          {(job.skills || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {job.skills.map((s, i) => <span key={i} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{s}</span>)}
            </div>
          )}
          {job.summary && (<div><h3 className="border-b-2 border-[#F97316] pb-1 font-display text-sm font-bold text-[#0F2042] inline-block">About the Role</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{job.summary}</p></div>)}
          {job.responsibilities && (<div><h3 className="border-b-2 border-[#F97316] pb-1 font-display text-sm font-bold text-[#0F2042] inline-block">Key Responsibilities</h3><Bullets text={job.responsibilities} /></div>)}
          {job.requirements && (<div><h3 className="border-b-2 border-[#F97316] pb-1 font-display text-sm font-bold text-[#0F2042] inline-block">Requirements</h3><Bullets text={job.requirements} /></div>)}
          {job.benefits && (<div><h3 className="border-b-2 border-[#F97316] pb-1 font-display text-sm font-bold text-[#0F2042] inline-block">What We Offer</h3><Bullets text={job.benefits} /></div>)}
          <div className="rounded-2xl bg-[#0F2042] p-4 text-sm text-white">
            <b className="text-[#F97316]">Prefer email?</b> Send your resume to{" "}
            <a href={`mailto:${job.apply_email}?subject=Application — ${encodeURIComponent(job.title)}`} data-testid="careers-apply-link"
              className="font-bold text-orange-300 underline">{job.apply_email}</a>{" "}
            — or apply right here:
          </div>
          <ApplyForm job={job} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function ApplyForm({ job }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", portfolio: "", note: "" });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim() || !f.email.includes("@")) { toast.error("Name and a valid email are required"); return; }
    if (!file) { toast.error("Attach your resume (PDF/DOC, max 5 MB)"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Resume must be under 5 MB"); return; }
    setBusy(true);
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onerror = rej;
        r.onload = () => res(String(r.result).split(",")[1]);
        r.readAsDataURL(file);
      });
      await axios.post(`${API}/public/careers/jobs/${job.slug}/apply`, {
        ...f, resume_filename: file.name, resume_mime: file.type || "application/pdf", resume_b64: b64,
      });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not submit — try again");
    }
    setBusy(false);
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center" data-testid="apply-success">
        <div className="text-2xl">🎉</div>
        <div className="mt-1 font-display text-lg font-bold text-emerald-800">Application received!</div>
        <p className="mt-1 text-xs text-emerald-700">Thanks {f.name.split(" ")[0]} — our team will review your profile for <b>{job.title}</b> and get back to you at {f.email}.</p>
      </div>
    );
  }
  const cls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]";
  return (
    <form onSubmit={submit} className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4" data-testid="apply-form">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-orange-700">// apply now — takes 30 seconds</div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input data-testid="apply-name" placeholder="Full name *" value={f.name} onChange={(e) => set("name", e.target.value)} className={cls} />
        <input data-testid="apply-email" type="email" placeholder="Email *" value={f.email} onChange={(e) => set("email", e.target.value)} className={cls} />
        <input data-testid="apply-phone" placeholder="Phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} className={cls} />
        <input data-testid="apply-portfolio" placeholder="LinkedIn / portfolio URL" value={f.portfolio} onChange={(e) => set("portfolio", e.target.value)} className={cls} />
      </div>
      <textarea data-testid="apply-note" rows={2} placeholder="Why you? (optional)" value={f.note} onChange={(e) => set("note", e.target.value)} className={`${cls} mt-2.5`} />
      <label className="mt-2.5 flex cursor-pointer items-center justify-between gap-2 rounded-lg border-2 border-dashed border-orange-300 bg-white px-3 py-2.5 text-xs">
        <span className="truncate font-bold text-slate-600">{file ? file.name : "📎 Attach resume (PDF/DOC, max 5 MB) *"}</span>
        <span className="shrink-0 rounded-full bg-[#0F2042] px-3 py-1 text-[10px] font-bold text-white">Browse</span>
        <input data-testid="apply-resume" type="file" accept=".pdf,.doc,.docx" className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>
      <button data-testid="apply-submit" disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#F97316] py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
        {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />} Submit application
      </button>
    </form>
  );
}
