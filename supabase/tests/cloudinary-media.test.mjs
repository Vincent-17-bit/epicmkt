import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asService } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_cloudinary" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

const uuid = () => crypto.randomUUID();
const item = async (biz = ids.bizA) => (await sql(c, `insert into items (business_id, name, price) values ($1, 'Thing', 100) returning id`, [biz]))[0].id;
const svc = (text, params) => tx(c, asService, (k) => sql(k, text, params), { commit: true });
const queue = async () => (await sql(c, `select public_id, reason from media_gc order by public_id`)).map((r) => `${r.public_id}|${r.reason}`);
const reset = () => sql(c, `delete from item_media; update businesses set logo_path = null, cover_path = null; delete from media_uploads; delete from media_gc`);

test("is_cloudinary_id tells ids from legacy paths, urls and traversal", async () => {
  const [r] = await sql(c, `select
    public.is_cloudinary_id('a/b/c') as id,
    public.is_cloudinary_id('a/b/c.jpg') as legacy,
    public.is_cloudinary_id('a/b/c.mp4') as video,
    public.is_cloudinary_id('https://x.test/a') as url,
    public.is_cloudinary_id('blob:abc') as blob,
    public.is_cloudinary_id('a/../b') as traversal,
    public.is_cloudinary_id('') as empty,
    public.is_cloudinary_id(null) as nul`);
  assert.deepEqual(r, { id: true, legacy: false, video: false, url: false, blob: false, traversal: false, empty: false, nul: false });
});

test("a Cloudinary photo that is deleted by the seller is queued for removal in the same transaction", async () => {
  await reset();
  const it = await item();
  const id = `${ids.bizA}/${it}/${uuid()}`;
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', $3, 'image/jpeg')`, [it, ids.bizA, id]);
  assert.deepEqual(await queue(), []);
  await tx(c, asA, (k) => sql(k, `delete from item_media where path = $1`, [id]), { commit: true });
  assert.deepEqual(await queue(), [`${id}|photo_removed`]);
});

test("legacy Supabase paths and videos never enter the Cloudinary queue", async () => {
  await reset();
  const it = await item();
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values
    ($1, $2, 'image', $3, 'image/webp'), ($1, $2, 'video', $4, 'video/mp4')`, [it, ids.bizA, `${ids.bizA}/${it}/${uuid()}.webp`, `${ids.bizA}/${it}/${uuid()}.mp4`]);
  await sql(c, `delete from item_media`);
  assert.deepEqual(await queue(), []);
});

test("deleting an item or a business queues its Cloudinary photos too (cascades fire the trigger)", async () => {
  await reset();
  const it = await item(ids.bizB);
  const id = `${ids.bizB}/${it}/${uuid()}`;
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', $3, 'image/png')`, [it, ids.bizB, id]);
  await sql(c, `delete from items where id = $1`, [it]);
  assert.deepEqual(await queue(), [`${id}|photo_removed`]);
});

test("replacing or removing a shop logo or cover queues the old file, keeping the new one", async () => {
  await reset();
  const a = `${ids.bizA}/profile/logo-${uuid()}`;
  const b = `${ids.bizA}/profile/logo-${uuid()}`;
  const cover = `${ids.bizA}/profile/cover-${uuid()}`;
  await sql(c, `update businesses set logo_path = $1, cover_path = $2 where id = $3`, [a, cover, ids.bizA]);
  assert.deepEqual(await queue(), []);
  await sql(c, `update businesses set logo_path = $1 where id = $2`, [b, ids.bizA]);
  assert.deepEqual(await queue(), [`${a}|shop_image_replaced`]);
  await sql(c, `update businesses set cover_path = null where id = $1`, [ids.bizA]);
  assert.deepEqual(await queue(), [`${a}|shop_image_replaced`, `${cover}|shop_image_replaced`].sort());
  await sql(c, `update businesses set tagline = 'hello' where id = $1`, [ids.bizA]);
  assert.equal((await queue()).length, 2, "an unrelated update queues nothing");
  await sql(c, `delete from businesses where id = $1`, [ids.bizA]);
  assert.ok((await queue()).includes(`${b}|business_deleted`));
  await seedFixtures2();
});

