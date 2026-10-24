import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const legacy = vi.hoisted(() => ({
  searchBusinesses: vi.fn(async () => ({ items: [{ id: "L", coverUrl: "https://cdn.test/x.png", logoUrl: null }], total: 1, page: 1, pageSize: 12, totalPages: 1 })),
  getCategories: vi.fn(async () => []),
  getTowns: vi.fn(),
  getCounties: vi.fn(),
  getSearchFacets: vi.fn(),
  getSuggestions: vi.fn(),
  getFeaturedBusinesses: vi.fn(async () => []),
  getNearbyBusinesses: vi.fn(),
  getSimilarBusinesses: vi.fn(),
  getTopSearches: vi.fn(),
  logSearch: vi.fn(),
  invalidateBrowseCache: vi.fn()
}));
vi.mock("./liveLegacy.js", () => legacy);

import * as live from "./live.js";
import { mediaUrl } from "../flash/shape.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
let fetchMock;

beforeEach(() => {
  live.invalidateBrowseCache();
  Object.values(legacy).forEach((f) => f.mockClear?.());
  fetchMock = vi.fn(async () => json({ items: [{ id: "1", coverUrl: "b1/cover.png", logoUrl: null }], total: 1, page: 1, pageSize: 12, totalPages: 1 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("live browse client", () => {
  it("asks the cached endpoint for one page instead of downloading the catalog", async () => {
    const result = await live.searchBusinesses({ query: "bread", openNow: false, lat: -0.09101, lng: 34.76802 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/browse?op=search&lat=-0.091&lng=34.768&query=bread");
    expect(result.total).toBe(1);
    expect(legacy.searchBusinesses).not.toHaveBeenCalled();
  });

  it("turns storage paths into picture URLs and leaves finished URLs alone", async () => {
    const { items } = await live.searchBusinesses({});
    expect(items[0].coverUrl).toBe(mediaUrl("b1/cover.png"));
    expect(items[0].coverUrl).not.toBe("b1/cover.png");
    expect(items[0].logoUrl).toBeNull();
  });

  it("sends identical simultaneous questions as one request, and repeats from memory", async () => {
    await Promise.all([live.searchBusinesses({ page: 1 }), live.searchBusinesses({ page: 1 })]);
    await live.searchBusinesses({ page: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to building the catalog in the browser when the endpoint is missing, and stops retrying for a while", async () => {
    fetchMock.mockImplementation(async () => new Response("<html></html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    await live.searchBusinesses({});
    await live.searchBusinesses({ page: 2 });
    expect(legacy.searchBusinesses).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back on a network error or a 5xx", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await live.getCategories();
    expect(legacy.getCategories).toHaveBeenCalled();
  });

  it("reports a missing business as NotFoundError, not as an outage", async () => {
    fetchMock.mockImplementation(async () => json({ error: "not_found", message: "Business not found" }, 404));
    await expect(live.getSimilarBusinesses("nope")).rejects.toMatchObject({ name: "NotFoundError" });
    expect(legacy.getSimilarBusinesses).not.toHaveBeenCalled();
  });

  it("does not call anything for short suggestions or an unknown location", async () => {
    expect(await live.getSuggestions("a")).toEqual([]);
    expect(await live.getNearbyBusinesses({})).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
