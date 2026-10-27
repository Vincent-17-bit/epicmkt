import { test } from "node:test";
import assert from "node:assert/strict";
import { validateItemForm, emptyItemForm, formFromItem, SPEC_LIMITS, ITEM_DETAIL_LIMITS } from "./itemForm.js";

const base = { ...emptyItemForm(), name: "Fade cut", price: "500" };

test("a valid fixed item", () => {
  const r = validateItemForm(base);
  assert.equal(r.ok, true);
  assert.deepEqual([r.value.price, r.value.priceMax, r.value.salePrice], [500, null, null]);
});

test("name, price and sale price rules", () => {
  assert.equal(validateItemForm({ ...base, name: "x" }).errors.name.length > 0, true);
  assert.ok(validateItemForm({ ...base, price: "" }).errors.price);
  assert.ok(validateItemForm({ ...base, price: "abc" }).errors.price);
  assert.ok(validateItemForm({ ...base, salePrice: "500" }).errors.salePrice);
  assert.equal(validateItemForm({ ...base, salePrice: "400" }).value.salePrice, 400);
  assert.ok(validateItemForm({ ...base, unit: "u".repeat(31) }).errors.unit);
});

test("range, free and contact", () => {
  assert.ok(validateItemForm({ ...base, priceType: "range" }).errors.priceMax);
  assert.ok(validateItemForm({ ...base, priceType: "range", priceMax: "100" }).errors.priceMax);
  assert.equal(validateItemForm({ ...base, priceType: "range", priceMax: "900" }).value.priceMax, 900);
  const free = validateItemForm({ ...base, priceType: "free", price: "" });
  assert.equal(free.ok, true);
  assert.equal(free.value.price, null);
  assert.equal(validateItemForm({ ...base, priceType: "contact", price: "", salePrice: "5" }).value.salePrice, null);
});

test("form from an item and back", () => {
  const f = formFromItem({ name: "A cut", description: null, section: null, unit: null, priceType: "fixed", price: 300, priceMax: null, salePrice: 250, availability: "available" });
  assert.equal(f.price, "300");
  assert.equal(validateItemForm(f).value.salePrice, 250);
});

test("counting stock: a number is required, and it is optional otherwise", () => {
  assert.equal(validateItemForm({ ...base, trackStock: false, stockCount: "junk" }).ok, true);
  const noCount = validateItemForm({ ...base, trackStock: true, stockCount: "" });
  assert.equal(noCount.ok, false);
  assert.ok(noCount.errors.stockCount);
  assert.ok(validateItemForm({ ...base, trackStock: true, stockCount: "-2" }).errors.stockCount);
  assert.ok(validateItemForm({ ...base, trackStock: true, stockCount: "4", lowStockThreshold: "x" }).errors.lowStockThreshold);
  const ok = validateItemForm({ ...base, trackStock: true, stockCount: "0", lowStockThreshold: "5", showStockCount: true });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.value.trackStock, ok.value.stockCount, ok.value.lowStockThreshold, ok.value.showStockCount], [true, 0, 5, true]);
});

test("without counting, the stock fields are cleared and the chosen status is kept", () => {
  const r = validateItemForm({ ...base, availability: "limited_stock", trackStock: false, stockCount: "9", showStockCount: true });
  assert.deepEqual([r.value.trackStock, r.value.stockCount, r.value.showStockCount, r.value.availability], [false, null, false, "limited_stock"]);
});

test("'unavailable' is not offered; the form shows it as out of stock", () => {
  assert.equal(validateItemForm({ ...base, availability: "unavailable" }).ok, false);
  const f = formFromItem({ name: "Old", priceType: "fixed", price: 1, availability: "unavailable", trackStock: true, stockCount: 0, lowStockThreshold: 4, showStockCount: true });
  assert.deepEqual([f.availability, f.trackStock, f.stockCount, f.lowStockThreshold, f.showStockCount], ["out_of_stock", true, "0", "4", true]);
});

const specs = (rows) => validateItemForm({ ...base, specs: rows });

