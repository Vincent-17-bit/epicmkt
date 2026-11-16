import { describe, expect, it } from "vitest";
import { EPOCH_MS, blendFeed, clampEpoch, epochOf, hash01, isFeaturedSlot, pagesOf } from "./feed.js";
import { pageOf } from "./productQuery.js";
import { EMPTY_FILTERS } from "./productFilters.js";

const EPOCH = 493_000;
const before = (hours) => new Date(EPOCH * EPOCH_MS - hours * 3_600_000).toISOString();
const product = (n, { shop = `s${n}`, featured = false, created = before(n + 1), picture = true } = {}) => ({
  id: `p${n}`,
  name: `Product ${n}`,
  createdAt: created,
  imagePath: picture ? `x/${n}.webp` : null,
  pricing: { regularPrice: 100, salePrice: 100, savings: 0 },
  business: { id: shop, slug: shop, featured, verified: false }
});
const catalogue = ({ organic = 200, featured = 60, shops = 50, featuredShops = 6 } = {}) => [
  ...Array.from({ length: organic }, (_, i) => product(i, { shop: `o${i % shops}` })),
  ...Array.from({ length: featured }, (_, i) => product(1000 + i, { shop: `f${i % featuredShops}`, featured: true }))
];

describe("the rotation hour", () => {
  it("is whole hours since 1970, and a request may only ask for the current hour or a recent one", () => {
    const now = EPOCH * EPOCH_MS + 1234;
    expect(epochOf(now)).toBe(EPOCH);
    expect(clampEpoch(EPOCH - 2, now)).toBe(EPOCH - 2);
    expect(clampEpoch(EPOCH + 1, now)).toBe(EPOCH);
    expect(clampEpoch(EPOCH - 100, now)).toBe(EPOCH);
    expect(clampEpoch("junk", now)).toBe(EPOCH);
  });

  it("draws the same number for the same product in the same hour, in the browser and on the server", () => {
    expect(hash01(EPOCH, "p1")).toBe(hash01(EPOCH, "p1"));
    expect(hash01(EPOCH, "p1")).not.toBe(hash01(EPOCH + 1, "p1"));
    expect(hash01(EPOCH, "p1")).toBeGreaterThanOrEqual(0);
    expect(hash01(EPOCH, "p1")).toBeLessThan(1);
  });
});

describe("blendFeed", () => {
  it("puts featured products in every fifth place on the first page, then every seventh, never all at the top", () => {
    const out = blendFeed(catalogue(), { epoch: EPOCH });
    const featuredAt = out.slice(0, 48).map((p, i) => (p.business.featured ? i : null)).filter((i) => i !== null);
    expect(featuredAt).toEqual([1, 6, 11, 16, 21, 27, 34, 41]);
    expect(out[0].business.featured).toBe(false);
    for (let i = 0; i < 48; i += 1) expect(out[i].business.featured).toBe(isFeaturedSlot(i));
  });

  it("is the same order every time for one hour, and a different one the next hour", () => {
    const list = catalogue();
    const a = blendFeed(list, { epoch: EPOCH }).map((p) => p.id);
    expect(blendFeed([...list].reverse(), { epoch: EPOCH }).map((p) => p.id)).toEqual(a);
    const next = blendFeed(list, { epoch: EPOCH + 1 }).map((p) => p.id);
    expect(next).not.toEqual(a);
    expect(new Set(next)).toEqual(new Set(a));
  });

  it("gives no product the top place for good: over a day, many different products lead", () => {
    const list = catalogue();
    const leaders = new Set(Array.from({ length: 24 }, (_, h) => blendFeed(list, { epoch: EPOCH + h, limit: 1 })[0].id));
    expect(leaders.size).toBeGreaterThan(10);
  });

  it("leaves out what was created during the hour, so nothing pushes the list down while someone pages through it", () => {
    const list = [...catalogue(), product(9999, { created: new Date(EPOCH * EPOCH_MS + 60_000).toISOString() })];
    const out = blendFeed(list, { epoch: EPOCH });
    expect(out.some((p) => p.id === "p9999")).toBe(false);
    expect(out.poolSize).toBe(list.length - 1);
    expect(blendFeed(list, { epoch: EPOCH + 1 }).some((p) => p.id === "p9999")).toBe(true);
  });

  it("keeps a young catalogue whole: with too few older products, the new ones take part too", () => {
    const list = Array.from({ length: 10 }, (_, i) => product(i, { created: new Date(EPOCH * EPOCH_MS + i * 1000).toISOString() }));
    expect(blendFeed(list, { epoch: EPOCH })).toHaveLength(10);
  });

  it("spreads a shop out: no shop more than twice in any 12 places in a row", () => {
    const out = blendFeed(catalogue({ organic: 300, shops: 40 }), { epoch: EPOCH, limit: 192 });
    for (let i = 0; i + 12 <= out.length; i += 1) {
      const counts = new Map();
      for (const p of out.slice(i, i + 12)) counts.set(p.business.id, (counts.get(p.business.id) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    }
  });

  it("fills a featured place with another product when no featured one is left, and the other way round", () => {
    expect(blendFeed(catalogue({ featured: 0 }), { epoch: EPOCH })).toHaveLength(200);
    const onlyFeatured = blendFeed(catalogue({ organic: 0, featured: 30 }), { epoch: EPOCH });
    expect(onlyFeatured).toHaveLength(30);
    expect(onlyFeatured.every((p) => p.business.featured)).toBe(true);
  });

  it("returns only what it is asked for", () => {
    expect(blendFeed(catalogue(), { epoch: EPOCH, limit: 24 })).toHaveLength(24);
  });
});

describe("pageOf: shallow pages", () => {
  it("offers at most 8 pages and says when more products match than those pages hold", () => {
    const list = catalogue({ organic: 400, featured: 0 });
    const first = pageOf(list, { ...EMPTY_FILTERS }, { page: 1, epoch: EPOCH });
    expect(first).toMatchObject({ total: 400, pages: 8, capped: true, hasMore: true, epoch: EPOCH });
    const last = pageOf(list, { ...EMPTY_FILTERS }, { page: 8, epoch: EPOCH });
    expect(last.items).toHaveLength(24);
    expect(last.hasMore).toBe(false);
    expect(pageOf(list, { ...EMPTY_FILTERS }, { page: 9, epoch: EPOCH }).items).toEqual([]);
    expect(pagesOf(0)).toBe(1);
  });

  it("pages of one hour never repeat a product", () => {
    const list = catalogue();
    const ids = Array.from({ length: 8 }, (_, i) => pageOf(list, { ...EMPTY_FILTERS }, { page: i + 1, epoch: EPOCH }).items.map((p) => p.id)).flat();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("any other sort is a plain sort, with no rotation", () => {
    const list = catalogue();
    const a = pageOf(list, { ...EMPTY_FILTERS, sort: "newest" }, { page: 1, epoch: EPOCH }).items.map((p) => p.id);
    const b = pageOf(list, { ...EMPTY_FILTERS, sort: "newest" }, { page: 1, epoch: EPOCH + 5 }).items.map((p) => p.id);
    expect(a).toEqual(b);
  });
});
