import { beforeEach, describe, expect, it, vi } from "vitest";

const loc = (key, pathname, search = "") => ({ key, pathname, search });

describe("results memory", () => {
  let mod;

  beforeEach(async () => {
    sessionStorage.clear();
    vi.resetModules();
    mod = await import("./resultsMemory.js");
  });

  it("stores the listing with its history index when entering a business", () => {
    mod.trackResults(loc("a", "/c/barbershops", "?town=maseno"), 3);
    mod.trackResults(loc("b", "/b/fade-kings"), 4);
    expect(mod.readResults()).toEqual({ path: "/c/barbershops", search: "?town=maseno", historyIdx: 3, businessSlug: "fade-kings" });
  });

  it("stores null when the history index is unavailable", () => {
    mod.trackResults(loc("a", "/flash"), undefined);
    mod.trackResults(loc("b", "/b/fade-kings"), undefined);
    expect(mod.readResults().historyIdx).toBeNull();
  });

  it("keeps the value across item swaps and sheet open or close", () => {
    mod.trackResults(loc("a", "/search", "?q=cut"), 1);
    mod.trackResults(loc("b", "/b/fade-kings"), 2);
    mod.trackResults(loc("c", "/b/fade-kings", "?item=fade"), 3);
    mod.trackResults(loc("d", "/b/fade-kings", "?item=kids"), 3);
    mod.trackResults(loc("e", "/b/fade-kings"), 3);
    expect(mod.readResults().businessSlug).toBe("fade-kings");
  });

  it("deletes the value on a different slug or a non-listing origin", () => {
    mod.trackResults(loc("a", "/c/gyms"), 1);
    mod.trackResults(loc("b", "/b/fade-kings"), 2);
    mod.trackResults(loc("c", "/b/other"), 3);
    expect(mod.readResults()).toBeNull();

    mod.trackResults(loc("d", "/c/gyms"), 4);
    mod.trackResults(loc("e", "/b/fade-kings"), 5);
    mod.trackResults(loc("f", "/about"), 6);
    mod.trackResults(loc("g", "/b/fade-kings"), 7);
    expect(mod.readResults()).toBeNull();
  });

  it("hides on a cold entry without a matching stored value", () => {
    sessionStorage.setItem("epicmkt.results", JSON.stringify({ path: "/c/gyms", search: "", historyIdx: 1, businessSlug: "other" }));
    mod.trackResults(loc("default", "/b/fade-kings"), 0);
    expect(mod.readResults()).toBeNull();
  });

  it("recognises flash and offers listings case-insensitively but not sub-paths", () => {
    expect(["/flash", "/FLASH", "/Flash/", "/offers", "/Offers/"].every(mod.isListing)).toBe(true);
    expect(["/flash/x", "/flashes", "/offers/1", "/SEARCH"].some(mod.isListing)).toBe(false);
  });

  it("keeps scroll only for flash and offers listings", () => {
    mod.saveScroll("k1", "/FLASH/", 640);
    mod.saveScroll("k2", "/offers", 90);
    mod.saveScroll("k3", "/c/gyms", 500);
    mod.saveScroll("k4", "/flash/x", 500);
    expect([mod.savedScroll("k1"), mod.savedScroll("k2"), mod.savedScroll("k3"), mod.savedScroll("k4")]).toEqual([640, 90, undefined, undefined]);
  });

  it("computes the pop distance only when both indexes exist", () => {
    expect(mod.backDelta({ historyIdx: 2 }, 5)).toBe(3);
    expect(mod.backDelta({ historyIdx: null }, 5)).toBe(0);
    expect(mod.backDelta({ historyIdx: 2 }, undefined)).toBe(0);
  });
});
