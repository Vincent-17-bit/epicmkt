import test from "node:test";
import assert from "node:assert/strict";
import { SHOE_CHART, compare, format, parse, sizeKey } from "./index.js";
import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "shoe";
parseTable(id, [
  ["EU 42", null, { system: "eu", value: 42 }], ["42 EU", null, { system: "eu", value: 42 }], ["eu42", null, { system: "eu", value: 42 }],
  ["EU 36.5", null, { system: "eu", value: 36.5 }], ["EU 28", null, { system: "eu", value: 28 }], ["UK 8.5", null, { system: "uk", value: 8.5 }],
  ["UK 8 1/2", null, { system: "uk", value: 8.5 }], ["UK 8½", null, { system: "uk", value: 8.5 }],
  ["US 9 men", null, { system: "us-m", value: 9 }], ["US 9 M", null, { system: "us-m", value: 9 }], ["US 10.5 women", null, { system: "us-w", value: 10.5 }],
  ["us 10 (women)", null, { system: "us-w", value: 10 }], ["26.7 cm", null, { system: "cm", value: 26.7, unit: "cm" }],
  ["EU 42 wide", null, { system: "eu", value: 42, width: "wide" }], ["EU 42 · Extra wide", null, { system: "eu", value: 42, width: "extra-wide" }],
  ["eu 38 narrow", null, { system: "eu", value: 38, width: "narrow" }], ["EU 42 regular", null, { system: "eu", value: 42, width: "regular" }],
  ["UK 8 2E", null, { system: "uk", value: 8, width: "wide" }],
  ["42", { system: "eu" }, { system: "eu", value: 42 }], ["US 9", { gender: "men" }, { system: "us-m", value: 9 }], ["US 9", { gender: "women" }, { system: "us-w", value: 9 }],
  ["9", { system: "us-m" }, { system: "us-m", value: 9 }]
]);
errorTable(id, [
  ["", null, "empty"], ["42", null, "system-required"], ["US 9", null, "gender-required"], ["EU 42.3", null, "not-half"], ["EU 60", null, "out-of-range"],
  ["UK 20", null, "out-of-range"], ["UK 2", null, "out-of-range"], ["UK 2 EU 40", null, "not-a-shoe-size"], ["EU 42 4F", null, "not-a-shoe-size"],
  ["UK 42 EU", null, "mixed-systems"], ["26.75 cm", null, "too-precise"], ["EU 42 men", null, "bad-gender"], ["shoe", null, "not-a-shoe-size"], ["5 cm", null, "out-of-range"]
]);
formatTable(id, [
  ["EU 42", null, "EU 42"], ["UK 8.5", null, "UK 8.5"], ["US 9 men", null, "US 9 (men)"], ["US 10.5 women", null, "US 10.5 (women)"], ["26.7 cm", null, "26.7 cm"],
  ["EU 42 wide", null, "EU 42 · Wide"], ["EU 42 extra wide", null, "EU 42 · Extra wide"],
  ["EU 42", { system: "uk" }, "UK 8"], ["EU 42", { system: "us-m" }, "US 9 (men)"], ["EU 42", { system: "us-w" }, "US 10 (women)"], ["EU 42", { system: "cm" }, "26.7 cm"],
  ["UK 8.5", { system: "eu" }, "EU 42.5"], ["US 9 men", { system: "eu" }, "EU 42"], ["26.7 cm", { system: "eu" }, "EU 42"],
  ["EU 28", { system: "uk" }, "EU 28"], ["EU 42 wide", { system: "uk" }, "UK 8 · Wide"]
]);
orderTable(id, ["EU 36", "UK 5", "EU 40", "US 9 men", "EU 44", "UK 11"]);
baseTable(id, [["EU 42", 26.7], ["UK 8", 26.7], ["US 9 men", 26.7], ["US 10 women", 26.7], ["26.7 cm", 26.7]]);
keyTable(id, [["EU 42", "shoe:eu:42"], ["UK 8", "shoe:uk:8"], ["US 9 men", "shoe:us-m:9"], ["26.7 cm", "shoe:cm:26.7:cm"]]);
plausibleTable(id, [["EU 42", "shoes-eu", "size", { ok: true, warn: false }], ["EU 20", "shoes-eu", "size", { ok: true, warn: true }], ["EU 42", null, null, { ok: true, warn: false }]]);

test("shoe: every chart row converts to the same fit in every system", () => {
  for (const r of SHOE_CHART.adult) {
    const eu = parse(id, `EU ${r.eu}`).value;
    assert.equal(format(eu, { system: "uk" }), `UK ${r.uk}`);
    assert.equal(format(eu, { system: "us-m" }), `US ${r.usM} (men)`);
    assert.equal(format(eu, { system: "us-w" }), `US ${r.usW} (women)`);
    assert.equal(format(eu, { system: "cm" }), `${r.cm} cm`);
    for (const sys of ["uk", "us-m", "us-w", "cm"]) {
      const there = parse(id, format(eu, { system: sys })).value;
      assert.equal(format(there, { system: "eu" }), `EU ${r.eu}`, `${sys} back to EU ${r.eu}`);
    }
  }
});
test("shoe: the chart is plain data, strictly increasing in every system", () => {
  assert.equal(JSON.stringify(SHOE_CHART), JSON.stringify(structuredClone(SHOE_CHART)));
  for (const f of ["eu", "uk", "usM", "usW", "cm"]) {
    SHOE_CHART.adult.forEach((r, i) => { if (i) assert.ok(r[f] > SHOE_CHART.adult[i - 1][f], `${f} row ${i}`); });
  }
  assert.ok(SHOE_CHART.kids.every((r, i) => !i || r.cm > SHOE_CHART.kids[i - 1].cm));
  assert.ok(SHOE_CHART.kids.at(-1).eu < SHOE_CHART.adult[0].eu);
});
test("shoe: the same fit in two systems compares equal but keeps different sizeKeys; width breaks ties", () => {
  const a = parse(id, "EU 42").value;
  const b = parse(id, "UK 8").value;
  assert.equal(compare(a, b), 0);
  assert.notEqual(sizeKey(a), sizeKey(b));
  assert.ok(compare(parse(id, "EU 42 narrow").value, parse(id, "EU 42 wide").value) < 0);
  assert.ok(compare(parse(id, "EU 42").value, parse(id, "EU 42 wide").value) < 0);
});
