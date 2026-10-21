import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

// 0027_admin_categories.sql
let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const FINANCE = "00000000-0000-0000-0000-0000000000c2";
const asReviewer = { sub: REVIEWER };
const asFinance = { sub: FINANCE };
const call = (who, text, params = []) => tx(c, who, async (k) => (await sql(k, text, params))[0].r, { commit: true });
const save = (who, o = {}) => call(who, `select admin_save_category($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10) as r`, [
  o.id ?? "salon", o.name ?? "Salon", o.grp ?? "Beauty", o.icon ?? "scissors", o.tier ?? "A", o.sort ?? 5, o.active ?? false,
  JSON.stringify(o.template ?? []), JSON.stringify(o.docs ?? []), o.reason ?? null]);
const rej = (o, re) => rejects(c, asAdmin, `select admin_save_category($1, 'Salon', 'Beauty', 'scissors', 'A', 5, false, $2::jsonb, $3::jsonb, null)`, [o.id ?? "salon", JSON.stringify(o.template ?? []), JSON.stringify(o.docs ?? [])], re);
const f = (over = {}) => ({ key: "walkIns", label: "Walk-ins welcome", type: "boolean", ...over });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_0027" }));
  await seedFixtures(c);
  await sql(c, `
    insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test'), ('${FINANCE}', 'finance@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test'), ('${FINANCE}', 'finance', 'finance@test');
    update public.admins set role = 'owner', email = 'owner@test' where user_id = '${ids.admin}';
  `);
});
after(async () => { await c.end(); });

test("any admin lists categories with business counts and pricing state; sellers cannot", async () => {
  const rows = await call(asReviewer, `select admin_categories_list() as r`);
  const barber = rows.find((r) => r.id === "barber");
  assert.equal(barber.live_businesses, 2);
  assert.equal(barber.priced_plans, 2);
  await rejects(c, asA, `select admin_categories_list()`, [], /forbidden/);
});

test("only the owner changes categories", async () => {
  await rejects(c, asFinance, `select admin_save_category('salon', 'Salon', 'Beauty', 'scissors', 'A', 5, false, '[]', '[]', null)`, [], /forbidden/);
  await rejects(c, asReviewer, `select admin_save_category('salon', 'Salon', 'Beauty', 'scissors', 'A', 5, false, '[]', '[]', null)`, [], /forbidden/);
});

test("a new category starts off with two unpriced plans and cannot be switched on until both are priced", async () => {
  const created = await save(asAdmin, { template: [f()], docs: [{ key: "licence", label: "Salon licence", rule: "required", why: "Proves the salon is licensed." }] });
  assert.equal(created, true);
  const [cat] = await sql(c, `select active, jsonb_array_length(template) as t, jsonb_array_length(extra_docs) as d from categories where id = 'salon'`);
  assert.deepEqual(cat, { active: false, t: 1, d: 1 });
  const plans = await sql(c, `select plan_key, price_kes from plans where category_id = 'salon' order by plan_key`);
  assert.deepEqual(plans, [{ plan_key: "premium", price_kes: 0 }, { plan_key: "standard", price_kes: 0 }]);
  await rejects(c, asAdmin, `select admin_save_category('salon', 'Salon', 'Beauty', 'scissors', 'A', 5, true, '[]', '[]', null)`, [], /plans_not_priced/);
  await sql(c, `update plans set price_kes = 500 where category_id = 'salon'`);
  assert.equal(await save(asAdmin, { active: true }), false, "an update, not a create");
  assert.equal((await sql(c, `select active from categories where id = 'salon'`))[0].active, true);
});

test("switching a live category off needs a reason; sellers already in it are untouched", async () => {
  await rejects(c, asAdmin, `select admin_save_category('barber', 'Barber', 'Beauty', 'store', 'A', 1, false, '[]', '[]', null)`, [], /reason_required/);
  await save(asAdmin, { id: "barber", name: "Barber", sort: 1, active: false, reason: "Merged into Salon" });
  assert.equal((await sql(c, `select count(*)::int as n from businesses where category_id = 'barber' and status = 'live'`))[0].n, 2);
  const a = await sql(c, `select action from audit_log where target_id = 'barber' and action like 'category.%'`);
  assert.deepEqual(a.map((x) => x.action), ["category.update"]);
});

