import { test } from "node:test";
import assert from "node:assert/strict";
import { businessStatus, statusOf } from "./openState.js";
import { breaksOn, hoursRowsFor, isOpenOn } from "./utils.js";
import { validateException } from "./seller/exceptions.js";
import { zonedTimeToUtc } from "./time.js";

const Z = "Africa/Nairobi";
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weekly = (slot, days = WEEK) => Object.fromEntries(days.map((d) => [d, slot]));
const at = (zone, y, mo, d, h, mi = 0) => zonedTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, zone);
const brk = (extra = {}) => ({ id: "b", kind: "break", date: "2026-11-02", intervals: [["13:00", "14:00"]], note: null, ...extra });
const MON = (h, mi = 0) => at(Z, 2026, 11, 2, h, mi);

test("a full-day shop closed the next day closes at midnight, not 11:59 PM", () => {
  const hours = { sat: ["00:00", "23:59"] };
  const now = at(Z, 2026, 11, 7, 20, 0);
  assert.equal(businessStatus(hours, [], now, Z).closesAt, "00:00");
  assert.equal(statusOf(hours, [], now, Z).closes, "Closes midnight EAT");
  assert.equal(statusOf(hours, [], now, Z, "America/New_York").closes, "Closes midnight EAT · Sat 4:00 PM EST");
  const both = { sat: ["00:00", "23:59"], sun: ["00:00", "23:59"] };
  assert.equal(statusOf(both, [], now, Z).closes, null);
});

test("a break closes only its own window and the shop returns to its normal hours", () => {
  const hours = weekly(["09:00", "18:00"]);
  const ex = [brk()];
  const open = (h, mi) => isOpenOn(hours, ex, MON(h, mi), Z);
  assert.deepEqual([open(8, 59), open(9, 0), open(12, 59), open(13, 0), open(13, 59), open(14, 0), open(17, 59), open(18, 0)], [false, true, true, false, false, true, true, false]);
  assert.equal(isOpenOn(hours, ex, at(Z, 2026, 11, 3, 13, 30), Z), true, "the next day is untouched");
});

test("before the break the chip says when it closes, during it says on break and when it reopens", () => {
  const hours = weekly(["09:00", "18:00"]);
  const ex = [brk()];
  const before = statusOf(hours, ex, MON(12, 0), Z);
  assert.equal(before.isOpen, true);
  assert.equal(before.closes, "Closes 1:00 PM EAT");
  const during = statusOf(hours, ex, MON(13, 30), Z);
  assert.equal(during.isOpen, false);
  assert.equal(during.headline, "Closed");
  assert.equal(during.reason.kind, "on_break");
  assert.equal(during.reasonText, "On break");
  assert.equal(during.reopens, "Reopens at 2:00 PM EAT");
  assert.equal(during.line, "On break · Reopens at 2:00 PM EAT");
  assert.deepEqual(during.opensAt, { day: "mon", time: "14:00", date: "2026-11-02" });
  const after = statusOf(hours, ex, MON(14, 30), Z);
  assert.equal(after.isOpen, true);
  assert.equal(after.closes, "Closes 6:00 PM EAT");
  assert.equal(after.reason, null);
});

test("the seller's note replaces the words on break, and an overseas viewer also gets their own time", () => {
  const hours = weekly(["09:00", "18:00"]);
  const ex = [brk({ note: "Lunch" })];
  assert.equal(statusOf(hours, ex, MON(13, 30), Z).line, "Lunch · Reopens at 2:00 PM EAT");
  const far = statusOf(hours, [brk({ date: "2026-10-26" })], at(Z, 2026, 10, 26, 13, 30), Z, "America/New_York");
  assert.equal(far.line, "On break · Reopens at 2:00 PM EAT · 7:00 AM EDT");
});

test("a break running to closing time reopens tomorrow", () => {
  const hours = weekly(["09:00", "18:00"]);
  const s = statusOf(hours, [brk({ intervals: [["17:00", "18:00"]] })], MON(17, 30), Z);
  assert.equal(s.isOpen, false);
  assert.equal(s.line, "On break · Reopens tomorrow at 9:00 AM EAT");
});

