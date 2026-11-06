import { afterEach, describe, expect, it, vi } from "vitest";
import { statusText } from "./businessView.js";

const MON = "2026-11-02";
const onBreak = (note = null, extra = {}) => ({
  isOpen: false, timezone: "Africa/Nairobi", closesAt: null, opensAt: { day: "mon", time: "14:00", date: MON },
  openStatus: { reason: { kind: "on_break", note } }, ...extra,
});

afterEach(() => vi.useRealTimers());

describe("statusText while a break is on", () => {
  it("says on break and when the shop reopens, in the shop's time and the viewer's", () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T10:30:00Z") });
    expect(statusText(onBreak(), "Africa/Nairobi")).toBe("On break · Reopens at 2:00 PM EAT");
    expect(statusText(onBreak(), "America/New_York")).toBe("On break · Reopens at 2:00 PM EAT · 6:00 AM your time");
  });

  it("uses the shop's own words for the break", () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T10:30:00Z") });
    expect(statusText(onBreak("Lunch"), "Africa/Nairobi")).toBe("Lunch · Reopens at 2:00 PM EAT");
  });

  it("falls back to the plain closed wording when the shop reopens on another day", () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T14:30:00Z") });
    const text = statusText(onBreak(null, { opensAt: { day: "tue", time: "09:00", date: "2026-11-03" } }), "Africa/Nairobi");
    expect(text).toBe("Closed · Opens Tue 9:00 AM EAT");
  });

  it("leaves open and ordinarily closed shops as they were", () => {
    vi.useFakeTimers({ now: new Date("2026-11-02T10:30:00Z") });
    expect(statusText({ isOpen: true, closesAt: "13:00", timezone: "Africa/Nairobi" }, "Africa/Nairobi")).toBe("Open now · Closes 1:00 PM EAT");
    expect(statusText({ isOpen: false, timezone: "Africa/Nairobi", opensAt: { day: "mon", time: "14:00", date: MON } }, "Africa/Nairobi")).toBe("Closed · Opens 2:00 PM EAT");
  });
});
