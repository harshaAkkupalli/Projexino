/** JobPostings.jsx — admin CRUD for career job postings + branded JD PDF preview. */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, X, Loader2, Trash2, Edit3, Eye, Download, BriefcaseBusiness, MapPin, Clock,
  IndianRupee, Users, ToggleLeft, ToggleRight, ExternalLink, BellRing, Check, FileText, Link2,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf, saveOrShareBlob } from "@/lib/download";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { toast } from "sonner";

export const TYPE_LABELS = { full_time: "Full Time", part_time: "Part Time", freelancer: "Freelancer", internship: "Internship", contract: "Contract" };
export const MODE_LABELS = { office: "In Office", wfh: "Work From Home", hybrid: "Hybrid" };

export default function JobPostings() {
  const [jobs, setJobs] = useState(null);
  const [editor, setEditor] = useState(null); // {} for new, job for edit
  const [preview, setPreview] = useState(null);
  const [applicants, setApplicants] = useState(null); // job whose applicants are shown

  const load = async () => {
    try { const { data } = await api.get("/careers/jobs"); setJobs(data); }
    catch (e) { toast.error(formatApiError(e)); setJobs([]); }
  };
  useEffect(() => { load(); }, []);

  const toggleStatus = async (j) => {
    const status = j.status === "open" ? "closed" : "open";
    await api.patch(`/careers/jobs/${j.id}`, { status });
    setJobs((p) => p.map((x) => (x.id === j.id ? { ...x, status } : x)));
    toast.success(status === "open" ? "Posting is live on /careers" : "Posting closed");
  };

  const remove = async (j) => {
    if (!window.confirm(`Delete posting "${j.title}"?`)) return;
    await api.delete(`/careers/jobs/${j.id}`);
    setJobs((p) => p.filter((x) => x.id !== j.id));
    toast.success("Posting deleted");
  };

  return (
    <div className="space-y-4" data-testid="job-postings-admin">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// careers</div>
          <h2 className="font-display text-xl font-bold text-[#0F2042]">Job Postings</h2>
          <p className="text-xs text-slate-500">Open postings appear live on the website's <a href="/careers" target="_blank" rel="noreferrer" className="font-bold text-[#F97316] underline">/careers</a> page with branded JD PDFs.</p>
        </div>
        <button data-testid="job-new-btn" onClick={() => setEditor({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600">
          <Plus size={15} /> Post a job
        </button>
      </div>

      <NotifySettings />

      {!jobs ? (
        <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
      ) : jobs.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center" data-testid="jobs-empty">
          <BriefcaseBusiness size={34} className="mx-auto mb-3 text-slate-300" />
          <div className="font-display text-lg font-bold text-slate-500">No job postings yet</div>
          <p className="text-xs text-slate-400">Post your first opening — it goes live on the Careers page instantly.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => (
            <div key={j.id} data-testid={`job-card-${j.id}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              style={{ borderTop: `3px solid ${j.status === "open" ? "#F97316" : "#94A3B8"}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-[#F97316]">{j.department || "Careers"}</div>
                  <div className="truncate font-display text-sm font-bold text-[#0F2042]">{j.title}</div>
                </div>
                <button onClick={() => toggleStatus(j)} data-testid={`job-status-${j.id}`} title="Toggle live status"
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${j.status === "open" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                  {j.status === "open" ? <ToggleRight size={11} /> : <ToggleLeft size={11} />} {j.status}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-bold">
                <span className="rounded-full bg-orange-50 px-2 py-0.5 text-orange-700">{TYPE_LABELS[j.employment_type]}</span>
                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">{MODE_LABELS[j.work_mode]}</span>
                {j.salary_text && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><IndianRupee size={8} className="inline" /> {j.salary_text}</span>}
              </div>
              <div className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                {j.location && <div className="flex items-center gap-1"><MapPin size={10} /> {j.location}</div>}
                {j.timings && <div className="flex items-center gap-1"><Clock size={10} /> {j.timings}</div>}
                <div className="flex items-center gap-1"><Users size={10} /> {j.openings} opening{j.openings === 1 ? "" : "s"} · {j.experience || "any experience"}</div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
                <button onClick={() => setEditor(j)} data-testid={`job-edit-${j.id}`}
                  className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-2.5 py-1 text-[10px] font-bold text-white"><Edit3 size={10} /> Edit</button>
                <button onClick={() => setApplicants(j)} data-testid={`job-applicants-${j.id}`} title="View applicants"
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${j.application_count ? "bg-[#F97316] text-white" : "border border-slate-200 text-slate-500 hover:border-[#F97316]"}`}>
                  <Users size={10} /> {j.application_count || 0}
                </button>
                <button onClick={() => setPreview(j)} data-testid={`job-jd-preview-${j.id}`} title="Preview branded JD PDF"
                  className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#F97316]"><Eye size={11} /></button>
                <button data-testid={`job-jd-download-${j.id}`} title="Download JD PDF"
                  onClick={async () => { try { await downloadApiPdf(`/public/careers/jobs/${j.slug}/jd.pdf`, `JD-${j.slug}.pdf`); } catch { toast.error("PDF failed"); } }}
                  className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#F97316]"><Download size={11} /></button>
                <a href={`/careers?job=${j.slug}`} target="_blank" rel="noreferrer" title="View on Careers page"
                  className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#0F2042]"><ExternalLink size={11} /></a>
                <button onClick={() => remove(j)} data-testid={`job-delete-${j.id}`}
                  className="ml-auto rounded-full border border-rose-200 p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={11} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editor && <JobEditor job={editor.id ? editor : null} onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }} />}
        {preview && <PdfPreviewModal title={`JD · ${preview.title}`} fetchPath={`/public/careers/jobs/${preview.slug}/jd.pdf`}
          filename={`JD-${preview.slug}.pdf`} onClose={() => setPreview(null)} />}
        {applicants && <ApplicantsModal job={applicants} onClose={() => { setApplicants(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

const F = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    {children}
  </label>
);
const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]";

function NotifySettings() {
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get("/careers/settings")
      .then(({ data }) => setEmail(data.notify_email || ""))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/careers/settings", { notify_email: email.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success(email.trim() ? `Application alerts → ${email.trim()}` : "Alerts will use each job's apply email");
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  if (!loaded) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-2.5" data-testid="ats-notify-settings">
      <BellRing size={14} className="shrink-0 text-[#F97316]" />
      <span className="text-[11px] font-bold text-slate-600">New-application alerts go to:</span>
      <input data-testid="ats-notify-email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="Leave blank to use each job's apply email"
        className="min-w-[220px] flex-1 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#F97316]" />
      <button onClick={save} disabled={saving} data-testid="ats-notify-save"
        className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
        {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : null} {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}

const APP_STATUSES = ["new", "shortlisted", "interview", "hired", "rejected"];
const STATUS_STYLES = {
  new: "bg-sky-100 text-sky-700", shortlisted: "bg-amber-100 text-amber-700",
  interview: "bg-violet-100 text-violet-700", hired: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-600",
};

function ApplicantsModal({ job, onClose }) {
  const [apps, setApps] = useState(null);

  useEffect(() => {
    api.get(`/careers/applications?job_id=${job.id}`)
      .then(({ data }) => setApps(data))
      .catch((e) => { toast.error(formatApiError(e)); setApps([]); });
  }, [job.id]);

  const setStatus = async (a, status) => {
    try {
      await api.patch(`/careers/applications/${a.id}`, { status });
      setApps((p) => p.map((x) => (x.id === a.id ? { ...x, status } : x)));
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const dlResume = async (a) => {
    try {
      const { data } = await api.get(`/careers/applications/${a.id}/resume`);
      const bin = atob(data.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await saveOrShareBlob(new Blob([bytes], { type: data.mime }), data.filename, data.mime);
    } catch { toast.error("Could not download resume"); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" data-testid="applicants-modal">
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// applicants</div>
            <div className="truncate font-display text-lg font-bold">{job.title}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {!apps ? (
            <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-slate-300" /></div>
          ) : apps.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center" data-testid="applicants-empty">
              <Users size={30} className="mx-auto mb-2 text-slate-300" />
              <div className="text-sm font-bold text-slate-500">No applications yet</div>
              <p className="text-xs text-slate-400">Applications from the /careers page will land here + in Documents → Resumes.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {apps.map((a) => (
                <div key={a.id} data-testid={`applicant-${a.id}`} className="rounded-2xl border border-slate-200 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold text-[#0F2042]">{a.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        <a href={`mailto:${a.email}`} className="font-bold text-[#F97316]">{a.email}</a>
                        {a.phone && <> · {a.phone}</>}
                        {" · "}{new Date(a.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <select value={a.status} onChange={(e) => setStatus(a, e.target.value)} data-testid={`applicant-status-${a.id}`}
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase outline-none ${STATUS_STYLES[a.status] || STATUS_STYLES.new}`}>
                      {APP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {a.note && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] italic text-slate-600">“{a.note}”</p>}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => dlResume(a)} data-testid={`applicant-resume-${a.id}`}
                      className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1 text-[10px] font-bold text-white">
                      <FileText size={10} /> {a.resume_filename || "Resume"}
                    </button>
                    {a.portfolio && (
                      <a href={a.portfolio.startsWith("http") ? a.portfolio : `https://${a.portfolio}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 hover:border-[#F97316]">
                        <Link2 size={10} /> Portfolio
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}


function JobEditor({ job, onClose, onSaved }) {
  const [f, setF] = useState({
    title: job?.title || "", department: job?.department || "",
    employment_type: job?.employment_type || "full_time", work_mode: job?.work_mode || "office",
    location: job?.location || "", timings: job?.timings || "", salary_text: job?.salary_text || "",
    experience: job?.experience || "", openings: job?.openings || 1,
    skills: (job?.skills || []).join(", "),
    summary: job?.summary || "", responsibilities: job?.responsibilities || "",
    requirements: job?.requirements || "", benefits: job?.benefits || "",
    apply_email: job?.apply_email || "careers@projexino.com", status: job?.status || "open",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.title.trim()) { toast.error("Job title is required"); return; }
    setBusy(true);
    try {
      const payload = { ...f, openings: Number(f.openings) || 1, skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean) };
      if (job) await api.patch(`/careers/jobs/${job.id}`, payload);
      else await api.post("/careers/jobs", payload);
      toast.success(job ? "Posting updated" : "Job posted — live on /careers");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm" data-testid="job-editor-modal">
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[93vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">// job posting</div>
            <div className="font-display text-lg font-bold">{job ? "Edit posting" : "Post a new job"}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Job title *"><input data-testid="job-f-title" value={f.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="e.g. React Developer" /></F>
            <F label="Department"><input data-testid="job-f-dept" value={f.department} onChange={(e) => set("department", e.target.value)} className={inputCls} placeholder="Engineering / Design / Marketing" /></F>
            <F label="Employment type">
              <select data-testid="job-f-type" value={f.employment_type} onChange={(e) => set("employment_type", e.target.value)} className={inputCls}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Work mode">
              <select data-testid="job-f-mode" value={f.work_mode} onChange={(e) => set("work_mode", e.target.value)} className={inputCls}>
                {Object.entries(MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </F>
            <F label="Location"><input data-testid="job-f-location" value={f.location} onChange={(e) => set("location", e.target.value)} className={inputCls} placeholder="Nellore / Remote / Hyderabad" /></F>
            <F label="Timings"><input data-testid="job-f-timings" value={f.timings} onChange={(e) => set("timings", e.target.value)} className={inputCls} placeholder="Mon–Fri · 9:30 AM – 6:30 PM IST" /></F>
            <F label="Salary"><input data-testid="job-f-salary" value={f.salary_text} onChange={(e) => set("salary_text", e.target.value)} className={inputCls} placeholder="₹4 – 6 LPA / ₹500 per hour" /></F>
            <F label="Experience"><input data-testid="job-f-exp" value={f.experience} onChange={(e) => set("experience", e.target.value)} className={inputCls} placeholder="1–3 years" /></F>
            <F label="Openings"><input data-testid="job-f-openings" type="number" min={1} value={f.openings} onChange={(e) => set("openings", e.target.value)} className={inputCls} /></F>
            <F label="Apply email"><input data-testid="job-f-apply" value={f.apply_email} onChange={(e) => set("apply_email", e.target.value)} className={inputCls} /></F>
          </div>
          <F label="Skills (comma separated)"><input data-testid="job-f-skills" value={f.skills} onChange={(e) => set("skills", e.target.value)} className={inputCls} placeholder="React, FastAPI, MongoDB" /></F>
          <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-orange-700">// job description — becomes the branded JD PDF</div>
            <div className="space-y-3">
              <F label="About the role (summary)"><textarea data-testid="job-f-summary" rows={3} value={f.summary} onChange={(e) => set("summary", e.target.value)} className={inputCls} /></F>
              <F label="Key responsibilities (one per line)"><textarea data-testid="job-f-resp" rows={4} value={f.responsibilities} onChange={(e) => set("responsibilities", e.target.value)} className={inputCls} placeholder={"- Build and ship features\n- Collaborate with design"} /></F>
              <F label="Requirements (one per line)"><textarea data-testid="job-f-req" rows={4} value={f.requirements} onChange={(e) => set("requirements", e.target.value)} className={inputCls} /></F>
              <F label="What we offer / benefits (one per line)"><textarea data-testid="job-f-benefits" rows={3} value={f.benefits} onChange={(e) => set("benefits", e.target.value)} className={inputCls} /></F>
            </div>
          </div>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <input type="checkbox" checked={f.status === "open"} onChange={(e) => set("status", e.target.checked ? "open" : "closed")} data-testid="job-f-status" />
            Live on Careers page
          </label>
          <button onClick={save} disabled={busy} data-testid="job-save"
            className="rounded-full bg-[#F97316] px-6 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            {busy ? "Saving…" : job ? "Save changes" : "Post job"}
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}
