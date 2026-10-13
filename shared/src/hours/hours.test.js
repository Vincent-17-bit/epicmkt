import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStatus, openingOnDate, tomorrowOpening, validateWeek, validateDay, mergedIntervals, normalizeHours, normalizeDay,
  copyDayToAll, hoursEqual, validateClosureMessage, validateOverride, extensionLimits, extendOverride, validatePartial,
  customUntil, MS_MIN, MS_HOUR, MS_DAY, STEP, WEEK, defaultHours, normalizeExceptions, fillMessageTemplate, partialPresets
} from "./index.js";

const at = (date, time = "00:00") => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, min) - 3 * MS_HOUR;
};
const day = (...intervals) => ({ closed: false, open24: false, intervals: intervals.map(([start, end]) => ({ start, end })) });
const shut = { closed: true, open24: false, intervals: [] };
const week = (over = {}) => ({ ...Object.fromEntries(WEEK.map((d) => [d, shut])), ...over });
const MON = "2026-10-12";
const TUE = "2026-10-13";
const SAT = "2026-10-17";
const SUN = "2026-10-18";

test("open inside an interval and reports the closing time", () => {
  const b = { hours: week({ mon: day(["09:00", "17:00"]) }) };
  const s = computeStatus(b, at(MON, "12:00"));
  assert.equal(s.state, "open");
  assert.equal(s.isOpen, true);
  assert.equal(s.nextChangeIso, new Date(at(MON, "17:00")).toISOString());
  assert.equal(s.detail, "Open until 5:00 PM");
});

test("closing soon within 30 minutes, with a countdown", () => {
  const b = { hours: week({ mon: day(["09:00", "17:00"]) }) };
  const s = computeStatus(b, at(MON, "16:20"));
  assert.equal(s.state, "open");
  assert.equal(s.detail, "Closes in 40 min");
  assert.equal(computeStatus(b, at(MON, "16:30")).state, "closing_soon");
  assert.equal(computeStatus(b, at(MON, "16:29")).state, "open");
  assert.equal(computeStatus(b, at(MON, "16:31")).detail, "Closes in 29 min");
  assert.equal(computeStatus(b, at(MON, "16:00")).state, "open");
  assert.equal(computeStatus(b, at(MON, "16:30")).detail, "Closes in 30 min");
});

test("end is exclusive and start is inclusive", () => {
  const b = { hours: week({ mon: day(["09:00", "17:00"]) }) };
  assert.equal(computeStatus(b, at(MON, "09:00")).isOpen, true);
  assert.equal(computeStatus(b, at(MON, "08:59")).isOpen, false);
  assert.equal(computeStatus(b, at(MON, "17:00")).isOpen, false);
  assert.equal(computeStatus(b, at(MON, "16:59")).isOpen, true);
});

test("a gap between intervals is a break and opens later the same day", () => {
  const b = { hours: week({ mon: day(["09:00", "13:00"], ["14:00", "18:00"]) }) };
  const s = computeStatus(b, at(MON, "13:30"));
  assert.equal(s.state, "opens_later");
  assert.equal(s.detail, "Closed until 2:00 PM");
  assert.equal(s.nextChangeIso, new Date(at(MON, "14:00")).toISOString());
  assert.equal(computeStatus(b, at(MON, "07:00")).state, "opens_later");
  assert.equal(computeStatus(b, at(MON, "19:00")).state, "closed");
});

test("adjacent intervals merge with no gap in between", () => {
  const b = { hours: week({ mon: day(["09:00", "12:00"], ["12:00", "15:00"]) }) };
  const s = computeStatus(b, at(MON, "12:00"));
  assert.equal(s.isOpen, true);
  assert.equal(s.nextChangeIso, new Date(at(MON, "15:00")).toISOString());
});

test("overnight intervals continue into the next day", () => {
  const b = { hours: week({ fri: day(["20:00", "02:00"]) }) };
  assert.equal(computeStatus(b, at("2026-10-16", "23:00")).isOpen, true);
  const s = computeStatus(b, at(SAT, "01:00"));
  assert.equal(s.isOpen, true);
  assert.equal(s.nextChangeIso, new Date(at(SAT, "02:00")).toISOString());
  assert.equal(computeStatus(b, at(SAT, "02:00")).isOpen, false);
});

