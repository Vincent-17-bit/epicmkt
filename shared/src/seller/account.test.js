import { test } from "node:test";
import assert from "node:assert/strict";
import {
  announcementProblem, normalizeHandle, profileProblems, lockedProblem, parsePin, pinValue, mergeProfile, storePhone, yearProblem, LIMITS,
} from "./account.js";
import { categoryChangeQuote } from "../billing.js";

test("announcements are short and carry no links, emails or phone numbers", () => {
  assert.equal(announcementProblem("Open late this Friday"), null);
  assert.equal(announcementProblem("Back to school offers, 10% off"), null);
  for (const bad of ["See www.shop.co.ke", "Visit https://x.com/a", "Mail me@shop.ke", "Call 0712 345 678", "WhatsApp +254712345678", "shop.com"]) {
    assert.ok(announcementProblem(bad), bad);
  }
  assert.ok(announcementProblem("x".repeat(LIMITS.announcement + 1)));
});

test("profile limits match the spec", () => {
  assert.deepEqual(profileProblems({ tagline: "x".repeat(80), description: "y".repeat(1500) }), {});
  assert.ok(profileProblems({ tagline: "x".repeat(81) }).tagline);
  assert.ok(profileProblems({ description: "y".repeat(1501) }).description);
  assert.ok(profileProblems({ whatsapp: "123" }).whatsapp);
  assert.deepEqual(profileProblems({ whatsapp: "0712 345 678", email: "a@shop.co.ke" }), {});
  assert.ok(profileProblems({ email: "nope" }).email);
  assert.ok(profileProblems({ tags: new Array(11).fill("x") }).tags);
  assert.ok(profileProblems({ profile: { year_established: 1800 } }).year_established);
  assert.ok(profileProblems({ profile: { website: "shop.co.ke" } }).website);
  assert.deepEqual(profileProblems({ profile: { website: "https://shop.co.ke", year_established: 2015 } }), {});
});

test("the announcement banner is Premium only", () => {
  assert.ok(profileProblems({ announcement: "Sale today" }, { plan: "standard" }).announcement);
  assert.deepEqual(profileProblems({ announcement: "Sale today" }, { plan: "premium" }), {});
  assert.deepEqual(profileProblems({ announcement: "" }, { plan: "standard" }), {});
});

test("handles are cleaned from links and @ signs", () => {
  assert.equal(normalizeHandle("@epic.shop"), "epic.shop");
  assert.equal(normalizeHandle("https://www.instagram.com/epic.shop/"), "epic.shop");
  assert.equal(normalizeHandle("https://tiktok.com/@epic?lang=en"), "epic");
  assert.equal(normalizeHandle(""), "");
});

test("locked fields are checked before a request is sent", () => {
  assert.equal(lockedProblem("name", "Shop"), null);
  assert.ok(lockedProblem("name", "A"));
  assert.ok(lockedProblem("phone", "12"));
  assert.equal(lockedProblem("phone", "0712345678"), null);
  assert.equal(lockedProblem("location", pinValue(-1.2864, 36.8172)), null);
  assert.ok(lockedProblem("location", pinValue(10, 10)));
  assert.ok(lockedProblem("licence_docs", "[]"));
  assert.equal(lockedProblem("licence_docs", '["a/b.pdf"]'), null);
});

test("map pins round trip with six decimals", () => {
  assert.equal(pinValue(-1.2864, 36.8172), "-1.286400,36.817200");
  assert.deepEqual(parsePin("-1.286400,36.817200"), { lat: -1.2864, lng: 36.8172 });
  assert.equal(parsePin("abc"), null);
});

test("profile merges keep other keys and stamp the section", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const next = mergeProfile({ keep: 1, section_updated: { a: "x" } }, { website: "https://a.co" }, "contact", now);
  assert.equal(next.keep, 1);
  assert.equal(next.website, "https://a.co");
  assert.deepEqual(next.section_updated, { a: "x", contact: now.toISOString() });
});

test("misc helpers", () => {
  assert.equal(storePhone("0712 345 678"), "+254712345678");
  assert.equal(storePhone("bad"), null);
  assert.equal(yearProblem(""), null);
  assert.ok(yearProblem("abc"));
});

test("a dearer category is charged the prorated difference, a cheaper one is free now", () => {
  const now = new Date("2026-10-10T09:00:00Z");
  const dearer = categoryChangeQuote({ oldPrice: 500, newPrice: 800, paidUntil: "2026-10-20", now });
  assert.ok(dearer.extraDueNow > 0 && dearer.extraDueNow < 300);
  const cheaper = categoryChangeQuote({ oldPrice: 800, newPrice: 500, paidUntil: "2026-10-20", now });
  assert.equal(cheaper.extraDueNow, 0);
  assert.equal(cheaper.appliesFromNextRenewal, true);
});
