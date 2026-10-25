import test from "node:test";
import assert from "node:assert/strict";
import {
  BUSINESS_TIME_ZONE,
  addCalendarDays,
  businessDay,
  calendarDaysBetween,
  calendarWeekday,
  dayRangeUtcIso,
  daysFromToday,
  formatBusinessDay,
  formatCalendarDay,
  formatDate,
  formatDateTime,
  formatInstant,
  formatTime,
  getUserTimeZone,
  isCalendarDay,
  isValidTimeZone,
  localInputToUtcIso,
  parseInstant,
  setUserTimeZone,
  startOfDayUtcIso,
  toUtcIso,
  tzOffsetMinutes,
  utcToLocalInput,
  zoneLabel,
  zonedDay,
  zonedMinutes,
  zonedParts,
  zonedTimeToUtc
} from "./time.js";

// Zones chosen to hurt: half hour and 45 minute offsets, 30 minute DST, negative DST, 2 hour DST, DST that starts at
// midnight, a zone that skipped a whole day, the extremes of the offset range, and zones with no DST at all.
const ZONES = [
  "UTC", "Africa/Nairobi", "Africa/Casablanca", "Africa/Lagos",
  "America/New_York", "America/Los_Angeles", "America/Sao_Paulo", "America/St_Johns", "America/Havana",
  "Europe/London", "Europe/Berlin", "Europe/Moscow",
  "Asia/Kolkata", "Asia/Kathmandu", "Asia/Tokyo", "Asia/Tehran",
  "Australia/Sydney", "Australia/Adelaide", "Australia/Lord_Howe",
  "Pacific/Auckland", "Pacific/Chatham", "Pacific/Apia", "Pacific/Kiritimati", "Pacific/Pago_Pago",
  "Antarctica/Troll"
];

const iso = (s) => new Date(s).toISOString();

// A small seeded generator so a failure is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- parseInstant / toUtcIso -----------------------------------------------------------------------------------------

