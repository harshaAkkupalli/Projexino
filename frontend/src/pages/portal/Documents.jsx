import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, Trash2, FileText, Download, MessageCircle, Search } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import PageInfographic from "@/components/PageInfographic";

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(null);
  const [q, setQ] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/documents");
      setDocs(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const filtered = q
    ? docs.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || (d.description || "").toLowerCase().includes(q.toLowerCase()))
    : docs;

  const onDelete = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    setDocs((p) => p.filter((d) => d.id !== id));
    toast.success("Deleted");
  };

  const onDownload = async (d) => {
    const { data } = await api.get(`/documents/${d.id}/download`);
    const a = document.createElement("a");
    a.href = `data:${data.mime_type};base64,${data.content_base64}`;
    a.download = data.name;
    a.click();
  };

  return (
    <div data-testid="portal-documents" className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-orange-50/40 to-purple-50/40 p-6 shadow-sm">
        <div className="relative grid items-center gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="text-xs font-bold uppercase tracking-[0.25em] text-[#F97316]">// documents</div>
            <h1 className="font-display mt-2 text-3xl font-medium leading-tight text-[#0F2042] md:text-4xl">
              Share docs. Collect feedback.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Upload up to 10 MB per file. Share with specific teammates and collect inline comments — all without leaving the portal.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button data-testid="upload-doc-btn" onClick={() => setShow(true)} className="btn-primary text-sm">
                <Upload size={16} /> Upload document
              </button>
              <span className="text-xs text-slate-500">{docs.length} file(s)</span>
            </div>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="documents" className="h-56 w-full" />
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input data-testid="doc-search" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText className="mx-auto text-slate-300" size={36} />
          <div className="mt-3 text-sm font-semibold text-slate-700">No documents yet</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d, i) => (
            <motion.div key={d.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              data-testid={`doc-card-${d.id}`}
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#F97316] hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#F97316]">
                  <FileText size={20} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setActive(d)} data-testid={`doc-comment-${d.id}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#F97316]">
                    <MessageCircle size={14} />
                  </button>
                  <button onClick={() => onDownload(d)} data-testid={`doc-download-${d.id}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0F2042]">
                    <Download size={14} />
                  </button>
                  <button onClick={() => onDelete(d.id)} data-testid={`doc-delete-${d.id}`} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="mt-3 truncate font-display text-base font-semibold text-[#0F172A]">{d.name}</div>
              <div className="mt-1 text-xs text-slate-500">{(d.size / 1024).toFixed(1)} KB · {d.mime_type}</div>
              {d.description && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{d.description}</p>}
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                <span>by {d.uploader}</span>
                <span>{(d.comments || []).length} comments</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {show && <UploadModal onClose={() => setShow(false)} onSaved={refresh} />}
        {active && <CommentsDrawer doc={active} onClose={() => setActive(null)} onUpdated={(d) => { setDocs((p) => p.map((x) => x.id === d.id ? d : x)); setActive(d); }} />}
      </AnimatePresence>
    </div>
  );
}

function UploadModal({ onClose, onSaved }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error("Pick a file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10 MB"); return; }
    setSaving(true);
    try {
      const b64 = await readBase64(file);
      await api.post("/documents", {
        name: name || file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        content_base64: b64,
        description,
      });
      toast.success("Uploaded");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Upload failed");
    } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        data-testid="doc-upload-modal"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Upload document</h3>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">File (≤10MB)</span>
            <input data-testid="doc-file" type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Display name</span>
            <input data-testid="doc-name" value={name} placeholder={file?.name || "Optional"}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Description</span>
            <textarea data-testid="doc-description" rows={3} value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
        </div>
        <button data-testid="doc-save-btn" disabled={saving} className="btn-primary mt-6 w-full justify-center">
          {saving ? "Uploading…" : "Upload"}
        </button>
      </motion.form>
    </motion.div>
  );
}

function CommentsDrawer({ doc, onClose, onUpdated }) {
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async (e) => {
    e?.preventDefault?.();
    if (!msg.trim()) return;
    setSending(true);
    try {
      const { data } = await api.post(`/documents/${doc.id}/comments`, { message: msg });
      onUpdated(data); setMsg("");
    } finally { setSending(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-md overflow-y-auto bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#F97316]">// comments</div>
            <h3 className="font-display mt-1 text-xl font-semibold">{doc.name}</h3>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-3">
          {(doc.comments || []).slice().reverse().map((c) => (
            <div key={c.id} className="rounded-xl bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#F97316]">{c.author}</div>
              <div className="mt-1 text-sm text-slate-700">{c.message}</div>
              <div className="mt-1 text-[10px] text-slate-400">{new Date(c.at).toLocaleString()}</div>
            </div>
          ))}
          {(!doc.comments || doc.comments.length === 0) && (
            <div className="text-sm text-slate-400">No comments yet.</div>
          )}
        </div>
        <form onSubmit={submit} className="mt-6 flex gap-2">
          <input data-testid="doc-comment-input" value={msg} onChange={(e) => setMsg(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          <button data-testid="doc-comment-btn" disabled={sending || !msg.trim()} className="btn-primary text-sm">Post</button>
        </form>
      </motion.div>
    </motion.div>
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
