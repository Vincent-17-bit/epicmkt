// The messaging handlers against the real schema (migrations 0001-0021) instead of the fake database,
// so a wrong column name, a missing constraint or a changed RPC shows up here.
import nodeAssert from "node:assert/strict";
import { adminMessage } from "../functions/admin-message/handler.ts";
import { dispatchMessages } from "../functions/dispatch-messages/handler.ts";
import { dailyLifecycle } from "../functions/daily-lifecycle/handler.ts";
import { adminExport } from "../functions/admin-export/handler.ts";
import type { OutboundDeps, SendResult } from "../functions/_shared/outbound.ts";
import { createAdminDb, pgDeps } from "./pg-world.ts";

const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);

const ADMINS = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  support: "00000000-0000-4000-8000-0000000000a2",
  finance: "00000000-0000-4000-8000-0000000000a3",
};
const BIZ_A = "10000000-0000-4000-8000-0000000000a1";
const BIZ_B = "10000000-0000-4000-8000-0000000000b1";
const tokens = Object.fromEntries(Object.entries(ADMINS).map(([role, id]) => [`tok-${role}`, { id, email: `${role}@epicmkt.test` }]));

const DAY = "2026-10-14T06:30:00Z"; // 09:30 Nairobi
const NIGHT = "2026-10-14T19:30:00Z"; // 22:30 Nairobi, inside quiet hours

const client = await createAdminDb("epicmkt_messaging_fn");
const w = pgDeps(client, tokens);
const q = async (sql: string, params: unknown[] = []): Promise<any[]> => (await client.query(sql, params)).rows;

let now = new Date(DAY);
let smsResult: () => SendResult = () => ({ ok: true, providerId: "at-1", cost: 0.8 });
const sentSms: string[] = [];
const sentEmail: string[] = [];
const deps = (over: Partial<OutboundDeps> = {}): OutboundDeps => ({
  db: w.deps.db,
  cronSecret: "s3cret",
  dev: false,
  now: () => now,
  sendSms: (to) => (sentSms.push(to), Promise.resolve(smsResult())),
  sendEmail: (to) => (sentEmail.push(to), Promise.resolve({ ok: true, providerId: "em-1" } as SendResult)),
  ...over,
});

