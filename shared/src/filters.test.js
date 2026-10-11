import { describe, expect, it } from "vitest";
import {
  CATALOG_SORTS,
  DEFAULT_VIEW,
  MAX_SAVED_VIEWS,
  TRACKER,
  activeChips,
  addSavedView,
  clearFilters,
  filterItems,
  healthScore,
  issuesOf,
  joinSignals,
  matchesQuery,
  readCatalogView,
  removeChip,
  removeSavedView,
  sameView,
  sanitizeSavedViews,
  selectItems,
  showingSummary,
  sortItems,
  statsToTracker,
  summaryText,
  toListingItem,
  trackerCounts,
  trackerKeyOf,
  trackerView,
  validateViewName,
  viewFromParams,
  visibilityOf,
  writeCatalogView
} from "./filters.js";

const NOW = Date.parse("2026-10-10T08:00:00Z");
const ctx = { now: NOW, staleDays: 90 };
const ago = (days) => new Date(NOW - days * 86_400_000).toISOString();
const photo = [{ kind: "image", url: "/a.jpg" }];

let n = 0;
const mk = (o = {}) => {
  n += 1;
  return toListingItem({
    id: `i${String(n).padStart(3, "0")}`,
    name: `Item ${n}`,
    description: "A long enough description for health scoring.",
    section: "Cuts",
    kind: "product",
    availability: "available",
    visible: true,
    price: 500,
    price_type: "fixed",
    price_confirmed_at: ago(5),
    updated_at: ago(60),
    created_at: ago(200 - n),
    sort: n,
    search_tags: ["tag"],
    media: photo,
    ...o
  });
};

const build = () => {
  n = 0;
  return [
    mk({ id: "a", name: "Fade Cut", section: "Cuts", price: 600, search_tags: ["barber", "fade"], badge: "Popular", updated_at: ago(2), created_at: ago(10) }),
    mk({ id: "b", name: "Beard Trim", section: "Beards", price: 300, availability: "limited_stock", sale_price: 250, updated_at: ago(20), created_at: ago(30) }),
    mk({ id: "c", name: "Shave", section: "Beards", price: 400, availability: "out_of_stock", track_stock: true, stock_count: 0, updated_at: ago(40), created_at: ago(50) }),
    mk({ id: "d", name: "Summer Pack", section: "Packs", price: 1500, availability: "seasonal", variants: [{ label: "S" }, { label: "M" }], media: [...photo, { kind: "video" }], created_at: ago(70) }),
    mk({ id: "e", name: "Kids Cut", section: "Cuts", price: 350, availability: "by_appointment", created_at: ago(90) }),
    mk({ id: "f", name: "Hot Towel", section: "Extras", price: 200, availability: "coming_soon", created_at: ago(110) }),
    mk({ id: "g", name: "Hidden Gel", section: "Extras", price: 150, visible: false, created_at: ago(130) }),
    mk({ id: "h", name: "Admin Hidden", price: 900, hidden_by_admin: true, admin_hide_reason: "Misleading price", created_at: ago(150) }),
    mk({ id: "i", name: "Draft Wax", price: 450, draft: true, visible: false, created_at: ago(170) }),
    mk({ id: "j", name: "No Photo Comb", price: 100, media: [], created_at: ago(190) }),
    mk({ id: "k", name: "Old Price Oil", price: 800, price_confirmed_at: ago(120), created_at: ago(210) }),
    mk({ id: "l", name: "Low Stock Spray", price: 700, track_stock: true, stock_count: 2, low_stock_threshold: 3, availability: "limited_stock", created_at: ago(230) }),
    mk({ id: "m", name: "Reported Dye", price: 1000, created_at: ago(250) }),
    mk({ id: "n", name: "Flagged Cream", price: 1200, created_at: ago(270) }),
    mk({ id: "o", name: "Free Consult", price_type: "free", price: null, created_at: ago(290) })
  ].map((it) => {
    if (it.id === "m") return { ...it, reports30d: 3 };
    if (it.id === "n") return { ...it, openFlags: 1 };
    return it;
  });
};

const ids = (items) => items.map((i) => i.id);
const view = (patch) => ({ ...DEFAULT_VIEW, ...patch });

