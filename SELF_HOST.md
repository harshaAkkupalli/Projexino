# Projexino · Self-Hosting Guide

This app — including **every AI feature** (Customer Success email drafting, Website Experience Manager page generator, Newsletter AI drafts, Engineering project AI summaries, and the Digi · Marketing OS strategy / content / creative generators) — is designed to run on **your own server with your own domain at zero ongoing cost** after you download the code.

---

## TL;DR — Run locally with ZERO ongoing cost

1. **Install [Ollama](https://ollama.com)** on the machine that will run the backend.
2. Pull a small model: `ollama pull llama3.2` (≈ 2 GB).
3. Start Ollama: `ollama serve` (usually auto-starts).
4. Add **one line** to `backend/.env`:
   ```env
   OLLAMA_BASE_URL=http://localhost:11434
   ```
5. Restart the backend. Every AI feature now uses your local Ollama. **No API key. No paid plan. No Emergent dependency.**

---

## Stack

| Layer        | Tech                       | Hosted on                                          |
|--------------|----------------------------|----------------------------------------------------|
| Frontend     | React 19 + Tailwind        | Any static host (Vercel, Netlify, Cloudflare, S3)  |
| Backend      | FastAPI (Python 3.11+)     | Any Linux VM, Docker, Kubernetes, fly.io           |
| Database     | MongoDB (local or Atlas)   | MongoDB Atlas FREE tier (512 MB) works perfectly   |
| AI           | OpenAI / Anthropic / Gemini / OpenRouter / **Ollama (free!)** / Emergent | Your choice — Ollama is fully local |
| File storage | MongoDB (base64) — Phase 2 will add S3-compat | n/a              |

---

## 1 · Prerequisites

- **Python 3.11+** with `pip`
- **Node.js 18+** with `yarn`
- **MongoDB** — either local install or a free MongoDB Atlas cluster
- *(Optional)* **Ollama** if you want fully-free local AI

---

## 2 · Clone & install

```bash
git clone <your-fork-url> projexino
cd projexino

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
yarn install
```

---

## 3 · Configure `backend/.env`

Create `backend/.env`:

```env
# Required
MONGO_URL=mongodb://localhost:27017
DB_NAME=projexino
JWT_SECRET=change-me-to-a-long-random-string
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=change-me-immediately

# ── Pick ONE AI provider (or none — manual emails still work) ──

# Option A · FREE LOCAL via Ollama (recommended for self-host)
OLLAMA_BASE_URL=http://localhost:11434
PROJEXINO_OLLAMA_MODEL=llama3.2

# Option B · OpenAI (your own key)
# OPENAI_API_KEY=sk-...
# PROJEXINO_OPENAI_MODEL=gpt-4o-mini

# Option C · Anthropic Claude
# ANTHROPIC_API_KEY=sk-ant-...

# Option D · Google Gemini (generous free tier)
# GEMINI_API_KEY=AIza...
# PROJEXINO_GEMINI_MODEL=gemini-2.5-flash

# Option E · OpenRouter — one key, many models, several FREE
# OPENROUTER_API_KEY=sk-or-...
# PROJEXINO_OPENROUTER_MODEL=meta-llama/llama-3.2-3b-instruct:free
```

Provider resolution order (first match wins):

1. Runtime override saved through `/api/ai/config` (Super Admin → Settings → AI tab)
2. `OPENAI_API_KEY`
3. `ANTHROPIC_API_KEY`
4. `GEMINI_API_KEY` / `GOOGLE_API_KEY`
5. `OPENROUTER_API_KEY`
6. `OLLAMA_BASE_URL`
7. `EMERGENT_LLM_KEY` (only meaningful inside Emergent's cloud)

You can also switch providers from the UI at runtime without redeploying — the override is persisted in MongoDB.

---

## 4 · Configure `frontend/.env`

```env
REACT_APP_BACKEND_URL=http://localhost:8001
# In production set to your real domain, e.g.
# REACT_APP_BACKEND_URL=https://api.yourdomain.com
```

---

## 5 · Run

```bash
# Terminal 1 — backend
cd backend
uvicorn server:app --reload --port 8001

# Terminal 2 — frontend
cd frontend
yarn start
```

Visit http://localhost:3000 and log in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.

---

## 6 · Verify AI is alive

1. Log in as the super admin.
2. Open **Settings → AI**.
3. The "Current configuration" card should show your provider with a `✅` badge.
4. Click **Test now** — you should see a green response.

If `ollama` is selected and the test fails:
- Make sure `ollama serve` is running.
- Make sure you ran `ollama pull <model>` for the chosen model (default: `llama3.2`).
- Make sure `OLLAMA_BASE_URL` points to the machine running Ollama.

---

## 7 · Production deployment

### Backend (FastAPI + Uvicorn behind Nginx)

```bash
# Use gunicorn with uvicorn workers
pip install gunicorn
gunicorn server:app -k uvicorn.workers.UvicornWorker -w 4 -b 0.0.0.0:8001
```

Then proxy `/api` to `localhost:8001` from Nginx/Caddy and serve the React build at root.

### Frontend (static build)

```bash
cd frontend
yarn build
# Copy build/ to your static host or behind Nginx
```

### Docker

A reference `Dockerfile` and `docker-compose.yml` will be added in Phase 2.

---

## 8 · What works without ANY paid service?

| Feature                                       | Works offline / free? |
|-----------------------------------------------|-----------------------|
| All CRUD (projects, tasks, leads, clients…)   | ✅ Yes                |
| Auth, RBAC, role-gated portals                | ✅ Yes                |
| Invoice / Offer letter PDF rendering          | ✅ Yes (server-side)  |
| Chat with attachments + emoji                 | ✅ Yes                |
| Document drag-and-drop uploads                | ✅ Yes                |
| Public Website Experience Manager pages       | ✅ Yes                |
| Digi Creative AI (branded SVGs)               | ✅ Yes — deterministic, no LLM needed |
| CS Email drafting (text)                      | ✅ With Ollama, OpenRouter free, or any key |
| WXM page AI assist                            | ✅ With Ollama, OpenRouter free, or any key |
| Newsletter AI drafts                          | ✅ With Ollama, OpenRouter free, or any key |
| Digi Strategy / Content AI                    | ✅ With Ollama, OpenRouter free, or any key |
| Photoreal image generation (poster, etc.)     | 🟡 Phase-2 only (currently uses branded SVG) |
| Gmail send (Customer Success outbound mail)   | 🟡 Needs the user's own Gmail OAuth (free for personal Gmail) |

---

## 9 · Switching providers without code changes

Use **Settings → AI tab** in the running app. Click any provider card, paste the key (or paste a base URL for Ollama), pick a model, and click **Save & activate**. The next AI call uses the new provider.

To revert to env-based config, click **Clear override**.

---

## 10 · Troubleshooting

| Symptom                                                | Likely cause / fix |
|---------------------------------------------------------|--------------------|
| "No AI provider configured" toast                       | Set one of the env keys above OR configure via Settings → AI |
| Ollama: "Could not reach Ollama at …"                    | Start `ollama serve`; check `OLLAMA_BASE_URL` |
| Ollama: "404 — model not pulled"                         | `ollama pull <model>` (e.g. `llama3.2`) |
| OpenAI 401 / Anthropic 401                               | Bad / expired API key — rotate it |
| Gemini "INVALID_ARGUMENT" on model                       | Use a model ID like `gemini-2.5-flash` from AI Studio docs |
| OpenRouter free model rate-limited                       | Switch to another `:free` model in Settings → AI |
| Page renders blank, no console errors                    | Check `frontend/.env` → `REACT_APP_BACKEND_URL` matches your API host |
| Login fails with correct password                        | Check `JWT_SECRET` is set in `backend/.env`; restart backend |

---

## 11 · Security checklist before going live

- [ ] Change `JWT_SECRET` to a long random value (`openssl rand -hex 32`)
- [ ] Change `ADMIN_EMAIL` + `ADMIN_PASSWORD`, then rotate the seed admin password from inside the app
- [ ] Put TLS in front of the backend (Caddy/Nginx with Let's Encrypt)
- [ ] Restrict MongoDB to localhost or VPC; never expose port 27017 to the internet
- [ ] If you use Ollama remotely, expose it ONLY on your private network — Ollama has no auth
- [ ] Set CORS to your actual frontend origin (Phase-2 will add a config flag)
- [ ] Back up MongoDB daily (`mongodump`)

---

## 12 · License & branding

You own the codebase fully after download. Brand it, white-label it, and ship to your own customers under your own domain. No telemetry phones home.

If you find Projexino useful, ⭐ the repo and tell us where you deployed — we'd love to feature your install.
