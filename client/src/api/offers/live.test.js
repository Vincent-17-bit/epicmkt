import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ current: null }));
vi.mock("../applications/supabaseClient", async () => {
  const { createFakeSupabase } = await import("../../test/fakeSupabase.js");
  fake.current = createFakeSupabase();
  return { supabase: fake.current.client };
});

import * as live from "./live.js";

const db = () => fake.current.state;
const H = 3600000;
const B1 = "10000000-0000-0000-0000-000000000001";
const B2 = "10000000-0000-0000-0000-000000000002";

const biz = (id, over = {}) => ({ id, slug: id === B1 ? "shop-1" : "shop-2", name: "Shop", category_id: "bakeries", town: "Kisumu", county: "Kisumu", verification_level: "unverified", lat: -0.1, lng: 34.7, hours: {}, ...over });
const product = (id, name, price, over = {}) => ({ id, name, price, image_paths: [], business_id: B1, ...over });
const offer = (id, business, kind, config, items, over = {}) => ({
  id, business_id: business, title: id, description: null, kind, config, conditions: {}, chip_text: null, code: null, terms: null,
  starts_at: new Date(Date.now() - H).toISOString(), ends_at: null, created_at: new Date(Date.now() - 1000).toISOString(),
  items: items.map(([item_id, role = "main"]) => ({ item_id, role })), ...over
});

beforeEach(() => {
  live.invalidateOffers();
  db().offers = [];
  db().items = [];
  db().businesses = [biz(B1), biz(B2)];
  db().failing = null;
});

describe("live offers", () => {
  it("puts the chip on the products that are in an offer and on no others", async () => {
    db().offers = [offer("o1", B1, "percent_off", { percent: 15 }, [["a"], ["b"]]), offer("o2", B1, "amount_off", { amount: 50 }, [["a"]], { ends_at: new Date(Date.now() + 2 * H).toISOString() })];
    const chips = await live.chipsByItem(B1);
    expect(chips.get("a")).toEqual({ id: "o2", label: "KES 50 off", extra: 1 });
    expect(chips.get("b")).toEqual({ id: "o1", label: "15% off", extra: 0 });
    expect(chips.has("c")).toBe(false);
  });

  it("uses the seller's chip text, and the plain wording elsewhere", async () => {
    db().offers = [offer("o1", B1, "percent_off", { percent: 20 }, [["a"]], { chip_text: "Happy hour" })];
    expect((await live.chipsByItem()).get("a").label).toBe("Happy hour");
  });

  it("counts products per store, not offers", async () => {
    db().offers = [offer("o1", B1, "percent_off", { percent: 10 }, [["a"], ["b"]]), offer("o2", B1, "percent_off", { percent: 5 }, [["b"]]), offer("o3", B2, "percent_off", { percent: 5 }, [["z"]])];
    const counts = await live.productCounts();
    expect(counts.get(B1)).toBe(2);
    expect(counts.get(B2)).toBe(1);
  });

  it("ignores an offer that has ended since it was read", async () => {
    db().offers = [offer("o1", B1, "percent_off", { percent: 10 }, [["a"]], { ends_at: new Date(Date.now() - 1000).toISOString() })];
    expect((await live.chipsByItem(B1)).size).toBe(0);
    expect((await live.productCounts()).get(B1)).toBe(0);
  });

  it("builds the offer views for a product, with the products they are on", async () => {
    db().items = [product("bottle", "20L bottle", "400.00"), product("refill", "20L refill", "100")];
    db().offers = [offer("o1", B1, "bundle", { rewardType: "bundle_price", rewardValue: 450 }, [["bottle", "main"], ["refill", "with"]], { code: "WATER" })];
    const card = { id: B1, slug: "shop-1", name: "Shop" };
    const [view] = await live.viewsForItem("refill", B1, card);
    expect(view.offer).toMatchObject({ id: "o1", kind: "bundle", code: "WATER" });
    expect(view.products).toEqual([
      { id: "bottle", name: "20L bottle", imageUrl: null, price: 400, role: "main" },
      { id: "refill", name: "20L refill", imageUrl: null, price: 100, role: "with" }
    ]);
    expect(view.appliesToLabel).toBe("20L bottle + 20L refill");
    expect(view.business).toBe(card);
    expect(view.remainingMs).toBeNull();
    expect(await live.viewsForItem("other", B1, card)).toEqual([]);
  });

  it("words the store page's deals", async () => {
    db().items = [product("a", "Bread", "65")];
    db().offers = [offer("o1", B1, "buy_x_get_y", { buy: 2, get: 1, discountPercent: 100 }, [["a"]], { title: "Bread deal" })];
    const [deal] = await live.dealsForStore(B1);
    expect(deal).toMatchObject({ id: "o1", title: "Bread deal", label: "Buy 2 Get 1 Free", headline: "Buy 2, get 1 free" });
    expect(deal.products.map((p) => p.id)).toEqual(["a"]);
    expect(await live.dealsForStore(B2)).toEqual([]);
  });

  it("lists, filters and sorts the offers page", async () => {
    db().items = [product("a", "Bread", "65"), product("z", "Tyre", "900", { business_id: B2 })];
    db().businesses = [biz(B1), biz(B2, { category_id: "mechanics", town: "Maseno", slug: "shop-2" })];
    db().offers = [
      offer("o1", B1, "percent_off", { percent: 10 }, [["a"]], { ends_at: new Date(Date.now() + 5 * H).toISOString() }),
      offer("o2", B2, "percent_off", { percent: 20 }, [["z"]], { ends_at: new Date(Date.now() + 1 * H).toISOString() })
    ];
    expect((await live.list({})).items.map((v) => v.offer.id)).toEqual(["o2", "o1"]);
    expect((await live.list({ categoryId: "mechanics" })).items.map((v) => v.offer.id)).toEqual(["o2"]);
    expect((await live.list({ town: "kisumu" })).items.map((v) => v.offer.id)).toEqual(["o1"]);
    expect((await live.list({ businessId: B1 })).total).toBe(1);
    expect((await live.list({ limit: 1, offset: 1 })).items.map((v) => v.offer.id)).toEqual(["o1"]);
    const facets = await live.facets();
    expect(facets.total).toBe(2);
    expect(facets.categories.map((c) => c.id).sort()).toEqual(["bakeries", "mechanics"]);
  });

  it("shows nothing, not an error, when offers cannot be read", async () => {
    db().failing = { message: "view missing" };
    expect(await live.loadOffers()).toEqual([]);
    expect((await live.chipsByItem()).size).toBe(0);
    expect((await live.productCounts()).size).toBe(0);
  });
});