const post = (body: unknown, headers: Record<string, string>) =>
  new Request("http://x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const as = (role: keyof typeof ADMINS) => ({ authorization: `Bearer tok-${role}` });
const cron = { "x-cron-secret": "s3cret" };

async function seed() {
  await client.query(`truncate public.messages, public.admin_notifications, public.audit_log, public.rate_limits, public.payments, public.businesses, public.admins, public.categories, public.message_templates cascade`);
  await client.query(`truncate auth.users cascade`);
  sentSms.length = 0;
  sentEmail.length = 0;
  now = new Date(DAY);
  smsResult = () => ({ ok: true, providerId: "at-1", cost: 0.8 });
  for (const [role, id] of Object.entries(ADMINS)) {
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${role}@epicmkt.test`]);
    await client.query(`insert into public.admins (user_id, role) values ($1, $2)`, [id, role]);
  }
  await client.query(`insert into public.categories (id, name, grp, tier, sort) values ('barber', 'Barber', 'Beauty', 'A', 1)`);
  await client.query(`insert into public.plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ('barber', 'standard', 500, 3, '["a","b","c"]')`);
  await client.query(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-00000000b001', 'a@test'), ('00000000-0000-4000-8000-00000000b002', 'b@test')`);
  await client.query(
    `insert into public.businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone, email, paid_until) values
       ($1, 'ES100001', '00000000-0000-4000-8000-00000000b001', 'shop-a', 'Shop A', 'barber', 'standard', 'live', '+254712345678', 'a@x.test', '2026-10-21T07:00:00Z'),
       ($2, 'ES100002', '00000000-0000-4000-8000-00000000b002', 'shop-b', 'Shop B', 'barber', 'standard', 'live', '+254722345678', null, '2026-11-30T07:00:00Z')`,
    [BIZ_A, BIZ_B],
  );
  await client.query(
    `insert into public.message_templates (key, channel, subject, body_en, transactional) values
       ('renewal.sms', 'sms', null, 'Hi {{business_name}}, your listing runs to {{paid_until}}.', true),
       ('promo.sms', 'sms', null, 'Hi {{business_name}}, new offers this week.', false)`,
  );
}

Deno.test("real schema: admin-message queues the right rows, honours the template flag and audits", async () => {
  await seed();
  const run = adminMessage(deps());

  // finance may not send
  assertEquals((await run(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true }, body: "x" }, as("finance")))).status, 403);

  const r = await run(post({ target: { businessIds: [BIZ_A, BIZ_B] }, channels: { sms: true, email: true, inApp: true }, templateKey: "renewal.sms" }, as("support")));
  // a template is bound to its channel: sms template on email/in-app is refused
  assertEquals(r.status, 422);

  const sms = await run(post({ target: { businessIds: [BIZ_A, BIZ_B] }, channels: { sms: true }, templateKey: "renewal.sms" }, as("support")));
  assertEquals(sms.status, 200);
  const body = await sms.json();
  assertEquals(body.queued, 2);
  assertEquals(body.transactional, true);

  const promo = await run(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true, email: true, inApp: true }, body: "Hello {{business_name}}", subject: "Hi" }, as("owner")));
  assertEquals(promo.status, 200);
  assertEquals((await promo.json()).transactional, false);

  const rows = await q(`select channel, status, transactional, business_id, provider_id from public.messages order by created_at, channel`);
  assertEquals(rows.length, 5);
  const inApp = rows.find((x) => x.channel === "in_app");
  assertEquals([inApp.status, inApp.provider_id], ["delivered", "in_app"]);
  assert(rows.filter((x) => x.channel === "sms" && x.transactional).length === 2);

  const audit = await q(`select action, actor_role, target_type from public.audit_log order by created_at`);
  assertEquals(audit.map((a) => a.action), ["message.queue", "message.queue"]);
  assertEquals(audit[0].target_type, "message_batch");

  // the seller sees only their own delivered in-app message
  const own = await q(`select count(*)::int n from public.messages where business_id = $1 and channel = 'in_app' and status in ('sent','delivered')`, [BIZ_A]);
  assertEquals(own[0].n, 1);
});

Deno.test("real schema: quiet hours delay promotional SMS but not transactional ones", async () => {
  await seed();
  now = new Date(NIGHT);
  const run = adminMessage(deps());
  await run(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true }, templateKey: "promo.sms" }, as("owner")));
  await run(post({ target: { businessIds: [BIZ_B] }, channels: { sms: true }, templateKey: "renewal.sms" }, as("owner")));

  const res = await (await dispatchMessages(deps())(post({}, cron))).json();
  assertEquals(res.sent, 1); // only the transactional one
  assertEquals(sentSms, ["+254722345678"]);

  const held = await q(`select status, scheduled_at from public.messages where business_id = $1`, [BIZ_A]);
  assertEquals(held[0].status, "queued");
  assertEquals(new Date(held[0].scheduled_at).toISOString(), "2026-10-15T04:00:00.000Z"); // 07:00 Nairobi

  // the next morning it goes out
  now = new Date("2026-10-15T04:01:00Z");
  const next = await (await dispatchMessages(deps())(post({}, cron))).json();
  assertEquals(next.sent, 1);
  assertEquals(sentSms.length, 2);
});

Deno.test("real schema: dev mode sends nothing and records provider_id 'dev'", async () => {
  await seed();
  await adminMessage(deps())(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true, email: true }, body: "Hello", subject: "S", transactional: true }, as("owner")));
  const res = await (await dispatchMessages(deps({ dev: true }))(post({}, cron))).json();
  assertEquals([res.dev, res.sent], [true, 2]);
  assertEquals([sentSms.length, sentEmail.length], [0, 0]);
  const rows = await q(`select status, provider_id, attempts from public.messages order by channel`);
  assertEquals(rows.map((r) => [r.status, r.provider_id, r.attempts]), [["sent", "dev", 1], ["sent", "dev", 1]]);
});

