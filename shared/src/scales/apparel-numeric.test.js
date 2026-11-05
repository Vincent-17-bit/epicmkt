import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "apparel-numeric";
parseTable(id, [
  ["10", null, { system: "us", value: 10 }], ["US 10", null, { system: "us", value: 10 }], ["us10", null, { system: "us", value: 10 }],
  ["size 8", null, { system: "us", value: 8 }], ["0", null, { system: "us", value: 0 }], ["22", null, { system: "us", value: 22 }],
  ["10", { system: "us" }, { system: "us", value: 10 }]
]);
errorTable(id, [
  ["", null, "empty"], ["23", null, "out-of-range"], ["-2", null, "not-a-number"], ["10.5", null, "not-whole"], ["EU 38", null, "unsupported-system"],
  ["UK 12", null, "unsupported-system"], ["ten", null, "not-a-number"], ["10", { system: "eu" }, "unsupported-system"]
]);
formatTable(id, [["10", null, "US 10"], ["0", null, "US 0"]]);
orderTable(id, ["0", "2", "10", "22"]);
baseTable(id, [["14", 14]]);
keyTable(id, [["10", "apparel-numeric:us:10"]]);
plausibleTable(id, [["10", null, null, { ok: true, warn: false }], ["9", null, null, { ok: true, warn: true }]]);
