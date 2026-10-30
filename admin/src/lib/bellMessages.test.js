import test from "node:test";
import assert from "node:assert/strict";
import { bellMessages, messageLink, previewOf } from "./bellMessages.js";

const m = (id, extra = {}) => ({ id, businessId: "b1", businessName: "Shop A", sender: "seller", subject: "Hello", body: "Body", createdAt: "2026-10-30T09:00:00Z", adminReadAt: null, ...extra });

test("only unread seller messages are listed, newest first", () => {
  const rows = bellMessages([
    m("1", { createdAt: "2026-10-30T08:00:00Z" }),
    m("2", { createdAt: "2026-10-30T10:00:00Z" }),
    m("3", { sender: "admin" }),
    m("4", { adminReadAt: "2026-10-30T09:30:00Z" }),
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["2", "1"]);
});

test("a message opens its business on the Messages page with the message id", () => {
  assert.equal(messageLink(m("x9")), "/admin/messages?business=b1&message=x9");
});

test("previews are flattened and trimmed", () => {
  assert.equal(previewOf("a\n\n  b"), "a b");
  assert.ok(previewOf("x".repeat(200)).length <= 90);
  assert.ok(previewOf("x".repeat(200)).endsWith("…"));
});

test("empty or missing input is safe", () => {
  assert.deepEqual(bellMessages(undefined), []);
});
