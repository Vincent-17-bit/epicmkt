import { test } from "node:test";
import assert from "node:assert/strict";
import { renewalPlan } from "./billing.js";

// 09:00 in Nairobi on the given day.
const at = (day) => new Date(`${day}T09:00:00+03:00`);
const midnight = (day) => new Date(`${day}T00:00:00+03:00`).toISOString();

test("renewal: expired past the grace day, the new time starts today", () => {
  const r = renewalPlan({ paidUntil: midnight("2026-11-06"), graceDays: 1, now: at("2026-11-18") });
  assert.equal(r.startsToday, true);
  assert.equal(r.start, "2026-11-18");
  assert.equal(r.allowed, 12);
  assert.deepEqual(r.choices, [1, 3, 6, 12]);
  assert.equal(r.until(1), "2026-12-18");
  assert.equal(r.until(3), "2027-02-18");
  assert.equal(r.until(12), "2027-11-18");
});

test("renewal: on the last paid day and in the grace day it carries on from the old date, so no day is lost", () => {
  for (const today of ["2026-11-20", "2026-11-21"]) {
    const r = renewalPlan({ paidUntil: midnight("2026-11-20"), graceDays: 1, now: at(today) });
    assert.equal(r.startsToday, false, today);
    assert.equal(r.start, "2026-11-20");
    assert.equal(r.until(1), "2026-12-20");
  }
  assert.equal(renewalPlan({ paidUntil: midnight("2026-11-20"), graceDays: 1, now: at("2026-11-22") }).startsToday, true);
  assert.equal(renewalPlan({ paidUntil: midnight("2026-11-20"), graceDays: 3, now: at("2026-11-23") }).startsToday, false);
});

test("renewal: paying ahead is capped at 12 months from today; the most that fits is offered", () => {
  const r = renewalPlan({ paidUntil: midnight("2026-12-08"), graceDays: 1, now: at("2026-11-18") });
  assert.equal(r.allowed, 11);
  assert.deepEqual(r.choices, [1, 3, 6, 11]);
  assert.equal(r.until(11), "2027-11-08");

  const two = renewalPlan({ paidUntil: midnight("2027-09-30"), now: at("2026-11-18") });
  assert.equal(two.allowed, 1);
  assert.deepEqual(two.choices, [1]);

  const full = renewalPlan({ paidUntil: midnight("2027-11-10"), now: at("2026-11-18") });
  assert.equal(full.allowed, 0);
  assert.deepEqual(full.choices, []);
});

test("renewal: months are counted like the database (31 Jan + 1 month is 28 Feb)", () => {
  const r = renewalPlan({ paidUntil: midnight("2027-01-31"), now: at("2027-01-31") });
  assert.equal(r.until(1), "2027-02-28");
  assert.equal(r.until(2), "2027-03-31");
  // 12 months from 31 Jan 2027 is 31 Jan 2028: all 12 fit.
  assert.equal(r.allowed, 12);
  // Paid until 29 Jan 2028, today 28 Feb 2027: the cap is 28 Feb 2028, a day short of a month after 29 Jan, so 0 months.
  assert.equal(renewalPlan({ paidUntil: "2028-01-29", now: at("2027-02-28") }).allowed, 0);
});

test("renewal: a first payment (never paid) starts today", () => {
  const r = renewalPlan({ paidUntil: null, now: at("2026-11-18"), maxMonths: 6 });
  assert.equal(r.startsToday, true);
  assert.equal(r.allowed, 6);
  assert.deepEqual(r.choices, [1, 3, 6]);
});
