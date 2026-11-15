import test from "node:test";
import assert from "node:assert/strict";
import { axisKey, blankAxis, differsFromLive, isDirty, toDraft, toType, typeId, validate, versionText } from "./productTypes.js";

const phone = { id: "phone", name: "Phone", departmentId: "phones", categoryIds: ["a"], active: true, axes: [{ key: "colour", label: "Colour", display: "swatch" }, { key: "storage", label: "Storage", display: "button", suggested: [{ id: "64-gb", label: "64 GB" }] }] };

test("round trips a type unchanged", () => {
  const d = toDraft(phone);
  assert.deepEqual(toType(d), { name: "Phone", kind: "good", quantityMode: "units", sizeChartId: null, departmentId: "phones", categoryIds: ["a"], restrictedTo: [], active: true, axes: phone.axes });
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

test("carries kind, quantity mode, size chart and restrictions, and leaves AxisDef defaults out", () => {
  const t = { ...phone, kind: "service", quantityMode: "none", sizeChartId: "c1", restrictedTo: ["liquor-store"], axes: [{ key: "size", label: "Size", display: "button", scale: "shoe", open: true, affectsPrice: false }] };
  const d = toDraft(t);
  assert.equal(d.axes[0].affectsPrice, "no");
  const out = toType(d);
  assert.equal(out.kind, "service");
  assert.equal(out.quantityMode, "none");
  assert.equal(out.sizeChartId, "c1");
  assert.deepEqual(out.restrictedTo, ["liquor-store"]);
  assert.deepEqual(out.axes[0], { key: "size", label: "Size", display: "button", scale: "shoe", open: true, affectsPrice: false });
  d.axes[0].affectsPrice = "auto";
  d.axes[0].open = false;
  assert.deepEqual(toType(d).axes[0], { key: "size", label: "Size", display: "button", scale: "shoe" });
});

test("edits start from the saved draft, and Publish knows the draft differs from the live type", () => {
  const t = { ...phone, version: 2, publishedAt: "2026-11-01T10:00:00Z", draft: { ...phone, name: "Phones" } };
  const d = toDraft(t);
  assert.equal(d.name, "Phones");
  assert.equal(isDirty(d, t), false, "nothing new since the draft");
  assert.equal(differsFromLive(d, t), true, "but the draft is not live");
  assert.match(versionText(t), /^Version 2, published /);
  assert.equal(versionText({ ...t, version: null }), "Not published yet");
});

test("refuses an unknown kind or quantity mode", () => {
  const d = toDraft(phone);
  d.kind = "gadget";
  d.quantityMode = "lots";
  const e = validate(d).errors;
  assert.ok(e.includes("Pick what kind of thing this type is.") && e.includes("Pick how buyers choose a quantity."));
});
