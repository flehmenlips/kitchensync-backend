import { createMiddleware } from "hono/factory";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter middleware.
 * Tracks request counts per key within a sliding window.
 */
export function rateLimiter(opts: {
  windowMs: number;
  limit: number;
  keyGenerator: (c: any) => string;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Periodically clean expired entries to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, opts.windowMs * 2);

  return createMiddleware(async (c, next) => {
    const key = opts.keyGenerator(c);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + opts.windowMs };
      store.set(key, entry);
    }

    entry.count++;

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, opts.limit - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > opts.limit) {
      return c.json(
        {
          error: {
            message: "Too many requests, please try again later",
            code: "RATE_LIMITED",
          },
        },
        429
      );
    }

    return next();
  });
}
