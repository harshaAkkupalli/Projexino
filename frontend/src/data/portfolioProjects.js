// Portfolio / case-study data — shared between the listing page and per-project demo pages.
// `slug` becomes the URL: /portfolio/<slug>

export const PROJECTS = [
  {
    slug: "lumen-health",
    name: "Lumen Health",
    tag: "Healthcare · HIPAA",
    accent: "#10B981",
    summary:
      "Telemedicine platform with FHIR integration, e-prescriptions and asynchronous care across 9 specialties.",
    metrics: [
      { v: "200k+", l: "Patients onboarded" },
      { v: "4.8★", l: "App store rating" },
      { v: "<200ms", l: "Median API latency" },
    ],
    stack: ["React Native", "FastAPI", "PostgreSQL", "AWS", "Twilio Video", "HL7 FHIR"],
    image:
      "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "Existing telemedicine apps had 90-second consultation joins, 8% no-show rates and a manual prescription handoff. We needed sub-5s joins, asynchronous fallbacks, and end-to-end e-prescriptions covering 9 specialty workflows — all while staying HIPAA + HL7 FHIR compliant.",
    solution: [
      "Built a low-latency WebRTC SFU with Twilio Programmable Video + custom signalling on FastAPI.",
      "Implemented FHIR-native patient records and a pluggable e-prescription engine.",
      "Async-care funnel: patient uploads symptoms → triage AI routes to a specialist queue → response within 20 min.",
      "Encrypted-at-rest + at-transit with field-level KMS, full audit log for every PHI access.",
    ],
    timeline: "14 weeks · 6 engineers · 1 product designer",
    demoSteps: [
      { title: "Book a video consultation", body: "Patient picks a specialty, sees real-time availability, and joins in <5s." },
      { title: "Async upload + AI triage", body: "Symptom photos and notes are routed to the right specialist queue automatically." },
      { title: "E-prescription handoff", body: "Pharmacy receives the script digitally — patient gets SMS in under a minute." },
    ],
    primaryColorClasses: "from-emerald-500 via-teal-500 to-cyan-500",
  },
  {
    slug: "northwind-trade",
    name: "Northwind Trade",
    tag: "Fintech · KYC",
    accent: "#0EA5E9",
    summary:
      "Cross-border payments + KYC/AML for SME trade finance — reduced settlement from 72h to under 6h.",
    metrics: [
      { v: "$48M+", l: "Monthly volume processed" },
      { v: "−92%", l: "Settlement time reduction" },
      { v: "SOC2", l: "Certification achieved" },
    ],
    stack: ["Next.js", "Go", "Stripe", "Plaid", "Sumsub", "Kafka"],
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "SME cross-border payments took 3 days, hit 22% reject rates on KYC and required 8 different vendors. We replaced the stack with a single Kafka-backed pipeline.",
    solution: [
      "Built a Go-based payment-orchestration engine with idempotent state machines.",
      "Integrated Sumsub for KYC, Plaid for funding sources, and Stripe Treasury for global rails.",
      "Designed a Next.js merchant dashboard with FX previews, settlement timelines and audit downloads.",
      "Achieved SOC2 Type II in 9 months with full evidence automation.",
    ],
    timeline: "22 weeks · 8 engineers · compliance officer",
    demoSteps: [
      { title: "Onboard a new exporter", body: "KYC + AML in under 4 minutes, with fallback to manual review only on edge cases." },
      { title: "Initiate a $250k transfer", body: "Live FX preview, settlement ETA and breakdown of fees before confirm." },
      { title: "Track settlement", body: "Real-time event feed from initiation → clearing → final settlement." },
    ],
    primaryColorClasses: "from-sky-500 via-cyan-500 to-blue-500",
  },
  {
    slug: "cinder-ops",
    name: "Cinder Ops",
    tag: "B2B SaaS · Ops",
    accent: "#F97316",
    summary:
      "Field-service workforce platform for utility teams — scheduling, dispatch, geofencing, attendance.",
    metrics: [
      { v: "12k+", l: "Active field agents" },
      { v: "+38%", l: "Job-throughput lift" },
      { v: "99.95%", l: "Uptime SLA" },
    ],
    stack: ["Flutter", "FastAPI", "MongoDB", "Mapbox", "GCP", "Pub/Sub"],
    image:
      "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "Utility crews were running paper job sheets and SMS dispatch — 18 minutes lost per job to coordination overhead.",
    solution: [
      "Native-feeling Flutter app for crews with offline-first job queues and turn-by-turn routing.",
      "Mapbox + FastAPI for dispatch with surge-aware re-routing.",
      "Geofenced auto-clock-in / out and photo proof-of-completion.",
      "MongoDB + Pub/Sub event mesh for real-time dispatcher dashboards.",
    ],
    timeline: "18 weeks · 5 engineers · 1 dispatcher SME",
    demoSteps: [
      { title: "Dispatch a job in 1 tap", body: "Auto-picks the closest qualified crew and notifies them — total round-trip under 4s." },
      { title: "Crew arrives + auto-clocks-in", body: "Geofence trips clock-in automatically; no manual SMS check-ins." },
      { title: "Live SLA board", body: "Dispatcher sees every job, status, and SLA risk on one map." },
    ],
    primaryColorClasses: "from-orange-500 via-amber-500 to-yellow-500",
  },
  {
    slug: "helix-learning",
    name: "Helix Learning",
    tag: "EdTech · AI",
    accent: "#6366F1",
    summary:
      "AI-tutored adaptive learning platform with multi-modal explanations and curriculum-aligned drills.",
    metrics: [
      { v: "1.7×", l: "Avg. learning velocity" },
      { v: "180+", l: "Schools onboarded" },
      { v: "47%", l: "Cost saved on tutors" },
    ],
    stack: ["React", "FastAPI", "GPT-5.2", "Claude Sonnet 4.5", "pgvector", "Stripe"],
    image:
      "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "Schools couldn't afford 1:1 tutoring at scale. We built an adaptive AI tutor that follows the curriculum and never gives the answer away.",
    solution: [
      "Curriculum-aligned RAG over textbook chapters with pgvector.",
      "Multi-modal explanations — text, hand-drawn whiteboard, voiced walk-throughs.",
      "Adaptive difficulty engine using item-response theory.",
      "Teacher dashboards with mastery tracking + parent reports.",
    ],
    timeline: "20 weeks · 7 engineers · 2 curriculum designers",
    demoSteps: [
      { title: "Ask the AI tutor anything", body: "It explains in 3 ways: words, whiteboard, voice — like a real tutor." },
      { title: "Adaptive practice", body: "Drills get harder or easier within seconds based on your last answer." },
      { title: "Teacher mastery map", body: "Every standard mapped to mastery level for every student — colour-coded." },
    ],
    primaryColorClasses: "from-indigo-500 via-violet-500 to-purple-500",
  },
  {
    slug: "voltline-mobility",
    name: "Voltline Mobility",
    tag: "Mobility · IoT",
    accent: "#A855F7",
    summary:
      "EV charging operator dashboard + driver app — real-time station health, dynamic pricing, fleet API.",
    metrics: [
      { v: "1,200+", l: "Stations live" },
      { v: "−54%", l: "Operator support tickets" },
      { v: "60 fps", l: "Realtime map" },
    ],
    stack: ["Next.js", "Flutter", "Rust", "TimescaleDB", "MQTT", "Cloudflare"],
    image:
      "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "EV operators were drowning in offline-station tickets; drivers were arriving to dead chargers.",
    solution: [
      "Rust ingestion pipeline parsing OCPP 1.6/2.0.1 telemetry over MQTT.",
      "TimescaleDB for time-series station health + dynamic pricing.",
      "Driver Flutter app with predictive availability (95% accurate to 1 hour out).",
      "Operator Next.js dashboard with live SLAs and one-click remote reboot.",
    ],
    timeline: "26 weeks · 6 engineers · 1 hardware partner",
    demoSteps: [
      { title: "Predict station availability", body: "ML model shows whether a charger will be free when you arrive." },
      { title: "Dynamic surge pricing", body: "Operators can run promotions or surge prices in real time." },
      { title: "One-click remote reboot", body: "If a charger glitches, the operator reboots it without dispatching a tech." },
    ],
    primaryColorClasses: "from-purple-500 via-fuchsia-500 to-pink-500",
  },
  {
    slug: "stratus-commerce",
    name: "Stratus Commerce",
    tag: "Ecommerce · D2C",
    accent: "#EAB308",
    summary:
      "Custom D2C commerce stack with headless storefronts, OMS, PIM and a recommendation engine.",
    metrics: [
      { v: "+247%", l: "Conversion lift" },
      { v: "0.6s", l: "Median LCP" },
      { v: "8M+", l: "Monthly visitors" },
    ],
    stack: ["Next.js", "Shopify Hydrogen", "Algolia", "Stripe", "Vercel", "Sanity"],
    image:
      "https://images.unsplash.com/photo-1556742111-a301076d9d18?w=1200&auto=format&fit=crop&q=80",
    challenge:
      "A premium D2C brand's old storefront had a 4.2s LCP and 1.8% conversion. We rebuilt it on a custom headless stack.",
    solution: [
      "Next.js + Shopify Hydrogen headless storefront with full streaming SSR.",
      "Algolia for sub-50ms search/filter with personalised ranking.",
      "Custom OMS + PIM for SKUs, bundles, and subscription billing.",
      "Recommendation engine driven by purchase + browse signals.",
    ],
    timeline: "24 weeks · 9 engineers · 2 designers",
    demoSteps: [
      { title: "Browse with personalised ranking", body: "First-time vs returning visitors see different orderings." },
      { title: "Bundle builder", body: "Drag products into a bundle, see live discount + free-shipping bar." },
      { title: "1-click subscription", body: "Convert any one-off purchase to a subscription with chosen frequency." },
    ],
    primaryColorClasses: "from-yellow-500 via-amber-500 to-orange-500",
  },
];

export function getProjectBySlug(slug) {
  return PROJECTS.find((p) => p.slug === slug);
}
