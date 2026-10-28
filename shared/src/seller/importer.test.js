import { test } from "node:test";
import assert from "node:assert/strict";
import {
  IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, checkImportFile, detectMapping, errorReportCsv, parseDelimited, positionalMapping, safeCell, startsWithFormula,
  IMPORT_FIELDS, specColumnOf, toImportPayload, validateImport, validateRow,
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
  assert.deepEqual(positionalMapping(3), { name: 0, price_type: 1, price: 2, unit: null, availability: null, section: null, tags: null, brand: null, short_description: null, pack_size: null, terms: null, includes: null, highlights: null, specs: [] });
  assert.deepEqual(Object.values(positionalMapping(12)).slice(0, 7), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Object.values(positionalMapping(12)).slice(7), [null, null, null, null, null, null, []]);
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
  const cols = { name: 0, price_type: 1, price: 2, unit: 3, availability: 4, section: 5, tags: 6, brand: 7, short_description: 8, pack_size: 9, terms: 10, includes: 11 };
  const base = ["Fade", "fixed", "100", "", "", "", "", "", "", "", "", ""];
  for (let i = 0; i < 12; i += 1) {
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

const DETAIL_HEAD = `${HEAD}\tbrand\tshort description\tpack size\tterms\tincludes`;

test("detail columns are detected by their headers and stay out of the row when empty", () => {
  const found = detectMapping(DETAIL_HEAD.split("\t"));
  assert.deepEqual([found.mapping.brand, found.mapping.short_description, found.mapping.pack_size, found.mapping.terms, found.mapping.includes], [7, 8, 9, 10, 11]);
  const r = run(`${DETAIL_HEAD}\nCake\tfixed\t900\t\t\t\t\tAcme\tFresh daily\tBox of 6\tOrder a day ahead\tCandles | Knife | Box\nPlain\tfixed\t10\t\t\t\t\t\t\t\t\t`);
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.valid[0].value, {
    name: "Cake", price_type: "fixed", price: 900, price_max: null, unit: null, availability: "available", section: null, tags: [],
    brand: "Acme", short_description: "Fresh daily", pack_size: "Box of 6", terms: "Order a day ahead", includes: ["Candles", "Knife", "Box"],
  });
  assert.deepEqual(Object.keys(r.valid[1].value), ["name", "price_type", "price", "price_max", "unit", "availability", "section", "tags"]);
});

test("detail columns are limited like the database limits them", () => {
  const bad = (cell, index) => {
    const cells = ["Cake", "fixed", "900", "", "", "", "", "", "", "", "", ""];
    cells[index] = cell;
    return validateRow(cells, { ...positionalMapping(7), brand: 7, short_description: 8, pack_size: 9, terms: 10, includes: 11 });
  };
  assert.match(bad("x".repeat(61), 7).errors[0], /Brand is over 60/);
  assert.match(bad("x".repeat(141), 8).errors[0], /Short description is over 140/);
  assert.match(bad("x".repeat(41), 9).errors[0], /Pack size is over 40/);
  assert.match(bad("x".repeat(501), 10).errors[0], /Terms is over 500/);
  assert.match(bad(Array.from({ length: 11 }, (_, i) => `p${i}`).join("|"), 11).errors[0], /at most 10 included/);
  assert.match(bad("x".repeat(81), 11).errors[0], /included item is over 80/);
  assert.equal(bad("x".repeat(60), 7).errors.length, 0);
  assert.equal(bad("x".repeat(500), 10).errors.length, 0);
});

test("included items are separated by | only, so a comma stays inside one item", () => {
  const r = run(`${DETAIL_HEAD}\nCake\tfixed\t900\t\t\t\t\t\t\t\t\tCandles, matches | Knife; fork |  | knife; FORK`);
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.valid[0].value.includes, ["Candles, matches", "Knife; fork"]);
});

test("a highlights column splits on | and keeps plain text rows", () => {
  const head = `${HEAD}\thighlights`;
  assert.equal(detectMapping(head.split("\t")).mapping.highlights, 7);
  const r = run(`${head}\nKettle\tfixed\t900\t\t\t\t\tBoils in 3 minutes | Auto shut-off, quiet |\nPlain\tfixed\t10\t\t\t\t\t`);
  assert.deepEqual(r.valid[0].value.highlights, [{ text: "Boils in 3 minutes" }, { text: "Auto shut-off, quiet" }]);
  assert.equal("highlights" in r.valid[1].value, false);
  const many = run(`${head}\nKettle\tfixed\t900\t\t\t\t\t${Array.from({ length: 9 }, (_, i) => `Point ${i}`).join(" | ")}`);
  assert.match(many.rejected[0].errors[0], /at most 8 highlights/);
  const long = run(`${head}\nKettle\tfixed\t900\t\t\t\t\t${"x".repeat(201)}`);
  assert.match(long.rejected[0].errors[0], /highlight is over 200/);
  assert.equal(run(`${head}\nKettle\tfixed\t900\t\t\t\t\t${"x".repeat(200)}`).rejected.length, 0);
  assert.match(run(`${head}\nKettle\tfixed\t900\t\t\t\t\tFast | -5 minutes`).rejected[0].errors[0], /Highlights starts with/);
});

