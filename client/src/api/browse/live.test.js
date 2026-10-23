import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});

import * as live from "./live.js";

const db = () => fake.current.state;
const originalRpc = fake.current.client.rpc;

const card = (n, over = {}) => ({
  id: `10000000-0000-0000-0000-00000000000${n}`,
  slug: `shop-${n}`,
  name: `Shop ${n}`,
  tagline: "",
  categoryId: "bakeries",
  county: "Kisumu",
  town: "Kisumu",
  plan: "standard",
  verified: false,
  coverPath: null,
  logoPath: null,
  fromPriceKes: null,
  phone: "+254700000000",
  whatsapp: null,
  lat: -0.1,
  lng: 34.75,
  isOpen: false,
  distanceKm: null,
  promo: { flash: 0, offers: 0 },
  ...over
});

let routes;
let calls;

beforeEach(() => {
  live.invalidateBrowseCache();
  db().categories = [];
  db().failing = null;
  db().calls = [];
  calls = [];
  routes = {};
  fake.current.client.rpc = vi.fn(async (name, args) => {
    calls.push({ name, args });
    const route = routes[name];
    if (!route) return originalRpc(name, args);
    const out = typeof route === "function" ? route(args) : route;
    return out?.error ? { data: null, error: out.error } : { data: out, error: null };
  });
});

const rpcCalls = (name) => calls.filter((c) => c.name === name);

