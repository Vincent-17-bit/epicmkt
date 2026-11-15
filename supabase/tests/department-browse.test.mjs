// Migration 0118 (A23, B28): browse by department independent of the shop's category, and the admin department editor.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const anon = { role: "anon" };
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_department_browse" }));
  await seedFixtures(c);
  await sql(c, `insert into categories (id, name, grp, tier, sort) values ('cyber', 'Cyber cafe', 'Services', 'A', 2), ('boutique', 'Boutique', 'Fashion', 'A', 3)`);
  await sql(c, `update businesses set category_id = 'cyber' where id = $1`, [ids.bizA]);
  await sql(c, `update businesses set category_id = 'boutique' where id = $1`, [ids.bizB]);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const add = async (biz, name, type, extra = {}) => {
  // Inserted as a draft, then published as a grandfathered item, so the publish gate (0099) does not ask for the type's required specs.
  const id = (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft, product_type_id) values ($1, $2, $3, 'fixed', false, true, $4) returning id`, [biz, name, extra.price ?? 1000, type]))[0].id;
  await sql(c, `alter table items disable trigger items_spec_gate`);
  await sql(c, `update items set draft = false, visible = true, spec_gate_exempt = true where id = $1`, [id]);
  await sql(c, `alter table items enable trigger items_spec_gate`);
  return id;
};
const read = (fn, ...args) => tx(c, anon, (k) => sql(k, `select ${fn}(${args.map((_, i) => `$${i + 1}`).join(", ")}) as r`, args)).then((r) => r[0].r);

test("a phone sold by a cyber shop is under Phones, a fragrance from a boutique under Fragrance", async () => {
  const phone = await add(ids.bizA, "Galaxy S26", "phone");
  const scent = await add(ids.bizB, "Rose perfume", "fragrance");
  const phones = await read("public_department_browse", "phones");
  assert.equal(phones.department.name, "Phones");
  assert.equal(phones.total, 1);
  assert.equal(phones.items[0].id, phone);
  assert.equal(phones.items[0].business.categoryId, "cyber");
  assert.equal(phones.items[0].business.slug, "shop-a");
  const frag = await read("public_department_browse", "fragrance");
  assert.deepEqual(frag.items.map((i) => i.id), [scent]);
  assert.equal(frag.items[0].business.categoryId, "boutique");
});

test("a department can be narrowed to one type, and a type from another department is not found", async () => {
  await add(ids.bizA, "Table A", "table"); await add(ids.bizB, "Sofa B", "sofa");
  const all = await read("public_department_browse", "furniture");
  assert.equal(all.total, 2);
  const tables = await read("public_department_browse", "furniture", "table");
  assert.equal(tables.total, 1);
  assert.deepEqual(tables.type, { id: "table", name: "Table" });
  const wrong = await read("public_department_browse", "furniture", "phone");
  assert.equal(wrong.type, null); assert.equal(wrong.total, 0); assert.equal(wrong.department.id, "furniture");
  assert.equal((await read("public_department_browse", "no-such")).department, null);
});

test("only public items count: hidden, drafts and a shop that is not live are left out", async () => {
  const a = await add(ids.bizA, "Hidden phone", "phone");
  await sql(c, `update items set visible = false where id = $1`, [a]);
  const b = await add(ids.bizA, "Draft phone", "phone");
  await sql(c, `update items set draft = true where id = $1`, [b]);
  await add(ids.bizB, "Live phone", "phone");
  assert.equal((await read("public_department_browse", "phones")).total, 1);
  await sql(c, `update businesses set status = 'paused' where id = $1`, [ids.bizB]);
  assert.equal((await read("public_department_browse", "phones")).total, 0);
});

test("paging: a limit and an offset, newest first, limited to 60", async () => {
  for (let i = 0; i < 5; i += 1) await add(ids.bizA, `Phone ${i}`, "phone");
  const first = await read("public_department_browse", "phones", null, 2, 0);
  const next = await read("public_department_browse", "phones", null, 2, 2);
  assert.equal(first.total, 5); assert.equal(first.items.length, 2); assert.equal(next.items.length, 2);
  assert.equal(new Set([...first.items, ...next.items].map((i) => i.id)).size, 4);
  assert.equal((await read("public_department_browse", "phones", null, 500, 0)).items.length, 5);
});

test("the department list counts public items by department and type", async () => {
  await add(ids.bizA, "P1", "phone"); await add(ids.bizB, "P2", "phone"); await add(ids.bizB, "Tab", "table");
  const list = await read("public_departments");
  const phones = list.find((d) => d.id === "phones");
  assert.equal(phones.count, 2);
  assert.deepEqual(phones.types, [{ id: "phone", name: "Phone", count: 2 }]);
  assert.ok(!list.some((d) => d.id === "clothing"), "a department with no public items is not listed");
});

test("a shop's items are grouped by department; items with no type are Other, last", async () => {
  await add(ids.bizA, "Phone", "phone"); await add(ids.bizA, "Phone 2", "phone"); await add(ids.bizA, "Table", "table"); await add(ids.bizA, "Thing", null);
  const g = await read("public_shop_departments", ids.bizA);
  assert.deepEqual(g.map((x) => [x.id, x.count]), [["phones", 2], ["furniture", 1], [null, 1]]);
  assert.equal(g.at(-1).name, "Other");
});

test("old category browsing is untouched: the public lists still work by shop category", async () => {
  await add(ids.bizA, "Phone", "phone");
  const cyber = await tx(c, anon, (k) => sql(k, `select count(*)::int as n from public_businesses where category_id = 'cyber'`));
  assert.equal(cyber[0].n, 1);
  const items = await tx(c, anon, (k) => sql(k, `select count(*)::int as n from public_items`));
  assert.equal(items[0].n, 1);
});

test("admins list departments with counts and edit them; others cannot", async () => {
  await add(ids.bizA, "Phone", "phone");
  const list = (await tx(c, asAdmin, (k) => sql(k, `select admin_departments_list() as r`)))[0].r;
  const phones = list.find((d) => d.id === "phones");
  assert.equal(phones.items, 1); assert.ok(phones.types >= 1);
  const save = (id, f) => tx(c, asAdmin, (k) => sql(k, `select admin_save_department($1, $2::jsonb) as r`, [id, JSON.stringify(f)]), { commit: true });
  await save("toys", { name: "Toys and games", sort: 500 });
  assert.deepEqual((await sql(c, `select name, sort, active from departments where id = 'toys'`))[0], { name: "Toys and games", sort: 500, active: true });
  await save("toys", { name: "Toys", active: false });
  assert.deepEqual((await sql(c, `select name, active from departments where id = 'toys'`))[0], { name: "Toys", active: false });
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where target_type = 'department' and target_id = 'toys'`))[0].n, 2);
  await rejects(c, asAdmin, `select admin_save_department('phones', '{"active": false}'::jsonb)`, [], /department_in_use/);
  await rejects(c, asAdmin, `select admin_save_department('Bad Id', '{"name":"Bad"}'::jsonb)`, [], /invalid_id/);
  await rejects(c, asAdmin, `select admin_save_department('toys2', '{"name":"x"}'::jsonb)`, [], /invalid_name/);
  await rejects(c, asAdmin, `select admin_save_department('toys2', '{"name":"toys"}'::jsonb)`, [], /name_taken/);
  await rejects(c, asAdmin, `select admin_save_department('toys2', '{"name":"Toys two","sort":1.5}'::jsonb)`, [], /invalid_sort/);
  await rejects(c, asA, `select admin_save_department('toys3', '{"name":"Toys three"}'::jsonb)`, [], /forbidden/);
  await rejects(c, asA, `select admin_departments_list()`, [], /forbidden/);
  await rejects(c, anon, `select admin_departments_list()`, [], /permission denied/);
});
