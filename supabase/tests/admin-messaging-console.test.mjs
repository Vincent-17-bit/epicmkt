import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0025_admin_messaging_console.sql: the message log, retrying, templates, and the automation controls.
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const asSupport = { sub: SUPPORT };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const m = (n) => `60000000-0000-0000-0000-00000000000${n}`;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0025" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test'), ('${SUPPORT}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'),
      ('${FINANCE}', 'finance', 'finance@test'), ('${SUPPORT}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
    insert into messages (id, business_id, channel, kind, subject, body, status, to_address, template_key, attempts, error, cost_kes, sent_at, scheduled_at) values
      ('${m(1)}', '${ids.bizA}', 'sms', 'reminder', 'Renew soon', 'Hello Shop A', 'sent', '+254712345678', 'renew_7d', 1, null, 0.8, now(), now() - interval '1 hour'),
      ('${m(2)}', '${ids.bizB}', 'sms', 'general', 'Offer', 'Hello Shop B', 'failed', '+254722345678', null, 3, 'provider_down', null, null, now() - interval '1 hour'),
      ('${m(3)}', '${ids.bizA}', 'email', 'general', 'Newsletter', 'Hi', 'queued', 'a@shop.test', null, 0, null, null, null, now() - interval '10 minutes'),
      ('${m(4)}', '${ids.bizA}', 'email', 'general', 'Later', 'Hi', 'queued', 'a@shop.test', null, 0, null, null, null, now() + interval '2 days');
    insert into messages (business_id, channel, kind, subject, body, sender, status) values ('${ids.bizA}', 'in_app', 'general', 'Seller question', 'Help', 'seller', 'sent');
    insert into message_templates (key, channel, subject, body_en, transactional) values ('renew_7d', 'sms', null, 'Hi {{business_name}}, you expire on {{paid_until}}.', true);
  `);
});
after(async () => { await c.end(); });

test("the log shows delivery records for owner, reviewer and support, never the seller's own messages", async () => {
  for (const who of [asAdmin, asReviewer, asSupport]) {
    const r = await call(who, `select admin_message_log_query() as r`);
    assert.equal(r.total, 4, "seller-authored messages are conversations, not delivery records");
    assert.ok(r.rows.every((x) => x.business_name));
  }
  assert.equal((await call(asAdmin, `select admin_message_log_query('sms') as r`)).total, 2);
  assert.equal((await call(asAdmin, `select admin_message_log_query('all', 'failed') as r`)).rows[0].error, "provider_down");
  assert.equal((await call(asAdmin, `select admin_message_log_query('all', 'all', 'renew_7d') as r`)).total, 1);
  assert.equal((await call(asAdmin, `select admin_message_log_query('all', 'all', 'shop b') as r`)).total, 1);
  await rejects(c, asFinance, `select admin_message_log_query()`, [], /forbidden/);
  await rejects(c, asA, `select admin_message_summary()`, [], /forbidden/);
  await rejects(c, asAdmin, `select admin_message_log_query('fax')`, [], /invalid_channel/);
  await rejects(c, asAdmin, `select admin_message_log_query('all', 'lost')`, [], /invalid_status/);
});

test("the summary counts statuses, cost, what is due now and what failed", async () => {
  const s = await call(asSupport, `select admin_message_summary(7) as r`);
  assert.deepEqual(s.by_status, { sent: 1, failed: 1, queued: 2 });
  assert.equal(Number(s.cost_kes), 0.8);
  assert.equal(s.queued_now, 2);
  assert.equal(s.due_now, 1, "the message scheduled for in two days is not due");
  assert.equal(s.failed_now, 1);
  assert.ok(s.oldest_due_at);
});

test("retrying puts a failed message back in the queue, audited; only failed ones can be retried", async () => {
  await call(asSupport, `select admin_retry_message($1) as r`, [m(2)]);
  const [row] = await sql(c, `select status, attempts, error from messages where id = '${m(2)}'`);
  assert.deepEqual(row, { status: "queued", attempts: 0, error: null });
  const [{ n }] = await sql(c, `select count(*)::int as n from audit_log where action = 'message.retry' and target_id = '${m(2)}'`);
  assert.equal(n, 1);
  await rejects(c, asSupport, `select admin_retry_message($1)`, [m(2)], /not_failed/);
  await rejects(c, asSupport, `select admin_retry_message($1)`, ["99999999-0000-0000-0000-000000000000"], /not_found/);
  await rejects(c, asFinance, `select admin_retry_message($1)`, [m(1)], /forbidden/);
});

test("retry all failed re-queues them in one audited step", async () => {
  await sql(c, `update messages set status = 'failed', attempts = 3, error = 'x' where id in ('${m(2)}', '${m(3)}')`);
  assert.equal(await call(asReviewer, `select admin_retry_failed_messages(7) as r`), 2);
  assert.equal(await call(asReviewer, `select admin_retry_failed_messages(7) as r`), 0);
  const [{ n }] = await sql(c, `select count(*)::int as n from audit_log where action = 'message.retry_failed'`);
  assert.equal(n, 1, "an empty run writes nothing");
  await rejects(c, asFinance, `select admin_retry_failed_messages()`, [], /forbidden/);
});

test("any admin reads templates with 30-day usage; only the owner saves them", async () => {
  const list = await call(asFinance, `select admin_templates_list() as r`);
  assert.equal(list[0].key, "renew_7d");
  assert.equal(list[0].used_30d, 1);
  await rejects(c, asReviewer, `select admin_save_template('promo', 'sms', null, 'Hello')`, [], /forbidden/);
  await rejects(c, asA, `select admin_templates_list()`, [], /forbidden/);
});

test("saving a template validates it, bumps the version and keeps the audit trail", async () => {
  assert.equal(await call(asAdmin, `select admin_save_template('promo_offer', 'sms', null, 'Hi {{business_name}}, new offer!', 'Habari {{business_name}}', false) as r`), 1);
  assert.equal(await call(asAdmin, `select admin_save_template('promo_offer', 'sms', null, 'Hi {{business_name}}, bigger offer!', null, false) as r`), 2);
  const [t] = await sql(c, `select version, body_en, body_sw from message_templates where key = 'promo_offer'`);
  assert.deepEqual(t, { version: 2, body_en: "Hi {{business_name}}, bigger offer!", body_sw: null });
  const rows = await sql(c, `select action from audit_log where target_id = 'promo_offer' order by id`);
  assert.deepEqual(rows.map((r) => r.action), ["template.create", "template.update"]);
  await rejects(c, asAdmin, `select admin_save_template('Bad Key', 'sms', null, 'x')`, [], /invalid_key/);
  await rejects(c, asAdmin, `select admin_save_template('ok_key', 'fax', null, 'x')`, [], /invalid_channel/);
  await rejects(c, asAdmin, `select admin_save_template('ok_key', 'sms', null, '')`, [], /invalid_input/);
  await rejects(c, asAdmin, `select admin_save_template('ok_key', 'sms', null, repeat('a', 613))`, [], /sms_too_long/);
  await rejects(c, asAdmin, `select admin_save_template('ok_key', 'email', null, 'Body')`, [], /subject_required/);
  await rejects(c, asAdmin, `select admin_save_template('promo_offer', 'email', 'Subject', 'Body')`, [], /channel_locked/);
});

test("automation status says plainly when pg_cron is not installed, and the controls refuse", async () => {
  const s = await call(asSupport, `select admin_automation_status() as r`);
  assert.equal(s.cron_installed, false);
  assert.deepEqual(s.jobs, []);
  assert.deepEqual(s.expected, ["dispatch-messages", "daily-lifecycle"]);
  assert.equal(typeof s.queue.queued, "number");
  await rejects(c, asAdmin, `select admin_set_job_active('dispatch-messages', false)`, [], /cron_not_installed/);
  await rejects(c, asAdmin, `select admin_run_job('dispatch-messages')`, [], /automation_not_configured/);
  await rejects(c, asA, `select admin_automation_status()`, [], /forbidden/);
});

test("with pg_cron present the status lists the jobs and their last run; pausing is owner-only and audited", async () => {
  await sql(c, `
    create schema if not exists cron;
    create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, active boolean default true);
    create table cron.job_run_details (runid bigserial primary key, jobid bigint, status text, start_time timestamptz, end_time timestamptz, return_message text);
    create function cron.alter_job(job_id bigint, active boolean default null) returns void language sql as $$ update cron.job set active = coalesce(alter_job.active, job.active) where jobid = job_id $$;
    insert into cron.job (jobname, schedule) values ('dispatch-messages', '* * * * *'), ('daily-lifecycle', '0 4 * * *'), ('unrelated', '0 0 * * *');
    insert into cron.job_run_details (jobid, status, start_time, end_time, return_message) values
      (1, 'failed', now() - interval '5 minutes', now() - interval '5 minutes', 'old'), (1, 'succeeded', now() - interval '1 minute', now(), '1 row');
  `);
  const s = await call(asReviewer, `select admin_automation_status() as r`);
  assert.equal(s.cron_installed, true);
  assert.deepEqual(s.jobs.map((j) => j.name), ["daily-lifecycle", "dispatch-messages"], "only this app's jobs are shown");
  const dispatch = s.jobs.find((j) => j.name === "dispatch-messages");
  assert.equal(dispatch.active, true);
  assert.equal(dispatch.last_run.status, "succeeded", "the latest run, not the first");
  assert.equal(s.jobs.find((j) => j.name === "daily-lifecycle").last_run, null);

  await rejects(c, asReviewer, `select admin_set_job_active('dispatch-messages', false)`, [], /forbidden/);
  await rejects(c, asAdmin, `select admin_set_job_active('unrelated', false)`, [], /unknown_job/);
  await call(asAdmin, `select admin_set_job_active('dispatch-messages', false) as r`);
  assert.equal((await sql(c, `select active from cron.job where jobname = 'dispatch-messages'`))[0].active, false);
  await call(asAdmin, `select admin_set_job_active('dispatch-messages', false) as r`); // no change: no second audit row
  await call(asAdmin, `select admin_set_job_active('dispatch-messages', true) as r`);
  const rows = await sql(c, `select action from audit_log where target_type = 'job' order by id`);
  assert.deepEqual(rows.map((r) => r.action), ["job.pause", "job.resume"]);
  await sql(c, `delete from cron.job where jobname = 'daily-lifecycle'`);
  await rejects(c, asAdmin, `select admin_set_job_active('daily-lifecycle', true)`, [], /job_not_scheduled/);
});

test("run now posts to the function URL with the cron secret, and only the owner may", async () => {
  await sql(c, `
    create schema if not exists net; create schema if not exists vault;
    create table net.calls (id bigserial primary key, url text, headers jsonb, body jsonb);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds integer default 5000)
      returns bigint language sql as $$ insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
  `);
  await rejects(c, asAdmin, `select admin_run_job('dispatch-messages')`, [], /automation_not_configured/); // no secrets stored yet
  await sql(c, `insert into vault.decrypted_secrets values ('project_url', 'https://abc.supabase.co'), ('cron_secret', 's3cret')`);
  const id = await call(asAdmin, `select admin_run_job('dispatch-messages') as r`);
  assert.ok(Number(id) > 0);
  const [call1] = await sql(c, `select url, headers from net.calls`);
  assert.equal(call1.url, "https://abc.supabase.co/functions/v1/dispatch-messages");
  assert.equal(call1.headers["x-cron-secret"], "s3cret");
  await rejects(c, asReviewer, `select admin_run_job('dispatch-messages')`, [], /forbidden/);
  await rejects(c, asAdmin, `select admin_run_job('drop-everything')`, [], /unknown_job/);
});
