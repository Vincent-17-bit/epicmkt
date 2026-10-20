import { test } from "node:test";
import assert from "node:assert/strict";
import { closingInfo, hoursRowsFor, isOpenOn, nairobiNow } from "./utils.js";

// Nairobi is UTC+3, no daylight saving. at("2026-10-20", "09:30") is Tue 20 Oct 2026, 09:30 in Nairobi.
const at = (date, time) => new Date(`${date}T${time}:00+03:00`);
const weekly = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["09:00", "13:00"] };
const closed = (date, note = null) => ({ id: `c-${date}`, date, kind: "closed", intervals: [], note });
const special = (date, intervals, note = null) => ({ id: `s-${date}`, date, kind: "special", intervals, note });

test("nairobiNow carries the Nairobi calendar date, which can differ from the UTC date", () => {
  assert.equal(nairobiNow(new Date("2026-10-20T22:30:00Z")).date, "2026-10-21");
  assert.equal(nairobiNow(new Date("2026-10-20T22:30:00Z")).day, "wed");
});

test("a closed exception means closed all day, and the shop reopens the next day", () => {
  const ex = [closed("2026-10-20", "Public holiday")];
  assert.equal(isOpenOn(weekly, ex, at("2026-10-20", "09:30")), false);
  assert.equal(isOpenOn(weekly, ex, at("2026-10-20", "17:59")), false);
  assert.equal(isOpenOn(weekly, ex, at("2026-10-21", "09:30")), true);
  const info = closingInfo(weekly, ex, at("2026-10-20", "09:30"));
  assert.deepEqual(info, { closesAt: null, opensAt: { day: "wed", time: "08:00", date: "2026-10-21" } });
});

test("a special exception is open only inside its intervals", () => {
  const ex = [special("2026-10-20", [["10:00", "12:00"], ["15:00", "17:00"]])];
  const open = (time) => isOpenOn(weekly, ex, at("2026-10-20", time));
  assert.deepEqual(["08:30", "09:59", "10:00", "11:59", "12:00", "13:00", "15:00", "16:59", "17:00", "17:30"].map(open), [false, false, true, true, false, false, true, true, false, false]);
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "11:00")), { closesAt: "12:00", opensAt: null });
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "12:30")), { closesAt: null, opensAt: { day: "tue", time: "15:00", date: "2026-10-20" } });
  // After the last interval the next opening is tomorrow's weekly hours.
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "17:30")), { closesAt: null, opensAt: { day: "wed", time: "08:00", date: "2026-10-21" } });
});

test("an exception for a past date is ignored", () => {
  const ex = [closed("2026-10-19"), special("2026-10-18", [["01:00", "02:00"]])];
  assert.equal(isOpenOn(weekly, ex, at("2026-10-20", "09:30")), true);
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "09:30")), { closesAt: "18:00", opensAt: null });
});

test("an exception on a day the weekly hours say closed opens the shop that day", () => {
  // Sun 25 Oct 2026 has no weekly hours.
  assert.equal(isOpenOn(weekly, [], at("2026-10-25", "11:00")), false);
  const ex = [special("2026-10-25", [["10:00", "14:00"]])];
  assert.equal(isOpenOn(weekly, ex, at("2026-10-25", "11:00")), true);
  assert.equal(isOpenOn(weekly, ex, at("2026-10-25", "14:00")), false);
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-24", "14:00")), { closesAt: null, opensAt: { day: "sun", time: "10:00", date: "2026-10-25" } });
});

test("a missing, null or empty exceptions list behaves like the weekly hours", () => {
  for (const ex of [undefined, null, [], "oops", {}, [null], [{ date: "2026-10-20", kind: "weekend" }]]) {
    assert.equal(isOpenOn(weekly, ex, at("2026-10-20", "09:30")), true, JSON.stringify(ex));
    assert.equal(isOpenOn(weekly, ex, at("2026-10-20", "19:00")), false);
    assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "19:00")), { closesAt: null, opensAt: { day: "wed", time: "08:00", date: "2026-10-21" } });
  }
  assert.deepEqual(closingInfo(weekly, at("2026-10-20", "09:30")), { closesAt: "18:00", opensAt: null }, "old closingInfo(hours, date) calls still work");
});

test("closingInfo looks up to 7 days ahead, across exceptions", () => {
  const ex = Array.from({ length: 6 }, (_, i) => closed(`2026-10-${21 + i}`)); // Wed 21 .. Mon 26 closed
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-20", "19:00")), { closesAt: null, opensAt: { day: "tue", time: "08:00", date: "2026-10-27" } });
  const week = Array.from({ length: 7 }, (_, i) => closed(`2026-10-${21 + i}`)); // Wed 21 .. Tue 27, the whole look-ahead
  assert.deepEqual(closingInfo(weekly, week, at("2026-10-20", "19:00")), { closesAt: null, opensAt: null });
});

