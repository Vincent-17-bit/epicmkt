import { describe, expect, it } from "vitest";
import { scales } from "@epicmkt/shared";
import { EMPTY_FILTERS, applyFilters, chipsOf, countActive, countsFor, parseFilters, writeFilters } from "./productFilters.js";
import { canonicalKey, matchesSizes, optionLabel, parseSizes, sizeFacets } from "./sizeFilters.js";
import { countsSummary, facetsSummary } from "./productQuery.js";

const shoe = (system, value) => ({ scale: "shoe", system, value });
const dress = (value) => ({ scale: "apparel-numeric", system: "us", value });
const tvIn = (value) => ({ scale: "screen-inch", value, unit: "in" });
const strip = (value, unit) => ({ scale: "length", value, unit });
const gb = (value) => ({ scale: "storage", value, unit: "GB" });
const oneTb = scales.parse("storage", "1 TB").value; // stored as 1024 GB
const alpha = (value) => ({ scale: "apparel-alpha", value });

let n = 0;
const p = (name, sizes) => {
  n += 1;
  return { id: `i${n}`, name, description: "", section: null, imageUrl: "/x.jpg", availability: "available", createdAt: `2026-02-${String(n).padStart(2, "0")}T00:00:00Z`, flash: null, pricing: { regularPrice: 100, salePrice: 100, savings: 0, discountPercent: 0 }, business: { id: "b", name: "Shop", categoryId: "x", town: "Maseno" }, sizes };
};
const loafer = p("Loafer", [shoe("eu", 42), shoe("eu", 43)]);
const trainer = p("Trainer (UK sizes)", [shoe("uk", 8), shoe("uk", 9)]); // UK 8 is EU 42
const gown = p("Gown", [dress(42), dress(44)]);                          // "42" but a dress
const tv = p("TV 42", [tvIn(42)]);
const tv55 = p("TV 55", [tvIn(55)]);
const stripLight = p("Strip light", [strip(5, "m"), strip(10, "m")]);
const stripCm = p("Strip light (cm)", [strip(300, "cm")]);
const phone = p("Phone", [gb(128), gb(512), gb(1024)]);
const tee = p("Tee", [alpha("S"), alpha("M"), alpha("L")]);
const plain = p("Mug", undefined);
const all = [loafer, trainer, gown, tv, tv55, stripLight, stripCm, phone, tee, plain];
const f = (over) => ({ ...EMPTY_FILTERS, ...over });
const names = (rows) => rows.map((r) => r.name).sort();

describe("canonical keys", () => {
  it("shoe 42 (EU) is not dress 42 or a 42 inch TV", () => {
    const keys = [shoe("eu", 42), dress(42), tvIn(42)].map(canonicalKey);
    expect(new Set(keys).size).toBe(3);
  });
  it("the same shoe in two systems is one key", () => {
    expect(canonicalKey(shoe("eu", 42))).toBe(canonicalKey(shoe("uk", 8)));
  });
  it("5 m and 500 cm are one length; 1 TB and 1024 GB are one storage size", () => {
    expect(canonicalKey(strip(5, "m"))).toBe(canonicalKey(strip(500, "cm")));
    expect(canonicalKey(gb(1024))).toBe(canonicalKey(oneTb));
  });
  it("ignores values it does not know", () => {
    expect(canonicalKey(null)).toBeNull();
    expect(canonicalKey({ scale: "nope", value: 1 })).toBeNull();
  });
});

describe("size facets", () => {
  const groups = sizeFacets(all);
  const group = (scale) => groups.find((g) => g.scale === scale);
  it("one group per scale, in a fixed order, and none for products without sizes", () => {
    expect(groups.map((g) => g.scale)).toEqual(["apparel-alpha", "apparel-numeric", "shoe", "storage", "screen-inch", "length"]);
    expect(sizeFacets([plain])).toEqual([]);
  });
  it("shoe 42 and UK 8 merge, counting each product once", () => {
    const opts = group("shoe").options;
    const eu42 = opts.find((o) => o.key === canonicalKey(shoe("eu", 42)));
    expect(eu42.count).toBe(2);
    expect(opts).toHaveLength(2); // EU 42 = UK 8 and EU 43 = UK 9: two sizes, not four
    expect(opts.find((o) => o.key === canonicalKey(shoe("eu", 43))).count).toBe(2);
  });
  it("storage sorts by size: 128 GB, 512 GB, 1 TB", () => {
    expect(group("storage").options.map((o) => optionLabel(o.value))).toEqual(["128 GB", "512 GB", "1 TB"]);
  });
  it("clothing letters sort S, M, L", () => {
    expect(group("apparel-alpha").options.map((o) => optionLabel(o.value))).toEqual(["S", "M", "L"]);
  });
  it("lengths and screens are ranges in their display unit", () => {
    expect(group("length")).toMatchObject({ kind: "range", unit: "m", range: { min: 3, max: 10 } });
    expect(group("screen-inch")).toMatchObject({ kind: "range", unit: "in", range: { min: 42, max: 55 } });
  });
  it("is plain JSON (it travels from the edge function)", () => {
    expect(JSON.parse(JSON.stringify(groups))).toEqual(groups);
  });
});

describe("labels follow the shoe system", () => {
  const v = shoe("eu", 42);
  it("reads in the buyer's system and keeps the same size", () => {
    expect(optionLabel(v)).toBe("EU 42");
    expect(optionLabel(v, "uk")).toBe("UK 8");
    expect(optionLabel(v, "cm")).toBe("26.7 cm");
    expect(canonicalKey(v)).toBe(canonicalKey(shoe("uk", 8)));
  });
  it("other scales ignore the system", () => expect(optionLabel(gb(1024), "uk")).toBe("1 TB"));
});

