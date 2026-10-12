import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";

const U = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const B = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const I = (n) => `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`;

const salonStd = { user: U(0x51), biz: B(0x51) };
const salonPrem = { user: U(0x52), biz: B(0x52) };
const gymPrem = { user: U(0x53), biz: B(0x53) };
const asSalonStd = { sub: salonStd.user };
const asSalonPrem = { sub: salonPrem.user };
const asGym = { sub: gymPrem.user };

let url;
let c;
const pool = [];

const open = async () => {
  const k = await connect(url);
  pool.push(k);
  return k;
};

const eat = (y, m, d, hh, mm) => new Date(Date.UTC(y, m - 1, d, hh - 3, mm)).toISOString();
const plus = (mins) => new Date(Date.now() + mins * 60000).toISOString();

const offerSql = `insert into offers (business_id, title, discount_type, discount_value, starts_at, ends_at)
  values ($1, $2, $3, $4, $5, $6) returning *`;
const offer = (biz, n, o = {}) =>
  [biz, `Offer ${n}`, o.type ?? "percent", o.value ?? 10, o.start ?? plus(-5), o.end ?? plus(600)];

const flashSql = `insert into flash_sales (business_id, item_id, discount_type, discount_value, starts_at, ends_at, on_end)
  values ($1, $2, $3, $4, $5, $6, $7) returning *`;
const flash = (biz, item, start, end, o = {}) => [biz, item, o.type ?? "percent", o.value ?? 20, start, end, o.onEnd ?? "keep"];

const attachSql = `select attach_gallery_photo($1, $2, 'image/webp', 800, 600, 1000, $3, $4, $5)`;
const photo = (biz, n, o = {}) => [biz, `${biz}/gallery/p${n}.webp`, o.caption ?? null, o.pairId ?? null, o.pairRole ?? null];

before(async () => {
  url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
  await c.query(`
    insert into categories (id, name, grp, tier, sort) values
      ('salon-beauty', 'Salon', 'Beauty', 'C', 2), ('gym-fitness', 'Gym', 'Beauty', 'D', 3), ('barbershop', 'Barbershop', 'Beauty', 'B', 4);
    insert into auth.users (id, email) values ('${salonStd.user}', 's1@test'), ('${salonPrem.user}', 's2@test'), ('${gymPrem.user}', 's3@test');
    insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone) values
      ('${salonStd.biz}', 'ES100051', '${salonStd.user}', 'salon-std', 'Salon Std', 'salon-beauty', 'standard', 'live', '+254712300051'),
      ('${salonPrem.biz}', 'ES100052', '${salonPrem.user}', 'salon-prem', 'Salon Prem', 'salon-beauty', 'premium', 'live', '+254712300052'),
      ('${gymPrem.biz}', 'ES100053', '${gymPrem.user}', 'gym-prem', 'Gym Prem', 'gym-fitness', 'premium', 'live', '+254712300053');
    insert into items (id, business_id, name, price) values
      ('${I(1)}', '${salonStd.biz}', 'Cut', 1000), ('${I(2)}', '${salonStd.biz}', 'Colour', 3000), ('${I(3)}', '${salonStd.biz}', 'Quote only', null),
      ('${I(11)}', '${salonPrem.biz}', 'Braids', 2500), ('${I(12)}', '${salonPrem.biz}', 'Facial', 1800),
      ('${I(21)}', '${gymPrem.biz}', 'Month pass', 4000);
  `);
});

after(async () => {
  for (const k of pool) await k.end();
  await c.end();
});

test("standard allows 8 active offers and premium is unlimited", async () => {
  for (let n = 1; n <= 8; n++) await tx(c, asSalonStd, (k) => k.query(offerSql, offer(salonStd.biz, n)), { commit: true });
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 9), /limit_reached:offers/);
  for (let n = 1; n <= 12; n++) await tx(c, asSalonPrem, (k) => k.query(offerSql, offer(salonPrem.biz, n)), { commit: true });
  const rows = await sql(c, `select count(*)::int as n from offers where business_id = '${salonPrem.biz}'`);
  assert.equal(rows[0].n, 12);
});

