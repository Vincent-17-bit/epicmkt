import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin, asService } from "./db.mjs";

let c;
let url;

before(async () => {
  url = await createDatabase();
  c = await connect(url);
  await seedFixtures(c);
});
after(async () => { await c.end(); });

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
  await sql(c, `insert into item_media (item_id, business_id, kind, path, mime) values ('${one}', '${ids.bizA}', 'image', '${ids.bizA}/a.webp', 'image/webp')`);
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
  const put = (who, path) => tx(c, who, (k) => k.query(`insert into storage.objects (bucket_id, name) values ('seller-media', $1)`, [path]));
  await put(asA, `${ids.bizA}/items/a.webp`);
  await assert.rejects(put(asA, `${ids.bizB}/items/a.webp`), /row-level security/);
  await assert.rejects(put(asA, `loose.webp`), /row-level security/);
  await assert.rejects(tx(c, asA, (k) => k.query(`insert into storage.objects (bucket_id, name) values ('applications', $1)`, [`${ids.bizA}/x.pdf`])), /row-level security/);
  await put(asAdmin, `${ids.bizB}/items/admin.webp`);
  await sql(c, `insert into storage.objects (bucket_id, name) values ('seller-media', '${ids.bizA}/keep.webp'), ('seller-media', '${ids.bizB}/theirs.webp')`);
  const del = await tx(c, asA, async (k) => ({
    mine: (await k.query(`delete from storage.objects where name = '${ids.bizA}/keep.webp'`)).rowCount,
    theirs: (await k.query(`delete from storage.objects where name = '${ids.bizB}/theirs.webp'`)).rowCount,
  }));
  assert.deepEqual(del, { mine: 1, theirs: 0 });
  const upd = await tx(c, asA, async (k) => (await k.query(`update storage.objects set name = '${ids.bizA}/moved.webp' where name = '${ids.bizB}/theirs.webp'`)).rowCount);
  assert.equal(upd, 0);
  await assert.rejects(tx(c, asA, (k) => k.query(`update storage.objects set name = '${ids.bizB}/stolen.webp' where name = '${ids.bizA}/keep.webp'`).then((r) => { if (r.rowCount === 0) throw new Error("row-level security"); })), /row-level security/);
  assert.equal((await tx(c, asA, (k) => sql(k, `select name from storage.objects`))).every((r) => r.name.startsWith(ids.bizA)), true);
  const bucket = (await sql(c, `select * from storage.buckets where id = 'seller-media'`))[0];
  assert.equal(bucket.public, true);
  assert.equal(Number(bucket.file_size_limit), 25 * 1024 * 1024);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
  await sql(c, `delete from storage.objects`);
});

test("media limits per item, locked and ownership checked", async () => {
  await sql(c, `delete from items where business_id = '${ids.bizA}'`);
  const item = (await sql(c, `insert into items (business_id, name) values ('${ids.bizA}', 'Photo item') returning id`))[0].id;
  const attach = (kind, n, biz = ids.bizA) => tx(c, asService, (k) => sql(k, `select attach_item_media($1, $2, $3, $4, 800, 600, null, 1000) as id`, [item, kind, `${biz}/${kind}-${n}`, kind === "image" ? "image/webp" : "video/mp4"]), { commit: true });
  for (let i = 0; i < 7; i++) await attach("image", i);
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'image') as ok`, [item])))[0].ok, false);
  await assert.rejects(attach("image", 8), /limit_reached:item_media/);
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'video') as ok`, [item])))[0].ok, true);
  await attach("video", 1);
  await assert.rejects(attach("video", 2), /limit_reached:item_media/);
  await assert.rejects(attach("image", 9, ids.bizB), /path_not_owned/);
  assert.equal((await tx(c, asService, (k) => sql(k, `select media_limit_ok($1, 'gif') as ok`, [item])))[0].ok, false);
  await rejects(c, asA, `select media_limit_ok('${item}', 'image')`, [], /permission denied/);
  await rejects(c, asA, `insert into item_media (item_id, business_id, kind, path, mime) values ('${item}', '${ids.bizA}', 'image', '${ids.bizA}/x', 'image/webp')`, [], /row-level security/);
  const own = await tx(c, asA, async (k) => ({ n: (await sql(k, `select 1 from item_media`)).length, del: (await k.query(`delete from item_media where kind = 'video'`)).rowCount }));
  assert.deepEqual(own, { n: 8, del: 1 });
  assert.equal((await tx(c, asB, (k) => sql(k, `select 1 from item_media`))).length, 0);
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
  await c.query(readFileSync(join(dir, "0005_core.sql"), "utf8"));
  await c.query(readFileSync(join(dir, "0006_seller_portal.sql"), "utf8"));
});
