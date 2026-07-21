/** Inline PDF viewer — opens any generated PDF right inside the portal. */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Download, ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { saveOrShareBlob } from "@/lib/download";
import { PdfCanvasViewer } from "@/components/PdfCanvasViewer";
import { toast } from "sonner";

export const PdfPreviewModal = ({ title, fetchPath, url, filename, onClose }) => {
  const [blobUrl, setBlobUrl] = useState("");
  const [blob, setBlob] = useState(null);

  useEffect(() => {
    let revoke = "";
    (async () => {
      try {
        let b;
        if (fetchPath) {
          const res = await api.get(fetchPath, { responseType: "blob" });
          b = new Blob([res.data], { type: "application/pdf" });
        } else {
          const res = await fetch(url);
          b = await res.blob();
        }
        setBlob(b);
        revoke = URL.createObjectURL(b);
        setBlobUrl(revoke);
      } catch {
        toast.error("Could not load the PDF");
        onClose?.();
      }
    })();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [fetchPath, url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/80 p-3 backdrop-blur-md" data-testid="pdf-preview-modal">
      <motion.div initial={{ scale: 0.97 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-2 bg-[#0F2042] px-4 py-3 text-white">
          <div className="min-w-0 flex-1 basis-full truncate font-display text-sm font-bold sm:basis-auto">{title || filename || "Document"}</div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button data-testid="pdf-preview-download" disabled={!blob}
              onClick={async () => { await saveOrShareBlob(blob, filename || "document.pdf"); }}
              className="inline-flex items-center gap-1 rounded-full bg-[#F97316] px-3 py-1.5 text-[11px] font-bold hover:bg-orange-600 disabled:opacity-50">
              <Download size={11} /> Download
            </button>
            <button data-testid="pdf-preview-newtab" disabled={!blobUrl}
              onClick={() => window.open(blobUrl, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold hover:bg-white/20 disabled:opacity-50">
              <ExternalLink size={11} /> New tab
            </button>
            <button onClick={onClose} data-testid="pdf-preview-close" className="rounded-lg p-1.5 hover:bg-white/10"><X size={16} /></button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden bg-slate-200">
          {!blob ? (
            <div className="flex h-full items-center justify-center"><Loader2 size={28} className="animate-spin text-slate-300" /></div>
          ) : (
            <PdfCanvasViewer blob={blob} />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};
