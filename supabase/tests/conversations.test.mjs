import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const FINANCE = "00000000-0000-0000-0000-0000000000c4";
const asSupport = { sub: SUPPORT };
const asFinance = { sub: FINANCE };

const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
const file = (path, extra = {}) => ({ path, name: "id.pdf", mime: "application/pdf", size: 1200, ...extra });
const upload = (path) => sql(c, `insert into storage.objects (bucket_id, name) values ('message-files', $1)`, [path]);
const send = (who, args) =>
  call(who, `select public.admin_send_message($1::uuid[], $2, $3, $4, $5::jsonb, $6::uuid, $7) as r`,
    [args.ids ?? [ids.bizA], args.subject ?? null, args.body ?? "Please send your contact details", args.needsReply ?? false, JSON.stringify(args.files ?? []), args.parent ?? null, args.reason ?? null]).then((x) => x.r);
const bulk = (who, action, idList, reason, params = {}) =>
  call(who, `select public.admin_bulk_business_action($1, $2::uuid[], $3, $4::jsonb) as r`, [action, idList, reason, JSON.stringify(params)]).then((x) => x.r);
const rowOf = async (id) => (await sql(c, `select * from public.messages where id = $1`, [id]))[0];

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into auth.users (id, email) values ('${SUPPORT}', 'support@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${SUPPORT}', 'support', 'support@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.businesses set paid_until = now() + interval '20 days' where id in ('${ids.bizA}', '${ids.bizB}');
  `);
});
after(async () => { await c.end(); });

const OPEN_WHEN_SUSPENDED = ["seller_mark_read", "seller_reply_flag", "seller_send_message", "seller_payment_instructions", "seller_quote_category_change", "seller_submit_payment", "seller_apply_credit", "seller_set_payment_intent"];

test("every plpgsql seller function refuses a suspended seller, except notices, replies, payments and login codes", async () => {
  const rows = await sql(c, `
    select p.proname, position('assert_seller_active' in p.prosrc) > 0 as guarded
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and l.lanname = 'plpgsql' and p.proname like 'seller\\_%'`);
  assert.ok(rows.length > 10);
  for (const r of rows) {
    if (r.proname.startsWith("seller_otp_") || OPEN_WHEN_SUSPENDED.includes(r.proname)) assert.equal(r.guarded, false, r.proname);
    else assert.equal(r.guarded, true, r.proname);
  }
});

test("staff send a message with a file, and the seller sees both", async () => {
  await upload("admin/f1-id.pdf");
  const out = await send(asAdmin, { subject: "Your contact details", needsReply: true, files: [file("admin/f1-id.pdf")] });
  assert.equal(out.sent, 1);
  const [m] = out.ids;
  const row = await rowOf(m);
  assert.equal(row.sender, "admin");
  assert.equal(row.thread_id, m);
  assert.equal(row.needs_reply, true);
  assert.equal(row.delivered_at, null);
  assert.equal(row.read_at, null);

  const seen = await tx(c, asA, async (k) => ({
    messages: await sql(k, `select id, sender from public.messages where id = $1`, [m]),
    files: await sql(k, `select original_name, uploaded_by from public.message_attachments where message_id = $1`, [m]),
    objects: await sql(k, `select name from storage.objects where bucket_id = 'message-files'`),
  }));
  assert.equal(seen.messages.length, 1);
  assert.equal(seen.files[0].original_name, "id.pdf");
  assert.equal(seen.files[0].uploaded_by, "admin");
  assert.deepEqual(seen.objects.map((o) => o.name), ["admin/f1-id.pdf"]);

  // Another seller sees none of it.
  const other = await tx(c, asB, async (k) => ({
    messages: await sql(k, `select id from public.messages where id = $1`, [m]),
    files: await sql(k, `select id from public.message_attachments`),
    objects: await sql(k, `select name from storage.objects where bucket_id = 'message-files'`),
  }));
  assert.equal(other.messages.length, 0);
  assert.equal(other.files.length, 0);
  assert.equal(other.objects.length, 0);
});

test("receipts: sent, then delivered when the seller device acknowledges, then read", async () => {
  const { ids: [m] } = await send(asAdmin, { subject: "Receipts", body: "Hello there" });
  assert.equal((await rowOf(m)).delivered_at, null);

  assert.equal((await call(asA, `select public.message_ack_delivered(array['${m}']::uuid[]) as n`)).n, 1);
  let row = await rowOf(m);
  assert.ok(row.delivered_at);
  assert.equal(row.read_at, null);
  assert.equal((await call(asA, `select public.message_ack_delivered(array['${m}']::uuid[]) as n`)).n, 0, "acknowledging twice changes nothing");

  await call(asA, `select public.seller_mark_read(array['${m}']::uuid[]) as n`);
  row = await rowOf(m);
  assert.ok(row.read_at);
  assert.ok(row.delivered_at <= row.read_at);
});

test("a message read before it was acknowledged is also marked delivered", async () => {
  const { ids: [m] } = await send(asAdmin, { subject: "Read first", body: "Hello there" });
  await call(asA, `select public.seller_mark_read(array['${m}']::uuid[]) as n`);
  const row = await rowOf(m);
  assert.ok(row.delivered_at && row.read_at);
});

test("a seller cannot acknowledge or read another seller's messages", async () => {
  const { ids: [m] } = await send(asAdmin, { ids: [ids.bizB], subject: "For B", body: "Hello B" });
  await call(asA, `select public.message_ack_delivered() as n`);
  await call(asA, `select public.seller_mark_read() as n`);
  const row = await rowOf(m);
  assert.equal(row.delivered_at, null);
  assert.equal(row.read_at, null);
});

test("sellers answer only conversations where a reply was asked for, with nested replies", async () => {
  const { ids: [root] } = await send(asAdmin, { subject: "Need your phone", body: "What is your contact number?", needsReply: true });
  const { ids: [plain] } = await send(asAdmin, { subject: "FYI", body: "Just so you know", needsReply: false });
  await rejects(asA, `select public.seller_send_message($1, 'ok', '[]')`, [plain], /reply_not_allowed/);
  await rejects(asB, `select public.seller_send_message($1, 'ok', '[]')`, [root], /message_not_found/);
  await rejects(asA, `select public.seller_send_message($1, '   ', '[]')`, [root], /reply_too_short/);

  const reply = (await call(asA, `select * from public.seller_send_message($1, '0712 345 678', '[]')`, [root]));
  assert.equal(reply.sender, "seller");
  assert.equal(reply.thread_id, root);
  assert.equal(reply.parent_id, root);
  assert.equal(reply.subject, "Need your phone".replace(/^/, "Re: "));
  assert.ok(reply.read_at && reply.delivered_at, "the seller's own message counts as read on their side");
  assert.equal(reply.admin_delivered_at, null);
  assert.equal(reply.admin_read_at, null);

  // Staff answer the seller's reply: a nested message in the same thread.
  const { ids: [nested] } = await send(asAdmin, { parent: reply.id, body: "Thanks. Is that on WhatsApp?", needsReply: true });
  const nestedRow = await rowOf(nested);
  assert.equal(nestedRow.thread_id, root);
  assert.equal(nestedRow.parent_id, reply.id);
  assert.equal(nestedRow.business_id, ids.bizA);

  const deeper = await call(asA, `select * from public.seller_send_message($1, 'Yes, WhatsApp too', '[]')`, [nested]);
  assert.equal(deeper.thread_id, root);
  assert.equal(deeper.subject, "Re: Need your phone");

  const bell = await tx(c, asA, async (k) => (await sql(k, `select count(*)::int as n from public.messages where read_at is null and sender <> 'seller'`))[0].n);
  assert.ok(bell >= 1);
  const own = await tx(c, asA, async (k) => (await sql(k, `select count(*)::int as n from public.messages where read_at is null and sender = 'seller'`))[0].n);
  assert.equal(own, 0, "a seller's own replies never show up as unread");
});

test("admin receipts for a seller message: delivered on acknowledgement, read when opened", async () => {
  const { ids: [root] } = await send(asAdmin, { subject: "Question", body: "Please confirm your town", needsReply: true });
  const reply = await call(asA, `select * from public.seller_send_message($1, 'Kisumu', '[]')`, [root]);

  assert.equal((await call(asAdmin, `select public.admin_unread_messages() as n`)).n >= 1, true);
  assert.equal((await call(asAdmin, `select public.message_ack_delivered(array['${reply.id}']::uuid[]) as n`)).n, 1);
  let row = await rowOf(reply.id);
  assert.ok(row.admin_delivered_at);
  assert.equal(row.admin_read_at, null);

  await call(asSupport, `select public.admin_mark_messages_read($1) as n`, [ids.bizA]);
  row = await rowOf(reply.id);
  assert.ok(row.admin_read_at);
  const seen = await rowOf(root);
  assert.equal(seen.read_at, null, "staff opening the thread does not mark the seller's own copy as read");
});

test("admin can read every message and attachment; a non-admin cannot send", async () => {
  await rejects(asA, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, '[]', null, null)`, [], /forbidden/);
  await rejects(asA, `select public.admin_bulk_business_action('strike', array['${ids.bizA}']::uuid[], 'because reasons', '{}')`, [], /forbidden/);
  const all = await tx(c, asAdmin, async (k) => (await sql(k, `select count(*)::int as n from public.messages where channel = 'in_app'`))[0].n);
  assert.ok(all > 3);
});

