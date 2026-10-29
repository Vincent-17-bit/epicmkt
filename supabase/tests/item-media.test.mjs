import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_item_media" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
});
after(async () => { await c.end(); });

const uuid = () => crypto.randomUUID();
const svc = (text, params) => tx(c, asService, (k) => sql(k, text, params), { commit: true });
const mine = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const newItem = async (biz = ids.bizA) => (await sql(c, `insert into items (business_id, name, price) values ($1, 'Thing', 100) returning id`, [biz]))[0].id;
const reset = () => sql(c, `delete from item_media; delete from media_uploads; delete from media_gc`);
const add = async (item, kind, biz = ids.bizA, duration = null) => {
  const path = `${biz}/${item}/${uuid()}${kind === "video" ? ".mp4" : ""}`;
  await svc(`select attach_item_media($1, $2, $3, $4, 800, 600, $5, 1000)`, [item, kind, path, kind === "video" ? "video/mp4" : "image/jpeg", duration]);
  return path;
};
const order = async (item) => (await sql(c, `select path from item_media where item_id = $1 order by sort, created_at, id`, [item])).map((r) => r.path);
const sorts = async (item) => (await sql(c, `select sort from item_media where item_id = $1 order by sort`, [item])).map((r) => r.sort);
const limits = async () => (await sql(c, `select standard, premium from global_limits where id = 1`))[0];

test("attach appends to ONE sequence shared by photos and videos, and never collides after a delete", async () => {
  await reset();
  const it = await newItem();
  const p1 = await add(it, "image");
  const v1 = await add(it, "video", ids.bizA, 12.5);
  const p2 = await add(it, "image");
  assert.deepEqual(await order(it), [p1, v1, p2]);
  assert.deepEqual(await sorts(it), [0, 1, 2]);
  await sql(c, `delete from item_media where path = $1`, [p1]);
  const p3 = await add(it, "image");
  assert.deepEqual(await sorts(it), [1, 2, 3], "the new row gets max+1, not count");
  assert.deepEqual(await order(it), [v1, p2, p3]);
});

test("seller_reorder_item_media orders the whole sequence; the cover is the first photo, never a video", async () => {
  await reset();
  const it = await newItem();
  const p1 = await add(it, "image");
  const p2 = await add(it, "image");
  const v1 = await add(it, "video", ids.bizA, 9);
  const r = (await mine(asA, `select seller_reorder_item_media($1, $2::text[]) as r`, [it, [v1, p2, p1]]))[0].r;
  assert.deepEqual(await order(it), [v1, p2, p1]);
  assert.deepEqual(await sorts(it), [0, 1, 2]);
  assert.equal(r.cover, p2, "a video in first place does not become the cover");
  assert.equal(r.updated, 2, "v1 and p1 moved; p2 kept slot 1");
  const info = (await mine(asA, `select seller_item_media($1) as r`, [it]))[0].r;
  assert.equal(info.cover, p2);
  assert.deepEqual(info.media.map((m) => [m.path, m.kind]), [[v1, "video"], [p2, "image"], [p1, "image"]]);
  assert.equal(info.media[0].duration, 9);
  assert.equal(info.media[1].duration, null);
  const again = (await mine(asA, `select seller_reorder_item_media($1, $2::text[]) as r`, [it, [v1, p2, p1]]))[0].r;
  assert.equal(again.updated, 0, "same order again changes nothing");
});

test("seller_reorder_item_media rejects foreign items and paths, incomplete, extra and duplicated lists, other roles", async () => {
  await reset();
  const it = await newItem();
  const other = await newItem(ids.bizB);
  const a = await add(it, "image");
  const b = await add(it, "video");
  const foreign = await add(other, "image", ids.bizB);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [other, [foreign]], /item_not_found/);
  await rejects(c, asB, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, b]], /item_not_found/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, foreign]], /path_not_found/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, `${ids.bizA}/${it}/nope`]], /path_not_found/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a]], /order_incomplete/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, []], /order_incomplete/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, a]], /duplicate_path/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, b, a]], /duplicate_path/);
  await rejects(c, asA, `select seller_reorder_item_media($1, null)`, [it], /no_items/);
  await rejects(c, { role: "anon" }, `select seller_reorder_item_media($1, $2::text[])`, [it, [a, b]], /permission denied/);
  assert.deepEqual(await order(it), [a, b], "every refusal left the order alone");
  await sql(c, `update items set removed_by_admin = true where id = $1`, [it]);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [b, a]], /item_not_found/);
  await sql(c, `update items set removed_by_admin = false where id = $1`, [it]);
});

