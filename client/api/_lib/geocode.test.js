import { describe, expect, it } from "vitest";
import { inKenya, parseRequest, placeFromReverse, placesFromSearch, reverseUrl, searchUrl } from "./geocode.js";

const params = (o) => new URLSearchParams(o);
const feature = (props, [lng, lat] = [36.78, -1.29]) => ({ geometry: { coordinates: [lng, lat] }, properties: { countrycode: "KE", osm_key: "place", osm_value: "suburb", ...props } });

describe("parseRequest", () => {
  it("reads a search and trims it", () => {
    expect(parseRequest(params({ q: "  Kilimani  " }))).toEqual({ op: "search", q: "Kilimani" });
  });
  it("rejects a query that is too short or too long", () => {
    expect(parseRequest(params({ q: "k" })).error).toBe("bad_query");
    expect(parseRequest(params({ q: "x".repeat(81) })).error).toBe("bad_query");
  });
  it("reads a position and rounds it to about 100 m", () => {
    expect(parseRequest(params({ lat: "-1.29123", lng: "36.78456" }))).toEqual({ op: "reverse", lat: -1.291, lng: 36.785 });
  });
  it("rejects a position outside Kenya, or a missing or non-numeric one", () => {
    expect(parseRequest(params({ lat: "51.5", lng: "-0.12" })).error).toBe("bad_position");
    expect(parseRequest(params({ lat: "-1.29" })).error).toBe("bad_position");
    expect(parseRequest(params({ lat: "x", lng: "y" })).error).toBe("bad_position");
    expect(parseRequest(params({})).error).toBe("bad_position");
  });
  it("a search wins over a position", () => {
    expect(parseRequest(params({ q: "Rongai", lat: "-1.29", lng: "36.78" })).op).toBe("search");
  });
});

describe("placeFromReverse", () => {
  it("names the most local area with its town", () => {
    expect(placeFromReverse({ address: { country_code: "ke", suburb: "Kilimani", city: "Nairobi", county: "Nairobi County" } })).toEqual({ name: "Kilimani", label: "Kilimani, Nairobi" });
  });
  it("prefers a neighbourhood over a suburb", () => {
    expect(placeFromReverse({ address: { country_code: "ke", neighbourhood: "Lavington Green", suburb: "Lavington", city: "Nairobi" } }).name).toBe("Lavington Green");
  });
  it("uses a town alone when there is nothing smaller", () => {
    expect(placeFromReverse({ address: { country_code: "ke", town: "Kitale", county: "Trans Nzoia" } })).toEqual({ name: "Kitale", label: "Kitale" });
  });
  it("does not repeat the name as its own context", () => {
    expect(placeFromReverse({ address: { country_code: "ke", city: "Nairobi", state: "Nairobi" } }).label).toBe("Nairobi");
  });
  it("gives nothing outside Kenya or with no area name", () => {
    expect(placeFromReverse({ address: { country_code: "ug", suburb: "Kololo" } })).toBeNull();
    expect(placeFromReverse({ address: { country_code: "ke", county: "Kisumu" } })).toBeNull();
    expect(placeFromReverse(null)).toBeNull();
  });
});

describe("placesFromSearch", () => {
  it("keeps Kenyan places with their context and coordinates", () => {
    const out = placesFromSearch({ features: [feature({ name: "Kilimani", city: "Nairobi" })] });
    expect(out).toEqual([{ name: "Kilimani", label: "Kilimani, Nairobi", lat: -1.29, lng: 36.78, kind: "suburb" }]);
  });
  it("drops other countries, streets and shops, and places outside Kenya's box", () => {
    const out = placesFromSearch({ features: [
      feature({ name: "Kilimani", countrycode: "UG" }),
      feature({ name: "Kilimani Road", osm_key: "highway" }),
      feature({ name: "Far", city: "X" }, [10, 50]),
      feature({ name: "Rongai", city: "Kajiado" }, [36.74, -1.39])
    ] });
    expect(out.map((p) => p.label)).toEqual(["Rongai, Kajiado"]);
  });
  it("removes duplicates and keeps at most six", () => {
    const many = Array.from({ length: 12 }, (_, i) => feature({ name: `Area ${i}`, city: "Nairobi" }));
    expect(placesFromSearch({ features: [feature({ name: "Dup", city: "N" }), feature({ name: "dup", city: "n" }), ...many] })).toHaveLength(6);
    expect(placesFromSearch({ features: [feature({ name: "Dup", city: "N" }), feature({ name: "dup", city: "n" })] })).toHaveLength(1);
  });
  it("is empty for a bad body", () => {
    expect(placesFromSearch(null)).toEqual([]);
    expect(placesFromSearch({ features: "x" })).toEqual([]);
  });
});

describe("urls and bounds", () => {
  it("builds the search and reverse urls", () => {
    expect(searchUrl("https://photon.test", "kilimani")).toContain("q=kilimani");
    expect(searchUrl("https://photon.test", "kilimani")).toContain("osm_tag=place");
    expect(reverseUrl("https://nom.test", -1.291, 36.785)).toContain("lat=-1.291");
    expect(reverseUrl("https://nom.test", -1.291, 36.785)).toContain("zoom=14");
  });
  it("knows Kenya's box", () => {
    expect(inKenya(-1.29, 36.82)).toBe(true);
    expect(inKenya(0.0, 0.0)).toBe(false);
  });
});
