import { motion, useScroll, useTransform, useMotionTemplate } from "framer-motion";
import { useRef } from "react";
import {
  ArrowUpRight, Sparkles, CheckCircle2, Award, Clock, Headphones,
  ShieldCheck, Zap, Rocket, Layers as LayersIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import XinoEstimator from "@/components/XinoEstimator";

// Self-hosted logo, resolved to an absolute URL for external crawlers (JSON-LD/OG)
const LOGO_URL = (typeof window !== "undefined" ? window.location.origin : "https://www.projexino.com") + "/projexino-logo.png";
import HeroOrbit from "@/components/HeroOrbit";
import ServiceArt from "@/components/ServiceArt";
import Infographic from "@/components/Infographic";
import SEO from "@/components/SEO";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import useTilt from "@/hooks/useTilt";
import useSiteConfig from "@/hooks/useSiteConfig";
import { SERVICES } from "@/data/services";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.7, delay: i * 0.08, ease: [0.2, 0.7, 0.2, 1] },
  }),
};

const stats = [
  { value: "100+", label: "Happy Clients" },
  { value: "500+", label: "Projects Delivered" },
  { value: "7+", label: "Years Experience" },
  { value: "24/7", label: "Support" },
];

const services = SERVICES.map((s) => ({
  slug: s.slug, icon: s.icon, title: s.title,
  desc: s.summary, accent: s.accent,
  points: s.capabilities.slice(0, 4),
}));

const whyPoints = [
  { icon: Award, title: "Expert Team", text: "Senior engineers across AI, mobile, SaaS — pairing daily with your team." },
  { icon: CheckCircle2, title: "Quality Assurance", text: "Eval harnesses, CI/CD, automated regression — quality is non-negotiable." },
  { icon: Clock, title: "Timely Delivery", text: "Two-week sprints with Friday demos. Predictable. Auditable. Shippable." },
  { icon: Headphones, title: "Ongoing Support", text: "SLA-backed 24/7 maintenance after launch — you're never on your own." },
];

const techMarquee = [
  "GPT-5.2", "Claude Sonnet 4.5", "Gemini 3", "FastAPI", "React 19", "Next.js",
  "Flutter", "Swift", "Kotlin", "PostgreSQL", "MongoDB", "Stripe", "Razorpay",
  "Kubernetes", "Cloudflare", "Vercel", "Sentry", "Datadog",
];

const valueLoop = [
  { icon: Zap, label: "Discovery", time: "Week 1", color: "#3B82F6" },
  { icon: LayersIcon, label: "Prototype", time: "Weeks 2–3", color: "#A855F7" },
  { icon: ShieldCheck, label: "Harden", time: "Weeks 4–8", color: "#F97316" },
  { icon: Rocket, label: "Ship + Grow", time: "Week 9+", color: "#10B981" },
];

