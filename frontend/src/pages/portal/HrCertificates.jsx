/**
 * HrCertificates — manual Internship / Performance certificates.
 * HR writes the content; the branded template (logo header, borders, signature
 * block) is pre-designed. After creation, sign digitally (draw or upload).
 */
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SignatureCanvas from "react-signature-canvas";
import {
  Award, Plus, X, Loader2, Download, Trash2, Edit3, PenTool, Upload,
  CheckCircle2, Eraser, Sparkles,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { saveOrShareBlob } from "@/lib/download";
import { PdfPreviewModal } from "@/components/PdfPreviewModal";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";

const TYPE_META = {
  internship: { label: "Internship", chip: "bg-orange-100 text-[#F97316]" },
  performance: { label: "Performance", chip: "bg-blue-100 text-[#0F2042]" },
};

const TEMPLATE_TEXT = {
  internship: (name) =>
    `This is to certify that ${name || "[Recipient Name]"} has successfully completed an internship with Projexino Solutions Pvt Ltd.\n\nDuring the internship, they demonstrated strong dedication, a proactive learning mindset and consistently delivered assigned tasks with professionalism and attention to detail.\n\nWe wish them continued success in all their future endeavours.`,
  performance: (name) =>
    `This certificate is proudly presented to ${name || "[Recipient Name]"} in recognition of outstanding performance and exceptional contribution at Projexino Solutions Pvt Ltd.\n\nTheir commitment to excellence, ownership of responsibilities and collaborative spirit have made a significant impact on the team and the organisation.\n\nWe thank them for their dedication and look forward to their continued growth.`,
};

export default function HrCertificates() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);   // null | {} (new) | cert (edit)
  const [signing, setSigning] = useState(null); // cert being signed
  const [previewCert, setPreviewCert] = useState(null);
  const [downloading, setDownloading] = useState("");

  const reload = async () => {
    try {
      const { data } = await api.get("/hr/certificates");
      setItems(data);
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const download = async (c) => {
    setDownloading(c.id);
    try {
      const token = localStorage.getItem("pj_token");
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/hr/certificates/${c.id}/pdf`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("PDF failed");
      const blob = await res.blob();
      await saveOrShareBlob(blob, `${c.recipient_name.replace(/\s+/g, "_")}_Certificate.pdf`);
      toast.success("Certificate ready");
    } catch (e) { toast.error("Failed to generate PDF"); }
    setDownloading("");
  };

  const onDelete = async (c) => {
    if (!window.confirm(`Delete certificate for ${c.recipient_name}?`)) return;
    await api.delete(`/hr/certificates/${c.id}`);
    setItems((p) => p.filter((x) => x.id !== c.id));
    toast.success("Certificate deleted");
  };

  return (
    <div data-testid="hr-certificates" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-[#0F2042]">Certificates</h2>
          <p className="text-xs text-slate-500">Create Internship / Performance certificates manually — template design & logo are pre-added. Sign digitally after creation.</p>
        </div>
        <button data-testid="hrc-new-btn" onClick={() => setEditor({})}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-4 py-2 text-xs font-bold text-white hover:bg-orange-600">
          <Plus size={14} /> New certificate
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-14"><Loader2 size={24} className="animate-spin text-slate-300" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center" data-testid="hrc-empty">
          <Award size={32} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No certificates yet</p>
          <p className="text-xs text-slate-400">Create your first Internship or Performance certificate.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2" data-testid="hrc-list">
          {items.map((c) => {
            const meta = TYPE_META[c.cert_type] || TYPE_META.internship;
            return (
              <motion.div key={c.id} layout data-testid={`hrc-card-${c.id}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex cursor-pointer items-start justify-between gap-2" onClick={() => setPreviewCert(c)} data-testid={`hrc-preview-open-${c.id}`} title="Click to open the certificate PDF">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.chip}`}>{meta.label}</span>
                      {c.signed ? (
                        <span data-testid={`hrc-signed-${c.id}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700">
                          <CheckCircle2 size={9} /> Signed
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-500">Draft</span>
                      )}
                    </div>
                    <div className="mt-1.5 truncate font-display text-base font-bold text-[#0F2042]">{c.recipient_name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {[c.designation, c.department].filter(Boolean).join(" · ") || "—"}
                      {(c.period_from || c.period_to) && ` · ${c.period_from || "—"} → ${c.period_to || "—"}`}
                    </div>
                  </div>
                  <Award size={20} className="shrink-0 text-orange-300" />
                </div>
                <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{c.content}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button data-testid={`hrc-download-${c.id}`} onClick={() => download(c)} disabled={downloading === c.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#0F2042] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1a3060] disabled:opacity-60">
                    {downloading === c.id ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />} PDF
                  </button>
                  <button data-testid={`hrc-sign-${c.id}`} onClick={() => setSigning(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-[11px] font-bold text-[#F97316] hover:bg-orange-100">
                    <PenTool size={11} /> {c.signed ? "Re-sign" : "Sign"}
                  </button>
                  <button data-testid={`hrc-edit-${c.id}`} onClick={() => setEditor(c)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-[#0F2042]">
                    <Edit3 size={11} /> Edit
                  </button>
                  <button data-testid={`hrc-delete-${c.id}`} onClick={() => onDelete(c)}
                    className="ml-auto rounded-lg border border-rose-200 p-1.5 text-rose-500 hover:bg-rose-50">
                    <Trash2 size={12} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {editor && <CertEditorModal cert={editor.id ? editor : null} onClose={() => setEditor(null)}
          onSaved={async () => { setEditor(null); await reload(); }} />}
        {signing && <SignModal cert={signing} onClose={() => setSigning(null)}
          onSigned={async () => { setSigning(null); await reload(); }} />}
        {previewCert && <PdfPreviewModal title={`${previewCert.recipient_name} — Certificate`}
          fetchPath={`/hr/certificates/${previewCert.id}/pdf`}
          filename={`${previewCert.recipient_name.replace(/\s+/g, "_")}_Certificate.pdf`}
          onClose={() => setPreviewCert(null)} />}
      </AnimatePresence>
    </div>
  );
}

function CertEditorModal({ cert, onClose, onSaved }) {
  const [form, setForm] = useState({
    cert_type: cert?.cert_type || "internship",
    recipient_name: cert?.recipient_name || "",
    designation: cert?.designation || "",
    department: cert?.department || "",
    period_from: cert?.period_from || "",
    period_to: cert?.period_to || "",
    content: cert?.content || "",
    signer_name: cert?.signer_name || "",
    signer_role: cert?.signer_role || "Authorized Signatory",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const insertTemplate = () => set("content", TEMPLATE_TEXT[form.cert_type](form.recipient_name.trim()));

  const save = async () => {
    if (!form.recipient_name.trim()) { toast.error("Recipient name is required"); return; }
    if (!form.content.trim()) { toast.error("Certificate content is required"); return; }
    setBusy(true);
    try {
      if (cert) await api.patch(`/hr/certificates/${cert.id}`, form);
      else await api.post("/hr/certificates", form);
      toast.success(cert ? "Certificate updated" : "Certificate created — you can now sign it");
      onSaved();
    } catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };

  const title = form.cert_type === "performance" ? "PERFORMANCE CERTIFICATE" : "INTERNSHIP CERTIFICATE";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" data-testid="hrc-editor-modal">
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">{cert ? "Edit certificate" : "New certificate"}</div>
            <div className="font-display text-lg font-bold">Certificate builder</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="grid flex-1 gap-0 overflow-y-auto lg:grid-cols-2">
          {/* Form */}
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-2">
              {["internship", "performance"].map((t) => (
                <button key={t} data-testid={`hrc-type-${t}`} onClick={() => set("cert_type", t)}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${form.cert_type === t ? "border-[#F97316] bg-orange-50 text-[#F97316]" : "border-slate-200 text-slate-500 hover:border-slate-400"}`}>
                  {TYPE_META[t].label} Certificate
                </button>
              ))}
            </div>
            <input data-testid="hrc-name" placeholder="Recipient full name *" value={form.recipient_name}
              onChange={(e) => set("recipient_name", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            <div className="grid grid-cols-2 gap-2">
              <input data-testid="hrc-designation" placeholder="Designation" value={form.designation}
                onChange={(e) => set("designation", e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <input data-testid="hrc-department" placeholder="Department" value={form.department}
                onChange={(e) => set("department", e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">Period from</span>
                <input data-testid="hrc-period-from" type="date" value={form.period_from}
                  onChange={(e) => set("period_from", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              </label>
              <label className="block">
                <span className="mb-0.5 block text-[10px] font-bold uppercase text-slate-400">Period to</span>
                <input data-testid="hrc-period-to" type="date" value={form.period_to}
                  onChange={(e) => set("period_to", e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              </label>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400">Certificate content *</span>
                <button data-testid="hrc-insert-template" onClick={insertTemplate}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
                  <Sparkles size={10} /> Insert template text
                </button>
              </div>
              <textarea data-testid="hrc-content" rows={8} value={form.content}
                onChange={(e) => set("content", e.target.value)}
                placeholder="Write the certificate body here. Separate paragraphs with a blank line — alignment & justification are handled automatically."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#F97316]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input data-testid="hrc-signer-name" placeholder="Signer name (e.g. HR Manager's name)" value={form.signer_name}
                onChange={(e) => set("signer_name", e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
              <input data-testid="hrc-signer-role" placeholder="Signer role" value={form.signer_role}
                onChange={(e) => set("signer_role", e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            </div>
            <button data-testid="hrc-save" onClick={save} disabled={busy}
              className="w-full rounded-xl bg-[#F97316] py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">
              {busy ? "Saving…" : cert ? "Save changes" : "Create certificate"}
            </button>
          </div>
          {/* Live preview — mirrors the pre-designed PDF template */}
          <div className="hidden border-l border-slate-100 bg-slate-50 p-5 lg:block">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Template preview</div>
            <div data-testid="hrc-preview" className="relative rounded-lg border-2 border-[#0F2042] bg-white p-6 shadow-inner"
              style={{ minHeight: 460 }}>
              <div className="pointer-events-none absolute inset-1 rounded border border-[#F97316]/60" />
              <div className="text-center">
                <img src="/projexino-logo.png" alt="Projexino" className="mx-auto h-10 object-contain" />
                <div className="mt-1 text-[10px] font-bold text-[#0F2042]">PROJEXINO SOLUTIONS PVT LTD</div>
                <div className="text-[8px] text-slate-400">Engineering the Future of Operations</div>
                <div className="mx-auto mt-1.5 h-0.5 w-24 bg-[#F97316]" />
                <div className="mt-3 text-[9px] font-bold tracking-[0.25em] text-[#F97316]">PROUDLY PRESENTS THE</div>
                <div className="font-display text-lg font-bold text-[#0F2042]">{title}</div>
                <div className="mt-1 text-[10px] text-slate-500">This certificate is presented to</div>
                <div className="mt-1 font-display text-xl font-bold text-[#0F2042]">{form.recipient_name || "Recipient Name"}</div>
                {(form.designation || form.department) && (
                  <div className="text-[10px] italic text-slate-500">{[form.designation, form.department].filter(Boolean).join("  •  ")}</div>
                )}
                {(form.period_from || form.period_to) && (
                  <div className="mt-1 text-[9px] font-bold text-[#0F2042]">PERIOD: {form.period_from || "—"} <span className="text-[#F97316]">→</span> {form.period_to || "—"}</div>
                )}
              </div>
              <div className="mt-4 space-y-2 text-justify text-[10px] leading-relaxed text-slate-700">
                {(form.content || "Your certificate content will appear here…").split(/\n\n+/).map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
              <div className="mt-6 flex items-end justify-between">
                <div>
                  <div className="h-8 w-28 border-b border-[#0F2042]" />
                  <div className="mt-0.5 text-[9px] font-bold text-[#0F2042]">{form.signer_name || "Authorized Signatory"}</div>
                  <div className="text-[8px] text-slate-400">{form.signer_role || "For Projexino Solutions Pvt Ltd"}</div>
                </div>
                <div className="text-right text-[8px] text-slate-400">
                  Issued on {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
                </div>
              </div>
              <div className="mt-4 -mx-6 -mb-6 rounded-b-lg bg-[#0F2042] py-1 text-center text-[7px] text-white/80">
                Projexino Solutions Pvt Ltd • www.projexino.com
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SignModal({ cert, onClose, onSigned }) {
  const padRef = useRef(null);
  const fileRef = useRef(null);
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [signToken, setSignToken] = useState("");

  useEffect(() => {
    api.post(`/hr/certificates/${cert.id}/sign-link`).then(({ data }) => setSignToken(data.token)).catch(() => {});
  }, [cert.id]);

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast.error("Image must be under 4 MB"); return; }
    const reader = new FileReader();
    reader.onload = () => setUploadedUrl(reader.result);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    let dataUrl = uploadedUrl;
    if (!dataUrl) {
      if (!padRef.current || padRef.current.isEmpty()) { toast.error("Draw or upload a signature first"); return; }
      dataUrl = padRef.current.getCanvas().toDataURL("image/png");
    }
    setBusy(true);
    try {
      await api.post(`/hr/certificates/${cert.id}/sign`, { signature_data_url: dataUrl });
      toast.success("Certificate signed — signature will appear on the PDF");
      onSigned();
    } catch (e) { toast.error(formatApiError(e)); setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md" data-testid="hrc-sign-modal">
      <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="bg-gradient-to-r from-[#F97316] to-[#FBBF24] px-5 py-4 text-white">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Digital signature</div>
          <div className="font-display text-lg font-bold">{cert.recipient_name}'s certificate</div>
        </header>
        <div className="space-y-3 p-5">
          {signToken && (
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="hrc-sign-qr-panel">
              <div className="rounded-lg bg-white p-1.5 shadow"><QRCodeSVG value={`${window.location.origin}/cert-sign/${signToken}`} size={84} fgColor="#0F2042" /></div>
              <div className="text-[11px] leading-relaxed text-slate-600">
                <b className="text-[#0F2042]">Sign from phone or iPad</b><br />
                Scan this QR with any device camera — a signing pad opens instantly, no login needed. Or draw below.
              </div>
            </div>
          )}
          {uploadedUrl ? (
            <div className="rounded-xl border border-slate-200 p-3 text-center">
              <img src={uploadedUrl} alt="signature" className="mx-auto max-h-28 object-contain" data-testid="hrc-sign-uploaded" />
              <button onClick={() => setUploadedUrl("")} className="mt-2 text-[11px] font-bold text-rose-500 hover:underline">
                Remove & draw instead
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
              <SignatureCanvas ref={padRef} penColor="#0F2042"
                canvasProps={{ className: "w-full h-44 touch-none", "data-testid": "hrc-sign-pad" }} />
            </div>
          )}
          <div className="flex items-center gap-2">
            {!uploadedUrl && (
              <button onClick={() => padRef.current?.clear()} data-testid="hrc-sign-clear"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-slate-400">
                <Eraser size={11} /> Clear
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} data-testid="hrc-sign-upload"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:border-slate-400">
              <Upload size={11} /> Upload image
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-full px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
            <button onClick={save} disabled={busy} data-testid="hrc-sign-save"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-5 py-2 text-xs font-bold text-white hover:bg-[#1a3060] disabled:opacity-60">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <PenTool size={12} />} Apply signature
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
