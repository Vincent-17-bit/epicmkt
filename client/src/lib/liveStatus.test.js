import { describe, expect, it } from "vitest";
import { withLiveStatus } from "./liveStatus.js";

const hours = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, ["08:00", "18:00"]]));
const shop = { id: "b", hours, exceptions: [], timezone: "America/Los_Angeles", isOpen: true, statusLine: "stale" };
const at = (iso) => Date.parse(iso);

describe("withLiveStatus", () => {
  it("flips the chip as time passes without a refetch", () => {
    expect(withLiveStatus(shop, at("2026-11-04T04:00:00Z")).isOpen).toBe(false);
    expect(withLiveStatus(shop, at("2026-11-04T18:00:00Z")).isOpen).toBe(true);
    expect(withLiveStatus(shop, at("2026-11-05T02:01:00Z")).isOpen).toBe(false);
  });

  it("uses the shop's own date for a closed exception", () => {
    const closed = { ...shop, exceptions: [{ id: "1", date: "2026-11-02", kind: "closed", intervals: [], note: null }] };
    expect(withLiveStatus(closed, at("2026-11-03T03:00:00Z")).isOpen).toBe(false);
    expect(withLiveStatus(closed, at("2026-11-03T17:00:00Z")).isOpen).toBe(true);
  });

  it("keeps a 24-hour shop open at 23:59:30 and survives an unknown zone", () => {
    const full = { ...shop, hours: Object.fromEntries(Object.keys(hours).map((d) => [d, ["00:00", "23:59"]])) };
    expect(withLiveStatus(full, at("2026-11-05T07:59:30Z")).isOpen).toBe(true);
    expect(withLiveStatus({ ...shop, timezone: "Nowhere/Land" }, at("2026-11-04T09:00:00Z")).isOpen).toBe(true);
  });

  it("leaves a business without hours untouched", () => {
    const bare = { id: "x", isOpen: true };
    expect(withLiveStatus(bare, Date.now())).toBe(bare);
    expect(withLiveStatus(null, Date.now())).toBeNull();
  });
});
