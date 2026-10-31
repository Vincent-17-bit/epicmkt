import test from "node:test";
import assert from "node:assert/strict";
import { attentionRows, lastDays, sparklinePoints, sum } from "./commandCenter.js";

const counts = {
  applicationsWaiting: 5, applicationsOver24h: 2, unconfirmedPayments: 3, firstPaymentsToConfirm: 1,
  renewalPaymentsToConfirm: 2, openFlags: 0, openReports: 4, failedMessages: 1,
};

test("rows are busiest first and carry only real notes", () => {
  const rows = attentionRows(counts, { canReviewApplications: true });
  assert.deepEqual(rows.map((r) => [r.id, r.value]), [["applications", 5], ["payments", 3], ["failed", 1], ["flags", 0]]);
  assert.equal(rows[0].note, "2 waiting over 24 hours");
  assert.equal(rows[1].note, "1 new seller and 2 renewals");
  assert.equal(rows[3].note, "4 open reports as well");
});

test("the over 24 hours note is left out for roles that cannot read it, or when it is unknown", () => {
  assert.equal(attentionRows(counts, { canReviewApplications: false })[0].note, "");
  assert.equal(attentionRows({ ...counts, applicationsOver24h: null }, { canReviewApplications: true })[0].note, "");
});

test("a row only links where the role may open the page", () => {
  const rows = attentionRows(counts, { can: (p) => p === "payments.view" });
  assert.equal(rows.find((r) => r.id === "payments").to, "/admin/payments");
  assert.equal(rows.find((r) => r.id === "applications").to, null);
});

test("nothing waiting gives all zero rows and no notes about payments", () => {
  const rows = attentionRows({});
  assert.ok(rows.every((r) => r.value === 0));
  assert.equal(rows.find((r) => r.id === "failed").note, "");
});

test("a sparkline needs at least two points and some activity", () => {
  assert.equal(sparklinePoints([]), null);
  assert.equal(sparklinePoints([3]), null);
  assert.equal(sparklinePoints([0, 0, 0]), null);
  assert.equal(sparklinePoints(undefined), null);
  assert.equal(sparklinePoints([0, 2, 4], { width: 100, height: 20 }), "0,20 50,10 100,0");
});

test("series helpers take the latest days and total them", () => {
  const rows = [{ n: 1 }, { n: 2 }, { n: 3 }, { n: "x" }];
  assert.deepEqual(lastDays(rows, "n", 3), [2, 3, 0]);
  assert.equal(sum([1, 2, 3]), 6);
  assert.equal(sum(undefined), 0);
});