test("specs: trimmed, blank rows dropped, order kept", () => {
  const r = specs([{ label: "  Brand ", value: " Nike " }, { label: "", value: "  " }, { label: "Size", value: "42" }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.specs, [{ label: "Brand", value: "Nike" }, { label: "Size", value: "42" }]);
  assert.deepEqual(specs([]).value.specs, []);
});

test("specs: duplicate labels are dropped case-insensitively, first kept", () => {
  const r = specs([{ label: "Colour", value: "Red" }, { label: "size", value: "M" }, { label: " COLOUR ", value: "Blue" }, { label: "Size", value: "L" }]);
  assert.deepEqual(r.value.specs, [{ label: "Colour", value: "Red" }, { label: "size", value: "M" }]);
});

test("specs: a one-sided row is an error on that row index", () => {
  const r = specs([{ label: "Brand", value: "Nike" }, { label: "Size", value: "" }, { label: "", value: "42" }, { label: "", value: "" }]);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors.specs), ["1", "2"]);
  assert.ok(r.errors.specs[1].value);
  assert.equal(r.errors.specs[1].label, undefined);
  assert.ok(r.errors.specs[2].label);
  assert.equal(r.errors.specs[2].value, undefined);
});

test("specs: label, value and row limits", () => {
  assert.equal(specs([{ label: "l".repeat(SPEC_LIMITS.label), value: "v".repeat(SPEC_LIMITS.value) }]).ok, true);
  const long = specs([{ label: "a", value: "b" }, { label: "l".repeat(SPEC_LIMITS.label + 1), value: "v".repeat(SPEC_LIMITS.value + 1) }]);
  assert.deepEqual(Object.keys(long.errors.specs), ["1"]);
  assert.ok(long.errors.specs[1].label);
  assert.ok(long.errors.specs[1].value);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `L${i}`, value: "v" }));
  assert.equal(specs(rows(SPEC_LIMITS.rows)).ok, true);
  assert.ok(specs(rows(SPEC_LIMITS.rows + 1)).errors.specsCount);
  const dupes = [...rows(SPEC_LIMITS.rows), { label: "l0", value: "x" }];
  assert.equal(specs(dupes).ok, true);
});

test("specs are optional: none given, none returned, and the form round-trips", () => {
  const { specs: omitted, ...noSpecs } = base;
  assert.equal("specs" in validateItemForm(noSpecs).value, false);
  assert.deepEqual(emptyItemForm().specs, []);
  const plain = formFromItem({ name: "A cut", priceType: "fixed", price: 300, availability: "available" });
  assert.deepEqual(plain.specs, []);
  const f = formFromItem({ name: "Shoe", priceType: "fixed", price: 300, availability: "available", specs: [{ label: "Size", value: "42" }] });
  assert.deepEqual(validateItemForm(f).value.specs, [{ label: "Size", value: "42" }]);
});

test("specs: a group is kept when present, must be a known group, and is optional", () => {
  const r = specs([{ group: "Measurements", label: "Width", value: "20 cm" }, { label: "Size", value: "42" }]);
  assert.deepEqual(r.value.specs, [{ group: "Measurements", label: "Width", value: "20 cm" }, { label: "Size", value: "42" }]);
  const bad = specs([{ group: "Elsewhere", label: "Width", value: "20 cm" }]);
  assert.ok(bad.errors.specs[0].group);
  assert.equal(bad.errors.specs[0].label, undefined);
  const f = formFromItem({ name: "Shoe", priceType: "fixed", price: 300, availability: "available", specs: [{ group: "User guide", label: "Wash", value: "Cold" }] });
  assert.deepEqual(validateItemForm(f).value.specs, [{ group: "User guide", label: "Wash", value: "Cold" }]);
});

const details = (extra) => validateItemForm({ ...base, ...extra });
const without = (...keys) => Object.fromEntries(Object.entries(base).filter(([k]) => !keys.includes(k)));

