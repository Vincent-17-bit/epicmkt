// Upgrade path: a database that already holds production-like data on 0001-0007 is moved to 0008, twice.
// Nothing may be lost, both column vocabularies must stay in step, and the admin security model must hold.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { asAdmin, asService, connect, rejects, sql, tx } from "./db.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const base = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/postgres";
const name = "epicmkt_upgrade_test";
const read = (f) => readFileSync(join(here, "..", "migrations", f), "utf8");
const withDb = (url, db) => { const u = new URL(url); u.pathname = `/${db}`; return u.toString(); };

const U = {
  admin: "00000000-0000-0000-0000-0000000000a0", reviewer: "00000000-0000-0000-0000-0000000000a2",
  finance: "00000000-0000-0000-0000-0000000000a3", sellerA: "00000000-0000-0000-0000-0000000000a1", sellerB: "00000000-0000-0000-0000-0000000000b1",
};
const B = { a: "10000000-0000-0000-0000-0000000000a1", b: "10000000-0000-0000-0000-0000000000b1", gone: "10000000-0000-0000-0000-0000000000c1" };
const asReviewer = { sub: U.reviewer };
const asFinance = { sub: U.finance };
const asSellerA = { sub: U.sellerA };
const asAnon = { role: "anon" };

let c;
let before_;

async function counts(k) {
  const out = {};
  for (const t of ["businesses", "items", "item_media", "faqs", "offers", "flags", "reports", "payments", "messages", "change_requests", "audit_log", "admin_notifications", "applications"]) {
    out[t] = (await sql(k, `select count(*)::int as n from ${t}`))[0].n;
  }
  return out;
}

