import { describe, expect, it } from "vitest";
import { scales } from "@epicmkt/shared";
import { MAX_VALUES, addValue, dimensionBoxes, mergeKey, moveValue, numberRange, readDimensions, readEntries, removeValue, shoeRange, unitOptions, warningFor } from "./scaleEditing.js";

const val = (scale, raw, ctx = {}) => scales.parse(scale, raw, ctx).value;

describe("addValue", () => {
  it("merges duplicates by sizeKey: 20 litres and 20 L are one value", () => {
    const a = addValue([], val("volume", "20 litres")).values;
    const r = addValue(a, val("volume", "20 L"));
    expect(r).toMatchObject({ added: false, merged: true });
    expect(r.values).toHaveLength(1);
  });
  it("keeps shoe widths apart but not the same width twice", () => {
    const narrow = { ...val("shoe", "EU 42"), width: "narrow" };
    const wide = { ...val("shoe", "EU 42"), width: "wide" };
    const list = addValue(addValue([], narrow).values, wide).values;
    expect(list).toHaveLength(2);
    expect(addValue(list, { ...narrow }).merged).toBe(true);
  });
  it("shoe 42 and dress 42 never merge", () => {
    const shoe = val("shoe", "EU 42");
    const dress = val("apparel-numeric", "US 42".replace("US 42", "US 12"));
    expect(mergeKey(shoe)).not.toBe(mergeKey(dress));
    expect(mergeKey(val("shoe", "EU 42"))).not.toBe(mergeKey(val("screen-inch", "42")));
  });
  it("stops at the limit", () => {
    const many = Array.from({ length: MAX_VALUES }, (_, i) => val("count", String(i + 1)));
    expect(addValue(many, val("count", "999"))).toMatchObject({ added: false, full: true });
  });
});

describe("move and remove", () => {
  const list = [1, 2, 3].map((n) => val("count", String(n)));
  it("moves a value one place and ignores moves off the ends", () => {
    expect(moveValue(list, 0, 1).map((v) => v.value)).toEqual([2, 1, 3]);
    expect(moveValue(list, 0, -1)).toBe(list);
    expect(moveValue(list, 2, 1)).toBe(list);
  });
  it("removes by position", () => expect(removeValue(list, 1).map((v) => v.value)).toEqual([1, 3]));
});

describe("readEntries", () => {
  it("asks for a unit instead of guessing: 20 litres reads, 20 asks", () => {
    expect(readEntries("volume", "20 litres")).toMatchObject({ ok: true });
    const r = readEntries("volume", "20");
    expect(r).toMatchObject({ ok: false, needsUnit: true, text: "20" });
    expect(r.units).toEqual(["ml", "l"]);
  });
  it("uses the units the parse error named", () => {
    expect(unitOptions("storage", { options: ["MB", "GB", "TB"] })).toEqual(["MB", "GB", "TB"]);
    expect(unitOptions("weight", null)).toEqual(["g", "kg"]);
  });
  it("reads several entries separated by commas, and stops at the first bad one", () => {
    expect(readEntries("volume", "5 L, 10 L, 20 litres").values).toHaveLength(3);
    const bad = readEntries("volume", "5 L, banana, 10 L");
    expect(bad).toMatchObject({ ok: false, text: "banana", needsUnit: false });
  });
  it("is empty-safe", () => expect(readEntries("volume", "  ").ok).toBe(false));
  it("5 m and 500 cm are one value, 1 TB and 1024 GB are one value", () => {
    expect(mergeKey(val("length", "5 m"))).toBe(mergeKey(val("length", "500 cm")));
    expect(mergeKey(val("storage", "1 TB"))).toBe(mergeKey(val("storage", "1024 GB")));
    expect(mergeKey(val("length", "5 m"))).not.toBe(mergeKey(val("length", "6 m")));
    expect(mergeKey(val("volume", "1 L"))).not.toBe(mergeKey(val("weight", "1 kg")));
  });
});