describe("filtering", () => {
  it("a shoe size never matches a dress or a TV of the same number", () => {
    const key = canonicalKey(shoe("eu", 42));
    expect(names(applyFilters(all, f({ sizes: [key] })))).toEqual(["Loafer", "Trainer (UK sizes)"]);
    const dressKey = canonicalKey(dress(42));
    expect(names(applyFilters(all, f({ sizes: [dressKey] })))).toEqual(["Gown"]);
    expect(names(applyFilters(all, f({ sizes: [canonicalKey(tvIn(42))] })))).toEqual(["TV 42"]);
  });
  it("is OR inside a scale and AND between scales", () => {
    const eu43 = canonicalKey(shoe("eu", 43));
    const eu42 = canonicalKey(shoe("eu", 42));
    expect(names(applyFilters(all, f({ sizes: [eu42, eu43] })))).toEqual(["Loafer", "Trainer (UK sizes)"]);
    expect(applyFilters(all, f({ sizes: [eu42, canonicalKey(alpha("M"))] }))).toEqual([]); // no product is both a shoe and a tee
  });
  it("ranges: strip light 5 to 10 m", () => {
    expect(names(applyFilters(all, f({ ranges: { length: { min: "5", max: "10" } } })))).toEqual(["Strip light"]);
    expect(names(applyFilters(all, f({ ranges: { length: { min: "", max: "3" } } })))).toEqual(["Strip light (cm)"]); // 300 cm = 3 m
    expect(names(applyFilters(all, f({ ranges: { length: { min: "11", max: "" } } })))).toEqual([]);
  });
  it("ranges: screen inches, open ended", () => {
    expect(names(applyFilters(all, f({ ranges: { "screen-inch": { min: "50", max: "" } } })))).toEqual(["TV 55"]);
  });
  it("storage in TB and GB: 1 TB finds the 1024 GB phone", () => {
    expect(names(applyFilters(all, f({ sizes: [canonicalKey(oneTb)] })))).toEqual(["Phone"]);
  });
  it("products without sizes never match a size filter, and no size filter leaves them alone", () => {
    expect(names(applyFilters(all, f({ sizes: [canonicalKey(alpha("M"))] })))).toEqual(["Tee"]);
    expect(applyFilters(all, EMPTY_FILTERS)).toHaveLength(all.length);
    expect(matchesSizes(plain, f())).toBe(true);
  });
  it("combines with the other filters", () => {
    expect(applyFilters(all, f({ sizes: [canonicalKey(alpha("M"))], q: "mug" }))).toEqual([]);
  });
});

describe("live counts", () => {
  it("each size shows how many products it would leave, given the other filters", () => {
    const eu42 = canonicalKey(shoe("eu", 42));
    expect(countsFor(all, EMPTY_FILTERS).sizes.get(eu42)).toBe(2);
    expect(countsFor(all, f({ q: "loafer" })).sizes.get(eu42)).toBe(1);
    expect(countsFor(all, f({ sizes: [eu42] })).sizes.get(eu42)).toBe(2); // a chosen size's own count ignores itself
  });
  it("travels as JSON", () => {
    const json = JSON.parse(JSON.stringify(countsSummary(all, EMPTY_FILTERS)));
    expect(new Map(json.sizes).get(canonicalKey(alpha("M")))).toBe(1);
    expect(facetsSummary(all).sizes.length).toBe(6);
  });
});

describe("address", () => {
  it("round trips sizes and ranges through the page address", () => {
    const filters = f({ sizes: [canonicalKey(shoe("eu", 42)), canonicalKey(alpha("M"))], ranges: { length: { min: "5", max: "10" }, "screen-inch": { min: "", max: "55" } } });
    const params = writeFilters(new URLSearchParams("keep=1"), filters);
    expect(params.get("keep")).toBe("1");
    expect(params.get("psize")).toBe(filters.sizes.join(","));
    expect(params.get("prange")).toBe("length:5-10,screen-inch:-55");
    const back = parseFilters(params);
    expect(back.sizes).toEqual(filters.sizes);
    expect(back.ranges).toEqual(filters.ranges);
  });
  it("leaves the address clean with no size filters and drops old ones on rewrite", () => {
    const params = writeFilters(new URLSearchParams("psize=shoe:26.7&prange=length:5-10"), EMPTY_FILTERS);
    expect(params.has("psize")).toBe(false);
    expect(params.has("prange")).toBe(false);
  });
  it("ignores junk: unknown scales, choice scales as ranges, bad numbers", () => {
    const { sizes, ranges } = parseSizes(new URLSearchParams("psize=bogus:1,nocolon,shoe:26.7&prange=shoe:1-2,length:abc-5,length:5-10,screen-inch:-"));
    expect(sizes).toEqual(["shoe:26.7"]);
    expect(ranges).toEqual({ length: { min: "5", max: "10" } });
  });
  it("counts them as active filters", () => {
    expect(countActive(f({ sizes: ["shoe:26.7"], ranges: { length: { min: "5", max: "" } } }))).toBe(2);
  });
});

describe("chips", () => {
  const facets = sizeFacets(all);
  it("one removable chip per size and per range, shoes in the buyer's system", () => {
    const key = canonicalKey(shoe("eu", 42));
    const filters = f({ sizes: [key], ranges: { length: { min: "5", max: "10" } } });
    const chips = chipsOf(filters, { sizeFacets: facets, shoeSystem: "uk" });
    expect(chips.map((c) => c.label)).toEqual(["Shoe size: UK 8", "Length: 5 to 10 m"]);
    expect(chips[0].clear(filters).sizes).toEqual([]);
    expect(chips[1].clear(filters).ranges).toEqual({});
  });
});