test("an expired or inactive offer does not use a slot, and reviving one is checked", async () => {
  await sql(c, `update offers set ends_at = now() - interval '1 minute', starts_at = now() - interval '2 hours' where business_id = '${salonStd.biz}' and title = 'Offer 1'`);
  await tx(c, asSalonStd, (k) => k.query(offerSql, offer(salonStd.biz, 9)), { commit: true });
  await rejects(c, asSalonStd, `update offers set ends_at = now() + interval '1 day' where business_id = $1 and title = 'Offer 1'`, [salonStd.biz], /limit_reached:offers/);
  await sql(c, `update offers set active = false where business_id = '${salonStd.biz}' and title = 'Offer 2'`);
  await tx(c, asSalonStd, (k) => k.query(`update offers set ends_at = now() + interval '1 day' where business_id = $1 and title = 'Offer 1'`, [salonStd.biz]), { commit: true });
  await rejects(c, asSalonStd, `update offers set active = true where business_id = $1 and title = 'Offer 2'`, [salonStd.biz], /limit_reached:offers/);
});

test("parallel offer inserts cannot exceed the limit", async () => {
  await sql(c, `delete from offers where business_id = '${salonStd.biz}'`);
  for (let n = 1; n <= 6; n++) await tx(c, asSalonStd, (k) => k.query(offerSql, offer(salonStd.biz, n)), { commit: true });
  const conns = await Promise.all([open(), open(), open(), open(), open()]);
  const out = await Promise.allSettled(conns.map((k, n) => tx(k, asSalonStd, (t) => t.query(offerSql, offer(salonStd.biz, 100 + n)), { commit: true })));
  assert.equal(out.filter((r) => r.status === "fulfilled").length, 2);
  for (const r of out.filter((x) => x.status === "rejected")) assert.match(r.reason.message, /limit_reached:offers/);
  const rows = await sql(c, `select count(*)::int as n from offers where business_id = '${salonStd.biz}'`);
  assert.equal(rows[0].n, 8);
});

test("offer dates, discounts and scheduling are validated", async () => {
  await sql(c, `delete from offers where business_id = '${salonStd.biz}'`);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { start: plus(60), end: plus(30) }), /invalid_dates/);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { start: plus(-5), end: plus(-5) }), /invalid_dates/);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { value: 0 }), /invalid_discount/);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { value: 91 }), /invalid_discount/);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { type: "kes", value: -5 }), /invalid_discount/);
  await tx(c, asSalonStd, (k) => k.query(offerSql, offer(salonStd.biz, 1, { value: 1 })));
  await tx(c, asSalonStd, (k) => k.query(offerSql, offer(salonStd.biz, 1, { value: 90 })));
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 1, { start: plus(60 * 24), end: plus(60 * 48) }), /premium_only:schedule/);
  await tx(c, asSalonPrem, (k) => k.query(offerSql, offer(salonPrem.biz, 99, { start: plus(60 * 24), end: plus(60 * 48) })));
  await rejects(c, asSalonStd, `insert into offers (business_id, title, discount_type, discount_value, starts_at, ends_at, banner_path) values ($1, 'Banner', 'percent', 10, now(), now() + interval '1 day', $2)`, [salonStd.biz, `${salonPrem.biz}/banners/x.webp`], /invalid_banner_path/);
});