test("parseInstant: accepts ISO strings that carry their offset", () => {
  assert.equal(parseInstant("2026-10-25T04:51:00Z").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-25T04:51:00.123Z").toISOString(), "2026-10-25T04:51:00.123Z");
  assert.equal(parseInstant("2026-10-25T07:51:00+03:00").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-24T23:51:00-05:00").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-25T10:36:00+05:45").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-25T04:51Z").toISOString(), "2026-10-25T04:51:00.000Z");
});

test("parseInstant: accepts the spellings Postgres produces", () => {
  assert.equal(parseInstant("2026-10-25 04:51:00+00").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-25 07:51:00.123456+03").toISOString(), "2026-10-25T04:51:00.123Z");
  assert.equal(parseInstant("2026-10-25T07:51:00+0300").toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant("2026-10-25T04:51:00.123456789+00:00").toISOString(), "2026-10-25T04:51:00.123Z");
});

test("parseInstant: rejects values with no offset, because they mean a different moment in every zone", () => {
  assert.equal(parseInstant("2026-10-25T04:51:00"), null);
  assert.equal(parseInstant("2026-10-25 04:51"), null);
  assert.equal(parseInstant("2026-10-25"), null, "a bare day is a calendar day, not an instant");
});

test("parseInstant: rejects impossible dates that Date.parse would quietly roll over", () => {
  assert.equal(parseInstant("2026-02-30T00:00:00Z"), null);
  assert.equal(parseInstant("2026-02-29T00:00:00Z"), null, "2026 is not a leap year");
  assert.notEqual(parseInstant("2028-02-29T00:00:00Z"), null, "2028 is");
  assert.equal(parseInstant("2026-13-01T00:00:00Z"), null);
  assert.equal(parseInstant("2026-04-31T00:00:00Z"), null);
  assert.equal(parseInstant("2026-10-25T24:00:00Z"), null);
  assert.equal(parseInstant("2026-10-25T23:60:00Z"), null);
  assert.equal(parseInstant("2026-10-25T23:59:60Z"), null);
  assert.equal(parseInstant("2026-10-25T10:00:00+24:00"), null);
  assert.equal(parseInstant("2026-10-25T10:00:00+03:60"), null);
});

test("parseInstant: handles Date, numbers and junk", () => {
  assert.equal(parseInstant(new Date("2026-10-25T04:51:00Z")).toISOString(), "2026-10-25T04:51:00.000Z");
  assert.equal(parseInstant(Date.UTC(2026, 9, 25)).toISOString(), "2026-10-25T00:00:00.000Z");
  for (const bad of [null, undefined, "", "   ", "soon", {}, [], NaN, Infinity, new Date("nope"), true, "2026/10/25 04:51Z"]) {
    assert.equal(parseInstant(bad), null, `should reject ${String(bad)}`);
  }
});

test("parseInstant returns a copy, so callers cannot mutate the caller's Date", () => {
  const original = new Date("2026-10-25T04:51:00Z");
  parseInstant(original).setUTCFullYear(1999);
  assert.equal(original.toISOString(), "2026-10-25T04:51:00.000Z");
});

test("toUtcIso: always the canonical UTC form", () => {
  assert.equal(toUtcIso("2026-10-25T07:51:00+03:00"), "2026-10-25T04:51:00.000Z");
  assert.equal(toUtcIso(new Date("2026-10-25T04:51:00Z")), "2026-10-25T04:51:00.000Z");
  assert.equal(toUtcIso("2026-10-25"), null);
  assert.equal(toUtcIso(undefined), null);
});

// ---- zones, offsets, wall clock ------------------------------------------------------------------------------------------

test("isValidTimeZone", () => {
  for (const z of ZONES) assert.equal(isValidTimeZone(z), true, z);
  for (const bad of ["Bogus/Zone", "", "  ", null, undefined, 5, "Mars/Olympus"]) assert.equal(isValidTimeZone(bad), false, String(bad));
});

test("tzOffsetMinutes: fixed and half hour zones", () => {
  const t = "2026-10-25T04:51:00Z";
  assert.equal(tzOffsetMinutes(t, "UTC"), 0);
  assert.equal(tzOffsetMinutes(t, "Africa/Nairobi"), 180);
  assert.equal(tzOffsetMinutes(t, "Asia/Kolkata"), 330);
  assert.equal(tzOffsetMinutes(t, "Asia/Kathmandu"), 345);
  assert.equal(tzOffsetMinutes(t, "Pacific/Kiritimati"), 840);
  assert.equal(tzOffsetMinutes(t, "Pacific/Pago_Pago"), -660);
  assert.equal(tzOffsetMinutes("not a date", "UTC"), null);
});

test("tzOffsetMinutes: follows daylight saving", () => {
  assert.equal(tzOffsetMinutes("2026-01-15T12:00:00Z", "America/New_York"), -300, "EST");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "America/New_York"), -240, "EDT");
  assert.equal(tzOffsetMinutes("2026-01-15T12:00:00Z", "Europe/London"), 0, "GMT");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "Europe/London"), 60, "BST");
  assert.equal(tzOffsetMinutes("2026-01-15T12:00:00Z", "Australia/Sydney"), 660, "AEDT in January");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "Australia/Sydney"), 600, "AEST in July");
  assert.equal(tzOffsetMinutes("2026-01-15T12:00:00Z", "Australia/Lord_Howe"), 660, "Lord Howe DST");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "Australia/Lord_Howe"), 630, "Lord Howe standard, 30 minutes apart");
  assert.equal(tzOffsetMinutes("2026-01-15T12:00:00Z", "Pacific/Chatham"), 825, "Chatham +13:45");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "Pacific/Chatham"), 765, "Chatham +12:45");
  assert.equal(tzOffsetMinutes("2026-07-15T12:00:00Z", "America/St_Johns"), -150, "Newfoundland -2:30");
});

test("Nairobi never changes offset (the business zone has no daylight saving)", () => {
  for (let m = 0; m < 12; m += 1) assert.equal(tzOffsetMinutes(Date.UTC(2026, m, 15), BUSINESS_TIME_ZONE), 180);
});

test("zonedParts: the wall clock, weekday and offset", () => {
  assert.deepEqual(zonedParts("2026-10-25T04:51:07Z", "Africa/Nairobi"), { year: 2026, month: 10, day: 25, hour: 7, minute: 51, second: 7, weekday: 0, offsetMinutes: 180 });
  assert.deepEqual(zonedParts("2026-10-25T04:51:07Z", "America/Los_Angeles"), { year: 2026, month: 10, day: 24, hour: 21, minute: 51, second: 7, weekday: 6, offsetMinutes: -420 });
  assert.equal(zonedParts("garbage", "UTC"), null);
});