before(async () => {
  const root = new pg.Client({ connectionString: base });
  await root.connect();
  await root.query(`drop database if exists ${name} with (force)`);
  await root.query(`create database ${name}`);
  await root.end();
  const url = withDb(base, name);
  const o = new pg.Client({ connectionString: url });
  await o.connect();
  await o.query(`alter database ${name} set search_path = "$user", public, extensions`);
  await o.query(readFileSync(join(here, "bootstrap.sql"), "utf8"));
  for (const f of ["0001_applications.sql", "0002_grants.sql", "0003_status.sql", "0004_core.sql", "0005_seller_portal.sql", "0006_subscription_notifications.sql", "0007_exceptions.sql"]) {
    await o.query(read(f));
  }
  await o.end();
  c = await connect(url);

  // ---- legacy production-like data, written the way 0004-0007 write it ----
  await c.query(`
    insert into auth.users (id, email) values
      ('${U.admin}','admin@t'), ('${U.reviewer}','reviewer@t'), ('${U.finance}','finance@t'), ('${U.sellerA}','a@t'), ('${U.sellerB}','b@t');
    insert into public.admins (user_id) values ('${U.admin}'), ('${U.reviewer}'), ('${U.finance}');
    insert into public.categories (id, name, grp, tier, sort) values ('barber','Barber','Beauty','A',1);
    insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values
      ('barber','standard',500,5,'["a","b","c"]'), ('barber','premium',1500,9,'["a","b","c"]');
    insert into public.applications (id, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number,
      phone, email, business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version,
      privacy_version, authorised, status)
    values ('20000000-0000-0000-0000-0000000000a1','barber','standard',500,'{}','Alice Owner','national_id','1','+254700000001','a@t','Shop A',false,2020,'S1','2030-01-01',
      'Nairobi','Nairobi','x',0,0,'+254700000001','1','1',true,'activated');
    -- slug has an uppercase letter and a space: must NOT be rejected, nor rewritten
    insert into public.businesses (id, seller_id, user_id, application_id, slug, name, category_id, plan_key, status, phone, paid_until) values
      ('${B.a}','ES1','${U.sellerA}','20000000-0000-0000-0000-0000000000a1','Shop A','Shop A','barber','standard','live','+254711000001', now() + interval '10 days'),
      ('${B.b}','ES2','${U.sellerB}',null,'shop-b','Shop B','barber','premium','pending','+254711000002', null),
      ('${B.gone}','ES3',null,null,'shop-gone','Gone','barber','standard','expired','+254711000003', now() - interval '40 days');
    insert into public.items (business_id, name, price, sale_price, availability, track_stock, stock_count, price_confirmed_at) values
      ('${B.a}','Cut', 1234.56, 999.99, 'unavailable', false, null, '2025-01-01'),
      ('${B.a}','Beard', 0.50, null, 'available', true, 7, '2025-02-02');
    insert into public.item_media (item_id, business_id, kind, path, mime, width, height)
      select id, '${B.a}', 'image', '${B.a}/cut.webp', 'image/webp', 800, 600 from public.items where name = 'Cut';
    insert into public.faqs (business_id, question, answer, hidden_by_admin, admin_hide_reason) values
      ('${B.a}', 'Open Sundays?', 'Yes, from ten.' || repeat('.', 700), false, null),
      ('${B.a}', 'Hidden one', 'a', true, 'spam'),
      ('${B.a}', 'Removed one', 'a', false, null);
    update public.faqs set removed_by_admin = true, admin_status = 'removed' where question = 'Removed one';
    insert into public.offers (business_id, title, active, hidden_by_admin) values ('${B.a}','Summer deal', true, false), ('${B.a}','Old deal', false, true);
    insert into public.flags (business_id, item_id, reason, status, seller_message, due_at, seller_reply, replied_at)
      select '${B.a}', id, 'Price looks wrong', 'replied', 'Please confirm the price', '2026-01-01', 'Confirmed', '2026-01-02' from public.items where name = 'Cut';
    insert into public.reports (business_id, reason, details, status) values
      ('${B.a}','wrong-price',repeat('d', 900), 'open'), ('${B.a}','scam',null,'reviewed'), ('${B.a}','something-new',null,'open');
    insert into public.payments (business_id, amount_kes, method, reference, status, kind, mpesa_code, plan_key, source, decline_reason, submitted_at) values
      ('${B.a}', 500, 'mpesa', 'ABCDE12345', 'confirmed', 'first', 'ABCDE12345', 'standard', 'admin', null, now() - interval '30 days'),
      ('${B.a}', 500, 'mpesa', 'ZZZZZ99999', 'rejected', 'renewal', 'ZZZZZ99999', 'standard', 'seller', 'No such code', now() - interval '3 days'),
      ('${B.a}', 500, 'mpesa', 'QQQQQ11111', 'submitted', 'renewal', 'QQQQQ11111', 'standard', 'seller', null, now());
    insert into public.messages (business_id, subject, body, kind, read_at) values
      ('${B.a}','Welcome','Hello','general', null), ('${B.a}','Paid','Thanks','payment', now());
    insert into public.change_requests (business_id, field, old_value, new_value, status) values
      ('${B.a}','name','Shop A','Shop A Deluxe','pending'), ('${B.a}','pin','A000000000B','A123456789B','approved');
    insert into public.audit_log (business_id, actor_id, actor_role, action, entity, entity_id, data) values
      ('${B.a}','${U.sellerA}','seller','profile_updated','business','${B.a}','{"fields":["tagline"]}'),
      ('${B.a}',null,'system','prices_confirmed','business','not-a-uuid','{}');
    insert into public.admin_notifications (kind, business_id, data, read_at) values ('change_request','${B.a}','{"field":"name"}', null);
    insert into public.site_settings (key, value) values ('grace_days','3'), ('mpesa','{"type":"paybill","number":"123456","name":"Mine"}');
  `);
  before_ = await counts(c);
  before_.prices = (await sql(c, `select name, price::text, sale_price::text from items order by name`));
  before_.slugs = (await sql(c, `select slug from businesses order by slug`)).map((r) => r.slug);

  // ---- the migration, twice ----
  await c.query(read("0008_admin.sql"));
  await c.query(read("0008_admin.sql"));
});

after(async () => { await c?.end(); });

