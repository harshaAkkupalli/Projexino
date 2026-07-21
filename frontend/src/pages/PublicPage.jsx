/**
 * PublicPage.jsx — renders pages created in the Website Experience Manager.
 * Lives at /page/:slug. Pulls from GET /api/public/wxm/pages/:slug.
 */
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, Loader2, ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";

export default function PublicPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/public/wxm/pages/${slug}`);
        setPage(data);
        // SEO — set <title> and <meta description>
        if (data?.title) document.title = `${data.title} · Projexino`;
        const metaDesc = document.querySelector("meta[name=description]") || (() => {
          const m = document.createElement("meta");
          m.name = "description";
          document.head.appendChild(m);
          return m;
        })();
        metaDesc.setAttribute("content", data?.meta_description || "");
      } catch (e) {
        setError(e?.response?.status === 404 ? "404" : (e?.response?.data?.detail || "Couldn't load this page"));
      }
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }
  if (error === "404") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-950 via-[#0F2042] to-slate-900 text-white p-6 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.32em] text-[#F97316]">// 404</div>
        <h1 className="mt-3 font-display text-5xl font-bold">Page not found</h1>
        <p className="mt-3 max-w-md text-slate-300">This page might be unpublished or moved.</p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#A855F7] px-6 py-2.5 text-sm font-bold text-white shadow-lg">
          <ArrowLeft size={14}/> Back home
        </Link>
      </div>
    );
  }
  if (error) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-rose-300 p-6">{error}</div>;
  }
  if (!page) return null;

  // Theme tokens — fall back to Projexino orange/indigo if no theme
  const theme = page.theme || {};
  const primary = theme.primary_color || "#F97316";
  const accent = theme.accent_color || "#A855F7";
  const bg = theme.background_color || "#0F2042";
  const radius = theme.radius || "1rem";

  return (
    <main className="min-h-screen bg-white text-slate-900" style={{ "--brand": primary, "--accent": accent }}>
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(140deg, ${bg} 0%, #0a1530 80%)` }}>
        <div className="absolute inset-0 opacity-30" style={{ background: `radial-gradient(60% 50% at 80% 10%, ${primary}55, transparent 70%), radial-gradient(50% 60% at 10% 90%, ${accent}55, transparent 70%)` }}/>
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32 text-white">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.28em] text-white/70 hover:text-white">
            <ArrowLeft size={12}/> Projexino
          </Link>
          {page.hero_eyebrow && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] backdrop-blur"
              style={{ color: primary }}>
              {page.hero_eyebrow}
            </motion.div>
          )}
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 0.05 }}
            className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            {page.hero_headline}
          </motion.h1>
          {page.hero_subhead && (
            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-2xl text-lg text-slate-200 leading-relaxed">
              {page.hero_subhead}
            </motion.p>
          )}
          {page.cta_label && (
            <motion.a initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.2 }}
              href={page.cta_url || "/contact"}
              className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3 text-sm font-bold text-white shadow-xl transition hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)`, borderRadius: radius }}>
              {page.cta_label} <ChevronRight size={14}/>
            </motion.a>
          )}
          {page.hero_image_url && (
            <img src={page.hero_image_url} alt="" className="mt-12 w-full max-w-4xl rounded-2xl shadow-2xl"/>
          )}
        </div>
      </section>

      {/* Sections */}
      <div className="mx-auto max-w-5xl px-6 py-16 sm:py-24 space-y-20">
        {(page.sections || []).map((s, i) => <Section key={i} section={s} primary={primary} accent={accent}/>)}
      </div>

      {/* Final CTA */}
      {page.cta_label && (
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <h3 className="font-display text-3xl font-bold text-[#0F2042] sm:text-4xl">Ready when you are.</h3>
            <p className="mt-3 text-slate-600">{page.hero_subhead || `Talk to the team behind ${page.title}.`}</p>
            <a href={page.cta_url || "/contact"}
              className="mt-7 inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-bold text-white shadow-lg transition hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${primary} 0%, ${accent} 100%)` }}>
              {page.cta_label} <ChevronRight size={14}/>
            </a>
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-[11px] text-slate-500">
        © {new Date().getFullYear()} Projexino · <Link to="/" className="hover:text-[#F97316]">Home</Link> · <Link to="/contact" className="hover:text-[#F97316]">Contact</Link>
      </footer>
    </main>
  );
}

function Section({ section, primary, accent }) {
  const { type, heading, body, items, steps } = section || {};
  if (type === "intro" || type === "proof") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }}>
        {heading && <h2 className="font-display text-3xl font-bold text-[#0F2042] sm:text-4xl">{heading}</h2>}
        {body && <p className="mt-4 text-lg leading-relaxed text-slate-700 max-w-3xl">{body}</p>}
      </motion.div>
    );
  }
  if (type === "features") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }}>
        {heading && <h2 className="font-display text-3xl font-bold text-[#0F2042] sm:text-4xl">{heading}</h2>}
        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {(items || []).map((it, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-[var(--brand,#F97316)] hover:shadow-md">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white font-bold"
                style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>{i + 1}</div>
              <h3 className="mt-4 font-display text-lg font-bold text-[#0F2042]">{it.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{it.description}</p>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }
  if (type === "process") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }}>
        {heading && <h2 className="font-display text-3xl font-bold text-[#0F2042] sm:text-4xl">{heading}</h2>}
        <ol className="mt-8 grid gap-6 sm:grid-cols-3">
          {(steps || []).map((st, i) => (
            <li key={i} className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-orange-50 to-violet-50 p-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: primary }}>Step {i + 1}</div>
              <h3 className="mt-2 font-display text-lg font-bold text-[#0F2042]">{st.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{st.description}</p>
            </li>
          ))}
        </ol>
      </motion.div>
    );
  }
  if (type === "faq") {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5 }}>
        {heading && <h2 className="font-display text-3xl font-bold text-[#0F2042] sm:text-4xl">{heading}</h2>}
        <div className="mt-6 space-y-2">
          {(items || []).map((q, i) => (
            <details key={i} className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[var(--brand,#F97316)]">
              <summary className="flex cursor-pointer items-center justify-between font-display text-base font-semibold text-[#0F2042]">
                {q.q} <ChevronRight size={16} className="transition group-open:rotate-90" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{q.a}</p>
            </details>
          ))}
        </div>
      </motion.div>
    );
  }
  // Fallback for any custom rich-text section
  return (
    <div>
      {heading && <h2 className="font-display text-2xl font-bold text-[#0F2042]">{heading}</h2>}
      {body && <div className="prose prose-slate mt-4 max-w-none" dangerouslySetInnerHTML={{ __html: body }}/>}
    </div>
  );
}
