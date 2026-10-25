import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAY_MS, DEFAULT_QUERY, TRACKER, activeChips, applyFilters, applySort, buildCatalogQuery, clearFilters, computeStats, enrichItems,
  filterCount, healthScore, matchesSearch, parseCatalogQuery, runCatalogQuery, showingSummary, statsFromRpc, trackerFilter, visibilityOf,
} from "./filters.js";

const NOW = Date.parse("2026-10-18T12:00:00Z");
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY_MS).toISOString();

const item = (id, o = {}) => ({
  id: String(id), name: `Item ${id}`, description: "", section: null, price: 100, priceMax: null, priceType: "fixed", unit: null, salePrice: null,
  availability: "available", stockCount: null, trackStock: false, lowStockThreshold: 3, showStockCount: false, availableFrom: null, season: null,
  visible: true, draft: false, sort: id, hiddenByAdmin: false, removedByAdmin: false, adminHideReason: null, adminReason: null, tags: [], badge: null,
  variants: [], priceConfirmedAt: iso(1), createdAt: iso(100 - id), updatedAt: iso(50), imageCount: 1, hasVideo: false, ...o,
});

const ITEMS = [
  item(1, { name: "Fade cut", price: 500, section: "Haircuts", tags: ["barber", "fade"], imageCount: 2, hasVideo: true, badge: "popular", updatedAt: iso(3), description: "A clean fade finished with a hot towel and styling." }),
  item(2, { name: "Beard trim", section: "Haircuts", price: 300, salePrice: 250, availability: "limited_stock", trackStock: true, stockCount: 2, updatedAt: iso(20) }),
  item(3, { name: "Hot towel shave", section: "Shaves", price: 800, availability: "out_of_stock", imageCount: 0, priceConfirmedAt: iso(120), updatedAt: iso(60) }),
  item(4, { name: "Kids cut", price: 250, availability: "by_appointment", season: { from: "12-01", to: "01-15" } }),
  item(5, { name: "Holiday special", price: 1500, availableFrom: iso(-10), visible: false, draft: true }),
  item(6, { name: "Wedding package", priceType: "from", price: 5000, variants: [{ id: "a" }], badge: "bestseller", visible: false }),
  item(7, { name: "Free consultation", priceType: "free", price: null }),
  item(8, { name: "Home visit", priceType: "contact", price: null, hiddenByAdmin: true, adminHideReason: "Misleading photo" }),
  item(9, { name: "Old style", removedByAdmin: true, adminReason: "Prohibited" }),
  item(10, { name: "Colour range", priceType: "range", price: 1000, priceMax: 3000, trackStock: true, showStockCount: true, stockCount: 12 }),
];
const SIGNALS = [{ itemId: "1", openFlags: 0, reports30d: 2 }, { itemId: "3", openFlags: 1, reports30d: 0 }];
const E = enrichItems(ITEMS, SIGNALS, { now: NOW });
const ids = (rows) => rows.map((r) => r.id).join(",");
const run = (patch) => ids(runCatalogQuery(E, { ...DEFAULT_QUERY, ...patch }, NOW));

test("visibility states", () => {
  assert.deepEqual(E.map((i) => i.visibility), ["showing", "showing", "showing", "showing", "draft", "hidden_me", "showing", "hidden_admin", "hidden_admin", "showing"]);
  assert.equal(visibilityOf({ visible: false, draft: false }), "hidden_me");
});

test("search matches name, tags, section and description with partial terms", () => {
  assert.equal(run({ q: "fade" }), "1");
  assert.equal(run({ q: "barb" }), "1");
  assert.equal(run({ q: "shav" }), "3");
  assert.equal(run({ q: "haircuts" }), "1,2");
  assert.equal(run({ q: "hair cut" }), "1,2");
  assert.equal(run({ q: "TOWEL" }), "1,3");
  assert.equal(run({ q: "nothing-here" }), "");
  assert.equal(matchesSearch(E[0], "  "), true);
});

