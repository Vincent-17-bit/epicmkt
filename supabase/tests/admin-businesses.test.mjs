import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const U = {
  owner: ids.admin,
  reviewer: "00000000-0000-0000-0000-0000000000c1",
  finance: "00000000-0000-0000-0000-0000000000c2",
  support: "00000000-0000-0000-0000-0000000000c3",
};
const as = (role) => ({ sub: U[role] });
const call = (who, text, params) => tx(c, who, async (k) => (await k.query(text, params)).rows[0]);
const callCommit = (who, text, params) => tx(c, who, async (k) => (await k.query(text, params)).rows[0], { commit: true });

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values
      ('${U.reviewer}', 'reviewer@test'), ('${U.finance}', 'finance@test'), ('${U.support}', 'support@test');
    insert into public.admins (user_id, role, email) values
      ('${U.reviewer}', 'reviewer', 'reviewer@test'), ('${U.finance}', 'finance', 'finance@test'), ('${U.support}', 'support', 'support@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    update public.businesses set paid_until = public.nairobi_midnight(public.nairobi_today() + 20) where id = '${ids.bizA}';
    update public.businesses set paid_until = public.nairobi_midnight(public.nairobi_today() + 3) where id = '${ids.bizB}';
  `);
});

after(async () => { await c?.end(); });

test("every new function refuses a non-admin", async () => {
  await rejects(c, asA, `select public.admin_list_businesses()`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_business_detail('${ids.bizA}')`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_business_tab('${ids.bizA}', 'notes')`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_suspend_business('${ids.bizA}', 'because')`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_message_business('${ids.bizA}', 's', 'b')`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_add_business_note('${ids.bizA}', 'hi')`, [], /forbidden/);
  await rejects(c, asA, `select public.admin_bulk_businesses(array['${ids.bizA}']::uuid[], 'suspend', 'because')`, [], /forbidden/);
  // RLS: a seller reads zero notes, never an error that would confirm the table's contents.
  assert.equal((await tx(c, asA, async (k) => (await k.query(`select count(*)::int as n from public.business_notes`)).rows[0])).n, 0);
});

test("admin_business_apply is not callable from the browser", async () => {
  await rejects(c, as("owner"), `select public.admin_business_apply('${ids.bizA}', 'suspend', 'because')`, [], /permission denied/);
});

test("customer visibility: the reason always agrees with business_is_visible", async () => {
  const states = [
    ["live", "now() + interval '10 days'", "visible"],
    ["live", "now() - interval '1 day'", "grace"],
    ["live", "now() - interval '5 days'", "expired"],
    ["live", "null", "unpaid"],
    ["paused", "now() + interval '10 days'", "paused"],
    ["suspended", "now() + interval '10 days'", "suspended"],
    ["pending", "null", "pending"],
    ["expired", "now() - interval '9 days'", "expired"],
  ];
  for (const [status, paid, code] of states) {
    const row = (await sql(c, `
      select public.business_is_visible(b) as v, public.business_visibility(b) as vis
        from (select b.* from public.businesses b where id = '${ids.bizA}') b`))[0];
    void row;
    await sql(c, `update public.businesses set status = '${status}', paid_until = ${paid}, deleted_at = null where id = '${ids.bizA}'`);
    const r = (await sql(c, `select public.business_is_visible(b) as v, public.business_visibility(b) as vis from public.businesses b where id = '${ids.bizA}'`))[0];
    assert.equal(r.vis.code, code, `${status}/${paid}`);
    assert.equal(r.vis.visible, r.v, `verdict matches business_is_visible for ${code}`);
    assert.equal(r.vis.visible, code === "visible" || code === "grace", code);
    assert.ok(r.vis.reason.length > 10);
  }
  await sql(c, `update public.businesses set status = 'deleted', deleted_at = now() where id = '${ids.bizA}'`);
  const del = (await sql(c, `select public.business_visibility(b) as vis from public.businesses b where id = '${ids.bizA}'`))[0];
  assert.equal(del.vis.code, "deleted");
  assert.equal(del.vis.visible, false);
  await sql(c, `update public.businesses set status = 'live', deleted_at = null, status_reason = null, paid_until = public.nairobi_midnight(public.nairobi_today() + 20) where id = '${ids.bizA}'`);
});

