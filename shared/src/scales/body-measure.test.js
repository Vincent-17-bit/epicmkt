import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "body-measure";
parseTable(id, [
  ["90 cm", null, { value: 90, unit: "cm" }], ["90cm", null, { value: 90, unit: "cm" }], ["36 in", null, { value: 36, unit: "in" }], ['36"', null, { value: 36, unit: "in" }],
  ["36.5 inches", null, { value: 36.5, unit: "in" }], ["100 centimetres", null, { value: 100, unit: "cm" }], ["90", { defaultUnit: "cm" }, { value: 90, unit: "cm" }]
]);
errorTable(id, [["", null, "empty"], ["90", null, "unit-required"], ["90 kg", null, "unknown-unit"], ["0 cm", null, "out-of-range"], ["400 cm", null, "out-of-range"], ["-3 cm", null, "not-a-number"], ["abc", null, "not-a-number"]]);
formatTable(id, [["90 cm", null, "90 cm"], ["36 in", null, "36 in"], ["36 in", { unit: "cm" }, "91.4 cm"], ["90 cm", { unit: "in" }, "35.4 in"], ["90 cm", { unit: "cm" }, "90 cm"]]);
orderTable(id, ["60 cm", "24 in", "70 cm", "30 in", "90 cm", "36 in"]);
baseTable(id, [["36 in", 91.44], ["90 cm", 90]]);
keyTable(id, [["90 cm", "body-measure:-:90:cm"], ["36 in", "body-measure:-:36:in"]]);
plausibleTable(id, [["90 cm", null, null, { ok: true, warn: false }]]);
