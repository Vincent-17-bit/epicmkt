import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRoadCache, fetchRoadKm } from "./roadDistance.js";

const A = { lat: -0.09, lng: 34.76 };
const B = { lat: -0.1, lng: 34.78 };
const ok = (meters) => vi.fn(async () => ({ ok: true, json: async () => ({ routes: [{ distance: meters }] }) }));
beforeEach(() => clearRoadCache());

describe("fetchRoadKm", () => {
  it("sends nothing and answers null when no routing service is configured", async () => {
    const fetchFn = ok(1000);
    expect(await fetchRoadKm(A, B, { url: "", fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("asks the service for the driving route, sends only the two points, and rounds to 0.1 km", async () => {
    const fetchFn = ok(4349);
    expect(await fetchRoadKm(A, B, { url: "https://r.test/", fetchFn })).toBe(4.3);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://r.test/route/v1/driving/34.76,-0.09;34.78,-0.1?overview=false");
    expect(init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("asks once for the same trip", async () => {
    const fetchFn = ok(2000);
    await fetchRoadKm(A, B, { url: "https://r.test", fetchFn });
    expect(await fetchRoadKm(A, B, { url: "https://r.test", fetchFn })).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("answers null, and does not throw, on an error, a bad answer, no route or a timeout", async () => {
    expect(await fetchRoadKm(A, B, { url: "https://r.test", fetchFn: vi.fn(async () => { throw new Error("offline"); }) })).toBeNull();
    expect(await fetchRoadKm(A, B, { url: "https://r.test", fetchFn: vi.fn(async () => ({ ok: false })) })).toBeNull();
    expect(await fetchRoadKm(A, B, { url: "https://r.test", fetchFn: vi.fn(async () => ({ ok: true, json: async () => ({ routes: [] }) })) })).toBeNull();
    const hang = vi.fn((_u, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted")))));
    expect(await fetchRoadKm(A, B, { url: "https://r.test", fetchFn: hang, timeoutMs: 10 })).toBeNull();
  });
});
