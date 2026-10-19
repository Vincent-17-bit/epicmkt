import { test } from "node:test";
import assert from "node:assert/strict";
import { groupThreads, receiptOf, receiptState } from "./receipts.js";

test("receipt state goes sent, delivered, read and never back", () => {
  assert.equal(receiptState({}), "sent");
  assert.equal(receiptState({ deliveredAt: "2026-01-01" }), "delivered");
  assert.equal(receiptState({ deliveredAt: "2026-01-01", readAt: "2026-01-02" }), "read");
  assert.equal(receiptState({ readAt: "2026-01-02" }), "read");
});

test("a seller's message is read through the admin columns, a staff message through the seller columns", () => {
  assert.equal(receiptOf({ sender: "seller", adminDeliveredAt: "x", readAt: "own copy" }), "delivered");
  assert.equal(receiptOf({ sender: "seller", adminDeliveredAt: "x", adminReadAt: "y" }), "read");
  assert.equal(receiptOf({ sender: "admin", deliveredAt: "x" }), "delivered");
  assert.equal(receiptOf({ sender: "admin" }), "sent");
});

test("threads nest replies and sort by latest activity", () => {
  const m = (id, parentId, threadId, createdAt, extra = {}) => ({ id, parentId, threadId, createdAt, subject: id, sender: "admin", ...extra });
  const threads = groupThreads([
    m("b2", "b1", "b1", "2026-01-03", { sender: "seller" }),
    m("a1", null, "a1", "2026-01-01", { needsReply: true }),
    m("b1", null, "b1", "2026-01-02"),
    m("b3", "b2", "b1", "2026-01-04"),
  ]);
  assert.deepEqual(threads.map((t) => t.id), ["b1", "a1"]);
  assert.deepEqual(threads[0].messages.map((x) => [x.id, x.depth]), [["b1", 0], ["b2", 1], ["b3", 2]]);
  assert.equal(threads[1].needsReply, true);
  assert.equal(threads[0].needsReply, false);
});
