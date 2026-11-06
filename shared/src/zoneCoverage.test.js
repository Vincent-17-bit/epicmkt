import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONE_NAMES, zoneAbbreviation } from "./zoneNames.js";
import { shopClock, shopZoneLabel, shopTimeText } from "./shopTime.js";
import { isValidTimeZone, tzOffsetMinutes } from "./time.js";
import { businessStatus } from "./openState.js";

const ZONES = Intl.supportedValuesOf("timeZone");
const OFFSETS = {
  UTC: 0, EAT: 180, CAT: 120, WAT: 60, CET: 60, CEST: 120, EET: 120, EEST: 180, GMT: 0, BST: 60,
  SAST: 120, MSK: 180, GST: 240, PKT: 300, SGT: 480, HKT: 480, JST: 540, KST: 540, IST: 330,
  EST: -300, EDT: -240, CST: -360, CDT: -300, MST: -420, MDT: -360, PST: -480, PDT: -420,
  AKST: -540, AKDT: -480, HST: -600, AEST: 600, AEDT: 660, ACST: 570, ACDT: 630, AWST: 480,
  NZST: 720, NZDT: 780
};
const LABEL = /^(?:[A-Z]{2,5}|GMT[+-]\d{1,2}(?::\d{2})?)$/;
const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const instants = [];
for (const year of [2025, 2026, 2027, 2028]) for (let month = 0; month < 12; month++) for (const day of [1, 15, 28]) instants.push(new Date(Date.UTC(year, month, day, 12)));

test("every zone gets a short name or GMT form", () => {
  for (const zone of ZONES) {
    for (const at of [instants[0], instants[18], instants[30]]) assert.match(shopZoneLabel(at, zone), LABEL, zone);
  }
});

test("every named zone matches its real offset in every month", () => {
  for (const zone of Object.keys(ZONE_NAMES)) {
    for (const at of instants) {
      const name = zoneAbbreviation(at, zone);
      const offset = tzOffsetMinutes(at, zone);
      if (name === null) continue;
      const expected = zone === "Europe/Dublin" && name === "IST" ? 60 : OFFSETS[name];
      assert.equal(offset, expected, `${zone} ${name} ${at.toISOString()}`);
    }
  }
});

test("every table zone is a real zone", () => {
  for (const zone of Object.keys(ZONE_NAMES)) assert.ok(isValidTimeZone(zone), zone);
});

test("equal labels mean equal clocks for every shop and every viewer zone", () => {
  const shops = [...Object.keys(ZONE_NAMES), "Asia/Shanghai", "America/Sao_Paulo", "Asia/Kathmandu", "Pacific/Kiritimati", "Asia/Calcutta"];
  for (const date of ["2026-01-15", "2026-07-15", "2026-10-25", "2027-03-28"]) {
    for (const shopZone of shops) {
      for (const viewerZone of ZONES) {
        const c = shopClock(date, "13:00", { shopZone, viewerZone });
        assert.ok(c, `${shopZone} ${viewerZone}`);
        assert.match(c.viewer.label, LABEL, `${shopZone} ${viewerZone}`);
        if (c.viewer.label === c.shop.label) assert.equal(c.viewer.time, c.shop.time, `${shopZone} ${viewerZone} ${date}`);
      }
    }
  }
});

test("a zone whose rules changed falls back to GMT form instead of a wrong name", () => {
  const label = shopZoneLabel(new Date("2027-01-15T12:00:00Z"), "America/Vancouver");
  assert.equal(label, tzOffsetMinutes(new Date("2027-01-15T12:00:00Z"), "America/Vancouver") === -480 ? "PST" : "GMT-7");
});

test("legacy Calcutta alias reads IST", () => {
  assert.equal(shopZoneLabel(new Date("2026-07-15T12:00:00Z"), "Asia/Calcutta"), "IST");
});

test("India and Ireland never both read IST", () => {
  const a = shopClock("2026-07-15", "14:00", { shopZone: "Europe/Dublin", viewerZone: "Asia/Kolkata" });
  const b = shopClock("2026-07-15", "14:00", { shopZone: "Asia/Kolkata", viewerZone: "Europe/Dublin" });
  assert.notEqual(a.shop.label, a.viewer.label);
  assert.notEqual(b.shop.label, b.viewer.label);
});

test("shop text names both zones for every viewer", () => {
  for (const viewerZone of ZONES) {
    const text = shopTimeText("2026-07-15", "14:00", { shopZone: "Africa/Nairobi", viewerZone });
    assert.match(text, /\bEAT\b/, viewerZone);
    if (tzOffsetMinutes(new Date("2026-07-15T11:00:00Z"), viewerZone) !== 180) assert.match(text, /(?:[A-Z]{2,5}|GMT[+-][\d:]+)$/, viewerZone);
  }
});

test("open state answers in every shop zone across DST instants", () => {
  const hours = Object.fromEntries(WEEK.map((d) => [d, ["09:00", "17:00"]]));
  const extra = [new Date("2026-03-29T01:30:00Z"), new Date("2026-11-01T06:30:00Z")];
  for (const zone of ZONES) {
    for (const at of [instants[0], instants[18], instants[30], ...extra]) assert.equal(typeof businessStatus(hours, [], at, zone).isOpen, "boolean", zone);
  }
});
