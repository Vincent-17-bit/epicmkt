import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { STOCK_CASES } from "../../shared/src/seller/stock-cases.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";

let c;
let url;

before(async () => {
  url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

// Every stored object is <business>/<item>/<media>/<file>.
const mp = (biz, item, media = randomUUID(), file = "a.webp") => `${biz}/${item}/${media}/${file}`;

const addItem = (k, biz, name, extra = "") =>
  k.query(`insert into items (business_id, name, price${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 100${extra ? ", " + extra.split("=")[1] : ""}) returning *`, [biz, name]);

test("a seller reads and writes only their own rows", async () => {
  await sql(c, `insert into items (id, business_id, name) values ('20000000-0000-0000-0000-00000000000b', '${ids.bizB}', 'B item')`);
  await tx(c, asA, async (k) => {
    assert.equal((await sql(k, `select id from businesses`)).length, 1);
    assert.equal((await sql(k, `select id from items`)).length, 0);
    await k.query(`insert into items (business_id, name) values ($1, 'A item')`, [ids.bizA]);
    assert.equal((await sql(k, `select id from items`)).length, 1);
    const upd = await k.query(`update items set name = 'hacked' where id = '20000000-0000-0000-0000-00000000000b'`);
    assert.equal(upd.rowCount, 0);
    const del = await k.query(`delete from items where id = '20000000-0000-0000-0000-00000000000b'`);
    assert.equal(del.rowCount, 0);
    const biz = await k.query(`update businesses set plan_key = 'premium', status = 'live', featured = true`);
    assert.equal(biz.rowCount, 0);
  });
  await rejects(c, asA, `insert into items (business_id, name) values ('${ids.bizB}', 'sneaky')`, [], /row-level security/);
  await rejects(c, asA, `insert into faqs (business_id, question, answer) values ('${ids.bizB}', 'q??', 'a')`, [], /row-level security/);
  for (const t of ["audit_log", "admin_notifications", "reports"]) {
    const rows = await tx(c, asA, (k) => sql(k, `select * from ${t}`));
    assert.equal(rows.length, 0);
  }
  for (const t of ["seller_otps", "auth_attempts"]) {
    await rejects(c, asA, `select * from ${t}`, [], /permission denied/);
    await rejects(c, { role: "anon" }, `select * from ${t}`, [], /permission denied/);
  }
  await rejects(c, { role: "anon" }, `select * from items`, [], /permission denied/);
});

test("the profile allow-list rejects forbidden fields", async () => {
  for (const f of ["status", "plan_key", "paid_until", "verification_level", "featured", "slug", "name", "category_id", "phone", "hours", "exceptions", "override", "partial_closures", "seller_id", "user_id", "id"]) {
    await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ [f]: "x" })], /field_not_allowed/);
  }
  const row = await tx(c, asA, async (k) => {
    const r = await sql(k, `select * from seller_update_profile($1::jsonb)`, [JSON.stringify({
      tagline: "Fresh cuts", description: "We cut hair.", whatsapp: "0712345678", email: "a@shop.co.ke",
      socials: { instagram: "https://instagram.com/a" }, amenities: ["wifi"], payment_methods: ["mpesa"],
      delivery_area: "Town", address: "Main St", tags: ["fade", "kids"], logo_path: `${ids.bizA}/logo.webp`, profile: { k: 1 },
    })]);
    return r[0];
  }, { commit: true });
  assert.equal(row.whatsapp, "+254712345678");
  assert.equal(row.tagline, "Fresh cuts");
  assert.deepEqual(row.tags, ["fade", "kids"]);
  assert.equal(row.plan_key, "standard");
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ announcement: "Sale" })], /premium_only/);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ logo_path: `${ids.bizB}/logo.webp` })], /invalid_logo_path/);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ cover_path: `${ids.bizA}/../x` })], /invalid_cover_path/);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ whatsapp: "123" })], /invalid_whatsapp/);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ tags: new Array(11).fill("x") })], /invalid_tags/);
  await rejects(c, asA, `select seller_update_profile($1::jsonb)`, [JSON.stringify({ tagline: "x".repeat(121) })], /invalid_tagline/);
  const prem = await tx(c, asB, (k) => sql(k, `select announcement from seller_update_profile($1::jsonb)`, [JSON.stringify({ announcement: "Open late" })]));
  assert.equal(prem[0].announcement, "Open late");
  const log = await sql(c, `select data from audit_log where action = 'profile_updated' and business_id = '${ids.bizA}'`);
  assert.equal(log.length, 1);
  assert.ok(log[0].data.fields.includes("tagline"));
  assert.ok(!JSON.stringify(log[0].data).includes("Fresh cuts"));
});

test("stock rules drive availability", async () => {
  await tx(c, asA, async (k) => {
    const { rows } = await k.query(`insert into items (business_id, name, track_stock, stock_count, low_stock_threshold) values ($1, 'Gel', true, 10, 3) returning id, availability`, [ids.bizA]);
    assert.equal(rows[0].availability, "available");
    const id = rows[0].id;
    const step = async (n) => (await k.query(`update items set stock_count = $2 where id = $1 returning availability`, [id, n])).rows[0].availability;
    assert.equal(await step(3), "limited_stock");
    assert.equal(await step(1), "limited_stock");
    assert.equal(await step(0), "out_of_stock");
    assert.equal(await step(4), "available");
    await k.query(`update items set track_stock = false, availability = 'unavailable' where id = $1`, [id]);
    assert.equal(await step(0), "unavailable");
  });
});

test("price confirmation stamps and history", async () => {
  await tx(c, asA, async (k) => {
    const { rows } = await k.query(`insert into items (business_id, name, price, price_confirmed_at) values ($1, 'Cut', 150, now() - interval '200 days') returning id`, [ids.bizA]);
    const id = rows[0].id;
    const stamp = async () => (await k.query(`select price_confirmed_at > now() - interval '1 minute' as fresh from items where id = $1`, [id])).rows[0].fresh;
    assert.equal(await stamp(), false);
    await k.query(`update items set description = 'x' where id = $1`, [id]);
    assert.equal(await stamp(), false);
    await k.query(`update items set price = 200 where id = $1`, [id]);
    assert.equal(await stamp(), true);
    await k.query(`update items set price_confirmed_at = now() - interval '200 days' where id = $1`, [id]);
    assert.equal(await stamp(), false);
    const n = (await k.query(`select seller_confirm_prices() as n`)).rows[0].n;
    assert.ok(n >= 1);
    assert.equal(await stamp(), true);

    await k.query(`update items set name = 'Cut 2', price_max = 300, price_type = 'range', unit = 'each', sale_price = 180, availability = 'limited_stock', stock_count = 4, visible = false where id = $1`, [id]);
    const h = (await k.query(`select field, old_value, new_value, actor_role, changed_by from item_history where item_id = $1 order by id`, [id])).rows;
    const fields = h.map((r) => r.field).sort();
    assert.deepEqual(fields, ["availability", "name", "price", "price_max", "price_type", "sale_price", "stock_count", "unit", "visible"].sort());
    const price = h.find((r) => r.field === "price");
    assert.equal(price.old_value, "150.00");
    assert.equal(price.new_value, "200.00");
    assert.ok(h.every((r) => r.actor_role === "seller" && r.changed_by === ids.userA));
    assert.equal((await k.query(`select count(*)::int as n from item_history where item_id = $1 and field = 'description'`, [id])).rows[0].n, 0);
    await assert.rejects(k.query(`update item_history set field = 'x'`), /permission denied/);
  });
  await sql(c, `insert into items (id, business_id, name) values ('20000000-0000-0000-0000-0000000000b2', '${ids.bizB}', 'B2')`);
  await sql(c, `update items set name = 'B2 renamed' where id = '20000000-0000-0000-0000-0000000000b2'`);
  const seenByA = await tx(c, asA, (k) => sql(k, `select business_id from item_history`));
  assert.ok(seenByA.every((r) => r.business_id === ids.bizA));
  const seenByAdmin = await tx(c, asAdmin, (k) => sql(k, `select distinct business_id from item_history`));
  assert.ok(seenByAdmin.some((r) => r.business_id === ids.bizB));
});

