import { describe, expect, it } from "vitest";
import { EPOCH_MS, FEED_VARIANTS, blendFeed, clampEpoch, clampVariant, epochOf, hash01, isFeaturedSlot, pagesOf, seedOf } from "./feed.js";
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
  it("gives featured shops exactly half of the first page, one place in each pair, and never all at the top", () => {
    const out = blendFeed(catalogue(), { epoch: EPOCH, pageSize: 50 });
    const first = out.slice(0, 50);
    expect(first.filter((p) => p.business.featured)).toHaveLength(25);
    for (let pair = 0; pair < 25; pair += 1) expect(first.slice(pair * 2, pair * 2 + 2).filter((p) => p.business.featured)).toHaveLength(1);
    for (let i = 0; i < 50; i += 1) expect(out[i].business.featured).toBe(isFeaturedSlot(i, 50, seedOf(EPOCH, 0)));
    // after the first page, one place in seven
    const later = out.slice(50, 50 + 70);
    expect(later.filter((p) => p.business.featured)).toHaveLength(10);
  });

  it("does not always put a featured product first: over many hours and visits about half the feeds open with one", () => {
    const list = catalogue();
    let featuredFirst = 0;
    let runs = 0;
    for (let h = 0; h < 12; h += 1) {
      for (let v = 0; v < FEED_VARIANTS; v += 1) {
        const out = blendFeed(list, { epoch: EPOCH + h, variant: v, pageSize: 50, limit: 50 });
        runs += 1;
        if (out[0].business.featured) featuredFirst += 1;
      }
    }
    expect(featuredFirst / runs).toBeGreaterThan(0.3);
    expect(featuredFirst / runs).toBeLessThan(0.7);
  });

  it("puts no long run of featured (or of ordinary) products together", () => {
    const out = blendFeed(catalogue(), { epoch: EPOCH, pageSize: 50, limit: 50 });
    let run = 1;
    for (let i = 1; i < out.length; i += 1) {
      run = out[i].business.featured === out[i - 1].business.featured ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
    }
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

  it("gives every visit one of the hour's few orders: two visitors in one hour do not both see the same first product", () => {
    const list = catalogue();
    const orders = Array.from({ length: FEED_VARIANTS }, (_, v) => blendFeed(list, { epoch: EPOCH, variant: v, limit: 24 }).map((p) => p.id).join());
    expect(new Set(orders).size).toBe(FEED_VARIANTS);
    const leaders = new Set(Array.from({ length: FEED_VARIANTS }, (_, v) => blendFeed(list, { epoch: EPOCH, variant: v, limit: 1 })[0].id));
    expect(leaders.size).toBeGreaterThan(4);
    expect(blendFeed(list, { epoch: EPOCH, variant: 3 }).map((p) => p.id)).toEqual(blendFeed(list, { epoch: EPOCH, variant: 3 }).map((p) => p.id));
    expect(clampVariant(99)).toBe(0);
    expect(clampVariant("5")).toBe(5);
    expect(clampVariant("x")).toBe(0);
  });

  it("lets a product from deep in the catalogue open the feed: over many orders, most of the catalogue reaches the first page", () => {
    const list = catalogue({ organic: 300, featured: 60, shops: 60 });
    const onFirstPage = new Set();
    for (let h = 0; h < 24; h += 1) for (let v = 0; v < FEED_VARIANTS; v += 1) blendFeed(list, { epoch: EPOCH + h, variant: v, pageSize: 50, limit: 50 }).forEach((p) => onFirstPage.add(p.id));
    expect(onFirstPage.size / list.length).toBeGreaterThan(0.9);
    // including products with no picture and no discount, which the small quality nudge only helps, never decides
    const plain = catalogue({ organic: 200, featured: 0, shops: 50 }).map((p, i) => (i < 100 ? { ...p, imagePath: null } : p));
    const seen = new Set();
    for (let h = 0; h < 24; h += 1) blendFeed(plain, { epoch: EPOCH + h, pageSize: 50, limit: 50 }).forEach((p) => !p.imagePath && seen.add(p.id));
    expect(seen.size).toBeGreaterThan(20);
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

  it("spreads shops out: no shop twice in any 10 places in a row, so the first screens show many different stores", () => {
    const out = blendFeed(catalogue({ organic: 300, shops: 40 }), { epoch: EPOCH, limit: 400, pageSize: 50 });
    for (let i = 0; i + 10 <= 200; i += 1) {
      const ids = out.slice(i, i + 10).map((p) => p.business.id);
      expect(new Set(ids).size).toBe(10);
    }
  });

  it("alternates the stores of a catalogue that has too few to keep them apart, instead of running one after another", () => {
    const two = Array.from({ length: 80 }, (_, i) => product(i, { shop: i % 2 ? "kevin" : "sunrise" }));
    const out = blendFeed(two, { epoch: EPOCH, limit: 40, pageSize: 50 });
    let run = 1;
    for (let i = 1; i < out.length; i += 1) {
      run = out[i].business.id === out[i - 1].business.id ? run + 1 : 1;
      expect(run).toBeLessThanOrEqual(2);
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
