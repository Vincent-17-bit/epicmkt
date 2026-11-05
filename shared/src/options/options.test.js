import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateCombinations, findDefaultVariant, cheapestInStock, payPrice, dependentValues, reconcileSelection, variantForChoice, ancestorKeys,
  formatCapacityLabel, formatGigabytes, applyVariantSpecs,
} from "./index.js";
import { sandisk, phone, shoes, sofa } from "./fixtures.js";
import { storedOptions, validateOptions, publicOptions } from "../seller/options.js";

const ids = (list) => list.map((v) => v.id);

// ---- combinations ----

test("generateCombinations: one value per axis in axis order, none without axes", () => {
  const p = phone();
  const all = generateCombinations(p.options);
  assert.equal(all.length, 9);
  assert.deepEqual(all[0], { color: "black", storage: "128" });
  assert.deepEqual(all[8], { color: "blue", storage: "512" });
  assert.deepEqual(generateCombinations([]), []);
  assert.deepEqual(generateCombinations(undefined), []);
});

test("generateCombinations: capped at the limit plus one, never builds a huge list", () => {
  const big = (key) => ({ key, label: key, display: "button", values: Array.from({ length: 40 }, (_, i) => ({ id: `v${i}`, label: `V${i}` })) });
  const all = generateCombinations([big("a"), big("b"), big("c")]);
  assert.equal(all.length, 201);
  assert.equal(generateCombinations([big("a"), big("b")]).length, 201);
  assert.equal(generateCombinations([big("a")]).length, 40);
  assert.equal(generateCombinations([{ key: "x", values: [] }]).length, 0);
});

// ---- default variant ----

test("findDefaultVariant: the seller's default wins when it can be bought", () => {
  const s = sofa();
  assert.equal(s.defaultVariantId, "v3");
  assert.equal(findDefaultVariant(s.optionVariants, s.defaultVariantId).id, "v3");
});

test("findDefaultVariant: no default means the cheapest in stock; sold out and unavailable are skipped", () => {
  const p = phone();
  // Grey 128 GB at 21,000 is the cheapest; Grey 512 GB (29,000) is sold out and would not matter anyway.
  assert.equal(findDefaultVariant(p.optionVariants, null).id, "v2");
  const rows = [
    { id: "a", status: "out_of_stock", price: 100, salePrice: null },
    { id: "b", status: "unavailable", price: 50, salePrice: null },
    { id: "c", status: "limited_stock", price: 300, salePrice: null },
    { id: "d", status: "available", price: 200, salePrice: null },
  ];
  assert.equal(findDefaultVariant(rows).id, "d");
});

test("findDefaultVariant: the sale price decides what is cheapest", () => {
  const rows = [{ id: "a", status: "available", price: 100, salePrice: null }, { id: "b", status: "available", price: 150, salePrice: 90 }];
  assert.equal(cheapestInStock(rows).id, "b");
  assert.equal(payPrice(rows[1]), 90);
  assert.equal(payPrice({ price: null, salePrice: null }), Number.POSITIVE_INFINITY);
});

test("findDefaultVariant: a sold-out seller default gives way to the cheapest in stock", () => {
  const rows = [{ id: "a", status: "out_of_stock", price: 100 }, { id: "b", status: "available", price: 500 }];
  assert.equal(findDefaultVariant(rows, "a").id, "b");
});

test("findDefaultVariant: everything sold out falls back to the seller default, then the first listed; empty gives null", () => {
  const rows = [{ id: "a", status: "out_of_stock", price: 100 }, { id: "b", status: "out_of_stock", price: 50 }];
  assert.equal(findDefaultVariant(rows, "b").id, "b");
  assert.equal(findDefaultVariant(rows, null).id, "a");
  assert.equal(findDefaultVariant([], null), null);
  assert.equal(findDefaultVariant(undefined, null), null);
  assert.equal(findDefaultVariant(rows, "missing").id, "a");
});

test("findDefaultVariant: a tie goes to the variant listed first", () => {
  const rows = [{ id: "a", status: "available", price: 100 }, { id: "b", status: "available", price: 100 }];
  assert.equal(findDefaultVariant(rows).id, "a");
});

