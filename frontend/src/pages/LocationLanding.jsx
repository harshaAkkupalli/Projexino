/**
 * LocationLanding.jsx — Programmatic SEO landing pages.
 *
 * Each variant targets a specific high-intent keyword (e.g.
 * "app development company in India", "AI development USA").
 * Pages share a high-conversion layout: hero + trust strip + services
 * grid + comparison table + FAQ (with FAQ schema) + final CTA.
 *
 * Configure new variants in `LOCATION_PAGES` below — adding a new entry
 * automatically wires up SEO, schema, and route content.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowUpRight, CheckCircle2, Star, MapPin, Award, Clock, ShieldCheck, Zap, Globe,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";

const SITE_URL = "https://www.projexino.com";

/** Full configuration for each programmatic landing page. */
export const LOCATION_PAGES = {
  "app-development-india": {
    h1: "App Development Company in India",
    seoTitle: "Top App Development Company in India — Projexino",
    seoDescription:
      "Projexino is a top app development company in India delivering AI-powered mobile, web and SaaS apps for startups & enterprises. 500+ projects shipped. Get a free quote.",
    keywords: [
      "app development company in india", "best app development company india",
      "mobile app development india", "android app development india",
      "ios app development india", "software development company india",
      "saas development india", "ai app development india",
    ],
    eyebrow: "// India · 500+ apps shipped",
    intro:
      "We're an India-headquartered app development company building production-grade mobile, web and SaaS products for ambitious startups and enterprises across India, the US, the UK and the Middle East.",
    geo: { country: "IN", placename: "India" },
    serviceArea: "India",
    bullets: [
      "Senior Indian engineers, US/UK-aligned process",
      "INR-friendly pricing with global delivery quality",
      "GST-compliant invoices, SOC2-style controls",
      "Hybrid teams across Bangalore, Hyderabad & Pune",
    ],
    citiesServed: ["Bangalore", "Hyderabad", "Mumbai", "Pune", "Delhi NCR", "Chennai", "Ahmedabad"],
  },
  "app-development-usa": {
    h1: "App Development Company for US Startups & Enterprises",
    seoTitle: "App Development Company USA — AI, Mobile & SaaS | Projexino",
    seoDescription:
      "Projexino delivers world-class app development for US startups and Fortune 500s — AI, iOS, Android, web and SaaS. Time-zone-aligned, NDA-friendly, ships fast.",
    keywords: [
      "app development company usa", "mobile app development company usa",
      "ai development company usa", "saas development usa",
      "ios android app development usa", "software development partner usa",
    ],
    eyebrow: "// USA · time-zone-aligned delivery",
    intro:
      "Projexino delivers app, AI and SaaS development for US-based startups and enterprises with overlap-hour squads, NDA-compliant onboarding and zero-friction billing.",
    geo: { country: "US", placename: "United States" },
    serviceArea: "United States",
    bullets: [
      "PST / EST overlap squads — daily standups in your timezone",
      "MSA + NDA-friendly onboarding in 48 hours",
      "US dollar invoicing via Stripe / wire / ACH",
      "HIPAA, SOC2 & GDPR-aware engineering",
    ],
    citiesServed: ["San Francisco", "New York", "Austin", "Seattle", "Boston", "Los Angeles", "Miami"],
  },
  "app-development-uk": {
    h1: "App Development Agency for UK Brands",
    seoTitle: "UK App Development Agency — AI & SaaS Builds | Projexino",
    seoDescription:
      "Projexino is the app development agency for UK brands. We engineer AI, web & mobile apps with GBP invoicing, GDPR compliance and London-aligned working hours.",
    keywords: [
      "app development uk", "mobile app development uk", "saas development uk",
      "ai app development london", "software agency uk",
      "react native app development uk",
    ],
    eyebrow: "// UK · London overlap delivery",
    intro:
      "We partner with UK startups, scale-ups and brands to ship AI-native mobile and SaaS products — with British working hours overlap and GDPR-first engineering baked in.",
    geo: { country: "GB", placename: "United Kingdom" },
    serviceArea: "United Kingdom",
    bullets: [
      "GMT / BST overlap squads with daily demos",
      "GDPR-compliant data handling out of the box",
      "GBP invoicing via Stripe / SEPA / wire",
      "ICO-aware privacy & DPIA support on request",
    ],
    citiesServed: ["London", "Manchester", "Edinburgh", "Birmingham", "Bristol", "Cambridge"],
  },
  "mobile-app-development-company": {
    h1: "Mobile App Development Company",
    seoTitle: "Mobile App Development Company — iOS, Android & Cross-Platform | Projexino",
    seoDescription:
      "Projexino is a mobile app development company building beautiful iOS, Android, Flutter and React Native apps for startups and enterprises worldwide.",
    keywords: [
      "mobile app development company", "ios app development company",
      "android app development company", "flutter app development",
      "react native development", "cross platform mobile development",
    ],
    eyebrow: "// mobile-first engineering",
    intro:
      "We're a mobile-first development company specializing in iOS, Android, Flutter and React Native apps engineered for performance, beauty and App Store success.",
    geo: { country: "IN", placename: "Global" },
    serviceArea: "Worldwide",
    bullets: [
      "Native iOS (Swift) & Android (Kotlin) engineering",
      "Flutter & React Native cross-platform delivery",
      "App Store & Play Store listing optimization",
      "Push, offline, payments, deep-link ready",
    ],
    citiesServed: [],
  },
  "saas-development-company": {
    h1: "SaaS Development Company",
    seoTitle: "SaaS Development Company — Multi-Tenant Engineering | Projexino",
    seoDescription:
      "Projexino is a SaaS development company building multi-tenant, billing-ready SaaS products with Stripe, Auth, RBAC, analytics and AI features.",
    keywords: [
      "saas development company", "b2b saas development",
      "multi tenant saas development", "stripe saas integration",
      "react saas development", "saas mvp development",
    ],
    eyebrow: "// SaaS engineered to scale",
    intro:
      "From MVP to multi-tenant scale, Projexino is the SaaS development company founders trust to ship billing-ready, secure and beautifully-designed SaaS products fast.",
    geo: { country: "IN", placename: "Global" },
    serviceArea: "Worldwide",
    bullets: [
      "Multi-tenant architecture with row-level isolation",
      "Stripe billing, metered usage, dunning, taxation",
      "Role-based access control + SSO + audit logs",
      "Analytics, AI features and observability baked in",
    ],
    citiesServed: [],
  },
  "ai-development-company": {
    h1: "AI Development Company",
    seoTitle: "AI Development Company — LLM, RAG & Agentic Apps | Projexino",
    seoDescription:
      "Projexino is an AI development company shipping LLM apps, RAG pipelines and autonomous agents on Claude, GPT-5.2 and Gemini 3 with eval-driven engineering.",
    keywords: [
      "ai development company", "llm development services",
      "generative ai development", "rag pipeline development",
      "ai agent development", "chatgpt integration company",
      "claude integration services",
    ],
    eyebrow: "// AI engineered, not hyped",
    intro:
      "Projexino is the AI development company for teams who want shipping, evaluated, production-grade AI — not flashy prompts. We build on Claude Sonnet 4.5, GPT-5.2 and Gemini 3.",
    geo: { country: "IN", placename: "Global" },
    serviceArea: "Worldwide",
    bullets: [
      "LLM copilots embedded in your product",
      "Retrieval-Augmented Generation with vector DBs",
      "Agentic workflows with tool-calling & guardrails",
      "Eval harnesses, cost dashboards, model fallbacks",
    ],
    citiesServed: [],
  },
};

