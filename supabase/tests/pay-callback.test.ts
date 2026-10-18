import { test } from "node:test";
import assert from "node:assert/strict";
import { alertFor, bodyOf, routeOf, sameSecret } from "../functions/pay-callback/parse.ts";

test("the URL secret is compared strictly and the route is read from the path", () => {
  assert.ok(sameSecret("abc", "abc"));
  assert.ok(!sameSecret("abc", "abd"));
  assert.ok(!sameSecret("abc", "abcd"));
  assert.ok(!sameSecret("", ""));
  assert.deepEqual(routeOf("/functions/v1/pay-callback/s3cret/confirmation"), { secret: "s3cret", kind: "confirmation" });
  assert.equal(routeOf("/functions/v1/pay-callback/s3cret"), null);
  assert.equal(routeOf("/functions/v1/pay-callback/%E0%A4%A/confirmation"), null);
});

test("any body is kept: JSON as is, anything else wrapped, so nothing is dropped before the database sees it", () => {
  assert.deepEqual(bodyOf('{"TransID":"ABC"}'), { TransID: "ABC" });
  assert.deepEqual(bodyOf("not json"), { _raw: "not json" });
  assert.deepEqual(bodyOf("[1,2]"), { _raw: "[1,2]" });
  assert.deepEqual(bodyOf(""), { _raw: "" });
  assert.equal((bodyOf("x".repeat(9000))._raw as string).length, 5000);
});

test("only payments that need a person send an e-mail; routine renewals stay quiet", () => {
  const tx = { amount: 1500, code: "SGH4K9L2QW", account: "Upendo Shop" };
  assert.match(alertFor({ outcome: "needs_assignment", note: "ambiguous_name" }, tx)!.subject, /needs assigning/);
  assert.match(alertFor({ outcome: "ready", business_name: "Mama Pima", reference_no: "EPM-2026-ABC234" }, tx)!.lines.join(" "), /Confirm/);
  assert.ok(alertFor({ outcome: "error" }, tx));
  assert.equal(alertFor({ outcome: "applied" }, tx), null);
  assert.equal(alertFor({ outcome: "part_paid" }, tx), null);
});
