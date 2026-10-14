import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

const migrations = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
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
  for (const col of ["actor_email", "target_type", "target_id", "before", "after", "reason", "ip", "business_id", "actor_role"]) assert.ok(audit.includes(col), col);
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

test("business_is_visible follows status, deletion, paid_until and the grace setting", async () => {
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
  await setPaid(ids.bizA, -1);
  await sql(c, `update site_settings set value = '0' where key = 'grace_days'`);
  assert.equal(await visible(ids.bizA), false);
  await sql(c, `update site_settings set value = '1' where key = 'grace_days'`);
  assert.equal(await visible(ids.bizA), true);
});

test("seller payment flows still fire the admin notification trigger with the canonical amount column", async () => {
  await sql(c, `delete from admin_notifications`);
  await sql(c, `insert into payments (business_id, amount_kes, status, kind, mpesa_code, source, submitted_at)
    values ('${ids.bizA}', 500, 'submitted', 'renewal', 'TRG0000001', 'seller', now())`);
  const rows = await sql(c, `select title, body, link from admin_notifications where kind = 'payment_submitted'`);
  assert.deepEqual(rows, [{ title: "M-Pesa code TRG0000001", body: "KES 500", link: "/admin/payments" }]);
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
