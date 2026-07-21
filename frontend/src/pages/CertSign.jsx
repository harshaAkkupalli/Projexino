/** Public mobile-friendly certificate signing page — reached by scanning the QR. */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";
import { PenTool, Eraser, Upload, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import { toast, Toaster } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function CertSign() {
  const { token } = useParams();
  const padRef = useRef(null);
  const fileRef = useRef(null);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/cert-sign/${token}`)
      .then(({ data }) => setInfo(data))
      .catch((e) => setError(e?.response?.data?.detail || "Invalid or expired sign link"));
  }, [token]);

  const onUpload = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast.error("Image must be under 3 MB"); return; }
    const r = new FileReader();
    r.onload = () => setUploadedUrl(r.result);
    r.readAsDataURL(f);
  };

  const save = async () => {
    let dataUrl = uploadedUrl;
    if (!dataUrl) {
      if (!padRef.current || padRef.current.isEmpty()) { toast.error("Draw or upload a signature first"); return; }
      dataUrl = padRef.current.getCanvas().toDataURL("image/png");
    }
    setBusy(true);
    try {
      await axios.post(`${API}/public/cert-sign/${token}`, { signature_data_url: dataUrl });
      setDone(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Signing failed"); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#0F2042] px-4 py-8" data-testid="cert-sign-page">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-md">
        <img src="/projexino-logo.png" alt="Projexino" className="mx-auto h-12 rounded-lg bg-white p-1.5 object-contain" />
        <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-2xl">
          {error ? (
            <div className="p-8 text-center text-sm font-semibold text-rose-600" data-testid="cert-sign-error">{error}</div>
          ) : !info ? (
            <div className="flex justify-center p-10"><Loader2 size={26} className="animate-spin text-slate-300" /></div>
          ) : done ? (
            <div className="p-8 text-center" data-testid="cert-sign-done">
              <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
              <div className="mt-3 font-display text-xl font-bold text-[#0F2042]">Signature applied!</div>
              <p className="mt-1 text-sm text-slate-500">The certificate for <b>{info.recipient_name}</b> is now digitally signed. You can close this page.</p>
            </div>
          ) : (
            <>
              <header className="bg-gradient-to-r from-[#F97316] to-[#FBBF24] px-5 py-4 text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Digital signature</div>
                <div className="font-display text-lg font-bold">{info.recipient_name}'s {info.cert_type} certificate</div>
                {info.signed && <div className="mt-1 text-[11px] font-semibold text-white/90">Already signed — signing again replaces the signature.</div>}
              </header>
              <div className="space-y-3 p-5">
                {uploadedUrl ? (
                  <div className="rounded-xl border border-slate-200 p-3 text-center">
                    <img src={uploadedUrl} alt="signature" className="mx-auto max-h-28 object-contain" />
                    <button onClick={() => setUploadedUrl("")} className="mt-2 text-[11px] font-bold text-rose-500 underline">Remove & draw instead</button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
                    <SignatureCanvas ref={padRef} penColor="#0F2042"
                      canvasProps={{ className: "w-full h-52 touch-none", "data-testid": "cert-sign-pad" }} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {!uploadedUrl && (
                    <button onClick={() => padRef.current?.clear()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                      <Eraser size={11} /> Clear
                    </button>
                  )}
                  <button onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600">
                    <Upload size={11} /> Upload image
                  </button>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onUpload} />
                </div>
                <button onClick={save} disabled={busy} data-testid="cert-sign-save"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0F2042] py-3 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />} Apply signature
                </button>
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/50">Projexino Solutions Pvt Ltd · secure signing link</p>
      </div>
    </div>
  );
}
