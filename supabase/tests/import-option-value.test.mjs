// Migration 0112: admin_import_option_value adds an approved open value (or finds the one that is there) for a category kit import.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const supportId = "00000000-0000-0000-0000-0000000000c1";
const asSupport = { sub: supportId };

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_import_value" }));
  await seedFixtures(c);
  await sql(c, `insert into auth.users (id, email) values ('${supportId}', 'support@test')`);
  await sql(c, `insert into public.admins (user_id, role) values ('${supportId}', 'support')`);
});
after(async () => { await c?.end(); });
beforeEach(async () => { await sql(c, `delete from item_option_value_uses; delete from option_values; delete from audit_log where action like 'option_value.%'`); });

const imp = (kind, label, fields = null, who = asAdmin) =>
  tx(c, who, async (k) => (await sql(k, `select admin_import_option_value($1, $2, $3::jsonb) as r`, [kind, label, fields ? JSON.stringify(fields) : null]))[0].r, { commit: true });
const rows = () => sql(c, `select kind, key, label, status, tags, hex from option_values order by kind, key`);

test("a new value is created as approved, with its tags and shade", async () => {
  const r = await imp("color", "Wine red", { hex: "#7B1E3A", tags: ["Dark", "warm"] });
  assert.equal(r.created, true);
  assert.equal(r.value.status, "approved");
  assert.equal(r.value.hex, "#7b1e3a");
  assert.deepEqual(r.value.tags, ["dark", "warm"]);
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'option_value.import'`))[0].n, 1);
});

test("importing the same value again, in any spelling, finds it and adds nothing", async () => {
  await imp("material", "Rose gold");
  const again = await imp("material", "  rose  GOLD ");
  assert.equal(again.created, false);
  assert.equal((await rows()).length, 1);
  assert.equal((await rows())[0].label, "Rose gold", "the first spelling is kept");
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'option_value.import'`))[0].n, 1, "no second audit row");
});

test("a pending value that a seller typed is approved by the import", async () => {
  await sql(c, `insert into option_values (kind, key, label, status) values ('brand', 'samsung', 'Samsung', 'pending')`);
  const r = await imp("brand", "SAMSUNG");
  assert.equal(r.created, false);
  assert.equal(r.value.status, "approved");
  assert.equal((await rows())[0].status, "approved");
});

test("an import fills in tags and a shade that are missing but never overwrites what a reviewer chose", async () => {
  await sql(c, `insert into option_values (kind, key, label, status, tags, hex) values ('color', 'sand', 'Sand', 'approved', '{beige}', null), ('color', 'sky', 'Sky', 'approved', '{}', '#112233')`);
  const sand = await imp("color", "Sand", { tags: ["other"], hex: "#c2b280" });
  assert.deepEqual(sand.value.tags, ["beige"], "tags kept");
  assert.equal(sand.value.hex, "#c2b280", "the missing shade is added");
  const sky = await imp("color", "Sky", { tags: ["cool"], hex: "#ffffff" });
  assert.deepEqual(sky.value.tags, ["cool"], "empty tags are filled");
  assert.equal(sky.value.hex, "#112233", "the shade stays");
});

test("a merged value does not block a new one with the same key", async () => {
  await sql(c, `insert into option_values (id, kind, key, label, status) values ('00000000-0000-0000-0000-00000000aa01', 'brand', 'samsng', 'Samsng', 'pending'), ('00000000-0000-0000-0000-00000000aa02', 'brand', 'samsung', 'Samsung', 'approved');
    update option_values set status = 'merged', merged_into = '00000000-0000-0000-0000-00000000aa02' where id = '00000000-0000-0000-0000-00000000aa01'`);
  const r = await imp("brand", "Samsung");
  assert.equal(r.created, false);
  assert.equal(r.value.id, "00000000-0000-0000-0000-00000000aa02");
});

test("bad input is refused and nothing is written", async () => {
  const bad = (kind, label, fields, pattern) => rejects(c, asAdmin, `select admin_import_option_value($1, $2, $3::jsonb)`, [kind, label, fields ? JSON.stringify(fields) : null], pattern);
  await bad("nonsense", "X", null, /invalid_kind/);
  await bad(null, "X", null, /invalid_kind/);
  await bad("brand", "", null, /invalid_label/);
  await bad("brand", "   ", null, /invalid_label/);
  await bad("brand", "x".repeat(61), null, /invalid_label/);
  await bad("brand", "!!!", null, /invalid_label/);
  await bad("brand", "Fine", [1], /invalid_fields/);
  await bad("material", "Cotton", { hex: "#123456" }, /invalid_hex/);
  await bad("color", "Teal", { hex: "teal" }, /invalid_hex/);
  await bad("color", "Teal", { tags: ["1", "2", "3", "4", "5", "6", "7", "8", "9"] }, /invalid_tags/);
  assert.equal((await rows()).length, 0);
});

test("reviewers and the owner may import; support and sellers may not", async () => {
  await rejects(c, asSupport, `select admin_import_option_value('brand', 'Nokia', null)`, [], /forbidden/);
  await rejects(c, asA, `select admin_import_option_value('brand', 'Nokia', null)`, [], /forbidden/);
  assert.equal((await imp("brand", "Nokia")).created, true);
});