test("a break outside the normal hours changes nothing and is never called a break", () => {
  const hours = weekly(["09:00", "18:00"], ["mon"]);
  const ex = [brk({ intervals: [["19:00", "20:00"]] })];
  const s = statusOf(hours, ex, MON(19, 30), Z);
  assert.equal(s.reason.kind, "outside_hours");
  const sun = statusOf(hours, [brk({ date: "2026-11-01", intervals: [["12:00", "13:00"]] })], at(Z, 2026, 11, 1, 12, 30), Z);
  assert.equal(sun.reason.kind, "day_off");
});

test("several days in a row, and only those days", () => {
  const hours = weekly(["09:00", "18:00"]);
  const ex = [brk({ date: "2026-11-02", until: "2026-11-04" })];
  const open = (d) => isOpenOn(hours, ex, at(Z, 2026, 11, d, 13, 30), Z);
  assert.deepEqual([open(1), open(2), open(3), open(4), open(5)], [true, false, false, false, true]);
});

test("every week on chosen days, from a start date, with or without an end", () => {
  const hours = weekly(["09:00", "18:00"]);
  const ex = [brk({ date: "2026-11-02", weekdays: ["mon", "wed"] })];
  const open = (d) => isOpenOn(hours, ex, at(Z, 2026, 11, d, 13, 30), Z);
  assert.deepEqual([open(2), open(3), open(4), open(9), open(11), open(12)], [false, true, false, false, false, true]);
  assert.equal(isOpenOn(hours, ex, at(Z, 2026, 10, 26, 13, 30), Z), true, "not before the start date");
  assert.equal(isOpenOn(hours, ex, at(Z, 2027, 3, 1, 13, 30), Z), false, "no end date keeps repeating");
  const ended = [brk({ date: "2026-11-02", until: "2026-11-09", weekdays: ["mon"] })];
  assert.equal(isOpenOn(hours, ended, at(Z, 2026, 11, 9, 13, 30), Z), false);
  assert.equal(isOpenOn(hours, ended, at(Z, 2026, 11, 16, 13, 30), Z), true);
});

test("two breaks on one day both apply, and a closed day or special hours day ignore breaks", () => {
  const hours = weekly(["09:00", "18:00"]);
  const two = [brk(), brk({ id: "c", intervals: [["16:00", "16:30"]] })];
  const open = (h, mi) => isOpenOn(hours, two, MON(h, mi), Z);
  assert.deepEqual([open(13, 30), open(15, 0), open(16, 10), open(16, 30)], [false, true, false, true]);
  const closed = [brk(), { id: "x", kind: "closed", date: "2026-11-02", intervals: [], note: null }];
  assert.equal(statusOf(hours, closed, MON(15, 0), Z).reason.kind, "closed_day");
  const special = [brk(), { id: "s", kind: "special", date: "2026-11-02", intervals: [["10:00", "17:00"]], note: null }];
  assert.equal(isOpenOn(hours, special, MON(13, 30), Z), true, "special hours are taken exactly as typed");
});

test("a daily break also cuts the after-midnight part of an overnight shift", () => {
  const hours = { sun: ["20:00", "02:00"] };
  const ex = [brk({ date: "2026-11-01", weekdays: ["sun", "mon"], intervals: [["23:00", "23:30"], ["01:00", "01:30"]] })];
  const open = (d, h, mi) => isOpenOn(hours, ex, at(Z, 2026, 11, d, h, mi), Z);
  assert.deepEqual([open(1, 22, 59), open(1, 23, 0), open(1, 23, 29), open(1, 23, 30), open(2, 0, 30), open(2, 1, 0), open(2, 1, 29), open(2, 1, 30), open(2, 2, 0)], [true, false, false, true, true, false, false, true, false]);
  const s = statusOf(hours, ex, at(Z, 2026, 11, 1, 23, 10), Z);
  assert.equal(s.line, "On break · Reopens at 11:30 PM EAT");
});