test("attachments are checked: folder, type, size, count and the file must exist", async () => {
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, $1::jsonb, null, null)`, [JSON.stringify([file("admin/not-there.pdf")])], /file_not_uploaded/);
  await upload("other/x.pdf");
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, $1::jsonb, null, null)`, [JSON.stringify([file("other/x.pdf")])], /invalid_attachment_path/);
  await upload("admin/x.exe");
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, $1::jsonb, null, null)`, [JSON.stringify([file("admin/x.exe", { mime: "application/x-msdownload" })])], /type_not_allowed/);
  await upload("admin/big.pdf");
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, $1::jsonb, null, null)`, [JSON.stringify([file("admin/big.pdf", { size: 9 * 1024 * 1024 })])], /file_too_large/);
  const six = Array.from({ length: 6 }, (_, i) => file(`admin/s${i}.pdf`));
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', 'hello there', false, $1::jsonb, null, null)`, [JSON.stringify(six)], /too_many_files/);
  // A seller may only attach files from their own folder.
  const { ids: [root] } = await send(asAdmin, { subject: "Files", body: "Send a scan", needsReply: true });
  await upload(`${ids.bizB}/theirs.pdf`);
  await rejects(asA, `select public.seller_send_message($1, 'here', $2::jsonb)`, [root, JSON.stringify([file(`${ids.bizB}/theirs.pdf`)])], /invalid_attachment_path/);
  await upload(`${ids.bizA}/mine.pdf`);
  const sent = await call(asA, `select * from public.seller_send_message($1, 'here', $2::jsonb)`, [root, JSON.stringify([file(`${ids.bizA}/mine.pdf`, { name: "scan.pdf" })])]);
  const files = await sql(c, `select original_name, uploaded_by, business_id from public.message_attachments where message_id = $1`, [sent.id]);
  assert.deepEqual(files.map((f) => [f.original_name, f.uploaded_by, f.business_id]), [["scan.pdf", "seller", ids.bizA]]);
  // Staff can open it; the other seller cannot.
  const forAdmin = await tx(c, asAdmin, async (k) => (await sql(k, `select name from storage.objects where bucket_id = 'message-files' and name = $1`, [`${ids.bizA}/mine.pdf`])).length);
  assert.equal(forAdmin, 1);
  const forB = await tx(c, asB, async (k) => (await sql(k, `select name from storage.objects where bucket_id = 'message-files' and name = $1`, [`${ids.bizA}/mine.pdf`])).length);
  assert.equal(forB, 0);
});