test("limits hold for Standard and Premium, admins and service bypass", async () => {
  await sql(c, `delete from items where business_id in ('${ids.bizA}','${ids.bizB}')`);
  await tx(c, asA, async (k) => {
    for (let i = 0; i < 3; i++) await k.query(`insert into items (business_id, name) values ($1, $2)`, [ids.bizA, `item ${i}`]);
    await k.query("savepoint s");
    await assert.rejects(k.query(`insert into items (business_id, name) values ($1, 'one too many')`, [ids.bizA]), /limit_reached:items/);
    await k.query("rollback to savepoint s");
    for (let i = 0; i < 5; i++) await k.query(`insert into faqs (business_id, question, answer) values ($1, $2, 'a')`, [ids.bizA, `question ${i}`]);
    await k.query("savepoint s2");
    await assert.rejects(k.query(`insert into faqs (business_id, question, answer) values ($1, 'question 6', 'a')`, [ids.bizA]), /limit_reached:faqs/);
    await k.query("rollback to savepoint s2");
    for (let i = 0; i < 8; i++) await k.query(`insert into offers (business_id, title) values ($1, $2)`, [ids.bizA, `offer ${i}`]);
    await k.query("savepoint s3");
    await assert.rejects(k.query(`insert into offers (business_id, title) values ($1, 'offer 9')`, [ids.bizA]), /limit_reached:offers/);
    await k.query("rollback to savepoint s3");
    await k.query(`insert into offers (business_id, title, active) values ($1, 'draft', false)`, [ids.bizA]);
    const draft = (await k.query(`select id from offers where title = 'draft'`)).rows[0].id;
    await k.query("savepoint s4");
    await assert.rejects(k.query(`update offers set active = true where id = $1`, [draft]), /limit_reached:offers/);
    await k.query("rollback to savepoint s4");
    await k.query(`update offers set active = false where title = 'offer 0'`);
    await k.query(`update offers set active = true where id = $1`, [draft]);
  });
  await tx(c, asB, async (k) => {
    for (let i = 0; i < 6; i++) await k.query(`insert into items (business_id, name) values ($1, $2)`, [ids.bizB, `p item ${i}`]);
    await k.query("savepoint s");
    await assert.rejects(k.query(`insert into items (business_id, name) values ($1, 'p 7')`, [ids.bizB]), /limit_reached:items/);
    await k.query("rollback to savepoint s");
    for (let i = 0; i < 20; i++) await k.query(`insert into faqs (business_id, question, answer) values ($1, $2, 'a')`, [ids.bizB, `question ${i}`]);
    await k.query("savepoint s2");
    await assert.rejects(k.query(`insert into faqs (business_id, question, answer) values ($1, 'question 21', 'a')`, [ids.bizB]), /limit_reached:faqs/);
    await k.query("rollback to savepoint s2");
    for (let i = 0; i < 25; i++) await k.query(`insert into offers (business_id, title) values ($1, $2)`, [ids.bizB, `offer ${i}`]);
  });
  await tx(c, asAdmin, async (k) => {
    for (let i = 0; i < 5; i++) await k.query(`insert into items (business_id, name) values ($1, $2)`, [ids.bizA, `admin ${i}`]);
  });
  await tx(c, asService, async (k) => {
    for (let i = 0; i < 5; i++) await k.query(`insert into items (business_id, name) values ($1, $2)`, [ids.bizA, `service ${i}`]);
  });
});

test("two parallel inserts at limit minus one admit only one", async () => {
  await sql(c, `insert into businesses (id, seller_id, slug, name, category_id, plan_key, status, phone, user_id) values ('10000000-0000-0000-0000-0000000000c1', 'ES100003', 'shop-c', 'Shop C', 'barber', 'standard', 'live', '+254733345678', '00000000-0000-0000-0000-0000000000c1')`.replace("insert into businesses", "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@test'); insert into businesses"));
  const userC = "00000000-0000-0000-0000-0000000000c1";
  const biz = "10000000-0000-0000-0000-0000000000c1";
  await sql(c, `insert into items (business_id, name) select '${biz}', 'seed ' || g from generate_series(1, 2) g`);
  const c1 = await connect(url);
  const c2 = await connect(url);
  const open = async (k) => {
    await k.query("begin");
    await k.query("set local role authenticated");
    await k.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userC, role: "authenticated" })]);
  };
  try {
    await open(c1);
    await open(c2);
    await c1.query(`insert into items (business_id, name) values ($1, 'first')`, [biz]);
    const second = c2.query(`insert into items (business_id, name) values ($1, 'second')`, [biz]).then(() => "ok", (e) => e.message);
    await new Promise((r) => setTimeout(r, 400));
    await c1.query("commit");
    assert.match(await second, /limit_reached:items/);
    await c2.query("rollback");
    assert.equal((await sql(c, `select count(*)::int as n from items where business_id = '${biz}'`))[0].n, 3);
  } finally {
    await c1.end();
    await c2.end();
    await sql(c, `delete from businesses where id = '${biz}'; delete from auth.users where id = '${userC}'`);
  }
});

test("protect_admin_cols blocks sellers only", async () => {
  const cols = [["hidden_by_admin", "true"], ["admin_hide_reason", "'x'"], ["admin_status", "'x'"], ["admin_reason", "'x'"], ["removed_by_admin", "true"]];
  for (const [table, ins] of [["items", "name"], ["faqs", "question"], ["offers", "title"]]) {
    const { rows } = await c.query(`insert into ${table} (business_id, ${ins}${table === "faqs" ? ", answer" : ""}) values ($1, 'seed row'${table === "faqs" ? ", 'a'" : ""}) returning id`, [ids.bizB]).catch(() => ({ rows: [] }));
    const id = rows[0]?.id ?? (await sql(c, `select id from ${table} where business_id = '${ids.bizB}' limit 1`))[0].id;
    for (const [col, val] of cols) {
      await rejects(c, asB, `update ${table} set ${col} = ${val} where id = '${id}'`, [], /admin_columns_protected/);
      await rejects(c, asB, `insert into ${table} (business_id, ${ins}, ${col}${table === "faqs" ? ", answer" : ""}) values ('${ids.bizB}', 'new row', ${val}${table === "faqs" ? ", 'a'" : ""})`, [], /admin_columns_protected/);
      await tx(c, asAdmin, (k) => k.query(`update ${table} set ${col} = ${val} where id = '${id}'`));
      await tx(c, asService, (k) => k.query(`update ${table} set ${col} = ${val} where id = '${id}'`));
    }
    await tx(c, asB, (k) => k.query(`update ${table} set ${table === "offers" ? "description = 'fine'" : "sort = 5"} where id = '${id}'`));
  }
});

