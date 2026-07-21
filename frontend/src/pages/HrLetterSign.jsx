/**
 * HrLetterSign.jsx — Public mobile page opened by scanning a QR code
 * from the HR Letters portal. The signer draws their signature on
 * the touch canvas → we POST it back to the letter and mark the
 * token as consumed. No auth required.
 * Route: /sign/:token
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { PenLine, CheckCircle2, RefreshCw, Loader2, AlertTriangle, Upload, X as XIcon } from "lucide-react";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";

export default function HrLetterSign() {
  const { token } = useParams();
  const padRef = useRef(null);
  const fileRef = useRef(null);
  const [meta, setMeta] = useState(null);   // { letter_title, signer_name, block_id }
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState(""); // if user uploads a photo of their signature, we use this instead of the canvas

  // Public endpoints don't want the Authorization header — build a bare axios call
  const publicGet = (url) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api${url}`).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
    return data;
  });
  const publicPost = (url, body) => fetch(`${process.env.REACT_APP_BACKEND_URL}/api${url}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }).then(async (r) => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || `HTTP ${r.status}`);
    return data;
  });

  useEffect(() => {
    (async () => {
      try {
        const d = await publicGet(`/public/hr-letters/sign/${token}`);
        setMeta(d);
        setName(d.signer_name || "");
      } catch (e) {
        setErr(e.message || "This signing link is invalid or has expired.");
      }
      setLoading(false);
    })();
  }, [token]);

  const clear = () => padRef.current?.clear();

  const onFilePick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error("Please upload a PNG, JPG or WebP image");
    if (f.size > 4 * 1024 * 1024) return toast.error("Image too large — max 4 MB");
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      if (!dataUrl.startsWith("data:image/")) return toast.error("Could not read the file");
      setUploadedUrl(dataUrl);
      toast.success("Photo attached — tap Submit when ready");
    };
    reader.onerror = () => toast.error("Could not read the file");
    reader.readAsDataURL(f);
  };

  const submit = async () => {
    // Prefer uploaded photo if provided; otherwise use the canvas drawing
    let dataUrl = uploadedUrl;
    if (!dataUrl) {
      if (!padRef.current || padRef.current.isEmpty()) return toast.error("Please draw your signature or upload a photo.");
      // Direct toDataURL — getTrimmedCanvas() crashes on mobile (react-signature-canvas trim-canvas ESM bug)
      dataUrl = padRef.current.toDataURL("image/png");
    }
    setSubmitting(true);
    try {
      await publicPost(`/public/hr-letters/sign/${token}`, {
        signature_data_url: dataUrl,
        signer_name: name,
      });
      setDone(true);
    } catch (e) {
      toast.error(formatApiError(e.message || e));
      setErr(e.message || "Failed to submit signature.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Loader2 size={28} className="animate-spin text-[#F97316]" />
      </div>
    );
  }

  if (err && !meta) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-6" data-testid="hrl-sign-error">
        <div className="max-w-sm rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle size={28} className="mx-auto text-rose-500" />
          <h1 className="mt-3 font-display text-lg font-bold text-[#0F2042]">Link unavailable</h1>
          <p className="mt-1 text-sm text-slate-600">{err}</p>
          <p className="mt-3 text-[11px] text-slate-400">Please ask HR to send you a fresh QR code (links expire after 15 minutes).</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center bg-gradient-to-br from-white via-orange-50/50 to-emerald-50/40 p-6" data-testid="hrl-sign-done">
        <div className="max-w-sm rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-xl">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <h1 className="mt-3 font-display text-xl font-bold text-[#0F2042]">Signature submitted</h1>
          <p className="mt-1 text-sm text-slate-600">Thank you{name ? `, ${name.split(" ")[0]}` : ""}. Your signature will appear on the letter automatically — you can close this tab.</p>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// PROJEXINO</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-orange-50/40 to-violet-50/30 p-4" data-testid="hrl-sign-page">
      <div className="mx-auto max-w-md">
        <div className="text-center">
          <div className="text-[10px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// projexino · secure signing</div>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#0F2042]">Sign your document</h1>
          <p className="mt-1 text-sm text-slate-600">{meta?.letter_title || "HR Letter"}</p>
        </div>

        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="hrl-sign-name"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" placeholder="e.g. Anita Sharma" />
          </label>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {uploadedUrl ? "Uploaded signature" : "Draw signature below"}
              </span>
              {!uploadedUrl && (
                <>
                  <button type="button" onClick={() => fileRef.current?.click()} data-testid="hrl-sign-upload"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600 hover:border-[#F97316] hover:text-[#F97316]">
                    <Upload size={11}/> Upload photo
                  </button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFilePick} className="hidden" data-testid="hrl-sign-file"/>
                </>
              )}
            </div>

            {uploadedUrl ? (
              <div className="mt-1 rounded-2xl border-2 border-dashed border-emerald-400 bg-emerald-50/40 p-3" data-testid="hrl-sign-uploaded">
                <img src={uploadedUrl} alt="Uploaded signature" className="mx-auto max-h-40 rounded"/>
                <div className="mt-2 flex justify-between text-[11px]">
                  <button onClick={() => setUploadedUrl("")} data-testid="hrl-sign-remove-upload"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 font-bold text-slate-600">
                    <XIcon size={11}/> Remove & draw instead
                  </button>
                  <span className="self-center text-slate-400">Signed image ready</span>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-1 overflow-hidden rounded-2xl border-2 border-dashed border-[#F97316] bg-white">
                  <SignatureCanvas
                    ref={padRef}
                    penColor="#0F2042"
                    canvasProps={{ className: "w-full h-48 touch-none", "data-testid": "hrl-sign-pad" }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-[11px]">
                  <button onClick={clear} data-testid="hrl-sign-clear"
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 font-bold text-slate-600">
                    <RefreshCw size={11} /> Clear
                  </button>
                  <span className="text-slate-400">Use your finger, stylus, or Upload a photo</span>
                </div>
              </>
            )}
          </div>

          <button onClick={submit} disabled={submitting} data-testid="hrl-sign-submit"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#FB923C] px-4 py-3 text-sm font-bold uppercase tracking-wider text-white shadow disabled:opacity-60">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />}
            {submitting ? "Submitting…" : "Submit signature"}
          </button>
          <p className="mt-3 text-center text-[10px] text-slate-400">
            By submitting you agree that this drawing is your legally binding signature under the Information Technology Act, 2000.
          </p>
        </div>
      </div>
    </div>
  );
}
