import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let c;

const U = {
  reviewer: "00000000-0000-0000-0000-0000000000c1",
  finance: "00000000-0000-0000-0000-0000000000c2",
  support: "00000000-0000-0000-0000-0000000000c3",
};
const as = (role) => (role === "owner" ? asAdmin : { sub: U[role] });
const APP = "30000000-0000-0000-0000-0000000000f2";

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values
      ('${U.reviewer}', 'reviewer@test'), ('${U.finance}', 'finance@test'), ('${U.support}', 'support@test');
    insert into public.admins (user_id, role, email) values
      ('${U.reviewer}', 'reviewer', 'reviewer@test'), ('${U.finance}', 'finance', 'finance@test'), ('${U.support}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into public.categories (id, name, grp, tier) values ('zz-del', 'Del', 'G', 'A');
    insert into public.legal_docs (key, version, title, body) values ('terms', '1', 'Terms', 'Body') on conflict (key) do nothing;
    insert into public.message_templates (key, channel, body_en) values ('seed.template', 'sms', 'Hello');
    insert into public.site_config (key, value) values ('seed.key', '1');
    insert into public.content_pages (slug, title, body_md) values ('seed-page', 'Seed', 'Body');
    insert into public.applications (id, status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number, phone, email,
      business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, submitted_at)
      values ('${APP}', 'submitted', 'barber', 'standard', 500, '{}', 'Owner', 'national_id', '12345678', '+254700000001', 'o@x.co',
      'Biz', false, 2020, 'SBP1', '2099-01-01', 'Nairobi', 'Nairobi', 'Street', -1.28, 36.8, '+254700000001', '1', '1', true, now());
    insert into public.application_documents (application_id, slot_key, storage_path, original_name, mime, size_bytes) values ('${APP}', 'sbp', 'apps/seed/sbp.pdf', 'sbp.pdf', 'application/pdf', 10);
    insert into public.application_flags (application_id, path, message) values ('${APP}', 'documents.sbp', 'Please upload a clearer photo');
    insert into public.application_events (application_id, actor, type) values ('${APP}', 'system', 'seed');
  `);
});
after(async () => { await c.end(); });

const day = (offset) => `public.nairobi_midnight(public.nairobi_today() + (${offset}))`;
const setPaid = (id, offset, status = "live") =>
  sql(c, `update businesses set paid_until = ${offset === null ? "null" : day(offset)}, status = '${status}', deleted_at = null where id = '${id}'`);
const visible = async (id) => (await sql(c, `select public.business_is_visible(b) as v from businesses b where id = '${id}'`))[0].v;
const counts = () => tx(c, asAdmin, async (k) => (await sql(k, `select admin_counts() as r`))[0].r);

test("every migration applies to a clean database and the four tables have one definition", async () => {
  const cols = async (t) => (await sql(c, `select column_name from information_schema.columns where table_schema = 'public' and table_name = '${t}'`)).map((r) => r.column_name);
  const biz = await cols("businesses");
  assert.ok(biz.includes("user_id") && !biz.includes("owner_user_id"));
  for (const col of ["owner_name", "monthly_price", "must_change_password", "first_paid_at", "status_reason", "strikes"]) assert.ok(biz.includes(col), col);
  const pay = await cols("payments");
  assert.ok(pay.includes("amount_kes") && !pay.includes("amount"));
  for (const col of ["application_id", "months", "phone", "confirmed_by", "kind", "receipt_no", "mpesa_code"]) assert.ok(pay.includes(col), col);
  const msg = await cols("messages");
  for (const col of ["channel", "status", "to_address", "application_id", "dedupe_key", "scheduled_at", "read_at", "kind"]) assert.ok(msg.includes(col), col);
  const audit = await cols("audit_log");
  for (const col of ["actor_email", "target_type", "target_id", "before", "after", "reason", "ip_hash", "business_id", "actor_role"]) assert.ok(audit.includes(col), col);
  const [{ t }] = await sql(c, `select data_type as t from information_schema.columns where table_name = 'businesses' and column_name = 'paid_until'`);
  assert.equal(t, "timestamp with time zone");
});

test("migrations 0008 to 0010 can be re-run", async () => {
  for (const f of ["0008_admin.sql", "0009_admin_receipts.sql", "0010_reconcile_core.sql"]) await c.query(readFileSync(join(migrations, f), "utf8"));
});

test("admin_counts runs for an admin, returns nothing for a seller, and is closed to anon", async () => {
  const keys = ["submitted", "under_review", "changes_requested", "awaiting_payment", "payment_confirming", "live", "expiring_7d", "in_grace", "expired",
    "suspended", "open_flags", "open_reports", "unconfirmed_payments", "failed_messages", "pending_changes"];
  await setPaid(ids.bizA, null);
  await setPaid(ids.bizB, null);
  const empty = await counts();
  assert.deepEqual(Object.keys(empty).sort(), [...keys].sort());
  assert.ok(Object.values(empty).every((n) => Number.isInteger(n)));
  assert.equal(empty.live, 0);

  await setPaid(ids.bizA, 3);
  await setPaid(ids.bizB, -1);
  assert.deepEqual(pick(await counts(), ["live", "expiring_7d", "in_grace", "expired"]), { live: 2, expiring_7d: 1, in_grace: 1, expired: 0 });

  await setPaid(ids.bizB, -5);
  assert.deepEqual(pick(await counts(), ["live", "expiring_7d", "in_grace", "expired"]), { live: 1, expiring_7d: 1, in_grace: 0, expired: 1 });

  await setPaid(ids.bizB, 30, "suspended");
  assert.equal((await counts()).suspended, 1);

  await sql(c, `insert into messages (business_id, channel, status, subject, body) values ('${ids.bizA}', 'sms', 'failed', 's', 'b')`);
  assert.equal((await counts()).failed_messages, 1);

  assert.deepEqual(await tx(c, asA, async (k) => (await sql(k, `select admin_counts() as r`))[0].r), {});
  await rejects(c, { role: "anon" }, `select admin_counts()`, [], /permission denied/);
});

const pick = (o, ks) => Object.fromEntries(ks.map((k) => [k, o[k]]));

test("business_is_visible follows status, deletion, paid_until and the fixed one-day grace", async () => {
  await setPaid(ids.bizA, 10);
  assert.equal(await visible(ids.bizA), true);
  await setPaid(ids.bizA, 0);
  assert.equal(await visible(ids.bizA), true);
  await setPaid(ids.bizA, -1);
  assert.equal(await visible(ids.bizA), true);
  await setPaid(ids.bizA, -2);
  assert.equal(await visible(ids.bizA), false);
  await setPaid(ids.bizA, null);
  assert.equal(await visible(ids.bizA), false);
  await setPaid(ids.bizA, 10, "paused");
  assert.equal(await visible(ids.bizA), false);
  await setPaid(ids.bizA, 10, "live");
  await sql(c, `update businesses set deleted_at = now() where id = '${ids.bizA}'`);
  assert.equal(await visible(ids.bizA), false);
});

test("seller_submit_payment still notifies the admins with the canonical amount column", async () => {
  await sql(c, `delete from admin_notifications`);
  const paid = await tx(c, asA, async (k) => (await k.query(`select amount_kes, status, kind from seller_submit_payment('TRG0000001')`)).rows[0], { commit: true });
  assert.deepEqual(paid, { amount_kes: 500, status: "submitted", kind: "renewal" });
  const rows = await sql(c, `select kind, business_id from admin_notifications where kind = 'payment_submitted'`);
  assert.deepEqual(rows, [{ kind: "payment_submitted", business_id: ids.bizA }]);
});

test("confirmed payments get RCT receipts in sequence from the shared trigger", async () => {
  await sql(c, `alter sequence public.receipt_seq restart with 1`);
  const ins = (code) => sql(c, `insert into payments (business_id, amount_kes, status, kind, mpesa_code, source, submitted_at)
    values ('${ids.bizB}', 500, 'confirmed', 'renewal', '${code}', 'admin', now()) returning receipt_no`);
  assert.equal((await ins("RCT0000001"))[0].receipt_no, "RCT-000001");
  assert.equal((await ins("RCT0000002"))[0].receipt_no, "RCT-000002");
  await rejects(c, null, `insert into payments (business_id, amount_kes, status, kind, mpesa_code, source) values ('${ids.bizB}', 500, 'confirmed', 'renewal', 'RCT0000002', 'admin')`, [], /payments_mpesa_code_key/);
});

test("a payment needs a business or an application", async () => {
  await rejects(c, null, `insert into payments (amount_kes, status, kind, source) values (500, 'rejected', 'first', 'admin')`, [], /payments_target_check/);
});

const blocked = /row-level security|permission denied/;
const rowCount = (who, text) => tx(c, who, async (k) => (await k.query(text)).rowCount);

const APP_INSERT = `insert into applications (reference_no, status, category_id, plan_key, price_at_submission, plan_snapshot, owner_full_name, owner_id_type, owner_id_number, phone, email,
  business_name, registered, year_established, sbp_number, sbp_expiry, county, town, address, lat, lng, whatsapp, terms_version, privacy_version, authorised, submitted_at)
  values ('EPM-2026-ZZZZZZ', 'submitted', 'barber', 'standard', 500, '{}', 'Owner', 'national_id', '12345678', '+254700000002', 'p@x.co',
  'Biz2', false, 2020, 'SBP2', '2099-01-01', 'Nairobi', 'Nairobi', 'Street', -1.28, 36.8, '+254700000002', '1', '1', true, now())`;

const reviewerTables = {
  applications: { insert: APP_INSERT, update: `update applications set business_name = 'Hacked' where id = '${APP}'`, delete: `delete from applications where id = '${APP}'` },
  application_documents: {
    insert: `insert into application_documents (application_id, slot_key, storage_path, original_name, mime, size_bytes) values ('${APP}', 'id_front', 'apps/x/id.pdf', 'id.pdf', 'application/pdf', 10)`,
    update: `update application_documents set verified = true where application_id = '${APP}'`,
    delete: `delete from application_documents where application_id = '${APP}'`,
  },
  application_flags: {
    insert: `insert into application_flags (application_id, path, message) values ('${APP}', 'documents.id', 'Blurred photo')`,
    update: `update application_flags set message = 'Hacked flag' where application_id = '${APP}'`,
    delete: `delete from application_flags where application_id = '${APP}'`,
  },
  application_events: {
    insert: `insert into application_events (application_id, actor, type) values ('${APP}', 'admin', 'forged')`,
    update: `update application_events set type = 'forged' where application_id = '${APP}'`,
    delete: `delete from application_events where application_id = '${APP}'`,
  },
};

const ownerTables = {
  categories: { insert: `insert into categories (id, name, grp, tier) values ('zz', 'Z', 'G', 'A')`, update: `update categories set name = 'Hacked' where id = 'barber'`, delete: `delete from categories where id = 'zz-del'` },
  plans: {
    insert: `insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('barber', 'standard', 1, 1, '["a","b","c"]')`,
    update: `update plans set price_kes = 1 where category_id = 'barber'`,
    delete: `delete from plans where category_id = 'barber'`,
  },
  global_limits: { insert: `insert into global_limits (id, standard, premium) values (1, '{}', '{}')`, update: `update global_limits set standard = '{}' where id = 1`, delete: `delete from global_limits where id = 1` },
  legal_docs: { insert: `insert into legal_docs (key, version, title, body) values ('terms', '2', 'T', 'B')`, update: `update legal_docs set body = 'Hacked' where key = 'terms'`, delete: `delete from legal_docs where key = 'terms'` },
  site_settings: { insert: `insert into site_settings (key, value) values ('zz', '1')`, update: `update site_settings set value = '1' where key = 'mpesa'`, delete: `delete from site_settings where key = 'mpesa'` },
  message_templates: { insert: `insert into message_templates (key, channel, body_en) values ('zz.t', 'sms', 'x')`, update: `update message_templates set body_en = 'Hacked'`, delete: `delete from message_templates` },
  site_config: { insert: `insert into site_config (key, value) values ('zz', '1')`, update: `update site_config set value = '2'`, delete: `delete from site_config` },
  content_pages: { insert: `insert into content_pages (slug, title, body_md) values ('zz-page', 'Z', 'B')`, update: `update content_pages set title = 'Hacked'`, delete: `delete from content_pages` },
};

async function assertBlocked(who, label, t, w) {
  await rejects(c, who, w.insert, [], blocked);
  assert.equal(await rowCount(who, w.update), 0, `${label} update on ${t}`);
  assert.equal(await rowCount(who, w.delete), 0, `${label} delete on ${t}`);
}

async function assertAllowed(who, label, t, w) {
  assert.ok((await rowCount(who, w.update)) >= 1, `${label} update on ${t}`);
  assert.ok((await rowCount(who, w.delete)) >= 1, `${label} delete on ${t}`);
}

test("application tables: only owner and reviewer write; support, finance and a non-admin are blocked", async () => {
  for (const [t, w] of Object.entries(reviewerTables)) {
    await assertAllowed(as("owner"), "owner", t, w);
    await assertAllowed(as("reviewer"), "reviewer", t, w);
    await assertBlocked(as("support"), "support", t, w);
    await assertBlocked(as("finance"), "finance", t, w);
    await assertBlocked(asA, "non-admin", t, w);
  }
  assert.equal((await sql(c, `select business_name from applications where id = '${APP}'`))[0].business_name, "Biz");
});

test("catalogue, settings and admin-only tables: only the owner writes; reviewer, support and a non-admin are blocked", async () => {
  for (const [t, w] of Object.entries(ownerTables)) {
    await assertAllowed(as("owner"), "owner", t, w);
    await assertBlocked(as("reviewer"), "reviewer", t, w);
    await assertBlocked(as("support"), "support", t, w);
    await assertBlocked(asA, "non-admin", t, w);
  }
});

test("message_templates, site_config and content_pages grant to authenticated and service_role, and RLS decides access", async () => {
  const grants = async (role, t) => (await sql(c, `select privilege_type from information_schema.role_table_grants where grantee = '${role}' and table_schema = 'public' and table_name = '${t}'`)).map((r) => r.privilege_type).sort();
  for (const t of ["message_templates", "site_config", "content_pages"]) {
    assert.deepEqual(await grants("authenticated", t), ["DELETE", "INSERT", "SELECT", "UPDATE"], t);
    assert.ok((await grants("service_role", t)).length >= 4, t);
    assert.equal(await tx(c, asService, async (k) => (await k.query(`select 1 from ${t} limit 1`)).rowCount), 1, `service role reads ${t}`);
    assert.equal((await rowCount(asA, `select 1 from ${t}`)) > 0, t !== "message_templates", `non-admin read of ${t}`);
  }
  assert.equal(await rowCount(as("support"), `select 1 from message_templates`), 1);
});