test("an overnight tail merges with the next day's opening", () => {
  const b = { hours: week({ fri: day(["20:00", "02:00"]), sat: day(["02:00", "10:00"]) }) };
  const s = computeStatus(b, at(SAT, "00:30"));
  assert.equal(s.nextChangeIso, new Date(at(SAT, "10:00")).toISOString());
});

test("a closed exception cuts the previous day's overnight tail at midnight", () => {
  const b = { hours: week({ fri: day(["20:00", "02:00"]) }), exceptions: [{ date: SAT, closed: true, open24: false, intervals: [] }] };
  assert.equal(computeStatus(b, at(SAT, "00:30")).isOpen, false);
  assert.equal(computeStatus(b, at("2026-10-16", "23:30")).isOpen, true);
});

test("open 24 hours stays open with no next change", () => {
  const b = { hours: Object.fromEntries(WEEK.map((d) => [d, { closed: false, open24: true, intervals: [] }])) };
  const s = computeStatus(b, at(MON, "03:00"));
  assert.equal(s.state, "open");
  assert.equal(s.nextChangeIso, null);
  assert.equal(s.detail, "Open 24 hours");
});

test("open 24 hours on one day flows into a day that opens later", () => {
  const b = { hours: week({ mon: { closed: false, open24: true, intervals: [] }, tue: day(["00:00", "06:00"]) }) };
  assert.equal(computeStatus(b, at(MON, "12:00")).nextChangeIso, new Date(at(TUE, "06:00")).toISOString());
});

test("closed day reports the next opening day", () => {
  const b = { hours: week({ tue: day(["09:00", "17:00"]) }) };
  const s = computeStatus(b, at(MON, "10:00"));
  assert.equal(s.state, "closed");
  assert.equal(s.detail, "Closed until tomorrow 9:00 AM");
});

test("no hours at all is closed with no next change", () => {
  const s = computeStatus({ hours: week() }, at(MON, "10:00"));
  assert.equal(s.state, "closed");
  assert.equal(s.nextChangeIso, null);
  assert.equal(computeStatus({}, at(MON, "10:00")).state, "closed");
});

test("date exceptions replace the weekly hours for that date", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]) }),
    exceptions: [{ date: MON, closed: false, open24: false, intervals: [{ start: "12:00", end: "14:00" }] }]
  };
  assert.equal(computeStatus(b, at(MON, "10:00")).isOpen, false);
  assert.equal(computeStatus(b, at(MON, "13:00")).isOpen, true);
  const closed = { hours: b.hours, exceptions: [{ date: MON, closed: true, open24: false, intervals: [] }] };
  assert.equal(computeStatus(closed, at(MON, "10:00")).isOpen, false);
});

test("a temporary closure wins over the schedule and ends on time", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]) }),
    override: { type: "close", since: new Date(at(MON, "11:00")).toISOString(), until: new Date(at(MON, "12:00")).toISOString(), reason: "lunch", message: "Back soon" }
  };
  const s = computeStatus(b, at(MON, "11:20"));
  assert.equal(s.state, "closed_temporarily");
  assert.equal(s.isOpen, false);
  assert.equal(s.detail, "Closed until 12:00 PM");
  assert.equal(s.reason, "lunch");
  assert.equal(s.message, "Back soon");
  assert.equal(s.nextChangeIso, new Date(at(MON, "12:00")).toISOString());
  assert.equal(computeStatus(b, at(MON, "12:00")).state, "open");
  assert.equal(computeStatus(b, at(MON, "10:00")).state, "open");
});

test("a closure that outlasts the day reports the real next opening", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]), tue: day(["09:00", "17:00"]) }),
    override: { type: "close", since: new Date(at(MON, "16:00")).toISOString(), until: new Date(at(TUE, "08:00")).toISOString() }
  };
  const s = computeStatus(b, at(MON, "16:10"));
  assert.equal(s.state, "closed_temporarily");
  assert.equal(s.detail, "Closed until tomorrow 9:00 AM");
});

test("open late keeps the shop open past closing and reports the override end", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]) }),
    override: { type: "open", since: new Date(at(MON, "17:10")).toISOString(), until: new Date(at(MON, "19:00")).toISOString() }
  };
  const s = computeStatus(b, at(MON, "17:30"));
  assert.equal(s.state, "open");
  assert.equal(s.source, "override");
  assert.equal(s.nextChangeIso, new Date(at(MON, "19:00")).toISOString());
  assert.equal(computeStatus(b, at(MON, "19:00")).isOpen, false);
});

