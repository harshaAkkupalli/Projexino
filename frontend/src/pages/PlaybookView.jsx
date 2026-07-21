/** Public premium playbook reading page — /playbook/{slug} (self-host safe, relative API). */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, Loader2, BookOpen } from "lucide-react";
import axios from "axios";
import { saveOrShareBlob } from "@/lib/download";
import { toast, Toaster } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PlaybookView() {
  const { slug } = useParams();
  const [pb, setPb] = useState(null);
  const [error, setError] = useState("");
  const [dl, setDl] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/playbooks/${slug}`)
      .then(({ data }) => { setPb(data); document.title = `${data.title} — Projexino Playbook`; })
      .catch((e) => setError(e?.response?.data?.detail || "Playbook not found"));
  }, [slug]);

  const download = async () => {
    setDl(true);
    try {
      const res = await axios.get(`${API}/public/playbooks/${slug}/pdf`, { responseType: "blob" });
      await saveOrShareBlob(new Blob([res.data], { type: "application/pdf" }), `${slug}-playbook.pdf`);
    } catch { toast.error("Could not download the PDF"); }
    setDl(false);
  };

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F2042] text-white">
      <div className="text-center"><BookOpen size={40} className="mx-auto mb-3 opacity-40" /><div className="font-display text-xl font-bold">{error}</div></div>
    </div>
  );
  if (!pb) return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F2042]"><Loader2 size={30} className="animate-spin text-white/40" /></div>
  );

  const t = pb.theme_def || {};

  return (
    <div className="min-h-screen" style={{ background: t.bg }} data-testid="playbook-public-page">
      <Toaster position="top-center" richColors />
      {/* HERO / COVER */}
      <header className="relative overflow-hidden px-6 pb-16 pt-14 sm:px-10 lg:px-24">
        <div className="absolute left-0 right-0 top-0 h-2" style={{ background: t.accent }} />
        <div className="absolute -right-16 top-24 h-64 w-64 rounded-full border-2 opacity-25" style={{ borderColor: t.accent }} />
        <div className="absolute -right-8 top-32 h-48 w-48 rounded-full border opacity-25" style={{ borderColor: t.accent }} />
        <div className="mx-auto max-w-3xl">
          <div className="w-fit rounded-lg bg-white/95 px-2.5 py-1.5"><img src="/projexino-logo.png" alt="Projexino" className="h-8 object-contain" /></div>
          <div className="mt-10 text-xs font-bold uppercase tracking-[0.3em]" style={{ color: t.accent }} data-testid="pb-public-category">
            {pb.category || "Playbook"}
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl" style={{ color: t.text }} data-testid="pb-public-title">
            {pb.title}
          </h1>
          {pb.subtitle && <p className="mt-4 max-w-xl text-base md:text-lg" style={{ color: t.muted }}>{pb.subtitle}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="text-sm font-bold" style={{ color: t.text }}>{pb.author || "Projexino Solutions"}</div>
            <div className="h-4 w-px" style={{ background: t.muted }} />
            <div className="text-sm" style={{ color: t.muted }}>{(pb.sections || []).length} sections</div>
          </div>
          <button onClick={download} disabled={dl} data-testid="pb-public-download"
            className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white shadow-xl transition hover:scale-[1.02] disabled:opacity-60"
            style={{ background: t.accent }}>
            {dl ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download PDF
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <main className="rounded-t-[2.5rem] bg-white px-6 py-14 sm:px-10 lg:px-24">
        <div className="mx-auto max-w-3xl space-y-14">
          {(pb.sections || []).map((s, i) => (
            <section key={i} data-testid={`pb-public-section-${i}`}>
              <div className="text-[11px] font-bold uppercase tracking-[0.28em]" style={{ color: t.accent }}>
                Section {String(i + 1).padStart(2, "0")}
              </div>
              {s.heading && <h2 className="mt-2 font-display text-base font-bold text-[#0F2042] md:text-lg">{s.heading}</h2>}
              <div className="mt-1 h-1 w-12" style={{ background: t.accent }} />
              <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-slate-700">
                {(s.body || "").split(/\n\n+/).filter(Boolean).map((para, j) => {
                  const lines = para.split("\n").filter((l) => l.trim());
                  const isList = lines.every((l) => /^[-•*]/.test(l.trim()));
                  return isList ? (
                    <ul key={j} className="space-y-1.5 pl-1">
                      {lines.map((l, k) => (
                        <li key={k} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.accent }} />{l.replace(/^[-•*]\s*/, "")}</li>
                      ))}
                    </ul>
                  ) : (
                    <p key={j}>{para}</p>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer className="mx-auto mt-20 max-w-3xl border-t border-slate-100 pt-8 text-center">
          <img src="/projexino-logo.png" alt="" className="mx-auto h-8 object-contain" />
          <p className="mt-2 text-xs text-slate-400">© {new Date().getFullYear()} Projexino Solutions Pvt Ltd · projexino.com</p>
        </footer>
      </main>
    </div>
  );
}