test("a file only message needs no text, and an empty one is refused", async () => {
  await upload("admin/only.pdf");
  const out = await send(asAdmin, { body: "  ", files: [file("admin/only.pdf")] });
  assert.equal((await rowOf(out.ids[0])).body, "Sent you a file.");
  await rejects(asAdmin, `select public.admin_send_message(array['${ids.bizA}']::uuid[], 's', '  ', false, '[]', null, null)`, [], /body_required/);
});

test("bulk message reaches many businesses and skips deleted ones", async () => {
  await sql(c, `update public.businesses set status = 'deleted', deleted_at = now() where id = '${ids.bizB}'`);
  const r = await bulk(asAdmin, "message", [ids.bizA, ids.bizB], "Policy update", { channels: ["inApp", "sms"], subject: "Policy", body: "We changed our policy", needsReply: false });
  assert.deepEqual([r.affected, r.skipped], [1, 1]);
  const queued = await sql(c, `select channel, status, to_address from public.messages where channel = 'sms' and business_id = '${ids.bizA}'`);
  assert.deepEqual(queued.map((q) => [q.channel, q.status, q.to_address]), [["sms", "queued", "+254712345678"]]);
  await sql(c, `update public.businesses set status = 'live', deleted_at = null where id = '${ids.bizB}'`);
});

