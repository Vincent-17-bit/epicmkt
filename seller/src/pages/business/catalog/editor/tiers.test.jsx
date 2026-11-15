import { describe, expect, it } from "vitest";
import { blankTiers, tierIssues, tierPreview, tiersFromServer, tiersOf, tiersPayload } from "./model/tiers.js";

const rows = (...pairs) => ({ mode: "whole", rows: pairs.map(([from, price]) => ({ from: String(from), price: String(price) })) });

describe("tier model", () => {
  it("turns rows into tiers: each ends one before the next starts, the last has no end", () => {
    expect(tiersOf(rows([1, 10], [11, 7], [101, 5]).rows)).toEqual([{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }]);
    expect(tiersOf([{ from: "1", price: "" }])).toBeNull();
    expect(tiersOf([])).toBeNull();
  });

  it("reads stored tiers back into rows with the mode", () => {
    const back = tiersFromServer({ mode: "graduated", tiers: [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: null, unitPrice: 7 }] });
    expect(back).toEqual({ mode: "graduated", rows: [{ from: "1", price: "10" }, { from: "11", price: "7" }] });
    expect(tiersFromServer({ tiers: null, mode: "whole" })).toBeNull();
  });

  it("accepts good tiers", () => {
    expect(tierIssues(rows([1, 10], [11, 7], [101, 5])).list).toEqual([]);
    expect(tierIssues(rows([1, 10], [2, 10])).list).toEqual([]);
  });

  it("names each problem next to its row", () => {
    expect(tierIssues(rows([2, 10], [11, 7])).rows[0].from).toBe("The first quantity must be 1.");
    expect(tierIssues(rows([1, 10], [1, 7])).rows[1].from).toBe("Must be more than 1.");
    expect(tierIssues(rows([1, 10], [5, 0])).rows[1].price).toBe("Enter a price of KES 1 or more, without cents.");
    expect(tierIssues(rows([1, 10], [5, 12])).rows[1].price).toBe("A bigger quantity should not cost more each.");
    expect(tierIssues(rows([1, 10], ["x", 7])).rows[1].from).toBe("Enter a whole number.");
    expect(tierIssues(rows([1, "7.5"], [5, 5])).rows[0].price).toBeTruthy();
    expect(tierIssues(rows([1, 10])).list[0]).toMatch(/at least two/);
    expect(tierIssues({ mode: "whole", rows: Array.from({ length: 11 }, (_, i) => ({ from: String(i + 1), price: String(20 - i) })) }).list.join(" ")).toMatch(/at most 10/);
  });

  it("previews the same quantity both ways (the database rules)", () => {
    const p = tierPreview(rows([1, 10], [11, 7], [101, 5]), 50, "page");
    expect(p.whole).toBe(350);
    expect(p.graduated).toBe(380);
    expect(p.text).toBe("50 pages = KES 350 (whole) or KES 380 (graduated)");
    expect(tierPreview(rows([1, 10]), 50)).toBeNull();
    expect(tierPreview(rows([1, 10], [11, 7]), 1, "page").text).toMatch(/^1 page = /);
  });

  it("builds what a save sends", () => {
    const state = { ...rows([1, 10], [11, 7]), mode: "graduated" };
    expect(tiersPayload(state, { priceType: "from", had: false })).toEqual({ priceTiers: [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: null, unitPrice: 7 }], priceTierMode: "graduated" });
    expect(tiersPayload(null, { priceType: "from", had: true })).toEqual({ priceTiers: null });
    expect(tiersPayload(null, { priceType: "from", had: false })).toBeUndefined();
    expect(tiersPayload(state, { priceType: "fixed", had: true })).toEqual({ priceTiers: null });
    expect(tiersPayload(undefined, { priceType: "from", had: true })).toBeUndefined();
    expect(tiersPayload(undefined, { priceType: "fixed", had: true })).toEqual({ priceTiers: null });
    expect(blankTiers().rows).toHaveLength(2);
  });
});
