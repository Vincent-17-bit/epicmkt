import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_TYPES } from "@epicmkt/shared";
import * as M from "./specRules.js";

const necklace = PRODUCT_TYPES.find((t) => t.id === "gold-necklace");
const phone = PRODUCT_TYPES.find((t) => t.id === "phone");

test("rows round trip through the editor form unchanged, conditions included", () => {
  for (const t of [necklace, phone]) assert.deepEqual(M.toRows(M.fromRows(t.specRows)), t.specRows);
});

test("a new row takes its key from the label, deduplicated, and keeps it once saved", () => {
  let d = M.addRow(M.fromRows(phone.specRows));
  d = M.setRow(d, d.length - 1, { label: "Storage" });
  assert.equal(d.at(-1).key, d.some((r, i) => i < d.length - 1 && r.key === "storage") ? "storage-2" : "storage");
  const saved = M.fromRows(M.toRows(d));
  assert.equal(M.setRow(saved, saved.length - 1, { label: "Renamed" }).at(-1).key, d.at(-1).key);
});

test("the four required row limit counts requiredIf rows", () => {
  const base = ["a", "b", "c", "d"].map((k) => ({ key: k, label: k, level: "required", input: "text" }));
  assert.equal(M.validate(M.fromRows(base)).ok, true);
  const five = [...base, { key: "e", label: "e", level: "optional", input: "text", requiredIf: { row: "a", present: true } }];
  const v = M.validate(M.fromRows(five));
  assert.equal(v.ok, false);
  assert.equal(v.required, 5);
  assert.match(v.errors.join(" "), /at most 4/);
});

test("validation catches a blank label, a choice row without choices, and a self reference", () => {
  let d = M.addRow(M.fromRows([]));
  assert.match(M.validate(d).errors.join(" "), /needs a label/);
  d = M.setRow(d, 0, { label: "Kind", input: "choice" });
  assert.match(M.validate(d).errors.join(" "), /choices/);
  d = M.setRow(d, 0, { choicesText: "A, B" });
  assert.equal(M.validate(d).ok, true);
  d = M.setRow(d, 0, { showIf: { join: "all", leaves: [{ row: "kind", op: "present", value: "yes" }] } });
  assert.match(M.validate(d).errors.join(" "), /itself/);
});

test("conditions: one leaf stays flat, several become all or any, unknown shapes are kept as they are", () => {
  const leaf = { row: "a", equals: "x" };
  assert.deepEqual(M.conditionTo(M.conditionFrom(leaf)), leaf);
  const group = { any: [{ row: "a", in: ["x", "y"] }, { row: "b", present: false }] };
  assert.deepEqual(M.conditionTo(M.conditionFrom(group)), group);
  const odd = { not: { row: "a", present: true } };
  assert.deepEqual(M.conditionTo(M.conditionFrom(odd)), odd);
  assert.equal(M.conditionTo({ join: "all", leaves: [{ row: "", op: "equals", value: "" }] }), undefined);
});

test("a row another rule depends on cannot be removed; others can", () => {
  const d = M.fromRows(necklace.specRows);
  const dep = necklace.specRows.find((r) => JSON.stringify(r.requiredIf ?? r.showIf ?? {}).includes('"row"'));
  const target = JSON.stringify(dep.requiredIf ?? dep.showIf).match(/"row":"([^"]+)"/)[1];
  assert.equal(M.removeRow(d, d.findIndex((r) => r.key === target)), null);
  assert.equal(M.removeRow(M.fromRows([{ key: "a", label: "a", level: "optional", input: "text" }]), 0).length, 0);
});

test("moveRow swaps neighbours and stops at the ends", () => {
  const d = M.fromRows(phone.specRows);
  assert.equal(M.moveRow(d, 0, -1), d);
  assert.equal(M.moveRow(d, 0, 1)[1].key, d[0].key);
});

test("isDirty compares the saved rows", () => {
  const d = M.fromRows(phone.specRows);
  assert.equal(M.isDirty(d, phone.specRows), false);
  assert.equal(M.isDirty(M.setRow(d, 0, { label: "Other" }), phone.specRows), true);
});

test("preview: a requiredIf row becomes required when its rule matches", () => {
  const rows = [{ key: "a", label: "A", level: "required", input: "text" }, { key: "b", label: "B", level: "optional", input: "text", requiredIf: { row: "a", equals: "yes" } }];
  assert.deepEqual(M.previewOf(rows, { a: "yes" }).blockers.map((b) => b.key), ["b"]);
  assert.equal(M.previewOf(rows, { a: "no" }).blockers.length, 0);
  assert.deepEqual(M.previewOf(rows, {}).blockers.map((b) => b.key), ["a"]);
});

test("preview: tag rules use the sample tags, show rules hide rows", () => {
  const rows = [
    { key: "m", label: "Material", level: "recommended", input: "text" },
    { key: "p", label: "Purity", level: "optional", input: "text", showIf: { row: "m", tag: "precious-metal" }, requiredIf: { row: "m", tag: "precious-metal" } }
  ];
  assert.deepEqual(M.previewOf(rows, { m: "Gold" }, {}).shown.map((r) => r.key), ["m"]);
  const on = M.previewOf(rows, { m: "Gold" }, { m: "precious-metal" });
  assert.deepEqual(on.shown.map((r) => r.key), ["m", "p"]);
  assert.deepEqual(on.blockers.map((b) => b.key), ["p"]);
  assert.deepEqual([...M.tagRows(rows)], ["m"]);
});

test("saveError maps server codes to plain text", () => {
  assert.match(M.saveError({ code: "too_many_required" }), /at most 4/);
  assert.match(M.saveError({ message: "forbidden" }), /owner/);
  assert.match(M.saveError(new Error("boom")), /Could not save/);
});

test("preview does not throw on rows that are not valid yet", () => {
  const out = M.previewOf([{ key: "a", label: "A", level: "required", input: "choice" }], {});
  assert.equal(out.invalid, true);
  assert.equal(out.shown.length, 1);
});