test("zonedParts: midnight is hour 0, never 24", () => {
  for (const z of ZONES) {
    const p = zonedParts(startOfDayUtcIso("2026-06-10", z), z);
    assert.equal(p.hour, 0, z);
    assert.equal(p.minute, 0, z);
  }
});

test("zonedParts: sub-second precision and negative epochs do not break the maths", () => {
  assert.equal(zonedParts("2026-10-25T04:51:59.999Z", "UTC").second, 59);
  const old = zonedParts("1969-12-31T23:59:59.500Z", "UTC");
  assert.deepEqual([old.year, old.month, old.day, old.hour, old.minute, old.second], [1969, 12, 31, 23, 59, 59]);
});

test("zonedDay / zonedMinutes / businessDay", () => {
  const t = "2026-10-25T21:30:00Z";
  assert.equal(zonedDay(t, "Africa/Nairobi"), "2026-10-26", "00:30 the next day in Nairobi");
  assert.equal(zonedDay(t, "UTC"), "2026-10-25");
  assert.equal(zonedDay(t, "America/Los_Angeles"), "2026-10-25");
  assert.equal(zonedDay(t, "Pacific/Kiritimati"), "2026-10-26");
  assert.equal(zonedMinutes(t, "Africa/Nairobi"), 30);
  assert.equal(businessDay(t), "2026-10-26");
  assert.equal(businessDay("2026-10-24T21:00:00.000Z"), "2026-10-25", "Nairobi midnight belongs to the new day");
  assert.equal(businessDay("2026-10-24T20:59:59.999Z"), "2026-10-24", "one millisecond earlier is the old day");
});

test("a zone-less call uses the viewer's zone, and a bad zone throws instead of silently using UTC", () => {
  setUserTimeZone("Pacific/Kiritimati");
  try {
    assert.equal(getUserTimeZone(), "Pacific/Kiritimati");
    assert.equal(zonedDay("2026-10-25T10:30:00Z"), "2026-10-26");
    assert.throws(() => zonedDay("2026-10-25T10:30:00Z", "Mars/Olympus"), RangeError);
    assert.throws(() => setUserTimeZone("Mars/Olympus"), RangeError);
    assert.equal(getUserTimeZone(), "Pacific/Kiritimati", "a rejected zone leaves the old one in place");
  } finally {
    setUserTimeZone(null);
  }
  assert.ok(isValidTimeZone(getUserTimeZone()));
});

// ---- calendar days ---------------------------------------------------------------------------------------------------------

test("calendar day arithmetic is pure date maths", () => {
  assert.equal(addCalendarDays("2026-10-25", 1), "2026-10-26");
  assert.equal(addCalendarDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addCalendarDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addCalendarDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addCalendarDays("2026-03-08", 0), "2026-03-08");
  assert.equal(calendarDaysBetween("2026-10-25", "2026-11-01"), 7);
  assert.equal(calendarDaysBetween("2026-11-01", "2026-10-25"), -7);
  assert.equal(calendarDaysBetween("2026-03-07", "2026-03-09"), 2, "across US spring forward");
  assert.equal(calendarWeekday("2026-10-25"), 0, "a Sunday");
  assert.equal(calendarWeekday("2026-10-26"), 1);
  assert.equal(isCalendarDay("2026-02-30"), false);
  assert.equal(isCalendarDay("2026-2-3"), false);
  assert.equal(isCalendarDay("2026-10-25T00:00:00Z"), false);
  assert.throws(() => addCalendarDays("2026-02-30", 1), RangeError);
  assert.throws(() => addCalendarDays("2026-10-25", 1.5), RangeError);
});

// ---- wall clock to instant: daylight saving ----------------------------------------------------------------------------------

const ny = (fields, rules) => zonedTimeToUtc({ year: 2026, ...fields }, "America/New_York", rules).toISOString();

test("a normal local time converts exactly", () => {
  assert.equal(ny({ month: 7, day: 4, hour: 12 }), "2026-07-04T16:00:00.000Z", "EDT is UTC-4");
  assert.equal(ny({ month: 1, day: 4, hour: 12 }), "2026-01-04T17:00:00.000Z", "EST is UTC-5");
  assert.equal(zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 7, minute: 51 }, "Africa/Nairobi").toISOString(), "2026-10-25T04:51:00.000Z");
});

