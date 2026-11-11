import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFor, priceBounds, priceMin, priceMax } from "./pricing.js";
import { lineTotal, wholeAmount } from "./pricing/money.js";
import { getFixture } from "./contracts/fixtures/index.js";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const detail = (id) => getFixture(id).detail;
const iso = (ms) => new Date(ms).toISOString();

// A small two-colour phone used where the fixture's own data is not the point.
const phoneOf = (extra = {}) => ({
  ...detail("fx-phone"),
  ...extra
});
const grey128 = { colour: "grey", storage: "128-gb" };
const black128 = { colour: "black", storage: "128-gb" };

test("combination price: Black 25,000 vs Grey 24,000", () => {
  const phone = phoneOf();
  const black = priceFor(phone, black128, 1, NOW);
  const grey = priceFor(phone, grey128, 1, NOW);
  assert.equal(black.available, true);
  assert.equal(black.unit, 25000);
  assert.equal(black.total, 25000);
  assert.equal(black.source, "regular");
  assert.equal(black.was, null);
  assert.equal(grey.unit, 24000);
  assert.equal(grey.variantId, "fx-phone:colour=grey|storage=128-gb");
});

test("selecting by variant id works the same as by choice", () => {
  const phone = phoneOf();
  assert.equal(priceFor(phone, "fx-phone:colour=grey|storage=128-gb", 1, NOW).total, 24000);
  assert.equal(priceFor(phone, { variantId: "fx-phone:colour=grey|storage=128-gb" }, 1, NOW).total, 24000);
});

test("total for quantity 3, and quantity is clamped to 1", () => {
  const phone = phoneOf();
  assert.equal(priceFor(phone, grey128, 3, NOW).total, 72000);
  for (const bad of [0, -2, NaN, undefined, null, "abc"]) assert.equal(priceFor(phone, grey128, bad, NOW).qty, 1, String(bad));
  assert.equal(priceFor(phone, grey128, 2.6, NOW).qty, 3);
});

test("unavailable: a combination that is not sold, has no price, is switched off, or is half chosen", () => {
  const phone = phoneOf();
  assert.deepEqual(priceFor(phone, { colour: "blue", storage: "128-gb" }, 1, NOW), { available: false, reason: "not_sold", qty: 1 });
  assert.equal(priceFor(phone, "nope", 1, NOW).reason, "not_sold");
  assert.equal(priceFor(phone, { colour: "grey" }, 1, NOW).reason, "incomplete");
  const noPrice = phoneOf({ optionVariants: phone.optionVariants.map((v) => (v.choice.colour === "grey" && v.choice.storage === "128-gb" ? { ...v, price: null } : v)) });
  assert.equal(priceFor(noPrice, grey128, 1, NOW).reason, "not_sold");
  const off = phoneOf({ optionVariants: phone.optionVariants.map((v) => (v.choice.colour === "grey" && v.choice.storage === "128-gb" ? { ...v, status: "unavailable" } : v)) });
  assert.equal(priceFor(off, grey128, 1, NOW).available, false);
});

test("out of stock still has a price but says so", () => {
  const r = priceFor(phoneOf(), { colour: "black", storage: "256-gb" }, 1, NOW);
  assert.equal(r.available, true);
  assert.equal(r.inStock, false);
  assert.equal(priceFor(phoneOf(), { colour: "grey", storage: "256-gb" }, 1, NOW).inStock, true);
});

test("a sale price on one combination shows was", () => {
  const phone = phoneOf();
  const withSale = phoneOf({ optionVariants: phone.optionVariants.map((v) => (v.id.endsWith("grey|storage=128-gb") ? { ...v, salePrice: 22000 } : v)) });
  const r = priceFor(withSale, grey128, 2, NOW);
  assert.deepEqual([r.unit, r.total, r.was, r.source], [22000, 44000, 48000, "sale"]);
  assert.equal(priceFor(withSale, black128, 1, NOW).source, "regular");
});

const flash = (over = {}) => ({
  discount: { type: "percent", value: 10 }, startsAt: iso(NOW - 3_600_000), endsAt: iso(NOW + 3_600_000), status: "live", variantOverrides: [], ...over
});

test("flash on one combination only (variant_overrides) and on the whole item", () => {
  const one = phoneOf({ flash: flash({ variantOverrides: ["fx-phone:colour=grey|storage=128-gb"] }) });
  const g = priceFor(one, grey128, 1, NOW);
  assert.deepEqual([g.unit, g.total, g.was, g.source], [21600, 21600, 24000, "flash"]);
  assert.equal(priceFor(one, black128, 1, NOW).source, "regular");
  const all = phoneOf({ flash: { sale: flash() } });
  assert.equal(priceFor(all, black128, 1, NOW).unit, 22500);
  assert.equal(priceFor(all, grey128, 1, NOW).unit, 21600);
});

