# KitchenSync Backend - Project Guide

**Tech Stack**: Bun + Hono + Zod + Supabase (PostgreSQL)

**Purpose**: This is the shared backend API for the web consoles and iOS mobile app.

## Project Structure

```
src/
├── index.ts          → Main Hono app, middleware, route mounting
├── env.ts            → Environment variable validation (Zod)
├── supabase.ts       → Supabase client setup (uses validated env)
├── types.ts          → Shared Zod schemas (single source of truth)
├── utils.ts          → Shared utilities (case conversion, JSON parsing)
├── middleware/
│   ├── auth.ts       → Supabase JWT auth middleware (requireAuth)
│   └── rateLimiter.ts → In-memory rate limiting middleware
├── routes/
│   ├── ai.ts
│   ├── analytics.ts
│   ├── business.ts
│   ├── customers.ts
│   ├── menu.ts
│   ├── orders.ts
│   ├── reservations.ts
│   └── sample.ts
└── __tests__/        → Bun test files
supabase/
└── migrations/       → SQL migrations for Supabase (RPC functions, constraints)
```

## Key Principles

- **Supabase is the database** — Use Supabase client for most operations.
- **All routes** must be prefixed with `/api/` (e.g., `/api/business`, `/api/reservations`).
- **Shared types**: All API contracts live in `src/types.ts` as Zod schemas.
- **Shared utilities**: Case conversion and JSON parsing live in `src/utils.ts`. Never duplicate helpers in route files.
- **CORS**: Configured for `cookbook.farm`, `cook.farm`, Vercel previews, and localhost.
- **Environment**: All env vars validated in `src/env.ts` via Zod — including Supabase keys.

## Authentication

- All `/api/*` routes require a valid Supabase JWT in the `Authorization: Bearer <token>` header.
- Auth middleware in `src/middleware/auth.ts` verifies the token and sets `c.get('user')` with `{ id, email }`.
- **Public exceptions** (no auth required): `/health`, `/api/sample`, `/api/business/slug/:slug`, `/api/menu/:id/public`, `/api/reservations/:id/availability`.
- Admin routes derive the admin user from the auth token — never from the request body.
- Route handlers access the authenticated user via `c.get('user') as AuthUser`.

## Response Format Conventions

- **Success**: Always wrap in `{ data: ... }` (e.g., `{ data: { id: "..." } }`)
- **Error**: Always use `{ error: { message: "...", code: "..." } }` with appropriate HTTP status
- **DELETE**: Return `204 No Content` (except business delete which returns metadata)
- **Pagination**: `{ data: [...], pagination: { total, limit, offset, hasMore } }`

## Development Workflow

1. Define or update Zod schemas in `src/types.ts`
2. Implement backend route in `src/routes/`
3. Mount the route in `src/index.ts`
4. Run tests: `bun test`
5. Test with cURL: `curl $BACKEND_URL/api/business`
6. Update frontend and mobile to match the schemas

## Testing

- Tests use Bun's built-in test runner: `bun test`
- Test files live in `src/__tests__/`
- Tests import the Hono app directly for in-process request testing

## Deployment

- **Render.com** — Bun is auto-detected via `bun.lock`
- Build command: `bun install`
- Start command: `bun run src/index.ts`
- Environment variables: See `.env.example`
- **Database migrations**: Apply SQL files from `supabase/migrations/` in the Supabase SQL Editor

## Important Notes

- Keep routes modular and well-documented.
- Use Supabase Row Level Security (RLS) for data protection.
- JSON fields (tags, preferences, modifiers, etc.) are parsed from DB strings into proper types before returning to clients.
- Tax rate and delivery fee are configurable per business (stored in `business_accounts`).
- AI endpoints (`/api/ai/*`) are rate-limited to 10 requests/minute per user.
