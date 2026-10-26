import { test } from "node:test";
import assert from "node:assert/strict";
import { shrinkIfHuge, shrinkSize, UPLOAD_LIMIT_BYTES } from "./prepareUpload.js";

const file = (size) => ({ size, type: "image/jpeg" });

test("photos under the limit are sent untouched", async () => {
  const f = file(UPLOAD_LIMIT_BYTES);
  assert.equal(await shrinkIfHuge(f, { draw: () => assert.fail("must not redraw") }), f);
});

test("a huge photo is replaced by the smaller redraw", async () => {
  const small = { size: 2_000_000, type: "image/webp" };
  assert.equal(await shrinkIfHuge(file(12_000_000), { draw: async () => small }), small);
});

test("if redrawing fails or does not help, the original goes up", async () => {
  const f = file(12_000_000);
  assert.equal(await shrinkIfHuge(f, { draw: async () => { throw new Error("no canvas"); } }), f);
  assert.equal(await shrinkIfHuge(f, { draw: async () => ({ size: 13_000_000 }) }), f);
  assert.equal(await shrinkIfHuge(f, { draw: async () => null }), f);
});

test("shrinkSize keeps the ratio, caps the longest side and never enlarges", () => {
  assert.deepEqual(shrinkSize(8000, 6000), { width: 4096, height: 3072 });
  assert.deepEqual(shrinkSize(3000, 9000), { width: 1365, height: 4096 });
  assert.deepEqual(shrinkSize(1000, 800), { width: 1000, height: 800 });
});
