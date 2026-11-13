import test from "node:test";
import assert from "node:assert/strict";
import { addAxis, addValue, emptyOptionsForm, rowKeyOf, setBasePlusDifference, setRow, setSold, checkOptions, optionsPayload } from "./editor.js";
import { collapseToPriceAxes, groupPrice, groupSold, setGroupSold, inferPriceAxes, priceIssues, priceLayout, setGroupPrice, setRelativePrice } from "./priceModes.js";

const build = (spec) => {
  let o = emptyOptionsForm();
  for (const [label, display, values] of spec) {
    o = addAxis(o, { label, display });
    const key = o.axes.at(-1).key;
    for (const v of values) o = addValue(o, key, v).options;
  }
  return o;
};
const phone = () => build([["Color", "swatch", ["Black", "Grey", "Blue"]], ["Storage", "button", ["128 GB", "256 GB", "512 GB"]]]);
const colorOnly = () => build([["Color", "swatch", ["Black", "Grey"]]]);
const priceOf = (o, k) => o.rows.find((r) => rowKeyOf(o, r.choice) === k).price;
const prices = (o) => Object.fromEntries(o.rows.map((r) => [rowKeyOf(o, r.choice), r.price]));

test("layout: one price option is a list, two a grid, three or more the full table, none a single price", () => {
  assert.equal(priceLayout([]), "single");
  assert.equal(priceLayout(["color"]), "list");
  assert.equal(priceLayout(["color", "storage"]), "grid");
  assert.equal(priceLayout(["a", "b", "c"]), "table");
});

test("color only: Black 25,000 and Grey 24,000 by list", () => {
  let o = colorOnly();
  o = setGroupPrice(o, ["color"], { color: "black" }, "25000");
  o = setGroupPrice(o, ["color"], { color: "grey" }, "24000");
  assert.equal(priceOf(o, "color=black"), "25000");
  assert.equal(priceOf(o, "color=grey"), "24000");
  assert.deepEqual(inferPriceAxes(o), ["color"]);
  assert.equal(groupPrice(o, ["color"], { color: "grey" }), "24000");
});

test("a list price covers every combination with that color, and Not sold ones keep their own", () => {
  let o = setSold(phone(), "color=grey|storage=512-gb", false);
  o = setGroupPrice(o, ["color"], { color: "grey" }, "24000");
  assert.equal(priceOf(o, "color=grey|storage=128-gb"), "24000");
  assert.equal(priceOf(o, "color=grey|storage=256-gb"), "24000");
  assert.equal(priceOf(o, "color=grey|storage=512-gb"), "", "not sold is untouched");
  assert.equal(priceOf(o, "color=black|storage=128-gb"), "", "other colors are untouched");
});

test("list, grid and base + difference store identical absolute prices", () => {
  const base = { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" };
  const viaDiff = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base, diff: { grey: "-1000" } });
  let viaGrid = phone();
  for (const [s, b] of Object.entries(base)) for (const [c, d] of [["black", 0], ["grey", -1000], ["blue", 0]]) viaGrid = setGroupPrice(viaGrid, ["color", "storage"], { color: c, storage: s }, String(Number(b) + d));
  assert.deepEqual(prices(viaGrid), prices(viaDiff));
  assert.equal(priceOf(viaGrid, "color=grey|storage=256-gb"), "24000");
  assert.deepEqual(inferPriceAxes(viaGrid).sort(), ["color", "storage"]);
  // list on one axis: storage only, same prices for every color
  let viaList = phone();
  for (const [s, b] of Object.entries(base)) viaList = setGroupPrice(viaList, ["storage"], { storage: s }, b);
  assert.equal(priceOf(viaList, "color=blue|storage=512-gb"), "30000");
  assert.deepEqual(inferPriceAxes(viaList), ["storage"]);
  assert.equal(optionsPayload(viaGrid).variants.find((v) => v.choice.color === "grey" && v.choice.storage === "256-gb").price, 24000);
});

