import { beforeEach, describe, expect, it, vi } from "vitest";

const loadStore = async () => {
  vi.resetModules();
  return (await import("./geo.js")).useGeoStore;
};

const stubGeolocation = () => {
  const calls = [];
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (ok, fail) => calls.push({ ok, fail }) }
  });
  return calls;
};

const stubPermission = (state) => {
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state }) }
  });
};

const fix = (latitude, longitude) => ({ coords: { latitude, longitude } });

beforeEach(() => {
  localStorage.clear();
  stubPermission("prompt");
});

describe("geo store privacy", () => {
  it("keeps only an approximate device fix", async () => {
    const calls = stubGeolocation();
    const store = await loadStore();
    store.getState().allow();
    calls[0].ok(fix(-0.091734, 34.768123));
    expect(store.getState().coords).toEqual({ lat: -0.09, lng: 34.77 });
    expect(store.getState().source).toBe("device");
  });

  it("treats a malformed fix as a refusal instead of storing it", async () => {
    const calls = stubGeolocation();
    const store = await loadStore();
    store.getState().allow();
    calls[0].ok(fix(Number.NaN, 34.7));
    expect(store.getState().coords).toBeNull();
    expect(store.getState().status).toBe("denied");
  });
});

describe("geo store failed device lookup", () => {
  it("keeps a chosen town when the browser refuses", async () => {
    const calls = stubGeolocation();
    const store = await loadStore();
    store.getState().chooseTown("Maseno");
    store.getState().allow();
    calls[0].fail();
    expect(store.getState()).toMatchObject({ status: "granted", source: "town", town: "Maseno", deviceBlocked: true });
    expect(store.getState().explaining).toBe(true);
  });

  it("opening the sheet never changes the current location", async () => {
    stubGeolocation();
    const store = await loadStore();
    store.getState().chooseTown("Maseno");
    store.getState().request();
    expect(store.getState()).toMatchObject({ status: "granted", town: "Maseno", explaining: true });
  });
});

describe("geo store reset", () => {
  it("clears a chosen town, in memory and on disk", async () => {
    stubGeolocation();
    const store = await loadStore();
    store.getState().chooseTown("Maseno");
    expect(localStorage.getItem("epicmkt.town")).toBe("Maseno");
    store.getState().reset();
    expect(store.getState()).toMatchObject({ status: "idle", source: null, town: null, coords: null });
    expect(localStorage.getItem("epicmkt.town")).toBeNull();
  });

  it("stays cleared after a reload even if the browser still allows location", async () => {
    const calls = stubGeolocation();
    stubPermission("granted");
    const first = await loadStore();
    first.getState().allow();
    calls[0].ok(fix(-0.09, 34.77));
    first.getState().reset();

    const reloaded = await loadStore();
    await reloaded.getState().restore();
    expect(calls).toHaveLength(1);
    expect(reloaded.getState().coords).toBeNull();
  });

  it("resumes automatic restore once the shopper chooses again", async () => {
    const calls = stubGeolocation();
    stubPermission("granted");
    const store = await loadStore();
    store.getState().reset();
    store.getState().allow();
    expect(calls).toHaveLength(1);
    calls[0].ok(fix(-0.09, 34.77));

    const reloaded = await loadStore();
    expect(reloaded.getState().coords).toBeNull();
    await reloaded.getState().restore();
    expect(calls).toHaveLength(2);
  });

  it("ignores a browser answer that arrives after a reset", async () => {
    const calls = stubGeolocation();
    const store = await loadStore();
    store.getState().allow();
    store.getState().reset();
    calls[0].ok(fix(-0.09, 34.77));
    expect(store.getState()).toMatchObject({ status: "idle", coords: null });
  });

  it("works when storage is unavailable", async () => {
    stubGeolocation();
    const store = await loadStore();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => store.getState().reset()).not.toThrow();
    spy.mockRestore();
  });
});
