/**
 * PrivacyPolicy.jsx — App-store-ready privacy policy.
 *
 * Covers (in this order):
 *  1. What we collect & why ............ Data Safety form (Play Store)
 *  2. Android permissions ............... Play Store Data Safety + Permissions
 *  3. iOS permissions ................... App Store Privacy Nutrition Labels
 *  4. How we use your data ............... Purpose-limited list
 *  5. Data sharing / third parties ...... SDK + processor list
 *  6. Data storage & security
 *  7. Data retention
 *  8. Your rights (GDPR / CCPA / DPDP)
 *  9. Children's privacy
 *  10. International transfers
 *  11. Push notifications
 *  12. Changes to this policy
 *  13. Contact us
 */
import { motion } from "framer-motion";
import {
  Shield, Lock, FileCheck, Cookie, UserCheck, Mail, Camera, Mic, MapPin,
  Bell, Image as ImageIcon, Fingerprint, Database, Globe2, Trash2, AlertTriangle,
  Smartphone, Apple, Phone, RefreshCw,
} from "lucide-react";
import SEO from "@/components/SEO";

/* ---------- Android permissions (Play Store Data Safety required) ---------- */
const ANDROID_PERMISSIONS = [
  {
    perm: "INTERNET, ACCESS_NETWORK_STATE",
    purpose: "Required for all platform connectivity — login, syncing tasks, projects, chat, and uploads.",
    optional: false,
  },
  {
    perm: "CAMERA",
    purpose: "Record video testimonials, capture profile photos, scan documents/QR codes, attach photos to chat or expense receipts.",
    optional: true,
  },
  {
    perm: "RECORD_AUDIO",
    purpose: "Record audio for video testimonials and (where enabled) voice notes inside the in-app chat.",
    optional: true,
  },
  {
    perm: "READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO",
    purpose: "Pick existing photos / videos / audio from the device gallery to attach to chats, tasks, testimonials and HR documents (Android 13+ scoped media).",
    optional: true,
  },
  {
    perm: "READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE (≤Android 12)",
    purpose: "Save exported reports (PDF / CSV) and downloaded files to your device for offline use. Limited to app-scoped storage on Android 11+.",
    optional: true,
  },
  {
    perm: "POST_NOTIFICATIONS (Android 13+)",
    purpose: "Show push notifications for tasks, approvals, messages, lead replies, and attendance reminders.",
    optional: true,
  },
  {
    perm: "ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION",
    purpose: "Geo-tag attendance check-ins and field visits, and discover nearby business leads inside Outreach → Google Maps Lead Discovery. Location is only captured while you actively use those features.",
    optional: true,
  },
  {
    perm: "ACCESS_BACKGROUND_LOCATION",
    purpose: "(Optional) Maintain attendance check-in while the app is backgrounded for field staff. Off by default — must be granted explicitly.",
    optional: true,
  },
  {
    perm: "READ_CONTACTS",
    purpose: "(Optional) Quickly invite teammates or import client contacts into the CRM. Never uploaded without explicit user action.",
    optional: true,
  },
  {
    perm: "USE_BIOMETRIC, USE_FINGERPRINT",
    purpose: "Allow biometric (fingerprint / face) unlock instead of typing the password each time.",
    optional: true,
  },
  {
    perm: "FOREGROUND_SERVICE, WAKE_LOCK",
    purpose: "Keep the chat / sync connection alive during active sessions and during long-running uploads.",
    optional: true,
  },
  {
    perm: "SCHEDULE_EXACT_ALARM, RECEIVE_BOOT_COMPLETED",
    purpose: "Reliably trigger scheduled task reminders, meeting alerts and attendance prompts even after a device reboot.",
    optional: true,
  },
  {
    perm: "VIBRATE",
    purpose: "Provide haptic feedback for incoming chat messages and time-sensitive notifications.",
    optional: true,
  },
  {
    perm: "READ_CALENDAR, WRITE_CALENDAR",
    purpose: "(Optional) Sync approved leave / PTO and project milestones with the device calendar.",
    optional: true,
  },
];