test("no row is lost or created by the upgrade, and cents are kept", async () => {
  const now = await counts(c);
  for (const [t, n] of Object.entries(before_)) if (typeof n === "number") {
    // admin_notifications gains none, audit_log gains none: only seller-side rows existed
    assert.equal(now[t], n, t);
  }
  assert.deepEqual(await sql(c, `select name, price::text, sale_price::text from items order by name`), before_.prices);
  assert.deepEqual((await sql(c, `select slug from businesses order by slug`)).map((r) => r.slug), before_.slugs, "slugs are never rewritten");
});

test("pre-existing admin settings are not overwritten, missing defaults are added", async () => {
  const rows = Object.fromEntries((await sql(c, `select key, value from site_settings`)).map((r) => [r.key, r.value]));
  assert.equal(rows.grace_days, 3);
  assert.equal(rows.mpesa.number, "123456");
  assert.ok(rows.strike_threshold !== undefined && rows.quiet_hours !== undefined);
  assert.equal((await sql(c, `select public.grace_days() as g`))[0].g, 3);
});

test("businesses: both ownership columns, derived admin columns, existing sellers are not forced to change password", async () => {
  const [a] = await sql(c, `select * from businesses where id = '${B.a}'`);
  assert.equal(a.owner_user_id, U.sellerA);
  assert.equal(a.user_id, U.sellerA);
  assert.equal(a.owner_name, "Alice Owner");
  assert.equal(a.monthly_price, 500);
  assert.equal(a.must_change_password, false);
  assert.ok(a.first_paid_at, "first_paid_at comes from the confirmed payment");
  const [g] = await sql(c, `select owner_user_id, owner_name, monthly_price from businesses where id = '${B.gone}'`);
  assert.equal(g.owner_user_id, null);
  assert.equal(g.owner_name, "Gone");
  assert.equal(g.monthly_price, 500);
  // statuses from both vocabularies are valid
  for (const s of ["pending", "expired", "unlisted", "suspended", "paused"]) {
    await tx(c, asService, (k) => k.query(`update businesses set status = '${s}' where id = '${B.b}'`));
  }
});

test("ownership columns stay in step in both directions", async () => {
  await tx(c, asService, async (k) => {
    await k.query(`update businesses set user_id = null where id = '${B.b}'`);
    assert.equal((await sql(k, `select owner_user_id from businesses where id = '${B.b}'`))[0].owner_user_id, null);
    await k.query(`update businesses set owner_user_id = '${U.sellerB}' where id = '${B.b}'`);
    assert.equal((await sql(k, `select user_id from businesses where id = '${B.b}'`))[0].user_id, U.sellerB);
    await k.query("savepoint s");
    await assert.rejects(k.query(`update businesses set user_id = '${U.admin}', owner_user_id = '${U.reviewer}' where id = '${B.b}'`), /changed together/);
    await k.query("rollback to savepoint s");
    // a business created the admin way is visible to the seller code, and the reverse
    await k.query(`insert into businesses (id, seller_id, owner_user_id, slug, name, owner_name, category_id, plan_key, monthly_price, phone)
                   values ('10000000-0000-0000-0000-0000000000d1','ES9','${U.admin}','admin-made','Admin Made','Owner','barber','standard',500,'+254711000009')`);
    assert.equal((await sql(k, `select user_id from businesses where slug = 'admin-made'`))[0].user_id, U.admin);
    await k.query(`insert into businesses (seller_id, user_id, slug, name, category_id, phone) values ('ES10','${U.reviewer}','seller-made','Seller Made','barber','+254711000010')`);
    const [m] = await sql(k, `select owner_user_id, owner_name, monthly_price from businesses where slug = 'seller-made'`);
    assert.deepEqual([m.owner_user_id, m.owner_name, m.monthly_price], [U.reviewer, "Seller Made", 500]);
  });
});

