import { describe, expect, it } from "vitest";
import { closingInfo, computeStatus, isOpenNow } from "./index.js";

const eat = (date, time) => new Date(`${date}T${time}:00+03:00`);

describe("intended fix 1: overnight spillover", () => {
  const hours = { fri: ["18:00", "02:00"], sat: ["10:00", "18:00"] };

  it("is open on Saturday 01:00 until 02:00 when Friday runs 18:00 to 02:00", () => {
    expect(isOpenNow(hours, eat("2026-11-07", "01:00"))).toBe(true);
    expect(closingInfo(hours, eat("2026-11-07", "01:00"))).toEqual({ closesAt: "02:00", opensAt: null });
  });

  it("closes at 02:00 and reopens at Saturday's own start", () => {
    expect(isOpenNow(hours, eat("2026-11-07", "02:00"))).toBe(false);
    expect(closingInfo(hours, eat("2026-11-07", "03:00"))).toEqual({ closesAt: null, opensAt: { day: "sat", time: "10:00" } });
  });
});

describe("intended fix 2: an overnight slot does not open its own weekday early", () => {
  const hours = { fri: ["18:00", "02:00"] };

  it("is closed on Friday 01:00, which belongs to Thursday's spillover", () => {
    expect(isOpenNow(hours, eat("2026-11-06", "01:00"))).toBe(false);
    expect(closingInfo(hours, eat("2026-11-06", "01:00"))).toEqual({ closesAt: null, opensAt: { day: "fri", time: "18:00" } });
  });

  it("is open on Friday 18:00 and on Thursday night when Thursday spills over", () => {
    expect(isOpenNow(hours, eat("2026-11-06", "18:00"))).toBe(true);
    expect(isOpenNow({ thu: ["18:00", "02:00"], fri: ["18:00", "02:00"] }, eat("2026-11-06", "01:00"))).toBe(true);
  });
});

describe("intended fix 3: 24-hour days merge across days", () => {
  const hours = { sun: ["00:00", "24:00"], mon: ["00:00", "24:00"] };

  it("keeps Sunday 14:00 open with the next change on Tuesday 00:00", () => {
    const status = computeStatus({ hours }, eat("2026-11-08", "14:00"));
    expect(status.state).toBe("open");
    expect(status.nextChangeIso).toBe(eat("2026-11-10", "00:00").toISOString());
  });

  it("reports a midnight close as 00:00, never 24:00", () => {
    expect(closingInfo(hours, eat("2026-11-08", "14:00"))).toEqual({ closesAt: "00:00", opensAt: null });
  });

  it("stays open across midnight from Sunday into Monday", () => {
    expect(isOpenNow(hours, eat("2026-11-09", "00:30"))).toBe(true);
    expect(isOpenNow(hours, new Date("2026-11-07T21:30:00Z"))).toBe(true);
    expect(isOpenNow(hours, eat("2026-11-10", "00:00"))).toBe(false);
  });
});

describe("intended fix 4: equal start and end is a 24-hour interval", () => {
  it("is open for the whole day and ends at the same time next day", () => {
    const hours = { sun: ["06:00", "06:00"] };
    const status = computeStatus({ hours }, eat("2026-11-08", "14:00"));
    expect(status.state).toBe("open");
    expect(status.untilIso).toBe(eat("2026-11-09", "06:00").toISOString());
  });

  it("reads 00:00 to 00:00 as the full day and merges it with the next day", () => {
    const hours = { sun: ["00:00", "00:00"], mon: ["00:00", "00:00"] };
    expect(computeStatus({ hours }, eat("2026-11-08", "14:00")).nextChangeIso).toBe(eat("2026-11-10", "00:00").toISOString());
  });
});