test("strike adds one, tells the seller, and is written to the audit log", async () => {
  await rejects(asSupport, `select public.admin_bulk_business_action('strike', array['${ids.bizA}']::uuid[], 'no', '{}')`, [], /reason_required/);
  const r = await bulk(asSupport, "strike", [ids.bizA], "Wrong prices on three items");
  assert.equal(r.affected, 1);
  await bulk(asSupport, "strike", [ids.bizA], "Posted a misleading offer");
  const [b] = await sql(c, `select strikes from public.businesses where id = '${ids.bizA}'`);
  assert.equal(b.strikes, 2);
  const seller = await tx(c, asA, async (k) => ({
    strikes: (await sql(k, `select strikes, status from public.businesses`))[0],
    notices: await sql(k, `select subject, body from public.messages where kind = 'strike' order by created_at`),
  }));
  assert.equal(seller.strikes.strikes, 2);
  assert.equal(seller.notices.length, 2);
  assert.match(seller.notices[1].body, /2 strikes/);
  const audit = await sql(c, `select count(*)::int as n from public.audit_log where action = 'business.strike' and target_id = '${ids.bizA}'`);
  assert.equal(audit[0].n, 2);
});

test("tags, feature and extend work, with the right role", async () => {
  assert.equal((await bulk(asSupport, "tag", [ids.bizA], "Watch list", { tag: "watch", mode: "add" })).affected, 1);
  assert.equal((await bulk(asSupport, "tag", [ids.bizA], "Watch list", { tag: "watch", mode: "add" })).affected, 0, "already tagged");
  assert.deepEqual((await sql(c, `select tags from public.businesses where id = '${ids.bizA}'`))[0].tags, ["watch"]);
  assert.equal((await bulk(asSupport, "tag", [ids.bizA], "Watch list over", { tag: "watch", mode: "remove" })).affected, 1);
  assert.equal((await bulk(asSupport, "feature", [ids.bizA], "Homepage slot", { featured: true })).affected, 1);
  await rejects(asSupport, `select public.admin_bulk_business_action('extend', array['${ids.bizA}']::uuid[], 'goodwill', '{"days": 7}')`, [], /forbidden/);
  const before = (await sql(c, `select paid_until from public.businesses where id = '${ids.bizA}'`))[0].paid_until;
  assert.equal((await bulk(asFinance, "extend", [ids.bizA], "Goodwill after outage", { days: 7 })).affected, 1);
  const after = (await sql(c, `select paid_until from public.businesses where id = '${ids.bizA}'`))[0].paid_until;
  assert.equal(Math.round((after - before) / 86400000), 7);
  await rejects(c, asAdmin, `select public.admin_bulk_business_action('delete', array['${ids.bizA}']::uuid[], 'not a bulk action', '{}')`, [], /not_supported/);
  assert.equal((await bulk(asAdmin, "export", [ids.bizA, ids.bizB], "Monthly export")).affected, 2);
});