test("list: tabs, counts, search, sort and invalid input", async () => {
  const all = (await call(as("support"), `select public.admin_list_businesses() as r`)).r;
  assert.equal(all.total, 2);
  assert.equal(all.counts.all, 2);
  assert.equal(all.counts.live, 2);
  assert.equal(all.counts.expiring, 1);
  const exp = (await call(as("support"), `select public.admin_list_businesses('expiring') as r`)).r;
  assert.deepEqual(exp.rows.map((r) => r.seller_id), ["ES100002"]);
  const q = (await call(as("support"), `select public.admin_list_businesses('all', 'shop a') as r`)).r;
  assert.deepEqual(q.rows.map((r) => r.slug), ["shop-a"]);
  const wild = (await call(as("support"), `select public.admin_list_businesses('all', '%') as r`)).r;
  assert.equal(wild.total, 0, "% is escaped, not a wildcard");
  const sorted = (await call(as("support"), `select public.admin_list_businesses('all', null, '{}', 'paid_until', 'asc') as r`)).r;
  assert.equal(sorted.rows[0].seller_id, "ES100002");
  const plan = (await call(as("support"), `select public.admin_list_businesses('all', null, '{"plan":"premium"}') as r`)).r;
  assert.equal(plan.total, 1);
  assert.ok(typeof all.rows[0].health === "number");
  assert.ok(all.rows[0].visibility.reason);
  await rejects(c, as("support"), `select public.admin_list_businesses('nope')`, [], /invalid_tab/);
  await rejects(c, as("support"), `select public.admin_list_businesses('all', null, '{}', 'name; drop table businesses', 'asc')`, [], /invalid_sort/);
  // an injected filter value is a literal, never SQL
  const inj = (await call(as("support"), `select public.admin_list_businesses('all', null, $1::jsonb) as r`, [JSON.stringify({ town: "x'; drop table public.businesses; --" })])).r;
  assert.equal(inj.total, 0);
  assert.equal((await sql(c, `select count(*)::int as n from public.businesses`))[0].n, 2);
});

test("detail: returns the business and counts, never an application's private fields", async () => {
  const r = (await call(as("support"), `select public.admin_business_detail('${ids.bizA}') as r`)).r;
  assert.equal(r.business.slug, "shop-a");
  assert.equal(r.listing_state, "active");
  assert.equal(r.visibility.visible, true);
  assert.equal(typeof r.health, "number");
  assert.ok("open_flags" in r.counts);
  assert.equal(JSON.stringify(r).includes("kra"), false);
  await rejects(c, as("support"), `select public.admin_business_detail('10000000-0000-0000-0000-00000000ffff')`, [], /not_found/);
});

test("suspend needs a reason, the right role, and writes before/after to the audit log", async () => {
  await rejects(c, as("support"), `select public.admin_suspend_business('${ids.bizA}', '')`, [], /reason_required/);
  await rejects(c, as("support"), `select public.admin_suspend_business('${ids.bizA}', 'ab')`, [], /reason_required/);
  await rejects(c, as("finance"), `select public.admin_suspend_business('${ids.bizA}', 'fraud suspected')`, [], /forbidden/);
  const done = (await callCommit(as("support"), `select public.admin_suspend_business('${ids.bizA}', 'fraud suspected') as r`)).r;
  assert.equal(done.status, "suspended");
  assert.equal(done.status_reason, "fraud suspected");
  const log = (await sql(c, `select action, reason, before, after, actor_email from public.audit_log where action = 'business.suspend' order by id desc limit 1`))[0];
  assert.equal(log.reason, "fraud suspected");
  assert.equal(log.before.status, "live");
  assert.equal(log.after.status, "suspended");
  assert.equal(log.actor_email, "support@test");
  const vis = (await call(as("support"), `select public.admin_business_detail('${ids.bizA}') as r`)).r.visibility;
  assert.equal(vis.visible, false);
  assert.match(vis.reason, /fraud suspected/);
  await rejects(c, as("support"), `select public.admin_suspend_business('${ids.bizA}', 'again please')`, [], /invalid_status/);
  const back = (await callCommit(as("reviewer"), `select public.admin_unsuspend_business('${ids.bizA}', 'cleared after review') as r`)).r;
  assert.equal(back.status, "live");
  assert.equal(back.status_reason, null);
});

