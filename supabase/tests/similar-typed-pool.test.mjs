import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql } from "./db.mjs";

// The typed pool of similar_item_candidates (0143): items of the same product type in other stores are fetched even when no word of their
// names is shared, a different type in the same section is not, and nothing hidden, draft or inactive ever appears. The rows carry
// product_type_id. The index of 0142 exists.

let c;
let T1; // the seed's type
let T2; // another type
const anon = { role: "anon" };
const store = (n) => `10000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
const item = (n) => `20000000-0000-0000-0000-0000000005${String(n).padStart(2, "0")}`;
const SEED = item(1);

// Inserted as a draft, then made live with the publish gate (0099) switched off for this database: this test is about fetching, not the gate.
const add = async (n, business, name, type, section = "Mixed", set = {}) => {
  await sql(c, `insert into items (id, business_id, name, section, price, product_type_id, draft) values ($1, $2, $3, $4, 100, $5, true)`, [item(n), business, name, section, type]);
  await sql(c, `update items set draft = false, visible = true, spec_gate_exempt = true where id = $1`, [item(n)]);
  for (const [col, val] of Object.entries(set)) await sql(c, `update items set ${col} = $2 where id = $1`, [item(n), val]);
};
const ask = async (terms, { id = SEED, limit = 50 } = {}) =>
  (await tx(c, anon, (k) => sql(k, `select public.similar_item_candidates($1, $2::text[], $3) as out`, [id, terms, limit])))[0].out;
const names = (out) => out.map((r) => r.name);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_similar_typed_pool" }));
  await seedFixtures(c);
  await sql(c, `alter table items disable trigger items_spec_gate`);
  // two types any shop may sell
  const types = await sql(c, `select id from product_types where active and cardinality(restricted_to) = 0 and id <> 'other' order by id limit 2`);
  [T1, T2] = types.map((r) => r.id);
  assert.ok(T1 && T2, "the seeded types include two that any shop may sell");
  for (const n of [1, 2, 3, 4]) {
    const user = `00000000-0000-0000-0000-0000000001${String(n).padStart(2, "0")}`;
    await sql(c, `insert into auth.users (id, email) values ('${user}', 'p${n}@test')`);
    await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, paid_until) values ('${store(n)}', 'ES3000${n}', '${user}', 'typed-${n}', 'Typed ${n}', 'barber', 'standard', 'live', '+25471300000${n}', now() + interval '30 days')`);
  }
  // store 1 is the current store; the seed is of type T1 and shares no word with the others
  await add(1, store(1), "Zuri 5", T1, null);       // no section: only the typed pool can find anything
  await add(2, store(2), "Omega 9", T1, "Elsewhere");           // same type, other store, no shared word, different section: found
  await add(3, store(3), "Kappa", T1, "Another");                // same type, third store: found
  await add(4, store(2), "Sigma 2", T2, "Mixed");                // other type, SAME section as the seed: not found by type
  await add(5, store(3), "Hidden", T1, "Elsewhere", { visible: false });
  await add(6, store(3), "Draft", T1, "Elsewhere", { draft: true });
  await add(7, store(3), "Sold out", T1, "Elsewhere", { availability: "out_of_stock" });
  await add(8, store(3), "Removed", T1, "Elsewhere", { removed_by_admin: true });
  await add(9, store(1), "Own store item", T1, "Elsewhere");     // the current store's own item is never a candidate
});
after(async () => { await c.end(); });

test("two same-type items with no shared word, in different stores and sections, find each other", async () => {
  const out = await ask([]);
  assert.deepEqual(new Set(names(out)), new Set(["Omega 9", "Kappa"]));
});

test("a different-type item in the same section is not fetched by the type, and the rows carry product_type_id", async () => {
  const out = await ask([]);
  assert.ok(!names(out).includes("Sigma 2"));
  assert.ok(out.every((r) => r.product_type_id === T1));
  // the section net is unchanged: with a section on the seed, the other type comes in again, saying what type it is, so the ranker can refuse it
  await sql(c, `update items set section = 'Mixed' where id = $1`, [SEED]);
  const bySection = await ask([]);
  assert.ok(bySection.some((r) => r.name === "Sigma 2" && r.product_type_id === T2));
  await sql(c, `update items set section = null where id = $1`, [SEED]);
});

test("hidden, draft, inactive and removed items never appear, nor does the current store or item", async () => {
  const out = await ask([]);
  const found = new Set(names(out));
  for (const n of ["Hidden", "Draft", "Sold out", "Removed", "Own store item", "Zuri 5"]) assert.ok(!found.has(n), n);
});

test("the seed from another store with no type, or 'other', gets no typed pool", async () => {
  await sql(c, `update items set product_type_id = 'other' where id = $1`, [SEED]);
  assert.deepEqual(names(await ask([])), []);
  await sql(c, `update items set product_type_id = null where id = $1`, [SEED]);
  assert.deepEqual(names(await ask([])), []);
  await sql(c, `update items set product_type_id = $2 where id = $1`, [SEED, T1]);
});

test("the per-store cap and the limit still hold with the typed pool", async () => {
  for (let n = 0; n < 6; n += 1) await add(30 + n, store(4), `Bulk ${n}x`, T1, "Bulkland");
  const out = await ask([]);
  assert.equal(out.filter((r) => r.business_id === store(4)).length, 3, "three per store");
  const small = await ask([], { limit: 2 });
  assert.equal(small.length, 2);
});

test("the index for the typed pool exists and is valid", async () => {
  const rows = await sql(c, `select i.indisvalid from pg_index i join pg_class k on k.oid = i.indexrelid where k.relname = 'items_type_recent_idx'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].indisvalid, true);
});