test("spec:Label headers become specification columns, grouped by an optional prefix", () => {
  assert.deepEqual(specColumnOf("spec:Material", 3), { index: 3, group: "Features & Specs", label: "Material" });
  assert.deepEqual(specColumnOf("  Spec : Color ", 4), { index: 4, group: "Features & Specs", label: "Color" });
  assert.deepEqual(specColumnOf("spec:Measurements/Weight", 5), { index: 5, group: "Measurements", label: "Weight" });
  assert.deepEqual(specColumnOf("SPEC:user guide/Care", 6), { index: 6, group: "User guide", label: "Care" });
  assert.deepEqual(specColumnOf("spec:Width/Height", 7), { index: 7, group: "Features & Specs", label: "Width/Height" });
  assert.deepEqual(specColumnOf("spec:Measurements/", 8), { index: 8, group: "Features & Specs", label: "Measurements/" });
  assert.equal(specColumnOf("spec:", 1), null);
  assert.equal(specColumnOf("specs", 1), null);
  assert.equal(specColumnOf("Material", 1), null);
  const head = `${HEAD}\tspec:Material\tspec:Measurements/Weight\tspec:Colour`;
  const found = detectMapping(head.split("\t"));
  assert.deepEqual(found.mapping.specs.map((c) => [c.index, c.group, c.label]), [[7, "Features & Specs", "Material"], [8, "Measurements", "Weight"], [9, "Features & Specs", "Colour"]]);
  assert.equal(found.hasHeader, true);
  const r = run(`${head}\nKettle\tfixed\t900\t\t\t\t\tSteel\t1.2 kg\t\nPlain\tfixed\t10\t\t\t\t\t\t\t`);
  assert.deepEqual(r.valid[0].value.specs, [{ group: "Features & Specs", label: "Material", value: "Steel" }, { group: "Measurements", label: "Weight", value: "1.2 kg" }]);
  assert.equal("specs" in r.valid[1].value, false, "an item with every spec cell empty has no specs");
  assert.equal(IMPORT_FIELDS.includes("specs"), false);
});

test("spec cells use the same limits as the item form", () => {
  const head = `${HEAD}\tspec:Material\tspec:Colour`;
  const long = run(`${head}\nKettle\tfixed\t900\t\t\t\t\t${"x".repeat(121)}\tBlack`);
  assert.match(long.rejected[0].errors[0], /Spec "Material": Use 120 characters or fewer/);
  assert.equal(run(`${head}\nKettle\tfixed\t900\t\t\t\t\t${"x".repeat(120)}\tBlack`).rejected.length, 0);
  const longLabel = run(`${HEAD}\tspec:${"L".repeat(41)}\nKettle\tfixed\t900\t\t\t\t\tSteel`);
  assert.match(longLabel.rejected[0].errors[0], /Spec "L+": Use 40 characters or fewer/);
  assert.equal(run(`${HEAD}\tspec:${"L".repeat(40)}\nKettle\tfixed\t900\t\t\t\t\tSteel`).rejected.length, 0);
  const cols = Array.from({ length: 21 }, (_, i) => `spec:Label ${i}`);
  const row = (n) => `Kettle\tfixed\t900\t\t\t\t\t${Array.from({ length: n }, (_, i) => `v${i}`).join("\t")}`;
  assert.match(run(`${HEAD}\t${cols.join("\t")}\n${row(21)}`).rejected[0].errors[0], /at most 20 specifications/);
  assert.equal(run(`${HEAD}\t${cols.slice(0, 20).join("\t")}\n${row(20)}`).rejected.length, 0);
  // The same label under two columns keeps the first, as the item form does.
  const dup = run(`${HEAD}\tspec:Colour\tspec:colour\nKettle\tfixed\t900\t\t\t\t\tBlack\tWhite`);
  assert.deepEqual(dup.valid[0].value.specs, [{ group: "Features & Specs", label: "Colour", value: "Black" }]);
  const formula = run(`${HEAD}\tspec:Colour\nKettle\tfixed\t900\t\t\t\t\t=cmd`);
  assert.match(formula.rejected[0].errors[0], /Spec "Colour" starts with = \+ - or @/);
});

test("bad rows are reported with their row number and the good rows are still ready", () => {
  const head = `${HEAD}\tbrand\thighlights\tspec:Material`;
  const r = run(`${head}\nGood\tfixed\t10\t\t\t\t\tAcme\tFast\tSteel\nBad brand\tfixed\t10\t\t\t\t\t${"b".repeat(61)}\t\t\nGood two\tfixed\t20\t\t\t\t\t\t\t\nBad spec\tfixed\t10\t\t\t\t\t\t\t${"s".repeat(121)}`);
  assert.deepEqual(r.valid.map((v) => [v.row, v.value.name]), [[2, "Good"], [4, "Good two"]]);
  assert.deepEqual(r.rejected.map((x) => x.row), [3, 5]);
  assert.deepEqual(toImportPayload(r.valid).map((p) => p.row), [2, 4]);
  assert.deepEqual(toImportPayload(r.valid)[0].highlights, [{ text: "Fast" }]);
});

test("old files without the new columns import exactly as before", () => {
  const r = run(`${HEAD}\nFade cut\tfixed\t500\tper cut\tavailable\tHaircuts\tbarber, fade`);
  assert.deepEqual(r.valid[0].value, { name: "Fade cut", price_type: "fixed", price: 500, price_max: null, unit: "per cut", availability: "available", section: "Haircuts", tags: ["barber", "fade"] });
  assert.deepEqual(toImportPayload(r.valid), [{ ...r.valid[0].value, row: 2 }]);
  const noHeader = parse("Fade cut\tfixed\t500");
  assert.deepEqual(validateImport(noHeader, positionalMapping(3), { hasHeader: false, premium: true, remaining: 5 }).valid.length, 1);
});
