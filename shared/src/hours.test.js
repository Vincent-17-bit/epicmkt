import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LENGTH, computeStatus, isOpenState, nairobiNow, validateOverride } from "./hours.js";

const eat = (date, time) => new Date(`${date}T${time}:00+03:00`).toISOString();
const iv = (start, end) => ({ start, end });
const allDay = [iv("00:00", "24:00")];
const run = (schedule, date, time) => computeStatus(schedule, eat(date, time));

describe("merging", () => {
  const schedule = { hours: { sun: allDay, mon: allDay, tue: [] } };

  it("merges Sunday and Monday 00:00-24:00 so the next change is Tuesday 00:00", () => {
    const status = run(schedule, "2026-11-08", "14:00");
    expect(status.state).toBe("open");
    expect(status.nextChangeIso).toBe(eat("2026-11-10", "00:00"));
    expect(status.untilIso).toBe(eat("2026-11-10", "00:00"));
  });

  it("is closing soon only in the last hour of the merged run", () => {
    expect(run(schedule, "2026-11-09", "22:59").state).toBe("open");
    expect(run(schedule, "2026-11-09", "23:00").state).toBe("closing_soon");
  });

  it("merges an interval that ends at midnight with one that starts at midnight", () => {
    const week = { hours: { fri: [iv("18:00", "24:00")], sat: [iv("00:00", "02:00")] } };
    const status = run(week, "2026-11-06", "23:30");
    expect(status.nextChangeIso).toBe(eat("2026-11-07", "02:00"));
  });

  it("merges contiguous intervals on one day", () => {
    const week = { hours: { mon: [iv("08:00", "12:00"), iv("12:00", "17:00")] } };
    expect(run(week, "2026-11-09", "11:30").nextChangeIso).toBe(eat("2026-11-09", "17:00"));
  });

  it("keeps a gap between separate intervals", () => {
    const week = { hours: { mon: [iv("08:00", "12:00"), iv("14:00", "17:00")] } };
    const midday = run(week, "2026-11-09", "12:30");
    expect(midday.state).toBe("opens_later");
    expect(midday.untilIso).toBe(eat("2026-11-09", "14:00"));
    expect(run(week, "2026-11-09", "09:00").nextChangeIso).toBe(eat("2026-11-09", "12:00"));
  });
});