test("change requests, replies, messages, pause and deletion", async () => {
  await tx(c, asA, async (k) => {
    const r = (await sql(k, `select * from seller_request_change('name', 'Shop A Deluxe')`))[0];
    assert.equal(r.status, "pending");
    assert.equal(r.old_value, "Shop A");
    await k.query("savepoint s");
    await assert.rejects(k.query(`select seller_request_change('name', 'Another')`), /change_already_pending/);
    await k.query("rollback to savepoint s");
    for (const [f, v, e] of [["phone", "12", /invalid_phone/], ["pin", "bad", /invalid_pin/], ["category_id", "nope", /invalid_category/], ["name", "Shop A Deluxe", /change_already_pending/], ["status", "live", /field_not_allowed/], ["town", "x", /invalid_town/], ["licence", "a", /invalid_licence/]]) {
      await k.query("savepoint s");
      await assert.rejects(k.query(`select seller_request_change($1, $2)`, [f, v]), e);
      await k.query("rollback to savepoint s");
    }
    const ok = (await sql(k, `select * from seller_request_change('pin', 'a123456789b')`))[0];
    assert.equal(ok.new_value, "A123456789B");
    const cancelled = (await sql(k, `select * from seller_cancel_change($1)`, [r.id]))[0];
    assert.equal(cancelled.status, "cancelled");
    await k.query("savepoint s");
    await assert.rejects(k.query(`select seller_cancel_change($1)`, [r.id]), /not_found_or_not_pending/);
    await k.query("rollback to savepoint s");
    await sql(k, `select * from seller_request_change('name', 'Shop A Deluxe 2')`);
    assert.equal((await sql(k, `select 1 from change_requests`)).length, 3);
    await assert.rejects(k.query(`insert into change_requests (business_id, field, new_value) values ('${ids.bizA}', 'name', 'x')`), /row-level security/);
  });
  const other = await sql(c, `select id from change_requests limit 0`);
  assert.equal(other.length, 0);
  const created = await sql(c, `insert into change_requests (business_id, field, new_value) values ('${ids.bizB}', 'town', 'Kisumu') returning id`);
  await rejects(c, asA, `select seller_cancel_change('${created[0].id}')`, [], /not_found_or_not_pending/);

  const flag = (await sql(c, `insert into flags (business_id, reason) values ('${ids.bizA}', 'Please fix your price list') returning id`))[0].id;
  await rejects(c, asB, `select seller_reply_flag('${flag}', 'My reply')`, [], /not_found_or_not_open/);
  await rejects(c, asA, `select seller_reply_flag('${flag}', 'x')`, [], /invalid_reply/);
  const replied = await tx(c, asA, (k) => sql(k, `select * from seller_reply_flag('${flag}', 'Fixed it today')`));
  assert.equal(replied[0].status, "replied");
  await sql(c, `update flags set status = 'open' where id = '${flag}'`);
  assert.equal((await tx(c, asA, (k) => k.query(`update flags set status = 'resolved' where id = '${flag}'`))).rowCount, 0);
  await rejects(c, asA, `insert into flags (business_id, reason) values ('${ids.bizA}', 'self flag')`, [], /row-level security/);
  const stillOpen = await sql(c, `select status from flags where id = '${flag}'`);
  assert.equal(stillOpen[0].status, "open");

  await sql(c, `insert into messages (business_id, subject, body) values ('${ids.bizA}', 'Hello', 'Welcome'), ('${ids.bizA}', 'Hi', 'Again'), ('${ids.bizB}', 'B only', 'x')`);
  const unread = await tx(c, asA, (k) => sql(k, `select (seller_catalog_stats()->>'unread_messages')::int as n`));
  assert.equal(unread[0].n, 2);
  const marked = await tx(c, asA, (k) => sql(k, `select seller_mark_read() as n`));
  assert.equal(marked[0].n, 2);
  assert.equal((await sql(c, `select count(*)::int as n from messages where business_id = '${ids.bizB}' and read_at is null`))[0].n, 1);
  assert.equal((await tx(c, asA, (k) => k.query(`update messages set subject = 'x'`))).rowCount, 0);
  await rejects(c, asA, `insert into messages (business_id, subject, body) values ('${ids.bizA}', 's', 'b')`, [], /row-level security/);

  await tx(c, asA, async (k) => {
    assert.equal((await sql(k, `select seller_pause_listing(true) as s`))[0].s, "paused");
    await k.query("savepoint s");
    await assert.rejects(k.query(`select seller_pause_listing(true)`), /invalid_status/);
    await k.query("rollback to savepoint s");
    assert.equal((await sql(k, `select seller_pause_listing(false) as s`))[0].s, "live");
  });
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizB}'`);
  await rejects(c, asB, `select seller_pause_listing(true)`, [], /invalid_status/);
  await rejects(c, asB, `select seller_pause_listing(false)`, [], /invalid_status/);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizB}'`);

  await rejects(c, asA, `select seller_request_deletion('Wrong name')`, [], /name_mismatch/);
  await tx(c, asA, async (k) => {
    await k.query(`select seller_request_deletion('  shop a ')`);
    assert.equal((await sql(k, `select public.my_business_id() as id`))[0].id, null);
    assert.equal((await sql(k, `select id from businesses`)).length, 0);
  }, { commit: false });
  assert.equal((await sql(c, `select status from businesses where id = '${ids.bizA}'`))[0].status, "live");
});

test("audit rows are written for data-changing actions", async () => {
  await tx(c, asA, async (k) => {
    await k.query(`select seller_update_profile('{"tagline":"x"}')`);
    await k.query(`select seller_pause_listing(true)`);
    await k.query(`select seller_confirm_prices()`);
    await k.query(`select seller_request_change('town', 'Kisumu')`);
  }, { commit: true });
  const actions = (await sql(c, `select action from audit_log where business_id = '${ids.bizA}'`)).map((r) => r.action);
  for (const a of ["profile_updated", "listing_paused", "prices_confirmed", "change_requested"]) assert.ok(actions.includes(a), a);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'; delete from change_requests where business_id = '${ids.bizA}'`);
  assert.ok((await sql(c, `select 1 from admin_notifications where kind = 'change_request'`)).length >= 1);
  const adminSees = await tx(c, asAdmin, (k) => sql(k, `select count(*)::int as n from audit_log`));
  assert.ok(adminSees[0].n >= 4);
});