test("payments: amount, reject_reason and the money columns agree, and a business can be deleted without losing payments", async () => {
  const rows = await sql(c, `select status, amount_kes, amount, decline_reason, reject_reason from payments order by created_at`);
  assert.ok(rows.every((r) => r.amount === r.amount_kes && r.amount === 500));
  assert.equal(rows.find((r) => r.status === "rejected").reject_reason, "No such code");
  await tx(c, asService, async (k) => {
    await k.query(`insert into payments (business_id, amount, plan_key, status, mpesa_code) values ('${B.a}', 700, 'standard', 'submitted', 'NEWNEW0001')`);
    const [n] = await sql(k, `select amount, amount_kes from payments where mpesa_code = 'NEWNEW0001'`);
    assert.deepEqual([n.amount, n.amount_kes], [700, 700]);
    await k.query(`update payments set amount_kes = 800 where mpesa_code = 'NEWNEW0001'`);
    assert.equal((await sql(k, `select amount from payments where mpesa_code = 'NEWNEW0001'`))[0].amount, 800);
    await k.query(`delete from businesses where id = '${B.gone}'`);
  });
  // a confirmed payment may be refunded, nothing else
  const [conf] = await sql(c, `select id from payments where status = 'confirmed' limit 1`);
  await rejects(c, asService, `update payments set status = 'submitted' where id = '${conf.id}'`, [], /payment_already_confirmed/);
  await tx(c, asService, (k) => k.query(`update payments set status = 'refunded' where id = '${conf.id}'`));
});

test("moderation: admin_status and the two legacy flags agree, and sellers still cannot touch them", async () => {
  const f = Object.fromEntries((await sql(c, `select question, admin_status, hidden_by_admin, removed_by_admin from faqs`)).map((r) => [r.question, r]));
  assert.equal(f["Open Sundays?"].admin_status, "ok");
  assert.equal(f["Hidden one"].admin_status, "hidden");
  assert.equal(f["Removed one"].admin_status, "removed");
  const o = Object.fromEntries((await sql(c, `select title, admin_status from offers`)).map((r) => [r.title, r.admin_status]));
  assert.deepEqual(o, { "Summer deal": "ok", "Old deal": "hidden" });
  await tx(c, asService, async (k) => {
    await k.query(`update faqs set admin_status = 'removed' where question = 'Open Sundays?'`);
    assert.equal((await sql(k, `select removed_by_admin from faqs where question = 'Open Sundays?'`))[0].removed_by_admin, true);
    await k.query(`update faqs set hidden_by_admin = true, removed_by_admin = false where question = 'Open Sundays?'`);
    assert.equal((await sql(k, `select admin_status from faqs where question = 'Open Sundays?'`))[0].admin_status, "hidden");
  });
  const [m] = await sql(c, `select id from item_media limit 1`);
  // sellers have no update policy on item_media, so through row level security the update matches nothing...
  assert.equal((await tx(c, asSellerA, (k) => k.query(`update item_media set removed_by_admin = true where id = '${m.id}'`))).rowCount, 0);
  // ...and even a path that bypasses row level security (a seller identity on the service role) hits the column guard
  await rejects(c, { role: "service_role", sub: U.sellerA }, `update item_media set removed_by_admin = true where id = '${m.id}'`, [], /admin_columns_protected/);
  await rejects(c, { role: "service_role", sub: U.sellerA }, `insert into item_media (item_id, business_id, kind, path, mime, removed_by_admin) values ((select item_id from item_media limit 1), '${B.a}', 'image', '${B.a}/x.webp', 'image/webp', true)`, [], /admin_columns_protected/);
  await tx(c, asAdmin, (k) => k.query(`update item_media set removed_by_admin = true where id = '${m.id}'`));
});

