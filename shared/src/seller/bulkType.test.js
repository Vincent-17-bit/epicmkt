import test from "node:test";
import assert from "node:assert/strict";
import { importRowsToFinish, setTypeReport, typeTemplateCsv, typeTemplateHeaders } from "./bulk.js";

const bulb = { id: "bulb", specRows: [
  { key: "wattage", label: "Wattage", level: "required", input: "text" },
  { key: "base", label: "Base", level: "required", input: "choice", choices: ["E27", "E14"] },
  { key: "colour", label: "Colour", level: "optional", input: "text" }
] };
const shirt = { id: "shirt", specRows: [{ key: "material", label: "Material", level: "required", input: "text" }] };

test("template columns come from the type's required rows", () => {
  assert.deepEqual(typeTemplateHeaders(bulb), ["name", "price type", "price", "brand", "spec:Wattage", "spec:Base"]);
  assert.deepEqual(typeTemplateHeaders(shirt), ["name", "price type", "price", "brand", "spec:Material"]);
  assert.deepEqual(typeTemplateHeaders(null), ["name", "price type", "price", "brand"]);
});
test("the template file has the headings and one example row, with a choice filled in", () => {
  const [head, example, rest] = typeTemplateCsv(bulb).split("\n");
  assert.equal(head, "name,price type,price,brand,spec:Wattage,spec:Base");
  assert.match(example, /^Example item \(replace me\),fixed,1500,,,E27$/);
  assert.equal(rest, "");
});
test("rows without a required row are listed with what is missing", () => {
  const valid = [
    { row: 2, value: { name: "A", specs: [{ label: "Wattage", value: "9 W" }, { label: "Base", value: "E27" }] } },
    { row: 3, value: { name: "B", specs: [{ label: "Wattage", value: "9 W" }] } },
    { row: 4, value: { name: "C" } }
  ];
  assert.deepEqual(importRowsToFinish(valid, bulb), [{ row: 3, missing: ["Base"] }, { row: 4, missing: ["Wattage", "Base"] }]);
  assert.deepEqual(importRowsToFinish(valid, null), []);
});
test("the set-type report says what was left alone and why", () => {
  assert.equal(setTypeReport({ updated: 1, skipped: [] }), "1 item updated.");
  assert.equal(
    setTypeReport({ updated: 3, skipped: [{ id: "a", reason: "needs_details" }, { id: "b", reason: "needs_details" }, { id: "c", reason: "has_type" }] }),
    "3 items updated. 2 live items need their details added in the editor first, so they were left as it was. 1 already had a type."
  );
});
