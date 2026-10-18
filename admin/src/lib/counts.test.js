import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_COUNTS, attentionTotal, badgeText, briefFor, navBadges, normalizeCounts } from "./counts.js";

// Same keys admin_counts() returns (supabase/migrations/0008_admin.sql).
const RAW = {
  submitted: 4, under_review: 3, changes_requested: 2, awaiting_payment: 5, payment_confirming: 2,
  live: 142, expiring_7d: 6, in_grace: 2, expired: 9, suspended: 1,
  open_flags: 9, open_reports: 4, unconfirmed_payments: 3, failed_messages: 3, pending_changes: 6,
};

test("normalizeCounts maps every admin_counts key", () => {
  const c = normalizeCounts(RAW);
  assert.equal(c.liveBusinesses, 142);
  assert.equal(c.applicationsSubmitted, 4);
  assert.equal(c.applicationsUnderReview, 3);
  assert.equal(c.applicationsChangesRequested, 2);
  assert.equal(c.applicationsAwaitingPayment, 5);
  assert.equal(c.expiringSoon, 6);
  assert.equal(c.inGrace, 2);
  assert.equal(c.expired, 9);
  assert.equal(c.suspended, 1);
  assert.equal(c.openFlags, 9);
  assert.equal(c.openReports, 4);
  assert.equal(c.failedMessages, 3);
  assert.equal(c.pendingChanges, 6);
});

test("applications waiting is submitted + under review, not the ones waiting on the seller", () => {
  const c = normalizeCounts(RAW);
  assert.equal(c.applicationsWaiting, 7);
});

test("payments to confirm include first payments, which live on the application and not in payments", () => {
  const c = normalizeCounts(RAW);
  assert.equal(c.firstPaymentsToConfirm, 2);
  assert.equal(c.renewalPaymentsToConfirm, 3);
  assert.equal(c.unconfirmedPayments, 5);
});

test("an empty or hostile payload becomes zeros, never NaN or negatives", () => {
  for (const raw of [null, undefined, {}, "x", [], { live: "abc", submitted: -4, under_review: null, open_flags: NaN }]) {
    const c = normalizeCounts(raw);
    for (const [key, value] of Object.entries(c)) {
      if (key === "applicationsOver24h") continue;
      assert.ok(Number.isInteger(value) && value >= 0, `${key} = ${value}`);
    }
  }
  // admin_counts() returns {} for a non-admin: that must read as zeros.
  assert.deepEqual({ ...normalizeCounts({}), applicationsOver24h: undefined }, { ...EMPTY_COUNTS, applicationsOver24h: undefined });
});

test("applicationsOver24h stays null (unknown) unless the caller supplies it", () => {
  assert.equal(normalizeCounts(RAW).applicationsOver24h, null);
  assert.equal(normalizeCounts(RAW, { applicationsOver24h: 4 }).applicationsOver24h, 4);
  assert.equal(normalizeCounts(RAW, { applicationsOver24h: 0 }).applicationsOver24h, 0);
});

test("the Command Center badge sums what the attention panel lists, without counting over-24h twice", () => {
  const c = normalizeCounts(RAW, { applicationsOver24h: 4 });
  assert.equal(attentionTotal(c), 7 + 5 + 9 + 3);
  assert.equal(attentionTotal(null), 0);
});

test("sidebar badges are keyed by route and use the same numbers as the pages", () => {
  const b = navBadges(normalizeCounts(RAW));
  assert.equal(b["/admin"], 24);
  assert.equal(b["/admin/applications"], 7);
  assert.equal(b["/admin/businesses"], 8);
  assert.equal(b["/admin/payments"], 5);
  assert.equal(b["/admin/settings"], undefined);
  assert.deepEqual(navBadges(undefined), {});
});

test("badgeText hides zero and caps large numbers", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(undefined), "");
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("the brief reads naturally and agrees in number", () => {
  assert.equal(
    briefFor(normalizeCounts(RAW)),
    "7 applications are waiting, 5 payments need confirming and 6 sellers expire within 7 days",
  );
  assert.equal(
    briefFor(normalizeCounts({ submitted: 1, payment_confirming: 1, expiring_7d: 1 })),
    "1 application is waiting, 1 payment needs confirming and 1 seller expires within 7 days",
  );
});

test("the brief drops zero parts and says so when nothing is left", () => {
  assert.equal(briefFor(normalizeCounts({ payment_confirming: 2 })), "2 payments need confirming");
  assert.equal(briefFor(normalizeCounts({ submitted: 3, expiring_7d: 1 })), "3 applications are waiting and 1 seller expires within 7 days");
  assert.equal(briefFor(normalizeCounts({})), "Nothing needs your attention right now");
  assert.equal(briefFor(undefined), "Nothing needs your attention right now");
});
