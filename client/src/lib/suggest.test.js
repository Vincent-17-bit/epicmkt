import { describe, expect, it } from "vitest";
import { buildSuggestIndex, correctWord, editDistance, matchCategories, suggestFrom, suggestKey } from "./suggest.js";

const shopA = { id: "a", slug: "mama-mart", name: "Mama Mart", featured: false };
const shopB = { id: "b", slug: "milele-chemist", name: "Milele Chemist", featured: true };
const products = [
  { id: "1", name: "Brookside Fresh Milk 500ml", brand: "Brookside", section: "Dairy", imagePath: "a/1.webp", createdAt: "2026-01-02", regularPrice: 65, business: shopA },
  { id: "2", name: "Milk Powder 400g", section: "Dairy", imagePath: null, createdAt: "2026-01-05", regularPrice: 420, business: shopA },
  { id: "3", name: "Daima Milk 1L", brand: "Daima", imagePath: "b/3.webp", createdAt: "2026-01-04", regularPrice: 120, business: shopB },
  { id: "4", name: "Wall Mirror", imagePath: "b/4.webp", createdAt: "2026-01-01", regularPrice: 900, business: shopB },
  { id: "5", name: "Café Latté Mug", imagePath: null, createdAt: "2026-01-03", regularPrice: 300, business: shopA }
];
const index = buildSuggestIndex(products);

describe("type-ahead fallback (the same rules as search_suggest)", () => {
  it("normalises like the database", () => {
    expect(suggestKey("Café Latté 500ML!")).toBe("cafe latte 500ml");
  });

  it("'mi' offers milk first (the most common), then other words, products with a picture first, and the stores", () => {
    const out = suggestFrom(index, "mi");
    expect(out.terms[0].label).toBe("milk");
    expect(out.terms.map((t) => t.label)).toEqual(expect.arrayContaining(["milk", "milk powder", "milele chemist"].slice(0, 2)));
    expect(out.terms.some((t) => t.label === "mirror")).toBe(true);
    expect(out.products[0].image).toBeTruthy();
    expect(out.products.every((p) => p.slug)).toBe(true);
    expect(out.stores).toEqual([{ label: "Milele Chemist", slug: "milele-chemist" }]);
  });

  it("finds a word inside a name from three letters, but not from two", () => {
    expect(suggestFrom(index, "fre").terms.map((t) => t.label)).toContain("fresh");
    expect(suggestFrom(index, "re").terms.map((t) => t.label)).not.toContain("fresh");
  });

  it("corrects a misspelling to the closest known word", () => {
    expect(editDistance("mlik", "milk")).toBe(2);
    expect(correctWord(index, "mlik")).toBe("milk");
    expect(correctWord(index, "milk")).toBeNull();
    const out = suggestFrom(index, "mlik");
    expect(out.corrected).toBe("milk");
    expect(out.terms[0].label).toBe("milk");
  });

  it("asks for at least two letters, and finds nothing for nonsense", () => {
    expect(suggestFrom(index, "m")).toEqual({ terms: [], products: [], stores: [], categories: [], corrected: null });
    expect(suggestFrom(index, "zzqx").terms).toEqual([]);
  });

  it("matches categories by the start of their name or of a word in it", () => {
    const categories = [{ id: "chemists", name: "Chemists & Pharmacies" }, { id: "water", name: "Water Refill" }, { id: "barber", name: "Barbershops" }];
    expect(matchCategories(categories, "ref")).toEqual([{ label: "Water Refill", id: "water" }]);
    expect(matchCategories(categories, "ch").map((c) => c.id)).toEqual(["chemists"]);
    expect(matchCategories(categories, "x")).toEqual([]);
  });
});
