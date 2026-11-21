import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "./geocode.js";

const call = (qs, method = "GET") => handler(new Request(`https://epicmkt.test/api/geocode?${qs}`, { method }));
const upstream = (body, ok = true) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, json: async () => body }));
afterEach(() => vi.unstubAllGlobals());

describe("/api/geocode", () => {
  it("finds areas for a search, cached for a day", async () => {
    upstream({ features: [{ geometry: { coordinates: [36.78, -1.29] }, properties: { name: "Kilimani", city: "Nairobi", countrycode: "KE", osm_key: "place", osm_value: "suburb" } }] });
    const res = await call("q=kilimani");
    expect(res.status).toBe(200);
    expect((await res.json()).results[0].label).toBe("Kilimani, Nairobi");
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=86400");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain("photon.komoot.io");
    expect(init.headers["User-Agent"]).toMatch(/^EpicMKT/);
    expect(init.headers.Cookie).toBeUndefined();
  });

  it("names the area of a position and sends only the rounded position", async () => {
    upstream({ address: { country_code: "ke", suburb: "Kilimani", city: "Nairobi" } });
    const res = await call("lat=-1.29123&lng=36.78456");
    expect((await res.json()).results).toEqual([{ name: "Kilimani", label: "Kilimani, Nairobi", lat: -1.291, lng: 36.785 }]);
    const url = fetch.mock.calls[0][0];
    expect(url).toContain("nominatim.openstreetmap.org");
    expect(url).toContain("lat=-1.291");
    expect(url).not.toContain("-1.29123");
  });

  it("answers an empty list for an unknown spot, with a short cache", async () => {
    upstream({ address: { country_code: "ke" } });
    const res = await call("lat=-1.29&lng=36.78");
    expect((await res.json()).results).toEqual([]);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("refuses bad requests without asking upstream", async () => {
    upstream({});
    expect((await call("q=k")).status).toBe(400);
    expect((await call("lat=51&lng=0")).status).toBe(400);
    expect((await call("q=kilimani", "POST")).status).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("gives a 502 that is never cached when upstream fails or times out", async () => {
    upstream({}, false);
    const bad = await call("q=kilimani");
    expect(bad.status).toBe(502);
    expect(bad.headers.get("Cache-Control")).toBe("no-store");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect((await call("q=kilimani")).status).toBe(502);
  });
});
