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

import { buildChecks, describeError } from "./systemStatus.js";

const byId = (checks, id) => checks.find((c) => c.id === id);

test("every check passes when all is well", () => {
  const checks = buildChecks({ ...ok, inbox: { hasData: true }, realtime: "SUBSCRIBED" });
  assert.deepEqual(checks.map((c) => c.id), ["internet", "server", "fresh", "inbox", "realtime", "messages"]);
  assert.ok(checks.every((c) => c.level === "ok"));
});

test("a network failure is explained as an unreachable project", () => {
  const checks = buildChecks({ ...ok, hasData: false, isError: true, error: new Error("TypeError: Failed to fetch") });
  const server = byId(checks, "server");
  assert.equal(server.level, "fail");
  assert.equal(server.detail, "Cannot reach Supabase");
  assert.match(server.cause, /paused|URL|firewall/);
});

test("error codes map to a cause an admin can act on", () => {
  assert.match(describeError({ code: "unauthorized" }).cause, /sign in again/i);
  assert.match(describeError({ code: "forbidden" }).cause, /admins table/);
  assert.match(describeError({ code: "rate_limited" }).title, /Too many/);
  assert.match(describeError({ code: "server_error", message: "function admin_counts() does not exist" }).cause, /admin_counts/);
});

test("failed messages come with a cause and a next step", () => {
  const m = byId(buildChecks({ ...ok, failedMessages: 2 }), "messages");
  assert.equal(m.level, "warn");
  assert.match(m.cause, /Open Messages/);
});

test("a lost live connection or failing inbox degrades the pill and names the problem", () => {
  const rt = systemStatus({ ...ok, realtime: "CHANNEL_ERROR" });
  assert.equal(rt.level, "degraded");
  assert.match(rt.detail, /Live updates/);
  const inbox = systemStatus({ ...ok, inbox: { hasData: false, isError: true, error: { code: "forbidden" } } });
  assert.equal(inbox.level, "degraded");
  assert.match(inbox.detail, /Messages inbox/);
});

test("demo mode and still-connecting realtime do not raise an alarm", () => {
  assert.equal(systemStatus({ ...ok, realtime: "unused" }).level, "healthy");
  assert.equal(systemStatus({ ...ok, realtime: "connecting" }).level, "healthy");
});