test("unlist, relist, verification, strikes, feature", async () => {
  assert.equal((await callCommit(as("support"), `select public.admin_unlist_business('${ids.bizA}', 'seller asked') as r`)).r.status, "paused");
  assert.equal((await callCommit(as("support"), `select public.admin_relist_business('${ids.bizA}') as r`)).r.status, "live");
  assert.equal((await callCommit(as("reviewer"), `select public.admin_set_business_verification('${ids.bizA}', 'verified', 'documents checked') as r`)).r.verification_level, "verified");
  await rejects(c, as("reviewer"), `select public.admin_set_business_verification('${ids.bizA}', 'gold', 'documents checked')`, [], /invalid_args/);
  assert.equal((await callCommit(as("reviewer"), `select public.admin_adjust_business_strikes('${ids.bizA}', 2, 'two valid reports') as r`)).r.strikes, 2);
  assert.equal((await callCommit(as("reviewer"), `select public.admin_adjust_business_strikes('${ids.bizA}', -3, 'reset') as r`)).r.strikes, 0, "never below zero");
  const f = (await callCommit(as("reviewer"), `select public.admin_feature_business('${ids.bizA}', true, now() + interval '7 days', 2) as r`)).r;
  assert.equal(f.featured, true);
  await rejects(c, as("reviewer"), `select public.admin_feature_business('${ids.bizA}', true, now() - interval '1 day', 2)`, [], /invalid_args/);
  const off = (await callCommit(as("reviewer"), `select public.admin_feature_business('${ids.bizA}', false) as r`)).r;
  assert.equal(off.featured, false);
  assert.equal(off.featured_until, null);
});

test("extend days: finance only, from the later of today and paid_until, expired comes back live", async () => {
  await rejects(c, as("support"), `select public.admin_extend_business('${ids.bizB}', 5, 'goodwill')`, [], /forbidden/);
  await rejects(c, as("finance"), `select public.admin_extend_business('${ids.bizB}', 0, 'goodwill')`, [], /invalid_args/);
  await rejects(c, as("finance"), `select public.admin_extend_business('${ids.bizB}', 5, '')`, [], /reason_required/);
  const before = (await sql(c, `select public.nairobi_day(paid_until)::text as d from public.businesses where id = '${ids.bizB}'`))[0].d;
  await callCommit(as("finance"), `select public.admin_extend_business('${ids.bizB}', 5, 'goodwill after outage')`);
  const after1 = (await sql(c, `select public.nairobi_day(paid_until)::text as d, public.nairobi_today() + 8 as want from public.businesses where id = '${ids.bizB}'`))[0];
  assert.notEqual(before, after1.d);
  assert.equal(after1.d, (await sql(c, `select (public.nairobi_today() + 8)::text as d`))[0].d, "3 days left + 5 = 8 days from today");
  await sql(c, `update public.businesses set status = 'expired', paid_until = now() - interval '30 days' where id = '${ids.bizB}'`);
  const back = (await callCommit(as("owner"), `select public.admin_extend_business('${ids.bizB}', 10, 'paid by cash, receipt pending') as r`)).r;
  assert.equal(back.status, "live");
  assert.equal((await sql(c, `select (public.nairobi_day(paid_until) = public.nairobi_today() + 10) as ok from public.businesses where id = '${ids.bizB}'`))[0].ok, true);
});

