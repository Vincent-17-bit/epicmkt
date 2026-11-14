import test from "node:test";
import assert from "node:assert/strict";
import { axisKey, blankAxis, isDirty, toDraft, toType, typeId, validate } from "./productTypes.js";

const phone = { id: "phone", name: "Phone", departmentId: "phones", categoryIds: ["a"], active: true, axes: [{ key: "colour", label: "Colour", display: "swatch" }, { key: "storage", label: "Storage", display: "button", suggested: [{ id: "64-gb", label: "64 GB" }] }] };

test("round trips a type unchanged", () => {
  const d = toDraft(phone);
  assert.deepEqual(toType(d), { name: "Phone", departmentId: "phones", categoryIds: ["a"], active: true, axes: phone.axes });
  assert.equal(isDirty(d, phone), false);
});

test("makes keys and ids from names", () => {
  assert.equal(axisKey("Pack size"), "pack_size");
  assert.equal(axisKey("2 in 1"), "in_1");
  assert.equal(typeId("Hard drives"), "hard-drives");
});

test("builds suggested values from comma text and drops duplicates", () => {
  const d = toDraft(phone);
  d.axes[1].suggestedText = "64 GB, 128 GB, 64 GB,";
  assert.deepEqual(toType(d).axes[1].suggested,[{ id: "64-gb", label: "64 GB" }, { id: "128-gb", label: "128 GB" }]);
  assert.equal(isDirty(d, phone), true);
});

test("refuses empty names, repeats and more than three options", () => {
  const d = toDraft(phone);
  d.name = " ";
  d.axes.push({ ...blankAxis(), label: "colour" });
  const e = validate(d).errors;
  assert.ok(e.includes("Give the type a name.") && e.includes("Two options are both called “colour”."));
  d.name = "Phone";
  d.axes = ["a", "b", "c", "d"].map((l) => ({ ...blankAxis(), label: l }));
  assert.ok(validate(d).errors.includes("A type can have at most 3 options."));
});

test("keeps an existing key when the label changes", () => {
  const d = toDraft(phone);
  d.axes[0].label = "Colour shade";
  assert.equal(toType(d).axes[0].key, "colour");
});