test("an expired or malformed override is ignored", () => {
  const hours = week({ mon: day(["09:00", "17:00"]) });
  const expired = { hours, override: { type: "close", since: new Date(at(MON, "08:00")).toISOString(), until: new Date(at(MON, "09:30")).toISOString() } };
  assert.equal(computeStatus(expired, at(MON, "10:00")).state, "open");
  assert.equal(computeStatus({ hours, override: { type: "weird", until: "x" } }, at(MON, "10:00")).state, "open");
  assert.equal(computeStatus({ hours, override: { type: "close", until: "not a date" } }, at(MON, "10:00")).state, "open");
});

test("ignoreOverride reads the pure schedule", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]) }),
    override: { type: "close", since: new Date(at(MON, "10:00")).toISOString(), until: new Date(at(MON, "12:00")).toISOString() }
  };
  assert.equal(computeStatus(b, at(MON, "10:30"), { ignoreOverride: true }).state, "open");
});

test("partial closures are listed while active and drop when they expire", () => {
  const b = {
    hours: week({ mon: day(["09:00", "17:00"]) }),
    partial_closures: [
      { scope: "delivery", until: new Date(at(MON, "16:00")).toISOString(), message: "Delivery paused until 4 PM" },
      { scope: "section", section: "Cakes", until: new Date(at(MON, "11:00")).toISOString(), message: "" },
      { scope: "nonsense", until: new Date(at(MON, "16:00")).toISOString() }
    ]
  };
  const s = computeStatus(b, at(MON, "12:00"));
  assert.equal(s.state, "open");
  assert.deepEqual(s.partials.map((p) => p.scope), ["delivery"]);
  assert.equal(computeStatus(b, at(MON, "10:00")).partials.length, 2);
  assert.equal(computeStatus(b, at(MON, "17:00")).partials.length, 0);
});

test("tomorrow's opening needs a real opening within 24 hours", () => {
  const b = { hours: week({ tue: day(["09:00", "17:00"]), mon: day(["09:00", "17:00"]) }) };
  assert.equal(tomorrowOpening(b, at(MON, "20:00")), at(TUE, "09:00"));
  assert.equal(tomorrowOpening(b, at(MON, "08:30")), null);
  assert.equal(tomorrowOpening({ hours: week({ mon: day(["09:00", "17:00"]) }) }, at(MON, "20:00")), null);
});

test("tomorrow's opening skips an overnight tail and uses the real opening", () => {
  const b = { hours: week({ mon: day(["20:00", "03:00"]), tue: day(["09:00", "17:00"]) }) };
  assert.equal(tomorrowOpening(b, at(MON, "21:00")), at(TUE, "09:00"));
});

test("tomorrow's opening respects exceptions", () => {
  const b = { hours: week({ tue: day(["09:00", "17:00"]) }), exceptions: [{ date: TUE, closed: true, open24: false, intervals: [] }] };
  assert.equal(tomorrowOpening(b, at(MON, "20:00")), null);
  assert.equal(openingOnDate(b, TUE, at(MON, "20:00")), null);
});

test("weekly validation: overlap, too many, same time, empty, step", () => {
  assert.equal(validateDay(day(["09:00", "13:00"], ["12:00", "15:00"])).some((p) => p.code === "overlap"), true);
  assert.equal(validateDay(day(["09:00", "13:00"], ["13:00", "15:00"])).length, 0);
  assert.equal(validateDay(day(["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"], ["16:00", "17:00"])).some((p) => p.code === "too_many"), true);
  assert.equal(validateDay(day(["08:00", "08:00"])).some((p) => p.code === "same_time"), true);
  assert.equal(validateDay(day()).some((p) => p.code === "empty"), true);
  assert.equal(validateDay(day(["08:03", "17:00"])).some((p) => p.code === "step"), true);
  assert.equal(validateDay(day(["", "17:00"])).some((p) => p.code === "invalid_time"), true);
  assert.equal(validateDay(shut).length, 0);
  assert.equal(validateDay({ closed: false, open24: true, intervals: [] }).length, 0);
});

