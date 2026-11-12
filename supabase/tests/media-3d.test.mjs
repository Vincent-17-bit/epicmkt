import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asService } from "./db.mjs";
import { buildView3d, view3dIssues } from "../../shared/src/media3d.js";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_media_3d" }));
  await seedFixtures(c);
  await c.query("update public.businesses set paid_until = now() + interval '30 days'");
});
after(async () => { await c.end(); });

const uuid = () => crypto.randomUUID();
const svc = (text, params) => tx(c, asService, (k) => sql(k, text, params), { commit: true });
const mine = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const anon = (text, params) => tx(c, { role: "anon" }, (k) => sql(k, text, params));
const AXES = JSON.stringify([{ key: "colour", label: "Colour", display: "swatch", values: [{ id: "grey", label: "Grey" }, { id: "black", label: "Black" }] }]);
const newItem = async ({ biz = ids.bizA, axes = true, pub = true } = {}) => {
  const id = (await sql(c, `insert into items (business_id, name, price) values ($1, 'Thing', 100) returning id`, [biz]))[0].id;
  if (axes) await sql(c, `update items set option_axes = $2::jsonb where id = $1`, [id, AXES]);
  if (pub) await sql(c, `update items set draft = false, visible = true where id = $1`, [id]);
  return id;
};
const reset = () => sql(c, `delete from item_media; delete from media_uploads; delete from media_gc`);
const ipath = (item, biz = ids.bizA) => `${biz}/${item}/${uuid()}`;
const gpath = (item, biz = ids.bizA) => `${biz}/${item}/${uuid()}.glb`;
const attach = (item, role, path, opts = {}) => svc(`select attach_item_media3d($1, $2, $3, $4, null, null, $5, $6::text[], $7) as id`,
  [item, role, path, role === "model-glb" ? "model/gltf-binary" : "image/jpeg", opts.size ?? 1000, opts.optionIds ?? [], opts.position ?? null]).then((r) => r[0].id);
const attachFails = (item, role, path, pattern, opts = {}) => rejects(c, asService, `select attach_item_media3d($1, $2, $3, 'x', null, null, 1, $4::text[], $5)`, [item, role, path, opts.optionIds ?? [], opts.position ?? null], pattern);
const row = async (item) => (await sql(c, `select has_3d from items where id = $1`, [item]))[0];
const raw = async (item) => (await sql(c, `select item_view3d_raw($1) as r`, [item]))[0].r;
const frames = async (item, n, opts = {}) => { for (let i = 0; i < n; i++) await attach(item, "spin-frame", ipath(item), { ...opts, position: i }); };

