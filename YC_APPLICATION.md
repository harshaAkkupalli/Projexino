# XINO OS — Y Combinator Application Document

> **Working product name:** Xino OS (placeholder — easily rebrandable)
> **Positioning:** The AI-native Business Operating System for service businesses and agencies
> **Category:** B2B SaaS · Vertical Operating System · AI Workflow Automation
> **Stage:** Working product, dogfooded daily by a real services company (design partner), ready for external customers

---

## 1. One-Liner (YC: "Describe what your company does in 50 characters")

**"AI-run back office for agencies & service firms."**

Alternates:
- "The operating system for service businesses."
- "Run your whole agency from one AI workspace."

---

## 2. The Elevator Pitch

Service businesses — software studios, marketing agencies, consultancies, staffing firms — run on a duct-taped stack of 10–15 tools: a CRM, a project tracker, an HR tool, an invoicing app, a mailbox, a chat app, spreadsheets for everything else. Nothing talks to anything. Owners spend evenings reconciling data across tabs instead of serving clients.

**Xino OS replaces that entire stack with one AI-native operating system.** Leads flow in from your website, become clients, get projects and tasks, generate invoices, and get paid — with the platform itself watching your bank inbox to auto-confirm payments, WhatsApping receipts to clients, drafting the emails, generating the offer letters when you hire, and creating the marketing content that brings in the next lead. One login. One data model. AI in every workflow — with a manual mode everywhere, so teams are never blocked by (or locked into) AI.

---

## 3. The Problem

1. **Tool sprawl is the default.** A 15-person agency typically pays for CRM ($50+/seat), PM tool ($10+/seat), HR software ($8+/seat), invoicing ($30+/mo), email marketing ($100+/mo), design tools, chat, forms, e-sign… $700–$2,500/month, plus the hidden cost: context lives in 12 silos.
2. **The glue work falls on founders.** Copying a closed deal from the CRM into the PM tool, into the invoicing tool, into the accounting sheet. Chasing "did the client pay?" across bank statements. Manually writing offer letters, welcome emails, receipts.
3. **Horizontal tools don't understand service businesses.** Salesforce doesn't know what a "retainer" is out of the box. Jira doesn't invoice. QuickBooks doesn't onboard employees. Every tool needs a consultant to bend it.
4. **AI is bolted on, not built in.** Incumbents ship "AI sidebars." None of them let AI actually run a workflow end-to-end (lead → outreach → proposal → invoice → payment confirmation) because their data is fragmented.

**Who feels this pain most:** 5–100 person digital agencies, dev shops, marketing agencies, consultancies, and outsourcing firms — a massive, global, underserved long tail.

---

## 4. The Product — Detailed Description

Xino OS is a full-stack web platform (React + FastAPI + MongoDB) with three surfaces:

### 4.1 The Public Surface (your business's face)
- **Website engine**: marketing site with configurable content, blog/CMS with SEO fields, testimonials, careers.
- **Xino AI concierge**: an embeddable AI chat + **instant project estimator** on the public site. Visitors describe what they want to build; the AI scopes it and produces an estimate — and every estimator session is captured as a qualified lead in the CRM automatically.
- **Client-facing pages**: public invoice payment pages (Stripe checkout), account-deletion/compliance pages, password-reset flows — all branded.

### 4.2 The Workspace (the operating system)
A single portal, gated by enterprise-grade RBAC, containing the modules below. Every module shares one data model — a client in CRM is the same client on the invoice, the same client in the marketing calendar.

**Growth Layer**
- **Lead Management & Pipeline**: capture from website forms, the AI estimator, and manual entry; pipeline stages; per-lead conversation threads.
- **Outreach Hub**: Google Maps lead discovery, cold-email campaigns, drip sequences, an AI cold-email writer, reply detection, and engagement reports — all sending through the customer's own Gmail (deliverability stays theirs).
- **Email Studio**: branded transactional/marketing templates with variables, live preview, multi-recipient + CC sends, automatic brand shell (logo embedded inline so it renders in every inbox).

