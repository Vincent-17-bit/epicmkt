import { describe, expect, it } from "vitest";
import { createSeen } from "./seen.js";

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    raw: data
  };
};

describe("seen memory", () => {
  it("reports 0 for anything never shown and the time for anything marked", () => {
    const seen = createSeen({ storage: memoryStorage(), now: () => 500 });
    expect(seen.lastSeen("p", "a")).toBe(0);
    seen.mark("p", ["a", "b"]);
    expect(seen.lastSeen("p", "a")).toBe(500);
    expect(seen.lastSeen("b", "a")).toBe(0);
  });

  it("survives a reload through storage", () => {
    const storage = memoryStorage();
    createSeen({ storage, now: () => 7 }).mark("b", ["shop"]);
    expect(createSeen({ storage }).lastSeen("b", "shop")).toBe(7);
  });

  it("forgets the oldest entries once full", () => {
    let t = 0;
    const seen = createSeen({ storage: memoryStorage(), max: 3, now: () => ++t });
    seen.mark("p", ["a"]);
    seen.mark("p", ["b"]);
    seen.mark("p", ["c"]);
    seen.mark("p", ["d"]);
    expect(seen.lastSeen("p", "a")).toBe(0);
    expect(seen.lastSeen("p", "d")).toBe(4);
  });

  it("ignores corrupt storage and works without any storage", () => {
    const storage = memoryStorage();
    storage.setItem("epicmkt.seen.v1", "{not json");
    expect(createSeen({ storage }).lastSeen("p", "a")).toBe(0);
    const none = createSeen({ storage: null, now: () => 9 });
    none.mark("p", ["a"]);
    expect(none.lastSeen("p", "a")).toBe(9);
  });

  it("does not throw when storage refuses writes", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("full"); }, removeItem() {} };
    const seen = createSeen({ storage, now: () => 3 });
    expect(() => seen.mark("p", ["a"])).not.toThrow();
    expect(seen.lastSeen("p", "a")).toBe(3);
  });
});
