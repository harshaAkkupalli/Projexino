import { useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  Code2,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ServiceArt from "@/components/ServiceArt";
import SEO from "@/components/SEO";
import useTilt from "@/hooks/useTilt";
import { SERVICES, getServiceBySlug } from "@/data/services";

const TINT_TO_CLASS = {
  warm: "bg-canvas-warm",
  cool: "bg-canvas-cool",
  violet: "bg-canvas-violet",
  sky: "bg-canvas-sky",
  mint: "bg-canvas-mint",
  rose: "bg-canvas-rose",
  amber: "bg-canvas-amber",
  slate: "bg-canvas-slate",
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.55, delay: i * 0.06 } }),
};

export default function ServiceDetail() {
  const { slug } = useParams();
  const svc = getServiceBySlug(slug);
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroParallax = useTransform(scrollYProgress, [0, 1], [0, 100]);
  const heroFade = useTransform(scrollYProgress, [0, 1], [1, 0.3]);
  const artTilt = useTilt({ max: 6 });

  useEffect(() => {
    if (!svc) return;
  }, [svc]);

  if (!svc) return <Navigate to="/services" replace />;

  const tint = TINT_TO_CLASS[svc.tint] || "bg-canvas-warm";
  const Icon = svc.icon;
  const serviceUrl = `https://www.projexino.com/services/${svc.slug}`;
  const seoJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "name": svc.title,
      "serviceType": svc.title,
      "description": svc.seo.description,
      "url": serviceUrl,
      "provider": { "@type": "Organization", "name": "Projexino", "url": "https://www.projexino.com" },
      "areaServed": ["IN","US","GB","AE","SG","AU"],
      "offers": { "@type": "Offer", "url": serviceUrl, "priceCurrency": "USD" },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.projexino.com/" },
        { "@type": "ListItem", "position": 2, "name": "Services", "item": "https://www.projexino.com/services" },
        { "@type": "ListItem", "position": 3, "name": svc.title, "item": serviceUrl },
      ],
    },
  ];

  return (
    <div
      data-testid={`service-detail-${svc.slug}`}
      className={`relative min-h-screen overflow-hidden text-[#0F172A] ${tint}`}
    >
      <SEO
        title={svc.seo.title}
        description={svc.seo.description}
        canonical={`/services/${svc.slug}`}
        keywords={[svc.title.toLowerCase(), `${svc.title.toLowerCase()} services`, `${svc.title.toLowerCase()} company`, "projexino"]}
        jsonLd={seoJsonLd}
      />
      <Navbar />

      {/* Breadcrumbs */}
      <div className="relative mx-auto max-w-7xl px-6 pt-28">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <Link to="/" className="hover:text-[#0F2042]">Home</Link>
          <ChevronRight size={12} />
          <Link to="/services" className="hover:text-[#0F2042]">Services</Link>
          <ChevronRight size={12} />
          <span className="text-[#0F2042] font-semibold">{svc.title}</span>
        </div>
      </div>

      {/* HERO with 3D animated ServiceArt */}
      <section ref={heroRef} className="relative pt-10 pb-16">
        {/* Floating orbs */}
        <motion.div
          className="absolute -left-32 top-20 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: `radial-gradient(circle, ${svc.accent}, transparent 70%)` }}
          animate={{ y: [0, 30, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-24 top-44 h-72 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #0F2042, transparent 70%)" }}
          animate={{ y: [0, -30, 0], scale: [1, 0.95, 1] }}
          transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div style={{ y: heroParallax, opacity: heroFade }}
          className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
          <motion.div initial="hidden" animate="show" variants={fadeUp}>
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em]"
              style={{
                background: `${svc.accent}1a`,
                color: svc.accent,
                border: `1px solid ${svc.accent}44`,
              }}
            >
              <Icon size={14} /> Service
            </div>
            <h1 className="font-display mt-6 text-5xl font-light leading-[1.05] text-[#0F2042] md:text-6xl">
              {svc.title}.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-700 md:text-lg">
              {svc.summary}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="https://contact.projexino.com/" target="_blank" rel="noreferrer" className="btn-primary">
                Start this engagement <ArrowUpRight size={18} />
              </a>
              <Link to="/contact" className="btn-ghost">
                Talk to an engineer
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-2">
              {(svc.points || svc.capabilities || []).slice(0, 3).map((p) => (
                <span key={p}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-white/70 px-3 py-1 text-[11px] font-semibold backdrop-blur"
                  style={{ borderColor: `${svc.accent}55`, color: svc.accent }}>
                  <CheckCircle2 size={11} /> {p}
                </span>
              ))}
            </div>
          </motion.div>

          {/* 3D Animated Service Art (replaces stock image) */}
          <div className="relative [perspective:1400px]">
            <motion.div
              ref={artTilt.ref}
              onMouseMove={artTilt.onMouseMove}
              onMouseLeave={artTilt.onMouseLeave}
              initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 80 }}
              style={{
                rotateX: artTilt.rotateX,
                rotateY: artTilt.rotateY,
                transformStyle: "preserve-3d",
              }}
              className="relative rounded-3xl border border-white/60 bg-gradient-to-br from-white via-orange-50/50 to-purple-50/40 p-4 shadow-[0_40px_80px_-30px_rgba(15,32,66,0.4)]"
            >
              <div
                className="absolute -inset-px rounded-3xl opacity-60"
                style={{
                  background: `linear-gradient(135deg, ${svc.accent}30 0%, transparent 50%, #0F204220 100%)`,
                }}
              />
              <div className="relative overflow-hidden rounded-2xl bg-white/40 p-6 backdrop-blur"
                style={{ transform: "translateZ(40px)" }}>
                <ServiceArt variant={svc.slug} className="h-80 w-full md:h-96" />
              </div>
              <motion.div
                style={{ transform: "translateZ(80px)", color: svc.accent }}
                className="absolute right-6 top-6 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-lg backdrop-blur"
              >
                <Sparkles size={12} /> Engineered by Projexino
              </motion.div>
              {/* Decorative floating tags */}
              <motion.div
                style={{ transform: "translateZ(60px)" }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-3 bottom-12 hidden rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#F97316] shadow-lg sm:block"
              >
                ✦ premium tier
              </motion.div>
              <motion.div
                style={{ transform: "translateZ(60px)" }}
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -right-3 top-1/3 hidden rounded-xl border border-purple-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-purple-600 shadow-lg sm:block"
              >
                ★ live deploys
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* Intro */}
      <section className="relative py-14">
        <div className="mx-auto max-w-4xl px-6">
          <span className="tag-chip">// what we do here</span>
          <div className="mt-5 space-y-5 text-lg leading-relaxed text-slate-700">
            {svc.intro.map((p, i) => (
              <motion.p
                key={i}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, amount: 0.4 }}
                variants={fadeUp}
                custom={i}
              >
                {p}
              </motion.p>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities + Efficiency */}
      <section className="relative py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card-soft p-8 lg:col-span-3">
              <span className="tag-chip">// capabilities</span>
              <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
                What's inside this practice.
              </h2>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {svc.capabilities.map((c, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start gap-2 text-sm text-slate-700"
                  >
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: svc.accent }} />
                    {c}
                  </motion.li>
                ))}
              </ul>
            </div>

            <div className="card-soft p-8 lg:col-span-2">
              <span className="tag-chip">// efficiency</span>
              <h3 className="font-display mt-4 text-2xl font-medium text-[#0F2042]">
                How we measure efficiency.
              </h3>
              <div className="mt-6 grid grid-cols-2 gap-4">
                {svc.efficiency.map((e, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="font-display text-2xl font-semibold" style={{ color: svc.accent }}>
                      {e.v}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {e.l}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech stack */}
      <section className="relative py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-3">
            <Code2 size={18} style={{ color: svc.accent }} />
            <span className="tag-chip">// tech stack</span>
          </div>
          <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
            The stack we ship with.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {svc.tech.map((g, i) => (
              <motion.div
                key={g.group}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="card-soft p-6"
              >
                <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                  {g.group}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {g.items.map((t) => (
                    <span
                      key={t}
                      className="rounded-full border px-2.5 py-1 text-xs font-mono-pj"
                      style={{
                        borderColor: `${svc.accent}55`,
                        background: `${svc.accent}10`,
                        color: svc.accent,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Process — animated timeline */}
      <section className="relative py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex items-center gap-3">
            <Workflow size={18} style={{ color: svc.accent }} />
            <span className="tag-chip">// how we built it</span>
          </div>
          <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
            Our process — predictable, embedded, transparent.
          </h2>
          <div className="relative mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {/* Connecting line (desktop only) */}
            <motion.div
              initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
              transition={{ duration: 1.2, ease: "easeOut" }}
              style={{ background: `linear-gradient(90deg, ${svc.accent}, ${svc.accent}40)`, transformOrigin: "left" }}
              className="absolute left-[12%] right-[12%] top-3.5 hidden h-0.5 lg:block"
            />
            {svc.process.map((p, i) => (
              <motion.div
                key={p.step}
                initial={{ opacity: 0, y: 30, rotateX: -10 }}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.55, type: "spring" }}
                whileHover={{ y: -6 }}
                style={{ perspective: 1000 }}
                className="relative card-soft p-6 pt-9"
              >
                <motion.div
                  animate={{ scale: [1, 1.12, 1], boxShadow: [`0 0 0 0 ${svc.accent}80`, `0 0 0 8px ${svc.accent}00`, `0 0 0 0 ${svc.accent}80`] }}
                  transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.3 }}
                  className="absolute -top-3 left-6 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: svc.accent }}
                >
                  {i + 1}
                </motion.div>
                <div className="mt-1 font-display text-lg font-semibold text-[#0F2042]">
                  {p.step}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Deliverables */}
      <section className="relative py-14">
        <div className="mx-auto max-w-7xl px-6">
          <div className="card-soft overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-5">
              <div className="p-10 lg:col-span-3">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={18} style={{ color: svc.accent }} />
                  <span className="tag-chip">// deliverables</span>
                </div>
                <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
                  What you'll receive.
                </h2>
                <ul className="mt-7 space-y-3">
                  {svc.deliverables.map((d, i) => (
                    <motion.li
                      key={d}
                      initial={{ opacity: 0, x: -10 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.06 }}
                      className="flex items-start gap-3 text-slate-700"
                    >
                      <span
                        className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{ background: svc.accent }}
                      >
                        ✓
                      </span>
                      <span>{d}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
              <div
                className="relative hidden lg:col-span-2 lg:block"
                style={{
                  background: `linear-gradient(135deg, ${svc.accent} 0%, #0F2042 100%)`,
                }}
              >
                <div className="bg-noise absolute inset-0 opacity-60" />
                <div className="relative flex h-full flex-col justify-end p-10 text-white">
                  <div className="font-display text-3xl font-medium leading-tight">
                    Ready to start?
                  </div>
                  <p className="mt-3 text-sm text-white/80">
                    Free 30-minute consult. We'll scope your project and tell you honestly if we're the right fit.
                  </p>
                  <a
                    href="https://contact.projexino.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0F2042] transition hover:bg-orange-50"
                  >
                    Start the conversation <ArrowUpRight size={16} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative py-14">
        <div className="mx-auto max-w-4xl px-6">
          <span className="tag-chip">// frequently asked</span>
          <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
            Answers, before you ask.
          </h2>
          <div className="mt-8 space-y-3">
            {svc.faq.map((f, i) => (
              <motion.details
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="card-soft group p-6"
              >
                <summary className="cursor-pointer list-none font-display text-lg font-semibold text-[#0F2042]">
                  <div className="flex items-center justify-between">
                    <span>{f.q}</span>
                    <span className="text-[#F97316] transition-transform group-open:rotate-45">+</span>
                  </div>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{f.a}</p>
              </motion.details>
            ))}
          </div>
        </div>
      </section>

      {/* Related services with 3D art thumbnails */}
      <section className="relative py-14">
        <div className="mx-auto max-w-7xl px-6">
          <span className="tag-chip">// explore more</span>
          <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
            Related services.
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.filter((s) => s.slug !== svc.slug)
              .slice(0, 3)
              .map((s, i) => {
                const RI = s.icon;
                return (
                  <motion.div
                    key={s.slug}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ y: -6 }}>
                    <Link
                      to={`/services/${s.slug}`}
                      className="card-soft group flex h-full flex-col overflow-hidden"
                    >
                      <div className="relative h-28 overflow-hidden bg-gradient-to-br from-orange-50/60 via-white to-purple-50/40">
                        <ServiceArt variant={s.slug} className="h-full w-full" />
                        <div className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
                          style={{ background: s.accent }}>
                          <RI size={15} />
                        </div>
                      </div>
                      <div className="flex flex-1 items-center gap-3 p-5">
                        <div className="flex-1">
                          <div className="font-display text-base font-semibold text-[#0F2042]">{s.title}</div>
                          <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{s.summary}</div>
                        </div>
                        <ArrowUpRight size={18} className="shrink-0 text-slate-400 transition group-hover:text-[#F97316]" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