export default function Landing() {
  const site = useSiteConfig();
  const heroCfg = site?.hero || {};
  const ctaCfg = site?.cta_section || {};
  const faqCfg = site?.faq && site.faq.length > 0 ? site.faq : null;
  const statsCfg = site?.stats && site.stats.length > 0 ? site.stats : null;
  const targetRef = useRef(null);
  const servicesRef = useRef(null);
  const loopRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: targetRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroFade = useTransform(scrollYProgress, [0, 1], [1, 0.25]);
  const heroBlur = useTransform(scrollYProgress, [0, 1], ["blur(0px)", "blur(4px)"]);

  const { scrollYProgress: svcProgress } = useScroll({ target: servicesRef, offset: ["start end", "end start"] });
  const svcHeadY = useTransform(svcProgress, [0, 1], [40, -40]);

  const { scrollYProgress: loopProgress } = useScroll({ target: loopRef, offset: ["start end", "end start"] });
  const loopRotate = useTransform(loopProgress, [0, 1], [-12, 12]);
  const loopScale = useTransform(loopProgress, [0, 0.5, 1], [0.95, 1.02, 0.96]);

  return (
    <div data-testid="page-landing" className="relative min-h-screen overflow-hidden bg-canvas-warm text-[#0F172A]">
      <SEO
        title="Top App Development Company — AI, Mobile & SaaS Engineering | Projexino"
        description="Projexino is a top-rated app development company building AI-driven mobile, web and SaaS apps for startups & enterprises in India, USA & UK. 500+ projects shipped. Free consultation."
        canonical="/"
        keywords={[
          "app development", "app development company", "mobile app development",
          "web development", "saas development", "ai development",
          "software development company", "custom app development",
          "ios app development", "android app development",
          "cross-platform app development", "react native development",
          "flutter app development", "app development india",
          "app development usa", "app development uk", "projexino",
        ]}
        jsonLd={[
          {
            "@context": "https://schema.org",
            "@type": "ProfessionalService",
            "name": "Projexino",
            "image": LOGO_URL,
            "url": "https://www.projexino.com",
            "telephone": "+91-98765-43210",
            "priceRange": "$$",
            "description": "AI-driven, cross-platform app development & SaaS engineering company serving India, US, UK and global clients.",
            "address": { "@type": "PostalAddress", "addressCountry": "IN" },
            "areaServed": ["IN","US","GB","AE","SG","AU"],
            "serviceType": ["App Development","Mobile App Development","Web Development","SaaS Development","AI Development","Software Development"],
            "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "127" },
          },
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": "What does Projexino do?", "acceptedAnswer": { "@type": "Answer", "text": "Projexino is an AI-driven app development company building production mobile, web and SaaS applications for startups and enterprises across India, the USA, the UK and globally." } },
              { "@type": "Question", "name": "How long does an app take to build?", "acceptedAnswer": { "@type": "Answer", "text": "Most production-grade MVPs ship in 8 to 12 weeks. Complex SaaS or AI products take 16 to 24 weeks. We work in two-week sprints with weekly demos." } },
              { "@type": "Question", "name": "How much does app development cost?", "acceptedAnswer": { "@type": "Answer", "text": "A focused MVP usually lands between USD 15,000 and USD 45,000 depending on scope, integrations and platforms. We provide fixed-scope, fixed-price proposals after a free 30-minute discovery call." } },
              { "@type": "Question", "name": "Do you build AI applications?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. We build LLM-powered apps, RAG pipelines and AI agents on Claude Sonnet 4.5, GPT-5.2 and Gemini 3 with eval harnesses and guardrails." } },
              { "@type": "Question", "name": "Do you sign NDAs?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. We sign mutual NDAs before technical discussion and our standard MSA assigns 100% of the IP to you on payment." } },
            ],
          },
        ]}
      />
      <Navbar />

      {/* HERO */}
      <section ref={targetRef} className="relative isolate pt-28 pb-20 md:pt-32 md:pb-28">
        <div className="absolute inset-0 bg-grid-light opacity-60 [mask-image:radial-gradient(ellipse_at_center,white,transparent_70%)]" />
        <motion.div style={{ y: heroY, opacity: heroFade, filter: heroBlur }} className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-2">
          <div>
            <motion.div initial="hidden" animate="show" variants={fadeUp} custom={0}>
              <span className="tag-chip" data-testid="hero-eyebrow">
                <Sparkles size={12} className="inline" /> &nbsp;{heroCfg.eyebrow || "Transforming Ideas into Digital Reality"}
              </span>
            </motion.div>
            <motion.h1 initial="hidden" animate="show" variants={fadeUp} custom={1}
              data-testid="hero-headline"
              className="font-display mt-6 text-[clamp(2.6rem,6vw,5rem)] font-light leading-[1.02] tracking-tight">
              {heroCfg.headline_1 || "Next-Generation"}{" "}
              <span className="relative inline-block">
                <span className="relative z-10 italic text-[#F97316]">{heroCfg.headline_2_italic || heroCfg.headline_2 || "Development"}</span>
                <span className="absolute -bottom-1 left-0 h-3 w-full bg-[#F97316]/25 blur-sm" />
              </span>{" "}
              {heroCfg.headline_3 || "Solutions."}
            </motion.h1>
            <motion.p initial="hidden" animate="show" variants={fadeUp} custom={2}
              data-testid="hero-subheadline"
              className="mt-6 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
              {heroCfg.subheadline || "From AI-driven applications to cross-platform solutions, we deliver cutting-edge technology that drives your business forward."}
            </motion.p>
            <motion.div initial="hidden" animate="show" variants={fadeUp} custom={3} className="mt-9 flex flex-wrap gap-3">
              <Link to={heroCfg.cta_primary_link || "/contact"} data-testid="hero-cta-primary" className="btn-primary">
                {heroCfg.cta_primary_label || "Start your project"} <ArrowUpRight size={18} />
              </Link>
              <Link to={heroCfg.cta_secondary_link || "/portfolio"} data-testid="hero-cta-secondary" className="btn-ghost">
                {heroCfg.cta_secondary_label || "View Our Work"}
              </Link>
            </motion.div>

            <motion.div initial="hidden" animate="show" variants={fadeUp} custom={4}
              className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
              {(statsCfg || stats).map((s, i) => (
                <motion.div key={(s.label || "") + i}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.08 }}
                  data-testid={`stat-${i}`}>
                  <div className="font-display text-3xl font-semibold text-[#F97316]">{s.value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-600">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div className="relative aspect-square w-full lg:max-h-[560px]">
            <HeroOrbit className="h-full w-full" />
          </div>
        </motion.div>
      </section>

      {/* TECH MARQUEE STRIP */}
      <section aria-label="Tech stack we work with" className="relative -mt-2 border-y border-orange-100 bg-white/60 py-4 backdrop-blur">
        <div className="overflow-hidden">
          <motion.div
            className="flex shrink-0 gap-10 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 36, repeat: Infinity, ease: "linear" }}
          >
            {[...techMarquee, ...techMarquee].map((t, i) => (
              <span key={i} className="font-mono-pj text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                <span className="text-[#F97316]">/</span>&nbsp;{t}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* SERVICES SECTION — 3D tilt cards */}
      <section ref={servicesRef} id="services" className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <motion.div style={{ y: svcHeadY }} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}
            className="mb-14 max-w-3xl">
            <span className="tag-chip">// what we do</span>
            <h2 className="font-display mt-4 text-4xl font-medium leading-tight md:text-5xl">
              Comprehensive Development Services.
            </h2>
            <p className="mt-4 text-slate-600">
              Eight battle-tested practice areas. Each service comes with its own playbook,
              tooling, and team — so we move from kick-off to ship without rebuilding the wheel.
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {services.map((s, i) => (
              <ServiceCard3D key={s.slug} svc={s} index={i} />
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link to="/services" data-testid="see-all-services" className="btn-ghost">
              See all 8 services <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS · placement between SERVICES and HOW WE WORK */}
      <TestimonialsCarousel
        title="What founders say after we ship"
        subtitle="Five-star reviews from clients across India, the USA, the UK and beyond."
        className="!py-16"
      />

      {/* HOW WE WORK — animated value loop */}
      <section ref={loopRef} className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp}>
              <span className="tag-chip">// our delivery loop</span>
              <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                From idea to launch in four crisp moves.
              </h2>
              <p className="mt-4 max-w-md text-slate-600">
                Our build cycle is opinionated, predictable, and metrics-driven — so you know exactly
                what we're shipping, when, and why.
              </p>
              <ol className="mt-7 space-y-3">
                {valueLoop.map((v, i) => (
                  <motion.li key={v.label}
                    initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${v.color}1f`, color: v.color }}>
                      <v.icon size={16} />
                    </span>
                    <span className="font-display text-base font-semibold text-[#0F2042]">{v.label}</span>
                    <span className="font-mono-pj text-xs text-slate-500">· {v.time}</span>
                  </motion.li>
                ))}
              </ol>
            </motion.div>

            {/* Animated loop graphic */}
            <DeliveryLoop rotate={loopRotate} scale={loopScale} />
          </div>
        </div>
      </section>

      {/* WHY CHOOSE */}
      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="glass-navy relative overflow-hidden rounded-3xl p-10 text-white md:p-16">
            <div className="absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(40% 60% at 20% 20%, rgba(249,115,22,0.35), transparent), radial-gradient(40% 60% at 80% 80%, rgba(30,58,138,0.6), transparent)",
              }}
            />
            <div className="relative grid gap-12 lg:grid-cols-2">
              <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
                <span className="tag-chip">// why projexino</span>
                <h2 className="font-display mt-5 text-4xl font-medium leading-tight md:text-5xl">
                  Cutting-edge technology meets human innovation.
                </h2>
                <p className="mt-4 max-w-md text-white/80">
                  Our team combines deep technical expertise with innovative thinking to deliver
                  solutions that anticipate future challenges — not just today's brief.
                </p>
                <div className="mt-8 rounded-2xl bg-white/95 p-3">
                  <Infographic variant="growth" className="h-64 w-full" />
                </div>
              </motion.div>
              <div className="grid gap-4 sm:grid-cols-2">
                {whyPoints.map((w, i) => (
                  <motion.div key={w.title}
                    initial={{ opacity: 0, y: 20, rotateX: -10 }}
                    whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                    viewport={{ once: true }} transition={{ delay: i * 0.1 }}
                    whileHover={{ y: -6, rotateX: 4, rotateY: -4 }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="rounded-2xl border border-white/15 bg-white/10 p-6 transition-colors hover:border-[#F97316]/60">
                    <div className="inline-flex rounded-xl bg-[#F97316]/20 p-2.5 text-[#F97316]">
                      <w.icon size={20} />
                    </div>
                    <h4 className="font-display mt-4 text-lg font-semibold text-white">{w.title}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-white/75">{w.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ — keyword-rich content for SEO (also matches FAQPage schema above) */}
      <section className="relative py-24">
        <div className="mx-auto max-w-4xl px-6">
          <span className="tag-chip">// frequently asked</span>
          <h2 className="font-display mt-4 text-4xl font-medium leading-tight md:text-5xl">
            App development questions, answered.
          </h2>
          <div className="mt-10 space-y-3">
            {(faqCfg || [
              { q: "What does Projexino do?", a: "Projexino is an AI-driven app development company building production mobile, web and SaaS applications for startups and enterprises across India, the USA, the UK and globally. Our practice areas include AI development, mobile app development (iOS, Android, Flutter, React Native), SaaS engineering and custom software development." },
              { q: "How long does an app take to build?", a: "Most production-grade MVPs ship in 8 to 12 weeks. Complex SaaS or AI products take 16 to 24 weeks. We work in two-week sprints with Friday demos so progress is always visible and measurable." },
              { q: "How much does app development cost?", a: "A focused MVP usually lands between USD 15,000 and USD 45,000 depending on scope, integrations and platforms. Enterprise SaaS or AI builds range from USD 60,000 to USD 250,000. We provide fixed-scope, fixed-price proposals after a free 30-minute discovery call." },
              { q: "Do you build AI applications?", a: "Yes — AI development is a core practice. We build LLM-powered apps, RAG pipelines and autonomous agents on Claude Sonnet 4.5, GPT-5.2 and Gemini 3 with eval harnesses, guardrails and cost dashboards baked in." },
              { q: "Do you sign NDAs and assign IP?", a: "Yes. We sign mutual NDAs before any technical discussion and our standard MSA assigns 100% of the IP to you on payment. We also offer GDPR / SOC2 / HIPAA-aware engineering on request." },
              { q: "Which countries do you serve?", a: "Projexino serves clients across India, the USA, the UK, the UAE, Singapore and Australia with time-zone-aligned squads and local-currency billing (INR, USD, GBP)." },
            ]).map((f, i) => (
              <details key={i} className="group rounded-2xl border border-orange-100 bg-white p-5" data-testid={`landing-faq-${i}`}>
                <summary className="cursor-pointer font-display text-base font-semibold text-[#0F2042] marker:text-transparent group-open:text-[#F97316]">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS (premium glass carousel — auto-rotates every 10s) */}
      <TestimonialsCarousel />

      {/* CTA */}
      <section className="relative py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.h2 initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}
            data-testid="cta-headline"
            className="font-display text-4xl font-light leading-tight text-[#0F2042] md:text-6xl">
            {ctaCfg.headline_1 || "Ready to Transform Your Ideas Into"} <span className="italic text-[#F97316]">{ctaCfg.headline_2_italic || "Reality"}</span>{ctaCfg.headline_2_italic ? "" : "?"}
          </motion.h2>
          <motion.p initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} custom={1}
            data-testid="cta-subheadline"
            className="mx-auto mt-5 max-w-2xl text-slate-600">
            {ctaCfg.subheadline || "Let's discuss your project and explore how our expertise can drive your business forward. Get started with a free consultation today."}
          </motion.p>
          <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp} custom={2}
            className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to={ctaCfg.cta_link || "/contact"} className="btn-primary" data-testid="cta-bottom-primary">
              {ctaCfg.cta_label || "Start Your Project"} <ArrowUpRight size={18} />
            </Link>
            <Link to="/contact" className="btn-ghost" data-testid="cta-bottom-secondary">
              Schedule Consultation
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/** 3D tilt card with mouse-tracking depth + glare + service-specific SVG art. */
function ServiceCard3D({ svc, index }) {
  const tilt = useTilt({ max: 9 });
  const glare = useMotionTemplate`radial-gradient(420px circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.55), transparent 45%)`;
  const shadowGlow = useMotionTemplate`0 30px 60px -25px ${svc.accent}55, 0 14px 30px -18px rgba(15,32,66,0.35)`;

  return (
    <Link to={`/services/${svc.slug}`} data-testid={`service-card-${index}`} className="block [perspective:1200px]">
      <motion.article
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        initial={{ opacity: 0, y: 30, rotateX: -10 }}
        whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ delay: index * 0.07, duration: 0.7, type: "spring", stiffness: 110, damping: 18 }}
        style={{
          rotateX: tilt.rotateX,
          rotateY: tilt.rotateY,
          transformStyle: "preserve-3d",
          boxShadow: shadowGlow,
        }}
        whileHover={{ y: -8 }}
        className="group relative h-full overflow-hidden rounded-3xl border border-orange-100 bg-white p-1 transition-shadow"
      >
        {/* moving glare overlay */}
        <motion.div className="pointer-events-none absolute inset-0 rounded-3xl mix-blend-overlay" style={{ background: glare }} />
        {/* accent halo */}
        <div className="absolute inset-0 rounded-3xl opacity-0 transition group-hover:opacity-100"
          style={{ background: `radial-gradient(80% 80% at 50% 0%, ${svc.accent}30, transparent 60%)` }} />
        <div className="relative h-full rounded-[1.4rem] bg-gradient-to-br from-white via-orange-50/40 to-white p-5" style={{ transform: "translateZ(20px)" }}>
          <div className="relative overflow-hidden rounded-2xl">
            <motion.div style={{ transform: "translateZ(40px)" }}>
              <ServiceArt variant={svc.slug} className="h-40 w-full" />
            </motion.div>
            <motion.div
              style={{ transform: "translateZ(60px)" }}
              className="absolute left-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-lg"
              animate={{ background: svc.accent }}>
              <svc.icon size={18} />
            </motion.div>
          </div>
          <motion.h3 style={{ transform: "translateZ(30px)" }} className="font-display mt-5 text-lg font-semibold leading-tight text-[#0F2042]">
            {svc.title}
          </motion.h3>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 line-clamp-3">{svc.desc}</p>
          <ul className="mt-3 space-y-1.5">
            {svc.points.slice(0, 3).map((p) => (
              <li key={p} className="flex items-start gap-2 text-[11px] text-slate-700">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full" style={{ background: svc.accent }} />
                {p}
              </li>
            ))}
          </ul>
          <motion.div
            style={{ transform: "translateZ(50px)" }}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.18em] transition group-hover:gap-2"
            animate={{ color: svc.accent }}>
            Learn more <ArrowUpRight size={12} />
          </motion.div>
        </div>
      </motion.article>
    </Link>
  );
}

/** Animated delivery loop — concentric rotating tracks with milestone pills + scroll parallax. */
function DeliveryLoop({ rotate, scale }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.8 }}
      style={{ rotate, scale }}
      className="relative mx-auto aspect-square w-full max-w-[500px]"
    >
      <svg viewBox="0 0 500 500" className="absolute inset-0">
        <defs>
          <radialGradient id="loop-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#FFFBF1" />
            <stop offset="1" stopColor="#FFE0B8" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <circle cx="250" cy="250" r="240" fill="url(#loop-bg)" />
        {[180, 140, 100].map((r, i) => (
          <motion.circle
            key={i} cx="250" cy="250" r={r}
            stroke={i === 0 ? "#F97316" : i === 1 ? "#0F2042" : "#A855F7"}
            strokeOpacity={0.18} strokeWidth="1" strokeDasharray="3 8"
            fill="none"
            animate={{ rotate: i % 2 ? 360 : -360 }}
            style={{ transformOrigin: "250px 250px" }}
            transition={{ duration: 22 + i * 6, repeat: Infinity, ease: "linear" }}
          />
        ))}
        {/* Center bubble */}
        <circle cx="250" cy="250" r="56" fill="white" stroke="#F97316" strokeWidth="2" />
        <text x="250" y="246" textAnchor="middle" fontFamily="Outfit" fontSize="18" fontWeight="700" fill="#0F2042">PROJEXINO</text>
        <text x="250" y="264" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" fill="#F97316">SHIP LOOP</text>
      </svg>
      {/* Milestone pills positioned around the loop */}
      {valueLoop.map((v, i) => {
        const angle = -90 + i * 90;
        return (
          <motion.div key={v.label}
            initial={{ opacity: 0, scale: 0 }} whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }} transition={{ delay: 0.4 + i * 0.15, type: "spring" }}
            className="absolute left-1/2 top-1/2 flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-2 shadow-md"
            style={{ transform: `translate(-50%,-50%) rotate(${angle}deg) translate(220px) rotate(${-angle}deg)` }}>
            <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: `${v.color}1f`, color: v.color }}>
              <v.icon size={14} />
            </span>
            <div className="text-left leading-tight">
              <div className="font-display text-xs font-bold" style={{ color: v.color }}>{v.label}</div>
              <div className="font-mono-pj text-[9px] text-slate-500">{v.time}</div>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
