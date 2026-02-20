import { describe, test, expect } from "bun:test";
import app from "../index";

describe("Health endpoint", () => {
  test("GET /health returns 200 with status ok", async () => {
    const res = await app.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("1.0.0");
  });
});

describe("Route mounting", () => {
  test("GET /api/sample returns 200", async () => {
    const res = await app.fetch(new Request("http://localhost/api/sample"));
    expect(res.status).toBe(200);
  });

  test("Protected route without auth returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/business")
    );
    expect(res.status).toBe(401);

    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  test("Unknown /api route without auth returns 401", async () => {
    const res = await app.fetch(
      new Request("http://localhost/api/nonexistent")
    );
    expect(res.status).toBe(401);
  });

  test("Unknown non-API route returns 404", async () => {
    const res = await app.fetch(
      new Request("http://localhost/nonexistent")
    );
    expect(res.status).toBe(404);
  });
});

describe("CORS", () => {
  test("Allows requests from cookbook.farm", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "https://cookbook.farm" },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://cookbook.farm"
    );
  });

  test("Allows requests from cook.farm", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "https://cook.farm" },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "https://cook.farm"
    );
  });

  test("Allows requests from localhost", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "http://localhost:5173" },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );
  });

  test("Rejects unknown origins", async () => {
    const res = await app.fetch(
      new Request("http://localhost/health", {
        headers: { Origin: "https://evil.com" },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
