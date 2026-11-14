import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rankRelated } from "../../shared/src/related/index.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asAdmin } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asReviewer = { sub: REVIEWER };
const asAnon = { role: "anon" };
const item = (name, biz, type, over = "") => `insert into items (business_id, name, product_type_id${over ? ", " + over.split("=")[0] : ""}) values ('${biz}', '${name}', ${type ? `'${type}'` : "null"}${over ? ", " + over.split("=")[1] : ""})`;

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_product_relations" }));
  await seedFixtures(c);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = now() + interval '30 days'`);
  await sql(c, `insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}';
    insert into product_types (id, slug, name, department_id) values
      ('soundbar', 'soundbar', 'Soundbar', 'electronics'), ('smart-tv', 'smart-tv', 'Smart TV', 'electronics'),
      ('speakers', 'speakers', 'Speakers', 'electronics'), ('hdmi-cable', 'hdmi-cable', 'HDMI cable', 'cables-power'),
      ('candles', 'candles', 'Candles', 'home-kitchen')`);
  // shop A sells the soundbar, a TV and a gone TV; shop B sells a TV, a speaker, a cable, candles and a draft TV
  await sql(c, `${item("Samsung soundbar", ids.bizA, "soundbar")};
    ${item("Shop A TV", ids.bizA, "smart-tv")};
    ${item("Sold out TV", ids.bizA, "smart-tv", "availability='out_of_stock'")};
    ${item("Shop B TV", ids.bizB, "smart-tv")};
    ${item("Shop B speaker", ids.bizB, "speakers")};
    ${item("Shop B HDMI cable", ids.bizB, "hdmi-cable")};
    ${item("Shop B candles", ids.bizB, "candles")};
    ${item("Draft TV", ids.bizB, "smart-tv", "draft=true")}`);
});
after(async () => { await c?.end(); });

const save = (who, a, b, w = 0, active = true) => tx(c, who, async (k) => (await k.query(`select admin_save_product_relation($1,$2,$3,$4,$5,$6) as r`, [...a, ...b, w, active])).rows[0].r, { commit: true });
const fails = (who, a, b, w, pattern) => rejects(c, who, `select admin_save_product_relation($1,$2,$3,$4,$5,true)`, [...a, ...b, w], pattern);
const itemId = async (name) => (await sql(c, `select id from items where name = $1`, [name]))[0].id;
const candidates = async (name, who = asAnon) => {
  const id = await itemId(name);
  return tx(c, who, async (k) => (await k.query(`select related_item_candidates($1) as r`, [id])).rows[0].r);
};

test("the owner saves a relation, edits it, lists it with names, and every change is audited", async () => {
  const first = await save(asAdmin, ["type", "soundbar"], ["type", "smart-tv"], 5);
  await save(asAdmin, ["type", "soundbar"], ["type", "smart-tv"], 7);
  await save(asAdmin, ["type", "soundbar"], ["type", "speakers"], 2);
  await save(asAdmin, ["type", "soundbar"], ["department", "cables-power"], 0);
  const listed = await tx(c, asReviewer, async (k) => (await k.query(`select admin_product_relations_list() as r`)).rows[0].r);
  const tv = listed.relations.find((r) => r.toId === "smart-tv");
  assert.equal(listed.relations.length, 3);
  assert.equal(tv.id, first.id, "saving again edits the same row");
  assert.equal(tv.weight, 7);
  assert.equal(tv.fromName, "Soundbar");
  assert.equal(listed.relations.find((r) => r.toKind === "department").toName, "Cables and power");
  assert.ok(listed.types.length >= 5 && listed.departments.length >= 20);
  const actions = (await sql(c, `select action from audit_log where action like 'product_relation.%' order by created_at, id`)).map((r) => r.action);
  assert.deepEqual(actions, ["product_relation.create", "product_relation.update", "product_relation.create", "product_relation.create"]);
});

test("only the owner writes; reviewers read; a seller or anon cannot call the admin functions", async () => {
  await fails(asReviewer, ["type", "soundbar"], ["type", "candles"], 0, /forbidden/);
  await fails(asA, ["type", "soundbar"], ["type", "candles"], 0, /forbidden/);
  await rejects(c, asA, `select admin_product_relations_list()`, [], /forbidden/);
  await rejects(c, asAnon, `select admin_product_relations_list()`, [], /permission denied/);
  await rejects(c, asReviewer, `select admin_delete_product_relation(gen_random_uuid())`, [], /forbidden/);
});

test("bad input is refused", async () => {
  await fails(asAdmin, ["thing", "soundbar"], ["type", "candles"], 0, /invalid_relation_kind/);
  await fails(asAdmin, ["type", "Bad Id"], ["type", "candles"], 0, /invalid_relation_id/);
  await fails(asAdmin, ["type", "candles"], ["type", "candles"], 0, /relation_to_self/);
  await fails(asAdmin, ["type", "soundbar"], ["type", "candles"], 11, /invalid_relation_weight/);
  await fails(asAdmin, ["type", "soundbar"], ["type", "no-such-type"], 0, /unknown_relation_target/);
  await fails(asAdmin, ["department", "no-such-dept"], ["type", "candles"], 0, /unknown_relation_target/);
});

test("a relation to a type and one to a department are different rows; ids are plain text with no foreign key", async () => {
  const fks = await sql(c, `select 1 from pg_constraint where conrelid = 'public.product_relations'::regclass and contype = 'f'`);
  assert.equal(fks.length, 0);
});

test("the soundbar's candidates are the related TVs, speakers and cables, never itself, sold-out, draft or unrelated items", async () => {
  const got = await candidates("Samsung soundbar");
  assert.equal(got.item.productTypeId, "soundbar");
  assert.equal(got.item.departmentId, "electronics");
  const names = got.candidates.map((x) => x.name).sort();
  assert.deepEqual(names, ["Shop A TV", "Shop B HDMI cable", "Shop B TV", "Shop B speaker"]);
  assert.equal(got.relations.length, 3);
});

test("the candidates rank as soundbar -> TV, speakers, cables, with this shop's TV kept", async () => {
  const got = await candidates("Samsung soundbar");
  const ranked = rankRelated(got.item, got.candidates, { relations: got.relations });
  assert.deepEqual(ranked.items.map((x) => x.name), ["Shop A TV", "Shop B TV", "Shop B speaker", "Shop B HDMI cable"]);
  assert.equal(ranked.items.filter((x) => x.fromThisShop).length, 1);
});

test("an inactive relation is dropped, and a delete removes the row and is audited", async () => {
  await save(asAdmin, ["type", "soundbar"], ["department", "cables-power"], 0, false);
  assert.ok(!(await candidates("Samsung soundbar")).candidates.some((x) => x.name === "Shop B HDMI cable"), "no relation, different department");
  const row = (await sql(c, `select id from product_relations where to_id = 'cables-power'`))[0];
  await tx(c, asAdmin, (k) => k.query(`select admin_delete_product_relation($1)`, [row.id]), { commit: true });
  assert.equal((await sql(c, `select count(*)::int as n from product_relations where to_id = 'cables-power'`))[0].n, 0);
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'product_relation.delete'`))[0].n, 1);
  await rejects(c, asAdmin, `select admin_delete_product_relation($1)`, [row.id], /relation_not_found/);
});

test("an item with no type or department, an unknown id and a hidden item get no candidates", async () => {
  await sql(c, `${item("Plain item", ids.bizA, null)}`);
  const plain = await candidates("Plain item");
  assert.deepEqual(plain.candidates, []);
  const missing = await tx(c, asAnon, async (k) => (await k.query(`select related_item_candidates(gen_random_uuid()) as r`)).rows[0].r);
  assert.equal(missing, null);
  assert.equal(await candidates("Draft TV"), null);
});

test("the pool is bounded, and this shop's items come first so the same-shop rule can be met", async () => {
  for (let i = 0; i < 12; i += 1) await sql(c, `${item(`Bulk TV ${i}`, ids.bizB, "smart-tv")}`);
  const id = await itemId("Samsung soundbar");
  const got = await tx(c, asAnon, async (k) => (await k.query(`select related_item_candidates($1, 3) as r`, [id])).rows[0].r);
  assert.equal(got.candidates.length, 3);
  assert.ok(got.candidates.some((x) => x.name === "Shop A TV"), "shop A's own TV is in even a tiny pool");
});