test("flags, reports and change requests keep old rows readable in the new vocabulary", async () => {
  const [fl] = await sql(c, `select target_type, target_id, seller_due_at, seller_replied_at, status from flags`);
  assert.equal(fl.target_type, "item");
  assert.ok(fl.target_id && fl.seller_due_at && fl.seller_replied_at);
  assert.equal(fl.status, "replied");
  const r = Object.fromEntries((await sql(c, `select reason, report_type, length(details)::int as len from reports`)).map((x) => [x.reason, x]));
  assert.equal(r["wrong-price"].report_type, "wrong_price");
  assert.equal(r["wrong-price"].len, 900, "details longer than 500 characters are kept");
  assert.equal(r.scam.report_type, "fake");
  assert.equal(r["something-new"].report_type, "other");
  const cr = await sql(c, `select field, field_path, old_value, new_value from change_requests order by field`);
  assert.deepEqual(cr.map((x) => [x.field, x.field_path]), [["name", "name"], ["pin", "pin"]]);
  assert.equal((await sql(c, `select length(answer)::int as n from faqs where question = 'Open Sundays?'`))[0].n > 500, true, "answers longer than 500 characters are kept");
});

test("audit_log: both vocabularies filled, append-only, and a deleted business only detaches its rows", async () => {
  const rows = await sql(c, `select action, entity, target_type, target_id, actor_role from audit_log order by id limit 2`);
  assert.equal(rows[0].target_type, "business");
  assert.equal(rows[0].target_id, B.a);
  assert.equal(rows[1].target_id, null, "a non-uuid entity_id stays text only");
  await rejects(c, asService, `update audit_log set action = 'x'`, [], /append-only/);
  await rejects(c, asService, `delete from audit_log`, [], /append-only/);
  await rejects(c, asService, `truncate audit_log`, [], /append-only/);
  await rejects(c, asAdmin, `insert into audit_log (action) values ('forged')`, [], /permission denied/);
  // seller-side writer still works and fills the admin-side columns
  await tx(c, asService, async (k) => {
    await k.query(`select write_audit('${B.a}', 'probe', 'business', '${B.a}', '{}')`);
    const [p] = await sql(k, `select target_type, target_id from audit_log where action = 'probe'`);
    assert.deepEqual([p.target_type, p.target_id], ["business", B.a]);
  });
  // admin-side writer
  await tx(c, asAdmin, async (k) => {
    await k.query(`select write_audit('probe2', 'business', '${B.a}', null, '{"a":1}', 'why')`);
    const [p] = await sql(k, `select entity, entity_id, actor_role, actor_email from audit_log where action = 'probe2'`);
    assert.deepEqual([p.entity, p.entity_id, p.actor_role, p.actor_email], ["business", B.a, "admin", "admin@t"]);
  });
  await rejects(c, asSellerA, `select write_audit('x', 'business', '${B.a}', null, null, null)`, [], /forbidden|permission denied/);
  // deleting a business keeps its audit rows and only clears the link
  const gone = "10000000-0000-0000-0000-0000000000e1";
  await sql(c, `insert into businesses (id, seller_id, slug, name, category_id, phone) values ('${gone}', 'ES77', 'audit-gone', 'Audit Gone', 'barber', '+254711000077')`);
  await sql(c, `select write_audit('${gone}', 'probe3', 'business', '${gone}', '{}')`);
  await sql(c, `delete from businesses where id = '${gone}'`);
  const kept = await sql(c, `select business_id, action, target_id from audit_log where action = 'probe3'`);
  assert.deepEqual(kept.map((r) => [r.business_id, r.target_id]), [[null, gone]]);
});

