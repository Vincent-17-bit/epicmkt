import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// Migration 0059: deleting from the Live activity feed.
//   n:<uuid>  -> the notification is really deleted
//   a:<n>     -> the audit row is only hidden from the calling admin's own feed; audit_log is never touched

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const asReviewer = { sub: REVIEWER };
const asSupport = { sub: SUPPORT };
const asFinance = { sub: FINANCE };

const feed = (who, limit = 50) => tx(c, who, async (k) => (await sql(k, `select admin_activity($1) as r`, [limit]))[0].r);
const del = (who, list, reason = null) =>
  tx(c, who, async (k) => (await sql(k, `select admin_delete_activity($1::text[], $2) as r`, [list, reason]))[0].r, { commit: true });
const count = async (table) => Number((await sql(c, `select count(*) as n from ${table}`))[0].n);

let notifA, notifB, auditA, auditB;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${SUPPORT}', 'support@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values
      ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${SUPPORT}', 'support', 'support@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
  `);
});
after(async () => { await c.end(); });

// Each test starts from the same four feed rows.
async function seedFeed() {
  // The table owner resets the fixtures; the browser roles cannot delete from audit_log (see the immutability test).
  await sql(c, `delete from admin_activity_dismissals; delete from admin_notifications; delete from audit_log;`);
  await sql(c, `
    insert into admin_notifications (kind, business_id, data, created_at) values
      ('payment_submitted', '${ids.bizA}', '{"kind":"renewal"}', now() - interval '4 minutes'),
      ('listing_paused', '${ids.bizB}', '{}', now() - interval '3 minutes');
    insert into audit_log (business_id, actor_role, action, entity, entity_id, created_at) values
      ('${ids.bizA}', 'system', 'payment_confirmed', 'payment', 'x', now() - interval '2 minutes'),
      ('${ids.bizB}', 'system', 'payment_rejected', 'payment', 'y', now() - interval '1 minute');
  `);
  const rows = await feed(asAdmin);
  const by = (kind) => rows.find((r) => r.kind === kind).id;
  [notifA, notifB, auditA, auditB] = [by("payment_submitted"), by("listing_paused"), by("payment_confirmed"), by("payment_rejected")];
}

test("sellers, anon, support and finance cannot delete from the feed; reviewer and owner can", async () => {
  await seedFeed();
  await rejects(c, asA, `select admin_delete_activity($1::text[])`, [[notifA]], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_delete_activity($1::text[])`, [[notifA]], /permission denied/);
  await rejects(c, asSupport, `select admin_delete_activity($1::text[])`, [[notifA]], /forbidden/);
  await rejects(c, asFinance, `select admin_delete_activity($1::text[])`, [[notifA]], /forbidden/);
  assert.equal(await count("admin_notifications"), 2, "nothing was deleted by a refused call");
  assert.deepEqual(await del(asReviewer, [notifA]), { deleted: 1, dismissed: 0, skipped: 0 });
  assert.deepEqual(await del(asAdmin, [notifB]), { deleted: 1, dismissed: 0, skipped: 0 });
});

test("deleting a notification removes it for good and leaves an audit entry with the reason", async () => {
  await seedFeed();
  const result = await del(asReviewer, [notifA], "cleared after review");
  assert.deepEqual(result, { deleted: 1, dismissed: 0, skipped: 0 });
  assert.equal(await count("admin_notifications"), 1);
  assert.ok(!(await feed(asAdmin)).some((r) => r.id === notifA), "gone for every admin");
  const [entry] = await sql(c, `select actor_email, reason, after from audit_log where action = 'activity.delete'`);
  assert.equal(entry.reason, "cleared after review");
  assert.deepEqual(entry.after, { deleted: 1, kinds: ["payment_submitted"] });
  // the audit entry for the clean-up does not turn up in the feed it just cleared
  assert.ok(!(await feed(asAdmin)).some((r) => r.kind === "activity.delete"));
  // asking again is not an error, it is just already gone
  assert.deepEqual(await del(asReviewer, [notifA]), { deleted: 0, dismissed: 0, skipped: 1 });
});

test("deleting an audit row only hides it for that admin: audit_log is untouched and the other admin still sees it", async () => {
  await seedFeed();
  const before = await count("audit_log");
  assert.deepEqual(await del(asReviewer, [auditA]), { deleted: 0, dismissed: 1, skipped: 0 });
  assert.equal(await count("audit_log"), before, "no audit row was removed, and none was added");
  assert.ok(!(await feed(asReviewer)).some((r) => r.id === auditA), "hidden for the reviewer");
  assert.ok((await feed(asAdmin)).some((r) => r.id === auditA), "the owner still sees it");
  assert.ok((await sql(c, `select 1 from audit_log where 'a:' || id::text = $1`, [auditA])).length === 1, "the Audit page can still read it");
  // hiding twice changes nothing
  assert.deepEqual(await del(asReviewer, [auditA]), { deleted: 0, dismissed: 0, skipped: 1 });
});

