import { test } from "node:test";
import assert from "node:assert/strict";
import { activityKind, clearSummary, clearedMessage, deletedMessage, removeRows, restoreRows, splitByKind } from "./activityDelete.js";

const row = (id, at) => ({ id, at, kind: "x" });

test("the id prefix decides what delete means", () => {
  assert.equal(activityKind("n:6f1e0c1e-0000-4000-8000-000000000001"), "notification");
  assert.equal(activityKind("a:456"), "audit");
  assert.equal(activityKind("n:demo-1"), "notification");
  for (const bad of ["", "n:", "a:", "x:1", "456", null, undefined, 7]) assert.equal(activityKind(bad), null, String(bad));
});

test("rows are split by kind and rows with an unknown id are ignored", () => {
  const { notifications, audit } = splitByKind([row("n:1"), row("a:2"), row("zzz"), row("a:3"), null]);
  assert.deepEqual(notifications.map((r) => r.id), ["n:1"]);
  assert.deepEqual(audit.map((r) => r.id), ["a:2", "a:3"]);
  assert.deepEqual(splitByKind(undefined), { notifications: [], audit: [] });
});

test("removeRows drops the ids, keeps the rest in order and does not mutate", () => {
  const rows = [row("n:1"), row("a:2"), row("a:3")];
  assert.deepEqual(removeRows(rows, ["a:2"]).map((r) => r.id), ["n:1", "a:3"]);
  assert.equal(rows.length, 3);
  assert.deepEqual(removeRows(rows, ["nope"]).map((r) => r.id), ["n:1", "a:2", "a:3"]);
  assert.equal(removeRows(undefined, ["a:2"]), undefined);
});

test("restoreRows puts rows back newest first and never duplicates one a refetch already brought back", () => {
  const a = row("a:3", "2026-10-30T10:03:00Z");
  const b = row("n:2", "2026-10-30T10:02:00Z");
  const c = row("a:1", "2026-10-30T10:01:00Z");
  assert.deepEqual(restoreRows([a, c], [b]).map((r) => r.id), ["a:3", "n:2", "a:1"]);
  assert.deepEqual(restoreRows([a, b, c], [b]).map((r) => r.id), ["a:3", "n:2", "a:1"], "already there");
  assert.deepEqual(restoreRows(undefined, [b]).map((r) => r.id), ["n:2"], "cache was empty");
  assert.deepEqual(restoreRows([a], []).map((r) => r.id), ["a:3"]);
  // same timestamp: the higher id first, the way the SQL orders it
  const same = [row("n:b", "t"), row("n:a", "t")];
  assert.deepEqual(restoreRows([], same).map((r) => r.id), ["n:b", "n:a"]);
});

test("rows with no time (demo rows) go back on top instead of being sorted by nothing", () => {
  assert.deepEqual(restoreRows([row("n:demo-2"), row("n:demo-3")], [row("n:demo-1")]).map((r) => r.id), ["n:demo-1", "n:demo-2", "n:demo-3"]);
});

test("the single-delete toast says what really happened", () => {
  assert.equal(deletedMessage(row("n:1")), "Notification deleted.");
  assert.equal(deletedMessage(row("a:1")), "Hidden from your feed. The audit log keeps it.");
});

test("the Clear all summary is honest about notifications and audit rows", () => {
  assert.equal(
    clearSummary([row("n:1"), row("n:2"), row("a:1")]),
    "2 notifications will be deleted for everyone and cannot be brought back. 1 audit entry will be hidden from your feed only. The audit log keeps it and other admins still see it.",
  );
  assert.equal(clearSummary([row("a:1"), row("a:2")]), "2 audit entries will be hidden from your feed only. The audit log keeps them and other admins still see them.");
  assert.equal(clearSummary([row("n:1")]), "1 notification will be deleted for everyone and cannot be brought back.");
  assert.equal(clearSummary([]), "");
});

test("the Clear all toast reports the counts the database returned", () => {
  assert.equal(clearedMessage({ deleted: 2, dismissed: 1, skipped: 0 }), "Cleared 3 items (2 deleted, 1 hidden from your feed).");
  assert.equal(clearedMessage({ deleted: 1, dismissed: 0 }), "Cleared 1 item (1 deleted).");
  assert.equal(clearedMessage({ deleted: 0, dismissed: 0, skipped: 4 }), "Nothing to clear. The feed was already up to date.");
  assert.equal(clearedMessage(null), "Nothing to clear. The feed was already up to date.");
});
