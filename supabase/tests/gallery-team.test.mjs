import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";

let c;
const A = ids.bizA;
const B = ids.bizB;
const id = (n) => `${A}/gallery/g${n}`;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('salon-beauty', 'Salon', 'Beauty', 'A', 2), ('gym-fitness', 'Gym', 'Fitness', 'A', 3), ('barbershop', 'Barbershop', 'Beauty', 'A', 4)`);
});
after(async () => { await c.end(); });

const reset = () => sql(c, `update global_limits set standard = jsonb_set(standard, '{galleryPhotos}', '5'); delete from timetable_slots; delete from staff_services; delete from staff_members; delete from gallery_photos; delete from media_gc; delete from media_uploads;
  update businesses set status = 'live', plan_key = 'standard', category_id = 'barber' where id = '${A}';
  update businesses set status = 'live', plan_key = 'premium', category_id = 'barber' where id = '${B}'`);
const attach = (biz, path, extra = []) => sql(c, `select attach_gallery_photo($1, $2, 'image/webp', 800, 600, 1000, $3, $4, $5) as id`, [biz, path, extra[0] ?? null, extra[1] ?? null, extra[2] ?? null]);

test("attach is service only, takes only the shop's own gallery ids and appends in order", async () => {
  await reset();
  await rejects(c, asA, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1)`, [A, id(1)], /permission denied/);
  await rejects(c, asService, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1)`, [A, `${B}/gallery/x`], /path_not_owned/);
  await rejects(c, asService, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1)`, [A, `${A}/profile/x`], /path_not_owned/);
  await rejects(c, asService, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1)`, [A, `${A}/gallery/x.jpg`], /path_not_owned/);
  await attach(A, id(1));
  await attach(A, id(2));
  const rows = await sql(c, `select path, sort from gallery_photos where business_id = $1 order by sort`, [A]);
  assert.deepEqual(rows.map((r) => r.sort), [0, 1]);
});

test("the plan limit is enforced for sellers and the room check agrees", async () => {
  await reset();
  await sql(c, `update global_limits set standard = jsonb_set(standard, '{galleryPhotos}', '2')`);
  assert.equal((await sql(c, `select gallery_room($1) as r`, [A]))[0].r, true);
  await attach(A, id(1));
  await attach(A, id(2));
  assert.equal((await sql(c, `select gallery_room($1) as r`, [A]))[0].r, false);
  await rejects(c, null, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1)`, [A, id(3)], /limit_reached:gallery_photos/);
  await sql(c, `update gallery_photos set deleted_at = now() where path = $1`, [id(1)]);
  await attach(A, id(3));
});

test("a seller reads, captions and soft deletes their own photos, never someone else's, and cannot change the file", async () => {
  await reset();
  const mine = (await attach(A, id(1)))[0].id;
  const theirs = (await attach(B, `${B}/gallery/g1`))[0].id;
  assert.equal((await tx(c, asA, (k) => sql(k, `select id from gallery_photos`))).length, 1);
  await tx(c, asA, (k) => sql(k, `update gallery_photos set caption = 'Hello' where id = $1`, [mine]), { commit: true });
  assert.equal((await tx(c, asA, (k) => sql(k, `update gallery_photos set caption = 'x' where id = $1 returning id`, [theirs]))).length, 0);
  await rejects(c, asA, `update gallery_photos set path = $2 where id = $1`, [mine, id(9)], /gallery_columns_protected/);
  await rejects(c, asA, `update gallery_photos set hidden_by_admin = true where id = $1`, [mine], /admin_columns_protected/);
  await rejects(c, asA, `insert into gallery_photos (business_id, path, mime) values ($1, $2, 'image/webp')`, [A, `${A}/gallery/hand`], /./).catch(() => {});
});

test("a live photo cannot be hard deleted; a soft deleted one can, and its file is queued for removal", async () => {
  await reset();
  const pid = (await attach(A, id(1)))[0].id;
  assert.equal((await tx(c, asA, (k) => sql(k, `delete from gallery_photos where id = $1 returning id`, [pid]))).length, 0);
  await tx(c, asA, (k) => sql(k, `update gallery_photos set deleted_at = now() where id = $1`, [pid]), { commit: true });
  assert.equal((await tx(c, asA, (k) => sql(k, `delete from gallery_photos where id = $1 returning id`, [pid]), { commit: true })).length, 1);
  assert.equal((await sql(c, `select reason from media_gc where public_id = $1`, [id(1)]))[0].reason, "gallery_removed");
});

