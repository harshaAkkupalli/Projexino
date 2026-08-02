/** Shared doc-to-sign studio: PDF preview + draw/type signature + drag-drop placement.
 * Used by HR → Documents to sign (portal) and the public QR page (/doc-sign/:token). */
import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Loader2, RefreshCw, Save, PenTool, Eraser } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";
pdfjsLib.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.mjs`;

const DRAFT = "__draft__";

export const DocSignStudio = ({
  fetchPdf, signatures = [], mySigId = null, signed = false, canManage = false,
  defaultName = "", refreshKey = 0, onSign, onPlace,
}) => {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const padRef = useRef(null);
  const dragRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [pos, setPos] = useState({});
  const [draftSig, setDraftSig] = useState("");
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const p = {};
    (signatures || []).forEach((s) => { p[s.id] = (s.x != null && s.y != null) ? { x: s.x, y: s.y } : null; });
    setPos((prev) => ({ ...p, [DRAFT]: prev[DRAFT] || null }));
  }, [signatures]);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    (async () => {
      try {
        const data = await fetchPdf();
        const pdf = await pdfjsLib.getDocument({ data }).promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const targetW = Math.min(620, window.innerWidth - 60);
        const viewport = page.getViewport({ scale: targetW / page.getViewport({ scale: 1 }).width });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        setReady(true);
      } catch { toast.error("Could not load the document preview"); }
    })();
    return () => { cancelled = true; };
  }, [refreshKey, reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const pctFromEvent = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
    return { x: Math.max(0, Math.min(80, (cx / r.width) * 100)), y: Math.max(0, Math.min(92, (cy / r.height) * 100)) };
  };
  const movable = (sid) => sid === DRAFT || canManage || sid === mySigId;
  const startDrag = (sid) => (e) => {
    if (!movable(sid)) return;
    e.preventDefault(); dragRef.current = sid;
    setPos((p) => ({ ...p, [sid]: p[sid] || pctFromEvent(e) }));
  };
  const onMove = (e) => {
    if (!dragRef.current) return;
    const xy = pctFromEvent(e);
    setPos((p) => ({ ...p, [dragRef.current]: xy }));
  };
  const endDrag = () => { dragRef.current = null; };

  const useDrawn = () => {
    if (!padRef.current || padRef.current.isEmpty()) return toast.error("Draw your signature first");
    setDraftSig(padRef.current.getCanvas().toDataURL("image/png"));
    toast.success("Signature captured — drag it onto the document");
  };

  const submitSign = async () => {
    if (name.trim().length < 2) return toast.error("Type your full name to sign");
    setBusy(true);
    try {
      const p = pos[DRAFT];
      await onSign({ signed_name: name.trim(), signature_data_url: draftSig || "", x: p?.x ?? null, y: p?.y ?? null });
      setDraftSig(""); setPos((s) => ({ ...s, [DRAFT]: null }));
    } catch (e) { toast.error(e?.response?.data?.detail || "Signing failed"); }
    setBusy(false);
  };

  const savePositions = async () => {
    setSaving(true);
    try {
      const positions = (signatures || []).filter((s) => movable(s.id))
        .map((s) => ({ id: s.id, x: pos[s.id]?.x ?? null, y: pos[s.id]?.y ?? null }));
      await onPlace(positions);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save positions"); }
    setSaving(false);
  };

  const overlayFor = (s) => pos[s.id] && (
    <div key={s.id} data-testid={`sd-placed-${s.id}`}
      onMouseDown={startDrag(s.id)} onTouchStart={startDrag(s.id)}
      style={{ left: `${pos[s.id].x}%`, top: `${pos[s.id].y}%` }}
      className={`absolute rounded-lg border-2 border-dashed px-2 py-1 shadow-md ${movable(s.id) ? "cursor-grab border-violet-500 bg-violet-50/90 active:cursor-grabbing" : "border-slate-300 bg-white/85"}`}>
      {s.signature_data_url
        ? <img src={s.signature_data_url} alt="" className="h-8 max-w-[90px] object-contain" draggable={false} />
        : <div className="font-display text-sm italic text-[#0F2042]">{s.typed_signature || s.name}</div>}
      <div className="mt-0.5 flex items-center justify-between gap-1">
        <span className="text-[8px] font-bold text-violet-700">{s.typed_signature || s.name || "Signer"}</span>
        {movable(s.id) && (
          <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setPos((p) => ({ ...p, [s.id]: null }))}
            className="text-[8px] font-bold text-rose-500" data-testid={`sd-unplace-${s.id}`}>✕</button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-3" data-testid="doc-sign-studio">
      {/* signing controls */}
      {!signed && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3" data-testid="sd-sign-section">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F97316]">// your signature</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="rounded-xl border border-slate-300 bg-white" data-testid="sd-sign-pad">
                <SignatureCanvas ref={padRef} penColor="#0F2042" canvasProps={{ width: 300, height: 96, className: "w-full", "data-testid": "sd-sign-pad-canvas" }} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button onClick={useDrawn} data-testid="sd-use-signature"
                  className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-[11px] font-bold text-white">
                  <PenTool size={11}/> Use signature
                </button>
                <button onClick={() => { padRef.current?.clear(); setDraftSig(""); setPos((p) => ({ ...p, [DRAFT]: null })); }}
                  data-testid="sd-clear-pad"
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-bold text-slate-600">
                  <Eraser size={11}/> Clear
                </button>
              </div>
            </div>
            <div className="flex flex-col justify-between gap-2">
              <label className="block">
                <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Type your full name to sign *</span>
                <input value={name} onChange={(e) => setName(e.target.value)} data-testid="sd-sign-name"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-display text-base italic outline-none focus:border-[#F97316]" />
              </label>
              <button onClick={submitSign} disabled={busy} data-testid="sd-sign-submit"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-700 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />} Sign &amp; submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* chip tray */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-50 px-3 py-2" data-testid="sd-tray">
        {!signed && draftSig && !pos[DRAFT] && (
          <button data-testid="sd-chip-draft" onMouseDown={startDrag(DRAFT)} onTouchStart={startDrag(DRAFT)}
            className="cursor-grab rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold text-white shadow active:cursor-grabbing">
            ✍ {name || "Me"} — drag onto document
          </button>
        )}
        {(signatures || []).filter((s) => movable(s.id) && !pos[s.id]).map((s) => (
          <button key={s.id} data-testid={`sd-chip-${s.id}`} onMouseDown={startDrag(s.id)} onTouchStart={startDrag(s.id)}
            className="cursor-grab rounded-full bg-violet-600 px-3 py-1 text-[10px] font-bold text-white shadow active:cursor-grabbing">
            ✍ {s.typed_signature || s.name || "Signer"}
          </button>
        ))}
        <span className="text-[10px] text-slate-400">
          {signed ? "Drag your signature anywhere on the page, then Save positions." : "Draw or type your signature, drag it onto the page, then Sign & submit."}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <button onClick={() => setReload((r) => r + 1)} data-testid="sd-refresh" title="Refresh preview"
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600">
            <RefreshCw size={10}/> Refresh
          </button>
          {signed && onPlace && (
            <button onClick={savePositions} disabled={saving} data-testid="sd-save-positions"
              className="inline-flex items-center gap-1 rounded-full bg-[#0F2042] px-3 py-1 text-[10px] font-bold text-white disabled:opacity-50">
              {saving ? <Loader2 size={10} className="animate-spin"/> : <Save size={10}/>} Save positions
            </button>
          )}
        </span>
      </div>

      {/* document preview + drop zone */}
      <div className="overflow-x-auto">
        <div ref={wrapRef} className="relative mx-auto w-fit select-none rounded-lg ring-1 ring-slate-200"
          onMouseMove={onMove} onMouseUp={endDrag} onMouseLeave={endDrag}
          onTouchMove={onMove} onTouchEnd={endDrag}>
          <canvas ref={canvasRef} className="rounded-lg" data-testid="sd-preview-canvas" />
          {!ready && <div className="absolute inset-0 grid min-h-[240px] w-[300px] place-items-center bg-white/70"><Loader2 size={22} className="animate-spin text-[#F97316]"/></div>}
          {(signatures || []).map(overlayFor)}
          {!signed && draftSig && pos[DRAFT] && (
            <div data-testid="sd-placed-draft" onMouseDown={startDrag(DRAFT)} onTouchStart={startDrag(DRAFT)}
              style={{ left: `${pos[DRAFT].x}%`, top: `${pos[DRAFT].y}%` }}
              className="absolute cursor-grab rounded-lg border-2 border-dashed border-emerald-500 bg-emerald-50/90 px-2 py-1 shadow-md active:cursor-grabbing">
              <img src={draftSig} alt="" className="h-8 max-w-[90px] object-contain" draggable={false} />
              <div className="mt-0.5 flex items-center justify-between gap-1">
                <span className="text-[8px] font-bold text-emerald-700">{name || "Me"}</span>
                <button onMouseDown={(e) => e.stopPropagation()} onClick={() => setPos((p) => ({ ...p, [DRAFT]: null }))}
                  className="text-[8px] font-bold text-rose-500" data-testid="sd-unplace-draft">✕</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