Deno.test("real schema: a failing message gets 3 attempts, then 'failed' and one admin notification", async () => {
  await seed();
  smsResult = () => ({ ok: false, error: "sms_http_500" });
  await adminMessage(deps())(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true }, body: "Hello", transactional: true }, as("owner")));

  const at = async (iso: string) => {
    now = new Date(iso);
    return await (await dispatchMessages(deps())(post({}, cron))).json();
  };
  assertEquals((await at(DAY)).retried, 1);
  assertEquals((await at("2026-10-14T06:31:00Z")).claimed, 0); // backoff: not due for 5 minutes
  assertEquals((await at("2026-10-14T06:36:00Z")).retried, 1);
  assertEquals((await at("2026-10-14T06:52:00Z")).failed, 1);

  const m = (await q(`select status, attempts, error from public.messages`))[0];
  assertEquals([m.status, m.attempts, m.error], ["failed", 3, "sms_http_500"]);
  const notes = await q(`select kind, data from public.admin_notifications`);
  assertEquals(notes.length, 1);
  assertEquals(notes[0].kind, "message_failed");
  assertEquals((await at("2026-10-14T07:30:00Z")).claimed, 0); // nothing more is attempted
});

Deno.test("real schema: reminders at 7, 3 and 1 days are created once through dedupe_key", async () => {
  await seed();
  const run = dailyLifecycle(deps());
  const first = await (await run(post({}, cron))).json();
  const again = await (await run(post({}, cron))).json();
  assertEquals(first.queued, 2); // Shop A: 7 days left, SMS and email copy
  assertEquals(again.queued, 0);

  const keys = await q(`select dedupe_key from public.messages where channel in ('sms', 'email') order by dedupe_key`);
  assertEquals(keys.map((k) => k.dedupe_key), ["reminder:7:2026-10-21:email", "reminder:7:2026-10-21:sms"]);

  for (const [iso, days] of [["2026-10-18T06:30:00Z", 3], ["2026-10-20T06:30:00Z", 1]] as const) {
    now = new Date(iso);
    const r = await (await run(post({}, cron))).json();
    assertEquals(r.queued, 2);
    assertEquals((await (await run(post({}, cron))).json()).queued, 0);
    const k = await q(`select 1 from public.messages where dedupe_key = $1`, [`reminder:${days}:2026-10-21:sms`]);
    assertEquals(k.length, 1);
  }
  const audited = await q(`select actor_role from public.audit_log where action = 'lifecycle.daily'`);
  assert(audited.length === 6 && audited.every((a) => a.actor_role === "system"));
});

Deno.test("real schema: admin-export honours roles, audits, and the allow-listed columns exist", async () => {
  await seed();
  await client.query(
    `insert into public.payments (business_id, amount_kes, kind, status, mpesa_code) values ($1, 500, 'renewal', 'confirmed', 'QWE1234567')`,
    [BIZ_A],
  );
  await client.query(`update public.businesses set name = '=HYPERLINK(\"http://evil\")' where id = $1`, [BIZ_A]);
  const run = adminExport(deps({ now: () => new Date("2026-10-14T06:30:00Z") }));
  assertEquals((await run(post({ dataset: "payments" }, as("support")))).status, 403);

  const csv = await run(post({ dataset: "payments", format: "csv" }, as("finance")));
  assertEquals(csv.status, 200);
  const text = await csv.text();
  assert(text.includes("mpesa_code") && text.includes("QWE1234567"));

  const biz = await (await run(post({ dataset: "businesses", format: "csv" }, as("owner")))).text();
  assert(biz.includes(`"'=HYPERLINK(""http://evil"")"`), "formula cell neutralised");

  for (const dataset of ["messages", "audit"] as const) {
    const r = await run(post({ dataset, format: "json" }, as("owner")));
    assertEquals(r.status, 200);
  }
  const audit = await q(`select action, target_type, actor_email from public.audit_log where action = 'export.run' order by created_at`);
  assertEquals(audit.map((a) => a.target_type), ["payments", "businesses", "messages", "audit"]);
  assertEquals(audit[0].actor_email, "finance@epicmkt.test");
});

