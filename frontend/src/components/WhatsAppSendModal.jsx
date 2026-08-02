import { useState } from "react";
import { motion } from "framer-motion";
import { X, Copy, MessageCircle, Link2, Pencil, Eye, Paperclip, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

export const buildWaUrl = (text, phone) => {
  const t = encodeURIComponent(text || "");
  const p = (phone || "").replace(/[^\d]/g, "");
  return p ? `https://wa.me/${p}?text=${t}` : `https://wa.me/?text=${t}`;
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmtLine = (line) =>
  esc(line)
    .replace(/(https?:\/\/\S+)/g, '<span style="color:#039BE5;text-decoration:underline;word-break:break-all">$1</span>')
    .replace(/\*([^*]+)\*/g, "<b>$1</b>")
    .replace(/_([^_]+)_/g, "<i>$1</i>")
    .replace(/~([^~]+)~/g, "<s>$1</s>");

const WaPreview = ({ text }) => (
  <div
    className="max-h-72 overflow-y-auto rounded-xl p-4"
    data-testid="whatsapp-preview"
    style={{ background: "#ECE5DD url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"40\" height=\"40\" opacity=\"0.06\"><circle cx=\"20\" cy=\"20\" r=\"1.5\" fill=\"%23075E54\"/></svg>')" }}
  >
    <div className="relative ml-auto max-w-[92%] rounded-lg rounded-tr-none bg-[#DCF8C6] px-3 py-2 shadow-sm">
      <div className="space-y-0 text-[13px] leading-[1.45] text-[#111B21]">
        {(text || "").split("\n").map((line, i) => (
          <div key={i} className="min-h-[1.2em] break-words" dangerouslySetInnerHTML={{ __html: fmtLine(line) || "&nbsp;" }} />
        ))}
      </div>
      <div className="mt-1 text-right text-[10px] text-[#667781]">
        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ✓✓
      </div>
    </div>
  </div>
);

export const WhatsAppSendModal = ({ title, subtitle, text, onTextChange, phone, downloadUrl, toolbar, onClose, attachments, linkBlock }) => {
  const [mode, setMode] = useState("preview");
  const [sharing, setSharing] = useState(false);
  const hasAttachments = (attachments || []).length > 0;
  const canShareFiles = typeof navigator !== "undefined" && !!navigator.canShare;
  // wa.me fallback can't attach files — append the download link block there only
  const fallbackText = linkBlock ? `${text}\n\n${linkBlock}` : text;

  const shareWithFiles = async () => {
    setSharing(true);
    try {
      const files = await Promise.all((attachments || []).map(async (a) => {
        let blob;
        if (a.path) {
          const r = await api.get(a.path, { responseType: "blob" });
          blob = new Blob([r.data], { type: a.type || "application/pdf" });
        } else {
          const r = await fetch(a.url);
          if (!r.ok) throw new Error("fetch failed");
          blob = await r.blob();
        }
        return new File([blob], a.filename, { type: a.type || blob.type });
      }));
      if (navigator.canShare && navigator.canShare({ files })) {
        await navigator.share({ files, text: text || "" });
        toast.success("Share sheet opened — pick WhatsApp and hit Send");
        onClose?.();
      } else {
        window.open(buildWaUrl(fallbackText, phone), "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      if (e?.name !== "AbortError") toast.error("Couldn't open the share sheet — use Open WhatsApp instead");
    }
    setSharing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      data-testid="whatsapp-modal"
      className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-[#075E54] to-[#128C7E] px-5 py-4 text-white">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              <MessageCircle size={11} /> WhatsApp
            </div>
            <div className="truncate font-display text-lg font-bold">{title}</div>
            {subtitle && <div className="truncate text-[11px] text-white/70">{subtitle}</div>}
          </div>
          <button onClick={onClose} data-testid="whatsapp-modal-close" className="rounded-full p-1.5 text-white/80 hover:bg-white/10"><X size={18} /></button>
        </header>
        <div className="space-y-3 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-2">
            {toolbar || <span />}
            <div className="flex rounded-full bg-slate-100 p-0.5">
              {[{ v: "preview", l: "Preview", I: Eye }, { v: "edit", l: "Edit", I: Pencil }].map(({ v, l, I }) => (
                <button key={v} onClick={() => setMode(v)} data-testid={`whatsapp-mode-${v}`}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-bold uppercase transition ${mode === v ? "bg-[#128C7E] text-white shadow" : "text-slate-600 hover:text-slate-900"}`}>
                  <I size={10} /> {l}
                </button>
              ))}
            </div>
          </div>
          {mode === "preview" ? (
            <WaPreview text={text} />
          ) : (
            <textarea
              rows={11}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              data-testid="whatsapp-message-input"
              className="w-full rounded-xl border border-slate-300 bg-[#ECE5DD]/40 px-3 py-2.5 text-sm leading-relaxed text-slate-800 outline-none focus:border-[#128C7E]"
            />
          )}
          {hasAttachments && (
            <div className="flex flex-wrap items-center gap-1.5" data-testid="whatsapp-attachments">
              {(attachments || []).map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                  <Paperclip size={9} /> {a.filename}
                </span>
              ))}
            </div>
          )}
          {downloadUrl && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] ring-1 ring-slate-200">
              <Link2 size={12} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-slate-600" data-testid="whatsapp-download-url">{downloadUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(downloadUrl); toast.success("Download link copied"); }}
                data-testid="whatsapp-copy-link-btn"
                className="rounded bg-slate-200 px-2 py-0.5 font-bold text-slate-700 hover:bg-slate-300"
              >Copy</button>
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            {hasAttachments && canShareFiles
              ? <>Use <b>Share with attachments</b> to send the actual files (no links shown to the client). "Open WhatsApp" sends text with a download link instead.</>
              : <>WhatsApp will open in a new tab — {phone ? "the client's chat opens pre-filled" : "pick the chat"}, then press <b>Send</b>.</>}
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              onClick={() => { navigator.clipboard.writeText(fallbackText || ""); toast.success("Message copied"); }}
              data-testid="whatsapp-copy-btn"
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <Copy size={12} /> Copy message
            </button>
            <a
              href={buildWaUrl(fallbackText, phone)}
              target="_blank" rel="noopener noreferrer"
              data-testid="whatsapp-open-btn"
              className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-bold shadow ${hasAttachments && canShareFiles ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-[#25D366] text-white hover:bg-[#1DA851]"}`}
            >
              <MessageCircle size={13} /> Open WhatsApp
            </a>
            {hasAttachments && canShareFiles && (
              <button
                onClick={shareWithFiles}
                disabled={sharing}
                data-testid="whatsapp-share-files-btn"
                className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] px-5 py-2 text-xs font-bold text-white shadow hover:bg-[#1DA851] disabled:opacity-60"
              >
                {sharing ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />} Share with attachments
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
