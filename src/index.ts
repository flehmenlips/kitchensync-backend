import { Hono } from "hono";
import { cors } from "hono/cors";
import "./env";
import { sampleRouter } from "./routes/sample";
import { businessRouter } from "./routes/business";
import { reservationsRouter } from "./routes/reservations";
import { menuRoutes } from "./routes/menu";
import { ordersRouter } from "./routes/orders";
import { customersRouter } from "./routes/customers";
import { analyticsRouter } from "./routes/analytics";
import { aiRouter } from "./routes/ai";
import { notificationsRouter } from "./routes/notifications";
import { logger } from "hono/logger";
import { requireAuth } from "./middleware/auth";
import { rateLimiter } from "./middleware/rateLimiter";

const app = new Hono();

const ALLOWED_ORIGINS = [
  "https://cookbook.farm",
  "https://www.cookbook.farm",
  "https://cook.farm",
  "https://www.cook.farm",
  "https://kitchensync-web.vercel.app",
];

const devOriginPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

function getDynamicOrigins(): string[] {
  const origins: string[] = [];
  for (const envKey of ["BACKEND_URL", "RENDER_EXTERNAL_URL"]) {
    const url = process.env[envKey];
    if (url) {
      try {
        const parsed = new URL(url);
        origins.push(`${parsed.protocol}//${parsed.host}`);
      } catch {
        /* skip invalid URL */
      }
    }
  }
  return origins;
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (devOriginPatterns.some((re) => re.test(origin))) return true;
  if (vercelPreviewPattern.test(origin)) return true;
  if (getDynamicOrigins().includes(origin)) return true;
  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (isOriginAllowed(origin)) {
        return origin ?? "https://kitchensync-backend-2h5n.onrender.com";
      }
      return null;
    },
    credentials: true,
  })
);

app.use("*", logger());

// Public routes that bypass auth
const PUBLIC_PATHS = [
  /^\/health$/,
  /^\/api\/sample/,
  /^\/api\/business\/slug\//,
  /^\/api\/menu\/[^/]+\/public$/,
  /^\/api\/reservations\/[^/]+\/availability$/,
];

function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((pattern) => pattern.test(path));
}

// Auth middleware applied to all /api/* routes, skipping public paths
app.use("/api/*", async (c, next) => {
  if (isPublicPath(c.req.path)) {
    return next();
  }
  return requireAuth(c, next);
});

// Rate limit AI endpoints: 10 requests per minute per authenticated user
app.use(
  "/api/ai/*",
  rateLimiter({
    windowMs: 60 * 1000,
    limit: 10,
    keyGenerator: (c: any) => {
      const user = c.get("user");
      return user?.id || c.req.header("x-forwarded-for") || "anonymous";
    },
  })
);

// Health check
app.get("/health", (c) => c.json({ status: "ok", version: "1.0.0" }));

// Routes
app.route("/api/sample", sampleRouter);
app.route("/api/business", businessRouter);
app.route("/api/reservations", reservationsRouter);
app.route("/api/menu", menuRoutes);
app.route("/api/orders", ordersRouter);
app.route("/api/customers", customersRouter);
app.route("/api/analytics", analyticsRouter);
app.route("/api/ai", aiRouter);
app.route("/api/notifications", notificationsRouter);

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
