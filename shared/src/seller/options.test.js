import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OPTION_LIMITS, OPTION_DISPLAY_TYPES, VARIANT_STATUSES, optionSlug, comboKey, storedOptions, validateOptions, cleanOptionAxes, allCombinations,
  buildAvailability, variantLabel, isPurchasable, statusForChoice, selectableValues, emptyOptions, publicOptions, sizeChartFor, legacyVariantsToOptions, cleanSizeChart, cleanSizeChartOverride,
} from "./options.js";

const MEDIA = "5f1c2d3e-0000-4000-8000-000000000001";
const MEDIA_2 = "5f1c2d3e-0000-4000-8000-000000000002";

const axes = () => [
  { key: "color", label: "Color", display: "swatch", values: [{ id: "red", label: "Red", color: "#FF0000" }, { id: "blue", label: "Blue", color: "#0000ff" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }, { id: "m", label: "M" }, { id: "l", label: "L" }] },
];
const variant = (color, size, extra = {}) => ({ choice: { color, size }, ...extra });
const opts = (variants = [], a = axes()) => ({ axes: a, variants });

test("the limits are the ones in the brief", () => {
  assert.equal(OPTION_LIMITS.axes, 3);
  assert.equal(OPTION_LIMITS.values, 40);
  assert.equal(OPTION_LIMITS.variants, 200);
  assert.deepEqual(OPTION_DISPLAY_TYPES, ["swatch", "image-card", "button", "dropdown", "text-card"]);
  assert.deepEqual(VARIANT_STATUSES, ["available", "limited_stock", "out_of_stock", "unavailable"]);
});

test("no options, null and empty options are all valid and store nothing", () => {
  for (const o of [null, undefined, {}, { axes: [], variants: [] }]) {
    const r = storedOptions(o);
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { axes: [], variants: [] });
  }
});

test("a good axis set with variants is stored cleaned: trimmed labels, lower-case colours, one variant per combination", () => {
  const a = axes();
  a[0].label = "  Color ";
  const r = storedOptions(opts([variant("red", "s", { price: 1500, salePrice: "1200", stock: 5, sku: " R-S ", mediaIds: [MEDIA.toUpperCase()] })], a), { mediaIds: new Set([MEDIA]) });
  assert.equal(r.ok, true);
  assert.equal(r.value.axes[0].label, "Color");
  assert.equal(r.value.axes[0].values[0].color, "#ff0000");
  assert.deepEqual(r.value.variants[0], { choice: { color: "red", size: "s" }, key: "color=red|size=s", price: 1500, salePrice: 1200, stock: 5, status: "available", sku: "R-S", mediaIds: [MEDIA] });
});

test("axis rules: at most 3, unique keys, a label, a known display type, 1 to 40 values", () => {
  const four = Array.from({ length: 4 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, display: "button", values: [{ id: "x", label: "X" }] }));
  assert.equal(storedOptions(opts([], four)).error, "invalid_options");
  const three = four.slice(0, 3);
  assert.equal(storedOptions(opts([], three)).ok, true);
  const dup = [three[0], { ...three[1], key: "a0" }];
  assert.equal(storedOptions(opts([], dup)).error, "invalid_options");
  assert.equal(storedOptions(opts([], [{ ...three[0], label: " " }])).error, "invalid_options");
  assert.equal(storedOptions(opts([], [{ ...three[0], display: "grid" }])).error, "invalid_options");
  assert.equal(storedOptions(opts([], [{ ...three[0], key: "Color" }])).error, "invalid_options");
  assert.equal(storedOptions(opts([], [{ ...three[0], values: [] }])).error, "invalid_options");
  const forty = Array.from({ length: 40 }, (_, i) => ({ id: `v${i}`, label: `V${i}` }));
  assert.equal(storedOptions(opts([], [{ ...three[0], values: forty }])).ok, true);
  assert.equal(storedOptions(opts([], [{ ...three[0], values: [...forty, { id: "v40", label: "V40" }] }])).error, "invalid_options");
});

