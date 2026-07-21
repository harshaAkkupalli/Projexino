/** Public doc-sign page — reached by scanning the QR in HR → Sign Docs. */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PenTool, CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import { toast, Toaster } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DocSign() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/doc-sign/${token}`)
      .then(({ data }) => { setInfo(data); setName(data.user_name || ""); })
      .catch((e) => setError(e?.response?.data?.detail || "Invalid or expired sign link"));
  }, [token]);

  const sign = async () => {
    if (name.trim().length < 2) { toast.error("Type your full name to sign"); return; }
    setBusy(true);
    try {
      await axios.post(`${API}/public/doc-sign/${token}`, { signed_name: name.trim() });
      setDone(true);
    } catch (e) { toast.error(e?.response?.data?.detail || "Signing failed"); }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-[#0F2042] px-4 py-8" data-testid="doc-sign-page">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-md">
        <img src="/projexino-logo.png" alt="Projexino" className="mx-auto h-12 rounded-lg bg-white p-1.5 object-contain" />
        <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-2xl">
          {error ? (
            <div className="p-8 text-center text-sm font-semibold text-rose-600" data-testid="doc-sign-error">{error}</div>
          ) : !info ? (
            <div className="flex justify-center p-10"><Loader2 size={26} className="animate-spin text-slate-300" /></div>
          ) : done || info.already_signed ? (
            <div className="p-8 text-center" data-testid="doc-sign-done">
              <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
              <div className="mt-3 font-display text-xl font-bold text-[#0F2042]">{done ? "Signed!" : "Already signed"}</div>
              <p className="mt-1 text-sm text-slate-500"><b>{info.doc_name}</b> is signed by {info.user_name}. You can close this page.</p>
            </div>
          ) : (
            <>
              <header className="bg-gradient-to-r from-[#F97316] to-[#FBBF24] px-5 py-4 text-white">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/80">Document to sign</div>
                <div className="font-display text-lg font-bold">{info.doc_name}</div>
                <div className="text-[11px] text-white/90">Signing as {info.user_name}</div>
              </header>
              <div className="space-y-3 p-5">
                {info.body_html && (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700"
                    dangerouslySetInnerHTML={{ __html: info.body_html }} />
                )}
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Type your full name to sign</span>
                  <input data-testid="doc-sign-name" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 font-display text-lg italic outline-none focus:border-[#F97316]" />
                </label>
                <button onClick={sign} disabled={busy} data-testid="doc-sign-save"
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#0F2042] py-3 text-sm font-bold text-white disabled:opacity-60">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />} Sign document
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
