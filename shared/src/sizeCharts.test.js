import { test } from "node:test";
import assert from "node:assert/strict";
import { SHOE_CHART } from "./scales/shoeChart.js";
import { scales } from "./index.js";
import {
  SEED_SIZE_CHARTS, SHOE_SYSTEM_IDS, cleanShoeConversion, convertShoe, pickSizeChart, shoeChartFrom, shoeChartRows, shoeTable
} from "./sizeCharts.js";
import { cleanSizeChart } from "./seller/options.js";

const ok = (v, to, chart) => { const r = convertShoe(v, to, chart); assert.equal(r.ok, true, JSON.stringify(r)); return r.value; };

// [from, to, expected stored value (without scale)]
const CONVERSIONS = [
  [{ system: "eu", value: 42 }, "uk", { system: "uk", value: 8 }],
  [{ system: "eu", value: 42 }, "us-m", { system: "us-m", value: 9 }],
  [{ system: "eu", value: 42 }, "us-w", { system: "us-w", value: 10 }],
  [{ system: "eu", value: 42 }, "cm", { system: "cm", value: 26.7, unit: "cm" }],
  [{ system: "uk", value: 8 }, "eu", { system: "eu", value: 42 }],
  [{ system: "us-m", value: 9 }, "eu", { system: "eu", value: 42 }],
  [{ system: "us-w", value: 10 }, "uk", { system: "uk", value: 8 }],
  [{ system: "cm", value: 26.7, unit: "cm" }, "eu", { system: "eu", value: 42 }],
  [{ system: "eu", value: 35 }, "uk", { system: "uk", value: 2.5 }],
  [{ system: "eu", value: 48 }, "us-w", { system: "us-w", value: 14.5 }],
  [{ system: "eu", value: 42.5 }, "uk", { system: "uk", value: 8.5 }],
  [{ system: "uk", value: 8.5 }, "eu", { system: "eu", value: 42.5 }],
  [{ system: "eu", value: 28 }, "cm", { system: "cm", value: 17.4, unit: "cm" }],
  [{ system: "eu", value: 20 }, "cm", { system: "cm", value: 12.1, unit: "cm" }],
  [{ system: "cm", value: 17.4, unit: "cm" }, "eu", { system: "eu", value: 28 }],
  [{ system: "eu", value: 42 }, "eu", { system: "eu", value: 42 }]
];
for (const [from, to, want] of CONVERSIONS) {
  test(`convertShoe: ${from.system} ${from.value} -> ${to} = ${want.value}`, () => assert.deepEqual(ok(from, to), { scale: "shoe", ...want }));
}
test("convertShoe: a width goes with the size; text input works; the stored value is not changed", () => {
  const v = Object.freeze({ system: "eu", value: 42, width: "wide" });
  assert.deepEqual(ok(v, "uk"), { scale: "shoe", system: "uk", value: 8, width: "wide" });
  assert.deepEqual(ok("EU 42 narrow", "us-m"), { scale: "shoe", system: "us-m", value: 9, width: "narrow" });
  assert.deepEqual(ok("US 10 women", "eu"), { scale: "shoe", system: "eu", value: 42 });
  assert.deepEqual(ok("26.7 cm", "uk"), { scale: "shoe", system: "uk", value: 8 });
  assert.deepEqual(ok({ scale: "shoe", system: "uk", value: 8 }, "eu"), { scale: "shoe", system: "eu", value: 42 });
  assert.deepEqual(v, { system: "eu", value: 42, width: "wide" });
});
test("convertShoe: every adult row converts to every system and back to itself", () => {
  for (const row of SHOE_CHART.adult) {
    const from = [["eu", row.eu], ["uk", row.uk], ["us-m", row.usM], ["us-w", row.usW]];
    for (const [sys, n] of from) for (const [to, expect] of from) {
      assert.equal(ok({ system: sys, value: n }, to).value, expect, `${sys} ${n} -> ${to}`);
    }
    assert.equal(ok({ system: "cm", value: row.cm, unit: "cm" }, "eu").value, row.eu);
  }
});
test("convertShoe: refuses what it cannot answer, with a code and a message", () => {
  const bad = (v, to, code) => {
    const r = convertShoe(v, to);
    assert.equal(r.ok, false, JSON.stringify(v));
    assert.equal(r.error.code, code);
    assert.equal(typeof r.error.message, "string");
  };
  bad({ system: "eu", value: 42 }, "zz", "unknown-system");
  bad({ system: "eu", value: 42 }, undefined, "unknown-system");
  bad({ system: "eu", value: 28 }, "uk", "no-equivalent"); // kids sizes have no UK or US size in the chart
  bad({ system: "eu", value: 60 }, "uk", "out-of-range");
  bad({ system: "eu", value: 5 }, "cm", "out-of-range");
  bad({ system: "xx", value: 42 }, "uk", "not-a-shoe-size");
  bad({ system: "eu", value: "42" }, "uk", "not-a-shoe-size");
  bad({ system: "eu" }, "uk", "not-a-shoe-size");
  bad(null, "uk", "not-a-shoe-size");
  bad(42, "uk", "not-a-shoe-size");
  bad("42", "uk", "system-required");
  bad("US 9", "uk", "gender-required");
  bad("EU 42.3", "uk", "not-half");
  bad("boots", "uk", "not-a-shoe-size");
  bad("", "uk", "empty");
});
test("convertShoe: uses the chart it is given (an admin's edit), and the default is A02's SHOE_CHART", () => {
  const edited = shoeChartFrom({ chart: { adult: SHOE_CHART.adult.map((r) => ({ ...r, cm: Math.round((r.cm + 1) * 10) / 10 })), kids: SHOE_CHART.kids.map((r) => ({ ...r, cm: Math.round((r.cm + 1) * 10) / 10 })) }, version: 7 });
  assert.equal(edited.version, 7);
  assert.equal(ok({ system: "eu", value: 42 }, "cm", edited).value, 27.7);
  assert.equal(ok({ system: "eu", value: 42 }, "cm").value, 26.7);
  assert.equal(ok({ system: "cm", value: 27.7, unit: "cm" }, "uk", edited).value, 8);
  const custom = shoeChartFrom({ chart: { adult: [{ eu: 40, uk: 6, usM: 7, usW: 8, cm: 25 }, { eu: 42, uk: 8, usM: 9, usW: 10, cm: 27 }] } });
  assert.equal(ok({ system: "eu", value: 41 }, "cm", custom).value, 26);
  assert.equal(convertShoe({ system: "eu", value: 35 }, "cm", custom).ok, false, "outside the edited chart");
});
test("convertShoe: the chart's systems are the ones A02's shoe scale knows", () => {
  assert.deepEqual([...SHOE_SYSTEM_IDS], ["eu", "uk", "us-m", "us-w", "cm"]);
  const sample = { eu: "EU 42", uk: "UK 8", "us-m": "US 9 men", "us-w": "US 10 women", cm: "26.7 cm" };
  for (const sys of SHOE_SYSTEM_IDS) assert.equal(scales.parse("shoe", sample[sys]).value.system, sys, sys);
});

