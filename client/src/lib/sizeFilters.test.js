import { describe, expect, it } from "vitest";
import * as scales from "../../../shared/src/scales/index.js";
import { EMPTY_FILTERS, applyFilters, chipsOf, countActive, countsFor, facetsOf, parseFilters, writeFilters } from "./productFilters.js";
import { countsSummary, countsFromJson } from "./productQuery.js";
import { filterKey, matchesSizes, parseSizes, rangeText, sizeFacets, writeSizes } from "./sizeFilters.js";
import { sizeLabel, sizeNameFrom } from "./sizeFilterLabels.js";

const val = (scale, raw, ctx) => {
  const r = scales.parse(scale, raw, ctx);
  if (!r.ok) throw new Error(`${scale} ${raw}: ${r.error.message}`);
  return r.value;
};
let n = 0;
const product = (name, sizeValues) => ({ id: `p${++n}`, name, createdAt: `2026-01-${String(10 + n).padStart(2, "0")}`, pricing: { salePrice: 100 }, business: {}, sizeValues });

const loafersA = product("Loafers", [val("shoe", "EU 41"), val("shoe", "EU 42"), val("shoe", "EU 43")]);
const loafersB = product("Boots", [val("shoe", "UK 8"), val("shoe", "UK 9")]); // UK 8 is EU 42
// A dress sold in EU numbers: the stored value is `apparel-numeric` with the EU system, the same number 42 as the shoe.
const dress = product("Dress", [{ scale: "apparel-numeric", system: "eu", value: 42 }, val("apparel-alpha", "M")]);
const tv42 = product("TV 42", [val("screen-inch", "42 inch"), val("storage", "512 GB")]);
const tv55 = product("TV 55", [val("screen-inch", "55 inch"), val("storage", "1024 GB")]);
const strip = product("Strip light", [val("length", "5 m"), val("length", "10 m")]);
const strip2 = product("Long strip", [val("length", "20 m")]);
const plain = product("Bread", undefined);
const all = [loafersA, loafersB, dress, tv42, tv55, strip, strip2, plain];
const f = (over) => ({ ...EMPTY_FILTERS, ...over });
const names = (rows) => rows.map((p) => p.name).sort();

describe("size keys never collide across scales", () => {
  it("shoe 42, dress 42 and a 42-inch TV are three different keys", () => {
    const keys = [filterKey(val("shoe", "EU 42")), filterKey(dress.sizeValues[0]), filterKey(val("screen-inch", "42 inch"))];
    expect(new Set(keys).size).toBe(3);
  });
  it("a shoe in UK has the key of the same size in EU", () => {
    expect(filterKey(val("shoe", "UK 8"))).toBe(filterKey(val("shoe", "EU 42")));
  });
  it("facets are grouped by scale, so 42 appears once under shoes and once under clothing", () => {
    const groups = sizeFacets(all);
    const by = Object.fromEntries(groups.map((g) => [g.scale, g]));
    expect(Object.keys(by).sort()).toEqual(["apparel-alpha", "apparel-numeric", "length", "screen-inch", "shoe", "storage"]);
    expect(by.shoe.options.find((o) => o.key === "shoe:eu:42").count).toBe(2); // loafers (EU 42) and boots (UK 8)
    expect(by["apparel-numeric"].options.map((o) => o.key)).toEqual(["apparel-numeric:eu:42"]);
  });
});

describe("choice filters", () => {
  it("shoe 42 returns shoes only, never the dress or the TV", () => {
    expect(names(applyFilters(all, f({ sizes: ["shoe:eu:42"] })))).toEqual(["Boots", "Loafers"]);
  });
  it("two sizes of one scale are OR; two scales are AND", () => {
    expect(names(applyFilters(all, f({ sizes: ["shoe:eu:41", "shoe:eu:43"] })))).toEqual(["Boots", "Loafers"]); // UK 9 is EU 43
    expect(names(applyFilters(all, f({ sizes: ["shoe:eu:41"] })))).toEqual(["Loafers"]);
    expect(names(applyFilters(all, f({ sizes: ["shoe:eu:42", "apparel-alpha:-:M"] })))).toEqual([]);
    expect(names(applyFilters(all, f({ sizes: ["screen-inch:-:42:in", "storage:-:512:GB"] })))).toEqual(["TV 42"]);
  });
  it("a product with no sizes never matches a size filter, and is untouched without one", () => {
    expect(names(applyFilters(all, f({ sizes: ["shoe:eu:42"] })))).not.toContain("Bread");
    expect(applyFilters(all, EMPTY_FILTERS)).toHaveLength(all.length);
  });
  it("storage options are sorted by compare: 512 GB before 1 TB", () => {
    const storage = sizeFacets(all).find((g) => g.scale === "storage");
    expect(storage.options.map((o) => sizeLabel(o.value))).toEqual(["512 GB", "1 TB"]);
  });
  it("shoe sizes are sorted by size and labelled in the chosen system", () => {
    const shoe = sizeFacets(all).find((g) => g.scale === "shoe");
    expect(shoe.options.map((o) => sizeLabel(o.value, "eu"))).toEqual(["EU 41", "EU 42", "EU 43", "EU 44"].slice(0, shoe.options.length));
    expect(shoe.options.map((o) => sizeLabel(o.value, "uk"))[1]).toBe("UK 8");
    expect(sizeLabel(shoe.options[1].value, "us-w")).toBe("US 10");
    expect(sizeLabel(shoe.options[1].value, "cm")).toBe("26.7 cm");
  });
});

