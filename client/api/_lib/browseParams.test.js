import { describe, expect, it } from "vitest";
import { canonicalQuery, parseRequest, roundCoord } from "./browseParams.js";

const parse = (qs) => parseRequest(new URLSearchParams(qs));

describe("browse request parsing", () => {
  it("rejects unknown operations", () => {
    expect(parse("op=drop_tables")).toBeNull();
    expect(parse("")).toBeNull();
  });

  it("clamps what a public caller can ask for", () => {
    const { params } = parse("op=search&pageSize=100000&page=-4&radiusKm=99999&minRating=9&lat=500&lng=abc&sort=evil&query=" + "x".repeat(500));
    expect(params.pageSize).toBe(48);
    expect(params.page).toBe(1);
    expect(params.radiusKm).toBe(500);
    expect(params.minRating).toBe(5);
    expect(params.lat).toBeUndefined();
    expect(params.sort).toBe("relevance");
    expect(params.query.length).toBe(100);
  });

  it("reads filters and rounds a location to about 110 m", () => {
    const { params } = parse("op=search&categoryId=bakeries&openNow=1&lat=-0.091234&lng=34.767891&sort=distance");
    expect(params).toMatchObject({ categoryId: "bakeries", openNow: true, lat: -0.091, lng: 34.768, sort: "distance" });
  });

  it("needs both coordinates or neither", () => {
    expect(parse("op=nearby&lat=1").params.lat).toBeUndefined();
  });
});

describe("canonical query", () => {
  it("gives the same URL for the same question however it is written", () => {
    const a = canonicalQuery("search", { query: "bread", categoryId: "bakeries", page: 1, openNow: false, town: null });
    const b = canonicalQuery("search", { page: 1, town: undefined, categoryId: "bakeries", query: "bread", verifiedOnly: false });
    expect(a).toBe(b);
    expect(a.startsWith("op=search&")).toBe(true);
  });

  it("lets two people a few metres apart share one cached answer", () => {
    expect(canonicalQuery("nearby", { lat: -0.09101, lng: 34.76802 })).toBe(canonicalQuery("nearby", { lat: -0.09104, lng: 34.76798 }));
    expect(roundCoord(34.76798)).toBe(34.768);
  });

  it("encodes values safely", () => {
    expect(canonicalQuery("search", { query: "a&b=c" })).toContain("query=a%26b%3Dc");
  });
});
