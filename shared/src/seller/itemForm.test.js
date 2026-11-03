import { test } from "node:test";
import assert from "node:assert/strict";
import { validateItemForm, emptyItemForm, formFromItem, SPEC_LIMITS, ITEM_DETAIL_LIMITS, SPEC_DEFAULT_GROUP, storedItemDetails, storedVariants, cleanVariants, VARIANT_LIMITS } from "./itemForm.js";

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

test("details: row errors keep the row's own index after blank rows and duplicates", () => {
  const form = { ...emptyItemForm(), name: "Sofa", price: "9000" };
  const specs = validateItemForm({ ...form, specs: [{ label: "", value: "" }, { label: "Size", value: "M" }, { label: "size", value: "L" }, { label: "Color", value: "" }] });
  assert.deepEqual(Object.keys(specs.errors.specs), ["3"]);
  const rows = validateItemForm({ ...form, highlights: [{ title: "", text: "" }, { title: "Lead", text: "" }], includes: ["", "x".repeat(ITEM_DETAIL_LIMITS.includes.text + 1)] });
  assert.deepEqual([Object.keys(rows.errors.highlights), Object.keys(rows.errors.includes)], [["1"], ["1"]]);
});

test("storedItemDetails: keeps only the keys that were sent, empty text as null", () => {
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
  const form = { ...emptyItemForm(), name: "Sofa", price: "9000", brand: " Ikea ", shortDescription: "S", terms: "T", packSize: "6", highlights: [{ title: " Soft ", text: " Cotton " }, { title: "", text: "" }], includes: [" Cushions ", ""], specs: [{ label: "Size", value: "M" }, { label: "", value: "" }, { group: "Measurements", label: "Weight", value: "9 kg" }] };
  const v = validateItemForm(form).value;
  const stored = storedItemDetails(v);
  assert.equal(stored.ok, true);
  assert.deepEqual(stored.value.highlights, v.highlights);
  assert.deepEqual(stored.value.includes, v.includes);
  assert.deepEqual(stored.value.specs.map(({ label, value }) => ({ label, value })), v.specs.map(({ label, value }) => ({ label, value })));
});

const rows = (...r) => r.map(([id, label, price, stock = ""]) => ({ id, label, price, stock }));

test("variant rows from the form become stored variants, in order, with stock or null", () => {
  const r = validateItemForm({ ...base, variants: rows(["a", " Small ", "500", "4"], ["b", "Large", "800.50", ""]) });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.variants, [{ id: "a", label: "Small", price: 500, stock: 4 }, { id: "b", label: "Large", price: 800.5, stock: null }]);
});

test("a form without variants leaves them out, so saving never wipes stored ones", () => {
  const { variants, ...form } = base;
  const r = validateItemForm(form);
  assert.equal(r.ok, true);
  assert.equal("variants" in r.value, false);
});

test("variant mistakes are reported per row", () => {
  const r = validateItemForm({ ...base, variants: rows(["a", "", "x"], ["b", "Big", "", "1.5"], ["c", "BIG", "5"]) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors.variants[0], { label: "Enter a name.", price: "Enter a number such as 1200." });
  assert.deepEqual(r.errors.variants[1], { price: "Enter a price.", stock: "Enter a whole number, or leave it empty." });
  assert.deepEqual(r.errors.variants[2], { label: "Two options cannot share a name." });
});

test("options need a fixed or starting price and at most ten", () => {
  assert.ok(validateItemForm({ ...base, priceType: "contact", variants: rows(["a", "S", "5"]) }).errors.variantsCount);
  assert.ok(validateItemForm({ ...base, variants: Array.from({ length: VARIANT_LIMITS.rows + 1 }, (_, i) => ({ id: `v${i}`, label: `L${i}`, price: "5", stock: "" })) }).errors.variantsCount);
  assert.equal(validateItemForm({ ...base, priceType: "from", variants: rows(["a", "S", "5"]) }).ok, true);
});

test("stored variants are checked the way the database checks them", () => {
  assert.deepEqual(storedVariants(null), { ok: true, value: [] });
  assert.deepEqual(storedVariants([{ id: "a", label: " S ", price: 5, stock: 0 }]).value, [{ id: "a", label: "S", price: 5, stock: 0 }]);
  for (const bad of [
    "x", [{ id: "A", label: "S", price: 5 }], [{ id: "a", label: "", price: 5 }], [{ id: "a", label: "S", price: -1 }], [{ id: "a", label: "S", price: 1.234 }],
    [{ id: "a", label: "S", price: 5, stock: 1.5 }], [{ id: "a", label: "S", price: 5, stock: -1 }], [{ id: "a", label: "S", price: 5, extra: 1 }],
    [{ id: "a", label: "S", price: 5 }, { id: "a", label: "T", price: 5 }], [{ id: "a", label: "S", price: 5 }, { id: "b", label: "s", price: 5 }],
    Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, label: `L${i}`, price: 1 }))
  ]) assert.equal(storedVariants(bad).ok, false, JSON.stringify(bad));
  assert.equal(storedItemDetails({ variants: [{ id: "a", label: "S", price: 5 }] }).ok, true);
  assert.equal(storedItemDetails({ variants: [{ id: "a" }] }).ok, false);
});

test("the form is filled from stored variants as text", () => {
  const form = formFromItem({ name: "x", priceType: "fixed", price: 5, availability: "available", variants: [{ id: "a", label: "S", price: 5, stock: 3 }, { id: "b", label: "L", price: 9 }] });
  assert.deepEqual(form.variants, rows(["a", "S", "5", "3"], ["b", "L", "9", ""]));
});