test("overnight intervals are validated as spanning midnight", () => {
  assert.equal(validateDay(day(["22:00", "02:00"], ["23:00", "23:30"])).some((p) => p.code === "overlap"), true);
  assert.equal(validateDay(day(["22:00", "02:00"], ["01:00", "03:00"])).length, 0);
});

test("validateWeek reports per day and ok only when clean", () => {
  const bad = validateWeek(week({ mon: day(["09:00", "09:00"]) }));
  assert.equal(bad.ok, false);
  assert.equal(bad.days.mon.length, 1);
  assert.equal(validateWeek(defaultHours()).ok, true);
});

test("merged interval preview merges overlaps, adjacency and flags next-day ends", () => {
  assert.deepEqual(mergedIntervals(day(["09:00", "12:00"], ["11:00", "15:00"], ["15:00", "16:00"])).map((i) => [i.start, i.end]), [["09:00", "16:00"]]);
  const overnight = mergedIntervals(day(["22:00", "02:00"]));
  assert.equal(overnight[0].endsNextDay, true);
  assert.equal(overnight[0].end, "02:00");
  assert.equal(mergedIntervals({ closed: false, open24: true, intervals: [] }).length, 1);
  assert.equal(mergedIntervals(shut).length, 0);
});

test("legacy [open, close] pairs and nulls normalise", () => {
  assert.deepEqual(normalizeDay(["09:00", "17:00"]), { closed: false, open24: false, intervals: [{ start: "09:00", end: "17:00" }] });
  assert.equal(normalizeDay(null).closed, true);
  const h = normalizeHours({ mon: ["09:00", "17:00"] });
  assert.equal(Object.keys(h).length, 7);
  assert.equal(h.tue.closed, true);
});

test("copy Monday to all clones the day without sharing references", () => {
  const h = week({ mon: day(["09:00", "17:00"]) });
  const copy = copyDayToAll(h, "mon");
  assert.equal(copy.sun.intervals[0].start, "09:00");
  copy.sun.intervals[0].start = "10:00";
  assert.equal(copy.mon.intervals[0].start, "09:00");
  assert.equal(hoursEqual(h, normalizeHours(h)), true);
  assert.equal(hoursEqual(h, copy), false);
});

test("message validator rejects links, emails, phone numbers and long text", () => {
  const code = (t) => validateClosureMessage(t).code;
  assert.equal(code("Back soon"), null);
  assert.equal(code(""), null);
  assert.equal(code("Back at 3:00 PM, thank you!"), null);
  assert.equal(code("Closed 12.10.2026"), null);
  assert.equal(code("Price KSh 1500 only"), null);
  assert.equal(code("see https://shop.example"), "link");
  assert.equal(code("visit www.shop.co.ke"), "link");
  assert.equal(code("order at shop.com"), "link");
  assert.equal(code("wa.me/254712345678"), "link");
  assert.equal(code("mail me a@b.co"), "email");
  assert.equal(code("call 0712345678"), "phone");
  assert.equal(code("call 0712 345 678"), "phone");
  assert.equal(code("call +254 712-345-678"), "phone");
  assert.equal(code("call (0712) 345.678"), "phone");
  assert.equal(code("x".repeat(81)), "too_long");
  assert.equal(code("x".repeat(80)), null);
  assert.equal(validateClosureMessage("  spaced   out  ").text, "spaced out");
  assert.match(validateClosureMessage("https://a.com").message, /Links/);
});

test("override validation covers type, past, 24 hour cap, reason and message", () => {
  const now = at(MON, "10:00");
  const base = { type: "close", until: new Date(now + MS_HOUR).toISOString(), reason: "lunch", message: "Back soon" };
  assert.equal(validateOverride(base, now).ok, true);
  assert.equal(validateOverride({ ...base, type: "x" }, now).code, "type");
  assert.equal(validateOverride({ ...base, until: new Date(now - MS_MIN).toISOString() }, now).code, "past");
  assert.equal(validateOverride({ ...base, until: new Date(now + MS_DAY).toISOString() }, now).ok, true);
  assert.equal(validateOverride({ ...base, until: new Date(now + MS_DAY + MS_MIN).toISOString() }, now).code, "too_long");
  assert.equal(validateOverride({ ...base, reason: "party" }, now).code, "reason");
  assert.equal(validateOverride({ ...base, message: "call 0712345678" }, now).code, "message_phone");
  assert.equal(validateOverride({ ...base, until: "nope" }, now).code, "until");
});

