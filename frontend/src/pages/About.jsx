import { motion } from "framer-motion";
import { Target, Eye, Heart, Rocket, ArrowUpRight, Users, Layers, Cpu } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Infographic from "@/components/Infographic";
import SEO from "@/components/SEO";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06 } }),
};

const values = [
  { icon: Target, title: "Mission", text: "Turn ambitious ideas into shipped, scalable digital products that move the metric that matters." },
  { icon: Eye, title: "Vision", text: "Be the partner ambitious founders and ops teams trust when 'normal' software won't cut it." },
  { icon: Heart, title: "Values", text: "Craft. Honesty. Velocity. Long-term thinking — even when it costs us short-term speed." },
  { icon: Rocket, title: "Approach", text: "Embedded squads, weekly demos, real product instincts — not a hand-off agency." },
];

const timeline = [
  { year: "2018", title: "Founded", text: "Projexino starts with a 3-person crew building Android & React apps for early-stage startups." },
  { year: "2020", title: "Cross-platform Era", text: "We standardize on Flutter / React Native and ship our first 50 production apps." },
  { year: "2022", title: "AI-First Engineering", text: "LLM workflows, RAG pipelines, and vision systems become core to our practice." },
  { year: "2024", title: "SaaS Platform Studio", text: "We launch internal frameworks for multi-tenant SaaS and dashboard tooling." },
  { year: "2026", title: "Today", text: "100+ happy clients · 500+ projects delivered · 7+ years of engineering momentum." },
];

export default function About() {
  return (
    <div data-testid="page-about" className="relative min-h-screen overflow-hidden bg-canvas-violet text-[#0F172A]">
      <SEO
        title="About Projexino — Senior-Led App Development & AI Engineering Studio"
        description="Founded in 2018, Projexino is a 50-strong senior-led app development studio. We've shipped 500+ AI, mobile, web & SaaS products for clients in India, USA, UK and globally."
        canonical="/about"
        keywords={[
          "about projexino", "app development studio", "senior software engineers",
          "ai development team", "saas engineering studio", "mobile app team india",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "url": "https://www.projexino.com/about",
          "mainEntity": { "@type": "Organization", "name": "Projexino", "foundingDate": "2018", "numberOfEmployees": "50+" },
        }}
      />
      <Navbar />

      <section className="relative pt-32 pb-12">
        <div className="absolute inset-0 bg-grid-light opacity-50 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-6">
          <span className="tag-chip">// about projexino</span>
          <motion.h1
            initial="hidden" animate="show" variants={fadeUp}
            className="font-display mt-6 max-w-4xl text-5xl font-light leading-[1.05] text-[#0F2042] md:text-7xl"
          >
            We engineer <span className="text-[#F97316] italic">digital reality.</span>
          </motion.h1>
          <motion.p initial="hidden" animate="show" variants={fadeUp} custom={1} className="mt-6 max-w-2xl text-slate-600">
            Projexino is a software studio building AI-driven, cross-platform applications for
            ambitious teams. We work the way modern product teams expect — embedded, transparent,
            and obsessed with the outcome.
          </motion.p>
        </div>
      </section>

      <section className="relative py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {values.map((v, i) => (
              <motion.div
                key={v.title}
                initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={fadeUp} custom={i}
                data-testid={`value-card-${i}`}
                className="card-soft p-7"
              >
                <div className="inline-flex rounded-2xl bg-[#F97316]/12 p-3 text-[#F97316]">
                  <v.icon size={20} />
                </div>
                <h3 className="font-display mt-5 text-xl font-semibold text-[#0F2042]">{v.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="card-soft overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-2">
              <div className="relative h-72 lg:h-auto">
                <img
                  src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80"
                  alt="Projexino team — technology and craft"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="p-10 md:p-14">
                <span className="tag-chip">// our story</span>
                <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                  Cutting-edge technology meets human innovation.
                </h2>
                <p className="mt-5 text-slate-600">
                  Our team combines deep technical expertise with innovative thinking to deliver
                  solutions that don't just meet your current needs, but anticipate future
                  challenges.
                </p>
                <div className="mt-7 grid grid-cols-3 gap-4">
                  {[
                    { v: "100+", l: "Happy Clients" },
                    { v: "500+", l: "Projects Delivered" },
                    { v: "7+", l: "Years Experience" },
                  ].map((s) => (
                    <div key={s.l} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="font-display text-2xl font-semibold text-[#F97316]">{s.v}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                        {s.l}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-24">
        <div className="mx-auto max-w-5xl px-6">
          <span className="tag-chip">// the journey</span>
          <h2 className="font-display mt-4 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
            Built by builders, year after year.
          </h2>
          <div className="relative mt-14 space-y-10 border-l border-slate-200 pl-8">
            {timeline.map((t, i) => (
              <motion.div
                key={t.year}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="absolute -left-[42px] top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#F97316] ring-4 ring-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                </div>
                <div className="font-mono-pj text-xs text-[#F97316]">{t.year}</div>
                <div className="font-display mt-1 text-2xl font-semibold text-[#0F2042]">{t.title}</div>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">{t.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <span className="tag-chip">// outcomes</span>
              <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                Outcomes that compound.
              </h2>
              <p className="mt-4 max-w-md text-slate-600">
                We measure ourselves on revenue, retention, and ship velocity for our clients —
                not on hours billed.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  { icon: Users, t: "100+ active client teams trust Projexino" },
                  { icon: Layers, t: "500+ apps shipped across iOS, Android, Web" },
                  { icon: Cpu, t: "AI agents now embedded in 60% of new builds" },
                ].map((b, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-0.5 rounded-xl border border-slate-200 bg-white p-2 text-[#F97316]">
                      <b.icon size={16} />
                    </div>
                    <span className="pt-1 text-sm text-slate-700">{b.t}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            <div className="card-soft p-6">
              <Infographic variant="growth" className="h-[360px] w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="font-display text-4xl font-light leading-tight text-[#0F2042] md:text-6xl">
            Let's build the next one <span className="text-[#F97316]">together.</span>
          </h2>
          <div className="mt-10 flex justify-center gap-3">
            <a href="https://contact.projexino.com/" target="_blank" rel="noreferrer" className="btn-primary" data-testid="about-cta">
              Start Your Project <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