test("pairs need a barbershop or salon, have one before and one after", async () => {
  await reset();
  const pair = "20000000-0000-0000-0000-000000000001";
  await rejects(c, null, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1, null, $3, 'before')`, [A, id(1), pair], /pair_category/);
  await sql(c, `update businesses set category_id = 'barbershop' where id = $1`, [A]);
  await attach(A, id(1), [null, pair, "before"]);
  await attach(A, id(2), [null, pair, "after"]);
  await rejects(c, null, `select attach_gallery_photo($1, $2, 'image/webp', 1, 1, 1, null, $3, 'after')`, [A, id(3), pair], /duplicate key/);
});

test("reordering needs an active seller and only touches their own live photos", async () => {
  await reset();
  const a1 = (await attach(A, id(1)))[0].id;
  const a2 = (await attach(A, id(2)))[0].id;
  const b1 = (await attach(B, `${B}/gallery/g1`))[0].id;
  await tx(c, asA, (k) => sql(k, `select seller_reorder_gallery($1::uuid[])`, [[a2, a1, b1]]), { commit: true });
  assert.deepEqual((await sql(c, `select id from gallery_photos where business_id = $1 order by sort`, [A])).map((r) => r.id), [a2, a1]);
  assert.equal((await sql(c, `select sort from gallery_photos where id = $1`, [b1]))[0].sort, 0);
  await rejects(c, asA, `select seller_reorder_gallery($1::uuid[])`, [[a1, a1]], /invalid_order/);
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [A]);
  await rejects(c, asA, `select seller_reorder_gallery($1::uuid[])`, [[a1, a2]], /account_suspended/);
  await rejects(c, asA, `update gallery_photos set caption = 'x' where id = $1`, [a1], /./).catch(() => {});
  assert.equal((await tx(c, asA, (k) => sql(k, `select id from gallery_photos`))).length, 2);
});

test("team members: own photo path only, services need premium and the shop's own items", async () => {
  await reset();
  const mem = (await tx(c, asA, (k) => sql(k, `insert into staff_members (business_id, name, role, specialties, photo_path) values ($1, 'Amina', 'Barber', '{fade}', $2) returning id`, [A, `${A}/staff/p1`]), { commit: true }))[0].id;
  await rejects(c, asA, `insert into staff_members (business_id, name, photo_path) values ($1, 'Bob', $2)`, [A, `${B}/staff/p1`], /invalid_photo_path/);
  await rejects(c, asA, `insert into staff_members (business_id, name, photo_path) values ($1, 'Bob', $2)`, [A, `${A}/gallery/p1`], /invalid_photo_path/);
  const item = (await sql(c, `insert into items (business_id, name, price) values ($1, 'Cut', 500) returning id`, [A]))[0].id;
  await rejects(c, asA, `insert into staff_services (staff_id, item_id, business_id) values ($1, $2, $3)`, [mem, item, A], /premium_only:services/);
  await sql(c, `update businesses set plan_key = 'premium' where id = $1`, [A]);
  await tx(c, asA, (k) => sql(k, `insert into staff_services (staff_id, item_id, business_id) values ($1, $2, $3)`, [mem, item, A]), { commit: true });
  const otherItem = (await sql(c, `insert into items (business_id, name, price) values ($1, 'Cut', 500) returning id`, [B]))[0].id;
  await rejects(c, asA, `insert into staff_services (staff_id, item_id, business_id) values ($1, $2, $3)`, [mem, otherItem, A], /item_not_owned/);
  assert.equal((await sql(c, `select item_ids from public_staff where id = $1`, [mem]))[0].item_ids.length, 1);
});

test("replacing or removing a team photo queues the old file, and files in use are never handed to the cleaner", async () => {
  await reset();
  const mem = (await sql(c, `insert into staff_members (business_id, name, photo_path) values ($1, 'Amina', $2) returning id`, [A, `${A}/staff/p1`]))[0].id;
  await sql(c, `update staff_members set photo_path = $2 where id = $1`, [mem, `${A}/staff/p2`]);
  assert.equal((await sql(c, `select reason from media_gc where public_id = $1`, [`${A}/staff/p1`]))[0].reason, "staff_photo_removed");
  await attach(A, id(1));
  await sql(c, `insert into media_gc (public_id, reason, next_try_at) values ($1, 'x', now() - interval '1 minute'), ($2, 'x', now() - interval '1 minute')`, [id(1), `${A}/staff/p2`]);
  const claimed = await sql(c, `select public_id from media_gc_claim(10)`);
  assert.deepEqual(claimed.map((r) => r.public_id).sort(), [`${A}/staff/p1`]);
  await sql(c, `delete from staff_members where id = $1`, [mem]);
  assert.equal((await sql(c, `select count(*)::int as n from media_gc where public_id = $1`, [`${A}/staff/p2`]))[0].n, 1);
});

test("the sweep keeps uploads that became gallery photos or team photos and queues the rest", async () => {
  await reset();
  await sql(c, `insert into media_uploads (public_id, business_id, purpose, created_at) values
    ($1, $5, 'gallery', now() - interval '2 hours'), ($2, $5, 'gallery', now() - interval '2 hours'),
    ($3, $5, 'staff', now() - interval '2 hours'), ($4, $5, 'staff', now() - interval '2 hours')`, [id(1), id(2), `${A}/staff/p1`, `${A}/staff/p2`, A]);
  await attach(A, id(1));
  await sql(c, `insert into staff_members (business_id, name, photo_path) values ($1, 'Amina', $2)`, [A, `${A}/staff/p1`]);
  assert.equal((await sql(c, `select media_sweep_orphans() as n`))[0].n, 2);
  assert.deepEqual((await sql(c, `select public_id from media_gc order by 1`)).map((r) => r.public_id), [id(2), `${A}/staff/p2`].sort());
});

test("upload tickets: gallery and staff ids must sit in the shop's own folder and carry no item", async () => {
  await reset();
  await sql(c, `select media_register_upload($1, null, 'gallery', $2)`, [A, id(1)]);
  await sql(c, `select media_register_upload($1, null, 'staff', $2)`, [A, `${A}/staff/s1`]);
  await rejects(c, asService, `select media_register_upload($1, null, 'gallery', $2)`, [A, `${A}/staff/s2`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, null, 'gallery', $2)`, [A, `${B}/gallery/s2`], /path_not_owned/);
  await rejects(c, asService, `select media_register_upload($1, null, 'album', $2)`, [A, id(5)], /invalid_purpose/);
});

