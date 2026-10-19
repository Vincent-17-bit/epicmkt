import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, checkImportFile, detectMapping, errorReportCsv, parseDelimited, positionalMapping, safeCell, startsWithFormula,
  toImportPayload, validateImport, validateRow,
} from "./importer.js";

const HEAD = "name\tprice type\tprice\tunit\tavailability\tsection\ttags";
const parse = (text) => parseDelimited(text).rows;
const run = (text, ctx = {}) => {
  const rows = parse(text);
  const { mapping, hasHeader } = detectMapping(rows[0]);
  return validateImport(rows, mapping, { hasHeader, premium: true, remaining: 100, ...ctx });
};

test("parses tab separated paste from a spreadsheet", () => {
  const { delimiter, rows } = parseDelimited(`${HEAD}\nFade cut\tfixed\t500\tper cut\tavailable\tHaircuts\tbarber, fade\n`);
  assert.equal(delimiter, "\t");
  assert.equal(rows.length, 2);
  assert.equal(rows[1][6], "barber, fade");
});

test("parses CSV with quotes, commas, newlines and a BOM", () => {
  const { delimiter, rows } = parseDelimited('﻿name,price\r\n"Cake, large",1500\r\n"He said ""hi""\nthere",20\r\n');
  assert.equal(delimiter, ",");
  assert.deepEqual(rows, [["name", "price"], ["Cake, large", "1500"], ['He said "hi"\nthere', "20"]]);
});

test("detects headers and falls back to positions", () => {
  const found = detectMapping(HEAD.split("\t"));
  assert.equal(found.hasHeader, true);
  assert.equal(found.mapping.price_type, 1);
  assert.equal(found.mapping.tags, 6);
  const noHeader = detectMapping(["Fade cut", "500"]);
  assert.equal(noHeader.hasHeader, false);
  assert.deepEqual(positionalMapping(3), { name: 0, price_type: 1, price: 2, unit: null, availability: null, section: null, tags: null });
  assert.equal(detectMapping(["Product", "Cost", "Category"]).mapping.section, 2);
});

test("valid rows are normalised", () => {
  const r = run(`${HEAD}\nFade cut\tFixed\tKES 1,500\tper cut\tin stock\tHaircuts\tbarber; Fade | barber\nColour\trange\t1000-3000\t\tby appointment\t\t\nConsult\tfree\t\t\t\t\t`);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.valid.length, 3);
  assert.deepEqual(r.valid[0].value, { name: "Fade cut", price_type: "fixed", price: 1500, price_max: null, unit: "per cut", availability: "available", section: "Haircuts", tags: ["barber", "Fade"] });
  assert.deepEqual([r.valid[1].value.price, r.valid[1].value.price_max, r.valid[1].value.availability], [1000, 3000, "by_appointment"]);
  assert.equal(r.valid[2].value.price_type, "free");
  assert.equal(toImportPayload(r.valid).length, 3);
});

test("a missing price type is inferred from the price", () => {
  const r = run("name\tprice\nA cut\t300\nB cut\t\nC cut\t100-200");
  assert.deepEqual(r.valid.map((v) => v.value.price_type), ["fixed", "contact", "range"]);
});

test("every field is validated per row", () => {
  const long = "x".repeat(121);
  const r = run([
    HEAD,
    `A\tfixed\t100\t\t\t\t`,
    `\tfixed\t100\t\t\t\t`,
    `${long}\tfixed\t100\t\t\t\t`,
    `Bad type\tweird\t100\t\t\t\t`,
    `Bad price\tfixed\tabc\t\t\t\t`,
    `No price\tfixed\t\t\t\t\t`,
    `Negative\tfixed\t-5\t\t\t\t`,
    `Free priced\tfree\t50\t\t\t\t`,
    `Bad avail\tfixed\t10\t\tmaybe\t\t`,
    `Bad range\trange\t300-100\t\t\t\t`,
    `Long unit\tfixed\t10\t${"u".repeat(31)}\t\t\t`,
    `Long section\tfixed\t10\t\t\t${"s".repeat(61)}\t`,
    `Many tags\tfixed\t10\t\t\t\t${Array.from({ length: 11 }, (_, i) => `t${i}`).join(",")}`,
    `Long tag\tfixed\t10\t\t\t\t${"g".repeat(31)}`,
    `Two prices\tfixed\t10-20\t\t\t\t`,
    `Good one\tfixed\t10\t\t\t\t`,
  ].join("\n"));
  assert.equal(r.valid.length, 1);
  assert.equal(r.rejected.length, 15);
  assert.equal(r.rejected[0].row, 2);
  assert.match(r.rejected[0].errors[0], /at least 2/);
  assert.match(r.rejected[1].errors[0], /at least 2/);
  assert.match(r.rejected[2].errors[0], /over 120/);
  assert.match(r.rejected[3].errors[0], /Price type/);
  assert.match(r.rejected[4].errors[0], /must be a number/);
  assert.match(r.rejected[5].errors[0], /required/);
  assert.match(r.rejected[7].errors[0], /free item/);
  assert.match(r.rejected[8].errors[0], /Availability/);
  assert.match(r.rejected[9].errors[0], /below the minimum/);
  assert.match(r.rejected[10].errors[0], /Unit/);
  assert.match(r.rejected[11].errors[0], /Section/);
  assert.match(r.rejected[12].errors[0], /at most 10 tags/);
  assert.match(r.rejected[13].errors[0], /tag is over/);
  assert.match(r.rejected[14].errors[0], /range price type/);
});