describe("search", () => {
  const items = build();
  it("matches partial words in name, tags, section and description", () => {
    expect(ids(filterItems(items, view({ q: "fad" }), ctx))).toEqual(["a"]);
    expect(ids(filterItems(items, view({ q: "barb" }), ctx))).toEqual(["a"]);
    expect(ids(filterItems(items, view({ q: "beard" }), ctx))).toEqual(["b", "c"]);
    expect(filterItems(items, view({ q: "health scoring" }), ctx)).toHaveLength(items.length);
  });
  it("needs every word, ignores case and punctuation", () => {
    expect(ids(filterItems(items, view({ q: "KIDS, cut" }), ctx))).toEqual(["e"]);
    expect(ids(filterItems(items, view({ q: "kids shave" }), ctx))).toEqual([]);
    expect(matchesQuery(items[0], "   ")).toBe(true);
  });
});

describe("each filter alone", () => {
  const items = build();
  const run = (patch) => ids(filterItems(items, view(patch), ctx));
  it("section and type", () => {
    expect(run({ section: "Packs" })).toEqual(["d"]);
    expect(run({ type: "service" })).toEqual([]);
    expect(run({ type: "product" })).toHaveLength(items.length);
  });
  it("availability multi-select", () => {
    expect(run({ availability: ["seasonal"] })).toEqual(["d"]);
    expect(run({ availability: ["limited_stock", "out_of_stock"] })).toEqual(["b", "c", "l"]);
  });
  it("visibility", () => {
    expect(run({ visibility: ["hidden_by_me"] })).toEqual(["g"]);
    expect(run({ visibility: ["hidden_by_admin"] })).toEqual(["h"]);
    expect(run({ visibility: ["draft"] })).toEqual(["i"]);
    expect(run({ visibility: ["showing"] })).toHaveLength(items.length - 3);
    expect(run({ visibility: ["draft", "hidden_by_me"] })).toEqual(["g", "i"]);
  });
  it("issues", () => {
    expect(run({ issues: ["no_photo"] })).toEqual(["j"]);
    expect(run({ issues: ["stale_price"] })).toEqual(["k"]);
    expect(run({ issues: ["low_stock"] })).toEqual(["l"]);
    expect(run({ issues: ["reported"] })).toEqual(["m"]);
    expect(run({ issues: ["flagged"] })).toEqual(["n"]);
    expect(run({ issues: ["reported", "flagged"] })).toEqual(["m", "n"]);
  });
  it("price range excludes unpriced items", () => {
    expect(run({ priceMin: 1000 })).toEqual(["d", "m", "n"]);
    expect(run({ priceMax: 200 })).toEqual(["f", "g", "j"]);
    expect(run({ priceMin: 300, priceMax: 400 })).toEqual(["b", "c", "e"]);
  });
  it("on sale, badge, video, variants, stock count", () => {
    expect(run({ onSale: true })).toEqual(["b"]);
    expect(run({ badge: "Popular" })).toEqual(["a"]);
    expect(run({ hasVideo: true })).toEqual(["d"]);
    expect(run({ hasVariants: true })).toEqual(["d"]);
    expect(run({ withStock: true })).toEqual(["c", "l"]);
  });
  it("updated in the last 7 or 30 days", () => {
    expect(run({ updated: "7" })).toEqual(["a"]);
    expect(run({ updated: "30" })).toEqual(["a", "b"]);
  });
});

describe("filters combined", () => {
  const items = build();
  it("groups combine with AND", () => {
    expect(ids(filterItems(items, view({ section: "Beards", availability: ["out_of_stock"] }), ctx))).toEqual(["c"]);
    expect(ids(filterItems(items, view({ q: "kids", section: "Cuts", priceMax: 400 }), ctx))).toEqual(["e"]);
    expect(ids(filterItems(items, view({ visibility: ["showing"], issues: ["low_stock"], availability: ["limited_stock"] }), ctx))).toEqual(["l"]);
    expect(ids(filterItems(items, view({ section: "Cuts", updated: "7", onSale: true }), ctx))).toEqual([]);
  });
  it("selectItems filters then sorts", () => {
    expect(ids(selectItems(items, view({ section: "Beards", sort: "price_desc" }), ctx))).toEqual(["c", "b"]);
  });
});

