import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const snapshotPayload = () => ({
  businesses: [
    { id: "b1", slug: "sunrise-bakery", name: "Sunrise Bakery", category_id: "bakeries", plan_key: "premium", verification_level: "verified", tagline: "", description: "", phone: "+254700000001", whatsapp: null, county: "Kisumu", town: "Kisumu", lat: -0.1, lng: 34.75, logo_path: "b1/logo.png", cover_path: null, tags: ["bread"], hours: {}, created_at: "2026-01-01T00:00:00Z", exceptions: [] },
    { id: "b2", slug: "lakeside-cakes", name: "Lakeside Cakes", category_id: "bakeries", plan_key: "standard", verification_level: "unverified", tagline: "", description: "", phone: "+254700000002", whatsapp: null, county: "Kisumu", town: "Maseno", lat: -0.0, lng: 34.6, logo_path: null, cover_path: null, tags: ["cake"], hours: {}, created_at: "2026-02-01T00:00:00Z", exceptions: [] }
  ],
  prices: { b1: "120.00" },
  flash: { b1: [new Date(Date.now() + 3_600_000).toISOString()] },
  offers: { b2: [null] },
  categories: [{ id: "bakeries", name: "Bakeries", icon: "bread", sort: 1, active: true }]
});

let fetchMock;
const call = async (qs) => {
  const { default: handler } = await import("../browse.js");
  return handler(new Request(`https://example.test/api/browse?${qs}`));
};

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  fetchMock = vi.fn(async (url) => {
    if (String(url).includes("/rpc/browse_snapshot")) return new Response(JSON.stringify(snapshotPayload()), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/browse", () => {
  it("answers a search with one small page and CDN cache headers", async () => {
    const res = await call("op=search&query=bread&pageSize=12");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/s-maxage=30.*stale-while-revalidate=300/);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.items[0]).toMatchObject({ slug: "sunrise-bakery", fromPriceKes: 120, coverUrl: null, logoUrl: "b1/logo.png", promo: { flash: 1, offers: 0 } });
  });

  it("builds the catalog snapshot once for many requests", async () => {
    await call("op=categories");
    await call("op=search");
    await call("op=suggest&prefix=lak");
    await call("op=towns");
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("browse_snapshot"))).toHaveLength(1);
  });

  it("collapses simultaneous cold requests into one database call", async () => {
    await Promise.all([call("op=search"), call("op=search&page=2"), call("op=counties")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to paging the views when the snapshot function is missing", async () => {
    const p = snapshotPayload();
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/rpc/")) return new Response("{}", { status: 404 });
      if (u.includes("public_businesses")) return new Response(JSON.stringify(p.businesses), { status: 200 });
      if (u.includes("public_items")) return new Response(JSON.stringify([{ business_id: "b1", price: "90", price_type: "fixed" }]), { status: 200 });
      if (u.includes("categories")) return new Response(JSON.stringify(p.categories), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    const body = await (await call("op=search&sort=newest")).json();
    expect(body.total).toBe(2);
    expect(body.items.find((i) => i.slug === "sunrise-bakery").fromPriceKes).toBe(90);
  });

  it("reports an unknown business as 404 and a bad operation as 400", async () => {
    expect((await call("op=similar&ref=nope")).status).toBe(404);
    expect((await call("op=wat")).status).toBe(400);
  });

  it("only accepts reads", async () => {
    const { default: handler } = await import("../browse.js");
    expect((await handler(new Request("https://example.test/api/browse?op=search", { method: "POST" }))).status).toBe(405);
  });

  it("keeps serving the last good snapshot when a refresh fails, and says so honestly when there is none", async () => {
    const cold = await call("op=search");
    expect(cold.status).toBe(200);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 120_000);
    fetchMock.mockImplementation(async () => new Response("down", { status: 500 }));
    const stale = await call("op=search");
    vi.useRealTimers();
    expect(stale.status).toBe(200);

    vi.resetModules();
    const none = await call("op=search");
    expect(none.status).toBe(503);
    expect(none.headers.get("Cache-Control")).toBe("no-store");
  });
});