test("catalog stats and item signals return counts only", async () => {
  await sql(c, `delete from items where business_id = '${ids.bizA}'; delete from flags where business_id = '${ids.bizA}'`);
  const rows = await sql(c, `
    insert into items (business_id, name, price, visible, availability, price_confirmed_at) values
      ('${ids.bizA}', 'one', 10, true, 'available', now()),
      ('${ids.bizA}', 'two', 10, false, 'out_of_stock', now() - interval '100 days'),
      ('${ids.bizA}', 'three', 10, true, 'limited_stock', now() - interval '10 days') returning id, name`);
  const one = rows.find((r) => r.name === "one").id;
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ('${one}', '${ids.bizA}', 'image', '${mp(ids.bizA, one)}', 'image/webp')`);
  await sql(c, `insert into flags (business_id, item_id, reason) values ('${ids.bizA}', '${one}', 'check this one')`);
  await sql(c, `insert into reports (business_id, item_id, reason, reporter_hash) values ('${ids.bizA}', '${one}', 'wrong_price', 'secret-hash'), ('${ids.bizA}', '${one}', 'spam', 'secret-hash-2')`);
  const stats = (await tx(c, asA, (k) => sql(k, `select seller_catalog_stats(30) as s`)))[0].s;
  assert.equal(stats.total, 3);
  assert.equal(stats.visible, 2);
  assert.equal(stats.hidden, 1);
  assert.equal(stats.out_of_stock, 1);
  assert.equal(stats.limited_stock, 1);
  assert.equal(stats.without_photo, 2);
  assert.equal(stats.stale_prices, 1);
  assert.equal(stats.items_limit, 3);
  assert.equal(stats.open_flags, 1);
  const signals = await tx(c, asA, async (k) => {
    const r = await k.query(`select * from seller_item_signals()`);
    assert.deepEqual(r.fields.map((f) => f.name), ["item_id", "open_flags", "reports_30d"]);
    return r.rows;
  });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].open_flags, 1);
  assert.equal(signals[0].reports_30d, 2);
  assert.ok(!JSON.stringify(signals).includes("secret"));
  assert.equal((await tx(c, asB, (k) => sql(k, `select * from seller_item_signals()`))).length, 0);
});

test("OTP issue and verify enforce limits and store only hashes", async () => {
  const biz = ids.bizB;
  const issue = (code, purpose = "forgot_password") => tx(c, asService, (k) => sql(k, `select seller_otp_issue($1, $2, $3) as r`, [biz, purpose, code]).then((r) => r[0].r), { commit: true });
  const verify = (code, purpose = "forgot_password") => tx(c, asService, (k) => sql(k, `select seller_otp_verify($1, $2, $3) as r`, [biz, purpose, code]).then((r) => r[0].r), { commit: true });
  const age = (s) => sql(c, `update seller_otps set created_at = created_at - interval '${s} seconds' where business_id = '${biz}'`);
  await sql(c, `delete from seller_otps`);

  assert.deepEqual(await issue("123456"), { ok: true });
  const stored = await sql(c, `select code_hash from seller_otps where business_id = '${biz}'`);
  assert.match(stored[0].code_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(stored[0].code_hash, "123456");
  const again = await issue("654321");
  assert.equal(again.ok, false);
  assert.equal(again.reason, "resend_wait");
  assert.ok(again.retry_after > 0 && again.retry_after <= 60);

  assert.equal((await verify("000000")).ok, false);
  assert.equal((await verify("123456")).ok, true);
  assert.equal((await verify("123456")).ok, false);

  await age(120);
  await issue("111111");
  for (let i = 0; i < 5; i++) assert.equal((await verify("222222")).reason, "invalid");
  assert.equal((await verify("111111")).reason, "attempts");

  await age(120);
  await sql(c, `delete from seller_otps`);
  for (let i = 0; i < 5; i++) {
    assert.equal((await issue(String(100000 + i))).ok, true);
    await age(120);
  }
  const hour = await issue("999999");
  assert.equal(hour.ok, false);
  assert.equal(hour.reason, "hour_limit");

  await sql(c, `delete from seller_otps`);
  await issue("333333");
  await sql(c, `update seller_otps set expires_at = now() - interval '1 second'`);
  assert.equal((await verify("333333")).ok, false);

  await sql(c, `delete from seller_otps`);
  await issue("444444", "change_password");
  assert.equal((await verify("444444", "forgot_password")).ok, false);
  assert.equal((await verify("444444", "change_password")).ok, true);

  await rejects(c, asService, `select seller_otp_issue('${biz}', 'forgot_password', 'abcdef')`, [], /invalid_otp_request/);
  await rejects(c, asB, `select seller_otp_issue('${biz}', 'forgot_password', '123456')`, [], /permission denied/);
  await rejects(c, asB, `select seller_otp_verify('${biz}', 'forgot_password', '123456')`, [], /permission denied/);
  const leaks = await sql(c, `select count(*)::int as n from seller_otps where code_hash ~ '^[0-9]{6}$'`);
  assert.equal(leaks[0].n, 0);
  const audit = await sql(c, `select count(*)::int as n from audit_log where data::text ~ '[^0-9][0-9]{6}[^0-9]'`);
  assert.equal(audit[0].n, 0);
});

test("lockout after five failures, same for unknown IDs", async () => {
  for (const key of ["sid:es100002", "sid:unknown-id"]) {
    await sql(c, `delete from auth_attempts`);
    const fail = () => tx(c, asService, (k) => sql(k, `select auth_record_failure($1) as s`, [key]).then((r) => r[0].s), { commit: true });
    const remaining = () => tx(c, asService, (k) => sql(k, `select auth_lock_remaining($1) as s`, [key]).then((r) => r[0].s));
    for (let i = 0; i < 4; i++) assert.equal(await fail(), 0);
    assert.equal(await remaining(), 0);
    const locked = await fail();
    assert.ok(locked > 890 && locked <= 900);
    assert.ok((await remaining()) > 0);
    await sql(c, `update auth_attempts set locked_until = now() - interval '1 second' where key = '${key}'`);
    assert.equal(await remaining(), 0);
    assert.equal(await fail(), 0);
    assert.equal((await sql(c, `select failures from auth_attempts where key = '${key}'`))[0].failures, 1);
    await tx(c, asService, (k) => k.query(`select auth_clear($1)`, [key]), { commit: true });
    assert.equal((await sql(c, `select count(*)::int as n from auth_attempts where key = '${key}'`))[0].n, 0);
  }
  await rejects(c, asA, `select auth_record_failure('x')`, [], /permission denied/);
  await rejects(c, asA, `select auth_lock_remaining('x')`, [], /permission denied/);
  await rejects(c, asA, `select revoke_user_sessions('${ids.userA}')`, [], /permission denied/);
});

test("login events are readable by their owner and admins", async () => {
  await sql(c, `insert into login_events (business_id, success, ip_hash) values ('${ids.bizA}', true, 'h1'), ('${ids.bizB}', false, 'h2')`);
  const own = await tx(c, asA, (k) => sql(k, `select business_id from login_events`));
  assert.deepEqual(own.map((r) => r.business_id), [ids.bizA]);
  assert.equal((await tx(c, asAdmin, (k) => sql(k, `select 1 from login_events`))).length, 2);
  await rejects(c, asA, `insert into login_events (business_id, success) values ('${ids.bizA}', true)`, [], /permission denied/);
  await rejects(c, asA, `delete from login_events`, [], /permission denied/);
});

test("seller settings are private to the seller", async () => {
  await tx(c, asA, async (k) => {
    await k.query(`insert into seller_settings (business_id, settings) values ($1, '{"theme":"dark"}')`, [ids.bizA]);
    await k.query(`update seller_settings set settings = '{"theme":"light"}'`);
    assert.equal((await sql(k, `select settings from seller_settings`))[0].settings.theme, "light");
    await assert.rejects(k.query(`insert into seller_settings (business_id, settings) values ($1, '{}')`, [ids.bizB]), /row-level security|duplicate/);
  });
  await sql(c, `insert into seller_settings (business_id) values ('${ids.bizB}')`);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from seller_settings`))).length, 0);
  assert.equal((await tx(c, asAdmin, (k) => sql(k, `select * from seller_settings`))).length, 1);
  await sql(c, `delete from seller_settings`);
});

