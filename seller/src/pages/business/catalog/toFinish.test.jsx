import { describe, it, expect } from "vitest";
import { toFinish } from "./toFinish.js";

const item = (over) => ({ id: "x", name: "Item", draft: false, productTypeId: "phone", brand: null, specs: [], ...over });

describe("to finish", () => {
  const type = { id: "phone", axes: [], specRows: [{ key: "warranty", label: "Warranty", level: "required", input: "text" }] };
  it("lists only drafts, with what is missing", () => {
    const rows = toFinish([
      item({ id: "d1", name: "Phone", draft: true, priceType: "fixed", price: null, imageCount: 0 }),
      item({ id: "d2", name: "Ready", draft: true, priceType: "fixed", price: 5, imageCount: 1, specs: [{ label: "Warranty", value: "1 year" }] }),
      item({ id: "live", draft: false, priceType: "fixed", price: null })
    ], [type]);
    expect(rows).toEqual([{ id: "d1", name: "Phone", missing: ["Price", "A photo", "Warranty"] }]);
  });
});
