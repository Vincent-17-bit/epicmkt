import { test } from "node:test";
import assert from "node:assert/strict";
import { limitsFor } from "./limits.js";
import { DEFAULT_PERFORMANCE_RANGE, HISTORY_LOCK_TEXT, PERFORMANCE_RANGES, historyHiddenCount, isPerformanceRange, normalizePerformance, performanceIsEmpty } from "./performance.js";

test("history and flash attribution gates resolve through limitsFor", () => {
  assert.equal(limitsFor("standard", null).historyEntries, 5);
  assert.equal(limitsFor("premium", null).historyEntries, null);
  assert.equal(limitsFor("standard", null).flashAttribution, false);
  assert.equal(limitsFor("premium", null).flashAttribution, true);
  assert.equal(limitsFor("standard", { standard: { historyEntries: 10 } }).historyEntries, 10);
  assert.equal(limitsFor("standard", { standard: { flashAttribution: true } }).flashAttribution, true);
});

test("ranges are the seven the server accepts, with no plan gate", () => {
  assert.deepEqual(PERFORMANCE_RANGES.map((r) => r.key), ["7d", "1m", "6m", "12m", "24m", "36m", "all"]);
  assert.ok(isPerformanceRange(DEFAULT_PERFORMANCE_RANGE));
  assert.equal(isPerformanceRange("forever"), false);
});

test("a missing or partial answer normalizes to zeros", () => {
  const p = normalizePerformance(undefined);
  assert.deepEqual(p.totals, { view: 0, whatsapp: 0, call: 0, directions: 0 });
  assert.deepEqual(p.series, []);
  assert.equal(performanceIsEmpty(p), true);
  const q = normalizePerformance({ totals: { view: "3", call: "x" }, series: [{ bucket: "2026-11-01", view: 3 }] });
  assert.equal(q.totals.view, 3);
  assert.equal(q.totals.call, 0);
  assert.equal(q.series[0].whatsapp, 0);
  assert.equal(performanceIsEmpty(q), false);
});

test("hidden history count only counts when locked", () => {
  assert.equal(historyHiddenCount({ locked: true, total: 8, entries: new Array(5) }), 3);
  assert.equal(historyHiddenCount({ locked: false, total: 5, entries: new Array(5) }), 0);
  assert.equal(historyHiddenCount(null), 0);
  assert.ok(HISTORY_LOCK_TEXT.length > 0);
});
