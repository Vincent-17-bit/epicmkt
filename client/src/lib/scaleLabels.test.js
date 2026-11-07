import { beforeEach, describe, expect, it } from "vitest";
import { SHOE_SYSTEMS, chooseShoeSystem, readShoeSystem, scaleLabel, shoeHelp, valueScale, variantDimensions, writeShoeSystem } from "./scaleLabels.js";

const shoeAxis = { key: "size", label: "Size (EU)", scale: "shoe" };
const eu42 = { id: "eu-42", label: "EU 42" };

beforeEach(() => window.localStorage.clear());

describe("scaleLabel", () => {
  it("shows a shoe in the buyer's system and keeps the same size", () => {
    expect(scaleLabel(shoeAxis, eu42, { system: "eu" })).toBe("EU 42");
    expect(scaleLabel(shoeAxis, eu42, { system: "uk" })).toBe("UK 8");
    expect(scaleLabel(shoeAxis, eu42, { system: "us-m" })).toBe("US 9 (men)");
    expect(scaleLabel(shoeAxis, eu42, { system: "us-w" })).toBe("US 10 (women)");
    expect(scaleLabel(shoeAxis, eu42, { system: "cm" })).toBe("26.7 cm");
  });
  it("with no buyer choice, uses the item's default system, else the value's own", () => {
    expect(scaleLabel({ ...shoeAxis, defaultSystem: "uk" }, eu42)).toBe("UK 8");
    expect(scaleLabel(shoeAxis, eu42)).toBe("EU 42");
    expect(chooseShoeSystem({ defaultSystem: "uk" }, "us-m")).toBe("us-m"); // the buyer wins
    expect(chooseShoeSystem({ defaultSystem: "uk" }, null)).toBe("uk");
    expect(chooseShoeSystem({}, "nonsense")).toBeNull();
  });
  it("prefers the stored scale value over the typed label", () => {
    const v = { id: "x", label: "forty-two", scaleValue: { scale: "shoe", system: "eu", value: 42 } };
    expect(scaleLabel(shoeAxis, v, { system: "uk" })).toBe("UK 8");
  });
  it("shows 1024 GB as 1 TB and 2048 GB as 2 TB, with or without a scale", () => {
    const axis = { key: "storage", label: "Storage", scale: "storage" };
    expect(scaleLabel(axis, { id: "a", label: "1024 GB" })).toBe("1 TB");
    expect(scaleLabel(axis, { id: "b", label: "2048 GB" })).toBe("2 TB");
    expect(scaleLabel(axis, { id: "c", label: "128 GB" })).toBe("128 GB");
    expect(scaleLabel({ key: "s", label: "Storage" }, { id: "a", label: "1024 GB" })).toBe("1 TB"); // the old rule still holds
  });
  it("formats collar and count from their scales", () => {
    expect(scaleLabel({ scale: "collar-inch" }, { label: "16" })).toBe('16"');
    expect(scaleLabel({ scale: "count" }, { label: "3-seater" })).toBe("3-seater");
  });
  it("shows the typed label when the axis has no scale or the label does not parse", () => {
    expect(scaleLabel({ key: "c", label: "Colour" }, { label: "Wine red" })).toBe("Wine red");
    expect(scaleLabel(shoeAxis, { label: "Custom fit" })).toBe("Custom fit");
  });
  it("shoe 42 and a 42-inch TV never read as the same thing", () => {
    expect(scaleLabel(shoeAxis, eu42)).not.toBe(scaleLabel({ scale: "screen-inch" }, { label: "42" }));
    expect(scaleLabel({ scale: "screen-inch" }, { label: "42" })).toBe('42"');
  });
});

describe("shoeHelp", () => {
  it("gives every system and the foot length", () => {
    expect(shoeHelp(shoeAxis, eu42)).toBe("EU 42 · UK 8 · US 9 (about 27 cm)");
  });
  it("is empty for other scales and for sizes outside the chart", () => {
    expect(shoeHelp({ scale: "storage" }, { label: "128 GB" })).toBe("");
    expect(shoeHelp(shoeAxis, { label: "EU 12" })).toBe("");
  });
});

describe("valueScale", () => {
  it("is null without an axis scale", () => expect(valueScale({}, eu42)).toBeNull());
  it("parses the label with the axis's scale", () => expect(valueScale(shoeAxis, eu42)).toMatchObject({ scale: "shoe", system: "eu", value: 42 }));
});

describe("remembered shoe system", () => {
  it("is remembered and only valid systems are stored", () => {
    expect(readShoeSystem()).toBeNull();
    writeShoeSystem("uk");
    expect(readShoeSystem()).toBe("uk");
    writeShoeSystem("bogus");
    expect(readShoeSystem()).toBe("uk");
    expect(SHOE_SYSTEMS.map((s) => s.id)).toEqual(["eu", "uk", "us-m", "us-w", "cm"]);
  });
  it("survives blocked storage", () => {
    const real = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    expect(readShoeSystem()).toBeNull();
    expect(() => writeShoeSystem("uk")).not.toThrow();
    Object.defineProperty(window, "localStorage", real);
  });
});

describe("variantDimensions", () => {
  it("reads a dimensions spec and writes it as 120 x 60 x 75 cm", () => {
    expect(variantDimensions({ specs: [{ label: "Dimensions", value: "120 x 60 x 75 cm" }] })).toBe("120 x 60 x 75 cm");
  });
  it("is empty when there is no dimensions spec or it does not parse", () => {
    expect(variantDimensions({ specs: [{ label: "Material", value: "Oak" }] })).toBe("");
    expect(variantDimensions({ specs: [{ label: "Dimensions", value: "big" }] })).toBe("");
    expect(variantDimensions(null)).toBe("");
  });
});
