// Migration 0116 (Prompt A21): combine similar items, redirects and undo.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_merge_items" })); await seedFixtures(c); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_merges; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const add = async (biz, name, price, extra = "") => (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft) values ($1, $2, $3, 'fixed', true, false) returning id`, [biz, name, price]))[0].id;
const run = (who, text, params = []) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const merge = async (who, list, spec) => (await run(who, `select seller_merge_items($1::uuid[], $2::jsonb) as r`, [list, JSON.stringify(spec)]))[0].r;
const breadSpec = (a, b) => ({ name: "Bread", axes: [{ key: "weight", label: "Weight", labels: { [a]: "400 g", [b]: "800 g" } }] });

test("the key matches the shared rule", async () => {
  const k = async (n) => (await sql(c, `select item_similar_key($1) as k`, [n]))[0].k;
  assert.equal(await k("Bread 400g"), "bread");
  assert.equal(await k("Bread 800 g"), "bread");
  assert.equal(await k("Drinking water 20 Litres"), "drinking water");
  assert.equal(await k("Cotton shirt Red"), "cotton shirt");
  assert.equal(await k("Rice 1kg"), "rice");
});

test("groups list only the shop's own items without options", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110);
  await add(ids.bizA, "Milk", 70); await add(ids.bizB, "Bread 600g", 80);
  const g = (await run(asA, `select seller_similar_item_groups() as r`))[0].r;
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].items.map((i) => i.id).sort(), [a, b].sort());
  assert.deepEqual((await run(asB, `select seller_similar_item_groups() as r`))[0].r, []);
});

test("merge makes one item with a combination per old item, hides the others and redirects them", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110);
  await sql(c, `update items set sale_price = 100 where id = $1`, [b]);
  const r = await merge(asA, [a, b], breadSpec(a, b));
  assert.equal(r.itemId, a);
  const [item] = await sql(c, `select name, option_axes, visible, price_min, price_high, has_options from items where id = $1`, [a]);
  assert.equal(item.name, "Bread"); assert.equal(item.has_options, true);
  assert.deepEqual(item.option_axes[0].values.map((v) => v.id), ["400-g", "800-g"]);
  const vars = await sql(c, `select choice, price, sale_price from item_variants where item_id = $1 order by sort`, [a]);
  assert.deepEqual(vars.map((v) => [v.choice.weight, Number(v.price), v.sale_price && Number(v.sale_price)]), [["400-g", 60, null], ["800-g", 110, 100]]);
  assert.equal((await sql(c, `select visible from items where id = $1`, [b]))[0].visible, false);
  const red = (await sql(c, `select public_item_redirect($1) as r`, [b]))[0].r;
  assert.deepEqual(red, { itemId: a, choice: { weight: "800-g" }, param: "800-g" });
  assert.equal((await sql(c, `select public_item_redirect($1) as r`, [a]))[0].r, null);
});

test("two axes: the water grid keeps its other combinations unavailable", async () => {
  const w = [await add(ids.bizA, "Water 5L refill", 30), await add(ids.bizA, "Water 5L new", 150), await add(ids.bizA, "Water 20L refill", 80)];
  await merge(asA, w, { name: "Drinking water", axes: [
    { key: "size", label: "Container size", labels: { [w[0]]: "5 L", [w[1]]: "5 L", [w[2]]: "20 L" } },
    { key: "fill", label: "How it is filled", labels: { [w[0]]: "Refill", [w[1]]: "New bottle", [w[2]]: "Refill" } }] });
  const v = await sql(c, `select combo_key, price from item_variants where item_id = $1 order by sort`, [w[0]]);
  assert.deepEqual(v.map((x) => [x.combo_key, Number(x.price)]), [["size=5-l|fill=refill", 30], ["size=5-l|fill=new-bottle", 150], ["size=20-l|fill=refill", 80]]);
  const red = (await sql(c, `select public_item_redirect($1) as r`, [w[2]]))[0].r;
  assert.deepEqual(red.choice, { size: "20-l", fill: "refill" });
  assert.equal(red.param, "20-l.refill");
});

