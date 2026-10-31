import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin, asService } from "./db.mjs";

let c;
const SUPPORT = "00000000-0000-0000-0000-0000000000c3";
const asSupport = { sub: SUPPORT };

const call = (who, text, params) => tx(c, who, async (k) => (await sql(k, text, params))[0], { commit: true });
const setEnabled = (who, key, enabled) => call(who, `select public.admin_set_template_enabled($1, $2) as r`, [key, enabled]).then((x) => x.r);
const remove = (who, key) => call(who, `select public.admin_delete_template($1) as r`, [key]).then((x) => x.r);
const audits = (action, key) => sql(c, `select * from public.audit_log where action = $1 and target_id = $2 order by id`, [action, key]);
const template = (key) => sql(c, `select * from public.message_templates where key = $1`, [key]);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_template_state" }));
  await seedFixtures(c);
  await sql(c, `
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into auth.users (id, email) values ('${SUPPORT}', 'support@test');
    insert into public.admins (user_id, role, email) values ('${SUPPORT}', 'support', 'support@test');
    insert into public.message_templates (key, channel, body_en) values
      ('promo_one', 'sms', 'Hello'), ('welcome', 'email', 'Welcome'), ('login_details', 'sms', 'Login'),
      ('application.approve', 'email', 'Approved'), ('billing_reminder', 'sms', 'Pay');
  `);
});
after(async () => { await c.end(); });

test("the owner disables and enables a template, and each change is audited", async () => {
  assert.equal(await setEnabled(asAdmin, "promo_one", false), true);
  assert.ok((await template("promo_one"))[0].disabled_at);
  const [off] = await audits("template.disable", "promo_one");
  assert.deepEqual(off.before, { enabled: true });
  assert.deepEqual(off.after, { enabled: false });

  assert.equal(await setEnabled(asAdmin, "promo_one", true), true);
  assert.equal((await template("promo_one"))[0].disabled_at, null);
  assert.equal((await audits("template.enable", "promo_one")).length, 1);
});

test("repeating a change does nothing and adds no audit entry", async () => {
  assert.equal(await setEnabled(asAdmin, "promo_one", true), false);
  assert.equal((await audits("template.enable", "promo_one")).length, 1);
});

test("system templates can be disabled but not deleted", async () => {
  for (const key of ["welcome", "login_details", "application.approve", "billing_reminder"]) {
    await rejects(asAdmin, `select public.admin_delete_template($1)`, [key], /template_in_use/);
    assert.equal((await template(key)).length, 1);
  }
  assert.equal(await setEnabled(asAdmin, "welcome", false), true);
  await setEnabled(asAdmin, "welcome", true);
});

test("the list says which templates are system templates and which are disabled", async () => {
  await setEnabled(asAdmin, "promo_one", false);
  const list = (await call(asSupport, `select public.admin_templates_list() as r`)).r;
  const byKey = Object.fromEntries(list.map((t) => [t.key, t]));
  assert.equal(byKey.welcome.system, true);
  assert.equal(byKey.billing_reminder.system, true);
  assert.equal(byKey.promo_one.system, false);
  assert.ok(byKey.promo_one.disabled_at);
  assert.equal(byKey.welcome.disabled_at, null);
  await setEnabled(asAdmin, "promo_one", true);
});

test("deleting a template removes it and keeps what it said in the audit entry", async () => {
  await sql(c, `insert into public.message_templates (key, channel, body_en) values ('old_promo', 'sms', 'Old text')`);
  assert.equal(await remove(asAdmin, "old_promo"), true);
  assert.equal((await template("old_promo")).length, 0);
  const [entry] = await audits("template.delete", "old_promo");
  assert.equal(entry.before.body_en, "Old text");
});

test("only the owner may change templates, and bad input has stable codes", async () => {
  await rejects(asSupport, `select public.admin_set_template_enabled('promo_one', false)`, [], /forbidden/);
  await rejects(asSupport, `select public.admin_delete_template('promo_one')`, [], /forbidden/);
  await rejects(asA, `select public.admin_delete_template('promo_one')`, [], /forbidden/);
  await rejects(asAdmin, `select public.admin_set_template_enabled(null, true)`, [], /invalid_input/);
  await rejects(asAdmin, `select public.admin_set_template_enabled('promo_one', null)`, [], /invalid_input/);
  await rejects(asAdmin, `select public.admin_set_template_enabled('missing', true)`, [], /template_not_found/);
  await rejects(asAdmin, `select public.admin_delete_template('missing')`, [], /template_not_found/);
  assert.equal((await template("promo_one"))[0].disabled_at, null);
});

test("a category segment matches the category name or its id, and a town matches in any case", async () => {
  const [cat] = await sql(c, `select c.id, c.name from public.categories c join public.businesses b on b.category_id = c.id where b.id = $1`, [ids.bizA]);
  await sql(c, `update public.businesses set status = 'live', town = 'Maseno' where id = $1`, [ids.bizA]);
  const seg = async (s) => (await call(asService, `select coalesce(array_agg(x), '{}') as r from public.message_segment($1) x`, [s])).r;
  assert.ok((await seg(`category:${cat.id}`)).includes(ids.bizA));
  assert.ok((await seg(`category:${cat.name}`)).includes(ids.bizA));
  assert.ok((await seg(`category:${cat.name.toUpperCase()}`)).includes(ids.bizA));
  assert.equal((await seg("category:nothing-like-this")).length, 0);
  assert.ok((await seg("town:MASENO")).includes(ids.bizA));
});
