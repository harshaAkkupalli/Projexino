import {
  Brain,
  Smartphone,
  Bot,
  Layers,
  Cloud,
  Apple,
  Building2,
  Wrench,
} from "lucide-react";

export const SERVICES = [
  {
    slug: "ai-driven-development",
    title: "AI-Driven Development",
    icon: Brain,
    tint: "violet",
    accent: "#6366F1",
    summary:
      "Intelligent solutions, automation, and analytics for smarter business operations and decision-making.",
    image:
      "https://media.istockphoto.com/id/1979289147/photo/data-analysis-science-and-big-data-with-ai-technology-analyst-or-scientist-uses-a-computer.webp?a=1&b=1&s=612x612&w=0&k=20&c=IIZaVsQl6mMcOPgyPrVm8ZlCSBwKdwWju4TTnM7BM4Q=",
    seo: {
      title: "AI-Driven Development Services | Projexino",
      description:
        "Custom AI development services — LLM integrations, machine learning models, predictive analytics, and intelligent automation engineered to ship and scale.",
    },
    intro: [
      "We engineer production AI: not flashy demos. Our AI-driven builds combine modern LLM orchestration, retrieval pipelines, classical ML, and rigorous evaluation harnesses — so your intelligent product gets smarter as it ships.",
      "From copilots embedded inside your existing apps to autonomous agents that operate workflows end-to-end, we design AI that earns its place in the stack with measurable business lift.",
    ],
    capabilities: [
      "LLM integrations (OpenAI, Anthropic, Gemini, on-prem)",
      "RAG pipelines & knowledge graphs",
      "Predictive analytics & forecasting models",
      "NLP, OCR, vision and multi-modal",
      "Agentic workflows & tool-calling",
      "Model evaluation harnesses & guardrails",
    ],
    tech: [
      { group: "Models", items: ["GPT-5.2", "Claude Sonnet 4.5", "Gemini 3", "Llama 3", "Mistral"] },
      { group: "Frameworks", items: ["LangChain", "LlamaIndex", "PyTorch", "TensorFlow", "scikit-learn"] },
      { group: "Vector / Data", items: ["pgvector", "Qdrant", "Weaviate", "Pinecone", "Mongo Atlas"] },
      { group: "Serving", items: ["FastAPI", "Triton", "vLLM", "Ray", "Modal"] },
    ],
    process: [
      { step: "Discovery", text: "We audit your data, workflows and KPIs to scope the AI win." },
      { step: "Prototype", text: "Working spike in 2 weeks against your real data — no toys." },
      { step: "Harden", text: "Eval harness, guardrails, observability, fallbacks." },
      { step: "Ship", text: "Production rollout, A/B test, monitor cost + quality drift." },
    ],
    efficiency: [
      { v: "62%", l: "Avg. ops time saved per workflow" },
      { v: "3.4×", l: "Faster cycle from data → insight" },
      { v: "<200ms", l: "Median inference latency" },
      { v: "99.7%", l: "Production model uptime" },
    ],
    deliverables: [
      "Architecture & cost model document",
      "Reusable prompt + eval library",
      "Monitored production endpoints",
      "Runbook + team handover",
    ],
    faq: [
      {
        q: "Which model providers do you support?",
        a: "All major LLM providers (OpenAI, Anthropic, Google, Mistral, Meta) plus on-prem deployments with vLLM/Triton when data residency requires it.",
      },
      {
        q: "How do you control hallucination?",
        a: "Retrieval grounding, strict JSON-mode tool calling, automated evaluation gates on every prompt change, and guardrails on output.",
      },
    ],
  },
  {
    slug: "app-development",
    title: "App Development",
    icon: Smartphone,
    tint: "sky",
    accent: "#0EA5E9",
    summary:
      "Custom mobile and web applications designed for every platform and audience with modern technologies.",
    image:
      "https://images.unsplash.com/photo-1618761714954-0b8cd0026356?w=1200&auto=format&fit=crop&q=80",
    seo: {
      title: "Custom App Development Services | Projexino",
      description:
        "End-to-end app development — iOS, Android, web and backend. React, Flutter, FastAPI, scalable cloud architecture built for production.",
    },
    intro: [
      "We build apps the way modern product teams expect: typed end-to-end, observable from day one, deployed continuously, designed for the user — not for the demo.",
      "Whether you're a founder validating a wedge or an enterprise modernizing a legacy stack, we ship apps that move metrics and keep moving them.",
    ],
    capabilities: [
      "iOS & Android (native + cross-platform)",
      "Web apps with React / Next.js",
      "Backend APIs (FastAPI, Node, Go)",
      "Realtime + offline-first sync",
      "Design systems & component libraries",
      "Deep linking, push, in-app purchases",
    ],
    tech: [
      { group: "Mobile", items: ["Swift", "Kotlin", "Flutter", "React Native"] },
      { group: "Web", items: ["React", "Next.js", "TypeScript", "TailwindCSS"] },
      { group: "Backend", items: ["FastAPI", "Node.js", "PostgreSQL", "MongoDB", "Redis"] },
      { group: "DevOps", items: ["Docker", "Kubernetes", "GitHub Actions", "Vercel", "AWS"] },
    ],
    process: [
      { step: "Scope", text: "Outcome-driven brief, success metrics, weekly milestones." },
      { step: "Design", text: "Wireframes → high-fidelity prototype in 2 weeks." },
      { step: "Build", text: "Two-week sprints. Production from day one." },
      { step: "Launch", text: "Store submission, monitoring, growth & maintenance." },
    ],
    efficiency: [
      { v: "12 wks", l: "Avg. MVP-to-launch" },
      { v: "99.95%", l: "Production uptime SLA" },
      { v: "+38%", l: "Conversion lift on redesigns" },
      { v: "0.4s", l: "Median TTFB" },
    ],
    deliverables: [
      "iOS / Android binaries (App Store + Play Store ready)",
      "Web app with CI/CD",
      "Documented backend APIs",
      "Design system + Figma library",
    ],
    faq: [
      {
        q: "Do you write native or cross-platform?",
        a: "Both. We default to React Native or Flutter for speed; switch to native Swift/Kotlin when performance or platform-specific UX demands it.",
      },
      {
        q: "Who owns the IP and code?",
        a: "You do. All code, accounts and assets transfer at handover. We can stay on for retainer-based maintenance.",
      },
    ],
  },
  {
    slug: "chatgpt-solutions",
    title: "ChatGPT Solutions",
    icon: Bot,
    tint: "mint",
    accent: "#10B981",
    summary:
      "Advanced conversational AI and intelligent chatbots for enhanced customer engagement and support.",
    image:
      "https://plus.unsplash.com/premium_photo-1683121710572-7723bd2e235d?w=1200&auto=format&fit=crop&q=80",
    seo: {
      title: "Custom ChatGPT & Conversational AI Solutions | Projexino",
      description:
        "Production-grade ChatGPT integrations, custom chatbots and conversational AI assistants — fine-tuned, grounded and embedded inside your product or website.",
    },
    intro: [
      "Generic chatbots disappoint. We build grounded, retrieval-aware conversational AI that speaks your brand, knows your docs, and connects to your stack via tool-calling.",
      "From customer-support copilots that close tickets, to internal assistants that turn knowledge bases into instant answers — we engineer the conversation, not just the wrapper.",
    ],
    capabilities: [
      "Custom GPT-style chatbots",
      "Grounded RAG over your docs / Notion / Drive",
      "Tool-calling: CRM, ticketing, calendars",
      "Voice + multimodal interfaces",
      "Omnichannel: web, Slack, WhatsApp, Teams",
      "Analytics + conversation review tooling",
    ],
    tech: [
      { group: "Models", items: ["GPT-5.2", "Claude Sonnet 4.5", "Gemini 3 Flash"] },
      { group: "Stack", items: ["LangChain", "LangGraph", "Pydantic AI", "FastAPI"] },
      { group: "Search", items: ["pgvector", "Qdrant", "Hybrid BM25 + vector"] },
      { group: "Channels", items: ["Web SDK", "Slack", "WhatsApp", "Twilio voice"] },
    ],
    process: [
      { step: "Knowledge audit", text: "We map your docs, FAQs, tools and edge cases." },
      { step: "Grounding", text: "Build the retrieval index + tool integrations." },
      { step: "Prompt + Eval", text: "Iterate prompts against automated benchmarks." },
      { step: "Launch", text: "Embed, monitor cost + CSAT, continuous improvement." },
    ],
    efficiency: [
      { v: "47%", l: "Tickets auto-resolved" },
      { v: "8s", l: "Avg. response time" },
      { v: "4.7/5", l: "Customer rating post-launch" },
      { v: "−$2.1k", l: "Monthly support cost saved (mid-size)" },
    ],
    deliverables: [
      "Embeddable widget + SDK",
      "Retrieval index pipeline",
      "Eval dashboard + conversation reviewer",
      "Prompt library + ops playbook",
    ],
    faq: [
      {
        q: "Will the bot make stuff up?",
        a: "We ground every answer to retrieved sources, refuse out-of-scope queries, and stream citations. Hallucination is logged and re-evaluated weekly.",
      },
      {
        q: "Can it hand off to a human?",
        a: "Yes — built-in escalation to your existing helpdesk (Intercom, Zendesk, Freshdesk) with full conversation context.",
      },
    ],
  },
  {
    slug: "cross-platform-development",
    title: "Cross Platform Development",
    icon: Layers,
    tint: "cool",
    accent: "#14B8A6",
    summary:
      "Build once, deploy everywhere with Flutter, React Native, and other modern cross-platform frameworks.",
    image:
      "https://media.istockphoto.com/id/2177184303/photo/white-man-programmer-or-it-specialist-software-developer-with-glasses-working-late-into-the.webp?a=1&b=1&s=612x612&w=0&k=20&c=XLBlBQCGyuWBaJTbzG7bntaoYBB-GdTiI6z4Co5mjAg=",
    seo: {
      title: "Cross-Platform App Development — Flutter & React Native | Projexino",
      description:
        "Ship native-feel apps on iOS, Android, web and desktop from a single codebase. Flutter and React Native experts engineering for performance.",
    },
    intro: [
      "Cross-platform isn't a compromise when it's done right. We engineer one codebase that compiles to iOS, Android, web and desktop with platform-specific polish where it matters.",
      "Maintain less. Ship faster. Keep your roadmap unified across every screen.",
    ],
    capabilities: [
      "Flutter (production-grade)",
      "React Native + Expo",
      "Tauri / Electron desktop",
      "Single design system across platforms",
      "Native module bridging when needed",
      "Over-the-air updates",
    ],
    tech: [
      { group: "Frameworks", items: ["Flutter", "React Native", "Expo", "Tauri"] },
      { group: "State", items: ["Riverpod", "Bloc", "Redux Toolkit", "Zustand"] },
      { group: "Build", items: ["Fastlane", "EAS Build", "Codemagic", "GitHub Actions"] },
      { group: "Native bridge", items: ["Pigeon", "FFI", "MethodChannel", "JSI"] },
    ],
    process: [
      { step: "Stack pick", text: "Honest framework choice based on your constraints." },
      { step: "Foundations", text: "Design tokens, navigation, auth, analytics — once." },
      { step: "Feature sprints", text: "Two-week cycles, weekly demos, store-ready every Friday." },
      { step: "Release", text: "Coordinated iOS/Android/Web rollout with rollback safety." },
    ],
    efficiency: [
      { v: "60%", l: "Less code to maintain vs. dual-native" },
      { v: "1.7×", l: "Faster feature delivery" },
      { v: "60 fps", l: "Smooth animation target" },
      { v: "−42%", l: "Build pipeline time" },
    ],
    deliverables: [
      "Single Flutter / RN codebase",
      "Native modules where required",
      "CI/CD with store automation",
      "Documented design system",
    ],
    faq: [
      {
        q: "Flutter or React Native?",
        a: "Flutter for pixel-perfect custom UI and maximum performance; React Native when you're already deep in the JS ecosystem or sharing code with web.",
      },
      {
        q: "What about iOS feature parity?",
        a: "Where native APIs lead, we write a bridge and expose it cleanly. You never feel the framework limitation.",
      },
    ],
  },
  {
    slug: "saas-development",
    title: "SaaS Development",
    icon: Cloud,
    tint: "sky",
    accent: "#0284C7",
    summary:
      "Scalable, secure, and robust SaaS platforms designed for modern businesses and growing enterprises.",
    image:
      "https://plus.unsplash.com/premium_photo-1733306493254-52b143296396?w=1200&auto=format&fit=crop&q=80",
    seo: {
      title: "SaaS Platform Development | Projexino",
      description:
        "End-to-end SaaS development — multi-tenant architecture, subscriptions, RBAC, analytics, and infrastructure built for scale from day one.",
    },
    intro: [
      "Scale is a design decision, not a phase you bolt on later. We architect SaaS platforms with multi-tenancy, billing, RBAC, audit logs and observability built in from the first commit.",
      "From early MVP to enterprise rollout — your stack stays the same.",
    ],
    capabilities: [
      "Multi-tenant data + RBAC",
      "Stripe / Razorpay subscriptions",
      "Self-serve onboarding & admin",
      "Webhooks, public APIs, SDKs",
      "SOC2-ready audit logs",
      "Customer analytics & cohort tooling",
    ],
    tech: [
      { group: "Backend", items: ["FastAPI", "Node.js", "PostgreSQL", "MongoDB", "Redis"] },
      { group: "Frontend", items: ["Next.js", "React", "TanStack Query", "Tailwind"] },
      { group: "Infra", items: ["AWS", "GCP", "Cloudflare", "Terraform", "Kubernetes"] },
      { group: "Billing & Auth", items: ["Stripe", "Razorpay", "Clerk", "Auth0", "JWT"] },
    ],
    process: [
      { step: "Architect", text: "Tenant model, data isolation, scale envelope sized correctly." },
      { step: "Foundations", text: "Auth, billing, admin, observability — production-ready week one." },
      { step: "Feature sprints", text: "Two-week sprints, internal demos, customer betas." },
      { step: "Scale", text: "Performance audits, caching, async pipelines, SOC2 readiness." },
    ],
    efficiency: [
      { v: "10×", l: "Cost-efficient scaling vs naive setups" },
      { v: "100k", l: "Concurrent tenants tested" },
      { v: "98%", l: "Self-serve onboarding completion" },
      { v: "MRR", l: "Tracked + visualized day one" },
    ],
    deliverables: [
      "Multi-tenant platform",
      "Billing + admin dashboard",
      "Public API + SDK",
      "SOC2-ready audit trail",
    ],
    faq: [
      {
        q: "Single-tenant vs. multi-tenant data?",
        a: "We default to schema-per-tenant on PostgreSQL or owner-scoped on Mongo. For enterprise we offer dedicated DB per tenant.",
      },
      {
        q: "Stripe or Razorpay?",
        a: "Both. We integrate based on your geography — and we expose a uniform billing event API so you can swap providers without app rewrites.",
      },
    ],
  },
  {
    slug: "ios-android-development",
    title: "iOS & Android Development",
    icon: Apple,
    tint: "warm",
    accent: "#F97316",
    summary:
      "Native and hybrid mobile applications optimized for every device and designed for every audience.",
    image:
      "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=1200&auto=format&fit=crop&q=80",
    seo: {
      title: "iOS & Android App Development | Projexino",
      description:
        "Native iOS (Swift) and Android (Kotlin) app development — performant, accessible, store-ready, with full lifecycle support.",
    },
    intro: [
      "When users live on their phones, every millisecond and every gesture matter. We build native iOS (Swift / SwiftUI) and Android (Kotlin / Jetpack Compose) apps that respect the platform — and the user.",
      "Native craft, modern architecture, store-day-one ready.",
    ],
    capabilities: [
      "Swift / SwiftUI / UIKit",
      "Kotlin / Jetpack Compose",
      "Offline-first persistence",
      "Push + background tasks",
      "In-app purchases & subscriptions",
      "Accessibility & localization",
    ],
    tech: [
      { group: "iOS", items: ["Swift", "SwiftUI", "Combine", "CoreData", "WidgetKit"] },
      { group: "Android", items: ["Kotlin", "Jetpack Compose", "Room", "Hilt", "WorkManager"] },
      { group: "Backend bridge", items: ["GraphQL", "REST", "gRPC", "WebSockets"] },
      { group: "Tooling", items: ["Fastlane", "TestFlight", "Firebase", "Play Internal"] },
    ],
    process: [
      { step: "Platform plan", text: "iOS-first, Android-first or parallel — based on your users." },
      { step: "Native foundations", text: "Architecture, theming, navigation, persistence, telemetry." },
      { step: "Feature sprints", text: "Builds shipped to TestFlight + Play Internal every Friday." },
      { step: "Store launch", text: "Listing, review, phased rollout, ASO support." },
    ],
    efficiency: [
      { v: "4.7★", l: "Avg. App Store rating" },
      { v: "60 fps", l: "Maintained across screens" },
      { v: "−35%", l: "Crash-free session lift" },
      { v: "<48h", l: "Average store review turnaround" },
    ],
    deliverables: [
      "Store-ready iOS + Android binaries",
      "TestFlight + Play Internal pipelines",
      "Crashlytics + analytics dashboards",
      "Documented native modules",
    ],
    faq: [
      {
        q: "Will my app pass Apple review first time?",
        a: "We follow Apple HIG and review guidelines exhaustively, dry-run review checks, and prep your privacy nutrition labels. First-time pass rate: 96%.",
      },
      {
        q: "Do you support older devices?",
        a: "By default we target the latest two OS majors, but we can extend back further on request — with explicit trade-offs documented.",
      },
    ],
  },
  {
    slug: "industry-focused-solutions",
    title: "Industry-Focused Digital Solutions",
    icon: Building2,
    tint: "amber",
    accent: "#D97706",
    summary:
      "Specialized digital solutions tailored for specific industries, addressing unique challenges and requirements.",
    image:
      "https://media.istockphoto.com/id/1344939844/photo/hand-holding-drawing-virtual-lightbulb-with-brain-on-bokeh-background-for-creative-and-smart.webp?a=1&b=1&s=612x612&w=0&k=20&c=Q1LGFdFoZQ0YRWTcHtSZpvfJ_DtgD86aMMuUYxPtz8s=",
    seo: {
      title: "Industry-Focused Digital Solutions | Projexino",
      description:
        "Vertical software for healthcare, fintech, e-commerce and workforce — compliant, integrated, and built by engineers who know the domain.",
    },
    intro: [
      "Generic templates lose to vertical software. Our industry-focused builds embed regulatory, integration and workflow nuance that off-the-shelf SaaS will never match.",
      "We've shipped in healthcare, fintech, e-commerce and workforce — and we bring those playbooks to your build.",
    ],
    capabilities: [
      "Healthcare: HIPAA, FHIR, telemedicine",
      "Fintech: KYC/AML, payments, ledger",
      "E-commerce: PIM, OMS, marketplaces",
      "Workforce: scheduling, attendance, payroll",
      "Compliance & audit tooling",
      "Domain-specific integrations",
    ],
    tech: [
      { group: "Healthcare", items: ["HL7 FHIR", "DICOM", "OpenEMR", "Twilio Video"] },
      { group: "Fintech", items: ["Plaid", "Stripe", "Razorpay", "Decimal ledgers", "Sumsub KYC"] },
      { group: "E-commerce", items: ["Shopify", "WooCommerce", "Algolia", "Elastic"] },
      { group: "Workforce", items: ["Calendars", "Geofencing", "Twilio SMS", "Mapbox"] },
    ],
    process: [
      { step: "Domain dive", text: "We sit with your operators for a week and map the real workflow." },
      { step: "Compliance map", text: "Regulatory + integration matrix locked before code." },
      { step: "Build", text: "Modular, integration-heavy delivery with continuous user testing." },
      { step: "Operate", text: "Embedded support post-launch — because verticals never stand still." },
    ],
    efficiency: [
      { v: "100%", l: "HIPAA / KYC compliance pass rate" },
      { v: "−54%", l: "Manual ops time saved" },
      { v: "20+", l: "Vertical integrations engineered" },
      { v: "6 wks", l: "Avg. compliance pre-audit prep" },
    ],
    deliverables: [
      "Vertical-specific platform",
      "Audit & compliance evidence pack",
      "Documented integrations",
      "User training + support runbook",
    ],
    faq: [
      {
        q: "Do you sign BAAs / DPAs?",
        a: "Yes. For healthcare we sign BAAs; for EU customers we offer SCC-compliant DPAs and EU data residency on request.",
      },
      {
        q: "Can you take over an existing vertical product?",
        a: "Absolutely. Many of our engagements start with a 2-week audit of an existing build before we pick up the roadmap.",
      },
    ],
  },
  {
    slug: "app-maintenance-support",
    title: "App Maintenance & Support",
    icon: Wrench,
    tint: "slate",
    accent: "#475569",
    summary:
      "Comprehensive maintenance, updates, and ongoing support to keep your applications running smoothly and securely.",
    image:
      "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80",
    seo: {
      title: "App Maintenance & 24/7 Support | Projexino",
      description:
        "Ongoing app maintenance, performance monitoring, security patches and 24/7 support — retainer-based and SLA-backed.",
    },
    intro: [
      "Ship day is day one. We run retainer-based maintenance with explicit SLAs — monitoring uptime, patching security, optimizing performance and shipping iterative improvements.",
      "Sleep through outages. We won't.",
    ],
    capabilities: [
      "24/7 monitoring & on-call",
      "Security patching + dependency upgrades",
      "Performance audits & optimizations",
      "Store updates & resubmissions",
      "Bug triage + SLA-backed response",
      "Quarterly product roadmap reviews",
    ],
    tech: [
      { group: "Monitoring", items: ["Sentry", "Datadog", "Grafana", "OpenTelemetry"] },
      { group: "On-call", items: ["PagerDuty", "Opsgenie", "Statuspage"] },
      { group: "Security", items: ["Snyk", "Dependabot", "OWASP audits"] },
      { group: "Delivery", items: ["GitHub Actions", "Fastlane", "Sentry Releases"] },
    ],
    process: [
      { step: "Onboarding", text: "We inventory your stack, access, runbooks and risks." },
      { step: "Instrument", text: "Set up monitoring, alerting and SLO dashboards." },
      { step: "Operate", text: "Weekly status, monthly perf audits, quarterly roadmap." },
      { step: "Improve", text: "Continuous patches, dependency updates and small feature work." },
    ],
    efficiency: [
      { v: "15 min", l: "Critical incident response" },
      { v: "99.95%", l: "Uptime maintained" },
      { v: "−68%", l: "Avg. P1 bug reduction" },
      { v: "Weekly", l: "Patch cadence" },
    ],
    deliverables: [
      "On-call rotation + escalation tree",
      "Status dashboard + monthly report",
      "Security audit results & remediation",
      "Roadmap & retainer review every quarter",
    ],
    faq: [
      {
        q: "What's the smallest retainer you offer?",
        a: "We typically engage at 20 hours/month minimum to keep response times credible. Larger retainers unlock dedicated engineers + roadmap planning.",
      },
      {
        q: "Can you take over an app we built elsewhere?",
        a: "Yes. We start with a 1-week audit (security, performance, architecture) before we go on-call.",
      },
    ],
  },
];

export function getServiceBySlug(slug) {
  return SERVICES.find((s) => s.slug === slug);
}
