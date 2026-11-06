// Migration 0089: the open values dictionary (typed material, colour, brand), its type-ahead, and the admin review (approve, rename, merge).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { normalizeValueKey, KEY_CASES } from "../../shared/src/openValues.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
const supportId = "00000000-0000-0000-0000-0000000000c1";
const asSupport = { sub: supportId };
const anon = { role: "anon" };

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `insert into auth.users (id, email) values ('${supportId}', 'support@test')`);
  await sql(c, `insert into public.admins (user_id, role) values ('${supportId}', 'support')`);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_option_value_uses; delete from flash_sales; delete from item_history; delete from items; delete from option_values`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const find = (who, kind, q, limit) => as(who, `select seller_option_values($1, $2, $3) as r`, [kind, q, limit ?? 8]).then((r) => r[0].r);
const add = (who, kind, label, hex) => as(who, `select seller_add_option_value($1, $2, $3) as r`, [kind, label, hex ?? null]).then((r) => r[0].r);
const addFails = (who, kind, label, pattern, hex) => rejects(c, who, `select seller_add_option_value($1, $2, $3)`, [kind, label, hex ?? null], pattern);
const link = (who, item, uses) => as(who, `select seller_link_item_values($1::uuid, $2::jsonb) as n`, [item, JSON.stringify(uses)]).then((r) => r[0].n);
const approve = (id, fields) => as(asAdmin, `select admin_approve_option_value($1::uuid, $2::jsonb) as r`, [id, fields ? JSON.stringify(fields) : null]).then((r) => r[0].r);
const rename = (id, label) => as(asAdmin, `select admin_rename_option_value($1::uuid, $2) as r`, [id, label]).then((r) => r[0].r);
const merge = (from, into) => as(asAdmin, `select admin_merge_option_value($1::uuid, $2::uuid) as r`, [from, into]).then((r) => r[0].r);
const row = (id) => sql(c, `select * from option_values where id = $1`, [id]).then((r) => r[0]);
const newItem = async (biz = ids.bizA, extra = {}) => {
  const f = { name: "Card", price: 1000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]))[0].id;
};
const item = (id) => sql(c, `select * from items where id = $1`, [id]).then((r) => r[0]);
const axes = (label, id = "mahogany-veneer") => JSON.stringify([{ key: "material", label: "Material", display: "button", values: [{ id, label }, { id: "oak", label: "Oak" }] }]);
const specs = (value) => JSON.stringify([{ group: "Features & Specs", label: "Material", value }, { group: "Features & Specs", label: "Colour", value: "Black" }]);

test("normalize_value_key in Postgres gives the same key as normalizeValueKey on every case", async () => {
  for (const [raw, key] of KEY_CASES) {
    const r = (await sql(c, `select public.normalize_value_key($1) as k`, [raw]))[0].k;
    assert.equal(r, key, `sql ${JSON.stringify(raw)}`);
    assert.equal(normalizeValueKey(raw), r, `js ${JSON.stringify(raw)}`);
  }
  assert.equal((await sql(c, `select public.normalize_value_key(null) as k`))[0].k, "");
});

test("adding a value is usable at once, shown as typed, and queued as pending", async () => {
  const r = await add(asA, "material", "  Mahogany   Veneer ");
  assert.equal(r.created, true);
  assert.equal(r.value.label, "Mahogany Veneer");
  assert.equal(r.value.key, "mahogany veneer");
  assert.equal(r.value.status, "pending");
  const found = await find(asA, "material", "mahog");
  assert.deepEqual(found.matches.map((m) => m.label), ["Mahogany Veneer"]);   // other shops see it straight away
  assert.equal((await find(asB, "material", "mahog")).matches.length, 1);
  assert.equal((await sql(c, `select created_by_business from option_values`))[0].created_by_business, ids.bizA);
});

test('"Samsung", "SAMSUNG" and "samsung" are one value', async () => {
  const a = await add(asA, "brand", "Samsung");
  const b = await add(asB, "brand", "SAMSUNG");
  const d = await add(asA, "brand", " samsung ");
  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(d.created, false);
  assert.equal(b.value.id, a.value.id);
  assert.equal(b.value.label, "Samsung");   // the first spelling stays; the second is not a new choice
  assert.equal((await sql(c, `select count(*)::int as n from option_values`))[0].n, 1);
  const f = await find(asA, "brand", "SAMSUNG");
  assert.equal(f.matches.length, 1);
  assert.equal(f.canAdd, false);
});

test("the same text in two kinds is two values", async () => {
  await add(asA, "material", "Gold");
  await add(asA, "color", "Gold");
  assert.equal((await sql(c, `select count(*)::int as n from option_values`))[0].n, 2);
});

test('type-ahead: "Mahog" -> Mahogany, Mahogany veneer; approved first; canAdd when nothing matches exactly', async () => {
  const veneer = (await add(asA, "material", "Mahogany veneer")).value;
  const plain = (await add(asA, "material", "Mahogany")).value;
  await add(asA, "material", "African mahogany");
  await add(asA, "material", "Oak");
  await add(asA, "brand", "Mahogany Co");
  await approve(plain.id);
  const r = await find(asA, "material", "Mahog");
  assert.deepEqual(r.matches.map((m) => m.label), ["Mahogany", "Mahogany veneer", "African mahogany"]);
  assert.equal(r.matches[0].id, plain.id);
  assert.equal(r.canAdd, true);                       // "Mahog" is not a value yet
  assert.equal(r.addLabel, "Mahog");
  const exact = await find(asA, "material", "MAHOGANY VENEER");
  assert.equal(exact.canAdd, false);
  assert.equal(exact.matches[0].id, veneer.id);
  assert.deepEqual((await find(asA, "material", "zzz")).matches, []);
  assert.equal((await find(asA, "material", "")).matches.length, 4);   // empty query lists the values of that kind (the brand is not one)
  assert.equal((await find(asA, "material", "", 2)).matches.length, 2);
  assert.equal((await find(asA, "material", "   ")).canAdd, false);
});

test("a typed label that is only punctuation is refused", async () => {
  await addFails(asA, "material", "---", /invalid_label/);
  await addFails(asA, "material", "", /invalid_label/);
  await addFails(asA, "material", "x".repeat(61), /label_too_long/);
  await addFails(asA, "size", "Large", /invalid_kind/);
  assert.equal((await find(asA, "material", "--")).canAdd, false);
});

test("a colour can carry a shade; other kinds cannot; text colours stay without one", async () => {
  const wine = (await add(asA, "color", "Wine red", "#7B1E3A")).value;
  assert.equal(wine.hex, "#7b1e3a");
  assert.equal((await add(asA, "color", "Sand")).value.hex, null);
  await addFails(asA, "brand", "Nike", /invalid_hex/, "#ffffff");
  await addFails(asA, "color", "Teal", /invalid_hex/, "teal");
});

test("only sellers can use the seller functions; the table is closed to the browser", async () => {
  await rejects(c, anon, `select seller_option_values('brand', 'a')`, [], /permission denied|not_a_seller/);
  await rejects(c, { sub: ids.admin }, `select seller_add_option_value('brand', 'Nike')`, [], /not_a_seller/);
  await add(asA, "brand", "Nike");
  assert.equal((await as(asB, `select count(*)::int as n from option_values`))[0].n, 0);   // RLS: only admins see rows
  await rejects(c, anon, `select * from option_values`, [], /permission denied/);
  await rejects(c, asB, `insert into option_values (kind, key, label) values ('brand', 'x', 'X')`, [], /permission denied/);
  assert.equal((await as(asAdmin, `select count(*)::int as n from option_values`))[0].n, 1);   // admin may read
});

test("a shop cannot flood the review queue", async () => {
  for (let i = 0; i < 50; i += 1) await sql(c, `insert into option_values (kind, key, label, created_by_business) values ('brand', $1, $2, $3)`, [`b${i}`, `B${i}`, ids.bizA]);
  await addFails(asA, "brand", "One more", /too_many_pending/);
  assert.equal((await add(asB, "brand", "One more")).created, true);   // another shop is not blocked
  assert.equal((await add(asA, "brand", "B3")).created, false);       // an existing value never counts
});

test("admin functions need the reviewer role", async () => {
  const v = (await add(asA, "brand", "Nike")).value;
  for (const who of [asA, asSupport, anon]) {
    await rejects(c, who, `select admin_approve_option_value($1::uuid)`, [v.id], /forbidden|permission denied/);
    await rejects(c, who, `select admin_rename_option_value($1::uuid, 'Nikee')`, [v.id], /forbidden|permission denied/);
    await rejects(c, who, `select admin_merge_option_value($1::uuid, $1::uuid)`, [v.id], /forbidden|permission denied/);
    await rejects(c, who, `select admin_option_values()`, [], /forbidden|permission denied/);
  }
  assert.equal((await row(v.id)).status, "pending");
});

test("approve: status, tags and shade; the queue lists pending first-in; audit is written", async () => {
  const gold = (await add(asA, "material", "Gold")).value;
  const wine = (await add(asA, "color", "Wine red")).value;
  const q = await as(asAdmin, `select admin_option_values('pending', null, '', 10, 0) as r`).then((r) => r[0].r);
  assert.equal(q.total, 2);
  const r = await approve(gold.id, { tags: ["Precious Metal", "precious-metal", "jewellery"] });
  assert.equal(r.status, "approved");
  assert.deepEqual(r.tags, ["jewellery", "precious-metal"]);
  const w = await approve(wine.id, { hex: "#7B1E3A" });
  assert.equal(w.hex, "#7b1e3a");
  assert.equal((await as(asAdmin, `select admin_option_values('pending') as r`).then((x) => x[0].r)).total, 0);
  await rejects(c, asAdmin, `select admin_approve_option_value($1::uuid, '{"hex":"#fff000"}')`, [gold.id], /invalid_hex/);
  await rejects(c, asAdmin, `select admin_approve_option_value($1::uuid, '{"tags":["!!"]}')`, [gold.id], /invalid_tags/);
  const audit = await sql(c, `select action from audit_log where action like 'option_value.%' order by at`).catch(() => sql(c, `select action from audit_log where action like 'option_value.%'`));
  assert.ok(audit.some((a) => a.action === "option_value.approve"));
  const updated = await as(asAdmin, `select admin_update_option_value($1::uuid, '{"tags":["x"]}') as r`, [gold.id]).then((x) => x[0].r);
  assert.equal(updated.status, "approved");
  assert.deepEqual(updated.tags, ["x"]);
});

test("update keeps a pending value pending", async () => {
  const v = (await add(asA, "material", "Gold")).value;
  const r = await as(asAdmin, `select admin_update_option_value($1::uuid, '{"tags":["precious-metal"]}') as r`, [v.id]).then((x) => x[0].r);
  assert.equal(r.status, "pending");
});

test("seller_link_item_values: own items only, valid slots and ids, merged ids follow their target", async () => {
  const v = (await add(asA, "brand", "Samsung")).value;
  const mine = await newItem(ids.bizA);
  const theirs = await newItem(ids.bizB);
  assert.equal(await link(asA, mine, [{ slot: "brand", valueId: v.id }]), 1);
  await rejects(c, asA, `select seller_link_item_values($1::uuid, $2::jsonb)`, [theirs, JSON.stringify([{ slot: "brand", valueId: v.id }])], /item_not_found/);
  await rejects(c, asA, `select seller_link_item_values($1::uuid, $2::jsonb)`, [mine, JSON.stringify([{ slot: "nope", valueId: v.id }])], /invalid_uses/);
  await rejects(c, asA, `select seller_link_item_values($1::uuid, $2::jsonb)`, [mine, JSON.stringify([{ slot: "brand", valueId: "not-a-uuid" }])], /invalid_uses/);
  await rejects(c, asA, `select seller_link_item_values($1::uuid, $2::jsonb)`, [mine, JSON.stringify([{ slot: "brand", valueId: "00000000-0000-0000-0000-00000000dead" }])], /value_not_found/);
  await rejects(c, asA, `select seller_link_item_values($1::uuid, '{}')`, [mine], /invalid_uses/);
  // a failed call links nothing new and rolled back, so the first link is still there
  assert.equal((await sql(c, `select count(*)::int as n from item_option_value_uses where item_id = $1`, [mine]))[0].n, 1);
  const other = (await add(asA, "brand", "Samsung Electronics")).value;
  await merge(other.id, v.id);
  await link(asA, mine, [{ slot: "brand", valueId: other.id }]);
  assert.equal((await sql(c, `select value_id from item_option_value_uses where item_id = $1`, [mine]))[0].value_id, v.id);
  assert.equal(await link(asA, mine, []), 0);
  assert.equal((await sql(c, `select count(*)::int as n from item_option_value_uses`))[0].n, 0);
});

test("merge: every item using the value updates (brand, spec rows, option labels) and the old spelling resolves to the target", async () => {
  const target = (await add(asA, "material", "Mahogany")).value;
  const typo = (await add(asB, "material", "Mahogany veneer")).value;
  await approve(target.id);
  const i1 = await newItem(ids.bizA, { brand: "x", specs: specs("Mahogany veneer"), option_axes: axes("Mahogany veneer") });
  const i2 = await newItem(ids.bizB, { specs: specs("MAHOGANY  VENEER") });
  const i3 = await newItem(ids.bizB, { specs: specs("Oak") });          // does not use it
  await link(asA, i1, [{ slot: "spec", valueId: typo.id }, { slot: "axis", valueId: typo.id }]);
  await link(asB, i2, [{ slot: "spec", valueId: typo.id }]);
  const r = await merge(typo.id, target.id);
  assert.equal(r.itemsUpdated, 2);
  assert.equal(r.id, target.id);
  const a = await item(i1);
  assert.equal(a.specs[0].value, "Mahogany");
  assert.equal(a.specs[1].value, "Black");                              // other rows untouched
  assert.equal(a.option_axes[0].values[0].label, "Mahogany");
  assert.equal(a.option_axes[0].values[0].id, "mahogany-veneer");       // the id used in variants never changes
  assert.equal(a.option_axes[0].values[1].label, "Oak");
  assert.equal((await item(i2)).specs[0].value, "Mahogany");
  assert.equal((await item(i3)).specs[0].value, "Oak");
  assert.equal((await row(typo.id)).status, "merged");
  assert.equal((await row(typo.id)).merged_into, target.id);
  assert.equal((await sql(c, `select count(*)::int as n from item_option_value_uses where value_id = $1`, [typo.id]))[0].n, 0);
  assert.equal((await sql(c, `select count(distinct item_id)::int as n from item_option_value_uses where value_id = $1`, [target.id]))[0].n, 2);
  // the old spelling now finds the target, and is not a new value
  const f = await find(asA, "material", "Mahogany veneer");
  assert.equal(f.canAdd, false);
  assert.equal(f.matches[0].id, target.id);
  assert.equal((await add(asA, "material", "mahogany VENEER")).value.id, target.id);
  assert.equal((await find(asA, "material", "")).matches.length, 1);    // merged values are never listed
});

test("merge: brand text, plus a shade copied, tags combined, chain flattened, an item using both keeps one link", async () => {
  const a = (await add(asA, "brand", "Samsung")).value;
  const b = (await add(asA, "brand", "Samsung Electronics")).value;
  const c3 = (await add(asA, "brand", "Samsung Elec")).value;
  await approve(a.id, { tags: ["electronics"] });
  await approve(b.id, { tags: ["korea"] });
  const i1 = await newItem(ids.bizA, { brand: "samsung electronics" });
  const i2 = await newItem(ids.bizA, { brand: "Samsung" });
  await link(asA, i1, [{ slot: "brand", valueId: b.id }]);
  await link(asA, i2, [{ slot: "brand", valueId: a.id }, { slot: "brand", valueId: b.id }]);
  await merge(c3.id, b.id);                // c3 -> b
  await merge(b.id, a.id);                 // b -> a, and c3 must now point at a (no chain)
  assert.equal((await row(c3.id)).merged_into, a.id);
  assert.deepEqual((await row(a.id)).tags, ["electronics", "korea"]);
  assert.equal((await item(i1)).brand, "Samsung");
  assert.equal((await item(i2)).brand, "Samsung");
  assert.equal((await sql(c, `select count(*)::int as n from item_option_value_uses where item_id = $1`, [i2]))[0].n, 1);
  // merging into a value that was merged goes to its final target
  const d = (await add(asA, "brand", "Samsong")).value;
  const r = await merge(d.id, b.id);
  assert.equal(r.id, a.id);
});

test("merge: a colour without a shade takes the shade of the one merged into it; item swatches follow", async () => {
  const plain = (await add(asA, "color", "Wine red")).value;
  const shade = (await add(asA, "color", "Wine", "#7B1E3A")).value;
  const i = await newItem(ids.bizA, { option_axes: JSON.stringify([{ key: "colour", label: "Colour", display: "swatch", values: [{ id: "wine", label: "Wine", color: "#111111" }] }]) });
  await link(asA, i, [{ slot: "axis", valueId: shade.id }]);
  const r = await merge(shade.id, plain.id);
  assert.equal(r.hex, "#7b1e3a");
  const v = (await item(i)).option_axes[0].values[0];
  assert.equal(v.label, "Wine red");
  assert.equal(v.color, "#7b1e3a");
});

test("merge refusals", async () => {
  const brand = (await add(asA, "brand", "Nike")).value;
  const material = (await add(asA, "material", "Nike material")).value;
  const other = (await add(asA, "brand", "Adidas")).value;
  await rejects(c, asAdmin, `select admin_merge_option_value($1::uuid, $1::uuid)`, [brand.id], /same_value/);
  await rejects(c, asAdmin, `select admin_merge_option_value($1::uuid, $2::uuid)`, [brand.id, material.id], /kind_mismatch/);
  await rejects(c, asAdmin, `select admin_merge_option_value($1::uuid, '00000000-0000-0000-0000-00000000dead')`, [brand.id], /value_not_found/);
  await merge(other.id, brand.id);
  await rejects(c, asAdmin, `select admin_merge_option_value($1::uuid, $2::uuid)`, [other.id, brand.id], /value_merged/);
  await rejects(c, asAdmin, `select admin_approve_option_value($1::uuid)`, [other.id], /value_merged/);
});

test("rename: the new spelling shows on every item that uses it; a taken spelling asks for a merge", async () => {
  const v = (await add(asA, "brand", "Samsng")).value;
  const taken = (await add(asA, "brand", "Sony")).value;
  const spec = (await add(asA, "material", "Mahogni")).value;
  const i1 = await newItem(ids.bizA, { brand: "Samsng" });
  const i2 = await newItem(ids.bizB, { brand: "SAMSNG", specs: specs("Mahogni"), option_axes: axes("Mahogni", "mahogni") });
  await link(asA, i1, [{ slot: "brand", valueId: v.id }]);
  await link(asB, i2, [{ slot: "brand", valueId: v.id }, { slot: "spec", valueId: spec.id }, { slot: "axis", valueId: spec.id }]);
  const r = await rename(v.id, "Samsung");
  assert.equal(r.label, "Samsung");
  assert.equal(r.key, "samsung");
  assert.equal(r.itemsUpdated, 2);
  assert.equal((await item(i1)).brand, "Samsung");
  assert.equal((await item(i2)).brand, "Samsung");
  assert.equal((await find(asA, "brand", "samsung")).matches[0].id, v.id);
  assert.equal((await find(asA, "brand", "samsng")).canAdd, true);       // the old misspelling is not kept alive
  await rename(spec.id, "Mahogany");
  assert.equal((await item(i2)).specs[0].value, "Mahogany");
  assert.equal((await item(i2)).option_axes[0].values[0].label, "Mahogany");
  await rejects(c, asAdmin, `select admin_rename_option_value($1::uuid, 'SONY')`, [v.id], /value_exists/);
  await rejects(c, asAdmin, `select admin_rename_option_value($1::uuid, '--')`, [v.id], /invalid_label/);
  // changing only the case is allowed
  assert.equal((await rename(taken.id, "SONY")).label, "SONY");
  assert.equal((await row(taken.id)).key, "sony");
});

test("rename and merge leave items that never used the dictionary exactly as they were", async () => {
  const v = (await add(asA, "brand", "Nike")).value;
  const other = (await add(asA, "brand", "Nikee")).value;
  const plain = await newItem(ids.bizA, { brand: "Nike", specs: specs("Nike") });
  const before = await item(plain);
  await rename(v.id, "NIKE");
  await merge(other.id, v.id);
  const after = await item(plain);
  assert.equal(after.brand, before.brand);
  assert.deepEqual(after.specs, before.specs);
  assert.deepEqual(after.option_axes, before.option_axes);
});

test("public filter: one choice per value, counting only items buyers can see", async () => {
  const v = (await add(asA, "brand", "Samsung")).value;
  const again = (await add(asB, "brand", "SAMSUNG")).value;
  assert.equal(again.id, v.id);
  const i1 = await newItem(ids.bizA, { brand: "Samsung" });
  const i2 = await newItem(ids.bizB, { brand: "SAMSUNG" });
  const hidden = await newItem(ids.bizA, { brand: "samsung", visible: false });
  await link(asA, i1, [{ slot: "brand", valueId: v.id }]);
  await link(asB, i2, [{ slot: "brand", valueId: v.id }]);
  await link(asA, hidden, [{ slot: "brand", valueId: v.id }]);
  const f = await as(anon, `select public_option_value_filter('brand') as r`).then((r) => r[0].r);
  assert.equal(f.length, 1);
  assert.equal(f[0].label, "Samsung");
  assert.equal(f[0].count, 2);
  assert.deepEqual(await as(anon, `select public_option_value_filter('material') as r`).then((r) => r[0].r), []);
});

test("deleting an item removes its links", async () => {
  const v = (await add(asA, "brand", "Nike")).value;
  const i = await newItem(ids.bizA);
  await link(asA, i, [{ slot: "brand", valueId: v.id }]);
  await sql(c, `delete from items where id = $1`, [i]);
  assert.equal((await sql(c, `select count(*)::int as n from item_option_value_uses`))[0].n, 0);
});

test("two sellers typing the same new value at once make one value", async () => {
  const results = await Promise.all([add(asA, "brand", "Tecno"), add(asB, "brand", "TECNO")]).catch((e) => { throw e; });
  assert.equal(new Set(results.map((r) => r.value.id)).size, 1);
  assert.equal((await sql(c, `select count(*)::int as n from option_values`))[0].n, 1);
});
