import "@vibecodeapp/proxy"; // DO NOT REMOVE OTHERWISE VIBECODE PROXY WILL NOT WORK
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
const allowed = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+\.dev\.vibecode\.run$/,
  /^https:\/\/[a-z0-9-]+\.vibecode\.run$/,
];

app.use(
  "*",
  cors({
    origin: (origin) => (origin && allowed.some((re) => re.test(origin)) ? origin : null),
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
