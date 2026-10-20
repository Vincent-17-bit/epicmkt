import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_LIMIT_MS, IDLE_WARN_MS, idleState } from "./idle.js";

test("active until the warning, then warning with a countdown, then expired", () => {
  assert.equal(idleState(1000, 1000).phase, "active");
  assert.equal(idleState(IDLE_WARN_MS - 1, 0).phase, "active");
  const warn = idleState(IDLE_WARN_MS, 0);
  assert.equal(warn.phase, "warning");
  assert.equal(warn.secondsLeft, 120);
  assert.equal(idleState(IDLE_LIMIT_MS - 1000, 0).secondsLeft, 1);
  assert.equal(idleState(IDLE_LIMIT_MS, 0).phase, "expired");
});

test("a clock that moved backwards counts as no idle time", () => {
  assert.equal(idleState(0, 5000).phase, "active");
});
