import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService, withType } from "./db.mjs";

// Migration 0137: longer details, a photo for each "What's included" line, and reordering the frames of a photo spin.
let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_details_room" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
});
after(async () => { await c.end(); });

const uuid = () => crypto.randomUUID();
const svc = (text, params) => tx(c, asService, (k) => sql(k, text, params), { commit: true });
const mine = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const save = (who, id, fields) => mine(who, `select seller_save_item($1, $2::jsonb) as id`, [id, JSON.stringify(withType(id, fields))]).then((r) => r[0].id);
const base = { name: "White bread", price_type: "fixed", price: 65, availability: "available" };

test("a highlight can be 250 characters with a 60 character lead; 251 is refused", async () => {
  const id = await save(asA, null, { ...base, highlights: [{ title: "L".repeat(60), text: "x".repeat(250) }] });
  const [row] = await sql(c, `select highlights from items where id = $1`, [id]);
  assert.equal(row.highlights[0].text.length, 250);
  await rejects(c, asA, `select seller_save_item($1, $2::jsonb)`, [id, JSON.stringify({ ...base, highlights: [{ text: "x".repeat(251) }] })], /invalid_details/);
  const twelve = Array.from({ length: 12 }, (_, i) => ({ text: `Point ${i + 1}` }));
  await save(asA, id, { ...base, highlights: twelve });
  await rejects(c, asA, `select seller_save_item($1, $2::jsonb)`, [id, JSON.stringify({ ...base, highlights: [...twelve, { text: "13" }] })], /invalid_details/);
});

test("specs, what's included, pack size and terms have room for real detail", async () => {
  const specs = Array.from({ length: 150 }, (_, i) => ({ group: i % 2 ? "Measurements" : "Features & Specs", label: `Fact ${i} ${"l".repeat(80)}`, value: "v".repeat(1500) }));
  const includes = Array.from({ length: 40 }, (_, i) => `Line ${i} ${"t".repeat(250)}`);
  const id = await save(asA, null, { ...base, specs, includes, pack_size: "p".repeat(120), terms: "t".repeat(5000) });
  const [row] = await sql(c, `select jsonb_array_length(specs) as n, cardinality(includes) as inc, char_length(pack_size) as pack, char_length(terms) as terms from items where id = $1`, [id]);
  assert.deepEqual([row.n, row.inc, row.pack, row.terms], [150, 40, 120, 5000]);
  await rejects(c, asA, `select seller_save_item($1, $2::jsonb)`, [id, JSON.stringify({ ...base, pack_size: "p".repeat(121) })], /invalid_details/);
  await rejects(c, asA, `select seller_save_item($1, $2::jsonb)`, [id, JSON.stringify({ ...base, terms: "t".repeat(5001) })], /invalid_details/);
  await rejects(c, asA, `select seller_save_item($1, $2::jsonb)`, [id, JSON.stringify({ ...base, specs: [{ group: "Features & Specs", label: "a", value: "v".repeat(2001) }] })], /invalid_details/);
});

test("each included line can point at one of the item's own photos; the public view gives the photo path", async () => {
  const id = await save(asA, null, { ...base, includes: ["Loaf", "Bag"] });
  await sql(c, `update items set draft = false, visible = true where id = $1`, [id]);
  const path = `${ids.bizA}/${id}/${uuid()}`;
  await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 800, 600, null, 1000)`, [id, path]);
  const [m] = await sql(c, `select id from item_media where path = $1`, [path]);
  const stored = (await mine(asA, `select seller_set_item_include_media($1, $2::jsonb) as r`, [id, JSON.stringify([null, m.id])]))[0].r;
  assert.deepEqual(stored, [null, m.id]);
  const [pub] = await sql(c, `select include_media from public_items where id = $1`, [id]);
  assert.deepEqual(pub.include_media, [null, path]);
  // Another shop cannot set it, and a photo of another item is refused.
  await rejects(c, asB, `select seller_set_item_include_media($1, $2::jsonb)`, [id, JSON.stringify([m.id])], /item_not_found/);
  await rejects(c, asA, `select seller_set_item_include_media($1, $2::jsonb)`, [id, JSON.stringify([uuid()])], /invalid_details/);
  // Deleting the photo leaves the line without one.
  await sql(c, `delete from item_media where id = $1`, [m.id]);
  const [after] = await sql(c, `select include_media from items where id = $1`, [id]);
  assert.deepEqual(after.include_media, [null, null]);
  // All empty is stored as an empty list.
  const cleared = (await mine(asA, `select seller_set_item_include_media($1, $2::jsonb) as r`, [id, JSON.stringify([null, null])]))[0].r;
  assert.deepEqual(cleared, []);
});

test("seller_reorder_spin puts one scope's frames in the order given, and refuses an incomplete list", async () => {
  const id = (await sql(c, `insert into items (business_id, name, price) values ($1, 'Mug', 100) returning id`, [ids.bizA]))[0].id;
  const paths = [];
  for (let i = 0; i < 12; i++) {
    const p = `${ids.bizA}/${id}/${uuid()}`;
    paths.push(p);
    await svc(`select attach_item_media3d($1, 'spin-frame', $2, 'image/jpeg', null, null, 1000, '{}'::text[], $3)`, [id, p, i]);
  }
  const reversed = [...paths].reverse();
  const r = (await mine(asA, `select seller_reorder_spin($1, null, $2::text[]) as r`, [id, reversed]))[0].r;
  assert.equal(r.updated, 12);
  const order = (await sql(c, `select path from item_media where item_id = $1 and kind = 'spin' order by sort`, [id])).map((x) => x.path);
  assert.deepEqual(order, reversed);
  await rejects(c, asA, `select seller_reorder_spin($1, null, $2::text[])`, [id, paths.slice(1)], /invalid_order/);
  await rejects(c, asB, `select seller_reorder_spin($1, null, $2::text[])`, [id, paths], /item_not_found/);
});