test("a flash override can carry its own discount", () => {
  const item = phoneOf({ flash: flash({ variantOverrides: [{ variantId: "fx-phone:colour=grey|storage=128-gb", discount: { type: "sale_price", value: 20000 } }] }) });
  assert.equal(priceFor(item, grey128, 1, NOW).unit, 20000);
});

test("flash outside its window, ended or cancelled does nothing; flash never beats a lower sale price", () => {
  for (const f of [flash({ startsAt: iso(NOW + 1000) }), flash({ endsAt: iso(NOW) }), flash({ status: "cancelled" })]) assert.equal(priceFor(phoneOf({ flash: f }), grey128, 1, NOW).source, "regular");
  const phone = phoneOf();
  const both = phoneOf({ flash: flash(), optionVariants: phone.optionVariants.map((v) => ({ ...v, salePrice: 20000 })) });
  assert.deepEqual([priceFor(both, grey128, 1, NOW).unit, priceFor(both, grey128, 1, NOW).source], [20000, "sale"]);
});

const offer = (kind, config, extra = {}) => ({ id: `o-${kind}`, scope: "product", kind, config, status: "active", startsAt: iso(NOW - 3_600_000), endsAt: iso(NOW + 86_400_000), ...extra });

test("an offer on the whole item changes the total for the quantity", () => {
  const phone = phoneOf({ offers: [offer("multi_buy", { qty: 3, price: 66000 })] });
  const three = priceFor(phone, grey128, 3, NOW);
  assert.deepEqual([three.unit, three.total, three.was, three.source, three.offerId], [24000, 66000, 72000, "offer", "o-multi_buy"]);
  const one = priceFor(phone, grey128, 1, NOW);
  assert.deepEqual([one.total, one.source], [24000, "regular"]);
  assert.equal(priceFor(phone, black128, 3, NOW).total, 66000);
});

test("offer kinds: percent, amount, buy x get y, volume; the best one wins; a free total is ignored", () => {
  const at = (kind, config, qty) => priceFor(phoneOf({ offers: [offer(kind, config)] }), grey128, qty, NOW).total;
  assert.equal(at("percent_off", { percent: 15 }, 2), 40800);
  assert.equal(at("amount_off", { amount: 1000 }, 2), 46000);
  assert.equal(at("buy_x_get_y", { buy: 2, get: 1, discountPercent: 100 }, 3), 48000);
  assert.equal(at("buy_x_get_y", { buy: 2, get: 1, discountPercent: 100 }, 2), 48000);
  assert.equal(at("volume", { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] }, 6), 129600);
  assert.equal(at("volume", { tiers: [{ qty: 3, percent: 5 }] }, 2), 48000);
  assert.equal(at("amount_off", { amount: 99999 }, 1), 24000);
  const best = phoneOf({ offers: [offer("percent_off", { percent: 5 }), offer("amount_off", { amount: 3000 })] });
  assert.equal(priceFor(best, grey128, 1, NOW).total, 21000);
  assert.equal(at("bundle", { rewardType: "free_gift", gift: "Cap" }, 1), 24000);
});

test("offers that are paused, ended, store-wide or aimed at another combination do not apply", () => {
  const total = (o) => priceFor(phoneOf({ offers: [o] }), grey128, 1, NOW).total;
  assert.equal(total(offer("percent_off", { percent: 50 }, { status: "paused" })), 24000);
  assert.equal(total(offer("percent_off", { percent: 50 }, { endsAt: iso(NOW - 1) })), 24000);
  assert.equal(total(offer("percent_off", { percent: 50 }, { scope: "store" })), 24000);
  assert.equal(total(offer("percent_off", { percent: 50 }, { variantIds: ["fx-phone:colour=black|storage=128-gb"] })), 24000);
  assert.equal(total(offer("percent_off", { percent: 50 }, { variantIds: ["fx-phone:colour=grey|storage=128-gb"] })), 12000);
});

test("an offer works on the flash price", () => {
  const item = phoneOf({ flash: flash(), offers: [offer("percent_off", { percent: 10 })] });
  const r = priceFor(item, grey128, 1, NOW);
  assert.deepEqual([r.unit, r.total, r.was, r.source], [21600, 19440, 24000, "offer"]);
});

test("rounding is half up and never a fraction", () => {
  assert.equal(lineTotal(750, 0.25), 188);
  assert.equal(lineTotal(800, 1.5), 1200);
  assert.equal(lineTotal(333, 3), 999);
  assert.equal(wholeAmount("12.5"), 13);
  assert.equal(wholeAmount(-1), null);
  assert.equal(wholeAmount(null), null);
  const r = priceFor({ regularPrice: 999 }, null, 1, NOW);
  assert.equal(Number.isInteger(r.total), true);
  const odd = priceFor({ regularPrice: 999, flash: flash({ discount: { type: "percent", value: 15 } }) }, null, 3, NOW);
  assert.equal(odd.unit, 849);
  assert.equal(odd.total, 2547);
});

