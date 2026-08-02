/** DocStudio.jsx — AI Document Studio: describe a project → structured data → SDD / Plan / SRS with branded PDFs.
 *  Works with AI (any provider) AND without AI (heuristic analyze + template generation + manual editing). */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, FileText, Loader2, Upload, Plus, Trash2, Download, Save, Wand2, X,
  FolderPlus, PencilLine, ChevronRight, History, LayoutTemplate, CircleAlert, Boxes,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf } from "@/lib/download";
import { toast } from "sonner";

const KINDS = [
  { v: "sdd", label: "SDD", full: "Software Design Document" },
  { v: "plan", label: "Project Plan", full: "Project Plan" },
  { v: "srs", label: "SRS", full: "Requirements Spec" },
];

export default function DocStudio() {
  const [aiOn, setAiOn] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [job, setJob] = useState(null); // active job (full)
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    api.get("/doc-studio/status").then(({ data }) => setAiOn(!!data.ai_available)).catch(() => setAiOn(false));
    loadJobs();
  }, []);
  const loadJobs = () => api.get("/doc-studio/jobs").then(({ data }) => setJobs(data)).catch(() => {});

  const openJob = async (j) => {
    try { const { data } = await api.get(`/doc-studio/jobs/${j.id}`); setJob(data); setShowHistory(false); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const deleteJob = async (j) => {
    if (!window.confirm(`Delete "${j.data?.project_name}"?`)) return;
    await api.delete(`/doc-studio/jobs/${j.id}`);
    setJobs((p) => p.filter((x) => x.id !== j.id));
    if (job?.id === j.id) setJob(null);
  };

  return (
    <div className="space-y-5" data-testid="doc-studio-page">
      {/* ===== 3D hero ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F2042] via-[#1E1B4B] to-[#312E81] p-6 text-white sm:p-8" style={{ perspective: "900px" }}>
        <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 6, repeat: Infinity }}
          className="pointer-events-none absolute -right-8 -top-8 h-44 w-44 rounded-full opacity-40 blur-2xl"
          style={{ background: "radial-gradient(circle at 30% 30%, #F97316, transparent 70%)" }} />
        <motion.div animate={{ y: [0, 12, 0] }} transition={{ duration: 7.5, repeat: Infinity }}
          className="pointer-events-none absolute bottom-0 left-1/4 h-32 w-32 rounded-full opacity-30 blur-2xl"
          style={{ background: "radial-gradient(circle at 30% 30%, #818CF8, transparent 70%)" }} />
        <motion.div animate={{ rotateY: [0, 12, 0], y: [0, -8, 0] }} transition={{ duration: 8, repeat: Infinity }}
          className="pointer-events-none absolute right-10 top-1/2 hidden -translate-y-1/2 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-md lg:block"
          style={{ transformStyle: "preserve-3d" }}>
          <FileText size={22} className="text-[#F97316]" />
          <div className="mt-1 text-[10px] font-bold text-white/80">SDD · Plan · SRS</div>
        </motion.div>
        <div className="relative">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#F97316]">// doc studio</div>
          <h2 className="font-display mt-1 text-2xl font-bold sm:text-3xl">Project docs, <span className="text-[#F97316]">generated</span>.</h2>
          <p className="mt-1.5 max-w-xl text-sm text-white/70">Describe any project — get a branded Software Design Document, week-by-week Project Plan and SRS. Works with AI or fully manual.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button data-testid="ds-new-btn" onClick={() => setJob(null)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-sm font-bold hover:bg-orange-600">
              <Plus size={14} /> New project
            </button>
            <button data-testid="ds-history-btn" onClick={() => setShowHistory((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/15">
              <History size={14} /> History ({jobs.length})
            </button>
            {aiOn === false && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3 py-1.5 text-[11px] font-bold text-amber-200 ring-1 ring-amber-400/40" data-testid="ds-no-ai-banner">
                <CircleAlert size={12} /> AI off — manual & template mode active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===== history ===== */}
      <AnimatePresence>
        {showHistory && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden" data-testid="ds-history-list">
            {jobs.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">No projects yet — describe one below.</div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {jobs.map((j) => (
                  <div key={j.id} data-testid={`ds-job-${j.id}`}
                    className="group flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-[#F97316]">
                    <button onClick={() => openJob(j)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-bold text-[#0F2042]">{j.data?.project_name}</div>
                      <div className="text-[10px] text-slate-400">{j.data?.domain} · {new Date(j.created_at).toLocaleDateString()}</div>
                    </button>
                    <button onClick={() => deleteJob(j)} className="rounded-lg border border-rose-200 p-1.5 text-rose-400 opacity-0 transition group-hover:opacity-100"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!job ? (
        <Describe aiOn={aiOn} onCreated={(j) => { setJob(j); loadJobs(); }} />
      ) : (
        <Workspace job={job} setJob={setJob} aiOn={aiOn} onSaved={loadJobs} />
      )}
    </div>
  );
}

/* ============ Step 1 — describe / upload ============ */
function Describe({ aiOn, onCreated }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef();

  const upload = async (f) => {
    if (!f) return;
    setBusy("upload");
    const fd = new FormData();
    fd.append("file", f);
    try {
      const { data } = await api.post("/doc-studio/extract-text", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setText((t) => (t ? t + "\n\n" : "") + data.text);
      toast.success(`Extracted ${data.chars.toLocaleString()} characters`);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const analyze = async (mode) => {
    if (mode !== "blank" && text.trim().length < 20) { toast.error("Describe the project in a few lines first"); return; }
    setBusy(mode);
    try {
      const { data } = await api.post("/doc-studio/analyze", { description: text, mode });
      toast.success(data.analysis_mode === "ai" ? "AI analysed your project" : "Project structure drafted — refine it below");
      onCreated(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="ds-describe">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// step 1 — describe</div>
      <h3 className="font-display text-lg font-bold text-[#0F2042]">What are we documenting?</h3>
      <textarea data-testid="ds-description" value={text} onChange={(e) => setText(e.target.value)} rows={7}
        placeholder={"e.g. A hostel management system for colleges.\n- Students book rooms and raise complaints\n- Wardens approve requests and track occupancy\n- Built with React, FastAPI and MongoDB…"}
        className="mt-3 w-full rounded-2xl border border-slate-300 p-4 text-sm outline-none focus:border-[#F97316]" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button data-testid="ds-analyze-ai" onClick={() => analyze("ai")} disabled={!!busy || aiOn === false}
          title={aiOn === false ? "No AI provider configured" : "AI extracts modules, entities, risks…"}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#1a3060] disabled:opacity-40">
          {busy === "ai" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analyze with AI
        </button>
        <button data-testid="ds-analyze-manual" onClick={() => analyze("manual")} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0F2042] px-5 py-2 text-sm font-bold text-[#0F2042] hover:bg-slate-50 disabled:opacity-40">
          {busy === "manual" ? <Loader2 size={14} className="animate-spin" /> : <PencilLine size={14} />} Start without AI
        </button>
        <button data-testid="ds-upload-btn" onClick={() => fileRef.current?.click()} disabled={!!busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:border-[#F97316] disabled:opacity-40">
          {busy === "upload" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Import PDF / DOCX
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" data-testid="ds-file-input"
          onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

/* ============ chip list editor ============ */
function ChipEditor({ label, items, onChange, testId }) {
  const [val, setVal] = useState("");
  const add = () => { const t = val.trim(); if (!t) return; onChange([...(items || []), t]); setVal(""); };
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {(items || []).map((it, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            {it}
            <button onClick={() => onChange(items.filter((_, x) => x !== i))} className="text-slate-400 hover:text-rose-500"><X size={10} /></button>
          </span>
        ))}
        <input data-testid={testId} value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} onBlur={add}
          placeholder="+ add…" className="w-28 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] outline-none focus:border-[#F97316]" />
      </div>
    </div>
  );
}

/* ============ Step 2+3 — structure + documents ============ */
function Workspace({ job, setJob, aiOn, onSaved }) {
  const [d, setD] = useState(job.data);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("sdd");
  const set = (k, v) => { setD((p) => ({ ...p, [k]: v })); setDirty(true); };

  useEffect(() => { setD(job.data); setDirty(false); }, [job.id]);

  const saveStructure = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/doc-studio/jobs/${job.id}`, { data: d });
      setJob({ ...job, data: data.data });
      setDirty(false);
      onSaved();
      toast.success("Structure saved");
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };

  const inputCls = "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]";
  return (
    <div className="space-y-5">
      {/* ---- structure ---- */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="ds-structure">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// step 2 — structure {job.analysis_mode === "ai" ? "· AI extracted" : "· manual"}</div>
            <h3 className="font-display text-lg font-bold text-[#0F2042]">{d.project_name}</h3>
          </div>
          <button data-testid="ds-save-structure" onClick={saveStructure} disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-40">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} {dirty ? "Save structure" : "Saved"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Project name</span>
            <input data-testid="ds-f-name" value={d.project_name} onChange={(e) => set("project_name", e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Type</span>
            <input data-testid="ds-f-type" value={d.project_type} onChange={(e) => set("project_type", e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Domain</span>
            <input data-testid="ds-f-domain" value={d.domain} onChange={(e) => set("domain", e.target.value)} className={inputCls} /></label>
          <label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Timeline (weeks)</span>
            <input data-testid="ds-f-weeks" type="number" min={2} max={24} value={d.timeline_weeks} onChange={(e) => set("timeline_weeks", parseInt(e.target.value) || 6)} className={inputCls} /></label>
        </div>
        <label className="mt-3 block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-400">Problem statement</span>
          <textarea data-testid="ds-f-problem" rows={2} value={d.problem_statement} onChange={(e) => set("problem_statement", e.target.value)} className={inputCls} /></label>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <ChipEditor label="Goals" items={d.goals} onChange={(v) => set("goals", v)} testId="ds-chip-goals" />
          <ChipEditor label="Tech stack" items={d.tech_stack} onChange={(v) => set("tech_stack", v)} testId="ds-chip-stack" />
          <ChipEditor label="Non-functional requirements" items={d.requirements} onChange={(v) => set("requirements", v)} testId="ds-chip-reqs" />
          <ChipEditor label="Risks" items={d.risks} onChange={(v) => set("risks", v)} testId="ds-chip-risks" />
        </div>
        <ModulesEditor modules={d.modules} onChange={(v) => set("modules", v)} />
      </div>

      {/* ---- documents ---- */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="ds-documents">
        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// step 3 — documents</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button key={k.v} data-testid={`ds-tab-${k.v}`} onClick={() => setTab(k.v)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === k.v ? "bg-[#0F2042] text-white shadow" : "bg-slate-100 text-slate-500 hover:text-[#0F2042]"}`}>
              {k.label}{(job.docs || {})[k.v] ? " ●" : ""}
            </button>
          ))}
        </div>
        <DocPane key={tab} kind={tab} job={job} setJob={setJob} aiOn={aiOn} dirty={dirty} />
      </div>
    </div>
  );
}

function ModulesEditor({ modules, onChange }) {
  const upd = (i, k, v) => onChange(modules.map((m, x) => (x === i ? { ...m, [k]: v } : m)));
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 flex items-center gap-1"><Boxes size={11} /> Modules</div>
        <button data-testid="ds-add-module" onClick={() => onChange([...(modules || []), { name: "", purpose: "", features: [] }])}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[10px] font-bold text-slate-600 hover:border-[#F97316]"><Plus size={10} /> Module</button>
      </div>
      {(modules || []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-[11px] text-slate-400">No modules yet — add them to enrich the SDD & SRS.</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {modules.map((m, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <input value={m.name} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Module name"
                  className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold outline-none focus:border-[#F97316]" data-testid={`ds-module-name-${i}`} />
                <button onClick={() => onChange(modules.filter((_, x) => x !== i))} className="rounded-lg border border-rose-200 p-1.5 text-rose-400"><Trash2 size={11} /></button>
              </div>
              <input value={m.purpose} onChange={(e) => upd(i, "purpose", e.target.value)} placeholder="Purpose"
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] outline-none focus:border-[#F97316]" />
              <input value={(m.features || []).join(", ")} onChange={(e) => upd(i, "features", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="Features (comma separated)" className="mt-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] outline-none focus:border-[#F97316]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============ tiny markdown preview ============ */
function mdToHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const lines = (md || "").split("\n");
  let html = "", inUl = false, inTable = false;
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>");
  const closeUl = () => { if (inUl) { html += "</ul>"; inUl = false; } };
  const closeTable = () => { if (inTable) { html += "</table>"; inTable = false; } };
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*\|/.test(l)) {
      closeUl();
      if (/^\s*\|[\s\-|:]+\|\s*$/.test(l)) continue;
      const cells = l.split("|").slice(1, -1).map((c) => c.trim());
      if (!inTable) { html += `<table><tr>${cells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`; inTable = true; }
      else html += `<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`;
      continue;
    }
    closeTable();
    if (/^###\s/.test(l)) { closeUl(); html += `<h4>${inline(l.slice(4))}</h4>`; }
    else if (/^##\s/.test(l)) { closeUl(); html += `<h3>${inline(l.slice(3))}</h3>`; }
    else if (/^#\s/.test(l)) { closeUl(); html += `<h2>${inline(l.slice(2))}</h2>`; }
    else if (/^\s*[-•*]\s/.test(l)) { if (!inUl) { html += "<ul>"; inUl = true; } html += `<li>${inline(l.replace(/^\s*[-•*]\s/, ""))}</li>`; }
    else if (l.trim() === "") { closeUl(); }
    else { closeUl(); html += `<p>${inline(l)}</p>`; }
  }
  closeUl(); closeTable();
  return html;
}

/* ============ single document pane ============ */
function DocPane({ kind, job, setJob, aiOn, dirty }) {
  const md = (job.docs || {})[kind] || "";
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(md);
  const [refine, setRefine] = useState("");
  const meta = (job.docs_meta || {})[kind];

  const gen = async (mode) => {
    if (dirty) { toast.error("Save the structure first"); return; }
    setBusy(mode);
    try {
      const { data } = await api.post(`/doc-studio/jobs/${job.id}/generate`, { kind, mode });
      setJob((p) => ({ ...p, docs: { ...(p.docs || {}), [kind]: data.markdown }, docs_meta: { ...(p.docs_meta || {}), [kind]: { mode: data.mode } } }));
      setDraft(data.markdown);
      toast.success(data.mode === "ai" ? "Generated with AI" : "Generated from template");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const saveEdit = async () => {
    setBusy("save");
    try {
      await api.put(`/doc-studio/jobs/${job.id}/docs/${kind}`, { markdown: draft });
      setJob((p) => ({ ...p, docs: { ...(p.docs || {}), [kind]: draft } }));
      setEditing(false);
      toast.success("Saved");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const doRefine = async () => {
    if (!refine.trim()) return;
    setBusy("refine");
    try {
      const { data } = await api.post(`/doc-studio/jobs/${job.id}/refine`, { kind, instruction: refine });
      setJob((p) => ({ ...p, docs: { ...(p.docs || {}), [kind]: data.markdown } }));
      setDraft(data.markdown);
      setRefine("");
      toast.success("Refined ✨");
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  const dl = async () => {
    setBusy("pdf");
    try { await downloadApiPdf(`/doc-studio/jobs/${job.id}/pdf?kind=${kind}`, `${kind.toUpperCase()}.pdf`); }
    catch { toast.error("PDF failed"); }
    setBusy("");
  };
  const saveDocs = async () => {
    setBusy("docs");
    try {
      const { data } = await api.post(`/doc-studio/jobs/${job.id}/save-to-documents`, { kind });
      toast.success(`Saved to Documents → Doc Studio: ${data.name}`);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy("");
  };

  if (!md) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center" data-testid={`ds-empty-${kind}`}>
        <FileText size={28} className="mx-auto mb-2 text-slate-300" />
        <div className="text-sm font-bold text-slate-500">Generate the {KINDS.find((k) => k.v === kind)?.full}</div>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button data-testid={`ds-gen-ai-${kind}`} onClick={() => gen("ai")} disabled={!!busy || aiOn === false}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
            {busy === "ai" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate with AI
          </button>
          <button data-testid={`ds-gen-tpl-${kind}`} onClick={() => gen("template")} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#0F2042] px-5 py-1.5 text-xs font-bold text-[#0F2042] disabled:opacity-40">
            {busy === "template" ? <Loader2 size={12} className="animate-spin" /> : <LayoutTemplate size={12} />} Generate from template
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4" data-testid={`ds-doc-${kind}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button data-testid={`ds-regen-ai-${kind}`} onClick={() => gen("ai")} disabled={!!busy || aiOn === false}
          className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === "ai" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Regenerate (AI)
        </button>
        <button data-testid={`ds-regen-tpl-${kind}`} onClick={() => gen("template")} disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3.5 py-1.5 text-[11px] font-bold text-slate-600 disabled:opacity-40">
          <LayoutTemplate size={11} /> Template
        </button>
        <button data-testid={`ds-edit-${kind}`} onClick={() => { setDraft(md); setEditing((e) => !e); }}
          className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] font-bold ${editing ? "bg-[#F97316] text-white" : "border border-slate-300 text-slate-600"}`}>
          <PencilLine size={11} /> {editing ? "Editing…" : "Edit"}
        </button>
        <span className="ml-auto" />
        <button data-testid={`ds-pdf-${kind}`} onClick={dl} disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-3.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === "pdf" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} PDF
        </button>
        <button data-testid={`ds-savedocs-${kind}`} onClick={saveDocs} disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-full border border-emerald-300 px-3.5 py-1.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
          {busy === "docs" ? <Loader2 size={11} className="animate-spin" /> : <FolderPlus size={11} />} Save to Documents
        </button>
      </div>
      {meta?.mode && <div className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Generated via {meta.mode === "ai" ? "AI" : "template"}</div>}

      {editing ? (
        <div className="mt-3">
          <textarea data-testid={`ds-editor-${kind}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={18}
            className="w-full rounded-2xl border border-slate-300 p-4 font-mono text-xs outline-none focus:border-[#F97316]" />
          <button data-testid={`ds-save-edit-${kind}`} onClick={saveEdit} disabled={busy === "save"}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-5 py-2 text-xs font-bold text-white disabled:opacity-40">
            {busy === "save" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
          </button>
        </div>
      ) : (
        <div data-testid={`ds-preview-${kind}`}
          className="ds-md mt-3 max-h-[560px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50/60 p-5"
          dangerouslySetInnerHTML={{ __html: mdToHtml(md) }} />
      )}

      {/* chat-refine */}
      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50/50 p-2.5">
        <Wand2 size={14} className="shrink-0 text-violet-500" />
        <input data-testid={`ds-refine-${kind}`} value={refine} onChange={(e) => setRefine(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doRefine()}
          placeholder={aiOn === false ? "AI refine unavailable — use Edit instead" : 'Refine with AI — e.g. "add a security section", "make the plan 8 weeks"'}
          disabled={aiOn === false || !!busy}
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400 disabled:opacity-50" />
        <button data-testid={`ds-refine-send-${kind}`} onClick={doRefine} disabled={aiOn === false || !!busy || !refine.trim()}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-40">
          {busy === "refine" ? <Loader2 size={11} className="animate-spin" /> : "Refine"}
        </button>
      </div>
    </div>
  );
}
