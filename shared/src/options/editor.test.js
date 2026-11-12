import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyOptionsForm, addAxis, addValue, removeValue, removeAxis, setRow, setSold, setDefault, summarize, summaryText, checkOptions,
  optionsPayload, optionsFromServer, effectiveLimits, canAddValue, limitMessage, liveRows, rowKeyOf,
  renameAxis, setDependsOn, dependencyChoices, dependentSets, toggleDependentValue, copyDependentValues, addDependentValue,
  dependentSpecs, setDependentSpecs,
} from "./editor.js";
import { storedOptions } from "../seller/options.js";
import { SPEC_GROUPS } from "../seller/itemForm.js";
import { dependentValues } from "./dependent.js";

const build = (spec) => {
  let o = emptyOptionsForm();
  for (const [label, display, values] of spec) {
    o = addAxis(o, { label, display });
    const key = o.axes.at(-1).key;
    for (const v of values) o = addValue(o, key, v).options;
  }
  return o;
};

// ---- 3 x 3 generation ----
test("three values on two axes make nine combinations, all on sale", () => {
  const o = build([["Colour", "swatch", ["Black", "Grey", "Blue"]], ["Storage", "button", ["128 GB", "256 GB", "512 GB"]]]);
  assert.equal(o.axes.length, 2);
  assert.equal(liveRows(o).length, 9);
  assert.ok(o.rows.every((r) => r.sold));
  assert.equal(summaryText(summarize(o)), "9 combinations, 9 in stock");
});

test("the summary counts what is in stock and names the lowest price", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]], ["Storage", "button", ["128 GB", "256 GB"]]]);
  for (const r of o.rows) o = setRow(o, rowKeyOf(o, r.choice), { price: r.choice.colour === "grey" ? "21,000" : "22000" });
  o = setRow(o, rowKeyOf(o, o.rows[0].choice), { stock: "0" });
  o = setSold(o, rowKeyOf(o, o.rows[3].choice), false);
  const s = summarize(o);
  assert.deepEqual(s, { combos: 3, notSold: 1, inStock: 2, from: 21000 });
  assert.equal(summaryText(s), "3 combinations, 2 in stock, from KES 21,000");
});

test("a row with no price of its own counts at the item's price; a sale price lowers `from`", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]]]);
  o = setRow(o, "colour=grey", { price: "5000", salePrice: "4000" });
  assert.equal(summarize(o, "4500").from, 4000);
  assert.equal(summarize(o, "3000").from, 3000);
  assert.equal(summarize(o, "").from, 4000);
});

// ---- not sold ----
test("a combination marked Not sold is left out of the save and keeps its typed price", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]], ["Size", "button", ["S", "M"]]]);
  o = setRow(o, "colour=grey|size=m", { price: "900" });
  o = setSold(o, "colour=grey|size=m", false);
  const p = optionsPayload(o);
  assert.equal(p.variants.length, 3);
  assert.ok(!p.variants.some((v) => v.choice.colour === "grey" && v.choice.size === "m"));
  o = setSold(o, "colour=grey|size=m", true);
  assert.equal(o.rows.find((r) => rowKeyOf(o, r.choice) === "colour=grey|size=m").price, "900");
});

test("the default combination is dropped when it stops being sold", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]]]);
  o = setDefault(o, "colour=grey");
  assert.equal(optionsPayload(o).defaultChoice.colour, "grey");
  o = setSold(o, "colour=grey", false);
  assert.equal(o.defaultKey, null);
  assert.equal(optionsPayload(o).defaultChoice, null);
  assert.equal(setDefault(o, "colour=grey").defaultKey, null, "a not-sold combination cannot become the default");
});

