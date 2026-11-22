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

  it("carries a card's video paths from the snapshot, and an empty list when there are none", async () => {
    payload.items[0].video_paths = ["b1/item-1/clip.mp4"];
    const body = await (await call("op=page&q=bread")).json();
    expect(body.items[0].videoPaths).toEqual(["b1/item-1/clip.mp4"]);
    const plain = await (await call("op=page&q=cake")).json();
    expect(plain.items[0].videoPaths).toEqual([]);
  });

  it("the page-the-views fallback asks for video_paths too, so videos are not dropped there", async () => {
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/rpc/products_snapshot")) return new Response("{}", { status: 500 });
      if (u.includes("public_items?")) return new Response(JSON.stringify([{ id: "item-1", business_id: "b1", name: "Bread", description: "", price: "100", price_type: "fixed", availability: "available", created_at: "2026-02-01T00:00:00Z", image_paths: ["b1/one.webp"], video_paths: ["b1/item-1/clip.mp4"] }]), { status: 200 });
      if (u.includes("public_businesses?")) return new Response(JSON.stringify([payload.businesses[0]]), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    const body = await (await call("op=page")).json();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("image_paths,video_paths"))).toBe(true);
    expect(body.items[0]).toMatchObject({ imagePath: "b1/one.webp", videoPaths: ["b1/item-1/clip.mp4"] });
  });

  it("does not show a flash sale that has already ended, even from a snapshot built earlier", async () => {
    const body = await (await call("op=page&q=cake")).json();
    const cake = body.items.find((p) => p.name === "Chocolate cake");
    expect(cake.flash).toBeNull();
    expect(cake.pricing).toMatchObject({ regularPrice: 200, salePrice: 200, savings: 0 });
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

  describe("size values (migration 0110)", () => {
    const shoe = (system, value) => ({ scale: "shoe", system, value });
    const withSizes = () => {
      payload = snapshotPayload();
      payload.items[2] = { ...payload.items[2], name: "Loafer", size_values: [shoe("eu", 42), shoe("eu", 43)] };
      payload.items[3] = { ...payload.items[3], name: "Trainer", size_values: [shoe("uk", 8)] }; // UK 8 is EU 42
      payload.items[4] = { ...payload.items[4], name: "Strip light", size_values: [{ scale: "length", value: 5, unit: "m" }, { scale: "length", value: 10, unit: "m" }] };
    };

    it("filters a page by size, merging the same shoe in two systems", async () => {
      withSizes();
      const body = await (await call("op=page&psize=shoe%3Aeu%3A42")).json();
      expect(body.items.map((p) => p.name).sort()).toEqual(["Loafer", "Trainer"]);
      expect(body.items.every((p) => !("sizeValues" in p) && !("size_values" in p))).toBe(true);
    });

    it("filters a page by a length range", async () => {
      withSizes();
      const body = await (await call("op=page&prange=length%3A5-10")).json();
      expect(body.items.map((p) => p.name)).toEqual(["Strip light"]);
      expect((await (await call("op=page&prange=length%3A11-")).json()).items).toEqual([]);
    });

    it("answers size facets and live counts", async () => {
      withSizes();
      const facets = await (await call("op=facets")).json();
      expect(facets.sizes.map((g) => g.scale)).toEqual(["shoe", "length"]);
      expect(facets.sizes[0].options.map((o) => o.count)).toEqual([2, 1]);
      expect(facets.sizes[1]).toMatchObject({ mode: "range", unit: "m", min: 5, max: 10 });
      const counts = await (await call("op=counts")).json();
      expect(new Map(counts.sizes).get("shoe:eu:42")).toBe(2);
    });

    it("an item without sizes never matches a size filter, and no filter changes anything", async () => {
      withSizes();
      const all = await (await call("op=page")).json();
      expect(all.total).toBe(5);
      const none = await (await call("op=page&psize=apparel-alpha%3AM")).json();
      expect(none.items).toEqual([]);
    });

    it("the older snapshot without a sizes column still works and offers no size facets", async () => {
      const facets = await (await call("op=facets")).json();
      expect(facets.sizes).toEqual([]);
    });
  });

  describe("price range and options (migration 0096)", () => {
    it("carries the lowest price, the highest and the options flag, and the card prices from the lowest", async () => {
      payload.items.push(item(90, { name: "Phone", price: "30000", price_min: "24000", price_max: "52000", has_price_range: true, has_options: true }));
      const body = await (await call("op=page&sort=price_asc")).json();
      const phone = body.items.find((p) => p.name === "Phone");
      expect(phone.hasOptions).toBe(true);
      expect(phone.pricing).toMatchObject({ hasRange: true, priceMin: 24000, priceMax: 52000, salePrice: 30000 });
    });

    it("an item whose combinations cost the same, or an older snapshot without the columns, has no range", async () => {
      payload.items.push(item(91, { name: "Same price", price: "500", price_min: "500", price_max: "500", has_price_range: false, has_options: true }));
      const body = await (await call("op=page")).json();
      const same = body.items.find((p) => p.name === "Same price");
      expect(same.pricing.hasRange).toBeUndefined();
      expect(same.hasOptions).toBe(true);
      const plain = body.items.find((p) => p.name === "Fresh bread");
      expect(plain.pricing.priceMin).toBeUndefined();
      expect(plain.hasOptions).toBe(false);
    });

    it("sorts and filters by the lowest price", async () => {
      payload.items.push(item(92, { name: "Ranged", price: "900", price_min: "50", price_max: "900", has_price_range: true }));
      const asc = await (await call("op=page&sort=price_asc")).json();
      expect(asc.items[0].name).toBe("Ranged");
      const cheap = await (await call("op=page&max=60")).json();
      expect(cheap.items.map((p) => p.name)).toContain("Ranged");
    });

    it("the page-the-views fallback asks for the range columns and builds the same range", async () => {
      const asked = [];
      fetchMock.mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes("/rpc/products_snapshot")) return new Response("{}", { status: 500 });
        if (u.includes("/rpc/")) return new Response("{}", { status: 404 });
        if (u.includes("public_items?")) {
          asked.push(u);
          return new Response(JSON.stringify([{ id: "i1", business_id: "b1", name: "Phone", description: "", price: "30000", price_type: "fixed", availability: "available", created_at: "2026-01-01T00:00:00Z", image_paths: [], price_min: "24000", price_high: "52000", has_options: true }]), { status: 200 });
        }
        if (u.includes("public_businesses")) return new Response(JSON.stringify(payload.businesses), { status: 200 });
        return new Response("[]", { status: 200 });
      });
      const body = await (await call("op=page")).json();
      expect(asked[0]).toMatch(/price_min,price_high,has_options/);
      expect(body.items[0].pricing).toMatchObject({ hasRange: true, priceMin: 24000, priceMax: 52000 });
      expect(body.items[0].hasOptions).toBe(true);
    });
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

  describe("the page-the-views fallback and size values (migration 0110)", () => {
    const shoe = (system, value) => ({ scale: "shoe", system, value });
    const views = (sizesReply) => async (url) => {
      const u = String(url);
      if (u.includes("/rpc/products_snapshot")) return new Response("{}", { status: 500 });
      if (u.includes("/rpc/public_item_size_values")) return sizesReply(u);
      if (u.includes("public_items?")) {
        return new Response(JSON.stringify([
          { id: "i1", business_id: "b1", name: "Loafer", description: "", price: "3000", price_type: "fixed", availability: "available", created_at: "2026-02-02T00:00:00Z", image_paths: [] },
          { id: "i2", business_id: "b1", name: "Mug", description: "", price: "300", price_type: "fixed", availability: "available", created_at: "2026-02-01T00:00:00Z", image_paths: [] },
        ]), { status: 200 });
      }
      if (u.includes("public_businesses?")) return new Response(JSON.stringify([payload.businesses[0]]), { status: 200 });
      return new Response("[]", { status: 200 });
    };

    it("keeps size filters working when the snapshot function is unavailable", async () => {
      fetchMock.mockImplementation(views(() => new Response(JSON.stringify({ i1: [shoe("eu", 42), shoe("eu", 43)] }), { status: 200 })));
      const facets = await (await call("op=facets")).json();
      expect(facets.sizes.map((g) => g.scale)).toEqual(["shoe"]);
      const body = await (await call("op=page&psize=shoe%3Aeu%3A42")).json();
      expect(body.items.map((p) => p.name)).toEqual(["Loafer"]);
      expect(body.items.every((p) => !("sizeValues" in p))).toBe(true);
    });

    it("asks for the sizes in one call, not one per item", async () => {
      fetchMock.mockImplementation(views(() => new Response("{}", { status: 200 })));
      await call("op=page");
      expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("/rpc/public_item_size_values"))).toHaveLength(1);
    });

    it.each([
      ["is missing (404)", () => new Response("{}", { status: 404 })],
      ["fails (500)", () => new Response("boom", { status: 500 })],
      ["cannot be reached", () => { throw new Error("network"); }],
    ])("the list still works, with no size facets, when the sizes function %s", async (_name, reply) => {
      fetchMock.mockImplementation(views(reply));
      const body = await (await call("op=page&sort=newest")).json();
      expect(body.items.map((p) => p.name)).toEqual(["Loafer", "Mug"]);
      expect((await (await call("op=facets")).json()).sizes).toEqual([]);
    });

    it("ignores a sizes reply of the wrong shape", async () => {
      fetchMock.mockImplementation(views(() => new Response(JSON.stringify([1, 2, 3]), { status: 200 })));
      expect((await (await call("op=facets")).json()).sizes).toEqual([]);
    });
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

  describe("catalogue scale (migration 0128)", () => {
    const rpcs = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes("/rpc/")).map((u) => u.split("/rpc/")[1]);
    const answer = (handlers) =>
      fetchMock.mockImplementation(async (url, init) => {
        const name = String(url).split("/rpc/")[1];
        if (name && handlers[name]) return handlers[name](init?.body ? JSON.parse(init.body) : {});
        if (name === "products_snapshot") return new Response(JSON.stringify(payload), { status: 200 });
        return new Response("{}", { status: 404 });
      });

    it("suggests from the database dictionary, with CDN caching", async () => {
      const dictionary = { terms: [{ label: "milk" }], products: [{ id: "x", name: "Fresh Milk", slug: "s", image: null, price: 60 }], stores: [], categories: [], corrected: null };
      answer({ search_suggest: (body) => new Response(JSON.stringify(body.p_prefix === "mi" ? dictionary : null), { status: 200 }) });
      const res = await call("op=suggest&q=Mi");
      expect(res.headers.get("Cache-Control")).toMatch(/s-maxage=600/);
      expect(await res.json()).toMatchObject({ ...dictionary, source: "index" });
      expect(rpcs()).toEqual(["search_suggest"]);
    });

    it("suggests from the snapshot when the dictionary has not been built (or the function is missing)", async () => {
      answer({ search_suggest: () => new Response("null", { status: 200 }) });
      const body = await (await call("op=suggest&q=bre")).json();
      expect(body.source).toBe("snapshot");
      expect(body.terms.map((t) => t.label)).toContain("bread");
      expect(body.products[0]).toMatchObject({ id: "item-1", slug: "sunrise-bakery" });
    });

    it("answers one letter with nothing, without asking the database", async () => {
      const body = await (await call("op=suggest&q=m")).json();
      expect(body.terms).toEqual([]);
      expect(rpcs()).toEqual([]);
    });

    // What the database returns. The words are ones this file's fake catalogue has (bread, cake), because the edge then checks product words
    // against the catalogue again and tops the list up; a store, flash sale or category is trusted as the database sent it.
    const lists = { computedAt: "2026-03-01T10:12:00Z", live: false, scope: "*", fallback: "none",
      popular: [{ rank: 1, term: "bread", count: 9, hot: true, kind: "product" }, { rank: 2, term: "sunrise bakery", count: 6, hot: false, kind: "store", slug: "sunrise-bakery" }],
      rising: [{ rank: 1, term: "cake", count: 9, ratio: 9, hot: true, kind: "product" }] };
    lists.items = lists.popular;

    it("serves popular and rising together, every kind in one ranking, from trending_lists", async () => {
      answer({ trending_lists: () => new Response(JSON.stringify(lists), { status: 200 }) });
      const body = await (await call("op=trending")).json();
      expect(body.popular.slice(0, 2).map((x) => [x.term, x.kind, x.count])).toEqual([["bread", "product", 9], ["sunrise bakery", "store", 6]]);
      expect(body.popular[1].slug).toBe("sunrise-bakery");
      expect(body.popular.length).toBeLessThanOrEqual(10);
      expect(body.rising[0]).toMatchObject({ term: "cake", ratio: 9 });
      expect(body.items).toEqual(body.popular);
      expect(rpcs()).toContain("trending_lists");
    });

    it("is cached until 20 minutes past the next hour (the list is rebuilt every hour)", async () => {
      answer({ trending_lists: () => new Response(JSON.stringify(lists), { status: 200 }) });
      vi.useFakeTimers({ toFake: ["Date"] });
      const maxage = async (iso) => {
        vi.setSystemTime(new Date(iso));
        return Number((await call("op=trending")).headers.get("Cache-Control").match(/s-maxage=(\d+)/)[1]);
      };
      expect(await maxage("2026-03-01T10:50:00Z")).toBe(30 * 60); // 10:50 -> 11:20
      expect(await maxage("2026-03-01T11:59:00Z")).toBe(21 * 60); // 11:59 -> 12:20
      expect(await maxage("2026-03-01T12:10:00Z")).toBe(10 * 60); // the new list is not cached before 12:20
      expect(await maxage("2026-03-01T12:30:00Z")).toBe(50 * 60); // 12:30 -> 13:20
      expect(await maxage("2026-03-01T12:20:00Z")).toBe(60); // never less than a minute
    });

    it("passes a known county to the database and ignores anything else", async () => {
      const seen = [];
      answer({ trending_lists: (body) => { seen.push(body); return new Response(JSON.stringify(lists), { status: 200 }); } });
      await call("op=trending&county=kisumu");
      await call("op=trending&county=Uasin%20Gishu");
      await call("op=trending&county=Narnia");
      await call("op=trending&county=%27%3B%20drop%20table");
      await call("op=trending");
      expect(seen.map((b) => b.p_county)).toEqual(["Kisumu", "Uasin Gishu", null, null, null]);
      expect(seen.every((b) => b.p_limit === 10)).toBe(true);
    });

    it("uses the older hourly list when trending_lists is not in the database yet", async () => {
      answer({ top_searches_hourly: () => new Response(JSON.stringify({ computedAt: "2026-03-01T10:02:00Z", live: false, items: [{ term: "bread", count: 9, hot: true }] }), { status: 200 }) });
      const body = await (await call("op=trending")).json();
      expect(body.popular[0]).toMatchObject({ term: "bread", count: 9, hot: true });
      expect(body.items).toEqual(body.popular);
      expect(body.rising).toEqual([]);
    });

    it("falls back to the live count for trending when the hourly list is missing", async () => {
      answer({ top_searches: () => new Response(JSON.stringify([{ term: "bread", count: 4, hot: false }]), { status: 200 }) });
      const body = await (await call("op=trending")).json();
      expect(body).toMatchObject({ live: true, rising: [] });
      expect(body.items[0]).toMatchObject({ term: "bread", count: 4, hot: false, itemId: "item-1", image: "b1/one.webp" });
      expect(body.popular[0]).toMatchObject({ term: "bread", image: "b1/one.webp" });
    });

    it("a fallback list is cached for minutes, not an hour, so a brief database hiccup heals itself", async () => {
      answer({ top_searches: () => new Response(JSON.stringify([{ term: "bread", count: 4, hot: false }]), { status: 200 }) });
      const res = await call("op=trending");
      expect(res.headers.get("Cache-Control")).toMatch(/s-maxage=120/);
      expect((await res.json()).degraded).toBe(true);
    });

    it("builds the unfiltered feed from the hour's pool once the catalogue is bigger than the snapshot, and keeps its order", async () => {
      payload = { ...snapshotPayload(60), truncated: true };
      const pool = { ...snapshotPayload(80), facts: {} };
      answer({ products_feed_pool: () => new Response(JSON.stringify(pool), { status: 200 }) });
      const epoch = Math.floor(Date.now() / 3_600_000) - 1;
      const first = await (await call(`op=page&epoch=${epoch}`)).json();
      expect(rpcs()).toContain("products_feed_pool");
      expect(first).toMatchObject({ epoch, page: 1, pageSize: 24, hasMore: true, capped: true });
      expect(first.items).toHaveLength(24);
      const second = await (await call(`op=page&epoch=${epoch}&page=2`)).json();
      const ids = [...first.items, ...second.items].map((p) => p.id);
      expect(new Set(ids).size).toBe(48);
      expect(rpcs().filter((n) => n === "products_feed_pool")).toHaveLength(1);
    });

    it("serves every page of every page size from one cached hour: a phone's 50 does not shorten a desktop's 54", async () => {
      payload = { ...snapshotPayload(60), truncated: true };
      const pool = { ...snapshotPayload(480), facts: {} };
      answer({ products_feed_pool: () => new Response(JSON.stringify(pool), { status: 200 }) });
      const epoch = Math.floor(Date.now() / 3_600_000) - 1;
      const phone = await (await call(`op=page&epoch=${epoch}&pageSize=50&page=8`)).json();
      expect(phone).toMatchObject({ pageSize: 50, pages: 8 });
      expect(phone.items).toHaveLength(50);
      const wide = await (await call(`op=page&epoch=${epoch}&pageSize=54&page=8`)).json();
      expect(wide).toMatchObject({ pageSize: 54, pages: 8 });
      expect(wide.items).toHaveLength(54);
      expect(rpcs().filter((n) => n === "products_feed_pool")).toHaveLength(1);
    });

    it("gives each variant its own order of the same hour, and the same variant the same order", async () => {
      payload = { ...snapshotPayload(60), truncated: true };
      const pool = { ...snapshotPayload(480), facts: {} };
      answer({ products_feed_pool: () => new Response(JSON.stringify(pool), { status: 200 }) });
      const epoch = Math.floor(Date.now() / 3_600_000) - 1;
      const ids = async (variant) => (await (await call(`op=page&epoch=${epoch}&pageSize=50&page=1&variant=${variant}`)).json()).items.map((i) => i.id).join();
      const [a, b, a2] = [await ids(1), await ids(2), await ids(1)];
      expect(a).not.toBe(b);
      expect(a).toBe(a2);
    });

    it("blends the snapshot when the whole catalogue fits in it, and clamps an hour that is too old", async () => {
      payload = snapshotPayload(60);
      const body = await (await call("op=page&epoch=1")).json();
      expect(rpcs()).not.toContain("products_feed_pool");
      expect(body.epoch).toBe(Math.floor(Date.now() / 3_600_000));
      expect(body.items).toHaveLength(24);
    });

    it("answers the next page of a search with its cards only (view=items), and the first page with its filters", async () => {
      const full = await (await call("op=search&q=bread")).json();
      expect(Array.isArray(full.facets)).toBe(true);
      expect(full.listing).toBeDefined();
      const cards = await (await call("op=search&q=bread&page=2&view=items")).json();
      expect(cards.facets).toBeUndefined();
      expect(cards.related).toBeUndefined();
      expect(cards).toMatchObject({ total: full.total, pageSize: full.pageSize });
    });

    it("corrects a misspelled search against the catalogue's own words when nothing matches", async () => {
      const body = await (await call("op=search&q=bred")).json();
      expect(body.corrected).toBe("bread");
      expect(body.items.map((p) => p.name)).toContain("Fresh bread");
      const none = await (await call("op=search&q=qqqzzz")).json();
      expect(none.total).toBe(0);
      expect(none.corrected).toBeUndefined();
    });

    it("searches past the snapshot with the indexed candidates when the catalogue is bigger, and passes a correction on", async () => {
      payload = { ...snapshotPayload(5), truncated: true };
      const older = { truncated: false, items: [item(40, { name: "Vintage milk jug", business_id: "b1" })], businesses: payload.businesses, facts: {}, matched: 1, corrected: "milk" };
      answer({ search_product_candidates: () => new Response(JSON.stringify(older), { status: 200 }) });
      const body = await (await call("op=search&q=mlik")).json();
      expect(rpcs()).toContain("search_product_candidates");
      expect(body.items.map((p) => p.name)).toContain("Vintage milk jug");
      expect(body.corrected).toBe("milk");
    });
  });
});
