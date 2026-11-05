import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "kids-age";
parseTable(id, [
  ["newborn", null, { value: "0", unit: "m" }], ["New Born", null, { value: "0", unit: "m" }], ["6 months", null, { value: "6", unit: "m" }],
  ["12-18 months", null, { value: "12-18", unit: "m" }], ["3 years", null, { value: "3", unit: "y" }], ["3-4 yrs", null, { value: "3-4", unit: "y" }],
  ["24 months", null, { value: "2", unit: "y" }], ["36-48 months", null, { value: "3-4", unit: "y" }], ["2y", null, { value: "2", unit: "y" }],
  ["18 months", null, { value: "18", unit: "m" }], ["3-4", { defaultUnit: "years" }, { value: "3-4", unit: "y" }], ["9", { defaultUnit: "months" }, { value: "9", unit: "m" }]
]);
errorTable(id, [
  ["", null, "empty"], ["3", null, "unit-required"], ["3-4", null, "unit-required"], ["abc", null, "not-an-age"], ["30 years", null, "out-of-range"],
  ["5-3 years", null, "bad-range"], ["0 years", null, "out-of-range"], ["-1 years", null, "not-an-age"], ["3 fortnights", null, "unknown-unit"], ["1.5 years", null, "not-an-age"]
]);
formatTable(id, [["6 months", null, "6 months"], ["1 month", null, "1 month"], ["3-4 yrs", null, "3-4 years"], ["newborn", null, "Newborn"], ["24 months", null, "2 years"], ["12-18 months", null, "12-18 months"]]);
orderTable(id, ["newborn", "6 months", "12-18 months", "2 years", "3-4 years", "5 years", "10-12 years"]);
baseTable(id, [["6 months", 6], ["2 years", 24]]);
keyTable(id, [["24 months", "kids-age:-:2:y"], ["3-4 years", "kids-age:-:3-4:y"]]);
plausibleTable(id, [["3-4 years", null, null, { ok: true, warn: false }], ["15 years", null, null, { ok: true, warn: true }]]);