/* ---------- iOS permissions (App Store privacy nutrition labels) ---------- */
const IOS_PERMISSIONS = [
  {
    perm: "NSCameraUsageDescription",
    purpose: "PROJEXINO uses the camera to record video testimonials, capture profile photos, scan documents and attach images to chats and tasks.",
  },
  {
    perm: "NSMicrophoneUsageDescription",
    purpose: "PROJEXINO uses the microphone to record audio inside video testimonials and (where enabled) voice notes.",
  },
  {
    perm: "NSPhotoLibraryUsageDescription",
    purpose: "PROJEXINO accesses your photo library so you can select photos and videos to attach to chats, tasks, testimonials and HR documents.",
  },
  {
    perm: "NSPhotoLibraryAddUsageDescription",
    purpose: "PROJEXINO can save exported reports, generated QR codes and downloaded attachments to your photo library when you choose to do so.",
  },
  {
    perm: "NSLocationWhenInUseUsageDescription",
    purpose: "PROJEXINO uses your location to geo-tag attendance check-ins, log field visits and discover nearby business leads inside Outreach. Only captured while you actively use those features.",
  },
  {
    perm: "NSLocationAlwaysAndWhenInUseUsageDescription",
    purpose: "(Optional) Allows continued attendance check-in while the app is backgrounded for field-based staff. Off by default.",
  },
  {
    perm: "NSContactsUsageDescription",
    purpose: "(Optional) Helps you invite teammates and import client contacts into the CRM. Contacts are never uploaded without your explicit action.",
  },
  {
    perm: "NSFaceIDUsageDescription",
    purpose: "Allows you to unlock PROJEXINO with Face ID / Touch ID instead of typing your password.",
  },
  {
    perm: "NSCalendarsUsageDescription",
    purpose: "(Optional) Sync approved leave / PTO and project milestones with your iOS Calendar.",
  },
  {
    perm: "NSUserNotificationsUsageDescription",
    purpose: "Sends time-sensitive task reminders, approval requests, chat messages and lead-reply alerts.",
  },
  {
    perm: "NSBluetoothAlwaysUsageDescription",
    purpose: "(Optional, future) Pair with biometric attendance kiosks deployed at office sites.",
  },
];

/* ---------- Data Safety form (Play Store) — data we collect ---------- */
const DATA_COLLECTED = [
  {
    cat: "Personal identifiers",
    items: "Name, email, phone, profile photo, designation, work-role.",
    purpose: "Account creation, role-based access, HR records.",
    shared: "No",
  },
  {
    cat: "Authentication data",
    items: "Encrypted password (bcrypt), Google OAuth refresh tokens (encrypted at rest).",
    purpose: "Login and Gmail sending — never displayed to other users.",
    shared: "No",
  },
  {
    cat: "Workspace content",
    items: "Projects, tasks, leads, chats, documents, testimonials, invoices, attachments.",
    purpose: "Core productivity functionality.",
    shared: "Only inside your workspace.",
  },
  {
    cat: "Media files",
    items: "Photos, videos, audio recordings, PDFs you upload.",
    purpose: "Chat attachments, testimonials, HR documents, expense receipts.",
    shared: "Only with workspace members you grant access.",
  },
  {
    cat: "Location (approximate & precise)",
    items: "GPS coordinates captured during attendance check-in or Google Maps lead discovery.",
    purpose: "Geo-tagged attendance and nearby-lead search.",
    shared: "No",
  },
  {
    cat: "Device & technical data",
    items: "Device model, OS version, app version, language, IP, crash logs.",
    purpose: "Stability, debugging and abuse detection.",
    shared: "Crash logs may be sent to Sentry / Crashlytics — anonymised, no PII.",
  },
  {
    cat: "Usage analytics",
    items: "Screens visited, actions taken, feature engagement (aggregate).",
    purpose: "Product improvement and admin dashboards.",
    shared: "No",
  },
  {
    cat: "Push tokens",
    items: "FCM / APNs device tokens.",
    purpose: "Deliver push notifications to your specific device.",
    shared: "Only with Google FCM / Apple APNs to route notifications.",
  },
];

/* ---------- Third-party processors / SDKs ---------- */
const THIRD_PARTIES = [
  { name: "Google OAuth + Gmail API", purpose: "Sign-in and sending outreach / testimonial emails on your behalf." },
  { name: "Google Maps & Places API", purpose: "Discover business leads inside Outreach." },
  { name: "MongoDB Atlas", purpose: "Encrypted database hosting." },
  { name: "Emergent Universal LLM key (Anthropic Claude, Google Gemini, OpenAI)", purpose: "Power AI features — cold-email drafting, AI reply assistant, content suggestions. Prompts and outputs are processed in transit only; we do not train models on your data." },
  { name: "Firebase Cloud Messaging (FCM) & Apple Push Notification service (APNs)", purpose: "Mobile push delivery." },
  { name: "Google (Gmail API / OAuth)", purpose: "Sending transactional and business emails you explicitly trigger." },
  { name: "Sentry / Google Crashlytics", purpose: "Anonymised crash and error reporting." },
];