test("each filter on its own", () => {
  assert.equal(run({ section: "Haircuts" }), "1,2");
  assert.equal(run({ section: "Shaves" }), "3");
  assert.equal(run({ ptype: ["free", "contact"] }), "7,8");
  assert.equal(run({ avail: ["available"] }), "1,5,6,7,8,9,10");
  assert.equal(run({ avail: ["seasonal"] }), "4");
  assert.equal(run({ avail: ["coming_soon"] }), "5");
  assert.equal(run({ avail: ["limited_stock", "out_of_stock"] }), "2,3");
  assert.equal(run({ avail: ["by_appointment"] }), "4");
  assert.equal(run({ vis: ["showing"] }), "1,2,3,4,7,10");
  assert.equal(run({ vis: ["hidden_me"] }), "6");
  assert.equal(run({ vis: ["hidden_admin"] }), "8,9");
  assert.equal(run({ vis: ["draft"] }), "5");
  assert.equal(run({ issues: ["no_photo"] }), "3");
  assert.equal(run({ issues: ["stale_price"] }), "3");
  assert.equal(run({ issues: ["low_stock"] }), "2");
  assert.equal(run({ issues: ["reported"] }), "1");
  assert.equal(run({ issues: ["flagged"] }), "3");
  assert.equal(run({ issues: ["reported", "flagged"] }), "1,3");
  assert.equal(run({ min: 500 }), "1,3,5,6,10");
  assert.equal(run({ max: 300 }), "2,4,9");
  assert.equal(run({ min: 300, max: 800 }), "1,2,3");
  assert.equal(run({ sale: true }), "2");
  assert.equal(run({ badge: "popular" }), "1");
  assert.equal(run({ badge: "bestseller" }), "6");
  assert.equal(run({ video: true }), "1");
  assert.equal(run({ variants: true }), "6");
  assert.equal(run({ stock: true }), "2,10");
  assert.equal(run({ updated: "7" }), "1");
  assert.equal(run({ updated: "30" }), "1,2");
});

test("each sort on its own", () => {
  assert.equal(run({ sort: "manual" }), "1,2,3,4,5,6,7,8,9,10");
  assert.equal(run({ sort: "name_asc" }), "2,10,1,7,5,8,3,4,9,6");
  assert.equal(run({ sort: "name_desc" }), "6,9,4,3,8,5,7,1,10,2");
  assert.equal(run({ sort: "price_asc" }), "9,4,2,1,3,10,5,6,7,8");
  assert.equal(run({ sort: "price_desc" }), "6,5,10,3,1,2,4,9,7,8");
  assert.equal(run({ sort: "newest" }), "10,9,8,7,6,5,4,3,2,1");
  assert.equal(run({ sort: "updated" }), "1,2,4,5,6,7,8,9,10,3");
  assert.equal(run({ sort: "avail_first" }), "1,5,6,7,8,9,10,2,4,3");
  assert.equal(run({ sort: "avail_out_first" }), "3,4,2,1,5,6,7,8,9,10");
  assert.equal(run({ sort: "stock_asc" }), "2,10,1,3,4,5,6,7,8,9");
  assert.equal(run({ sort: "reported_desc" }), "1,3,2,4,5,6,7,8,9,10");
  assert.equal(run({ sort: "stale_first" }), "3,1,2,4,5,6,7,8,9,10");
  const health = applySort(E, "health_asc").map((i) => i.health);
  assert.deepEqual(health, [...health].sort((a, b) => a - b));
});

test("filters and sorts combine", () => {
  assert.equal(run({ ptype: ["fixed"], avail: ["available"], sort: "price_desc" }), "5,1,9");
  assert.equal(run({ q: "cut", vis: ["showing"], sort: "name_asc" }), "2,1,4");
  assert.equal(run({ section: "Haircuts", sale: true }), "2");
  assert.equal(run({ section: "Shaves", sale: true }), "");
});

test("tracker counts equal the filtered result for every tile", () => {
  const stats = computeStats(E);
  for (const t of TRACKER) {
    assert.equal(applyFilters(E, trackerFilter(t.key), NOW).length, stats[t.key], t.key);
  }
  assert.deepEqual(stats, {
    total: 10, available: 7, limited_stock: 1, out_of_stock: 1, seasonal: 1, by_appointment: 1, coming_soon: 1, hidden_me: 1, hidden_admin: 2,
    draft: 1, no_photo: 1, stale_price: 1, low_stock: 1, reported: 1, flagged: 1,
  });
});

test("rpc stats map onto tracker keys", () => {
  const mapped = statsFromRpc({ total: 4, hidden_by_me: 1, hidden_by_admin: 2, drafts: 3, without_photo: 5, stale_prices: 6 });
  assert.equal(mapped.hidden_me, 1);
  assert.equal(mapped.hidden_admin, 2);
  assert.equal(mapped.draft, 3);
  assert.equal(mapped.no_photo, 5);
  assert.equal(mapped.stale_price, 6);
  assert.equal(mapped.flagged, 0);
});

