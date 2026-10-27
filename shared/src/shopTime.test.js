import test from "node:test";
import assert from "node:assert/strict";
import { shopClock, shopTimeText, shopIntervalView, shopDayInViewer, nextShopDateOf, shopTimeNote, viewerClockText } from "./shopTime.js";
import { hoursRowsFor } from "./utils.js";
import { statusOf } from "./openState.js";
import { zonedParts } from "./time.js";

// Every zone here is read from the runtime's tz database. Expected values below are worked out by hand from the UTC
// instant, never by adding a fixed offset to the answer.
const VIEWERS = [
  "UTC", "Africa/Nairobi", "Asia/Dubai", "Asia/Kolkata", "Asia/Kathmandu", "Asia/Tokyo", "Asia/Tehran", "Australia/Adelaide",
  "Australia/Lord_Howe", "Pacific/Auckland", "Pacific/Chatham", "Pacific/Apia", "Pacific/Kiritimati", "Pacific/Pago_Pago",
  "America/Sao_Paulo", "America/New_York", "America/Los_Angeles", "America/St_Johns", "America/Havana", "America/Santiago",
  "Europe/London", "Europe/Paris", "Atlantic/Azores", "Africa/Casablanca", "Antarctica/Troll"
];

test("the Mumbai example: a shop closing 22:00 on 26 Oct reads correctly in other zones", () => {
  const shop = { shopZone: "Asia/Kolkata" };
  const read = (viewerZone) => shopTimeText("2026-10-26", "22:00", { ...shop, viewerZone });
  // 22:00 IST is 16:30 UTC.
  assert.equal(read("Asia/Kolkata"), "10:00 PM GMT+5:30");
  assert.equal(read("Africa/Nairobi"), "10:00 PM GMT+5:30 · 7:30 PM your time");
  assert.equal(read("Asia/Dubai"), "10:00 PM GMT+5:30 · 8:30 PM your time");
  assert.equal(read("Asia/Kathmandu"), "10:00 PM GMT+5:30 · 10:15 PM your time");
  assert.equal(read("America/Sao_Paulo"), "10:00 PM GMT+5:30 · 1:30 PM your time");
  assert.equal(read("America/New_York"), "10:00 PM GMT+5:30 · 12:30 PM your time", "EDT, UTC-4, until 1 Nov");
  assert.equal(read("Pacific/Auckland"), "10:00 PM GMT+5:30 · Tue 5:30 AM your time", "NZDT UTC+13, and it is already the 27th there");
  assert.equal(read("Pacific/Pago_Pago"), "10:00 PM GMT+5:30 · 5:30 AM your time", "UTC-11, same date");
  assert.equal(read("Pacific/Kiritimati"), "10:00 PM GMT+5:30 · Tue 6:30 AM your time", "UTC+14");
});

test("no viewer zone: the shop's time with its label, for everyone (what a server prints)", () => {
  assert.equal(shopTimeText("2026-10-27", "18:00", {}), "6:00 PM EAT");
  assert.equal(shopTimeText("2026-10-27", "18:00", { viewerZone: "Not/AZone" }), "6:00 PM EAT", "a bad viewer zone is ignored, not thrown");
  assert.equal(shopTimeText("2026-10-27", "18:00", { shopZone: "Not/AZone" }), "6:00 PM EAT", "a bad shop zone falls back to the business default");
});

test("the example from the brief: 6:00 PM EAT is 7:00 PM in Dubai", () => {
  assert.equal(shopTimeText("2026-10-27", "18:00", { viewerZone: "Asia/Dubai" }), "6:00 PM EAT · 7:00 PM your time");
  assert.equal(shopTimeText("2026-10-27", "18:00", { viewerZone: "Africa/Nairobi" }), "6:00 PM EAT", "same clock: nothing extra");
  assert.equal(shopTimeText("2026-10-27", "18:00", { viewerZone: "Africa/Kampala" }), "6:00 PM EAT", "another zone with the same offset");
});

test("an exception 13:00 to 14:00 EAT is 7:00 to 8:00 for a viewer in Brazil, not 1 to 2 PM", () => {
  const v = shopIntervalView("2026-10-27", ["13:00", "14:00"], { viewerZone: "America/Sao_Paulo" });
  assert.equal(v.shopText, "1:00 PM to 2:00 PM");
  assert.equal(v.shopLabel, "EAT");
  assert.equal(v.viewerText, "7:00 AM to 8:00 AM");
  assert.equal(v.viewerLabel, "GMT-3");
});

