import { describe, it, expect } from "vitest";
import { createApiSource, createLocalSource, normaliseResult } from "./source.js";

const seed = [
  { id: "m1", kind: "material", label: "Mahogany", uses: 5 },
  { id: "m2", kind: "material", label: "Mahogany veneer", uses: 1 },
  { id: "b1", kind: "brand", label: "Samsung", uses: 9 },
  { id: "b2", kind: "brand", label: "Sammy", status: "merged", mergedInto: "b1" },
  { id: "c1", kind: "color", label: "Red", hex: "#d32f2f" },
];

describe("local stand-in source (follows migration 0090)", () => {
  it("finds by prefix, best first, and offers Add only when nothing resolves", async () => {
    const src = createLocalSource(seed);
    const r = await src.search("material", "Mahog");
    expect(r.matches.map((m) => m.label)).toEqual(["Mahogany", "Mahogany veneer"]);
    expect(r.canAdd).toBe(true);
    const exact = await src.search("material", "mahogany");
    expect(exact.canAdd).toBe(false);
    expect(exact.matches[0].label).toBe("Mahogany");
  });
  it("folds case and punctuation, so SAMSUNG is Samsung", async () => {
    const r = await createLocalSource(seed).search("brand", "  SAMSUNG ");
    expect(r.canAdd).toBe(false);
    expect(r.matches[0].label).toBe("Samsung");
  });
  it("answers a merged spelling typed in full with its target", async () => {
    const r = await createLocalSource(seed).search("brand", "Sammy");
    expect(r.canAdd).toBe(false);
    expect(r.matches[0].label).toBe("Samsung");
  });
  it("lists the most used values for an empty query", async () => {
    const r = await createLocalSource(seed).search("material", "");
    expect(r.matches.map((m) => m.label)).toEqual(["Mahogany", "Mahogany veneer"]);
  });
  it("adds a new value as typed and pending, and returns the existing one for a duplicate", async () => {
    const src = createLocalSource(seed);
    const made = await src.add("material", "  Teak  wood ");
    expect(made).toMatchObject({ created: true, value: { label: "Teak wood", status: "pending", kind: "material" } });
    const again = await src.add("material", "TEAK WOOD");
    expect(again.created).toBe(false);
    expect(again.value.id).toBe(made.value.id);
    expect((await src.add("brand", "sammy")).value.label).toBe("Samsung");
  });
  it("keeps a shade for colours only and rejects bad input with a code", async () => {
    const src = createLocalSource();
    expect((await src.add("color", "Wine red", "#8B1A2B")).value.hex).toBe("#8b1a2b");
    await expect(src.add("color", "Teal", "teal")).rejects.toMatchObject({ code: "invalid_hex" });
    await expect(src.add("material", "Oak", "#000000")).rejects.toMatchObject({ code: "hex_not_allowed" });
    await expect(src.add("material", "---")).rejects.toMatchObject({ code: "invalid_label" });
  });
});

describe("helpers", () => {
  it("normaliseResult accepts the database shape or a bare list", () => {
    expect(normaliseResult({ matches: [{ id: 1 }], canAdd: false, addLabel: null })).toEqual({ matches: [{ id: 1 }], canAdd: false, addLabel: null });
    expect(normaliseResult([{ id: 1 }])).toMatchObject({ matches: [{ id: 1 }], canAdd: true });
    expect(normaliseResult(null)).toMatchObject({ matches: [] });
  });
  it("createApiSource calls the two seller api wrappers", async () => {
    const calls = [];
    const src = createApiSource({ sellerOptionValues: async (...a) => { calls.push(["s", ...a]); return { matches: [] }; }, sellerAddOptionValue: async (...a) => { calls.push(["a", ...a]); return { created: true, value: {} }; } });
    await src.search("brand", "sam", { limit: 5 });
    await src.add("color", "Teal");
    expect(calls).toEqual([["s", "brand", "sam", 5], ["a", "color", "Teal", null]]);
  });
});
