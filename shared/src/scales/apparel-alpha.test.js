import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "apparel-alpha";
parseTable(id, [
  ["xs", null, { value: "XS" }], [" Medium ", null, { value: "M" }], ["s", null, { value: "S" }], ["L", null, { value: "L" }],
  ["extra large", null, { value: "XL" }], ["2xl", null, { value: "XXL" }], ["xxl", null, { value: "XXL" }], ["XXXL", null, { value: "3XL" }],
  ["3XL", null, { value: "3XL" }], ["4x", null, { value: "4XL" }], ["5XL", null, { value: "5XL" }], ["size L", null, { value: "L" }]
]);
errorTable(id, [["", null, "empty"], ["   ", null, "empty"], ["6XL", null, "unknown-size"], ["huge", null, "unknown-size"], ["42", null, "unknown-size"], ["XXS", null, "unknown-size"], ["M L", null, "unknown-size"]]);
formatTable(id, [["xxl", null, "XXL"], ["small", null, "S"], ["5xl", null, "5XL"]]);
orderTable(id, ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"]);
baseTable(id, [["xs", 0], ["xl", 4], ["5xl", 8]]);
keyTable(id, [["XL", "apparel-alpha:-:XL"], ["2xl", "apparel-alpha:-:XXL"]]);
plausibleTable(id, [["M", null, null, { ok: true, warn: false }]]);
