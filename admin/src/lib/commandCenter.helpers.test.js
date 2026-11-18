import test from "node:test";
import assert from "node:assert/strict";
import { greeting, shareOfMax } from "./commandCenter.js";
import { activityIconKey } from "./activity.js";

test("greeting follows the hour", () => {
  assert.equal(greeting(new Date(2026, 0, 1, 8)), "Good morning");
  assert.equal(greeting(new Date(2026, 0, 1, 14)), "Good afternoon");
  assert.equal(greeting(new Date(2026, 0, 1, 20)), "Good evening");
});

test("shareOfMax is 0 with no max, never below 6 or above 100", () => {
  assert.equal(shareOfMax(5, 0), 0);
  assert.equal(shareOfMax(1, 100), 6);
  assert.equal(shareOfMax(50, 100), 50);
  assert.equal(shareOfMax(500, 100), 100);
});

test("activityIconKey always returns a known key", () => {
  assert.ok(["payment", "application", "flag", "message", "store", "bell"].includes(activityIconKey({})));
});