test("US spring forward 2026-03-08: 02:00 to 02:59 does not exist", () => {
  assert.equal(ny({ month: 3, day: 8, hour: 1, minute: 59 }), "2026-03-08T06:59:00.000Z", "last minute of EST");
  assert.equal(ny({ month: 3, day: 8, hour: 3, minute: 0 }), "2026-03-08T07:00:00.000Z", "first minute of EDT, the very same instant 02:00 would have been");
  assert.equal(ny({ month: 3, day: 8, hour: 2, minute: 30 }), "2026-03-08T07:30:00.000Z", "default: forward to 03:30 EDT");
  assert.equal(ny({ month: 3, day: 8, hour: 2, minute: 30 }, { gap: "forward" }), "2026-03-08T07:30:00.000Z");
  assert.equal(ny({ month: 3, day: 8, hour: 2, minute: 30 }, { gap: "backward" }), "2026-03-08T06:30:00.000Z", "backward: 01:30 EST");
  assert.throws(() => ny({ month: 3, day: 8, hour: 2, minute: 30 }, { gap: "throw" }), RangeError);
  assert.equal(ny({ month: 3, day: 8, hour: 2, minute: 0 }), "2026-03-08T07:00:00.000Z");
  assert.equal(ny({ month: 3, day: 8, hour: 2, minute: 59 }), "2026-03-08T07:59:00.000Z");
});

test("US fall back 2026-11-01: 01:00 to 01:59 happens twice", () => {
  assert.equal(ny({ month: 11, day: 1, hour: 0, minute: 59 }), "2026-11-01T04:59:00.000Z", "still EDT");
  assert.equal(ny({ month: 11, day: 1, hour: 1, minute: 30 }), "2026-11-01T05:30:00.000Z", "default: the first 01:30, EDT");
  assert.equal(ny({ month: 11, day: 1, hour: 1, minute: 30 }, { overlap: "earlier" }), "2026-11-01T05:30:00.000Z");
  assert.equal(ny({ month: 11, day: 1, hour: 1, minute: 30 }, { overlap: "later" }), "2026-11-01T06:30:00.000Z", "the second 01:30, EST");
  assert.throws(() => ny({ month: 11, day: 1, hour: 1, minute: 30 }, { overlap: "throw" }), RangeError);
  assert.equal(ny({ month: 11, day: 1, hour: 2, minute: 0 }), "2026-11-01T07:00:00.000Z", "after the overlap, plain EST");
});

test("UK clocks go back today, 2026-10-25 at 02:00 BST", () => {
  const uk = (hour, minute, rules) => zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour, minute }, "Europe/London", rules).toISOString();
  assert.equal(uk(0, 59), "2026-10-24T23:59:00.000Z", "BST");
  assert.equal(uk(1, 30), "2026-10-25T00:30:00.000Z", "first 01:30 is BST");
  assert.equal(uk(1, 30, { overlap: "later" }), "2026-10-25T01:30:00.000Z", "second 01:30 is GMT");
  assert.equal(uk(2, 0), "2026-10-25T02:00:00.000Z", "02:00 is GMT afterwards");
  const spring = (hour, minute) => zonedTimeToUtc({ year: 2026, month: 3, day: 29, hour, minute }, "Europe/London").toISOString();
  assert.equal(spring(1, 30), "2026-03-29T01:30:00.000Z", "01:30 does not exist; forward to 02:30 BST");
});

test("Sydney (southern hemisphere) starts DST in October and ends it in April", () => {
  const syd = (m, d, h, mi, rules) => zonedTimeToUtc({ year: 2026, month: m, day: d, hour: h, minute: mi }, "Australia/Sydney", rules).toISOString();
  assert.equal(syd(10, 4, 2, 30), "2026-10-03T16:30:00.000Z", "02:30 skipped, forward to 03:30 AEDT");
  assert.equal(syd(10, 4, 3, 30), "2026-10-03T16:30:00.000Z");
  assert.equal(syd(4, 5, 2, 30), "2026-04-04T15:30:00.000Z", "first 02:30 is AEDT");
  assert.equal(syd(4, 5, 2, 30, { overlap: "later" }), "2026-04-04T16:30:00.000Z", "second 02:30 is AEST");
});