test("value rules: unique ids, a label, a hex colour, a media id that belongs to the item", () => {
  const one = (values) => opts([], [{ key: "c", label: "C", display: "swatch", values }]);
  assert.equal(storedOptions(one([{ id: "a", label: "A" }, { id: "a", label: "B" }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "" }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "A", color: "red" }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "A", color: "#abc" }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "A", extra: 1 }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "A", mediaId: "nope" }])).error, "invalid_options");
  assert.equal(storedOptions(one([{ id: "a", label: "A", mediaId: MEDIA }])).ok, true);
  assert.equal(storedOptions(one([{ id: "a", label: "A", mediaId: MEDIA }]), { mediaIds: new Set([MEDIA_2]) }).error, "invalid_options");
});

test("variant rules: exactly one valid value per axis, no duplicates, prices, stock, status, SKU and media", () => {
  assert.equal(storedOptions(opts([variant("red", "s")])).ok, true);
  assert.equal(storedOptions(opts([{ choice: { color: "red" } }])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("green", "s")])).error, "invalid_variant");
  assert.equal(storedOptions(opts([{ choice: { color: "red", size: "s", extra: "x" } }])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s"), variant("red", "s")])).error, "duplicate_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { price: "12,50" })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { price: 100, salePrice: 100 })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { salePrice: 50 })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { stock: -1 })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { stock: 1234567 })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { status: "sold" })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { sku: "x".repeat(41) })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { bogus: 1 })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { sku: "A" }), variant("red", "m", { sku: "a" })])).error, "duplicate_sku");
  assert.equal(storedOptions(opts([variant("red", "s", { mediaIds: [MEDIA, MEDIA] })])).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { mediaIds: [MEDIA] })]), { mediaIds: new Set([MEDIA_2]) }).error, "invalid_variant");
  assert.equal(storedOptions(opts([variant("red", "s", { mediaIds: Array(11).fill(MEDIA) })])).error, "invalid_variant");
});

test("a stock of 0 forces out_of_stock; null prices inherit the item's", () => {
  const r = storedOptions(opts([variant("red", "s", { stock: 0, status: "available" }), variant("red", "m", { price: null, stock: null })]));
  assert.equal(r.value.variants[0].status, "out_of_stock");
  assert.equal(r.value.variants[1].price, null);
  assert.equal(r.value.variants[1].stock, null);
});

test("variants need axes, and at most 200 are allowed", () => {
  assert.equal(storedOptions({ axes: [], variants: [{ choice: {} }] }).error, "invalid_options");
  const big = [{ key: "a", label: "A", display: "button", values: Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, label: `A${i}` })) },
    { key: "b", label: "B", display: "button", values: Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, label: `B${i}` })) }];
  const combos = allCombinations(big);
  assert.equal(combos.length, 201);   // 240 possible, capped at the limit + 1
  assert.equal(storedOptions({ axes: big, variants: combos.slice(0, 200).map((choice) => ({ choice })) }).ok, true);
  assert.equal(storedOptions({ axes: big, variants: combos.map((choice) => ({ choice })) }).error, "too_many_variants");
});

test("a malformed options value is invalid_options", () => {
  for (const o of ["x", [], { axes: "no" }, { variants: {} }, { axes: [], variants: [], extra: 1 }, 5]) assert.equal(storedOptions(o).error, "invalid_options");
});

test("validateOptions reports each problem on its own row", () => {
  const a = axes();
  a[1].values[0].label = "";
  const r = validateOptions(opts([], a));
  assert.equal(r.ok, false);
  assert.ok(r.errors["axes.1.values.0.label"]);
  const v = validateOptions(opts([variant("red", "s", { price: "abc" }), variant("blue", "m", { stock: "x" })]));
  assert.ok(v.errors["variants.0.price"]);
  assert.ok(v.errors["variants.1.stock"]);
  assert.equal(v.value, null);
  assert.equal(validateOptions(opts([variant("red", "s")])).ok, true);
});

