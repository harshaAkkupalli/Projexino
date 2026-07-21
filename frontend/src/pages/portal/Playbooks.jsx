/** Playbooks — bookshelf-style list + premium 100% no-AI builder: per-section editor
 * (paragraphs, tables, images), smart paste auto-design, live document preview. */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Plus, X, Loader2, Download, Trash2, Edit3, ExternalLink, Link2, Eye, GripVertical,
  Table as TableIcon, ImagePlus, Wand2, ArrowUp, ArrowDown,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf } from "@/lib/download";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { toast } from "sonner";

export const THEMES = {
  future_tech: { label: "Future Tech", bg: "#0A1428", accent: "#3B82F6", accent2: "#F97316", text: "#FFFFFF", muted: "#7DA2D6", tagline: "Innovate. Automate. Elevate.", style: "tech" },
  minimal_clean: { label: "Minimal Clean", bg: "#FFFFFF", accent: "#2563EB", accent2: "#1E3A8A", text: "#1E3A8A", muted: "#64748B", tagline: "Clarity in process. Excellence in execution.", style: "minimal" },
  creative_edge: { label: "Creative Edge", bg: "#FFFFFF", accent: "#F97316", accent2: "#7C3AED", text: "#111827", muted: "#6B7280", tagline: "Ideas. Design. Impact.", style: "creative" },
  corporate_pro: { label: "Corporate Professional", bg: "#123A8F", accent: "#F97316", accent2: "#0B2A6B", text: "#FFFFFF", muted: "#9DB8E8", tagline: "Professionalism. Reliability. Results.", style: "corporate" },
  nature: { label: "Nature Inspired", bg: "#F4F9EC", accent: "#4C8C2B", accent2: "#2F5E1A", text: "#1E3A24", muted: "#6B8F5E", tagline: "Growing together. Building a sustainable future.", style: "nature" },
  none: { label: "No Theme · Blank", bg: "#FFFFFF", accent: "#334155", accent2: "#475569", text: "#111827", muted: "#94A3B8", tagline: "", style: "none" },
};
const ALIASES = { midnight: "future_tech", ivory: "minimal_clean", noir: "creative_edge", royal: "corporate_pro", emerald: "nature" };
export const themeOf = (k) => THEMES[ALIASES[k] || k] || THEMES.future_tech;

