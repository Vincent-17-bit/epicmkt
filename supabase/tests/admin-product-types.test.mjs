import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, asA, asAdmin, ids } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asReviewer = { sub: REVIEWER };
const axis = (key, over = {}) => ({ key, label: key, display: "button", ...over });
const type = (over = {}) => ({ name: "Tablet", departmentId: null, categoryIds: [], axes: [axis("storage", { suggested: [{ id: "64-gb", label: "64 GB" }] })], ...over });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_admin_product_types" }));
  await seedFixtures(c);
  await sql(c, `insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}'`);
});
after(async () => { await c?.end(); });

const save = (who, id, t) => tx(c, who, async (k) => (await k.query(`select admin_save_product_type($1, $2::jsonb) as r`, [id, JSON.stringify(t)])).rows[0].r, { commit: true });
const fails = (who, id, t, pattern) => rejects(c, who, `select admin_save_product_type($1, $2::jsonb)`, [id, JSON.stringify(t)], pattern);
const list = (who) => tx(c, who, async (k) => (await k.query(`select admin_product_types_list() as r`)).rows[0].r);

test("the owner creates a type, edits it, and both are audited and listed", async () => {
  await save(asAdmin, "tablet", type());
  await save(asAdmin, "tablet", type({ name: "Tablets", axes: [axis("storage"), axis("colour", { display: "swatch" })] }));
  const got = (await list(asReviewer)).types.find((t) => t.id === "tablet");
  assert.equal(got.name, "Tablets");
  assert.deepEqual(got.axes.map((a) => a.key), ["storage", "colour"]);
  const actions = (await sql(c, `select action from audit_log where target_id = 'tablet' order by created_at`)).map((r) => r.action);
  assert.deepEqual(actions, ["product_type.create", "product_type.update"]);
});

test("the list also carries departments and categories", async () => {
  const r = await list(asReviewer);
  assert.ok(Array.isArray(r.departments) && Array.isArray(r.categories));
});

test("only the owner can save; a seller cannot even list", async () => {
  await fails(asReviewer, "tablet", type(), /forbidden/);
  await fails(asA, "tablet", type(), /forbidden/);
  await rejects(c, asA, `select admin_product_types_list()`, [], /forbidden/);
});

test("bad input is refused", async () => {
  await fails(asAdmin, "Bad Id", type(), /invalid_type_id/);
  await fails(asAdmin, "tablet", type({ name: " " }), /invalid_type_name/);
  await fails(asAdmin, "tablet", type({ departmentId: "nope" }), /invalid_department/);
  await fails(asAdmin, "tablet", type({ categoryIds: ["nope"] }), /invalid_categories/);
  await fails(asAdmin, "tablet", type({ axes: [axis("Bad Key")] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a"), axis("a")] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a", { display: "sparkle" })] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: ["a", "b", "c", "d"].map((k) => axis(k)) }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a", { suggested: [{ id: "Bad Id", label: "x" }] })] }), /invalid_axes/);
});