describe("override", () => {
  const schedule = {
    hours: { sun: allDay, mon: allDay, tue: [] },
    override: { type: "closed", startsAt: eat("2026-11-08", "14:00"), endsAt: eat("2026-11-08", "18:00"), reason: "Stocktake", message: "Back with fresh stock" }
  };

  it("closes temporarily until the end of the override", () => {
    const status = run(schedule, "2026-11-08", "15:00");
    expect(status).toEqual({
      state: "closed_temporarily",
      untilIso: eat("2026-11-08", "18:00"),
      nextChangeIso: eat("2026-11-08", "18:00"),
      reason: "Stocktake",
      message: "Back with fresh stock"
    });
  });

  it("is open again at the exact end instant", () => {
    const status = computeStatus(schedule, eat("2026-11-08", "18:00"));
    expect(status.state).toBe("open");
    expect(status.reason).toBeUndefined();
    expect(computeStatus(schedule, new Date(Date.parse(eat("2026-11-08", "18:00")) - 1)).state).toBe("closed_temporarily");
  });

  it("is open before the override starts, with the start as the closing time", () => {
    const status = run(schedule, "2026-11-08", "10:00");
    expect(status.state).toBe("open");
    expect(status.untilIso).toBe(eat("2026-11-08", "14:00"));
  });

  it("ignores an expired override", () => {
    const expired = { ...schedule, override: { ...schedule.override, startsAt: eat("2026-11-07", "14:00"), endsAt: eat("2026-11-07", "18:00") } };
    const status = run(expired, "2026-11-08", "15:00");
    expect(status.state).toBe("open");
    expect(status.nextChangeIso).toBe(eat("2026-11-10", "00:00"));
    expect(status.reason).toBeUndefined();
  });

  it("returns the next weekly opening when the schedule is closed after the override ends", () => {
    const week = {
      hours: { tue: [iv("08:00", "16:00")], wed: [iv("08:00", "16:00")] },
      override: { type: "closed", startsAt: eat("2026-11-10", "12:00"), endsAt: eat("2026-11-10", "20:00") }
    };
    const status = run(week, "2026-11-10", "13:00");
    expect(status.state).toBe("closed_temporarily");
    expect(status.nextChangeIso).toBe(eat("2026-11-10", "20:00"));
    expect(status.untilIso).toBe(eat("2026-11-11", "08:00"));
  });

  it("gives plain closed with the next weekly opening when the weekly schedule is closed", () => {
    const week = {
      hours: { tue: [], wed: [iv("08:00", "17:00")] },
      override: { type: "closed", startsAt: eat("2026-11-10", "14:00"), endsAt: eat("2026-11-10", "18:00"), reason: "Away" }
    };
    const status = run(week, "2026-11-10", "15:00");
    expect(status.state).toBe("closed");
    expect(status.untilIso).toBe(eat("2026-11-11", "08:00"));
    expect(status.reason).toBeUndefined();
  });

  it("opens outside the schedule for an open-late override", () => {
    const week = {
      hours: { mon: [iv("08:00", "17:00")] },
      override: { type: "open", startsAt: eat("2026-11-09", "17:00"), endsAt: eat("2026-11-09", "20:00"), reason: "Late night", message: "Open late tonight" }
    };
    const late = run(week, "2026-11-09", "18:00");
    expect(late).toMatchObject({ state: "open", untilIso: eat("2026-11-09", "20:00"), reason: "Late night", message: "Open late tonight" });
    expect(run(week, "2026-11-09", "19:30").state).toBe("closing_soon");
    expect(run(week, "2026-11-09", "20:00").state).toBe("closed");
  });

  it("opens a day that the schedule has closed", () => {
    const week = { hours: { tue: [] }, override: { type: "open", startsAt: eat("2026-11-10", "10:00"), endsAt: eat("2026-11-10", "14:00") } };
    expect(run(week, "2026-11-10", "11:00")).toMatchObject({ state: "open", untilIso: eat("2026-11-10", "14:00") });
  });
});

describe("priority", () => {
  const weekly = { mon: [iv("08:00", "17:00")] };

  it("lets a date exception beat the weekly schedule", () => {
    const closed = { hours: weekly, exceptions: [{ date: "2026-11-09", closed: true }] };
    expect(run(closed, "2026-11-09", "12:00").state).toBe("closed");
    const short = { hours: weekly, exceptions: [{ date: "2026-11-09", intervals: [iv("10:00", "12:00")] }] };
    expect(run(short, "2026-11-09", "11:00").nextChangeIso).toBe(eat("2026-11-09", "12:00"));
    expect(run(short, "2026-11-09", "13:00").state).toBe("closed");
    expect(run(short, "2026-11-16", "13:00").state).toBe("open");
  });

  it("opens a weekly-closed day through an exception", () => {
    const open = { hours: {}, exceptions: [{ date: "2026-11-10", intervals: [iv("09:00", "13:00")], note: "Holiday hours" }] };
    expect(run(open, "2026-11-10", "10:00").state).toBe("open");
  });

  it("lets an override beat an exception", () => {
    const closedDay = {
      hours: weekly,
      exceptions: [{ date: "2026-11-09", closed: true }],
      override: { type: "open", startsAt: eat("2026-11-09", "11:00"), endsAt: eat("2026-11-09", "15:00") }
    };
    expect(run(closedDay, "2026-11-09", "12:00").state).toBe("open");
    const openDay = {
      hours: weekly,
      exceptions: [{ date: "2026-11-09", intervals: [iv("08:00", "20:00")] }],
      override: { type: "closed", startsAt: eat("2026-11-09", "11:00"), endsAt: eat("2026-11-09", "15:00") }
    };
    expect(run(openDay, "2026-11-09", "12:00").state).toBe("closed_temporarily");
  });
});

