import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafaricomPhone, localPhone, stkOutcomeText, stkPhone, stkStage } from "./mpesa.js";

test("phones: every way Kenyans write a Safaricom number, and nothing else", () => {
  for (const [given, want] of [["0712345678", "254712345678"], ["0712 345 678", "254712345678"], ["+254 712 345 678", "254712345678"],
    ["254712345678", "254712345678"], ["712345678", "254712345678"], ["0110345678", "254110345678"], ["0712-345-678", "254712345678"]]) {
    assert.equal(stkPhone(given), want, given);
  }
  for (const bad of ["0812345678", "071234567", "+255712345678", "", null, undefined, "phone"]) assert.equal(stkPhone(bad), null, String(bad));
  assert.equal(isSafaricomPhone("0712345678"), true);
  assert.equal(localPhone("+254712345678"), "0712 345 678");
  assert.equal(localPhone("254110345678"), "0110 345 678");
  assert.equal(localPhone("abc"), "abc");
});

test("each state says whether to wait, retry or stop", () => {
  const s = (status) => stkStage({ status, message: "m" });
  assert.deepEqual([s("pending").waiting, s("pending").retry, s("pending").done, s("pending").tone], [true, false, false, "info"]);
  assert.equal(s("confirming").waiting, true);
  assert.deepEqual([s("paid").done, s("paid").tone], [true, "success"]);
  assert.deepEqual([s("failed").retry, s("failed").tone], [true, "error"]);
  assert.deepEqual([s("expired").retry, s("expired").tone], [true, "warning"]);
  assert.deepEqual([s("disputed").done, s("disputed").retry], [true, false]);
  assert.equal(stkStage(null).status, "idle");
});

test("a paid request says what the money did", () => {
  assert.equal(stkOutcomeText({ outcome: { outcome: "applied", months: 3, paidUntil: "2027-02-16" } }), "3 months added, paid until 2027-02-16.");
  assert.equal(stkOutcomeText({ outcome: { outcome: "applied", months: 1 } }), "1 month added.");
  assert.equal(stkOutcomeText({ outcome: { outcome: "applied", months: 1, paidUntil: "2027-02-16" } }, () => "16 Feb 2027"), "1 month added, paid until 16 Feb 2027.");
  assert.equal(stkOutcomeText({ outcome: { outcome: "applied" } }), "Your change is paid and applied.");
  assert.match(stkOutcomeText({ outcome: { outcome: "ready" } }), /login details/);
  assert.match(stkOutcomeText({ outcome: { outcome: "part_paid", balance: 200 } }), /KES 200 more/);
  assert.equal(stkOutcomeText({}), "");
});
