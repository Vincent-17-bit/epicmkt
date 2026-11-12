import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_TYPES } from "../../shared/src/contracts/index.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asReviewer = { sub: REVIEWER };
const phone = PRODUCT_TYPES.find((t) => t.id === "phone");
const rows = (r) => JSON.stringify(r);
const row = (key, over = {}) => ({ key, label: key, level: "optional", input: "text", ...over });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_admin_spec_rows" }));
  await seedFixtures(c);
  await sql(c, `insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into product_types (id, slug, name, spec_rows) values ('phone', 'phone', 'Phone', '${rows(phone.specRows)}'::jsonb) on conflict (id) do update set spec_rows = excluded.spec_rows`);
});
after(async () => { await c?.end(); });

const save = (who, id, r) => tx(c, who, async (k) => (await k.query(`select admin_save_spec_rows($1, $2::jsonb) as r`, [id, rows(r)])).rows[0].r, { commit: true });
const fails = (who, id, r, pattern) => rejects(c, who, `select admin_save_spec_rows($1, $2::jsonb)`, [id, rows(r)], pattern);

test("the owner saves rows and the change is audited; the list returns them", async () => {
  const next = [row("a", { level: "required" }), row("b", { requiredIf: { row: "a", present: true } })];
  assert.deepEqual(await save(asAdmin, "phone", next), next);
  const listed = await tx(c, asReviewer, async (k) => (await k.query(`select admin_spec_rows_list() as r`)).rows[0].r);
  assert.deepEqual(listed.find((t) => t.id === "phone").specRows, next);
  assert.ok((await sql(c, `select 1 from audit_log where action = 'spec_rows.update' and target_id = 'phone'`)).length >= 1);
});

test("only the owner can save; a seller cannot even list", async () => {
  await fails(asReviewer, "phone", [], /forbidden/);
  await fails(asA, "phone", [], /forbidden/);
  await rejects(c, asA, `select admin_spec_rows_list()`, [], /forbidden/);
});

test("bad rows are refused", async () => {
  await fails(asAdmin, "nope", [], /type_not_found/);
  await fails(asAdmin, "phone", [row("a"), row("a")], /invalid_spec_rows/);
  await fails(asAdmin, "phone", [row("A b")], /invalid_spec_rows/);
  await fails(asAdmin, "phone", [row("a", { input: "choice" })], /invalid_spec_rows/);
  await fails(asAdmin, "phone", [row("a", { showIf: { row: "a", present: true } })], /invalid_spec_rows/);
  await fails(asAdmin, "phone", [row("a", { showIf: { row: "zz", present: true } })], /invalid_spec_rows/);
  await fails(asAdmin, "phone", [row("a"), row("b", { showIf: { row: "a", equals: "x", present: true } })], /invalid_spec_rows/);
});

test("at most four required rows, and a requiredIf row counts", async () => {
  const four = ["a", "b", "c", "d"].map((k) => row(k, { level: "required" }));
  await save(asAdmin, "phone", four);
  await fails(asAdmin, "phone", [...four, row("e", { requiredIf: { row: "a", present: true } })], /too_many_required/);
});
