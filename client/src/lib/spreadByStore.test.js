import { describe, expect, it } from "vitest";
import { spreadByStore } from "./spreadByStore.js";

const p = (store, n) => ({ id: `${store}${n}`, business: { id: store } });

describe("spreadByStore", () => {
  it("takes a round from each shop so one shop cannot fill the section", () => {
    const rows = [p("a", 1), p("a", 2), p("a", 3), p("a", 4), p("b", 1), p("c", 1)];
    expect(spreadByStore(rows, { limit: 12, perStore: 2 }).map((r) => r.id)).toEqual(["a1", "b1", "c1", "a2"]);
  });

  it("keeps each shop's own order and stops at the limit", () => {
    const rows = [p("a", 1), p("b", 1), p("a", 2), p("b", 2)];
    expect(spreadByStore(rows, { limit: 3, perStore: 2 }).map((r) => r.id)).toEqual(["a1", "b1", "a2"]);
  });

  it("falls back to businessId and handles an empty list", () => {
    expect(spreadByStore([{ id: "x", businessId: "s" }, { id: "y", businessId: "s" }, { id: "z", businessId: "s" }], { perStore: 2 })).toHaveLength(2);
    expect(spreadByStore([])).toEqual([]);
  });
});
