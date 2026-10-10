import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStockRules, stockExplanation, stockBadge, isStockDriven, AVAILABILITY } from "./availability.js";
import { STOCK_CASES } from "./stock-cases.js";
import { blankItem, itemToRow, rowToItem, duplicateOf, attentionReasons, planUsage, pricePreview, tsToDate, dateToTs, defaultKindFor, isItemLimitMessage, withStockRules } from "./item.js";

test("applyStockRules follows the shared decision table", () => {
  for (const c of STOCK_CASES) assert.equal(applyStockRules(c.in), c.out, JSON.stringify(c.in));
});

test("only available, limited and out of stock are stock-driven", () => {
  for (const a of AVAILABILITY) {
    const driven = ["available", "limited_stock", "out_of_stock"].includes(a.value);
    assert.equal(isStockDriven({ trackStock: true, stockCount: 1, availability: a.value }), driven, a.value);
  }
  assert.equal(isStockDriven({ trackStock: true, stockCount: null, availability: "available" }), false);
});

test("stock explanation and the 'only N left' badge", () => {
  const base = { trackStock: true, lowStockThreshold: 5, availability: "available", showStockCount: true };
  assert.match(stockExplanation({ ...base, stockCount: 4 }), /Limited stock/);
  assert.match(stockExplanation({ ...base, stockCount: 0 }), /Out of stock/);
  assert.match(stockExplanation({ ...base, stockCount: 9 }), /Available/);
  assert.match(stockExplanation({ ...base, stockCount: 2, availability: "seasonal" }), /set by you/);
  assert.equal(stockBadge({ ...base, stockCount: 4 }), "Only 4 left");
  assert.equal(stockBadge({ ...base, stockCount: 9 }), "");
  assert.equal(stockBadge({ ...base, stockCount: 4, showStockCount: false }), "");
  assert.equal(stockBadge({ ...base, stockCount: 0 }), "");
});

test("a row round-trips and never carries admin columns", () => {
  const item = blankItem({
    name: "  Box braids ", kind: "service", section: "Braids", priceType: "range", price: 2000, priceMax: 3500, unit: "per session",
    saleStarts: "2026-11-01", saleEnds: "2026-11-30", searchTags: ["braids", "cornrows"], badge: "Popular",
    variants: [{ id: "v1", label: "Small", price: 2000 }], specs: [{ label: "Hair", value: "Included" }], includes: ["Wash"],
    availability: "seasonal", seasonFrom: "2026-12-01", seasonTo: "2026-12-31",
    service: { duration: 180, homeService: true, appointmentNeeded: true, staff: ["Amina"], addOns: [{ label: "Beads", price: 200 }] },
  });
  const row = itemToRow(item);
  assert.equal(row.name, "Box braids");
  assert.equal(row.sale_price, null, "ranges never carry a sale price");
  assert.deepEqual(row.season, { from: "2026-12-01", to: "2026-12-31" });
  for (const k of ["hidden_by_admin", "admin_hide_reason", "admin_status", "admin_reason", "removed_by_admin", "business_id", "id", "price_confirmed_at"]) {
    assert.ok(!(k in row), k);
  }
  const back = rowToItem({ ...row, id: item.id, hidden_by_admin: true });
  assert.equal(back.name, "Box braids");
  assert.equal(back.saleStarts, "2026-11-01");
  assert.equal(back.saleEnds, "2026-11-30");
  assert.equal(back.seasonTo, "2026-12-31");
  assert.equal(back.service.duration, 180);
  assert.equal(back.hiddenByAdmin, true);
});

test("price type decides which price columns are written", () => {
  assert.equal(itemToRow(blankItem({ name: "Tea", priceType: "free", price: 50 })).price, 0);
  const contact = itemToRow(blankItem({ name: "Tea", priceType: "contact", price: 50, unit: "per kg", salePrice: 10 }));
  assert.equal(contact.price, null);
  assert.equal(contact.unit, null);
  assert.equal(contact.sale_price, null);
  assert.equal(itemToRow(blankItem({ name: "Tea", priceType: "fixed", price: 50, priceMax: 90 })).price_max, null);
});

test("stock columns are cleared when tracking is off; service and membership blocks follow the kind", () => {
  const off = itemToRow(blankItem({ name: "Tea", trackStock: false, stockCount: 4, showStockCount: true, restockDate: "2026-12-01" }));
  assert.equal(off.stock_count, null);
  assert.equal(off.show_stock_count, false);
  assert.equal(off.restock_at, null);
  const product = itemToRow(blankItem({ name: "Tea", kind: "product" }));
  assert.deepEqual(product.service, {});
  assert.deepEqual(product.membership, {});
  assert.ok(itemToRow(blankItem({ name: "Pass", kind: "membership" })).membership.term);
});