describe("sorts", () => {
  const items = build();
  const first = (sort, count = 3) => ids(sortItems(items, sort, ctx)).slice(0, count);
  it("has the documented options", () => {
    expect(CATALOG_SORTS.map((s) => s.value)).toEqual(["manual", "name_asc", "name_desc", "price_asc", "price_desc", "newest", "updated", "available_first", "out_of_stock_first", "stock_low", "health_low", "most_reported", "stale_first"]);
  });
  it("manual keeps stored order", () => expect(first("manual", 4)).toEqual(["a", "b", "c", "d"]));
  it("name", () => {
    expect(first("name_asc", 3)).toEqual(["h", "b", "i"]);
    expect(first("name_desc", 2)).toEqual(["d", "c"]);
  });
  it("price puts unpriced items last both ways", () => {
    const asc = ids(sortItems(items, "price_asc", ctx));
    const desc = ids(sortItems(items, "price_desc", ctx));
    expect(asc[0]).toBe("j");
    expect(asc.at(-1)).toBe("o");
    expect(desc[0]).toBe("d");
    expect(desc.at(-1)).toBe("o");
  });
  it("newest and recently updated", () => {
    expect(first("newest", 2)).toEqual(["a", "b"]);
    expect(first("updated", 2)).toEqual(["a", "b"]);
  });
  it("availability both ways", () => {
    expect(sortItems(items, "available_first", ctx)[0].availability).toBe("available");
    expect(sortItems(items, "available_first", ctx).at(-1).availability).toBe("out_of_stock");
    expect(sortItems(items, "out_of_stock_first", ctx)[0].availability).toBe("out_of_stock");
  });
  it("stock count lowest first, untracked last", () => {
    expect(first("stock_low", 2)).toEqual(["c", "l"]);
    expect(sortItems(items, "stock_low", ctx)[2].stockCount).toBeNull();
  });
  it("health lowest first", () => expect(first("health_low", 1)).toEqual(["j"]));
  it("most reported", () => expect(first("most_reported", 2)).toEqual(["m", "n"]));
  it("stale prices first", () => expect(first("stale_first", 1)).toEqual(["k"]));
  it("unknown sort falls back to manual and input is not mutated", () => {
    const copy = [...items];
    expect(ids(sortItems(items, "nope", ctx))).toEqual(ids(items));
    expect(items).toEqual(copy);
  });
});

describe("tracker", () => {
  const items = build();
  const counts = trackerCounts(items, ctx);
  it("counts each tile", () => {
    expect(counts).toEqual({ total: 15, available: 9, limited_stock: 2, out_of_stock: 1, seasonal: 1, by_appointment: 1, coming_soon: 1, hidden_by_me: 1, hidden_by_admin: 1, drafts: 1, no_photo: 1, stale_prices: 1, low_stock: 1, reported: 1, flagged: 1 });
  });
  it("tile view returns exactly the counted items", () => {
    for (const tile of TRACKER) expect(filterItems(items, trackerView(tile.key), ctx)).toHaveLength(counts[tile.key]);
  });
  it("recognises which tile a view equals", () => {
    for (const tile of TRACKER) expect(trackerKeyOf(trackerView(tile.key))).toBe(tile.key);
    expect(trackerKeyOf(view({ q: "x" }))).toBeNull();
    expect(trackerKeyOf(view({ availability: ["seasonal", "available"] }))).toBeNull();
    expect(trackerKeyOf(view({ sort: "name_asc" }))).toBe("total");
  });
  it("matches the stats from the database", () => {
    const stats = { total: 15, available: 9, limited_stock: 2, out_of_stock: 1, seasonal: 1, by_appointment: 1, coming_soon: 1, hidden_by_me: 1, hidden_by_admin: 1, drafts: 1, without_photo: 1, stale_prices: 1, low_stock: 1, reported: 1, flagged: 1 };
    expect(statsToTracker(stats)).toEqual(counts);
    expect(statsToTracker(null).total).toBe(0);
  });
});

