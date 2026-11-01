import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0080_admin_conversations_page.sql: the admin inbox is paged, filtered and searched on the server, and its unread numbers
// come from the same predicate as the sidebar badge (admin_unread_messages).
let c;
const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0080" }));
  await seedFixtures(c);
  await sql(c, `update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}'`);
  // Business B wrote once, long ago, and nobody has read it. Business A then produced 1100 newer messages
  // (more than the 1000 the inbox used to load), 3 of them unread seller messages, 1 hidden by an admin.
  await sql(c, `
    insert into public.messages (business_id, channel, sender, kind, subject, body, created_at)
    values ('${ids.bizB}', 'in_app', 'seller', 'general', 'Old question', 'Hello?', now() - interval '90 days');
    insert into public.messages (business_id, channel, sender, kind, subject, body, created_at, admin_read_at)
    select '${ids.bizA}', 'in_app', 'admin', 'general', 'Topic ' || g, 'Body', now() - interval '60 days' + g * interval '1 minute', null
      from generate_series(1, 1100) g;
    insert into public.messages (business_id, channel, sender, kind, subject, body, created_at, admin_read_at, admin_hidden_at)
    values ('${ids.bizA}', 'in_app', 'seller', 'general', 'Read one', 'x', now() - interval '3 days', now(), null),
           ('${ids.bizA}', 'in_app', 'seller', 'general', 'Hidden unread', 'x', now() - interval '3 days', null, now());
    insert into public.messages (business_id, channel, sender, kind, subject, body, created_at)
    select '${ids.bizA}', 'in_app', 'seller', 'general', 'Unread ' || g, 'x', now() - interval '2 days' + g * interval '1 minute' from generate_series(1, 3) g;
    insert into public.messages (business_id, channel, sender, kind, subject, body, created_at)
    values ('${ids.bizA}', 'sms', 'admin', 'general', 'Not in-app', 'x', now());`);
});
after(async () => { await c.end(); });

test("an old conversation is still listed after more than 1000 newer messages, with its own unread count", async () => {
  const r = await call(asAdmin, `select admin_conversations_page(30, 0) as r`);
  assert.equal(r.total, 2);
  assert.deepEqual(r.rows.map((x) => x.business_id), [ids.bizA, ids.bizB], "newest activity first");
  const [a, b] = r.rows;
  assert.equal(a.unread, 3, "read and hidden seller messages are not unread");
  assert.equal(b.unread, 1, "business B's message is far older than the newest 1000, and still counts");
  assert.equal(b.last_subject, "Old question");
  assert.equal(a.message_count, 1100 + 1 + 3, "1100 staff + 1 read + 3 unread; the hidden and the SMS rows are not counted");
});

test("the list's unread numbers add up to the sidebar badge, which is admin_unread_messages() itself", async () => {
  const r = await call(asAdmin, `select admin_conversations_page(30, 0) as r`);
  const badge = (await call(asAdmin, `select admin_unread_messages() as r`));
  assert.equal(badge, 4);
  assert.equal(r.unread_total, badge);
  assert.equal(r.rows.reduce((n, x) => n + x.unread, 0), badge);
});

test("it pages: limit and offset walk the conversations, the total stays the same", async () => {
  const p1 = await call(asAdmin, `select admin_conversations_page(1, 0) as r`);
  const p2 = await call(asAdmin, `select admin_conversations_page(1, 1) as r`);
  const p3 = await call(asAdmin, `select admin_conversations_page(1, 2) as r`);
  assert.deepEqual([p1.rows.length, p2.rows.length, p3.rows.length], [1, 1, 0]);
  assert.deepEqual([p1.total, p2.total, p3.total], [2, 2, 2]);
  assert.notEqual(p1.rows[0].business_id, p2.rows[0].business_id);
});

test("waiting for a reply: staff asked for one and the last word was staff's", async () => {
  await sql(c, `insert into public.messages (business_id, channel, sender, kind, subject, body, needs_reply)
                values ('${ids.bizB}', 'in_app', 'admin', 'general', 'Please confirm', 'x', true)`);
  const r = await call(asAdmin, `select admin_conversations_page(30, 0) as r`);
  assert.equal(r.rows.find((x) => x.business_id === ids.bizB).waiting, true);
  assert.equal(r.rows.find((x) => x.business_id === ids.bizA).waiting, false);
});

const page = (filter = "all", search = null, limit = 30, offset = 0) =>
  tx(c, asAdmin, async (k) => (await sql(k, `select admin_conversations_page($1, $2, $3, $4) as r`, [limit, offset, filter, search]))[0].r, { commit: true });
const who = (r) => r.rows.map((x) => x.business_id);

test("filters: unread, waiting and resolved behave as the tabs on the Messages page", async () => {
  assert.deepEqual(who(await page("unread")), [ids.bizB, ids.bizA], "newest activity first: B was written to last");
  assert.deepEqual(who(await page("waiting")), [ids.bizB]);
  assert.deepEqual(who(await page("resolved")), []);
  await assert.rejects(() => page("everything"), /invalid_filter/);

  // Resolving B takes it out of "waiting" (as the tab does) and into "resolved"; the counts say so.
  await sql(c, `insert into public.admin_conversation_state (business_id) values ('${ids.bizB}')`);
  try {
    assert.deepEqual(who(await page("waiting")), []);
    const resolved = await page("resolved");
    assert.deepEqual(who(resolved), [ids.bizB]);
    assert.equal(resolved.rows[0].resolved, true);
    assert.equal(resolved.total, 1, "total is the size of the open filter, for paging");
    assert.deepEqual(resolved.counts, { all: 2, unread: 2, waiting: 0, resolved: 1 }, "every tab keeps its own count");
  } finally {
    await sql(c, `delete from public.admin_conversation_state where business_id = '${ids.bizB}'`);
  }
});

test("search matches the business name, the seller ID, a subject or a body, ignoring case, and scopes the tab counts", async () => {
  const [a, b] = await sql(c, `select id, name, seller_id from public.businesses where id in ('${ids.bizA}', '${ids.bizB}') order by (id = '${ids.bizA}') desc`);
  assert.deepEqual(who(await page("all", a.name.toUpperCase())), [ids.bizA], "business name");
  assert.deepEqual(who(await page("all", b.seller_id.toLowerCase())), [ids.bizB], "seller ID");
  assert.deepEqual(who(await page("all", "old QUESTION")), [ids.bizB], "a subject");
  assert.deepEqual(who(await page("all", "hello?")), [ids.bizB], "a body");
  const topic = await page("all", "topic 1100");
  assert.deepEqual(who(topic), [ids.bizA]);
  assert.deepEqual(topic.counts, { all: 1, unread: 1, waiting: 0, resolved: 0 }, "counts only cover what the search found");
  assert.deepEqual(who(await page("unread", "topic 1100")), [ids.bizA], "filter and search combine");
  assert.deepEqual(who(await page("waiting", "topic 1100")), []);
  assert.equal((await page("all", "zzz-no-such-text")).total, 0);
  assert.equal((await page("all", "%")).total, 0, "a % typed in the box is a character, not a wildcard");
  assert.equal((await page("all", "  ")).total, 2, "a blank search is no search");
});

test("only admins may read it", async () => {
  await rejects(c, asA, `select admin_conversations_page()`, [], /forbidden/);
});
