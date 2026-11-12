import test from "node:test";
import assert from "node:assert/strict";
import {
  GUIDE_BLANK, GUIDE_LIMITS, GUIDE_TEMPLATES, addColumn, addRow, checkGuide, copyRow, guideForBuyer, guideFromChart, guideFromServer, guideKindFor, guidePayload,
  moveColumn, moveRow, orderBySizes, removeColumn, removeRow, setCell, setHeader, setUnit, shoeGuide, sizeLabels, startGuide, syncSizes, wantsGuide
} from "./sizeGuide.js";

const sizes = ["S", "M", "L"];
const tops = () => startGuide({ columns: GUIDE_TEMPLATES[0].columns, sizes });
const cellsOf = (g) => g.rows.map((r) => r.cells);

test("a starting table has the template columns and one row per size, size filled in", () => {
  const g = tops();
  assert.deepEqual(g.columns, ["Size", "Chest", "Waist", "Hips", "Length"]);
  assert.deepEqual(g.rows.map((r) => r.cells[0]), sizes);
  assert.ok(g.rows.every((r) => r.cells.length === 5 && r.id));
});

test("shoe table: sizes typed in EU are converted to UK, US men, US women and foot length; bad sizes are skipped, not guessed", () => {
  const { guide, skipped } = shoeGuide(["EU 40", "41", "abc", "EU 200"], { system: "eu" });
  assert.deepEqual(guide.columns, ["Size", "UK", "US men", "US women", "Foot length (cm)"]);
  assert.deepEqual(cellsOf(guide)[0], ["EU 40", "6.5", "7.5", "8.5", "25.4"]);
  assert.deepEqual(cellsOf(guide)[1].slice(0, 4), ["41", "7.5", "8.5", "9.5"]);
  assert.deepEqual(skipped, ["abc", "EU 200"]);
});
test("shoe table in UK sizes, with a width column, and only the columns asked for", () => {
  const { guide } = shoeGuide(["UK 8", "UK 9"], { system: "uk", include: ["eu", "cm"], width: "Wide" });
  assert.deepEqual(guide.columns, ["Size", "EU", "Foot length (cm)", "Width"]);
  assert.equal(guide.rows[0].cells[0], "UK 8");
  assert.equal(guide.rows[0].cells[3], "Wide");
  assert.ok(guide.rows.every((r) => !r.cells.includes("")));
});

test("syncSizes adds blank rows only for missing sizes and reports rows that are no longer offered", () => {
  const g = tops();
  const r = syncSizes(g, ["S", "M", "L", "XL"]);
  assert.deepEqual(r.added, ["XL"]);
  assert.equal(r.guide.rows.length, 4);
  assert.deepEqual(syncSizes(g, ["S", "m ", "L"]).added, [], "case and spacing do not matter");
  assert.deepEqual(syncSizes(g, ["S"]).extra, ["M", "L"]);
  assert.equal(syncSizes(g, ["S"]).guide, g, "nothing to add returns the same guide");
});
test("orderBySizes follows the seller's order and keeps unknown rows at the end", () => {
  let g = addRow(tops(), "XXL");
  g = orderBySizes(g, ["L", "M", "S"]);
  assert.deepEqual(g.rows.map((r) => r.cells[0]), ["L", "M", "S", "XXL"]);
});

