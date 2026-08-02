// 8 hand-crafted email-design presets. Each preset returns inline-styled
// inner-body HTML that the EmailTemplate editor wraps inside the Projexino
// branded shell at render time. They use {{variables}} where appropriate so
// the user can swap names, dates, CTAs, etc. immediately.

const PROJEXINO_LOGO_URL = "https://projexino.com/logo.png"; // replace if hosted elsewhere

export const TEMPLATE_PRESETS = [
  {
    id: "starter",
    name: "Starter",
    description: "Classic brand intro with a single CTA button.",
    swatch: ["#F97316", "#0F2042", "#FFF7ED"],
    preview_emoji: "✉️",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 12px;font-size:15px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 16px;line-height:1.55;">Welcome to <b>Projexino</b>! Your workspace is ready and your role is <b>{{role}}</b>.</p>
  <p style="background:#FFF7ED;border-left:4px solid #F97316;padding:12px 16px;border-radius:8px;margin:0 0 22px;">
    Click below to head straight to your portal — your dashboard is waiting.
  </p>
  <p style="text-align:center;margin:28px 0;">
    <a href="{{login_url}}" style="background:linear-gradient(135deg,#F97316,#A855F7);color:white;padding:13px 28px;border-radius:9999px;text-decoration:none;font-weight:700;display:inline-block;">Open Portal →</a>
  </p>
  <p style="margin:0;color:#475569;font-size:14px;">Cheers,<br/>The Projexino team</p>
</div>`,
  },
  {
    id: "neon-hero",
    name: "Neon Hero",
    description: "Big gradient hero banner with floating orbs.",
    swatch: ["#A855F7", "#0F2042", "#F97316"],
    preview_emoji: "🌌",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="background:radial-gradient(circle at 30% 30%, #F97316 0%, #A855F7 45%, #0F2042 100%);border-radius:20px;padding:36px 28px;color:white;text-align:center;position:relative;overflow:hidden;">
    <div style="font-size:11px;letter-spacing:0.32em;font-weight:700;color:#FED7AA;text-transform:uppercase;">// announcement</div>
    <div style="font-size:30px;font-weight:600;margin:10px 0 6px;line-height:1.1;">Something big just launched.</div>
    <div style="font-size:14px;opacity:0.85;">Hey {{name}} — we shipped what you've been waiting for.</div>
    <p style="margin:24px 0 0;">
      <a href="{{login_url}}" style="background:white;color:#0F2042;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:800;display:inline-block;">See what's new</a>
    </p>
  </div>
  <p style="margin:22px 0 12px;color:#0F2042;line-height:1.55;">Open your dashboard and you'll see the new features highlighted with a fresh ✨ badge. Tap any of them for a 30-second tour.</p>
  <p style="margin:0;color:#475569;font-size:13px;">— Projexino crew</p>
</div>`,
  },
  {
    id: "minimal-mono",
    name: "Minimal Mono",
    description: "Editorial, typography-first, single accent line.",
    swatch: ["#0F2042", "#F97316", "#FFFFFF"],
    preview_emoji: "📰",
    body_html: `<div style="font-family:Georgia,'Times New Roman',serif;color:#0F2042;line-height:1.7;">
  <div style="border-top:3px solid #F97316;padding-top:16px;margin-bottom:8px;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#F97316;font-weight:700;">// dispatch</div>
  <h1 style="font-size:26px;line-height:1.2;margin:0 0 16px;font-weight:400;">A short letter for you, {{name}}.</h1>
  <p>It's been an eventful month at Projexino — and we wanted to share three things with you that you'd appreciate.</p>
  <ol style="padding-left:18px;">
    <li>We rolled out faster invoice rendering across the board.</li>
    <li>The AI assistant now answers in your team's preferred tone.</li>
    <li>Templates (this one included) finally feel as nice as the apps that send them.</li>
  </ol>
  <p>Reply directly to this email — we read every word.</p>
  <p style="margin-top:26px;font-style:italic;">— Projexino</p>
</div>`,
  },
  {
    id: "invoice-card",
    name: "Invoice / Receipt",
    description: "Clean transactional layout with itemised totals.",
    swatch: ["#10B981", "#0F2042", "#F0FDF4"],
    preview_emoji: "🧾",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 6px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;">Thanks for your business. Here's your latest invoice from Projexino.</p>
  <div style="border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
    <div style="background:#0F2042;color:white;padding:14px 18px;display:flex;justify-content:space-between;">
      <div style="font-weight:700;">Invoice #{{invoice_number}}</div>
      <div style="opacity:0.7;font-size:13px;">Due {{due_date}}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr style="background:#F8FAFC;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:#64748B;">
        <td style="padding:10px 14px;">Item</td><td style="padding:10px 14px;text-align:right;">Amount</td>
      </tr>
      <tr><td style="padding:12px 14px;border-top:1px solid #F1F5F9;">{{item_1}}</td><td style="padding:12px 14px;text-align:right;border-top:1px solid #F1F5F9;">{{amount_1}}</td></tr>
      <tr><td style="padding:12px 14px;border-top:1px solid #F1F5F9;">{{item_2}}</td><td style="padding:12px 14px;text-align:right;border-top:1px solid #F1F5F9;">{{amount_2}}</td></tr>
      <tr style="background:#F0FDF4;font-weight:700;"><td style="padding:14px;border-top:2px solid #10B981;">Total</td><td style="padding:14px;text-align:right;border-top:2px solid #10B981;color:#10B981;font-size:18px;">{{amount}}</td></tr>
    </table>
  </div>
  <p style="margin:22px 0;text-align:center;">
    <a href="{{invoice_url}}" style="background:#10B981;color:white;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:700;">Pay now</a>
  </p>
  <p style="margin:0;font-size:12px;color:#64748B;">Reply to this email if anything looks off — we're a quick reply away.</p>
</div>`,
  },
  {
    id: "dark-mode",
    name: "Dark Mode",
    description: "Bold dark canvas with neon accents.",
    swatch: ["#0F0F23", "#F97316", "#A855F7"],
    preview_emoji: "🌙",
    body_html: `<div style="background:#0F0F23;color:#F1F5F9;padding:32px 28px;border-radius:18px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="font-size:10px;letter-spacing:0.36em;font-weight:700;color:#FB923C;text-transform:uppercase;">// product update</div>
  <h1 style="font-size:28px;line-height:1.15;margin:8px 0 12px;color:white;">{{name}}, here's what shipped this week.</h1>
  <p style="opacity:0.85;line-height:1.6;">A round-up of new features, fixes and small delights — designed to make your day smoother.</p>
  <div style="display:block;margin:22px 0;">
    <div style="background:rgba(168,85,247,0.18);border:1px solid rgba(168,85,247,0.4);border-radius:12px;padding:14px 16px;margin-bottom:10px;">
      <div style="font-weight:700;color:#C4B5FD;font-size:13px;">⚡ Faster invoices</div>
      <div style="font-size:13px;opacity:0.85;margin-top:3px;">PDF generation is now 3.2× faster, with embedded fonts for every currency.</div>
    </div>
    <div style="background:rgba(249,115,22,0.18);border:1px solid rgba(249,115,22,0.4);border-radius:12px;padding:14px 16px;">
      <div style="font-weight:700;color:#FED7AA;font-size:13px;">🎯 Smarter AI assist</div>
      <div style="font-size:13px;opacity:0.85;margin-top:3px;">The assistant now respects your team's tone and recent decisions.</div>
    </div>
  </div>
  <p style="text-align:center;margin:26px 0 4px;">
    <a href="{{login_url}}" style="background:linear-gradient(135deg,#F97316,#A855F7);color:white;padding:13px 28px;border-radius:9999px;text-decoration:none;font-weight:800;">Take a look</a>
  </p>
</div>`,
  },
  {
    id: "celebrate",
    name: "Celebrate",
    description: "Confetti / milestone with badge graphic.",
    swatch: ["#FBBF24", "#F97316", "#FB923C"],
    preview_emoji: "🎉",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;text-align:center;">
  <div style="font-size:56px;line-height:1;margin-bottom:8px;">🎉</div>
  <h1 style="font-size:28px;line-height:1.15;margin:0 0 6px;">Congratulations, {{name}}!</h1>
  <p style="margin:0 0 22px;color:#475569;">You just unlocked the <b>{{milestone}}</b> milestone.</p>
  <div style="display:inline-block;background:radial-gradient(circle at 30% 30%, #FBBF24, #F97316);padding:22px 28px;border-radius:9999px;color:white;font-weight:800;font-size:15px;letter-spacing:0.04em;box-shadow:0 12px 28px -8px rgba(249,115,22,0.5);">
    🏅 {{badge_name}}
  </div>
  <p style="margin:22px 18px 16px;color:#0F2042;line-height:1.55;">Hard work pays off. Your peers can already see this on your profile. Keep the momentum going!</p>
  <p style="margin:0;">
    <a href="{{login_url}}" style="background:#0F2042;color:white;padding:11px 22px;border-radius:9999px;text-decoration:none;font-weight:700;">View your badge wall</a>
  </p>
</div>`,
  },
  {
    id: "newsletter",
    name: "Newsletter",
    description: "Two-column issue with featured story and tips.",
    swatch: ["#0F2042", "#F97316", "#F1F5F9"],
    preview_emoji: "📨",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <div style="background:#F1F5F9;padding:18px 20px;border-radius:14px;margin-bottom:18px;">
    <div style="font-size:10px;letter-spacing:0.32em;font-weight:800;color:#F97316;text-transform:uppercase;">// projexino weekly · issue {{issue_no}}</div>
    <h1 style="font-size:24px;line-height:1.2;margin:6px 0 0;">{{headline}}</h1>
  </div>
  <p style="line-height:1.6;margin:0 0 14px;">Hi {{name}}, here's what worth your three minutes this week.</p>
  <h3 style="margin:18px 0 6px;color:#F97316;font-size:14px;text-transform:uppercase;letter-spacing:0.12em;">⭐ Featured</h3>
  <div style="background:#FFF7ED;border-left:3px solid #F97316;padding:12px 14px;border-radius:8px;line-height:1.55;">{{featured_story}}</div>
  <h3 style="margin:22px 0 6px;color:#0F2042;font-size:14px;text-transform:uppercase;letter-spacing:0.12em;">📚 Quick reads</h3>
  <ul style="padding-left:20px;line-height:1.7;">
    <li>{{link_1}}</li>
    <li>{{link_2}}</li>
    <li>{{link_3}}</li>
  </ul>
  <p style="margin:22px 0 0;text-align:center;">
    <a href="{{archive_url}}" style="color:#F97316;font-weight:700;text-decoration:underline;">Read past issues →</a>
  </p>
</div>`,
  },
  {
    id: "soft-illustration",
    name: "Soft Illustration",
    description: "Pastel gradient with floating shapes hero.",
    swatch: ["#FCE7F3", "#A855F7", "#F97316"],
    preview_emoji: "🌸",
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <div style="background:linear-gradient(135deg,#FCE7F3 0%, #FFFBEB 50%, #FED7AA 100%);border-radius:20px;padding:30px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:radial-gradient(circle,#F97316 0%, transparent 70%);opacity:0.35;border-radius:9999px;"></div>
    <div style="position:absolute;bottom:-30px;left:-30px;width:140px;height:140px;background:radial-gradient(circle,#A855F7 0%, transparent 70%);opacity:0.25;border-radius:9999px;"></div>
    <div style="position:relative;">
      <div style="font-size:48px;margin-bottom:6px;">🌸</div>
      <h1 style="font-size:26px;font-weight:600;margin:0 0 6px;line-height:1.2;">A gentle hello, {{name}}.</h1>
      <p style="margin:0;color:#475569;line-height:1.55;">Just checking in. You haven't logged into the portal in a while — and we miss you.</p>
    </div>
  </div>
  <p style="margin:20px 0;line-height:1.6;">We've kept your workspace exactly how you left it. Your projects, tasks, and team are all still where they should be. Drop in for a quick look whenever you're ready — no pressure.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="{{login_url}}" style="background:linear-gradient(135deg,#A855F7,#F97316);color:white;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;">Pop into the portal</a>
  </p>
  <p style="margin:0;color:#94A3B8;font-size:12px;text-align:center;">If now isn't the time, just hit reply — we'll wait. 💛</p>
</div>`,
  },
];

