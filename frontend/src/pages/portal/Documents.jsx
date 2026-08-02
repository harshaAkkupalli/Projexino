import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, X, Trash2, FileText, Download, MessageCircle, Search, UploadCloud, CheckCircle2,
  AlertCircle, Loader2, Folder, FolderInput, Mail, Eye, FolderOpen, Send,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { PdfCanvasViewer } from "@/components/PdfCanvasViewer";
import PageInfographic from "@/components/PageInfographic";

export default function Documents() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [active, setActive] = useState(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [folder, setFolder] = useState("");
  const [showMove, setShowMove] = useState(false);
  const [share, setShare] = useState(null); // {docIds} | {folder}
  const [preview, setPreview] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/documents");
      setDocs(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const folders = useMemo(() => [...new Set(docs.map((d) => d.folder).filter(Boolean))].sort(), [docs]);

  const filtered = useMemo(() => {
    let list = folder ? docs.filter((d) => d.folder === folder) : docs;
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || (d.description || "").toLowerCase().includes(q.toLowerCase()));
    return list;
  }, [docs, folder, q]);

  const toggleSel = (id) => setSelected((p) => {
    const n = new Set(p);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const onDelete = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    setDocs((p) => p.filter((d) => d.id !== id));
    setSelected((p) => { const n = new Set(p); n.delete(id); return n; });
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
              Organize. Preview. Share.
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Upload files, organize them into folders, preview in-app and email them — a folder ships as a ZIP, files ship with their exact names.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <button data-testid="upload-doc-btn" onClick={() => setShow(true)} className="btn-primary text-sm">
                <Upload size={16} /> Upload document
              </button>
              <span className="text-xs text-slate-500">{docs.length} file(s) · {folders.length} folder(s)</span>
            </div>
          </div>
          <div className="lg:col-span-3">
            <PageInfographic variant="documents" className="h-56 w-full" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200" data-testid="doc-folder-tabs">
          <button onClick={() => setFolder("")} data-testid="doc-folder-all"
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition ${!folder ? "bg-[#0F2042] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
            <FileText size={11}/> All ({docs.length})
          </button>
          {folders.map((f) => (
            <button key={f} onClick={() => setFolder(folder === f ? "" : f)} data-testid={`doc-folder-${f}`}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-bold transition ${folder === f ? "bg-[#F97316] text-white" : "text-slate-500 hover:text-[#0F2042]"}`}>
              <Folder size={11}/> {f} ({docs.filter((d) => d.folder === f).length})
            </button>
          ))}
        </div>
        {folder && (
          <button onClick={() => setShare({ folder })} data-testid="doc-share-folder"
            className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-[11px] font-bold text-white shadow hover:bg-violet-700">
            <Mail size={12}/> Email folder as ZIP
          </button>
        )}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="doc-search" placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)}
            className="w-64 rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#F97316]" />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2 text-xs" data-testid="doc-bulk-bar">
          <span className="font-bold text-[#0F2042]">{selected.size} selected</span>
          <button onClick={() => setShowMove(true)} data-testid="doc-move-btn"
            className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1 font-bold text-white"><FolderInput size={11}/> Move to folder</button>
          <button onClick={() => setShare({ docIds: [...selected] })} data-testid="doc-share-selected"
            className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 font-bold text-white"><Mail size={11}/> Share via email</button>
          <button onClick={() => setSelected(new Set())} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-bold text-slate-500">Clear</button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <FileText className="mx-auto text-slate-300" size={36} />
          <div className="mt-3 text-sm font-semibold text-slate-700">{folder ? `No documents in "${folder}"` : "No documents yet"}</div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d, i) => (
            <motion.div key={d.id}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              data-testid={`doc-card-${d.id}`}
              className={`group rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected.has(d.id) ? "border-[#F97316] ring-1 ring-[#F97316]/30" : "border-slate-200 hover:border-[#F97316]"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSel(d.id)}
                    data-testid={`doc-select-${d.id}`} className="h-4 w-4 accent-[#F97316]" />
                  <button onClick={() => setPreview(d)} data-testid={`doc-thumb-${d.id}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#F97316] hover:bg-orange-100">
                    <FileText size={20} />
                  </button>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <button onClick={() => setPreview(d)} data-testid={`doc-preview-${d.id}`} title="Preview" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-violet-600">
                    <Eye size={14} />
                  </button>
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
              <button onClick={() => setPreview(d)} className="mt-3 block w-full truncate text-left font-display text-base font-semibold text-[#0F172A] hover:text-[#F97316]" data-testid={`doc-name-${d.id}`}>{d.name}</button>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{(d.size / 1024).toFixed(1)} KB</span>
                {d.folder && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600" data-testid={`doc-folder-badge-${d.id}`}>
                    <Folder size={9}/>{d.folder}
                  </span>
                )}
              </div>
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
        {show && <UploadModal folders={folders} currentFolder={folder} onClose={() => setShow(false)} onSaved={refresh} />}
        {active && <CommentsDrawer doc={active} onClose={() => setActive(null)} onUpdated={(d) => { setDocs((p) => p.map((x) => x.id === d.id ? d : x)); setActive(d); }} />}
        {showMove && <MoveModal folders={folders} count={selected.size} onClose={() => setShowMove(false)}
          onMove={async (f) => {
            try {
              const { data } = await api.post("/documents/move", { ids: [...selected], folder: f });
              toast.success(f ? `Moved ${data.moved} file(s) to "${f}"` : `Removed ${data.moved} file(s) from folders`);
              setShowMove(false); setSelected(new Set()); refresh();
            } catch (e) { toast.error(formatApiError(e)); }
          }} />}
        {share && <ShareEmailModal share={share} docs={docs} onClose={() => setShare(null)} onSent={() => { setShare(null); setSelected(new Set()); }} />}
        {preview && <PreviewModal doc={preview} onClose={() => setPreview(null)} onDownload={() => onDownload(preview)} />}
      </AnimatePresence>
    </div>
  );
}

function MoveModal({ folders, count, onClose, onMove }) {
  const [name, setName] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" data-testid="doc-move-modal">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#F97316]">// organize</div>
        <h3 className="mt-1 font-display text-lg font-bold text-[#0F2042]">Move {count} file(s) to folder</h3>
        {folders.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {folders.map((f) => (
              <button key={f} onClick={() => setName(f)} data-testid={`doc-move-pick-${f}`}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold ${name === f ? "border-[#F97316] bg-orange-50 text-[#F97316]" : "border-slate-200 text-slate-600"}`}>
                <Folder size={10}/>{f}
              </button>
            ))}
          </div>
        )}
        <input value={name} onChange={(e) => setName(e.target.value)} data-testid="doc-move-folder-name"
          placeholder="Folder name (new or existing)"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" autoFocus />
        <div className="mt-4 flex justify-between gap-2">
          <button onClick={() => onMove("")} data-testid="doc-move-unfile" className="rounded-full border border-slate-200 px-4 py-1.5 text-xs font-bold text-slate-500">Remove from folder</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-1.5 text-xs font-bold text-slate-700">Cancel</button>
            <button onClick={() => name.trim() ? onMove(name.trim()) : toast.error("Type a folder name")} data-testid="doc-move-confirm"
              className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-4 py-1.5 text-xs font-bold text-white"><FolderInput size={12}/> Move</button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function ShareEmailModal({ share, docs, onClose, onSent }) {
  const isFolder = !!share.folder;
  const files = isFolder ? docs.filter((d) => d.folder === share.folder) : docs.filter((d) => (share.docIds || []).includes(d.id));
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState(isFolder ? `Documents · ${share.folder}` : "Documents from Projexino");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!to.trim().includes("@")) { toast.error("Enter recipient email(s)"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/documents/share-email", {
        to, subject, message,
        folder: isFolder ? share.folder : "",
        doc_ids: isFolder ? [] : share.docIds,
      });
      toast.success(`Emailed to ${data.sent} recipient(s)`, { description: `Attached: ${data.attached.join(", ")}` });
      onSent();
    } catch (e) { toast.error(formatApiError(e)); }
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" data-testid="doc-share-modal">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between rounded-t-2xl bg-[#0F2042] px-5 py-4 text-white">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">// share via gmail</div>
            <div className="font-display text-lg font-bold">{isFolder ? `Folder "${share.folder}" → ZIP` : `${files.length} file(s) with exact names`}</div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-white/10"><X size={18}/></button>
        </header>
        <div className="space-y-3 p-5">
          <div className="rounded-xl bg-slate-50 p-3" data-testid="doc-share-attachment-list">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
              {isFolder ? <FolderOpen size={11}/> : <FileText size={11}/>} Will be attached
            </div>
            {isFolder ? (
              <div className="text-xs font-bold text-[#0F2042]">{share.folder}.zip <span className="font-normal text-slate-400">({files.length} files inside)</span></div>
            ) : (
              files.map((f) => <div key={f.id} className="truncate text-xs text-slate-600">• {f.name}</div>)
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">To (comma-separated)</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} data-testid="doc-share-to" placeholder="client@company.com, hr@company.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" autoFocus />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} data-testid="doc-share-subject"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Message</span>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} data-testid="doc-share-message"
              placeholder="Please find the attached document(s)."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
          <button onClick={send} disabled={busy} data-testid="doc-share-send"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#F97316] py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">
            {busy ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Send email
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function PreviewModal({ doc, onClose, onDownload }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/documents/${doc.id}/download`)
      .then(({ data: d }) => setData(d))
      .catch((e) => setError(formatApiError(e)));
  }, [doc.id]);

  const mime = data?.mime_type || doc.mime_type || "";
  const url = data ? `data:${mime};base64,${data.content_base64}` : "";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf";
  const isText = mime.startsWith("text/") || ["application/json", "application/xml"].includes(mime);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" data-testid="doc-preview-modal">
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate font-display text-base font-bold text-[#0F2042]">{doc.name}</div>
            <div className="text-[11px] text-slate-400">{mime} · {(doc.size / 1024).toFixed(1)} KB{doc.folder ? ` · 📁 ${doc.folder}` : ""}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onDownload} data-testid="doc-preview-download"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-[#F97316]"><Download size={12}/> Download</button>
            <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100"><X size={16}/></button>
          </div>
        </header>
        <div className="flex-1 overflow-auto bg-slate-100 p-4" data-testid="doc-preview-body">
          {error ? (
            <div className="py-16 text-center text-sm font-bold text-rose-500">{error}</div>
          ) : !data ? (
            <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-300"/></div>
          ) : isImage ? (
            <img src={url} alt={doc.name} className="mx-auto max-h-[72vh] rounded-lg object-contain shadow" />
          ) : isPdf ? (
            <PdfCanvasViewer url={url} className="max-h-[72vh]" />
          ) : isText ? (
            <pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white p-4 text-xs text-slate-700 shadow">{atob(data.content_base64)}</pre>
          ) : (
            <div className="py-16 text-center text-sm text-slate-500">
              <FileText size={36} className="mx-auto mb-3 text-slate-300"/>
              No in-app preview for this file type — use <b>Download</b> above.
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function UploadModal({ folders = [], currentFolder = "", onClose, onSaved }) {
  const [queue, setQueue] = useState([]); // [{file, status, error}]
  const [description, setDescription] = useState("");
  const [folder, setFolder] = useState(currentFolder);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const MAX_BYTES = 10 * 1024 * 1024;

  const addFiles = (files) => {
    const arr = Array.from(files || []);
    const next = arr.map((f) => {
      let error = "";
      if (f.size > MAX_BYTES) error = `${(f.size / 1024 / 1024).toFixed(1)} MB · max 10 MB`;
      return { file: f, status: error ? "error" : "queued", error };
    });
    setQueue((q) => [...q, ...next]);
  };

  const removeAt = (i) => setQueue((q) => q.filter((_, idx) => idx !== i));

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const valid = queue.filter((q) => q.status !== "error");
    if (valid.length === 0) { toast.error("Add at least one valid file"); return; }
    setBusy(true);
    let doneCount = 0;
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === "error" || queue[i].status === "done") continue;
      setQueue((q) => q.map((row, idx) => idx === i ? { ...row, status: "uploading" } : row));
      try {
        const b64 = await readBase64(queue[i].file);
        await api.post("/documents", {
          name: queue[i].file.name,
          mime_type: queue[i].file.type || "application/octet-stream",
          size: queue[i].file.size,
          content_base64: b64,
          description,
          folder: folder.trim(),
        });
        setQueue((q) => q.map((row, idx) => idx === i ? { ...row, status: "done" } : row));
        doneCount += 1;
      } catch (err) {
        setQueue((q) => q.map((row, idx) => idx === i ? { ...row, status: "error", error: formatApiError(err.response?.data?.detail) || "Upload failed" } : row));
      }
    }
    setBusy(false);
    if (doneCount > 0) toast.success(`Uploaded ${doneCount} file(s)`);
    onSaved();
    // auto-close ONLY if every row succeeded
    setTimeout(() => {
      setQueue((q) => {
        if (q.length > 0 && q.every((r) => r.status === "done")) onClose();
        return q;
      });
    }, 600);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" data-testid="doc-upload-modal">
      <motion.form initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Upload documents</h3>
          <button type="button" onClick={onClose} data-testid="doc-upload-close"><X size={18} /></button>
        </div>

        {/* Drag-drop zone */}
        <div
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          data-testid="doc-dropzone"
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${dragOver ? "border-[#F97316] bg-orange-50" : "border-slate-300 bg-slate-50 hover:border-[#F97316] hover:bg-orange-50/40"}`}>
          <UploadCloud size={36} className="mb-2 text-[#F97316]"/>
          <div className="text-sm font-bold text-[#0F2042]">Drop files here, or click to browse</div>
          <div className="mt-1 text-xs text-slate-500">Up to 10 MB per file · multi-select supported</div>
          <input ref={inputRef} type="file" multiple className="hidden" data-testid="doc-file-input"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {queue.length > 0 && (
          <ul className="mt-4 max-h-60 space-y-1.5 overflow-y-auto" data-testid="doc-upload-queue">
            {queue.map((row, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 text-xs">
                <FileText size={14} className="shrink-0 text-slate-400"/>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-bold text-[#0F2042]">{row.file.name}</div>
                  <div className="text-[10px] text-slate-500">{(row.file.size/1024).toFixed(0)} KB</div>
                </div>
                {row.status === "uploading" && <Loader2 size={14} className="animate-spin text-amber-500"/>}
                {row.status === "done" && <CheckCircle2 size={14} className="text-emerald-500"/>}
                {row.status === "error" && (<span className="flex items-center gap-1 text-[10px] text-rose-600"><AlertCircle size={11}/>{row.error}</span>)}
                {row.status === "queued" && (
                  <button type="button" onClick={() => removeAt(i)} className="text-slate-400 hover:text-rose-500"><X size={13}/></button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Folder (optional)</span>
            <input list="doc-folder-options" value={folder} onChange={(e) => setFolder(e.target.value)} data-testid="doc-upload-folder"
              placeholder="e.g. Contracts"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
            <datalist id="doc-folder-options">
              {folders.map((f) => <option key={f} value={f} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-[0.18em] text-slate-500">Description (applied to all)</span>
            <textarea data-testid="doc-description" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]" />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100">Cancel</button>
          <button data-testid="doc-save-btn" disabled={busy || queue.length === 0}
            className="flex items-center gap-1.5 rounded-full bg-[#F97316] px-5 py-1.5 text-xs font-bold text-white hover:bg-[#ea6a0a] disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>}
            {busy ? "Uploading…" : `Upload ${queue.filter((q) => q.status !== "error" && q.status !== "done").length || queue.length} file(s)`}
          </button>
        </div>
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
