import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Mail, Sparkles, Trash2, Save, Send, Copy, X, Eye,
  Search, ListFilter, FileText, Variable, Wand2, Loader2, Palette, RefreshCw, Brush,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { TEMPLATE_PRESETS, EVENT_PRESETS } from "@/data/emailTemplatePresets";

const CATEGORIES = [
  { v: "general", label: "General" },
  { v: "onboarding", label: "Onboarding" },
  { v: "notification", label: "Notification" },
  { v: "marketing", label: "Marketing" },
  { v: "finance", label: "Finance" },
  { v: "ai", label: "AI-generated" },
];

const COMMON_VARIABLES = [
  { v: "{{name}}", label: "Recipient name" },
  { v: "{{first_name}}", label: "First name" },
  { v: "{{role}}", label: "Role / title" },
  { v: "{{company}}", label: "Company" },
  { v: "{{task_title}}", label: "Task title" },
  { v: "{{due_date}}", label: "Due date" },
  { v: "{{invoice_number}}", label: "Invoice #" },
  { v: "{{amount}}", label: "Amount" },
  { v: "{{login_url}}", label: "Login URL" },
];

const STARTER_HTML = `<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0F2042;">
  <p>Hi <b>{{name}}</b>,</p>
  <p>Welcome to <b>Projexino</b>! Your workspace is ready and your role is <b>{{role}}</b>.</p>
  <p style="background:#FFF7ED; border-left:4px solid #F97316; padding:10px 14px; border-radius:8px;">
    Click below to head straight to your portal.
  </p>
  <p style="text-align:center; margin: 24px 0;">
    <a href="{{login_url}}" style="background: linear-gradient(135deg,#F97316,#A855F7); color:white; padding:12px 24px; border-radius:9999px; text-decoration:none; font-weight:700;">Open Portal</a>
  </p>
  <p>Cheers,<br/>The Projexino team</p>
</div>`;

