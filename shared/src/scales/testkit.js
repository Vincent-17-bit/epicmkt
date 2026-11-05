// Helpers for the table-driven scale tests (not a test file itself).
import test from "node:test";
import assert from "node:assert/strict";
import { compare, format, parse, plausible, sizeKey, toBase } from "./index.js";

const label = (v) => JSON.stringify(v);

/** rows: [input, ctx|null, expectedFieldsWithoutScale] */
export const parseTable = (id, rows) => {
  for (const [input, ctx, expected] of rows) {
    test(`${id}: parses ${label(input)}${ctx ? ` with ${label(ctx)}` : ""}`, () => {
      const res = parse(id, input, ctx ?? {});
      assert.equal(res.ok, true, res.ok ? "" : res.error.message);
      assert.deepEqual(res.value, { scale: id, ...expected });
    });
  }
};

/** rows: [input, ctx|null, errorCode] */
export const errorTable = (id, rows) => {
  for (const [input, ctx, code] of rows) {
    test(`${id}: rejects ${label(input)}${ctx ? ` with ${label(ctx)}` : ""} (${code})`, () => {
      const res = parse(id, input, ctx ?? {});
      assert.equal(res.ok, false);
      assert.equal(res.error.code, code);
      assert.ok(res.error.message.length > 0);
    });
  }
};

/** rows: [input, opts|null, expectedText]; input is parsed first (default ctx) */
export const formatTable = (id, rows) => {
  for (const [input, opts, expected] of rows) {
    test(`${id}: formats ${label(input)}${opts ? ` as ${label(opts)}` : ""} -> ${expected}`, () => {
      const res = parse(id, input);
      assert.equal(res.ok, true, res.ok ? "" : res.error.message);
      assert.equal(format(res.value, opts ?? {}), expected);
    });
  }
};

/** sorted: inputs already in ascending order; every pair must compare consistently, in both directions */
export const orderTable = (id, sorted, ctx = {}) => {
  test(`${id}: compare orders ${sorted.join(" < ")}`, () => {
    const values = sorted.map((s) => {
      const r = parse(id, s, ctx);
      assert.equal(r.ok, true, `${s}: ${r.ok ? "" : r.error.message}`);
      return r.value;
    });
    for (let i = 0; i < values.length; i += 1) {
      assert.equal(compare(values[i], values[i]), 0);
      for (let j = i + 1; j < values.length; j += 1) {
        assert.ok(compare(values[i], values[j]) < 0, `${sorted[i]} < ${sorted[j]}`);
        assert.ok(compare(values[j], values[i]) > 0, `${sorted[j]} > ${sorted[i]}`);
      }
    }
    const shuffled = [...values].reverse().sort(compare);
    assert.deepEqual(shuffled.map((v) => format(v)), values.map((v) => format(v)));
  });
};

/** rows: [input, typeId|null, axisKey|null, { ok, warn: boolean }] */
export const plausibleTable = (id, rows) => {
  for (const [input, typeId, axisKey, expected] of rows) {
    test(`${id}: plausibility of ${label(input)}${typeId ? ` for ${typeId}.${axisKey}` : ""}`, () => {
      const res = parse(id, input);
      assert.equal(res.ok, true, res.ok ? "" : res.error.message);
      const p = plausible(typeId, axisKey, res.value);
      assert.equal(p.ok, expected.ok);
      assert.equal(Boolean(p.warn), expected.warn);
    });
  }
};

/** rows: [input, expectedBase] */
export const baseTable = (id, rows) => {
  for (const [input, expected] of rows) {
    test(`${id}: toBase(${label(input)}) = ${expected}`, () => {
      const res = parse(id, input);
      assert.equal(res.ok, true);
      assert.ok(Math.abs(toBase(res.value) - expected) < 0.011, `${toBase(res.value)} vs ${expected}`);
    });
  }
};

/** rows: [input, expectedKey] */
export const keyTable = (id, rows) => {
  for (const [input, expected] of rows) {
    test(`${id}: sizeKey(${label(input)}) = ${expected}`, () => {
      const res = parse(id, input);
      assert.equal(res.ok, true);
      assert.equal(sizeKey(res.value), expected);
    });
  }
};