test("findDefaultVariant: `within` restricts the search", () => {
  const p = phone();
  const blue = p.optionVariants.filter((v) => v.choice.color === "blue");
  assert.equal(findDefaultVariant(p.optionVariants, null, blue).id, "v3");
});

// ---- dependent options (SanDisk) ----

test("SanDisk: Old Version lists 32, 128, 256, 512 GB and 1 TB", () => {
  const s = sandisk();
  const list = dependentValues(s.options, s.optionVariants, "capacity", { style: "old" });
  assert.deepEqual(ids(list), ["32gb", "128gb", "256gb", "512gb", "1024gb"]);
});

test("SanDisk: New Version shows 64 GB and 2 TB and drops 32 GB", () => {
  const s = sandisk();
  const list = dependentValues(s.options, s.optionVariants, "capacity", { style: "new" });
  assert.deepEqual(ids(list), ["64gb", "128gb", "256gb", "512gb", "1024gb", "2048gb"]);
  assert.ok(!ids(list).includes("32gb"));
});

test("SanDisk: before a style is chosen the capacity list holds every value that is sold at all", () => {
  const s = sandisk();
  assert.equal(dependentValues(s.options, s.optionVariants, "capacity", {}).length, 7);
});

test("SanDisk: the style axis has no dependency and always lists all its values", () => {
  const s = sandisk();
  assert.deepEqual(ids(dependentValues(s.options, s.optionVariants, "style", { capacity: "2048gb" })), ["old", "new"]);
});

test("SanDisk: switching style keeps 128 GB because the other style has it", () => {
  const s = sandisk();
  const next = reconcileSelection(s.options, s.optionVariants, { style: "new", capacity: "128gb" }, s.defaultVariantId);
  assert.deepEqual(next, { style: "new", capacity: "128gb" });
});

test("SanDisk: switching to New while 32 GB is chosen picks the default of what is left", () => {
  const s = sandisk();
  const next = reconcileSelection(s.options, s.optionVariants, { style: "new", capacity: "32gb" }, null);
  // No seller default here, so the cheapest New Version in stock: 64 GB at 4,650.
  assert.deepEqual(next, { style: "new", capacity: "64gb" });
});

test("SanDisk: switching back to Old when 2 TB is chosen picks the default of Old", () => {
  const s = sandisk();
  const next = reconcileSelection(s.options, s.optionVariants, { style: "old", capacity: "2048gb" }, s.defaultVariantId);
  assert.equal(next.style, "old");
  assert.ok(["32gb", "128gb", "256gb", "512gb", "1024gb"].includes(next.capacity));
  assert.equal(next.capacity, "128gb"); // the seller's default is Old / 128 GB
});

test("SanDisk: an empty selection gives the seller's default variant", () => {
  const s = sandisk();
  assert.deepEqual(reconcileSelection(s.options, s.optionVariants, {}, s.defaultVariantId), { style: "old", capacity: "128gb" });
});

test("SanDisk: with no seller default the empty selection is the cheapest in stock", () => {
  const s = sandisk();
  assert.deepEqual(reconcileSelection(s.options, s.optionVariants, {}, null), { style: "old", capacity: "32gb" });
});

test("SanDisk: prices and the struck-through earlier price survive in the variants", () => {
  const s = sandisk();
  const old32 = variantForChoice(s.options, s.optionVariants, { style: "old", capacity: "32gb" });
  assert.equal(old32.price, 3765);
  assert.equal(old32.salePrice, 3582);
  const new256 = variantForChoice(s.options, s.optionVariants, { style: "new", capacity: "256gb" });
  assert.equal(new256.price, 16883);
  assert.equal(new256.salePrice, 12078);
});

test("SanDisk: compatible devices change with the style", () => {
  const s = sandisk();
  const itemSpecs = [{ group: "Features & Specs", label: "Interface", value: "microSD" }, { group: "Features & Specs", label: "Compatible devices", value: "Various" }];
  const old = variantForChoice(s.options, s.optionVariants, { style: "old", capacity: "128gb" });
  const neu = variantForChoice(s.options, s.optionVariants, { style: "new", capacity: "128gb" });
  const oldSpecs = applyVariantSpecs(itemSpecs, old.specs);
  const newSpecs = applyVariantSpecs(itemSpecs, neu.specs);
  assert.equal(oldSpecs.find((r) => r.label === "Compatible devices").value, "Car navigation, computers, digital cameras, home theatre");
  assert.equal(newSpecs.find((r) => r.label === "Compatible devices").value, "Camera");
  assert.equal(oldSpecs.length, 2);
  assert.equal(itemSpecs[1].value, "Various"); // the item's own rows are untouched
});

