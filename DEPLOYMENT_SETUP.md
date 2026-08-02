# PROJEXINO — Self-Hosting & Email Setup Guide

Follow this when you download the code and host it on your own domain
(example used below: `https://app.projexino.com` — replace everywhere with your real domain).

---

## 1. Environment variables you MUST update

### `backend/.env`
| Key | Set to | Why |
|---|---|---|
| `MONGO_URL` | your MongoDB connection string | database |
| `DB_NAME` | your DB name | database |
| `PUBLIC_FRONTEND_URL` | `https://app.projexino.com` | used in ALL emails, WhatsApp links, invoice/receipt PDFs, pay page & signing links |
| `GMAIL_REDIRECT_URI` | `https://app.projexino.com/api/oauth/gmail/callback` | Google OAuth callback |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from your NEW Google OAuth app (see §2) | Gmail sending + credit-alert watcher |
| `CORS_ORIGINS` | `https://app.projexino.com` | browser API access |
| `JWT_SECRET` | a long random string (rotate from dev value) | auth security |
| `STRIPE_API_KEY` | your LIVE Stripe secret key (`sk_live_...`) | real card payments (current key is TEST mode) |
| `EMERGENT_LLM_KEY` | keep, or swap AI provider keys in AI Settings | AI features |
| `LINKEDIN_*`, `GOOGLE_PLACES_API_KEY`, `VAPID_*` | keep/update as needed | optional integrations |

### `frontend/.env`
| Key | Set to |
|---|---|
| `REACT_APP_BACKEND_URL` | `https://app.projexino.com` (frontend & backend share the domain; all API calls go to `/api/...`) |

> Routing requirement: your reverse proxy (nginx/traefik) must send `/api/*` to the
> FastAPI backend (port 8001) and everything else to the React build.

---

## 2. Recreate the Google OAuth app (REQUIRED — the old one was deleted)

1. Go to **console.cloud.google.com** → create/select a project.
2. **APIs & Services → Library** → enable **Gmail API** (and **Google Calendar API** if you use calendar features).
3. **APIs & Services → OAuth consent screen** → External → add your Gmail address as a test user
   (or publish the app for unrestricted use).
4. **APIs & Services → Credentials → Create Credentials → OAuth Client ID → Web application**:
   - Authorized redirect URI: `https://app.projexino.com/api/oauth/gmail/callback`
     (add your preview URL too if you still use it: `https://projexino-hub.preview.emergentagent.com/api/oauth/gmail/callback`)
5. Copy the **Client ID** and **Client Secret** into `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
6. Restart the backend, then in the app: **Settings → Email → Connect Gmail** and approve the consent screen.
   - The consent now includes **read access** (needed by the bank credit-alert watcher).

After this, ALL email features work: invoice payment-request emails, receipt emails,
ZIP document emails, account-deletion OTP emails, outreach, testimonials, contracts
email — plus the credit-alert watcher scanning your inbox every 3 minutes.

## 3. Quick verification checklist after hosting

- [ ] `GET https://app.projexino.com/api/email/status` → `connected: true`
- [ ] Send yourself a payment-request email from Finance → PAY NOW button opens `https://app.projexino.com/pay/invoice/...`
- [ ] Invoice PDF download → logo renders, links point to your domain
- [ ] Finance → Bank & payment details → "Scan inbox now" returns without error
- [ ] `/account-deletion` page sends OTP email
- [ ] WhatsApp share modals show your-domain links

## 4. Notes

- No code changes are needed for the domain switch — every URL (emails, PDFs, WhatsApp
  messages, pay pages, HR letter signing, testimonial links) is built from
  `PUBLIC_FRONTEND_URL` / `REACT_APP_BACKEND_URL`.
- Stripe: swap to your live key AND set the webhook endpoint
  `https://app.projexino.com/api/webhook/stripe` in the Stripe dashboard for instant
  "payment credited" notifications.
- Static assets (logo, icons) are self-hosted in `frontend/public/` — no external CDN.
