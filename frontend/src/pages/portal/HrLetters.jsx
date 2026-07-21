/**
 * HrLetters.jsx — HR Letters composer with Xino AI drafting, canvas signing,
 * QR-to-mobile signing, drag-drop signature placement and branded PDF.
 * Route: /app/hr-letters
 */
import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import Draggable from "react-draggable";
import {
  FileText, Sparkles, Download, Plus, Trash2, Loader2, X, PenLine, Smartphone, RefreshCw, Copy,
  Settings as SettingsIcon, Save, Upload,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { downloadApiPdf } from "@/lib/download";

const TEMPLATES = [
  { v: "letter_of_intent",   l: "Letter of Intent" },
  { v: "offer_letter",       l: "Offer Letter" },
  { v: "appointment_letter", l: "Appointment Letter" },
  { v: "relieving_letter",   l: "Relieving Letter" },
  { v: "experience_letter",  l: "Experience Letter" },
  { v: "warning_letter",     l: "Warning Letter" },
];

// Mirrors backend LETTER_DESIGNS — per-template branding for preview + cards.
const DESIGNS = {
  letter_of_intent:   { accent: "#7C3AED", soft: "#F5F3FF", dark: "#4C1D95", chip: "LETTER OF INTENT" },
  offer_letter:       { accent: "#F97316", soft: "#FFF7ED", dark: "#9A3412", chip: "OFFER OF EMPLOYMENT" },
  appointment_letter: { accent: "#2563EB", soft: "#EFF6FF", dark: "#1E3A8A", chip: "APPOINTMENT CONFIRMATION" },
  relieving_letter:   { accent: "#0D9488", soft: "#F0FDFA", dark: "#134E4A", chip: "RELIEVING CONFIRMATION" },
  experience_letter:  { accent: "#059669", soft: "#ECFDF5", dark: "#064E3B", chip: "EXPERIENCE CERTIFICATE" },
  warning_letter:     { accent: "#DC2626", soft: "#FEF2F2", dark: "#7F1D1D", chip: "OFFICIAL WARNING · CONFIDENTIAL" },
};
const designOf = (t) => DESIGNS[t] || DESIGNS.offer_letter;

const DEFAULT_LOGO = "/projexino-logo.png";
// iter57 fix: the DB-seeded logo_url in hr_letter_settings.singleton still points
// to the emergent-assets CDN, which fails to load inside Android TWA/WebView.
// This helper rewrites any known-broken CDN URL to the self-hosted, same-origin
// asset so the app-portal preview renders reliably on ALL surfaces.
// (Backend WeasyPrint keeps using the CDN URL — works fine server-side.)
function webSafeLogo(url) {
  if (!url) return DEFAULT_LOGO;
  if (typeof url !== "string") return DEFAULT_LOGO;
  if (url.includes("customer-assets.emergentagent.com")) return DEFAULT_LOGO;
  return url;
}

export default function HrLetters({ embedded = false }) {
  const [params, setParams] = useSearchParams();
  const openId = params.get("id") || "";
  const [items, setItems] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: lst }, { data: prof }] = await Promise.all([
        api.get("/hr/letters"),
        api.get("/hr/letters/company-profile").catch(() => ({ data: null })),
      ]);
      setItems(lst.items || []);
      setProfile(prof);
    } catch (e) { toast.error(formatApiError(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cardPdf = async (l) => {
    try { await downloadApiPdf(`/hr/letters/${l.id}/pdf`, `${l.template}-${(l.employee_name || "letter").replace(/\s+/g, "_")}.pdf`); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const duplicate = async (l) => {
    try { await api.post(`/hr/letters/${l.id}/duplicate`); toast.success("Letter duplicated"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const remove = async (l) => {
    if (!window.confirm(`Delete "${l.title}"?`)) return;
    try { await api.delete(`/hr/letters/${l.id}`); toast.success("Letter deleted"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-5" data-testid="page-hr-letters">
      {!embedded && (
        <header className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/30 to-violet-50/30 p-6 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// hr · letters & agreements</div>
          <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">HR Letters</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Draft LoI, Offer, Appointment, Relieving, Experience & Warning letters with Xino AI. Sign in-portal, or scan a QR to sign from your phone. Download a branded PDF using your company letterhead.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => setShowNew(true)} data-testid="hrl-new"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow">
              <Plus size={12}/> New letter
            </button>
            <button onClick={() => setShowSettings(true)} data-testid="hrl-settings"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
              <SettingsIcon size={12}/> Letterhead
            </button>
          </div>
        </header>
      )}
      {embedded && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowNew(true)} data-testid="hrl-new"
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow">
            <Plus size={12}/> New letter
          </button>
          <button onClick={() => setShowSettings(true)} data-testid="hrl-settings"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-700 hover:border-[#F97316] hover:text-[#F97316]">
            <SettingsIcon size={12}/> Letterhead settings
          </button>
        </div>
      )}

      {openId ? (
        <LetterEditor id={openId} profile={profile} onClose={() => setParams({}, { replace: true })} onSaved={load} />
      ) : loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center text-sm text-slate-500" data-testid="hrl-empty">
          No letters yet. Click <b>New letter</b> to draft your first one.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((l) => {
            const dz = designOf(l.template);
            return (
              <div key={l.id} data-testid={`hrl-card-${l.id}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
                style={{ borderTop: `3px solid ${dz.accent}` }}>
                <button onClick={() => setParams({ id: l.id }, { replace: true })} data-testid={`hrl-open-${l.id}`} className="block w-full text-left">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase" style={{ color: dz.accent }}>
                    <FileText size={11}/> {TEMPLATES.find((t) => t.v === l.template)?.l || l.template}
                  </div>
                  <div className="font-display mt-1 truncate text-sm font-bold text-[#0F2042]">{l.title}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{l.employee_name} · {l.position || "—"}</div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                    {(l.signature_blocks || []).filter((b) => b.signature_data_url).length}/{(l.signature_blocks || []).length} signed
                    · {new Date(l.updated_at).toLocaleDateString()}
                  </div>
                </button>
                <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5">
                  <button onClick={() => setParams({ id: l.id }, { replace: true })} data-testid={`hrl-edit-${l.id}`}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white" style={{ background: dz.accent }}>
                    <PenLine size={10}/> Edit
                  </button>
                  <button onClick={() => cardPdf(l)} data-testid={`hrl-pdf-${l.id}`} title="Download PDF"
                    className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#0F2042] hover:text-[#0F2042]"><Download size={11}/></button>
                  <button onClick={() => duplicate(l)} data-testid={`hrl-dup-${l.id}`} title="Duplicate"
                    className="rounded-full border border-slate-200 p-1.5 text-slate-500 hover:border-[#0F2042] hover:text-[#0F2042]"><Copy size={11}/></button>
                  <button onClick={() => remove(l)} data-testid={`hrl-del-${l.id}`} title="Delete"
                    className="ml-auto rounded-full border border-rose-200 p-1.5 text-rose-400 hover:bg-rose-50"><Trash2 size={11}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNew && <NewLetterModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); load(); setParams({ id }); }} />}
      {showSettings && <LetterheadSettingsModal profile={profile} onClose={() => setShowSettings(false)} onSaved={(p) => { setProfile(p); setShowSettings(false); toast.success("Letterhead saved · will apply to all future PDFs"); }} />}
    </div>
  );
}

/* ---------------- New-letter modal ---------------- */
function NewLetterModal({ onClose, onCreated }) {
  const [f, setF] = useState({ template: "offer_letter", employee_name: "", employee_email: "", position: "", department: "", ctc: "", joining_date: "", context_notes: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!f.employee_name.trim()) return toast.error("Employee name is required");
    setBusy(true);
    try { const { data } = await api.post("/hr/letters", f); toast.success("Draft created"); onCreated(data.id); }
    catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">New HR letter</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><Lbl>Template</Lbl>
            <select value={f.template} onChange={(e) => setF({ ...f, template: e.target.value })} data-testid="hrl-new-template"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {TEMPLATES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </label>
          <T label="Employee name *" v={f.employee_name}  o={(v) => setF({ ...f, employee_name: v })}  t="hrl-new-name"/>
          <T label="Email"            v={f.employee_email} o={(v) => setF({ ...f, employee_email: v })} t="hrl-new-email"/>
          <T label="Position"         v={f.position}       o={(v) => setF({ ...f, position: v })}       t="hrl-new-pos"/>
          <T label="Department"       v={f.department}     o={(v) => setF({ ...f, department: v })}     t="hrl-new-dept"/>
          <T label="CTC / Compensation" v={f.ctc}          o={(v) => setF({ ...f, ctc: v })}            t="hrl-new-ctc"/>
          <T label="Joining date"     v={f.joining_date}   o={(v) => setF({ ...f, joining_date: v })}   t="hrl-new-join" type="date"/>
          <label className="block sm:col-span-2"><Lbl>Extra context (optional)</Lbl>
            <textarea value={f.context_notes} onChange={(e) => setF({ ...f, context_notes: e.target.value })} rows={3} data-testid="hrl-new-notes"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-sm"/>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={submit} disabled={busy} data-testid="hrl-new-submit"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-1.5 text-xs font-bold uppercase text-white">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Plus size={12}/>} Create
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Editor ---------------- */
function LetterEditor({ id, profile, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [designing, setDesigning] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [signBlock, setSignBlock] = useState(null);
  const [qrToken, setQrToken] = useState(null);

  const load = async () => {
    try { const { data } = await api.get(`/hr/letters/${id}`); setD(data); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  useEffect(() => { load(); }, [id]);

  const patch = (partial) => setD((p) => ({ ...p, ...partial }));
  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/hr/letters/${id}`, {
        title: d.title, body_html: d.body_html, signature_blocks: d.signature_blocks,
        template: d.template, employee_name: d.employee_name, employee_email: d.employee_email,
        position: d.position, department: d.department, ctc: d.ctc, joining_date: d.joining_date,
      });
      setD(data); toast.success("Saved"); onSaved && onSaved();
    } catch (e) { toast.error(formatApiError(e)); }
    setSaving(false);
  };
  const aiDraft = async () => {
    setDrafting(true);
    try { const { data } = await api.post(`/hr/letters/${id}/ai-draft`, { guidance }); patch({ body_html: data.body_html }); toast.success("AI drafted"); }
    catch (e) { toast.error(formatApiError(e)); }
    setDrafting(false);
  };
  const designNow = async () => {
    if (!pasteText.trim()) { toast.error("Paste the letter content first"); return; }
    setDesigning(true);
    try {
      const { data } = await api.post(`/hr/letters/${id}/format`, { text: pasteText });
      patch({ body_html: data.body_html });
      setPasteText("");
      toast.success("Letter designed with template branding — no AI used");
    } catch (e) { toast.error(formatApiError(e)); }
    setDesigning(false);
  };
  const downloadPdf = async () => {
    try {
      await downloadApiPdf(`/hr/letters/${id}/pdf`, `${d.template}-${(d.employee_name || "letter").replace(/\s+/g, "_")}.pdf`);
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const addSigBlock = () => {
    const nb = { id: crypto.randomUUID(), label: "Additional Signer", name: "", role: "", signature_data_url: "" };
    patch({ signature_blocks: [...(d.signature_blocks || []), nb] });
  };
  const rmSig = (bid) => patch({ signature_blocks: d.signature_blocks.filter((b) => b.id !== bid) });
  const updSig = (bid, obj) => patch({ signature_blocks: d.signature_blocks.map((b) => b.id === bid ? { ...b, ...obj } : b) });

  const requestQR = async (block) => {
    try {
      const { data } = await api.post(`/hr/letters/${id}/sign-token`, { block_id: block.id, signer_name: block.name });
      setQrToken({ url: data.url, expires: data.expires_in_min, blockId: block.id });
    } catch (e) { toast.error(formatApiError(e)); }
  };
  // Auto-poll after QR issued so mobile-signed image appears without a manual refresh
  useEffect(() => {
    if (!qrToken) return;
    const t = setInterval(async () => {
      try { const { data } = await api.get(`/hr/letters/${id}`);
        const nb = (data.signature_blocks || []).find((b) => b.id === qrToken.blockId);
        if (nb?.signature_data_url) { setD(data); setQrToken(null); toast.success("Signature received from mobile"); }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(t);
  }, [qrToken, id]);

  if (!d) return <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {/* Main */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-xs font-bold text-slate-500 hover:text-[#0F2042]" data-testid="hrl-back">← Back to list</button>
          <div className="flex gap-2">
            <button onClick={save} disabled={saving} data-testid="hrl-save"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold hover:border-[#F97316] hover:text-[#F97316]">
              {saving ? <Loader2 size={11} className="animate-spin"/> : <PenLine size={11}/>} Save
            </button>
            <button onClick={downloadPdf} data-testid="hrl-download"
              className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-3 py-1.5 text-xs font-bold uppercase text-white shadow">
              <Download size={11}/> Download PDF
            </button>
          </div>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: designOf(d.template).accent }}>// {TEMPLATES.find((t) => t.v === d.template)?.l}</div>
            <button onClick={() => setShowDetails(!showDetails)} data-testid="hrl-details-toggle"
              className="rounded-full border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 hover:border-[#0F2042]">
              {showDetails ? "Hide details" : "Edit details"}
            </button>
          </div>
          <input value={d.title} onChange={(e) => patch({ title: e.target.value })} data-testid="hrl-title"
            className="mt-1 w-full border-none bg-transparent font-display text-xl font-bold text-[#0F2042] outline-none"/>

          {showDetails && (
            <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2" data-testid="hrl-details-panel">
              <label className="block sm:col-span-2"><Lbl>Letter type</Lbl>
                <select value={d.template} onChange={(e) => patch({ template: e.target.value })} data-testid="hrl-edit-template"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  {TEMPLATES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                </select>
              </label>
              <T label="Employee name" v={d.employee_name || ""} o={(v) => patch({ employee_name: v })} t="hrl-edit-name"/>
              <T label="Email"          v={d.employee_email || ""} o={(v) => patch({ employee_email: v })} t="hrl-edit-email"/>
              <T label="Position"       v={d.position || ""}       o={(v) => patch({ position: v })}       t="hrl-edit-pos"/>
              <T label="Department"     v={d.department || ""}     o={(v) => patch({ department: v })}     t="hrl-edit-dept"/>
              <T label="CTC"            v={d.ctc || ""}            o={(v) => patch({ ctc: v })}            t="hrl-edit-ctc"/>
              <T label="Joining date"   v={d.joining_date || ""}   o={(v) => patch({ joining_date: v })}   t="hrl-edit-join" type="date"/>
              <p className="text-[10px] text-slate-400 sm:col-span-2">Changes apply after you click <b>Save</b> — the letter type also recolours the whole design & PDF.</p>
            </div>
          )}

          {/* No-AI designer box */}
          <div className="mt-4 rounded-2xl border p-3" style={{ borderColor: `${designOf(d.template).accent}44`, background: designOf(d.template).soft }}>
            <div className="text-[10px] font-bold uppercase" style={{ color: designOf(d.template).dark }}>// paste &amp; design · no AI</div>
            <p className="mt-1 text-[11px] text-slate-500">Paste your raw letter content — it gets fully designed for a <b>{TEMPLATES.find((t) => t.v === d.template)?.l}</b>: subject line, salutation, styled headings, bullets, closing &amp; template colours.</p>
            <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={4} data-testid="hrl-paste-text"
              placeholder={"Paste content here… Blank line = new paragraph. '-' lines = bullets. 'Subject:' line is auto-detected."}
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs leading-relaxed"/>
            <button onClick={designNow} disabled={designing} data-testid="hrl-design-btn"
              className="mt-2 inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-bold uppercase text-white shadow"
              style={{ background: designOf(d.template).accent }}>
              {designing ? <Loader2 size={11} className="animate-spin"/> : <PenLine size={11}/>} Design letter
            </button>
          </div>

          {/* AI draft box */}
          <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-3">
            <div className="text-[10px] font-bold uppercase text-violet-700">// xino ai · draft</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="Optional extra guidance"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs" data-testid="hrl-ai-guidance"/>
              <button onClick={aiDraft} disabled={drafting} data-testid="hrl-ai-draft"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#7C3AED] to-[#A855F7] px-3 py-1.5 text-xs font-bold uppercase text-white shadow">
                {drafting ? <Loader2 size={11} className="animate-spin"/> : <Sparkles size={11}/>} Draft with Xino AI
              </button>
            </div>
          </div>

          {/* Body */}
          <label className="mt-4 block"><Lbl>Body (HTML — use &lt;p&gt; paragraphs)</Lbl>
            <textarea value={d.body_html || ""} onChange={(e) => patch({ body_html: e.target.value })} rows={16} data-testid="hrl-body"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px]"/>
          </label>
          <div className="mt-2 text-[10px] text-slate-400">Live preview below reflects Projexino branding exactly as it will appear in the PDF.</div>
          <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between border-b-2 border-[#F97316] pb-2">
              <div>
                <img src={webSafeLogo(profile?.logo_url)} alt={profile?.company_name || "Company"} className="h-9 w-auto"/>
                {profile?.tagline && <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-slate-500">{profile.tagline}</div>}
              </div>
              <div className="text-right text-[9px] text-slate-500 leading-tight">
                <div className="font-bold text-[#0F2042]">{profile?.company_name || "Company Name"}</div>
                {(profile?.address_line1 || profile?.city) && (
                  <div>{[profile?.address_line1, profile?.city, profile?.state, profile?.pincode].filter(Boolean).join(", ")}</div>
                )}
                {(profile?.email || profile?.phone || profile?.website) && (
                  <div>{[profile?.email, profile?.phone, profile?.website].filter(Boolean).join(" · ")}</div>
                )}
                <div className="mt-0.5 inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[8px] font-bold uppercase text-[#C2410C]">REF · HR-{(d.id||"").slice(0,8).toUpperCase()}</div>
              </div>
            </div>
            <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: d.body_html || "<p><i>Body will appear here…</i></p>" }}/>
          </div>
        </section>
      </div>

      {/* Sidebar — Signature blocks */}
      <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" data-testid="hrl-sidebar">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase text-[#F97316]">// signatures ({(d.signature_blocks || []).length})</div>
            <button onClick={addSigBlock} data-testid="hrl-sig-add"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-bold hover:border-[#F97316] hover:text-[#F97316]">
              <Plus size={10}/> Add
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {(d.signature_blocks || []).map((b) => (
              <SigBlock key={b.id} b={b}
                onUpdate={(obj) => updSig(b.id, obj)}
                onRemove={() => rmSig(b.id)}
                onQR={() => requestQR(b)} />
            ))}
            {(d.signature_blocks || []).length === 0 && <p className="text-[11px] text-slate-400">No signature blocks yet.</p>}
          </div>
        </div>
      </aside>

      {qrToken && <QrModal url={qrToken.url} expires={qrToken.expires} onClose={() => setQrToken(null)}/>}
    </div>
  );
}

function SigBlock({ b, onUpdate, onRemove, onQR }) {
  const [mode, setMode] = useState(b.signature_data_url ? "signed" : "idle"); // idle | canvas | signed
  const padRef = useRef(null);
  const dragRef = useRef(null);
  const fileRef = useRef(null);
  const [pos, setPos] = useState({ x: b.x || 0, y: b.y || 0 });

  const commit = () => {
    if (!padRef.current || padRef.current.isEmpty()) return toast.error("Please draw a signature first");
    // Use direct toDataURL — getTrimmedCanvas() is broken in react-signature-canvas@1.1.0-alpha
    // (trim-canvas ESM/CJS interop bug on mobile). Full canvas works fine — transparent bg
    // means whitespace around the stroke isn't visible in the PDF signature line.
    const dataUrl = padRef.current.toDataURL("image/png");
    onUpdate({ signature_data_url: dataUrl });
    setMode("signed");
  };
  const clear = () => { padRef.current?.clear(); };
  const reset = () => { onUpdate({ signature_data_url: "" }); setMode("idle"); };

  const onFilePick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // reset so same file can be picked again after re-sign
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error("Please upload a PNG, JPG or WebP image");
    if (f.size > 4 * 1024 * 1024) return toast.error("Image too large — max 4 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) return toast.error("Could not read the file");
      onUpdate({ signature_data_url: dataUrl });
      setMode("signed");
      toast.success("Signature uploaded");
    };
    reader.onerror = () => toast.error("Could not read the file");
    reader.readAsDataURL(f);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={b.name || ""} onChange={(e) => onUpdate({ name: e.target.value })} placeholder="Full name" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px]" data-testid={`hrl-sig-name-${b.id}`}/>
        <input value={b.role || ""} onChange={(e) => onUpdate({ role: e.target.value })} placeholder="Role / label" className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px]" data-testid={`hrl-sig-role-${b.id}`}/>
      </div>

      {mode === "signed" && b.signature_data_url ? (
        <div className="mt-2 rounded border border-emerald-200 bg-white p-2" data-testid={`hrl-sig-preview-${b.id}`}>
          {/* Drag-drop placement */}
          <Draggable nodeRef={dragRef} position={pos} onStop={(e, data) => { setPos({ x: data.x, y: data.y }); onUpdate({ x: data.x, y: data.y }); }}>
            <img ref={dragRef} src={b.signature_data_url} alt="signature" className="max-h-14 cursor-move" draggable={false}/>
          </Draggable>
          <div className="mt-1 text-[9px] text-slate-500">Drag to reposition · saved at ({Math.round(pos.x)}, {Math.round(pos.y)})</div>
          <button onClick={reset} className="mt-1 text-[10px] font-bold text-rose-600 hover:underline" data-testid={`hrl-sig-clear-${b.id}`}>Re-sign</button>
        </div>
      ) : mode === "canvas" ? (
        <div className="mt-2">
          <div className="rounded-xl border-2 border-dashed border-[#F97316] bg-white">
            <SignatureCanvas ref={padRef} penColor="#0F2042" canvasProps={{ width: 300, height: 100, className: "w-full", "data-testid": `hrl-sig-pad-${b.id}` }} />
          </div>
          <div className="mt-2 flex gap-2 text-[10px]">
            <button onClick={commit} data-testid={`hrl-sig-save-${b.id}`} className="rounded-full bg-emerald-600 px-3 py-1 font-bold text-white">Save signature</button>
            <button onClick={clear} className="rounded-full border border-slate-200 px-3 py-1 font-bold">Clear</button>
            <button onClick={() => setMode("idle")} className="rounded-full border border-slate-200 px-3 py-1 font-bold">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          <button onClick={() => setMode("canvas")} data-testid={`hrl-sig-draw-${b.id}`}
            className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1.5 font-bold uppercase tracking-wider text-white">
            <PenLine size={10}/> Sign here
          </button>
          <button onClick={() => fileRef.current?.click()} data-testid={`hrl-sig-upload-${b.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-bold hover:border-[#F97316] hover:text-[#F97316]">
            <Upload size={10}/> Upload image
          </button>
          <button onClick={onQR} data-testid={`hrl-sig-qr-${b.id}`}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 font-bold hover:border-[#F97316] hover:text-[#F97316]">
            <Smartphone size={10}/> Sign on mobile (QR)
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFilePick} className="hidden" data-testid={`hrl-sig-file-${b.id}`}/>
          <button onClick={onRemove} className="ml-auto rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove">
            <Trash2 size={10}/>
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- QR modal ---------------- */
function QrModal({ url, expires, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" data-testid="hrl-qr-modal">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-semibold text-[#0F2042]">Scan to sign on mobile</h3>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Open your phone camera and scan the QR — draw your signature and tap Submit. It will appear here automatically. Link expires in {expires} minutes.
        </p>
        <div className="mt-4 grid place-items-center rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <QRCodeSVG value={url} size={220} includeMargin/>
        </div>
        <div className="mt-3 flex gap-2">
          <input readOnly value={url} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px]" data-testid="hrl-qr-url"/>
          <button onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-bold hover:border-[#F97316] hover:text-[#F97316]" data-testid="hrl-qr-copy">
            <Copy size={11}/> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-3 flex items-center gap-1 text-[10px] text-slate-400"><RefreshCw size={10}/> Auto-refreshing every 3 s…</p>
      </div>
    </div>
  );
}

/* ---------------- Small primitives ---------------- */
function Lbl({ children }) { return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{children}</span>; }
function T({ label, v, o, t, type = "text" }) {
  return <label className="block"><Lbl>{label}</Lbl><input type={type} value={v} onChange={(e) => o(e.target.value)} data-testid={t}
    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"/></label>;
}

/* ---------------- Letterhead settings modal ---------------- */
function LetterheadSettingsModal({ profile, onClose, onSaved }) {
  const [f, setF] = useState({
    logo_url: webSafeLogo(profile?.logo_url),
    company_name: profile?.company_name || "",
    tagline: profile?.tagline || "",
    address_line1: profile?.address_line1 || "",
    address_line2: profile?.address_line2 || "",
    city: profile?.city || "",
    state: profile?.state || "",
    pincode: profile?.pincode || "",
    country: profile?.country || "India",
    email: profile?.email || "",
    phone: profile?.phone || "",
    website: profile?.website || "",
    cin: profile?.cin || "",
    gstin: profile?.gstin || "",
    footer_note: profile?.footer_note || "",
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.company_name.trim()) return toast.error("Company name is required");
    setBusy(true);
    try {
      const { data } = await api.put("/hr/letters/company-profile", f);
      onSaved(data);
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" data-testid="hrl-settings-modal">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// letterhead · company profile</div>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">Letterhead settings</h3>
            <p className="mt-0.5 text-xs text-slate-500">Set your company details once — they&apos;ll be reused across every letter (Offer, LoI, Appointment, etc.) and every future PDF.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-slate-400 hover:bg-slate-100"><X size={18}/></button>
        </div>
        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-6">
          {/* Preview */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Live preview</div>
            <div className="flex items-start justify-between border-b-2 border-[#F97316] pb-3">
              <div>
                <img src={webSafeLogo(f.logo_url)} alt={f.company_name || "Logo"} className="h-10 w-auto"/>
                {f.tagline && <div className="mt-1 text-[8px] uppercase tracking-[0.2em] text-slate-500">{f.tagline}</div>}
              </div>
              <div className="text-right text-[10px] text-slate-500 leading-tight">
                <div className="font-bold text-[#0F2042]">{f.company_name || "Company name"}</div>
                {(f.address_line1 || f.city) && <div>{[f.address_line1, f.city, f.state, f.pincode].filter(Boolean).join(", ")}</div>}
                {f.address_line2 && <div>{f.address_line2}</div>}
                {f.country && <div>{f.country}</div>}
                {(f.email || f.phone || f.website) && <div className="mt-0.5">{[f.email, f.phone, f.website].filter(Boolean).join(" · ")}</div>}
                {(f.cin || f.gstin) && <div className="mt-0.5 text-[8px] text-slate-400">{[f.cin && `CIN: ${f.cin}`, f.gstin && `GSTIN: ${f.gstin}`].filter(Boolean).join(" · ")}</div>}
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="grid gap-3 sm:grid-cols-2">
            <T label="Company name *"  v={f.company_name}  o={(v) => setF({ ...f, company_name: v })}  t="hrls-company"/>
            <T label="Tagline (optional)" v={f.tagline}   o={(v) => setF({ ...f, tagline: v })}       t="hrls-tagline"/>
            <div>
              <T label="Logo URL"        v={f.logo_url}     o={(v) => setF({ ...f, logo_url: v })}     t="hrls-logo"/>
              <button type="button" onClick={() => setF({ ...f, logo_url: DEFAULT_LOGO })} data-testid="hrls-logo-reset"
                className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#F97316] hover:underline">
                ↻ Reset to Projexino default
              </button>
            </div>
            <T label="Email"           v={f.email}        o={(v) => setF({ ...f, email: v })}        t="hrls-email"/>
            <T label="Phone"           v={f.phone}        o={(v) => setF({ ...f, phone: v })}        t="hrls-phone"/>
            <T label="Website"         v={f.website}      o={(v) => setF({ ...f, website: v })}      t="hrls-website"/>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Registered address</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <T label="Address line 1" v={f.address_line1} o={(v) => setF({ ...f, address_line1: v })} t="hrls-addr1"/>
              <T label="Address line 2" v={f.address_line2} o={(v) => setF({ ...f, address_line2: v })} t="hrls-addr2"/>
              <T label="City"           v={f.city}          o={(v) => setF({ ...f, city: v })}          t="hrls-city"/>
              <T label="State / Region" v={f.state}         o={(v) => setF({ ...f, state: v })}         t="hrls-state"/>
              <T label="PIN / ZIP"      v={f.pincode}       o={(v) => setF({ ...f, pincode: v })}       t="hrls-pin"/>
              <T label="Country"        v={f.country}       o={(v) => setF({ ...f, country: v })}       t="hrls-country"/>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Statutory (optional)</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <T label="CIN / Registration no." v={f.cin}   o={(v) => setF({ ...f, cin: v })}   t="hrls-cin"/>
              <T label="GSTIN / Tax ID"         v={f.gstin} o={(v) => setF({ ...f, gstin: v })} t="hrls-gstin"/>
            </div>
            <label className="mt-3 block">
              <Lbl>Footer note (legal / disclaimer)</Lbl>
              <textarea value={f.footer_note} onChange={(e) => setF({ ...f, footer_note: e.target.value })} rows={2} data-testid="hrls-footer"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs"/>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button onClick={onClose} className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
          <button onClick={save} disabled={busy} data-testid="hrls-save"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-5 py-1.5 text-xs font-bold uppercase text-white">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Save letterhead
          </button>
        </div>
      </div>
    </div>
  );
}
