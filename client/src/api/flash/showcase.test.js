import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLatency } from "@epicmkt/backend";
import { getStoreShowcase } from "@epicmkt/backend";
import * as live from "./live.js";
import { invalidateSnapshot } from "./snapshot.js";

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});

const SHOP = "10000000-0000-0000-0000-00000000000a";
const EMPTY = "10000000-0000-0000-0000-00000000000b";
const db = () => fake.current.state;

const itemRow = (n, over = {}) => ({
  id: `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  business_id: SHOP,
  name: `Item ${n}`,
  price: "100.00",
  price_type: "fixed",
  unit: null,
  section: null,
  availability: "available",
  image_paths: [`${SHOP}/${n}.jpg`],
  created_at: "2026-01-01T00:00:00Z",
  ...over
});

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
  setLatency(0);
  invalidateSnapshot();
  db().sales = [];
  db().failing = null;
  db().businesses = [
    { id: SHOP, slug: "shop-a" },
    { id: EMPTY, slug: "new-shop" }
  ];
  db().items = [];
});

describe("live showcase products", () => {
  it("returns every product of a small store, with the right picture and price for each", async () => {
    db().items = [1, 2, 3].map((n) => itemRow(n));
    const out = await live.getShowcaseProducts([SHOP], { pool: 24 });
    expect(out[SHOP].total).toBe(3);
    expect(out[SHOP].items.map((i) => i.name)).toEqual(["Item 1", "Item 2", "Item 3"]);
    expect(out[SHOP].items[1].imageUrl).toBe(`https://x.supabase.co/storage/v1/object/public/seller-media/${SHOP}/2.jpg`);
    expect(out[SHOP].items[0].pricing.salePrice).toBe(100);
    expect(out[SHOP].items[0].businessSlug).toBe("shop-a");
  });

  it("gives a store with no products an empty list instead of failing", async () => {
    const out = await live.getShowcaseProducts([EMPTY], { pool: 24 });
    expect(out[EMPTY]).toEqual({ total: 0, items: [] });
  });

  it("reads only a window of a store with a thousand products, from a random start", async () => {
    db().items = Array.from({ length: 1000 }, (_, i) => itemRow(i + 1));
    const out = await live.getShowcaseProducts([SHOP], { pool: 24, rng: () => 0.5 });
    expect(out[SHOP].total).toBe(1000);
    expect(out[SHOP].items).toHaveLength(24);
    expect(out[SHOP].items[0].name).toBe(`Item ${Math.floor(0.5 * (1000 - 24 + 1)) + 1}`);
  });

  it("uses a different window for a different random start, so products change between visits", async () => {
    db().items = Array.from({ length: 1000 }, (_, i) => itemRow(i + 1));
    const a = await live.getShowcaseProducts([SHOP], { pool: 24, rng: () => 0.1 });
    const b = await live.getShowcaseProducts([SHOP], { pool: 24, rng: () => 0.9 });
    expect(a[SHOP].items[0].id).not.toBe(b[SHOP].items[0].id);
  });

  it("applies a live flash-sale price to a product in the window", async () => {
    db().items = [itemRow(1)];
    db().sales = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        business_id: SHOP,
        item_id: itemRow(1).id,
        starts_at: new Date(Date.now() - 3600000).toISOString(),
        ends_at: new Date(Date.now() + 3600000).toISOString(),
        discount_type: "percent",
        discount_value: "20.00",
        variant_overrides: [],
        item_name: "Item 1",
        item_price_type: "fixed",
        item_availability: "available",
        regular_price: "100.00",
        sale_price: "80.00",
        business_slug: "shop-a",
        business_name: "Shop A",
        business_hours: {}
      }
    ];
    const out = await live.getShowcaseProducts([SHOP], { pool: 24 });
    expect(out[SHOP].items[0].pricing.salePrice).toBe(80);
    expect(out[SHOP].items[0].pricing.discountPercent).toBe(20);
  });

  it("asks for nothing when there are no stores", async () => {
    expect(await live.getShowcaseProducts([])).toEqual({});
  });

  it("surfaces a read failure so the caller can fall back", async () => {
    db().failing = { message: "down" };
    await expect(live.getShowcaseProducts([SHOP])).rejects.toThrow();
  });
});

describe("demo backend showcase products", () => {
  it("returns a window of listed products per active store, and skips unknown stores", async () => {
    const { searchBusinesses } = await import("@epicmkt/backend");
    const { items: shops } = await searchBusinesses({ pageSize: 3 });
    const out = await getStoreShowcase([...shops.map((s) => s.id), "nope"], { pool: 2 });
    expect(Object.keys(out)).toHaveLength(3);
    for (const entry of Object.values(out)) {
      expect(entry.items.length).toBeLessThanOrEqual(2);
      expect(entry.total).toBeGreaterThanOrEqual(entry.items.length);
      entry.items.forEach((item) => expect(item.pricing).toBeTruthy());
    }
  });
});