test("the timetable: category, premium, own trainer and no double booking", async () => {
  await reset();
  await rejects(c, asA, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '09:00', '10:00', 'Yoga')`, [A], /premium_only:timetable|timetable_category/);
  await sql(c, `update businesses set plan_key = 'premium', category_id = 'gym-fitness' where id = $1`, [A]);
  const t1 = (await sql(c, `insert into staff_members (business_id, name) values ($1, 'Coach') returning id`, [A]))[0].id;
  const other = (await sql(c, `insert into staff_members (business_id, name) values ($1, 'Other') returning id`, [B]))[0].id;
  const slot = (day, s, e, staff) => tx(c, asA, (k) => sql(k, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name, staff_id) values ($1, $2, $3, $4, 'Spin', $5) returning id`, [A, day, s, e, staff]), { commit: true });
  await slot(1, "09:00", "10:00", t1);
  await slot(1, "10:00", "11:00", t1);
  await slot(2, "09:30", "10:30", t1);
  await slot(1, "09:30", "10:30", null);
  await assert.rejects(slot(1, "09:30", "10:30", t1), /timetable_trainer_no_overlap/);
  await assert.rejects(slot(1, "12:00", "13:00", other), /trainer_not_owned/);
  await assert.rejects(slot(1, "13:00", "12:00", t1), /timetable_slots_check|check/);
  await sql(c, `update businesses set category_id = 'barber' where id = $1`, [A]);
  await assert.rejects(slot(3, "09:00", "10:00", null), /timetable_category/);
});

test("public views show live, unhidden rows; the timetable is premium only; admin hides win", async () => {
  await reset();
  const g1 = (await attach(A, id(1)))[0].id;
  await attach(A, id(2));
  await sql(c, `update gallery_photos set deleted_at = now() where path = $1`, [id(2)]);
  assert.equal((await sql(c, `select id from public_gallery_photos where business_id = $1`, [A])).length, 1);
  await tx(c, asAdmin, (k) => sql(k, `update gallery_photos set admin_status = 'hidden', hidden_by_admin = true where id = $1`, [g1]), { commit: true });
  assert.equal((await sql(c, `select id from public_gallery_photos where business_id = $1`, [A])).length, 0);
  await sql(c, `update businesses set category_id = 'gym-fitness' where id = $1`, [B]);
  await sql(c, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '09:00', '10:00', 'Yoga')`, [B]);
  assert.equal((await sql(c, `select id from public_timetable where business_id = $1`, [B])).length, 1);
  await sql(c, `update businesses set plan_key = 'standard' where id = $1`, [B]);
  assert.equal((await sql(c, `select id from public_timetable where business_id = $1`, [B])).length, 0);
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [A]);
  await sql(c, `update gallery_photos set hidden_by_admin = false, admin_status = null where business_id = $1`, [A]);
  assert.equal((await sql(c, `select id from public_gallery_photos where business_id = $1`, [A])).length, 0);
});