test("capacity labels: 1024 GB is 1 TB and 2048 GB is 2 TB; smaller or odd labels are left as written", () => {
  assert.equal(formatCapacityLabel("1024 GB"), "1 TB");
  assert.equal(formatCapacityLabel("2048 GB"), "2 TB");
  assert.equal(formatCapacityLabel("1024GB"), "1 TB");
  assert.equal(formatCapacityLabel("1536 gb"), "1.5 TB");
  assert.equal(formatCapacityLabel("512 GB"), "512 GB");
  assert.equal(formatCapacityLabel("1 TB"), "1 TB");
  assert.equal(formatCapacityLabel("2 tb"), "2 TB");
  assert.equal(formatCapacityLabel("Large"), "Large");
  assert.equal(formatCapacityLabel(undefined), undefined);
  assert.equal(formatGigabytes(1024), "1 TB");
  assert.equal(formatGigabytes(0), "");
});

test("ancestorKeys: follows dependsOn up, and cannot loop on bad data", () => {
  const axes = [{ key: "a", values: [], dependsOn: "b" }, { key: "b", values: [], dependsOn: "a" }, { key: "c", values: [], dependsOn: "c" }];
  assert.deepEqual(ancestorKeys(axes, "a"), ["b"]);
  assert.deepEqual(ancestorKeys(axes, "c"), []);
  assert.deepEqual(ancestorKeys(sandisk().options, "capacity"), ["style"]);
  assert.deepEqual(ancestorKeys(sandisk().options, "style"), []);
  assert.deepEqual(ancestorKeys(undefined, "x"), []);
});

test("a dependent value whose only combination is unavailable is not offered; a sold-out one still is", () => {
  const s = sandisk();
  const rows = s.optionVariants.map((v) => (v.choice.style === "new" && v.choice.capacity === "2048gb" ? { ...v, status: "unavailable" } : v.choice.style === "new" && v.choice.capacity === "64gb" ? { ...v, status: "out_of_stock" } : v));
  const list = ids(dependentValues(s.options, rows, "capacity", { style: "new" }));
  assert.ok(!list.includes("2048gb"));
  assert.ok(list.includes("64gb"));
});

test("a three-level chain keeps every level consistent", () => {
  const axes = [
    { key: "a", label: "A", display: "button", values: [{ id: "a1", label: "A1" }, { id: "a2", label: "A2" }] },
    { key: "b", label: "B", display: "button", dependsOn: "a", values: [{ id: "b1", label: "B1" }, { id: "b2", label: "B2" }] },
    { key: "c", label: "C", display: "button", dependsOn: "b", values: [{ id: "c1", label: "C1" }, { id: "c2", label: "C2" }] },
  ];
  const mk = (a, b, c, price) => ({ id: `${a}${b}${c}`, choice: { a, b, c }, price, salePrice: null, status: "available" });
  const rows = [mk("a1", "b1", "c1", 5), mk("a1", "b2", "c2", 6), mk("a2", "b2", "c1", 7)];
  assert.deepEqual(ids(dependentValues(axes, rows, "b", { a: "a1" })), ["b1", "b2"]);
  assert.deepEqual(ids(dependentValues(axes, rows, "b", { a: "a2" })), ["b2"]);
  assert.deepEqual(ids(dependentValues(axes, rows, "c", { a: "a1", b: "b1" })), ["c1"]);
  assert.deepEqual(reconcileSelection(axes, rows, { a: "a2", b: "b1", c: "c2" }), { a: "a2", b: "b2", c: "c1" });
});

test("reconcileSelection never returns a value outside the axis, even for junk input", () => {
  const p = phone();
  const next = reconcileSelection(p.options, p.optionVariants, { color: "pink", storage: 5 }, "nope");
  assert.ok(p.options[0].values.some((v) => v.id === next.color));
  assert.ok(p.options[1].values.some((v) => v.id === next.storage));
  assert.deepEqual(reconcileSelection([], [], {}), {});
  assert.deepEqual(reconcileSelection(undefined, undefined, undefined), {});
});

