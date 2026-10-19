import { test } from "node:test";
import assert from "node:assert/strict";
import { STALE_AFTER_MS, systemStatus } from "./systemStatus.js";

const now = 1_000_000_000;
const ok = { isOnline: true, hasData: true, isError: false, updatedAt: now - 60_000, failedMessages: 0, now };

test("healthy when data is fresh and nothing failed", () => {
  assert.equal(systemStatus(ok).level, "healthy");
});

test("offline beats everything", () => {
  assert.deepEqual(systemStatus({ ...ok, isOnline: false }).level, "down");
});

test("no data yet: checking, or unreachable if the request failed", () => {
  assert.equal(systemStatus({ ...ok, hasData: false }).level, "checking");
  assert.equal(systemStatus({ ...ok, hasData: false, isError: true }).level, "down");
});

test("a failed refresh with older data is degraded, not down", () => {
  assert.equal(systemStatus({ ...ok, isError: true }).level, "degraded");
});

test("data older than three missed refreshes is delayed", () => {
  const s = systemStatus({ ...ok, updatedAt: now - STALE_AFTER_MS - 1 });
  assert.equal(s.level, "degraded");
  assert.equal(s.label, "Delayed");
});

test("failed messages make it degraded and say how many", () => {
  assert.equal(systemStatus({ ...ok, failedMessages: 1 }).detail, "1 message failed to send");
  assert.equal(systemStatus({ ...ok, failedMessages: 3 }).detail, "3 messages failed to send");
});