export function presetById(id) {
  return TEMPLATE_PRESETS.find((p) => p.id === id) || TEMPLATE_PRESETS[0];
}

// =============================================================
// EVENT PRESETS — pre-built for specific workflows.
// Each event includes the variables that workflow needs by default.
// Pick an event → editor fills subject, body, variables_hint + category.
// =============================================================

const STEP = (n, t) => `<li style="margin-bottom:6px;"><b style="color:#F97316;">Step ${n}:</b> ${t}</li>`;

export const EVENT_PRESETS = [
  // ---------- 1. WELCOME — INTERN ----------
  {
    id: "ev-welcome-intern",
    name: "Welcome an intern",
    description: "Login ID + password + portal URL + first-day checklist.",
    category: "onboarding",
    color: "#10B981",
    icon: "🌱",
    subject: "Welcome to Projexino, {{name}} — your portal is ready",
    variables: ["name", "login_email", "login_password", "login_url", "designation", "start_date", "manager_name", "manager_email"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;font-size:15px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 16px;line-height:1.6;">Welcome to <b>Projexino Solutions</b> 🎉 We're thrilled to have you join us as <b>{{designation}}</b>, starting <b>{{start_date}}</b>.</p>

  <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:14px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:11px;letter-spacing:0.32em;font-weight:800;color:#10B981;text-transform:uppercase;">// your login</div>
    <table style="width:100%;font-size:14px;margin-top:8px;">
      <tr><td style="padding:6px 0;color:#475569;width:120px;">Login portal</td><td><a href="{{login_url}}" style="color:#10B981;font-weight:700;text-decoration:none;">{{login_url}}</a></td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Email / Login ID</td><td><b>{{login_email}}</b></td></tr>
      <tr><td style="padding:6px 0;color:#475569;">Temp password</td><td><code style="background:#FFF7ED;padding:3px 8px;border-radius:6px;color:#F97316;font-weight:800;">{{login_password}}</code></td></tr>
    </table>
    <p style="margin:10px 0 0;font-size:12px;color:#15803D;">💡 You'll be asked to change this password on first sign-in.</p>
  </div>

  <h3 style="font-size:14px;text-transform:uppercase;letter-spacing:0.16em;color:#F97316;margin:22px 0 10px;">What to do in your first 60 minutes</h3>
  <ol style="padding-left:0;list-style:none;margin:0;line-height:1.6;">
    ${STEP(1, "Sign in at <a href=\"{{login_url}}\" style=\"color:#F97316;font-weight:700;\">{{login_url}}</a> with your credentials above and set a new password.")}
    ${STEP(2, "Open <b>My Documents</b> → upload your ID proof, signed offer letter, and academic transcript.")}
    ${STEP(3, "Visit <b>My Tasks</b> → review the onboarding task we've assigned for you.")}
    ${STEP(4, "Say hi in <b>Chat</b> — your mentor <b>{{manager_name}}</b> ({{manager_email}}) is expecting you.")}
    ${STEP(5, "Bookmark this email — it's your reference for week 1.")}
  </ol>

  <p style="margin:24px 0;text-align:center;">
    <a href="{{login_url}}" style="background:linear-gradient(135deg,#10B981,#059669);color:white;padding:13px 32px;border-radius:9999px;text-decoration:none;font-weight:800;display:inline-block;box-shadow:0 12px 24px -8px rgba(16,185,129,0.5);">Open my portal →</a>
  </p>

  <p style="margin:20px 0 0;color:#475569;font-size:14px;">Welcome aboard — we can't wait to see what you build.<br/><b style="color:#0F2042;">The Projexino team</b></p>
</div>`,
  },

  // ---------- 2. WELCOME — TEAM MEMBER ----------
  {
    id: "ev-welcome-member",
    name: "Welcome a team member",
    description: "New full-time hire — credentials + tools + first-week guide.",
    category: "onboarding",
    color: "#F97316",
    icon: "👋",
    subject: "Welcome to the team, {{name}}!",
    variables: ["name", "login_email", "login_password", "login_url", "designation", "department", "start_date", "manager_name"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <div style="background:linear-gradient(135deg,#F97316 0%,#A855F7 100%);border-radius:18px;padding:28px;color:white;text-align:center;margin-bottom:18px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.32em;text-transform:uppercase;opacity:0.85;">// welcome aboard</div>
    <h1 style="font-size:28px;margin:6px 0 4px;line-height:1.15;">Hi {{name}}, welcome to Projexino! 🚀</h1>
    <p style="margin:0;opacity:0.9;font-size:14px;">{{designation}} · {{department}} · Starting {{start_date}}</p>
  </div>

  <p style="line-height:1.6;margin:0 0 16px;">We're excited to have you. Here's everything you need to hit the ground running.</p>

  <div style="border:1px solid #E2E8F0;border-radius:14px;padding:16px 18px;margin:0 0 18px;">
    <div style="font-size:11px;font-weight:800;letter-spacing:0.18em;color:#F97316;text-transform:uppercase;">Your portal credentials</div>
    <table style="width:100%;font-size:14px;margin-top:8px;">
      <tr><td style="padding:4px 0;color:#64748B;">Portal</td><td><a href="{{login_url}}" style="color:#F97316;font-weight:700;text-decoration:none;">{{login_url}}</a></td></tr>
      <tr><td style="padding:4px 0;color:#64748B;">Login ID</td><td><b>{{login_email}}</b></td></tr>
      <tr><td style="padding:4px 0;color:#64748B;">Temp password</td><td><code style="background:#FFF7ED;padding:2px 8px;border-radius:6px;color:#F97316;font-weight:800;">{{login_password}}</code></td></tr>
    </table>
  </div>

  <h3 style="font-size:14px;color:#0F2042;margin:18px 0 8px;">Your first week, simplified</h3>
  <ol style="padding-left:0;list-style:none;margin:0;line-height:1.7;">
    ${STEP(1, "Sign in & change your password.")}
    ${STEP(2, "Fill out your profile, upload photo + ID.")}
    ${STEP(3, "Meet your manager <b>{{manager_name}}</b> — calendar invite is in your inbox.")}
    ${STEP(4, "Tour the portal: Projects, Tasks, Chat, Xino AI, Finance.")}
    ${STEP(5, "Push your first commit / draft / design by Friday — small but yours!")}
  </ol>

  <p style="margin:22px 0;text-align:center;">
    <a href="{{login_url}}" style="background:linear-gradient(135deg,#F97316,#A855F7);color:white;padding:13px 30px;border-radius:9999px;text-decoration:none;font-weight:800;display:inline-block;">Open the portal →</a>
  </p>
  <p style="margin:0;color:#475569;font-size:13px;">— The Projexino team</p>
</div>`,
  },

  // ---------- 3. PROJECT ASSIGNED ----------
  {
    id: "ev-project-assigned",
    name: "Project assigned",
    description: "Notifies a team member they're on a project — name, role, deadline.",
    category: "notification",
    color: "#3B82F6",
    icon: "📌",
    subject: "You've been assigned to {{project_name}}",
    variables: ["name", "project_name", "role_on_project", "client_name", "start_date", "deadline", "project_url", "manager_name", "manager_email"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;">You've just been added to a new project. Here are the details:</p>

  <div style="border:1px solid #DBEAFE;background:#EFF6FF;border-radius:14px;overflow:hidden;margin:0 0 20px;">
    <div style="background:#0F2042;color:white;padding:14px 18px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.32em;color:#93C5FD;text-transform:uppercase;">// project</div>
      <div style="font-size:20px;font-weight:700;line-height:1.2;margin-top:4px;">{{project_name}}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:2px;">Client: <b>{{client_name}}</b></div>
    </div>
    <table style="width:100%;font-size:13px;">
      <tr><td style="padding:10px 18px;color:#1E40AF;width:140px;">Your role</td><td style="padding:10px 18px;font-weight:700;">{{role_on_project}}</td></tr>
      <tr><td style="padding:10px 18px;color:#1E40AF;border-top:1px solid #DBEAFE;">Starts</td><td style="padding:10px 18px;border-top:1px solid #DBEAFE;">{{start_date}}</td></tr>
      <tr><td style="padding:10px 18px;color:#1E40AF;border-top:1px solid #DBEAFE;">Deadline</td><td style="padding:10px 18px;border-top:1px solid #DBEAFE;font-weight:700;color:#DC2626;">{{deadline}}</td></tr>
      <tr><td style="padding:10px 18px;color:#1E40AF;border-top:1px solid #DBEAFE;">Project lead</td><td style="padding:10px 18px;border-top:1px solid #DBEAFE;">{{manager_name}} · <a href="mailto:{{manager_email}}" style="color:#3B82F6;">{{manager_email}}</a></td></tr>
    </table>
  </div>

  <h3 style="font-size:13px;color:#F97316;margin:18px 0 8px;text-transform:uppercase;letter-spacing:0.16em;">What to do now</h3>
  <ol style="padding-left:0;list-style:none;margin:0;line-height:1.7;">
    ${STEP(1, "Open the project page and review the brief.")}
    ${STEP(2, "Sync with <b>{{manager_name}}</b> within 24h.")}
    ${STEP(3, "Add the project to your weekly plan — block focus time.")}
    ${STEP(4, "Drop questions in the project channel — don't wait.")}
  </ol>

  <p style="margin:22px 0;text-align:center;">
    <a href="{{project_url}}" style="background:#3B82F6;color:white;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;">Open project →</a>
  </p>
</div>`,
  },

  // ---------- 4. TASK ASSIGNED ----------
  {
    id: "ev-task-assigned",
    name: "Task assigned",
    description: "Notifies someone of a new task — title, priority, due.",
    category: "notification",
    color: "#A855F7",
    icon: "✅",
    subject: "New task: {{task_title}} — due {{due_date}}",
    variables: ["name", "task_title", "priority", "due_date", "project_name", "task_url", "assigner_name"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;"><b>{{assigner_name}}</b> just assigned you a new task.</p>

  <div style="border-left:4px solid #A855F7;background:#FAF5FF;border-radius:0 12px 12px 0;padding:14px 18px;margin:0 0 20px;">
    <div style="font-size:11px;color:#A855F7;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;">{{priority}} priority</div>
    <div style="font-size:18px;font-weight:700;margin:4px 0;">{{task_title}}</div>
    <div style="font-size:13px;color:#64748B;">Project: <b>{{project_name}}</b> · Due <b style="color:#DC2626;">{{due_date}}</b></div>
  </div>

  <p style="margin:0 0 22px;line-height:1.6;">Open the task to read the full brief and add a sub-checklist if you need one.</p>
  <p style="margin:0 0 22px;text-align:center;">
    <a href="{{task_url}}" style="background:linear-gradient(135deg,#A855F7,#7C3AED);color:white;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;">Open task →</a>
  </p>
  <p style="margin:0;color:#475569;font-size:13px;">— Projexino</p>
</div>`,
  },

  // ---------- 5. INVOICE GENERATED ----------
  {
    id: "ev-invoice",
    name: "Invoice generated",
    description: "Sends a client a polished invoice notification.",
    category: "finance",
    color: "#0F2042",
    icon: "🧾",
    subject: "Your invoice {{invoice_number}} from Projexino",
    variables: ["name", "client_company", "invoice_number", "amount", "currency", "issue_date", "due_date", "invoice_url", "payment_link"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;">Thank you for working with <b>Projexino Solutions</b>. Please find your invoice below.</p>

  <div style="border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;margin:0 0 20px;">
    <div style="background:#0F2042;color:white;padding:14px 18px;display:flex;justify-content:space-between;">
      <div><div style="font-size:10px;letter-spacing:0.32em;font-weight:800;color:#FBBF24;text-transform:uppercase;">// invoice</div><div style="font-weight:700;">{{invoice_number}}</div></div>
      <div style="text-align:right;font-size:12px;opacity:0.85;">Issued {{issue_date}}<br/>Due <b>{{due_date}}</b></div>
    </div>
    <table style="width:100%;">
      <tr><td style="padding:14px 18px;color:#64748B;width:50%;">Billed to</td><td style="padding:14px 18px;font-weight:700;">{{client_company}}</td></tr>
      <tr style="background:#FFF7ED;"><td style="padding:18px;color:#F97316;font-weight:800;text-transform:uppercase;font-size:11px;letter-spacing:0.18em;">Amount due</td><td style="padding:18px;text-align:right;font-size:26px;font-weight:800;color:#F97316;">{{currency}}{{amount}}</td></tr>
    </table>
  </div>

  <p style="margin:0 0 20px;text-align:center;">
    <a href="{{payment_link}}" style="background:linear-gradient(135deg,#F97316,#EA580C);color:white;padding:13px 30px;border-radius:9999px;text-decoration:none;font-weight:800;display:inline-block;margin-right:8px;">Pay now →</a>
    <a href="{{invoice_url}}" style="color:#0F2042;padding:13px 22px;border-radius:9999px;border:1px solid #CBD5E1;text-decoration:none;font-weight:700;display:inline-block;">View invoice</a>
  </p>
  <p style="margin:0;color:#475569;font-size:13px;">Questions? Just reply to this email.</p>
</div>`,
  },

  // ---------- 6. PAYMENT REMINDER ----------
  {
    id: "ev-payment-reminder",
    name: "Payment reminder",
    description: "Gentle nudge for an overdue invoice.",
    category: "finance",
    color: "#DC2626",
    icon: "⏰",
    subject: "Reminder: invoice {{invoice_number}} is due {{due_date}}",
    variables: ["name", "invoice_number", "amount", "currency", "due_date", "days_overdue", "payment_link", "invoice_url"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;">Just a friendly reminder that invoice <b>{{invoice_number}}</b> for <b>{{currency}}{{amount}}</b> is due on <b style="color:#DC2626;">{{due_date}}</b> ({{days_overdue}} days from today).</p>

  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:16px;margin:0 0 22px;text-align:center;">
    <div style="color:#DC2626;font-weight:800;font-size:14px;">{{currency}}{{amount}} outstanding</div>
    <a href="{{payment_link}}" style="display:inline-block;margin-top:10px;background:#DC2626;color:white;padding:11px 24px;border-radius:9999px;text-decoration:none;font-weight:700;">Pay now</a>
  </div>

  <p style="margin:0;line-height:1.6;color:#475569;font-size:13px;">If you've already paid, please ignore this email. <a href="{{invoice_url}}" style="color:#F97316;">View invoice</a> if you need it again.</p>
</div>`,
  },

  // ---------- 7. CERTIFICATE / COMPLETION ----------
  {
    id: "ev-certificate",
    name: "Certificate of completion",
    description: "Hand-out a digital certificate at end of internship / project.",
    category: "onboarding",
    color: "#FBBF24",
    icon: "🏆",
    subject: "🏆 Congratulations {{name}} — your certificate is ready",
    variables: ["name", "program_name", "duration", "completion_date", "certificate_url", "manager_name"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;text-align:center;">
  <div style="font-size:56px;margin-bottom:6px;">🏆</div>
  <h1 style="font-size:26px;margin:0 0 4px;">Congratulations, {{name}}!</h1>
  <p style="margin:0 0 20px;color:#475569;">You just completed <b>{{program_name}}</b> ({{duration}}) on {{completion_date}}.</p>

  <div style="display:inline-block;background:linear-gradient(135deg,#FBBF24,#F97316);padding:22px 32px;border-radius:18px;color:white;box-shadow:0 16px 32px -10px rgba(249,115,22,0.5);">
    <div style="font-size:10px;font-weight:800;letter-spacing:0.32em;text-transform:uppercase;opacity:0.85;">// official certificate</div>
    <div style="font-size:20px;font-weight:800;margin-top:6px;">{{program_name}}</div>
  </div>

  <p style="margin:24px 18px 16px;line-height:1.6;color:#0F2042;text-align:left;">Your certificate is ready — download it, share it on LinkedIn, or print it. We'll keep a copy on your profile too.</p>
  <p style="text-align:center;margin:0 0 14px;">
    <a href="{{certificate_url}}" style="background:#0F2042;color:white;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;">Download certificate</a>
  </p>
  <p style="margin:18px 0 0;font-size:13px;color:#475569;text-align:left;">It's been a privilege working with you. Stay in touch — <b>{{manager_name}}</b> & the whole Projexino crew.</p>
</div>`,
  },

  // ---------- 8. MEETING INVITE ----------
  {
    id: "ev-meeting",
    name: "Meeting invitation",
    description: "Calendar-style invite with agenda + join link.",
    category: "notification",
    color: "#06B6D4",
    icon: "📅",
    subject: "{{meeting_title}} — {{meeting_date}} at {{meeting_time}}",
    variables: ["name", "meeting_title", "meeting_date", "meeting_time", "duration", "agenda", "meeting_url", "organizer"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;"><b>{{organizer}}</b> would like to meet with you.</p>

  <div style="border:1px solid #CFFAFE;background:#ECFEFF;border-radius:14px;overflow:hidden;margin:0 0 18px;">
    <div style="background:#0E7490;color:white;padding:14px 18px;">
      <div style="font-size:10px;font-weight:800;letter-spacing:0.32em;color:#A5F3FC;text-transform:uppercase;">// meeting</div>
      <div style="font-size:20px;font-weight:700;line-height:1.2;margin-top:4px;">{{meeting_title}}</div>
    </div>
    <table style="width:100%;font-size:14px;">
      <tr><td style="padding:10px 18px;color:#0E7490;width:120px;">Date</td><td style="padding:10px 18px;font-weight:700;">{{meeting_date}}</td></tr>
      <tr><td style="padding:10px 18px;color:#0E7490;border-top:1px solid #CFFAFE;">Time</td><td style="padding:10px 18px;border-top:1px solid #CFFAFE;font-weight:700;">{{meeting_time}} ({{duration}})</td></tr>
    </table>
  </div>

  <div style="background:#FFF7ED;border-left:3px solid #F97316;border-radius:0 10px 10px 0;padding:12px 16px;margin:0 0 22px;">
    <div style="font-size:11px;font-weight:800;color:#F97316;letter-spacing:0.16em;text-transform:uppercase;">Agenda</div>
    <div style="font-size:14px;line-height:1.6;margin-top:4px;">{{agenda}}</div>
  </div>

  <p style="margin:0 0 22px;text-align:center;">
    <a href="{{meeting_url}}" style="background:#06B6D4;color:white;padding:12px 28px;border-radius:9999px;text-decoration:none;font-weight:700;">Join meeting</a>
  </p>
</div>`,
  },

  // ---------- 9. PASSWORD RESET ----------
  {
    id: "ev-password-reset",
    name: "Password reset",
    description: "Admin-triggered password reset notice with new credentials.",
    category: "general",
    color: "#EF4444",
    icon: "🔐",
    subject: "Your Projexino password has been reset",
    variables: ["name", "login_email", "new_password", "login_url", "reset_by"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <p style="margin:0 0 14px;">Hi <b>{{name}}</b>,</p>
  <p style="margin:0 0 18px;line-height:1.6;">Your password was reset by <b>{{reset_by}}</b>. Please sign in with the temporary password below and immediately set a new one of your choosing.</p>

  <div style="border:1px solid #FECACA;background:#FEF2F2;border-radius:12px;padding:18px;margin:0 0 22px;">
    <table style="width:100%;font-size:14px;">
      <tr><td style="padding:4px 0;color:#991B1B;width:140px;">Login URL</td><td><a href="{{login_url}}" style="color:#EF4444;font-weight:700;text-decoration:none;">{{login_url}}</a></td></tr>
      <tr><td style="padding:4px 0;color:#991B1B;">Login ID</td><td><b>{{login_email}}</b></td></tr>
      <tr><td style="padding:4px 0;color:#991B1B;">New password</td><td><code style="background:white;padding:3px 8px;border-radius:6px;color:#EF4444;font-weight:800;border:1px solid #FECACA;">{{new_password}}</code></td></tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;color:#991B1B;">🔒 Change this immediately after signing in.</p>
  </div>

  <p style="margin:0 0 22px;text-align:center;">
    <a href="{{login_url}}" style="background:#EF4444;color:white;padding:12px 26px;border-radius:9999px;text-decoration:none;font-weight:700;">Sign in</a>
  </p>
  <p style="margin:0;font-size:12px;color:#64748B;">If you didn't request this, contact your admin immediately.</p>
</div>`,
  },

  // ---------- 10. WEEKLY DIGEST ----------
  {
    id: "ev-weekly-digest",
    name: "Weekly digest",
    description: "What happened in the workspace this week — perfect Monday email.",
    category: "marketing",
    color: "#7C3AED",
    icon: "📊",
    subject: "Your Projexino week — {{week_range}}",
    variables: ["name", "week_range", "tasks_done", "tasks_pending", "hours_logged", "top_project", "shoutout"],
    body_html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0F2042;">
  <div style="background:#FAF5FF;border-radius:16px;padding:22px;margin:0 0 18px;">
    <div style="font-size:10px;font-weight:800;letter-spacing:0.32em;color:#7C3AED;text-transform:uppercase;">// weekly digest · {{week_range}}</div>
    <h1 style="font-size:24px;margin:6px 0 0;">Hey {{name}}, here's your week.</h1>
  </div>
  <table style="width:100%;border-collapse:separate;border-spacing:0 8px;">
    <tr><td style="background:#F0FDF4;border-radius:10px;padding:14px;width:50%;"><div style="font-size:10px;color:#15803D;font-weight:800;letter-spacing:0.16em;">TASKS DONE</div><div style="font-size:24px;font-weight:800;color:#10B981;">{{tasks_done}}</div></td><td style="background:#FFF7ED;border-radius:10px;padding:14px;margin-left:6px;"><div style="font-size:10px;color:#F97316;font-weight:800;letter-spacing:0.16em;">PENDING</div><div style="font-size:24px;font-weight:800;color:#F97316;">{{tasks_pending}}</div></td></tr>
    <tr><td colspan="2" style="background:#F8FAFC;border-radius:10px;padding:14px;"><div style="font-size:10px;color:#64748B;font-weight:800;letter-spacing:0.16em;">HOURS LOGGED · TOP PROJECT</div><div style="font-size:16px;font-weight:700;margin-top:2px;">{{hours_logged}}h on <span style="color:#7C3AED;">{{top_project}}</span></div></td></tr>
  </table>
  <div style="background:linear-gradient(135deg,#FBBF24,#F97316);color:white;border-radius:14px;padding:16px;margin-top:12px;text-align:center;">
    <div style="font-size:10px;font-weight:800;letter-spacing:0.32em;opacity:0.85;">// shoutout of the week</div>
    <div style="font-size:14px;font-weight:700;margin-top:4px;">{{shoutout}}</div>
  </div>
  <p style="margin:22px 0 0;font-size:13px;color:#475569;text-align:center;">See you Monday 👋</p>
</div>`,
  },
];

export function eventById(id) {
  return EVENT_PRESETS.find((e) => e.id === id);
}
