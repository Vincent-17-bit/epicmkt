import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLatency } from "@epicmkt/backend";
import { saleRow } from "../../test/fakeSupabase.js";
import * as mock from "./mock.js";
import * as live from "./live.js";
import { invalidateSnapshot } from "./snapshot.js";
import { resetClock, syncServerTime } from "../../lib/clock.js";

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});

vi.mock("../index.js", () => ({
  getServerTime: async () => (await import("./live.js")).getServerTime()
}));

const HOUR = 3600000;
const A = "10000000-0000-0000-0000-00000000000a";
const B = "10000000-0000-0000-0000-00000000000b";

const row = (n, over = {}) =>
  saleRow({
    id: `00000000-0000-0000-0000-00000000010${n}`,
    item_id: `20000000-0000-0000-0000-00000000010${n}`,
    item_name: `Item ${n}`,
    ...over
  });

const db = () => fake.current.state;

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
  setLatency(0);
  resetClock();
  invalidateSnapshot();
  db().sales = [];
  db().items = [];
  db().businesses = [];
  db().failing = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const keys = (value) => Object.keys(value).sort();

describe("flash adapters", () => {
  it("mock and live expose the same functions", () => {
    for (const name of ["getServerTime", "list", "getForItem", "facets"]) {
      expect(typeof mock[name], `mock ${name}`).toBe("function");
      expect(typeof live[name], `live ${name}`).toBe("function");
    }
  });

  it("live entries have exactly the shape the mock returns", async () => {
    const reference = (await mock.list({ limit: 1 })).items[0];
    db().sales = [row(1)];
    const result = await live.list();
    const entry = result.items[0];
    expect(keys(result)).toEqual(keys(await mock.list({ limit: 1 })));
    expect(keys(entry)).toEqual(keys(reference));
    for (const part of ["sale", "item", "pricing", "business"]) expect(keys(entry[part]), part).toEqual(keys(reference[part]));
    expect(keys(await live.facets())).toEqual(keys(await mock.facets()));
    expect(typeof (await live.getServerTime()).now).toBe("string");
    expect(keys(await mock.getServerTime())).toEqual(["now"]);
  });

  it("returns the prices computed by the server, as numbers", async () => {
    db().sales = [row(1, { discount_value: "20.00" })];
    const { sale, pricing, item, business } = (await live.list()).items[0];
    expect(pricing).toMatchObject({ regularPrice: 1000, salePrice: 800, savings: 200, discountPercent: 20 });
    expect(sale.discount).toEqual({ type: "percent", value: 20 });
    expect(item).toMatchObject({ id: "20000000-0000-0000-0000-000000000101", regularPrice: 1000, status: "listed" });
    expect(business).toMatchObject({ slug: "shop-a", townSlug: "maseno", verified: true });
  });

  it("never returns a sale whose end has passed, whatever the cache holds", async () => {
    const now = Date.now();
    db().sales = [row(1, { ends_at: new Date(now + 5000).toISOString() }), row(2, { ends_at: new Date(now + HOUR).toISOString() })];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    await syncServerTime();
    expect((await live.list()).total).toBe(2);
    vi.setSystemTime(now + 6000);
    expect((await live.list()).items.map((e) => e.item.name)).toEqual(["Item 2"]);
    expect(await live.getForItem("20000000-0000-0000-0000-000000000101")).toBeNull();
    expect((await live.facets()).total).toBe(1);
  });

  it.each([
    ["ahead", 2 * HOUR],
    ["behind", -2 * HOUR]
  ])("a device %s of the server sees the same live sales, even before the clock sync answers", async (_label, skew) => {
    const real = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(real + skew);
    db().serverNow = real;
    db().sales = [row(1, { now: real, ends_at: new Date(real + HOUR).toISOString() }), row(2, { now: real, ends_at: new Date(real - 60000).toISOString() })];
    const result = await live.list();
    expect(result.items.map((e) => e.item.name)).toEqual(["Item 1"]);
    expect(Math.abs(result.items[0].remainingMs - HOUR)).toBeLessThan(1000);
    db().serverNow = null;
  });

  it("after the clock sync a device that is ahead drops a sale exactly when the server does", async () => {
    const real = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(real + 2 * HOUR);
    db().serverNow = real;
    db().sales = [row(1, { ends_at: new Date(real + 10000).toISOString() })];
    await syncServerTime();
    expect((await live.list()).total).toBe(1);
    vi.setSystemTime(real + 2 * HOUR + 11000);
    db().serverNow = real + 11000;
    expect((await live.list()).total).toBe(0);
    db().serverNow = null;
  });

  it("filters, sorts and pages like the mock", async () => {
    const now = Date.now();
    db().sales = [
      row(1, { now, ends_at: new Date(now + 30 * 60000).toISOString(), sale_price: "900.00", discount_percent: "10", business_category_id: "tailors", business_town: "Kisumu", business_slug: "t-one", business_lat: -0.09, business_lng: 34.76, business_id: B }),
      row(2, { now, ends_at: new Date(now + 5 * HOUR).toISOString(), sale_price: "500.00", business_id: A }),
      row(3, { ends_at: new Date(now + 30 * HOUR).toISOString(), sale_price: "300.00", business_id: A, starts_at: new Date(now - 100000).toISOString() })
    ];
    const names = async (params) => (await live.list(params)).items.map((e) => e.item.name);
    expect(await names({})).toEqual(["Item 1", "Item 2", "Item 3"]);
    expect(await names({ endsWithin: "1h" })).toEqual(["Item 1"]);
    expect(await names({ endsWithin: "24h" })).toEqual(["Item 1", "Item 2"]);
    expect(await names({ categoryId: "tailors" })).toEqual(["Item 1"]);
    expect(await names({ town: "kisumu" })).toEqual(["Item 1"]);
    expect(await names({ businessId: "shop-a" })).toEqual(["Item 2", "Item 3"]);
    expect(await names({ businessId: A })).toEqual(["Item 2", "Item 3"]);
    expect(await names({ minPrice: 400 })).toEqual(["Item 1", "Item 2"]);
    expect(await names({ maxPrice: 400 })).toEqual(["Item 3"]);
    expect(await names({ sort: "newest" })).toEqual(["Item 3", "Item 1", "Item 2"]);
    expect(await names({ sort: "nearest", origin: { lat: -0.09, lng: 34.76 } })).toEqual(["Item 1", "Item 2", "Item 3"]);
    const page = await live.list({ limit: 2, offset: 2 });
    expect(page.items.map((e) => e.item.name)).toEqual(["Item 3"]);
    expect(page.total).toBe(3);
  });

  it("counts facets from the same rows as the list", async () => {
    db().sales = [row(1), row(2, { business_category_id: "tailors", business_town: "Kisumu" }), row(3)];
    const facets = await live.facets();
    expect(facets.total).toBe((await live.list({ limit: 50 })).total);
    expect(facets.categories).toEqual([{ id: "barbershops", count: 2 }, { id: "tailors", count: 1 }]);
    expect(facets.towns).toEqual([{ slug: "kisumu", name: "Kisumu", count: 1 }, { slug: "maseno", name: "Maseno", count: 2 }]);
  });

  it("shares one request between simultaneous callers", async () => {
    db().sales = [row(1)];
    db().calls = [];
    await Promise.all([live.list(), live.facets(), live.getForItem("x"), live.list({ sort: "newest" })]);
    expect(db().calls.filter((c) => c === "public_flash_sales")).toHaveLength(1);
  });

  it("reports a missing view as an error instead of inventing data", async () => {
    db().failing = { code: "PGRST205", message: "Could not find the table 'public.public_flash_sales'" };
    await expect(live.list()).rejects.toMatchObject({ name: "FlashApiError", code: "PGRST205" });
    await expect(live.facets()).rejects.toMatchObject({ code: "PGRST205" });
    await expect(live.getServerTime()).rejects.toMatchObject({ code: "PGRST205" });
  });
});

