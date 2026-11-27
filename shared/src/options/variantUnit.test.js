// Per-combination units (migration 0159) and the checks that go with them: the Royco seasoning cubes case, where one item is sold as
// 3 cubes, a pack of 40 and a jar of 48, in three flavours, and the unit "per 3 cubes" used to be shown for every size.
import test from "node:test";
import assert from "node:assert/strict";
import { addAxis, addValue, emptyOptionsForm, optionsFromServer, optionsPayload, priceWarnings, checkOptions, rowKeyOf, setRow } from "./editor.js";
import { groupUnit, inferPriceAxes, priceIssues, setGroupPrice, setGroupUnit, setUnitsByAxis } from "./priceModes.js";
import { publicOptions, validateOptions } from "../seller/options.js";

const build = (spec) => {
  let o = emptyOptionsForm();
  for (const [label, display, values] of spec) {
    o = addAxis(o, { label, display });
    const key = o.axes.at(-1).key;
    for (const v of values) o = addValue(o, key, v).options;
  }
  return o;
};
const royco = () => build([["Flavour", "button", ["Beef", "Chicken", "Chilli"]], ["Size", "button", ["3 Cubes", "Whole Pack (40 x 4g)", "Whole Jar (48 x 4g)"]]]);
const sizeId = (o, n) => o.axes.find((a) => a.key === "size").values[n].id;
const UNITS = (o) => ({ [sizeId(o, 0)]: "per 3 cubes", [sizeId(o, 1)]: "per pack of 40", [sizeId(o, 2)]: "per jar of 48" });
const name = (o) => (r) => o.axes.map((a) => a.values.find((v) => v.id === r.choice[a.key]).label).join(" / ");

// What the seller typed in the screenshots: 10 / 130 / empty, 10 / 140 / empty, empty / empty / 160, item price 10.
const messy = () => {
  let o = royco();
  const set = (flavour, n, price) => { o = setRow(o, rowKeyOf(o, { flavour, size: sizeId(o, n) }), { price }); };
  set("beef", 0, "10"); set("beef", 1, "130");
  set("chicken", 0, "10"); set("chicken", 1, "140");
  set("chilli", 2, "160");
  return o;
};

test("a unit typed for a size lands on every flavour of that size, and can be read back", () => {
  let o = setUnitsByAxis(royco(), "size", UNITS(royco()));
  assert.equal(o.rows.filter((r) => r.unit === "per jar of 48").length, 3);
  assert.equal(groupUnit(o, ["size"], { size: sizeId(o, 2) }), "per jar of 48");
  o = setGroupUnit(o, ["size"], { size: sizeId(o, 2) }, "");
  assert.equal(groupUnit(o, ["size"], { size: sizeId(o, 2) }), "", "blank clears it");
  assert.equal(o.rows.filter((r) => r.unit === "per 3 cubes").length, 3, "the other sizes are untouched");
});

test("the save payload carries the unit, and a cleared unit is sent as null only when one was saved", () => {
  let o = setUnitsByAxis(royco(), "size", UNITS(royco()));
  const sent = optionsPayload(o).variants;
  assert.equal(sent.find((v) => v.choice.size === sizeId(o, 2)).unit, "per jar of 48");
  assert.equal(checkOptions(o).ok, true);

  const plain = optionsPayload(royco()).variants;
  assert.ok(plain.every((v) => !("unit" in v)), "no unit typed and none saved: the key is left out, so a database without 0159 still accepts the save");

  const loaded = optionsFromServer({ axes: o.axes.map((a) => ({ ...a })), variants: o.rows.map((r) => ({ choice: r.choice, price: 10, unit: r.unit })) });
  assert.equal(loaded.rows[0].unit.length > 0, true);
  const cleared = setGroupUnit(loaded, ["size"], { size: sizeId(o, 0) }, "");
  const out = optionsPayload(cleared).variants.filter((v) => v.choice.size === sizeId(o, 0));
  assert.ok(out.every((v) => v.unit === null), "a saved unit that was cleared is sent as null so the database clears it");
});