test("an interval that crosses the viewer's midnight names the day", () => {
  const v = shopIntervalView("2026-10-27", ["01:00", "03:00"], { viewerZone: "America/Sao_Paulo" }); // 19:00-21:00 on the 26th
  assert.equal(v.viewerText, "Mon 7:00 PM to Mon 9:00 PM");
  const w = shopIntervalView("2026-10-27", ["20:00", "02:00"], { viewerZone: "Asia/Tokyo" }); // Tokyo +9: 02:00 to 08:00 next day
  assert.equal(w.overnight, true);
  assert.equal(w.viewerText, "Wed 2:00 AM to Wed 8:00 AM");
  const x = shopIntervalView("2026-10-27", ["20:00", "02:00"], { viewerZone: "America/Sao_Paulo" }); // 14:00 to 20:00, same day
  assert.equal(x.viewerText, "Tue 2:00 PM to Tue 8:00 PM", "the shop end is Wednesday, the viewer end is still Tuesday");
});

test("an all-day closed exception becomes the stretch of the viewer's clock it covers", () => {
  const sp = shopDayInViewer("2026-10-27", { viewerZone: "America/Sao_Paulo" });
  assert.equal(sp.from, "Mon 26 Oct 6:00 PM");
  assert.equal(sp.to, "Tue 27 Oct 6:00 PM");
  assert.equal(shopDayInViewer("2026-10-27", { viewerZone: "Africa/Nairobi" }), null);
  assert.equal(shopDayInViewer("2026-10-27", {}), null);
});

test("viewer daylight saving on the date is used, not today's offset", () => {
  // New York leaves DST on 1 Nov 2026. 18:00 Nairobi is 15:00 UTC: 11:00 EDT on 31 Oct, 10:00 EST on 2 Nov.
  assert.equal(shopClock("2026-10-31", "18:00", { viewerZone: "America/New_York" }).viewer.clock, "11:00 AM");
  assert.equal(shopClock("2026-11-02", "18:00", { viewerZone: "America/New_York" }).viewer.clock, "10:00 AM");
  // Sao Paulo has no DST now but a shop in London does: 17:00 London is 16:00 UTC in summer, 17:00 UTC in winter.
  const london = { shopZone: "Europe/London", viewerZone: "America/Sao_Paulo" };
  assert.equal(shopClock("2026-10-24", "17:00", london).viewer.clock, "1:00 PM");
  assert.equal(shopClock("2026-10-26", "17:00", london).viewer.clock, "2:00 PM");
});

test("shop daylight saving gaps and overlaps resolve like zonedTimeToUtc", () => {
  const ny = { shopZone: "America/New_York", viewerZone: "UTC" };
  const gap = shopClock("2026-03-08", "02:30", ny); // does not exist: moves to 03:30 EDT = 07:30 UTC
  assert.equal(gap.adjusted, true);
  assert.equal(gap.viewer.time, "07:30");
  const overlap = shopClock("2026-11-01", "01:30", ny); // twice: the first, 01:30 EDT = 05:30 UTC
  assert.equal(overlap.viewer.time, "05:30");
  assert.equal(overlap.adjusted, false);
  // Havana starts DST at midnight (00:00 does not exist on 8 Mar 2026): handled, no throw.
  assert.doesNotThrow(() => shopClock("2026-03-08", "00:30", { shopZone: "America/Havana", viewerZone: "UTC" }));
});

test("invalid input gives empty output, never a throw or 'Invalid Date'", () => {
  for (const [d, t] of [["2026-02-30", "10:00"], ["2026-10-27", "24:00"], ["2026-10-27", "9:00"], ["", "10:00"], [null, null], ["2026-10-27", undefined]]) {
    assert.equal(shopClock(d, t, {}), null);
    assert.equal(shopTimeText(d, t, {}), "");
  }
  assert.equal(shopIntervalView("2026-10-27", ["10:00"], {}), null);
  assert.equal(viewerClockText(null), "");
});