test("template validation protects the public application form", async () => {
  await rej({ template: "nope" }, /invalid_template/);
  await rej({ template: [f({ key: "1bad" })] }, /invalid_field_key/);
  await rej({ template: [f({ key: "has space" })] }, /invalid_field_key/);
  await rej({ template: [f(), f()] }, /duplicate_field_key/);
  await rej({ template: [f({ label: " " })] }, /invalid_field_label/);
  await rej({ template: [f({ type: "file" })] }, /invalid_field_type/);
  await rej({ template: [f({ type: "select" })] }, /options_required/);
  await rej({ template: [f({ type: "select", options: ["Only one"] })] }, /options_required/);
  await rej({ template: [f({ type: "multiselect", options: ["A", ""] })] }, /invalid_option/);
  await rej({ template: [f({ key: "a" }), f({ key: "b", showIf: { field: "ghost", equals: true } })] }, /invalid_condition/);
  await rej({ template: [f({ key: "a", showIf: { field: "a", equals: true } })] }, /invalid_condition/);
  await rej({ template: [f({ key: "a" }), f({ key: "b", showIf: { equals: true } })] }, /invalid_condition/); // no field named at all
  await rej({ template: Array.from({ length: 41 }, (_, i) => f({ key: `k${i}` })) }, /too_many_fields/);
  // Valid, including a condition on another field and every type.
  await save(asAdmin, { id: "salon", active: true, template: [
    f({ key: "delivery" }), f({ key: "area", label: "Area", type: "text", showIf: { field: "delivery", equals: true } }),
    f({ key: "price", label: "Price", type: "price", required: true, showOnCard: true }), f({ key: "n", label: "Chairs", type: "number" }),
    f({ key: "kind", label: "Kind", type: "select", options: ["Hair", "Nails"], filterable: true }), f({ key: "many", label: "Many", type: "multiselect", options: ["A", "B"] }),
    f({ key: "menu", label: "Menu", type: "itemlist" })] });
});

test("document validation", async () => {
  const d = (over = {}) => ({ key: "licence", label: "Licence", rule: "required", why: "Because.", ...over });
  await rej({ docs: "x" }, /invalid_docs/);
  await rej({ docs: [d({ key: "Bad Key" })] }, /invalid_doc_key/);
  await rej({ docs: [d(), d()] }, /duplicate_doc_key/);
  await rej({ docs: [d({ rule: "optional" })] }, /invalid_doc_rule/);
  await rej({ docs: [d({ rule: "conditional" })] }, /condition_required/);
  await rej({ docs: [d({ why: "" })] }, /invalid_doc_why/);
  await save(asAdmin, { id: "salon", active: true, docs: [d(), d({ key: "kebs", rule: "conditional", condition: "I carry a KEBS mark" })] });
});

test("identity fields are validated and every save is audited", async () => {
  await rejects(c, asAdmin, `select admin_save_category('Bad Id', 'X', 'Y', 'store', 'A', 1, false, '[]', '[]', null)`, [], /invalid_id/);
  await rejects(c, asAdmin, `select admin_save_category('ok-id', 'X', 'Group', 'store', 'A', 1, false, '[]', '[]', null)`, [], /invalid_input/);
  await rejects(c, asAdmin, `select admin_save_category('ok-id', 'Name', 'Group', 'Bad Icon', 'A', 1, false, '[]', '[]', null)`, [], /invalid_icon/);
  await rejects(c, asAdmin, `select admin_save_category('ok-id', 'Name', 'Group', 'store', 'Z', 1, false, '[]', '[]', null)`, [], /invalid_tier/);
  const a = await sql(c, `select action from audit_log where target_id = 'salon' order by id`);
  assert.equal(a[0].action, "category.create");
  assert.ok(a.slice(1).every((x) => x.action === "category.update"));
});
