# Projexino Portal — Self-Hosting Guide (Zero Emergent Dependencies)

The entire portal runs on your own infrastructure with **no Emergent services required**.

## 🚀 Option A — Docker Compose (recommended, one command)
Prereq: install Docker Desktop (Mac/Windows) or Docker Engine + compose plugin (Linux) — https://docs.docker.com/get-docker/

```bash
# 1. Configure secrets
cp docker.env.example docker.env      # then edit: JWT_SECRET, ADMIN_EMAIL/PASSWORD, AI key, etc.

# 2. Launch everything (MongoDB + FastAPI backend + React build served by Nginx)
docker compose up -d --build

# 3. Open the portal
open http://localhost:8080            # login with the ADMIN_EMAIL / ADMIN_PASSWORD you set
```

For a public domain set `PUBLIC_URL` before building (baked into the frontend):
```bash
PUBLIC_URL=https://portal.your-domain.com docker compose up -d --build
```
…and update `PUBLIC_FRONTEND_URL`, `CORS_ORIGINS`, `GMAIL_REDIRECT_URI` in `docker.env` to the same domain. Put your TLS (HTTPS) in front with Caddy/Traefik/certbot or your cloud's load balancer.

What each container does:
| Container | Role |
|---|---|
| `mongo` | Database, data persisted in the `mongo_data` volume (survives restarts) |
| `backend` | FastAPI API on internal port 8001 |
| `web` | Nginx: serves the built React app + proxies `/api/*` → backend |

Useful commands:
```bash
docker compose logs -f backend    # tail API logs
docker compose down               # stop (data kept)
docker compose down -v            # stop AND wipe database
docker compose up -d --build      # rebuild after code changes
```

## 🔧 Option B — Manual setup (no Docker)

## Stack
- **Frontend**: React (CRA + craco), builds to static files — serve via Nginx/any static host.
- **Backend**: FastAPI (Python 3.11+), runs on port 8001 (uvicorn).
- **Database**: MongoDB (any — Atlas, self-hosted, Docker).

## 1. Backend setup
```bash
cd backend
pip install -r requirements.txt        # no private packages — installs from public PyPI only
```
Create `backend/.env` from `backend/.env.example` and fill in your values.

Run:
```bash
uvicorn server:app --host 0.0.0.0 --port 8001
```

## 2. Frontend setup
```bash
cd frontend
yarn install       # @emergentbase/visual-edits is OPTIONAL — install proceeds even if unreachable
yarn build         # outputs to frontend/build — serve with Nginx
```
Create `frontend/.env` from `frontend/.env.example`:
```
REACT_APP_BACKEND_URL=https://your-domain.com
```
Routing rule (Nginx): proxy `/api/*` → backend :8001, everything else → the static build (with SPA fallback to index.html).

## 3. AI features (bring your own key — pick ANY one)
Set ONE of these in `backend/.env`, or paste a key at **Settings → AI** inside the portal
(stored in your own MongoDB):

| Env var | Provider | Cost |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI (GPT) | pay-as-you-go |
| `ANTHROPIC_API_KEY` | Anthropic (Claude) | pay-as-you-go |
| `GEMINI_API_KEY` | Google Gemini | generous free tier |
| `OPENROUTER_API_KEY` | OpenRouter (100+ models) | free models available |
| `OLLAMA_BASE_URL` | Local Ollama | 100% free, offline |

`EMERGENT_LLM_KEY` is only honoured as a last-resort fallback and ONLY works while
hosted on Emergent — leave it unset when self-hosting. All AI features (Xino assistant,
Outreach writer, Blog, Newsletter, HR Letters, Contracts, Email templates, Playbooks,
Clients Hub) route through `backend/ai_provider.py` and work with any provider above.

> Note for Emergent-hosted deploys: the universal key needs the `emergentintegrations`
> package, which was removed from requirements.txt for PyPI compatibility. Re-add with:
> `pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/`

## 4. Gmail / Google OAuth
Uses YOUR Google Cloud project (no Emergent involvement):
1. Google Cloud Console → OAuth consent screen + credentials (Web application).
2. Add redirect URI: `https://your-domain.com/api/oauth/gmail/callback`
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` in backend/.env.
4. Log in to the portal → Settings → connect Google.

## 5. Other integrations (all your own keys)
- **LinkedIn publishing**: `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`
- **Google Places (lead enrichment)**: `GOOGLE_PLACES_API_KEY`
- **Web push**: `VAPID_*` keys (generate once with `npx web-push generate-vapid-keys` or openssl)

## 6. What has ZERO external dependency
Auth (JWT), PDF generation (ReportLab/WeasyPrint), QR document signing, careers/ATS,
finance/invoices/receipts, HR module, documents, chat, playbooks — all fully local.

## Checklist before going live
- [ ] `backend/.env` filled (JWT_SECRET changed!, MONGO_URL, DB_NAME, admin creds)
- [ ] `frontend/.env` → REACT_APP_BACKEND_URL = your domain
- [ ] `PUBLIC_FRONTEND_URL` (backend/.env) = your domain (used in emailed links/QR codes)
- [ ] Google OAuth redirect URI updated to your domain
- [ ] One AI provider key set (or skip — non-AI features work regardless)
- [ ] EMERGENT_LLM_KEY removed from backend/.env
