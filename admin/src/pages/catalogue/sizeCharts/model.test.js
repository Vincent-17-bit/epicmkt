import test from "node:test";
import assert from "node:assert/strict";
import * as M from "./model.js";

const dress = () => M.fromRow({ id: "c1", name: "Dresses", category: null, unit: "cm", columns: ["Size", "Bust (cm)", "Waist (cm)"], rows: [["S", "84-88", "66"], ["M", "90", "72"]], active: true, product_type_ids: ["dress"] });

test("fromRow and toFields round trip, and a duplicate drops id and types", () => {
  const c = dress();
  assert.equal(c.id, "c1");
  assert.deepEqual(M.toFields(c).product_type_ids, ["dress"]);
  const d = M.duplicateOf(c);
  assert.equal(d.id, null);
  assert.equal(d.name, "Dresses (copy)");
  assert.deepEqual(d.productTypeIds, []);
});

test("isDirty compares against the loaded chart; a new chart is clean until touched", () => {
  const c = dress();
  assert.equal(M.isDirty(c, c), false);
  assert.equal(M.isDirty(M.editCell(c, 0, 1, "85"), c), true);
  assert.equal(M.isDirty(M.blankChart(), null), false);
  assert.equal(M.isDirty(M.setField(M.blankChart(), { name: "x" }), null), true);
});

test("editCell clamps length and ignores bad positions", () => {
  const c = dress();
  assert.equal(M.editCell(c, 0, 1, "x".repeat(50)).rows[0][1].length, M.LIMITS.cell);
  assert.equal(M.editCell(c, 9, 0, "x"), c);
  assert.equal(M.editCell(c, 0, 9, "x"), c);
});

test("rows: add after, remove, move; the last row stays; the limit holds", () => {
  let c = dress();
  const added = M.addRow(c, 0);
  assert.equal(added.index, 1);
  assert.deepEqual(added.chart.rows[1], ["", "", ""]);
  assert.equal(added.chart.rows.length, 3);
  c = M.moveRow(added.chart, 1, 1);
  assert.deepEqual(c.rows[2], ["", "", ""]);
  assert.equal(M.moveRow(c, 0, -1), c);
  c = M.removeRow(c, 2);
  assert.equal(c.rows.length, 2);
  const one = M.removeRow(M.removeRow(c, 0), 0);
  assert.equal(one.rows.length, 1);
  let full = M.blankChart();
  while (full.rows.length < M.LIMITS.rows) full = M.addRow(full).chart;
  assert.equal(M.addRow(full).index, -1);
});

test("columns: add keeps every row the same width, remove and move carry the cells, names stay unique", () => {
  let c = dress();
  const a = M.addColumn(c, 0);
  assert.equal(a.index, 1);
  assert.ok(a.chart.rows.every((r) => r.length === 4));
  assert.equal(a.chart.columns[1], "New column");
  assert.equal(M.addColumn(a.chart, 0).chart.columns[1], "New column 2");
  c = M.moveColumn(dress(), 1, 1);
  assert.deepEqual(c.columns, ["Size", "Waist (cm)", "Bust (cm)"]);
  assert.deepEqual(c.rows[0], ["S", "66", "84-88"]);
  c = M.removeColumn(dress(), 1);
  assert.deepEqual(c.rows[1], ["M", "72"]);
  assert.equal(M.removeColumn(M.removeColumn(c, 1), 0).columns.length, 1);
  assert.equal(M.renameColumn(dress(), 1, "y".repeat(80)).columns[1].length, M.LIMITS.column);
});

test("paste fills from the cell, adds rows, clips extra columns, handles tabs, commas and CRLF", () => {
  const c = dress();
  const out = M.pasteBlock(c, 1, 0, "L\t96\t78\r\nXL\t102\t84\r\n");
  assert.equal(out.chart.rows.length, 3);
  assert.deepEqual(out.chart.rows[1], ["L", "96", "78"]);
  assert.deepEqual(out.chart.rows[2], ["XL", "102", "84"]);
  assert.equal(out.cells, 6);
  assert.equal(out.clipped, false);
  const wide = M.pasteBlock(c, 0, 1, "1\t2\t3\t4");
  assert.equal(wide.clipped, true);
  assert.equal(wide.cells, 2);
  assert.deepEqual(M.pasteBlock(c, 0, 0, "A,1,2").chart.rows[0], ["A", "1", "2"]);
});

test("unit: cm to in converts numbers, ranges and the header; without convert only the label changes; the size column is kept", () => {
  const c = dress();
  assert.equal(M.canConvert(c), true);
  const inch = M.setUnit(c, "in", { convert: true });
  assert.equal(inch.unit, "in");
  assert.deepEqual(inch.columns, ["Size", "Bust (in)", "Waist (in)"]);
  assert.deepEqual(inch.rows[0], ["S", "33.1-34.6", "26"]);
  const raw = M.setUnit(c, "in");
  assert.deepEqual(raw.rows, c.rows);
  assert.equal(M.setUnit(c, "kg", { convert: true }).rows, c.rows);
  assert.equal(M.setUnit(c, "bogus"), c);
});

test("types: toggle, the limit, moved and released", () => {
  let c = dress();
  c = M.toggleType(c, "shirt");
  assert.deepEqual(c.productTypeIds, ["dress", "shirt"]);
  c = M.toggleType(c, "dress");
  assert.deepEqual(c.productTypeIds, ["shirt"]);
  const types = [{ id: "shirt", name: "Shirt", sizeChartId: "other" }, { id: "dress", name: "Dress", sizeChartId: "c1" }];
  assert.deepEqual(M.movedTypes(c, types), [{ id: "shirt", name: "Shirt", from: "other" }]);
  assert.deepEqual(M.releasedTypes(c, dress()), ["dress"]);
  let many = dress();
  for (let i = 0; i < 30; i++) many = M.toggleType(many, `t${i}`);
  assert.equal(many.productTypeIds.length, M.MAX_TYPES);
});

test("validate: a good chart passes; each problem is pointed at its cell or column", () => {
  assert.equal(M.validate(dress()).ok, true);
  let c = M.editCell(dress(), 1, 2, "");
  c = M.renameColumn(c, 2, "bust (cm)");
  c = M.setField(c, { name: "x" });
  const v = M.validate(c);
  assert.equal(v.ok, false);
  assert.ok(v.errors.name);
  assert.equal(v.cells["1:2"], "Enter a value.");
  assert.match(v.columnErrors[2], /Same name as column 2/);
  assert.match(M.summary(v), /Fix the name, 1 column name, 1 empty or long cell/);
  assert.equal(M.summary(M.validate(dress())), "Ready to save.");
});

test("validate: too many types is an error; trimming makes a blank cell blank", () => {
  let c = dress();
  c = { ...c, productTypeIds: Array.from({ length: 21 }, (_, i) => `t${i}`) };
  assert.ok(M.validate(c).errors.types);
  assert.equal(M.validate(M.editCell(dress(), 0, 1, "   ")).cells["0:1"], "Enter a value.");
});

test("filterCharts searches name, category and type ids", () => {
  const rows = [{ name: "Dresses", category: "tailor", product_type_ids: ["dress"] }, { name: "Shoes", category: null, product_type_ids: ["shoes-eu"] }];
  assert.equal(M.filterCharts(rows, "").length, 2);
  assert.deepEqual(M.filterCharts(rows, "SHOES").map((r) => r.name), ["Shoes"]);
  assert.deepEqual(M.filterCharts(rows, "tailor").map((r) => r.name), ["Dresses"]);
  assert.equal(M.filterCharts(rows, "zzz").length, 0);
});