test("existing media keeps working: role follows kind, option_ids is empty, old attach and limits are unchanged", async () => {
  await reset();
  const it = await newItem();
  const p = ipath(it);
  await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 800, 600, null, 1000)`, [it, p]);
  const v = `${ids.bizA}/${it}/${uuid()}.mp4`;
  await svc(`select attach_item_media($1, 'video', $2, 'video/mp4', 800, 600, 5, 1000)`, [it, v]);
  assert.deepEqual(await sql(c, `select kind, role, option_ids from item_media order by sort`), [{ kind: "image", role: "image", option_ids: [] }, { kind: "video", role: "video", option_ids: [] }]);
  assert.equal((await svc(`select media_limit_ok($1, 'spin') as ok`, [it]))[0].ok, false, "the photo limit function ignores 3D kinds");
});

test("constraints: one role per kind, 3D takes at most one option id, ids are well formed", async () => {
  await reset();
  const it = await newItem();
  const ins = (kind, role, opt) => sql(c, `insert into item_media (item_id, business_id, kind, role, path, mime, option_ids) values ($1, $2, $3, $4, $5, 'x', $6::text[])`, [it, ids.bizA, kind, role, ipath(it), opt ?? []]);
  await assert.rejects(ins("model", "image"), /item_media_role_ck/);
  await assert.rejects(ins("image", "poster"), /item_media_role_ck/);
  await assert.rejects(ins("gif", "gif"), /item_media_kind_check/);
  await assert.rejects(ins("poster", "poster", ["a", "b"]), /item_media_option_ids_ck/);
  await assert.rejects(ins("image", "image", ["Grey"]), /item_media_option_ids_ck/);
  await assert.rejects(ins("image", "image", ["a", "a"]), /item_media_option_ids_ck/);
  await ins("image", "image", ["grey", "black"]);   // a photo may belong to several values
  await ins("poster", "poster", ["grey"]);
});

test("attach_item_media3d: model and poster replace, the old file is queued for deletion, frames keep their position", async () => {
  await reset();
  const it = await newItem();
  const m1 = gpath(it), m2 = gpath(it);
  await attach(it, "model-glb", m1, { size: 5 });
  await attach(it, "model-glb", m2, { size: 6 });
  assert.deepEqual(await sql(c, `select path, size_bytes::int s from item_media where kind = 'model'`), [{ path: m2, s: 6 }], "one model per scope");
  assert.deepEqual((await sql(c, `select public_id, reason from media_gc`)), [{ public_id: m1, reason: "media3d_removed" }], "the replaced .glb goes to the bucket sweep, not Cloudinary");
  const p1 = ipath(it), p2 = ipath(it);
  await attach(it, "poster", p1);
  await attach(it, "poster", p2);
  assert.deepEqual((await sql(c, `select path from item_media where kind = 'poster'`)).map((r) => r.path), [p2]);
  assert.ok((await sql(c, `select 1 from media_gc where public_id = $1 and reason = 'media3d_removed'`, [p1])).length === 1);
  // a model for one colour does not replace the item's model
  await attach(it, "model-glb", gpath(it), { optionIds: ["grey"] });
  assert.equal((await sql(c, `select count(*)::int n from item_media where kind = 'model'`))[0].n, 2);
  // frames: explicit positions order them, whatever order they arrive in
  const f = [ipath(it), ipath(it), ipath(it)];
  await attach(it, "spin-frame", f[2], { position: 2 });
  await attach(it, "spin-frame", f[0], { position: 0 });
  await attach(it, "spin-frame", f[1], { position: 1 });
  assert.deepEqual((await sql(c, `select path from item_media where kind = 'spin' order by sort, created_at, id`)).map((r) => r.path), f);
});

test("attach_item_media3d refuses: a 73rd frame, a bad role, a foreign path, unknown or several option values, a bad position", async () => {
  await reset();
  const it = await newItem();
  await frames(it, 72);
  await attachFails(it, "spin-frame", ipath(it), /limit_reached:spin_frames/);
  await attach(it, "spin-frame", ipath(it), { optionIds: ["grey"] });   // the limit is per scope
  await attachFails(it, "image", ipath(it), /invalid_role/);
  await attachFails(it, "poster", ipath(it, ids.bizB), /path_not_owned/);
  await attachFails(it, "poster", `${ids.bizA}/${uuid()}/${uuid()}`, /path_not_owned/);
  await attachFails(it, "poster", ipath(it), /unknown_option_value/, { optionIds: ["purple"] });
  await attachFails(it, "poster", ipath(it), /bad_option_ids/, { optionIds: ["grey", "black"] });
  await attachFails(it, "spin-frame", ipath(it), /bad_position/, { position: 72 });
  await attachFails(uuid(), "poster", ipath(it), /item_not_found/);
  const other = await newItem({ biz: ids.bizB });
  await attachFails(other, "poster", ipath(it), /path_not_owned/);
  await rejects(c, { sub: ids.userA }, `select attach_item_media3d($1, 'poster', $2, 'x', null, null, 1)`, [it, ipath(it)], /permission denied/);
  await rejects(c, { role: "anon" }, `select attach_item_media3d($1, 'poster', $2, 'x', null, null, 1)`, [it, ipath(it)], /permission denied/);
});

test("the item cap: no more than 500 3D rows per item", async () => {
  await reset();
  const it = await newItem({ axes: false });
  await sql(c, `insert into item_media (item_id, business_id, kind, role, path, mime, sort)
                select $1::uuid, $2::uuid, 'spin', 'spin-frame', $2::text || '/' || $1::text || '/' || gen_random_uuid(), 'x', g from generate_series(1, 500) g`, [it, ids.bizA]);
  await attachFails(it, "poster", ipath(it), /limit_reached:media3d/);
});

test("has_3d: false with a model but no poster, true with both, false again without the poster; history is untouched", async () => {
  await reset();
  const it = await newItem();
  const hist = async () => (await sql(c, `select count(*)::int n from item_history where item_id = $1`, [it]))[0].n;
  const before = await hist();
  await attach(it, "model-glb", gpath(it));
  assert.equal((await row(it)).has_3d, false, "no poster, no view");
  const poster = await attach(it, "poster", ipath(it));
  assert.equal((await row(it)).has_3d, true);
  await svc(`delete from item_media where id = $1`, [poster]);
  assert.equal((await row(it)).has_3d, false);
  await attach(it, "poster", ipath(it));
  await svc(`delete from item_media where kind = 'model'`);
  assert.equal((await row(it)).has_3d, false, "a poster alone is not a view");
  await frames(it, 11);
  assert.equal((await row(it)).has_3d, false, "11 frames are not enough");
  await attach(it, "spin-frame", ipath(it), { position: 11 });
  assert.equal((await row(it)).has_3d, true, "12 frames and a poster");
  assert.equal(await hist(), before, "has_3d changes are not item history");
});

test("has_3d: a view for one colour is enough, and removing the item takes its media with it", async () => {
  await reset();
  const it = await newItem();
  await attach(it, "model-glb", gpath(it), { optionIds: ["grey"] });
  await attach(it, "poster", ipath(it), { optionIds: ["grey"] });
  assert.equal((await row(it)).has_3d, true);
  await sql(c, `delete from items where id = $1`, [it]);
  assert.equal((await sql(c, `select count(*)::int n from item_media`))[0].n, 0);
  assert.equal((await sql(c, `select count(*)::int n from media_gc where reason = 'media3d_removed'`))[0].n, 2, "a cascade queues the .glb and the poster too");
});

// One matrix, two implementations: the SQL and shared/src/media3d.js must agree on every case.
const matrix = {
  "model and poster": async (it) => { await attach(it, "model-glb", gpath(it), { size: 99 }); await attach(it, "poster", ipath(it)); },
  "spin of 12 and poster": async (it) => { await frames(it, 12); await attach(it, "poster", ipath(it)); },
  "spin of 72 and poster": async (it) => { await frames(it, 72); await attach(it, "poster", ipath(it)); },
  "everything": async (it) => { await attach(it, "model-glb", gpath(it)); await frames(it, 20); await attach(it, "poster", ipath(it)); },
  "model, no poster": async (it) => { await attach(it, "model-glb", gpath(it)); },
  "spin of 11 and poster": async (it) => { await frames(it, 11); await attach(it, "poster", ipath(it)); },
  "spin of 12, no poster": async (it) => { await frames(it, 12); },
  "poster only": async (it) => { await attach(it, "poster", ipath(it)); },
  "per colour and item": async (it) => {
    await attach(it, "model-glb", gpath(it)); await attach(it, "poster", ipath(it));
    await attach(it, "model-glb", gpath(it), { optionIds: ["grey"] }); await attach(it, "poster", ipath(it), { optionIds: ["grey"] });
    await attach(it, "model-glb", gpath(it), { optionIds: ["black"] });
  },
  "bad spin next to a good model": async (it) => { await attach(it, "model-glb", gpath(it)); await attach(it, "poster", ipath(it)); await frames(it, 3); },
  "nothing": async () => {},
};
for (const [name, build] of Object.entries(matrix)) {
  test(`SQL and shared/media3d.js agree: ${name}`, async () => {
    await reset();
    const it = await newItem();
    await build(it);
    const rows = (await sql(c, `select id, role, path, size_bytes::int as size, sort, created_at as "createdAt", option_ids as "optionIds" from item_media where item_id = $1`, [it])).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    const js = buildView3d(rows);
    const db = await raw(it);
    assert.deepEqual({ view3d: db[""] ?? null, view3dByOption: Object.fromEntries(Object.entries(db).filter(([k]) => k !== "")) }, js);
    const issues = (await sql(c, `select item_view3d_issues($1) as i`, [it]))[0].i;
    const order = (a, b) => String(a.scope).localeCompare(String(b.scope)) || a.code.localeCompare(b.code);
    assert.deepEqual([...issues].sort(order), view3dIssues(rows).sort(order));
    assert.deepEqual((await sql(c, `select item_check_media3d(jsonb_build_object('id', $1::text)) as i`, [it]))[0].i, issues);
    assert.equal((await row(it)).has_3d, js.view3d !== null || Object.keys(js.view3dByOption).length > 0);
  });
}

test("public_item_media3d: only for a public item, anon can read it, no poster means no view", async () => {
  await reset();
  const it = await newItem();
  await attach(it, "model-glb", gpath(it));
  const pub = async (id) => (await anon(`select public_item_media3d($1) as r`, [id]))[0].r;
  assert.deepEqual(await pub(it), { view3d: null, view3dByOption: {} }, "model without poster is hidden");
  await attach(it, "poster", ipath(it));
  const out = await pub(it);
  assert.ok(out.view3d.model.path.endsWith(".glb") && out.view3d.poster);
  assert.deepEqual(out.view3dByOption, {});
  await sql(c, `update items set draft = true where id = $1`, [it]);
  assert.equal(await pub(it), null, "a draft shows nothing");
  assert.equal(await pub(uuid()), null);
  await sql(c, `update items set draft = false, hidden_by_admin = true where id = $1`, [it]);
  assert.equal(await pub(it), null, "an item hidden by admin shows nothing");
});

test("public_items.media: photos and videos only, with id, role and the option ids that still exist", async () => {
  await reset();
  const it = await newItem();
  const photo = ipath(it);
  const photoId = (await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 800, 600, null, 10) as id`, [it, photo]))[0].id;
  await attach(it, "poster", ipath(it));
  await attach(it, "model-glb", gpath(it));
  await frames(it, 12);
  await mine(asA, `select seller_set_media_options($1, $2, '{grey,black}')`, [it, photoId]);
  let r = (await anon(`select image_paths, video_paths, media, has_3d from public_items where id = $1`, [it]))[0];
  assert.deepEqual(r.image_paths, [photo]);
  assert.deepEqual(r.video_paths, []);
  assert.deepEqual(r.media, [{ id: photoId, path: photo, kind: "image", duration: null, role: "image", optionIds: ["grey", "black"] }]);
  assert.equal(r.has_3d, true);
  // the colour "black" is removed from the item: the photo no longer claims it
  await sql(c, `update items set option_axes = '[{"key":"colour","label":"Colour","display":"swatch","values":[{"id":"grey","label":"Grey"}]}]' where id = $1`, [it]);
  r = (await anon(`select media from public_items where id = $1`, [it]))[0];
  assert.deepEqual(r.media[0].optionIds, ["grey"]);
  await sql(c, `update items set option_axes = '[]' where id = $1`, [it]);
  r = (await anon(`select media from public_items where id = $1`, [it]))[0];
  assert.deepEqual(r.media[0].optionIds, [], "with no options left the photo belongs to the whole item");
});