test("round trip in 25 viewer zones: the viewer's reading is the same instant as the shop's", () => {
  const shopZones = ["Africa/Nairobi", "Asia/Kolkata", "Asia/Dubai", "America/New_York", "Europe/London", "Australia/Sydney"];
  const days = ["2026-03-07", "2026-03-08", "2026-03-28", "2026-03-29", "2026-04-04", "2026-04-05", "2026-10-03", "2026-10-04", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-31", "2026-11-01", "2026-12-31"];
  let n = 0;
  for (const shopZone of shopZones) {
    for (const date of days) {
      for (const time of ["00:00", "00:30", "02:30", "09:00", "12:00", "17:45", "22:00", "23:59"]) {
        for (const viewerZone of VIEWERS) {
          const c = shopClock(date, time, { shopZone, viewerZone });
          // The viewer's clock, read back from the instant by an independent path, matches.
          const p = zonedParts(c.instant, viewerZone);
          assert.equal(c.viewer.time, `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`, `${shopZone} ${date} ${time} -> ${viewerZone}`);
          assert.equal(c.viewer.date, `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`);
          // The shop's own reading is what was typed, except in a daylight saving gap.
          if (!c.adjusted) assert.deepEqual([c.shop.date, c.shop.time], [date, time]);
          n += 1;
        }
      }
    }
  }
  assert.ok(n > 16000, `checked ${n}`);
});

test("the shop's status does not change with the viewer; only the words around it do", () => {
  const hours = { tue: ["09:00", "18:00"], mon: ["09:00", "18:00"] };
  const at = new Date("2026-10-27T12:00:00Z"); // 15:00 Tuesday in Nairobi: open
  const base = statusOf(hours, [], at);
  assert.equal(base.isOpen, true);
  assert.equal(base.closes, "Closes 6:00 PM EAT");
  for (const viewerZone of VIEWERS) {
    const s = statusOf(hours, [], at, undefined, viewerZone);
    assert.equal(s.isOpen, base.isOpen, viewerZone);
    assert.equal(s.closesAt, base.closesAt, viewerZone);
    assert.ok(s.closes.startsWith("Closes 6:00 PM EAT"), `${viewerZone}: ${s.closes}`);
  }
  assert.equal(statusOf(hours, [], at, undefined, "Asia/Dubai").closes, "Closes 6:00 PM EAT · 7:00 PM your time");
  assert.equal(statusOf(hours, [], at, undefined, "America/Sao_Paulo").closes, "Closes 6:00 PM EAT · 12:00 PM your time");
});

test("a Mumbai shop: open/closed is read in Mumbai, and the closing line converts", () => {
  const hours = { mon: ["10:00", "22:00"] };
  const mon = (time) => new Date(`2026-10-26T${time}:00+05:30`); // Monday 26 Oct in Mumbai
  assert.equal(statusOf(hours, [], mon("21:59"), "Asia/Kolkata").isOpen, true);
  assert.equal(statusOf(hours, [], mon("22:00"), "Asia/Kolkata").isOpen, false);
  // The same two instants read as Nairobi would say the shop is open until 19:30 Nairobi, i.e. the wrong shop clock.
  assert.equal(statusOf(hours, [], mon("21:59"), "Asia/Kolkata", "America/Sao_Paulo").closes, "Closes 10:00 PM GMT+5:30 · 1:30 PM your time");
});

test("reopening line: shop wording first, viewer reading after, weekday when the days differ", () => {
  const hours = { tue: ["09:00", "18:00"], wed: ["09:00", "18:00"] };
  const night = new Date("2026-10-27T19:00:00Z"); // 22:00 Tuesday in Nairobi, closed; reopens Wed 09:00 EAT = 06:00 UTC
  const s = statusOf(hours, [], night, undefined, "America/Sao_Paulo"); // 03:00 Wed in Brazil, same date
  assert.equal(s.reopens, "Reopens tomorrow at 9:00 AM EAT · 3:00 AM your time");
  const t = statusOf(hours, [], night, undefined, "Pacific/Auckland"); // 19:00 Wed, same date
  assert.equal(t.reopens, "Reopens tomorrow at 9:00 AM EAT · 7:00 PM your time");
  const u = statusOf({ wed: ["01:00", "05:00"] }, [], night, undefined, "America/Sao_Paulo"); // 01:00 EAT Wed = 19:00 Tue in Brazil
  assert.equal(u.reopens, "Reopens tomorrow at 1:00 AM EAT · Tue 7:00 PM your time");
});

test("hours rows: shop text unchanged, viewer text and labels added only when asked", () => {
  const hours = { mon: ["09:00", "18:00"], tue: ["09:00", "18:00"], sat: ["22:00", "02:00"] };
  const ex = [
    { date: "2026-10-27", kind: "special", intervals: [["13:00", "14:00"]], note: "Restocking" },
    { date: "2026-10-28", kind: "closed", intervals: [], note: null }
  ];
  const now = new Date("2026-10-27T05:00:00Z");
  const plain = hoursRowsFor(hours, ex, now);
  assert.ok(plain.every((r) => r.viewerText === null && r.shopLabel === "EAT"));
  const br = hoursRowsFor(hours, ex, now, undefined, "America/Sao_Paulo");
  const tue = br.find((r) => r.date === "2026-10-27");
  assert.equal(tue.text, "1:00 PM to 2:00 PM", "the shop's own words are untouched");
  assert.equal(tue.viewerText, "7:00 AM to 8:00 AM");
  assert.equal(tue.note, "Restocking");
  const wed = br.find((r) => r.date === "2026-10-28");
  assert.equal(wed.text, "Closed");
  assert.equal(wed.viewerText, "Closed Tue 27 Oct 6:00 PM to Wed 28 Oct 6:00 PM");
  const sat = br.find((r) => r.day === "sat");
  assert.equal(sat.viewerText, "Sat 4:00 PM to Sat 8:00 PM", "22:00 to 02:00 EAT is 16:00 to 20:00 in Brazil; the end is the previous date from the shop's");
  const nairobi = hoursRowsFor(hours, ex, now, undefined, "Africa/Nairobi");
  assert.ok(nairobi.every((r) => r.viewerText === null), "a viewer on shop time sees no second line");
});

test("hours rows for a Mumbai shop use Mumbai dates and labels", () => {
  const hours = { mon: ["10:00", "22:00"] };
  const ex = [{ date: "2026-10-26", kind: "special", intervals: [["10:00", "22:00"]], note: null }];
  const rows = hoursRowsFor(hours, ex, new Date("2026-10-26T01:00:00Z"), "Asia/Kolkata", "America/New_York");
  const mon = rows.find((r) => r.date === "2026-10-26");
  assert.equal(mon.shopLabel, "GMT+5:30");
  assert.equal(mon.text, "10:00 AM to 10:00 PM");
  assert.equal(mon.viewerText, "12:30 AM to 12:30 PM", "00:30 EDT to 12:30 EDT on the 26th");
});

test("nextShopDateOf: the next closing clock is today if still ahead of the shop clock, else tomorrow", () => {
  assert.equal(nextShopDateOf("18:00", new Date("2026-10-27T12:00:00Z")), "2026-10-27");
  assert.equal(nextShopDateOf("02:00", new Date("2026-10-27T20:00:00Z")), "2026-10-28", "23:00 Nairobi, closes after midnight");
  assert.equal(nextShopDateOf("18:00", new Date("2026-10-27T21:30:00Z")), "2026-10-28", "00:30 Nairobi on the 28th, a 18:00 clock is still ahead on the 28th");
});

test("a shop-time note: always names the shop zone", () => {
  assert.equal(shopTimeNote(new Date("2026-10-27T12:00:00Z"), {}), "Hours are in shop time (EAT).");
  assert.equal(shopTimeNote(new Date("2026-10-27T12:00:00Z"), { viewerZone: "Asia/Dubai" }), "Hours are in shop time (EAT). Your time is shown too.");
  assert.equal(shopTimeNote(new Date("2026-10-27T12:00:00Z"), { viewerZone: "Africa/Nairobi" }), "Hours are in shop time (EAT).");
});

import { describeExceptionForViewer } from "./shopTime.js";

test("exception wording: the restocking example, 1 to 2 PM EAT, for a viewer in Brazil", () => {
  const e = { date: "2026-10-27", kind: "special", intervals: [["13:00", "14:00"]], note: "Restocking" };
  assert.deepEqual(describeExceptionForViewer(e, { viewerZone: "America/Sao_Paulo" }), {
    shopText: "Special hours: 1:00 PM to 2:00 PM EAT",
    viewerText: "Special hours: 7:00 AM to 8:00 AM your time"
  });
  assert.equal(describeExceptionForViewer(e, { viewerZone: "Africa/Nairobi" }).viewerText, null);
  assert.equal(describeExceptionForViewer(e, {}).viewerText, null);
  const closed = describeExceptionForViewer({ date: "2026-10-27", kind: "closed", intervals: [] }, { viewerZone: "Pacific/Auckland" });
  assert.equal(closed.shopText, "Closed all day (EAT)");
  assert.equal(closed.viewerText, "Closed Tue 27 Oct 10:00 AM to Wed 28 Oct 10:00 AM your time", "Nairobi midnight is 21:00 UTC, NZDT is UTC+13");
  assert.deepEqual(describeExceptionForViewer({ date: "bad", kind: "closed" }, {}), { shopText: "", viewerText: null });
});

test("closed-all-day on a viewer's daylight saving change follows the real 23/25 hour day", () => {
  // New York leaves DST on 1 Nov 2026. Dubai (UTC+4) midnight starting 1 Nov is 20:00 UTC on 31 Oct = 16:00 EDT; midnight ending it is 20:00 UTC on 1 Nov = 15:00 EST.
  const d = shopDayInViewer("2026-11-01", { shopZone: "Asia/Dubai", viewerZone: "America/New_York" });
  assert.equal(d.from, "Sat 31 Oct 4:00 PM");
  assert.equal(d.to, "Sun 1 Nov 3:00 PM");
});