test("the check refuses a unit that is not text or is too long, and trims the rest", () => {
  const o = royco();
  const variants = (unit) => o.rows.map((r) => ({ choice: r.choice, price: 10, unit }));
  const axes = optionsPayload(o).axes;
  assert.equal(validateOptions({ axes, variants: variants("  per jar  ") }).ok, true);
  assert.equal(validateOptions({ axes, variants: variants("  per jar  ") }).value.variants[0].unit, "per jar");
  assert.equal(validateOptions({ axes, variants: variants("") }).value.variants[0].unit, null);
  assert.equal(validateOptions({ axes, variants: variants(null) }).value.variants[0].unit, null);
  assert.equal(validateOptions({ axes, variants: variants(5) }).ok, false);
  assert.equal(validateOptions({ axes, variants: variants("x".repeat(31)) }).ok, false);
  assert.equal(validateOptions({ axes, variants: variants("x".repeat(30)) }).ok, true);
});

test("the buyer's payload has each combination's own unit, or null so the item's unit applies", () => {
  const o = setUnitsByAxis(royco(), "size", { [sizeId(royco(), 2)]: "per jar of 48" });
  const variants = optionsPayload(o).variants.map((v) => ({ ...v, price: 10, status: "available" }));
  const pub = publicOptions({ axes: optionsPayload(o).axes, variants, item: { price: 10 } });
  const jar = pub.optionVariants.find((v) => v.choice.size === sizeId(o, 2));
  const cubes = pub.optionVariants.find((v) => v.choice.size === sizeId(o, 0));
  assert.equal(jar.unit, "per jar of 48");
  assert.equal(cubes.unit, null);
});

test("far-from-the-others compares only combinations sold by the same unit", () => {
  let o = royco();
  const price = { 0: "10", 1: "130", 2: "160" };
  for (const f of ["beef", "chicken", "chilli"]) for (const n of [0, 1, 2]) o = setRow(o, rowKeyOf(o, { flavour: f, size: sizeId(o, n) }), { price: price[n] });
  assert.ok(priceIssues(o, { name: name(o) }).some((i) => i.kind === "far"), "with one shared unit, 10 next to 130 and 160 looks like a typing mistake");
  assert.ok(Object.keys(priceWarnings(o)).length > 0);

  const withUnits = setUnitsByAxis(o, "size", UNITS(o));
  assert.deepEqual(priceIssues(withUnits, { name: name(withUnits) }).filter((i) => i.kind === "far"), [], "a sachet and a jar are not compared");
  assert.deepEqual(priceWarnings(withUnits), {});

  // A real slip is still caught inside one size: the Chilli jar typed as 16 next to 160 and 160.
  const slip = setRow(withUnits, rowKeyOf(withUnits, { flavour: "chilli", size: sizeId(o, 2) }), { price: "16" });
  const found = priceIssues(slip, { name: name(slip) }).filter((i) => i.kind === "far");
  assert.equal(found.length, 1);
  assert.match(found[0].text, /^Chilli \/ Whole Jar \(48 x 4g\) is far below/);
  assert.equal(Object.keys(priceWarnings(slip)).length, 1);
});

test("a combination with no price of its own, next to priced ones, is pointed out instead of quietly costing the item price", () => {
  const o = messy();
  const issues = priceIssues(o, { itemPrice: "10", name: name(o) });
  const inherited = issues.filter((i) => i.kind === "inherited");
  assert.equal(inherited.length, 4, "Beef jar, Chicken jar, Chilli 3 cubes, Chilli pack");
  assert.match(inherited[0].text, /buyers pay the item price \(KES 10\)/);
  assert.equal(issues.some((i) => i.kind === "missing"), false);
  assert.equal(priceIssues(royco(), { itemPrice: "10" }).length, 0, "no prices typed at all: every row simply uses the item price, nothing to point out");
  assert.equal(checkOptions(o).ok, true, "it is advice and never blocks a save");
});

test("half-filled prices already show that Size and Flavour change the price", () => {
  assert.deepEqual(inferPriceAxes(messy()).sort(), ["flavour", "size"]);
  let o = setGroupPrice(royco(), ["size"], { size: sizeId(royco(), 0) }, "10");
  assert.deepEqual(inferPriceAxes(o), [], "one price typed so far says nothing yet");
});