test("edits return new guides and keep the size column and cell counts consistent", () => {
  const g = tops();
  const id = g.rows[1].id;
  const a = setCell(g, id, 1, "90");
  assert.equal(a.rows[1].cells[1], "90");
  assert.equal(g.rows[1].cells[1], "", "the original is untouched");
  assert.equal(removeColumn(g, 0), g, "the size column cannot be removed");
  const b = removeColumn(g, 2);
  assert.deepEqual(b.columns, ["Size", "Chest", "Hips", "Length"]);
  assert.ok(b.rows.every((r) => r.cells.length === 4));
  const c = addColumn(g, "Shoulder");
  assert.ok(c.rows.every((r) => r.cells.length === 6));
  const m = moveColumn(setCell(g, g.rows[0].id, 1, "Cx"), 1, 1);
  assert.deepEqual(m.columns.slice(0, 3), ["Size", "Waist", "Chest"]);
  assert.equal(m.rows[0].cells[2], "Cx", "cells travel with their column");
  assert.equal(moveColumn(g, 1, -1), g);
  assert.deepEqual(moveRow(g, id, -1).rows.map((r) => r.cells[0]), ["M", "S", "L"]);
  assert.equal(moveRow(g, g.rows[0].id, -1), g);
  assert.deepEqual(removeRow(g, id).rows.map((r) => r.cells[0]), ["S", "L"]);
  const cp = copyRow(setCell(g, id, 1, "90"), id);
  assert.deepEqual(cp.rows.map((r) => r.cells[0]), ["S", "M", "", "L"]);
  assert.equal(cp.rows[2].cells[1], "90", "a copy keeps the measurements and blanks the size");
  assert.equal(setCell(g, id, 1, "x".repeat(40)).rows[1].cells[1].length, GUIDE_LIMITS.cell);
  assert.equal(setHeader(g, 1, "y".repeat(50)).columns[1].length, GUIDE_LIMITS.header);
});
test("limits: 12 columns and 60 rows", () => {
  let g = tops();
  while (g.columns.length < 12) g = addColumn(g, `C${g.columns.length}`);
  assert.equal(addColumn(g, "extra"), g);
  let h = tops();
  while (h.rows.length < 60) h = addRow(h, `R${h.rows.length}`);
  assert.equal(addRow(h, "more"), h);
});

test("checkGuide: names, duplicates, empty sizes, and warnings for blanks and missing sizes", () => {
  let g = tops();
  assert.deepEqual(checkGuide(g, sizes).errors, {});
  assert.ok(checkGuide(g, sizes).warnings.some((w) => w.code === "blank"));
  g = setHeader(g, 2, "chest");
  g = setCell(g, g.rows[0].id, 0, "M");
  const { errors } = checkGuide(g, sizes);
  assert.match(errors["columns.2"], /twice/);
  assert.match(errors[`rows.${g.rows[1].id}.0`], /listed twice/, "the second M is the one flagged");
  assert.match(checkGuide({ unit: "cm", columns: ["Size"], rows: [] }).errors.columns, /at least one measurement/);
  assert.match(checkGuide({ unit: "cm", columns: ["Size", "A"], rows: [] }).errors.rows, /at least one size/);
  const missing = checkGuide(tops(), ["S", "M", "L", "XL"]).warnings.find((w) => w.code === "missing");
  assert.deepEqual(missing.sizes, ["XL"]);
  const extra = checkGuide(tops(), ["S"]).warnings.find((w) => w.code === "extra");
  assert.deepEqual(extra.sizes, ["M", "L"]);
});
test("a blank size name is an error; a name over the limit is an error", () => {
  const g = tops();
  const id = g.rows[0].id;
  assert.match(checkGuide(setCell(g, id, 0, "  ")).errors[`rows.${id}.0`], /Name this size/);
  assert.match(checkGuide({ ...g, columns: ["Size", "x".repeat(31)] , rows: [] }).errors["columns.1"], /30/);
});

test("guidePayload: null for nothing, empty cells become the dash, cells are trimmed; guideFromServer reverses it", () => {
  assert.equal(guidePayload(null), null);
  assert.equal(guidePayload({ unit: "cm", columns: ["Size", "A"], rows: [] }), null);
  let g = tops();
  g = setCell(g, g.rows[0].id, 1, " 86 ");
  const p = guidePayload(g);
  assert.deepEqual(p.columns, ["Size", "Chest", "Waist", "Hips", "Length"]);
  assert.deepEqual(p.rows[0], ["S", "86", GUIDE_BLANK, GUIDE_BLANK, GUIDE_BLANK]);
  const back = guideFromServer(p);
  assert.deepEqual(cellsOf(back)[0], ["S", "86", "", "", ""]);
  assert.equal(back.unit, "cm");
  assert.equal(guideFromServer(null), null);
  assert.equal(guideFromServer({ columns: "x" }), null);
  assert.deepEqual(guidePayload(back), p, "saving what was loaded changes nothing");
});
test("the payload fits the database rules: every row as wide as the columns, nothing empty, within the limits", () => {
  const { guide } = shoeGuide(["EU 38", "EU 39"], { width: "Standard" });
  const p = guidePayload(guide);
  assert.ok(p.rows.every((r) => r.length === p.columns.length && r.every((c) => c.trim() && c.length <= GUIDE_LIMITS.cell)));
  assert.ok(p.columns.every((c) => c.length <= GUIDE_LIMITS.header));
});