test("kes discounts must stay below the price of every linked item", async () => {
  const save = (k, patch, items) => k.query(`select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify(patch), items]);
  const base = { title: "KES off", discount_type: "kes", discount_value: 500, starts_at: plus(-1), ends_at: plus(600) };
  const made = await tx(c, asSalonStd, (k) => save(k, base, [I(1), I(2)]));
  assert.equal(made.rows[0].discount_type, "kes");
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify({ ...base, discount_value: 1000 }), [I(1)]], /invalid_discount:kes_not_below_price/);
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify(base), [I(3)]], /invalid_discount:kes_not_below_price/);
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify(base), [I(11)]], /item_not_owned/);
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify({ ...base, status: "x" }), []], /field_not_allowed/);
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify({ title: "No dates", discount_type: "percent", discount_value: 10 }), []], /invalid_dates/);
  await rejects(c, asSalonStd, `select * from seller_save_offer(null, $1::jsonb, $2::uuid[])`, [JSON.stringify({ title: "No discount", starts_at: plus(-1), ends_at: plus(60) }), []], /invalid_discount/);
  const id = await tx(c, asSalonStd, async (k) => (await save(k, base, [I(2)])).rows[0].id, { commit: true });
  await rejects(c, asSalonStd, `select * from seller_save_offer($1, $2::jsonb, $3::uuid[])`, [id, JSON.stringify({ discount_value: 3000 }), [I(2)]], /invalid_discount:kes_not_below_price/);
  const kept = await sql(c, `select count(*)::int as n from offer_items where offer_id = '${id}'`);
  assert.equal(kept[0].n, 1);
  await rejects(c, asSalonStd, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [id, I(11), salonStd.biz], /item_not_owned/);
  await rejects(c, asSalonPrem, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [id, I(1), salonStd.biz], /row-level security/);
});

test("flash sales: standard allows one at a time and three per month", async () => {
  const start1 = plus(-1);
  await tx(c, asSalonStd, (k) => k.query(flashSql, flash(salonStd.biz, I(1), start1, plus(60))), { commit: true });
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(2), plus(10), plus(30)), /limit_reached:flash_sales_concurrent/);
  await tx(c, asSalonStd, (k) => k.query(flashSql, flash(salonStd.biz, I(2), plus(61), plus(90))));
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
});

test("flash sales respect the Nairobi month boundary at 00:30 EAT on the 1st", async () => {
  const y = new Date().getUTCFullYear() + 2;
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
  const slots = [[22, 0, 22, 10], [22, 20, 22, 30], [23, 30, 23, 40]];
  for (const [a, b, d, e] of slots) {
    await tx(c, asSalonStd, (k) => k.query(flashSql, flash(salonStd.biz, I(1), eat(y, 12, 31, a, b), eat(y, 12, 31, d, e))), { commit: true });
  }
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(2), eat(y, 12, 31, 23, 50), eat(y, 12, 31, 23, 55)), /limit_reached:flash_sales_month/);
  await tx(c, asSalonStd, (k) => k.query(flashSql, flash(salonStd.biz, I(2), eat(y + 1, 1, 1, 0, 30), eat(y + 1, 1, 1, 0, 50))), { commit: true });
  const utcDec = await sql(c, `select count(*)::int as n from flash_sales where business_id = '${salonStd.biz}' and date_trunc('month', starts_at at time zone 'UTC') = date_trunc('month', $1::timestamptz at time zone 'UTC')`, [eat(y, 12, 31, 12, 0)]);
  assert.equal(utcDec[0].n, 4);
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
});

test("flash sales: premium allows five at once and ten per month", async () => {
  await sql(c, `delete from flash_sales where business_id = '${salonPrem.biz}'`);
  const y = new Date().getUTCFullYear() + 3;
  for (let n = 0; n < 5; n++) {
    await tx(c, asSalonPrem, (k) => k.query(flashSql, flash(salonPrem.biz, n % 2 ? I(11) : I(12), eat(y, 3, 10, 10, 0), eat(y, 3, 10, 12, 0))), { commit: true });
  }
  await rejects(c, asSalonPrem, flashSql, flash(salonPrem.biz, I(11), eat(y, 3, 10, 11, 0), eat(y, 3, 10, 11, 30)), /limit_reached:flash_sales_concurrent/);
  for (let n = 0; n < 5; n++) {
    await tx(c, asSalonPrem, (k) => k.query(flashSql, flash(salonPrem.biz, I(11), eat(y, 3, 11, 10 + n, 0), eat(y, 3, 11, 10 + n, 30))), { commit: true });
  }
  await rejects(c, asSalonPrem, flashSql, flash(salonPrem.biz, I(11), eat(y, 3, 12, 10, 0), eat(y, 3, 12, 10, 30)), /limit_reached:flash_sales_month/);
  await tx(c, asSalonPrem, (k) => k.query(flashSql, flash(salonPrem.biz, I(11), eat(y, 4, 1, 10, 0), eat(y, 4, 1, 10, 30))));
  await sql(c, `delete from flash_sales where business_id = '${salonPrem.biz}'`);
});

test("parallel flash sale inserts cannot exceed the concurrent limit", async () => {
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
  const conns = await Promise.all([open(), open(), open(), open()]);
  const out = await Promise.allSettled(conns.map((k, n) => tx(k, asSalonStd, (t) => t.query(flashSql, flash(salonStd.biz, n % 2 ? I(1) : I(2), plus(-1), plus(120))), { commit: true })));
  assert.equal(out.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of out.filter((x) => x.status === "rejected")) assert.match(r.reason.message, /limit_reached:flash_sales_concurrent/);
  const usage = await tx(c, asSalonStd, async (k) => (await k.query(`select seller_promo_usage() as u`)).rows[0].u);
  assert.equal(usage.flashRunning, 1);
  assert.equal(usage.flashMonth >= 1, true);
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
});

test("flash sale validation: dates, discount, backdating and item ownership", async () => {
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(60), plus(30)), /invalid_dates/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(-120), plus(60)), /invalid_dates:past/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(-30), plus(-10)), /invalid_dates/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(0), plus(60), { value: 0 }), /check constraint|invalid_discount/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(0), plus(60), { value: 91 }), /invalid_discount/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(0), plus(60), { type: "kes", value: 1000 }), /invalid_discount:kes_not_below_price/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(3), plus(0), plus(60), { type: "kes", value: 10 }), /invalid_discount:kes_not_below_price/);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(11), plus(0), plus(60)), /item_not_owned/);
  await rejects(c, asSalonStd, flashSql, flash(salonPrem.biz, I(11), plus(0), plus(60)), /row-level security/);
  await tx(c, asSalonStd, (k) => k.query(flashSql, flash(salonStd.biz, I(1), plus(0), plus(60), { type: "kes", value: 999 })));
});

test("gallery limits: standard 5, premium 20, parallel attaches, undo is checked", async () => {
  for (let n = 1; n <= 5; n++) await tx(c, asService, (k) => k.query(attachSql, photo(salonStd.biz, n)), { commit: true });
  await rejects(c, asService, attachSql, photo(salonStd.biz, 6), /limit_reached:gallery_photos/);
  for (let n = 1; n <= 20; n++) await tx(c, asService, (k) => k.query(attachSql, photo(salonPrem.biz, n)), { commit: true });
  await rejects(c, asService, attachSql, photo(salonPrem.biz, 21), /limit_reached:gallery_photos/);

  await tx(c, asSalonStd, (k) => k.query(`update gallery_photos set deleted_at = now() where path = $1`, [`${salonStd.biz}/gallery/p5.webp`]), { commit: true });
  await tx(c, asService, (k) => k.query(attachSql, photo(salonStd.biz, 7)), { commit: true });
  await rejects(c, asSalonStd, `update gallery_photos set deleted_at = null where path = $1`, [`${salonStd.biz}/gallery/p5.webp`], /limit_reached:gallery_photos/);

  await sql(c, `delete from gallery_photos where business_id = '${gymPrem.biz}'`);
  for (let n = 1; n <= 17; n++) await tx(c, asService, (k) => k.query(attachSql, photo(gymPrem.biz, n)), { commit: true });
  const conns = await Promise.all([open(), open(), open(), open(), open()]);
  const out = await Promise.allSettled(conns.map((k, n) => tx(k, asService, (t) => t.query(attachSql, photo(gymPrem.biz, 100 + n)), { commit: true })));
  assert.equal(out.filter((r) => r.status === "fulfilled").length, 3);
  const total = await sql(c, `select count(*)::int as n from gallery_photos where business_id = '${gymPrem.biz}'`);
  assert.equal(total[0].n, 20);
});

test("sellers cannot insert gallery rows directly or change file columns", async () => {
  await sql(c, `delete from gallery_photos where path = '${salonPrem.biz}/gallery/p20.webp'`);
  await rejects(c, asSalonPrem, `insert into gallery_photos (business_id, path, mime) values ($1, $2, 'image/webp')`, [salonPrem.biz, `${salonPrem.biz}/gallery/direct.webp`], /row-level security/);
  await rejects(c, asSalonPrem, `update gallery_photos set path = $2 where path = $1`, [`${salonPrem.biz}/gallery/p1.webp`, `${salonPrem.biz}/gallery/swap.webp`], /gallery_columns_protected/);
  await rejects(c, asSalonPrem, `update gallery_photos set size_bytes = 1 where business_id = $1`, [salonPrem.biz], /gallery_columns_protected/);
  await rejects(c, asService, attachSql, [salonPrem.biz, `${salonStd.biz}/gallery/x.webp`, null, null, null], /path_not_owned/);
  await rejects(c, asSalonPrem, `update gallery_photos set caption = $2 where path = $1`, [`${salonPrem.biz}/gallery/p1.webp`, "x".repeat(121)], /check constraint/);
  await tx(c, asSalonPrem, async (k) => {
    const r = await k.query(`update gallery_photos set caption = 'Bridal updo' where path = $1 returning caption`, [`${salonPrem.biz}/gallery/p1.webp`]);
    assert.equal(r.rows[0].caption, "Bridal updo");
  });
  const hacked = await tx(c, asSalonStd, (k) => k.query(`update gallery_photos set caption = 'mine' where business_id = $1`, [salonPrem.biz]));
  assert.equal(hacked.rowCount, 0);
});

test("soft delete then purge, and reorder", async () => {
  const denied = await tx(c, asSalonPrem, (k) => k.query(`delete from gallery_photos where path = $1`, [`${salonPrem.biz}/gallery/p2.webp`]));
  assert.equal(denied.rowCount, 0);
  await tx(c, asSalonPrem, async (k) => {
    await k.query(`update gallery_photos set deleted_at = now() where path = $1`, [`${salonPrem.biz}/gallery/p2.webp`]);
    const gone = await k.query(`delete from gallery_photos where path = $1`, [`${salonPrem.biz}/gallery/p2.webp`]);
    assert.equal(gone.rowCount, 1);
  }, { commit: true });

  const order = await sql(c, `select id from gallery_photos where business_id = '${salonPrem.biz}' and deleted_at is null order by sort limit 4`);
  const reversed = order.map((r) => r.id).reverse();
  const n = await tx(c, asSalonPrem, async (k) => (await k.query(`select seller_reorder_gallery($1::uuid[]) as n`, [reversed])).rows[0].n, { commit: true });
  assert.equal(n, 4);
  const after = await sql(c, `select id from gallery_photos where id = any($1::uuid[]) order by sort`, [reversed]);
  assert.deepEqual(after.map((r) => r.id), reversed);
  await rejects(c, asSalonPrem, `select seller_reorder_gallery($1::uuid[])`, [[reversed[0], reversed[0]]], /invalid_order/);
  const foreign = await sql(c, `select id from gallery_photos where business_id = '${salonStd.biz}' limit 1`);
  const moved = await tx(c, asSalonPrem, async (k) => (await k.query(`select seller_reorder_gallery($1::uuid[]) as n`, [[foreign[0].id]])).rows[0].n);
  assert.equal(moved, 0);
});

test("before and after pairs are limited to barbershops and salons", async () => {
  const pair = "30000000-0000-0000-0000-000000000001";
  await sql(c, `delete from gallery_photos where business_id = '${salonStd.biz}'`);
  await tx(c, asService, (k) => k.query(attachSql, photo(salonStd.biz, 31, { pairId: pair, pairRole: "before" })), { commit: true });
  await tx(c, asService, (k) => k.query(attachSql, photo(salonStd.biz, 32, { pairId: pair, pairRole: "after" })), { commit: true });
  await rejects(c, asService, attachSql, photo(salonStd.biz, 33, { pairId: pair, pairRole: "after" }), /duplicate key/);
  await rejects(c, asService, attachSql, photo(gymPrem.biz, 200, { pairId: pair, pairRole: "before" }), /pair_category/);
  await rejects(c, asService, attachSql, photo(salonStd.biz, 34, { pairId: pair }), /check constraint/);
});

test("downgrades never delete rows and only block new counted rows", async () => {
  await sql(c, `delete from gallery_photos where business_id = '${salonPrem.biz}'`);
  await sql(c, `delete from offers where business_id = '${salonPrem.biz}'`);
  await sql(c, `delete from flash_sales where business_id = '${salonPrem.biz}'`);
  for (let n = 1; n <= 12; n++) await tx(c, asService, (k) => k.query(attachSql, photo(salonPrem.biz, n)), { commit: true });
  for (let n = 1; n <= 11; n++) await tx(c, asSalonPrem, (k) => k.query(offerSql, offer(salonPrem.biz, n)), { commit: true });
  await sql(c, `update businesses set plan_key = 'standard' where id = '${salonPrem.biz}'`);
  const kept = await sql(c, `select (select count(*) from gallery_photos where business_id = '${salonPrem.biz}')::int as g, (select count(*) from offers where business_id = '${salonPrem.biz}')::int as o`);
  assert.deepEqual(kept[0], { g: 12, o: 11 });
  await rejects(c, asService, attachSql, photo(salonPrem.biz, 50), /limit_reached:gallery_photos/);
  await rejects(c, asSalonPrem, offerSql, offer(salonPrem.biz, 50), /limit_reached:offers/);
  await tx(c, asSalonPrem, async (k) => {
    await k.query(`update gallery_photos set caption = 'still editable' where business_id = $1`, [salonPrem.biz]);
    await k.query(`update offers set title = 'Renamed' where business_id = $1`, [salonPrem.biz]);
  });
  await sql(c, `update businesses set plan_key = 'premium' where id = '${salonPrem.biz}'`);
});

test("moderation columns are protected on every S7 table and removed rows stop counting", async () => {
  const cols = [["hidden_by_admin", "true"], ["admin_hide_reason", "'x'"], ["admin_status", "'removed'"], ["admin_reason", "'x'"], ["removed_by_admin", "true"]];
  const rows = await sql(c, `select
    (select id from gallery_photos where business_id = '${gymPrem.biz}' limit 1) as g,
    (select id from offers where business_id = '${salonPrem.biz}' limit 1) as o`);
  await tx(c, asSalonPrem, (k) => k.query(`insert into staff_members (business_id, name) values ($1, 'Amina')`, [salonPrem.biz]), { commit: true });
  await tx(c, asGym, (k) => k.query(`insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '06:00', '07:00', 'Spin')`, [gymPrem.biz]), { commit: true });
  const staff = await sql(c, `select id from staff_members where business_id = '${salonPrem.biz}' limit 1`);
  const slot = await sql(c, `select id from timetable_slots where business_id = '${gymPrem.biz}' limit 1`);
  const targets = [
    [asGym, "gallery_photos", rows[0].g],
    [asSalonPrem, "offers", rows[0].o],
    [asSalonPrem, "staff_members", staff[0].id],
    [asGym, "timetable_slots", slot[0].id],
  ];
  for (const [who, table, id] of targets) {
    for (const [col, val] of cols) {
      await rejects(c, who, `update ${table} set ${col} = ${val} where id = $1`, [id], /admin_columns_protected/);
    }
  }
  const flashId = await tx(c, asSalonPrem, async (k) => (await k.query(flashSql, flash(salonPrem.biz, I(11), plus(0), plus(60)))).rows[0].id, { commit: true });
  for (const [col, val] of cols) await rejects(c, asSalonPrem, `update flash_sales set ${col} = ${val} where id = $1`, [flashId], /admin_columns_protected/);
  await rejects(c, asSalonPrem, `insert into flash_sales (business_id, item_id, discount_type, discount_value, ends_at, admin_status) values ($1, $2, 'percent', 10, now() + interval '1 hour', 'ok')`, [salonPrem.biz, I(11)], /admin_columns_protected/);

  const gid = (await sql(c, `select id from gallery_photos where business_id = '${gymPrem.biz}' order by sort limit 1`))[0].id;
  await tx(c, asAdmin, (k) => k.query(`update gallery_photos set admin_status = 'removed', removed_by_admin = true, admin_reason = 'Not your photo' where id = $1`, [gid]), { commit: true });
  await tx(c, asService, (k) => k.query(attachSql, photo(gymPrem.biz, 300)), { commit: true });
  const seen = await tx(c, asGym, (k) => sql(k, `select admin_status, admin_reason, removed_by_admin from gallery_photos where id = $1`, [gid]));
  assert.deepEqual(seen[0], { admin_status: "removed", admin_reason: "Not your photo", removed_by_admin: true });
  await sql(c, `update flash_sales set admin_status = 'removed', removed_by_admin = true where id = '${flashId}'`);
  const usage = await tx(c, asSalonPrem, async (k) => (await k.query(`select seller_promo_usage() as u`)).rows[0].u);
  assert.equal(usage.flashRunning, 0);
});

test("team: services and timetable are premium, trainer overlap is refused", async () => {
  await tx(c, asSalonStd, (k) => k.query(`insert into staff_members (id, business_id, name, role, specialties) values ('40000000-0000-0000-0000-000000000001', $1, 'Joy', 'Stylist', array['braids','locs'])`, [salonStd.biz]), { commit: true });
  await rejects(c, asSalonStd, `insert into staff_services (staff_id, item_id, business_id) values ('40000000-0000-0000-0000-000000000001', $1, $2)`, [I(1), salonStd.biz], /premium_only:services/);
  await rejects(c, asSalonStd, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '09:00', '10:00', 'Bridal')`, [salonStd.biz], /premium_only:timetable/);
  await rejects(c, asSalonStd, `insert into staff_members (business_id, name, photo_path) values ($1, 'Eve', $2)`, [salonStd.biz, `${salonPrem.biz}/staff/x.webp`], /invalid_photo_path/);

  const trainer = "40000000-0000-0000-0000-000000000002";
  const other = "40000000-0000-0000-0000-000000000003";
  await tx(c, asGym, async (k) => {
    await k.query(`insert into staff_members (id, business_id, name, role) values ($1, $3, 'Coach Ken', 'Trainer'), ($2, $3, 'Coach Amy', 'Trainer')`, [trainer, other, gymPrem.biz]);
  }, { commit: true });
  const slotSql = `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name, staff_id) values ($1, $2, $3, $4, $5, $6)`;
  await tx(c, asGym, (k) => k.query(slotSql, [gymPrem.biz, 2, "07:00", "08:00", "HIIT", trainer]), { commit: true });
  await rejects(c, asGym, slotSql, [gymPrem.biz, 2, "07:30", "08:30", "Yoga", trainer], /timetable_trainer_no_overlap/);
  await rejects(c, asGym, slotSql, [gymPrem.biz, 2, "06:30", "07:01", "Yoga", trainer], /timetable_trainer_no_overlap/);
  await rejects(c, asGym, slotSql, [gymPrem.biz, 2, "07:15", "07:45", "Yoga", trainer], /timetable_trainer_no_overlap/);
  await tx(c, asGym, (k) => k.query(slotSql, [gymPrem.biz, 2, "08:00", "09:00", "Yoga", trainer]));
  await tx(c, asGym, (k) => k.query(slotSql, [gymPrem.biz, 2, "07:30", "08:30", "Yoga", other]));
  await tx(c, asGym, (k) => k.query(slotSql, [gymPrem.biz, 3, "07:30", "08:30", "Yoga", trainer]));
  await tx(c, asGym, (k) => k.query(slotSql, [gymPrem.biz, 2, "07:30", "08:30", "Open mat", null]));
  await rejects(c, asGym, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 8, '07:00', '08:00', 'Bad')`, [gymPrem.biz], /check constraint/);
  await rejects(c, asGym, `insert into timetable_slots (business_id, day_of_week, start_time, end_time, class_name) values ($1, 1, '08:00', '07:00', 'Bad')`, [gymPrem.biz], /check constraint/);
  await rejects(c, asGym, slotSql, [gymPrem.biz, 4, "07:00", "08:00", "Steal", "40000000-0000-0000-0000-000000000001"], /trainer_not_owned/);
  await tx(c, asSalonPrem, (k) => k.query(slotSql, [salonPrem.biz, 1, "09:00", "10:00", "Bridal", null]));
  await sql(c, `update businesses set category_id = 'barbershop' where id = '${gymPrem.biz}'`);
  await rejects(c, asGym, slotSql, [gymPrem.biz, 5, "07:00", "08:00", "Cuts", null], /timetable_category/);
  await sql(c, `update businesses set category_id = 'gym-fitness' where id = '${gymPrem.biz}'`);

  await tx(c, asSalonPrem, async (k) => {
    const s = await k.query(`insert into staff_members (business_id, name) values ($1, 'Joy P') returning id`, [salonPrem.biz]);
    await k.query(`insert into staff_services (staff_id, item_id, business_id) values ($1, $2, $3)`, [s.rows[0].id, I(11), salonPrem.biz]);
    await assert.rejects(k.query(`savepoint x`).then(() => k.query(`insert into staff_services (staff_id, item_id, business_id) values ($1, $2, $3)`, [s.rows[0].id, I(1), salonPrem.biz])), /item_not_owned/);
  });
});

test("rows are isolated between sellers and closed to anon, public views show only live content", async () => {
  for (const t of ["offer_items", "flash_sales", "gallery_photos", "staff_members", "staff_services", "timetable_slots"]) {
    await rejects(c, { role: "anon" }, `select * from ${t}`, [], /permission denied/);
    const rows = await tx(c, asB, (k) => sql(k, `select * from ${t}`));
    assert.equal(rows.length, 0);
  }

  await sql(c, `delete from offers where business_id = '${salonPrem.biz}'`);
  await sql(c, `delete from flash_sales where business_id in ('${salonPrem.biz}', '${salonStd.biz}')`);
  await sql(c, `insert into offers (business_id, title, discount_type, discount_value, starts_at, ends_at, active, removed_by_admin, admin_status) values
    ('${salonPrem.biz}', 'Running', 'percent', 10, now() - interval '1 hour', now() + interval '1 hour', true, false, null),
    ('${salonPrem.biz}', 'Scheduled', 'percent', 10, now() + interval '1 hour', now() + interval '2 hours', true, false, null),
    ('${salonPrem.biz}', 'Expired', 'percent', 10, now() - interval '2 hours', now() - interval '1 hour', true, false, null),
    ('${salonPrem.biz}', 'Paused', 'percent', 10, now() - interval '1 hour', now() + interval '1 hour', false, false, null),
    ('${salonPrem.biz}', 'Removed', 'percent', 10, now() - interval '1 hour', now() + interval '1 hour', true, true, 'removed')`);
  const open = await tx(c, { role: "anon" }, (k) => sql(k, `select title, business_slug from public_offers where business_id = '${salonPrem.biz}' order by title`));
  assert.deepEqual(open, [{ title: "Running", business_slug: "salon-prem" }]);

  await sql(c, `update businesses set status = 'paused' where id = '${salonPrem.biz}'`);
  const hidden = await tx(c, { role: "anon" }, (k) => sql(k, `select 1 from public_offers where business_id = '${salonPrem.biz}'`));
  assert.equal(hidden.length, 0);
  await sql(c, `update businesses set status = 'live' where id = '${salonPrem.biz}'`);

  await tx(c, asAdmin, (k) => k.query(`insert into flash_sales (business_id, item_id, discount_type, discount_value, starts_at, ends_at, on_end) values
    ('${salonStd.biz}', '${I(1)}', 'percent', 25, now() - interval '3 hours', now() - interval '2 hours', 'unlist'),
    ('${salonStd.biz}', '${I(2)}', 'kes', 500, now() - interval '3 hours', now() - interval '2 hours', 'keep'),
    ('${salonStd.biz}', '${I(3)}', 'percent', 10, now() - interval '1 hour', now() + interval '1 hour', 'keep')`), { commit: true });
  const unlisted = await tx(c, { role: "anon" }, (k) => sql(k, `select item_id from flash_unlisted_items`));
  assert.deepEqual(unlisted.map((r) => r.item_id), [I(1)]);
  const running = await tx(c, { role: "anon" }, (k) => sql(k, `select item_id, sale_price from public_flash_sales where business_id = '${salonStd.biz}'`));
  assert.equal(running.length, 1);

  const gal = await tx(c, { role: "anon" }, (k) => sql(k, `select count(*)::int as n from public_gallery_photos where business_id = '${salonPrem.biz}'`));
  assert.equal(gal[0].n, 12);
  const tt = await tx(c, { role: "anon" }, (k) => sql(k, `select count(*)::int as n from public_timetable where business_id = '${salonStd.biz}'`));
  assert.equal(tt[0].n, 0);
  const staff = await tx(c, { role: "anon" }, (k) => sql(k, `select name, item_ids from public_staff where business_id = '${salonStd.biz}'`));
  assert.deepEqual(staff, [{ name: "Joy", item_ids: [] }]);
});

test("writes are refused while the business is paused or suspended", async () => {
  await sql(c, `delete from flash_sales where business_id = '${salonStd.biz}'`);
  await sql(c, `update businesses set status = 'paused' where id = '${salonStd.biz}'`);
  await rejects(c, asSalonStd, offerSql, offer(salonStd.biz, 77), /row-level security/);
  await rejects(c, asSalonStd, `insert into staff_members (business_id, name) values ($1, 'Nope')`, [salonStd.biz], /row-level security/);
  const upd = await tx(c, asSalonStd, (k) => k.query(`update staff_members set name = 'Changed' where business_id = $1`, [salonStd.biz]));
  assert.equal(upd.rowCount, 0);
  const readable = await tx(c, asSalonStd, (k) => sql(k, `select id from staff_members`));
  assert.equal(readable.length, 1);
  await sql(c, `update businesses set status = 'suspended' where id = '${salonStd.biz}'`);
  await rejects(c, asSalonStd, flashSql, flash(salonStd.biz, I(1), plus(0), plus(60)), /row-level security/);
  await sql(c, `update businesses set status = 'live' where id = '${salonStd.biz}'`);
});
