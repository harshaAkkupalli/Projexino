import { motion, useMotionTemplate } from "framer-motion";
import { ArrowUpRight, Sparkles, Zap, Rocket } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ServiceArt from "@/components/ServiceArt";
import Infographic from "@/components/Infographic";
import SEO from "@/components/SEO";
import useTilt from "@/hooks/useTilt";
import { SERVICES } from "@/data/services";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06 } }),
};

export default function Services() {
  return (
    <div data-testid="page-services" className="relative min-h-screen overflow-hidden bg-canvas-cool text-[#0F172A]">
      <SEO
        title="Software Development Services — App, AI, SaaS & Mobile | Projexino"
        description="Eight battle-tested practice areas from Projexino: AI development, mobile app development, cross-platform apps, SaaS engineering, iOS & Android, ChatGPT solutions and ongoing app maintenance."
        canonical="/services"
        keywords={[
          "app development services", "software development services",
          "mobile app development services", "saas development services",
          "ai development services", "ios android app development services",
          "cross platform development", "chatgpt integration services",
          "app maintenance and support",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "Service",
          "serviceType": "Software Development",
          "provider": { "@type": "Organization", "name": "Projexino", "url": "https://www.projexino.com" },
          "areaServed": ["IN","US","GB","AE","SG","AU"],
          "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Projexino Services",
            "itemListElement": SERVICES.map((s, i) => ({
              "@type": "Offer",
              "position": i + 1,
              "itemOffered": { "@type": "Service", "name": s.title, "url": `https://www.projexino.com/services/${s.slug}` },
            })),
          },
        }}
      />
      <Navbar />

      {/* HERO */}
      <section className="relative pt-32 pb-12">
        <div className="absolute inset-0 bg-grid-light opacity-60 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        {/* Floating orb decorations */}
        <motion.div
          className="absolute -left-20 top-32 h-72 w-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, #F97316, transparent 70%)" }}
          animate={{ y: [0, 20, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -right-20 top-48 h-80 w-80 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #A855F7, transparent 70%)" }}
          animate={{ y: [0, -25, 0], scale: [1, 0.95, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="relative mx-auto max-w-7xl px-6">
          <span className="tag-chip">// services</span>
          <motion.h1
            initial="hidden" animate="show" variants={fadeUp}
            className="font-display mt-6 max-w-4xl text-5xl font-light leading-[1.05] text-[#0F2042] md:text-7xl"
          >
            Engineered <span className="text-[#F97316]">end-to-end</span> for outcomes that ship.
          </motion.h1>
          <motion.p initial="hidden" animate="show" variants={fadeUp} custom={1} className="mt-6 max-w-2xl text-slate-600">
            Eight integrated practices, one delivery cadence — from AI-first prototypes through to
            production SaaS, mobile apps and 24/7 maintenance. Every engagement starts with a
            measurable outcome and a tight timeline.
          </motion.p>
          <motion.div
            initial="hidden" animate="show" variants={fadeUp} custom={2}
            className="mt-8 flex flex-wrap items-center gap-3 text-xs">
            {[
              { icon: Sparkles, label: "AI-first toolchain" },
              { icon: Zap, label: "2-week ship cycles" },
              { icon: Rocket, label: "Production from day one" },
            ].map(({ icon: I, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-white/70 px-3 py-1.5 backdrop-blur">
                <I size={12} className="text-[#F97316]" /> <span className="font-semibold text-slate-700">{label}</span>
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* SERVICE CARDS — 3D animated */}
      <section className="relative py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s, i) => (
              <ServiceCard3D key={s.slug} svc={s} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CROSS-PLATFORM SECTION */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, rotateY: -8 }}
              whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, type: "spring", stiffness: 80 }}
              style={{ transformStyle: "preserve-3d", perspective: 1200 }}
              className="card-soft p-6">
              <Infographic variant="cross" className="h-[400px] w-full" />
            </motion.div>
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <span className="tag-chip">// build once · run anywhere</span>
              <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                One codebase. Every screen.
              </h2>
              <p className="mt-4 max-w-md text-slate-600">
                We ship products that look native on iOS, Android, web and desktop — built on a
                single, maintainable foundation that grows with your roadmap.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { v: "1×", l: "Codebase" },
                  { v: "4×", l: "Surfaces" },
                  { v: "60%", l: "Faster ship" },
                ].map((m) => (
                  <div key={m.l} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <div className="font-display text-2xl font-semibold text-[#F97316]">{m.v}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{m.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SAAS SECTION */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <span className="tag-chip">// saas-ready infrastructure</span>
              <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                Cloud-native, multi-tenant by default.
              </h2>
              <p className="mt-4 max-w-md text-slate-600">
                We design subscription architecture, billing, RBAC and observability into your
                platform from day one — so scale never becomes a rewrite.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                {[
                  { v: "RBAC", l: "Role-aware" },
                  { v: "99.9%", l: "Uptime SLO" },
                  { v: "T+1", l: "New tenant" },
                ].map((m) => (
                  <div key={m.l} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                    <div className="font-display text-xl font-semibold text-[#A855F7]">{m.v}</div>
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{m.l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.92, rotateY: 8 }}
              whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, type: "spring", stiffness: 80 }}
              style={{ transformStyle: "preserve-3d", perspective: 1200 }}
              className="card-soft p-6">
              <Infographic variant="saas" className="h-[400px] w-full" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl border border-orange-200 bg-gradient-to-br from-white via-orange-50/60 to-purple-50/40 p-12 shadow-[0_30px_60px_-30px_rgba(249,115,22,0.35)]">
            <h2 className="font-display text-4xl font-light leading-tight text-[#0F2042] md:text-6xl">
              Have a project in mind?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">
              Free consultation, transparent timelines, and a team that ships.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <a href="https://contact.projexino.com/" target="_blank" rel="noreferrer" className="btn-primary" data-testid="services-cta">
                Start Your Project <ArrowUpRight size={18} />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/** 3D-tilt service card with mouse-tracking glare and ServiceArt 3D illustration. */
function ServiceCard3D({ svc, index }) {
  const tilt = useTilt({ max: 10 });
  const glare = useMotionTemplate`radial-gradient(450px circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.6), transparent 50%)`;
  const Icon = svc.icon;

  return (
    <Link to={`/services/${svc.slug}`} className="block [perspective:1300px]" data-testid={`service-card-${index}`}>
      <motion.article
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        initial={{ opacity: 0, y: 30, rotateX: -12 }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ delay: index * 0.06, duration: 0.7, type: "spring", stiffness: 110, damping: 18 }}
        style={{ rotateX: tilt.rotateX, rotateY: tilt.rotateY, transformStyle: "preserve-3d" }}
        whileHover={{ y: -10 }}
        className="group relative h-full overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-[0_20px_50px_-25px_rgba(15,32,66,0.35)] transition-shadow hover:shadow-[0_30px_60px_-25px_rgba(249,115,22,0.4)]"
      >
        {/* Glare overlay */}
        <motion.div className="pointer-events-none absolute inset-0 z-10 rounded-3xl mix-blend-overlay" style={{ background: glare }} />
        {/* Accent halo on hover */}
        <div className="absolute inset-0 rounded-3xl opacity-0 transition group-hover:opacity-100"
          style={{ background: `radial-gradient(70% 60% at 50% 0%, ${svc.accent}30, transparent 60%)` }} />

        {/* ART HEADER */}
        <div className="relative h-44 w-full overflow-hidden bg-gradient-to-br from-orange-50/60 via-white to-purple-50/40"
          style={{ transform: "translateZ(20px)" }}>
          <motion.div className="absolute inset-0" style={{ transform: "translateZ(40px)" }}>
            <ServiceArt variant={svc.slug} className="h-full w-full" />
          </motion.div>
          <motion.div
            style={{ transform: "translateZ(60px)", background: svc.accent, boxShadow: `0 10px 30px -8px ${svc.accent}aa` }}
            className="absolute left-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl text-white"
            animate={{ rotate: [0, 4, -4, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
            <Icon size={18} />
          </motion.div>
        </div>

        {/* BODY */}
        <div className="relative p-6" style={{ transform: "translateZ(20px)" }}>
          <h3 className="font-display text-xl font-semibold leading-tight text-[#0F2042]" style={{ transform: "translateZ(30px)" }}>
            {svc.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{svc.summary}</p>
          <ul className="mt-4 space-y-1.5">
            {svc.capabilities.slice(0, 4).map((c) => (
              <li key={c} className="flex items-start gap-2 text-xs text-slate-700">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: svc.accent }} />
                {c}
              </li>
            ))}
          </ul>
          <motion.div
            style={{ transform: "translateZ(50px)", color: svc.accent }}
            className="mt-5 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.2em] transition group-hover:gap-2">
            Learn more <ArrowUpRight size={12} />
          </motion.div>
        </div>
      </motion.article>
    </Link>
  );
}