test("tags and agent assignment", async () => {
  const t = (await callCommit(as("support"), `select public.admin_tag_business('${ids.bizA}', array['VIP', ' vip ', 'north'], array[]::text[]) as r`)).r;
  assert.deepEqual(t.tags.sort(), ["north", "vip"]);
  const t2 = (await callCommit(as("support"), `select public.admin_tag_business('${ids.bizA}', array[]::text[], array['north']) as r`)).r;
  assert.deepEqual(t2.tags, ["vip"]);
  await rejects(c, as("support"), `select public.admin_tag_business('${ids.bizA}', array['a','b','c','d','e','f','g','h','i','j','k'], array[]::text[])`, [], /too_many_tags/);
  assert.equal((await callCommit(as("support"), `select public.admin_assign_business_agent('${ids.bizA}', '${U.reviewer}') as r`)).r.assigned_agent, U.reviewer);
  await rejects(c, as("support"), `select public.admin_assign_business_agent('${ids.bizA}', '${ids.userA}')`, [], /unknown_agent/);
  assert.equal((await callCommit(as("support"), `select public.admin_assign_business_agent('${ids.bizA}', null) as r`)).r.assigned_agent, null);
});

test("delete and restore: owner only, reason required, recycle bin tab, restore comes back unlisted", async () => {
  await rejects(c, as("support"), `select public.admin_delete_business('${ids.bizB}', 'duplicate listing')`, [], /forbidden/);
  await rejects(c, as("owner"), `select public.admin_delete_business('${ids.bizB}', '')`, [], /reason_required/);
  await callCommit(as("owner"), `select public.admin_delete_business('${ids.bizB}', 'duplicate listing')`);
  const bin = (await call(as("support"), `select public.admin_list_businesses('recycle') as r`)).r;
  assert.deepEqual(bin.rows.map((r) => r.seller_id), ["ES100002"]);
  assert.equal((await call(as("support"), `select public.admin_list_businesses('all') as r`)).r.total, 1);
  await rejects(c, as("owner"), `select public.admin_suspend_business('${ids.bizB}', 'cannot do this')`, [], /invalid_status/);
  const back = (await callCommit(as("owner"), `select public.admin_restore_business('${ids.bizB}', 'deleted by mistake') as r`)).r;
  assert.equal(back.status, "paused");
  assert.equal(back.deleted_at, null);
});

test("bulk: same rules per row, bad rows are skipped, a shared problem stops the batch", async () => {
  await sql(c, `update public.businesses set status = 'live', paid_until = public.nairobi_midnight(public.nairobi_today() + 9), status_reason = null, deleted_at = null`);
  await rejects(c, as("support"), `select public.admin_bulk_businesses(array['${ids.bizA}','${ids.bizB}']::uuid[], 'suspend', '')`, [], /reason_required/);
  await rejects(c, as("support"), `select public.admin_bulk_businesses(array[]::uuid[], 'suspend', 'because')`, [], /invalid_selection/);
  await rejects(c, as("support"), `select public.admin_bulk_businesses(array['${ids.bizA}']::uuid[], 'delete', 'because')`, [], /invalid_action/);
  const r = (await callCommit(as("support"), `select public.admin_bulk_businesses(array['${ids.bizA}','${ids.bizB}','10000000-0000-0000-0000-00000000ffff']::uuid[], 'suspend', 'policy breach') as r`)).r;
  assert.equal(r.done, 2);
  assert.equal(r.skipped.length, 1);
  assert.equal(r.skipped[0].error, "not_found");
  assert.equal((await sql(c, `select count(*)::int as n from public.audit_log where action = 'business.suspend'`))[0].n >= 2, true);
  await callCommit(as("support"), `select public.admin_bulk_businesses(array['${ids.bizA}','${ids.bizB}']::uuid[], 'unsuspend', 'reviewed') as r`);
});

