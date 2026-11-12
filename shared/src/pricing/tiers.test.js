import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTiers, priceTiered, nextTierHint, tierIndex } from "./tiers.js";
import { priceFor } from "../pricing.js";
import { getFixture } from "../contracts/index.js";

const printing = [
  { minQty: 1, maxQty: 10, unitPrice: 10 },
  { minQty: 11, maxQty: 100, unitPrice: 7 },
  { minQty: 101, maxQty: null, unitPrice: 5 }
];

test("whole mode: the tier price applies to every unit, at each boundary", () => {
  const total = (qty) => priceTiered({ tiers: printing, mode: "whole", qty }).total;
  assert.deepEqual([1, 10, 11, 100, 101].map(total), [10, 100, 77, 700, 505]);
  assert.equal(priceTiered({ tiers: printing, mode: "whole", qty: 11 }).unit, 7);
  assert.equal(priceTiered({ tiers: printing, mode: "whole", qty: 101 }).unit, 5);
});

test("graduated mode: each band is charged at its own price, at each boundary", () => {
  const total = (qty) => priceTiered({ tiers: printing, mode: "graduated", qty }).total;
  assert.deepEqual([1, 10, 11, 100, 101].map(total), [10, 100, 107, 730, 735]);
});

test("graduated mode lists its bands, the average unit and the last band's price", () => {
  const r = priceTiered({ tiers: printing, mode: "graduated", qty: 101 });
  assert.deepEqual(r.bands.map((b) => [b.from, b.qty, b.unit]), [[1, 10, 10], [11, 90, 7], [101, 1, 5]]);
  assert.equal(r.marginal, 5);
  assert.equal(r.unit, Math.round(735 / 101));
});

test("the next tier hint says how many more and at what price", () => {
  assert.equal(nextTierHint(printing, 8).text, "Add 3 more for KES 7 each");
  assert.equal(nextTierHint(printing, 10).text, "Add 1 more for KES 7 each");
  assert.equal(nextTierHint(printing, 11).text, "Add 90 more for KES 5 each");
  assert.equal(nextTierHint(printing, 101), null);
  assert.equal(priceTiered({ tiers: printing, qty: 8 }).next.more, 3);
  assert.equal(nextTierHint(printing, 8, (n) => n - 1).text, "Add 3 more for KES 6 each");
});

test("tierIndex finds the band of a quantity", () => {
  assert.deepEqual([1, 10, 11, 100, 101, 5000].map((q) => tierIndex(printing, q)), [0, 0, 1, 1, 2, 2]);
});

test("a single tier is valid and has no hint", () => {
  const one = [{ minQty: 1, maxQty: null, unitPrice: 12 }];
  assert.ok(validateTiers(one).ok);
  assert.equal(priceTiered({ tiers: one, qty: 3 }).total, 36);
  assert.equal(priceTiered({ tiers: one, qty: 3 }).next, null);
});

test("valid tiers pass in both modes", () => {
  assert.ok(validateTiers(printing, "whole").ok);
  assert.ok(validateTiers(printing, "graduated").ok);
});

test("invalid tiers are refused", () => {
  const bad = (tiers, mode) => assert.equal(validateTiers(tiers, mode).ok, false, JSON.stringify(tiers));
  bad([]);
  bad(null);
  bad("x");
  bad([{ minQty: 2, maxQty: null, unitPrice: 5 }]);
  bad([{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 12, maxQty: null, unitPrice: 7 }]);
  bad([{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 10, maxQty: null, unitPrice: 7 }]);
  bad([{ minQty: 1, maxQty: 10, unitPrice: 5 }, { minQty: 11, maxQty: null, unitPrice: 7 }]);
  bad([{ minQty: 1, maxQty: 10, unitPrice: 10 }]);
  bad([{ minQty: 1, maxQty: null, unitPrice: 10 }, { minQty: 11, maxQty: null, unitPrice: 7 }]);
  bad([{ minQty: 1, maxQty: null, unitPrice: 0 }]);
  bad([{ minQty: 1, maxQty: null, unitPrice: -3 }]);
  bad([{ minQty: 1, maxQty: null, unitPrice: 7.5 }]);
  bad([{ minQty: 1.5, maxQty: null, unitPrice: 5 }]);
  bad([{ minQty: 1, unitPrice: 5 }]);
  bad([{ minQty: 1, maxQty: null, unitPrice: 5, note: "x" }]);
  bad(printing, "stepped");
  bad(Array.from({ length: 11 }, (_, i) => ({ minQty: i + 1, maxQty: i === 10 ? null : i + 1, unitPrice: 20 - i })));
});

test("priceTiered refuses bad tiers and bad quantities", () => {
  assert.throws(() => priceTiered({ tiers: [], qty: 1 }), RangeError);
  assert.throws(() => priceTiered({ tiers: printing, qty: 0 }), RangeError);
  assert.throws(() => priceTiered({ tiers: printing, qty: 2.5 }), RangeError);
});

