import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_location" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const move = (who, lat, lng, address) =>
  tx(c, who, async (k) => (await sql(k, `select seller_set_location($1, $2, $3) as r`, [lat, lng, address ?? null]))[0].r, { commit: true });
const row = async (id) => (await sql(c, `select lat, lng, address from businesses where id = '${id}'`))[0];

test("a seller moves their own pin and the address, and it is audited", async () => {
  const out = await move(asA, -0.0917349, 34.5995012, "  Next to the stage ");
  assert.deepEqual(out, { lat: -0.091735, lng: 34.599501, address: "Next to the stage" });
  assert.deepEqual(await row(ids.bizA), { lat: -0.091735, lng: 34.599501, address: "Next to the stage" });
  const audit = await sql(c, `select data from audit_log where business_id = '${ids.bizA}' and action = 'location_updated'`);
  assert.equal(audit.length, 1);
});

test("no address keeps the saved one, an empty one clears it", async () => {
  await move(asA, -0.1, 34.6, "Opposite the market");
  await move(asA, -0.11, 34.61);
  assert.equal((await row(ids.bizA)).address, "Opposite the market");
  await move(asA, -0.11, 34.61, "   ");
  assert.equal((await row(ids.bizA)).address, null);
});

test("it never touches another seller's shop", async () => {
  const before = await row(ids.bizB);
  await move(asA, 0.5, 34.5, "Mine");
  assert.deepEqual(await row(ids.bizB), before);
});

test("pins outside Kenya, missing values and long addresses are refused", async () => {
  for (const [lat, lng] of [[51.5, -0.12], [0, 20], [-6, 37], [0, 43], [null, 34], [0, null]]) {
    await rejects(c, asA, `select seller_set_location($1, $2)`, [lat, lng], /invalid_location/);
  }
  await rejects(c, asA, `select seller_set_location(0, 34, $1)`, ["x".repeat(201)], /invalid_address/);
  await rejects(c, asA, `select seller_set_location('NaN'::float8, 34)`, [], /invalid_location/);
});

test("a suspended seller cannot move the pin, and the function is closed to anonymous callers", async () => {
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizB}'`);
  await rejects(c, asB, `select seller_set_location(0, 34)`, [], /account_suspended/);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);
  const grants = await sql(c, `select has_function_privilege('anon', 'public.seller_set_location(double precision, double precision, text)', 'execute') as anon`);
  assert.equal(grants[0].anon, false);
});
