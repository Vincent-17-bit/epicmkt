import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";

// Migration 0138: delivery for one item, notes buyers must see, a 5-picture gallery, "From the brand" cards, and the "extra" picture kind
// those sections use (it never takes a photo slot and never shows among the photos).
let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_page_sections" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
  await c.query("update public.plans set items_limit = 50");
});
after(async () => { await c.end(); });

const uuid = () => crypto.randomUUID();
const svc = (text, params) => tx(c, asService, (k) => sql(k, text, params), { commit: true });
const mine = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const save = (who, id, fields) => mine(who, `select seller_save_item($1, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const page = (who, id, p) => mine(who, `select seller_set_item_page($1, $2::jsonb) as r`, [id, JSON.stringify(p)]).then((r) => r[0].r);
const base = { name: "Soundbar KY-8000", price_type: "fixed", price: 8500, availability: "available" };
const listed = async (id) => sql(c, `update items set draft = false, visible = true where id = $1`, [id]);
// An extra picture, attached the way seller-media3d-finalize does it.
const extra = async (id, w = 1600, h = 900) => {
  const path = `${ids.bizA}/${id}/${uuid()}`;
  await svc(`select attach_item_media3d($1, 'extra-image', $2, 'image/jpeg', $3, $4, 1000)`, [id, path, w, h]);
  return { id: (await sql(c, `select id from item_media where path = $1`, [path]))[0].id, path };
};

test("an extra picture is its own kind: not a photo, not in the plan's photo count, not among the page photos", async () => {
  const id = await save(asA, null, base);
  await listed(id);
  const pic = await extra(id);
  const [row] = await sql(c, `select kind, role from item_media where id = $1`, [pic.id]);
  assert.deepEqual([row.kind, row.role], ["extra", "extra-image"]);
  const [pub] = await sql(c, `select image_paths, media from public_items where id = $1`, [id]);
  assert.deepEqual(pub.image_paths, []);
  assert.deepEqual(pub.media, []);
  const counts = (await mine(asA, `select seller_item_media($1) as r`, [id]))[0].r;
  assert.equal(counts.limits.photos.used, 0);
  const listedExtras = (await mine(asA, `select seller_item_extras($1) as r`, [id]))[0].r;
  assert.deepEqual(listedExtras.map((x) => [x.id, x.path, x.width]), [[pic.id, pic.path, 1600]]);
  await rejects(c, asB, `select seller_item_extras($1)`, [id], /item_not_found/);
  // An extra picture belongs to the item: no option value, and a path outside the item is refused.
  await rejects(c, asService, `select attach_item_media3d($1, 'extra-image', $2, 'image/jpeg', 10, 10, 1, array['red'])`, [id, `${ids.bizA}/${id}/${uuid()}`], /bad_option_ids/);
  await rejects(c, asService, `select attach_item_media3d($1, 'extra-image', $2, 'image/jpeg', 10, 10, 1)`, [id, `${ids.bizA}/${uuid()}/${uuid()}`], /path_not_owned/);
  // The upload ticket purpose is known.
  await svc(`select media_register_upload($1, $2, 'item_extra', $3)`, [ids.bizA, id, `${ids.bizA}/${id}/${uuid()}`]);
  await rejects(c, asService, `select media_register_upload($1, $2, 'item_extra', $3)`, [ids.bizA, id, `${ids.bizA}/other/${uuid()}`], /path_not_owned/);
});

test("at most 80 extra pictures per item", async () => {
  const id = await save(asA, null, base);
  for (let i = 0; i < 80; i += 1) await svc(`insert into item_media (item_id, business_id, kind, role, path, mime) values ($1, $2, 'extra', 'extra-image', $3, 'image/jpeg')`, [id, ids.bizA, `${ids.bizA}/${id}/${uuid()}`]);
  await rejects(c, asService, `select attach_item_media3d($1, 'extra-image', $2, 'image/jpeg', 10, 10, 1)`, [id, `${ids.bizA}/${id}/${uuid()}`], /limit_reached:extras/);
});

test("delivery for one item: same as the shop (null), its own, or pickup only; nonsense is refused", async () => {
  const id = await save(asA, null, base);
  await listed(id);
  const own = { mode: "custom", fee: 150, area: "Kisumu CBD and Milimani", time: "Same day before 4 pm", notes: null, pickup: true };
  assert.deepEqual((await page(asA, id, { delivery: own })).delivery, own);
  assert.deepEqual((await sql(c, `select delivery from public_items where id = $1`, [id]))[0].delivery, own);
  assert.deepEqual((await page(asA, id, { delivery: { mode: "none", notes: "Collect at the shop", pickup: true } })).delivery.mode, "none");
  assert.equal((await page(asA, id, { delivery: null })).delivery, null);
  for (const bad of [{ mode: "fly" }, { mode: "custom", fee: -1 }, { mode: "custom", fee: "100" }, { mode: "custom", area: "a".repeat(121) }, { mode: "custom", colour: "red" }]) {
    await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ delivery: bad })], /invalid_delivery/);
  }
  await rejects(c, asB, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ delivery: null })], /item_not_found/);
  // A plan without delivery: the item cannot deliver by itself, and a stored setting is not shown; pickup only still works.
  await page(asA, id, { delivery: own });
  const before = (await sql(c, `select standard from global_limits where id = 1`))[0].standard;
  await sql(c, `update global_limits set standard = jsonb_set(standard, '{features}', coalesce(standard -> 'features', '{}'::jsonb) || '{"delivery": false}'::jsonb) where id = 1`);
  try {
    assert.equal((await sql(c, `select delivery from public_items where id = $1`, [id]))[0].delivery, null);
    await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ delivery: own })], /feature_off/);
    assert.equal((await page(asA, id, { delivery: { mode: "none", notes: null, pickup: true } })).delivery.mode, "none");
  } finally {
    await sql(c, `update global_limits set standard = $1::jsonb where id = 1`, [JSON.stringify(before)]);
  }
});

test("notes: up to 3, each with a tone, a title and a text", async () => {
  const id = await save(asA, null, base);
  const notes = [{ tone: "caution", title: "Product voltage: 240 V", text: "Works with Kenyan sockets. On 110 V use a converter." }];
  assert.deepEqual((await page(asA, id, { notices: notes })).notices, notes);
  for (const bad of [
    [{ tone: "loud", title: "a", text: "b" }], [{ tone: "info", title: " ", text: "b" }], [{ tone: "info", title: "a", text: "x".repeat(301) }],
    Array.from({ length: 4 }, () => ({ tone: "info", title: "a", text: "b" }))
  ]) await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ notices: bad })], /invalid_notices/);
  assert.deepEqual((await page(asA, id, { notices: null })).notices, []);
});

test("gallery and From the brand point at the item's own extra pictures; the public view gives paths and sizes", async () => {
  const id = await save(asA, null, base);
  await listed(id);
  const [a, b, banner, card] = [await extra(id), await extra(id, 1464, 600), await extra(id, 3000, 1000), await extra(id, 800, 1000)];
  const r = await page(asA, id, {
    gallery: [{ id: a.id, label: "Film mode", caption: "Dialogue stays clear" }, { id: b.id, label: null, caption: null }],
    brand: { banner: banner.id, cards: [{ id: card.id, caption: "Reddot winner 2026" }] }
  });
  assert.equal(r.removed, 0);
  const [pub] = await sql(c, `select gallery, brand_page from public_items where id = $1`, [id]);
  assert.deepEqual(pub.gallery, [
    { path: a.path, width: 1600, height: 900, label: "Film mode", caption: "Dialogue stays clear" },
    { path: b.path, width: 1464, height: 600, label: null, caption: null }
  ]);
  assert.deepEqual(pub.brand_page, { banner: { path: banner.path, width: 3000, height: 1000 }, cards: [{ path: card.path, width: 800, height: 1000, caption: "Reddot winner 2026" }] });

  // A photo, another item's picture, a repeated id or a sixth picture is refused.
  const photoPath = `${ids.bizA}/${id}/${uuid()}`;
  await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 800, 600, null, 1000)`, [id, photoPath]);
  const [photo] = await sql(c, `select id from item_media where path = $1`, [photoPath]);
  const other = await save(asA, null, { ...base, name: "Other" });
  const elsewhere = await extra(other);
  for (const bad of [[{ id: photo.id }], [{ id: elsewhere.id }], [{ id: a.id }, { id: a.id }], [{ id: uuid() }]]) {
    await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ gallery: bad })], /invalid_gallery/);
  }
  const six = await Promise.all(Array.from({ length: 6 }, () => extra(id)));
  await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ gallery: six.map((x) => ({ id: x.id })) })], /invalid_gallery/);
  await rejects(c, asA, `select seller_set_item_page($1, $2::jsonb)`, [id, JSON.stringify({ brand: { banner: photo.id, cards: [] } })], /invalid_brand/);

  // Saving again deletes the extra pictures nothing points at (the six above), and queues their files for deletion.
  const again = await page(asA, id, {});
  assert.equal(again.removed, 6);
  const gc = await sql(c, `select count(*)::int as n from media_gc where public_id = any($1) and reason = 'extra_removed'`, [six.map((x) => x.path)]);
  assert.equal(gc[0].n, 6);

  // Deleting a picture takes it out of the gallery and the brand cards; a brand with nothing left becomes null.
  await sql(c, `delete from item_media where id = $1`, [a.id]);
  await sql(c, `delete from item_media where id = any($1)`, [[banner.id, card.id]]);
  const [left] = await sql(c, `select gallery, brand_page from items where id = $1`, [id]);
  assert.deepEqual(left.gallery.map((g) => g.id), [b.id]);
  assert.equal(left.brand_page, null);
});

