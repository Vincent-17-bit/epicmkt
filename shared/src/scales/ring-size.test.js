import test from "node:test";
import assert from "node:assert/strict";
import { compare, format, parse } from "./index.js";
import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "ring-size";
parseTable(id, [
  ["US 7", null, { system: "us", value: 7 }], ["7.5", null, { system: "us", value: 7.5 }], ["us 7 1/2", null, { system: "us", value: 7.5 }],
  ["UK N", null, { system: "uk", value: "N" }], ["UK N 1/2", null, { system: "uk", value: "N½" }], ["n½", null, { system: "uk", value: "N½" }], ["UK L", null, { system: "uk", value: "L" }],
  ["Z+1", null, { system: "uk", value: "Z+1" }], ["uk z + 2", null, { system: "uk", value: "Z+2" }],
  ["EU 54", null, { system: "eu", value: 54 }], ["54", null, { system: "eu", value: 54 }], ["54 mm", null, { system: "eu", value: 54 }], ["7", { system: "us" }, { system: "us", value: 7 }]
]);
errorTable(id, [
  ["", null, "empty"], ["US 2", null, "out-of-range"], ["US 14", null, "out-of-range"], ["US 7.3", null, "not-half"], ["EU 30", null, "out-of-range"], ["EU 54.5", null, "not-whole"],
  ["UK E", null, "out-of-range"], ["UK Z+3", null, "not-a-ring-size"], ["UK Z½", null, "out-of-range"], ["20", null, "system-required"], ["UK 7", null, "bad-uk"], ["ring", null, "not-a-ring-size"], ["US 7 EU", null, "mixed-systems"]
]);
formatTable(id, [
  ["US 7", null, "US 7"], ["UK N 1/2", null, "UK N½"], ["EU 54", null, "EU 54"], ["Z+1", null, "UK Z+1"],
  ["US 7", { system: "uk" }, "UK N"], ["US 7", { system: "eu" }, "EU 54"], ["UK N", { system: "us" }, "US 7"], ["UK N", { system: "eu" }, "EU 54"], ["EU 54", { system: "us" }, "US 7"],
  ["US 3", { system: "uk" }, "UK F"], ["US 13", { system: "uk" }, "UK Z"], ["US 3", { system: "eu" }, "EU 44"], ["US 7.5", { system: "us" }, "US 7.5"], ["EU 72", { system: "us" }, "EU 72"]
]);
orderTable(id, ["US 5", "EU 52", "UK N", "US 8", "EU 60", "UK Y"]);
baseTable(id, [["US 7", 54.4], ["EU 54", 54], ["UK L", 51.9], ["UK N", 54.44], ["US 3", 44.2]]);
keyTable(id, [["US 7", "ring-size:us:7"], ["UK N", "ring-size:uk:N"], ["EU 54", "ring-size:eu:54"]]);
plausibleTable(id, [["US 7", null, null, { ok: true, warn: false }]]);

test("ring-size: a US size round trips through UK and EU within half a size", () => {
  for (let us = 3; us <= 13; us += 0.5) {
    const v = parse(id, `US ${us}`).value;
    for (const sys of ["uk", "eu"]) {
      const other = parse(id, format(v, { system: sys })).value;
      const back = parse(id, format(other, { system: "us" })).value;
      assert.ok(Math.abs(back.value - us) <= 0.5, `US ${us} via ${sys} came back as ${back.value}`);
    }
  }
});
test("ring-size: US halves are increasing in circumference", () => {
  let prev = 0;
  for (let us = 3; us <= 13; us += 0.5) {
    const v = parse(id, `US ${us}`).value;
    assert.ok(compare(v, parse(id, `US ${us - 0.5 < 3 ? 3 : us - 0.5}`).value) >= 0);
    prev = us;
  }
  assert.equal(prev, 13);
});
