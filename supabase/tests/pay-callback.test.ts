import { test } from "node:test";
import assert from "node:assert/strict";
import { parseC2B, parseTransTime, routeOf, sameSecret } from "../functions/pay-callback/parse.ts";

const notice = {
  TransactionType: "Pay Bill", TransID: "sgh4k9l2qw", TransTime: "20261018143005", TransAmount: "450.00",
  BusinessShortCode: "247247", BillRefNumber: "Mama Pima Salon", MSISDN: "2547****678", FirstName: "JOHN", MiddleName: "", LastName: "DOE",
};

test("a Safaricom confirmation is read into the fields we store", () => {
  assert.deepEqual(parseC2B(notice), {
    transId: "SGH4K9L2QW", amount: 450, account: "Mama Pima Salon", msisdn: "2547****678", name: "JOHN DOE",
    shortCode: "247247", transTime: "2026-10-18T11:30:05.000Z",
  });
});

test("unusable notices are rejected, not guessed", () => {
  assert.deepEqual(parseC2B({ ...notice, TransID: "x" }), null);
  assert.deepEqual(parseC2B({ ...notice, TransAmount: "0" }), null);
  assert.deepEqual(parseC2B(null), null);
  assert.deepEqual(parseTransTime("nope"), null);
});

test("the URL secret is compared strictly and the route is read from the path", () => {
  assert.ok(sameSecret("abc", "abc"));
  assert.ok(!sameSecret("abc", "abd"));
  assert.ok(!sameSecret("", ""));
  assert.deepEqual(routeOf("/functions/v1/pay-callback/s3cret/confirmation"), { secret: "s3cret", kind: "confirmation" });
  assert.deepEqual(routeOf("/functions/v1/pay-callback/s3cret"), null);
});
