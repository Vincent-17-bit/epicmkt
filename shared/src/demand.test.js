import test from "node:test";
import assert from "node:assert/strict";
import { demandCsv, demandLine, demandSuggestion, filterLabel, noMatch, prettyValue, wantedFilters } from "./demand.js";
import { getFixture } from "./contracts/index.js";

const phone = getFixture("fx-phone").detail;
const axes = phone.options;
const variants = phone.optionVariants ?? phone.variants;

test("values read the way a person writes them", () => {
  assert.equal(prettyValue("samsung"), "Samsung");
  assert.equal(prettyValue("512 gb"), "512 GB");
  assert.equal(prettyValue("e27"), "E27");
  assert.equal(filterLabel({ storage: "512 gb", brand: "samsung" }), "Samsung, 512 GB");
  assert.equal(filterLabel(null), "");
  assert.equal(demandLine(12, { brand: "samsung", storage: "512 gb" }), "12 shoppers looked for Samsung, 512 GB");
  assert.equal(demandLine(1, {}), "1 shopper looked for something you do not list");
  assert.equal(demandSuggestion({ brand: "samsung", storage: "512 gb" }, "Galaxy"), "Add 512 GB (Samsung) as an option to Galaxy.");
  assert.equal(demandSuggestion({}, "x"), null);
});

test("a combination that is on sale is a match; one that is not is a no-match with the closest ones", () => {
  const grey64 = { colour: "grey", storage: "64-gb" };
  assert.equal(noMatch(axes, variants, grey64), null);
  const black256 = { colour: "black", storage: "256-gb" };   // sold out in the fixture
  const miss = noMatch(axes, variants, black256);
  assert.ok(miss, "sold out is a no-match");
  assert.equal(miss.filters.colour, "Black"); assert.equal(miss.filters.storage, "256 GB");
  assert.ok(miss.closest.length >= 1 && miss.closest.length <= 3);
  assert.ok(miss.closest.every((v) => v.choice.colour === "black" || v.choice.storage === "256-gb"));
  const nothing = noMatch(axes, variants, { colour: "pink", storage: "9-tb" });
  assert.equal(nothing.reason, "not_sold"); assert.deepEqual(nothing.closest, []);
  assert.equal(noMatch([], [], { a: 1 }), null);
  assert.equal(noMatch(axes, variants, null), null);
});

test("wanted filters carry safe keys and the label the buyer saw", () => {
  assert.deepEqual(wantedFilters([{ key: "Colour!", values: [{ id: "a", label: "Wine red" }] }, { key: "9x", values: [{ id: "b", label: "z" }] }], { "Colour!": "a", "9x": "b" }), { colour: "Wine red" });
});

test("the CSV quotes, doubles quotes and defuses formulas", () => {
  const csv = demandCsv([{ categoryId: "electronics", productTypeId: "phone", filters: { brand: "=cmd", n: 'a"b' }, count: 4, shops: [{ name: "Shop, One", count: 3 }] }], { period: 30, names: { electronics: "Electronics" } });
  const [head, line] = csv.trim().split("\r\n");
  assert.equal(head, "category,product type,filters,shoppers,top shops,period (days)");
  assert.ok(line.startsWith("Electronics,phone,"));
  assert.ok(line.includes('"\'=cmd, A\\"b"') === false);
  assert.ok(line.includes("'=cmd"), line);
  assert.ok(line.includes('"Shop, One (3)"'));
  assert.ok(line.endsWith(",30"));
});
