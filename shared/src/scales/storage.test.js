import { baseTable, errorTable, formatTable, keyTable, orderTable, parseTable, plausibleTable } from "./testkit.js";
const id = "storage";
parseTable(id, [
  ["128 GB", null, { value: 128, unit: "GB" }], ["128gb", null, { value: 128, unit: "GB" }], ["1 TB", null, { value: 1024, unit: "GB" }], ["1tb", null, { value: 1024, unit: "GB" }],
  ["1024 GB", null, { value: 1024, unit: "GB" }], ["2048GB", null, { value: 2048, unit: "GB" }], ["512 MB", null, { value: 0.5, unit: "GB" }],
  ["1.5 TB", null, { value: 1536, unit: "GB" }], ["8 gigabytes", null, { value: 8, unit: "GB" }], ["64 gig", null, { value: 64, unit: "GB" }],
  ["256", { defaultUnit: "GB" }, { value: 256, unit: "GB" }]
]);
errorTable(id, [["", null, "empty"], ["128", null, "unit-required"], ["abc", null, "not-a-number"], ["5 kg", null, "unknown-unit"], ["0 GB", null, "out-of-range"], ["-1 TB", null, "not-a-number"], ["9999 TB", null, "out-of-range"], ["1 PB", null, "unknown-unit"]]);
formatTable(id, [["1024 GB", null, "1 TB"], ["2048 GB", null, "2 TB"], ["128 GB", null, "128 GB"], ["512 MB", null, "512 MB"], ["1536 GB", null, "1.5 TB"], ["4 TB", null, "4 TB"], ["1 GB", null, "1 GB"], ["1023 GB", null, "1023 GB"]]);
orderTable(id, ["512 MB", "4 GB", "64 GB", "128 GB", "1 TB", "2 TB"]);
baseTable(id, [["1 TB", 1024], ["512 MB", 0.5]]);
keyTable(id, [["1 TB", "storage:-:1024:GB"], ["1024 GB", "storage:-:1024:GB"], ["2 TB", "storage:-:2048:GB"]]);
plausibleTable(id, [["128 GB", "phone", "storage", { ok: true, warn: false }], ["4 GB", "phone", "storage", { ok: true, warn: true }], ["16 TB", "phone", "storage", { ok: false, warn: true }], ["128 GB", null, null, { ok: true, warn: false }]]);
