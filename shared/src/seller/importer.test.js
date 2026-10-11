import { describe, expect, it } from "vitest";
import {
  IMPORT_LIMITS,
  canImport,
  checkInput,
  detectDelimiter,
  errorReportCsv,
  hasFormulaStart,
  importProblem,
  parseDelimited,
  readTable,
  suggestMapping,
  validateImport,
  validateRow
} from "./importer.js";

const map = { name: 0, price_type: 1, price: 2, price_max: 3, unit: 4, availability: 5, section: 6, tags: 7 };
const row = (o = {}) => {
  const base = { name: "Fade", price_type: "fixed", price: "500", price_max: "", unit: "cut", availability: "available", section: "Cuts", tags: "barber, fade" };
  const r = { ...base, ...o };
  return [r.name, r.price_type, r.price, r.price_max, r.unit, r.availability, r.section, r.tags];
};

describe("parsing", () => {
  it("detects tabs from Excel and commas from CSV", () => {
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter('"a,b",c')).toBe(",");
  });
  it("reads quoted cells, escaped quotes, embedded newlines and CRLF", () => {
    const rows = parseDelimited('name,note\r\n"Cut, fade","say ""hi"""\r\n"two\nlines",x\r\n');
    expect(rows).toEqual([["name", "note"], ["Cut, fade", 'say "hi"'], ["two\nlines", "x"]]);
  });
  it("skips blank rows and a byte order mark", () => {
    expect(parseDelimited("﻿a\tb\n\n\t\nc\td")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("table and mapping", () => {
  it("detects headers and suggests columns", () => {
    const t = readTable("Product\tCost\tCategory\tKeywords\nFade\t500\tCuts\tbarber");
    expect(t.ok).toBe(true);
    expect(t.hasHeader).toBe(true);
    expect(t.mapping).toEqual({ name: 0, price: 1, section: 2, tags: 3 });
    expect(t.rows).toHaveLength(1);
  });
  it("treats data without headers as rows", () => {
    const t = readTable("Fade\t500\nShave\t300");
    expect(t.hasHeader).toBe(false);
    expect(t.rows).toHaveLength(2);
    expect(t.headers).toEqual(["Column 1", "Column 2"]);
    expect(t.mapping).toEqual({});
    expect(importProblem(t.mapping)).toMatch(/name/);
  });
  it("maps each header once", () => {
    expect(suggestMapping(["Name", "Item", "Price"])).toEqual({ name: 0, price: 2 });
  });
  it("refuses empty input and header-only input", () => {
    expect(readTable("   \n ").ok).toBe(false);
    expect(readTable("Name\tPrice").ok).toBe(false);
  });
});

describe("limits", () => {
  it("refuses files over 2 MB", () => {
    const big = "a".repeat(IMPORT_LIMITS.maxBytes + 1);
    expect(checkInput(big).ok).toBe(false);
    expect(readTable(big).error).toMatch(/2 MB/);
    expect(checkInput("a", IMPORT_LIMITS.maxBytes).ok).toBe(true);
    expect(checkInput("a", IMPORT_LIMITS.maxBytes + 1).ok).toBe(false);
  });
  it("refuses more than 500 rows and accepts exactly 500", () => {
    const make = (count) => ["Name\tPrice", ...Array.from({ length: count }, (_, i) => `Item ${i}\t${100 + i}`)].join("\n");
    expect(readTable(make(500)).ok).toBe(true);
    const over = readTable(make(501));
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/501 rows/);
  });
  it("Standard plan is locked, Premium allowed", () => {
    expect(canImport("standard")).toBe(false);
    expect(canImport("premium")).toBe(true);
    expect(canImport(undefined)).toBe(false);
  });
});

describe("row validation", () => {
  it("accepts a complete row and normalises it", () => {
    const r = validateRow(row({ name: "  Fade   Cut ", price: "KSh 1,200", availability: "Out of stock", tags: "Barber; fade | BARBER" }), map);
    expect(r.ok).toBe(true);
    expect(r.item).toEqual({ name: "Fade Cut", price_type: "fixed", price: 1200, price_max: null, unit: "cut", availability: "out_of_stock", section: "Cuts", search_tags: ["Barber", "fade"] });
  });
  it("applies defaults for missing optional columns", () => {
    const r = validateRow(["Fade", "500"], { name: 0, price: 1 });
    expect(r.item).toMatchObject({ price_type: "fixed", availability: "available", unit: null, section: null, search_tags: [] });
  });
  it("checks names", () => {
    expect(validateRow(row({ name: "" }), map).errors[0]).toMatch(/^Name/);
    expect(validateRow(row({ name: "x".repeat(81) }), map).errors[0]).toMatch(/80/);
  });
  it("checks price type and price rules", () => {
    expect(validateRow(row({ price_type: "weird" }), map).errors[0]).toMatch(/^Price type/);
    expect(validateRow(row({ price: "" }), map).errors[0]).toMatch(/^Price: enter/);
    expect(validateRow(row({ price: "12.5" }), map).errors[0]).toMatch(/whole/);
    expect(validateRow(row({ price: "abc" }), map).errors[0]).toMatch(/number/);
    expect(validateRow(row({ price_type: "free", price: "" }), map).ok).toBe(true);
    expect(validateRow(row({ price_type: "contact", price: "100" }), map).errors[0]).toMatch(/blank/);
    expect(validateRow(row({ price_type: "from", price: "100" }), map).item.price_type).toBe("from");
    expect(validateRow(row({ price_type: "range", price: "100", price_max: "300" }), map).item).toMatchObject({ price: 100, price_max: 300 });
    expect(validateRow(row({ price_type: "range", price: "300", price_max: "100" }), map).errors[0]).toMatch(/above/);
    expect(validateRow(row({ price_type: "range", price: "300", price_max: "" }), map).errors[0]).toMatch(/Highest/);
    expect(validateRow(row({ price_max: "900" }), map).errors[0]).toMatch(/only used/);
  });
  it("checks availability, unit, section and tags", () => {
    expect(validateRow(row({ availability: "nope" }), map).errors[0]).toMatch(/^Availability/);
    expect(validateRow(row({ unit: "u".repeat(31) }), map).errors[0]).toMatch(/^Unit/);
    expect(validateRow(row({ section: "s".repeat(41) }), map).errors[0]).toMatch(/^Section/);
    expect(validateRow(row({ tags: Array.from({ length: 16 }, (_, i) => `t${i}`).join(",") }), map).errors[0]).toMatch(/15/);
    expect(validateRow(row({ tags: "t".repeat(31) }), map).errors[0]).toMatch(/30/);
  });
  it("collects several problems in one row", () => {
    expect(validateRow(row({ name: "", price: "x", availability: "nope" }), map).errors).toHaveLength(3);
  });
});

describe("spreadsheet injection", () => {
  it("recognises formula starts", () => {
    for (const s of ["=1+1", "+254712", "-2", "@SUM(A1)", "\tcmd", "\rcmd"]) expect(hasFormulaStart(s)).toBe(true);
    for (const s of ["Fade", "5 - 3", "a=b", ""]) expect(hasFormulaStart(s)).toBe(false);
  });
  it("refuses a row when any mapped cell starts with a formula character", () => {
    for (const field of ["name", "unit", "section", "tags", "price", "availability", "price_type"]) {
      const r = validateRow(row({ [field]: "=HYPERLINK(\"http://x\")" }), map);
      expect(r.ok).toBe(false);
      expect(r.errors[0]).toMatch(/starts with =, \+, - or @/);
    }
    expect(validateRow(row({ name: "@evil" }), map).ok).toBe(false);
    expect(validateRow(row({ price: "-100" }), map).ok).toBe(false);
  });
  it("prefixes formula characters in the error report", () => {
    const rejected = [{ row: 2, cells: ["=1+1", "500"], errors: ["Name: starts with =, +, - or @, which is not allowed."] }];
    const csv = errorReportCsv(rejected, ["Name", "Price"]);
    expect(csv.split("\r\n")[1].startsWith("2,'=1+1,500,")).toBe(true);
  });
});

describe("validating a whole import", () => {
  const rows = [row({ name: "A" + "a" }), row({ name: "" }), row({ name: "Cc" }), row({ name: "Dd" })];
  it("separates valid and rejected rows with row numbers", () => {
    const r = validateImport(rows, map);
    expect(r.valid.map((x) => x.row)).toEqual([1, 3, 4]);
    expect(r.rejected.map((x) => x.row)).toEqual([2]);
    expect(r.items).toHaveLength(3);
  });
  it("refuses rows beyond the plan limit with a clear message", () => {
    const r = validateImport(rows, map, { capacity: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.overLimit).toBe(1);
    expect(r.rejected.find((x) => x.row === 4).errors[0]).toMatch(/Over your plan limit/);
    expect(validateImport(rows, map, { capacity: 0 }).items).toHaveLength(0);
  });
  it("builds a downloadable error report", () => {
    const r = validateImport(rows, map);
    const csv = errorReportCsv(r.rejected, ["Name", "Type", "Price", "Max", "Unit", "Avail", "Section", "Tags"]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("Row,Name,Type,Price,Max,Unit,Avail,Section,Tags,Problems");
    expect(lines[1].startsWith("2,")).toBe(true);
    expect(lines[1]).toContain("Name: enter at least 2 characters.");
  });
  it("quotes cells that contain commas and quotes in the report", () => {
    const csv = errorReportCsv([{ row: 1, cells: ['a,"b"'], errors: ["bad"] }], ["Name"]);
    expect(csv.split("\r\n")[1]).toBe('1,"a,""b""",bad');
  });
});