test("storage: sellers touch only their own folder", async () => {
  const itemA = (await sql(c, `insert into items (business_id, name) values ('${ids.bizA}', 'Folder A') returning id`))[0].id;
  const itemB = (await sql(c, `insert into items (business_id, name) values ('${ids.bizB}', 'Folder B') returning id`))[0].id;
  const put = (who, path, bucket = "seller-media") => tx(c, who, (k) => k.query(`insert into storage.objects (bucket_id, name) values ($1, $2)`, [bucket, path]));
  await put(asA, mp(ids.bizA, itemA));
  await assert.rejects(put(asA, mp(ids.bizB, itemB)), /row-level security/);
  await assert.rejects(put(asA, `loose.webp`), /row-level security/);
  await assert.rejects(put(asA, mp(ids.bizA, itemA), "applications"), /row-level security/);
  // one of my own folders is not enough: the second level must be one of my items, and the path must be four levels deep
  await assert.rejects(put(asA, mp(ids.bizA, itemB)), /row-level security/);
  await assert.rejects(put(asA, mp(ids.bizA, randomUUID())), /row-level security/);
  await assert.rejects(put(asA, `${ids.bizA}/${itemA}/a.webp`), /row-level security/);
  await assert.rejects(put(asA, `${ids.bizA}/${itemA}/${randomUUID()}/deeper/a.webp`), /row-level security/);
  await put(asAdmin, mp(ids.bizB, itemB, randomUUID(), "admin.webp"));
  const keep = mp(ids.bizA, itemA, randomUUID(), "keep.webp");
  const theirs = mp(ids.bizB, itemB, randomUUID(), "theirs.webp");
  await sql(c, `insert into storage.objects (bucket_id, name) values ('seller-media', '${keep}'), ('seller-media', '${theirs}')`);
  const del = await tx(c, asA, async (k) => ({
    mine: (await k.query(`delete from storage.objects where name = '${keep}'`)).rowCount,
    theirs: (await k.query(`delete from storage.objects where name = '${theirs}'`)).rowCount,
  }));
  assert.deepEqual(del, { mine: 1, theirs: 0 });
  const upd = await tx(c, asA, async (k) => (await k.query(`update storage.objects set name = '${mp(ids.bizA, itemA)}' where name = '${theirs}'`)).rowCount);
  assert.equal(upd, 0);
  await sql(c, `insert into storage.objects (bucket_id, name) values ('seller-media', '${keep}')`);
  await assert.rejects(tx(c, asA, (k) => k.query(`update storage.objects set name = '${mp(ids.bizB, itemB)}' where name = '${keep}'`).then((r) => { if (r.rowCount === 0) throw new Error("row-level security"); })), /row-level security/);
  await assert.rejects(tx(c, asA, (k) => k.query(`update storage.objects set name = '${mp(ids.bizA, itemB)}' where name = '${keep}'`)), /row-level security/);
  assert.equal((await tx(c, asA, (k) => sql(k, `select name from storage.objects`))).every((r) => r.name.startsWith(ids.bizA)), true);
  const bucket = (await sql(c, `select * from storage.buckets where id = 'seller-media'`))[0];
  assert.equal(bucket.public, true);
  assert.equal(Number(bucket.file_size_limit), 25 * 1024 * 1024);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
  await sql(c, `delete from storage.objects`);
  await sql(c, `delete from items where id in ('${itemA}', '${itemB}')`);
});

// ---- S5 media manager ------------------------------------------------------------------------------------------
const fresh = async (biz = ids.bizA, name = "Media item", extra = "") =>
  (await sql(c, `insert into items (business_id, name${extra ? ", " + extra.split("=")[0] : ""}) values ('${biz}', '${name}'${extra ? ", " + extra.split("=")[1] : ""}) returning id`))[0].id;

// One call per media, the way seller-media-finalize makes it. Returns the jsonb the function answers with.
const attach = async (item, kind, o = {}) => {
  const media = o.media ?? randomUUID();
  const path = o.path ?? mp(o.biz ?? ids.bizA, item, media, kind === "image" ? "main.webp" : "video.mp4");
  const r = await tx(c, asService, (k) => sql(k,
    `select attach_item_media($1::uuid, $2::uuid, $3::text, $4::text, $5::text, 800, 600, $6::numeric, 1000::bigint, $7::jsonb, $8::text, null::numeric,
       $9::text, $10::text, $11::text, $12::text, $13::text, $14::uuid) as r`,
    [item, media, kind, path, kind === "image" ? "image/webp" : "video/mp4", kind === "video" ? 12 : null, JSON.stringify(o.variants ?? {}), o.poster ?? null,
     o.placeholder ?? null, o.alt ?? null, o.variantId ?? null, o.status ?? "ready", o.failReason ?? null, o.replace ?? null]), { commit: true });
  return { ...r[0].r, media };
};
const mediaOf = (item) => sql(c, `select * from item_media where item_id = '${item}' order by sort`);

test("media limits per item, locked and ownership checked", async () => {
  await sql(c, `delete from items where business_id = '${ids.bizA}'`);
  const item = await fresh();
  for (let i = 0; i < 7; i++) await attach(item, "image");
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'image') as ok`, [item])))[0].ok, false);
  await assert.rejects(attach(item, "image"), /limit_reached:item_media/);
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'video') as ok`, [item])))[0].ok, true);
  await attach(item, "video");
  await assert.rejects(attach(item, "video"), /limit_reached:item_media/);
  // a failed upload is kept so the seller sees a badge, but it never uses up a slot
  await attach(item, "image", { status: "failed", failReason: "unsupported_codec" });
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'image') as ok`, [item])))[0].ok, false);
  await assert.rejects(attach(item, "image", { biz: ids.bizB }), /path_not_owned/);
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'gif') as ok`, [item])))[0].ok, false);
  await rejects(c, asA, `select media_limit_ok('${item}', 'image')`, [], /permission denied/);
  await rejects(c, asA, `insert into item_media (item_id, business_id, kind, path, mime) values ('${item}', '${ids.bizA}', 'image', '${mp(ids.bizA, item)}', 'image/webp')`, [], /row-level security/);
  await rejects(c, asA, `select attach_item_media('${item}', gen_random_uuid(), 'image', 'x', 'image/webp', 800, 600, null, 1)`, [], /permission denied/);
  const own = await tx(c, asA, async (k) => ({ n: (await sql(k, `select 1 from item_media`)).length, del: (await k.query(`delete from item_media where kind = 'video'`)).rowCount }));
  assert.deepEqual(own, { n: 9, del: 1 });
  assert.equal((await tx(c, asB, (k) => sql(k, `select 1 from item_media`))).length, 0);
  await sql(c, `delete from items where id = '${item}'`);
});

