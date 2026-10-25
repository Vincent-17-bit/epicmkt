import { test } from "node:test";
import assert from "node:assert/strict";
import { businessStatus, describeStatus, statusOf } from "./openState.js";
import { isOpenOn } from "./utils.js";

const at = (date, time) => new Date(`${date}T${time}:00+03:00`);
const weekly = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], thu: ["08:00", "18:00"], fri: ["08:00", "18:00"], sat: ["09:00", "13:00"] };
const closed = (date, note = null) => ({ id: `c-${date}`, date, kind: "closed", intervals: [], note });
const special = (date, intervals, note = null) => ({ id: `s-${date}`, date, kind: "special", intervals, note });

test("open on a normal weekday, with the closing time and no reason", () => {
  const status = businessStatus(weekly, [], at("2026-10-20", "10:00"));
  assert.deepEqual(status, { isOpen: true, closesAt: "18:00", opensAt: null, reason: null });
});

test("a closed exception wins over the weekly hours and carries the seller's note", () => {
  const ex = [closed("2026-10-20", "Public holiday")];
  const status = statusOf(weekly, ex, at("2026-10-20", "10:00"));
  assert.equal(status.isOpen, false);
  assert.deepEqual(status.reason, { kind: "closed_day", note: "Public holiday" });
  assert.equal(status.line, "Closed today: Public holiday · Reopens tomorrow at 8:00 AM");
});

test("a closed exception without a note still says closed today", () => {
  const status = statusOf(weekly, [closed("2026-10-20")], at("2026-10-20", "10:00"));
  assert.equal(status.line, "Closed today · Reopens tomorrow at 8:00 AM");
});

test("special hours: open inside them, closed outside, both explain themselves", () => {
  const ex = [special("2026-10-20", [["10:00", "12:00"]], "Stocktake")];
  const inside = statusOf(weekly, ex, at("2026-10-20", "11:00"));
  assert.equal(inside.isOpen, true);
  assert.equal(inside.line, "Special hours today: Stocktake");
  const outside = statusOf(weekly, ex, at("2026-10-20", "15:00"));
  assert.equal(outside.isOpen, false);
  assert.equal(outside.line, "Special hours today: Stocktake · Reopens tomorrow at 8:00 AM");
});

test("weekly closed day names the day and says when it reopens", () => {
  const status = statusOf(weekly, [], at("2026-10-25", "11:00"));
  assert.equal(status.isOpen, false);
  assert.equal(status.line, "Closed on Sundays · Reopens tomorrow at 8:00 AM");
});

test("before opening and after closing on a working day read as outside hours", () => {
  const early = statusOf(weekly, [], at("2026-10-20", "06:00"));
  assert.equal(early.line, "Reopens today at 8:00 AM");
  const late = statusOf(weekly, [], at("2026-10-20", "19:00"));
  assert.equal(late.line, "Reopens tomorrow at 8:00 AM");
});

test("reopening further away is named by weekday", () => {
  const ex = [closed("2026-10-23"), closed("2026-10-24"), closed("2026-10-25")];
  const status = statusOf(weekly, ex, at("2026-10-23", "10:00"));
  assert.equal(status.line, "Closed today · Reopens Mon at 8:00 AM");
});

test("no hours at all says so instead of naming a day", () => {
  const status = statusOf({}, [], at("2026-10-20", "10:00"));
  assert.equal(status.isOpen, false);
  assert.equal(status.line, "Opening hours not set");
});

test("overnight weekly hours stay open after midnight, and an exception on the next day can end them", () => {
  const night = { mon: ["20:00", "02:00"] };
  assert.equal(businessStatus(night, [], at("2026-10-20", "00:30")).isOpen, true);
  assert.equal(businessStatus(night, [], at("2026-10-20", "00:30")).closesAt, "02:00");
  assert.equal(businessStatus(night, [], at("2026-10-20", "02:30")).isOpen, false);
  assert.equal(businessStatus(night, [closed("2026-10-20")], at("2026-10-20", "00:30")).isOpen, false);
});

test("overnight special hours carry into the next date", () => {
  const ex = [special("2026-10-20", [["20:00", "02:00"]])];
  assert.equal(businessStatus(weekly, ex, at("2026-10-20", "23:00")).isOpen, true);
  assert.equal(businessStatus(weekly, ex, at("2026-10-21", "01:00")).isOpen, true);
  assert.equal(businessStatus(weekly, ex, at("2026-10-21", "03:00")).isOpen, false);
});

test("the status never disagrees with isOpenOn, minute by minute, across a week of mixed exceptions", () => {
  const night = { ...weekly, fri: ["20:00", "03:00"] };
  const ex = [closed("2026-10-21", "Holiday"), special("2026-10-22", [["09:00", "11:00"], ["14:00", "16:00"]]), special("2026-10-24", [["22:00", "04:00"]])];
  for (let day = 19; day <= 26; day += 1) {
    for (let minute = 0; minute < 1440; minute += 7) {
      const when = new Date(Date.UTC(2026, 9, day, 0, minute) - 3 * 3600000);
      assert.equal(businessStatus(night, ex, when).isOpen, isOpenOn(night, ex, when), when.toISOString());
    }
  }
});

test("bad input is treated as no hours rather than throwing", () => {
  assert.equal(businessStatus(null, null, at("2026-10-20", "10:00")).isOpen, false);
  assert.equal(businessStatus(undefined, "nope", at("2026-10-20", "10:00")).isOpen, false);
});

test("describeStatus for an open shop gives the closing line", () => {
  const status = businessStatus(weekly, [], at("2026-10-20", "10:00"));
  const text = describeStatus(status, at("2026-10-20", "10:00"));
  assert.equal(text.headline, "Open now");
  assert.equal(text.closes, "Closes 6:00 PM");
  assert.equal(text.line, null);
});

test("hours traits: all day, Sundays and open late", async () => {
  const { isOpenAllDay, isOpenLate, opensOn } = await import("./openState.js");
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const every = (slot) => Object.fromEntries(days.map((d) => [d, slot]));
  assert.equal(isOpenAllDay(every(["00:00", "23:59"])), true);
  assert.equal(isOpenAllDay(every(["09:00", "09:00"])), true);
  assert.equal(isOpenAllDay({ ...every(["00:00", "23:59"]), sun: null }), false);
  assert.equal(isOpenAllDay({}), false);
  assert.equal(opensOn(weekly, "sun"), false);
  assert.equal(opensOn(weekly, "sat"), true);
  assert.equal(isOpenLate(every(["10:00", "22:00"]), [], at("2026-10-20", "08:00")), true);
  assert.equal(isOpenLate(every(["08:00", "18:00"]), [], at("2026-10-20", "08:00")), false);
  assert.equal(isOpenLate(every(["10:00", "22:00"]), [closed("2026-10-20")], at("2026-10-20", "08:00")), false);
});
