import { motion } from "framer-motion";
import { ScrollText, Scale, Ban, CreditCard, Gavel, RefreshCcw } from "lucide-react";
import SEO from "@/components/SEO";

const SECTIONS = [
  {
    icon: ScrollText,
    title: "Acceptance of Terms",
    body: [
      "By accessing or using the Projexino platform, you agree to these Terms of Service and our Privacy Policy.",
      "If you are accepting on behalf of an organisation, you represent that you are authorised to bind that organisation.",
      "Use of the platform constitutes acceptance of any updates to these terms posted on this page.",
    ],
  },
  {
    icon: Scale,
    title: "Your Account",
    body: [
      "You are responsible for safeguarding your account credentials and for all activity that occurs under your account.",
      "You must notify us immediately of any unauthorised access at security@projexino.com.",
      "Accounts may be seeded by Projexino administrators on behalf of organisations; account holders retain full control over their personal data once signed in.",
      "Workspace roles (Admin, Manager, HR, Team Member, Intern) carry specific permissions and obligations described in the platform documentation.",
    ],
  },
  {
    icon: Ban,
    title: "Acceptable Use",
    body: [
      "You may not use Projexino to send spam, infringe IP rights, distribute malware, or violate any applicable law.",
      "Reverse-engineering, scraping, or bypassing security controls is strictly prohibited.",
      "Mass-email campaigns sent through the platform must comply with CAN-SPAM, GDPR, and other applicable anti-spam laws — including a working unsubscribe path and accurate sender identity.",
      "Abusive or harassing behaviour in chat / messaging will result in account suspension.",
    ],
  },
  {
    icon: CreditCard,
    title: "Subscriptions, Billing & Refunds",
    body: [
      "Paid plans (if applicable to your workspace) are billed in the currency and frequency shown at checkout.",
      "All fees are non-refundable except where required by law.",
      "Projexino reserves the right to update pricing on 30 days' written notice.",
      "Invoices generated inside the Finance module are between the workspace owner and their clients; Projexino is not a party to those transactions.",
    ],
  },
  {
    icon: RefreshCcw,
    title: "Suspension & Termination",
    body: [
      "We may suspend or terminate your access immediately for breach of these terms.",
      "You may delete your account at any time from Settings → Account.",
      "Upon termination, we will delete or anonymise your personal data within 30 days, except where retention is legally required.",
    ],
  },
  {
    icon: Gavel,
    title: "Disclaimers & Liability",
    body: [
      "The platform is provided \"as is\" without warranties of any kind, express or implied.",
      "To the maximum extent permitted by law, Projexino is not liable for indirect, incidental, or consequential damages.",
      "Our total liability for any claim is capped at the fees you paid to Projexino in the 12 months preceding the claim.",
      "These terms are governed by the laws of India; disputes will be resolved in the courts of Bengaluru.",
    ],
  },
];

export default function TermsOfService() {
  return (
    <div data-testid="page-terms" className="bg-canvas min-h-screen pt-32 pb-20">
      <SEO title="Terms of Service" description="Projexino's Terms of Service governing your use of our platform and engagements." canonical="/terms" />
      <div className="mx-auto max-w-3xl px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#F97316]">// legal</div>
          <h1 className="font-display mt-2 text-4xl font-medium text-[#0F2042] sm:text-5xl">
            Terms &amp; Conditions
          </h1>
          <p className="mt-3 text-sm text-slate-500">Last updated · February 20, 2026</p>
        </motion.div>

        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mt-8 rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm leading-relaxed text-slate-600 shadow-sm">
          Welcome to Projexino. These Terms of Service ("Terms") govern your use of the Projexino
          workspace platform, including marketing pages, the role-based portals (Admin, Manager,
          HR, Team Member, Intern), and any APIs we expose. Please read them carefully.
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#0F2042] to-[#F97316] text-white">
                    <Icon size={18} />
                  </div>
                  <h2 className="font-display text-xl font-semibold text-[#0F2042]">{s.title}</h2>
                </div>
                <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                  {s.body.map((line, j) => (
                    <li key={j} className="flex gap-2">
                      <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#0F2042]" />
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
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Questions?</h3>
          <p className="mt-2">
            Contact us at <a href="mailto:legal@projexino.com" className="font-semibold text-[#F97316] hover:underline">legal@projexino.com</a> for any
            clarification on these terms.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
