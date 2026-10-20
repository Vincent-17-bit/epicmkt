import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, asA, asAdmin, ids } from "./db.mjs";

// admin_my_sessions() (0022): the "where you are signed in" list on the Account page.
let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  // The test world's auth.sessions only has id and user_id; real Supabase also has these columns.
  await sql(c, `
    alter table auth.sessions
      add column if not exists created_at timestamptz default now(),
      add column if not exists updated_at timestamptz,
      add column if not exists user_agent text,
      add column if not exists ip inet,
      add column if not exists not_after timestamptz;
    insert into auth.sessions (user_id, created_at, updated_at, user_agent, ip, not_after) values
      ('${ids.admin}', now() - interval '2 days', now() - interval '1 hour', 'Mozilla/5.0 Chrome', '102.0.1.5', null),
      ('${ids.admin}', now() - interval '3 days', now() - interval '2 days', 'old browser', '10.0.0.1', now() - interval '1 day'),
      ('${ids.admin}', now() - interval '1 day', null, 'Firefox', '102.0.9.9', now() + interval '1 day'),
      ('${ids.userA}', now(), now(), 'seller phone', '41.0.0.1', null);
  `);
});
after(async () => { await c.end(); });

const mine = (who) => tx(c, who, async (k) => sql(k, `select * from admin_my_sessions()`));

test("an admin sees only their own live sessions, newest activity first", async () => {
  const rows = await mine(asAdmin);
  assert.equal(rows.length, 2, "the expired session and the seller's session are not listed");
  assert.deepEqual(rows.map((r) => r.user_agent), ["Mozilla/5.0 Chrome", "Firefox"]);
  assert.equal(rows[0].ip, "102.0.1.5", "the address comes back as plain text, without a netmask");
});

test("a seller gets nothing, not even their own session", async () => {
  assert.deepEqual(await mine(asA), []);
});
