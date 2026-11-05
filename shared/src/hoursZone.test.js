import { test } from "node:test";
import assert from "node:assert/strict";
import { businessStatus, statusOf } from "./openState.js";
import { hoursRowsFor, isOpenOn, openAllDayNow } from "./utils.js";
import { shopTimeNote } from "./shopTime.js";
import { zonedTimeToUtc } from "./time.js";

const SHOP_ZONES = ["Africa/Nairobi", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland"];
const VIEW_ZONES = ["America/New_York", "Europe/London"];
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const everyDay = (slot) => Object.fromEntries(WEEK.map((d) => [d, slot]));

const at = (zone, y, mo, d, h, mi = 0, ms = 0) => new Date(zonedTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: mi }, zone).getTime() + ms);
const open = (hours, ex, instant, zone) => businessStatus(hours, ex, instant, zone).isOpen;

test("a 24-hour shop is open at 23:59:30 and across midnight in every shop zone", () => {
  for (const zone of SHOP_ZONES) {
    const hours = everyDay(["00:00", "23:59"]);
    assert.equal(open(hours, [], at(zone, 2026, 11, 4, 23, 59, 30000), zone), true, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 5, 0, 0), zone), true, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 4, 12, 0), zone), true, zone);
  }
});

test("a 24-hour shop reports no closing time while the next day is also open", () => {
  const hours = everyDay(["00:00", "23:59"]);
  const now = at("Africa/Nairobi", 2026, 11, 4, 23, 59, 30000);
  assert.equal(businessStatus(hours, [], now, "Africa/Nairobi").closesAt, null);
  assert.equal(statusOf(hours, [], now, "Africa/Nairobi").headline, "Open now");
  assert.equal(statusOf(hours, [], now, "Africa/Nairobi").closes, null);
});

test("a 24-hour day before a closed day still closes at the end of that day", () => {
  const hours = { wed: ["00:00", "23:59"] };
  const wed = at("Africa/Nairobi", 2026, 11, 4, 23, 59, 30000);
  assert.equal(openAllDayNow(hours, [], wed, "Africa/Nairobi"), false);
  assert.equal(businessStatus(hours, [], wed, "Africa/Nairobi").isOpen, true);
  assert.equal(businessStatus(hours, [], wed, "Africa/Nairobi").closesAt, "23:59");
  assert.equal(open(hours, [], at("Africa/Nairobi", 2026, 11, 5, 0, 0), "Africa/Nairobi"), false);
});

test("a special 24-hour exception is open at 23:59:30", () => {
  const ex = [{ id: "1", date: "2026-11-04", kind: "special", intervals: [["00:00", "23:59"]], note: null }];
  assert.equal(open({}, ex, at("Asia/Kolkata", 2026, 11, 4, 23, 59, 30000), "Asia/Kolkata"), true);
});

test("an unknown or empty shop zone falls back to Nairobi instead of throwing", () => {
  const hours = everyDay(["08:00", "18:00"]);
  const now = at("Africa/Nairobi", 2026, 11, 4, 9, 0);
  for (const bad of ["Mars/Phobos", "", null, undefined, 42]) {
    assert.doesNotThrow(() => statusOf(hours, [], now, bad, "Europe/London"), String(bad));
    assert.equal(statusOf(hours, [], now, bad).isOpen, true, String(bad));
    assert.deepEqual(businessStatus(hours, [], now, bad), businessStatus(hours, [], now, "Africa/Nairobi"));
  }
});

test("a closed exception is the shop's own date, not Nairobi's, in every shop zone", () => {
  const hours = everyDay(["08:00", "22:00"]);
  for (const zone of SHOP_ZONES) {
    const ex = [{ id: "1", date: "2026-11-02", kind: "closed", intervals: [], note: null }];
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 19, 0), zone), false, `${zone} 19:00 on the closed day`);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 0, 5), zone), false, `${zone} just after midnight`);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 23, 30), zone), false, `${zone} late evening`);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 3, 9, 0), zone), true, `${zone} next morning`);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 1, 20, 0), zone), true, `${zone} the evening before`);
  }
});

test("special hours apply on the shop's own date in every shop zone", () => {
  const hours = everyDay(["08:00", "18:00"]);
  for (const zone of SHOP_ZONES) {
    const ex = [{ id: "1", date: "2026-11-02", kind: "special", intervals: [["13:00", "14:00"]], note: null }];
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 9, 0), zone), false, zone);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 13, 30), zone), true, zone);
    assert.equal(open(hours, ex, at(zone, 2026, 11, 2, 14, 0), zone), false, zone);
  }
});

test("an overnight shift carries into the next day, and a closed next day cuts it at midnight", () => {
  for (const zone of SHOP_ZONES) {
    const hours = { mon: ["20:00", "02:00"] };
    assert.equal(open(hours, [], at(zone, 2026, 11, 2, 23, 0), zone), true, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 3, 1, 59), zone), true, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 3, 2, 0), zone), false, zone);
    const cut = [{ id: "1", date: "2026-11-03", kind: "closed", intervals: [], note: null }];
    assert.equal(open(hours, cut, at(zone, 2026, 11, 3, 1, 0), zone), false, `${zone} closed next day`);
    const special = [{ id: "1", date: "2026-11-03", kind: "special", intervals: [["10:00", "12:00"]], note: null }];
    assert.equal(open(hours, special, at(zone, 2026, 11, 3, 1, 0), zone), true, `${zone} carry-over before the special starts`);
  }
});

