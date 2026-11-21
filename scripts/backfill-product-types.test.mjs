import { test } from "node:test";
import assert from "node:assert/strict";
import { planBackfill, reviewCsv, runBackfill } from "./lib/backfill-types.mjs";

const TYPES = [
  { id: "bread", name: "Bread", categoryIds: ["bakery"] },
  { id: "dress-shirt", name: "Dress shirt", categoryIds: ["fashion"] },
  { id: "prescription-medicine", name: "Prescription medicine", categoryIds: ["chemist"], restrictedTo: ["chemist"] },
  { id: "other", name: "Other", categoryIds: [] },
];
const item = (id, name, extra = {}) => ({ id, name, businessId: "b1", categoryId: "bakery", productTypeId: null, ...extra });

// An in-memory stand-in for the database: assign sets the type only where it is still null, like the real update.
function memory(items) {
  const rows = new Map(items.map((i) => [i.id, { ...i }]));
  return {
    rows,
    loadItems: async () => [...rows.values()].filter((r) => r.productTypeId == null).map((r) => ({ ...r })).concat([...rows.values()].filter((r) => r.productTypeId != null).map((r) => ({ ...r }))),
    loadTypes: async () => TYPES,
    assign: async (id, typeId) => { const r = rows.get(id); if (r.productTypeId != null) return false; r.productTypeId = typeId; return true; },
  };
}

test("dry run: reports what it would do and writes nothing", async () => {
  const db = memory([item("1", "Bread 400g"), item("2", "Zzyzx gadget")]);
  const r = await runBackfill(db, { apply: false });
  assert.equal(r.mode, "dry-run");
  assert.equal(r.toAssign, 1);
  assert.equal(r.written, 0);
  assert.equal(r.toReview, 1);
  assert.equal(db.rows.get("1").productTypeId, null);
});

test("apply: sets the type it is sure of, and lists the rest for an admin", async () => {
  const db = memory([item("1", "Bread 400g"), item("2", "Zzyzx gadget"), item("3", "Shirt", { categoryId: "fashion" })]);
  const r = await runBackfill(db, { apply: true });
  assert.equal(db.rows.get("1").productTypeId, "bread");
  assert.equal(db.rows.get("2").productTypeId, null, "no evidence: left for review, not guessed");
  assert.deepEqual(r.review.map((x) => x.id).sort(), ["2", "3"]);
  assert.match(reviewCsv(r.review), /^item_id,business_id,name,reason/);
});

test("a type the seller already chose, including Other, is never overwritten", async () => {
  const db = memory([item("1", "Bread 400g", { productTypeId: "dress-shirt" }), item("2", "Bread 400g", { productTypeId: "other" })]);
  const r = await runBackfill(db, { apply: true });
  assert.equal(db.rows.get("1").productTypeId, "dress-shirt");
  assert.equal(db.rows.get("2").productTypeId, "other");
  assert.equal(r.alreadyTyped, 2);
  assert.equal(r.toAssign, 0);
});

test("idempotent: a second apply changes nothing, and a type set in between is kept", async () => {
  const db = memory([item("1", "Bread 400g"), item("2", "Bread 800g")]);
  const first = await runBackfill(db, { apply: true });
  assert.equal(first.written, 2);
  const second = await runBackfill(db, { apply: true });
  assert.equal(second.written, 0);
  assert.equal(second.alreadyTyped, 2);

  // a seller picks a type after the plan was made but before the write
  const racing = memory([item("9", "Bread 400g")]);
  const load = racing.loadItems;
  racing.loadItems = async () => { const out = await load(); racing.rows.get("9").productTypeId = "dress-shirt"; return out; };
  const r = await runBackfill(racing, { apply: true });
  assert.equal(r.written, 0);
  assert.equal(r.changedUnderUs, 1);
  assert.equal(racing.rows.get("9").productTypeId, "dress-shirt");
});

test("a type a shop may not sell is never assigned to it", () => {
  const plan = planBackfill([item("1", "Prescription medicine", { categoryId: "bakery" }), item("2", "Prescription medicine", { categoryId: "chemist" })], TYPES);
  assert.deepEqual(plan.assign.map((a) => [a.id, a.typeId]), [["2", "prescription-medicine"]]);
  assert.equal(plan.review.some((r) => r.id === "1"), true);
});

test("Other is never assigned by the backfill", () => {
  const plan = planBackfill([item("1", "Other"), item("2", "Other goods")], TYPES);
  assert.equal(plan.assign.length, 0);
});

test("the review list quotes names with commas and quotes", () => {
  const csv = reviewCsv([{ id: "1", businessId: "b", name: 'Chair, "big"', reason: "x", suggestion: null, candidates: [] }]);
  assert.match(csv, /"Chair, ""big"""/);
});