test("no merge across shops, with options, drafts, missing prices or clashing labels", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110), other = await add(ids.bizB, "Bread 1kg", 150);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, other], JSON.stringify(breadSpec(a, other))], /item_not_found/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a], JSON.stringify(breadSpec(a, a))], /invalid_items/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ name: "Bread", axes: [{ key: "weight", label: "Weight", labels: { [a]: "400 g", [b]: "400 g" } }] })], /duplicate_combination/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ name: "Bread", axes: [{ key: "weight", label: "Weight", labels: { [a]: "400 g" } }] })], /invalid_label/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify({ name: "B", axes: breadSpec(a, b).axes })], /invalid_name/);
  await sql(c, `update items set draft = true where id = $1`, [b]);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify(breadSpec(a, b))], /item_is_draft/);
  await sql(c, `update items set draft = false, price = null where id = $1`, [b]);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, b], JSON.stringify(breadSpec(a, b))], /price_required/);
  await sql(c, `update items set price = 110 where id = $1`, [b]);
  await merge(asA, [a, b], breadSpec(a, b));
  const c2 = await add(ids.bizA, "Bread 1kg", 150);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[a, c2], JSON.stringify(breadSpec(a, c2))], /has_options/);
  await rejects(c, asA, `select seller_merge_items($1::uuid[], $2::jsonb)`, [[b, c2], JSON.stringify(breadSpec(b, c2))], /already_merged/);
});

test("undo restores both items and drops the redirect; only inside the window and only by the owner", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110);
  const { mergeId } = await merge(asA, [a, b], breadSpec(a, b));
  assert.equal((await run(asA, `select seller_recent_merges() as r`))[0].r.length, 1);
  await rejects(c, asB, `select seller_undo_merge($1)`, [mergeId], /merge_not_found/);
  await run(asA, `select seller_undo_merge($1)`, [mergeId]);
  const [x] = await sql(c, `select name, option_axes, has_options from items where id = $1`, [a]);
  assert.equal(x.name, "Bread 400g"); assert.deepEqual(x.option_axes, []); assert.equal(x.has_options, false);
  assert.equal((await sql(c, `select visible from items where id = $1`, [b]))[0].visible, true);
  assert.equal((await sql(c, `select count(*)::int as n from item_variants where item_id = $1`, [a]))[0].n, 0);
  assert.equal((await sql(c, `select public_item_redirect($1) as r`, [b]))[0].r, null);
  assert.deepEqual((await run(asA, `select seller_recent_merges() as r`))[0].r, []);
  await rejects(c, asA, `select seller_undo_merge($1)`, [mergeId], /already_undone/);
  // and it can be merged again
  await merge(asA, [a, b], breadSpec(a, b));
});

test("undo is refused after 24 hours or after the options were edited", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110);
  const m1 = (await merge(asA, [a, b], breadSpec(a, b))).mergeId;
  await sql(c, `update item_merges set expires_at = now() - interval '1 minute' where id = $1`, [m1]);
  await rejects(c, asA, `select seller_undo_merge($1)`, [m1], /merge_expired/);
  await sql(c, `delete from item_merges`); await sql(c, `update items set option_axes = '[]', visible = true`); await sql(c, `delete from item_variants`);
  const m2 = (await merge(asA, [a, b], breadSpec(a, b))).mergeId;
  await sql(c, `update items set option_axes = jsonb_set(option_axes, '{0,label}', '"Size"') where id = $1`, [a]);
  await rejects(c, asA, `select seller_undo_merge($1)`, [m2], /merge_edited/);
});

test("the redirect is not shown for a combined item that is not public, and anonymous callers cannot merge", async () => {
  const a = await add(ids.bizA, "Bread 400g", 60), b = await add(ids.bizA, "Bread 800g", 110);
  await merge(asA, [a, b], breadSpec(a, b));
  await sql(c, `update items set visible = false where id = $1`, [a]);
  assert.equal((await sql(c, `select public_item_redirect($1) as r`, [b]))[0].r, null);
  await rejects(c, { role: "anon" }, `select seller_merge_items('{}'::uuid[], '{}'::jsonb)`, [], /permission denied/);
  await rejects(c, { role: "anon" }, `select * from item_redirects`, [], /permission denied/);
});