test("media limits follow the plan: premium allows 15 photos and 3 videos", async () => {
  const item = await fresh(ids.bizB, "Premium item");
  for (let i = 0; i < 15; i++) await attach(item, "image", { biz: ids.bizB });
  await assert.rejects(attach(item, "image", { biz: ids.bizB }), /limit_reached:item_media/);
  for (let i = 0; i < 3; i++) await attach(item, "video", { biz: ids.bizB });
  await assert.rejects(attach(item, "video", { biz: ids.bizB }), /limit_reached:item_media/);
  await sql(c, `delete from items where id = '${item}'`);
});

test("attach checks the folder, alt text, variant, poster and status", async () => {
  const item = await fresh(ids.bizA, "Checked item", `variants='[{"id":"v1","label":"Red","price":10}]'::jsonb`);
  const other = await fresh(ids.bizA, "Other item");
  const media = randomUUID();
  // the path must be exactly <business>/<this item>/<this media>/...
  await assert.rejects(attach(item, "image", { media, path: mp(ids.bizA, other, media) }), /path_not_owned/);
  await assert.rejects(attach(item, "image", { media, path: mp(ids.bizA, item, randomUUID()) }), /path_not_owned/);
  await assert.rejects(attach(item, "image", { media, path: `${ids.bizA}/${item}/${media}/../../x.webp` }), /path_not_owned/);
  await assert.rejects(attach(item, "image", { media, variants: { 320: mp(ids.bizA, other, media, "w320.webp") } }), /path_not_owned/);
  await assert.rejects(attach(item, "video", { media, poster: mp(ids.bizA, other, media, "poster.webp") }), /path_not_owned/);
  await assert.rejects(attach(item, "image", { media, poster: mp(ids.bizA, item, media, "poster.webp") }), /poster_only_video/);
  await assert.rejects(attach(item, "image", { media, alt: "x".repeat(121) }), /alt_too_long/);
  await assert.rejects(attach(item, "image", { media, variantId: "nope" }), /variant_not_found/);
  await assert.rejects(attach(item, "image", { media, status: "weird" }), /invalid_status/);
  assert.equal((await mediaOf(item)).length, 0);
  const ok = await attach(item, "image", { media, alt: "Red shirt - view 1", variantId: "v1", variants: { 320: mp(ids.bizA, item, media, "w320.webp") }, placeholder: "data:image/webp;base64,AAAA" });
  assert.equal(ok.sort, 0);
  const row = (await mediaOf(item))[0];
  assert.deepEqual([row.id, row.alt, row.variant_id, row.status, row.variants["320"]], [media, "Red shirt - view 1", "v1", "ready", mp(ids.bizA, item, media, "w320.webp")]);
  await assert.rejects(attach(item, "image", { media }), /duplicate key/);
  const second = await attach(item, "image");
  assert.equal(second.sort, 1);
  await sql(c, `delete from items where id in ('${item}', '${other}')`);
});

test("a replacement keeps the position, alt text and variant, and the limit counts the swap once", async () => {
  const item = await fresh(ids.bizA, "Replace item", `variants='[{"id":"v1","label":"Red","price":10}]'::jsonb`);
  const first = await attach(item, "image", { alt: "First", variantId: "v1", variants: {} });
  const ids7 = [first];
  for (let i = 0; i < 6; i++) ids7.push(await attach(item, "image"));
  await assert.rejects(attach(item, "image"), /limit_reached:item_media/);
  const target = ids7[2];
  const swapped = await attach(item, "image", { replace: target.media, alt: null, variants: { 640: "x" } }).catch((e) => e);
  assert.match(String(swapped), /path_not_owned/);
  const done = await attach(item, "image", { replace: target.media });
  assert.equal(done.sort, 2);
  assert.ok(done.removed.includes(mp(ids.bizA, item, target.media, "main.webp")));
  const rows = await mediaOf(item);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.sort), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(rows[2].id, done.media);
  // alt text and the variant link move to the new file when the caller does not set them
  const swappedFirst = await attach(item, "image", { replace: first.media });
  assert.equal(swappedFirst.sort, 0);
  const head = (await mediaOf(item))[0];
  assert.deepEqual([head.alt, head.variant_id], ["First", "v1"]);
  await assert.rejects(attach(item, "video", { replace: swappedFirst.media }), /kind_mismatch/);
  await assert.rejects(attach(item, "image", { replace: randomUUID() }), /media_not_found/);
  await sql(c, `update item_media set removed_by_admin = true, admin_remove_reason = 'Not allowed' where id = '${swappedFirst.media}'`);
  await assert.rejects(attach(item, "image", { replace: swappedFirst.media }), /removed_by_admin/);
  await sql(c, `delete from items where id = '${item}'`);
});

test("sellers reorder and edit their own media; sets must match, other sellers' media is out of reach", async () => {
  const item = await fresh(ids.bizA, "Order item", `variants='[{"id":"v1","label":"Red","price":10}]'::jsonb`);
  const m = [];
  for (let i = 0; i < 4; i++) m.push((await attach(item, "image")).media);
  const video = (await attach(item, "video")).media;
  const all = [...m, video];
  const reorder = (who, id, list) => tx(c, who, (k) => k.query(`select seller_reorder_media($1, $2::uuid[])`, [id, list]), { commit: true });
  await reorder(asA, item, [video, m[3], m[2], m[1], m[0]]);
  assert.deepEqual((await mediaOf(item)).map((r) => r.id), [video, m[3], m[2], m[1], m[0]]);
  await assert.rejects(reorder(asA, item, [video, m[3]]), /order_mismatch/);
  await assert.rejects(reorder(asA, item, [...all, randomUUID()]), /order_mismatch/);
  await assert.rejects(reorder(asA, item, [video, video, m[2], m[1], m[0]]), /order_mismatch/);
  await assert.rejects(reorder(asB, item, all), /item_not_found/);
  await rejects(c, { role: "anon" }, `select seller_reorder_media('${item}', '{}')`, [], /permission denied/);

  const update = (who, id, patch) => tx(c, who, (k) => sql(k, `select * from seller_update_media($1, $2::jsonb)`, [id, JSON.stringify(patch)]));
  const done = await update(asA, m[0], { alt: "  Back view  ", variantId: "v1" });
  assert.deepEqual([done[0].alt, done[0].variant_id], ["Back view", "v1"]);
  assert.equal((await update(asA, m[0], { alt: "", variantId: "" }))[0].alt, null);
  await assert.rejects(update(asA, m[0], { alt: "x".repeat(121) }), /alt_too_long/);
  await assert.rejects(update(asA, m[0], { variantId: "ghost" }), /variant_not_found/);
  await assert.rejects(update(asA, m[0], { path: "x" }), /field_not_allowed:path/);
  await assert.rejects(update(asA, m[0], { status: "ready" }), /field_not_allowed:status/);
  await assert.rejects(update(asA, m[0], { removed_by_admin: false }), /field_not_allowed/);
  await assert.rejects(update(asB, m[0], { alt: "mine now" }), /media_not_found/);
  // a seller cannot write the table directly either: no update policy exists
  assert.equal((await tx(c, asA, (k) => k.query(`update item_media set alt = 'sneaky', sort = 99 where id = '${m[1]}'`))).rowCount, 0);
  await sql(c, `delete from items where id = '${item}'`);
});

