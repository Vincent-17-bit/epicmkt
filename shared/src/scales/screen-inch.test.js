import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "screen-inch";
parseTable(id, [
  ["42", null, { value: 42, unit: "in" }], ['42"', null, { value: 42, unit: "in" }], ["42 inch", null, { value: 42, unit: "in" }], ["42-inch", null, { value: 42, unit: "in" }],
  ["6.7 in", null, { value: 6.7, unit: "in" }], ["55 inches", null, { value: 55, unit: "in" }], ["107 cm", null, { value: 42.13, unit: "in" }], ["6.67", null, { value: 6.67, unit: "in" }]
]);
errorTable(id, [["", null, "empty"], ["abc", null, "not-a-number"], ["0", null, "out-of-range"], ["200", null, "out-of-range"], ["42 kg", null, "unknown-unit"], ["-5", null, "not-a-number"]]);
formatTable(id, [["42", null, '42"'], ["6.7 in", null, '6.7"'], ["6.67", null, '6.67"']]);
orderTable(id, ["6.1", "6.7", "32", "43", "55", "75"]);
baseTable(id, [["55", 55]]);
keyTable(id, [["42", "screen-inch:-:42:in"], ["42 inch", "screen-inch:-:42:in"]]);
plausibleTable(id, [["55", null, null, { ok: true, warn: false }], ["2", null, null, { ok: true, warn: true }], ["110", null, null, { ok: true, warn: true }]]);
