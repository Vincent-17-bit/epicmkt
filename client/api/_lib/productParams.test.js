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

  it("reads psize and prange, dropping unknown scales, choice scales used as ranges, and bad numbers", () => {
    const r = parse("op=page&psize=shoe%3Aeu%3A42,bogus%3A1,nocolon,apparel-alpha%3AM&prange=length%3A5-10,shoe%3A1-2,screen-inch%3Aabc-5,screen-inch%3A32-");
    expect(r.filters.sizes).toEqual(["apparel-alpha:M", "shoe:eu:42"]);
    expect(r.filters.ranges).toEqual({ length: { min: "5", max: "10" }, "screen-inch": { min: "32", max: "" } });
  });

  it("caps what a visitor can send for sizes", () => {
    const many = Array.from({ length: 200 }, (_, i) => `shoe:eu:${i + 20}`).join(",");
    expect(parse(`op=page&psize=${many}`).filters.sizes.length).toBeLessThanOrEqual(24);
  });

  it("sizes make one canonical url, whatever order they were picked in, and round trip", () => {
    const a = canonicalQuery("page", { ...EMPTY_FILTERS, sizes: ["shoe:eu:42", "apparel-alpha:M"], ranges: { length: { min: "5", max: "10" }, "screen-inch": { min: "", max: "55" } } });
    const b = canonicalQuery("page", { ...EMPTY_FILTERS, sizes: ["apparel-alpha:M", "shoe:eu:42"], ranges: { "screen-inch": { min: "", max: "55" }, length: { min: "5", max: "10" } } });
    expect(a).toBe(b);
    expect(a).toBe("op=page&prange=length%3A5-10%2Cscreen-inch%3A-55&psize=apparel-alpha%3AM%2Cshoe%3Aeu%3A42");
    const back = parse(a).filters;
    expect(back.sizes).toEqual(["apparel-alpha:M", "shoe:eu:42"]);
    expect(back.ranges).toEqual({ length: { min: "5", max: "10" }, "screen-inch": { min: "", max: "55" } });
  });

  it("facets never carry the visitor's size filters (one cacheable url), and no sizes adds nothing", () => {
    expect(canonicalQuery("facets", { ...EMPTY_FILTERS, sizes: ["shoe:eu:42"] })).toBe("op=facets");
    expect(canonicalQuery("page", EMPTY_FILTERS)).toBe("op=page");
  });
});