test("an item with no media accepts only an empty list", async () => {
  const it = await newItem();
  const r = (await mine(asA, `select seller_reorder_item_media($1, '{}'::text[]) as r`, [it]))[0].r;
  assert.deepEqual(r, { updated: 0, cover: null });
});

test("seller_item_media reports the sequence and the plan limits, only for the seller's own item", async () => {
  await reset();
  const it = await newItem();
  await add(it, "image"); await add(it, "image"); await add(it, "video");
  const l = await limits();
  const info = (await mine(asA, `select seller_item_media($1) as r`, [it]))[0].r;
  assert.deepEqual(info.limits, {
    photos: { used: 2, max: l.standard.photosPerItem ?? null },
    videos: { used: 1, max: l.standard.videosPerItem ?? null },
  });
  const bizBItem = await newItem(ids.bizB);
  const infoB = (await mine(asB, `select seller_item_media($1) as r`, [bizBItem]))[0].r;
  assert.equal(infoB.limits.photos.max, l.premium.photosPerItem ?? null, "a premium shop sees premium limits");
  assert.deepEqual(infoB.media, []);
  await rejects(c, asB, `select seller_item_media($1)`, [it], /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_item_media($1)`, [it], /permission denied/);
});

test("the deprecated photo reorder keeps videos in their slots and still ignores unknown paths", async () => {
  await reset();
  const it = await newItem();
  const p1 = await add(it, "image");
  const v1 = await add(it, "video");
  const p2 = await add(it, "image");
  const p3 = await add(it, "image");
  const n = (await mine(asA, `select seller_reorder_item_photos($1, $2::text[]) as n`, [it, [p3, "bogus", p3, p1]]))[0].n;
  assert.ok(n > 0);
  assert.deepEqual(await order(it), [p3, v1, p1, p2], "listed photos first inside the photo slots; the video stays second");
  assert.deepEqual(await sorts(it), [0, 1, 2, 3]);
  await rejects(c, asA, `select seller_reorder_item_photos($1, '{}'::text[])`, [it], /no_items/);
  await rejects(c, asB, `select seller_reorder_item_photos($1, $2::text[])`, [it, [p1]], /item_not_found/);
});

test("public_items returns images, videos and the merged media in one order, and hides nothing from anon", async () => {
  await reset();
  const it = await newItem();
  const v1 = await add(it, "video", ids.bizA, 30);
  const p1 = await add(it, "image");
  const p2 = await add(it, "image");
  await mine(asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [p1, v1, p2]]);
  const row = (await tx(c, { role: "anon" }, (k) => sql(k, `select image_paths, video_paths, media from public_items where id = $1`, [it])))[0];
  assert.deepEqual(row.image_paths, [p1, p2]);
  assert.deepEqual(row.video_paths, [v1]);
  assert.deepEqual(row.media, [
    { path: p1, kind: "image", duration: null },
    { path: v1, kind: "video", duration: 30 },
    { path: p2, kind: "image", duration: null },
  ]);
  await mine(asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [v1, p1, p2]]);
  const second = (await tx(c, { role: "anon" }, (k) => sql(k, `select image_paths, media from public_items where id = $1`, [it])))[0];
  assert.deepEqual(second.image_paths, [p1, p2], "a video first does not change the cover");
  assert.equal(second.media[0].kind, "video");
});

test("products_snapshot keeps a card's video paths and only its first photo", async () => {
  await reset();
  const it = await newItem();
  const p1 = await add(it, "image");
  await add(it, "image");
  const v1 = await add(it, "video");
  const s = (await tx(c, { role: "anon" }, (k) => sql(k, `select products_snapshot(100) as s`)))[0].s;
  const card = s.items.find((x) => x.id === it);
  assert.equal(card.image_path, p1);
  assert.deepEqual(card.video_paths, [v1]);
  assert.ok(!("media" in card) && !("image_paths" in card));
});

test("video uploads are registered, bound to one item, and the sweep queues the abandoned ones after three hours", async () => {
  await reset();
  const it = await newItem();
  const other = await newItem(ids.bizB);
  const old = `${ids.bizA}/${it}/${uuid()}.mp4`;
  const fresh = `${ids.bizA}/${it}/${uuid()}.webm`;
  const kept = `${ids.bizA}/${it}/${uuid()}.mp4`;
  for (const p of [old, fresh, kept]) await svc(`select media_register_upload($1, $2, 'item_video', $3)`, [ids.bizA, it, p]);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_video', $3)`, [ids.bizA, it, `${ids.bizA}/${it}/${uuid()}.mov`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_video', $3)`, [ids.bizA, it, `${ids.bizA}/${uuid()}/${uuid()}.mp4`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_video', $3)`, [ids.bizA, other, `${ids.bizA}/${other}/${uuid()}.mp4`], /item_not_found/);
  await rejects(c, asService, `select media_register_upload($1, null, 'item_video', $2)`, [ids.bizA, `${ids.bizA}/${it}/${uuid()}.mp4`], /item_not_found/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_video', $3)`, [ids.bizA, it, `${ids.bizB}/${it}/${uuid()}.mp4`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, `${ids.bizA}/${it}/${uuid()}.mp4`], /path_not_owned/);
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'video', $3, 'video/mp4')`, [it, ids.bizA, kept]);
  await sql(c, `update media_uploads set created_at = now() - interval '2 hours' where public_id = $1`, [fresh]);
  await sql(c, `update media_uploads set created_at = now() - interval '4 hours' where public_id in ($1, $2)`, [old, kept]);
  assert.equal((await svc(`select media_sweep_orphans() as n`))[0].n, 1);
  assert.deepEqual((await sql(c, `select public_id, reason from media_gc`)).map((r) => `${r.public_id}|${r.reason}`), [`${old}|unattached_upload`]);
  assert.deepEqual((await sql(c, `select public_id from media_uploads`)).map((r) => r.public_id), [fresh], "a two hour old video ticket is still valid, so it stays");
  const [conf] = await svc(`select media_confirm_upload($1, $2) as r`, [ids.bizA, fresh]);
  assert.deepEqual(conf.r, { purpose: "item_video", item_id: it });
});

test("the media tables still accept no other purpose and no malformed ids", async () => {
  await rejects(c, asService, `insert into media_uploads (public_id, business_id, item_id, purpose) values ($1, $2, null, 'item_video')`, [`${ids.bizA}/x/${uuid()}.mp4`, ids.bizA], /violates check constraint/);
  await rejects(c, asService, `insert into media_uploads (public_id, business_id, item_id, purpose) values ($1, $2, $3, 'item_video')`, [`${ids.bizA}/${uuid()}.mp4`, ids.bizA, uuid()], /violates check constraint/);
  await rejects(c, asService, `insert into media_uploads (public_id, business_id, purpose) values ($1, $2, 'banner')`, [`${ids.bizA}/profile/${uuid()}`, ids.bizA], /violates check constraint/);
});

test("storage: the bucket is public for reading, accepts only the allowed types and size, and nobody but the owner or an admin can write", async () => {
  const [b] = await sql(c, `select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'seller-media'`);
  assert.equal(b.public, true, "customers read videos straight from the bucket");
  assert.equal(Number(b.file_size_limit), 25 * 1024 * 1024);
  assert.deepEqual([...b.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
  const pol = await sql(c, `select policyname, roles::text[] as roles, cmd, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
    from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual like '%seller-media%' or with_check like '%seller-media%')`);
  assert.ok(pol.length >= 4);
  for (const p of pol) {
    assert.ok(!p.roles.some((r) => r === "anon" || r === "public"), `${p.policyname} must not apply to anon or public`);
    assert.ok(/my_business_id\(\)|is_admin\(\)/.test(p.expr), `${p.policyname} is limited to the owner folder or admins`);
  }
  assert.equal((await sql(c, `select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects' and 'anon' = any (roles::text[])`))[0].n, 0, "no storage policy is open to anon: public reading is the bucket flag, not a listing policy");
  await rejects(c, { role: "anon" }, `insert into storage.objects (bucket_id, name) values ('seller-media', 'x/y/z.mp4')`, [], /permission denied/);
});

test("the new functions are not callable by anon, and the internal ones by nobody but the owner", async () => {
  const it = await newItem();
  await rejects(c, { role: "anon" }, `select media_apply_order($1, '{}'::text[])`, [it], /permission denied/);
  await rejects(c, asA, `select media_apply_order($1, '{}'::text[])`, [it], /permission denied/);
});

test("a suspended shop can neither read nor reorder its media", async () => {
  await reset();
  const it = await newItem();
  const a = await add(it, "image");
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  try {
    await rejects(c, asA, `select seller_item_media($1)`, [it], /account_suspended/);
    await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [a]], /account_suspended/);
    await rejects(c, asA, `select seller_reorder_item_photos($1, $2::text[])`, [it, [a]], /account_suspended/);
  } finally {
    await sql(c, `update businesses set status = 'live' where id = $1`, [ids.bizA]);
  }
});