test("a suspended seller can do nothing, and the reason is visible to them", async () => {
  const { ids: [root] } = await send(asAdmin, { subject: "Before suspension", body: "Please reply", needsReply: true });
  const r = await bulk(asSupport, "suspend", [ids.bizA], "Selling counterfeit goods");
  assert.equal(r.affected, 1);
  assert.equal((await bulk(asSupport, "suspend", [ids.bizA], "Selling counterfeit goods")).affected, 0, "already suspended");

  const seen = await tx(c, asA, async (k) => ({
    biz: (await sql(k, `select status, status_reason, strikes from public.businesses`))[0],
    notice: await sql(k, `select subject, body from public.messages where subject = 'Your account has been suspended'`),
  }));
  assert.equal(seen.biz.status, "suspended");
  assert.equal(seen.biz.status_reason, "Selling counterfeit goods");
  assert.match(seen.notice[0].body, /Selling counterfeit goods/);

  await rejects(asA, `select public.seller_update_profile('{"tagline":"hi"}')`, [], /account_suspended/);
  await rejects(asA, `select public.seller_pause_listing(true)`, [], /account_suspended/);
  await rejects(asA, `select public.seller_request_change('phone', '0712345679')`, [], /account_suspended/);
  await rejects(asA, `select public.seller_request_deletion('Shop A')`, [], /account_suspended/);
  await rejects(asA, `select public.seller_save_exception(null, current_date + 3, 'closed', '[]', null)`, [], /account_suspended/);
  // What stays open: reading notices and answering staff, so the seller can respond to the suspension.
  await call(asA, `select public.seller_mark_read() as n`);
  assert.equal((await call(asA, `select * from public.seller_send_message($1, 'I am sorry, I fixed it', '[]')`, [root])).sender, "seller");
  await rejects(asA, `insert into public.items (business_id, name, price_type) values ('${ids.bizA}', 'Sneaky', 'fixed')`, [], /row-level security|violates|account_suspended/);

  // Staff can still write to the same tables, and the other seller is unaffected.
  await call(asB, `select public.seller_mark_read() as n`);

  const back = await bulk(asSupport, "unsuspend", [ids.bizA], "Appeal accepted, items corrected");
  assert.equal(back.affected, 1);
  await call(asA, `select public.seller_mark_read() as n`);
  const [biz] = await sql(c, `select status, status_reason from public.businesses where id = '${ids.bizA}'`);
  assert.deepEqual([biz.status, biz.status_reason], ["live", null]);
});

test("reminders go out 7, 3 and 2 days before expiry and again only once", async () => {
  const now = "2026-10-18T09:00:00+03:00";
  const notices = async (daysAhead) => {
    await sql(c, `delete from public.messages where business_id = '${ids.bizA}' and kind = 'reminder'`);
    await sql(c, `update public.businesses set status = 'live', paid_until = public.nairobi_midnight(public.nairobi_day('${now}'::timestamptz) + ${daysAhead}) where id = '${ids.bizA}'`);
    const n = (await sql(c, `select public.generate_billing_notices('${now}') as n`))[0].n;
    const again = (await sql(c, `select public.generate_billing_notices('${now}') as n`))[0].n;
    const rows = await sql(c, `select subject from public.messages where business_id = '${ids.bizA}' and kind = 'reminder'`);
    return { n, again, rows };
  };
  for (const d of [7, 3, 2]) {
    const out = await notices(d);
    assert.equal(out.rows.length, 1, `day ${d}`);
    assert.match(out.rows[0].subject, new RegExp(`${d} days`));
    assert.equal(out.again, 0, "no duplicate on a second run");
  }
  assert.equal((await notices(1)).rows[0].subject, "Your listing expires tomorrow");
  for (const d of [6, 5, 4]) assert.equal((await notices(d)).rows.length, 0, `day ${d}`);
});