describe("live item and business pages", () => {
  const itemRow = (over = {}) => ({
    id: "20000000-0000-0000-0000-000000000101",
    business_id: A,
    name: "Fade and beard",
    description: "Sharp cut",
    section: "Cuts",
    price: "1000.00",
    price_max: null,
    price_type: "fixed",
    unit: null,
    availability: "available",
    sort: 0,
    created_at: "2026-10-01T00:00:00Z",
    image_paths: [`${A}/fade.webp`],
    ...over
  });
  const bizRow = (over = {}) => ({
    id: A,
    slug: "shop-a",
    name: "Shop A",
    category_id: "barbershops",
    plan_key: "standard",
    verification_level: "verified",
    tagline: null,
    description: "Cuts",
    phone: "+254712345678",
    whatsapp: "+254712345678",
    socials: {},
    county: "Kisumu",
    town: "Maseno",
    address: "Main St",
    lat: -0.0058,
    lng: 34.6,
    logo_path: null,
    cover_path: null,
    tags: ["fade"],
    hours: { mon: ["08:00", "18:00"] },
    created_at: "2026-09-01T00:00:00Z",
    ...over
  });

  it("shows the sale while it runs and the regular price once it is gone", async () => {
    db().items = [itemRow()];
    db().businesses = [bizRow()];
    db().sales = [row(1, { item_id: "20000000-0000-0000-0000-000000000101", business_id: A })];
    const during = await live.getItemDetail("20000000-0000-0000-0000-000000000101", { businessId: "shop-a" });
    expect(during.flash.sale.id).toBe("00000000-0000-0000-0000-000000000101");
    expect(during.pricing).toMatchObject({ regularPrice: 1000, salePrice: 800 });
    db().sales = [];
    invalidateSnapshot();
    const after = await live.getItemDetail("20000000-0000-0000-0000-000000000101", { businessId: A });
    expect(after.flash).toBeNull();
    expect(after.pricing).toMatchObject({ regularPrice: 1000, salePrice: 1000, savings: 0, discountPercent: 0 });
    expect(after.images[0].url).toBe(`https://x.supabase.co/storage/v1/object/public/seller-media/${A}/fade.webp`);
  });

  it("answers NotFound for ids it does not own", async () => {
    await expect(live.getItemDetail("fade-and-beard")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(live.getItemDetail("20000000-0000-0000-0000-0000000009ff")).rejects.toMatchObject({ name: "NotFoundError" });
    db().items = [itemRow()];
    db().businesses = [bizRow()];
    await expect(live.getItemDetail("20000000-0000-0000-0000-000000000101", { businessId: "other-shop" })).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(live.getBusiness("nobody")).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(live.resolveShortcode("nobody")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("builds a business page with its items", async () => {
    db().items = [itemRow(), itemRow({ id: "20000000-0000-0000-0000-000000000102", name: "Wash", price: "200.00", image_paths: [] })];
    db().businesses = [bizRow()];
    const business = await live.getBusiness("shop-a");
    expect(business).toMatchObject({ id: A, slug: "shop-a", shortcode: "shop-a", area: "Maseno", plan: "standard", verified: true, offers: [], gallery: [] });
    expect(business.services.map((s) => [s.name, s.priceKes])).toEqual([["Fade and beard", 1000], ["Wash", 200]]);
    expect(business.category?.id).toBe("barbershops");
    expect(business.services[1].imageUrl).toBeNull();
    expect(await live.resolveShortcode("shop-a")).toEqual({ slug: "shop-a" });
  });

  it("ranks Store Selective with live deals first", async () => {
    db().items = [itemRow(), itemRow({ id: "20000000-0000-0000-0000-000000000102", name: "Wash", section: "Cuts" }), itemRow({ id: "20000000-0000-0000-0000-000000000103", name: "Dye", section: "Color" })];
    db().businesses = [bizRow()];
    db().sales = [row(3, { item_id: "20000000-0000-0000-0000-000000000103", business_id: A })];
    const rows = await live.getStoreSelective("shop-a", { excludeItemId: "20000000-0000-0000-0000-000000000101" });
    expect(rows.map((r) => r.name)).toEqual(["Wash", "Dye"]);
    expect(rows[1].flash).not.toBeNull();
    expect(rows[0].flash).toBeNull();
  });

  describe("getSimilarItems", () => {
    const C = "10000000-0000-0000-0000-00000000000c";
    const D = "10000000-0000-0000-0000-00000000000d";
    const SEED = "20000000-0000-0000-0000-000000000101";
    const id = (n) => `20000000-0000-0000-0000-0000000002${String(n).padStart(2, "0")}`;
    const setup = () => {
      db().businesses = [
        bizRow({ category_id: "bakeries" }),
        bizRow({ id: B, slug: "shop-b", name: "Shop B", category_id: "bakeries", tags: ["fresh"] }),
        bizRow({ id: C, slug: "shop-c", name: "Shop C", category_id: "supermarkets", lat: -0.4, lng: 34.9 }),
        bizRow({ id: D, slug: "cake-house", name: "Cake House", category_id: "bakeries" })
      ];
    };
    const seedItem = (over = {}) => itemRow({ name: "Brown Bread 400g", section: "Bakery", price: "70.00", ...over });
    const at = (n, store, over = {}) => itemRow({ id: id(n), business_id: store, name: "Bread", section: "Bakery", price: "70.00", ...over });
    // What the SQL function does, coarsely: a word match on the terms it is given, or the same section, from other stores.
    const net = ({ p_terms }) =>
      db().items.filter((r) => r.business_id !== A && (p_terms.some((t) => new RegExp(`\\b${t}\\b`, "i").test(r.name)) || String(r.section ?? "").toLowerCase() === "bakery"));
    const heavy = (table) => db().calls.filter((c) => c === table).length;

    it("finds the same kind of item in any other store, whatever its category, never the current store or item, and never a different kind", async () => {
      setup();
      db().items = [
        seedItem(),
        itemRow({ id: "20000000-0000-0000-0000-000000000102", name: "Wholemeal loaf", section: "Bakery" }),
        at(1, B, { name: "Wheat loaf" }),
        at(2, C, { name: "White bread 800g", section: "Food" }),
        at(3, D, { name: "Chocolate cake" }),
        at(4, D, { name: "Cupcake" }),
        at(5, C, { name: "Milk", section: "Dairy" })
      ];
      const rows = await live.getSimilarItems(SEED);
      expect(rows.map((r) => r.id)).toEqual([id(1), id(2)]);
      expect(rows[0].business).toMatchObject({ id: B, slug: "shop-b", name: "Shop B" });
    });

    it("does not fall back to other stores of the same category when there are few real matches", async () => {
      setup();
      db().items = [seedItem(), ...[1, 2, 3, 4, 5].map((n) => at(n, D, { name: `Cake ${n}`, section: "Cakes", price: "70.00" })), at(6, C, { name: "Sneakers", section: "Men" })];
      expect(await live.getSimilarItems(SEED)).toEqual([]);
    });

    it("returns a short row rather than padding it with things of another kind", async () => {
      setup();
      db().items = [seedItem(), at(1, B, { name: "Wheat loaf" }), at(2, C, { name: "Chocolate cake" }), at(3, D, { name: "Tea", section: "Drinks" })];
      expect((await live.getSimilarItems(SEED, { limit: 12 })).map((r) => r.id)).toEqual([id(1)]);
    });

    it("shows nothing for an item with no head noun and no section: no signal, no row", async () => {
      setup();
      db().items = [itemRow({ name: "Item", section: null }), at(1, B), at(2, C)];
      expect(await live.getSimilarItems(SEED)).toEqual([]);
    });

    it("ranks the same product first, then the same section, then shared words and the closest price, and puts a running sale's price on the item", async () => {
      setup();
      db().items = [
        seedItem(),
        at(1, B, { name: "Bread", section: "Care", price: "70.00" }),
        at(2, B, { name: "Bread", section: "Bakery", price: "9000.00" }),
        at(3, C, { name: "Brown bread", section: "bakery", price: "75.00" })
      ];
      db().sales = [row(3, { item_id: id(3), business_id: C, regular_price: "75.00", sale_price: "60.00" })];
      const rows = await live.getSimilarItems(SEED, { limit: 3 });
      expect(rows.map((r) => r.id)).toEqual([id(3), id(2), id(1)]);
      expect(rows[0].pricing.salePrice).toBe(60);
      expect(rows[0].flash).not.toBeNull();
    });

    it("prefers a nearer store when everything else ties", async () => {
      setup();
      db().items = [seedItem(), at(1, C), at(2, B)];
      db().businesses[1].lat = -0.0059;
      db().businesses[1].lng = 34.6001;
      const rows = await live.getSimilarItems(SEED, { origin: { lat: -0.0058, lng: 34.6 } });
      expect(rows.map((r) => r.id)).toEqual([id(2), id(1)]);
    });

    it("gives about half the row to different featured stores that have the item, alternating with the rest", async () => {
      const shop = (n, over = {}) => ({ ...bizRow(), id: `10000000-0000-0000-0000-0000000001${n}`, slug: `shop-${n}`, name: `Shop ${n}`, ...over });
      db().businesses = [bizRow(), shop(1, { plan_key: "premium" }), shop(2, { plan_key: "premium" }), shop(3), shop(4), shop(5)];
      const bread = (n, k, over = {}) => at(10 * n + k, `10000000-0000-0000-0000-0000000001${n}`, over);
      db().items = [seedItem(), bread(1, 1), bread(1, 2), bread(1, 3), bread(2, 1), bread(3, 1), bread(4, 1), bread(5, 1)];
      const rows = await live.getSimilarItems(SEED, { limit: 4 });
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => r.business.featured)).toEqual([true, false, true, false]);
      expect(new Set(rows.map((r) => r.business.id)).size).toBe(4);
    });

    it("is empty for unknown ids, a lone store, and non-live ids, and does not ask for the heavy fields", async () => {
      setup();
      db().items = [seedItem()];
      expect(await live.getSimilarItems("fade-and-beard")).toEqual([]);
      expect(await live.getSimilarItems("20000000-0000-0000-0000-0000000009ff")).toEqual([]);
      db().selects = [];
      expect(await live.getSimilarItems(SEED)).toEqual([]);
      db().items = [seedItem(), at(1, B, { highlights: ["x"], specs: [{ label: "a", value: "b" }] })];
      db().selects = [];
      expect(await live.getSimilarItems(SEED)).toHaveLength(1);
      for (const [table, columns] of db().selects.filter(([t]) => t === "public_items")) for (const name of ["highlights", "specs", "includes", "terms"]) expect(columns, `${table} ${name}`).not.toContain(name);
    });

    it("throws when the items cannot be read (the API entry turns that into an empty row)", async () => {
      setup();
      db().items = [seedItem(), at(1, B)];
      db().failing = { message: "down" };
      await expect(live.getSimilarItems(SEED)).rejects.toThrow();
    });

    describe("with the database function (migration 0065)", () => {
      beforeEach(() => {
        db().rpc = {};
        db().calls = [];
      });

      it("asks once, with the head-noun forms, and takes no other item query", async () => {
        setup();
        db().items = [seedItem(), at(1, B, { name: "Wheat loaf" }), at(2, C, { name: "White bread", section: "Food" })];
        const asked = [];
        db().rpc.similar_item_candidates = (args) => (asked.push(args), net(args));
        const rows = await live.getSimilarItems(SEED);
        expect(rows.map((r) => r.id)).toEqual([id(1), id(2)]);
        expect(asked).toHaveLength(1);
        expect(asked[0].p_item_id).toBe(SEED);
        for (const word of ["bread", "breads", "loaf", "loaves"]) expect(asked[0].p_terms).toContain(word);
        expect(asked[0].p_limit).toBeGreaterThan(0);
        expect(heavy("public_items")).toBe(1);
      });

      it("still applies the relevance gate to whatever the database returns", async () => {
        setup();
        db().items = [seedItem(), at(1, B, { name: "Wheat loaf" }), at(2, D, { name: "Chocolate cake" }), at(3, D, { name: "Cupcake" })];
        db().rpc.similar_item_candidates = () => db().items.filter((r) => r.business_id !== A);
        expect((await live.getSimilarItems(SEED)).map((r) => r.id)).toEqual([id(1)]);
      });

      it("never shows the current item or store, even if the function returned them", async () => {
        setup();
        db().items = [seedItem(), itemRow({ id: "20000000-0000-0000-0000-000000000102", name: "Bread", section: "Bakery" }), at(1, B), at(2, C)];
        db().rpc.similar_item_candidates = () => db().items;
        expect((await live.getSimilarItems(SEED)).map((r) => r.id).sort()).toEqual([id(1), id(2)]);
      });

      it("treats a database error other than a missing function as an error, not a reason to fall back", async () => {
        setup();
        db().items = [seedItem(), at(1, B)];
        db().rpc.similar_item_candidates = () => ({ error: { code: "57014", message: "statement timeout" } });
        await expect(live.getSimilarItems(SEED)).rejects.toThrow();
        expect(heavy("public_items")).toBe(1);
      });

      it("carries the abort signal to every read", async () => {
        setup();
        db().items = [seedItem(), at(1, B)];
        const controller = new AbortController();
        db().rpc.similar_item_candidates = (args) => {
          controller.abort();
          return net(args);
        };
        await expect(live.getSimilarItems(SEED, { signal: controller.signal })).rejects.toThrow(/abort/i);
        await expect(live.getSimilarItems(SEED, { signal: AbortSignal.abort() })).rejects.toThrow(/abort/i);
      });
    });

    it("falls back to the item queries when the function is not deployed yet, and the gate still holds", async () => {
      setup();
      db().rpc = {};
      db().calls = [];
      db().items = [seedItem(), at(1, B, { name: "Wheat loaf" }), at(2, D, { name: "Chocolate cake" })];
      expect((await live.getSimilarItems(SEED)).map((r) => r.id)).toEqual([id(1)]);
      expect(db().calls).toContain("similar_item_candidates");
      expect(heavy("public_items")).toBeGreaterThan(1);
    });
  });

  describe("item details from public_items", () => {
    const HEAVY = ["highlights", "specs", "includes", "terms"];
    const full = {
      short_description: "Short one",
      brand: "Acme",
      highlights: ["Fast", "Light"],
      specs: [{ label: "Weight", value: "1 kg" }],
      includes: ["Charger"],
      terms: "Warranty 6 months",
      pack_size: "2 pieces"
    };

    it("maps the real detail fields onto the item", async () => {
      db().items = [itemRow(full)];
      db().businesses = [bizRow()];
      const item = await live.getItemDetail("20000000-0000-0000-0000-000000000101");
      expect(item).toMatchObject({ shortDescription: "Short one", brand: "Acme", highlights: ["Fast", "Light"], includes: ["Charger"], terms: "Warranty 6 months", packSize: "2 pieces" });
      expect(item.specs).toEqual([{ label: "Weight", value: "1 kg" }]);
    });

    it("an item without them gets the defaults, and bad values never throw", async () => {
      db().items = [itemRow()];
      db().businesses = [bizRow()];
      const plain = await live.getItemDetail("20000000-0000-0000-0000-000000000101");
      expect(plain).toMatchObject({ brand: null, highlights: [], includes: [], terms: "", packSize: null, specs: [] });
      db().items = [itemRow({ brand: 1, highlights: "x", specs: 4, includes: {}, terms: [], pack_size: 9, short_description: false })];
      const bad = await live.getItemDetail("20000000-0000-0000-0000-000000000101");
      expect(bad).toMatchObject({ brand: null, highlights: [], includes: [], terms: "", packSize: null, specs: [] });
    });

    it("store selective and the business page do not ask for the heavy fields", async () => {
      db().items = [itemRow(), itemRow({ id: "20000000-0000-0000-0000-000000000102", name: "Wash", ...full })];
      db().businesses = [bizRow()];
      db().selects = [];
      await live.getStoreSelective("shop-a", { excludeItemId: "20000000-0000-0000-0000-000000000101" });
      await live.getBusiness("shop-a");
      const asked = db().selects.filter(([table]) => table === "public_items");
      expect(asked.length).toBeGreaterThan(0);
      for (const [, columns] of asked) for (const name of HEAVY) expect(columns, name).not.toContain(name);
    });
  });
});

describe("home products", () => {
  const SHOP = "10000000-0000-0000-0000-000000000001";
  const row = (n, over = {}) => ({
    id: `item-${n}`,
    business_id: SHOP,
    name: `Product ${n}`,
    price: "100",
    price_type: "fixed",
    availability: "available",
    image_paths: [],
    video_paths: [],
    created_at: `2026-02-0${n}T00:00:00Z`,
    ...over
  });

  it("lists public products newest first with their store, at regular price when nothing is on sale", async () => {
    const db = fake.current.state;
    db.businesses = [{ id: SHOP, slug: "shop-a", name: "Shop A", plan_key: "standard", verification_level: "unverified" }];
    db.items = [row(1, { image_paths: ["a/1.webp"] }), row(2), row(3, { business_id: "99999999-0000-0000-0000-000000000009" })];
    db.sales = [];
    const items = await live.getAllProducts();
    expect(items.map((r) => r.name).sort()).toEqual(["Product 1", "Product 2"]);
    const first = items.find((r) => r.name === "Product 1");
    expect(first.business).toMatchObject({ id: SHOP, slug: "shop-a", name: "Shop A", verified: false, featured: false });
    expect(first.pricing).toMatchObject({ regularPrice: 100, salePrice: 100, savings: 0 });
    expect(first.flash).toBeNull();
  });

  it("flags verified and featured stores", async () => {
    const db = fake.current.state;
    db.businesses = [{ id: SHOP, slug: "shop-a", name: "Shop A", plan_key: "premium", verification_level: "verified" }];
    db.items = [row(1)];
    const items = await live.getAllProducts();
    expect(items[0].business).toMatchObject({ verified: true, featured: true });
  });

  it("returns every product once", async () => {
    const db = fake.current.state;
    db.businesses = [{ id: SHOP, slug: "shop-a", name: "Shop A", plan_key: "standard", verification_level: "unverified" }];
    db.items = [1, 2, 3, 4, 5].map((n) => row(n));
    const ids = (await live.getAllProducts()).map((r) => r.id);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
  });

  it("puts a running flash sale's price on the product", async () => {
    const db = fake.current.state;
    const itemId = "20000000-0000-0000-0000-000000000001";
    db.businesses = [{ id: SHOP, slug: "shop-a", name: "Shop A", plan_key: "standard", verification_level: "unverified" }];
    db.items = [row(1, { id: itemId, price: "1000", name: "Fade" })];
    db.sales = [saleRow({ business_id: SHOP, item_id: itemId })];
    const items = await live.getAllProducts();
    expect(items[0].pricing).toMatchObject({ regularPrice: 1000, salePrice: 800 });
    expect(items[0].flash).not.toBeNull();
  });
});