test("Lord Howe: a 30 minute daylight saving shift", () => {
  const lh = (m, d, h, mi, rules) => zonedTimeToUtc({ year: 2026, month: m, day: d, hour: h, minute: mi }, "Australia/Lord_Howe", rules).toISOString();
  assert.equal(lh(10, 4, 2, 10), lh(10, 4, 2, 40), "02:00 to 02:29 is skipped and lands after the gap");
  assert.equal(lh(10, 4, 2, 29), "2026-10-03T15:59:00.000Z", "02:29 forward by 30 minutes is 02:59 LHDT = +11:00");
  assert.equal(lh(10, 4, 2, 30), "2026-10-03T15:30:00.000Z", "02:30 exists once, LHDT");
  assert.equal(lh(4, 5, 1, 45), "2026-04-04T14:45:00.000Z", "01:30 to 01:59 happens twice; first is LHDT");
  assert.equal(lh(4, 5, 1, 45, { overlap: "later" }), "2026-04-04T15:15:00.000Z", "second is LHST, 30 minutes later");
});

test("Pacific/Apia skipped 30 December 2011 entirely", () => {
  assert.equal(isCalendarDay("2011-12-30"), true);
  const start = startOfDayUtcIso("2011-12-31", "Pacific/Apia");
  assert.equal(zonedDay(start, "Pacific/Apia"), "2011-12-31");
  assert.equal(zonedDay(new Date(Date.parse(start) - 1), "Pacific/Apia"), "2011-12-29", "the day before 31 December is the 29th");
  // Midnight on the skipped day does not exist; it resolves forward to the first moment after the jump.
  assert.equal(startOfDayUtcIso("2011-12-30", "Pacific/Apia"), start);
});

test("Havana starts daylight saving AT midnight, so 00:00 on that day does not exist", () => {
  const start = startOfDayUtcIso("2026-03-08", "America/Havana");
  const p = zonedParts(start, "America/Havana");
  assert.deepEqual([p.day, p.hour, p.minute], [8, 1, 0], "the day begins at 01:00 CDT");
  assert.equal(zonedDay(new Date(Date.parse(start) - 1), "America/Havana"), "2026-03-07");
});

test("zonedTimeToUtc rejects fields that are not a real local time", () => {
  const bad = [
    { year: 2026, month: 2, day: 30 }, { year: 2026, month: 13, day: 1 }, { year: 2026, month: 10, day: 25, hour: 24 },
    { year: 2026, month: 10, day: 25, minute: 60 }, { year: 2026, month: 10, day: 25, hour: -1 }, { year: 2026, month: 10, day: 25.5 },
    { year: 2026, month: "10", day: 25 }, null, {}
  ];
  for (const fields of bad) assert.throws(() => zonedTimeToUtc(fields, "UTC"), RangeError, JSON.stringify(fields));
});

// ---- the invariants, across every zone, independent of the algorithm under test --------------------------------------------------

test("start of day is the first instant of that calendar day, in every zone, for every day of 2026", () => {
  for (const zone of ZONES) {
    let day = "2026-01-01";
    for (let i = 0; i < 365; i += 1) {
      const start = Date.parse(startOfDayUtcIso(day, zone));
      assert.equal(zonedDay(start, zone), day, `${zone} ${day}: start is on the day`);
      assert.ok(zonedDay(start - 1, zone) < day, `${zone} ${day}: the millisecond before is the previous day`);
      day = addCalendarDays(day, 1);
    }
  }
});

test("a day is 24 hours long except when daylight saving changes", () => {
  const hours = (day, zone) => {
    const { start, end } = dayRangeUtcIso(day, zone);
    return (Date.parse(end) - Date.parse(start)) / 3_600_000;
  };
  assert.equal(hours("2026-03-07", "America/New_York"), 24);
  assert.equal(hours("2026-03-08", "America/New_York"), 23, "spring forward");
  assert.equal(hours("2026-03-09", "America/New_York"), 24);
  assert.equal(hours("2026-11-01", "America/New_York"), 25, "fall back");
  assert.equal(hours("2026-10-25", "Europe/London"), 25, "UK clocks back today");
  assert.equal(hours("2026-03-29", "Europe/London"), 23);
  assert.equal(hours("2026-10-04", "Australia/Lord_Howe"), 23.5, "a half hour change");
  assert.equal(hours("2026-04-05", "Australia/Lord_Howe"), 24.5);
  assert.equal(hours("2026-06-15", "Pacific/Chatham"), 24);
  assert.equal(hours("2026-10-25", "Africa/Nairobi"), 24);
});

test("day ranges tile the timeline with no gap and no overlap", () => {
  for (const zone of ZONES) {
    let day = "2026-02-25";
    let previousEnd = dayRangeUtcIso(day, zone).start;
    for (let i = 0; i < 400; i += 1) {
      const { start, end } = dayRangeUtcIso(day, zone);
      assert.equal(start, previousEnd, `${zone} ${day}`);
      assert.ok(Date.parse(end) > Date.parse(start), `${zone} ${day} has positive length`);
      previousEnd = end;
      day = addCalendarDays(day, 1);
    }
  }
});

