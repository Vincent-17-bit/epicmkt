import { afterEach, describe, expect, it } from "vitest";
import { setUserTimeZone } from "@epicmkt/shared";
import { clockText, describeMs, discountBadge, endsInLabel, formatEndsAt, fuseShare, spokenDuration, urgencyLabel, urgencyOf } from "./flash.js";

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("urgencyOf", () => {
  it("maps remaining time to the five states", () => {
    expect(urgencyOf(DAY + 1)).toBe("calm");
    expect(urgencyOf(DAY)).toBe("calm");
    expect(urgencyOf(DAY - 1)).toBe("soon");
    expect(urgencyOf(HOUR)).toBe("soon");
    expect(urgencyOf(HOUR - 1)).toBe("urgent");
    expect(urgencyOf(5 * MIN)).toBe("urgent");
    expect(urgencyOf(5 * MIN - 1)).toBe("critical");
    expect(urgencyOf(1)).toBe("critical");
    expect(urgencyOf(0)).toBe("ended");
    expect(urgencyOf(-5)).toBe("ended");
  });
});

describe("describeMs and clockText", () => {
  it("splits and rounds seconds up", () => {
    expect(describeMs(2 * HOUR + 14 * MIN + 9000)).toMatchObject({ d: 0, h: 2, m: 14, s: 9, urgency: "soon" });
    expect(describeMs(700).s).toBe(1);
  });

  it("shows days, hours and minutes over 24h and a clock under it", () => {
    expect(clockText(describeMs(2 * DAY + 5 * HOUR + 12 * MIN))).toBe("2d 05h 12m");
    expect(clockText(describeMs(2 * HOUR + 14 * MIN + 9000))).toBe("02:14:09");
  });
});

describe("spoken labels", () => {
  it("reads naturally", () => {
    expect(spokenDuration(2 * HOUR + 5 * MIN)).toBe("2 hours 5 minutes");
    expect(spokenDuration(HOUR)).toBe("1 hour");
    expect(spokenDuration(3 * DAY + HOUR)).toBe("3 days 1 hour");
    expect(spokenDuration(30000)).toBe("1 minute");
    expect(endsInLabel(2 * HOUR + 5 * MIN)).toBe("Ends in 2 hours 5 minutes");
    expect(endsInLabel(0)).toBe("Ended");
  });

  it("swaps the band label by urgency", () => {
    expect(urgencyLabel("calm")).toBe("Flash sale");
    expect(urgencyLabel("soon")).toBe("Flash sale");
    expect(urgencyLabel("urgent")).toBe("Ending soon");
    expect(urgencyLabel("critical")).toBe("Last chance");
  });
});

describe("discountBadge", () => {
  it("follows the discount type", () => {
    expect(discountBadge({ type: "percent", value: 35 })).toEqual({ kind: "percent", text: "-35%" });
    expect(discountBadge({ type: "amount_off", value: 150 })).toEqual({ kind: "amount", text: "KES 150 OFF" });
    expect(discountBadge({ type: "sale_price", value: 15 })).toEqual({ kind: "deal", text: "DEAL" });
  });
});

describe("fuseShare", () => {
  const start = new Date(0).toISOString();
  const end = new Date(1000).toISOString();

  it("is the remaining share clamped to 0..1", () => {
    expect(fuseShare(start, end, 250)).toBe(0.75);
    expect(fuseShare(start, end, -50)).toBe(1);
    expect(fuseShare(start, end, 5000)).toBe(0);
    expect(fuseShare(end, start, 0)).toBe(0);
  });
});

describe("formatEndsAt", () => {
  const SALE_END = "2026-11-08T15:00:00.000Z";
  afterEach(() => setUserTimeZone(null));

  it("shows a viewer in Nairobi their own time, named EAT", () => {
    setUserTimeZone("Africa/Nairobi");
    expect(formatEndsAt(SALE_END)).toBe("Sun 8 Nov, 6:00 PM EAT");
  });

  it("shows the same sale in each viewer's own zone, never Nairobi's", () => {
    setUserTimeZone("America/New_York");
    expect(formatEndsAt(SALE_END)).toBe("Sun 8 Nov, 10:00 AM GMT-5");
    setUserTimeZone("America/Los_Angeles");
    expect(formatEndsAt(SALE_END)).toBe("Sun 8 Nov, 7:00 AM GMT-8");
    setUserTimeZone("Asia/Kathmandu");
    expect(formatEndsAt(SALE_END)).toBe("Sun 8 Nov, 8:45 PM GMT+5:45");
    setUserTimeZone("Pacific/Kiritimati");
    expect(formatEndsAt(SALE_END)).toBe("Mon 9 Nov, 5:00 AM GMT+14");
  });

  it("follows daylight saving: the same clock time in UTC reads an hour apart in winter and summer", () => {
    setUserTimeZone("Europe/London");
    expect(formatEndsAt("2026-01-10T18:00:00.000Z")).toBe("Sat 10 Jan, 6:00 PM GMT");
    expect(formatEndsAt("2026-07-10T18:00:00.000Z")).toBe("Fri 10 Jul, 7:00 PM GMT+1");
  });

  it("is blank for a missing or malformed end, never 'Invalid Date' or a crash", () => {
    expect(formatEndsAt(undefined)).toBe("");
    expect(formatEndsAt("soon")).toBe("");
    expect(formatEndsAt("2026-11-08T15:00:00")).toBe("");
  });
});
