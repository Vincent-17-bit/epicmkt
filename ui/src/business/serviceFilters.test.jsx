import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, applyServiceFilters, buildFacets, countActive } from "./serviceFilters.js";

const svc = [
  { id: "a", name: "Cut", priceKes: 150, section: "Cuts" },
  { id: "b", name: "Beard", priceKes: 100, section: "Shaves", availability: "limited_stock" },
  { id: "c", name: "Dye", priceKes: 200, section: "Treatments", availability: "out_of_stock" },
  { id: "d", name: "Ask", section: "Cuts" }
];

describe("service filters", () => {
  it("returns everything when empty", () => {
    expect(applyServiceFilters(svc, EMPTY_FILTERS)).toHaveLength(4);
    expect(countActive(EMPTY_FILTERS)).toBe(0);
  });
  it("filters by section and availability", () => {
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, section: "Cuts" }).map((s) => s.id)).toEqual(["a", "d"]);
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, availability: "Unavailable" }).map((s) => s.id)).toEqual(["c"]);
  });
  it("price range excludes unpriced items and tolerates swapped bounds", () => {
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, min: "200", max: "100" }).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, min: "120" }).map((s) => s.id)).toEqual(["a", "c"]);
  });
  it("sorts without mutating", () => {
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, sort: "price_asc" }).map((s) => s.id)).toEqual(["b", "a", "c", "d"]);
    expect(applyServiceFilters(svc, { ...EMPTY_FILTERS, sort: "price_desc" }).map((s) => s.id)).toEqual(["c", "a", "b", "d"]);
    expect(svc[0].id).toBe("a");
  });
  it("builds facets", () => {
    const f = buildFacets(svc);
    expect(f.sections).toEqual(["Cuts", "Shaves", "Treatments"]);
    expect(f.price).toEqual({ min: 100, max: 200 });
    expect(f.availability).toEqual(["Available", "Low stock", "Unavailable"]);
  });
});