describe("overnight", () => {
  const week = { hours: { fri: [iv("18:00", "02:00")] } };

  it("is open on Saturday 01:00 until 02:00 when Friday runs 18:00 to 02:00", () => {
    const status = run(week, "2026-11-07", "01:00");
    expect(status.state).toBe("closing_soon");
    expect(status.untilIso).toBe(eat("2026-11-07", "02:00"));
    expect(run(week, "2026-11-07", "02:00").state).toBe("closed");
  });

  it("is open on Friday evening with the closing time on Saturday", () => {
    const status = run(week, "2026-11-06", "20:00");
    expect(status.state).toBe("open");
    expect(status.untilIso).toBe(eat("2026-11-07", "02:00"));
  });
});

describe("closing soon", () => {
  const week = { hours: { mon: [iv("08:00", "17:00")] } };

  it("is closing soon at 45 minutes, open at 61", () => {
    expect(run(week, "2026-11-09", "16:15").state).toBe("closing_soon");
    expect(run(week, "2026-11-09", "15:59").state).toBe("open");
  });

  it("is closing soon at exactly 60 minutes and not after closing", () => {
    expect(run(week, "2026-11-09", "16:00").state).toBe("closing_soon");
    expect(run(week, "2026-11-09", "17:00").state).not.toBe("closing_soon");
  });
});

describe("closed states", () => {
  const week = { hours: { mon: [iv("08:00", "17:00")], tue: [], wed: [iv("09:00", "13:00")] } };

  it("is opens_later before opening on a day with hours", () => {
    const status = run(week, "2026-11-09", "06:00");
    expect(status).toEqual({ state: "opens_later", untilIso: eat("2026-11-09", "08:00"), nextChangeIso: eat("2026-11-09", "08:00") });
  });

  it("is closed with the next opening on another day", () => {
    const status = run(week, "2026-11-09", "18:00");
    expect(status.state).toBe("closed");
    expect(status.untilIso).toBe(eat("2026-11-11", "09:00"));
  });

  it("has no times without any schedule", () => {
    expect(run({}, "2026-11-09", "12:00")).toEqual({ state: "closed", untilIso: null, nextChangeIso: null });
    expect(run({ hours: { mon: null } }, "2026-11-09", "12:00").state).toBe("closed");
  });

  it("has no change when open every hour of every day", () => {
    const always = { hours: Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((d) => [d, allDay])) };
    expect(run(always, "2026-11-09", "12:00")).toEqual({ state: "open", untilIso: null, nextChangeIso: null });
  });
});

describe("Africa/Nairobi time", () => {
  it("reads 2026-11-07T21:30:00Z as 00:30 on Sunday", () => {
    expect(nairobiNow(new Date("2026-11-07T21:30:00Z"))).toEqual({ day: "sun", minutes: 30 });
    const week = { hours: { sat: allDay, sun: [iv("00:00", "02:00")] } };
    const status = computeStatus(week, "2026-11-07T21:30:00Z");
    expect(status.state).toBe("open");
    expect(status.untilIso).toBe("2026-11-07T23:00:00.000Z");
  });

  it("uses Sunday's closed schedule at that instant", () => {
    const week = { hours: { sat: allDay, sun: [iv("08:00", "12:00")] } };
    const status = computeStatus(week, "2026-11-07T21:30:00Z");
    expect(status.state).toBe("opens_later");
    expect(status.untilIso).toBe("2026-11-08T05:00:00.000Z");
  });

  it("accepts a Date, a number or an ISO string", () => {
    const week = { hours: { mon: [iv("08:00", "17:00")] } };
    const iso = eat("2026-11-09", "12:00");
    const expected = computeStatus(week, iso);
    expect(computeStatus(week, new Date(iso))).toEqual(expected);
    expect(computeStatus(week, Date.parse(iso))).toEqual(expected);
    expect(() => computeStatus(week, "nope")).toThrow(TypeError);
  });
});

