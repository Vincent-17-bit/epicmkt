import { describe, expect, it } from "vitest";
import { toListingItem } from "../filters.js";
import { applyBulkLocal, parsePercent, previewPriceChange, scaleKes } from "./bulk.js";

const item = (o) => toListingItem({ id: "x", name: "X", ...o });

describe("scaleKes", () => {
  it("rounds to whole shillings with .5 going up", () => {
    expect(scaleKes(100, 10, "raise")).toBe(110);
    expect(scaleKes(15, 10, "raise")).toBe(17);
    expect(scaleKes(25, 10, "raise")).toBe(28);
    expect(scaleKes(99, 5, "lower")).toBe(94);
    expect(scaleKes(5, 10, "lower")).toBe(5);
    expect(scaleKes(3, 50, "lower")).toBe(2);
    expect(scaleKes(333, 7.5, "raise")).toBe(358);
    expect(scaleKes(1000, 0.01, "raise")).toBe(1000);
  });
});

describe("parsePercent", () => {
  it("accepts sensible values only", () => {
    expect(parsePercent("12.5")).toEqual({ ok: true, value: 12.5 });
    expect(parsePercent("0").ok).toBe(false);
    expect(parsePercent("-5").ok).toBe(false);
    expect(parsePercent("abc").ok).toBe(false);
    expect(parsePercent("1.234").ok).toBe(false);
    expect(parsePercent("501").ok).toBe(false);
  });
});

describe("previewPriceChange", () => {
  it("shows before and after for every changed price", () => {
    const items = [item({ id: "a", price: 100, price_max: 200, price_type: "range", sale_price: 90 }), item({ id: "b", price: 250 })];
    const { rows, skipped } = previewPriceChange(items, 10, "raise");
    expect(skipped).toEqual([]);
    expect(rows).toEqual([
      { id: "a", name: "X", before: { price: 100, priceMax: 200, salePrice: 90 }, after: { price: 110, priceMax: 220, salePrice: 99 } },
      { id: "b", name: "X", before: { price: 250, priceMax: null, salePrice: null }, after: { price: 275, priceMax: null, salePrice: null } }
    ]);
  });
  it("skips unpriced, admin locked and invalid results with a reason", () => {
    const items = [
      item({ id: "free", price_type: "free", price: null }),
      item({ id: "contact", price_type: "contact", price: null }),
      item({ id: "admin", price: 100, hidden_by_admin: true }),
      item({ id: "tiny", price: 1 }),
      item({ id: "collapse", price: 2, price_max: 3, price_type: "range" }),
      item({ id: "sale", price: 5, sale_price: 4 })
    ];
    const { rows, skipped } = previewPriceChange(items, 60, "lower");
    expect(rows).toEqual([]);
    expect(skipped.map((s) => [s.id, s.reason])).toEqual([
      ["free", "No price to change"],
      ["contact", "No price to change"],
      ["admin", "Locked by admin"],
      ["tiny", "Price would drop below KSh 1"],
      ["collapse", "Price range would collapse"],
      ["sale", "Sale price would reach the price"]
    ]);
  });
});

describe("applyBulkLocal", () => {
  const base = [item({ id: "a", visible: true }), item({ id: "b", visible: true, hidden_by_admin: true }), item({ id: "c", draft: true, visible: false })];
  it("hides and shows only items the seller controls", () => {
    const hidden = applyBulkLocal(base, "hide", ["a", "b"]);
    expect(hidden.touched).toEqual(["a"]);
    expect(hidden.items.find((i) => i.id === "b").visible).toBe(true);
    const shown = applyBulkLocal(base, "show", ["c"]);
    expect(shown.items.find((i) => i.id === "c")).toMatchObject({ visible: true, draft: false });
  });
  it("moves section, sets availability and confirms prices", () => {
    const now = "2026-10-10T00:00:00.000Z";
    expect(applyBulkLocal(base, "move_section", ["a"], { section: "New", now }).items[0].section).toBe("New");
    expect(applyBulkLocal(base, "set_availability", ["a"], { availability: "seasonal", now }).items[0].availability).toBe("seasonal");
    expect(applyBulkLocal(base, "confirm_prices", ["a"], { now }).items[0].priceConfirmedAt).toBe(now);
  });
});
