import { describe, it, expect } from "vitest";
import { describeChange, groupHistory } from "./historyView.js";

describe("History rows for a size's price (migration 0161)", () => {
  const row = (field, old_value, new_value, extra = {}) => ({ id: 1, field, old_value, new_value, actor_role: "seller", created_at: "2026-11-27T09:00:00Z", ...extra });

  it("names the size and shows money as money", () => {
    const c = describeChange(row("option_price:Beef / Whole Jar (48 x 4g)", "160.00", "170.00"));
    expect(c).toMatchObject({ label: "Price of Beef / Whole Jar (48 x 4g)", verb: "Changed", before: "KES 160", after: "KES 170" });
  });

  it("reads a sale price, a stock status and a unit the same way", () => {
    expect(describeChange(row("option_sale_price:Chicken / 3 Cubes", null, "8.00"))).toMatchObject({ label: "Sale price of Chicken / 3 Cubes", verb: "Added", after: "KES 8" });
    expect(describeChange(row("option_status:Chicken / 3 Cubes", "available", "out_of_stock"))).toMatchObject({ label: "Stock status of Chicken / 3 Cubes", before: "Available", after: "Out of stock" });
    expect(describeChange(row("option_unit:Chicken / 3 Cubes", null, "per 3 cubes"))).toMatchObject({ label: "Unit of Chicken / 3 Cubes", verb: "Added", after: "per 3 cubes" });
  });

  it("leaves the item's own fields as they were, and groups option rows with the rest of the same save", () => {
    expect(describeChange(row("price", "10.00", "12.00"))).toMatchObject({ label: "Price", before: "KES 10", after: "KES 12" });
    const g = groupHistory([row("option_price:A / B", "1", "2", { id: 2 }), row("price", "10", "12", { id: 1 })]);
    expect(g).toHaveLength(1);
    expect(g[0].changes.map((c) => c.label)).toEqual(["Price of A / B", "Price"]);
  });
});
