import { test } from "node:test";
import assert from "node:assert/strict";
import { blankItem } from "@epicmkt/shared";
import { validateItem, errorFor } from "./schema.js";

const ok = (o, opts) => validateItem(blankItem({ name: "Haircut", ...o }), opts);

test("a named row with no price is saveable but not strict-valid", () => {
  assert.equal(ok({}).ok, true);
  assert.match(ok({}, { strict: true }).errors.price, /Enter a price/);
  assert.equal(ok({ priceType: "contact" }, { strict: true }).ok, true);
  assert.equal(ok({ priceType: "free" }, { strict: true }).ok, true);
});

test("name rules", () => {
  assert.match(validateItem(blankItem({ name: "A" })).errors.name, /at least 2/);
  assert.match(validateItem(blankItem({ name: "x".repeat(81) })).errors.name, /80/);
  assert.equal(validateItem(blankItem({ name: "x".repeat(80) })).ok, true);
});

test("prices are whole KES, non-negative and bounded", () => {
  assert.match(ok({ price: 10.5 }).errors.price, /Whole shillings/);
  assert.match(ok({ price: -1 }).errors.price, /negative/);
  assert.match(ok({ price: 10_000_001 }).errors.price, /too large/);
  assert.equal(ok({ price: 0 }).ok, true);
});

test("ranges and sales", () => {
  assert.match(ok({ priceType: "range", price: 200, priceMax: 200 }).errors.priceMax, /higher/);
  assert.match(ok({ priceType: "range", price: 100 }, { strict: true }).errors.priceMax, /highest/);
  assert.equal(ok({ priceType: "range", price: 100, priceMax: 200 }, { strict: true }).ok, true);
  assert.match(ok({ price: 100, salePrice: 100 }).errors.salePrice, /lower/);
  assert.match(ok({ salePrice: 50 }).errors.salePrice, /normal price first/);
  assert.match(ok({ priceType: "range", price: 100, priceMax: 200, salePrice: 50 }).errors.salePrice, /fixed or starting/);
  assert.match(ok({ price: 100, saleStarts: "2026-11-01", saleEnds: "2026-10-01", salePrice: 50 }).errors.saleEnds, /before the start/);
  assert.match(ok({ price: 100, saleStarts: "2026-11-01" }).errors.salePrice, /sale price/);
  assert.equal(ok({ price: 100, salePrice: 80, saleStarts: "2026-11-01", saleEnds: "2026-11-30" }).ok, true);
});

test("availability extras are required only in strict mode", () => {
  assert.equal(ok({ availability: "seasonal" }).ok, true);
  const strict = ok({ availability: "seasonal", priceType: "contact" }, { strict: true });
  assert.ok(strict.errors.seasonFrom && strict.errors.seasonTo);
  assert.match(ok({ availability: "seasonal", seasonFrom: "2026-12-10", seasonTo: "2026-12-01" }).errors.seasonTo, /before/);
  assert.match(ok({ availability: "coming_soon", priceType: "free" }, { strict: true }).errors.expectedDate, /expected/);
  assert.match(ok({ trackStock: true, priceType: "free" }, { strict: true }).errors.stockCount, /how many/);
  assert.match(ok({ trackStock: true, stockCount: 1.5 }).errors.stockCount, /Whole/);
  assert.match(ok({ trackStock: true, stockCount: -2 }).errors.stockCount, /negative/);
});

test("variants, specs, tags and nested service fields report precise paths", () => {
  const r = ok({
    variants: [{ id: "a", label: "", price: null }],
    specs: [{ label: "Size", value: "" }],
    searchTags: Array.from({ length: 16 }, (_, i) => `t${i}`),
    service: { ...blankItem().service, duration: 0 },
  });
  assert.ok(r.errors["variants.0.label"]);
  assert.ok(r.errors["variants.0.price"]);
  assert.ok(r.errors["specs.0.value"]);
  assert.match(r.errors.searchTags, /15/);
  assert.match(r.errors["service.duration"], /1 minute/);
  assert.ok(errorFor(r.errors, "variants"));
  assert.equal(errorFor(r.errors, "name"), "");
});

test("template extras use the shared validator but are never required per item", () => {
  const fields = [
    { key: "booking", label: "Booking", type: "select", required: true, options: [{ value: "walk-in", label: "Walk-in" }] },
    { key: "chairs", label: "Chairs", type: "number" },
  ];
  assert.equal(ok({ attributes: {} }, { fields }).ok, true);
  assert.match(ok({ attributes: { booking: "nope" } }, { fields }).errors["attributes.booking"], /options/);
  assert.match(ok({ attributes: { chairs: -1 } }, { fields }).errors["attributes.chairs"], /valid number/);
  assert.match(ok({ attributes: { zzz: 1 } }, { fields }).errors["attributes.zzz"], /Not part/);
});
