import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPlaceCache, matchTowns, mergePlaces, reversePlace, searchPlaces } from "./places.js";

const ok = (results) => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results }) });
beforeEach(() => clearPlaceCache());

describe("matchTowns", () => {
  it("matches the start of a name first, ignoring case and accents", () => {
    const out = matchTowns("KISU");
    expect(out[0].name).toBe("Kisumu");
    expect(out[0].label).toBe("Kisumu");
  });
  it("matches a county and any part of a name", () => {
    expect(matchTowns("uasin").map((p) => p.name)).toContain("Eldoret");
    expect(matchTowns("bay").map((p) => p.name)).toContain("Homa Bay");
  });
  it("is empty for nothing typed or no match", () => {
    expect(matchTowns("")).toEqual([]);
    expect(matchTowns("zzzzzz")).toEqual([]);
  });
});

describe("mergePlaces", () => {
  it("shows a place the list has once, and adds new online areas", () => {
    const local = matchTowns("nairobi");
    const out = mergePlaces(local, [{ name: "Nairobi", label: "Nairobi, Nairobi", lat: 0, lng: 0 }, { name: "Nairobi West", label: "Nairobi West, Nairobi", lat: -1.3, lng: 36.8 }]);
    expect(out.filter((p) => p.name === "Nairobi")).toHaveLength(1);
    expect(out.map((p) => p.name)).toContain("Nairobi West");
  });
  it("never shows more than eight", () => {
    const remote = Array.from({ length: 20 }, (_, i) => ({ name: `A${i}`, label: `A${i}, X`, lat: 0, lng: 0 }));
    expect(mergePlaces([], remote)).toHaveLength(8);
  });
});

describe("searchPlaces", () => {
  it("asks the geocode endpoint, caches, and does not ask for one letter", async () => {
    const fetchFn = ok([{ name: "Kilimani", label: "Kilimani, Nairobi", lat: -1.29, lng: 36.78 }]);
    expect(await searchPlaces("k", { fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await searchPlaces(" Kilimani ", { fetchFn }))[0].label).toBe("Kilimani, Nairobi");
    await searchPlaces("kilimani", { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/geocode?q=Kilimani");
  });
  it("gives [] when the service fails, is offline or answers badly", async () => {
    expect(await searchPlaces("kilimani", { fetchFn: vi.fn().mockResolvedValue({ ok: false }) })).toEqual([]);
    expect(await searchPlaces("kilimani", { fetchFn: vi.fn().mockRejectedValue(new Error("offline")) })).toEqual([]);
    expect(await searchPlaces("kilimani", { fetchFn: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nope: 1 }) }) })).toEqual([]);
  });
});

describe("reversePlace", () => {
  it("names the area for a position and remembers it", async () => {
    const fetchFn = ok([{ name: "Kilimani", label: "Kilimani, Nairobi" }]);
    expect(await reversePlace({ lat: -1.29, lng: 36.78 }, { fetchFn })).toBe("Kilimani, Nairobi");
    expect(await reversePlace({ lat: -1.29, lng: 36.78 }, { fetchFn })).toBe("Kilimani, Nairobi");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe("/api/geocode?lat=-1.29&lng=36.78");
  });
  it("gives null for no answer or a bad position", async () => {
    expect(await reversePlace({ lat: -1.29, lng: 36.78 }, { fetchFn: ok([]) })).toBeNull();
    expect(await reversePlace({ lat: NaN, lng: 1 }, { fetchFn: ok([]) })).toBeNull();
  });
});
