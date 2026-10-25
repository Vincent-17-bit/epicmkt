import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const soon = () => new Date(Date.now() + 3_600_000).toISOString();
const past = () => new Date(Date.now() - 3_600_000).toISOString();

const item = (n, over = {}) => ({
  id: `item-${n}`,
  business_id: n % 2 ? "b1" : "b2",
  name: `Product ${n}`,
  description: `Description ${n}`,
  section: null,
  price: String(n * 100),
  price_type: "fixed",
  unit: null,
  availability: "available",
  created_at: `2026-02-${String(30 - n).padStart(2, "0")}T00:00:00Z`,
  image_path: n === 1 ? "b1/one.webp" : null,
  sale_id: null,
  sale_price: null,
  sale_starts_at: null,
  sale_ends_at: null,
  sale_headline: null,
  ...over
});

const snapshotPayload = (count = 5) => ({
  truncated: false,
  items: [
    item(1, { name: "Fresh bread", sale_id: "s1", sale_price: "80", sale_starts_at: past(), sale_ends_at: soon() }),
    item(2, { name: "Chocolate cake", sale_id: "s2", sale_price: "100", sale_starts_at: past(), sale_ends_at: past() }),
    ...Array.from({ length: count - 2 }, (_, i) => item(i + 3))
  ],
  businesses: [
    { id: "b1", slug: "sunrise-bakery", name: "Sunrise Bakery", plan_key: "premium", verification_level: "verified", category_id: "bakeries", town: "Kisumu", county: "Kisumu", hours: {}, exceptions: [] },
    { id: "b2", slug: "lakeside-cakes", name: "Lakeside Cakes", plan_key: "standard", verification_level: "unverified", category_id: "bakeries", town: "Maseno", county: "Kisumu", hours: {}, exceptions: [] }
  ]
});