test("local input round trip: instant to wall clock and back, in every zone, across years", () => {
  const next = rng(20261025);
  for (const zone of ZONES) {
    for (let i = 0; i < 400; i += 1) {
      const instant = Date.UTC(2000, 0, 1) + Math.floor(next() * 40 * 365 * 86_400_000);
      const minute = Math.floor(instant / 60_000) * 60_000;
      const local = utcToLocalInput(minute, zone);
      const back = localInputToUtcIso(local, zone);
      assert.ok(back, `${zone} ${local} converts`);
      // Back is the same instant, or (inside the repeated fall back hour) the other instant with the same wall clock.
      assert.equal(utcToLocalInput(back, zone), local, `${zone} ${local} reads the same wall clock`);
      let ambiguous = false;
      try {
        zonedTimeToUtc(
          { year: Number(local.slice(0, 4)), month: Number(local.slice(5, 7)), day: Number(local.slice(8, 10)), hour: Number(local.slice(11, 13)), minute: Number(local.slice(14, 16)) },
          zone, { overlap: "throw" }
        );
      } catch {
        ambiguous = true;
      }
      if (!ambiguous) assert.equal(Date.parse(back), minute, `${zone} ${local} is exact`);
      else assert.ok(Math.abs(Date.parse(back) - minute) <= 2 * 3_600_000, `${zone} ${local} is within the overlap`);
    }
  }
});

test("zonedTimeToUtc is monotonic: later wall clock never gives an earlier instant (outside the repeated hour)", () => {
  for (const zone of ["America/New_York", "Europe/London", "Australia/Lord_Howe", "Pacific/Chatham", "Africa/Casablanca", "Antarctica/Troll"]) {
    let last = -Infinity;
    for (let m = 0; m < 366 * 24 * 4; m += 1) {
      const wall = Date.UTC(2026, 0, 1) + m * 15 * 60_000;
      const d = new Date(wall);
      const t = zonedTimeToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() }, zone, { overlap: "later" }).getTime();
      // With overlap "later" the instant can step backwards only at the start of a repeated hour; the step is bounded.
      assert.ok(t >= last - 2 * 3_600_000, `${zone} ${d.toISOString()}`);
      last = Math.max(last, t);
    }
  }
});

// ---- datetime-local inputs -----------------------------------------------------------------------------------------------------

test("localInputToUtcIso / utcToLocalInput", () => {
  assert.equal(localInputToUtcIso("2026-10-25T07:51", "Africa/Nairobi"), "2026-10-25T04:51:00.000Z");
  assert.equal(localInputToUtcIso("2026-10-25T07:51:30", "Africa/Nairobi"), "2026-10-25T04:51:30.000Z");
  assert.equal(localInputToUtcIso("2026-10-25 07:51", "Africa/Nairobi"), "2026-10-25T04:51:00.000Z");
  assert.equal(localInputToUtcIso("2026-10-24T21:51", "America/Los_Angeles"), "2026-10-25T04:51:00.000Z");
  assert.equal(utcToLocalInput("2026-10-25T04:51:00Z", "Africa/Nairobi"), "2026-10-25T07:51");
  assert.equal(utcToLocalInput("2026-10-25T04:51:00Z", "Asia/Kathmandu"), "2026-10-25T10:36");
  assert.equal(utcToLocalInput("2026-10-25T04:51:00Z", "Pacific/Pago_Pago"), "2026-10-24T17:51");
  for (const bad of ["", "   ", null, undefined, "tomorrow", "2026-10-25", "2026-02-30T10:00", "2026-10-25T25:00", "2026-10-25T10:00Z"]) {
    assert.equal(localInputToUtcIso(bad, "UTC"), "", String(bad));
  }
  assert.equal(utcToLocalInput("nope", "UTC"), "");
});

test("a seller scheduling a flash sale for 09:00 gets the same wall clock back, wherever they are", () => {
  for (const zone of ZONES) {
    const stored = localInputToUtcIso("2026-12-24T09:00", zone);
    assert.equal(utcToLocalInput(stored, zone), "2026-12-24T09:00", zone);
  }
  // The same wall clock is a different instant in different zones, and that is the point of storing UTC.
  assert.notEqual(localInputToUtcIso("2026-12-24T09:00", "Africa/Nairobi"), localInputToUtcIso("2026-12-24T09:00", "America/New_York"));
});

