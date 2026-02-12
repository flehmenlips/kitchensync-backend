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
import { logger } from "hono/logger";

const app = new Hono();

// CORS middleware - validates origin against allowlist
const ALLOWED_ORIGINS = [
  "https://cookbook.farm",
  "https://www.cookbook.farm",
  "https://kitchensync-web.vercel.app",
];

// Dev patterns with optional port (e.g. http://localhost:5173)
const devOriginPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

// Vercel preview deployments (e.g. kitchensync-web-xxx.vercel.app)
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
  // Allow requests with no Origin (e.g. mobile apps, curl, Postman)
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

// Logging
app.use("*", logger());

// Health check endpoint
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

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
