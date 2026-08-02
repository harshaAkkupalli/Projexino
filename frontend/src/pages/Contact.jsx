import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Mail, MapPin, Send, MessageSquare, Clock, Calendar, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import axios from "axios";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Infographic from "@/components/Infographic";
import SEO from "@/components/SEO";
import { api, formatApiError } from "@/lib/api";
import { toast } from "sonner";
import useSiteConfig from "@/hooks/useSiteConfig";

const PUBLIC = axios.create({ baseURL: `${process.env.REACT_APP_BACKEND_URL}/api` });

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.6, delay: i * 0.06 } }),
};

export default function Contact() {
  const site = useSiteConfig();
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [bookingPages, setBookingPages] = useState([]);

  useEffect(() => {
    PUBLIC.get("/booking/public/featured")
      .then(({ data }) => setBookingPages(data || []))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post("/contact", form);
      setSent(true);
      toast.success("Message sent — we'll be in touch.");
      setForm({ name: "", email: "", company: "", message: "" });
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div data-testid="page-contact" className="relative min-h-screen overflow-hidden bg-canvas-sky text-[#0F172A]">
      <SEO
        title="Contact Projexino — Get a Free App Development Quote in 48 Hours"
        description="Talk to Projexino about your app, AI or SaaS project. Free 30-minute discovery call + fixed-scope proposal within 48 hours. Email hello@projexino.com or book a slot."
        canonical="/contact"
        keywords={[
          "contact projexino", "app development quote", "hire app developers",
          "free app consultation", "software development consultation",
          "hire saas developers", "ai development consultation",
        ]}
        jsonLd={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "url": "https://www.projexino.com/contact",
          "mainEntity": {
            "@type": "Organization",
            "name": "Projexino",
            "contactPoint": [{
              "@type": "ContactPoint",
              "contactType": "sales",
              "email": (site && site.contact && site.contact.email) || "hello@projexino.com",
              "telephone": (site && site.contact && site.contact.phone) || "+91-98765-43210",
              "availableLanguage": ["en","hi"],
              "areaServed": ["IN","US","GB","AE","SG","AU"],
            }],
          },
        }}
      />
      <Navbar />

      <section className="relative pt-32 pb-12">
        <div className="absolute inset-0 bg-grid-light opacity-50 [mask-image:radial-gradient(ellipse_at_top,white,transparent_70%)]" />
        <div className="relative mx-auto max-w-7xl px-6">
          <span className="tag-chip">// contact</span>
          <motion.h1
            initial="hidden" animate="show" variants={fadeUp}
            className="font-display mt-6 max-w-4xl text-5xl font-light leading-[1.05] text-[#0F2042] md:text-7xl"
          >
            Let's start the <span className="text-[#F97316] italic">conversation.</span>
          </motion.h1>
          <motion.p initial="hidden" animate="show" variants={fadeUp} custom={1} className="mt-6 max-w-2xl text-slate-600">
            Tell us about your project, your timeline, and the metric you want to move. We'll
            reply within one business day with a tailored next step.
          </motion.p>

          {bookingPages.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              data-testid="contact-booking-cta"
              className="mt-8 inline-flex flex-wrap items-center gap-3"
            >
              <Link
                to={`/book/${bookingPages[0].slug}`}
                data-testid="contact-book-meeting-hero"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-200 transition hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
              >
                <Calendar size={16} /> Book a meeting now
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
              </Link>
              <span className="text-xs text-slate-500">
                Pick a free slot · auto Meet link · no signup needed
              </span>
            </motion.div>
          )}
        </div>
      </section>

      {bookingPages.length > 0 && (
        <section className="relative py-12">
          <div className="mx-auto max-w-7xl px-6">
            <div className="rounded-3xl border border-orange-100 bg-gradient-to-br from-white via-orange-50/40 to-amber-50/40 p-6 md:p-10">
              <span className="tag-chip">// instant scheduling</span>
              <h2 className="font-display mt-4 text-3xl font-medium text-[#0F2042] md:text-4xl">
                Skip the back-and-forth. <span className="italic text-[#F97316]">Pick a slot →</span>
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Choose a meeting type below. We'll send a calendar invite with a Google Meet link the moment you book.
              </p>
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {bookingPages.map((p, i) => (
                  <motion.div
                    key={p.slug}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                    data-testid={`contact-book-card-${p.slug}`}
                    className="group overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: p.color || "#F97316" }} />
                      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                        {p.duration_minutes} min · with {p.owner_name}
                      </div>
                    </div>
                    <h3 className="font-display mt-2 text-xl font-semibold text-[#0F2042]">{p.title}</h3>
                    {p.description && (
                      <p className="mt-1 line-clamp-3 text-sm text-slate-500">{p.description}</p>
                    )}
                    <Link
                      to={`/book/${p.slug}`}
                      data-testid={`contact-book-${p.slug}`}
                      className="mt-5 inline-flex items-center gap-1.5 rounded-full text-sm font-bold text-[#F97316] transition group-hover:gap-2.5"
                      style={{ color: p.color || "#F97316" }}
                    >
                      Pick a slot <ArrowRight size={14} />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="relative py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-8 lg:grid-cols-5">
            <motion.form
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              onSubmit={submit} data-testid="contact-form"
              className="card-soft p-8 lg:col-span-3"
            >
              <h2 className="font-display text-2xl font-semibold text-[#0F2042]">Send us a brief</h2>
              <p className="mt-1 text-sm text-slate-500">All fields are required.</p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <Field label="Your name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} testId="contact-name" />
                <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} testId="contact-email" />
              </div>
              <Field label="Company" value={form.company} onChange={(v) => setForm({ ...form, company: v })} testId="contact-company" required={false} />
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-slate-500">
                  Project brief
                </span>
                <textarea
                  data-testid="contact-message" required rows={5}
                  value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
                  placeholder="Tell us what you're building and what success looks like…"
                />
              </label>
              <button type="submit" disabled={sending || sent} data-testid="contact-submit" className="btn-primary mt-6 disabled:opacity-60">
                {sent ? "Sent — talk soon" : sending ? "Sending…" : "Send brief"} <Send size={16} />
              </button>
            </motion.form>

            <div className="space-y-5 lg:col-span-2">
              <InfoCard icon={Mail} title="Email" body={site?.contact?.email || "hello@projexino.com"} />
              <InfoCard icon={MapPin} title="Where we work" body={site?.contact?.address || "Global · Remote-first"} />
              <InfoCard icon={Clock} title="Response time" body={site?.contact?.office_hours || "Within 1 business day"} />
              <InfoCard
                icon={MessageSquare} title="Prefer a quick call?"
                body={
                  bookingPages.length > 0 ? (
                    <Link to={`/book/${bookingPages[0].slug}`} data-testid="contact-quickcall-link"
                      className="text-[#F97316] hover:underline">
                      Schedule a {bookingPages[0].duration_minutes}-min consult →
                    </Link>
                  ) : (
                    <a href="https://contact.projexino.com/" target="_blank" rel="noreferrer" className="text-[#F97316] hover:underline">
                      Schedule a 30-min consult →
                    </a>
                  )
                }
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-20">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="card-soft p-6"><Infographic variant="saas" className="h-[360px] w-full" /></div>
            <motion.div initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
              <span className="tag-chip">// what happens next</span>
              <h2 className="font-display mt-5 text-4xl font-medium leading-tight text-[#0F2042] md:text-5xl">
                A simple, transparent process.
              </h2>
              <ol className="mt-7 space-y-4 text-slate-700">
                {[
                  "We respond within one business day with a tailored next step.",
                  "30-minute scoping call to align on outcomes and constraints.",
                  "Written proposal: scope, timeline, team, transparent pricing.",
                  "Kickoff in 1–2 weeks. Weekly demos. Production from day one.",
                ].map((s, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-3"
                  >
                    <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F97316]/15 text-xs font-bold text-[#F97316]">
                      {i + 1}
                    </span>
                    <span className="text-sm">{s}</span>
                  </motion.li>
                ))}
              </ol>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Field({ label, value, onChange, type = "text", testId, required = true }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <input
        data-testid={testId} type={type} required={required} value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-[#0F172A] outline-none transition placeholder:text-slate-400 focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
      />
    </label>
  );
}

function InfoCard({ icon: Icon, title, body }) {
  return (
    <div className="card-soft p-6">
      <div className="inline-flex rounded-xl bg-[#F97316]/12 p-2.5 text-[#F97316]">
        <Icon size={18} />
      </div>
      <div className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">{title}</div>
      <div className="mt-1 text-base text-[#0F2042]">{body}</div>
    </div>
  );
}
