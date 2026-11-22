import { describe, expect, it } from "vitest";
import { inKenya, parseRequest, placeFromReverse, placesFromSearch, reverseUrl, searchUrl } from "./geocode.js";

const params = (o) => new URLSearchParams(o);
const feature = (props, [lng, lat] = [36.78, -1.29]) => ({ geometry: { coordinates: [lng, lat] }, properties: { countrycode: "KE", osm_key: "place", osm_value: "suburb", ...props } });

describe("parseRequest", () => {
  it("reads a search and trims it", () => {
    expect(parseRequest(params({ q: "  Kilimani  " }))).toEqual({ op: "search", q: "Kilimani" });
  });
  it("keeps where the shopper is, rounded to about 11 km, only to rank nearer places first", () => {
    expect(parseRequest(params({ q: "Co-op bank", lat: "-1.2912", lng: "36.7845" }))).toEqual({ op: "search", q: "Co-op bank", near: { lat: -1.3, lng: 36.8 } });
    expect(parseRequest(params({ q: "Co-op bank", lat: "51", lng: "0" }))).toEqual({ op: "search", q: "Co-op bank" });
  });
  it("rejects a query that is too short or too long", () => {
    expect(parseRequest(params({ q: "k" })).error).toBe("bad_query");
    expect(parseRequest(params({ q: "x".repeat(81) })).error).toBe("bad_query");
  });
  it("reads a position and rounds it to about 11 m", () => {
    expect(parseRequest(params({ lat: "-1.29123", lng: "36.78456" }))).toEqual({ op: "reverse", lat: -1.2912, lng: 36.7846 });
  });
  it("rejects a position outside Kenya, or a missing or non-numeric one", () => {
    expect(parseRequest(params({ lat: "51.5", lng: "-0.12" })).error).toBe("bad_position");
    expect(parseRequest(params({ lat: "-1.29" })).error).toBe("bad_position");
    expect(parseRequest(params({ lat: "x", lng: "y" })).error).toBe("bad_position");
    expect(parseRequest(params({})).error).toBe("bad_position");
  });
});

describe("placeFromReverse", () => {
  const ke = (address, extra = {}) => ({ address: { country_code: "ke", ...address }, ...extra });
  it("names a building or shop first, then its area and town", () => {
    expect(placeFromReverse(ke({ suburb: "Kilimani", city: "Nairobi", road: "Argwings Kodhek Road" }, { name: "Yaya Centre" }))).toEqual({ name: "Yaya Centre", label: "Yaya Centre, Kilimani, Nairobi", area: "Kilimani, Nairobi" });
  });
  it("uses the road, with a house number, when the spot has no name", () => {
    expect(placeFromReverse(ke({ house_number: "12", road: "Ngong Road", suburb: "Kilimani", city: "Nairobi" })).label).toBe("12 Ngong Road, Kilimani, Nairobi");
    expect(placeFromReverse(ke({ road: "Ngong Road", suburb: "Kilimani", city: "Nairobi" })).label).toBe("Ngong Road, Kilimani, Nairobi");
  });
  it("prefers a neighbourhood over a suburb for the area", () => {
    expect(placeFromReverse(ke({ neighbourhood: "Lavington Green", suburb: "Lavington", city: "Nairobi" })).area).toBe("Lavington Green, Nairobi");
  });
  it("uses a town alone when there is nothing smaller, and never repeats a name", () => {
    expect(placeFromReverse(ke({ town: "Kitale", county: "Trans Nzoia" }))).toEqual({ name: "Kitale", label: "Kitale", area: "Kitale" });
    expect(placeFromReverse(ke({ city: "Nairobi", state: "Nairobi" })).label).toBe("Nairobi");
  });
  it("works in a village with only a road", () => {
    expect(placeFromReverse(ke({ village: "Maseno", county: "Kisumu", road: "Kisumu-Busia Road" })).label).toBe("Kisumu-Busia Road, Maseno, Kisumu");
  });
  it("gives nothing outside Kenya or with nothing to name", () => {
    expect(placeFromReverse({ address: { country_code: "ug", suburb: "Kololo" } })).toBeNull();
    expect(placeFromReverse(ke({}))).toBeNull();
    expect(placeFromReverse(null)).toBeNull();
  });
});