test("shoeChartFrom and shoeChartRows: round trip, and an empty row means the default", () => {
  assert.equal(shoeChartFrom(null), SHOE_CHART);
  assert.equal(shoeChartFrom({}), SHOE_CHART);
  assert.deepEqual(shoeChartRows(), { adult: SHOE_CHART.adult, kids: SHOE_CHART.kids });
  const back = shoeChartFrom({ chart: shoeChartRows(), version: 3 });
  assert.deepEqual([back.adult, back.kids, back.systems, back.widths, back.version], [SHOE_CHART.adult, SHOE_CHART.kids, SHOE_CHART.systems, SHOE_CHART.widths, 3]);
  const copy = shoeChartRows(); copy.adult[0].eu = 99;
  assert.equal(SHOE_CHART.adult[0].eu, 35, "shoeChartRows copies");
});

const rows = () => shoeChartRows();
const CLEAN = [
  ["the default chart", rows(), true], ["no kids", { adult: rows().adult }, true], ["two adult rows", { adult: rows().adult.slice(0, 2) }, true],
  ["one adult row", { adult: rows().adult.slice(0, 1) }, false], ["no chart", null, false], ["a list", [], false], ["text", "x", false],
  ["extra top-level key", { ...rows(), widths: [] }, false],
  ["EU not rising", (() => { const x = rows(); x.adult[3].eu = x.adult[2].eu; return x; })(), false],
  ["cm falls", (() => { const x = rows(); x.adult[5].cm = 20; return x; })(), false],
  ["adult UK missing", (() => { const x = rows(); x.adult[2].uk = null; return x; })(), false],
  ["kids overlap adult", (() => { const x = rows(); x.kids[15].cm = 22.5; return x; })(), false],
  ["size as text", (() => { const x = rows(); x.adult[0].eu = "35"; return x; })(), false],
  ["extra column", (() => { const x = rows(); x.adult[0].width = 1; return x; })(), false],
  ["row is a list", (() => { const x = rows(); x.adult[0] = [1]; return x; })(), false],
  ["cm too big", (() => { const x = rows(); x.adult[13].cm = 41; return x; })(), false],
  ["NaN", (() => { const x = rows(); x.adult[0].cm = NaN; return x; })(), false]
];
for (const [name, chart, want] of CLEAN) {
  test(`cleanShoeConversion: ${name} is ${want ? "accepted" : "refused with messages"}`, () => {
    const r = cleanShoeConversion(chart);
    assert.equal(r.ok, want);
    if (want) { assert.deepEqual(r.errors, []); assert.deepEqual(r.value.adult, chart.adult); assert.deepEqual(r.value.kids, chart.kids ?? []); }
    else { assert.equal(r.value, null); assert.ok(r.errors.length > 0 && r.errors.every((e) => typeof e === "string")); }
  });
}

