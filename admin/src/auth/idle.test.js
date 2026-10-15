import { test } from "node:test";
import assert from "node:assert/strict";
import { IDLE_LIMIT_MS, IDLE_WARN_MS, idleState } from "./idle.js";

test("idleState moves from active to warning to expired", () => {
  assert.equal(idleState(1000, 1000).phase, "active");
  assert.equal(idleState(IDLE_WARN_MS - 1, 0).phase, "active");
  assert.deepEqual(idleState(IDLE_WARN_MS, 0), { phase: "warning", secondsLeft: 120 });
  assert.deepEqual(idleState(IDLE_LIMIT_MS - 1500, 0), { phase: "warning", secondsLeft: 2 });
  assert.deepEqual(idleState(IDLE_LIMIT_MS, 0), { phase: "expired", secondsLeft: 0 });
});

test("a clock that runs backwards counts as active", () => {
  assert.equal(idleState(0, 5000).phase, "active");
});