test("URL state round trips and ignores junk", () => {
  const state = { ...DEFAULT_QUERY, q: "fade", section: "Haircuts", ptype: ["fixed"], avail: ["available", "seasonal"], vis: ["showing"], issues: ["no_photo"], min: 100, max: 900, sale: true, badge: "popular", video: true, variants: true, stock: true, updated: "30", sort: "price_desc" };
  const search = buildCatalogQuery(state);
  assert.deepEqual(parseCatalogQuery(search), state);
  assert.deepEqual(parseCatalogQuery(`?${search}`), state);
  assert.equal(buildCatalogQuery(DEFAULT_QUERY), "");
  const junk = parseCatalogQuery("avail=bogus,available&sort=weird&min=-3&updated=5&badge=zzz&sale=0");
  assert.deepEqual(junk.avail, ["available"]);
  assert.equal(junk.sort, "manual");
  assert.equal(junk.min, null);
  assert.equal(junk.updated, "");
  assert.equal(junk.badge, "");
  assert.equal(junk.sale, false);
});

test("chips remove one filter and clear keeps the sort", () => {
  const state = { ...DEFAULT_QUERY, avail: ["available", "seasonal"], min: 100, max: 500, sort: "name_asc", q: "x" };
  const chips = activeChips(state);
  assert.deepEqual(chips.map((c) => c.id), ["q", "avail:available", "avail:seasonal", "price"]);
  assert.deepEqual({ ...state, ...chips[1].patch }.avail, ["seasonal"]);
  assert.equal(filterCount(state), 3);
  const cleared = clearFilters(state);
  assert.equal(cleared.sort, "name_asc");
  assert.equal(filterCount(cleared), 0);
});

test("N of M showing and the reasons", () => {
  const live = showingSummary(E, { shopLive: true });
  // The out of stock item is not shown to customers, so it is not counted as showing.
  assert.equal(live.text, "5 of 10 items are showing to customers");
  assert.deepEqual(live.reasons.map((r) => [r.key, r.count]), [["out_of_stock", 1], ["hidden_me", 1], ["hidden_admin", 2], ["draft", 1]]);
  const off = showingSummary(E, { shopLive: false });
  assert.equal(off.showing, 0);
  assert.deepEqual(off.reasons[0], { key: "shop_not_live", count: 5, label: "5 not showing because your shop is not live" });
  assert.equal(showingSummary(E.slice(0, 1), { shopLive: true }).text, "1 of 1 item is showing to customers");
});

test("admin, flagged and reported items are marked", () => {
  const byId = Object.fromEntries(E.map((i) => [i.id, i]));
  assert.equal(byId["8"].visibility, "hidden_admin");
  assert.equal(byId["9"].removed, true);
  assert.equal(byId["3"].openFlags, 1);
  assert.equal(byId["1"].reports, 2);
  assert.equal(byId["3"].flags.stalePrice, true);
});

test("health score rewards complete listings", () => {
  const full = healthScore(item(1, { description: "x".repeat(40), section: "S", tags: ["a"], imageCount: 2 }), NOW);
  const bare = healthScore(item(2, { imageCount: 0, price: null, priceType: "fixed" }), NOW);
  assert.equal(full, 100);
  assert.ok(bare < full);
});

test("150 items filter and sort quickly", () => {
  const many = Array.from({ length: 150 }, (_, i) => item(i + 1, { name: `Product ${i + 1}`, section: `S${i % 5}`, price: 50 + i, tags: ["t" + (i % 7)] }));
  const start = performance.now();
  const enriched = enrichItems(many, [], { now: NOW });
  const out = runCatalogQuery(enriched, { ...DEFAULT_QUERY, q: "product 1", min: 60, sort: "price_desc" }, NOW);
  const ms = performance.now() - start;
  assert.ok(out.length > 0);
  assert.ok(ms < 150, `took ${ms}ms`);
});

test("the older 'unavailable' value counts and filters as out of stock", () => {
  const items = enrichItems([item(1, { availability: "unavailable" }), item(2, { availability: "out_of_stock" }), item(3, { availability: "available" })], [], { now: NOW });
  assert.equal(items[0].soldOut, true);
  assert.equal(items[2].soldOut, false);
  assert.deepEqual(runCatalogQuery(items, { ...DEFAULT_QUERY, avail: ["out_of_stock"] }, NOW).map((i) => i.id).sort(), ["1", "2"]);
  assert.equal(computeStats(items).out_of_stock, 2);
  assert.equal(statsFromRpc({ out_of_stock: 2, unavailable: 3 }).out_of_stock, 5);
});
