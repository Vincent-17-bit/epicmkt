import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asService } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_media_sequence" }));
  await seedFixtures(c);
  await sql(c, `update businesses set paid_until = now() + interval '20 days'`);
});
after(async () => { await c.end(); });
beforeEach(() => sql(c, `delete from item_media`));

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const item = async (biz = ids.bizA) => (await sql(c, `insert into items (business_id, name, price, visible, draft) values ($1, 'Thing', 100, true, false) returning id`, [biz]))[0].id;
const path = (name, biz = ids.bizA) => `${biz}/${name}`;
const attach = (it, kind, name, extra = {}) =>
  as(asService, `select attach_item_media($1, $2, $3, $4, $5, $6, $7, $8) as id`, [it, kind, path(name), kind === "image" ? "image/webp" : "video/mp4", extra.w ?? 800, extra.h ?? 600, extra.d ?? null, 1000]);
const order = async (it) => (await sql(c, `select path from item_media where item_id = $1 order by sort, created_at, id`, [it])).map((r) => r.path.split("/")[1]);
const reorder = (it, names, biz = ids.bizA) => as(asA, `select seller_reorder_item_media($1, $2::text[]) as n`, [it, names.map((n) => path(n, biz))]);

test("attached media gets one running position across photos and videos, even after a delete", async () => {
  const it = await item();
  await attach(it, "image", "p1");
  await attach(it, "video", "v1.mp4", { d: 12.5 });
  await attach(it, "image", "p2");
  assert.deepEqual(await order(it), ["p1", "v1.mp4", "p2"]);
  await sql(c, `delete from item_media where path = $1`, [path("v1.mp4")]);
  await attach(it, "image", "p3");
  assert.deepEqual((await sql(c, `select sort from item_media where item_id = $1 order by sort`, [it])).map((r) => r.sort), [0, 2, 3]);
  assert.deepEqual(await order(it), ["p1", "p2", "p3"]);
});

test("reorder writes a mixed order and positions become dense", async () => {
  const it = await item();
  await attach(it, "image", "a");
  await attach(it, "video", "b.mp4", { d: 5 });
  await attach(it, "image", "c");
  await reorder(it, ["b.mp4", "c", "a"]);
  assert.deepEqual(await order(it), ["b.mp4", "c", "a"]);
  assert.deepEqual((await sql(c, `select sort from item_media where item_id = $1 order by sort`, [it])).map((r) => r.sort), [0, 1, 2]);
});

test("reorder keeps unlisted media after the listed ones and ignores unknown or repeated paths", async () => {
  const it = await item();
  for (const n of ["a", "b", "c", "d"]) await attach(it, "image", n);
  await reorder(it, ["c", "ghost", "c", "a"]);
  assert.deepEqual(await order(it), ["c", "a", "b", "d"]);
  assert.equal((await reorder(it, ["c", "a", "b", "d"]))[0].n, 0);
});

test("reorder is refused for another seller's item, with no list, and for anon", async () => {
  const mine = await item(ids.bizA);
  const theirs = await item(ids.bizB);
  await attach(mine, "image", "a");
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [theirs, [path("a")]], /item_not_found/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [mine, []], /no_items/);
  await rejects(c, { role: "anon" }, `select seller_reorder_item_media($1, $2::text[])`, [mine, [path("a")]], /permission denied/);
});

test("reorder cannot move another shop's media even if its path is named", async () => {
  const mine = await item(ids.bizA);
  const theirs = await item(ids.bizB);
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime, sort) values ($1, $2, 'image', $3, 'image/webp', 7)`, [theirs, ids.bizB, path("x", ids.bizB)]);
  await attach(mine, "image", "a");
  await reorder(mine, ["x", "a"]);
  assert.equal((await sql(c, `select sort from item_media where path = $1`, [path("x", ids.bizB)]))[0].sort, 7);
});

test("list returns the full ordered sequence with kind and duration, scoped to the seller", async () => {
  const it = await item();
  const other = await item(ids.bizB);
  await attach(it, "video", "v.mp4", { d: 9.25, w: 1280, h: 720 });
  await attach(it, "image", "p", { w: 900, h: 900 });
  const list = (await as(asA, `select seller_list_item_media($1) as r`, [it]))[0].r;
  assert.deepEqual(list.map((m) => [m.path.split("/")[1], m.kind]), [["v.mp4", "video"], ["p", "image"]]);
  assert.equal(Number(list[0].durationSec), 9.25);
  assert.equal(list[0].width, 1280);
  assert.equal(list[1].durationSec, null);
  await rejects(c, asA, `select seller_list_item_media($1)`, [other], /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_list_item_media($1)`, [it], /permission denied/);
});

test("the public view lists one mixed sequence and still lists photos and videos on their own", async () => {
  const it = await item();
  await attach(it, "image", "p1");
  await attach(it, "video", "v1.mp4", { d: 30 });
  await attach(it, "image", "p2");
  await reorder(it, ["v1.mp4", "p2", "p1"]);
  const [row] = await sql(c, `select image_paths, video_paths, media from public_items where id = $1`, [it]);
  const name = (p) => p.split("/")[1];
  assert.deepEqual(row.media.map((m) => [m.kind, name(m.path)]), [["video", "v1.mp4"], ["image", "p2"], ["image", "p1"]]);
  assert.equal(Number(row.media[0].durationSec), 30);
  assert.deepEqual(row.image_paths.map(name), ["p2", "p1"]);
  assert.deepEqual(row.video_paths.map(name), ["v1.mp4"]);
});

test("an item with only old photos and videos (all position 0) still lists in upload order", async () => {
  const it = await item();
  for (const [kind, n, ms] of [["image", "old1", 3], ["video", "old2.mp4", 2], ["image", "old3", 1]]) {
    await sql(c, `insert into item_media (item_id, business_id, kind, path, mime, sort, created_at) values ($1, $2, $3, $4, 'x/y', 0, now() - ($5 || ' minutes')::interval)`, [it, ids.bizA, kind, path(n), ms]);
  }
  const [row] = await sql(c, `select media from public_items where id = $1`, [it]);
  assert.deepEqual(row.media.map((m) => m.path.split("/")[1]), ["old1", "old2.mp4", "old3"]);
});

test("an item without media has an empty media list", async () => {
  const it = await item();
  assert.deepEqual((await sql(c, `select media from public_items where id = $1`, [it]))[0].media, []);
});
