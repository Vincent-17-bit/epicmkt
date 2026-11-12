import { describe, expect, it } from "vitest";
import { canToggleUnit, chartInUnit, convertCell, matchRow, measurementColumns } from "./chartUnits.js";

const dress = { unit: "cm", columns: ["Size", "Bust (cm)", "Waist (cm)", "Fit"], rows: [["S", "86-90", "66", "Slim"], ["M", "91-95", "71", "Regular"]] };

describe("chart units", () => {
  it("converts single numbers and ranges, one decimal", () => {
    expect(convertCell("86", "cm", "in")).toBe("33.9");
    expect(convertCell("86-90", "cm", "in")).toBe("33.9-35.4");
    expect(convertCell("86 to 90", "cm", "in")).toBe("33.9-35.4");
    expect(convertCell("34", "in", "cm")).toBe("86.4");
  });
  it("keeps text and same-unit cells", () => {
    expect(convertCell("Regular", "cm", "in")).toBe("Regular");
    expect(convertCell("86", "cm", "cm")).toBe("86");
  });
  it("finds measurement columns and never converts the size column", () => {
    expect(measurementColumns(dress.rows)).toEqual([false, true, true, false]);
    const shoe = { unit: "cm", columns: ["EU", "Foot (cm)"], rows: [["42", "26.7"], ["43", "27.4"]] };
    expect(chartInUnit(shoe, "in").rows[0][0]).toBe("42");
    expect(chartInUnit(shoe, "in").rows[0][1]).toBe("10.5");
  });
  it("switches the unit in headers and cells and round trips closely", () => {
    const inch = chartInUnit(dress, "in");
    expect(inch.unit).toBe("in");
    expect(inch.columns).toEqual(["Size", "Bust (in)", "Waist (in)", "Fit"]);
    expect(inch.rows[0]).toEqual(["S", "33.9-35.4", "26", "Slim"]);
  });
  it("toggles only when there are measurements", () => {
    expect(canToggleUnit(dress)).toBe(true);
    expect(canToggleUnit({ unit: "age", columns: ["Age"], rows: [["3-4"]] })).toBe(false);
    expect(canToggleUnit({ unit: "cm", columns: ["Size", "Fit"], rows: [["S", "Slim"]] })).toBe(false);
  });
  it("matches the selected size to a row", () => {
    expect(matchRow(dress, "M")).toBe(1);
    expect(matchRow({ rows: [["42"]] }, "EU 42")).toBe(0);
    expect(matchRow(dress, "XL")).toBe(-1);
    expect(matchRow(dress, "")).toBe(-1);
  });
});