const SERVICES = [
  { icon: Zap, label: "AI / LLM Apps", to: "/services/ai-driven-development" },
  { icon: Globe, label: "Cross-Platform Apps", to: "/services/cross-platform-development" },
  { icon: ShieldCheck, label: "SaaS Engineering", to: "/services/saas-development" },
  { icon: Award, label: "iOS & Android", to: "/services/ios-android-development" },
];

const TRUST = [
  { v: "500+", l: "Projects shipped" },
  { v: "100+", l: "Happy clients" },
  { v: "7+", l: "Years experience" },
  { v: "24/7", l: "Support" },
];

const FAQ = [
  {
    q: "How long does it take to build an app?",
    a: "Most production-grade MVPs ship in 8 to 12 weeks. Complex SaaS or AI products can take 16 to 24 weeks. We work in two-week sprints with weekly demos, so progress is always visible and measurable.",
  },
  {
    q: "How much does app development cost?",
    a: "A focused MVP usually lands between USD 15,000 and USD 45,000 depending on scope, integrations and platforms. We provide fixed-scope, fixed-price proposals after a free 30-minute discovery call.",
  },
  {
    q: "Do you sign NDAs and assign IP?",
    a: "Yes. We sign mutual NDAs before any technical discussion and our standard MSA assigns 100% of the IP to you on payment. We also offer GDPR / SOC2 / HIPAA-aware engineering on request.",
  },
  {
    q: "Which tech stack do you use?",
    a: "We default to React 19, Next.js, FastAPI, MongoDB and PostgreSQL on the web; Flutter, Swift and Kotlin on mobile; and Claude Sonnet 4.5, GPT-5.2 and Gemini 3 for AI. We adapt to your existing stack when needed.",
  },
  {
    q: "Do you offer post-launch maintenance?",
    a: "Yes. Every project includes 60 days of complimentary support. After that we offer SLA-backed maintenance plans starting from USD 1,500 / month with 24x7 incident response.",
  },
];