test("untick an option: it stops changing the price, using the first price in each group", () => {
  let o = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: { grey: "-1000" } });
  o = collapseToPriceAxes(o, ["storage"]);
  assert.equal(priceOf(o, "color=grey|storage=256-gb"), "25000");
  assert.equal(priceOf(o, "color=blue|storage=512-gb"), "30000");
  assert.deepEqual(inferPriceAxes(o), ["storage"]);
  assert.deepEqual(inferPriceAxes(emptyOptionsForm()), []);
});

test("Grey = Black - 1,000 sets each grey combination from the matching black one", () => {
  let o = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: {} });
  o = setRelativePrice(o, "color", "grey", "black", "-1000");
  assert.equal(priceOf(o, "color=grey|storage=128-gb"), "21000");
  assert.equal(priceOf(o, "color=grey|storage=512-gb"), "29000");
  assert.equal(priceOf(o, "color=blue|storage=512-gb"), "30000");
  assert.equal(setRelativePrice(colorOnly(), "color", "grey", "black", "-1000").rows[1].price, "", "no black price: left alone");
  const low = setRelativePrice(setGroupPrice(colorOnly(), ["color"], { color: "black" }, "500"), "color", "grey", "black", "-900");
  assert.equal(low.rows[1].price, "", "a result at or below zero is not applied");
  assert.equal(setRelativePrice(colorOnly(), "color", "grey", "black", "abc").rows[1].price, "");
});

test("warnings: a missing price and a far price are plain advice, never a block", () => {
  const name = (o) => (r) => o.axes.map((a) => a.values.find((v) => v.id === r.choice[a.key]).label).join(" ");
  let o = setBasePlusDifference(phone(), { baseAxis: "storage", diffAxis: "color", base: { "128-gb": "22000", "256-gb": "25000", "512-gb": "30000" }, diff: {} });
  assert.deepEqual(priceIssues(o), []);
  o = setRow(o, "color=blue|storage=128-gb", { price: "" });
  o = setRow(o, "color=black|storage=256-gb", { price: "2400" });
  const issues = priceIssues(o, { name: name(o) });
  const missing = issues.find((i) => i.kind === "missing");
  assert.equal(missing.key, "color=blue|storage=128-gb");
  assert.equal(missing.text, "Blue 128 GB has no price.");
  assert.match(issues.find((i) => i.kind === "far").text, /^Black 256 GB is far below/);
  assert.equal(checkOptions(o).ok, true);
  assert.deepEqual(priceIssues(o, { itemPrice: "20000" }).filter((i) => i.kind === "missing"), [], "the item price covers a blank row");
  const sold = setSold(o, "color=blue|storage=128-gb", false);
  assert.equal(priceIssues(sold).some((i) => i.kind === "missing"), false, "a Not sold combination needs no price");
});

test("a combination that is not sold is reported as not sold, and can be put back on sale", () => {
  let o = phone();
  o = setSold(o, "color=grey|storage=256-gb", false);
  assert.equal(groupSold(o, ["color", "storage"], { color: "grey", storage: "256-gb" }), false);
  assert.equal(groupSold(o, ["color", "storage"], { color: "grey", storage: "128-gb" }), true);
  assert.equal(groupSold(o, ["storage"], { storage: "256-gb" }), true);
  o = setGroupSold(o, ["color", "storage"], { color: "grey", storage: "256-gb" }, true);
  assert.equal(groupSold(o, ["color", "storage"], { color: "grey", storage: "256-gb" }), true);
  o = setGroupSold(o, ["storage"], { storage: "512-gb" }, false);
  assert.deepEqual(o.rows.filter((r) => !r.sold).map((r) => rowKeyOf(o, r.choice)).sort(), ["color=black|storage=512-gb", "color=blue|storage=512-gb", "color=grey|storage=512-gb"]);
});

test("a drink priced by volume: 250 ml and 500 ml each keep their own price", () => {
  let o = emptyOptionsForm();
  o = addAxis(o, { label: "Volume", display: "button" });
  for (const v of ["250 ml", "500 ml"]) o = addValue(o, "volume", v).options;
  o = setGroupPrice(o, ["volume"], { volume: "250-ml" }, "300");
  o = setGroupPrice(o, ["volume"], { volume: "500-ml" }, "700");
  assert.deepEqual(o.rows.map((r) => r.price), ["300", "700"]);
});