test("midnight boundary of a normal day", () => {
  for (const zone of SHOP_ZONES) {
    const hours = { tue: ["00:00", "06:00"], mon: ["22:00", "23:59"] };
    assert.equal(open(hours, [], at(zone, 2026, 11, 3, 0, 0), zone), true, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 3, 6, 0), zone), false, zone);
    assert.equal(open(hours, [], at(zone, 2026, 11, 2, 23, 59, 30000), zone), false, `${zone} only 00:00 to 23:59 runs to midnight`);
  }
});

test("daylight saving change days keep wall-clock hours", () => {
  const cases = [
    ["America/Los_Angeles", [2026, 3, 8]],
    ["America/Los_Angeles", [2026, 11, 1]],
    ["Pacific/Auckland", [2026, 9, 27]],
    ["Pacific/Auckland", [2026, 4, 5]]
  ];
  for (const [zone, [y, m, d]] of cases) {
    const hours = everyDay(["08:00", "18:00"]);
    assert.equal(open(hours, [], at(zone, y, m, d, 9, 0), zone), true, `${zone} ${y}-${m}-${d} 09:00`);
    assert.equal(open(hours, [], at(zone, y, m, d, 17, 59), zone), true, `${zone} 17:59`);
    assert.equal(open(hours, [], at(zone, y, m, d, 18, 0), zone), false, `${zone} 18:00`);
    assert.equal(open(hours, [], at(zone, y, m, d, 7, 59), zone), false, `${zone} 07:59`);
  }
});

test("the hours table and note are right for every shop zone seen from every viewer zone", () => {
  for (const shop of SHOP_ZONES) {
    for (const viewer of [...VIEW_ZONES, shop]) {
      const hours = { ...everyDay(["09:00", "17:00"]), sun: ["00:00", "23:59"] };
      const rows = hoursRowsFor(hours, [], at(shop, 2026, 11, 4, 12, 0), shop, viewer);
      assert.equal(rows.length, 7, `${shop} ${viewer}`);
      assert.deepEqual(rows.map((r) => r.day), WEEK);
      const sun = rows.find((r) => r.day === "sun");
      assert.equal(sun.text, "Open 24 hours");
      assert.equal(sun.viewerText, null);
      assert.equal(sun.shopLabel, "");
      const mon = rows.find((r) => r.day === "mon");
      assert.equal(mon.text, "9:00 AM to 5:00 PM");
      assert.match(shopTimeNote(at(shop, 2026, 11, 4, 12, 0), { shopZone: shop, viewerZone: viewer }), /^Hours are in shop time \(/);
      if (viewer === shop) assert.equal(mon.viewerText, null, "same zone shows no second clock");
      else assert.ok(mon.viewerText, `${shop} seen from ${viewer} shows the viewer's clock`);
    }
  }
});

test("the shop's status does not depend on who is looking", () => {
  const hours = everyDay(["08:00", "18:00"]);
  const now = at("America/Los_Angeles", 2026, 11, 2, 19, 0);
  const a = statusOf(hours, [], now, "America/Los_Angeles", "Europe/London");
  const b = statusOf(hours, [], now, "America/Los_Angeles", "America/New_York");
  assert.equal(a.isOpen, b.isOpen);
  assert.equal(isOpenOn(hours, [], now, "America/Los_Angeles"), a.isOpen);
});

test("a closed-all-day exception holds for the shop's whole calendar day, west of Nairobi", () => {
  const hours = everyDay(["09:00", "21:00"]);
  const cases = [["America/Los_Angeles", [2026, 11, 2]], ["Pacific/Honolulu", [2026, 11, 2]], ["America/New_York", [2026, 11, 2]], ["America/Anchorage", [2026, 11, 2]]];
  for (const [zone, [y, mo, d]] of cases) {
    const closed = [{ id: "x", date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, kind: "closed", intervals: [], note: null }];
    for (const [h, mi] of [[0, 5], [10, 0], [19, 0], [23, 30]]) {
      const now = at(zone, y, mo, d, h, mi);
      assert.equal(open(hours, closed, now, zone), false, `${zone} ${h}:${mi}`);
      assert.equal(statusOf(hours, closed, now, zone).reason?.kind, "closed_day", `${zone} ${h}:${mi}`);
    }
    assert.equal(open(hours, closed, at(zone, y, mo, d + 1, 10, 0), zone), true, `${zone} next morning`);
  }
});

test("exceptions and the date they key on follow the shop across daylight saving and half-hour zones", () => {
  const hours = everyDay(["09:00", "21:00"]);
  for (const zone of ["America/Los_Angeles", "America/New_York", "Asia/Kolkata", "Asia/Kathmandu", "Australia/Adelaide"]) {
    for (const [y, mo, d] of [[2026, 3, 8], [2026, 11, 1], [2026, 10, 4]]) {
      const date = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const special = [{ id: "s", date, kind: "special", intervals: [["12:00", "14:00"]], note: null }];
      assert.equal(open(hours, special, at(zone, y, mo, d, 13, 0), zone), true, `${zone} ${date} 13:00`);
      assert.equal(open(hours, special, at(zone, y, mo, d, 10, 0), zone), false, `${zone} ${date} 10:00`);
      assert.equal(open(hours, special, at(zone, y, mo, d, 20, 0), zone), false, `${zone} ${date} 20:00`);
    }
  }
});