test("seller_item_media lists photos and videos only; reorders ignore 3D rows and keep frame order", async () => {
  await reset();
  const it = await newItem();
  const mk = async (kind) => { const path = kind === "video" ? gpath(it).replace(".glb", ".mp4") : ipath(it); await svc(`select attach_item_media($1, $2, $3, 'x', 1, 1, null, 1)`, [it, kind, path]); return path; };
  const p1 = await mk("image"), v1 = await mk("video"), p2 = await mk("image");
  await attach(it, "poster", ipath(it));
  await frames(it, 12);
  const f0 = (await sql(c, `select path from item_media where kind = 'spin' order by sort, created_at, id`)).map((x) => x.path);
  const info = (await mine(asA, `select seller_item_media($1) as r`, [it]))[0].r;
  assert.deepEqual(info.media.map((m) => m.path), [p1, v1, p2]);
  assert.deepEqual(info.media.map((m) => m.role), ["image", "video", "image"]);
  assert.equal(info.limits.photos.used, 2);
  // complete list of photos and videos is accepted although 3D rows exist
  await mine(asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [p2, p1, v1]]);
  assert.deepEqual((await mine(asA, `select seller_item_media($1) as r`, [it]))[0].r.media.map((m) => m.path), [p2, p1, v1]);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [p2, p1]], /order_incomplete/);
  await rejects(c, asA, `select seller_reorder_item_media($1, $2::text[])`, [it, [p2, p1, v1, f0[0]]], /path_not_found/);
  await mine(asA, `select seller_reorder_item_photos($1, $2::text[])`, [it, [p1, p2]]);
  assert.deepEqual((await sql(c, `select path from item_media where kind = 'spin' order by sort, created_at, id`)).map((x) => x.path), f0, "frame order is untouched");
  const m3 = (await mine(asA, `select seller_item_media3d($1) as r`, [it]))[0].r;
  assert.equal(m3.media3d.length, 13);
  assert.equal(m3.hasView, true);
  assert.deepEqual(m3.issues, []);
  await rejects(c, asB, `select seller_item_media3d($1)`, [it], /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_item_media3d($1)`, [it], /permission denied/);
});

test("seller_set_media_options: several values, clear, unknown value, other shop, never a 3D row", async () => {
  await reset();
  const it = await newItem();
  const photo = (await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 1, 1, null, 1) as id`, [it, ipath(it)]))[0].id;
  const set = (who, ids_, item = it, media = photo) => mine(who, `select seller_set_media_options($1, $2, $3::text[]) as r`, [item, media, ids_]);
  assert.deepEqual((await set(asA, ["grey", "black"]))[0].r, { id: photo, optionIds: ["grey", "black"] });
  assert.deepEqual((await sql(c, `select option_ids from item_media where id = $1`, [photo]))[0].option_ids, ["grey", "black"]);
  assert.deepEqual((await set(asA, []))[0].r.optionIds, []);
  assert.deepEqual((await set(asA, null))[0].r.optionIds, []);
  await rejects(c, asA, `select seller_set_media_options($1, $2, '{purple}')`, [it, photo], /unknown_option_value/);
  await rejects(c, asA, `select seller_set_media_options($1, $2, '{grey,grey}')`, [it, photo], /bad_option_ids/);
  await rejects(c, asB, `select seller_set_media_options($1, $2, '{grey}')`, [it, photo], /item_not_found/);
  await rejects(c, asA, `select seller_set_media_options($1, $2, '{grey}')`, [it, uuid()], /media_not_found/);
  await rejects(c, { role: "anon" }, `select seller_set_media_options($1, $2, '{grey}')`, [it, photo], /permission denied/);
  const poster = await attach(it, "poster", ipath(it));
  await rejects(c, asA, `select seller_set_media_options($1, $2, '{grey}')`, [it, poster], /not_for_3d/);
});

