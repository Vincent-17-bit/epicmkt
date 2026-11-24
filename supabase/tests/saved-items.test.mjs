// Migration 0154: public_saved_items. Listed rows only, in the order asked, at most 200 ids, and a redirect for an item that is not listed.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, asA, withType } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_saved_items" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 20 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_redirects; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const save = (fields) => tx(c, asA, (k) => sql(k, `select seller_save_item(null::uuid, $1::jsonb) as id`, [JSON.stringify(withType(null, fields))]), { commit: true }).then((r) => r[0].id);
const make = async (name, visible = true) => {
  const id = await save({ name, description: "", section: "Cuts", price_type: "fixed", price: 100, availability: "available" });
  await sql(c, `update items set visible = $2, draft = false where id = $1`, [id, visible]);
  return id;
};
const read = (ids) => tx(c, { role: "anon" }, (k) => sql(k, `select public_saved_items($1::uuid[]) as r`, [ids])).then((r) => r[0].r);

test("a listed item comes back with its row; a hidden one with no row", async () => {
  const shown = await make("Fade");
  const hidden = await make("Hidden", false);
  const out = await read([shown, hidden]);
  assert.deepEqual(out.map((e) => e.id), [shown, hidden]); // in the order asked
  assert.equal(out[0].item.name, "Fade");
  assert.equal(out[1].item, null);
  assert.equal(out[1].options, null);
});

test("an unknown id is an entry with no item, never an error", async () => {
  const out = await read(["00000000-0000-4000-8000-000000000000"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].item, null);
  assert.equal(out[0].redirect, null);
});

test("an item the seller merged into another comes back with where it went", async () => {
  const keep = await make("Keep");
  const gone = await make("Gone", false);
  await sql(c, `insert into item_redirects (old_item_id, new_item_id, choice) values ($1, $2, '{}'::jsonb)`, [gone, keep]);
  const out = await read([gone]);
  assert.equal(out[0].item, null);
  assert.equal(out[0].redirect.itemId, keep);
});

test("at most 200 ids are read", async () => {
  const id = await make("Fade");
  const out = await read(Array(201).fill(id));
  assert.equal(out.length, 200);
});

test("an empty list is an empty answer", async () => {
  assert.deepEqual(await read([]), []);
});