test("messages: in-app, sms and email are queued correctly and validated", async () => {
  await sql(c, `update public.businesses set email = 'a@shop.test' where id = '${ids.bizA}'`);
  const r = (await callCommit(as("support"), `select public.admin_message_business('${ids.bizA}', 'Hello', 'Please update your hours', array['in_app','sms','email']) as r`)).r;
  assert.deepEqual(r.channels, ["in_app", "sms", "email"]);
  const rows = await sql(c, `select channel, status, to_address from public.messages where business_id = '${ids.bizA}' and template_key = 'admin_message' order by channel`);
  assert.deepEqual(rows.map((m) => [m.channel, m.status]), [["email", "queued"], ["in_app", "sent"], ["sms", "queued"]]);
  await rejects(c, as("support"), `select public.admin_message_business('${ids.bizA}', null, 'x', array['in_app'])`, [], /subject_required/);
  await rejects(c, as("support"), `select public.admin_message_business('${ids.bizA}', 's', 'x', array['pigeon'])`, [], /invalid_args/);
  await rejects(c, as("support"), `select public.admin_message_business('${ids.bizB}', 's', 'x', array['email'])`, [], /no_email/);
  await rejects(c, as("finance"), `select public.admin_message_business('${ids.bizA}', 's', 'x', array['in_app'])`, [], /forbidden/);
  // the seller sees only the in-app notice
  const seen = await tx(c, asA, async (k) => (await k.query(`select channel from public.messages where template_key = 'admin_message'`)).rows);
  assert.deepEqual(seen.map((m) => m.channel), ["in_app"]);
});

test("notes: add, pin, delete own, owner deletes any, sellers never see them", async () => {
  const n = (await callCommit(as("reviewer"), `select public.admin_add_business_note('${ids.bizA}', 'Called the owner, will fix photos', false) as r`)).r;
  await rejects(c, as("reviewer"), `select public.admin_add_business_note('${ids.bizA}', '   ')`, [], /invalid_args/);
  await callCommit(as("support"), `select public.admin_set_business_note_pinned('${n.id}', true)`);
  const tab = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'notes') as r`)).r;
  assert.equal(tab.length, 1);
  assert.equal(tab[0].pinned, true);
  assert.equal(tab[0].author_email, "reviewer@test");
  await rejects(c, as("support"), `select public.admin_delete_business_note('${n.id}')`, [], /forbidden/);
  assert.equal((await callCommit(as("owner"), `select public.admin_delete_business_note('${n.id}') as r`)).r, true);
  await callCommit(as("reviewer"), `select public.admin_add_business_note('${ids.bizA}', 'second') as r`);
  assert.equal((await tx(c, asA, async (k) => (await k.query(`select count(*)::int as n from public.business_notes`)).rows[0])).n, 0);
  assert.equal((await tx(c, as("support"), async (k) => (await k.query(`select count(*)::int as n from public.business_notes`)).rows[0])).n, 1);
});

test("tabs: payments, messages, activity, documents and team", async () => {
  await sql(c, `insert into public.payments (business_id, amount_kes, kind, status, mpesa_code, plan_key, source, submitted_at)
                values ('${ids.bizA}', 500, 'renewal', 'submitted', 'ABCDE12345', 'standard', 'seller', now())`);
  const pay = (await call(as("finance"), `select public.admin_business_tab('${ids.bizA}', 'payments') as r`)).r;
  assert.equal(pay[0].mpesa_code, "ABCDE12345");
  const msg = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'messages') as r`)).r;
  assert.ok(msg.length >= 3);
  const act = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'activity') as r`)).r;
  assert.ok(act.some((a) => a.action === 'business.suspend'));
  assert.ok(act.every((a, i, arr) => i === 0 || arr[i - 1].created_at >= a.created_at), "newest first");
  const docs = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'documents') as r`)).r;
  assert.deepEqual(docs.documents, []);
  const team = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'team') as r`)).r;
  assert.deepEqual(team, { staff: [], timetable: [] });
  await rejects(c, as("support"), `select public.admin_business_tab('${ids.bizA}', 'secrets')`, [], /invalid_tab/);
});

test("document metadata never includes storage paths", async () => {
  const app = (await sql(c, `select id from public.applications limit 1`))[0];
  if (!app) return;
  await sql(c, `update public.businesses set application_id = '${app.id}' where id = '${ids.bizA}'`);
  await sql(c, `insert into public.application_documents (application_id, slot_key, storage_path, original_name, mime, size_bytes) values ('${app.id}', 'id_front', 'secret/path.jpg', 'id.jpg', 'image/jpeg', 100)`);
  const docs = (await call(as("support"), `select public.admin_business_tab('${ids.bizA}', 'documents') as r`)).r;
  assert.equal(docs.documents.length, 1);
  assert.equal(JSON.stringify(docs).includes("secret/path"), false);
});
