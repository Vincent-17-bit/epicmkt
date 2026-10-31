import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const FINANCE = "00000000-0000-0000-0000-0000000000c4";
const asSupport = { sub: SUPPORT };
const asFinance = { sub: FINANCE };

const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
const send = (who, args = {}) =>
  call(who, `select public.admin_send_message($1::uuid[], $2, $3, $4, '[]'::jsonb, null, null) as r`,
    [args.ids ?? [ids.bizA], args.subject ?? "Hello", args.body ?? "Please send your details", args.needsReply ?? true]).then((x) => x.r);
const resolve = (who, business, resolved) =>
  call(who, `select public.admin_set_conversation_resolved($1, $2) as r`, [business, resolved]).then((x) => x.r);
const state = (business) => sql(c, `select * from public.admin_conversation_state where business_id = $1`, [business]);
const audits = (action) => sql(c, `select * from public.audit_log where action = $1 order by id`, [action]);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_conversation_state" }));
  await seedFixtures(c);
  await sql(c, `
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into auth.users (id, email) values ('${SUPPORT}', 'support@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${SUPPORT}', 'support', 'support@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.businesses set paid_until = now() + interval '20 days' where id in ('${ids.bizA}', '${ids.bizB}');
  `);
});
after(async () => { await c.end(); });

test("support and owner resolve and reopen a conversation, and each change is audited with before and after", async () => {
  await send(asAdmin);
  assert.deepEqual(await resolve(asSupport, ids.bizA, true), { resolved: true, changed: true });
  const [row] = await state(ids.bizA);
  assert.equal(row.resolved_by, SUPPORT);

  const [resolved] = await audits("conversation.resolve");
  assert.deepEqual(resolved.before, { resolved: false });
  assert.deepEqual(resolved.after, { resolved: true });
  assert.equal(String(resolved.business_id), ids.bizA);

  assert.deepEqual(await resolve(asAdmin, ids.bizA, false), { resolved: false, changed: true });
  assert.equal((await state(ids.bizA)).length, 0);
  const [reopened] = await audits("conversation.reopen");
  assert.deepEqual(reopened.before, { resolved: true });
  assert.deepEqual(reopened.after, { resolved: false });
});

test("repeating the same change does nothing and writes no second audit entry", async () => {
  await resolve(asAdmin, ids.bizA, true);
  const before = (await audits("conversation.resolve")).length;
  assert.deepEqual(await resolve(asAdmin, ids.bizA, true), { resolved: true, changed: false });
  assert.equal((await audits("conversation.resolve")).length, before);
  await resolve(asAdmin, ids.bizA, false);
});

test("finance and sellers are refused, and bad input has stable codes", async () => {
  await rejects(asFinance, `select public.admin_set_conversation_resolved($1, true)`, [ids.bizA], /forbidden/);
  await rejects(asA, `select public.admin_set_conversation_resolved($1, true)`, [ids.bizA], /forbidden/);
  await rejects(asAdmin, `select public.admin_set_conversation_resolved(null, true)`, [], /invalid_input/);
  await rejects(asAdmin, `select public.admin_set_conversation_resolved($1, null)`, [ids.bizA], /invalid_input/);
  await rejects(asAdmin, `select public.admin_set_conversation_resolved($1, true)`, ["10000000-0000-0000-0000-00000000ffff"], /conversation_not_found/);
  assert.equal((await state(ids.bizA)).length, 0);
});

test("a conversation with no visible messages cannot be resolved", async () => {
  await rejects(asAdmin, `select public.admin_set_conversation_resolved($1, true)`, [ids.bizB], /conversation_not_found/);
});

test("the state table cannot be written directly by an admin or a seller", async () => {
  await rejects(asAdmin, `insert into public.admin_conversation_state (business_id) values ($1)`, [ids.bizA], /permission denied/);
  assert.equal((await tx(c, asA, (k) => sql(k, `select * from public.admin_conversation_state`))).length, 0);
});

test("a seller message reopens a resolved conversation, and an admin message does not", async () => {
  const { ids: [root] } = await send(asAdmin, { subject: "Need your phone", needsReply: true });
  await resolve(asAdmin, ids.bizA, true);
  assert.equal((await state(ids.bizA)).length, 1);

  await send(asAdmin, { subject: "Another note", needsReply: false });
  assert.equal((await state(ids.bizA)).length, 1, "staff messaging does not reopen");

  const reopens = (await audits("conversation.reopen")).length;
  await call(asA, `select * from public.seller_send_message($1, '0712 345 678', '[]')`, [root]);
  assert.equal((await state(ids.bizA)).length, 0, "the seller's reply reopens it");
  assert.equal((await audits("conversation.reopen")).length, reopens, "the automatic reopen is not an admin action");
});