describe("legacy one-slot shape", () => {
  it("matches the interval shape", () => {
    const legacy = { hours: { mon: ["08:00", "17:00"], tue: null } };
    const modern = { hours: { mon: [iv("08:00", "17:00")], tue: [] } };
    for (const time of ["06:00", "08:00", "12:00", "16:30", "17:00", "20:00"]) {
      expect(run(legacy, "2026-11-09", time)).toEqual(run(modern, "2026-11-09", time));
    }
  });

  it("treats missing optional fields as empty", () => {
    expect(computeStatus({ hours: { mon: ["08:00", "17:00"] }, exceptions: undefined, override: undefined }, eat("2026-11-09", "12:00")).state).toBe("open");
  });
});

describe("validateOverride", () => {
  const start = eat("2026-11-09", "10:00");
  const valid = { type: "closed", startsAt: start, endsAt: eat("2026-11-09", "14:00"), reason: "Away", message: "Back at 2 PM" };
  const codes = (override) => validateOverride(override).errors.map((e) => e.code);

  it("accepts a valid override and exactly 24 hours", () => {
    expect(validateOverride(valid).ok).toBe(true);
    expect(validateOverride({ ...valid, endsAt: eat("2026-11-10", "10:00") }).ok).toBe(true);
  });

  it("rejects an override longer than 24 hours", () => {
    expect(codes({ ...valid, endsAt: eat("2026-11-10", "10:01") })).toContain("too_long");
  });

  it("rejects an end before the start and a bad type", () => {
    expect(codes({ ...valid, endsAt: eat("2026-11-09", "09:00") })).toContain("range");
    expect(codes({ ...valid, type: "paused" })).toContain("type");
  });

  it("rejects phone numbers in the message", () => {
    expect(codes({ ...valid, message: "Call 0712 345 678" })).toContain("message_phone");
    expect(codes({ ...valid, message: "WhatsApp +254712345678" })).toContain("message_phone");
    expect(codes({ ...valid, message: "Call 0712-345-678 now" })).toContain("message_phone");
  });

  it("rejects links in the message", () => {
    expect(codes({ ...valid, message: "See https://example.com" })).toContain("message_link");
    expect(codes({ ...valid, message: "Visit www.shop.co.ke" })).toContain("message_link");
    expect(codes({ ...valid, message: "Order at shop.com today" })).toContain("message_link");
  });

  it("limits the message to 80 characters", () => {
    expect(validateOverride({ ...valid, message: "a".repeat(MESSAGE_MAX_LENGTH) }).ok).toBe(true);
    expect(codes({ ...valid, message: "a".repeat(MESSAGE_MAX_LENGTH + 1) })).toContain("message_length");
  });

  it("allows times and short numbers in the message", () => {
    expect(validateOverride({ ...valid, message: "Back at 3:00 PM, 2 staff on leave" }).ok).toBe(true);
  });

  it("is ignored by computeStatus when longer than 24 hours", () => {
    const long = { hours: { mon: allDay }, override: { ...valid, endsAt: eat("2026-11-11", "10:00") } };
    expect(run(long, "2026-11-09", "12:00").state).toBe("open");
  });

  it("drops an unsafe message but keeps the closure", () => {
    const unsafe = { hours: { mon: allDay }, override: { ...valid, message: "Call 0712345678" } };
    const status = run(unsafe, "2026-11-09", "12:00");
    expect(status.state).toBe("closed_temporarily");
    expect(status.message).toBeUndefined();
    expect(status.reason).toBe("Away");
  });
});

describe("isOpenState", () => {
  it("is true for open and closing_soon only", () => {
    expect(["open", "closing_soon"].every(isOpenState)).toBe(true);
    expect(["closed", "closed_temporarily", "opens_later"].some(isOpenState)).toBe(false);
  });
});
