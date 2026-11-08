import test from "node:test";
import assert from "node:assert/strict";
import { canToggleUnit, chartInUnit, convertCell, matchRow, measurementColumns } from "./chartUnits.js";

const dress = { unit: "cm", columns: ["Size", "Bust (cm)", "Waist (cm)", "Fit"], rows: [["S", "86-90", "66", "Slim"], ["M", "91-95", "71", "Regular"]] };

test("converts numbers and ranges to one decimal and keeps text", () => {
  assert.equal(convertCell("86", "cm", "in"), "33.9");
  assert.equal(convertCell("86-90", "cm", "in"), "33.9-35.4");
  assert.equal(convertCell("34", "in", "cm"), "86.4");
  assert.equal(convertCell("Regular", "cm", "in"), "Regular");
  assert.equal(convertCell("86", "cm", "cm"), "86");
});

test("never converts the size column; switches the unit in headers", () => {
  assert.deepEqual(measurementColumns(dress.rows), [false, true, true, false]);
  const shoe = { unit: "cm", columns: ["EU", "Foot (cm)"], rows: [["42", "26.7"]] };
  assert.deepEqual(chartInUnit(shoe, "in").rows, [["42", "10.5"]]);
  const inch = chartInUnit(dress, "in");
  assert.deepEqual(inch.columns, ["Size", "Bust (in)", "Waist (in)", "Fit"]);
  assert.deepEqual(inch.rows[0], ["S", "33.9-35.4", "26", "Slim"]);
});

test("toggle only with measurements; matchRow finds the selected size", () => {
  assert.equal(canToggleUnit(dress), true);
  assert.equal(canToggleUnit({ unit: "cm", columns: ["Size", "Fit"], rows: [["S", "Slim"]] }), false);
  assert.equal(matchRow(dress, "M"), 1);
  assert.equal(matchRow({ rows: [["42"]] }, "EU 42"), 0);
  assert.equal(matchRow(dress, "XL"), -1);
});