test("unit switch converts measurement columns and header words, never the size column or text", () => {
  let g = startGuide({ columns: ["Size", "Chest (cm)", "Note"], sizes: ["M"] });
  g = setCell(setCell(g, g.rows[0].id, 1, "100"), g.rows[0].id, 2, "Slim");
  const inch = setUnit(g, "in");
  assert.equal(inch.unit, "in");
  assert.deepEqual(inch.columns, ["Size", "Chest (in)", "Note"]);
  assert.deepEqual(inch.rows[0].cells, ["M", "39.4", "Slim"]);
  assert.equal(setUnit(g, "cm"), g);
  assert.equal(setUnit(g, "yd"), g);
});

test("an admin chart is copied: columns and rows come across, and changing the copy never changes the template", () => {
  const chart = { name: "Dress", unit: "in", columns: ["Size", "Bust"], rows: [["S", "34"], ["M", "36"]] };
  const g = guideFromChart(chart);
  assert.equal(g.unit, "in");
  assert.deepEqual(cellsOf(g), chart.rows);
  setCell(g, g.rows[0].id, 1, "99");
  assert.equal(chart.rows[0][1], "34");
  assert.deepEqual(guideFromChart(chart, { sizes: ["XS"], keepRows: false }).rows.map((r) => r.cells), [["XS", ""]]);
});

test("what buyers get has the same shape the item payload gives for a chart", () => {
  const b = guideForBuyer(tops());
  assert.deepEqual(Object.keys(b).sort(), ["category", "columns", "id", "name", "overridden", "own", "rows", "unit"]);
  assert.equal(guideForBuyer(null), null);
});

test("which items get the step: sizes, clothing, shoes or an existing guide", () => {
  const sized = { axes: [{ label: "Size", values: [{ label: "S" }, { label: " M " }, { label: "" }] }, { label: "Colour", values: [{ label: "Red" }] }] };
  assert.deepEqual(sizeLabels(sized), ["S", "M"]);
  assert.deepEqual(sizeLabels(null), []);
  assert.equal(guideKindFor("Shoes"), "shoe");
  assert.equal(guideKindFor(null, "Leather sandals"), "shoe");
  assert.equal(guideKindFor("Clothing", "Fade cut"), "clothing");
  assert.equal(guideKindFor(null, "Cotton T-shirt"), "clothing");
  assert.equal(guideKindFor("Pens", "Blue pen"), null);
  assert.equal(wantsGuide({ options: sized }), true);
  assert.equal(wantsGuide({ typeName: "Pens", itemName: "Blue pen" }), false);
  assert.equal(wantsGuide({ guide: tops(), typeName: "Pens" }), true);
});

test("what a buyer gets from the shared public payload matches the editor's preview, and a guide beats the admin chart", async () => {
  const { publicOptions } = await import("../seller/options.js");
  const g = guidePayload(tops());
  const chart = { id: "c", name: "Admin", unit: "cm", columns: ["Size", "Bust"], rows: [["S", "80"]] };
  const shown = publicOptions({ chart, guide: g }).sizeChart;
  assert.deepEqual(shown, { ...guideForBuyer(tops()) });
  assert.equal(publicOptions({ chart, guide: null }).sizeChart.id, "c");
  assert.equal(publicOptions({ chart, guide: { columns: ["A"], rows: [["1", "2"]] } }).sizeChart.id, "c", "a guide that breaks the rules is ignored, as in the database");
  assert.equal(publicOptions({ guide: null }).sizeChart, null);
});
