import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, SORTS, applyFilters, chipsOf, countActive, countsFor, facetsOf, parseFilters, writeFilters } from "./productFilters.js";

let n = 0;
const p = (over = {}, store = {}) => {
  n += 1;
  return {
    id: `i${n}`,
    name: `Product ${n}`,
    description: "",
    section: null,
    imageUrl: "/x.jpg",
    availability: "available",
    createdAt: `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
    flash: null,
    pricing: { regularPrice: 100, salePrice: 100, savings: 0, discountPercent: 0 },
    business: { id: "b1", name: "Shop", verified: false, featured: false, categoryId: "bakery", town: "Maseno", ...store },
    ...over
  };
};
const ids = (rows) => rows.map((r) => r.name);
const f = (over) => ({ ...EMPTY_FILTERS, ...over });

describe("applyFilters", () => {
  const bread = p({ name: "Bread", description: "Fresh white loaf", pricing: { regularPrice: 65, salePrice: 65, savings: 0, discountPercent: 0 } });
  const cake = p({ name: "Cake", section: "Celebration", pricing: { regularPrice: 1800, salePrice: 1440, savings: 360, discountPercent: 20 }, flash: { sale: {} } }, { verified: true, featured: true, categoryId: "bakery", town: "Kisumu" });
  const knife = p({ name: "Knife set", imageUrl: null, availability: "out_of_stock", pricing: { regularPrice: 1470, salePrice: 1470, savings: 0, discountPercent: 0 } }, { categoryId: "hardware", town: "Kisumu", name: "Mwanzo Hardware" });
  const noPrice = p({ name: "Custom order", pricing: null });
  const all = [bread, cake, knife, noPrice];

  it("returns everything, newest first, with no filters", () => {
    expect(ids(applyFilters(all, EMPTY_FILTERS))).toEqual(["Custom order", "Knife set", "Cake", "Bread"]);
  });

  it("searches name, description, section, store and town, every word must match", () => {
    expect(ids(applyFilters(all, f({ q: "loaf" })))).toEqual(["Bread"]);
    expect(ids(applyFilters(all, f({ q: "celebration" })))).toEqual(["Cake"]);
    expect(ids(applyFilters(all, f({ q: "mwanzo" })))).toEqual(["Knife set"]);
    expect(ids(applyFilters(all, f({ q: "kisumu cake" })))).toEqual(["Cake"]);
    expect(applyFilters(all, f({ q: "zzz" }))).toEqual([]);
  });

  it("filters by price range on the price shoppers pay, and leaves out items with no price", () => {
    expect(ids(applyFilters(all, f({ min: "1000" })))).toEqual(["Knife set", "Cake"]);
    expect(ids(applyFilters(all, f({ max: "100" })))).toEqual(["Bread"]);
    expect(ids(applyFilters(all, f({ min: "1450", max: "1500" })))).toEqual(["Knife set"]);
  });

  it("filters by category and town, several at once", () => {
    expect(ids(applyFilters(all, f({ categories: ["hardware"] })))).toEqual(["Knife set"]);
    expect(ids(applyFilters(all, f({ categories: ["hardware", "bakery"], towns: ["kisumu"] })))).toEqual(["Knife set", "Cake"]);
  });

  it("filters by stock, sale, flash sale, store badges and photo", () => {
    expect(ids(applyFilters(all, f({ inStock: true })))).not.toContain("Knife set");
    expect(ids(applyFilters(all, f({ onSale: true })))).toEqual(["Cake"]);
    expect(ids(applyFilters(all, f({ flash: true })))).toEqual(["Cake"]);
    expect(ids(applyFilters(all, f({ verified: true })))).toEqual(["Cake"]);
    expect(ids(applyFilters(all, f({ featured: true })))).toEqual(["Cake"]);
    expect(ids(applyFilters(all, f({ photo: true })))).not.toContain("Knife set");
  });

  it("combines filters (all must hold)", () => {
    expect(ids(applyFilters(all, f({ min: "1000", inStock: true, photo: true })))).toEqual(["Cake"]);
    expect(applyFilters(all, f({ onSale: true, max: "100" }))).toEqual([]);
  });

  it("sorts by price both ways with unpriced items last, by discount, and by name", () => {
    expect(ids(applyFilters(all, f({ sort: "price_asc" })))).toEqual(["Bread", "Cake", "Knife set", "Custom order"]);
    expect(ids(applyFilters(all, f({ sort: "price_desc" })))).toEqual(["Knife set", "Cake", "Bread", "Custom order"]);
    expect(applyFilters(all, f({ sort: "discount" }))[0].name).toBe("Cake");
    expect(ids(applyFilters(all, f({ sort: "name" })))).toEqual(["Bread", "Cake", "Custom order", "Knife set"]);
  });

  it("does not change the list it was given", () => {
    const copy = [...all];
    applyFilters(all, f({ sort: "name" }));
    expect(all).toEqual(copy);
  });
});

describe("parseFilters and writeFilters", () => {
  it("round-trips every filter through the address", () => {
    const set = f({ q: "bread", sort: "price_asc", min: "50", max: "900", categories: ["bakery", "hardware"], towns: ["kisumu"], inStock: true, onSale: true, flash: true, verified: true, featured: true, photo: true });
    expect(parseFilters(writeFilters(new URLSearchParams(), set))).toEqual(set);
  });

  it("leaves defaults out and keeps the page's other params", () => {
    const out = writeFilters(new URLSearchParams("foo=1&psale=1"), EMPTY_FILTERS);
    expect(out.toString()).toBe("foo=1");
  });

  it("ignores junk: unknown sort, non-numeric prices, over-long search", () => {
    const parsed = parseFilters(new URLSearchParams(`psort=hack&pmin=abc&pmax=-5&pq=${"x".repeat(200)}`));
    expect(parsed.sort).toBe("newest");
    expect(parsed.min).toBe("");
    expect(parsed.max).toBe("");
    expect(parsed.q).toHaveLength(80);
  });

  it("offers every sort it understands", () => {
    for (const { id } of SORTS) expect(parseFilters(new URLSearchParams(`psort=${id}`)).sort).toBe(id);
  });
});

describe("countActive, facetsOf and chipsOf", () => {
  it("counts narrowing filters but not sorting", () => {
    expect(countActive(EMPTY_FILTERS)).toBe(0);
    expect(countActive(f({ sort: "name" }))).toBe(0);
    expect(countActive(f({ q: "a", min: "1", max: "2", categories: ["a", "b"], onSale: true }))).toBe(5);
  });

  it("counts categories, towns and the price range across the whole list", () => {
    const list = [p({}, { categoryId: "a", town: "Maseno" }), p({}, { categoryId: "a", town: "Kisumu" }), p({ pricing: { salePrice: 900, regularPrice: 900, savings: 0 } }, { categoryId: "b", town: "Kisumu" })];
    const facets = facetsOf(list);
    expect(facets.categories).toEqual([{ id: "a", count: 2 }, { id: "b", count: 1 }]);
    expect(facets.towns.map((t) => [t.name, t.count])).toEqual([["Kisumu", 2], ["Maseno", 1]]);
    expect(facets.price).toEqual({ min: 100, max: 900 });
    expect(facetsOf([]).price).toBeNull();
  });

  it("makes one removable chip per active filter", () => {
    const filters = f({ min: "100", categories: ["bakery"], onSale: true });
    const chips = chipsOf(filters, { categoryName: () => "Bakery" });
    expect(chips.map((c) => c.label)).toEqual(["KES 100 and up", "Bakery", "On sale"]);
    const cleared = chips.reduce((acc, chip) => chip.clear(acc), filters);
    expect(countActive(cleared)).toBe(0);
  });
});

describe("price range and live counts", () => {
  const a = p({ name: "A", pricing: { regularPrice: 100, salePrice: 100, savings: 0 } }, { categoryId: "x", town: "Maseno" });
  const b = p({ name: "B", pricing: { regularPrice: 900, salePrice: 700, savings: 200 } }, { categoryId: "y", town: "Kisumu" });
  const c = p({ name: "C", pricing: { regularPrice: 500, salePrice: 500, savings: 0 } }, { categoryId: "y", town: "Kisumu" });

  it("treats a reversed range as the same range the other way round", () => {
    expect(ids(applyFilters([a, b, c], f({ min: "800", max: "200" }))).sort()).toEqual(["B", "C"]);
  });

  it("counts each option against every other filter, but not its own group", () => {
    const counts = countsFor([a, b, c], f({ categories: ["x"], onSale: true }));
    expect(counts.categories.get("y")).toBe(1); // category choice is ignored, on-sale still applies
    expect(counts.categories.get("x")).toBeUndefined();
    expect(counts.towns.get("kisumu")).toBeUndefined(); // category x + on sale leaves nothing in Kisumu
    expect(counts.flags.inStock).toBe(0);
    expect(countsFor([a, b, c], EMPTY_FILTERS).flags.onSale).toBe(1);
  });
});