// Deleting bizA above removed the fixture, put it back for the remaining tests.
async function seedFixtures2() {
  await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone) values
    ($1, 'ES100001', $2, 'shop-a', 'Shop A', 'barber', 'standard', 'live', '+254712345678')`, [ids.bizA, ids.userA]);
}

test("media_register_upload binds an id to the business and the item, and refuses anything else", async () => {
  await reset();
  const it = await item(ids.bizA);
  const other = await item(ids.bizB);
  const id = `${ids.bizA}/${it}/${uuid()}`;
  await svc(`select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, id]);
  assert.equal((await sql(c, `select count(*)::int n from media_uploads where public_id = $1 and finalized_at is null`, [id]))[0].n, 1);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, id], /duplicate key/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, `${ids.bizB}/${it}/${uuid()}`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, other, `${ids.bizA}/${other}/${uuid()}`], /item_not_found/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, `${ids.bizA}/${it}/${uuid()}.jpg`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, null, 'item_photo', $2)`, [ids.bizA, `${ids.bizA}/x/${uuid()}`], /item_not_found/);
  await rejects(c, asService, `select media_register_upload($1, $2, 'logo', $3)`, [ids.bizA, it, `${ids.bizA}/profile/logo-${uuid()}`], /invalid_purpose/);
  await rejects(c, asService, `select media_register_upload($1, null, 'banner', $2)`, [ids.bizA, `${ids.bizA}/profile/banner-${uuid()}`], /invalid_purpose/);
  await svc(`select media_register_upload($1, null, 'logo', $2)`, [ids.bizA, `${ids.bizA}/profile/logo-${uuid()}`]);
});

test("media_confirm_upload only confirms ids the same business was signed, and returns what they were for", async () => {
  await reset();
  const it = await item(ids.bizA);
  const id = `${ids.bizA}/${it}/${uuid()}`;
  await svc(`select media_register_upload($1, $2, 'item_photo', $3)`, [ids.bizA, it, id]);
  await rejects(c, asService, `select media_confirm_upload($1, $2)`, [ids.bizB, id], /upload_not_found/);
  await rejects(c, asService, `select media_confirm_upload($1, $2)`, [ids.bizA, `${ids.bizA}/${it}/${uuid()}`], /upload_not_found/);
  const [r] = await svc(`select media_confirm_upload($1, $2) as r`, [ids.bizA, id]);
  assert.deepEqual(r.r, { purpose: "item_photo", item_id: it });
  assert.ok((await sql(c, `select finalized_at from media_uploads where public_id = $1`, [id]))[0].finalized_at);
  await svc(`select media_confirm_upload($1, $2)`, [ids.bizA, id]);
});

test("the sweep queues old unattached uploads, spares attached ones, and forgets both", async () => {
  await reset();
  const it = await item(ids.bizA);
  const orphan = `${ids.bizA}/${it}/${uuid()}`;
  const kept = `${ids.bizA}/${it}/${uuid()}`;
  const logo = `${ids.bizA}/profile/logo-${uuid()}`;
  const fresh = `${ids.bizA}/${it}/${uuid()}`;
  for (const [id, purpose, item_id] of [[orphan, "item_photo", it], [kept, "item_photo", it], [logo, "logo", null], [fresh, "item_photo", it]]) {
    await svc(`select media_register_upload($1, $2, $3, $4)`, [ids.bizA, item_id, purpose, id]);
  }
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', $3, 'image/jpeg')`, [it, ids.bizA, kept]);
  await sql(c, `update businesses set logo_path = $1 where id = $2`, [logo, ids.bizA]);
  await sql(c, `update media_uploads set created_at = now() - interval '2 hours' where public_id <> $1`, [fresh]);
  assert.equal((await svc(`select media_sweep_orphans() as n`))[0].n, 1);
  assert.deepEqual(await queue(), [`${orphan}|unattached_upload`]);
  const left = (await sql(c, `select public_id from media_uploads`)).map((r) => r.public_id);
  assert.deepEqual(left, [fresh], "the fresh upload is still pending; the rest are forgotten");
  assert.equal((await svc(`select media_sweep_orphans() as n`))[0].n, 0, "running it again does nothing");
});

test("the claim leases files, drops anything still referenced, and a failure backs off", async () => {
  await reset();
  const it = await item(ids.bizA);
  const a = `${ids.bizA}/${it}/${uuid()}`;
  const b = `${ids.bizA}/${it}/${uuid()}`;
  const used = `${ids.bizA}/${it}/${uuid()}`;
  await svc(`select media_gc_enqueue($1::text[], 'test')`, [[a, b, used, `${ids.bizA}/${it}/${uuid()}.jpg`]]);
  assert.equal((await sql(c, `select count(*)::int n from media_gc`))[0].n, 3, "the legacy path is not queued");
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ($1, $2, 'image', $3, 'image/jpeg')`, [it, ids.bizA, used]);
  const first = (await svc(`select public_id from media_gc_claim(10)`)).map((r) => r.public_id).sort();
  assert.deepEqual(first, [a, b].sort());
  assert.equal((await sql(c, `select count(*)::int n from media_gc where public_id = $1`, [used]))[0].n, 0, "a file something points at leaves the queue");
  assert.deepEqual(await svc(`select public_id from media_gc_claim(10)`), [], "leased files are not handed out twice");
  await svc(`select media_gc_fail($1::text[], 'boom')`, [[a]]);
  const [row] = await sql(c, `select attempts, last_error, next_try_at > now() as later from media_gc where public_id = $1`, [a]);
  assert.equal(row.attempts, 1);
  assert.equal(row.last_error, "boom");
  assert.equal(row.later, true);
  assert.equal((await svc(`select media_gc_done($1::text[]) as n`, [[a, b]]))[0].n, 2);
  assert.equal((await sql(c, `select count(*)::int n from media_gc`))[0].n, 0);
});

test("the claim respects its limit", async () => {
  await reset();
  const list = Array.from({ length: 5 }, () => `${ids.bizA}/x/${uuid()}`);
  await svc(`select media_gc_enqueue($1::text[], 'test')`, [list]);
  assert.equal((await svc(`select public_id from media_gc_claim(2)`)).length, 2);
});

test("sellers, anonymous visitors and even admins cannot touch the media tables or functions", async () => {
  await reset();
  for (const who of [asA, { role: "anon" }]) {
    await rejects(c, who, `select * from media_gc`, [], /permission denied/);
    await rejects(c, who, `select * from media_uploads`, [], /permission denied/);
    await rejects(c, who, `select media_gc_claim(1)`, [], /permission denied/);
    await rejects(c, who, `select media_register_upload($1, null, 'logo', $2)`, [ids.bizA, `${ids.bizA}/profile/logo-${uuid()}`], /permission denied/);
    await rejects(c, who, `select media_sweep_orphans()`, [], /permission denied/);
  }
});