export function BookCover({ pb, className = "", animate3d = false }) {
  const t = themeOf(pb.theme);
  const light = ["minimal", "creative", "nature", "none"].includes(t.style);
  const isNone = t.style === "none";
  const words = (pb.title || "Playbook").toUpperCase().split(" ");
  const cut = Math.max(1, Math.floor(words.length / 2));
  const feats = (pb.sections || []).map((s) => s.heading).filter(Boolean).slice(0, 3);
  return (
    <motion.div
      whileHover={animate3d ? { rotateY: -9, rotateX: 4, scale: 1.03 } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      style={{ transformStyle: "preserve-3d", perspective: 900 }}
      className={`relative overflow-hidden rounded-xl shadow-xl ${className}`}
    >
      <div className="relative h-full w-full" style={{ background: t.bg, aspectRatio: "3 / 4.2", border: isNone ? "1.5px dashed #CBD5E1" : "none", borderRadius: isNone ? "12px" : 0 }}>
        {!isNone && <div className="absolute left-0 right-0 top-0 h-[3.5%]" style={{ background: t.accent }} />}
        {/* per-theme animated decor */}
        {t.style === "tech" && (
          <>
            <motion.div animate={{ scale: [1, 1.12, 1], opacity: [0.5, 0.9, 0.5] }} transition={{ duration: 3.5, repeat: Infinity }}
              className="absolute right-[10%] top-[26%] h-12 w-12 rounded-full border-2" style={{ borderColor: t.accent, boxShadow: `0 0 22px ${t.accent}88` }} />
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
              className="absolute right-[4%] top-[20%] h-24 w-24 rounded-full border border-dashed opacity-40" style={{ borderColor: t.accent }} />
          </>
        )}
        {t.style === "minimal" && (
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 4, repeat: Infinity }}
            className="absolute -right-6 top-[16%] h-24 w-32 rounded-full" style={{ background: "#EDF1F7" }} />
        )}
        {t.style === "creative" && (
          <>
            <motion.div animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 3, repeat: Infinity }}
              className="absolute right-[6%] top-[20%] h-16 w-16 rounded-full opacity-80" style={{ background: t.accent2 }} />
            <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 3.6, repeat: Infinity }}
              className="absolute right-[26%] top-[16%] h-10 w-10 rounded-full opacity-80" style={{ background: t.accent }} />
          </>
        )}
        {t.style === "corporate" && (
          <div className="absolute inset-y-0 right-0 w-[32%]" style={{ background: "rgba(255,255,255,0.08)", clipPath: "polygon(45% 0, 100% 0, 100% 100%, 0 100%)", borderLeft: `2px solid ${t.accent}` }} />
        )}
        {t.style === "nature" && (
          <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 4.5, repeat: Infinity }}
            className="absolute right-[8%] top-[22%] h-14 w-14 rounded-full opacity-80" style={{ background: t.accent }} />
        )}
        <div className="flex h-full flex-col p-[9%]">
          <div className="flex items-start justify-between">
            <div className={`w-fit rounded px-1.5 py-1 ${light ? "" : "bg-white/95"}`}><img src="/projexino-logo.png" alt="" className="h-4 object-contain" /></div>
            <div className="rounded-full px-1.5 py-0.5 text-[6px] font-bold" style={{ background: "rgba(128,128,128,0.16)", color: t.text }}>V1.0 · {new Date().getFullYear()}</div>
          </div>
          <div className="mt-[16%] font-display text-[15px] font-bold leading-tight">
            <span style={{ color: t.text }}>{words.slice(0, cut).join(" ")} </span>
            <span style={{ color: t.accent }}>{words.slice(cut).join(" ")}</span>
          </div>
          <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em]" style={{ color: t.text }}>
            {(pb.category || "Playbook").toUpperCase()} TEMPLATE
          </div>
          <div className="mt-1 h-[3px] w-9" style={{ background: t.accent }} />
          <div className="mt-1.5 line-clamp-2 text-[8px]" style={{ color: t.muted }}>{pb.subtitle || t.tagline}</div>
          {feats.length > 0 && !isNone && (
            <div className="mt-auto mb-2 flex divide-x rounded-lg border text-center"
              style={{ background: light ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.07)", borderColor: "rgba(128,128,128,0.3)", divideColor: "rgba(128,128,128,0.3)" }}>
              {feats.map((f, i) => (
                <div key={i} className="flex-1 px-1 py-1.5" style={{ borderColor: "rgba(128,128,128,0.25)" }}>
                  <div className="text-[8px] font-bold" style={{ color: t.accent }}>{String(i + 1).padStart(2, "0")}</div>
                  <div className="line-clamp-2 text-[5.5px] font-bold uppercase" style={{ color: light ? "#1F2937" : t.text }}>{f}</div>
                </div>
              ))}
            </div>
          )}
          <div className={feats.length ? "" : "mt-auto"} />
        </div>
        {!isNone && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around py-1 text-[5.5px] font-bold text-white"
            style={{ background: light ? t.accent2 : "rgba(255,255,255,0.1)" }}>
            <span>www.projexino.com</span><span>hello@projexino.com</span><span>{new Date().getFullYear()}</span>
          </div>
        )}
        {isNone && (
          <div className="absolute bottom-2 left-0 right-0 text-center text-[6px] font-bold uppercase tracking-widest text-slate-300">
            No theme · your pages as-is
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Playbooks() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [preview, setPreview] = useState(null);
  const [downloading, setDownloading] = useState("");

  const reload = async () => {
    try { const { data } = await api.get("/playbooks"); setItems(data); }
    catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const copyUrl = (pb) => {
    const url = `${window.location.origin}/playbook/${pb.slug}`;
    navigator.clipboard.writeText(url);
    toast.success("Playbook URL copied", { description: url });
  };

  const onDelete = async (pb) => {
    if (!window.confirm(`Delete playbook "${pb.title}"?`)) return;
    await api.delete(`/playbooks/${pb.id}`);
    setItems((p) => p.filter((x) => x.id !== pb.id));
    toast.success("Playbook deleted");
  };

  return (
    <div data-testid="playbooks-page" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// knowledge library</div>
          <h1 className="font-display text-2xl font-bold text-[#0F2042]">Playbooks</h1>
          <p className="text-xs text-slate-500">Design premium playbooks — paragraphs, tables & images per section with a live preview. No AI, all craft.</p>
        </div>
        <button data-testid="pb-new-btn" onClick={() => setEditor({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 hover:bg-orange-600">
          <Plus size={15} /> Create playbook
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-slate-300" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-14 text-center" data-testid="pb-empty">
          <BookOpen size={36} className="mx-auto mb-3 text-slate-300" />
          <div className="font-display text-lg font-bold text-slate-500">Your bookshelf is empty</div>
          <p className="text-xs text-slate-400">Create your first playbook — the cover designs itself.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="pb-shelf">
          {items.map((pb) => (
            <motion.div key={pb.id} layout data-testid={`pb-card-${pb.slug}`} className="group">
              <button onClick={() => setPreview(pb)} data-testid={`pb-open-${pb.slug}`} className="block w-full text-left">
                <BookCover pb={pb} animate3d />
              </button>
              <div className="mx-auto -mt-1 h-2 w-[80%] rounded-b-lg bg-slate-300/60 blur-[1px]" />
              <div className="mt-2">
                <div className="line-clamp-1 text-xs font-bold text-[#0F2042]">{pb.title}</div>
                <div className="text-[10px] text-slate-400">{pb.section_count} section{pb.section_count === 1 ? "" : "s"} · {themeOf(pb.theme).label}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <a href={`/playbook/${pb.slug}`} target="_blank" rel="noreferrer" data-testid={`pb-view-${pb.slug}`}
                    className="rounded-full bg-[#0F2042] p-1.5 text-white hover:bg-[#1a3060]" title="Open public page"><ExternalLink size={11} /></a>
                  <button onClick={() => setPreview(pb)} className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#F97316]" title="Preview PDF"><Eye size={11} /></button>
                  <button data-testid={`pb-download-${pb.slug}`} disabled={downloading === pb.id}
                    onClick={async () => { setDownloading(pb.id); try { await downloadApiPdf(`/public/playbooks/${pb.slug}/pdf`, `${pb.slug}-playbook.pdf`); } catch { toast.error("PDF failed"); } setDownloading(""); }}
                    className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#F97316] disabled:opacity-50" title="Download PDF">
                    {downloading === pb.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                  </button>
                  <button onClick={() => copyUrl(pb)} data-testid={`pb-copy-${pb.slug}`} className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#F97316]" title="Copy URL"><Link2 size={11} /></button>
                  <button onClick={() => setEditor(pb)} data-testid={`pb-edit-${pb.slug}`} className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#0F2042]" title="Edit"><Edit3 size={11} /></button>
                  <button onClick={() => onDelete(pb)} data-testid={`pb-delete-${pb.slug}`} className="rounded-full border border-rose-200 p-1.5 text-rose-400 hover:bg-rose-50" title="Delete"><Trash2 size={11} /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {editor && <PlaybookBuilder pb={editor.id ? editor : null} onClose={() => setEditor(null)}
          onSaved={async (saved, makePdf) => { setEditor(null); await reload(); if (saved?.slug) { if (makePdf) setPreview(saved); else toast.success("Playbook ready!", { description: `${window.location.origin}/playbook/${saved.slug}` }); } }} />}
        {preview && <PdfPreviewModal title={preview.title} fetchPath={`/public/playbooks/${preview.slug}/pdf`}
          filename={`${preview.slug}-playbook.pdf`} onClose={() => setPreview(null)} />}
      </AnimatePresence>
    </div>
  );
}

function PlaybookBuilder({ pb, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: pb?.title || "",
    subtitle: pb?.subtitle || "",
    author: pb?.author || "Projexino Solutions",
    category: pb?.category || "Playbook",
    theme: ALIASES[pb?.theme] || pb?.theme || "future_tech",
    sections: pb?.sections?.length ? pb.sections.map((s) => ({ heading: "", body: "", table: null, image_b64: "", full_page: false, ...s })) : [{ heading: "", body: "", table: null, image_b64: "", full_page: false }],
  });
  const pagesRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setSection = (i, k, v) => setForm((p) => ({ ...p, sections: p.sections.map((s, j) => (j === i ? { ...s, [k]: v } : s)) }));
  const moveSection = (i, dir) => setForm((p) => {
    const arr = [...p.sections];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return p;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...p, sections: arr };
  });

  const runParse = async (mode) => {
    if (!pasteText.trim()) { toast.error("Paste some content first"); return; }
    setParsing(true);
    try {
      const { data } = await api.post("/playbooks/parse", { text: pasteText });
      const secs = (data.sections || []).map((s) => ({ image_b64: "", ...s }));
      const existing = form.sections.filter((s) => (s.heading || "").trim() || (s.body || "").trim() || s.table);
      set("sections", mode === "replace" ? secs : [...existing, ...secs]);
      setPasteOpen(false); setPasteText("");
      toast.success(`Auto-designed ${secs.length} section(s) — headings, paragraphs & tables detected`);
    } catch (e) { toast.error(formatApiError(e)); }
    setParsing(false);
  };

  const addPages = (files) => {
    const arr = Array.from(files || []).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) { toast.error("Pick image files (each becomes one page)"); return; }
    arr.forEach((f) => {
      if (f.size > 3 * 1024 * 1024) { toast.error(`${f.name} is over 3 MB — skipped`); return; }
      const reader = new FileReader();
      reader.onload = () => setForm((p) => ({
        ...p,
        sections: [...p.sections.filter((s) => (s.heading || "").trim() || (s.body || "").trim() || s.table || s.image_b64),
          { heading: "", body: "", table: null, image_b64: reader.result, full_page: true }],
      }));
      reader.readAsDataURL(f);
    });
    toast.success(`Adding ${arr.length} page(s)…`);
  };

  const save = async (makePdf = false) => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setBusy(true);
    try {
      const { data } = pb ? await api.patch(`/playbooks/${pb.id}`, form) : await api.post("/playbooks", form);
      onSaved(data, makePdf);
    } catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" data-testid="pb-builder-modal">
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[93vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">{pb ? "Edit playbook" : "New playbook"} · 100% manual, no AI</div>
            <div className="font-display text-lg font-bold">Playbook designer</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr] lg:overflow-hidden">
          <div className="space-y-4 p-5 lg:overflow-y-auto">
            <div className="grid grid-cols-2 gap-2">
              <input data-testid="pb-title" placeholder="Playbook title *" value={form.title} onChange={(e) => set("title", e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-[#F97316]" />
              <input data-testid="pb-category" placeholder="Category (e.g. Sales, Ops)" value={form.category} onChange={(e) => set("category", e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input data-testid="pb-subtitle" placeholder="Subtitle / tagline" value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <input data-testid="pb-author" placeholder="Author" value={form.author} onChange={(e) => set("author", e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Theme</div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {Object.entries(THEMES).map(([k, t]) => (
                  <button key={k} data-testid={`pb-theme-${k}`} onClick={() => set("theme", k)}
                    className={`overflow-hidden rounded-lg border-2 text-left transition ${form.theme === k ? "border-[#F97316] shadow-md" : "border-transparent opacity-75 hover:opacity-100"}`}>
                    <div className="h-12" style={{ background: t.bg }}>
                      <div className="h-1.5" style={{ background: t.accent }} />
                      <div className="mx-1.5 mt-1.5 h-1 w-2/3 rounded" style={{ background: t.text, opacity: 0.85 }} />
                      <div className="mx-1.5 mt-1 h-1 w-1/3 rounded" style={{ background: t.accent }} />
                    </div>
                    <div className="truncate bg-white px-1.5 py-1 text-[8px] font-bold text-slate-600">{t.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-dashed border-violet-300 bg-violet-50/50 p-3">
              <button data-testid="pb-smart-paste-toggle" onClick={() => setPasteOpen(!pasteOpen)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-700">
                <Wand2 size={13} /> Smart paste (no AI) — paste raw text & auto-design sections
              </button>
              {pasteOpen && (
                <div className="mt-2 space-y-2">
                  <textarea data-testid="pb-smart-paste-text" rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)}
                    placeholder={"Paste anything — headings, paragraphs, bullets, even tables (| or tab separated).\nThe designer detects structure and lays out sections, styled tables & auto-charts."}
                    className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs leading-relaxed outline-none focus:border-violet-400" />
                  <div className="flex gap-2">
                    <button data-testid="pb-smart-paste-append" disabled={parsing} onClick={() => runParse("append")}
                      className="rounded-full bg-violet-600 px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-50">
                      {parsing ? "Designing…" : "Append sections"}
                    </button>
                    <button data-testid="pb-smart-paste-replace" disabled={parsing} onClick={() => runParse("replace")}
                      className="rounded-full border border-violet-300 px-4 py-1.5 text-[11px] font-bold text-violet-700 disabled:opacity-50">
                      Replace all sections
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Sections & pages</span>
                <div className="flex items-center gap-1.5">
                  <button data-testid="pb-add-pages" onClick={() => pagesRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-2.5 py-1 text-[10px] font-bold text-white hover:bg-[#1a3060]">
                    <ImagePlus size={10} /> Add page(s)
                  </button>
                  <input ref={pagesRef} type="file" accept="image/*" multiple className="hidden" data-testid="pb-pages-input"
                    onChange={(e) => { addPages(e.target.files); e.target.value = ""; }} />
                  <button data-testid="pb-add-section" onClick={() => set("sections", [...form.sections, { heading: "", body: "", table: null, image_b64: "", full_page: false }])}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
                    <Plus size={10} /> Add section
                  </button>
                </div>
              </div>
              <p className="mb-2 text-[10px] text-slate-400">"Add page(s)": drop in full-page images (e.g. designs from ChatGPT) — each image becomes one full PDF page, in order.</p>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/70 px-2.5 py-1.5" data-testid="pb-page-dimensions">
                <span className="text-[9px] font-bold uppercase tracking-wide text-sky-700">📐 Page size to design for:</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-sky-800 ring-1 ring-sky-200">A4 Portrait · 210 × 297 mm</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-sky-800 ring-1 ring-sky-200">1240 × 1754 px @150 DPI</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-sky-800 ring-1 ring-sky-200">ratio 1 : 1.414</span>
                <span className="basis-full text-[9px] text-sky-600">Design page images at this size (or any 210:297 ratio, e.g. 1080 × 1528) — they'll fill the PDF page perfectly.</span>
              </div>
              <div className="space-y-3">
                {form.sections.map((s, i) => (
                  <SectionEditor key={i} s={s} i={i} total={form.sections.length}
                    onChange={(k, v) => setSection(i, k, v)}
                    onMove={(dir) => moveSection(i, dir)}
                    onRemove={() => set("sections", form.sections.filter((_, j) => j !== i))} />
                ))}
              </div>
            </div>

            <button data-testid="pb-save" onClick={() => save(true)} disabled={busy}
              className="w-full rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {busy ? "Crafting your playbook…" : pb ? "Save & open PDF" : "Create playbook"}
            </button>
            <p className="text-center text-[10px] text-slate-400">Saves the playbook and opens the finished PDF instantly — all links inside stay clickable even after downloading.</p>
          </div>

          <div className="border-t border-slate-100 bg-slate-100 p-5 lg:overflow-y-auto lg:border-l lg:border-t-0" data-testid="pb-live-preview">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Live document preview</span>
              <span className="text-[10px] text-slate-400">/playbook/{(form.title || "your-title").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}</span>
            </div>
            <DocPreview form={form} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SectionEditor({ s, i, total, onChange, onMove, onRemove }) {
  const fileRef = useRef(null);
  const table = s.table;

  if (s.full_page && s.image_b64) {
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-[#0F2042]/20 bg-slate-50 p-3" data-testid={`pb-section-${i}`}>
        <img src={s.image_b64} alt="" className="h-20 w-14 shrink-0 rounded border border-slate-200 object-cover" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold text-[#0F2042]">FULL PAGE {String(i + 1).padStart(2, "0")}</div>
          <div className="text-[10px] text-slate-400">Rendered as its own PDF page</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove(-1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30" data-testid={`pb-sec-up-${i}`}><ArrowUp size={12} /></button>
          <button onClick={() => onMove(1)} disabled={i === total - 1} className="rounded p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30" data-testid={`pb-sec-down-${i}`}><ArrowDown size={12} /></button>
          <button onClick={onRemove} className="rounded p-0.5 text-rose-400 hover:text-rose-600" data-testid={`pb-sec-del-${i}`}><Trash2 size={12} /></button>
        </div>
      </div>
    );
  }

  const setCell = (ri, ci, v) => onChange("table", table.map((r, rj) => (rj === ri ? r.map((c, cj) => (cj === ci ? v : c)) : r)));
  const addRow = () => onChange("table", [...table, Array(table[0].length).fill("")]);
  const addCol = () => onChange("table", table.map((r) => [...r, ""]));
  const delRow = (ri) => onChange("table", table.filter((_, rj) => rj !== ri));
  const delCol = (ci) => {
    if (table[0].length <= 1) return;
    onChange("table", table.map((r) => r.filter((_, cj) => cj !== ci)));
  };

  const onImage = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Pick an image file"); return; }
    if (file.size > 2.5 * 1024 * 1024) { toast.error("Image must be under 2.5 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => onChange("image_b64", reader.result);
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-xl border border-slate-200 p-3" data-testid={`pb-section-${i}`}>
      <div className="flex items-center gap-2">
        <GripVertical size={13} className="text-slate-300" />
        <span className="text-[10px] font-bold text-[#F97316]">SECTION {String(i + 1).padStart(2, "0")}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => onMove(-1)} disabled={i === 0} className="rounded p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30" data-testid={`pb-sec-up-${i}`}><ArrowUp size={12} /></button>
          <button onClick={() => onMove(1)} disabled={i === total - 1} className="rounded p-0.5 text-slate-400 hover:text-[#0F2042] disabled:opacity-30" data-testid={`pb-sec-down-${i}`}><ArrowDown size={12} /></button>
          {total > 1 && <button onClick={onRemove} className="rounded p-0.5 text-rose-400 hover:text-rose-600" data-testid={`pb-sec-del-${i}`}><Trash2 size={12} /></button>}
        </div>
      </div>
      <input data-testid={`pb-sec-heading-${i}`} placeholder="Section heading" value={s.heading}
        onChange={(e) => onChange("heading", e.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#F97316]" />
      <textarea data-testid={`pb-sec-body-${i}`} rows={4} placeholder={"Section content. Blank line = new paragraph. Lines starting with '-' become bullet points."}
        value={s.body} onChange={(e) => onChange("body", e.target.value)}
        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs leading-relaxed outline-none focus:border-[#F97316]" />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!table && (
          <button data-testid={`pb-sec-add-table-${i}`} onClick={() => onChange("table", [["Column 1", "Column 2"], ["", ""]])}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-[#0F2042] hover:text-[#0F2042]">
            <TableIcon size={10} /> Add table
          </button>
        )}
        {!s.image_b64 && (
          <button data-testid={`pb-sec-add-image-${i}`} onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-[#0F2042] hover:text-[#0F2042]">
            <ImagePlus size={10} /> Add image
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid={`pb-sec-image-input-${i}`}
          onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {table && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2" data-testid={`pb-sec-table-${i}`}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-[9px] font-bold uppercase text-slate-400">Table — first row is the header. Numeric columns get an auto-chart in the PDF.</span>
            <button onClick={() => onChange("table", null)} className="ml-auto text-[10px] font-bold text-rose-400 hover:text-rose-600" data-testid={`pb-sec-table-remove-${i}`}>Remove table</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody>
                {table.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="p-0.5">
                        <input value={cell} onChange={(e) => setCell(ri, ci, e.target.value)}
                          data-testid={`pb-sec-${i}-cell-${ri}-${ci}`}
                          className={`w-full min-w-[70px] rounded border px-1.5 py-1 text-[11px] outline-none focus:border-[#F97316] ${ri === 0 ? "border-slate-300 bg-slate-50 font-bold" : "border-slate-200"}`} />
                      </td>
                    ))}
                    <td className="p-0.5">
                      {table.length > 2 && ri > 0 && (
                        <button onClick={() => delRow(ri)} className="text-rose-300 hover:text-rose-500" title="Delete row"><X size={11} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 flex gap-2">
            <button onClick={addRow} data-testid={`pb-sec-table-addrow-${i}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">+ Row</button>
            <button onClick={addCol} data-testid={`pb-sec-table-addcol-${i}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">+ Column</button>
            {table[0].length > 1 && (
              <button onClick={() => delCol(table[0].length - 1)} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-200">− Last column</button>
            )}
          </div>
        </div>
      )}

      {s.image_b64 && (
        <div className="relative mt-2 w-fit" data-testid={`pb-sec-image-preview-${i}`}>
          <img src={s.image_b64} alt="" className="max-h-32 rounded-lg border border-slate-200 object-contain" />
          <button onClick={() => onChange("image_b64", "")} data-testid={`pb-sec-image-remove-${i}`}
            className="absolute -right-2 -top-2 rounded-full bg-rose-500 p-1 text-white shadow"><X size={10} /></button>
        </div>
      )}
    </div>
  );
}

function DocPreview({ form }) {
  const t = themeOf(form.theme);
  const sections = form.sections.filter((s) => (s.heading || "").trim() || (s.body || "").trim() || s.table || s.image_b64);
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-[210px]"><BookCover pb={form} /></div>
      <div className="overflow-hidden rounded-xl bg-white shadow-lg">
        <div className="flex items-center gap-2 px-4 py-2" style={{ background: form.theme === "none" ? "#F1F5F9" : t.bg }}>
          <div className="rounded bg-white/95 px-1 py-0.5"><img src="/projexino-logo.png" alt="" className="h-3 object-contain" /></div>
          <span className={`truncate text-[9px] font-bold uppercase tracking-wider ${form.theme === "none" ? "text-slate-600" : "text-white"}`}>{form.title || "Untitled playbook"}</span>
        </div>
        <div className="h-1" style={{ background: t.accent }} />
        <div className="space-y-6 px-6 py-5">
          {sections.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Add content to a section — it renders here instantly.</p>
          ) : sections.map((s, i) => <PreviewSection key={i} s={s} idx={i} t={t} />)}
        </div>
        <div className="border-t border-slate-100 px-6 py-2 text-center text-[9px] text-slate-400">
          Projexino Solutions · {form.title || ""}
        </div>
        <div className="h-1.5" style={{ background: t.accent }} />
      </div>
    </div>
  );
}

function PreviewSection({ s, idx, t }) {
  const paras = (s.body || "").replace(/\r\n/g, "\n").split(/\n\n+/).filter((p) => p.trim());
  if (s.full_page && s.image_b64) {
    return (
      <div data-testid={`pb-preview-section-${idx}`} className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
        <img src={s.image_b64} alt="" className="w-full object-contain" />
        <div className="bg-slate-50 px-2 py-1 text-center text-[8px] font-bold uppercase text-slate-400">Full page {String(idx + 1).padStart(2, "0")}</div>
      </div>
    );
  }
  return (
    <div data-testid={`pb-preview-section-${idx}`}>
      {s.heading && (
        <>
          <div className="text-[9px] font-bold tracking-[0.18em]" style={{ color: t.accent }}>SECTION {String(idx + 1).padStart(2, "0")}</div>
          <div className="font-display text-base font-bold" style={{ color: t.bg === "#F5F0E8" ? "#1F2937" : t.bg }}>{s.heading}</div>
          <div className="mb-2 mt-1 h-[2.5px] w-10" style={{ background: t.accent }} />
        </>
      )}
      {paras.map((p, pi) => {
        const lines = p.split("\n");
        const isBullets = lines.every((l) => !l.trim() || /^[-•*]/.test(l.trim()));
        return isBullets ? (
          <ul key={pi} className="mb-2 list-none space-y-1 pl-1 text-[11px] leading-relaxed text-slate-700">
            {lines.filter((l) => l.trim()).map((l, li) => (
              <li key={li} className="flex gap-1.5"><span style={{ color: t.accent }}>•</span>{l.trim().replace(/^[-•*]\s*/, "")}</li>
            ))}
          </ul>
        ) : (
          <p key={pi} className="mb-2 text-justify text-[11px] leading-relaxed text-slate-700">{p}</p>
        );
      })}
      {s.table && s.table.length > 0 && (
        <div className="mb-2 overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <tbody>
              {s.table.map((row, ri) => (
                <tr key={ri} style={ri === 0 ? { background: t.bg } : ri % 2 === 0 ? { background: "#F5F6F8" } : {}}>
                  {row.map((c, ci) => (
                    <td key={ci} className="border border-slate-200 px-2 py-1"
                      style={ri === 0 ? { color: "#fff", fontWeight: 700, borderBottom: `2px solid ${t.accent}` } : { color: "#334155" }}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.image_b64 && <img src={s.image_b64} alt="" className="mx-auto mb-2 max-h-44 rounded-lg object-contain" />}
    </div>
  );
}