const flash = (extra = {}) => ({ discount: { type: "percent", value: 20 }, startsAt: "2026-11-06T00:00:00Z", endsAt: "2026-11-07T00:00:00Z", ...extra });
const NOW = Date.parse("2026-11-06T12:00:00Z");
const item = (extra = {}) => ({ regularPrice: 10, priceTiers: printing, priceTierMode: "whole", ...extra });
const pick = (r) => [r.unit, r.total, r.was, r.source];

test("priceFor with whole tiers at the boundaries", () => {
  assert.deepEqual([1, 10, 11, 100, 101].map((q) => priceFor(item(), null, q, NOW).total), [10, 100, 77, 700, 505]);
  assert.deepEqual(pick(priceFor(item(), null, 11, NOW)), [7, 77, null, "tier"]);
  assert.equal(priceFor(item(), null, 11, NOW).next.text, "Add 90 more for KES 5 each");
  assert.equal(priceFor(item(), null, 8, NOW).next.text, "Add 3 more for KES 7 each");
  assert.equal(priceFor(item(), null, 101, NOW).next, null);
  assert.equal(priceFor(item(), null, 11, NOW).bands, null);
});

test("priceFor with graduated tiers at the boundaries", () => {
  const g = item({ priceTierMode: "graduated" });
  assert.deepEqual([1, 10, 11, 100, 101].map((q) => priceFor(g, null, q, NOW).total), [10, 100, 107, 730, 735]);
  const r = priceFor(g, null, 11, NOW);
  assert.deepEqual(r.bands.map((b) => [b.from, b.qty, b.unit]), [[1, 10, 10], [11, 1, 7]]);
  assert.deepEqual([r.source, r.was, r.next.text], ["tier", null, "Add 90 more for KES 5 each"]);
});

test("a live percent flash discounts the tier price in whole mode", () => {
  const r = priceFor(item({ flash: flash() }), null, 11, NOW);
  assert.deepEqual(pick(r), [6, 66, 77, "flash"]);
  assert.equal(r.next.unit, 4);
});

test("a live percent flash discounts every band in graduated mode", () => {
  const r = priceFor(item({ priceTierMode: "graduated", flash: flash() }), null, 11, NOW);
  assert.equal(r.total, 10 * 8 + 6);
  assert.equal(r.was, 107);
  assert.equal(r.source, "flash");
});

test("a flash sale price never raises a tier price", () => {
  const sale = flash({ discount: { type: "sale_price", value: 6 } });
  assert.deepEqual(pick(priceFor(item({ flash: sale }), null, 11, NOW)), [6, 66, 77, "flash"]);
  const r = priceFor(item({ flash: sale }), null, 101, NOW);
  assert.deepEqual([r.unit, r.source], [5, "tier"]);
});

test("a flash outside its window or already ended is ignored", () => {
  assert.equal(priceFor(item({ flash: flash() }), null, 11, Date.parse("2026-11-07T00:00:00Z")).source, "tier");
  assert.equal(priceFor(item({ flash: flash() }), null, 11, Date.parse("2026-11-05T12:00:00Z")).source, "tier");
  assert.equal(priceFor(item({ flash: flash({ status: "ended" }) }), null, 11, NOW).source, "tier");
});

test("invalid tiers fall back to the regular price", () => {
  const broken = item({ priceTiers: [{ minQty: 2, maxQty: null, unitPrice: 5 }] });
  assert.deepEqual(pick(priceFor(broken, null, 5, NOW)), [10, 50, null, "regular"]);
  assert.equal(priceFor(broken, null, 5, NOW).next, null);
});

test("an item without tiers has no hint and no bands", () => {
  const r = priceFor({ regularPrice: 100 }, null, 2, NOW);
  assert.deepEqual([r.total, r.next, r.bands], [200, null, null]);
});

test("the printing fixture: A4 uses the item tiers, A3 its own", () => {
  const fx = getFixture("fx-printing").detail;
  const v = (paper) => fx.optionVariants.find((x) => x.choice.paper === paper);
  assert.equal(priceFor(fx, v("a4").id, 50, NOW).unit, 15);
  assert.equal(priceFor(fx, v("a3").id, 200, NOW).unit, 22);
});

test("a variant's own tiers use the item's mode unless it sets one", () => {
  const t2 = [{ minQty: 1, maxQty: 9, unitPrice: 40 }, { minQty: 10, maxQty: null, unitPrice: 30 }];
  const it = { regularPrice: 10, priceTierMode: "graduated", options: [{ key: "p", values: [{ id: "a" }] }], optionVariants: [{ id: "v1", choice: { p: "a" }, price: 40, priceTiers: t2 }] };
  assert.equal(priceFor(it, "v1", 10, NOW).total, 9 * 40 + 30);
  assert.equal(priceFor({ ...it, optionVariants: [{ ...it.optionVariants[0], priceTierMode: "whole" }] }, "v1", 10, NOW).total, 300);
});
