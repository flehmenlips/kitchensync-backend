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
import { logger } from "hono/logger";

const app = new Hono();

// CORS middleware - validates origin against allowlist
const allowedPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/cookbook\.farm$/,
  /^https:\/\/www\.cookbook\.farm$/,
  /^https:\/\/cook\.farm$/,
  /^https:\/\/www\.cook\.farm$/,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/, // Vercel preview deployments
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  if (allowedPatterns.some((re) => re.test(origin))) return true;
  // Allow deployed backend URL (e.g. https://api.cookbook.farm)
  const backendUrl = process.env.BACKEND_URL;
  if (backendUrl) {
    try {
      const url = new URL(backendUrl);
      const backendOrigin = `${url.protocol}//${url.host}`;
      if (origin === backendOrigin) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

app.use(
  "*",
  cors({
    origin: (origin) => (isOriginAllowed(origin) ? origin : null),
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

const port = Number(process.env.PORT) || 3000;

export default {
  port,
  fetch: app.fetch,
};
