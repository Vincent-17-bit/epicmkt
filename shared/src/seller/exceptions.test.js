import { test } from "node:test";
import assert from "node:assert/strict";
import { EXCEPTION_LIMIT, addDays, dayLabel, describeException, isRealDate, upcomingExceptions, validateException } from "./exceptions.js";

const today = "2026-10-12";
const v = (o) => validateException({ date: "2026-10-20", kind: "closed", intervals: [], note: null, ...o }, today);

test("dates: real calendar days only, labelled with the weekday", () => {
  assert.equal(isRealDate("2026-02-28"), true);
  assert.equal(isRealDate("2026-02-30"), false);
  assert.equal(isRealDate("2026-2-3"), false);
  assert.equal(dayLabel("2026-12-25"), "Fri 25 Dec 2026");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("upcoming: past dates are hidden, today stays, soonest first", () => {
  const list = [{ date: "2026-11-01" }, { date: "2026-10-11" }, { date: "2026-10-12" }, { date: "2026-10-30" }];
  assert.deepEqual(upcomingExceptions(list, today).map((e) => e.date), ["2026-10-12", "2026-10-30", "2026-11-01"]);
  assert.deepEqual(upcomingExceptions(null, today), []);
});

test("closed all day: intervals are ignored and the note is trimmed", () => {
  assert.deepEqual(v({ intervals: [["09:00", "10:00"]], note: "  Holiday " }), { ok: true, value: { date: "2026-10-20", kind: "closed", intervals: [], note: "Holiday" } });
  assert.equal(v({ note: "   " }).value.note, null);
});

test("special hours: sorted intervals, at most 3, no overlap, start before end", () => {
  assert.deepEqual(v({ kind: "special", intervals: [["14:00", "18:00"], ["08:00", "12:00"]] }).value.intervals, [["08:00", "12:00"], ["14:00", "18:00"]]);
  assert.equal(v({ kind: "special", intervals: [] }).error, "intervals_required");
  assert.equal(v({ kind: "special", intervals: [["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]] }).error, "too_many_intervals");
  assert.equal(v({ kind: "special", intervals: [["9:00", "10:00"]] }).error, "invalid_time");
  assert.equal(v({ kind: "special", intervals: [["", ""]] }).error, "invalid_time");
  assert.equal(v({ kind: "special", intervals: [["10:00", "09:00"]] }).error, "interval_order");
  assert.deepEqual(v({ kind: "special", intervals: [["09:00", "12:00"], ["11:00", "14:00"]] }), { ok: false, error: "intervals_overlap", index: 1 });
  assert.equal(v({ kind: "special", intervals: [["09:00", "12:00"], ["12:00", "14:00"]] }).error, "intervals_overlap");
});

test("date and note limits", () => {
  assert.equal(v({ date: "2026-10-11" }).error, "date_in_past");
  assert.equal(v({ date: today }).ok, true);
  assert.equal(v({ date: addDays(today, 730) }).ok, true);
  assert.equal(v({ date: addDays(today, 731) }).error, "date_too_far");
  assert.equal(v({ date: "" }).error, "invalid_date");
  assert.equal(v({ kind: "weekend" }).error, "invalid_kind");
  assert.equal(v({ note: "x".repeat(121) }).error, "invalid_note");
  assert.equal(v({ note: "x".repeat(120) }).ok, true);
  assert.equal(v({ note: "bad\u0007" }).error, "invalid_note");
});

test("describes an exception for the list, and the limit is 60", () => {
  assert.equal(describeException({ kind: "closed" }), "Closed all day");
  assert.equal(describeException({ kind: "special", intervals: [["08:00", "12:00"], ["14:00", "18:00"]] }), "Special hours: 08:00 to 12:00, 14:00 to 18:00");
  assert.equal(EXCEPTION_LIMIT, 60);
});
