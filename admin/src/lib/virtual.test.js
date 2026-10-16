import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOffsets, rowAt, visibleRange } from "./virtual.js";

const fixed = (n, h) => buildOffsets(n, () => h);

test("offsets are running totals", () => {
  assert.deepEqual([...buildOffsets(4, (i) => [10, 20, 30, 40][i])], [0, 10, 30, 60, 100]);
  assert.deepEqual([...buildOffsets(0, () => 1)], [0]);
  assert.deepEqual([...buildOffsets(2, () => -5)], [0, 0, 0]); // a bad measurement cannot run the total backwards
});

test("rowAt finds the row that contains a position, clamped at both ends", () => {
  const o = fixed(10, 50);
  assert.equal(rowAt(o, 0), 0);
  assert.equal(rowAt(o, 49.9), 0);
  assert.equal(rowAt(o, 50), 1);
  assert.equal(rowAt(o, 499), 9);
  assert.equal(rowAt(o, 99999), 9);
  assert.equal(rowAt(o, -20), 0);
  assert.equal(rowAt(fixed(0, 50), 10), 0);
});

test("rowAt handles rows of different heights", () => {
  const o = buildOffsets(5, (i) => [100, 10, 10, 200, 10][i]); // starts: 0 100 110 120 320, end 330
  assert.deepEqual([0, 99, 100, 109, 110, 119, 120, 319, 320, 329].map((y) => rowAt(o, y)), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
});

test("visibleRange at the top: only what fits plus the overscan below", () => {
  const r = visibleRange(fixed(100, 40), 0, 400, 3);
  assert.deepEqual(r, { start: 0, end: 13, padTop: 0, padBottom: (100 - 13) * 40, total: 4000 }); // 10 on screen + 3 overscan
});

test("visibleRange in the middle keeps the scrollbar honest", () => {
  const r = visibleRange(fixed(100, 40), 1000, 400, 2); // row 25 at the top, rows 25..34 on screen
  assert.deepEqual([r.start, r.end], [23, 37]);
  assert.equal(r.padTop, 23 * 40);
  assert.equal(r.padTop + (r.end - r.start) * 40 + r.padBottom, r.total);
});

test("visibleRange at the bottom and past it (a shrunk list after a page change)", () => {
  const bottom = visibleRange(fixed(100, 40), 3600, 400, 2);
  assert.equal(bottom.end, 100);
  assert.equal(bottom.padBottom, 0);
  const past = visibleRange(fixed(5, 40), 99999, 400, 2); // list is shorter than the old scroll position
  assert.deepEqual([past.start, past.end, past.padTop, past.padBottom], [0, 5, 0, 0]);
});

test("a list shorter than the viewport draws everything", () => {
  const r = visibleRange(fixed(3, 40), 0, 800, 6);
  assert.deepEqual([r.start, r.end, r.padBottom], [0, 3, 0]);
});

test("an empty list draws nothing", () => {
  assert.deepEqual(visibleRange(fixed(0, 40), 0, 400), { start: 0, end: 0, padTop: 0, padBottom: 0, total: 0 });
});

test("a long list only draws a small window", () => {
  const r = visibleRange(fixed(100000, 40), 2_000_000, 800, 6);
  assert.ok(r.end - r.start <= 20 + 12, `${r.end - r.start} rows`);
});
