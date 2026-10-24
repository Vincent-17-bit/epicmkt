import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "../../src/lib/productFilters.js";
import { canonicalQuery, parseRequest } from "./productParams.js";

const parse = (qs) => parseRequest(new URLSearchParams(qs));

describe("productParams", () => {
  it("rejects unknown operations", () => {
    expect(parse("op=drop")).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("clamps and cleans everything a visitor can send", () => {
    const r = parse(`op=page&q=${"x".repeat(500)}&min=abc&max=99999999999&sort=evil&page=-5&pageSize=9999&cat=${"a,".repeat(100)}`);
    expect(r.filters.q).toHaveLength(80);
    expect(r.filters.min).toBe("");
    expect(r.filters.max).toBe("");
    expect(r.filters.sort).toBe("newest");
    expect(r.page).toBe(1);
    expect(r.pageSize).toBe(48);
    expect(r.filters.categories).toEqual(["a"]);
  });

  it("gives one canonical url per question, whatever the order the filters were chosen in", () => {
    const a = canonicalQuery("page", { ...EMPTY_FILTERS, categories: ["b", "a"], towns: ["z", "k"], onSale: true, min: "100" });
    const b = canonicalQuery("page", { ...EMPTY_FILTERS, onSale: true, towns: ["k", "z"], categories: ["a", "b"], min: "100" });
    expect(a).toBe(b);
    expect(a).toBe("op=page&cat=a%2Cb&min=100&sale=1&town=k%2Cz");
  });

  it("leaves defaults out so the plain home page is one shared cache entry", () => {
    expect(canonicalQuery("page", EMPTY_FILTERS)).toBe("op=page");
    expect(canonicalQuery("page", EMPTY_FILTERS, { page: 2 })).toBe("op=page&page=2");
    expect(canonicalQuery("facets", { ...EMPTY_FILTERS, q: "ignored" })).toBe("op=facets");
  });

  it("round-trips through the parser", () => {
    const filters = { ...EMPTY_FILTERS, q: "bread", sort: "price_asc", max: "500", categories: ["bakery"], flash: true, openNow: true };
    const back = parse(canonicalQuery("page", filters, { page: 3 }));
    expect(back.filters).toMatchObject({ q: "bread", sort: "price_asc", max: "500", categories: ["bakery"], flash: true, openNow: true });
    expect(back.page).toBe(3);
  });
});