test("optionSlug makes readable, unique, valid ids", () => {
  assert.equal(optionSlug("Dark Blue"), "dark-blue");
  assert.equal(optionSlug("Dark Blue", ["dark-blue"]), "dark-blue-2");
  assert.equal(optionSlug("!!!"), "option");
  assert.equal(optionSlug("XL / 42"), "xl-42");
  assert.ok(/^[a-z0-9][a-z0-9_-]*$/.test(optionSlug("  ÉCLAIR  ")));
  assert.ok(optionSlug("x".repeat(100), ["x".repeat(40)]).length <= 40);
});

test("cleanOptionAxes drops blank rows and builds ids from labels", () => {
  const out = cleanOptionAxes([{ label: "", values: [{ label: " " }] }, { label: "Size", display: "button", values: [{ label: "Small" }, { label: "Small" }, { label: "" }] }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, "size");
  assert.deepEqual(out[0].values.map((v) => v.id), ["small", "small-2"]);
  assert.equal(storedOptions({ axes: out, variants: [] }).ok, true);
});

test("comboKey is in axis order and null for anything but a full valid choice", () => {
  assert.equal(comboKey(axes(), { size: "m", color: "red" }), "color=red|size=m");
  assert.equal(comboKey(axes(), { color: "red" }), null);
  assert.equal(comboKey([], {}), null);
});

test("availability: a combination with no row is unavailable, and every value gets its best status", () => {
  const rows = [
    { id: "v1", choice: { color: "red", size: "s" }, status: "available" },
    { id: "v2", choice: { color: "red", size: "m" }, status: "out_of_stock" },
    { id: "v3", choice: { color: "blue", size: "m" }, status: "limited_stock" },
  ];
  const m = buildAvailability(axes(), rows);
  assert.deepEqual(m.axes, ["color", "size"]);
  assert.equal(m.missing, "unavailable");
  assert.equal(m.cells.length, 3);
  assert.deepEqual(m.cells[0], { key: "color=red|size=s", choice: { color: "red", size: "s" }, status: "available", variantId: "v1" });
  assert.deepEqual(m.values.color, { red: "available", blue: "limited_stock" });
  assert.deepEqual(m.values.size, { s: "available", m: "limited_stock", l: "unavailable" });
  // blue/s has no row: absent from cells, which the matrix declares unavailable
  assert.ok(!m.cells.some((c) => c.key === "color=blue|size=s"));
});

test("an item without options returns empty arrays and an empty matrix", () => {
  const e = emptyOptions();
  assert.deepEqual(e.options, []);
  assert.deepEqual(e.variants, []);
  assert.deepEqual(e.optionAvailability, { axes: [], missing: "unavailable", cells: [], values: {} });
  assert.equal(e.sizeChart, null);
  assert.deepEqual(publicOptions({ item: { price: 100 } }), e);
});

test("public payload: inherited price, sale only from the item when the variant has no price, stock shown only when allowed", () => {
  const rows = [
    { id: "a", choice: { color: "red", size: "s" }, price: null, salePrice: null, status: "limited_stock", stock: 2, sku: "R", mediaIds: [MEDIA] },
    { id: "b", choice: { color: "red", size: "m" }, price: 2000, salePrice: 1500, status: "available", stock: 9 },
  ];
  const shown = publicOptions({ axes: axes(), variants: rows, item: { price: 1000, salePrice: 800, showStockCount: true } });
  assert.equal(shown.variants[0].label, "Red / S");
  assert.equal(shown.variants[1].label, "Red / M");
  assert.equal(shown.variants[0].price, 1000);
  assert.equal(shown.variants[0].salePrice, 800);
  assert.equal(shown.variants[0].stockLeft, 2);
  assert.equal(shown.variants[1].price, 2000);
  assert.equal(shown.variants[1].salePrice, 1500);
  assert.equal(shown.variants[1].stockLeft, null);
  assert.equal(publicOptions({ axes: axes(), variants: rows, item: { price: 1000 } }).variants[0].stockLeft, null);
  assert.equal(shown.options[0].values[0].color, "#FF0000");
});

test("legacy variants become one 'option' axis, skipping unusable entries", () => {
  const r = legacyVariantsToOptions([{ id: "small", label: "Small", price: 3500 }, { id: "medium", label: "Medium", price: 2500 }, { label: "" }, { id: "small", label: "Small again" }, "junk"]);
  assert.equal(r.axes.length, 1);
  assert.deepEqual(r.axes[0], { key: "option", label: "Option", display: "button", values: [{ id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "small-4", label: "Small again" }] });
  assert.deepEqual(r.variants.map((v) => [v.key, v.price]), [["option=small", 3500], ["option=medium", 2500], ["option=small-4", null]]);
  assert.equal(storedOptions({ axes: r.axes, variants: r.variants.map(({ choice, price }) => ({ choice, price })) }).ok, true);
  assert.deepEqual(legacyVariantsToOptions([]), { axes: [], variants: [] });
  assert.deepEqual(legacyVariantsToOptions(undefined), { axes: [], variants: [] });
  assert.deepEqual(legacyVariantsToOptions([{ label: "" }]), { axes: [], variants: [] });
});

const chart = { id: "c1", name: "Shoes", category: "fashion", unit: "cm", columns: ["EU", "Foot length"], rows: [["40", "25"], ["41", "25.5"]], active: true };

test("size chart: valid rows, widths and cells", () => {
  const ok = cleanSizeChart({ name: " Shoes ", category: "", unit: "cm", columns: ["EU ", "Foot length"], rows: [["40", "25"]] });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.value, { name: "Shoes", category: null, unit: "cm", columns: ["EU", "Foot length"], rows: [["40", "25"]], active: true });
  assert.ok(cleanSizeChart({ name: "S", columns: ["a"], rows: [["1"]] }).errors.name);
  assert.ok(cleanSizeChart({ name: "Shoes", unit: "yd", columns: ["a"], rows: [["1"]] }).errors.unit);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: ["a", "A"], rows: [["1", "2"]] }).errors.columns);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: Array(13).fill("x").map((x, i) => x + i), rows: [["1"]] }).errors.columns);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: ["a", "b"], rows: [["1"]] }).errors.rows);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: ["a"], rows: [] }).errors.rows);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: ["a"], rows: [["x".repeat(21)]] }).errors.rows);
  assert.ok(cleanSizeChart({ name: "Shoes", columns: ["a"], rows: Array(61).fill(["1"]) }).errors.rows);
});