test("extend respects the 24 hour total from the original start", () => {
  const now = at(MON, "10:00");
  const o = { type: "close", since: new Date(now - 2 * MS_HOUR).toISOString(), until: new Date(now + 21 * MS_HOUR).toISOString() };
  const lim = extensionLimits(o, now);
  assert.equal(lim.remainingMinutes, 60);
  assert.equal(extendOverride(o, 30 * MS_MIN, now).ok, true);
  assert.equal(extendOverride(o, MS_HOUR, now).ok, true);
  assert.equal(extendOverride(o, MS_HOUR + 5 * MS_MIN, now).code, "too_long");
  const full = { ...o, until: new Date(now + 22 * MS_HOUR).toISOString() };
  assert.equal(extensionLimits(full, now).canExtend, false);
});

test("custom time resolves to the next occurrence within 24 hours", () => {
  const now = at(MON, "10:00");
  assert.equal(customUntil("11:30", now), at(MON, "11:30"));
  assert.equal(customUntil("09:30", now), at(TUE, "09:30"));
  assert.equal(customUntil("10:00", now), at(TUE, "10:00"));
  assert.equal(customUntil("nope", now), null);
});

test("partial closure validation: scope, section, 7 day cap, message", () => {
  const now = at(MON, "10:00");
  const ok = { scope: "delivery", until: new Date(now + MS_HOUR).toISOString(), message: "Delivery paused until 4 PM" };
  assert.equal(validatePartial(ok, now).ok, true);
  assert.equal(validatePartial({ ...ok, scope: "x" }, now).code, "scope");
  assert.equal(validatePartial({ ...ok, scope: "section" }, now).code, "section");
  assert.equal(validatePartial({ ...ok, scope: "section", section: "Cakes" }, now).value.section, "Cakes");
  assert.equal(validatePartial({ ...ok, until: new Date(now + 7 * MS_DAY).toISOString() }, now).ok, true);
  assert.equal(validatePartial({ ...ok, until: new Date(now + 7 * MS_DAY + MS_MIN).toISOString() }, now).code, "too_long");
  assert.equal(validatePartial({ ...ok, message: "mail a@b.co" }, now).code, "message_email");
  assert.equal(validatePartial({ ...ok, until: new Date(now - 1).toISOString() }, now).code, "past");
});

test("message templates fill the time and presets are ordered", () => {
  const now = at(MON, "10:00");
  assert.equal(fillMessageTemplate("Delivery paused until {time}", at(MON, "16:00"), now), "Delivery paused until 4:00 PM");
  const presets = partialPresets(now);
  assert.deepEqual(presets.map((p) => p.key), ["1h", "4h", "today", "tomorrow"]);
  assert.ok(presets.every((p, i) => i === 0 || p.until > presets[i - 1].until));
});

test("exceptions normalise: invalid dates dropped, duplicates removed, sorted", () => {
  const list = normalizeExceptions([
    { date: "2026-12-25", closed: true },
    { date: "2026-02-30", closed: true },
    { date: "2026-12-25", closed: false },
    { date: "2026-11-01", closed: true, note: "Holiday" }
  ]);
  assert.deepEqual(list.map((e) => e.date), ["2026-11-01", "2026-12-25"]);
  assert.equal(STEP, 5);
  assert.equal(MS_DAY, 24 * MS_HOUR);
});

test("an override that started a moment after the rendered clock still applies immediately", () => {
  const hours = week({ mon: day(["09:00", "17:00"]) });
  const lag = at(MON, "18:00");
  const since = lag + 10000;
  const open = computeStatus({ hours, override: { type: "open", since: new Date(since).toISOString(), until: new Date(since + MS_HOUR).toISOString() } }, lag);
  assert.equal(open.state, "open");
  assert.equal(open.source, "override");
  const shut = computeStatus({ hours, override: { type: "close", since: new Date(at(MON, "12:00") + 10000).toISOString(), until: new Date(at(MON, "13:00")).toISOString() } }, at(MON, "12:00"));
  assert.equal(shut.state, "closed_temporarily");
});
