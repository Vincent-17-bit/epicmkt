import { test } from "node:test";
import assert from "node:assert/strict";
import { validateItemForm, emptyItemForm, formFromItem, SPEC_LIMITS, SPEC_GROUPS, SPEC_PRESETS, DETAIL_LIMITS, SPEC_DEFAULT_GROUP, storedItemDetails } from "./itemForm.js";

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
const oldShape = { name: "Fade cut", description: "", section: "", unit: "", priceType: "fixed", price: "500", priceMax: "", salePrice: "", availability: "available", trackStock: false, stockCount: "", lowStockThreshold: "3", showStockCount: false };

test("details: a form without the new fields saves exactly as before", () => {
  const r = validateItemForm(oldShape);
  assert.equal(r.ok, true);
  for (const k of ["brand", "shortDescription", "highlights", "includes", "terms", "packSize", "specs"]) assert.equal(k in r.value, false, k);
});

test("details: an empty new form sends empty values", () => {
  const r = validateItemForm(base);
  assert.deepEqual([r.value.brand, r.value.shortDescription, r.value.terms, r.value.packSize], ["", "", "", ""]);
  assert.deepEqual([r.value.highlights, r.value.includes], [[], []]);
});

test("details: text limits are errors on the field", () => {
  const r = details({ brand: "b".repeat(61), shortDescription: "s".repeat(141), terms: "t".repeat(501), packSize: "p".repeat(41), description: "d".repeat(2001) });
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ["brand", "description", "packSize", "shortDescription", "terms"]);
  const edge = details({ brand: " Nike ", shortDescription: "s".repeat(140), terms: "t".repeat(500), packSize: "6 pieces" });
  assert.deepEqual([edge.ok, edge.value.brand, edge.value.packSize], [true, "Nike", "6 pieces"]);
});

test("details: highlights keep order, drop blank rows, and need text", () => {
  const ok = details({ highlights: [{ title: " Soft ", text: " Cotton " }, { title: "", text: "" }, { title: "", text: "Machine washable" }] });
  assert.deepEqual(ok.value.highlights, [{ title: "Soft", text: "Cotton" }, { text: "Machine washable" }]);
  const bad = details({ highlights: [{ title: "Lead", text: "" }, { title: "x".repeat(41), text: "ok" }, { title: "", text: "t".repeat(201) }] });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors.highlights), ["0", "1", "2"]);
  assert.ok(bad.errors.highlights[0].text && bad.errors.highlights[1].title && bad.errors.highlights[2].text);
});

test("details: at most 8 highlights and 10 included lines", () => {
  const eight = Array.from({ length: DETAIL_LIMITS.highlightRows }, (_, i) => ({ title: "", text: `Point ${i}` }));
  assert.equal(details({ highlights: eight }).ok, true);
  assert.ok(details({ highlights: [...eight, { title: "", text: "One more" }] }).errors.highlightsCount);
  const ten = Array.from({ length: DETAIL_LIMITS.includeRows }, (_, i) => `Item ${i}`);
  assert.equal(details({ includes: ten }).ok, true);
  assert.ok(details({ includes: [...ten, "One more"] }).errors.includesCount);
});

test("details: included lines are trimmed, blanks dropped, long lines flagged by row", () => {
  assert.deepEqual(details({ includes: [" Charger ", "", "  ", "Cable"] }).value.includes, ["Charger", "Cable"]);
  const bad = details({ includes: ["ok", "x".repeat(81)] });
  assert.deepEqual(Object.keys(bad.errors.includes), ["1"]);
});

test("details: an item with the new fields round trips through the form", () => {
  const item = { name: "Shirt", priceType: "fixed", price: 900, availability: "available", brand: "Nike", shortDescription: "Light", highlights: [{ title: "Soft", text: "Cotton" }, { text: "Cheap" }], includes: ["Tag"], terms: "No returns", packSize: "1", specs: [{ group: "Measurements", label: "Size", value: "M" }] };
  const f = formFromItem(item);
  assert.deepEqual(f.highlights, [{ title: "Soft", text: "Cotton" }, { title: "", text: "Cheap" }]);
  const v = validateItemForm(f).value;
  assert.deepEqual([v.brand, v.shortDescription, v.includes, v.terms, v.packSize], ["Nike", "Light", ["Tag"], "No returns", "1"]);
  assert.deepEqual(v.highlights, [{ title: "Soft", text: "Cotton" }, { text: "Cheap" }]);
  const bare = formFromItem({ name: "Plain", priceType: "free", availability: "available" });
  assert.deepEqual([bare.brand, bare.shortDescription, bare.highlights, bare.includes, bare.terms, bare.packSize], ["", "", [], [], "", ""]);
});

test("spec presets: valid labels and groups, no duplicates", () => {
  assert.equal(SPEC_PRESETS.length, 10);
  const labels = SPEC_PRESETS.map((p) => p.label.toLowerCase());
  assert.equal(new Set(labels).size, labels.length);
  for (const p of SPEC_PRESETS) {
    assert.ok(SPEC_GROUPS.includes(p.group), p.label);
    assert.ok(p.label.length <= SPEC_LIMITS.label, p.label);
  }
  assert.equal(validateItemForm({ ...base, specs: SPEC_PRESETS.map((p) => ({ group: p.group, label: p.label, value: "x" })) }).ok, true);
});