test("an item shows the chart's rows, or the seller's override when it fits the columns; a retired chart shows nothing", () => {
  assert.deepEqual(sizeChartFor(chart, null).rows, chart.rows);
  assert.equal(sizeChartFor(chart, null).overridden, false);
  const mine = { rows: [["42", "26"]] };
  assert.deepEqual(sizeChartFor(chart, mine).rows, mine.rows);
  assert.equal(sizeChartFor(chart, mine).overridden, true);
  assert.deepEqual(sizeChartFor(chart, { rows: [["42"]] }).rows, chart.rows);   // wrong width: the chart wins
  assert.equal(sizeChartFor({ ...chart, active: false }, null), null);
  assert.equal(sizeChartFor(null, mine), null);
  assert.equal(cleanSizeChartOverride(chart, [["42", "26"]]).ok, true);
  assert.equal(cleanSizeChartOverride(chart, [["42"]]).ok, false);
  assert.equal(cleanSizeChartOverride(chart, "no").ok, false);
});

test("a variant label is its values in axis order, empty when nothing matches", () => {
  assert.equal(variantLabel(axes(), { size: "m", color: "blue" }), "Blue / M");
  assert.equal(variantLabel(axes(), { color: "green" }), "");
  assert.equal(variantLabel([], {}), "");
});