test("price_min and price_max: lowest you can actually buy, in stock first", () => {
  const phone = phoneOf();
  assert.deepEqual(priceBounds(phone, NOW), { min: 24000, max: 25000, hasRange: true, inStock: true });
  assert.equal(priceMin(phone, NOW), 24000);
  assert.equal(priceMax(phone, NOW), 25000);
  // The cheap combinations are sold out: the range ignores them while anything is in stock.
  const soldOutCheap = phoneOf({ optionVariants: phone.optionVariants.map((v) => (v.choice.colour === "grey" ? { ...v, status: "out_of_stock" } : v)) });
  assert.equal(priceMin(soldOutCheap, NOW), 25000);
  assert.equal(priceBounds(soldOutCheap, NOW).hasRange, false);
  // Everything sold out: fall back to the priced combinations.
  const none = phoneOf({ optionVariants: phone.optionVariants.map((v) => ({ ...v, status: "out_of_stock" })) });
  assert.deepEqual([priceMin(none, NOW), priceMax(none, NOW), priceBounds(none, NOW).inStock], [24000, 25000, false]);
  const noneSold = phoneOf({ optionVariants: phone.optionVariants.map((v) => ({ ...v, price: null })) });
  assert.equal(priceBounds(noneSold, NOW), null);
  assert.equal(priceMin(noneSold, NOW), null);
});

test("price bounds follow a flash on one combination", () => {
  const phone = phoneOf({ flash: flash({ discount: { type: "percent", value: 50 }, variantOverrides: ["fx-phone:colour=grey|storage=64-gb"] }) });
  assert.equal(priceMin(phone, NOW), 12000);
});

test("price tiers: the tier for the quantity sets the unit price", () => {
  const printing = detail("fx-printing");
  const a4 = "fx-printing:paper=a4";
  const a3 = "fx-printing:paper=a3";
  assert.deepEqual([priceFor(printing, a4, 1, NOW).unit, priceFor(printing, a4, 50, NOW).unit, priceFor(printing, a4, 200, NOW).total], [20, 15, 2000]);
  const bulk = priceFor(printing, a3, 60, NOW);
  assert.deepEqual([bulk.unit, bulk.total, bulk.was, bulk.source], [30, 1800, null, "tier"]);
});

test("legacy item (no options) is priced from the item, as today", () => {
  const legacy = detail("fx-legacy");
  const r = priceFor(legacy, undefined, 1, NOW);
  assert.deepEqual([r.available, r.variantId, r.unit, r.total, r.was, r.source, r.offerId], [true, null, 1500, 1500, null, "regular", null]);
  assert.equal(priceFor(legacy, { colour: "x" }, 4, NOW).total, 6000);
  assert.equal(priceFor({ id: "x", name: "No price" }, null, 1, NOW).reason, "no_price");
  assert.deepEqual(priceBounds(legacy, NOW), { min: 1500, max: 1500, hasRange: false, inStock: true });
  assert.equal(priceFor({ ...legacy, salePrice: 1200 }, null, 1, NOW).was, 1500);
});

test("every fixture prices without throwing and with integers", () => {
  for (const id of ["fx-phone", "fx-sandisk", "fx-shoes", "fx-table", "fx-sofa", "fx-bread", "fx-water", "fx-led-strip", "fx-led-bulb", "fx-printing", "fx-butcher", "fx-necklace", "fx-fragrance", "fx-legacy"]) {
    const item = detail(id);
    const b = priceBounds(item, NOW);
    assert.ok(b === null || (Number.isInteger(b.min) && Number.isInteger(b.max)), id);
  }
});

test("measured items keep the amount positive and price per unit of measure", () => {
  const butcher = detail("fx-butcher");
  const steak = butcher.optionVariants.find((v) => v.choice.cut === "steak");
  const r = priceFor(butcher, steak.id, 1.5, NOW);
  assert.equal(r.total, 1125);
  assert.equal(priceFor(butcher, steak.id, 0, NOW).qty, 0.5);
  assert.equal(priceFor(butcher, steak.id, -3, NOW).qty, 0.5);
});

// Regression: the package index must keep the catalog's list-wide priceBounds(items) and expose the one-item helper under its own name.
test("the shared index keeps both price range helpers apart", async () => {
  const shared = await import("./index.js");
  assert.deepEqual(shared.priceBounds([{ price: 1000 }, { price: 5000 }]), { min: 1000, max: 5000 });
  assert.equal(typeof shared.itemPriceBounds, "function");
  assert.notEqual(shared.itemPriceBounds, shared.priceBounds);
});