describe("placesFromSearch", () => {
  it("keeps Kenyan places with their area, town, kind and coordinates", () => {
    const out = placesFromSearch({ features: [feature({ name: "Aga Khan University Hospital", district: "Parklands", city: "Nairobi", osm_key: "amenity", osm_value: "hospital" }, [36.8167, -1.2605])] });
    expect(out).toEqual([{ name: "Aga Khan University Hospital", label: "Aga Khan University Hospital, Parklands, Nairobi", lat: -1.2605, lng: 36.8167, kind: "Hospital" }]);
  });
  it("covers the kinds of place people look for", () => {
    const kinds = { marketplace: "Market", pub: "Bar", university: "University", school: "School", hotel: "Hotel", clinic: "Clinic", mortuary: "Mortuary", place_of_worship: "Place of worship", social_facility: "Social facility", post_office: "Post office", bus_station: "Bus station", playground: "Playground", pitch: "Sports field", factory: "Factory", residential: "Estate", house: "House" };
    const features = Object.keys(kinds).map((osm_value, i) => feature({ name: `P${i}`, city: "Nairobi", osm_key: "amenity", osm_value }, [36.8 + i / 1000, -1.3]));
    expect(placesFromSearch({ features }).map((p) => p.kind)).toEqual(Object.values(kinds).slice(0, 8));
    for (const [value, kind] of Object.entries(kinds)) expect(placesFromSearch({ features: [feature({ name: "X", osm_value: value })] })[0].kind).toBe(kind);
  });
  it("names a house or street with no name from its number and street", () => {
    expect(placesFromSearch({ features: [feature({ housenumber: "7", street: "Mfangano Street", city: "Nairobi", osm_key: "building", osm_value: "yes" })] })[0]).toMatchObject({ name: "7 Mfangano Street", label: "7 Mfangano Street, Nairobi", kind: "" });
  });
  it("drops other countries and places outside Kenya's box, but not streets or shops", () => {
    const out = placesFromSearch({ features: [
      feature({ name: "Kilimani", countrycode: "UG" }),
      feature({ name: "Kilimani Road", osm_key: "highway", osm_value: "residential" }),
      feature({ name: "Far", city: "X" }, [10, 50]),
      feature({ name: "Kenya", type: "country" }),
      feature({ name: "Rongai", city: "Kajiado" }, [36.74, -1.39])
    ] });
    expect(out.map((p) => p.label)).toEqual(["Kilimani Road", "Rongai, Kajiado"]);
  });
  it("removes duplicates and keeps at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => feature({ name: `Area ${i}`, city: "Nairobi" }));
    expect(placesFromSearch({ features: [feature({ name: "Dup", city: "N" }), feature({ name: "dup", city: "n" }), ...many] })).toHaveLength(8);
    expect(placesFromSearch({ features: [feature({ name: "Dup", city: "N" }), feature({ name: "dup", city: "n" })] })).toHaveLength(1);
  });
  it("is empty for a bad body", () => {
    expect(placesFromSearch(null)).toEqual([]);
    expect(placesFromSearch({ features: "x" })).toEqual([]);
  });
});

describe("urls and bounds", () => {
  it("searches everything, with no place-only filter, inside Kenya", () => {
    const url = searchUrl("https://photon.test", "kilimani");
    expect(url).toContain("q=kilimani");
    expect(url).not.toContain("osm_tag");
    expect(url).toContain("bbox=33.8");
    expect(url).not.toContain("location_bias_scale");
  });
  it("ranks nearer places first when it knows where the shopper is", () => {
    const url = searchUrl("https://photon.test", "co-op bank", { lat: -1.3, lng: 36.8 });
    expect(url).toContain("lat=-1.3");
    expect(url).toContain("lon=36.8");
    expect(url).toContain("location_bias_scale");
  });
  it("asks for building-level detail when naming a position", () => {
    const url = reverseUrl("https://nom.test", -1.2912, 36.7846);
    expect(url).toContain("lat=-1.2912");
    expect(url).toContain("zoom=18");
  });
  it("knows Kenya's box", () => {
    expect(inKenya(-1.29, 36.82)).toBe(true);
    expect(inKenya(0.0, 0.0)).toBe(false);
  });
});