test("a 'What's included' line may use an extra picture or a photo; the older call still works", async () => {
  const id = await save(asA, null, { ...base, includes: ["Power supply: 12 V", "Remote control", "ARC cable"] });
  await listed(id);
  const pic = await extra(id);
  const photoPath = `${ids.bizA}/${id}/${uuid()}`;
  await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 800, 600, null, 1000)`, [id, photoPath]);
  const [photo] = await sql(c, `select id from item_media where path = $1`, [photoPath]);
  assert.deepEqual((await page(asA, id, { includeMedia: [pic.id, null, photo.id] })).includeMedia, [pic.id, null, photo.id]);
  assert.deepEqual((await sql(c, `select include_media from public_items where id = $1`, [id]))[0].include_media, [pic.path, null, photoPath]);
  // The 0137 call goes through the same rules and keeps the pictures that are still used.
  assert.deepEqual((await mine(asA, `select seller_set_item_include_media($1, $2::jsonb) as r`, [id, JSON.stringify([pic.id, null, null])]))[0].r, [pic.id, null, null]);
  assert.equal((await sql(c, `select count(*)::int as n from item_media where id = $1`, [pic.id]))[0].n, 1);
  // Clearing the line deletes the picture nobody uses any more; the photo stays.
  await page(asA, id, { includeMedia: null });
  assert.equal((await sql(c, `select count(*)::int as n from item_media where id = $1`, [pic.id]))[0].n, 0);
  assert.equal((await sql(c, `select count(*)::int as n from item_media where id = $1`, [photo.id]))[0].n, 1);
});

test("a duplicated item keeps its delivery and notes", async () => {
  const id = await save(asA, null, base);
  await page(asA, id, { delivery: { mode: "custom", fee: 0, area: "Kisumu", time: null, notes: null, pickup: false }, notices: [{ tone: "info", title: "Warranty", text: "18 months" }] });
  const copy = (await mine(asA, `select seller_duplicate_item($1) as id`, [id]))[0].id;
  const [row] = await sql(c, `select delivery, notices, gallery, brand_page from items where id = $1`, [copy]);
  assert.equal(row.delivery.fee, 0);
  assert.equal(row.notices[0].title, "Warranty");
  assert.deepEqual(row.gallery, []);
  assert.equal(row.brand_page, null);
});
