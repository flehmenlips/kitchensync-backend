# KitchenSync Backend

Shared API backend for the KitchenSync platform — powers the web consoles (Admin, Business) and the iOS mobile app.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [Hono](https://hono.dev)
- **Validation**: [Zod](https://zod.dev)
- **Database & Auth**: [Supabase](https://supabase.com) (PostgreSQL)
- **Language**: TypeScript

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) v1.0+

### Run Locally

```bash
# Clone the repo
git clone https://github.com/flehmenlips/kitchensync-backend.git
cd kitchensync-backend

# Install dependencies
bun install

# Copy environment template and add your values
cp .env.example .env

# Start dev server (hot reload)
bun run dev
```

The API runs at `http://localhost:3000`. Check `/health`:

```bash
curl http://localhost:3000/health
```

### Environment Variables

See `.env.example` for required variables. You need:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` from [Supabase Dashboard](https://app.supabase.com) → Settings → API
- `BACKEND_URL` — your backend URL (e.g. `http://localhost:3000` locally)

## API Routes

| Path | Description |
|------|-------------|
| `GET /health` | Health check |
| `/api/business` | Business accounts, team, hours |
| `/api/reservations` | Reservations |
| `/api/menu` | Menu categories, items, modifiers |
| `/api/orders` | Orders |
| `/api/customers` | Customer CRM |
| `/api/analytics` | Analytics |

## Deploy

### Render.com

1. Connect this repo to [Render](https://render.com).
2. Create a **Web Service**.
3. Use:
   - **Build**: `bun install`
   - **Start**: `bun run src/index.ts`
4. Add environment variables in the Render dashboard (see `.env.example`).
5. Or use the **Blueprint** workflow — `render.yaml` is configured for this project.

Health check endpoint: `GET /health`.

## Current Status

- **Backend**: Deployed on Render.com
- **Web**: Vercel at [cookbook.farm](https://cookbook.farm)
- **Mobile**: iOS app (Expo) on TestFlight

## Related Repos

- [kitchensync-web](https://github.com/flehmenlips/kitchensync-web) — React web consoles
- [kitchensync-mobile](https://github.com/flehmenlips/kitchensync-mobile) — Expo iOS app
