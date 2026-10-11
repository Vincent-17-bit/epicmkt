import { test } from "node:test";
import assert from "node:assert/strict";
import { applyItemTemplates } from "./seed-item-templates.mjs";
import { ITEM_TEMPLATES } from "../shared/src/seller/item-templates.js";

// A stand-in for supabase-js that records every call, so the test can prove what the script is able to touch.
const fakeDb = ({ existing = Object.keys(ITEM_TEMPLATES), failOn = null } = {}) => {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, op: null, payload: null, filter: null };
      calls.push(call);
      const chain = {
        select(cols) { if (!call.op) call.op = "select"; call.cols = cols; return chain; },
        update(payload) { call.op = "update"; call.payload = payload; return chain; },
        // Like supabase-js, eq() returns a builder that can be awaited directly or chained with .select().
        eq(col, val) {
          call.filter = [col, val];
          const settle = () => Promise.resolve(
            failOn === val ? { data: null, error: { message: "column item_template does not exist" } }
              : { data: existing.includes(val) ? [{ id: val }] : [], error: null }
          );
          const builder = { select: () => builder, then: (resolve, reject) => settle().then(resolve, reject) };
          return builder;
        },
      };
      return chain;
    },
  };
};

test("it updates item_template and nothing else, one category at a time, by id", async () => {
  const db = fakeDb();
  const r = await applyItemTemplates(db);
  assert.equal(r.updated.length, Object.keys(ITEM_TEMPLATES).length);
  assert.deepEqual([r.missing, r.failed], [[], []]);
  for (const call of db.calls) {
    assert.equal(call.table, "categories", "never touches plans, legal docs or anything else");
    assert.equal(call.op, "update");
    assert.deepEqual(Object.keys(call.payload), ["item_template"], "only this column is written");
    assert.equal(call.filter[0], "id", "always filtered by id, never a bulk update");
  }
  assert.deepEqual(db.calls.find((c) => c.filter[1] === "chemist").payload.item_template, ITEM_TEMPLATES.chemist);
});

test("dry run reads but never writes", async () => {
  const db = fakeDb();
  const r = await applyItemTemplates(db, ITEM_TEMPLATES, { dry: true });
  assert.equal(r.updated.length, Object.keys(ITEM_TEMPLATES).length);
  assert.ok(db.calls.every((c) => c.op === "select"), "no update was issued");
});

test("categories missing from the database are reported, not silently skipped", async () => {
  const db = fakeDb({ existing: Object.keys(ITEM_TEMPLATES).filter((id) => id !== "cyber-cafe") });
  const r = await applyItemTemplates(db);
  assert.deepEqual(r.missing, ["cyber-cafe"]);
  assert.equal(r.updated.length, Object.keys(ITEM_TEMPLATES).length - 1);
});

test("a database error is reported per category and the run continues", async () => {
  const db = fakeDb({ failOn: "bakery" });
  const r = await applyItemTemplates(db);
  assert.deepEqual(r.failed.map((f) => f.id), ["bakery"]);
  assert.match(r.failed[0].message, /item_template/);
  assert.equal(r.updated.length, Object.keys(ITEM_TEMPLATES).length - 1);
});