test("shoeTable: men's, women's and kids' rows for the buyer", () => {
  const men = shoeTable(SHOE_CHART, "men"), women = shoeTable(SHOE_CHART, "women"), kids = shoeTable(SHOE_CHART, "kids");
  assert.deepEqual(men.find((r) => r.eu === 42), { eu: 42, uk: 8, us: 9, cm: 26.7 });
  assert.deepEqual(women.find((r) => r.eu === 42), { eu: 42, uk: 8, us: 10, cm: 26.7 });
  assert.deepEqual(kids[0], { eu: 19, cm: 11.4 });
  assert.equal(men.length, SHOE_CHART.adult.length);
  assert.equal(kids.length, SHOE_CHART.kids.length);
  assert.deepEqual(shoeTable(), men);
});

test("SEED_SIZE_CHARTS: five valid charts, each passing the admin chart rules, with the right shape", () => {
  assert.deepEqual(SEED_SIZE_CHARTS.map((c) => c.name), ["Dresses and tops (cm)", "Shirt collar", "Men's shoes", "Women's shoes", "Kids clothes (age)"]);
  assert.deepEqual(SEED_SIZE_CHARTS.map((c) => c.productTypeIds), [["dress"], ["shirt"], [], [], []], "a type has one default chart; shoes are picked per item");
  for (const c of SEED_SIZE_CHARTS) {
    const r = cleanSizeChart({ name: c.name, unit: c.unit, columns: c.columns, rows: c.rows });
    assert.equal(r.ok, true, `${c.name}: ${JSON.stringify(r.errors)}`);
    assert.ok(c.rows.every((row) => row.length === c.columns.length));
    assert.ok(c.productTypeIds.every((t) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(t)));
  }
  const dress = SEED_SIZE_CHARTS[0];
  assert.deepEqual(dress.rows.map((r) => r[0]), ["XS", "S", "M", "L", "XL"]);
  const num = (x) => Number(x);
  for (let i = 1; i < dress.rows.length; i += 1) for (const k of [1, 2, 3]) assert.ok(num(dress.rows[i][k]) > num(dress.rows[i - 1][k]), `dress column ${k} rises`);
  assert.equal(new Set(SEED_SIZE_CHARTS.map((c) => c.name.toLowerCase())).size, 5);
});
test("SEED_SIZE_CHARTS: the shoe charts are the shoe conversion chart, not a second copy", () => {
  const men = SEED_SIZE_CHARTS[2], women = SEED_SIZE_CHARTS[3];
  assert.deepEqual(men.rows.map((r) => r.map(Number)), shoeTable(SHOE_CHART, "men").map((r) => [r.eu, r.uk, r.us, r.cm]));
  assert.deepEqual(women.rows.map((r) => r.map(Number)), shoeTable(SHOE_CHART, "women").map((r) => [r.eu, r.uk, r.us, r.cm]));
});

