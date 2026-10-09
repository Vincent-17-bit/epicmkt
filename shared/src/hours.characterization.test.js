import { describe, expect, it } from "vitest";
import { closingInfo, isOpenNow, nairobiNow, todayHours } from "./index.js";

const hours = {
  mon: ["08:00", "20:00"],
  tue: ["08:00", "20:00"],
  wed: null,
  thu: ["09:00", "17:30"],
  fri: ["08:00", "20:00"],
  sat: ["10:00", "18:00"],
  sun: null
};

const at = (iso) => new Date(iso);

describe("nairobiNow", () => {
  it("shifts UTC to EAT and names the weekday", () => {
    expect(nairobiNow(at("2026-11-09T09:00:00Z"))).toEqual({ day: "mon", minutes: 720 });
    expect(nairobiNow(at("2026-11-08T21:00:00Z"))).toEqual({ day: "mon", minutes: 0 });
    expect(nairobiNow(at("2026-11-08T20:59:00Z"))).toEqual({ day: "sun", minutes: 1439 });
  });
});

describe("todayHours", () => {
  it("returns the slot for the EAT weekday or null", () => {
    expect(todayHours(hours, at("2026-11-09T09:00:00Z"))).toEqual(["08:00", "20:00"]);
    expect(todayHours(hours, at("2026-11-11T09:00:00Z"))).toBeNull();
    expect(todayHours(hours, at("2026-11-08T09:00:00Z"))).toBeNull();
  });
});

describe("isOpenNow for same-day slots", () => {
  it.each([
    ["2026-11-09T04:59:00Z", false],
    ["2026-11-09T05:00:00Z", true],
    ["2026-11-09T09:00:00Z", true],
    ["2026-11-09T16:59:00Z", true],
    ["2026-11-09T17:00:00Z", false],
    ["2026-11-11T09:00:00Z", false],
    ["2026-11-08T09:00:00Z", false],
    ["2026-11-12T14:29:00Z", true],
    ["2026-11-12T14:30:00Z", false]
  ])("%s -> %s", (iso, expected) => {
    expect(isOpenNow(hours, at(iso))).toBe(expected);
  });

  it("is closed when the weekday has no slot", () => {
    expect(isOpenNow({}, at("2026-11-09T09:00:00Z"))).toBe(false);
  });
});

describe("closingInfo for same-day slots", () => {
  it("reports the closing time while open", () => {
    expect(closingInfo(hours, at("2026-11-09T09:00:00Z"))).toEqual({ closesAt: "20:00", opensAt: null });
    expect(closingInfo(hours, at("2026-11-12T10:00:00Z"))).toEqual({ closesAt: "17:30", opensAt: null });
  });

  it("reports today's opening when it opens later today", () => {
    expect(closingInfo(hours, at("2026-11-09T03:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "mon", time: "08:00" } });
  });

  it("reports the next open weekday after closing", () => {
    expect(closingInfo(hours, at("2026-11-09T18:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "tue", time: "08:00" } });
  });

  it("skips closed days", () => {
    expect(closingInfo(hours, at("2026-11-10T18:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "thu", time: "09:00" } });
    expect(closingInfo(hours, at("2026-11-14T18:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "mon", time: "08:00" } });
  });

  it("wraps around the week", () => {
    expect(closingInfo(hours, at("2026-11-13T18:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "sat", time: "10:00" } });
    expect(closingInfo({ mon: ["08:00", "20:00"] }, at("2026-11-09T18:00:00Z"))).toEqual({ closesAt: null, opensAt: { day: "mon", time: "08:00" } });
  });

  it("reports nothing when there are no hours at all", () => {
    expect(closingInfo({}, at("2026-11-09T09:00:00Z"))).toEqual({ closesAt: null, opensAt: null });
  });
});