export default function EmailTemplates() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState(null);
  const [editor, setEditor] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [testTemplate, setTestTemplate] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/email/templates");
      setList(data);
    } catch (e) {
      toast.error("Failed to load templates");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchList(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((t) => {
      if (category !== "all" && (t.category || "general") !== category) return false;
      if (!q) return true;
      return (
        t.name?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.slug?.toLowerCase().includes(q)
      );
    });
  }, [list, query, category]);

  const openCreate = () => setEditor({ name: "", subject: "", body_html: STARTER_HTML, category: "general", variables_hint: [], slug: "", __showGallery: true });
  const openEdit = (t) => setEditor({ ...t });

  const onSaved = (saved) => {
    setList((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) { const arr = [...prev]; arr[idx] = saved; return arr; }
      return [saved, ...prev];
    });
  };

  const onDelete = async (t) => {
    if (t.is_default) { toast.error("Cannot delete default template"); return; }
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try {
      await api.delete(`/email/templates/${t.id}`);
      setList((p) => p.filter((x) => x.id !== t.id));
      toast.success("Template deleted");
      if (selected?.id === t.id) setSelected(null);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Delete failed");
    }
  };

  return (
    <div data-testid="page-email-templates" className="space-y-5">
      {/* Hero */}
      <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/40 to-violet-50/40 p-5 md:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// email · templates</div>
            <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Email template studio</h1>
            <p className="mt-1 text-sm text-slate-600">Design branded transactional emails. Use <code className="rounded bg-orange-100 px-1 text-xs">{`{{variables}}`}</code> for dynamic content.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              data-testid="tpl-ai-btn"
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-200 active:scale-95"
            >
              <Sparkles size={16} /> Generate with AI
            </button>
            <button
              data-testid="tpl-new-btn"
              onClick={openCreate}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 active:scale-95"
            >
              <Plus size={16} /> New template
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="tpl-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-[#F97316]"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setCategory("all")}
            data-testid="tpl-cat-all"
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
              category === "all" ? "bg-[#0F2042] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#0F2042]"
            }`}
          >
            <ListFilter size={12} /> All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.v}
              onClick={() => setCategory(c.v)}
              data-testid={`tpl-cat-${c.v}`}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
                category === c.v ? "bg-[#0F2042] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#0F2042]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Mail size={36} className="mx-auto text-slate-300" />
          <div className="mt-3 text-sm font-bold text-[#0F2042]">No templates match your filter</div>
          <div className="text-xs text-slate-500">Hit "New template" or "Generate with AI" to create one.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <motion.div
              key={t.id}
              layout
              data-testid={`tpl-card-${t.slug || t.id}`}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="relative h-24 bg-gradient-to-br from-[#0F2042] via-[#1E1B4B] to-[#7C3AED] p-4 text-white">
                <div className="absolute -right-4 -top-4 h-20 w-20 rounded-full bg-white/10 blur-xl" />
                <div className="relative">
                  <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-orange-300">// {t.category || "general"}</div>
                  <div className="mt-1 line-clamp-1 text-sm font-bold">{t.name}</div>
                </div>
                {t.is_default && (
                  <span className="absolute right-3 top-3 rounded-full bg-amber-400/30 px-2 py-0.5 text-[9px] font-bold text-amber-100 ring-1 ring-amber-300/50">DEFAULT</span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="line-clamp-1 text-xs font-semibold text-[#0F2042]">{t.subject}</div>
                <div className="mt-2 text-[10px] text-slate-400">
                  {(t.variables_hint || []).slice(0, 4).map((v) => (
                    <code key={v} className="mr-1 inline-block rounded bg-orange-50 px-1.5 py-0.5 text-orange-700">{`{{${v}}}`}</code>
                  ))}
                </div>
                <div className="mt-auto flex gap-1.5 pt-3">
                  <button
                    onClick={() => setSelected(t)}
                    data-testid={`tpl-preview-${t.slug}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200"
                  >
                    <Eye size={12} /> Preview
                  </button>
                  <button
                    onClick={() => openEdit(t)}
                    data-testid={`tpl-edit-${t.slug}`}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0F2042] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1E3A8A]"
                  >
                    <Save size={12} /> Edit
                  </button>
                  {!t.is_default && (
                    <button
                      onClick={() => onDelete(t)}
                      data-testid={`tpl-delete-${t.slug}`}
                      className="flex h-7 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && <PreviewModal template={selected} onClose={() => setSelected(null)} onSendTest={() => { setTestTemplate(selected); setSelected(null); }} />}
        {editor && <EditorModal template={editor} onClose={() => setEditor(null)} onSaved={(t) => { onSaved(t); setEditor(null); }} onSendTest={(t) => { setEditor(null); setSelected(null); setTestTemplate(t); }} />}
        {aiOpen && <AIGenerateModal onClose={() => setAiOpen(false)} onCreated={(t) => { onSaved(t); setAiOpen(false); setEditor({ ...t }); }} />}
        {testTemplate && <SendTestModal template={testTemplate} onClose={() => setTestTemplate(null)} />}
      </AnimatePresence>
    </div>
  );
}

