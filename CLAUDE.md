# KitchenSync Backend - Project Guide

**Tech Stack**: Bun + Hono + Zod + Supabase (PostgreSQL)

**Purpose**: This is the shared backend API for the web consoles and iOS mobile app.

## Project Structure

```
src/
├── index.ts          → Main Hono app, middleware, route mounting
├── env.ts            → Environment variable validation (Zod)
├── supabase.ts       → Supabase client setup
├── types.ts          → Shared Zod schemas (single source of truth)
├── routes/
│   ├── business.ts
│   ├── reservations.ts
│   ├── menu.ts
│   ├── orders.ts
│   ├── customers.ts
│   └── analytics.ts
└── db.ts             → (Optional) Prisma or direct Supabase helpers
```

## Key Principles

- **Supabase is the database** — Use Supabase client for most operations.
- **All routes** must be prefixed with `/api/` (e.g., `/api/business`, `/api/reservations`).
- **Shared types**: All API contracts live in `src/types.ts` as Zod schemas.
- **CORS**: Configured for `cookbook.farm`, `cook.farm`, Vercel previews, and localhost.
- **Environment**: Load from `.env` using `src/env.ts`.

## Development Workflow

1. Define or update Zod schemas in `src/types.ts`
2. Implement backend route in `src/routes/`
3. Mount the route in `src/index.ts`
4. Test with cURL: `curl $BACKEND_URL/api/business`
5. Update frontend and mobile to match the schemas

## Deployment

- **Render.com** (preferred for Bun + Hono)
- Build command: `bun install`
- Start command: `bun run src/index.ts`
- Environment variables: See `.env.example`

## Important Notes

- Remove any remaining Vibecode references (already mostly cleaned).
- Keep routes modular and well-documented.
- Use Supabase Row Level Security (RLS) for data protection.