export default function LocationLanding({ slug }) {
  const data = LOCATION_PAGES[slug];
  if (!data) return null;
  const url = `${SITE_URL}/${slug}`;

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "ProfessionalService",
      "name": `Projexino — ${data.h1}`,
      "image": "https://customer-assets.emergentagent.com/job_projexino-hub/artifacts/k85zxnvo_cropped-projexino-scaled-1-768x358%20%281%29.png",
      "url": url,
      "telephone": "+91-98765-43210",
      "priceRange": "$$",
      "description": data.seoDescription,
      "address": {
        "@type": "PostalAddress",
        "addressCountry": data.geo.country,
      },
      "areaServed": data.serviceArea,
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.9",
        "reviewCount": "127",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": FAQ.map((f) => ({
        "@type": "Question",
        "name": f.q,
        "acceptedAnswer": { "@type": "Answer", "text": f.a },
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE_URL + "/" },
        { "@type": "ListItem", "position": 2, "name": data.h1, "item": url },
      ],
    },
  ];

  return (
    <div data-testid={`page-${slug}`} className="relative min-h-screen overflow-hidden bg-canvas-warm text-[#0F172A]">
      <SEO
        title={data.seoTitle}
        description={data.seoDescription}
        canonical={`/${slug}`}
        keywords={data.keywords}
        jsonLd={jsonLd}
      />
      <Navbar />

      {/* HERO */}
      <section className="relative pt-32 pb-16">
        <div className="absolute inset-0 bg-grid-light opacity-60 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <span className="tag-chip"><MapPin size={11} className="inline" /> {data.eyebrow}</span>
          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="font-display mt-5 text-4xl font-light leading-[1.05] tracking-tight md:text-6xl"
          >
            {data.h1.split(" ").slice(0, -2).join(" ")}{" "}
            <span className="italic text-[#F97316]">{data.h1.split(" ").slice(-2).join(" ")}</span>
          </motion.h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
            {data.intro}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/contact" data-testid="loc-cta-primary" className="btn-primary">
              Get a free estimate <ArrowUpRight size={18} />
            </Link>
            <Link to="/portfolio" data-testid="loc-cta-secondary" className="btn-ghost">View our work</Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {TRUST.map((s) => (
              <div key={s.l}>
                <div className="font-display text-3xl font-semibold text-[#F97316]">{s.v}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-600">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY PROJEXINO */}
      <section className="relative py-16">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl font-medium md:text-4xl">
            Why founders choose Projexino for{" "}
            <span className="italic text-[#F97316]">{data.serviceArea}</span>
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {data.bullets.map((b) => (
              <div key={b} className="flex items-start gap-3 rounded-2xl border border-orange-100 bg-white p-5">
                <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#F97316]" />
                <span className="text-sm leading-relaxed text-slate-700">{b}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="relative py-16">
        <div className="mx-auto max-w-6xl px-6">
          <span className="tag-chip">// services</span>
          <h2 className="font-display mt-3 text-3xl font-medium md:text-4xl">What we build</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <Link to={s.to} key={s.label} className="group rounded-2xl border border-orange-100 bg-white p-6 transition hover:-translate-y-1 hover:shadow-md">
                <div className="inline-flex rounded-xl bg-[#F97316]/15 p-3 text-[#F97316]">
                  <s.icon size={20} />
                </div>
                <h3 className="font-display mt-4 text-base font-semibold text-[#0F2042] group-hover:text-[#F97316]">{s.label}</h3>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#F97316]">
                  Learn more <ArrowUpRight size={12} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {data.citiesServed?.length > 0 && (
        <section className="relative py-16">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="font-display text-3xl font-medium md:text-4xl">
              Serving teams across {data.serviceArea}
            </h2>
            <div className="mt-6 flex flex-wrap gap-2">
              {data.citiesServed.map((c) => (
                <span key={c} className="rounded-full border border-orange-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                  <MapPin size={12} className="mr-1 inline text-[#F97316]" />{c}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ — has FAQPage schema for rich snippets */}
      <section className="relative py-16">
        <div className="mx-auto max-w-4xl px-6">
          <h2 className="font-display text-3xl font-medium md:text-4xl">Frequently asked questions</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f, i) => (
              <details key={i} className="group rounded-2xl border border-orange-100 bg-white p-5" data-testid={`faq-${i}`}>
                <summary className="cursor-pointer font-display text-base font-semibold text-[#0F2042] marker:text-transparent group-open:text-[#F97316]">
                  {f.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="font-display text-3xl font-light leading-tight text-[#0F2042] md:text-5xl">
            Ready to ship your <span className="italic text-[#F97316]">next product</span>?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            Get a free 30-minute discovery call and a fixed-scope proposal within 48 hours.
          </p>
          <Link to="/contact" className="btn-primary mt-8" data-testid="loc-bottom-cta">
            Talk to our team <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