// ---- display -------------------------------------------------------------------------------------------------------------------------

const T = "2026-10-25T04:51:00.000Z";
const en = { locale: "en-GB" };

test("formatDateTime converts the same instant for each viewer", () => {
  const at = (zone) => formatDateTime(T, { ...en, timeZone: zone });
  assert.match(at("Africa/Nairobi"), /25 Oct.*7:51\s?am/i);
  assert.match(at("UTC"), /25 Oct.*4:51\s?am/i);
  assert.match(at("America/New_York"), /25 Oct.*12:51\s?am/i, "EDT, still the 25th");
  assert.match(at("America/Los_Angeles"), /24 Oct.*9:51\s?pm/i, "the previous evening");
  assert.match(at("Asia/Kathmandu"), /25 Oct.*10:36\s?am/i, "+05:45");
  assert.match(at("Asia/Kolkata"), /25 Oct.*10:21\s?am/i, "+05:30");
  assert.match(at("Pacific/Kiritimati"), /25 Oct.*6:51\s?pm/i, "+14");
  assert.match(at("Pacific/Pago_Pago"), /24 Oct.*5:51\s?pm/i, "-11");
  assert.match(at("Australia/Lord_Howe"), /25 Oct.*3:51\s?pm/i, "+11:00 in DST");
});

test("the same UTC instant reads differently across a daylight saving change, with no code in the app changing", () => {
  const winter = formatTime("2026-01-15T12:00:00Z", { ...en, timeZone: "America/New_York" });
  const summer = formatTime("2026-07-15T12:00:00Z", { ...en, timeZone: "America/New_York" });
  assert.match(winter, /7:00\s?am/i);
  assert.match(summer, /8:00\s?am/i);
  assert.match(formatTime("2026-10-25T00:30:00Z", { ...en, timeZone: "Europe/London" }), /1:30\s?am/i, "first 01:30, BST");
  assert.match(formatTime("2026-10-25T01:30:00Z", { ...en, timeZone: "Europe/London" }), /1:30\s?am/i, "second 01:30, GMT");
});

test("formatDate uses the viewer's calendar day", () => {
  assert.match(formatDate("2026-10-25T21:30:00Z", { ...en, timeZone: "Africa/Nairobi" }), /26 Oct 2026/);
  assert.match(formatDate("2026-10-25T21:30:00Z", { ...en, timeZone: "America/Los_Angeles" }), /25 Oct 2026/);
});

test("formatInstant: honours the viewer's zone when none is passed, and renders nothing for junk", () => {
  setUserTimeZone("Pacific/Kiritimati");
  try {
    assert.match(formatDateTime(T, en), /6:51\s?pm/i);
    assert.equal(formatDateTime(T, { ...en, timeZone: "UTC" }).includes("4:51"), true, "an explicit zone wins");
  } finally {
    setUserTimeZone(null);
  }
  for (const bad of [null, undefined, "", "soon", "2026-10-25", "2026-10-25T04:51:00"]) {
    assert.equal(formatDateTime(bad), "", String(bad));
    assert.equal(formatDate(bad), "", String(bad));
  }
});

test("formatInstant: a viewer whose locale uses another calendar or digits still gets a sensible result", () => {
  assert.doesNotThrow(() => formatDateTime(T, { locale: "th-TH", timeZone: "Asia/Bangkok" }));
  assert.doesNotThrow(() => formatDateTime(T, { locale: "ar-EG", timeZone: "Africa/Cairo" }));
  assert.doesNotThrow(() => formatDateTime(T, { locale: "ja-JP", timeZone: "Asia/Tokyo" }));
  // The calculation helpers do not depend on locale.
  assert.equal(zonedDay(T, "Asia/Bangkok"), "2026-10-25");
  assert.equal(utcToLocalInput(T, "Asia/Bangkok"), "2026-10-25T11:51");
});

test("zoneLabel names the zone in force at that instant", () => {
  assert.match(zoneLabel("2026-01-15T12:00:00Z", "America/New_York", "en-US"), /EST/);
  assert.match(zoneLabel("2026-07-15T12:00:00Z", "America/New_York", "en-US"), /EDT/);
  assert.match(zoneLabel(T, "Africa/Nairobi", "en-GB"), /\+3|EAT/);
  assert.equal(zoneLabel("nope", "UTC"), "");
});

