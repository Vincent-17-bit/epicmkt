import { afterEach, beforeEach, describe, expect, it } from "vitest";

const PROD = ["https://epicmkt.co.ke", "https://business.epicmkt.co.ke", "https://admin.epicmkt.co.ke"];
const LOCAL = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"];

let env: Record<string, string | undefined> = {};

beforeEach(() => {
  env = {};
  (globalThis as any).Deno = { env: { get: (k: string) => env[k] } };
});

afterEach(() => {
  delete (globalThis as any).Deno;
});

const load = () => import("./http.ts");
const handler = async () => {
  const { withCors, json } = await load();
  return withCors((req) => (req.method === "OPTIONS" ? new Response("ok") : json({ ok: true }, 201)));
};
const call = async (origin: string | null, method = "POST") => {
  const h = await handler();
  const headers: Record<string, string> = origin ? { origin } : {};
  return h(new Request("https://fn.example/x", { method, headers }));
};

describe("ALLOWED_ORIGINS", () => {
  it.each([...PROD, ...LOCAL])("accepts %s", async (origin) => {
    env.ALLOWED_ORIGINS = [...PROD, ...LOCAL].join(",");
    const res = await call(origin);
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBe(origin);
    expect(res.headers.get("vary")).toContain("Origin");
  });

  it("answers preflight for an allowed origin", async () => {
    env.ALLOWED_ORIGINS = PROD.join(",");
    const res = await call(PROD[1], "OPTIONS");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(PROD[1]);
  });

  it("rejects an unlisted origin and never reflects it", async () => {
    env.ALLOWED_ORIGINS = PROD.join(",");
    const res = await call("https://evil.example");
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("rejects preflight from an unlisted origin", async () => {
    env.ALLOWED_ORIGINS = PROD.join(",");
    const res = await call("https://evil.example", "OPTIONS");
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("matches exactly, not by prefix or suffix", async () => {
    env.ALLOWED_ORIGINS = PROD.join(",");
    for (const origin of ["https://epicmkt.co.ke.evil.example", "http://epicmkt.co.ke", "https://epicmkt.co.ke:444", "https://sub.epicmkt.co.ke"]) {
      expect((await call(origin)).status).toBe(403);
    }
  });

  it("ignores a wildcard entry", async () => {
    env.ALLOWED_ORIGINS = "*";
    env.APP_ENV = "production";
    expect((await call("https://anything.example")).status).toBe(403);
  });

  it("trims whitespace around entries", async () => {
    env.ALLOWED_ORIGINS = ` ${PROD[0]} , ${PROD[1]} `;
    expect((await call(PROD[1])).status).toBe(201);
  });

  it("allows only local origins when unset outside production", async () => {
    expect((await call(LOCAL[1])).status).toBe(201);
    expect((await call(PROD[0])).status).toBe(403);
  });

  it("allows no browser origin when unset in production", async () => {
    env.APP_ENV = "production";
    expect((await call(LOCAL[1])).status).toBe(403);
    expect((await call(PROD[0])).status).toBe(403);
  });

  it("lets requests without an Origin header through", async () => {
    env.ALLOWED_ORIGINS = PROD.join(",");
    const res = await call(null);
    expect(res.status).toBe(201);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