// ---- keeping the seller's work ----
test("adding a value or an axis keeps typed prices; new rows inherit from the row they grew out of", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]]]);
  o = setRow(o, "colour=black", { price: "25000", stock: "4" });
  o = addValue(o, "colour", "Blue").options;
  assert.equal(o.rows.length, 3);
  assert.equal(o.rows.find((r) => r.choice.colour === "black").price, "25000");
  o = addAxis(o, { label: "Storage", display: "button" });
  assert.equal(liveRows(o).length, 0, "no combinations while the new axis has no value");
  o = addValue(o, "storage", "128 GB").options;
  assert.equal(liveRows(o).length, 3);
  assert.equal(o.rows.find((r) => r.choice.colour === "black" && r.choice.storage === "128-gb").price, "25000", "the first value of a new axis inherits");
  o = addValue(o, "storage", "256 GB").options;
  assert.equal(liveRows(o).length, 6);
  assert.equal(o.rows.find((r) => r.choice.colour === "black" && r.choice.storage === "256-gb").price, "", "a new value on an existing axis starts empty: its price is its own");
});

test("removing a value or an axis drops only what no longer exists", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]], ["Storage", "button", ["128 GB", "256 GB"]]]);
  o = setRow(o, "colour=grey|storage=128-gb", { price: "1" });
  o = removeValue(o, "colour", "black");
  assert.equal(liveRows(o).length, 2);
  o = removeAxis(o, "storage");
  assert.equal(o.axes.length, 1);
  assert.equal(o.rows.length, 1);
  assert.equal(o.rows[0].price, "1");
});

test("a duplicate value is refused, ignoring case and spacing", () => {
  const o = build([["Colour", "swatch", ["Dark Blue"]]]);
  const r = addValue(o, "colour", "  dark   blue ");
  assert.equal(r.error, "duplicate");
  assert.equal(r.options.axes[0].values.length, 1);
});

// ---- limits ----
test("limits: 3 axes, 40 values per axis, 200 combinations, and the plan can lower them", () => {
  let o = build([["A", "button", []], ["B", "button", []], ["C", "button", []]]);
  assert.equal(addAxis(o, { label: "D" }).axes.length, 3);
  const many = Array.from({ length: 40 }, (_, i) => `v${i}`);
  o = build([["Size", "button", many]]);
  assert.equal(canAddValue(o, "size").reason, "values");
  assert.equal(addValue(o, "size", "one more").error, "values");
  // 5 x 5 x 8 = 200 fits, one more value on the last axis would make 225.
  o = build([["A", "button", ["1", "2", "3", "4", "5"]], ["B", "button", ["1", "2", "3", "4", "5"]], ["C", "button", ["1", "2", "3", "4", "5", "6", "7", "8"]]]);
  assert.equal(liveRows(o).length, 200);
  assert.equal(canAddValue(o, "c").reason, "variants");
  assert.equal(canAddValue(o, "a").reason, "variants");
  const plan = effectiveLimits({ axes: 2, values: 5, variants: 20 });
  assert.deepEqual(plan, { axes: 2, values: 5, variants: 20 });
  assert.equal(effectiveLimits({ axes: 99 }).axes, 3, "a plan can only lower a limit");
  assert.equal(limitMessage("values", plan, true), "Your plan allows up to 5 values for one option. Upgrade to add more.");
  assert.equal(limitMessage("variants", effectiveLimits(), false), "You can add up to 200 combinations.");
  const capped = build([["Size", "button", ["1", "2", "3", "4", "5"]]]);
  assert.deepEqual(canAddValue(capped, "size", plan), { ok: false, reason: "values", plan: true });
});

// ---- legacy ----
test("an item that never had options sends nothing; clearing the options sends an explicit clear", () => {
  assert.equal(optionsPayload(undefined), undefined);
  assert.equal(optionsPayload(emptyOptionsForm(), false), undefined);
  assert.deepEqual(optionsPayload(emptyOptionsForm(), true), { axes: [], variants: [], defaultChoice: null });
  assert.equal(storedOptions(optionsPayload(emptyOptionsForm(), true)).ok, true);
});