test("details: text fields are trimmed, an empty one becomes null, and a long one is refused", () => {
  const ok = details({ brand: "  Nike ", shortDescription: "", packSize: "Box of 6", terms: "Deposit first" });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.value.brand, ok.value.shortDescription, ok.value.packSize, ok.value.terms], ["Nike", null, "Box of 6", "Deposit first"]);
  for (const key of ["brand", "shortDescription", "packSize", "terms"]) {
    assert.equal(details({ [key]: "x".repeat(ITEM_DETAIL_LIMITS[key]) }).ok, true, key);
    assert.ok(details({ [key]: "x".repeat(ITEM_DETAIL_LIMITS[key] + 1) }).errors[key], key);
  }
});

test("details: a field the form does not carry is left out, so saving cannot wipe it", () => {
  const r = validateItemForm(without("brand", "shortDescription", "packSize", "terms", "includes", "highlights"));
  assert.equal(r.ok, true);
  for (const key of ["brand", "shortDescription", "packSize", "terms", "includes", "highlights"]) assert.equal(key in r.value, false, key);
  assert.deepEqual(details({}).value.includes, []);
  assert.deepEqual(details({}).value.highlights, []);
});

test("includes: blank lines are dropped, lines are trimmed, and the limits hold", () => {
  assert.deepEqual(details({ includes: [" Charger ", "", "  ", "Box"] }).value.includes, ["Charger", "Box"]);
  const long = details({ includes: ["ok", "i".repeat(ITEM_DETAIL_LIMITS.includes.text + 1)] });
  assert.deepEqual(Object.keys(long.errors.includes), ["1"]);
  const rows = (n) => Array.from({ length: n }, (_, i) => `Item ${i}`);
  assert.equal(details({ includes: rows(ITEM_DETAIL_LIMITS.includes.rows) }).ok, true);
  assert.ok(details({ includes: rows(ITEM_DETAIL_LIMITS.includes.rows + 1) }).errors.includesCount);
});

test("highlights: the text is required, the title is optional, and the limits hold", () => {
  const r = details({ highlights: [{ title: " Fast ", text: " Charges in 20 minutes " }, { title: "", text: "No title" }, { title: "", text: "" }] });
  assert.deepEqual(r.value.highlights, [{ title: "Fast", text: "Charges in 20 minutes" }, { text: "No title" }]);
  const missing = details({ highlights: [{ title: "Only a title", text: "" }] });
  assert.equal(missing.errors.highlights[0].text, "Add the highlight text.");
  const long = details({ highlights: [{ title: "t".repeat(ITEM_DETAIL_LIMITS.highlights.title + 1), text: "x".repeat(ITEM_DETAIL_LIMITS.highlights.text + 1) }] });
  assert.ok(long.errors.highlights[0].title);
  assert.ok(long.errors.highlights[0].text);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ text: `Point ${i}` }));
  assert.equal(details({ highlights: rows(ITEM_DETAIL_LIMITS.highlights.rows) }).ok, true);
  assert.ok(details({ highlights: rows(ITEM_DETAIL_LIMITS.highlights.rows + 1) }).errors.highlightsCount);
});

test("details: the form loads an item's details and sends them back unchanged", () => {
  const item = { name: "Cake", priceType: "fixed", price: 900, availability: "available", brand: "Acme", shortDescription: "Fresh", packSize: "Box of 6", terms: "Order ahead", includes: ["Candles"], highlights: [{ title: "Soft", text: "Baked today" }, { text: "Nut free" }] };
  const f = formFromItem(item);
  assert.deepEqual([f.brand, f.shortDescription, f.packSize, f.terms, f.includes], ["Acme", "Fresh", "Box of 6", "Order ahead", ["Candles"]]);
  assert.deepEqual(f.highlights, [{ title: "Soft", text: "Baked today" }, { title: "", text: "Nut free" }]);
  const v = validateItemForm(f).value;
  assert.deepEqual([v.brand, v.packSize, v.terms, v.includes], ["Acme", "Box of 6", "Order ahead", ["Candles"]]);
  assert.deepEqual(v.highlights, item.highlights);
  const bare = formFromItem({ name: "A cut", priceType: "fixed", price: 300, availability: "available" });
  assert.deepEqual([bare.brand, bare.shortDescription, bare.packSize, bare.terms, bare.includes, bare.highlights], ["", "", "", "", [], []]);
});
