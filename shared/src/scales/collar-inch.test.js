import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "collar-inch";
parseTable(id, [
  ["15", null, { value: 15, unit: "in" }], ["15.5", null, { value: 15.5, unit: "in" }], ["15 1/2", null, { value: 15.5, unit: "in" }],
  ["15½", null, { value: 15.5, unit: "in" }], ['15"', null, { value: 15, unit: "in" }], ["16 in", null, { value: 16, unit: "in" }],
  ["14 inches", null, { value: 14, unit: "in" }], ["12", null, { value: 12, unit: "in" }], ["22", null, { value: 22, unit: "in" }]
]);
errorTable(id, [["", null, "empty"], ["15.3", null, "not-half"], ["11.5", null, "out-of-range"], ["22.5", null, "out-of-range"], ["40 cm", null, "unknown-unit"], ["abc", null, "not-a-number"], ["15 kg", null, "unknown-unit"]]);
formatTable(id, [["15", null, '15"'], ["15 1/2", null, '15.5"']]);
orderTable(id, ["14", "14.5", "15", "15.5", "17"]);
baseTable(id, [["15.5", 15.5]]);
keyTable(id, [["15.5", "collar-inch:-:15.5:in"]]);
plausibleTable(id, [["15", null, null, { ok: true, warn: false }], ["21", null, null, { ok: true, warn: true }], ["12", null, null, { ok: true, warn: true }]]);