const chart = (o) => ({ id: "c1", name: "Chart", category: null, unit: "cm", columns: ["A", "B"], rows: [["1", "2"]], active: true, productTypeIds: [], ...o });
test("pickSizeChart: the item's own chart wins, then the product type's, then the category's untyped chart", () => {
  const own = chart({ id: "own" }), typed = chart({ id: "typed", productTypeIds: ["dress"] }), cat = chart({ id: "cat", category: "fashion" });
  const charts = [cat, typed, own];
  assert.equal(pickSizeChart({ item: { sizeChartId: "own", productTypeId: "dress", category: "fashion" }, charts }).id, "own");
  assert.equal(pickSizeChart({ item: { productTypeId: "dress", category: "fashion" }, charts }).id, "typed");
  assert.equal(pickSizeChart({ item: { productTypeId: "shirt", category: "fashion" }, charts }).id, "cat");
  assert.equal(pickSizeChart({ item: { category: "fashion" }, charts }).id, "cat");
  assert.equal(pickSizeChart({ item: { productTypeId: "shirt", category: "other" }, charts }), null);
  assert.equal(pickSizeChart({ item: {}, charts }), null);
  assert.equal(pickSizeChart({}), null);
  assert.equal(pickSizeChart({ item: { sizeChartId: "own" }, charts: [] }), null);
});
test("pickSizeChart: the seller's override applies to the item's own chart only; it must still fit; inactive charts are skipped", () => {
  const own = chart({ id: "own" }), typed = chart({ id: "typed", productTypeIds: ["dress"] });
  const fits = { rows: [["9", "8"], ["7", "6"]] };
  const a = pickSizeChart({ item: { sizeChartId: "own", sizeChartOverride: fits }, charts: [own] });
  assert.deepEqual([a.rows, a.overridden], [fits.rows, true]);
  const b = pickSizeChart({ item: { sizeChartId: "own", sizeChartOverride: { rows: [["9"]] } }, charts: [own] });
  assert.deepEqual([b.rows, b.overridden], [own.rows, false]);
  const c = pickSizeChart({ item: { productTypeId: "dress", sizeChartOverride: fits }, charts: [typed] });
  assert.equal(c.overridden, false);
  assert.equal(pickSizeChart({ item: { sizeChartId: "own" }, charts: [chart({ id: "own", active: false })] }), null);
  assert.equal(pickSizeChart({ item: { productTypeId: "dress" }, charts: [chart({ id: "t", productTypeIds: ["dress"], active: false })] }), null);
});
test("pickSizeChart: the item's product type can carry its chart (ProductType.sizeChartId), and an item's own chart still wins", () => {
  const a = chart({ id: "a" }), b = chart({ id: "b" });
  assert.equal(pickSizeChart({ item: { productTypeId: "dress" }, type: { id: "dress", sizeChartId: "b" }, charts: [a, b] }).id, "b");
  assert.equal(pickSizeChart({ item: {}, type: { id: "dress", sizeChartId: "b" }, charts: [a, b] }).id, "b");
  assert.equal(pickSizeChart({ item: { sizeChartId: "a" }, type: { id: "dress", sizeChartId: "b" }, charts: [a, b] }).id, "a");
  assert.equal(pickSizeChart({ item: {}, type: { id: "dress", sizeChartId: "gone" }, charts: [a, b] }), null);
  assert.equal(pickSizeChart({ item: { category: "fashion" }, type: { id: "dress", sizeChartId: "gone" }, charts: [chart({ id: "c", category: "fashion" })] }).id, "c");
});
test("pickSizeChart: reads the database's snake_case product_type_ids too", () => {
  const dbRow = { id: "d", name: "Dress", category: null, unit: "cm", columns: ["A"], rows: [["1"]], product_type_ids: ["dress"] };
  assert.equal(pickSizeChart({ item: { productTypeId: "dress" }, charts: [dbRow] }).id, "d");
});
