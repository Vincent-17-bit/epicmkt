// Migration 0114 (Prompt A18): the shop's own delivery setting, and what the public payload shows.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { deliveryInfo } from "../../shared/src/delivery.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_delivery" })); await seedFixtures(c); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `update businesses set delivers = null, delivery_fee = null, delivery_radius_km = null, delivery_min_order = null, delivery_notes = null, delivery_area = null`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});
const set = (args, who = asA) => tx(c, who, (k) => sql(k, `select seller_set_delivery($1, $2, $3, $4, $5, $6) as r`, args), { commit: true }).then((r) => r[0].r);
const pub = async (id) => (await sql(c, `select delivery from public_businesses where id = $1`, [id]))[0]?.delivery;

test("a shop that has not answered publishes no delivery, and the shared reader agrees", async () => {
  assert.deepEqual(await pub(ids.bizA), { offers: false });
  assert.equal(deliveryInfo({ delivery: await pub(ids.bizA) }).offers, false);
});

test("delivers with fee, radius, area, minimum and notes; the public object matches the shared reader", async () => {
  const r = await set([true, 150, 5, "  Westlands   and Parklands ", 500, "Mornings only"]);
  assert.deepEqual(r, { offers: true, fee: 150, radiusKm: 5, area: "Westlands and Parklands", minOrder: 500, notes: "Mornings only" });
  assert.deepEqual(await pub(ids.bizA), r);
  assert.deepEqual(deliveryInfo({ delivery: r }), r);
  assert.equal((await sql(c, `select delivery_area from businesses where id = $1`, [ids.bizA]))[0].delivery_area, "Westlands and Parklands");
});

test("no radius is allowed, and a shop that stops delivering publishes only { offers: false }", async () => {
  assert.deepEqual(await set([true, 0, null, "CBD", null, null]), { offers: true, fee: 0, area: "CBD" });
  assert.deepEqual(await set([false, 100, 5, "CBD", 0, "x"]), { offers: false });
  assert.deepEqual(await pub(ids.bizA), { offers: false });
});

test("bad values are refused with a named error and nothing is saved", async () => {
  const cases = [[null, "invalid_offers"], [[true, -1], "invalid_fee"], [[true, 100001], "invalid_fee"], [[true, null, 0], "invalid_radius"], [[true, null, -2], "invalid_radius"],
    [[true, null, 501], "invalid_radius"], [[true, null, null, null, -1], "invalid_min_order"], [[true, null, null, "a".repeat(121)], "invalid_area"], [[true, null, null, null, null, "n".repeat(301)], "invalid_notes"]];
  for (const [args, code] of cases) {
    const a = args === null ? [null] : args;
    const full = [a[0], a[1] ?? null, a[2] ?? null, a[3] ?? null, a[4] ?? null, a[5] ?? null];
    await rejects(c, asA, `select seller_set_delivery($1, $2, $3, $4, $5, $6)`, full, new RegExp(code));
  }
  assert.deepEqual(await pub(ids.bizA), { offers: false });
});

test("a shop sets only its own, and anonymous callers cannot set anything", async () => {
  await set([true, 50, 3, "Town", null, null], asA);
  assert.deepEqual(await pub(ids.bizB), { offers: false });
  await rejects(c, { role: "anon" }, `select seller_set_delivery(true)`, [], /permission denied|not_a_seller|42501/);
});

test("the old delivery_area is taken as a yes when the migration ran", async () => {
  await sql(c, `update businesses set delivers = null, delivery_area = 'Karen' where id = $1`, [ids.bizA]);
  await sql(c, `update businesses set delivers = true where delivers is null and nullif(btrim(delivery_area), '') is not null`);
  assert.equal((await pub(ids.bizA)).offers, true);
});

test("the setting is audited", async () => {
  await set([true, 10, 2, "Kasarani", null, null]);
  assert.ok((await sql(c, `select 1 from audit_log where action = 'delivery_updated'`)).length >= 1);
});