test("variantForChoice: null for a combination that is not sold or an incomplete choice", () => {
  const sh = shoes();
  assert.equal(variantForChoice(sh.options, sh.optionVariants, { color: "red", size: "38" }), null);
  assert.equal(variantForChoice(sh.options, sh.optionVariants, { color: "red" }), null);
  assert.equal(variantForChoice(sh.options, sh.optionVariants, null), null);
  assert.equal(variantForChoice([], [], {}), null);
  assert.ok(variantForChoice(sh.options, sh.optionVariants, { color: "white", size: "38" }));
});

// ---- specs ----

test("applyVariantSpecs: matches group and label ignoring case, adds missing rows, never mutates", () => {
  const base = [{ group: "Features & Specs", label: "Colour", value: "Black" }];
  const out = applyVariantSpecs(base, [{ group: "Features & Specs", label: "colour", value: "Grey" }, { group: "Measurements", label: "Weight", value: "1 kg" }]);
  assert.deepEqual(out, [{ group: "Features & Specs", label: "Colour", value: "Grey" }, { group: "Measurements", label: "Weight", value: "1 kg" }]);
  assert.equal(base[0].value, "Black");
  assert.deepEqual(applyVariantSpecs(base, []), base);
  assert.deepEqual(applyVariantSpecs(undefined, undefined), []);
});

// ---- fixtures through the real validator ----

test("every fixture's stored form passes storedOptions and round-trips through publicOptions", () => {
  for (const make of [sandisk, phone, shoes, sofa]) {
    const f = make();
    const input = { axes: f.options, variants: f.optionVariants.map(({ choice, price, salePrice, status, specs }) => ({ choice, price, salePrice, status, specs })) };
    const r = storedOptions(input);
    assert.equal(r.ok, true, `${f.item.name}: ${r.error}`);
    assert.equal(r.value.variants.length, f.optionVariants.length);
  }
});

test("fixtures sit inside the limits and match the reference data", () => {
  const s = sandisk();
  assert.equal(s.optionVariants.length, 11);
  assert.equal(shoes().optionVariants.length, 15);
  assert.equal(shoes().options[1].values.length, 10);
  assert.equal(shoes().options[1].display, "dropdown");
  assert.equal(sofa().defaultVariantId, "v3");
  assert.equal(phone().defaultVariantId, null);
  assert.ok(phone().optionVariants.some((v) => v.status === "out_of_stock"));
});

// ---- validator: dependsOn, defaultChoice, specs ----

