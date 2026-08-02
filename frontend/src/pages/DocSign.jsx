/** Public doc-sign page — reached by scanning the QR in HR → Documents to sign.
 * Full document preview + draw/type signature + drag-drop placement. */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import axios from "axios";
import { Toaster } from "sonner";
import { DocSignStudio } from "@/components/DocSignStudio";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function DocSign() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/doc-sign/${token}`)
      .then(({ data }) => setInfo(data))
      .catch((e) => setError(e?.response?.data?.detail || "Invalid or expired sign link"));
  }, [token]);

  return (
    <div className="min-h-screen bg-[#0F2042] px-4 py-8" data-testid="doc-sign-page">
      <Toaster position="top-center" richColors />
      <div className="mx-auto max-w-2xl">
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
              <div className="p-4">
                <DocSignStudio
                  fetchPdf={async () => (await axios.get(`${API}/public/doc-sign/${token}/pdf`, { responseType: "arraybuffer" })).data}
                  signatures={[]}
                  signed={false}
                  defaultName={info.user_name || ""}
                  onSign={async (p) => { await axios.post(`${API}/public/doc-sign/${token}`, p); setDone(true); }}
                />
              </div>
            </>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-white/50">Projexino Solutions Pvt Ltd · secure signing link</p>
      </div>
    </div>
  );
}
