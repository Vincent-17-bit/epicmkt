import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids } from "./db.mjs";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";
const ITEM = "20000000-0000-0000-0000-0000000000b1";

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_public_offers" }));
  await seedFixtures(c);
  await sql(c, `update businesses set paid_until = ${PAID}`);
  // Offers are on products: customers only see an offer that is on at least one product they can see.
  await sql(c, `insert into items (id, business_id, name, price) values ('${ITEM}', '${ids.bizB}', 'Juice', 100)`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from offers`);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = ${PAID}`);
});

const offer = async (biz, title, extra = {}) => {
  const cols = { business_id: biz, title, kind: "percent_off", config: { percent: 10 }, ...extra };
  const keys = Object.keys(cols);
  const rows = await sql(c, `insert into offers (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning id`, Object.values(cols).map((v) => (v && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v)));
  await sql(c, `insert into offer_items (offer_id, item_id, business_id) values ($1, '${ITEM}', $2)`, [rows[0].id, biz]);
  return rows[0].id;
};
const visible = async (biz) =>
  (await tx(c, anon, (k) => sql(k, `select id from public_offers where business_id = $1 order by title`, [biz]))).map((r) => r.id);

test("customers see only offers that are running now", async () => {
  const open = await offer(ids.bizB, "A open-ended");
  const windowed = await offer(ids.bizB, "B in window", { starts_at: new Date(Date.now() - 3600000), ends_at: new Date(Date.now() + 3600000) });
  await offer(ids.bizB, "C finished", { starts_at: new Date(Date.now() - 7200000), ends_at: new Date(Date.now() - 3600000) });
  await offer(ids.bizB, "D not started", { starts_at: new Date(Date.now() + 3600000) });
  await offer(ids.bizB, "E switched off", { active: false });
  assert.deepEqual(await visible(ids.bizB), [open, windowed]);
});

test("offers hidden or removed by an admin never appear", async () => {
  const shown = await offer(ids.bizB, "Shown");
  await offer(ids.bizB, "Hidden", { hidden_by_admin: true });
  await offer(ids.bizB, "Removed", { removed_by_admin: true });
  assert.deepEqual(await visible(ids.bizB), [shown]);
});

test("offers of a business that is not live are not public", async () => {
  await offer(ids.bizB, "Shown");
  assert.equal((await visible(ids.bizB)).length, 1);
  await sql(c, `update businesses set status = 'paused' where id = $1`, [ids.bizB]);
  assert.equal((await visible(ids.bizB)).length, 0);
  await sql(c, `update businesses set status = 'live', deleted_at = now() where id = $1`, [ids.bizB]);
  assert.equal((await visible(ids.bizB)).length, 0);
});

test("the view exposes only customer-safe columns and the base table stays closed to anon", async () => {
  await offer(ids.bizB, "Shown");
  await rejects(c, anon, `select admin_reason from public_offers`, [], /column "admin_reason" does not exist/);
  await rejects(c, anon, `select id from offers`, [], /permission denied|row-level security/);
});