// ---- validation ----
test("checkOptions finds a missing name, an axis with no values, a bad price, and a sale price that is not lower", () => {
  let o = addAxis(emptyOptionsForm(), { label: "" });
  let c = checkOptions(o);
  assert.equal(c.ok, false);
  assert.ok(c.errors["axes.0.label"] && c.errors["axes.0.values"]);
  o = build([["Colour", "swatch", ["Black", "Grey"]]]);
  o = setRow(o, "colour=black", { price: "12abc" });
  o = setRow(o, "colour=grey", { price: "100", salePrice: "150" });
  c = checkOptions(o);
  assert.ok(c.errors["row:colour=black:price"]);
  assert.ok(c.errors["row:colour=grey:salePrice"]);
  o = setRow(setRow(o, "colour=black", { price: "" }), "colour=grey", { salePrice: "80" });
  assert.equal(checkOptions(o).ok, true);
  o = setSold(setSold(o, "colour=black", false), "colour=grey", false);
  assert.ok(checkOptions(o).errors.rows);
});

test("what the form sends is accepted by the same validator the database mirrors", () => {
  let o = build([["Colour", "swatch", ["Black", "Grey"]], ["Storage", "button", ["128 GB", "256 GB"]]]);
  o = setRow(o, "colour=black|storage=128-gb", { price: "22,000", stock: "5" });
  const r = storedOptions(optionsPayload(o));
  assert.equal(r.ok, true);
  assert.equal(r.value.variants.find((v) => v.key === "colour=black|storage=128-gb").price, 22000);
});

test("a saved item loads back into the form: prices as text, the default, and combinations that were not sold", () => {
  const axes = [{ key: "colour", label: "Colour", display: "swatch", values: [{ id: "black", label: "Black", color: "#111111" }, { id: "grey", label: "Grey" }] }];
  const form = optionsFromServer({ axes, variants: [{ id: "v1", choice: { colour: "black" }, price: 25000, salePrice: null, stock: 3, status: "available", sku: "BK", mediaIds: [], specs: [] }], defaultVariantId: "v1" });
  assert.equal(form.rows.length, 2);
  assert.equal(form.rows[0].price, "25000");
  assert.equal(form.rows[0].sku, "BK");
  assert.equal(form.rows[1].sold, false, "grey was never sold");
  assert.equal(form.defaultKey, "colour=black");
  const back = optionsPayload(form, true);
  assert.equal(back.variants.length, 1);
  assert.equal(back.variants[0].sku, "BK");
  assert.equal(back.variants[0].price, 25000);
});