let fetchMock;
let payload;
const call = async (qs) => {
  const { default: handler } = await import("./products.js");
  return handler(new Request(`https://example.test/api/products?${qs}`));
};

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("SUPABASE_URL", "https://db.test");
  vi.stubEnv("SUPABASE_ANON_KEY", "anon");
  payload = snapshotPayload();
  fetchMock = vi.fn(async (url) => {
    if (String(url).includes("/rpc/products_snapshot")) return new Response(JSON.stringify(payload), { status: 200 });
    return new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("/api/products", () => {
  it("answers with one small page and CDN cache headers, never the whole catalogue", async () => {
    payload = snapshotPayload(60);
    const res = await call("op=page");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toMatch(/s-maxage=60.*stale-while-revalidate=300/);
    const body = await res.json();
    expect(body.items).toHaveLength(24);
    expect(body).toMatchObject({ total: 60, catalogTotal: 60, page: 1, pageSize: 24, hasMore: true });
    expect(body.items[0]).not.toHaveProperty("hay");
    const next = await (await call("op=page&page=3")).json();
    expect(next.items).toHaveLength(12);
    expect(next.hasMore).toBe(false);
  });

  it("returns raw storage paths for pictures and prices the running flash sale", async () => {
    const body = await (await call("op=page&q=bread")).json();
    expect(body.total).toBe(1);
    const [bread] = body.items;
    expect(bread).toMatchObject({ imagePath: "b1/one.webp", business: { slug: "sunrise-bakery", verified: true, featured: true } });
    expect(bread.pricing).toMatchObject({ regularPrice: 100, salePrice: 80, savings: 20 });
    expect(bread.flash.sale).toMatchObject({ itemId: "item-1" });
  });

  it("does not show a flash sale that has already ended, even from a snapshot built earlier", async () => {
    const body = await (await call("op=page&q=cake")).json();
    expect(body.items[0].flash).toBeNull();
    expect(body.items[0].pricing).toMatchObject({ regularPrice: 200, salePrice: 200, savings: 0 });
  });

  it("filters and sorts with the same rules as the app", async () => {
    const onSale = await (await call("op=page&sale=1")).json();
    expect(onSale.items.map((p) => p.name)).toEqual(["Fresh bread"]);
    const cheap = await (await call("op=page&sort=price_desc&max=300")).json();
    expect(cheap.items.map((p) => p.name)).toEqual(["Product 3", "Chocolate cake", "Fresh bread"]);
    const town = await (await call("op=page&town=maseno")).json();
    expect(town.items.every((p) => p.business.slug === "lakeside-cakes")).toBe(true);
  });

  it("answers facets and live counts", async () => {
    const facets = await (await call("op=facets")).json();
    expect(facets).toMatchObject({ total: 5, price: { min: 80, max: 500 } });
    expect(facets.categories).toEqual([{ id: "bakeries", count: 5 }]);
    expect(facets.towns.map((t) => t.slug).sort()).toEqual(["kisumu", "maseno"]);
    const counts = await (await call("op=counts&sale=1")).json();
    expect(counts.flags.onSale).toBeGreaterThanOrEqual(0);
    expect(counts.categories).toEqual([["bakeries", 1]]);
  });

  it("builds the snapshot once for many requests", async () => {
    await call("op=page");
    await call("op=facets");
    await call("op=page&q=cake");
    await call("op=counts");
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("products_snapshot"))).toHaveLength(1);
  });

  it("falls back to paging the views when the snapshot function is missing", async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/rpc/")) return new Response("{}", { status: 404 });
      if (u.includes("public_items")) return new Response(JSON.stringify([{ id: "i1", business_id: "b1", name: "Loaf", description: "x", price: "50", price_type: "fixed", availability: "available", created_at: "2026-01-01T00:00:00Z", image_paths: ["b1/a.webp"] }]), { status: 200 });
      if (u.includes("public_businesses")) return new Response(JSON.stringify(payload.businesses), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    const body = await (await call("op=page")).json();
    expect(body.items[0]).toMatchObject({ name: "Loaf", imagePath: "b1/a.webp" });
  });

  it("does not list a sold-out product, even when an older database still sends one", async () => {
    payload.items.push(item(8, { name: "Gone loaf", availability: "out_of_stock" }), item(9, { name: "Old word loaf", availability: "unavailable" }));
    const body = await (await call("op=page")).json();
    const names = body.items.map((i) => i.name);
    expect(names).toContain("Fresh bread");
    expect(names).not.toContain("Gone loaf");
    expect(names).not.toContain("Old word loaf");
  });

  it("carries how many are left only for a product running low", async () => {
    payload.items.push(item(6, { name: "Last loaves", availability: "limited_stock", stock_left: 2 }), item(7, { name: "Plenty loaves", stock_left: null }));
    const body = await (await call("op=page")).json();
    const by = Object.fromEntries(body.items.map((i) => [i.name, i]));
    expect(by["Last loaves"]).toMatchObject({ availability: "limited_stock", stockLeft: 2 });
    expect(by["Plenty loaves"].stockLeft).toBeNull();
  });

  it("keeps serving the last good snapshot when a refresh fails, and says so honestly when there is none", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    expect((await call("op=page")).status).toBe(200);
    fetchMock.mockImplementation(async () => new Response("{}", { status: 500 }));
    vi.setSystemTime(new Date("2026-03-01T10:02:00Z"));
    expect((await call("op=page")).status).toBe(200);
    vi.setSystemTime(new Date("2026-03-01T10:30:00Z"));
    const res = await call("op=page");
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("rejects bad requests, other methods, and a missing configuration", async () => {
    expect((await call("op=nope")).status).toBe(400);
    const { default: handler } = await import("./products.js");
    expect((await handler(new Request("https://example.test/api/products?op=page", { method: "POST" }))).status).toBe(405);
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_URL", "");
    expect((await call("op=page")).status).toBe(503);
  });
});