const base2 = () => ({
  axes: [
    { key: "style", label: "Style", display: "button", values: [{ id: "old", label: "Old" }, { id: "new", label: "New" }] },
    { key: "cap", label: "Capacity", display: "button", dependsOn: "style", values: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
  ],
  variants: [{ choice: { style: "old", cap: "a" }, price: 10 }, { choice: { style: "new", cap: "b" }, price: 20 }],
});

test("validateOptions: dependsOn must name an earlier axis", () => {
  assert.equal(storedOptions(base2()).ok, true);
  const self = base2(); self.axes[0].dependsOn = "style";
  assert.equal(storedOptions(self).error, "invalid_options");
  const later = base2(); later.axes[0].dependsOn = "cap"; delete later.axes[1].dependsOn;
  assert.equal(storedOptions(later).error, "invalid_options");
  const unknown = base2(); unknown.axes[1].dependsOn = "nope";
  assert.equal(storedOptions(unknown).error, "invalid_options");
  const bad = base2(); bad.axes[1].dependsOn = 5;
  assert.equal(storedOptions(bad).error, "invalid_options");
  const nul = base2(); nul.axes[1].dependsOn = null;
  assert.equal(storedOptions(nul).ok, true);
  assert.equal("dependsOn" in storedOptions(nul).value.axes[1], false);
});

test("validateOptions: dependsOn is kept on the stored axis and shows in the public payload", () => {
  const r = storedOptions(base2());
  assert.equal(r.value.axes[1].dependsOn, "style");
  const pub = publicOptions({ axes: r.value.axes, variants: r.value.variants });
  assert.equal(pub.options[1].dependsOn, "style");
  assert.equal("dependsOn" in pub.options[0], false);
});

test("validateOptions: defaultChoice must be a combination being saved", () => {
  const ok = base2(); ok.defaultChoice = { style: "new", cap: "b" };
  assert.deepEqual(storedOptions(ok).value.defaultChoice, { style: "new", cap: "b" });
  const missing = base2(); missing.defaultChoice = { style: "new", cap: "a" };
  assert.equal(storedOptions(missing).error, "invalid_default");
  const partial = base2(); partial.defaultChoice = { style: "new" };
  assert.equal(storedOptions(partial).error, "invalid_default");
  const cleared = base2(); cleared.defaultChoice = null;
  assert.equal(storedOptions(cleared).value.defaultChoice, null);
  assert.equal("defaultChoice" in storedOptions(base2()).value, false);
  assert.equal(validateOptions(missing).errors.defaultChoice, "Pick one of the combinations you sell as the default.");
});

test("validateOptions: variant spec overrides follow the item's spec rules", () => {
  const good = base2(); good.variants[0].specs = [{ group: "Features & Specs", label: " Compatible devices ", value: " Camera " }];
  assert.deepEqual(storedOptions(good).value.variants[0].specs, [{ group: "Features & Specs", label: "Compatible devices", value: "Camera" }]);
  const group = base2(); group.variants[0].specs = [{ group: "Nope", label: "a", value: "b" }];
  assert.equal(storedOptions(group).error, "invalid_variant");
  const blank = base2(); blank.variants[0].specs = [{ group: "Measurements", label: "", value: "b" }];
  assert.equal(storedOptions(blank).error, "invalid_variant");
  const long = base2(); long.variants[0].specs = [{ group: "Measurements", label: "a", value: "x".repeat(121) }];
  assert.equal(storedOptions(long).error, "invalid_variant");
  const many = base2(); many.variants[0].specs = Array.from({ length: 21 }, (_, i) => ({ group: "Measurements", label: `l${i}`, value: "v" }));
  assert.equal(storedOptions(many).error, "invalid_variant");
  const extra = base2(); extra.variants[0].specs = [{ group: "Measurements", label: "a", value: "b", more: 1 }];
  assert.equal(storedOptions(extra).error, "invalid_variant");
  const notList = base2(); notList.variants[0].specs = "x";
  assert.equal(storedOptions(notList).error, "invalid_variant");
  assert.equal("specs" in storedOptions(base2()).value.variants[0], false); // legacy shape: no key unless given
});

test("limits: 41 values on an axis and 201 variants are refused", () => {
  const axis = (n) => ({ key: "size", label: "Size", display: "button", values: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `S${i}` })) });
  assert.equal(storedOptions({ axes: [axis(40)], variants: [] }).ok, true);
  assert.equal(storedOptions({ axes: [axis(41)], variants: [] }).error, "invalid_options");
  const three = ["a", "b", "c"].map((k) => ({ ...axis(6), key: k }));
  const combos = generateCombinations(three, 300);
  assert.equal(combos.length, 216);
  assert.equal(storedOptions({ axes: three, variants: combos.slice(0, 200).map((choice) => ({ choice, price: 1 })) }).ok, true);
  assert.equal(storedOptions({ axes: three, variants: combos.slice(0, 201).map((choice) => ({ choice, price: 1 })) }).error, "too_many_variants");
  assert.equal(storedOptions({ axes: [...three, { ...axis(2), key: "d" }], variants: [] }).error, "invalid_options");
});

// ---- selection: the URL, availability, card prices ----

import { choiceToParam, choiceFromParam, valueStatus, axisCards, choiceLabel } from "./index.js";

