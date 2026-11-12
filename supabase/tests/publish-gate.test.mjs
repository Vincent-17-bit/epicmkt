// Migration 0099 (Prompt 5.4): the publish gate. The SQL rules engine must agree with shared/src/specRules on the same items.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { specIssues } from "../../shared/src/specRules/index.js";
import { PRODUCT_TYPES, getFixtures } from "../../shared/src/contracts/index.js";
import { normalizeValueKey } from "../../shared/src/openValues.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
const TAGS = { gold: ["precious-metal"], silver: ["precious-metal"], aurum: ["precious-metal"] };
const typed = PRODUCT_TYPES.filter((t) => t.specRows);

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_publish_gate" }));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
  for (const t of typed) {
    await sql(c, `insert into product_types (id, slug, name, spec_rows) values ($1, $1, $2, $3::jsonb)
                  on conflict (id) do update set spec_rows = excluded.spec_rows`, [t.id, t.name, JSON.stringify(t.specRows)]);
  }
  await sql(c, `insert into option_values (kind, key, label, status, tags) values
    ('material', normalize_value_key('Gold'), 'Gold', 'approved', '{precious-metal}'),
    ('material', normalize_value_key('Silver'), 'Silver', 'approved', '{precious-metal}'),
    ('material', normalize_value_key('Brass'), 'Brass', 'approved', '{}')`);
  await sql(c, `insert into option_values (kind, key, label, status, merged_into)
    select 'material', normalize_value_key('Aurum'), 'Aurum', 'merged', id from option_values where key = 'gold'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const base = (o = {}) => ({ name: "Thing", description: "", section: "General", price_type: "fixed", price: 1000, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const spec = (label, value) => ({ group: "Item details", label, value });
const save = (id, fields, who = asA) => as(who, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (id, fields, pattern, who = asA) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const bulk = (action, list, who = asA) => as(who, `select seller_bulk_items($1, $2::uuid[]) as r`, [action, list]).then((r) => r[0].r);
const bulkFails = (action, list, pattern, who = asA) => rejects(c, who, `select seller_bulk_items($1, $2::uuid[])`, [action, list], pattern);
const check = (id, fields, who = asA) => as(who, `select seller_check_item($1::uuid, $2::jsonb) as r`, [id, JSON.stringify(fields)]).then((r) => r[0].r);
const row = (id) => sql(c, `select draft, visible, spec_gate_exempt as exempt, specs from items where id = $1`, [id]).then((r) => r[0]);
const verdict = (item, who = asA) => as(who, `select item_check_publish($1::jsonb) as r`, [JSON.stringify(item)]).then((r) => r[0].r);

const live = async (typeId, specs, { exempt = false } = {}) => {
  const id = await save(null, base({ productTypeId: typeId, specs }));
  await sql(c, `alter table items disable trigger items_spec_gate`);
  await sql(c, `update items set draft = false, visible = true, spec_gate_exempt = $2 where id = $1`, [id, exempt]);
  await sql(c, `alter table items enable trigger items_spec_gate`);
  return id;
};

const shape = (r) => ({
  blockers: r.blockers.map((i) => ({ ...i })),
  warnings: r.warnings.map((i) => ({ ...i })),
  score: r.score
});
const toItem = (detail, productTypeId) => ({ productTypeId, specs: detail.specs, brand: detail.brand, packSize: detail.packSize, includes: detail.includes ?? [], axes: detail.options ?? [] });

test("the SQL rules engine agrees with specIssues on every fixture, with and without each spec", async () => {
  let compared = 0;
  const tagFn = (value) => TAGS[normalizeValueKey(value)] ?? [];
  for (const { detail } of getFixtures()) {
    const type = PRODUCT_TYPES.find((t) => t.id === detail.productType) ?? null;
    if (type && !type.specRows) continue;
    const variants = [detail.specs, [], ...detail.specs.map((_, i) => detail.specs.filter((__, j) => j !== i))];
    for (const specs of variants) {
      const item = toItem({ ...detail, specs }, type?.id ?? null);
      const [{ r }] = await sql(c, `select item_spec_issues($1::jsonb, false) as r`, [JSON.stringify(item)]);
      assert.deepEqual(shape(r), shape(specIssues({ ...detail, specs }, type, { tags: tagFn })), `${detail.id} ${JSON.stringify(specs)}`);
      compared += 1;
    }
  }
  assert.ok(compared > 20, `compared ${compared}`);
});

test("parity on conditions, choice lists, odd values and grandfathering", async () => {
  const tagFn = (value) => TAGS[normalizeValueKey(value)] ?? [];
  const necklace = PRODUCT_TYPES.find((t) => t.id === "gold-necklace");
  const fragrance = PRODUCT_TYPES.find((t) => t.id === "fragrance");
  const water = PRODUCT_TYPES.find((t) => t.id === "drinking-water");
  const phone = PRODUCT_TYPES.find((t) => t.id === "phone");
  const cases = [
    [necklace, [{ label: "Material", value: "Gold" }]],
    [necklace, [{ label: "Material", value: "  GOLD " }]],
    [necklace, [{ label: "Material", value: "Aurum" }]],
    [necklace, [{ label: "Material", value: "Brass" }]],
    [necklace, [{ label: "Material", value: "Mystery alloy" }]],
    [necklace, [{ label: "Material", value: "Silver" }, { label: "Purity", value: "925" }]],
    [necklace, []],
    [fragrance, [{ label: "Authenticity", value: "Copy" }]],
    [fragrance, [{ label: "AUTHENTICITY", value: "inspired" }, { label: "Fragrance state", value: "Opened" }]],
    [fragrance, [{ label: "Authenticity", value: "Original" }, { label: "Fragrance state", value: "tester" }, { label: "Notes", value: "x" }]],
    [water, [{ label: "Water type", value: "Rain" }]],
    [water, [{ label: "Water type", value: "borehole" }]],
    [phone, [{ label: "Warranty", value: "   " }]],
    [phone, [{ label: "Warranty", value: "1 year" }, { label: "Display", value: "6" }]],
    [null, [{ label: "Warranty", value: "1 year" }, { label: "Country of origin", value: "Kenya" }]],
    [null, []]
  ];
  for (const [type, specs] of cases) {
    for (const grandfathered of [false, true]) {
      const item = { productTypeId: type?.id ?? null, specs, brand: "Pulse", packSize: null, includes: ["Charger"], axes: [] };
      const [{ r }] = await sql(c, `select item_spec_issues($1::jsonb, $2) as r`, [JSON.stringify(item), grandfathered]);
      const js = specIssues({ specs, brand: "Pulse", packSize: null, includes: ["Charger"], options: [] }, type, { tags: tagFn, grandfathered });
      assert.deepEqual(shape(r), shape(js), `${type?.id} ${JSON.stringify(specs)} ${grandfathered}`);
    }
  }
});

test("a draft is always saveable, even with missing rows", async () => {
  const id = await save(null, base({ productTypeId: "drinking-water", specs: [] }));
  assert.deepEqual(await row(id).then((r) => [r.draft, r.visible]), [true, false]);
  const r = await verdict({ id, productTypeId: "drinking-water", specs: [] });
  assert.equal(r.canSave, true);
  assert.equal(r.canPublish, false);
  assert.deepEqual(r.blockers.map((b) => b.key), ["water-type"]);
});

test("publish is blocked for each blocker and allowed once it is answered", async () => {
  const cases = [
    ["drinking-water", [], /publish_blocked/, ["water-type"], [spec("Water type", "Purified")]],
    ["bread", [spec("Ingredients", "Flour")], /publish_blocked/, ["allergens"], [spec("Ingredients", "Flour"), spec("Allergens", "Gluten")]],
    ["phone", [], /publish_blocked/, ["warranty"], [spec("Warranty", "1 year")]],
    ["fragrance", [spec("Authenticity", "Copy")], /publish_blocked/, ["authenticity"], [spec("Authenticity", "Original")]]
  ];
  for (const [type, specs, pattern, keys, fixed] of cases) {
    const id = await save(null, base({ productTypeId: type, specs }));
    await bulkFails("show", [id], pattern);
    const err = await rejects(c, asA, `select seller_bulk_items('show', $1::uuid[])`, [[id]], pattern);
    assert.deepEqual(JSON.parse(err.detail).map((b) => b.key), keys, type);
    assert.deepEqual(await row(id).then((r) => [r.draft, r.visible]), [true, false], type);
    await save(id, base({ productTypeId: type, specs: fixed }));
    await bulk("show", [id]);
    assert.deepEqual(await row(id).then((r) => [r.draft, r.visible]), [false, true], type);
  }
});

test("conditional rule on the server: precious metal needs purity, brass does not, a merged spelling counts", async () => {
  for (const [material, blocked] of [["Gold", true], ["Aurum", true], ["Silver", true], ["Brass", false], ["Unknown metal", false]]) {
    const id = await save(null, base({ productTypeId: "gold-necklace", specs: [spec("Material", material)] }));
    if (blocked) {
      await bulkFails("show", [id], /publish_blocked/);
      await save(id, base({ productTypeId: "gold-necklace", specs: [spec("Material", material), spec("Purity", "22K")] }));
    }
    await bulk("show", [id]);
    assert.equal((await row(id)).visible, true, material);
    await sql(c, `delete from items where id = $1`, [id]);
  }
});

test("no client can skip the gate: a direct table update is stopped too", async () => {
  const id = await save(null, base({ productTypeId: "phone", specs: [] }));
  await assert.rejects(sql(c, `update items set draft = false, visible = true where id = $1`, [id]), /publish_blocked/);
  await assert.rejects(sql(c, `insert into items (business_id, name, price_type, price, visible, draft, product_type_id, specs)
    values ($1, 'x', 'fixed', 1, true, false, 'phone', '[]')`, [ids.bizA]), /publish_blocked/);
  assert.deepEqual(await row(id).then((r) => [r.draft, r.visible]), [true, false]);
});

test("a live item cannot be edited into a blocked state", async () => {
  const id = await save(null, base({ productTypeId: "phone", specs: [spec("Warranty", "1 year")] }));
  await bulk("show", [id]);
  await saveFails(id, base({ productTypeId: "phone", specs: [] }), /publish_blocked/);
  assert.equal((await row(id)).specs.length, 1);
  await save(id, base({ name: "Renamed", productTypeId: "phone", specs: [spec("Warranty", "2 years")] }));
  assert.equal((await row(id)).visible, true);
});

test("grandfathered: a live item stays live, warns, and can be renamed, hidden and shown", async () => {
  const id = await live("phone", [], { exempt: true });
  const r = await verdict({ id, productTypeId: "phone", specs: [] });
  assert.equal(r.grandfathered, true);
  assert.equal(r.canPublish, true);
  assert.deepEqual(r.blockers, []);
  assert.ok(r.warnings.some((w) => w.key === "warranty" && w.level === "required"));
  await save(id, base({ name: "Renamed", price: 1200, productTypeId: "phone", specs: [] }));
  assert.equal((await row(id)).exempt, true);
  await bulk("hide", [id]);
  await bulk("show", [id]);
  assert.deepEqual(await row(id).then((x) => [x.draft, x.visible, x.exempt]), [false, true, true]);
});

test("grandfathered: the first real edit turns the checks on", async () => {
  const id = await live("phone", [], { exempt: true });
  assert.equal((await verdict({ id, productTypeId: "phone", specs: [spec("Display", "6 inch")] })).grandfathered, false);
  await saveFails(id, base({ productTypeId: "phone", specs: [spec("Display", "6 inch")] }), /publish_blocked/);
  await save(id, base({ productTypeId: "phone", specs: [spec("Warranty", "1 year")] }));
  assert.equal((await row(id)).exempt, false);
  await saveFails(id, base({ productTypeId: "phone", specs: [] }), /publish_blocked/);
});

test("grandfathered: editing while hidden does not keep the exemption", async () => {
  const id = await live("phone", [], { exempt: true });
  await bulk("hide", [id]);
  await save(id, base({ productTypeId: "phone", specs: [spec("Display", "6 inch")] }));
  assert.equal((await row(id)).exempt, false);
  await bulkFails("show", [id], /publish_blocked/);
});

test("a seller cannot see or use another shop's item through item_check_publish", async () => {
  const id = await live("phone", [], { exempt: true });
  const r = await verdict({ id, productTypeId: "phone", specs: [] }, asB);
  assert.equal(r.grandfathered, false);
  assert.equal(r.canPublish, false);
});

test("item_check_publish rejects a bad payload", async () => {
  await rejects(c, asA, `select item_check_publish('[]'::jsonb)`, [], /invalid_item/);
  await rejects(c, asA, `select item_check_publish('{"id":"nope"}'::jsonb)`, [], /invalid_item/);
});

test("items with no type behave as before: the generic template never blocks", async () => {
  const id = await save(null, base({ specs: [] }));
  await bulk("show", [id]);
  assert.equal((await row(id)).visible, true);
  const r = await verdict({ id, productTypeId: null, specs: [] });
  assert.deepEqual(r.blockers, []);
  assert.equal(r.score, 0);
  assert.equal(r.warnings.length, 9);
});

test("seller_check_item answers exactly as before unless the fields carry publish", async () => {
  const plain = await check(null, base({ productTypeId: "bread", specs: [] }));
  assert.deepEqual(plain, { ok: true, issues: [] });
});

test("seller_check_item adds the spec issue list when asked", async () => {
  const fields = base({ productTypeId: "bread", specs: [spec("Ingredients", "Flour")] });
  const draft = await check(null, { ...fields, publish: false });
  assert.equal(draft.ok, true);
  assert.deepEqual(draft.issues, []);
  assert.deepEqual(draft.spec.blockers.map((b) => b.key), ["allergens"]);
  assert.equal(draft.spec.canSave, true);

  const pub = await check(null, { ...fields, publish: true });
  assert.equal(pub.ok, false);
  assert.deepEqual(pub.issues.map((i) => [i.code, i.key, i.message]), [["spec_missing", "allergens", "Allergens is required"]]);

  const fine = await check(null, { ...fields, specs: [...fields.specs, spec("Allergens", "Gluten")], publish: true });
  assert.equal(fine.ok, true);
  assert.deepEqual(fine.spec.blockers, []);

  const bad = await check(null, { ...fields, price: -5, publish: true });
  assert.equal(bad.ok, false);
  assert.equal(bad.issues[0].code, "invalid_price");
  assert.equal((await sql(c, `select count(*)::int as n from items`))[0].n, 0);
});

test("seller_check_item on a stored item reads the stored rows for what was not sent", async () => {
  const id = await save(null, base({ productTypeId: "phone", specs: [spec("Warranty", "1 year")] }));
  const ok = await check(id, { ...base({ name: "Same item" }), publish: true });
  assert.equal(ok.ok, true);
  const cleared = await check(id, { ...base({ name: "Same item" }), specs: [], publish: true });
  assert.equal(cleared.ok, false);
  assert.equal(cleared.issues[0].key, "warranty");
});

test("a product type cannot have more than four required rows", async () => {
  const row5 = (i, extra = {}) => ({ key: `r${i}`, label: `R${i}`, level: "required", input: "text", ...extra });
  const five = [0, 1, 2, 3, 4].map((i) => row5(i));
  await assert.rejects(sql(c, `insert into product_types (id, slug, name, spec_rows) values ('five', 'five', 'Five', $1::jsonb)`, [JSON.stringify(five)]), /product_types_spec_rows_required_max/);
  const viaIf = [0, 1, 2, 3].map((i) => row5(i)).concat([{ key: "x", label: "X", level: "optional", input: "text", requiredIf: { row: "r0", present: true } }]);
  await assert.rejects(sql(c, `insert into product_types (id, slug, name, spec_rows) values ('five-if', 'five-if', 'Five', $1::jsonb)`, [JSON.stringify(viaIf)]), /product_types_spec_rows_required_max/);
  await sql(c, `insert into product_types (id, slug, name, spec_rows) values ('four', 'four', 'Four', $1::jsonb)`, [JSON.stringify(five.slice(0, 4))]);
});
