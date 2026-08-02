import { motion } from "framer-motion";
import { ArrowUpRight, ExternalLink, Award, Play } from "lucide-react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEO from "@/components/SEO";
import { PROJECTS as cases } from "@/data/portfolioProjects";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06 } }),
};


export default function Portfolio() {
  return (
    <div data-testid="page-portfolio" className="relative min-h-screen overflow-hidden bg-canvas-rose text-[#0F172A]">
      <SEO
        title="Projexino Portfolio — App Development Case Studies & Client Work"
        description="Explore Projexino's portfolio of 500+ shipped products: AI platforms, SaaS dashboards, fintech apps, healthcare and e-commerce builds. Real metrics, real outcomes."
        canonical="/portfolio"
        keywords={[
          "app development portfolio", "saas case studies",
          "ai app case studies", "mobile app projects",
          "projexino portfolio", "fintech app development case study",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "url": "https://www.projexino.com/portfolio",
          "name": "Projexino Portfolio",
        }}
      />
      <Navbar />

      <section className="relative pt-32 pb-12">
        <div className="absolute inset-0 bg-grid-light opacity-50 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-6">
          <span className="tag-chip"><Award size={12} /> // portfolio</span>
          <motion.h1
            initial="hidden" animate="show" variants={fadeUp}
            className="font-display mt-6 max-w-4xl text-5xl font-light leading-[1.05] text-[#0F2042] md:text-7xl"
          >
            Work that <span className="text-[#F97316] italic">moved the metric.</span>
          </motion.h1>
          <motion.p initial="hidden" animate="show" variants={fadeUp} custom={1} className="mt-6 max-w-2xl text-slate-700">
            A snapshot of platforms we've engineered across healthcare, fintech, ops, EdTech, mobility and commerce.
            Every build below shipped to production with the team that depends on it.
          </motion.p>
        </div>
      </section>

      <section className="relative py-12">
        <div className="mx-auto max-w-7xl space-y-10 px-6">
          {cases.map((c, i) => (
            <motion.article
              key={c.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.6 }}
              data-testid={`case-${i}`}
              className="card-soft overflow-hidden"
            >
              <div className={`grid gap-0 lg:grid-cols-2 ${i % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}>
                <div className="relative h-72 overflow-hidden lg:h-auto">
                  <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c.accent}22, transparent 60%)` }} />
                </div>
                <div className="p-10 md:p-14">
                  <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ background: `${c.accent}15`, color: c.accent, border: `1px solid ${c.accent}33` }}
                  >
                    {c.tag}
                  </div>
                  <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
                    {c.name}
                  </h2>
                  <p className="mt-3 text-slate-700">{c.summary}</p>

                  <div className="mt-6 grid grid-cols-3 gap-3">
                    {c.metrics.map((m) => (
                      <div key={m.l} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="font-display text-2xl font-semibold" style={{ color: c.accent }}>
                          {m.v}
                        </div>
                        <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          {m.l}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {c.stack.map((s) => (
                      <span
                        key={s}
                        className="rounded-full border px-2.5 py-1 text-xs font-mono-pj"
                        style={{ borderColor: `${c.accent}55`, background: `${c.accent}10`, color: c.accent }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  <a
                    href="https://contact.projexino.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost mt-7 text-sm"
                  >
                    Request case study <ExternalLink size={14} />
                  </a>
                  <Link
                    to={`/portfolio/${c.slug}`}
                    data-testid={`portfolio-card-${c.slug}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-lg transition active:scale-95"
                    style={{
                      background: `linear-gradient(135deg, ${c.accent}, ${c.accent}dd)`,
                      boxShadow: `0 16px 30px -10px ${c.accent}80`,
                    }}
                  >
                    <Play size={14} /> Experience demo
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="relative py-24">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="font-display text-4xl font-light leading-tight text-[#0F2042] md:text-6xl">
            Your story is the <span className="text-[#F97316]">next one.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-700">
            Tell us the metric. We'll tell you how we'd move it.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a href="https://contact.projexino.com/" target="_blank" rel="noreferrer" className="btn-primary" data-testid="portfolio-cta">
              Start Your Project <ArrowUpRight size={18} />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
