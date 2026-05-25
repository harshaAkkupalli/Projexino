import { motion } from "framer-motion";
import { Shield, Lock, FileCheck, Cookie, UserCheck, Mail } from "lucide-react";
import SEO from "@/components/SEO";

const SECTIONS = [
  {
    icon: UserCheck,
    title: "Information We Collect",
    body: [
      "Account data — name, email, role, and password (encrypted) when you sign up or are seeded by a Projexino admin.",
      "Workspace data — projects, tasks, leads, documents, chat messages, and files you create or upload.",
      "Operational telemetry — login/logout timestamps, IP address, browser/device user-agent, and presence heartbeats (used for attendance and security audits).",
      "Communication data — emails you send through connected Gmail accounts and AI-generated email templates.",
      "Cookies & local storage — auth tokens, role selection, intro-popup dismissal flag.",
    ],
  },
  {
    icon: FileCheck,
    title: "How We Use Your Information",
    body: [
      "Authenticate you and authorise access to role-specific portals (Admin / Manager / HR / Team Member / Intern).",
      "Power the AI assistant, email-template generator, and mass-email campaigns you initiate.",
      "Render attendance, presence, finance, and project dashboards for authorised admins.",
      "Send transactional notifications and the campaign emails you compose.",
      "Improve product quality and detect abuse, fraud, or policy violations.",
    ],
  },
  {
    icon: Lock,
    title: "Data Storage & Security",
    body: [
      "Passwords are hashed with bcrypt; auth uses signed JWT cookies over HTTPS.",
      "All workspace data is stored in MongoDB on hardened cloud infrastructure with at-rest encryption.",
      "Gmail OAuth tokens are stored encrypted and never exposed to any third party other than Google's APIs.",
      "Access is gated by role-based controls; least-privileged principles apply throughout the platform.",
    ],
  },
  {
    icon: Cookie,
    title: "Cookies & Tracking",
    body: [
      "We use a single httpOnly auth cookie (access_token) plus a handful of localStorage keys for UI preferences (e.g. pj_intro_seen, pj_role).",
      "No third-party advertising, retargeting, or cross-site tracking cookies are set.",
      "Cookies are restricted to the same site and the API host you authenticate against.",
    ],
  },
  {
    icon: Mail,
    title: "Your Rights",
    body: [
      "Access — request a copy of your account and workspace data.",
      "Correction — update any incorrect personal data from your Profile page.",
      "Erasure — request deletion of your account and associated data; admins can perform this from the Settings panel.",
      "Portability — export project, finance, and task data as PDF / CSV.",
      "Opt-out — unsubscribe from any non-essential email by replying STOP or contacting privacy@projexino.com.",
    ],
  },
  {
    icon: Shield,
    title: "Children's Privacy",
    body: [
      "Projexino is a B2B workspace platform and is not directed to children under 16.",
      "We do not knowingly collect personal information from minors.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div data-testid="page-privacy" className="bg-canvas min-h-screen pt-32 pb-20">
      <SEO title="Privacy Policy" description="Privacy policy for Projexino — how we collect, use and protect your data." canonical="/privacy" />
      <div className="mx-auto max-w-3xl px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#F97316]">// legal</div>
          <h1 className="font-display mt-2 text-4xl font-medium text-[#0F2042] sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-slate-500">Last updated · February 20, 2026</p>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mt-8 rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm leading-relaxed text-slate-600 shadow-sm">
          Projexino Solutions Pvt Ltd ("Projexino", "we", "us") provides an integrated workspace
          platform for service teams. This policy explains what personal data we collect, why we
          collect it, how we store it, and the rights you have over it. By using the platform you
          agree to the practices described below.
        </motion.p>

        <div className="mt-8 space-y-6">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.section key={s.title}
                initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-white">
                    <Icon size={18} />
                  </div>
                  <h2 className="font-display text-xl font-semibold text-[#0F2042]">{s.title}</h2>
                </div>
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                  {s.body.map((line, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#F97316]" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </motion.section>
            );
          })}
        </div>

        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="mt-10 rounded-3xl border border-orange-200 bg-orange-50/60 p-6 text-sm leading-relaxed text-slate-700">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Contact us</h3>
          <p className="mt-2">
            Privacy questions? Email <a href="mailto:privacy@projexino.com" className="font-semibold text-[#F97316] hover:underline">privacy@projexino.com</a> or write to
            our Data Protection Officer at Projexino Solutions Pvt Ltd, India.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