test("?v=: a choice becomes value ids in axis order and reads back; wrong parts are ignored, never trusted", () => {
  const p = phone();
  assert.equal(choiceToParam(p.options, { color: "grey", storage: "256" }), "grey.256");
  assert.equal(choiceToParam(p.options, { color: "grey" }), "");
  assert.equal(choiceToParam([], {}), "");
  assert.deepEqual(choiceFromParam(p.options, "grey.256"), { color: "grey", storage: "256" });
  assert.deepEqual(choiceFromParam(p.options, "grey.999"), { color: "grey" }, "an unknown value is dropped, the rest kept");
  assert.deepEqual(choiceFromParam(p.options, "grey"), {}, "wrong number of parts");
  assert.deepEqual(choiceFromParam(p.options, "a.b.c"), {});
  assert.deepEqual(choiceFromParam(p.options, null), {});
  assert.deepEqual(choiceFromParam(p.options, ["grey.256"]), {});
  assert.deepEqual(choiceFromParam([], "grey.256"), {});
  assert.deepEqual(choiceFromParam(p.options, "__proto__.constructor"), {});
});

test("valueStatus: stock state of the combination, not_sold when there is none", () => {
  const sh = shoes();
  assert.equal(valueStatus(sh.options, sh.optionVariants, { color: "red", size: "40" }, "size", "42"), "out_of_stock");
  assert.equal(valueStatus(sh.options, sh.optionVariants, { color: "red", size: "40" }, "size", "38"), "not_sold");
  assert.equal(valueStatus(sh.options, sh.optionVariants, { color: "red", size: "40" }, "size", "41"), "available");
  assert.equal(valueStatus(sh.options, sh.optionVariants, { color: "red", size: "40" }, "color", "white"), "available");
  const p = phone();
  assert.equal(valueStatus(p.options, p.optionVariants, { color: "blue", storage: "128" }, "storage", "256"), "limited_stock");
});

test("axisCards: prices show only on an axis where they differ (phone colour and storage)", () => {
  const p = phone();
  const color = axisCards(p.options, p.optionVariants, { color: "black", storage: "256" }, "color");
  assert.equal(color.showPrice, true);
  assert.deepEqual(color.values.map((c) => c.price), [25000, 24000, 25000]);
  const storage = axisCards(p.options, p.optionVariants, { color: "grey", storage: "128" }, "storage");
  assert.deepEqual(storage.values.map((c) => c.price), [21000, 24000, 29000]);
  assert.equal(storage.showPrice, true);
  const sh = shoes();
  const sizes = axisCards(sh.options, sh.optionVariants, { color: "white", size: "40" }, "size");
  assert.equal(sizes.showPrice, false, "every size costs the same, so the cards stay clean");
  assert.equal(sizes.values.length, 10);
  const colors = axisCards(sh.options, sh.optionVariants, { color: "white", size: "40" }, "color");
  assert.equal(colors.showPrice, false);
});

test("axisCards: sale price is what the card shows, with the earlier price kept for the strike-through; dependent lists follow the style", () => {
  const s = sandisk();
  const old = axisCards(s.options, s.optionVariants, { style: "old", capacity: "128gb" }, "capacity");
  assert.deepEqual(old.values.map((c) => c.value.id), ["32gb", "128gb", "256gb", "512gb", "1024gb"]);
  assert.equal(old.values[0].price, 3582);
  assert.equal(old.values[0].was, 3765);
  assert.equal(old.values[1].was, null);
  const neu = axisCards(s.options, s.optionVariants, { style: "new", capacity: "128gb" }, "capacity");
  const c256 = neu.values.find((c) => c.value.id === "256gb");
  assert.deepEqual([c256.price, c256.was], [12078, 16883]);
  assert.equal(neu.showPrice, true);
});

test("axisCards: a value with no sold combination next to the choice has no price and is not available", () => {
  const sh = shoes();
  const red = axisCards(sh.options, sh.optionVariants, { color: "red", size: "40" }, "size");
  const s38 = red.values.find((c) => c.value.id === "38");
  assert.deepEqual([s38.variant, s38.price, s38.available, s38.status], [null, null, false, "not_sold"]);
  const s42 = red.values.find((c) => c.value.id === "42");
  assert.deepEqual([s42.available, s42.status], [false, "out_of_stock"]);
  assert.deepEqual(axisCards(sh.options, sh.optionVariants, {}, "nope"), { values: [], showPrice: false });
});

test("choiceLabel: values joined in axis order", () => {
  const p = phone();
  assert.equal(choiceLabel(p.options, { color: "grey", storage: "256" }), "Grey / 256 GB");
  assert.equal(choiceLabel(p.options, { color: "grey" }), "Grey");
  assert.equal(choiceLabel(undefined, {}), "");
});
