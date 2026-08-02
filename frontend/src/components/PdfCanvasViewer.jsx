/** Renders PDFs inline on ANY device (mobile included) using pdf.js canvases —
 * no browser plugin, no download required. */
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;

export function PdfCanvasViewer({ blob, url, className = "" }) {
  const holderRef = useRef(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    let pdf;
    (async () => {
      try {
        setState("loading");
        const data = blob ? await blob.arrayBuffer() : await (await fetch(url)).arrayBuffer();
        pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;
        const holder = holderRef.current;
        if (!holder) return;
        holder.innerHTML = "";
        const width = Math.min(holder.clientWidth || 600, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;
          const vp1 = page.getViewport({ scale: 1 });
          const scale = Math.max((width - 8) / vp1.width, 0.3);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width * dpr);
          canvas.height = Math.floor(vp.height * dpr);
          canvas.style.width = `${Math.floor(vp.width)}px`;
          canvas.style.height = `${Math.floor(vp.height)}px`;
          canvas.className = "mx-auto mb-3 block max-w-full rounded-lg bg-white shadow";
          holder.appendChild(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: vp,
            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
          }).promise;
        }
        if (!cancelled) setState("ready");
      } catch (e) {
        console.error("pdf render failed", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      try { pdf && pdf.destroy(); } catch { /* noop */ }
    };
  }, [blob, url]);

  return (
    <div className={`h-full overflow-y-auto p-2 sm:p-4 ${className}`} data-testid="pdf-canvas-viewer">
      {state === "loading" && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 size={20} className="animate-spin" /> Rendering PDF…
        </div>
      )}
      {state === "error" && (
        <div className="py-16 text-center text-sm text-slate-500">
          Could not render the PDF here — use the Download button above.
        </div>
      )}
      <div ref={holderRef} />
    </div>
  );
}
