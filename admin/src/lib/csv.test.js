import { test } from "node:test";
import assert from "node:assert/strict";
import { cell, csvFilename, defuse, toCsv } from "./csv.js";

test("plain values are written as they are; commas, quotes and line breaks are quoted", () => {
  assert.equal(cell("Mara Fresh"), "Mara Fresh");
  assert.equal(cell("Mara, Fresh"), '"Mara, Fresh"');
  assert.equal(cell('The "best" shop'), '"The ""best"" shop"');
  assert.equal(cell("two\nlines"), '"two\nlines"');
  assert.equal(cell(42), "42");
  assert.equal(cell(0), "0");
  assert.equal(cell(true), "true");
  assert.equal(cell(null), "");
  assert.equal(cell(undefined), "");
  assert.equal(cell(NaN), "");
  assert.equal(cell(new Date("2026-10-15T09:00:00Z")), "2026-10-15T09:00:00.000Z");
});

test("text that looks like a spreadsheet formula is defused", () => {
  for (const bad of ["=1+1", "=HYPERLINK(\"http://x\",\"hi\")", "@SUM(A1:A2)", "+cmd|' /C calc'!A0", "-2+3+cmd", "\tTab", "\rCR"]) {
    assert.ok(defuse(bad).startsWith("'"), bad);
  }
  assert.equal(cell("=1+1"), "'=1+1");
  assert.equal(cell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
});

test("phone numbers and negative numbers are not mangled", () => {
  assert.equal(cell("+254 700 000 001"), "+254 700 000 001");
  assert.equal(cell("+254700000001"), "+254700000001");
  assert.equal(cell("-5"), "-5");
  assert.equal(cell(-5), "-5");
  assert.equal(cell("(020) 555-0100"), "(020) 555-0100");
});

test("toCsv writes a header, uses csv accessors, ends rows with CRLF and can add a BOM", () => {
  const columns = [{ key: "name", label: "Business" }, { key: "fee", label: "Fee (KES)" }, { key: "who", label: "Reviewer", csv: (r) => r.reviewer?.name ?? "Unassigned" }];
  const rows = [{ name: "Zuri, Studio", fee: 1500, reviewer: { name: "Amina" } }, { name: "=evil()", fee: 0 }];
  assert.equal(toCsv(columns, rows), 'Business,Fee (KES),Reviewer\r\n"Zuri, Studio",1500,Amina\r\n\'=evil(),0,Unassigned\r\n');
  assert.equal(toCsv(columns, [], { bom: true }), "\uFEFFBusiness,Fee (KES),Reviewer\r\n");
});

test("the filename uses the Nairobi date, not the UTC one", () => {
  assert.equal(csvFilename("Applications", new Date("2026-10-15T22:30:00Z")), "applications-2026-10-16.csv"); // already the 16th in Nairobi
  assert.equal(csvFilename("  Seller / list!! "), csvFilename("seller-list"));
  assert.match(csvFilename(""), /^export-\d{4}-\d{2}-\d{2}\.csv$/);
});