test("specs: every limit is an error on its own row, and the count limit is on the list", () => {
  const r = specs([{ label: "l".repeat(41), value: "v" }, { label: "ok", value: "v".repeat(121) }, { group: "Nope", label: "Size", value: "M" }, { label: "Fine", value: "Fine" }]);
  assert.equal(r.ok, false);
  assert.deepEqual(Object.keys(r.errors.specs), ["0", "1", "2"]);
  assert.ok(r.errors.specs[0].label && !r.errors.specs[0].value);
  assert.ok(r.errors.specs[1].value && !r.errors.specs[1].label);
  assert.ok(r.errors.specs[2].group);
  const edge = specs([{ label: "l".repeat(40), value: "v".repeat(120) }]);
  assert.equal(edge.ok, true);
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ label: `Label ${i}`, value: "v" }));
  assert.equal(specs(rows(SPEC_LIMITS.rows)).ok, true);
  assert.ok(specs(rows(SPEC_LIMITS.rows + 1)).errors.specsCount);
});

test("specs: row errors keep the row's own index even when blank rows and duplicates come before it", () => {
  const r = specs([{ label: "", value: "" }, { label: "Size", value: "M" }, { label: "size", value: "L" }, { label: "Color", value: "" }]);
  assert.deepEqual(Object.keys(r.errors.specs), ["3"]);
  assert.equal(r.errors.specs[3].value, "Add a value.");
  const ok = specs([{ label: "", value: "" }, { label: "Size", value: "M" }, { label: "size", value: "L" }]);
  assert.deepEqual(ok.value.specs, [{ label: "Size", value: "M" }]);
});

test("details: highlight and include errors use the row's own index after blank rows", () => {
  const r = details({ highlights: [{ title: "", text: "" }, { title: "Lead", text: "" }], includes: ["", "x".repeat(81)] });
  assert.deepEqual([Object.keys(r.errors.highlights), Object.keys(r.errors.includes)], [["1"], ["1"]]);
});

test("storedItemDetails: keeps only the keys that were sent, trimmed, empty text as null", () => {
  assert.deepEqual(storedItemDetails({}), { ok: true, value: {} });
  const r = storedItemDetails({ brand: " Nike ", terms: "  ", highlights: [{ title: " ", text: "Soft" }, { title: "Lead", text: "Warm" }], includes: [" A "], specs: [{ label: "Size", value: "M" }] });
  assert.deepEqual(r.value, { brand: "Nike", terms: null, highlights: [{ text: "Soft" }, { title: "Lead", text: "Warm" }], includes: ["A"], specs: [{ group: SPEC_DEFAULT_GROUP, label: "Size", value: "M" }] });
  assert.deepEqual(storedItemDetails({ specs: [{ label: " Size ", value: " M " }], highlights: [{ text: " Soft " }] }).value, { specs: [{ group: SPEC_DEFAULT_GROUP, label: " Size ", value: " M " }], highlights: [{ text: " Soft " }] });
  assert.deepEqual(storedItemDetails({ highlights: null, includes: null, specs: null }).value, { highlights: [], includes: [], specs: [] });
});

test("storedItemDetails: refuses what the database refuses", () => {
  const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));
  const bad = [
    { brand: "b".repeat(61) }, { shortDescription: "s".repeat(141) }, { terms: "t".repeat(501) }, { packSize: "p".repeat(41) }, { brand: 5 },
    { highlights: many(9, (i) => ({ text: `P${i}` })) }, { highlights: [{ text: "" }] }, { highlights: [{ title: "t".repeat(41), text: "x" }] }, { highlights: [{ text: "t".repeat(201) }] }, { highlights: [{ text: "x", other: 1 }] }, { highlights: ["x"] },
    { includes: many(11, (i) => `L${i}`) }, { includes: [""] }, { includes: ["x".repeat(81)] }, { includes: [5] },
    { specs: many(21, (i) => ({ label: `L${i}`, value: "v" })) }, { specs: [{ label: "", value: "v" }] }, { specs: [{ label: "l", value: "" }] }, { specs: [{ group: "Nope", label: "l", value: "v" }] }, { specs: [{ label: "l", value: "v", extra: 1 }] },
  ];
  for (const f of bad) assert.deepEqual(storedItemDetails(f), { ok: false }, JSON.stringify(f).slice(0, 60));
});

test("storedItemDetails: accepts everything validateItemForm lets through", () => {
  const form = { ...base, brand: " Ikea ", shortDescription: "S", terms: "T", packSize: "6", highlights: [{ title: " Soft ", text: " Cotton " }, { title: "", text: "" }], includes: [" Cushions ", ""], specs: [{ label: "Size", value: "M" }, { label: "", value: "" }, { group: "Measurements", label: "Weight", value: "9 kg" }] };
  const v = validateItemForm(form).value;
  const stored = storedItemDetails(v);
  assert.equal(stored.ok, true);
  assert.deepEqual(stored.value.highlights, v.highlights);
  assert.deepEqual(stored.value.includes, v.includes);
  assert.deepEqual(stored.value.specs.map(({ label, value }) => ({ label, value })), v.specs.map(({ label, value }) => ({ label, value })));
});
