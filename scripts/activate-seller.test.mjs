import { test } from "node:test";
import assert from "node:assert/strict";
import { activateSeller, makePassword, makeSellerId, sellerEmail } from "./lib/activate-seller.mjs";
import { passwordProblems } from "@epicmkt/shared";

function fakeDb({ failBusiness = null } = {}) {
  const log = { users: [], deleted: [], businesses: [], payments: [], apps: [] };
  const builder = (table) => ({
    insert: (row) => {
      if (table === "payments") { log.payments.push(row); return Promise.resolve({ error: null }); }
      const err = failBusiness?.shift?.();
      if (err) return { select: () => ({ single: () => Promise.resolve({ error: err }) }) };
      log.businesses.push(row);
      return { select: () => ({ single: () => Promise.resolve({ data: { id: `biz-${log.businesses.length}` }, error: null }) }) };
    },
    update: (row) => ({ eq: (c, v) => { log.apps.push({ row, c, v }); return Promise.resolve({ error: null }); } }),
  });
  return {
    log,
    from: builder,
    auth: { admin: {
      createUser: (u) => { log.users.push(u); return Promise.resolve({ data: { user: { id: `user-${log.users.length}` } }, error: null }); },
      deleteUser: (id) => { log.deleted.push(id); return Promise.resolve({}); },
    } },
  };
}

test("generated passwords always satisfy the rules", () => {
  for (let i = 0; i < 200; i++) {
    const id = makeSellerId();
    assert.match(id, /^ES\d{6}$/);
    assert.deepEqual(passwordProblems(makePassword({ sellerId: id, phone: "+254712345678" }), { sellerId: id, phone: "+254712345678" }), []);
  }
});

test("activation creates the auth user and a live business", async () => {
  const db = fakeDb();
  const now = () => new Date("2026-01-01T00:00:00Z");
  const out = await activateSeller(db, { name: "Fresh Cuts", categoryId: "barber", planKey: "premium", phone: "+254712345678", applicationId: "app-1", payment: { amountKes: 1500, reference: "QWE" } }, { now });
  assert.match(out.sellerId, /^ES\d{6}$/);
  assert.equal(db.log.users[0].email, sellerEmail(out.sellerId));
  assert.equal(db.log.users[0].password, out.password);
  assert.equal(db.log.users[0].email_confirm, true);
  const row = db.log.businesses[0];
  assert.equal(row.status, "live");
  assert.equal(row.plan_key, "premium");
  assert.equal(row.paid_until, "2026-01-31T00:00:00.000Z");
  assert.match(row.slug, /^fresh-cuts-\d{6}$/);
  assert.equal(db.log.payments[0].amount_kes, 1500);
  assert.deepEqual(db.log.apps[0], { row: { status: "activated", seller_id: out.sellerId }, c: "id", v: "app-1" });
});

test("a failed business insert removes the auth user and retries on a duplicate ID", async () => {
  const db = fakeDb({ failBusiness: [{ code: "23505", message: "duplicate key" }] });
  const out = await activateSeller(db, { name: "Retry Shop", categoryId: "barber", phone: "+254712345678" });
  assert.equal(db.log.users.length, 2);
  assert.deepEqual(db.log.deleted, ["user-1"]);
  assert.equal(db.log.businesses.length, 1);
  assert.equal(out.userId, "user-2");
  const bad = fakeDb({ failBusiness: [{ code: "XX", message: "boom" }] });
  await assert.rejects(activateSeller(bad, { name: "Broken", categoryId: "barber", phone: "+254712345678" }), /business: boom/);
  assert.deepEqual(bad.log.deleted, ["user-1"]);
});