describe("marking and health", () => {
  const items = build();
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  it("flags admin hidden, reported and flagged items", () => {
    expect(visibilityOf(by.h)).toBe("hidden_by_admin");
    expect(by.h.adminReason).toBe("Misleading price");
    expect(visibilityOf(by.i)).toBe("draft");
    expect(visibilityOf(by.g)).toBe("hidden_by_me");
    expect(visibilityOf(by.a)).toBe("showing");
    expect(issuesOf(by.m, ctx)).toEqual(["reported"]);
    expect(issuesOf(by.n, ctx)).toEqual(["flagged"]);
    expect(issuesOf(by.j, ctx)).toEqual(["no_photo"]);
  });
  it("removed by admin counts as hidden by admin", () => {
    expect(visibilityOf(toListingItem({ id: "x", name: "x", removed_by_admin: true }))).toBe("hidden_by_admin");
  });
  it("health is 100 for a complete item and lower with problems", () => {
    expect(healthScore(by.a, ctx)).toBe(100);
    expect(healthScore(by.j, ctx)).toBe(75);
    expect(healthScore(by.k, ctx)).toBe(85);
    expect(healthScore(by.m, ctx)).toBe(90);
    expect(healthScore(by.o, ctx)).toBe(100);
  });
  it("joins signals onto rows", () => {
    const rows = [{ id: "z", name: "Z" }];
    const [item] = joinSignals(rows, [{ item_id: "z", open_flags: 2, reports_30d: 4 }]);
    expect([item.openFlags, item.reports30d]).toEqual([2, 4]);
  });
});

describe("showing to customers", () => {
  const items = build();
  it("counts and explains", () => {
    const s = showingSummary(items, { shopLive: true });
    expect(s).toEqual({ total: 15, showing: 12, reasons: { hiddenByMe: 1, hiddenByAdmin: 1, draft: 1, shopNotLive: 0 } });
    expect(summaryText(s)).toBe("12 of 15 items are showing to customers. 1 hidden by you, 1 hidden by admin, 1 draft.");
  });
  it("shop not live hides everything that would otherwise show", () => {
    const s = showingSummary(items, { shopLive: false });
    expect(s.showing).toBe(0);
    expect(s.reasons.shopNotLive).toBe(12);
    expect(s.showing + s.reasons.hiddenByMe + s.reasons.hiddenByAdmin + s.reasons.draft + s.reasons.shopNotLive).toBe(s.total);
    expect(summaryText(s)).toContain("12 not showing because your shop is not live");
  });
  it("singular and all showing", () => {
    expect(summaryText(showingSummary([items[0]]))).toBe("1 of 1 item is showing to customers.");
  });
});

describe("url state", () => {
  const full = view({ q: "fade", section: "Cuts", type: "product", availability: ["available", "seasonal"], visibility: ["showing"], issues: ["no_photo", "flagged"], priceMin: 100, priceMax: 900, onSale: true, badge: "Popular", hasVideo: true, hasVariants: true, withStock: true, updated: "30", sort: "price_desc" });
  it("round trips every field", () => {
    const params = writeCatalogView(full);
    expect(readCatalogView(new URLSearchParams(params.toString()))).toEqual(full);
    expect(viewFromParams(params.toString())).toEqual(full);
  });
  it("omits defaults and keeps unrelated params", () => {
    expect(writeCatalogView(DEFAULT_VIEW).toString()).toBe("");
    const next = writeCatalogView(view({ q: "a" }), new URLSearchParams("tab=listings&sort=name_asc&q=old"));
    expect(next.get("tab")).toBe("listings");
    expect(next.get("q")).toBe("a");
    expect(next.get("sort")).toBeNull();
  });
  it("drops invalid values", () => {
    const v = readCatalogView(new URLSearchParams("av=available,bogus,available&vis=nope&iss=flagged&pmin=abc&pmax=-4&upd=99&sort=zzz&sale=0"));
    expect(v.availability).toEqual(["available"]);
    expect(v.visibility).toEqual([]);
    expect(v.issues).toEqual(["flagged"]);
    expect(v.priceMin).toBeNull();
    expect(v.priceMax).toBeNull();
    expect(v.updated).toBe("");
    expect(v.sort).toBe("manual");
    expect(v.onSale).toBe(false);
  });
  it("swaps a reversed price range", () => {
    const v = readCatalogView(new URLSearchParams("pmin=900&pmax=100"));
    expect([v.priceMin, v.priceMax]).toEqual([100, 900]);
  });
});

