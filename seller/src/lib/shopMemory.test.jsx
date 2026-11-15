import { beforeEach, describe, expect, it } from "vitest";
import { memoryFieldOfRow, recall, remember } from "./shopMemory.js";

beforeEach(() => localStorage.clear());

describe("shop memory", () => {
  it("offers the last values per type, newest first, without repeats", () => {
    remember("phone", { brand: "Samsung", warranty: "1 year" });
    remember("phone", { brand: "Tecno" });
    remember("phone", { brand: "samsung" });
    expect(recall("phone", "brand")).toEqual(["samsung", "Tecno"]);
    expect(recall("phone", "warranty")).toEqual(["1 year"]);
    expect(recall("bulb", "brand")).toEqual([]);
  });
  it("keeps three at most and ignores empty values", () => {
    ["A", "B", "C", "D"].forEach((brand) => remember("pen", { brand }));
    remember("pen", { brand: "  " });
    expect(recall("pen", "brand")).toEqual(["D", "C", "B"]);
  });
  it("survives broken storage", () => {
    localStorage.setItem("epicmkt.shopMemory.v1", "{nope");
    expect(recall("phone", "brand")).toEqual([]);
    expect(() => remember("phone", { brand: "X" })).not.toThrow();
  });
  it("matches warranty and condition rows", () => {
    expect(memoryFieldOfRow({ key: "warranty", label: "Warranty" })).toBe("warranty");
    expect(memoryFieldOfRow({ key: "cond", label: "Condition" })).toBe("condition");
    expect(memoryFieldOfRow({ key: "colour", label: "Colour" })).toBeNull();
  });
});
