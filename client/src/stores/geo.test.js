import { beforeEach, describe, expect, it, vi } from "vitest";

const reverse = vi.fn();
vi.mock("../lib/places.js", () => ({ reversePlace: (...a) => reverse(...a) }));

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
  reverse.mockReset();
  reverse.mockResolvedValue(null);
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

describe("geo store area names", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("names the area of a device fix after the fix is kept", async () => {
    const calls = stubGeolocation();
    reverse.mockResolvedValue("Kilimani, Nairobi");
    const store = await loadStore();
    store.getState().allow();
    calls[0].ok(fix(-1.2912, 36.7834));
    expect(store.getState()).toMatchObject({ source: "device", place: null, coords: { lat: -1.29, lng: 36.78 } });
    await flush();
    expect(store.getState().place).toBe("Kilimani, Nairobi");
    expect(reverse).toHaveBeenCalledWith({ lat: -1.29, lng: 36.78 });
  });

  it("keeps the location when the name cannot be found", async () => {
    const calls = stubGeolocation();
    const store = await loadStore();
    store.getState().allow();
    calls[0].ok(fix(-1.29, 36.78));
    await flush();
    expect(store.getState()).toMatchObject({ status: "granted", source: "device", place: null });
  });

  it("drops a name that arrives after the shopper chose a town or reset", async () => {
    const calls = stubGeolocation();
    let answer;
    reverse.mockReturnValue(new Promise((r) => { answer = r; }));
    const store = await loadStore();
    store.getState().allow();
    calls[0].ok(fix(-1.29, 36.78));
    store.getState().chooseTown("Maseno");
    answer("Kilimani, Nairobi");
    await flush();
    expect(store.getState()).toMatchObject({ source: "town", town: "Maseno", place: null });
  });

  it("keeps a searched area, with its name and position, across a reload", async () => {
    const store = await loadStore();
    store.getState().choosePlace({ name: "Kilimani, Nairobi", lat: -1.2905, lng: 36.7872 });
    expect(store.getState()).toMatchObject({ status: "granted", source: "town", town: "Kilimani, Nairobi", coords: { lat: -1.2905, lng: 36.7872 } });
    const again = await loadStore();
    expect(again.getState()).toMatchObject({ source: "town", town: "Kilimani, Nairobi", coords: { lat: -1.2905, lng: 36.7872 } });
  });

  it("still reads a town name saved by an older version, and ignores a damaged value", async () => {
    localStorage.setItem("epicmkt.town", "Maseno");
    expect((await loadStore()).getState().town).toBe("Maseno");
    localStorage.setItem("epicmkt.town", "{broken");
    expect((await loadStore()).getState().town).toBeNull();
    localStorage.setItem("epicmkt.town", JSON.stringify({ name: "X", lat: 999, lng: 0 }));
    expect((await loadStore()).getState().town).toBeNull();
  });

  it("refuses a place with no usable position", async () => {
    const store = await loadStore();
    store.getState().choosePlace({ name: "Nowhere", lat: NaN, lng: 1 });
    expect(store.getState().status).toBe("idle");
  });
});