test("the admin edge functions' payloads insert cleanly", async () => {
  await tx(c, asService, async (k) => {
    // audit_log, as every admin function writes it
    await k.query(`insert into audit_log (actor_id, actor_email, action, target_type, target_id, before, after, reason)
                   values ('${U.admin}', 'admin@t', 'application.approve', 'application', '20000000-0000-0000-0000-0000000000a1', null, '{"status":"approved"}', 'ok')`);
    await k.query(`insert into audit_log (actor_id, actor_email, action, target_type, target_id, after, reason) values (null, null, 'daily.lifecycle', 'system', null, '{"reminders":1}', 'run')`);
    assert.deepEqual((await sql(k, `select actor_role from audit_log where action in ('application.approve','daily.lifecycle') order by id`)).map((r) => r.actor_role), ["admin", "system"]);
    // admin-decision: reviewer columns on the application, then a queued message that has no business
    await k.query(`update applications set status = 'under_review', reviewer_id = '${U.admin}', review_started_at = now() where id = '20000000-0000-0000-0000-0000000000a1'`);
    await k.query(`insert into messages (application_id, channel, to_address, subject, body, status, transactional, scheduled_at, created_by)
                   values ('20000000-0000-0000-0000-0000000000a1', 'sms', '+254700000001', 'EpicMKT: approve', 'Approved', 'queued', true, now(), '${U.admin}')`);
    assert.equal((await sql(k, `select status from messages where subject = 'EpicMKT: approve'`))[0].status, "queued");
    // admin-message: a queued row for a business, with no subject text at all
    await k.query(`insert into messages (business_id, channel, subject, body, status, scheduled_at, transactional, created_by) values ('${B.a}', 'email', null, 'hi', 'queued', now(), false, '${U.admin}')`);
    // admin-confirm-payment: both the confirm and the reject shapes, 10-character M-Pesa codes
    await k.query(`insert into payments (business_id, application_id, amount, plan_key, months, mpesa_code, phone, status, submitted_at, confirmed_by, confirmed_at, receipt_no, notes, reject_reason)
                   values ('${B.a}', null, 500, 'standard', 1, 'FNCCONFIRM', null, 'confirmed', now(), '${U.admin}', now(), 'EPM-1', 'Confirmed by admin', null)`);
    await k.query(`insert into payments (business_id, application_id, amount, plan_key, months, mpesa_code, phone, status, submitted_at, confirmed_by, confirmed_at, receipt_no, notes, reject_reason)
                   values (null, '20000000-0000-0000-0000-0000000000a1', 500, 'standard', 1, 'FNCREJECT1', null, 'rejected', now(), null, null, null, 'wrong amount', 'wrong amount')`);
    const [r] = await sql(k, `select amount_kes, decline_reason from payments where mpesa_code = 'FNCREJECT1'`);
    assert.deepEqual([r.amount_kes, r.decline_reason], [500, "wrong amount"]);
    // dispatch-messages and daily-lifecycle read
    assert.ok((await sql(k, `select * from messages order by created_at desc limit 20`)).length > 0);
    assert.ok((await sql(k, `select id, name, paid_until from businesses where status <> 'deleted' limit 100`)).length > 0);
    // requireAdmin reads the role column
    assert.deepEqual((await sql(k, `select role from admins where user_id = '${U.admin}'`))[0], { role: "owner" });
  });
});

test("messages: sellers see only in-app rows; admin sends are stored", async () => {
  await tx(c, asService, (k) => k.query(`insert into messages (business_id, channel, to_address, subject, body, provider_id) values ('${B.a}','sms','+254700000001','S','private sms body','prov-1')`));
  const own = await tx(c, asSellerA, (k) => sql(k, `select channel from messages`));
  assert.ok(own.length >= 2 && own.every((r) => r.channel === "in_app"));
  const legacy = await sql(c, `select status from messages where subject in ('Welcome','Paid')`);
  assert.ok(legacy.every((r) => r.status === "delivered"));
  await tx(c, asAdmin, async (k) => {
    await k.query(`insert into messages (business_id, channel, body, created_by) values ('${B.a}','in_app','from admin','${U.admin}')`);
    assert.equal((await sql(k, `select status from messages where body = 'from admin'`))[0].status, "delivered");
  });
});

