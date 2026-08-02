import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Upload, CheckCircle2, FileText, Download, Clock, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import InternInfographic from "@/components/InternInfographic";

const DOC_LABELS = {
  bank_details: { label: "Bank Account Details", hint: "Cancelled cheque or passbook page (PDF/image)", color: "#10B981" },
  pan_card: { label: "PAN Card", hint: "Both sides if possible", color: "#3B82F6" },
  id_proof: { label: "Government ID Proof", hint: "Aadhaar / Passport / Voter ID", color: "#F97316" },
  address_proof: { label: "Address Proof", hint: "Utility bill / Rent agreement", color: "#A855F7" },
  resume: { label: "Resume / CV", hint: "PDF preferred", color: "#EAB308" },
};

export default function InternDocuments() {
  const [data, setData] = useState({ required: [], submitted: {} });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/me/intern/documents");
      setData(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const submitDoc = async (doc_type, file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("File too large (max 10MB)"); return; }
    try {
      const content_base64 = await readBase64(file);
      await api.post("/me/intern/documents", {
        doc_type, file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64,
      });
      toast.success(`${DOC_LABELS[doc_type].label} submitted`);
      refresh();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Upload failed");
    }
  };

  const downloadDoc = async (doc_type) => {
    try {
      const { data } = await api.get(`/me/intern/documents/${doc_type}/download`);
      const a = document.createElement("a");
      a.href = `data:${data.mime_type};base64,${data.content_base64}`;
      a.download = data.name;
      a.click();
    } catch { toast.error("Download failed"); }
  };

  const submittedCount = Object.keys(data.submitted).length;
  const total = (data.required || []).length || 5;
  const pct = Math.round((submittedCount / total) * 100);

  return (
    <div data-testid="intern-docs-page" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-orange-100 bg-white p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// my documents</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Onboarding paperwork.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Submit all 5 required documents to unlock the <span className="font-semibold text-[#3B82F6]">Document Diligence</span> badge.
            </p>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Completion</span>
                <span className="font-mono-pj text-slate-500">{submittedCount}/{total} ({pct}%)</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-orange-100">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7]" />
              </div>
            </div>
          </div>
          <div className="lg:col-span-3">
            <InternInfographic variant="documents" className="h-56 w-full" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(data.required || []).map((dt) => {
          const meta = DOC_LABELS[dt] || { label: dt, color: "#94A3B8" };
          const submitted = data.submitted?.[dt];
          const verifyState = submitted
            ? (submitted.verified === true ? "verified"
              : (submitted.verified === false && submitted.verified_at) ? "rejected"
              : "pending")
            : null;
          const borderColor = verifyState === "verified" ? "#10B981"
            : verifyState === "rejected" ? "#EF4444"
            : (submitted ? meta.color : "#FED7AA");
          return (
            <motion.div key={dt}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              data-testid={`doc-slot-${dt}`}
              className="rounded-2xl border-2 bg-white p-5 shadow-sm transition" style={{ borderColor }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}15`, color: meta.color }}>
                  <FileText size={20} />
                </div>
                {submitted && (
                  verifyState === "verified" ? (
                    <span data-testid={`doc-status-${dt}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      <ShieldCheck size={10} /> Verified
                    </span>
                  ) : verifyState === "rejected" ? (
                    <span data-testid={`doc-status-${dt}`} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      <ShieldX size={10} /> Rejected
                    </span>
                  ) : (
                    <span data-testid={`doc-status-${dt}`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <CheckCircle2 size={10} /> Pending review
                    </span>
                  )
                )}
              </div>
              <div className="mt-3 font-display text-base font-semibold text-[#0F172A]">{meta.label}</div>
              <div className="mt-1 text-xs text-slate-500">{meta.hint}</div>
              {submitted ? (
                <div className="mt-4 space-y-2">
                  <div className="rounded-lg bg-slate-50 p-2 text-xs">
                    <div className="font-semibold text-slate-700 truncate">{submitted.file_name}</div>
                    <div className="text-[10px] text-slate-500"><Clock size={9} className="inline" /> {new Date(submitted.submitted_at).toLocaleString()}</div>
                  </div>
                  {verifyState === "rejected" && (submitted.verifier_note || submitted.verified_by) && (
                    <div data-testid={`doc-rejection-${dt}`} className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2 text-[10px] text-red-700">
                      <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                      <div>
                        <div className="font-semibold">Rejected by {submitted.verified_by || "Reviewer"}. Please re-upload.</div>
                        {submitted.verifier_note && <div className="mt-0.5 italic">"{submitted.verifier_note}"</div>}
                      </div>
                    </div>
                  )}
                  {verifyState === "verified" && submitted.verified_by && (
                    <div className="text-[10px] text-emerald-600">Verified by {submitted.verified_by}{submitted.verified_at ? ` · ${new Date(submitted.verified_at).toLocaleDateString()}` : ""}</div>
                  )}
                  <div className="flex gap-2">
                    <button data-testid={`doc-download-${dt}`} onClick={() => downloadDoc(dt)} className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#0F2042] hover:bg-slate-50">
                      <Download size={11} className="mr-1 inline" /> Download
                    </button>
                    <label className="flex-1 rounded-lg border border-[#F97316] bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#F97316] hover:bg-orange-100 cursor-pointer text-center">
                      Re-upload
                      <input type="file" hidden onChange={(e) => submitDoc(dt, e.target.files?.[0])} />
                    </label>
                  </div>
                </div>
              ) : (
                <label className="btn-primary mt-4 w-full justify-center text-sm cursor-pointer" data-testid={`doc-upload-${dt}`}>
                  <Upload size={14} /> Upload
                  <input type="file" hidden onChange={(e) => submitDoc(dt, e.target.files?.[0])} />
                </label>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function readBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const s = String(fr.result || "");
      resolve(s.includes(",") ? s.split(",")[1] : s);
    };
    fr.readAsDataURL(file);
  });
}
