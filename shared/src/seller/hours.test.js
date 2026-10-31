import { test } from "node:test";
import assert from "node:assert/strict";
import { WEEK_DAYS, normalizeWeeklyHours, validateWeeklyHours } from "./hours.js";
import { intervalsOn } from "../utils.js";

const codes = (r) => r.errors.map((e) => `${e.day ?? "-"}:${e.error}`);

test("valid hours pass and come back as a copy ordered mon..sun", () => {
  const input = { sun: ["10:00", "16:00"], mon: ["08:00", "18:00"] };
  const r = validateWeeklyHours(input);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value), ["mon", "sun"]);
  assert.deepEqual(r.value, { mon: ["08:00", "18:00"], sun: ["10:00", "16:00"] });
  assert.notEqual(r.value.mon, input.mon);
});

test("a missing day is closed, and an empty week is valid", () => {
  assert.deepEqual(validateWeeklyHours({}), { ok: true, value: {} });
  assert.deepEqual(validateWeeklyHours({ tue: ["09:00", "17:00"] }).value, { tue: ["09:00", "17:00"] });
});

test("an interval that ends at or before its start runs past midnight and is valid", () => {
  const r = validateWeeklyHours({ fri: ["20:00", "02:00"], sat: ["23:59", "00:00"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.value.fri, ["20:00", "02:00"]);
});

test("start equal to end is rejected", () => {
  const r = validateWeeklyHours({ mon: ["08:00", "08:00"], tue: ["00:00", "00:00"] });
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ["mon:zero_length", "tue:zero_length"]);
});

test("bad times are rejected", () => {
  for (const bad of ["24:00", "25:00", "12:60", "8:00", "08:0", "08-00", "", " 08:00", "08:00:00", 800, null, undefined, {}]) {
    const r = validateWeeklyHours({ wed: [bad, "18:00"] });
    assert.equal(r.ok, false, `start ${JSON.stringify(bad)}`);
    assert.deepEqual(codes(r), ["wed:invalid_time"]);
    assert.equal(validateWeeklyHours({ wed: ["08:00", bad] }).ok, false, `end ${JSON.stringify(bad)}`);
  }
});

test("a day that is not a [start, end] pair is rejected", () => {
  for (const bad of ["08:00-18:00", ["08:00"], ["08:00", "12:00", "14:00"], [], {}, 5, true]) {
    const r = validateWeeklyHours({ thu: bad });
    assert.deepEqual(codes(r), ["thu:invalid_interval"], JSON.stringify(bad));
  }
});

test("unknown day keys are rejected, including wrong case and long names", () => {
  const r = validateWeeklyHours({ monday: ["08:00", "18:00"], Mon: ["08:00", "18:00"], "": ["08:00", "18:00"], mon: ["08:00", "18:00"] });
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ["monday:unknown_day", "Mon:unknown_day", ":unknown_day"]);
});

test("every problem is reported, not just the first", () => {
  const r = validateWeeklyHours({ xyz: ["08:00", "18:00"], mon: ["8:00", "18:00"], tue: ["09:00", "09:00"], wed: "nope" });
  assert.deepEqual(codes(r), ["xyz:unknown_day", "mon:invalid_time", "tue:zero_length", "wed:invalid_interval"]);
});

test("input that is not a plain object is rejected", () => {
  for (const bad of [null, undefined, "mon", 5, [], [["08:00", "18:00"]], true]) {
    const r = validateWeeklyHours(bad);
    assert.deepEqual(r, { ok: false, errors: [{ error: "invalid_hours" }] }, JSON.stringify(bad));
  }
});

test("the input is never mutated", () => {
  const input = Object.freeze({ mon: Object.freeze([" 8:00", "18:00 "]), sun: null });
  const snapshot = JSON.stringify(input);
  validateWeeklyHours(input);
  normalizeWeeklyHours(input);
  assert.equal(JSON.stringify(input), snapshot);
});

test("normalize trims, pads the hour, drops closed days and orders mon..sun", () => {
  const r = normalizeWeeklyHours({ sun: [" 9:30 ", "16:00"], wed: null, tue: undefined, mon: ["8:00", "18:00"] });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.value), ["mon", "sun"]);
  assert.deepEqual(r.value, { mon: ["08:00", "18:00"], sun: ["09:30", "16:00"] });
});

test("normalize still rejects what it cannot fix, and compares after cleaning", () => {
  assert.deepEqual(codes(normalizeWeeklyHours({ mon: ["8:00", "08:00"] })), ["mon:zero_length"]);
  assert.deepEqual(codes(normalizeWeeklyHours({ mon: ["24:00", "18:00"] })), ["mon:invalid_time"]);
  assert.deepEqual(codes(normalizeWeeklyHours({ mon: ["8:60", "18:00"] })), ["mon:invalid_time"]);
  assert.deepEqual(codes(normalizeWeeklyHours({ sunday: ["08:00", "18:00"] })), ["sunday:unknown_day"]);
  assert.deepEqual(normalizeWeeklyHours("x"), { ok: false, errors: [{ error: "invalid_hours" }] });
});

test("normalize is idempotent and its output passes strict validation", () => {
  const once = normalizeWeeklyHours({ sat: ["8:00", "1:30"], mon: ["07:15", "21:45"] });
  assert.equal(once.ok, true);
  assert.deepEqual(normalizeWeeklyHours(once.value), once);
  assert.deepEqual(validateWeeklyHours(once.value), once);
});

test("validated hours are read by the app's own helpers (intervalsOn): overnight and closed days", () => {
  const { value } = validateWeeklyHours({ mon: ["22:00", "03:00"] });
  assert.deepEqual(intervalsOn(value, [], "2026-10-19"), [["22:00", "03:00"]]); // a Monday
  assert.deepEqual(intervalsOn(value, [], "2026-10-20"), []); // Tuesday is missing, so closed
});

test("WEEK_DAYS is mon..sun", () => {
  assert.deepEqual(WEEK_DAYS, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
});