describe("warnings", () => {
  it("a 750 cm high table warns; nothing without a type", () => {
    const v = val("dimensions", "120 x 60 x 750 cm", { typeId: "table" });
    expect(warningFor("table", "dimensions", v)).toMatch(/750/);
    expect(warningFor(null, "dimensions", v)).toBe("");
    expect(warningFor("table", "dimensions", val("dimensions", "120 x 60 x 75 cm", { typeId: "table" }))).toBe("");
  });
});

describe("shoeRange", () => {
  it("EU 38 to 47 in half steps gives 19 sizes", () => {
    const r = shoeRange({ system: "eu", from: 38, to: 47, step: 0.5 });
    expect(r.ok).toBe(true);
    expect(r.values).toHaveLength(19);
    expect(r.values[0]).toMatchObject({ system: "eu", value: 38 });
    expect(r.values.at(-1)).toMatchObject({ value: 47 });
  });
  it("whole steps, UK", () => expect(shoeRange({ system: "uk", from: 5, to: 10, step: 1 }).values).toHaveLength(6));
  it("sizes outside the chart are skipped and counted", () => {
    const r = shoeRange({ system: "eu", from: 45, to: 60, step: 1 });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBeGreaterThan(0);
    expect(r.values.length + r.skipped).toBe(16);
  });
  it("refuses a backwards, empty or huge range", () => {
    expect(shoeRange({ system: "eu", from: 47, to: 38, step: 1 }).ok).toBe(false);
    expect(shoeRange({ system: "eu", from: "", to: 38, step: 1 }).ok).toBe(false);
    expect(shoeRange({ system: "eu", from: 1, to: 500, step: 0.5 }).error).toMatch(/or fewer/);
  });
});

describe("numberRange", () => {
  it("US dress 4 to 16 in twos", () => expect(numberRange("apparel-numeric", { from: 4, to: 16, step: 2 }, { system: "us" }).values).toHaveLength(7));
  it("passes a scale error on", () => expect(numberRange("apparel-numeric", { from: 1, to: 99, step: 1 }, { system: "us" }).ok).toBe(false));
});

describe("dimension boxes and reading", () => {
  const labels = (t, shape = "rectangular") => dimensionBoxes(t, shape).map((b) => b.label);
  it("labels follow the product type", () => {
    expect(labels("table")).toEqual(["Length", "Width", "Height"]);
    expect(labels("sofa")).toEqual(["Width", "Depth", "Height"]);
    expect(labels("door")).toEqual(["Width", "Height"]);
    expect(labels("table", "round")).toEqual(["Diameter", "Height"]);
    expect(labels(null)).toEqual(["Length", "Width", "Height"]);
  });
  it("short labels come from the profile (L W H, W D H, Ø H)", () => {
    expect(dimensionBoxes("sofa", "rectangular").map((b) => b.short)).toEqual(["W", "D", "H"]);
    expect(dimensionBoxes("table", "round").map((b) => b.short)).toEqual(["Ø", "H"]);
  });
  it("reads the typed boxes with the unit chosen", () => {
    const r = readDimensions({ typeId: "table", shape: "rectangular", unit: "cm", numbers: ["120", "60", "75"] });
    expect(r.value).toMatchObject({ scale: "dimensions", shape: "rectangular", value: "120x60x75", unit: "cm" });
    expect(readDimensions({ typeId: "table", shape: "round", unit: "cm", numbers: ["90", "75"] }).value).toMatchObject({ shape: "round", value: "90x75" });
  });
  it("refuses impossible numbers and empty boxes, with a sentence", () => {
    expect(readDimensions({ typeId: "table", shape: "rectangular", unit: "cm", numbers: ["120", "60", "0"] }).ok).toBe(false);
    expect(readDimensions({ typeId: "table", shape: "rectangular", unit: "cm", numbers: ["", "", ""] })).toMatchObject({ ok: false, empty: true });
    expect(readDimensions({ typeId: "table", shape: "rectangular", unit: "cm", numbers: ["120"] }).error.message).toMatch(/Length x Width x Height/);
  });
});