describe("range filters", () => {
  it("strip light 5 to 10 m keeps the 5 m and 10 m strips and drops the 20 m one", () => {
    expect(names(applyFilters(all, f({ ranges: { length: { min: "5", max: "10" } } })))).toEqual(["Strip light"]);
    expect(names(applyFilters(all, f({ ranges: { length: { min: "15", max: "" } } })))).toEqual(["Long strip"]);
  });
  it("screen inch ranges and open ends", () => {
    expect(names(applyFilters(all, f({ ranges: { "screen-inch": { min: "50", max: "" } } })))).toEqual(["TV 55"]);
    expect(names(applyFilters(all, f({ ranges: { "screen-inch": { min: "", max: "45" } } })))).toEqual(["TV 42"]);
  });
  it("swaps a reversed range instead of returning nothing", () => {
    expect(names(applyFilters(all, f({ ranges: { length: { min: "10", max: "5" } } })))).toEqual(["Strip light"]);
  });
  it("reports the bounds in the range's own unit", () => {
    const len = sizeFacets(all).find((g) => g.scale === "length");
    expect(len).toMatchObject({ mode: "range", unit: "m", min: 5, max: 20 });
    expect(sizeFacets(all).find((g) => g.scale === "screen-inch")).toMatchObject({ unit: "in", min: 42, max: 55 });
  });
});

describe("counts, chips and the page address", () => {
  it("live counts ignore the size filter itself", () => {
    const counts = countsFor(all, f({ sizes: ["shoe:eu:41"] }));
    expect(counts.sizes.get("shoe:eu:42")).toBe(2);
    expect(countsFromJson(countsSummary(all, f({}))).sizes.get("shoe:eu:42")).toBe(2);
  });
  it("round trips through the address", () => {
    const filters = f({ sizes: ["shoe:eu:42", "storage:-:1024:GB"], ranges: { length: { min: "5", max: "10" } } });
    const params = writeFilters(new URLSearchParams("keep=1"), filters);
    expect(params.get("keep")).toBe("1");
    expect(params.get("psize")).toBe("shoe:eu:42,storage:-:1024:GB");
    expect(params.get("prange")).toBe("length:5-10");
    const back = parseFilters(new URLSearchParams(params.toString()));
    expect(back.sizes).toEqual(filters.sizes);
    expect(back.ranges).toEqual(filters.ranges);
    expect(countActive(back)).toBe(3);
  });
  it("leaves the address alone when there are no size filters, and drops junk", () => {
    expect(writeFilters(new URLSearchParams(), EMPTY_FILTERS).toString()).toBe("");
    const { sizes, ranges } = parseSizes(new URLSearchParams("psize=nope:1,shoe:eu:42,%3Cscript%3E&prange=length:abc-5,weight:1-2,length:3-"));
    expect(sizes).toEqual(["shoe:eu:42"]);
    expect(ranges).toEqual({ length: { min: "3", max: "" } });
    expect(writeSizes(new URLSearchParams("psize=x&prange=y"), { sizes: [], ranges: {} }).toString()).toBe("");
  });
  it("one removable chip per size and per range", () => {
    const groups = facetsOf(all).sizes;
    const chips = chipsOf(f({ sizes: ["shoe:eu:42"], ranges: { length: { min: "5", max: "10" } } }), { sizeName: sizeNameFrom(groups, "uk") });
    expect(chips.map((c) => c.label)).toEqual(["UK 8", "5 to 10 m"]);
    const cleared = chips[0].clear(f({ sizes: ["shoe:eu:42"], ranges: {} }));
    expect(cleared.sizes).toEqual([]);
    expect(chips[1].clear(f({ ranges: { length: { min: "5", max: "10" } } })).ranges).toEqual({});
  });
  it("rangeText and matchesSizes handle the empty case", () => {
    expect(rangeText("screen-inch", { min: "32", max: "" })).toBe("32 in and up");
    expect(rangeText("length", { min: "", max: "10" })).toBe("Up to 10 m");
    expect(matchesSizes(plain, [], {})).toBe(true);
  });
  it("does not throw on malformed size values", () => {
    const bad = { id: "x", name: "Bad", sizeValues: [null, 7, { scale: "nope", value: 1 }, { scale: "shoe" }] };
    expect(() => sizeFacets([bad])).not.toThrow();
    expect(sizeFacets([bad])).toEqual([]);
  });
});