Deno.test("real schema: a hand-run dispatch writes one 'dispatch.run' audit row; a cron run writes none", async () => {
  await seed();
  const queue = () =>
    adminMessage(deps())(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true }, body: "Hello", transactional: true }, as("owner")));
  await queue();
  const afterQueue = (await q(`select count(*)::int n from public.audit_log`))[0].n;

  assertEquals((await (await dispatchMessages(deps())(post({}, cron))).json()).sent, 1);
  assertEquals((await q(`select count(*)::int n from public.audit_log where action = 'dispatch.run'`))[0].n, 0);
  assertEquals((await q(`select count(*)::int n from public.audit_log`))[0].n, afterQueue);

  await queue();
  const res = await dispatchMessages(deps())(post({ limit: 25 }, as("support")));
  assertEquals(res.status, 200);
  const rows = await q(`select actor_role, actor_email, target_type, after from public.audit_log where action = 'dispatch.run'`);
  assertEquals(rows.length, 1);
  assertEquals([rows[0].actor_role, rows[0].actor_email, rows[0].target_type], ["admin", "support@epicmkt.test", "system"]);
  assertEquals([rows[0].after.limit, rows[0].after.claimed, rows[0].after.sent, rows[0].after.failed], [25, 1, 1, 0]);

  // finance may not run it, and a refused caller leaves no audit row
  assertEquals((await dispatchMessages(deps())(post({}, as("finance")))).status, 403);
  assertEquals((await q(`select count(*)::int n from public.audit_log where action = 'dispatch.run'`))[0].n, 1);
});

Deno.test("real schema: the limits hold per admin and per action; cron is never limited", async () => {
  await seed();
  const dispatch = dispatchMessages(deps());
  const status = async (headers: Record<string, string>) => (await dispatch(post({}, headers))).status;

  // dispatch-messages: 10 a minute per admin
  for (let i = 0; i < 10; i++) assertEquals(await status(as("owner")), 200, `owner call ${i + 1}`);
  const over = await dispatch(post({}, as("owner")));
  assertEquals(over.status, 429);
  assertEquals(await over.json(), { error: "rate_limited", retryAfter: 60 });
  assertEquals(await status(as("support")), 200, "another admin has their own bucket");
  assertEquals((await adminMessage(deps())(post({ target: { businessIds: [BIZ_A] }, channels: { sms: true }, body: "x" }, as("owner")))).status, 200, "another action has its own bucket");
  for (let i = 0; i < 15; i++) assertEquals(await status(cron), 200, `cron call ${i + 1}`);

  // daily-lifecycle: 5 an hour
  const lifecycle = dailyLifecycle(deps());
  for (let i = 0; i < 5; i++) assertEquals((await lifecycle(post({}, as("owner")))).status, 200, `lifecycle call ${i + 1}`);
  const lim = await lifecycle(post({}, as("owner")));
  assertEquals([lim.status, (await lim.json()).retryAfter], [429, 3600]);
  assertEquals((await lifecycle(post({}, cron))).status, 200);

  // one bucket per admin and action; cron left none behind
  const keys = (await q(`select key from public.rate_limits where key like 'admin:%' order by key`)).map((r) => r.key);
  assertEquals(keys, [
    `admin:dispatch:${ADMINS.owner}`,
    `admin:dispatch:${ADMINS.support}`,
    `admin:lifecycle:${ADMINS.owner}`,
    `admin:message:${ADMINS.owner}`,
  ]);
});

Deno.test("close", async () => {
  await client.end();
});