/* ---------- Generic policy sections ---------- */
const SECTIONS = [
  {
    icon: FileCheck,
    title: "How We Use Your Information",
    body: [
      "Authenticate you and authorise access to role-specific portals (Admin / Manager / HR / Team Member / Intern).",
      "Power the AI assistant, email-template generator, AI reply drafter and mass-email campaigns you initiate.",
      "Render attendance, presence, finance, project, and testimonial dashboards for authorised admins.",
      "Send transactional and push notifications, plus the campaign / outreach emails you compose.",
      "Process subscription payments and generate tax-compliant invoices (when applicable).",
      "Improve product quality and detect abuse, fraud, or policy violations.",
    ],
  },
  {
    icon: Lock,
    title: "Data Storage & Security",
    body: [
      "All traffic flows over HTTPS / TLS 1.2+. Passwords are hashed with bcrypt; auth uses signed JWT tokens.",
      "Workspace data is stored in MongoDB Atlas with at-rest AES-256 encryption and regular automated backups.",
      "Uploaded media (videos, images, documents) lives on hardened object storage with signed-URL access.",
      "Gmail / Google OAuth tokens are stored encrypted and used only for the scopes you grant.",
      "Access is gated by role-based controls; least-privilege principles apply throughout the platform.",
      "We perform annual third-party security reviews and continuous dependency vulnerability scanning.",
    ],
  },
  {
    icon: Database,
    title: "Data Retention",
    body: [
      "Active workspace data is retained for as long as your account is active.",
      "Deleted records are kept in encrypted backups for up to 30 days before permanent purge.",
      "Authentication logs are retained for 12 months for security audits.",
      "Closed accounts and all associated personal data are purged within 30 days of a verified deletion request.",
      "Anonymous / aggregated analytics may be retained indefinitely (cannot be linked back to you).",
    ],
  },
  {
    icon: Cookie,
    title: "Cookies & Tracking",
    body: [
      "A single httpOnly auth cookie (access_token) plus a handful of localStorage keys for UI preferences (e.g. pj_intro_seen, pj_role).",
      "No third-party advertising, retargeting, or cross-site tracking cookies are set.",
      "Cookies are restricted to the same site and the API host you authenticate against.",
    ],
  },
  {
    icon: Mail,
    title: "Your Rights (GDPR / CCPA / India DPDP)",
    body: [
      "Access — request a copy of your account and workspace data.",
      "Correction — update any incorrect personal data from your Profile page.",
      "Erasure / 'Right to be forgotten' — request deletion of your account and associated data; admins can perform this from the Settings panel or email privacy@projexino.com.",
      "Portability — export project, finance, lead and task data as PDF / CSV.",
      "Opt-out of marketing — unsubscribe from any non-essential email by clicking the unsubscribe link, replying STOP, or contacting privacy@projexino.com.",
      "Withdraw consent for sensitive permissions (camera, mic, location, contacts, calendar) at any time from your device's system Settings → Projexino → Permissions.",
      "Lodge a complaint with your local data-protection authority if you believe your rights are being violated.",
    ],
  },
  {
    icon: Globe2,
    title: "International Data Transfers",
    body: [
      "Projexino is operated from India. Our cloud infrastructure is located in regional MongoDB Atlas data centers (asia-south1 / us-east1 depending on plan).",
      "Where data is transferred across borders we rely on Standard Contractual Clauses (SCCs) and equivalent safeguards as required by GDPR.",
      "If you are an EEA / UK / Swiss resident you can request a copy of the SCCs from privacy@projexino.com.",
    ],
  },
  {
    icon: Bell,
    title: "Push Notifications",
    body: [
      "We use Firebase Cloud Messaging (Android) and Apple Push Notification service (iOS) to deliver task reminders, approval requests, chat messages, lead-reply alerts and attendance prompts.",
      "Push tokens are stored against your account and are deleted when you log out or revoke notifications.",
      "You can disable any notification category at any time from Settings → Notifications inside the app, or from your device's system settings.",
    ],
  },
  {
    icon: Shield,
    title: "Children's Privacy",
    body: [
      "PROJEXINO is a B2B workspace platform and is not directed to children under 16 (under 13 in the United States).",
      "We do not knowingly collect personal information from minors. If you believe a child has provided us personal data, contact privacy@projexino.com and we will delete it.",
    ],
  },
  {
    icon: RefreshCw,
    title: "Changes to This Policy",
    body: [
      "We may update this policy from time to time. When we make material changes, we will notify you in-app and via email at least 14 days before the change takes effect.",
      "The 'Last updated' date at the top of this page is always current. Continued use of PROJEXINO after the effective date constitutes acceptance of the updated policy.",
    ],
  },
];