describe("chips", () => {
  it("lists and removes active filters", () => {
    const v = view({ q: "fade", availability: ["available", "seasonal"], issues: ["flagged"], priceMin: 100, priceMax: 900, onSale: true });
    const chips = activeChips(v);
    expect(chips.map((c) => c.label)).toEqual(["Search: fade", "Available", "Seasonal", "Flagged", "KSh 100 to 900", "On sale"]);
    expect(removeChip(v, chips[1]).availability).toEqual(["seasonal"]);
    expect(removeChip(v, chips[4])).toMatchObject({ priceMin: null, priceMax: null });
    expect(removeChip(v, chips[5]).onSale).toBe(false);
    expect(removeChip(v, chips[0]).q).toBe("");
    expect(activeChips(DEFAULT_VIEW)).toEqual([]);
  });
  it("clear all keeps the sort", () => {
    const cleared = clearFilters(view({ q: "a", sort: "name_asc", onSale: true }));
    expect(cleared).toEqual(view({ sort: "name_asc" }));
    expect(sameView(cleared, view({ sort: "name_asc" }))).toBe(true);
  });
});

describe("saved views", () => {
  it("validates names", () => {
    expect(validateViewName("  Needs   photos ")).toEqual({ ok: true, name: "Needs photos" });
    expect(validateViewName("").ok).toBe(false);
    expect(validateViewName("x".repeat(41)).ok).toBe(false);
    expect(validateViewName("<script>").ok).toBe(false);
    expect(validateViewName("=SUM(A1)").ok).toBe(false);
    expect(validateViewName("Stale / old (90d)").ok).toBe(true);
    expect(validateViewName("needs photos", [{ id: "1", name: "Needs Photos" }]).ok).toBe(false);
    expect(validateViewName("needs photos", [{ id: "1", name: "Needs Photos" }], "1").ok).toBe(true);
  });
  it("adds up to the maximum and removes", () => {
    let views = [];
    for (let i = 0; i < MAX_SAVED_VIEWS; i += 1) {
      const r = addSavedView(views, `View ${i}`, "sort=name_asc", `id${i}`);
      expect(r.ok).toBe(true);
      views = r.views;
    }
    expect(addSavedView(views, "One more", "q=a")).toMatchObject({ ok: false });
    expect(removeSavedView(views, "id3")).toHaveLength(MAX_SAVED_VIEWS - 1);
  });
  it("sanitizes stored data", () => {
    const stored = [{ id: "a", name: "Good", params: "q=a" }, { id: "b", name: "<b>", params: "q=a" }, { id: "c", name: "Good", params: "q=b" }, { id: 4, name: "Num", params: "" }, null, ...Array.from({ length: 15 }, (_, i) => ({ id: `x${i}`, name: `N${i}`, params: "" }))];
    const out = sanitizeSavedViews(stored);
    expect(out[0]).toEqual({ id: "a", name: "Good", params: "q=a" });
    expect(out).toHaveLength(MAX_SAVED_VIEWS);
    expect(out.find((v) => v.name === "<b>")).toBeUndefined();
    expect(sanitizeSavedViews("nope")).toEqual([]);
  });
});

describe("performance", () => {
  it("filters, sorts and counts 150 items quickly", () => {
    n = 0;
    const many = Array.from({ length: 150 }, (_, i) => mk({ name: `Product ${i}`, price: 100 + i, availability: i % 5 === 0 ? "out_of_stock" : "available", search_tags: [`t${i % 9}`] }));
    const start = performance.now();
    for (let r = 0; r < 20; r += 1) {
      selectItems(many, view({ q: "prod", availability: ["available"], sort: "health_low" }), ctx);
      trackerCounts(many, ctx);
    }
    expect((performance.now() - start) / 20).toBeLessThan(60);
  });
});