test("uploads: the three new purposes are registered with the right path rules", async () => {
  await reset();
  const it = await newItem();
  const reg = (purpose, path, item = it, biz = ids.bizA) => svc(`select media_register_upload($1, $2, $3, $4)`, [biz, item, purpose, path]);
  const regFails = (purpose, path, pattern, item = it, biz = ids.bizA) => rejects(c, asService, `select media_register_upload($1, $2, $3, $4)`, [biz, item, purpose, path], pattern);
  await reg("item_model", gpath(it));
  await reg("item_poster", ipath(it));
  await reg("item_spin", ipath(it));
  await regFails("item_model", gpath(it).replace(".glb", ".mp4"), /path_not_owned/);
  await regFails("item_model", ipath(it), /path_not_owned/);
  await regFails("item_video", gpath(it), /path_not_owned/);
  await regFails("item_model", gpath(it, ids.bizB), /path_not_owned/);
  await regFails("item_poster", ipath(it, ids.bizB), /path_not_owned/);
  await regFails("item_poster", `${ids.bizA}/${uuid()}/${uuid()}`, /path_not_owned/);
  await regFails("item_model", gpath(it), /item_not_found/, null);
  await regFails("item_spin", ipath(it), /item_not_found/, (await newItem({ biz: ids.bizB })));
  await regFails("item_nope", ipath(it), /invalid_purpose/);
  await regFails("logo", ipath(it), /invalid_purpose/, it);
  assert.equal((await sql(c, `select count(*)::int n from media_uploads`))[0].n, 3);
  // the table itself refuses a model path for a poster and the other way round
  await assert.rejects(sql(c, `insert into media_uploads (public_id, business_id, item_id, purpose) values ($1, $2, $3, 'item_model')`, [ipath(it), ids.bizA, it]), /media_uploads_id_ck/);
  await assert.rejects(sql(c, `insert into media_uploads (public_id, business_id, purpose) values ($1, $2, 'item_poster')`, [ipath(it), ids.bizA]), /media_uploads_item_ck/);
});