test("statusForChoice and selectableValues agree with a brute-force check over every combination", () => {
  const a3 = [
    { key: "a", label: "A", display: "button", values: ["a0", "a1", "a2", "a3"].map((id) => ({ id, label: id })) },
    { key: "b", label: "B", display: "button", values: ["b0", "b1", "b2"].map((id) => ({ id, label: id })) },
    { key: "c", label: "C", display: "button", values: ["c0", "c1"].map((id) => ({ id, label: id })) },
  ];
  const all = allCombinations(a3);
  const statuses = VARIANT_STATUSES;
  // every third combination has a row, with statuses cycling, so there are plenty of gaps
  const rows = all.filter((_, i) => i % 3 !== 1).map((choice, i) => ({ id: `v${i}`, choice, status: statuses[i % 4] }));
  const m = buildAvailability(a3, rows);
  const RANKS = { available: 4, limited_stock: 3, out_of_stock: 2, unavailable: 1 };
  const byKey = new Map(rows.map((r) => [comboKey(a3, r.choice), r.status]));
  for (const choice of all) assert.equal(statusForChoice(m, choice), byKey.get(comboKey(a3, choice)) ?? "unavailable");
  // incomplete or unknown choices are undetermined, never guessed
  assert.equal(statusForChoice(m, { a: "a0", b: "b0" }), null);
  assert.equal(statusForChoice(m, { a: "a0", b: "b0", c: "zz" }), null);
  assert.equal(statusForChoice(m, null), null);
  assert.equal(statusForChoice(emptyOptions().optionAvailability, {}), null);
  // partial selections, every one of them
  const partials = [{}, { a: "a1" }, { b: "b2" }, { a: "a0", c: "c1" }, { a: "a3", b: "b1" }, { a: "a2", b: "b0", c: "c0" }];
  for (const partial of partials) {
    const got = selectableValues(m, partial);
    for (const axis of a3) for (const v of axis.values) {
      let best = null;
      for (const r of rows) {
        if (r.choice[axis.key] !== v.id) continue;
        if (a3.some((o) => o.key !== axis.key && partial[o.key] !== undefined && r.choice[o.key] !== partial[o.key])) continue;
        if (best === null || RANKS[r.status] > RANKS[best]) best = r.status;
      }
      assert.equal(got[axis.key][v.id], best ?? "unavailable", `${JSON.stringify(partial)} ${axis.key}=${v.id}`);
    }
  }
  // with nothing chosen it is exactly the matrix's own per-value summary
  assert.deepEqual(selectableValues(m, {}), m.values);
  assert.deepEqual(selectableValues(emptyOptions().optionAvailability, { a: "x" }), {});
});

test("choosing a value greys out what only exists in another", () => {
  const rows = [
    { choice: { color: "red", size: "s" }, status: "available" },
    { choice: { color: "blue", size: "m" }, status: "available" },
    { choice: { color: "blue", size: "l" }, status: "out_of_stock" },
  ];
  const m = buildAvailability(axes(), rows);
  assert.deepEqual(selectableValues(m, { color: "red" }).size, { s: "available", m: "unavailable", l: "unavailable" });
  assert.deepEqual(selectableValues(m, { color: "blue" }).size, { s: "unavailable", m: "available", l: "out_of_stock" });
  assert.deepEqual(selectableValues(m, { color: "red" }).color, { red: "available", blue: "available" }, "an axis can always be switched");
  assert.equal(statusForChoice(m, { color: "red", size: "m" }), "unavailable");
});

test("only available and limited-stock variants are purchasable", () => {
  assert.deepEqual(VARIANT_STATUSES.filter((status) => isPurchasable({ status })), ["available", "limited_stock"]);
  assert.equal(isPurchasable(null), false);
  assert.equal(isPurchasable({}), false);
});