// ====================== PREVIEW MODAL ======================
function PreviewModal({ template, onClose, onSendTest }) {
  const [width, setWidth] = useState("desktop"); // desktop | tablet | phone
  const widthPx = { desktop: 720, tablet: 540, phone: 380 }[width];
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="tpl-preview-modal"
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
        style={{ height: "min(90vh, 900px)" }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// preview</div>
            <h3 className="truncate font-display text-lg font-semibold text-[#0F2042]">{template.name}</h3>
            <div className="mt-0.5 truncate text-xs text-slate-500">{template.subject}</div>
          </div>
          <div className="flex items-center gap-2">
            {/* Width switcher */}
            <div className="hidden rounded-full bg-slate-100 p-1 md:flex">
              {["desktop", "tablet", "phone"].map((w) => (
                <button
                  key={w}
                  onClick={() => setWidth(w)}
                  data-testid={`tpl-preview-w-${w}`}
                  className={`rounded-full px-3 py-1 text-[10px] font-bold capitalize transition ${
                    width === w ? "bg-white text-[#0F2042] shadow-sm" : "text-slate-500 hover:text-[#0F2042]"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
            <button onClick={onSendTest} data-testid="tpl-preview-send-test"
              className="flex items-center gap-1.5 rounded-full bg-[#F97316] px-3.5 py-1.5 text-xs font-bold text-white hover:bg-[#EA580C]">
              <Send size={12} /> Send test
            </button>
            <button onClick={onClose} data-testid="tpl-preview-close" className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
          </div>
        </div>
        {/* SCROLL CONTAINER — supports vertical AND horizontal scroll */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-100 to-slate-50">
          <div className="flex min-h-full justify-center py-6 px-4">
            <div
              style={{ width: `${widthPx}px`, minWidth: `${widthPx}px` }}
              className="rounded-2xl bg-white shadow-xl ring-1 ring-slate-200"
            >
              <iframe
                title="Email preview"
                srcDoc={renderPreview(template.body_html)}
                style={{ width: "100%", height: "1100px", display: "block", border: 0, borderRadius: "16px" }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ====================== EDITOR MODAL ======================
function EditorModal({ template, onClose, onSaved, onSendTest }) {
  const editing = !!template.id;
  const [step, setStep] = useState(template.__showGallery ? "gallery" : "editor");
  const [form, setForm] = useState({
    name: template.name || "",
    subject: template.subject || "",
    body_html: template.body_html || STARTER_HTML,
    category: template.category || "general",
    variables_hint: (template.variables_hint || []).join(", "),
    slug: template.slug || "",
  });
  const [saving, setSaving] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);

  const pickPreset = (preset) => {
    setForm((f) => ({
      ...f,
      name: f.name || preset.name + " template",
      subject: f.subject || `A note for {{name}} — ${preset.name}`,
      body_html: preset.body_html,
    }));
    setStep("editor");
    toast.success(`Loaded "${preset.name}" design — customise away`);
  };

  const pickEvent = (event) => {
    // Event presets bring their own subject + variables — pre-populate ALL of them
    // so the user doesn't have to think about what to add.
    setForm((f) => ({
      ...f,
      name: f.name || event.name,
      subject: event.subject,
      body_html: event.body_html,
      category: event.category || f.category,
      variables_hint: event.variables.join(", "),
    }));
    setStep("editor");
    toast.success(`Loaded "${event.name}" — ${event.variables.length} variables auto-added`);
  };

  const insertVariable = (v) => {
    setForm((f) => ({ ...f, body_html: (f.body_html || "") + v }));
    toast.info(`Inserted ${v}`);
  };
  const insertSubjectVar = (v) => setForm((f) => ({ ...f, subject: (f.subject || "") + v }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (!form.subject.trim()) { toast.error("Subject is required"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        variables_hint: form.variables_hint
          .split(",").map((s) => s.trim().replace(/[{}]/g, "")).filter(Boolean),
      };
      const { data } = editing
        ? await api.patch(`/email/templates/${template.id}`, body)
        : await api.post("/email/templates", body);
      toast.success(editing ? "Template updated" : "Template created");
      onSaved(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveAndTest = async () => {
    if (!form.name.trim() || !form.subject.trim()) { toast.error("Fill name + subject first"); return; }
    setSaving(true);
    try {
      const body = {
        ...form,
        variables_hint: form.variables_hint.split(",").map((s) => s.trim().replace(/[{}]/g, "")).filter(Boolean),
      };
      const { data } = editing
        ? await api.patch(`/email/templates/${template.id}`, body)
        : await api.post("/email/templates", body);
      onSendTest(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onRefined = ({ body_html, subject, variables }) => {
    setForm((f) => ({
      ...f,
      body_html,
      subject: subject || f.subject,
      variables_hint: variables && variables.length ? variables.join(", ") : f.variables_hint,
    }));
    setAiEditOpen(false);
    toast.success("AI refined this template — review the preview");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="tpl-editor-modal"
        className="w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">
              {step === "gallery" ? "// step 1 · pick a design" : `// ${editing ? "edit" : "new"} template`}
            </div>
            <h3 className="font-display text-xl font-semibold text-[#0F2042]">
              {step === "gallery" ? "Choose a design to start with" : (editing ? form.name : "Customise your email template")}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {step === "editor" && !editing && (
              <button onClick={() => setStep("gallery")} data-testid="tpl-back-gallery"
                className="hidden items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316] md:inline-flex">
                <Palette size={12} /> Change design
              </button>
            )}
            {step === "editor" && (
              <button onClick={() => setAiEditOpen(true)} data-testid="tpl-ai-edit-btn"
                className="hidden items-center gap-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3.5 py-1.5 text-[11px] font-bold text-white shadow-sm hover:shadow md:inline-flex">
                <Wand2 size={12} /> Edit with AI
              </button>
            )}
            <button onClick={onClose} data-testid="tpl-editor-close" className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
          </div>
        </div>

        {step === "gallery" ? (
          <DesignGalleryPicker onPickDesign={pickPreset} onPickEvent={pickEvent} onSkip={() => setStep("editor")} />
        ) : (
        <div className="grid max-h-[78vh] grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1.05fr_1fr]">
          {/* LEFT — Editor */}
          <div className="space-y-4 p-6">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Template name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testId="tpl-form-name" />
              <Select label="Category" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES.map((c) => ({ v: c.v, label: c.label }))} testId="tpl-form-category" />
            </div>
            <Field label="Slug (auto if empty)" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} testId="tpl-form-slug" placeholder="welcome_email" />
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Subject *</span>
                <div className="flex gap-1 overflow-x-auto">
                  {COMMON_VARIABLES.slice(0, 4).map((v) => (
                    <button key={v.v} onClick={() => insertSubjectVar(v.v)}
                      className="whitespace-nowrap rounded bg-orange-50 px-1.5 py-0.5 text-[9px] font-bold text-orange-700 hover:bg-orange-100">
                      +{v.v}
                    </button>
                  ))}
                </div>
              </div>
              <input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                data-testid="tpl-form-subject"
                placeholder='e.g. "Welcome to Projexino, {{name}}!"'
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Body HTML *</span>
                <button onClick={() => navigator.clipboard.writeText(form.body_html).then(() => toast.success("Copied"))}
                  className="inline-flex items-center gap-1 text-[10px] text-slate-500 hover:text-[#0F2042]">
                  <Copy size={11} /> Copy HTML
                </button>
              </div>
              <textarea
                data-testid="tpl-form-body"
                rows={14}
                value={form.body_html}
                onChange={(e) => setForm({ ...form, body_html: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-[#F97316] focus:bg-white"
                spellCheck={false}
              />
            </div>

            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-500"><Variable size={11} className="mr-1 inline" /> Insert variable</div>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_VARIABLES.map((v) => (
                  <button key={v.v} onClick={() => insertVariable(v.v)}
                    data-testid={`tpl-var-${v.v.replace(/[{}]/g, "")}`}
                    className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-700 hover:bg-orange-100">
                    {v.v}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Variables hint (comma separated, used for docs)" value={form.variables_hint}
              onChange={(v) => setForm({ ...form, variables_hint: v })}
              testId="tpl-form-vars"
              placeholder="name, role, login_url"
            />

            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button data-testid="tpl-form-save" onClick={submit} disabled={saving}
                className="flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-orange-200 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editing ? "Save changes" : "Create template"}
              </button>
              <button data-testid="tpl-form-test" onClick={saveAndTest} disabled={saving}
                className="flex items-center gap-2 rounded-full border border-[#0F2042] px-5 py-2.5 text-sm font-bold text-[#0F2042] hover:bg-[#0F2042] hover:text-white disabled:opacity-60">
                <Send size={14} /> Save & send test
              </button>
            </div>
          </div>

          {/* RIGHT — Live preview */}
          <div className="border-l border-slate-100 bg-gradient-to-br from-slate-50 to-orange-50/30 p-6">
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// live preview</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Subject:</div>
            <div className="mt-0.5 line-clamp-1 rounded bg-white px-3 py-2 text-sm font-bold text-[#0F2042] shadow-sm">{form.subject || "—"}</div>

            <div className="mt-3 rounded-2xl bg-white p-1 shadow-sm">
              <iframe
                title="Live preview"
                srcDoc={renderPreview(form.body_html)}
                className="h-[58vh] w-full rounded-xl border-0"
              />
            </div>
          </div>
        </div>
        )}
      </motion.div>

      <AnimatePresence>
        {aiEditOpen && (
          <AIRefineModal
            currentSubject={form.subject}
            currentBody={form.body_html}
            onClose={() => setAiEditOpen(false)}
            onRefined={onRefined}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============ DESIGN GALLERY (preset picker — tabbed: Events / Designs) ============
function DesignGalleryPicker({ onPickDesign, onPickEvent, onSkip }) {
  const [tab, setTab] = useState("events"); // events | designs
  return (
    <div className="max-h-[78vh] overflow-y-auto p-6" data-testid="tpl-gallery">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Pick a starting point — events come with the right variables pre-wired (login creds, project name, due dates, etc.) so you don't have to think about what to add.
        </p>
        <button onClick={onSkip} data-testid="tpl-gallery-skip"
          className="self-start whitespace-nowrap text-xs font-bold text-[#F97316] underline-offset-2 hover:underline">
          Start blank →
        </button>
      </div>

      {/* Tab switcher */}
      <div className="mb-5 inline-flex rounded-full bg-slate-100 p-1">
        <button
          data-testid="tpl-tab-events"
          onClick={() => setTab("events")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
            tab === "events" ? "bg-white text-[#0F2042] shadow-sm" : "text-slate-500"
          }`}
        >
          🎯 By purpose <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-bold text-orange-700">{EVENT_PRESETS.length}</span>
        </button>
        <button
          data-testid="tpl-tab-designs"
          onClick={() => setTab("designs")}
          className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
            tab === "designs" ? "bg-white text-[#0F2042] shadow-sm" : "text-slate-500"
          }`}
        >
          <Palette size={12} /> By design <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">{TEMPLATE_PRESETS.length}</span>
        </button>
      </div>

      {tab === "events" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {EVENT_PRESETS.map((event, i) => (
            <motion.button
              key={event.id}
              data-testid={`tpl-event-${event.id}`}
              onClick={() => onPickEvent(event)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -2 }}
              className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#F97316] hover:shadow-md"
            >
              <div
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl text-2xl"
                style={{ background: `${event.color}18`, color: event.color }}
              >
                {event.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-sm font-bold text-[#0F2042]">{event.name}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                    style={{ background: `${event.color}1A`, color: event.color }}>
                    {event.category}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{event.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {event.variables.slice(0, 4).map((v) => (
                    <code key={v} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-600">{`{{${v}}}`}</code>
                  ))}
                  {event.variables.length > 4 && (
                    <span className="text-[10px] font-semibold text-slate-400">+{event.variables.length - 4} more</span>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_PRESETS.map((preset, i) => (
            <motion.button
              key={preset.id}
              data-testid={`tpl-preset-${preset.id}`}
              onClick={() => onPickDesign(preset)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -3 }}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-xl"
            >
              <div
                className="relative flex h-32 items-center justify-center overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${preset.swatch[0]} 0%, ${preset.swatch[1]} 60%, ${preset.swatch[2] || "#FFF7ED"} 100%)`,
                }}
              >
                <motion.div
                  className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/30 blur-2xl"
                  animate={{ scale: [1, 1.15, 1], rotate: [0, 30, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                  className="absolute -bottom-8 -left-6 h-20 w-20 rounded-full bg-white/20 blur-xl"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <span className="relative text-5xl drop-shadow-md">{preset.preview_emoji}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="font-display text-base font-semibold text-[#0F2042]">{preset.name}</div>
                <p className="mt-1 text-xs text-slate-500">{preset.description}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {preset.swatch.map((c, j) => (
                    <span key={j} className="h-3 w-3 rounded-full ring-1 ring-slate-200" style={{ background: c }} />
                  ))}
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-[#F97316] opacity-0 transition group-hover:opacity-100">
                    Use this <Sparkles size={10} />
                  </span>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ AI REFINE MODAL — "Edit with AI" ============
function AIRefineModal({ currentSubject, currentBody, onClose, onRefined }) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const quickPrompts = [
    "Make this more friendly and personal",
    "Tighten the copy — shorter paragraphs",
    "Add an eye-catching CTA button at the bottom",
    "Turn this into a dark-mode design",
    "Add a list of three benefits",
    "Add an urgent / time-sensitive tone",
  ];

  const run = async () => {
    if (!instruction.trim()) { toast.error("Describe the change you want"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/email/templates/ai-refine", {
        body_html: currentBody,
        subject: currentSubject,
        instruction,
      });
      onRefined(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI refine failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.95, y: 14 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="tpl-ai-refine-modal"
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="bg-gradient-to-br from-violet-500 to-fuchsia-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-200">// edit with ai</div>
              <h3 className="font-display mt-1 text-xl font-medium">Refine this template</h3>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={18} /></button>
          </div>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Describe the change *</span>
            <textarea
              data-testid="tpl-refine-input"
              rows={4}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. Make the headline more exciting, add a coupon code section, and shorten the closing."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Quick prompts</div>
            <div className="flex flex-wrap gap-1.5">
              {quickPrompts.map((p) => (
                <button key={p} onClick={() => setInstruction(p)}
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-100">
                  ✨ {p}
                </button>
              ))}
            </div>
          </div>
          <button
            data-testid="tpl-refine-run"
            onClick={run}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? <><Loader2 size={14} className="animate-spin" /> Refining…</> : <><Wand2 size={14} /> Refine with AI</>}
          </button>
          <p className="text-center text-[10px] text-slate-400">All your existing {`{{variables}}`} and links are preserved.</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ====================== AI GENERATE MODAL ======================
function AIGenerateModal({ onClose, onCreated }) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const suggestions = [
    "Welcome a new intern named {{name}} who joined as {{role}}, with their start date {{start_date}} and login URL {{login_url}}.",
    "Notify a client that invoice {{invoice_number}} of {{amount}} has been generated and is due on {{due_date}}.",
    "Send a friendly weekly check-in to a team member {{name}} asking about progress on {{task_title}}.",
  ];

  const generate = async () => {
    if (!prompt.trim()) { toast.error("Describe the email first"); return; }
    setLoading(true);
    try {
      const { data } = await api.post("/email/templates/ai-generate", { prompt, name: name || null, save: true });
      toast.success("Template generated");
      onCreated(data);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "AI generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="tpl-ai-modal"
        className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <div className="bg-gradient-to-br from-violet-500 to-fuchsia-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-fuchsia-200">// ai assist · gpt-5.2</div>
              <h3 className="font-display mt-1 text-2xl font-medium">Generate an email template</h3>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white"><X size={18} /></button>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <Field label="Template name (optional)" value={name} onChange={setName} testId="tpl-ai-name" placeholder="Welcome new intern" />
          <div>
            <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">Describe what you want *</span>
            <textarea
              data-testid="tpl-ai-prompt"
              rows={5}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Write a warm welcome email for a new intern with login URL and first-day instructions."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((s, i) => (
                <button key={i} onClick={() => setPrompt(s)}
                  className="truncate rounded-full bg-violet-50 px-2.5 py-1 text-[10px] text-violet-700 hover:bg-violet-100 max-w-full">
                  💡 {s.slice(0, 60)}…
                </button>
              ))}
            </div>
          </div>
          <button
            data-testid="tpl-ai-generate"
            onClick={generate}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Generating with AI…</> : <><Wand2 size={16} /> Generate template</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ====================== SEND TEST MODAL ======================
function SendTestModal({ template, onClose }) {
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [vars, setVars] = useState({});
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get("/email/accounts").then(({ data }) => {
      setAccounts(data || []);
      const def = (data || []).find((a) => a.is_default) || (data || [])[0];
      if (def) setAccountId(def.id);
    }).catch(() => {});
  }, []);

  const variables = (template.variables_hint || []);

  const send = async () => {
    if (!to.trim()) { toast.error("Enter a recipient email"); return; }
    if (!accountId) { toast.error("Connect a Gmail account first (Settings → Email)"); return; }
    setSending(true);
    try {
      await api.post("/email/send", {
        account_id: accountId,
        to: [to],
        template_id: template.id,
        variables: vars,
      });
      toast.success(`Test sent to ${to}`);
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Send failed");
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        data-testid="tpl-test-modal"
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl"
      >        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// send test</div>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">Send "{template.name}"</h3>
          </div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-4 p-6">
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <b>No Gmail accounts connected.</b><br />
              Go to <b>Settings → Email accounts</b> and connect one to enable sending.
            </div>
          ) : (
            <Select label="From account" value={accountId} onChange={setAccountId} testId="tpl-test-account"
              options={accounts.map((a) => ({ v: a.id, label: `${a.email}${a.is_default ? " · default" : ""}` }))} />
          )}
          <Field label="Send test to *" value={to} onChange={setTo} type="email" testId="tpl-test-to" placeholder="you@yourdomain.com" />
          {variables.length > 0 && (
            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-500">Variables</div>
              <div className="space-y-2">
                {variables.map((v) => (
                  <div key={v} className="flex items-center gap-2">
                    <code className="rounded bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-700">{`{{${v}}}`}</code>
                    <input
                      data-testid={`tpl-test-var-${v}`}
                      value={vars[v] || ""}
                      onChange={(e) => setVars({ ...vars, [v]: e.target.value })}
                      placeholder={`Value for ${v}`}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[#F97316]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            data-testid="tpl-test-send"
            onClick={send}
            disabled={sending || accounts.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"
          >
            {sending ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send test email</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ====================== Form helpers ======================
function Field({ label, value, onChange, type = "text", testId, placeholder, required = false }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
      />
    </label>
  );
}
function Select({ label, value, onChange, options, testId }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <select
        value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#F97316]"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}

// Wrap inner HTML with Projexino branded shell (mirrors backend _branded_template).
function renderPreview(html = "") {
  // If already contains the full shell, use as-is.
  if (/<html|<body/i.test(html)) return html;
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#FFF7ED;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF7ED;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:white;border-radius:16px;box-shadow:0 8px 24px rgba(15,32,66,0.08);overflow:hidden;">
        <tr><td style="background:linear-gradient(135deg,#0F2042,#A855F7);padding:24px 32px;color:white;">
          <div style="font-size:11px;font-weight:700;letter-spacing:0.32em;text-transform:uppercase;color:#FBBF24;">// PROJEXINO</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">Projexino Solutions</div>
        </td></tr>
        <tr><td style="padding:28px 32px;color:#0F2042;">
          ${html}
        </td></tr>
        <tr><td style="background:#FFF7ED;padding:18px 32px;border-top:1px solid #FED7AA;color:#7C2D12;font-size:11px;text-align:center;">
          Projexino Solutions · <a href="https://projexino.com" style="color:#F97316;">projexino.com</a><br/>
          You're receiving this because your workspace sent it. Manage preferences in your portal.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