test("a 24-hour shop with a break is open again after it and loses the all-day wording", () => {
  const hours = weekly(["00:00", "23:59"]);
  const ex = [brk({ intervals: [["03:00", "04:00"]] })];
  assert.equal(statusOf(hours, ex, MON(3, 30), Z).line, "On break · Reopens at 4:00 AM EAT");
  const after = statusOf(hours, ex, MON(5, 0), Z);
  assert.equal(after.isOpen, true);
  assert.equal(after.closes, null);
});

test("breaksOn lists the windows that apply to a date, in time order, and none on a special day", () => {
  const ex = [brk({ intervals: [["15:00", "15:30"], ["13:00", "14:00"]] })];
  assert.deepEqual(breaksOn(ex, "2026-11-02").map((b) => [b.from, b.to]), [["13:00", "14:00"], ["15:00", "15:30"]]);
  assert.deepEqual(breaksOn(ex, "2026-11-03"), []);
  assert.deepEqual(breaksOn([...ex, { kind: "special", date: "2026-11-02", intervals: [["10:00", "12:00"]] }], "2026-11-02"), []);
});

test("the hours table keeps the day's hours and lists the break under them, in the viewer's time too", () => {
  const hours = weekly(["09:00", "18:00"]);
  const now = at(Z, 2026, 10, 26, 8, 0);
  const rows = hoursRowsFor(hours, [brk({ date: "2026-10-27" })], now, Z, "America/New_York");
  const tue = rows.find((r) => r.date === "2026-10-27");
  assert.equal(tue.text, "9:00 AM to 6:00 PM");
  assert.equal(tue.changed, false);
  assert.deepEqual(tue.breaks.map((b) => b.text), ["1:00 PM to 2:00 PM"]);
  assert.equal(tue.breaks[0].viewerText, "6:00 AM to 7:00 AM");
  assert.deepEqual(rows.find((r) => r.date === "2026-10-28").breaks, []);
});

test("validation: a break needs 1 to 3 same-day windows, and a sensible range or weekday list", () => {
  const today = "2026-11-02";
  const ok = (v) => validateException({ date: "2026-11-03", kind: "break", intervals: [["13:00", "14:00"]], note: "", ...v }, today);
  assert.deepEqual(ok({}).value, { date: "2026-11-03", kind: "break", intervals: [["13:00", "14:00"]], note: null, until: null, weekdays: null });
  assert.equal(ok({ intervals: [] }).error, "intervals_required");
  assert.equal(ok({ intervals: [["13:00", "13:00"]] }).error, "break_order");
  assert.equal(ok({ intervals: [["15:00", "14:00"]] }).error, "break_order");
  assert.equal(ok({ intervals: [["13:00", "14:00"], ["13:30", "15:00"]] }).error, "intervals_overlap");
  assert.equal(ok({ intervals: [["01:00", "02:00"], ["03:00", "04:00"], ["05:00", "06:00"], ["07:00", "08:00"]] }).error, "too_many_intervals");
  assert.equal(ok({ intervals: [["1pm", "14:00"]] }).error, "invalid_time");
  assert.equal(ok({ until: "2026-11-05" }).value.until, "2026-11-05");
  assert.equal(ok({ until: "2026-11-02" }).error, "until_before_date");
  assert.equal(ok({ until: "2029-01-01" }).error, "date_too_far");
  assert.equal(ok({ weekdays: [] }).error, "invalid_weekdays");
  assert.equal(ok({ weekdays: ["fri", "mon", "mon"] }).value.weekdays.join(), "mon,fri");
  assert.equal(ok({ weekdays: ["funday"] }).error, "invalid_weekdays");
  assert.equal(ok({ date: "2026-11-01" }).error, "date_in_past");
  const closed = validateException({ date: "2026-11-03", kind: "closed", intervals: [], note: "", until: "2026-11-09", weekdays: ["mon"] }, today);
  assert.deepEqual(closed.value, { date: "2026-11-03", kind: "closed", intervals: [], note: null });
});