test("calendar days draw the same in every zone, never one day off", () => {
  assert.match(formatCalendarDay("2026-10-25", en), /25 Oct 2026/);
  assert.match(formatCalendarDay("2026-01-01", en), /1 Jan 2026/);
  assert.match(formatCalendarDay("2026-12-31", en), /31 Dec 2026/);
  assert.equal(formatCalendarDay("2026-02-30", en), "");
  assert.equal(formatCalendarDay("", en), "");
});

test("business days read the same wherever the viewer is", () => {
  const paidUntil = "2026-10-24T21:00:00.000Z"; // 25 Oct 00:00 in Nairobi
  for (const zone of ZONES) {
    setUserTimeZone(zone);
    try {
      assert.match(formatBusinessDay(paidUntil, en), /25 Oct 2026/, zone);
      assert.match(formatBusinessDay("2026-10-25", en), /25 Oct 2026/, zone);
    } finally {
      setUserTimeZone(null);
    }
  }
  // Whereas a plain instant moves with the viewer. This is the difference the two families exist to express.
  assert.match(formatDate(paidUntil, { ...en, timeZone: "America/Los_Angeles" }), /24 Oct 2026/);
  assert.equal(formatBusinessDay("junk"), "");
  assert.equal(formatBusinessDay(null), "");
});

test("daysFromToday counts calendar days in the viewer's zone", () => {
  const now = "2026-10-25T14:00:00Z"; // 10:00 in New York, 17:00 in Nairobi
  const lateSunday = "2026-10-26T03:30:00Z"; // 23:30 Sunday in New York, 06:30 Monday in Nairobi
  assert.equal(daysFromToday(lateSunday, now, "America/New_York"), 0);
  assert.equal(daysFromToday(lateSunday, now, "Africa/Nairobi"), 1);
  assert.equal(daysFromToday(now, now, "UTC"), 0);
  assert.equal(daysFromToday("2026-10-24T02:00:00Z", now, "UTC"), -1);
  assert.equal(daysFromToday("junk", now, "UTC"), null);
});

test("daysFromToday counts days, not 24 hour blocks, across daylight saving", () => {
  const evening = "2026-03-07T23:00:00-05:00"; // 7 Mar 23:00 in New York
  const nextEvening = "2026-03-08T23:00:00-04:00"; // 8 Mar 23:00, only 23 real hours later
  assert.equal(daysFromToday(nextEvening, evening, "America/New_York"), 1);
  const a = "2026-11-01T00:30:00-04:00";
  const b = "2026-11-02T00:30:00-05:00"; // 25 real hours later
  assert.equal(daysFromToday(b, a, "America/New_York"), 1);
});

// ---- the device zone is what a viewer gets when nothing overrides it ----------------------------------------------------------------

test("with no override the viewer's zone is the device's zone, and drawing agrees with the engine's own device formatting", () => {
  setUserTimeZone(null);
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  assert.equal(getUserTimeZone(), device);
  // ICU may report an alias for the zone TZ names (Asia/Katmandu for Asia/Kathmandu), so compare behaviour, not spelling.
  if (process.env.TZ) {
    assert.ok(isValidTimeZone(getUserTimeZone()));
    for (const iso of ["2026-01-15T12:00:00Z", "2026-07-15T12:00:00Z"]) assert.equal(tzOffsetMinutes(iso, getUserTimeZone()), tzOffsetMinutes(iso, process.env.TZ), `TZ=${process.env.TZ}`);
  }
  // The oracle is the engine's native device-zone formatting, which does not go through our code at all.
  for (const iso of ["2026-01-15T12:00:00Z", "2026-03-08T07:30:00Z", "2026-07-15T12:00:00Z", "2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z", "2026-11-01T06:30:00Z", "2026-12-31T23:59:00Z"]) {
    const native = new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
    assert.equal(formatTime(iso, { locale: "en-GB" }), native, `${iso} in ${device}`);
    const d = new Date(iso);
    const parts = zonedParts(iso);
    assert.deepEqual([parts.year, parts.month, parts.day, parts.hour, parts.minute], [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()], `${iso} wall clock in ${device}`);
    assert.ok(parts.offsetMinutes === -d.getTimezoneOffset(), `${iso} offset in ${device}`); // === because -0 equals 0 here
    assert.equal(utcToLocalInput(iso), `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  }
});