test("row level security: roles, sellers and the public", async () => {
  // the seller portal's single-row read still sees only its own row
  assert.deepEqual((await tx(c, asSellerA, (k) => sql(k, `select id from businesses`))).map((r) => r.id), [B.a]);
  await sql(c, `update admins set role = 'reviewer' where user_id = '${U.reviewer}'; update admins set role = 'finance' where user_id = '${U.finance}'`);
  // owners edit settings; reviewer and finance do not
  await tx(c, asAdmin, (k) => k.query(`update site_settings set value = '2' where key = 'grace_days'`));
  assert.equal((await tx(c, asReviewer, (k) => k.query(`update site_settings set value = '9' where key = 'grace_days'`))).rowCount, 0);
  assert.equal((await tx(c, asFinance, (k) => k.query(`update site_settings set value = '9' where key = 'grace_days'`))).rowCount, 0);
  // reviewers handle applications, finance does not
  assert.equal((await tx(c, asReviewer, (k) => sql(k, `select id from applications`))).length, 1);
  assert.equal((await tx(c, asFinance, (k) => sql(k, `select id from applications`))).length, 0);
  assert.equal((await tx(c, asReviewer, (k) => k.query(`update site_settings set value = '9' where key = 'grace_days'`))).rowCount, 0);
  assert.equal((await tx(c, asFinance, (k) => sql(k, `select public.has_role(array['finance']) as r`)))[0].r, true);
  assert.equal((await tx(c, asReviewer, (k) => sql(k, `select public.has_role(array['finance','owner']) as r`)))[0].r, false);
  // the public sees only live, paid, visible rows, and never the private columns
  const pub = await tx(c, asAnon, (k) => sql(k, `select id, name from businesses`));
  assert.deepEqual(pub.map((r) => r.id), [B.a]);
  await rejects(c, asAnon, `select owner_user_id from businesses`, [], /permission denied/);
  await rejects(c, asAnon, `select user_id from businesses`, [], /permission denied/);
  await rejects(c, asAnon, `select * from payments`, [], /permission denied/);
  await rejects(c, asAnon, `select * from messages`, [], /permission denied/);
  const items = await tx(c, asAnon, (k) => sql(k, `select name from items order by name`));
  assert.deepEqual(items.map((r) => r.name), ["Beard", "Cut"]);
  const faqs = await tx(c, asAnon, (k) => sql(k, `select question from faqs`));
  assert.deepEqual(faqs.map((r) => r.question), ["Open Sundays?"], "hidden and removed FAQs are not public");
  assert.deepEqual((await tx(c, asAnon, (k) => sql(k, `select title from offers`))).map((r) => r.title), ["Summer deal"]);
  // grace is calendar days in Nairobi, on a timestamptz paid_until
  await sql(c, `update site_settings set value = '1' where key = 'grace_days'`);
  await sql(c, `update businesses set paid_until = now() - interval '5 days' where id = '${B.a}'`);
  assert.equal((await tx(c, asAnon, (k) => sql(k, `select id from businesses`))).length, 0);
  await sql(c, `update businesses set paid_until = now() - interval '12 hours' where id = '${B.a}'`);
  assert.equal((await tx(c, asAnon, (k) => sql(k, `select id from businesses`))).length, 1);
  await sql(c, `update businesses set paid_until = now() + interval '10 days' where id = '${B.a}'`);
  await sql(c, `update site_settings set value = '"junk"' where key = 'grace_days'`);
  assert.equal((await sql(c, `select public.grace_days() as g`))[0].g, 1, "a malformed setting falls back to one day");
  await sql(c, `update site_settings set value = '3' where key = 'grace_days'`);
});