export default function PrivacyPolicy() {
  return (
    <div data-testid="page-privacy" className="bg-canvas min-h-screen pt-32 pb-20">
      <SEO
        title="Privacy Policy"
        description="Privacy policy for PROJEXINO — what data we collect, the Android and iOS permissions our mobile app uses, and how to manage your rights."
        canonical="/privacy"
      />
      <div className="mx-auto max-w-4xl px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <div className="text-xs font-bold uppercase tracking-[0.32em] text-[#F97316]">// legal</div>
          <h1 className="font-display mt-2 text-4xl font-medium text-[#0F2042] sm:text-5xl">Privacy Policy</h1>
          <p className="mt-3 text-sm text-slate-500">Last updated · February 26, 2026 &nbsp;·&nbsp; Effective · March 1, 2026</p>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">GDPR ready</span>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-700">CCPA ready</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">India DPDP 2023</span>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Play Store · Data Safety</span>
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">App Store · Privacy Labels</span>
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="mt-8 rounded-3xl border border-slate-200 bg-white/80 p-6 text-sm leading-relaxed text-slate-600 shadow-sm"
        >
          PROJEXINO Solutions Pvt Ltd (&ldquo;PROJEXINO&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) provides an integrated workspace
          platform — accessible via web at <span className="font-mono">app.projexino.com</span> and via our
          mobile apps on the <b>Google Play Store</b> and <b>Apple App Store</b>. This policy explains what
          personal data we collect, the device permissions our mobile apps request, why we collect them,
          how we store them, the third parties we share data with, and the rights you have over your data.
          By using the platform you agree to the practices described below.
        </motion.p>

        {/* 1. What we collect — Data Safety form */}
        <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="privacy-data-safety">
          <SectionHeader icon={UserCheck} title="1. Information We Collect" />
          <p className="mt-3 text-sm text-slate-600">
            This maps 1-to-1 to the Play Store Data Safety form and the App Store Privacy Nutrition Label.
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Data points</th>
                  <th className="px-3 py-2 text-left">Purpose</th>
                  <th className="px-3 py-2 text-left">Shared with third parties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {DATA_COLLECTED.map((row) => (
                  <tr key={row.cat} className="align-top">
                    <td className="px-3 py-2 font-bold text-[#0F2042]">{row.cat}</td>
                    <td className="px-3 py-2 text-slate-600">{row.items}</td>
                    <td className="px-3 py-2 text-slate-600">{row.purpose}</td>
                    <td className="px-3 py-2 text-slate-600">{row.shared}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2. Android permissions */}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="privacy-android-perms">
          <SectionHeader icon={Smartphone} title="2. Android (Google Play) Permissions" accent="#3DDC84" />
          <p className="mt-3 text-sm text-slate-600">
            The PROJEXINO Android app declares the following permissions in its <span className="font-mono">AndroidManifest.xml</span>.
            All optional permissions can be denied without breaking core functionality — the related feature simply becomes unavailable until you re-grant it.
          </p>
          <PermissionTable rows={ANDROID_PERMISSIONS.map((r) => ({
            perm: r.perm,
            badge: r.optional ? "Optional" : "Required",
            badgeClass: r.optional ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700",
            purpose: r.purpose,
          }))} />
        </section>

        {/* 3. iOS permissions */}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="privacy-ios-perms">
          <SectionHeader icon={Apple} title="3. iOS (App Store) Permissions" accent="#0F2042" />
          <p className="mt-3 text-sm text-slate-600">
            The PROJEXINO iOS app declares the following usage descriptions in its <span className="font-mono">Info.plist</span>.
            iOS prompts you the first time each permission is needed; you can change any of them later from <b>Settings → Projexino → Permissions</b>.
          </p>
          <PermissionTable rows={IOS_PERMISSIONS.map((r) => ({
            perm: r.perm,
            badge: "Prompted",
            badgeClass: "bg-sky-100 text-sky-700",
            purpose: r.purpose,
          }))} />
        </section>

        {/* 4. Permission icons quick reference */}
        <section className="mt-6 rounded-3xl border border-violet-100 bg-violet-50/40 p-6" data-testid="privacy-perms-summary">
          <h2 className="font-display text-lg font-semibold text-[#0F2042]">At-a-glance permission summary</h2>
          <p className="mt-1 text-xs text-slate-600">Tap any tile for the matching detail above.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Camera, label: "Camera" },
              { icon: Mic, label: "Microphone" },
              { icon: ImageIcon, label: "Photos / Media" },
              { icon: MapPin, label: "Location" },
              { icon: Bell, label: "Notifications" },
              { icon: Fingerprint, label: "Biometrics" },
              { icon: Phone, label: "Contacts (optional)" },
              { icon: RefreshCw, label: "Calendar (optional)" },
            ].map((p) => (
              <div key={p.label} className="flex items-center gap-2 rounded-2xl border border-white bg-white p-3 shadow-sm">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F97316] to-[#A855F7] text-white">
                  <p.icon size={16} />
                </span>
                <span className="text-xs font-bold text-[#0F2042]">{p.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Third-party processors */}
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="privacy-third-parties">
          <SectionHeader icon={Globe2} title="4. Third-Party Services & Sub-Processors" />
          <p className="mt-3 text-sm text-slate-600">
            We share strictly limited data with the following processors purely to deliver the service. They are contractually bound by
            data-processing agreements that prohibit using your data for any unrelated purpose.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {THIRD_PARTIES.map((tp) => (
              <li key={tp.name} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-[#F97316]" />
                <span><b className="text-[#0F2042]">{tp.name}</b> — {tp.purpose}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 6-13. Other policy sections */}
        <div className="mt-6 space-y-6">
          {SECTIONS.map((s, i) => (
            <motion.section key={s.title}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
              data-testid={`privacy-section-${i}`}
            >
              <SectionHeader icon={s.icon} title={`${i + 5}. ${s.title}`} />
              <ul className="mt-4 space-y-2 text-sm leading-relaxed text-slate-600">
                {s.body.map((line, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-[#F97316]" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </motion.section>
          ))}
        </div>

        {/* Account deletion CTA — required by Play Store */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="mt-10 rounded-3xl border border-rose-200 bg-rose-50/60 p-6 text-sm leading-relaxed text-slate-700"
          data-testid="privacy-account-delete"
        >
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-500 text-white"><Trash2 size={18}/></span>
            <h3 className="font-display text-lg font-semibold text-[#0F2042]">Account &amp; Data Deletion</h3>
          </div>
          <p className="mt-3">
            You can delete your PROJEXINO account and all associated personal data at any time:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">
            <li>In the app — Settings → Account → <b>Delete my account</b></li>
            <li>By email — send &ldquo;DELETE MY ACCOUNT&rdquo; from your registered email to <a href="mailto:privacy@projexino.com" className="font-bold text-[#F97316] hover:underline">privacy@projexino.com</a></li>
            <li>Externally — visit <a href="/account-deletion" className="font-bold text-[#F97316] hover:underline">/account-deletion</a> to file a request without logging in (per Play Store policy)</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">Deletion is permanent. We process all valid requests within 30 days.</p>
        </motion.div>

        {/* Contact */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
          className="mt-6 rounded-3xl border border-orange-200 bg-orange-50/60 p-6 text-sm leading-relaxed text-slate-700">
          <h3 className="font-display text-lg font-semibold text-[#0F2042]">Contact &amp; Data Protection Officer</h3>
          <p className="mt-2">
            Privacy questions, access requests or complaints? Email <a href="mailto:privacy@projexino.com" className="font-semibold text-[#F97316] hover:underline">privacy@projexino.com</a>.
            For postal mail, write to:
          </p>
          <address className="mt-3 not-italic text-sm text-slate-700">
            <b>Data Protection Officer</b><br/>
            PROJEXINO Solutions Pvt Ltd<br/>
            India<br/>
            Email · <a href="mailto:privacy@projexino.com" className="font-semibold text-[#F97316] hover:underline">privacy@projexino.com</a>
          </address>
        </motion.div>
      </div>
    </div>
  );
}

/* -------------- helpers -------------- */
function SectionHeader({ icon: Icon, title, accent }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
        style={{ background: accent || "linear-gradient(135deg, #F97316, #A855F7)" }}
      >
        <Icon size={18} />
      </div>
      <h2 className="font-display text-xl font-semibold text-[#0F2042]">{title}</h2>
    </div>
  );
}

function PermissionTable({ rows }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full text-xs">
        <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left" style={{ minWidth: 220 }}>Permission</th>
            <th className="px-3 py-2 text-left">Type</th>
            <th className="px-3 py-2 text-left">Why we use it</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.perm} className="align-top">
              <td className="px-3 py-2 font-mono text-[11px] font-bold text-[#0F2042]">{row.perm}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${row.badgeClass}`}>
                  {row.badge}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-600">{row.purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
