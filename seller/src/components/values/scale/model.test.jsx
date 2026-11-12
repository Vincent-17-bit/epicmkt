import { describe, it, expect } from "vitest";
import { scales } from "@epicmkt/shared";
import { add, addMany, checks, identity, inspect, isSorted, labels, move, rangeRaws, remove, sorted } from "./model.js";

const run = (scaleId, raws, ctx) => raws.reduce((list, raw) => { const r = add(list, raw, { scaleId, ctx }); return r.ok ? r.list : list; }, []);

describe("add", () => {
  it("reads 20 litres as 20 L and asks for a unit when there is none", () => {
    const ok = add([], "20 litres", { scaleId: "volume" });
    expect(ok.ok).toBe(true);
    expect(scales.format(ok.added)).toBe("20 L");
    const bare = add([], "20", { scaleId: "volume" });
    expect(bare.ok).toBe(false);
    expect(bare.error.needs).toBe("unit");
  });
  it("keeps the same size once, even typed in another unit (1000 ml and 1 L)", () => {
    const first = add([], "1 L", { scaleId: "volume" });
    const again = add(first.list, "1000 ml", { scaleId: "volume" });
    expect(again.ok && again.merged).toBe(true);
    expect(again.list).toHaveLength(1);
    expect(labels(again.list)).toEqual(["1 L"]);
  });
  it("merges by sizeKey for text values (Refill and refill)", () => {
    expect(run("label", ["Refill", "refill", "New bottle"])).toHaveLength(2);
  });
  it("stops at the axis limit", () => {
    const raws = Array.from({ length: scales.MAX_AXIS_VALUES }, (_, i) => `${i + 1} kg`);
    const full = run("weight", raws);
    expect(full).toHaveLength(scales.MAX_AXIS_VALUES);
    expect(add(full, "99 kg", { scaleId: "weight" }).error.code).toBe("too-many-values");
  });
  it("addMany counts added, merged and failed", () => {
    const r = addMany([], ["5 L", "10 L", "5 litres", "oops"], { scaleId: "volume" });
    expect(r).toMatchObject({ added: 2, merged: 1 });
    expect(r.errors).toHaveLength(1);
  });
});

describe("order", () => {
  const list = run("volume", ["20 L", "5 L", "10 L"]);
  it("keeps the seller's order, moves and removes", () => {
    expect(labels(list)).toEqual(["20 L", "5 L", "10 L"]);
    expect(labels(move(list, 0, 1))).toEqual(["5 L", "20 L", "10 L"]);
    expect(move(list, 0, -1)).toBe(list);
    expect(labels(remove(list, 1))).toEqual(["20 L", "10 L"]);
  });
  it("sorts smallest first on request", () => {
    expect(isSorted(list)).toBe(false);
    expect(labels(sorted(list))).toEqual(["5 L", "10 L", "20 L"]);
  });
});

describe("inspect and checks", () => {
  it("previews what a buyer sees", () => {
    expect(inspect("12v", { scaleId: "voltage" })).toMatchObject({ state: "ok", label: "12 V" });
    expect(inspect("", { scaleId: "voltage" }).state).toBe("empty");
    expect(inspect("lots", { scaleId: "voltage" }).state).toBe("error");
  });
  it("flags an unusual water size but not a normal one", () => {
    const list = run("volume", ["20 L", "500 L"]);
    const notes = checks(list, "drinking-water", "size");
    expect(notes.map((n) => n.index)).toEqual([1]);
  });
  it("identity differs for different amounts", () => {
    const a = scales.parse("weight", "6 kg").value;
    const b = scales.parse("weight", "13 kg").value;
    expect(identity(a)).not.toBe(identity(b));
  });
});

describe("rangeRaws", () => {
  it("builds a stepped list", () => {
    expect(rangeRaws({ from: 38, to: 40, step: 0.5, suffix: "EU" })).toEqual({ ok: true, raws: ["38 EU", "38.5 EU", "39 EU", "39.5 EU", "40 EU"] });
  });
  it("explains a bad range", () => {
    expect(rangeRaws({ from: 5, to: 1, step: 1 }).ok).toBe(false);
    expect(rangeRaws({ from: 1, to: 2, step: 0 }).ok).toBe(false);
    expect(rangeRaws({ from: 1, to: 500, step: 1 }).message).toMatch(/up to 40/);
    expect(rangeRaws({ from: "", to: 2, step: 1 }).ok).toBe(false);
  });
});
