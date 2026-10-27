import test from "node:test";
import assert from "node:assert/strict";
import { nairobiNow, isOpenOn, closingInfo, hoursRowsFor, DAYS } from "./utils.js";
import { statusOf, businessStatus } from "./openState.js";
import { formatDay, formatDateTime, daysLeft, dayOf } from "./billing.js";
import { setUserTimeZone } from "./time.js";

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

// The arithmetic these helpers used before: a fixed +3 hours. Nairobi has not changed offset since 1960.
const legacyNow = (date) => {
  const shifted = new Date(date.getTime() + 3 * 3600000);
  return { day: DAYS[shifted.getUTCDay()], minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), date: shifted.toISOString().slice(0, 10) };
};
const legacyDay = (d) => new Date(new Date(d).getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

test("nairobiNow gives exactly what the old fixed +3 arithmetic gave, over 20,000 instants from 1990 to 2060", () => {
  const next = rng(7);
  const lo = Date.UTC(1990, 0, 1);
  const span = Date.UTC(2060, 0, 1) - lo;
  for (let i = 0; i < 20_000; i += 1) {
    const d = new Date(lo + Math.floor(next() * span));
    assert.deepEqual(nairobiNow(d), legacyNow(d), d.toISOString());
  }
});

test("nairobiNow at the Nairobi midnight boundary", () => {
  assert.deepEqual(nairobiNow(new Date("2026-10-24T20:59:59.999Z")), { day: "sat", minutes: 1439, date: "2026-10-24" });
  assert.deepEqual(nairobiNow(new Date("2026-10-24T21:00:00.000Z")), { day: "sun", minutes: 0, date: "2026-10-25" });
});

test("nairobiNow ignores the device zone and the viewer's zone", () => {
  setUserTimeZone("Pacific/Kiritimati");
  try {
    assert.deepEqual(nairobiNow(new Date("2026-10-25T10:00:00Z")), { day: "sun", minutes: 13 * 60, date: "2026-10-25" });
  } finally {
    setUserTimeZone(null);
  }
});

test("nairobiNow rejects something that is not a date instead of returning NaN", () => {
  assert.throws(() => nairobiNow(new Date("nope")), RangeError);
});

test("billing day helpers match the old arithmetic", () => {
  const next = rng(11);
  for (let i = 0; i < 5000; i += 1) {
    const d = new Date(Date.UTC(2000, 0, 1) + Math.floor(next() * 60 * 365 * 86_400_000));
    assert.equal(dayOf(d), legacyDay(d));
    assert.equal(dayOf(d.toISOString()), legacyDay(d));
  }
  assert.equal(dayOf("2026-10-25"), "2026-10-25", "a bare day passes through");
  assert.throws(() => dayOf("garbage"), RangeError);
});

test("subscription days are the same for a viewer anywhere", () => {
  const paidUntil = "2026-10-24T21:00:00.000Z"; // 25 Oct in Nairobi
  const now = new Date("2026-10-23T12:00:00Z");
  for (const zone of ["Pacific/Pago_Pago", "America/Los_Angeles", "Europe/London", "Asia/Kathmandu", "Pacific/Kiritimati"]) {
    setUserTimeZone(zone);
    try {
      assert.equal(formatDay(paidUntil), "25 Oct 2026", zone);
      assert.equal(daysLeft(paidUntil, now), 2, zone);
    } finally {
      setUserTimeZone(null);
    }
  }
});

test("formatDateTime shows an instant in the viewer's zone with a label that matches", () => {
  const at = (zone, v) => {
    setUserTimeZone(zone);
    try {
      return formatDateTime(v);
    } finally {
      setUserTimeZone(null);
    }
  };
  const t = "2026-02-28T07:05:00.000Z";
  assert.equal(at("Africa/Nairobi", t), "28 Feb 2026, 10:05 EAT");
  assert.equal(at("America/New_York", t), "28 Feb 2026, 02:05 GMT-5");
  assert.equal(at("America/Los_Angeles", t), "27 Feb 2026, 23:05 GMT-8");
  assert.equal(at("Asia/Kathmandu", t), "28 Feb 2026, 12:50 GMT+5:45");
  assert.equal(at("Pacific/Kiritimati", t), "28 Feb 2026, 21:05 GMT+14");
  const summer = "2026-07-15T07:05:00.000Z";
  assert.equal(at("America/New_York", summer), "15 Jul 2026, 03:05 GMT-4", "daylight saving shows in both the time and the label");
  assert.equal(formatDateTime(""), "");
  assert.equal(formatDateTime(null), "");
  assert.throws(() => formatDateTime("junk"), RangeError);
});

// ---- Shop hours in a zone that has daylight saving --------------------------------------------------------------------------------

const NY = "America/New_York";
const weekdayHours = Object.fromEntries(DAYS.map((d) => [d, ["09:00", "17:00"]]));
const open = (hours, iso, zone = NY, exceptions = []) => isOpenOn(hours, exceptions, new Date(iso), zone);

test("a New York shop's 09:00 to 17:00 means local wall clock, in winter and summer", () => {
  assert.equal(open(weekdayHours, "2026-01-15T13:59:00Z"), false, "08:59 EST");
  assert.equal(open(weekdayHours, "2026-01-15T14:00:00Z"), true, "09:00 EST");
  assert.equal(open(weekdayHours, "2026-01-15T21:59:00Z"), true, "16:59 EST");
  assert.equal(open(weekdayHours, "2026-01-15T22:00:00Z"), false, "17:00 EST");
  assert.equal(open(weekdayHours, "2026-07-15T12:59:00Z"), false, "08:59 EDT");
  assert.equal(open(weekdayHours, "2026-07-15T13:00:00Z"), true, "09:00 EDT");
  assert.equal(open(weekdayHours, "2026-07-15T20:59:00Z"), true, "16:59 EDT");
  assert.equal(open(weekdayHours, "2026-07-15T21:00:00Z"), false, "17:00 EDT");
});

test("the shop opens at 09:00 local on the day clocks change", () => {
  assert.equal(open(weekdayHours, "2026-03-08T12:59:00Z"), false, "spring forward day, 08:59 EDT");
  assert.equal(open(weekdayHours, "2026-03-08T13:00:00Z"), true, "09:00 EDT");
  assert.equal(open(weekdayHours, "2026-11-01T13:59:00Z"), false, "fall back day, 08:59 EST");
  assert.equal(open(weekdayHours, "2026-11-01T14:00:00Z"), true, "09:00 EST");
});

test("an overnight shop over spring forward closes at the first 02:00 wall clock reading it reaches", () => {
  const night = { sat: ["22:00", "02:00"] };
  assert.equal(open(night, "2026-03-08T04:59:00Z", NY), true, "Sat 23:59 EST");
  assert.equal(open(night, "2026-03-08T06:30:00Z", NY), true, "01:30 EST");
  assert.equal(open(night, "2026-03-08T07:00:00Z", NY), false, "the clock jumps from 01:59 to 03:00, so it has closed");
});

test("an overnight shop over fall back stays open through the repeated hour", () => {
  const night = { sat: ["22:00", "02:00"] };
  assert.equal(open(night, "2026-11-01T05:30:00Z", NY), true, "first 01:30, EDT");
  assert.equal(open(night, "2026-11-01T06:30:00Z", NY), true, "second 01:30, EST");
  assert.equal(open(night, "2026-11-01T07:00:00Z", NY), false, "02:00 EST");
});

test("closingInfo and the week table follow the shop's zone", () => {
  const during = closingInfo(weekdayHours, [], new Date("2026-07-15T15:00:00Z"), NY);
  assert.deepEqual(during, { closesAt: "17:00", opensAt: null });
  const after = closingInfo(weekdayHours, [], new Date("2026-07-15T22:00:00Z"), NY);
  assert.deepEqual(after.opensAt, { day: "thu", time: "09:00", date: "2026-07-16" });
  const rows = hoursRowsFor(weekdayHours, [], new Date("2026-03-07T20:00:00Z"), NY);
  assert.equal(rows.length, 7);
  assert.equal(rows.find((r) => r.today).date, "2026-03-07");
  assert.deepEqual(rows.map((r) => r.date).sort(), ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11", "2026-03-12", "2026-03-13"], "seven distinct dates across spring forward, none skipped or doubled");
});

test("exceptions are matched by the shop's calendar date, not the viewer's", () => {
  const exceptions = [{ date: "2026-12-25", kind: "closed", intervals: [], note: "Christmas" }];
  // 2026-12-26T03:00Z is still 25 Dec in New York (22:00 EST) and already 26 Dec in Nairobi.
  assert.equal(open(weekdayHours, "2026-12-25T16:00:00Z", NY, exceptions), false, "closed all of the 25th in New York");
  assert.equal(open(weekdayHours, "2026-12-25T16:00:00Z", "Africa/Nairobi", exceptions), false, "19:00 on the 25th in Nairobi is also after hours");
  assert.equal(open(weekdayHours, "2026-12-26T14:30:00Z", NY, exceptions), true, "the 26th is a normal day again");
});

test("the default zone is still Nairobi", () => {
  assert.equal(isOpenOn(weekdayHours, [], new Date("2026-10-25T06:00:00Z")), true, "09:00 Nairobi");
  assert.equal(isOpenOn(weekdayHours, [], new Date("2026-10-25T05:59:00Z")), false, "08:59 Nairobi");
  const status = statusOf(weekdayHours, [], new Date("2026-10-25T05:00:00Z"));
  assert.equal(status.headline, "Closed");
  assert.equal(status.reopens, "Reopens today at 9:00 AM EAT");
});

test("statusOf in another zone reads the same story in that zone's time", () => {
  const status = statusOf(weekdayHours, [], new Date("2026-07-15T12:00:00Z"), NY); // 08:00 EDT
  assert.equal(status.headline, "Closed");
  assert.equal(status.reopens, "Reopens today at 9:00 AM GMT-4", "labelled with the shop's own zone, never Nairobi's");
  assert.equal(businessStatus(weekdayHours, [], new Date("2026-07-15T14:00:00Z"), NY).isOpen, true);
});

// ---- Sweeps: the business does not care where the viewer is -----------------------------------------------------------------------

const VIEWERS = ["UTC", "Africa/Nairobi", "America/New_York", "America/Los_Angeles", "America/Havana", "America/St_Johns", "Europe/London",
  "Asia/Kathmandu", "Australia/Lord_Howe", "Pacific/Chatham", "Pacific/Apia", "Pacific/Kiritimati", "Pacific/Pago_Pago"];

// Dense instants around every clock change that matters, in both hemispheres, plus New Year in the Pacific.
const WINDOWS = [
  ["2026-03-07T00:00:00Z", "2026-03-10T00:00:00Z"], // US spring forward (8 Mar), Havana midnight start
  ["2026-03-28T00:00:00Z", "2026-03-31T00:00:00Z"], // UK/EU spring forward (29 Mar)
  ["2026-04-03T00:00:00Z", "2026-04-07T00:00:00Z"], // Sydney and Lord Howe fall back (5 Apr)
  ["2026-10-02T00:00:00Z", "2026-10-06T00:00:00Z"], // Sydney and Lord Howe spring forward (4 Oct)
  ["2026-10-24T00:00:00Z", "2026-10-27T00:00:00Z"], // UK/EU fall back (25 Oct)
  ["2026-10-31T00:00:00Z", "2026-11-03T00:00:00Z"], // US fall back (1 Nov)
  ["2026-12-30T00:00:00Z", "2027-01-02T00:00:00Z"]  // New Year crossing the date line
];

test("shop status and the Nairobi clock do not depend on the viewer's zone, minute by minute across every DST change", () => {
  const hours = { ...Object.fromEntries(DAYS.map((d) => [d, ["09:00", "17:00"]])), sat: ["22:00", "02:00"] };
  const exceptions = [{ date: "2026-10-25", kind: "closed", intervals: [], note: "" }];
  let checked = 0;
  for (const [from, to] of WINDOWS) {
    for (let t = Date.parse(from); t < Date.parse(to); t += 7 * 60_000) {
      const date = new Date(t);
      const baseline = { now: nairobiNow(date), status: statusOf(hours, exceptions, date) };
      for (const zone of VIEWERS) {
        setUserTimeZone(zone);
        try {
          assert.deepEqual({ now: nairobiNow(date), status: statusOf(hours, exceptions, date) }, baseline, `${zone} ${date.toISOString()}`);
        } finally {
          setUserTimeZone(null);
        }
      }
      checked += 1;
    }
  }
  assert.ok(checked > 4000, `swept ${checked} instants`);
});

test("billing days and subscription state do not depend on the viewer's zone across every DST change", () => {
  for (const [from, to] of WINDOWS) {
    for (let t = Date.parse(from); t < Date.parse(to); t += 53 * 60_000) {
      const date = new Date(t);
      const baseline = { day: dayOf(date), label: formatDay(date), left: daysLeft("2026-11-30T21:00:00.000Z", date) };
      for (const zone of VIEWERS) {
        setUserTimeZone(zone);
        try {
          assert.deepEqual({ day: dayOf(date), label: formatDay(date), left: daysLeft("2026-11-30T21:00:00.000Z", date) }, baseline, `${zone} ${date.toISOString()}`);
        } finally {
          setUserTimeZone(null);
        }
      }
    }
  }
});