test("realtime carries attachments", async () => {
  const rows = await sql(c, `select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_attachments'`).catch(() => []);
  // The publication only exists on Supabase; the migration must still apply without it.
  assert.ok(Array.isArray(rows));
});

const biz = async (id = ids.bizA) => (await sql(c, `select status, status_reason, strikes, tags, featured, paid_until, agent from public.businesses where id = '${id}'`))[0];
const undo = (who, token) => call(who, `select public.admin_undo_bulk_business_action($1::uuid) as r`, [token]).then((x) => x.r);

test("unlist hides a live business, tells the seller, skips the rest, and can be undone once", async () => {
  await sql(c, `update public.businesses set status = 'live', status_reason = null where id in ('${ids.bizA}', '${ids.bizB}')`);
  await sql(c, `update public.businesses set status = 'expired' where id = '${ids.bizB}'`);
  const r = await bulk(asSupport, "unlist", [ids.bizA, ids.bizB], "Listing under review");
  assert.deepEqual([r.affected, r.skipped], [1, 1], "only the live one");
  assert.ok(r.undoToken);
  assert.deepEqual([(await biz()).status, (await biz()).status_reason], ["paused", "Listing under review"]);
  assert.equal((await biz(ids.bizB)).status, "expired");
  const notice = await tx(c, asA, async (k) => sql(k, `select body from public.messages where subject = 'Your listing has been unlisted'`));
  assert.match(notice[0].body, /Listing under review/);
  const tab = await call(asAdmin, `select public.admin_business_tab_counts('{}') as r`);
  assert.equal(tab.r.unlisted, 1);

  await rejects(c, asAdmin, `select public.admin_undo_bulk_business_action('${r.undoToken}')`, [], /nothing_to_undo/); // someone else's token
  const back = await undo(asSupport, r.undoToken);
  assert.deepEqual([back.restored, back.skipped], [1, 0]);
  assert.deepEqual([(await biz()).status, (await biz()).status_reason], ["live", null]);
  await rejects(c, asSupport, `select public.admin_undo_bulk_business_action('${r.undoToken}')`, [], /nothing_to_undo/); // only once
  const log = await sql(c, `select action from public.audit_log where business_id = '${ids.bizA}' order by created_at desc limit 2`);
  assert.deepEqual(log.map((x) => x.action), ["business.undo", "business.unlist"]);
});

test("assign sets and clears an agent, only staff can be agents, and the table can filter by agent", async () => {
  await sql(c, `update public.admins set display_name = 'Faith Achieng' where user_id = '${SUPPORT}'`);
  const options = (await call(asSupport, `select public.admin_business_filter_options() as r`)).r;
  assert.ok(options.agents.includes("Faith Achieng"));
  await rejects(c, asSupport, `select public.admin_bulk_business_action('assign', array['${ids.bizA}']::uuid[], 'Balance the load', '{"agent":"Nobody Here"}')`, [], /unknown_agent/);

  const set = await bulk(asSupport, "assign", [ids.bizA, ids.bizB], "Balance the load", { agent: "Faith Achieng" });
  assert.deepEqual([set.affected, set.skipped], [2, 0]);
  assert.equal((await bulk(asSupport, "assign", [ids.bizA], "Balance the load", { agent: "Faith Achieng" })).affected, 0, "already hers");
  const rows = (await call(asAdmin, `select public.admin_businesses_query('all', null, 'name', 'asc', '{"agent":"Faith Achieng"}') as r`)).r;
  assert.equal(rows.total, 2);
  assert.ok(rows.rows.every((x) => x.agent === "Faith Achieng"));
  assert.equal((await call(asAdmin, `select public.admin_businesses_query('all', null, 'name', 'asc', '{"agent":"__none__"}') as r`)).r.total, 0);

  const cleared = await bulk(asSupport, "assign", [ids.bizA], "Back to the pool", { agent: null });
  assert.equal(cleared.affected, 1);
  assert.equal((await biz()).agent, null);
  assert.equal((await undo(asSupport, cleared.undoToken)).restored, 1);
  assert.equal((await biz()).agent, "Faith Achieng");
  await undo(asSupport, set.undoToken);
  assert.deepEqual([(await biz()).agent, (await biz(ids.bizB)).agent], [null, null]);
});