test("admin removal shows a reason, hides the media from shoppers and cannot be undone by the seller", async () => {
  const item = await fresh(ids.bizA, "Removal item");
  const a = (await attach(item, "image")).media;
  const b = (await attach(item, "image")).media;
  const rm = (who, id, removed, reason) => tx(c, who, (k) => k.query(`select admin_set_media_removed($1, $2, $3)`, [id, removed, reason]), { commit: true });
  await assert.rejects(rm(asA, a, true, "I want it gone"), /not_admin/);
  await assert.rejects(rm(asAdmin, a, true, " "), /reason_required/);
  await rm(asAdmin, a, true, "Shows a stranger's face");
  const row = (await sql(c, `select removed_by_admin, admin_remove_reason from item_media where id = '${a}'`))[0];
  assert.deepEqual(row, { removed_by_admin: true, admin_remove_reason: "Shows a stranger's face" });
  await assert.rejects(tx(c, asA, (k) => k.query(`select seller_update_media($1, '{"alt":"x"}')`, [a])), /removed_by_admin/);
  assert.equal((await tx(c, asA, (k) => k.query(`update item_media set removed_by_admin = false where id = '${a}'`))).rowCount, 0);
  // a removed media frees its slot, and the seller can still dismiss it
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'image') as ok`, [item])))[0].ok, true);
  assert.equal((await tx(c, asA, (k) => k.query(`delete from item_media where id = '${a}'`))).rowCount, 1);
  await assert.rejects(rm(asAdmin, randomUUID(), true, "Gone for good"), /media_not_found/);
  await sql(c, `delete from items where id = '${item}'`);
  assert.ok(b);
});

test("shoppers read ready media only, never processing, failed or admin-removed, and never a video-only item", async () => {
  await sql(c, `update businesses set status = 'live' where id in ('${ids.bizA}', '${ids.bizB}')`);
  const full = await fresh(ids.bizA, "Shop item");
  const ready = (await attach(full, "image")).media;
  await attach(full, "video", { poster: undefined });
  const processing = (await attach(full, "image", { status: "processing" })).media;
  const failed = (await attach(full, "image", { status: "failed", failReason: "unreadable" })).media;
  const removed = (await attach(full, "image")).media;
  await sql(c, `update item_media set removed_by_admin = true, admin_remove_reason = 'No' where id = '${removed}'`);
  const seen = (who = { role: "anon" }, item = full) => tx(c, who, (k) => sql(k, `select id, kind from customer_item_media where item_id = $1 order by sort`, [item]));
  const ids1 = (await seen()).map((r) => r.id);
  assert.ok(ids1.includes(ready));
  for (const hidden of [processing, failed, removed]) assert.ok(!ids1.includes(hidden), hidden);
  assert.equal(ids1.length, 2);
  assert.deepEqual((await seen(asB)).map((r) => r.id), ids1);
  await rejects(c, { role: "anon" }, `select * from item_media`, [], /permission denied/);

  const videoOnly = await fresh(ids.bizA, "Video only");
  await attach(videoOnly, "video");
  assert.equal((await seen({ role: "anon" }, videoOnly)).length, 0);

  await sql(c, `update items set visible = false where id = '${full}'`);
  assert.equal((await seen()).length, 0);
  await sql(c, `update items set visible = true, hidden_by_admin = true where id = '${full}'`);
  assert.equal((await seen()).length, 0);
  await sql(c, `update items set hidden_by_admin = false where id = '${full}'`);
  await sql(c, `update businesses set status = 'paused' where id = '${ids.bizA}'`);
  assert.equal((await seen()).length, 0);
  await sql(c, `update businesses set status = 'live' where id = '${ids.bizA}'`);
  assert.equal((await seen()).length, 2);
  await sql(c, `delete from items where id in ('${full}', '${videoOnly}')`);
});

test("a seller needs a ready image to turn an item on; a video alone does not count", async () => {
  const item = await fresh(ids.bizA, "Publish item", "visible=false");
  const show = (who = asA) => tx(c, who, (k) => k.query(`update items set visible = true where id = '${item}'`), { commit: true });
  const hide = () => sql(c, `update items set visible = false where id = '${item}'`);
  await assert.rejects(show(), /photo_required:items/);
  await attach(item, "video");
  await assert.rejects(show(), /photo_required:items/);
  const processing = (await attach(item, "image", { status: "processing" })).media;
  await assert.rejects(show(), /photo_required:items/);
  await attach(item, "image", { status: "failed", failReason: "unreadable" });
  await assert.rejects(show(), /photo_required:items/);
  const removed = (await attach(item, "image")).media;
  await sql(c, `update item_media set removed_by_admin = true, admin_remove_reason = 'No' where id = '${removed}'`);
  await assert.rejects(show(), /photo_required:items/);
  await sql(c, `update item_media set status = 'ready' where id = '${processing}'`);
  await show();
  assert.equal((await sql(c, `select visible from items where id = '${item}'`))[0].visible, true);
  // other edits to an item without photos are fine, and the check applies to the off-to-on change only
  await hide();
  await sql(c, `delete from item_media where item_id = '${item}'`);
  await tx(c, asA, (k) => k.query(`update items set name = 'Renamed' where id = '${item}'`));
  await tx(c, asAdmin, (k) => k.query(`update items set visible = true where id = '${item}'`));
  await sql(c, `delete from items where id = '${item}'`);
  const live = await tx(c, asA, (k) => sql(k, `insert into items (business_id, name) values ('${ids.bizA}', 'Starts visible') returning visible, id`));
  assert.equal(live[0].visible, true);
  await sql(c, `delete from items where id = '${live[0].id}'`);
});

test("a poster can be set on a video only, inside its own folder, and the old one is returned for deletion", async () => {
  const item = await fresh(ids.bizA, "Poster item");
  const video = await attach(item, "video", { poster: undefined });
  const image = await attach(item, "image");
  const setPoster = (media, biz, path) => tx(c, asService, (k) => sql(k, `select set_media_poster($1, $2, $3, 1.5) as old`, [media, biz, path]), { commit: true });
  const first = mp(ids.bizA, item, video.media, "poster-1.webp");
  assert.equal((await setPoster(video.media, ids.bizA, first))[0].old, null);
  assert.equal((await setPoster(video.media, ids.bizA, mp(ids.bizA, item, video.media, "poster-2.webp")))[0].old, first);
  const row = (await mediaOf(item)).find((r) => r.id === video.media);
  assert.deepEqual([row.poster_path, Number(row.poster_time)], [mp(ids.bizA, item, video.media, "poster-2.webp"), 1.5]);
  await assert.rejects(setPoster(image.media, ids.bizA, mp(ids.bizA, item, image.media, "p.webp")), /poster_only_video/);
  await assert.rejects(setPoster(video.media, ids.bizB, mp(ids.bizB, item, video.media, "p.webp")), /media_not_found/);
  await assert.rejects(setPoster(video.media, ids.bizA, mp(ids.bizA, item, randomUUID(), "p.webp")), /path_not_owned/);
  await assert.rejects(setPoster(video.media, ids.bizA, `${ids.bizA}/${item}/${video.media}/../x.webp`), /path_not_owned/);
  await rejects(c, asA, `select set_media_poster('${video.media}', '${ids.bizA}', 'x', 1)`, [], /permission denied/);
  await sql(c, `delete from items where id = '${item}'`);
});

test("deleting an item deletes its media rows; one item's media never shows under another", async () => {
  const a = await fresh(ids.bizA, "Item A");
  const b = await fresh(ids.bizA, "Item B");
  const ma = await attach(a, "image");
  await attach(a, "video");
  await attach(b, "image");
  assert.equal((await mediaOf(a)).length, 2);
  assert.equal((await mediaOf(b)).length, 1);
  assert.ok((await mediaOf(a)).every((r) => r.item_id === a && r.path.split("/")[1] === a));
  assert.ok((await mediaOf(b)).every((r) => r.item_id === b && r.path.split("/")[1] === b));
  await sql(c, `delete from items where id = '${a}'`);
  assert.equal((await mediaOf(a)).length, 0);
  assert.equal((await mediaOf(b)).length, 1);
  assert.equal((await sql(c, `select 1 from item_media where id = '${ma.media}'`)).length, 0);
  await sql(c, `delete from items where id = '${b}'`);
});

test("S5 migration can run again", async () => {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "0007_media_manager.sql");
  await c.query(readFileSync(file, "utf8"));
  await c.query(readFileSync(file, "utf8"));
});

test("sessions can be revoked except the current one", async () => {
  const keep = "30000000-0000-0000-0000-000000000001";
  await sql(c, `insert into auth.sessions (id, user_id) values ('${keep}', '${ids.userA}'), (gen_random_uuid(), '${ids.userA}'), (gen_random_uuid(), '${ids.userB}')`);
  const n = await tx(c, asService, (k) => sql(k, `select revoke_user_sessions($1, $2) as n`, [ids.userA, keep]), { commit: true });
  assert.equal(n[0].n, 1);
  assert.equal((await sql(c, `select count(*)::int as n from auth.sessions where user_id = '${ids.userA}'`))[0].n, 1);
  assert.equal((await sql(c, `select count(*)::int as n from auth.sessions where user_id = '${ids.userB}'`))[0].n, 1);
});

test("realtime publishes change_requests and the migration re-runs safely", async () => {
  const pub = await sql(c, `select tablename from pg_publication_tables where pubname = 'supabase_realtime'`);
  assert.ok(pub.some((r) => r.tablename === "change_requests"));
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  await c.query(readFileSync(join(dir, "0004_core.sql"), "utf8"));
  await c.query(readFileSync(join(dir, "0005_seller_portal.sql"), "utf8"));
  await c.query(readFileSync(join(dir, "0006_catalog_entry.sql"), "utf8"));
  await c.query(readFileSync(join(dir, "0007_media_manager.sql"), "utf8"));
});

test("S1: catalog columns, wider availability and the same stock decisions as the shared preview", async () => {
  await sql(c, `delete from items where business_id in ('${ids.bizA}','${ids.bizB}')`);
  await tx(c, asB, async (k) => {
    for (const a of ["seasonal", "by_appointment", "coming_soon", "unavailable"]) {
      const { rows } = await k.query(`insert into items (business_id, name, availability) values ($1, $2, $3) returning availability`, [ids.bizB, `item ${a}`, a]);
      assert.equal(rows[0].availability, a);
    }
    await k.query("savepoint s");
    await assert.rejects(k.query(`insert into items (business_id, name, availability) values ($1, 'bad', 'sold_out')`, [ids.bizB]), /items_availability_check/);
    await k.query("rollback to savepoint s");
  });
  // Every row of the shared decision table, run through the real trigger. The trigger is the authority.
  await tx(c, asService, async (k) => {
    for (const [i, row] of STOCK_CASES.entries()) {
      const { rows } = await k.query(
        `insert into items (business_id, name, track_stock, stock_count, low_stock_threshold, availability) values ($1, $2, $3, $4, $5, $6) returning availability`,
        [ids.bizA, `case ${i}`, row.in.trackStock, row.in.stockCount, row.in.lowStockThreshold, row.in.availability]
      );
      assert.equal(rows[0].availability, row.out, JSON.stringify(row.in));
    }
  });
});

test("S1: new item constraints reject impossible values and accept the form's output", async () => {
  await sql(c, `delete from items where business_id in ('${ids.bizA}','${ids.bizB}')`);
  const bad = async (cols, vals, pattern) => rejects(c, asB, `insert into items (business_id, name, ${cols}) values ('${ids.bizB}', 'Test item', ${vals})`, [], pattern);
  await bad("price", "10.5", /items_whole_kes_check/);
  await bad("kind", "'gadget'", /items_kind_check/);
  await bad("badge", "'Hot'", /items_badge_check/);
  await bad("price, price_max", "100, 100", /items_range_check/);
  await bad("price, sale_price", "100, 100", /items_sale_below_price_check/);
  await bad("sale_starts_at, sale_ends_at", "'2026-11-02', '2026-11-01'", /items_sale_window_check/);
  await bad("short_description", `'${"x".repeat(161)}'`, /items_short_description_check/);
  await bad("variants", "'{}'::jsonb", /items_variants_check/);
  await bad("attributes", "'[]'::jsonb", /items_attributes_check/);
  await rejects(c, asB, `insert into items (business_id, name) values ('${ids.bizB}', '${"x".repeat(81)}')`, [], /items_name_len_check/);
  await tx(c, asB, async (k) => {
    const { rows } = await k.query(
      `insert into items (business_id, name, kind, short_description, price_type, price, price_max, unit, sale_price, sale_starts_at, sale_ends_at, search_tags, badge, variants, specs, includes, terms, service, membership, attributes, season)
       values ($1, 'Box braids', 'service', 'Neat braids', 'from', 2000, null, 'per session', 1800, '2026-11-01T00:00:00+03:00', '2026-11-30T23:59:59+03:00', '{braids,cornrows}', 'Popular',
       '[{"id":"a","label":"Small","price":2000}]', '[{"label":"Hair","value":"Included"}]', '["Wash"]', 'Deposit first', '{"duration":180}', '{}', '{"booking":"appointment"}', '{"from":"2026-12-01","to":"2026-12-31"}') returning id, kind`,
      [ids.bizB]
    );
    assert.equal(rows[0].kind, "service");
    // Undo re-inserts the same row id after a delete.
    await k.query(`delete from items where id = $1`, [rows[0].id]);
    await k.query(`insert into items (id, business_id, name) values ($1, $2, 'Box braids')`, [rows[0].id, ids.bizB]);
  });
});

test("S1: restoring a deleted item respects the plan limit, with the error the app maps", async () => {
  await sql(c, `delete from items where business_id = '${ids.bizA}'`);
  await tx(c, asA, async (k) => {
    for (let i = 0; i < 3; i++) await k.query(`insert into items (business_id, name) values ($1, $2)`, [ids.bizA, `fill ${i}`]);
    await k.query("savepoint s");
    await assert.rejects(k.query(`insert into items (id, business_id, name) values (gen_random_uuid(), $1, 'restored')`, [ids.bizA]), (e) => /limit_reached:items/.test(e.message));
    await k.query("rollback to savepoint s");
  });
});
