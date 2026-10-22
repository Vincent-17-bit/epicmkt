import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});

import * as live from "./live.js";
import { saleRow } from "../../test/fakeSupabase.js";

const db = () => fake.current.state;

const biz = (n, over = {}) => ({
  id: `10000000-0000-0000-0000-00000000000${n}`,
  slug: `shop-${n}`,
  name: `Shop ${n}`,
  category_id: "bakeries",
  plan_key: "standard",
  verification_level: "unverified",
  tagline: "",
  description: "",
  phone: "+254700000000",
  whatsapp: null,
  county: "Kisumu",
  town: "Kisumu",
  lat: -0.1,
  lng: 34.75,
  logo_path: null,
  cover_path: null,
  tags: [],
  hours: {},
  created_at: `2026-0${n}-01T00:00:00Z`,
  ...over
});

const item = (n, businessId, price, price_type = "fixed") => ({ id: `item-${n}`, business_id: businessId, price, price_type });

beforeEach(() => {
  live.invalidateBrowseCache();
  db().businesses = [];
  db().items = [];
  db().categories = [];
  db().sales = [];
  db().offers = [];
  db().failing = null;
});

describe("live browse adapter", () => {
  it("lists a live business that the mock never knew about", async () => {
    db().businesses = [biz(1, { name: "Sunrise Bakery", slug: "sunrise-bakery-777001", plan_key: "premium", verification_level: "verified" })];
    db().items = [item(1, biz(1).id, "250.00"), item(2, biz(1).id, "120")];
    const result = await live.searchBusinesses({});
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ slug: "sunrise-bakery-777001", plan: "premium", verified: true, fromPriceKes: 120, townSlug: "kisumu" });
  });

  it("returns nothing, not mock data, when the database is empty", async () => {
    expect((await live.searchBusinesses({})).total).toBe(0);
    expect(await live.getFeaturedBusinesses({})).toEqual([]);
  });

  it("searches by name, tag and category with weighting", async () => {
    db().businesses = [biz(1, { name: "Sunrise Bakery" }), biz(2, { name: "Other", tags: ["bread"] }), biz(3, { name: "Garage", category_id: "mechanics" })];
    const byName = await live.searchBusinesses({ query: "sunrise" });
    expect(byName.items.map((b) => b.slug)).toEqual(["shop-1"]);
    const byTag = await live.searchBusinesses({ query: "bread" });
    expect(byTag.items.map((b) => b.slug)).toEqual(["shop-2"]);
    const none = await live.searchBusinesses({ query: "zzz" });
    expect(none.total).toBe(0);
  });

  it("filters by category, town, price and verified", async () => {
    db().businesses = [
      biz(1, { town: "Maseno", verification_level: "verified" }),
      biz(2, { category_id: "mechanics" }),
      biz(3, { town: "Maseno" })
    ];
    db().items = [item(1, biz(1).id, 100), item(2, biz(3).id, 900)];
    expect((await live.searchBusinesses({ categoryId: "mechanics" })).items.map((b) => b.slug)).toEqual(["shop-2"]);
    expect((await live.searchBusinesses({ town: "maseno" })).total).toBe(2);
    expect((await live.searchBusinesses({ verifiedOnly: true })).items.map((b) => b.slug)).toEqual(["shop-1"]);
    expect((await live.searchBusinesses({ maxPrice: 200 })).items.map((b) => b.slug)).toEqual(["shop-1"]);
  });

  it("ranks premium first on relevance and paginates", async () => {
    db().businesses = [biz(1), biz(2, { plan_key: "premium" }), biz(3)];
    const first = await live.searchBusinesses({ pageSize: 2 });
    expect(first.items[0].slug).toBe("shop-2");
    expect(first).toMatchObject({ total: 3, totalPages: 2, page: 1 });
    expect((await live.searchBusinesses({ pageSize: 2, page: 2 })).items).toHaveLength(1);
  });

  it("sorts newest and by distance", async () => {
    db().businesses = [biz(1, { lat: -0.5, lng: 34.9 }), biz(2, { lat: -0.1, lng: 34.75 })];
    expect((await live.searchBusinesses({ sort: "newest" })).items[0].slug).toBe("shop-2");
    const near = await live.searchBusinesses({ sort: "distance", lat: -0.1, lng: 34.75 });
    expect(near.items[0]).toMatchObject({ slug: "shop-2" });
    expect(near.items[0].distanceKm).toBeCloseTo(0, 1);
  });

  it("featured means premium plan, seed shuffles deterministically", async () => {
    db().businesses = [biz(1), biz(2, { plan_key: "premium" }), biz(3, { plan_key: "premium" })];
    const a = await live.getFeaturedBusinesses({ seed: 7 });
    const b = await live.getFeaturedBusinesses({ seed: 7 });
    expect(a.map((x) => x.slug).sort()).toEqual(["shop-2", "shop-3"]);
    expect(a.map((x) => x.slug)).toEqual(b.map((x) => x.slug));
  });

  it("nearby needs an origin and respects the radius", async () => {
    db().businesses = [biz(1, { lat: -0.1, lng: 34.75 }), biz(2, { lat: 1.3, lng: 36.8 }), biz(3, { lat: null, lng: null })];
    expect(await live.getNearbyBusinesses({})).toEqual([]);
    const near = await live.getNearbyBusinesses({ lat: -0.1, lng: 34.75, radiusKm: 10 });
    expect(near.map((x) => x.slug)).toEqual(["shop-1"]);
  });

  it("similar returns same-category businesses and throws for unknown refs", async () => {
    db().businesses = [biz(1), biz(2), biz(3, { category_id: "mechanics" })];
    const similar = await live.getSimilarBusinesses("shop-1");
    expect(similar.map((x) => x.slug)).toEqual(["shop-2"]);
    await expect(live.getSimilarBusinesses("missing")).rejects.toMatchObject({ name: "NotFoundError" });
  });

  it("categories merge database rows with local metadata and live counts", async () => {
    db().categories = [
      { id: "bakeries", name: "Bakeries", icon: "store", sort: 1, active: true },
      { id: "brand-new", name: "Brand New", icon: "store", sort: 2, active: true }
    ];
    db().businesses = [biz(1), biz(2)];
    const cats = await live.getCategories();
    const bakeries = cats.find((c) => c.id === "bakeries");
    expect(bakeries.count).toBe(2);
    expect(bakeries.hue).toEqual(expect.any(Number));
    expect(cats.find((c) => c.id === "brand-new")).toMatchObject({ count: 0, singular: "Brand New" });
  });

  it("falls back to local category definitions when the table is empty", async () => {
    const cats = await live.getCategories();
    expect(cats.length).toBeGreaterThan(0);
  });

  it("towns and facets are built from live businesses", async () => {
    db().businesses = [biz(1, { town: "Maseno" }), biz(2, { town: "Kisumu" }), biz(3, { town: null })];
    db().items = [item(1, biz(1).id, 50), item(2, biz(2).id, 500)];
    const towns = await live.getTowns();
    expect(towns.map((t) => t.slug)).toEqual(["kisumu", "maseno"]);
    const facets = await live.getSearchFacets({});
    expect(facets.price).toEqual({ min: 50, max: 500 });
    expect(facets.fields).toEqual([]);
    expect(await live.getCounties()).toEqual(["Kisumu"]);
  });

  it("suggests categories, businesses and tags", async () => {
    db().businesses = [biz(1, { name: "Sunrise Bakery", tags: ["sourdough"] })];
    const out = await live.getSuggestions("sun");
    expect(out).toContainEqual({ type: "business", label: "Sunrise Bakery", slug: "shop-1" });
    expect(await live.getSuggestions("s")).toEqual([]);
  });

  it("pages through more than 1000 rows", async () => {
    db().businesses = Array.from({ length: 1200 }, (_, i) => biz(1, { id: `id-${i}`, slug: `s-${i}`, name: `B ${i}` }));
    expect((await live.searchBusinesses({ pageSize: 1 })).total).toBe(1200);
  });

  it("surfaces database errors instead of showing mock data", async () => {
    db().failing = { message: "boom", code: "500" };
    await expect(live.searchBusinesses({})).rejects.toMatchObject({ name: "BrowseApiError" });
  });

  it("counts each business's live flash sales so the card shows its chip", async () => {
    db().businesses = [biz(1), biz(2)];
    const now = Date.now();
    db().sales = [
      saleRow({ id: "s1", business_id: biz(1).id, now }),
      saleRow({ id: "s2", business_id: biz(1).id, now }),
      saleRow({ id: "s3", business_id: biz(1).id, now, ends_at: new Date(now - 1000).toISOString() })
    ];
    const { items } = await live.searchBusinesses({});
    const bySlug = Object.fromEntries(items.map((b) => [b.slug, b.promo]));
    expect(bySlug["shop-1"]).toEqual({ flash: 2, offers: 0 });
    expect(bySlug["shop-2"]).toEqual({ flash: 0, offers: 0 });
  });

  it("counts live offers, including ones with no end date, and ignores finished ones", async () => {
    db().businesses = [biz(1), biz(2)];
    const now = Date.now();
    db().offers = [
      { id: "o1", business_id: biz(1).id, ends_at: null },
      { id: "o2", business_id: biz(1).id, ends_at: new Date(now + 3600000).toISOString() },
      { id: "o3", business_id: biz(1).id, ends_at: new Date(now - 1000).toISOString() }
    ];
    const { items } = await live.searchBusinesses({});
    const bySlug = Object.fromEntries(items.map((b) => [b.slug, b.promo]));
    expect(bySlug["shop-1"]).toEqual({ flash: 0, offers: 2 });
    expect(bySlug["shop-2"]).toEqual({ flash: 0, offers: 0 });
  });

  it("still lists businesses, without chips, when offers or sales cannot be read", async () => {
    db().businesses = [biz(1)];
    const original = fake.current.client.from;
    fake.current.client.from = (table) => {
      if (table === "public_offers" || table === "public_flash_sales") throw new Error("view missing");
      return original(table);
    };
    try {
      const { items } = await live.searchBusinesses({});
      expect(items[0].promo).toEqual({ flash: 0, offers: 0 });
    } finally {
      fake.current.client.from = original;
    }
  });
});
