import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLatency, getSimilarItems as demoSimilar } from "@epicmkt/backend";
import { store } from "../../../../backend/src/store.js";
import * as live from "./live.js";
import { invalidateSnapshot } from "./snapshot.js";

// The demo backend and the live adapter feed the same shared ranking, so for the same marketplace they must return the same
// items in the same order. This builds one marketplace twice (demo store, fake Supabase) and compares them, with and without
// the database function, since both live paths exist.

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});
vi.mock("../index.js", () => ({ getServerTime: async () => (await import("./live.js")).getServerTime() }));

const db = () => fake.current.state;
const CREATED = "2026-01-01T00:00:00Z";
const storeId = (n) => `10000000-0000-0000-0000-0000000000${String(n).padStart(2, "0")}`;
const itemId = (n) => `20000000-0000-0000-0000-0000000003${String(n).padStart(2, "0")}`;

const STORES = [
  { n: 0, categoryId: "bakeries", plan: "standard", lat: -0.0058, lng: 34.6, tags: ["fresh"] },
  { n: 1, categoryId: "bakeries", plan: "premium", lat: -0.0061, lng: 34.601, tags: ["fresh"] },
  { n: 2, categoryId: "supermarkets", plan: "premium", lat: -0.2, lng: 34.7, tags: [] },
  { n: 3, categoryId: "kiosks", plan: "standard", lat: -0.5, lng: 34.9, tags: [] },
  { n: 4, categoryId: "bakeries", plan: "standard", lat: -0.0059, lng: 34.6005, tags: ["fresh", "cakes"] },
  { n: 5, categoryId: "shoes", plan: "standard", lat: -0.01, lng: 34.61, tags: [] }
];
// n is the item number: the same item in both worlds.
const ITEMS = [
  { n: 1, store: 0, name: "Brown Bread 400g", section: "Bakery", price: 70, brand: "Mama" },
  { n: 2, store: 0, name: "Wholemeal loaf", section: "Bakery", price: 90 },
  { n: 3, store: 1, name: "Wheat Loaf", section: "Bakery", price: 75 },
  { n: 4, store: 1, name: "Chocolate Cake", section: "Bakery", price: 500 },
  { n: 5, store: 1, name: "Cupcake", section: "Bakery", price: 80 },
  { n: 6, store: 2, name: "Sliced bread loaf 800g", section: "Food", price: 130 },
  { n: 7, store: 2, name: "Milk 1L", section: "Dairy", price: 70 },
  { n: 8, store: 2, name: "Mama's Bread (white)", section: "Bakery", price: 68 },
  { n: 9, store: 3, name: "White Bread", section: "Food", price: 65 },
  { n: 10, store: 3, name: "Biscuits", section: "Food", price: 50 },
  { n: 11, store: 4, name: "Bread Rolls", section: "Bakery", price: 60 },
  { n: 12, store: 4, name: "Loaves of bread", section: "Bakery", price: 72, brand: "Mama" },
  { n: 13, store: 4, name: "Brown bread", section: "Bakery", price: 71 },
  { n: 14, store: 5, name: "Sneakers", section: "Men", price: 3000 },
  { n: 15, store: 5, name: "Bread knife", section: "Kitchen", price: 400 },
  { n: 16, store: 5, name: "Item", section: "Bakery", price: 70 }
];
const indexIn = (storeNo) => ITEMS.filter((i) => i.store === storeNo);

const buildDemo = () => {
  const template = structuredClone(store.businesses[0]);
  store.businesses = STORES.map((s) => ({
    ...structuredClone(template),
    id: `demo-${s.n}`,
    slug: `demo-${s.n}`,
    name: `Shop ${s.n}`,
    status: "active",
    plan: s.plan,
    categoryId: s.categoryId,
    lat: s.lat,
    lng: s.lng,
    tags: s.tags,
    createdAt: CREATED,
    services: indexIn(s.n).map((i) => ({ id: `demo-item-${i.n}`, name: i.name, section: i.section, priceKes: i.price, brand: i.brand, imageUrl: "x.png", description: "d" }))
  }));
  store.flashSales = [];
  store.offers = [];
};

const buildLive = () => {
  db().businesses = STORES.map((s) => ({
    id: storeId(s.n), slug: `shop-${s.n}`, name: `Shop ${s.n}`, category_id: s.categoryId, plan_key: s.plan, verification_level: "verified", tagline: null,
    description: "d", phone: "+254712345678", whatsapp: "+254712345678", socials: {}, county: "Kisumu", town: "Maseno", address: "Main St", lat: s.lat, lng: s.lng,
    logo_path: null, cover_path: null, tags: s.tags, hours: { mon: ["08:00", "18:00"] }, created_at: CREATED
  }));
  db().items = ITEMS.map((i) => ({
    id: itemId(i.n), business_id: storeId(i.store), name: i.name, brand: i.brand ?? null, description: "d", section: i.section, price: i.price.toFixed(2), price_max: null,
    price_type: "fixed", unit: null, availability: "available", sort: 0,
    created_at: new Date(Date.parse(CREATED) + indexIn(i.store).findIndex((x) => x.n === i.n) * 60000).toISOString(), image_paths: ["x.webp"]
  }));
  db().sales = [];
  db().offers = [];
};

const numberOfDemo = (row) => Number(String(row.id).replace("demo-item-", ""));
const numberOfLive = (row) => Number(String(row.id).slice(-2));

beforeEach(() => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
  setLatency(0);
  invalidateSnapshot();
  db().rpc = {};
  buildDemo();
  buildLive();
});

const net = ({ p_terms }) =>
  db().items.filter((r) => r.business_id !== storeId(0) && (p_terms.some((t) => new RegExp(`\\b${t}\\b`, "i").test(r.name)) || String(r.section ?? "").toLowerCase() === "bakery"));

describe("similar items: demo backend and live adapter agree", () => {
  const cases = [
    ["a bread, from a bakery", 1, undefined],
    ["a bread, nearest first from a visitor's position", 1, { lat: -0.5, lng: 34.9 }],
    ["a loaf found by an alias", 2, undefined],
    ["a short limit", 1, undefined, 2]
  ];
  for (const [label, seed, origin, limit] of cases) {
    for (const viaFunction of [false, true]) {
      it(`${label} (${viaFunction ? "with" : "without"} the database function)`, async () => {
        if (viaFunction) db().rpc.similar_item_candidates = net;
        const opts = { ...(origin ? { origin } : {}), ...(limit ? { limit } : {}) };
        const fromDemo = (await demoSimilar(`demo-item-${seed}`, opts)).map(numberOfDemo);
        const fromLive = (await live.getSimilarItems(itemId(seed), opts)).map(numberOfLive);
        expect(fromLive).toEqual(fromDemo);
        expect(fromDemo.length).toBeGreaterThan(0);
        // And it is the right set: only bread and loaves, never the cake, the cupcake, the biscuits, the milk, the knife or the shoes.
        for (const wrong of [4, 5, 7, 10, 14, 15, 11]) expect(fromDemo).not.toContain(wrong);
      });
    }
  }

  it("agrees on the full set for the bread, in order", async () => {
    const fromDemo = (await demoSimilar("demo-item-1")).map(numberOfDemo);
    expect(fromDemo.sort((a, b) => a - b)).toEqual([3, 6, 8, 9, 12, 13, 16]);
  });
});