test("garbage collection: a .glb is queued and swept as a bucket file, an unfinished model upload gets three hours", async () => {
  await reset();
  const it = await newItem();
  const g = gpath(it), orphanPoster = ipath(it), orphanModel = gpath(it);
  assert.equal((await svc(`select media_gc_enqueue($1::text[], 'test') as n`, [[g, `${ids.bizA}/x.glb`, `${ids.bizA}/${it}/${uuid()}.exe`]]))[0].n, 1, "only a well-formed .glb path is accepted");
  await svc(`select media_register_upload($1, $2, 'item_model', $3)`, [ids.bizA, it, orphanModel]);
  await svc(`select media_register_upload($1, $2, 'item_poster', $3)`, [ids.bizA, it, orphanPoster]);
  await sql(c, `update media_uploads set created_at = now() - interval '2 hours'`);
  await svc(`select media_sweep_orphans()`);
  assert.deepEqual((await sql(c, `select public_id from media_gc where reason = 'unattached_upload'`)).map((r) => r.public_id), [orphanPoster], "the poster is abandoned after an hour; the model still has its ticket");
  await sql(c, `update media_uploads set created_at = now() - interval '4 hours' where public_id = $1`, [orphanModel]);
  await svc(`select media_sweep_orphans()`);
  assert.equal((await sql(c, `select count(*)::int n from media_gc where public_id = $1`, [orphanModel]))[0].n, 1);
  // a model that was attached is in use and is never swept
  const used = gpath(it);
  await svc(`select media_register_upload($1, $2, 'item_model', $3)`, [ids.bizA, it, used]);
  await attach(it, "model-glb", used);
  await sql(c, `update media_uploads set created_at = now() - interval '9 hours'`);
  await svc(`select media_sweep_orphans()`);
  assert.equal((await sql(c, `select count(*)::int n from media_gc where public_id = $1`, [used]))[0].n, 0);
});

test("the bucket accepts a .glb and keeps its size limit", async () => {
  const b = (await sql(c, `select allowed_mime_types t, file_size_limit::bigint l from storage.buckets where id = 'seller-media'`))[0];
  assert.ok(b.t.includes("model/gltf-binary"));
  assert.ok(!b.t.includes("application/octet-stream"), "no catch-all type in a public bucket");
  for (const t of ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]) assert.ok(b.t.includes(t), t);
  assert.equal(Number(b.l), 26214400);
});

test("an item with no 3D data and no options is untouched: has_3d false, empty option ids, public_item_media3d empty", async () => {
  await reset();
  const it = await newItem({ axes: false });
  await svc(`select attach_item_media($1, 'image', $2, 'image/jpeg', 1, 1, null, 1)`, [it, ipath(it)]);
  assert.equal((await row(it)).has_3d, false);
  assert.deepEqual((await anon(`select public_item_media3d($1) as r`, [it]))[0].r, { view3d: null, view3dByOption: {} });
  assert.deepEqual((await anon(`select media from public_items where id = $1`, [it]))[0].media.map((m) => m.optionIds), [[]]);
});