test("admin RPCs: roles enforced, counts, search, visibility and flags", async () => {
  // a non-admin gets an empty object, never the counts
  assert.deepEqual((await tx(c, asSellerA, (k) => sql(k, `select admin_counts() as c`)))[0].c, {});
  await rejects(c, asSellerA, `select admin_search('shop')`, [], /forbidden/);
  const counts_ = (await tx(c, asAdmin, (k) => sql(k, `select admin_counts() as c`)))[0].c;
  assert.equal(counts_.live, 1);
  assert.equal(counts_.unconfirmed_payments >= 1, true);
  assert.equal(counts_.expired, 0);
  const found = (await tx(c, asAdmin, (k) => sql(k, `select admin_search('shop a') as r`)))[0].r;
  assert.ok(found.businesses.some((b) => b.id === B.a));
  assert.ok(found.items === undefined || Array.isArray(found.items));
  assert.deepEqual((await tx(c, asAdmin, (k) => sql(k, `select admin_search('a') as r`)))[0].r, {});
  assert.equal((await tx(c, asAdmin, (k) => sql(k, `select admin_set_business_visibility('${B.a}', false, 'cleanup') as r`)))[0].r, true);
  await tx(c, asAdmin, async (k) => {
    await k.query(`select admin_set_business_visibility('${B.a}', false, 'cleanup')`);
    assert.equal((await sql(k, `select status from businesses where id = '${B.a}'`))[0].status, "unlisted");
    await k.query(`select admin_set_business_visibility('${B.a}', true, null)`);
    assert.equal((await sql(k, `select status from businesses where id = '${B.a}'`))[0].status, "live");
  });
  // it cannot revive a pending business, nor override a seller's pause
  await sql(c, `update businesses set status = 'paused' where id = '${B.a}'`);
  await rejects(c, asAdmin, `select admin_set_business_visibility('${B.a}', true, null)`, [], /invalid_status/);
  await sql(c, `update businesses set status = 'live' where id = '${B.a}'`);
  await rejects(c, asAdmin, `select admin_set_business_visibility('${B.b}', true, null)`, [], /invalid_status/);
  const [f] = await sql(c, `select id from flags limit 1`);
  await tx(c, asAdmin, async (k) => {
    await k.query(`select admin_set_flag_status('${f.id}', 'investigating', 'looking')`);
    assert.equal((await sql(k, `select status, resolved_at from flags where id = '${f.id}'`))[0].resolved_at, null);
    await k.query(`select admin_set_flag_status('${f.id}', 'dismissed', 'ok')`);
    assert.ok((await sql(k, `select resolved_at from flags where id = '${f.id}'`))[0].resolved_at);
    await k.query("savepoint s");
    await assert.rejects(k.query(`select admin_set_flag_status('${f.id}', 'bogus')`), /invalid_status/);
    await k.query("rollback to savepoint s");
  });
  await rejects(c, asSellerA, `select admin_set_flag_status('${f.id}', 'resolved')`, [], /permission denied|not_an_admin|forbidden/);
  assert.ok((await sql(c, `select count(*)::int as n from audit_log where action in ('business.visibility','flag.status')`))[0].n === 0, "rolled-back admin actions leave no audit rows");
});

test("notifications: a submitted payment is announced once, with a title", async () => {
  await tx(c, asService, async (k) => {
    await k.query(`insert into payments (business_id, amount_kes, status, kind, mpesa_code, source) values ('${B.a}', 500, 'submitted', 'renewal', 'ONCEONCE01', 'seller')`);
    const [p] = await sql(k, `select id from payments where mpesa_code = 'ONCEONCE01'`);
    await k.query(`select notify_admin('payment_submitted', '${B.a}', jsonb_build_object('payment_id', '${p.id}'::text))`);
    const n = await sql(k, `select title, data from admin_notifications where kind = 'payment_submitted' and data ->> 'payment_id' = '${p.id}'`);
    assert.equal(n.length, 1);
    assert.match(n[0].title, /ONCEONCE01/);
  });
  assert.ok((await sql(c, `select title from admin_notifications where kind = 'change_request'`))[0].title);
});

test("running 0008 a third time changes nothing", async () => {
  const snap = async () => JSON.stringify(await sql(c, `
    select (select count(*) from pg_policies where schemaname = 'public') as policies,
           (select count(*) from pg_trigger where not tgisinternal and tgrelid::regclass::text like 'public.%') as triggers,
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as functions,
           (select count(*) from information_schema.columns where table_schema = 'public') as columns,
           (select count(*) from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public') as constraints,
           (select count(*) from pg_indexes where schemaname = 'public') as indexes`));
  const a = await snap();
  await c.query(read("0008_admin.sql"));
  assert.equal(await snap(), a);
});

test("a failed run leaves the database untouched", async () => {
  const snap = async () => JSON.stringify(await sql(c, `select (select count(*) from information_schema.columns where table_schema = 'public') as columns, (select count(*) from pg_policies) as policies`));
  const a = await snap();
  await assert.rejects(c.query(read("0008_admin.sql") + "\nselect 1/0;"), /division by zero/);
  assert.equal(await snap(), a);
});
