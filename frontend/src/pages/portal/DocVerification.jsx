import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSearch, ExternalLink, CheckCircle2, XCircle, MessageSquare, Loader2, X, Filter, Send,
} from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

const STATUS_COLORS = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
};

export default function DocVerification() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [openDoc, setOpenDoc] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/doc-verification");
      setList(data);
    } catch (e) { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((d) => filter === "all" || d.verification.status === filter), [list, filter]);
  const counts = useMemo(() => ({
    all: list.length,
    pending: list.filter((d) => d.verification.status === "pending").length,
    approved: list.filter((d) => d.verification.status === "approved").length,
    rejected: list.filter((d) => d.verification.status === "rejected").length,
  }), [list]);

  return (
    <div data-testid="page-doc-verification" className="space-y-5">
      <div className="rounded-3xl border border-amber-100 bg-gradient-to-br from-white via-amber-50/40 to-orange-50/40 p-5 md:p-7">
        <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-amber-600">// hr · verification</div>
        <h1 className="font-display mt-1 text-3xl font-medium text-[#0F2042] md:text-4xl">Document Verification</h1>
        <p className="mt-1 text-sm text-slate-600">Review documents submitted by interns &amp; employees. Approve, reject with feedback, or leave a comment thread.</p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { v: "all", l: "All" },
          { v: "pending", l: "Pending" },
          { v: "approved", l: "Approved" },
          { v: "rejected", l: "Rejected" },
        ].map((f) => (
          <button
            key={f.v}
            data-testid={`dv-filter-${f.v}`}
            onClick={() => setFilter(f.v)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              filter === f.v ? "bg-[#0F2042] text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#0F2042]"
            }`}
          >
            {f.l} <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[9px]">{counts[f.v]}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-slate-200 p-12 text-center">
          <FileSearch size={36} className="mx-auto text-slate-300" />
          <div className="mt-3 text-sm font-bold text-[#0F2042]">No documents to review</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d, i) => (
            <motion.div
              key={`${d.kind}-${d.owner_id}-${d.doc_type}`}
              data-testid={`dv-card-${d.owner_email}-${d.doc_type}`}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-bold capitalize text-[#0F2042]">{d.doc_type.replace(/_/g, " ")}</div>
                  <div className="line-clamp-1 text-xs text-slate-500">{d.owner_name} · {d.owner_email}</div>
                  <div className="mt-1 text-[10px] text-slate-400">{d.file_name} · {d.submitted_at?.slice(0, 10)}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[d.verification.status] || STATUS_COLORS.pending}`}>
                  {d.verification.status}
                </span>
              </div>
              <div className="flex gap-1.5 border-t border-slate-100 p-2">
                <button
                  data-testid={`dv-open-${d.owner_email}-${d.doc_type}`}
                  onClick={() => setOpenDoc(d)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0F2042] px-2 py-1.5 text-[11px] font-bold text-white hover:bg-[#1E3A8A]"
                >
                  <ExternalLink size={11} /> Review
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {openDoc && <ReviewModal item={openDoc} onClose={() => setOpenDoc(null)} onChanged={() => { setOpenDoc(null); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function ReviewModal({ item, onClose, onChanged }) {
  const [doc, setDoc] = useState(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/doc-verification/${item.kind}/${item.owner_id}/${item.doc_type}`);
      setDoc(data);
    } catch (e) { toast.error("Failed to load doc"); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openInNewTab = () => {
    // Stream from backend → reliable PDF/image rendering in all browsers
    // (avoids data-URI blocking issues for large PDFs in Chrome).
    const apiUrl = process.env.REACT_APP_BACKEND_URL;
    const token = localStorage.getItem("token") || "";
    const url = `${apiUrl}/api/doc-verification/${item.kind}/${item.owner_id}/${item.doc_type}/file`;
    // Fetch as authenticated blob, then open via blob URL — works for PDFs, images, anything
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error("Fetch failed");
        return r.blob();
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, "_blank");
        if (!w) {
          toast.error("Popup blocked — allow popups for this site");
          URL.revokeObjectURL(blobUrl);
          return;
        }
        // Revoke after 60s so memory is released
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
      })
      .catch(() => toast.error("Could not open document"));
  };

  const decide = async (decision) => {
    if (decision === "rejected" && !comment.trim()) { toast.error("Add a reason when rejecting"); return; }
    setBusy(true);
    try {
      await api.post(`/doc-verification/${item.kind}/${item.owner_id}/${item.doc_type}/decision`, { decision, comment });
      toast.success(`Marked ${decision}. Uploader notified.`);
      onChanged();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Failed"); }
    finally { setBusy(false); }
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api.post(`/doc-verification/${item.kind}/${item.owner_id}/${item.doc_type}/comment`, { message: comment });
      setComment("");
      load();
      toast.success("Comment added");
    } catch (e) { toast.error("Failed"); }
    finally { setBusy(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()} data-testid="dv-review-modal"
        className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#F97316]">// review</div>
            <h3 className="font-display text-xl font-semibold capitalize text-[#0F2042]">{item.doc_type.replace(/_/g, " ")}</h3>
            <div className="text-xs text-slate-500">{item.owner_name} · {item.owner_email}</div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#0F2042]"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-6">
          {!doc ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-xs">
                <div className="flex-1">
                  <div className="font-bold text-[#0F2042]">{doc.file_name}</div>
                  <div className="text-slate-500">{doc.mime_type} · uploaded {doc.submitted_at?.slice(0, 10)}</div>
                </div>
                <button
                  data-testid="dv-open-newtab"
                  onClick={openInNewTab}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#0F2042] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#1E3A8A]"
                >
                  <ExternalLink size={11} /> Open in new tab
                </button>
              </div>

              {doc.note && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs">
                  <b>Uploader note:</b> {doc.note}
                </div>
              )}

              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Comment / reason</div>
                <textarea
                  value={comment} onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  data-testid="dv-comment"
                  placeholder="Required when rejecting. Optional otherwise."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#F97316]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button data-testid="dv-approve" onClick={() => decide("approved")} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve
                </button>
                <button data-testid="dv-reject" onClick={() => decide("rejected")} disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />} Reject
                </button>
                <button data-testid="dv-comment-only" onClick={addComment} disabled={busy || !comment.trim()}
                  className="flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-[#0F2042] disabled:opacity-60">
                  <MessageSquare size={14} /> Comment only
                </button>
              </div>

              {/* Comment thread */}
              {doc.verification?.comments?.length > 0 && (
                <div>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Thread</div>
                  <ul className="space-y-2">
                    {doc.verification.comments.map((c) => (
                      <li key={c.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="text-[10px] font-bold text-slate-400">{c.by_name} · {c.by_role} · {c.at?.slice(0, 16).replace("T", " ")}</div>
                        <div className="mt-1 text-slate-700">{c.message}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