test("a hidden row is replaced by the next older one instead of leaving the feed short", async () => {
  await seedFeed();
  const full = await feed(asReviewer, 2);
  assert.deepEqual(full.map((r) => r.id), [auditB, auditA]);
  await del(asReviewer, [auditB]);
  assert.deepEqual((await feed(asReviewer, 2)).map((r) => r.id), [auditA, notifB]);
});

test("a mixed clear deletes notifications and hides audit rows in one call", async () => {
  await seedFeed();
  const result = await del(asReviewer, [notifA, notifB, auditA, auditB], "end of day");
  assert.deepEqual(result, { deleted: 2, dismissed: 2, skipped: 0 });
  assert.deepEqual(await feed(asReviewer), []);
  assert.equal((await feed(asAdmin)).length, 2, "the owner still has both audit rows");
});

test("audit_log stays immutable for every browser role", async () => {
  await seedFeed();
  for (const who of [asAdmin, asReviewer]) {
    await rejects(c, who, `delete from audit_log`, [], /permission denied/);
    await rejects(c, who, `update audit_log set action = 'x'`, [], /permission denied/);
  }
});

test("dismissals are private: each admin reads and writes only their own", async () => {
  await seedFeed();
  await del(asReviewer, [auditA]);
  await del(asAdmin, [auditB]);
  const own = (who) => tx(c, who, async (k) => (await sql(k, `select activity_id from admin_activity_dismissals order by 1`)).map((r) => r.activity_id));
  assert.deepEqual(await own(asReviewer), [auditA]);
  assert.deepEqual(await own(asAdmin), [auditB]);
  assert.deepEqual(await own(asSupport), [], "support has no dismissals and sees none of the others");
  await rejects(c, asReviewer, `insert into admin_activity_dismissals (admin_id, activity_id) values ($1, 'a:1')`, [ids.admin], /row-level security/);
  await rejects(c, asReviewer, `insert into admin_activity_dismissals (activity_id) values ('n:abc')`, [], /check constraint|violates/);
  assert.deepEqual(await tx(c, asA, async (k) => await sql(k, `select * from admin_activity_dismissals`)), [], "a seller reads nothing");
  await rejects(c, { role: "anon" }, `select * from admin_activity_dismissals`, [], /permission denied/);
  // an admin can take their own dismissal back, and only their own
  await tx(c, asReviewer, async (k) => {
    await sql(k, `delete from admin_activity_dismissals where activity_id = $1`, [auditB]);
    assert.equal((await sql(k, `select 1 from admin_activity_dismissals`)).length, 1);
  });
  const ownerRows = await tx(c, asReviewer, async (k) => (await sql(k, `delete from admin_activity_dismissals where admin_id = $1 returning 1`, [ids.admin])).length, { commit: true });
  assert.equal(ownerRows, 0);
  assert.deepEqual(await own(asAdmin), [auditB]);
});

test("bad input is refused and nothing is half done", async () => {
  await seedFeed();
  await rejects(c, asReviewer, `select admin_delete_activity(null::text[])`, [], /invalid_input/);
  await rejects(c, asReviewer, `select admin_delete_activity('{}'::text[])`, [], /invalid_input/);
  await rejects(c, asReviewer, `select admin_delete_activity($1::text[])`, [[notifA, "x:1"]], /invalid_input/);
  await rejects(c, asReviewer, `select admin_delete_activity($1::text[])`, [[notifA, "n:not-a-uuid"]], /invalid_input/);
  await rejects(c, asReviewer, `select admin_delete_activity($1::text[])`, [[notifA, "a:1; drop table audit_log"]], /invalid_input/);
  await rejects(c, asReviewer, `select admin_delete_activity($1::text[])`, [Array.from({ length: 201 }, (_, i) => `a:${i + 1}`)], /too_many/);
  assert.equal(await count("admin_notifications"), 2);
  assert.equal(await count("admin_activity_dismissals"), 0);
  // an audit id that does not exist is skipped, not stored
  assert.deepEqual(await del(asReviewer, ["a:999999"]), { deleted: 0, dismissed: 0, skipped: 1 });
  assert.equal(await count("admin_activity_dismissals"), 0);
});

test("the migration can be re-run", async () => {
  const file = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations", "0059_admin_activity_delete.sql");
  await c.query(readFileSync(file, "utf8"));
});