describe("live browse adapter", () => {
  it("never downloads a table: browsing reads one page through one search call", async () => {
    routes.browse_search = { total: 1, page: 1, pageSize: 12, items: [card(1)] };
    await live.searchBusinesses({});
    const tables = db().calls.filter((t) => t !== "categories");
    expect(tables).toEqual([]);
    expect(rpcCalls("browse_search")).toHaveLength(1);
  });

  it("maps a page to card summaries with category metadata, prices and promo counts", async () => {
    routes.browse_search = {
      total: 30,
      items: [
        card(1, { name: "Sunrise Bakery", plan: "premium", verified: true, fromPriceKes: "120.00", isOpen: true, distanceKm: 1.5, promo: { flash: 2, offers: 1 } }),
        card(2, { town: null, county: null, plan: "gold", fromPriceKes: null })
      ]
    };
    const result = await live.searchBusinesses({ pageSize: 12 });
    expect(result).toMatchObject({ total: 30, page: 1, pageSize: 12, totalPages: 3 });
    expect(result.items[0]).toMatchObject({
      slug: "shop-1",
      name: "Sunrise Bakery",
      plan: "premium",
      verified: true,
      fromPriceKes: 120,
      isOpen: true,
      distanceKm: 1.5,
      townSlug: "kisumu",
      rating: 0,
      reviewCount: 0,
      promo: { flash: 2, offers: 1 }
    });
    expect(result.items[0].hue).toEqual(expect.any(Number));
    expect(result.items[0].highlights).toEqual([]);
    expect(result.items[1]).toMatchObject({ plan: "standard", fromPriceKes: null, distanceKm: null, area: "", county: "", townSlug: "" });
  });

  it("sends filters, sort, origin and the requested page to the database", async () => {
    routes.browse_search = { total: 0, items: [] };
    await live.searchBusinesses({
      query: "  Sun-Rise  ",
      categoryId: "bakeries",
      county: "Kisumu",
      town: "maseno",
      openNow: true,
      verifiedOnly: true,
      featuredOnly: true,
      radiusKm: 5,
      minPrice: 100,
      maxPrice: 900,
      minRating: 4,
      sort: "price_asc",
      seed: 7,
      lat: -0.1,
      lng: 34.75,
      page: 3,
      pageSize: 20
    });
    expect(rpcCalls("browse_search")[0].args).toEqual({
      p_query: "sun rise",
      p_category: "bakeries",
      p_county: "Kisumu",
      p_town: "maseno",
      p_open_now: true,
      p_verified: true,
      p_featured: true,
      p_radius_km: 5,
      p_min_price: 100,
      p_max_price: 900,
      p_min_rating: 4,
      p_sort: "price_asc",
      p_seed: "7",
      p_lat: -0.1,
      p_lng: 34.75,
      p_page: 3,
      p_page_size: 20
    });
  });

  it("sends neutral defaults and drops an incomplete or invalid origin", async () => {
    routes.browse_search = { total: 0, items: [] };
    await live.searchBusinesses({ lat: -0.1, lng: undefined, page: -4, pageSize: 100000, radiusKm: 0 });
    expect(rpcCalls("browse_search")[0].args).toMatchObject({
      p_query: "",
      p_category: null,
      p_min_price: null,
      p_max_price: null,
      p_min_rating: 0,
      p_sort: "relevance",
      p_seed: "0",
      p_radius_km: null,
      p_lat: null,
      p_lng: null,
      p_page: 1,
      p_page_size: 100
    });
  });

  it("reports an empty directory as zero results on one page", async () => {
    routes.browse_search = { total: 0, items: [] };
    expect(await live.searchBusinesses({})).toMatchObject({ items: [], total: 0, totalPages: 1 });
  });

  it("surfaces database errors instead of showing mock data", async () => {
    routes.browse_search = { error: { message: "boom", code: "500" } };
    await expect(live.searchBusinesses({})).rejects.toMatchObject({ name: "BrowseApiError", code: "500" });
  });

  it("categories merge database rows with local metadata and live counts", async () => {
    db().categories = [
      { id: "bakeries", name: "Bakeries", icon: "store", sort: 1, active: true },
      { id: "brand-new", name: "Brand New", icon: "store", sort: 2, active: true }
    ];
    routes.browse_category_counts = [{ categoryId: "bakeries", count: 2 }];
    const cats = await live.getCategories();
    const bakeries = cats.find((c) => c.id === "bakeries");
    expect(bakeries.count).toBe(2);
    expect(bakeries.hue).toEqual(expect.any(Number));
    expect(cats.find((c) => c.id === "brand-new")).toMatchObject({ count: 0, singular: "Brand New" });
  });

  it("falls back to local category definitions when the table is empty", async () => {
    routes.browse_category_counts = [];
    expect((await live.getCategories()).length).toBeGreaterThan(0);
  });

  it("caches the small lookups and refetches after invalidation", async () => {
    routes.browse_towns = [{ slug: "maseno", name: "Maseno", county: "Kisumu", count: 2 }, { slug: "kisumu", name: "Kisumu", county: "Kisumu", count: 1 }];
    routes.browse_counties = ["Kisumu"];
    expect((await live.getTowns()).map((t) => t.slug)).toEqual(["kisumu", "maseno"]);
    await live.getTowns();
    expect(await live.getCounties()).toEqual(["Kisumu"]);
    await live.getCounties();
    expect(rpcCalls("browse_towns")).toHaveLength(1);
    expect(rpcCalls("browse_counties")).toHaveLength(1);
    live.invalidateBrowseCache();
    await live.getTowns();
    expect(rpcCalls("browse_towns")).toHaveLength(2);
  });

  it("facets come back as towns, a price range and the scoped category", async () => {
    db().categories = [{ id: "bakeries", name: "Bakeries", icon: "store", sort: 1, active: true }];
    routes.browse_facets = {
      towns: [{ slug: "maseno", name: "Maseno", county: "Kisumu", count: 2 }, { slug: "kisumu", name: "Kisumu", county: "Kisumu", count: 1 }],
      priceMin: "50.00",
      priceMax: 500,
      categoryId: "bakeries"
    };
    const facets = await live.getSearchFacets({ query: "Bread" });
    expect(rpcCalls("browse_facets")[0].args).toEqual({ p_query: "bread", p_category: null });
    expect(facets).toEqual({
      towns: [{ slug: "kisumu", name: "Kisumu", county: "Kisumu", count: 1 }, { slug: "maseno", name: "Maseno", county: "Kisumu", count: 2 }],
      price: { min: 50, max: 500 },
      categoryId: "bakeries",
      categoryName: "Bakeries",
      fields: []
    });
  });

  it("facets without prices report no price range", async () => {
    routes.browse_facets = { towns: [], priceMin: null, priceMax: null, categoryId: null };
    expect(await live.getSearchFacets({})).toMatchObject({ towns: [], price: null, categoryId: null, categoryName: null });
  });

  it("suggests through the database and skips the call for short input", async () => {
    routes.browse_suggestions = [{ type: "business", label: "Sunrise Bakery", slug: "shop-1" }];
    expect(await live.getSuggestions("sun")).toContainEqual({ type: "business", label: "Sunrise Bakery", slug: "shop-1" });
    expect(rpcCalls("browse_suggestions")[0].args).toEqual({ p_prefix: "sun", p_limit: 6 });
    expect(await live.getSuggestions("s")).toEqual([]);
    expect(await live.getSuggestions("  !")).toEqual([]);
    expect(rpcCalls("browse_suggestions")).toHaveLength(1);
  });

  it("featured passes category, limit and a seed, and maps cards", async () => {
    routes.browse_featured = [card(2, { plan: "premium" }), card(3, { plan: "premium" })];
    const out = await live.getFeaturedBusinesses({ categoryId: "bakeries", limit: 2, seed: 7 });
    expect(out.map((x) => x.slug)).toEqual(["shop-2", "shop-3"]);
    expect(rpcCalls("browse_featured")[0].args).toMatchObject({ p_category: "bakeries", p_limit: 2, p_seed: "7", p_lat: null, p_lng: null });
    await live.getFeaturedBusinesses({});
    expect(rpcCalls("browse_featured")[1].args.p_seed).toBeNull();
  });

  it("nearby needs an origin, and passes radius, category and limit", async () => {
    routes.browse_nearby = [card(1, { distanceKm: 0.2 })];
    expect(await live.getNearbyBusinesses({})).toEqual([]);
    expect(await live.getNearbyBusinesses({ lat: -0.1 })).toEqual([]);
    expect(rpcCalls("browse_nearby")).toHaveLength(0);
    const near = await live.getNearbyBusinesses({ lat: -0.1, lng: 34.75, radiusKm: 10, categoryId: "bakeries", limit: 3 });
    expect(near[0]).toMatchObject({ slug: "shop-1", distanceKm: 0.2 });
    expect(rpcCalls("browse_nearby")[0].args).toEqual({ p_lat: -0.1, p_lng: 34.75, p_radius_km: 10, p_category: "bakeries", p_limit: 3 });
  });

  it("similar maps cards, and an unknown business is a NotFoundError", async () => {
    routes.browse_similar = (args) => (args.p_ref === "shop-1" ? [card(2)] : { error: { message: "business_not_found", code: "P0002" } });
    expect((await live.getSimilarBusinesses("shop-1")).map((x) => x.slug)).toEqual(["shop-2"]);
    await expect(live.getSimilarBusinesses("missing")).rejects.toMatchObject({ name: "NotFoundError" });
    routes.browse_similar = { error: { message: "boom", code: "500" } };
    await expect(live.getSimilarBusinesses("shop-1")).rejects.toMatchObject({ name: "BrowseApiError" });
  });

  it("top searches map rows and log search never throws", async () => {
    routes.top_searches = [{ term: "bread", count: 5, hot: 1 }];
    expect(await live.getTopSearches(3)).toEqual([{ term: "bread", count: 5, hot: true }]);
    routes.log_search = { error: { message: "no" } };
    expect(await live.logSearch("bread")).toEqual({ ok: true });
    fake.current.client.rpc = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await live.logSearch("bread")).toEqual({ ok: false });
  });
});
