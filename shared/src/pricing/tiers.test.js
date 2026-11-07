import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTiers, priceTiered, nextTierHint, priceFor, toMinor, kesText } from "./tiers.js";
import { getFixture } from "../contracts/index.js";

const printing = [
  { minQty: 1, maxQty: 10, unitPrice: 10 },
  { minQty: 11, maxQty: 100, unitPrice: 7 },
  { minQty: 101, maxQty: null, unitPrice: 5 }
];

const KES = (n) => n * 100;

test("whole mode: the tier price applies to every unit, at each boundary", () => {
  const total = (qty) => priceTiered({ tiers: printing, mode: "whole", qty }).total;
  assert.equal(total(1), KES(10));
  assert.equal(total(10), KES(100));
  assert.equal(total(11), KES(77));
  assert.equal(total(100), KES(700));
  assert.equal(total(101), KES(505));
  assert.equal(priceTiered({ tiers: printing, mode: "whole", qty: 11 }).unit, KES(7));
  assert.equal(priceTiered({ tiers: printing, mode: "whole", qty: 101 }).unit, KES(5));
});

test("graduated mode: each band is charged at its own price, at each boundary", () => {
  const total = (qty) => priceTiered({ tiers: printing, mode: "graduated", qty }).total;
  assert.equal(total(1), KES(10));
  assert.equal(total(10), KES(100));
  assert.equal(total(11), KES(107));
  assert.equal(total(100), KES(730));
  assert.equal(total(101), KES(735));
});

test("graduated mode lists its bands and the unit is the average", () => {
  const r = priceTiered({ tiers: printing, mode: "graduated", qty: 101 });
  assert.deepEqual(r.bands.map((b) => [b.from, b.qty, b.unit]), [[1, 10, KES(10)], [11, 90, KES(7)], [101, 1, KES(5)]]);
  assert.equal(r.marginal, KES(5));
  assert.equal(r.unit, Math.round(KES(735) / 101));
});

test("the next tier hint says how many more and at what price", () => {
  assert.equal(nextTierHint(printing, 8).text, "Add 3 more for KES 7 each");
  assert.equal(nextTierHint(printing, 10).text, "Add 1 more for KES 7 each");
  assert.equal(nextTierHint(printing, 11).text, "Add 90 more for KES 5 each");
  assert.equal(nextTierHint(printing, 101), null);
  assert.equal(priceTiered({ tiers: printing, qty: 8 }).next.more, 3);
  assert.equal(kesText(750), "KES 7.50");
});

test("a single tier is valid and has no hint", () => {
  const one = [{ minQty: 1, maxQty: null, unitPrice: 12 }];
  assert.ok(validateTiers(one).ok);
  assert.equal(priceTiered({ tiers: one, qty: 3 }).total, KES(36));
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
  bad([{ minQty: 1, maxQty: null, unitPrice: 1.005 }]);
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

const flash = (extra = {}) => ({ discountType: "percent", discountValue: 20, startsAt: "2026-11-06T00:00:00Z", endsAt: "2026-11-07T00:00:00Z", ...extra });
const NOW = Date.parse("2026-11-06T12:00:00Z");
const item = (extra = {}) => ({ regularPrice: 10, priceTiers: printing, priceTierMode: "whole", ...extra });

test("priceFor with tiers and no flash", () => {
  const r = priceFor(item(), null, 11, NOW);
  assert.deepEqual([r.unit, r.total, r.was, r.source], [KES(7), KES(77), KES(77), "tier"]);
  assert.equal(r.next.text, "Add 90 more for KES 5 each");
});

test("a live percent flash discounts each tier price in whole mode", () => {
  const r = priceFor(item({ flash: flash() }), null, 11, NOW);
  assert.deepEqual([r.unit, r.total, r.was, r.source], [560, 6160, KES(77), "flash"]);
  assert.equal(r.next.unit, 400);
});

test("a live percent flash discounts each band in graduated mode", () => {
  const r = priceFor(item({ priceTierMode: "graduated", flash: flash() }), null, 11, NOW);
  assert.equal(r.total, 8000 + 560);
  assert.equal(r.was, KES(107));
  assert.equal(r.source, "flash");
});

test("amount off never goes below zero and sale price never raises a tier price", () => {
  assert.equal(priceFor(item({ flash: flash({ discountType: "amount_off", discountValue: 8 }) }), null, 11, NOW).unit, 0);
  assert.equal(priceFor(item({ flash: flash({ discountType: "amount_off", discountValue: 2 }) }), null, 11, NOW).unit, 500);
  assert.equal(priceFor(item({ flash: flash({ discountType: "sale_price", discountValue: 6 }) }), null, 11, NOW).unit, 600);
  const r = priceFor(item({ flash: flash({ discountType: "sale_price", discountValue: 6 }) }), null, 101, NOW);
  assert.deepEqual([r.unit, r.source], [500, "tier"]);
});

test("a flash outside its window or before it starts is ignored", () => {
  assert.equal(priceFor(item({ flash: flash() }), null, 11, Date.parse("2026-11-07T00:00:00Z")).source, "tier");
  assert.equal(priceFor(item({ flash: flash() }), null, 11, Date.parse("2026-11-05T12:00:00Z")).source, "tier");
  assert.equal(priceFor(item({ flash: flash() }), null, 11, new Date(NOW)).source, "flash");
});

test("without tiers priceFor uses the sale and flash prices", () => {
  const plain = { regularPrice: 100 };
  assert.deepEqual(pick(priceFor(plain, null, 2, NOW)), [KES(100), KES(200), KES(200), "regular"]);
  assert.deepEqual(pick(priceFor({ ...plain, salePrice: 80 }, null, 2, NOW)), [KES(80), KES(160), KES(200), "sale"]);
  assert.deepEqual(pick(priceFor({ ...plain, salePrice: 80, flash: flash() }, null, 2, NOW)), [KES(80), KES(160), KES(200), "sale"]);
  assert.deepEqual(pick(priceFor({ ...plain, salePrice: 90, flash: flash() }, null, 1, NOW)), [KES(80), KES(80), KES(100), "flash"]);
  assert.throws(() => priceFor({}, null, 1, NOW), RangeError);
});

const pick = (r) => [r.unit, r.total, r.was, r.source];

test("the printing fixture: A4 uses the item tiers, A3 its own", () => {
  const fx = getFixture("fx-printing").detail;
  const a4 = priceFor(fx, { choice: { paper: "a4" } }, 50, NOW);
  assert.equal(a4.unit, KES(15));
  const a3 = priceFor(fx, { choice: { paper: "a3" } }, 200, NOW);
  assert.equal(a3.unit, KES(22));
});

test("a variant's own price is used when it has no tiers", () => {
  const it = { regularPrice: 10, optionVariants: [{ id: "v1", choice: { size: "l" }, price: 30, salePrice: 25 }] };
  assert.deepEqual(pick(priceFor(it, { variantId: "v1" }, 2, NOW)), [KES(25), KES(50), KES(60), "sale"]);
});

test("toMinor rounds floating point noise", () => {
  assert.equal(toMinor(0.07), 7);
  assert.equal(toMinor(19.99), 1999);
});
