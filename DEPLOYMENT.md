# KitchenSync Backend - Deployment Plan

Deployment targets: **Render** (backend API) + **Vercel** (web consoles). Domain: `cookbook.farm`.

---

## Current Structure Review

### What’s in place
- **Entry**: `src/index.ts` — Hono app with CORS, logger, health check
- **Routes** (all under `/api/`):
  - `/api/business` — Business accounts, team, hours
  - `/api/reservations` — Reservations
  - `/api/menu` — Menu categories, items, modifiers
  - `/api/orders` — Orders
  - `/api/customers` — Customer CRM
  - `/api/analytics` — Analytics
  - `/api/ai` — AI proxy (recipe generation, parse, menu, prep-list, image) — requires `XAI_API_KEY`
- **Data**: Supabase (PostgreSQL + Auth) — routes use `@supabase/supabase-js`
- **Optional**: Prisma + SQLite (`prisma/schema.prisma`, `src/db.ts`) — not used by routes; likely for legacy/studio

### Vibecode removal (complete)
Vibecode dependencies and code have been removed. CORS is configured for `cookbook.farm`, `cook.farm`, localhost, and the deployed backend URL.

---

## Environment Variables

| Variable | Required | Where to set |
|----------|----------|--------------|
| `PORT` | No (default 3000) | Render sets automatically |
| `NODE_ENV` | No | `production` on Render |
| `BACKEND_URL` | Yes (in prod) | Full API URL, e.g. `https://api.cookbook.farm` |
| `SUPABASE_URL` | Yes | Supabase project settings |
| `SUPABASE_ANON_KEY` | Yes | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase project settings |
| `XAI_API_KEY` | Yes (for AI features) | xAI Console — used for recipe/menu/prep-list AI and image generation |

Copy `.env.example` to `.env` locally; configure same vars in Render dashboard.

---

## Deployment: Render (Backend API)

1. Connect GitHub repo: `flehmenlips/kitchensync-backend`.

2. **Service type**: Web Service.

3. **Build & run**:
   - **Build command**: `bun install`
   - **Start command**: `bun run src/index.ts`
   - **Root directory**: `.` (or leave default)

4. **Environment variables** (Render → Environment):
   - `BACKEND_URL` = `https://api.cookbook.farm` (or your Render URL until custom domain is set)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `XAI_API_KEY` (for mobile AI recipe/menu/prep-list/image features)
   - `NODE_ENV` = `production`

5. **Custom domain** (after DNS):
   - Add `api.cookbook.farm` in Render → Settings → Custom Domains.
   - Add CNAME `api` → Render-provided host.

6. **Health check**: Render can use `GET /health` for liveness.

---

## Deployment: Vercel (Web Consoles)

Connect `flehmenlips/kitchensync-web` to Vercel.

- **Framework preset**: React / Next.js (or whatever the web project uses).
- **Environment variables**:
  - `VITE_API_URL` or `NEXT_PUBLIC_API_URL` (or equivalent) = `https://api.cookbook.farm`
  - Supabase keys if the web app uses Supabase client-side (anon key only).

Custom domains: `cookbook.farm`, `cook.farm`, e.g. via Vercel project settings.

---

## CORS Setup After Vibecode Removal

Add these origins to the CORS allowlist in `src/index.ts`:

```ts
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/cookbook\.farm$/,
  /^https:\/\/www\.cookbook\.farm$/,
  /^https:\/\/cook\.farm$/,
  /^https:\/\/www\.cook\.farm$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/,  // Vercel preview deployments
];
```

---

## Suggested Order of Operations

1. Remove Vibecode dependencies (imports, packages, scripts).
2. Update CORS with `cookbook.farm` / `cook.farm` origins.
3. Ensure `.env` (or Render env) is set locally and matches deployment.
4. Deploy backend to Render.
5. Point `api.cookbook.farm` to Render.
6. Deploy web to Vercel and point `cookbook.farm` / `www.cookbook.farm` to it.
7. Re-test health, API, and web flows.

---

## Quick Local Check

```bash
# From project root
bun install
cp .env.example .env   # Then edit .env with real values
bun run dev
```

Then:

```bash
curl $BACKEND_URL/health
# Expect: {"status":"ok","version":"1.0.0"}
```