**Delivery Layer**
- **Projects & Tasks**: kanban-style task management, assignments, priorities, deadlines, notifications.
- **Issues**: internal bug/issue tracking tied to projects.
- **Team Chat**: channels + DMs with push notifications.
- **Clients Hub**: 360° client record — projects, invoices, documents, WhatsApp customer-success messaging in one drawer.

**Money Layer**
- **Finance**: invoices and receipts with designer-grade PDFs, multi-currency, Stripe payment links, WhatsApp delivery of financial documents.
- **Bank Credit-Alert Watcher** (unique): connects to the business's Gmail, parses incoming bank credit-alert emails, and auto-matches payments to open invoices — "did they pay?" answers itself.
- **Record payments with or without invoices; bulk receipt downloads.**

**People Layer**
- **HR Onboarding Engine**: add a hire → auto-generates a branded, *editable* offer letter PDF, prorated first-paycheck math, portal credentials, and a branded welcome email (leadership auto-CC'd).
- **HR Letters**: LOI, appointment, relieving, experience letters — AI-drafted or manually written, PDF-rendered with the company brand.
- **Document verification**: employees upload documents; HR verifies with status tracking.
- **Presence, badges/recognition, intern portal** with its own scoped experience.

**Marketing Layer ("Digi")**
- A built-in **marketing OS for the business itself or its clients**: brand kits, AI strategy generation, AI content writer (captions, blogs, ad copy, scripts), AI creative generation, a **no-AI Template Studio** (6 professional templates → instant branded PNGs), content calendar, approval queues, performance/ROI tracking.

### 4.3 The Control Plane
- **Access Control**: full role × module × action permission matrix (view/create/edit/delete), editable per-role in real time, enforced server-side.
- **Admin settings**: email accounts, notification rules per event (in-app/email), branding, integrations.
- **Notifications engine**: in-app, email, and OS-level web push (FCM), all rule-driven.

---

## 5. Product Layers (Architecture)

```
┌───────────────────────────────────────────────────────────┐
│ L5 · EXPERIENCE     Public site · Workspace portal ·      │
│                     Intern portal · Client pages · PWA    │
├───────────────────────────────────────────────────────────┤
│ L4 · AI LAYER       Xino AI concierge & estimator ·       │
│                     AI writers (email/content/letters) ·  │
│                     AI strategy & creatives ·             │
│                     ➜ every AI feature has a manual mode  │
├───────────────────────────────────────────────────────────┤
│ L3 · WORKFLOW       Notification rules · Approval queues ·│
│      AUTOMATION     Bank-alert watcher · Drip sequences · │
│                     Auto-branding of outbound email ·     │
│                     Document generation (PDF engine)      │
├───────────────────────────────────────────────────────────┤
│ L2 · MODULES        CRM · Projects · Finance · HR ·       │
│                     Marketing OS · Chat · Docs · Blog     │
│                     (one shared data model)               │
├───────────────────────────────────────────────────────────┤
│ L1 · PLATFORM       RBAC permission matrix · Multi-account│
│                     Gmail · Stripe · WhatsApp · FCM push ·│
│                     Audit logs · REST API (FastAPI)       │
└───────────────────────────────────────────────────────────┘
```

**Key architectural choices**
- **One data model, not integrations**: modules share entities (client, user, invoice, lead) natively — the "Zapier tax" disappears.
- **Bring-your-own rails**: email sends through the customer's Gmail, payments through their Stripe, messages through their WhatsApp — we orchestrate, they own the relationships and deliverability.
- **AI-optional by design**: every AI workflow (strategy, content, creatives, letters, emails) has a first-class manual path. AI accelerates; it never gates.
- **PDF/document engine**: server-side HTML→PDF rendering produces branded invoices, receipts, offer letters, and HR letters that look designed, not generated.

---

## 6. USPs — Why We Win

1. **End-to-end money loop, closed automatically.** Invoice → Stripe link → client pays → *bank-alert watcher reads the credit email and marks the invoice paid* → receipt auto-generated → WhatsApped to the client. No other SMB suite closes this loop.
2. **The website is part of the OS.** The public site's AI estimator turns anonymous traffic into scoped, priced leads inside the CRM — marketing site and sales pipeline are one system.
3. **WhatsApp-native finance & CS.** Invoices, receipts, and customer-success touchpoints delivered over the channel SMB clients actually read (critical for India, SEA, LATAM, MENA — our beachhead markets).
4. **HR that generates artifacts, not just records.** One form produces the offer letter PDF (editable), prorated payroll math, portal credentials, and the branded welcome email — a hire is 3 minutes, not 3 hours.
5. **AI everywhere, manual everywhere.** Competitors force AI or lack it entirely. We ship both paths for every workflow — the adoption objection ("my team doesn't trust AI") evaporates.
6. **True RBAC out of the box.** A live role×module×action matrix that a founder can edit in 30 seconds — enterprise-grade control at SMB simplicity.
7. **Built by an agency, for agencies.** The product runs a real services company today. Every feature exists because the operating team needed it — not because a PM guessed.

---

## 7. Market

- **ICP (beachhead):** 5–100 person digital agencies, software studios, and consultancies in emerging markets (India first: ~50k+ digital/IT services SMBs) and global remote-first micro-agencies.
- **TAM:** ~2.5M service-based SMBs globally in the digital/professional services segment. At $99–$499/mo blended, serviceable market is $10B+/yr.
- **Why now:** (a) LLM costs collapsed — an AI-run back office is finally unit-economical; (b) SMBs got trained on SaaS + WhatsApp business workflows; (c) post-2023 tool fatigue — consolidation is the buying trend (see Rippling, HubSpot expansion motion).

---

## 8. Business Model

- **SaaS subscription, per-workspace + per-seat hybrid:**
  - **Starter** $49/mo — 5 seats, core modules (CRM, projects, finance, email).
  - **Growth** $149/mo — 15 seats, + HR engine, Outreach, marketing OS, WhatsApp.
  - **Scale** $399/mo — 50 seats, + RBAC matrix, approval workflows, API, priority support.
  - Extra seats $8/seat. AI usage bundled with fair-use caps; overage metered.
- **Expansion revenue:** payment-volume features (Stripe rails), white-labeled client portals, template/creative marketplace.
- **Land-and-expand:** land with Finance + CRM (immediate ROI: get paid faster), expand into HR and Marketing OS within 60 days.

---

## 9. Competition & Differentiation

| Competitor | What they are | Why we win |
|---|---|---|
| Zoho One / Odoo | Horizontal suite of 40 loosely-joined apps | We're one product, not 40; AI-native; agency-specific workflows (estimator→lead, bank watcher, offer letters) |
| HubSpot + Asana + Gusto + QuickBooks stack | Best-of-breed stack | 5–10× cheaper, zero integration glue, one data model |
| Bonsai / HoneyBook | Freelancer client-flow tools | We serve *teams* (RBAC, HR, chat, marketing OS), not solo operators |
| Rippling | Employee-graph platform (HR-first) | We're client-graph-first — revenue workflows, not just workforce |
| Notion/Airtable "agency templates" | DIY databases | We ship working software with real rails (payments, email, WhatsApp, PDFs), not templates |

**Moat over time:** the unified client+money+people graph per workspace → best training data for agency-ops AI agents; switching cost compounds with every module adopted.

---

## 10. Traction & Status (honest framing for YC)

- **Product:** live, feature-complete across 15+ modules; 65+ iterations of automated test coverage; production-grade RBAC, payments, and document generation.
- **Design partner:** the platform runs the daily operations of a real software-services company (Projexino Solutions) — leads, clients, invoices, HR, and marketing all flow through it. This is our dogfood + reference customer.
- **What's next (90 days):** onboard 10 pilot agencies from our network at $0→$99/mo, instrument activation/retention, ship workspace multi-tenancy + self-serve onboarding.

---

## 11. Tech Stack

- **Frontend:** React 19, TailwindCSS, shadcn/ui, Framer Motion, PWA + web push (FCM).
- **Backend:** FastAPI (Python), MongoDB, JWT auth + RBAC, WeasyPrint PDF engine.
- **AI:** multi-model LLM layer (OpenAI / Anthropic / Gemini) behind a single abstraction; per-feature model routing.
- **Rails:** Gmail API (send + inbox parsing), Stripe, WhatsApp, Google Calendar (roadmap).
- **Deployable** as a single-tenant instance today; multi-tenant SaaS refactor is the immediate roadmap item (shared cluster, workspace_id scoping — the data model already supports it).

---

## 12. Roadmap (next 12 months)

- **Q1:** Multi-tenancy + self-serve signup/billing (Stripe subscriptions) · workspace onboarding wizard · data import (CSV/HubSpot/Zoho).
- **Q2:** AI Ops Agent v1 — "chase overdue invoices," "prepare Monday client report" as delegated agent tasks · client-facing portal (white-label).
- **Q3:** Marketplace (templates, letter packs, automations) · accounting exports (Tally/QuickBooks/Xero) · WhatsApp Business API (official).
- **Q4:** Mobile apps · SOC 2 Type I · payroll partner integrations.

---

## 13. YC Application — Question-by-Question Answers

**Q: What does your company do? (50 chars)**
AI-run back office for agencies & service firms.

**Q: What is your company going to make? Describe your product and what it does or will do.**
Xino OS is an AI-native operating system for service businesses. It replaces the agency stack — CRM, project management, invoicing, HR, email marketing, content tools — with one platform sharing one data model. Distinctive workflows: a public AI estimator that converts website visitors into scoped leads; a finance loop where invoices are paid via Stripe links, confirmed automatically by parsing bank credit-alert emails, and receipts are WhatsApped to clients; an HR engine that turns "add a hire" into an offer letter PDF, payroll math, credentials, and a branded welcome email; and a built-in marketing OS that produces strategies, content, and on-brand creatives. Every AI feature has a manual mode, so teams adopt at their own pace.

**Q: Why did you pick this idea to work on? Do you have domain expertise?**
We run a software-services company. We lived the pain: 12 tools, none of which understood our business, and founders doing glue work at midnight. We built Xino OS to run our own company — it now handles our leads, clients, invoices, payroll letters, and marketing daily. We are our own most demanding customer.

**Q: What's new about what you're making?**
(1) The public website, sales pipeline, delivery, money, and people workflows live in ONE data model — that's what lets AI complete multi-step jobs end-to-end. (2) The bank credit-alert watcher: payment reconciliation by reading the business's own bank emails — no bank API integrations, works with any bank, day one. (3) AI-optional design: every AI workflow has a first-class manual twin. (4) WhatsApp as a first-class rail for finance documents and customer success.

**Q: Who are your competitors, and what do you understand about your market that they don't?**
Zoho/Odoo (suites of loosely-joined apps), HubSpot+Asana+QuickBooks stacks, and freelancer tools like Bonsai. What we understand: service SMBs — especially in emerging markets — don't want 40 apps or "integrations"; they want one system that speaks WhatsApp, works with their existing Gmail and bank, and produces client-ready artifacts (invoices, letters, creatives) that look professionally designed. Incumbents treat these as edge cases; for our market they're the core.

**Q: How do or will you make money? How much could you make?**
Workspace subscriptions ($49–$399/mo) plus seat expansion and metered AI. 2.5M+ service SMBs globally; 1% share at $200/mo blended ≈ $600M ARR potential. Near-term: 10 pilots → 100 paying workspaces in 12 months ≈ $240k ARR with expansion built in.

**Q: How will you get users?**
(1) Our own agency network + the design partner's client/vendor graph for the first 25 workspaces. (2) The product markets itself: every AI estimator embedded on a customer's website is a "Powered by Xino" surface in front of other agency owners. (3) Content + templates SEO (agency ops playbooks, offer-letter/invoice generators as free tools). (4) Communities where agency owners live (Twitter/X, LinkedIn, agency Slack groups).

**Q: What is your growth like / traction?**
Product complete and operating a real company end-to-end (dogfooding since 2025). 65+ automated test iterations, production payments/PDF/email rails. Converting design-partner usage into 10 external pilots is the current sprint.

**Q: What do you understand about your users?**
Agency owners buy time and cash flow, not features. Their top three anxieties: "did the client pay?", "is the team busy on the right things?", "where's the next lead?" Xino OS answers all three on one screen — and that's the demo that closes them.

**Q: What's the biggest risk?**
Multi-tenant packaging and self-serve onboarding speed. The tech risk is low (data model is workspace-ready); the execution risk is going from "runs one company brilliantly" to "onboards 100 companies without us in the room." That's exactly what we'd use YC for.

---

## 14. FAQs (Customer-Facing)

**Q: Is my data safe? Who can see what?**
Every workspace is isolated. Inside a workspace, a role×module×action permission matrix controls exactly who can view/create/edit/delete each module — editable by admins in real time and enforced server-side. Sensitive artifacts (payslips, offer letters) are role-gated.

**Q: Do I have to use the AI features?**
No. Every AI workflow — strategies, content, creatives, letters, emails — has a full manual mode. Use AI where it helps, ignore it where it doesn't.

**Q: Does email go through your servers? Will it hurt my deliverability?**
No. All email sends through *your* connected Gmail/Google Workspace account via OAuth. Your domain, your reputation, your sent folder. We add your branding automatically (logo embedded inline so it renders in every inbox).

**Q: How does automatic payment confirmation work?**
You connect the Gmail inbox that receives your bank's credit alerts. Xino parses those alerts, matches amounts/references to open invoices, and marks them paid — then generates and (optionally) WhatsApps the receipt. Works with any bank that sends email alerts; no bank API needed.

**Q: Can clients pay online?**
Yes — every invoice can carry a Stripe checkout link on a branded public payment page. Card payments reconcile automatically.

**Q: We already use HubSpot/Zoho/Asana. How do we migrate?**
CSV import for leads, clients, and tasks (roadmap: one-click HubSpot/Zoho importers). Most pilots run Xino Finance + CRM alongside their old stack for 2–4 weeks, then cut over.

**Q: What about WhatsApp — is it official API?**
Today: deep-link based sending from your own WhatsApp (zero setup, zero per-message cost). Official WhatsApp Business API integration is on the roadmap for automated sends at scale.

**Q: Can I white-label it for my clients?**
Brand kits per client exist today (used by the marketing OS). Full white-label client portals are on the Scale-tier roadmap.

**Q: What happens if I cancel?**
Full data export (JSON/CSV) of every module. Your Gmail/Stripe/WhatsApp connections are yours and revocable in one click.

**Q: Is there an API?**
The entire product runs on a documented REST API (FastAPI/OpenAPI). Public API keys ship with the Scale tier.

---

## 15. Team Slide Notes (fill with actuals)

- Founder(s) operating a real software-services company — the platform's first customer.
- Full-stack shipping velocity demonstrated: 15+ modules, payments, PDF engine, RBAC, AI layer — built and battle-tested in production.
- Advantage: distribution into the agency ecosystem the founders already sell into.

---

## 16. The Ask

We're applying to YC to compress the path from **"the OS that runs one company"** to **"the OS that runs 10,000 service companies"**: multi-tenant launch, self-serve onboarding, first 100 paying workspaces, and hiring the first two growth engineers.

---

*Prepared June 2026. This document describes the product as a standalone SaaS ("Xino OS", name changeable). All described features are built and functional today unless explicitly marked as roadmap.*