test("dates are Nairobi-local", () => {
  assert.equal(dateToTs("2026-11-30", true), "2026-11-30T23:59:59+03:00");
  assert.equal(tsToDate("2026-11-30T20:59:59Z"), "2026-11-30");
  assert.equal(tsToDate("2026-11-30T21:00:00Z"), "2026-12-01");
  assert.equal(tsToDate(null), "");
});

test("duplicate copies authored fields and nothing owned by the server", () => {
  const original = { ...blankItem({ name: "Haircut", price: 300, variants: [{ id: "v1", label: "Kids", price: 150 }] }), hiddenByAdmin: true, adminHideReason: "x", priceConfirmedAt: "2026-01-01T00:00:00Z", createdAt: "2026-01-01T00:00:00Z" };
  const copy = duplicateOf(original, 7);
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, "Haircut (copy)");
  assert.equal(copy.sort, 7);
  assert.equal(copy.price, 300);
  assert.equal(copy.hiddenByAdmin, undefined);
  assert.equal(copy.priceConfirmedAt, undefined);
  assert.notEqual(copy.variants[0].id, "v1");
  copy.variants[0].label = "changed";
  assert.equal(original.variants[0].label, "Kids", "deep copy");
  assert.ok(duplicateOf(blankItem({ name: "x".repeat(80) }), 0).name.length <= 80);
});

test("attention reasons", () => {
  const now = new Date("2026-10-09T09:00:00Z");
  const codes = (i, o) => attentionReasons(i, { now, ...o }).map((r) => r.code);
  assert.deepEqual(codes(blankItem({ name: "A", price: 10, shortDescription: "ok" })), []);
  assert.ok(codes(blankItem({ name: "A" })).includes("no_price"));
  assert.ok(!codes(blankItem({ name: "A", priceType: "contact", shortDescription: "ok" })).includes("no_price"));
  assert.ok(codes(blankItem({ name: "A", price: 10, priceConfirmedAt: "2026-01-01T00:00:00Z" })).includes("stale_price"));
  assert.ok(!codes(blankItem({ name: "A", price: 10, priceConfirmedAt: "2026-09-01T00:00:00Z" })).includes("stale_price"));
  assert.ok(codes(blankItem({ name: "A", price: 10, availability: "out_of_stock" })).includes("out_of_stock"));
  assert.ok(codes(blankItem({ name: "A", price: 10, availability: "coming_soon", expectedDate: "2026-10-01" })).includes("past_expected"));
  assert.ok(codes(blankItem({ name: "A", price: 10, saleEnds: "2026-10-01", salePrice: 5 })).includes("sale_over"));
  assert.ok(codes(blankItem({ name: "A", price: 10, visible: false })).includes("hidden"));
  assert.ok(codes({ ...blankItem({ name: "A", price: 10 }), hiddenByAdmin: true }).includes("hidden_by_admin"));
  const signals = new Map([["i1", { open_flags: 2 }]]);
  assert.ok(codes(blankItem({ id: "i1", name: "A", price: 10 }), { signals }).includes("open_flag"));
});

test("plan usage and the limit error mapping", () => {
  assert.deepEqual(planUsage(18, 25), { count: 18, limit: 25, remaining: 7, atLimit: false, nearLimit: false, label: "18 of 25 items" });
  assert.equal(planUsage(20, 25).nearLimit, true);
  assert.equal(planUsage(25, 25).atLimit, true);
  assert.equal(planUsage(3, null).atLimit, false);
  assert.ok(isItemLimitMessage("limit_reached:items"));
  assert.ok(isItemLimitMessage("P0001: limit_reached:items"));
  assert.ok(!isItemLimitMessage("limit_reached:faqs"));
  assert.ok(!isItemLimitMessage("limit_reached:item_media"));
});

test("price preview, default kinds, stock rules wrapper", () => {
  assert.equal(pricePreview(blankItem({ price: 1500, unit: "per session" })), "KSh 1,500 per session");
  assert.equal(pricePreview(blankItem({ priceType: "from", price: 300 })), "From KSh 300");
  assert.equal(pricePreview(blankItem({ priceType: "range", price: 100, priceMax: 200 })), "KSh 100 to KSh 200");
  assert.equal(pricePreview(blankItem({ priceType: "free" })), "Free");
  assert.equal(pricePreview(blankItem({ price: null })), "");
  assert.equal(defaultKindFor("gyms"), "membership");
  assert.equal(defaultKindFor("salons"), "service");
  assert.equal(defaultKindFor("hardware"), "product");
  assert.equal(withStockRules(blankItem({ trackStock: true, stockCount: 0 })).availability, "out_of_stock");
});