// ---- dependent options: the SanDisk fixture ----
const sandisk = () => {
  let o = build([["Style", "button", ["Old Version", "New Version"]], ["Capacity", "button", ["32 GB", "64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "2 TB"]]]);
  o = setDependsOn(o, "capacity", "style");
  const old = ["32 GB", "128 GB", "256 GB", "512 GB", "1 TB"].map((l) => l.toLowerCase().replace(" ", "-"));
  const neu = ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "2 TB"].map((l) => l.toLowerCase().replace(" ", "-"));
  for (const v of o.axes[1].values) {
    if (!old.includes(v.id)) o = toggleDependentValue(o, "capacity", "old-version", v.id);
    if (!neu.includes(v.id)) o = toggleDependentValue(o, "capacity", "new-version", v.id);
  }
  return o;
};

test("SanDisk: one row of value chips per parent value, derived from the combinations", () => {
  const o = sandisk();
  assert.deepEqual(dependencyChoices(o, "capacity").map((a) => a.key), ["style"]);
  assert.deepEqual(dependencyChoices(o, "style"), []);
  const sets = dependentSets(o, "capacity");
  const on = (i) => sets[i].values.filter((x) => x.sold).map((x) => x.value.label);
  assert.deepEqual(on(0), ["32 GB", "128 GB", "256 GB", "512 GB", "1 TB"]);
  assert.deepEqual(on(1), ["64 GB", "128 GB", "256 GB", "512 GB", "1 TB", "2 TB"]);
  assert.equal(summarize(o).combos, 11);
});

test("SanDisk: the saved combinations give the buyer exactly those lists (32 GB gone for New Version)", () => {
  const o = sandisk();
  const payload = optionsPayload(o);
  assert.equal(storedOptions(payload).ok, true);
  assert.equal(payload.axes[1].dependsOn, "style");
  const variants = payload.variants.map((v) => ({ id: JSON.stringify(v.choice), choice: v.choice, status: "available" }));
  const labels = (style) => dependentValues(payload.axes, variants, "capacity", { style }).map((v) => v.label);
  assert.ok(labels("old-version").includes("32 GB") && !labels("old-version").includes("64 GB"));
  assert.ok(!labels("new-version").includes("32 GB") && labels("new-version").includes("2 TB"));
});

test("SanDisk: price each cell; a typed price survives toggling a chip off and on", () => {
  let o = sandisk();
  o = setRow(o, "style=new-version|capacity=256-gb", { price: "12078" });
  o = toggleDependentValue(o, "capacity", "new-version", "256-gb");
  assert.ok(!optionsPayload(o).variants.some((v) => v.choice.style === "new-version" && v.choice.capacity === "256-gb"));
  o = toggleDependentValue(o, "capacity", "new-version", "256-gb");
  assert.equal(o.rows.find((r) => rowKeyOf(o, r.choice) === "style=new-version|capacity=256-gb").price, "12078");
});

test("SanDisk: copy the values of one parent onto another in one step", () => {
  let o = sandisk();
  o = copyDependentValues(o, "capacity", "new-version", "old-version");
  const sets = dependentSets(o, "capacity");
  assert.deepEqual(sets[0].values.filter((x) => x.sold).map((x) => x.value.label), sets[1].values.filter((x) => x.sold).map((x) => x.value.label));
  assert.equal(summarize(o).combos, 12);
  const same = copyDependentValues(o, "capacity", "old-version", "old-version");
  assert.deepEqual(same, o);
});

test("SanDisk: a value added under one parent is sold there only", () => {
  let o = sandisk();
  const r = addDependentValue(o, "capacity", "new-version", "4 TB");
  o = r.options;
  const sets = dependentSets(o, "capacity");
  assert.ok(sets[1].values.find((x) => x.value.label === "4 TB").sold);
  assert.ok(!sets[0].values.find((x) => x.value.label === "4 TB").sold);
});

test("SanDisk: spec overrides per parent value (Compatible devices)", () => {
  let o = sandisk();
  o = setDependentSpecs(o, "capacity", "old-version", [{ group: SPEC_GROUPS[0], label: "Compatible devices", value: "Car navigation, computers, digital cameras, home theatre" }]);
  o = setDependentSpecs(o, "capacity", "new-version", [{ group: SPEC_GROUPS[0], label: "Compatible devices", value: "Camera" }]);
  assert.equal(dependentSpecs(o, "capacity", "new-version")[0].value, "Camera");
  const p = optionsPayload(o);
  assert.equal(storedOptions(p).ok, true, "spec rows pass the database rules");
  assert.ok(p.variants.filter((v) => v.choice.style === "old-version").every((v) => v.specs[0].value.startsWith("Car navigation")));
});

test("SanDisk: switching the list off keeps every combination exactly as it was", () => {
  const o = sandisk();
  const off = setDependsOn(o, "capacity", null);
  assert.equal(off.axes[1].dependsOn, undefined);
  assert.deepEqual(off.rows, o.rows);
  assert.equal(summarize(off).combos, 11);
  assert.equal(setDependsOn(o, "style", "capacity").axes[0].dependsOn, undefined, "an axis can only depend on an earlier one");
});

test("removing the parent axis clears the link on the axis that depended on it", () => {
  const o = removeAxis(sandisk(), "style");
  assert.equal(o.axes.length, 1);
  assert.equal(o.axes[0].dependsOn, undefined);
});

test("an axis made with Your own takes its key from the first name typed, and its rows follow", () => {
  let o = addAxis(emptyOptionsForm(), { label: "" });
  o = addValue(o, "option", "A").options;
  o = addValue(o, "option", "B").options;
  o = setDefault(o, "option=b");
  o = renameAxis(o, o.axes[0].key, "C");
  o = renameAxis(o, o.axes[0].key, "Capacity");
  assert.equal(o.axes[0].key, "capacity");
  assert.deepEqual(o.rows.map((r) => Object.keys(r.choice)[0]), ["capacity", "capacity"]);
  assert.equal(o.defaultKey, "capacity=b");
  assert.equal(optionsPayload(o).variants.length, 2);
  const saved = { ...o, axes: o.axes.map(({ auto, ...a }) => a) };   // eslint-disable-line no-unused-vars
  assert.equal(renameAxis(saved, "capacity", "Space").axes[0].key, "capacity", "a saved axis keeps its key");
  assert.ok(!("auto" in optionsPayload(o).axes[0]), "the flag is never sent");
});

// ---- type axes, scales and price tools ----
import { addTypeAxes, setSamePrice, setPricesByAxis, setBasePlusDifference, priceWarnings } from "./editor.js";

test("a type's usual options are added in one step, skipping ones already there and respecting the limit", () => {
  const defs = [{ key: "colour", label: "Colour", display: "swatch" }, { key: "storage", label: "Storage", display: "button", scale: "storage" }];
  const r = addTypeAxes(emptyOptionsForm(), defs);
  assert.equal(r.added, 2);
  assert.equal(r.options.axes[1].scale, "storage");
  assert.ok(!("scale" in optionsPayload(addValue(r.options, "storage", "128 GB").options, true).axes[1]), "the scale is form-only");
  assert.equal(addTypeAxes(r.options, defs).added, 0);
  assert.equal(addTypeAxes(emptyOptionsForm(), defs, effectiveLimits({ axes: 1 })).added, 1);
});

const priced = () => build([["Storage", "button", ["128 GB", "256 GB", "512 GB"]], ["Colour", "swatch", ["Black", "Grey", "Blue"]]]);
const priceOf = (o, k) => o.rows.find((r) => rowKeyOf(o, r.choice) === k).price;

test("same price for all fills every combination on sale and skips Not sold ones", () => {
  let o = setSold(priced(), "storage=128-gb|colour=blue", false);
  o = setSamePrice(o, "1,500");
  assert.equal(priceOf(o, "storage=256-gb|colour=grey"), "1500");
  assert.equal(priceOf(o, "storage=128-gb|colour=blue"), "");
  assert.equal(setSamePrice(o, "abc"), o);
});

test("price by one option sets each value's price across the rest", () => {
  const o = setPricesByAxis(priced(), "colour", { black: "25000", grey: "24000" });
  assert.equal(priceOf(o, "storage=512-gb|colour=black"), "25000");
  assert.equal(priceOf(o, "storage=512-gb|colour=grey"), "24000");
  assert.equal(priceOf(o, "storage=512-gb|colour=blue"), "", "a value left blank is untouched");
});

test("base + difference: storage sets the base, Grey is 1,000 cheaper, and the result is stored as the absolute price", () => {
  const o = setBasePlusDifference(priced(), { baseAxis: "storage", diffAxis: "colour", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: { grey: "-1000" } });
  assert.equal(priceOf(o, "storage=128-gb|colour=black"), "22000");
  assert.equal(priceOf(o, "storage=256-gb|colour=grey"), "24000");
  assert.equal(priceOf(o, "storage=512-gb|colour=grey"), "29000");
  assert.equal(optionsPayload(o).variants.find((v) => v.choice.storage === "256-gb" && v.choice.colour === "grey").price, 24000);
  const bad = setBasePlusDifference(priced(), { baseAxis: "storage", diffAxis: "colour", base: { "128-gb": "500" }, diff: { grey: "-900" } });
  assert.equal(priceOf(bad, "storage=128-gb|colour=grey"), "", "a result at or below zero is not applied");
});

test("a price far from the others gets a plain warning, not an error", () => {
  let o = setBasePlusDifference(priced(), { baseAxis: "storage", diffAxis: "colour", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: {} });
  assert.deepEqual(priceWarnings(o), {});
  o = setRow(o, "storage=128-gb|colour=black", { price: "2400" });
  const w = priceWarnings(o);
  assert.deepEqual(Object.keys(w), ["storage=128-gb|colour=black"]);
  assert.match(w["storage=128-gb|colour=black"], /far below/);
  assert.equal(checkOptions(o).ok, true, "a warning never blocks a save");
});