test("hours table rows: Monday to Sunday, each weekday as its next date, exceptions replace the weekly text", () => {
  const ex = [closed("2026-10-20", "Public holiday"), special("2026-10-25", [["10:00", "14:00"]])];
  const rows = hoursRowsFor(weekly, ex, at("2026-10-20", "09:30"));
  assert.deepEqual(rows.map((r) => r.day), ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  assert.deepEqual(rows.map((r) => r.date), ["2026-10-26", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.deepEqual(rows.find((r) => r.today), { day: "tue", name: "Tuesday", date: "2026-10-20", dateLabel: "20 Oct", today: true, text: "Closed", changed: true, note: "Public holiday" });
  assert.equal(rows.find((r) => r.day === "sun").text, "10:00 AM to 2:00 PM");
  assert.equal(rows.find((r) => r.day === "wed").text, "8:00 AM to 6:00 PM");
  assert.equal(rows.find((r) => r.day === "wed").changed, false);
  assert.equal(hoursRowsFor(weekly, [], at("2026-10-20", "09:30")).find((r) => r.day === "sun").text, "Closed");
});

test("overnight special: the after-midnight part belongs to the next date", () => {
  const ex = [special("2026-10-23", [["20:00", "02:00"]])]; // Fri 23 Oct, 20:00 until 02:00 on Sat 24 Oct
  const open = (date, time) => isOpenOn(weekly, ex, at(date, time));
  assert.equal(open("2026-10-23", "19:59"), false, "Friday's weekly 08:00 to 18:00 is replaced, so the evening before 20:00 is closed");
  assert.equal(open("2026-10-23", "20:00"), true);
  assert.equal(open("2026-10-23", "23:59"), true);
  assert.equal(open("2026-10-24", "00:00"), true, "midnight into Saturday, still open");
  assert.equal(open("2026-10-24", "01:59"), true);
  assert.equal(open("2026-10-24", "02:00"), false);
  assert.equal(open("2026-10-24", "08:59"), false, "Saturday's own weekly hours start at 09:00");
  assert.equal(open("2026-10-24", "09:00"), true);
  assert.equal(open("2026-10-22", "01:00"), false, "the night before is not affected");
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-23", "21:00")), { closesAt: "02:00", opensAt: null });
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-24", "00:30")), { closesAt: "02:00", opensAt: null });
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-23", "12:00")), { closesAt: null, opensAt: { day: "fri", time: "20:00", date: "2026-10-23" } });
});

test("overnight: the next date's own special exception takes over at its first interval's start", () => {
  const ex = [special("2026-10-23", [["20:00", "02:00"]]), special("2026-10-24", [["10:00", "12:00"]])];
  const open = (time) => isOpenOn(weekly, ex, at("2026-10-24", time));
  assert.deepEqual(["00:30", "01:59", "02:00", "09:59", "10:00", "11:59", "12:00"].map(open), [true, true, false, false, true, true, false]);
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-24", "05:00")), { closesAt: null, opensAt: { day: "sat", time: "10:00", date: "2026-10-24" } });
});

test("overnight: a closed next date cuts the carry-over at midnight, and the status says so", () => {
  const ex = [special("2026-10-23", [["20:00", "02:00"]]), closed("2026-10-24")];
  assert.equal(isOpenOn(weekly, ex, at("2026-10-23", "23:59")), true);
  assert.equal(isOpenOn(weekly, ex, at("2026-10-24", "00:30")), false);
  assert.deepEqual(closingInfo(weekly, ex, at("2026-10-23", "21:00")), { closesAt: "00:00", opensAt: null });
});

test("overnight: 09:00 to 09:00 is a full 24 hours, and a weekly overnight slot carries into the next weekday", () => {
  const day = [special("2026-10-24", [["09:00", "09:00"]])]; // Sat 24 Oct; Sunday has no weekly hours
  const stamps = [["2026-10-24", "08:30"], ["2026-10-24", "09:00"], ["2026-10-24", "23:00"], ["2026-10-25", "08:59"], ["2026-10-25", "09:00"]];
  assert.deepEqual(stamps.map(([d, t]) => isOpenOn(weekly, day, at(d, t))), [false, true, true, true, false]);
  const club = { fri: ["22:00", "04:00"] };
  const openClub = (date, time) => isOpenOn(club, [], at(date, time));
  assert.equal(openClub("2026-10-23", "23:00"), true);
  assert.equal(openClub("2026-10-24", "03:00"), true, "Friday's slot is still open early on Saturday");
  assert.equal(openClub("2026-10-24", "04:00"), false);
  assert.equal(openClub("2026-10-23", "03:00"), false, "early Friday is Thursday's night, and Thursday has no hours");
});
