import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";

let c;
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const FINANCE = "00000000-0000-0000-0000-0000000000c4";
const asSupport = { sub: SUPPORT };
const asFinance = { sub: FINANCE };
const BATCH = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER = "aaaaaaaa-0000-4000-8000-000000000002";

const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
const row = (batch, status, extra = {}) =>
  sql(c, `insert into public.messages (business_id, channel, kind, subject, body, to_address, status, scheduled_at, claimed_at, batch_id, read_at, transactional)
          values ($1, $2, 'general', 'Weekend offer', 'Body', '+254700000000', $3, $4, $5, $6, now(), $7) returning id`,
    [extra.business ?? ids.bizA, extra.channel ?? "sms", status, extra.at ?? new Date(Date.now() + 3_600_000).toISOString(), extra.claimed ?? null, batch, extra.transactional ?? false]).then((r) => r[0].id);
const statusOf = async (id) => (await sql(c, `select status from public.messages where id = $1`, [id]))[0].status;
const audits = () => sql(c, `select * from public.audit_log where action = 'broadcast.cancel' and target_id = $1 order by id`, [BATCH]);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_broadcast_cancel" }));
  await seedFixtures(c);
  await sql(c, `
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into auth.users (id, email) values ('${SUPPORT}', 'support@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${SUPPORT}', 'support', 'support@test'), ('${FINANCE}', 'finance', 'finance@test');
  `);
});
after(async () => { await c.end(); });

test("a broadcast lists with what is still waiting, and a claimed row does not count as waiting", async () => {
  await row(BATCH, "queued");
  await row(BATCH, "queued", { business: ids.bizB, channel: "email" });
  await row(BATCH, "sent");
  await row(BATCH, "failed");
  await row(BATCH, "queued", { claimed: new Date().toISOString() });
  const list = (await call(asSupport, `select public.admin_pending_broadcasts() as r`)).r;
  const batch = list.find((b) => b.batch_id === BATCH);
  assert.equal(batch.pending, 2);
  assert.equal(batch.sent, 1);
  assert.equal(batch.total, 5);
  assert.equal(batch.recipients, 2);
  assert.deepEqual(batch.channels, ["email", "sms"]);
  assert.equal(batch.subject, "Weekend offer");
});

test("cancelling takes only queued rows nobody has claimed, and reports what already went", async () => {
  const out = (await call(asSupport, `select public.admin_cancel_broadcast($1, $2) as r`, [BATCH, "Wrong audience"])).r;
  assert.deepEqual(out, { cancelled: 2, sent: 1, failed: 1, inFlight: 1, total: 5 });
  const rows = await sql(c, `select status, claimed_at is not null as claimed from public.messages where batch_id = $1 order by status`, [BATCH]);
  assert.deepEqual(rows.map((r) => r.status).sort(), ["cancelled", "cancelled", "failed", "queued", "sent"]);
  assert.equal(rows.find((r) => r.status === "queued").claimed, true, "the claimed row is left to the dispatcher");

  const [entry] = await audits();
  assert.deepEqual(entry.before, { pending: 3 });
  assert.deepEqual(entry.after, { cancelled: 2, sent: 1, failed: 1, in_flight: 1, total: 5 });
  assert.equal(entry.reason, "Wrong audience");
});

test("cancelling again changes nothing and writes no second audit entry", async () => {
  const out = (await call(asAdmin, `select public.admin_cancel_broadcast($1) as r`, [BATCH])).r;
  assert.equal(out.cancelled, 0);
  assert.equal((await audits()).length, 1);
  assert.equal((await call(asSupport, `select public.admin_pending_broadcasts() as r`)).r.some((b) => b.batch_id === BATCH), false);
});

test("other broadcasts are untouched, and bad input has stable codes", async () => {
  const keep = await row(OTHER, "queued");
  await call(asSupport, `select public.admin_cancel_broadcast($1) as r`, [BATCH]);
  assert.equal(await statusOf(keep), "queued");
  await rejects(asFinance, `select public.admin_cancel_broadcast($1)`, [BATCH], /forbidden/);
  await rejects(asA, `select public.admin_cancel_broadcast($1)`, [BATCH], /forbidden/);
  await rejects(asFinance, `select public.admin_pending_broadcasts()`, [], /forbidden/);
  await rejects(asAdmin, `select public.admin_cancel_broadcast(null)`, [], /invalid_input/);
  await rejects(asAdmin, `select public.admin_cancel_broadcast($1)`, ["aaaaaaaa-0000-4000-8000-0000000000ff"], /broadcast_not_found/);
});

test("the dispatcher never claims a cancelled row, and claiming marks the row so it can no longer be cancelled", async () => {
  const due = await row(OTHER, "queued", { at: new Date(Date.now() - 60_000).toISOString(), transactional: true });
  const gone = await row(OTHER, "cancelled", { at: new Date(Date.now() - 60_000).toISOString() });
  const claimed = await call(asService, `select count(*)::int as n from public.claim_due_messages(now(), 50, 300) where id = $1`, [gone]);
  assert.equal(claimed.n, 0);
  const mine = await call(asService, `select count(*)::int as n from public.claim_due_messages(now(), 50, 300) where id = $1`, [due]);
  assert.equal(mine.n, 0, "already leased by the first call above");
  assert.ok((await sql(c, `select claimed_at from public.messages where id = $1`, [due]))[0].claimed_at);
  const out = (await call(asSupport, `select public.admin_cancel_broadcast($1) as r`, [OTHER])).r;
  assert.equal(out.inFlight >= 1, true);
  assert.equal(await statusOf(due), "queued");
});

test("a seller cannot see a cancelled in-app message", async () => {
  const id = await row("aaaaaaaa-0000-4000-8000-000000000003", "cancelled", { channel: "in_app" });
  const seen = await tx(c, asA, (k) => sql(k, `select id from public.messages where id = $1`, [id]));
  assert.equal(seen.length, 0);
});

test("older broadcasts are grouped from their idempotency key, and the migration can be run again", async () => {
  const key = "bbbbbbbb-0000-4000-8000-00000000000a";
  await sql(c, `insert into public.messages (business_id, channel, kind, subject, body, status, scheduled_at, dedupe_key, read_at)
                values ($1, 'sms', 'general', 'Old', 'Body', 'queued', now() + interval '1 day', $2, now())`, [ids.bizA, `admin:${key}:${ids.bizA}:sms`]);
  await sql(c, readFileSync(new URL("../migrations/0068_broadcast_cancel.sql", import.meta.url), "utf8"));
  const [old] = await sql(c, `select batch_id from public.messages where dedupe_key = $1`, [`admin:${key}:${ids.bizA}:sms`]);
  assert.equal(old.batch_id, key);
});