test("formula injection is refused in every mapped column", () => {
  for (const bad of ["=HYPERLINK(\"http://x\")", "+1+1", "-2+3", "@SUM(A1)", "  =1+1", "\t=1+1", "​=1"]) {
    assert.equal(startsWithFormula(bad), true, JSON.stringify(bad));
  }
  assert.equal(startsWithFormula("Fade cut"), false);
  const cols = { name: 0, price_type: 1, price: 2, unit: 3, availability: 4, section: 5, tags: 6 };
  const base = ["Fade", "fixed", "100", "", "", "", ""];
  for (let i = 0; i < 7; i += 1) {
    const cells = [...base];
    cells[i] = "=cmd|' /C calc'!A0";
    const res = validateRow(cells, cols);
    assert.equal(res.errors.length, 1, `column ${i}`);
    assert.match(res.errors[0], /formula/);
  }
  assert.equal(safeCell("=1+1"), "'=1+1");
  assert.equal(safeCell("plain"), "plain");
});

test("the Premium lock and the size limits", () => {
  const rows = parse(`${HEAD}\nA cut\tfixed\t100\t\t\t\t`);
  const { mapping } = detectMapping(rows[0]);
  const locked = validateImport(rows, mapping, { hasHeader: true, premium: false, remaining: 10 });
  assert.equal(locked.locked, true);
  assert.equal(locked.valid.length, 0);
  const many = [HEAD, ...Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `Item ${i}\tfixed\t10\t\t\t\t`)].join("\n");
  const tooMany = run(many);
  assert.equal(tooMany.tooMany, true);
  assert.match(tooMany.message, /at most 500 rows/);
  assert.equal(run([HEAD, ...Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => `Item ${i}\tfixed\t10\t\t\t\t`)].join("\n"), { remaining: 500 }).valid.length, 500);
  assert.equal(run("name\tprice").valid.length, 0);
  assert.equal(validateImport(rows, { ...mapping, name: null }, { hasHeader: true, premium: true, remaining: 5 }).message, "Choose which column holds the item name.");
});

test("rows over the plan limit are refused with a message", () => {
  const r = run(`${HEAD}\nA one\tfixed\t10\t\t\t\t\nB two\tfixed\t10\t\t\t\t\nC three\tfixed\t10\t\t\t\t`, { remaining: 2 });
  assert.equal(r.valid.length, 2);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.overLimit, 1);
  assert.match(r.rejected[0].errors[0], /plan limit. You can add 2 more items/);
  const none = run(`${HEAD}\nA one\tfixed\t10\t\t\t\t`, { remaining: 0 });
  assert.equal(none.valid.length, 0);
  assert.equal(none.rejected.length, 1);
});

test("file checks", () => {
  assert.equal(checkImportFile({ name: "items.csv", size: 100, type: "text/csv" }).ok, true);
  assert.equal(checkImportFile({ name: "items.csv", size: IMPORT_MAX_BYTES + 1, type: "text/csv" }).ok, false);
  assert.equal(checkImportFile({ name: "items.xlsx", size: 100, type: "application/vnd.ms-excel" }).ok, false);
  assert.equal(checkImportFile(null).ok, false);
});

test("the error report names each problem and defuses formulas", () => {
  const r = run(`${HEAD}\nGood\tfixed\t10\t\t\t\t\n=BAD()\tfixed\t10\t\t\t\t\nNo price\tfixed\t\t\t\t\t`);
  const csv = errorReportCsv(r.rejected, HEAD.split("\t"));
  const lines = csv.split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Row,Problems,name,/);
  assert.match(lines[1], /^3,/);
  assert.ok(lines[1].includes("'=BAD()"));
  assert.ok(!/(^|,)=BAD/.test(lines[1]));
  assert.match(lines[2], /required/);
});