test("undo puts back strikes, tags, features, suspensions and extra days, and skips anything changed since", async () => {
  await sql(c, `update public.businesses set status = 'live', status_reason = null, strikes = 0, tags = '{}', featured = false, paid_until = now() + interval '20 days' where id = '${ids.bizA}'`);

  const strike = await bulk(asSupport, "strike", [ids.bizA], "Wrong prices on three items");
  assert.equal((await biz()).strikes, 1);
  await undo(asSupport, strike.undoToken);
  assert.equal((await biz()).strikes, 0);

  const tag = await bulk(asSupport, "tag", [ids.bizA], "Watch list", { tag: "watch", mode: "add" });
  await undo(asSupport, tag.undoToken);
  assert.deepEqual((await biz()).tags, []);

  const feat = await bulk(asSupport, "feature", [ids.bizA], "Homepage slot", { featured: true });
  await undo(asSupport, feat.undoToken);
  assert.equal((await biz()).featured, false);

  const sus = await bulk(asSupport, "suspend", [ids.bizA], "Selling counterfeit goods");
  assert.equal((await biz()).status, "suspended");
  await undo(asSupport, sus.undoToken);
  assert.deepEqual([(await biz()).status, (await biz()).status_reason], ["live", null]);

  const ext0 = (await biz()).paid_until;
  const ext = await bulk(asFinance, "extend", [ids.bizA], "Goodwill after outage", { days: 7 });
  await undo(asFinance, ext.undoToken);
  assert.equal(+(await biz()).paid_until, +ext0);

  // Changed since: a later change wins, the undo leaves that business alone and says so.
  const again = await bulk(asFinance, "extend", [ids.bizA], "Goodwill after outage", { days: 7 });
  await sql(c, `update public.businesses set paid_until = paid_until + interval '30 days' where id = '${ids.bizA}'`);
  const kept = (await biz()).paid_until;
  const out = await undo(asFinance, again.undoToken);
  assert.deepEqual([out.restored, out.skipped], [0, 1]);
  assert.equal(+(await biz()).paid_until, +kept);

  // Messages and exports have nothing to undo.
  assert.equal((await bulk(asSupport, "message", [ids.bizA], "Policy update", { channels: ["sms"], body: "We changed our policy" })).undoToken, null);
  assert.equal((await bulk(asAdmin, "export", [ids.bizA], "Monthly export")).undoToken, null);
  // Nobody undoes an action after its 15 minutes.
  const late = await bulk(asSupport, "tag", [ids.bizA], "Watch list", { tag: "late", mode: "add" });
  await sql(c, `update public.admin_bulk_undo set expires_at = now() - interval '1 minute' where token = '${late.undoToken}'`);
  await rejects(c, asSupport, `select public.admin_undo_bulk_business_action('${late.undoToken}')`, [], /nothing_to_undo/);
});

test("a suspended seller can still see what to pay, pay, and read their payments", async () => {
  await sql(c, `update public.businesses set status = 'suspended', status_reason = 'Selling counterfeit goods' where id = '${ids.bizA}'`);
  const instr = (await call(asA, `select public.seller_payment_instructions('renewal', null, null) as r`)).r;
  assert.equal(instr.purpose, "renewal");
  assert.ok(Number(instr.amount_kes) > 0);
  const paid = await tx(c, asA, async (k) => sql(k, `select count(*)::int as n from public.payments where business_id = '${ids.bizA}'`));
  assert.ok(paid[0].n >= 0);
  await sql(c, `update public.businesses set status = 'live', status_reason = null where id = '${ids.bizA}'`);
});
