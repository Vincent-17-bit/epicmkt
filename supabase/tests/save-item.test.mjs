import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { storedItemDetails } from "../../shared/src/seller/itemForm.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 5 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const item = async (biz, extra = {}) => {
  const f = { name: "Fade cut", price: 1000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  const r = await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [biz, ...Object.values(f)]);
  return r[0].id;
};
const row = async (id) => (await sql(c, `select * from items where id = $1`, [id]))[0];
const save = (who, id, fields) => tx(c, who, (k) => sql(k, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]), { commit: true }).then((r) => r[0].id);
const saveFails = (who, id, fields, pattern) => rejects(c, who, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const flash = (itemId, extra = "") => sql(c, `insert into flash_sales (business_id, item_id, starts_at, ends_at, discount_type, discount_value) values ($1, $2, now(), now() + interval '6 hours', 'percent', 20) returning id`, [ids.bizA, itemId]).then((r) => r[0].id);

const full = (o = {}) => ({ name: "Fade cut", description: "", section: "Cuts", price_type: "fixed", price: 1200, price_max: null, sale_price: null, unit: null, availability: "available", ...o });

test("editing a price changes it, stamps price_confirmed_at and writes history", async () => {
  const id = await item(ids.bizA);
  await sql(c, `update items set price_confirmed_at = now() - interval '200 days' where id = $1`, [id]);
  assert.equal(await save(asA, id, full({ price: 1500 })), id);
  const r = await row(id);
  assert.equal(Number(r.price), 1500);
  assert.ok(Date.now() - Date.parse(r.price_confirmed_at) < 60000);
  const h = await sql(c, `select field, old_value, new_value from item_history where item_id = $1 and field = 'price'`, [id]);
  assert.deepEqual(h.map((x) => [Number(x.old_value), Number(x.new_value)]), [[1000, 1500]]);
});

test("saving without a price change keeps price_confirmed_at", async () => {
  const id = await item(ids.bizA);
  await sql(c, `update items set price_confirmed_at = now() - interval '200 days' where id = $1`, [id]);
  await save(asA, id, full({ price: 1000, name: "Fade cut deluxe" }));
  assert.ok(Date.now() - Date.parse((await row(id)).price_confirmed_at) > 100 * 864e5);
});

test("visibility, draft and admin columns are never changed by a save", async () => {
  const id = await item(ids.bizA, { visible: false });
  await save(asA, id, { ...full(), visible: true, draft: false, hidden_by_admin: true, removed_by_admin: true });
  const r = await row(id);
  assert.equal(r.visible, false);
  assert.equal(r.hidden_by_admin, false);
  assert.equal(r.removed_by_admin, false);
});

test("a new item is a hidden draft and counts against the plan limit", async () => {
  const id = await save(asA, null, full({ name: "New cut" }));
  const r = await row(id);
  assert.equal(r.draft, true);
  assert.equal(r.visible, false);
  assert.equal(r.business_id, ids.bizA);
  await sql(c, `update plans set items_limit = 1 where category_id = 'barber'`);
  await saveFails(asA, null, full({ name: "Second" }), /limit/);
  await sql(c, `update plans set items_limit = 5 where category_id = 'barber'`);
});

test("a seller cannot save another shop's item, and a missing item is not found", async () => {
  const other = await item(ids.bizB);
  await saveFails(asA, other, full(), /item_not_found/);
  await saveFails(asA, "00000000-0000-0000-0000-00000000ffff", full(), /item_not_found/);
  assert.equal(Number((await row(other)).price), 1000);
});

test("an item removed by admin cannot be edited", async () => {
  const id = await item(ids.bizA);
  await sql(c, `update items set removed_by_admin = true where id = $1`, [id]);
  await saveFails(asA, id, full({ price: 1 }), /item_not_found/);
  assert.equal(Number((await row(id)).price), 1000);
});

test("a suspended seller cannot save", async () => {
  const id = await item(ids.bizA);
  await sql(c, `update businesses set status = 'suspended' where id = '${ids.bizA}'`);
  await saveFails(asA, id, full({ price: 1 }), /account_suspended/);
  await saveFails(asA, null, full(), /account_suspended/);
  assert.equal(Number((await row(id)).price), 1000);
});

test("anonymous callers cannot save", async () => {
  await rejects(c, { role: "anon" }, `select seller_save_item(null, '{}'::jsonb)`, [], /permission denied/);
});

test("prices are validated on the server", async () => {
  const id = await item(ids.bizA);
  await saveFails(asA, id, full({ price: -5 }), /invalid_price/);
  await saveFails(asA, id, full({ price: null }), /invalid_price/);
  await saveFails(asA, id, full({ price_type: "range", price: 500, price_max: 400 }), /invalid_price/);
  await saveFails(asA, id, full({ sale_price: 1200 }), /invalid_price/);
  await saveFails(asA, id, full({ sale_price: 1500 }), /invalid_price/);
  await saveFails(asA, id, full({ price: 99999999999 }), /invalid_price/);
  await saveFails(asA, id, full({ price_type: "weird" }), /invalid_price/);
  await saveFails(asA, id, full({ name: "A" }), /invalid_name/);
  await saveFails(asA, id, full({ availability: "nope" }), /invalid_availability/);
  assert.equal(Number((await row(id)).price), 1000);
});

test("free and contact items drop their price fields", async () => {
  const id = await item(ids.bizA, { sale_price: 800 });
  await save(asA, id, full({ price_type: "contact", price: 1234, price_max: 5, sale_price: 9 }));
  const r = await row(id);
  assert.equal(r.price_type, "contact");
  assert.equal(r.price, null);
  assert.equal(r.price_max, null);
  assert.equal(r.sale_price, null);
});

test("the price of an item in a scheduled or live flash sale is locked", async () => {
  const id = await item(ids.bizA);
  const f = await flash(id);
  await saveFails(asA, id, full({ price: 500 }), /item_in_flash_sale/);
  await saveFails(asA, id, full({ price_type: "contact", price: null }), /item_in_flash_sale/);
  await saveFails(asA, id, full({ sale_price: 900 }), /item_in_flash_sale/);
  assert.equal(Number((await row(id)).price), 1000);
  // everything except the price can still change during the sale
  await save(asA, id, full({ price: 1000, name: "Fade cut (promo)", description: "Fresh" }));
  assert.equal((await row(id)).name, "Fade cut (promo)");
  // once the seller ends the sale, the price is editable again
  await tx(c, asA, (k) => sql(k, `select seller_end_flash_sale($1::uuid)`, [f]), { commit: true });
  await save(asA, id, full({ price: 700 }));
  assert.equal(Number((await row(id)).price), 700);
});

test("saving a price leaves a flash sale on another item untouched", async () => {
  const a = await item(ids.bizA);
  const b = await item(ids.bizA, { name: "Beard trim" });
  const f = await flash(a);
  await save(asA, b, full({ name: "Beard trim", price: 300 }));
  assert.equal((await sql(c, `select status from flash_sales where id = $1`, [f]))[0].status, "live");
});

test("a failed save leaves the item exactly as it was", async () => {
  const id = await item(ids.bizA);
  const before = await row(id);
  await saveFails(asA, id, full({ price: -1, name: "Changed" }), /invalid_price/);
  const after = await row(id);
  assert.equal(after.name, before.name);
  assert.equal(String(after.updated_at), String(before.updated_at));
});

test("specs from the seller form: saved with the default group, kept on a rename, cleared by an empty list, copied on duplicate", async () => {
  const id = await save(asA, null, full({ specs: [{ label: "Size", value: "42" }, { group: "Measurements", label: "Width", value: "20 cm" }] }));
  assert.deepEqual((await row(id)).specs, [{ group: "Features & Specs", label: "Size", value: "42" }, { group: "Measurements", label: "Width", value: "20 cm" }]);
  await save(asA, id, full({ name: "Renamed" }));
  assert.equal((await row(id)).specs.length, 2);
  const copy = (await tx(c, asA, (k) => sql(k, `select seller_duplicate_item($1) as id`, [id]), { commit: true }))[0].id;
  assert.equal((await row(copy)).specs.length, 2);
  await save(asA, id, full({ specs: [] }));
  assert.deepEqual((await row(id)).specs, []);
  assert.deepEqual((await row(await item(ids.bizA))).specs, []);
  await saveFails(asA, id, full({ specs: [{ label: "Size", value: "" }] }), /invalid_details/);
});

const COLUMNS = { brand: "brand", shortDescription: "short_description", terms: "terms", packSize: "pack_size", highlights: "highlights", includes: "includes", specs: "specs" };
const asColumns = (f) => Object.fromEntries(Object.entries(f).map(([k, v]) => [COLUMNS[k], v]));
const many = (n, make) => Array.from({ length: n }, (_, i) => make(i));

test("detail fields: the database keeps exactly what the mock keeps, and refuses exactly what the mock refuses", async () => {
  const cases = [
    {},
    { brand: " Nike ", shortDescription: "S", terms: "  ", packSize: " 6 " },
    { brand: "b".repeat(60), shortDescription: "s".repeat(140), terms: "t".repeat(500), packSize: "p".repeat(40) },
    { brand: "b".repeat(61) }, { shortDescription: "s".repeat(141) }, { terms: "t".repeat(501) }, { packSize: "p".repeat(41) }, { brand: 5 },
    { highlights: [{ title: "Soft", text: "Cotton" }, { text: "Warm" }, { title: " ", text: "No lead" }, { title: null, text: "Null lead" }] },
    { highlights: many(8, (i) => ({ text: `P${i}` })) }, { highlights: many(9, (i) => ({ text: `P${i}` })) },
    { highlights: [{ text: "" }] }, { highlights: [{ title: "t".repeat(41), text: "x" }] }, { highlights: [{ title: "t".repeat(40), text: "x".repeat(200) }] }, { highlights: [{ text: "x".repeat(201) }] },
    { highlights: [{ text: "x", other: 1 }] }, { highlights: ["x"] }, { highlights: [{ title: 5, text: "x" }] },
    { includes: [" A ", "B"] }, { includes: many(10, (i) => `L${i}`) }, { includes: many(11, (i) => `L${i}`) }, { includes: [""] }, { includes: [" "] }, { includes: ["x".repeat(80)] }, { includes: ["x".repeat(81)] }, { includes: [5] },
    { specs: [{ label: "Size", value: "M" }, { group: "Measurements", label: "Weight", value: "9 kg" }] }, { specs: [{ group: null, label: "Size", value: "M" }] },
    { specs: many(20, (i) => ({ label: `L${i}`, value: "v" })) }, { specs: many(21, (i) => ({ label: `L${i}`, value: "v" })) },
    { specs: [{ label: "", value: "v" }] }, { specs: [{ label: "l", value: " " }] }, { specs: [{ label: "l".repeat(40), value: "v".repeat(120) }] }, { specs: [{ label: "l".repeat(41), value: "v" }] }, { specs: [{ label: "l", value: "v".repeat(121) }] },
    { specs: [{ group: "Nope", label: "l", value: "v" }] }, { specs: [{ group: "", label: "l", value: "v" }] }, { specs: [{ label: "l", value: "v", extra: 1 }] },
    { specs: [{ label: " Size ", value: " M " }] }, { highlights: [{ title: " Lead ", text: " Text " }] }, { specs: [{ label: ` ${"l".repeat(40)}`, value: "v" }] }, { highlights: [{ text: ` ${"x".repeat(200)}` }] },
  ];
  const id = await save(asA, null, full());
  for (const f of cases) {
    const expected = storedItemDetails(f);
    const label = JSON.stringify(f).slice(0, 80);
    if (!expected.ok) {
      await saveFails(asA, id, full(asColumns(f)), /invalid_details/);
      continue;
    }
    await save(asA, id, full(asColumns(f)));
    const r = await row(id);
    const want = expected.value;
    for (const [k, col] of Object.entries(COLUMNS)) {
      if (!(k in want)) continue;
      assert.deepEqual(r[col], want[k], `${k} for ${label}`);
    }
  }
});

test("detail fields: left out keeps the stored value, empty clears it, a duplicate copies them", async () => {
  const id = await save(asA, null, full({ brand: "Nike", short_description: "S", terms: "T", pack_size: "6", highlights: [{ text: "Soft" }], includes: ["Tag"], specs: [{ label: "Size", value: "M" }] }));
  await save(asA, id, full({ name: "Renamed" }));
  const kept = await row(id);
  assert.deepEqual([kept.brand, kept.short_description, kept.terms, kept.pack_size, kept.highlights, kept.includes, kept.specs.length], ["Nike", "S", "T", "6", [{ text: "Soft" }], ["Tag"], 1]);
  const copy = await row((await tx(c, asA, (k) => sql(k, `select seller_duplicate_item($1) as id`, [id]), { commit: true }))[0].id);
  assert.deepEqual([copy.brand, copy.highlights, copy.includes, copy.terms, copy.pack_size], ["Nike", [{ text: "Soft" }], ["Tag"], "T", "6"]);
  await save(asA, id, full({ brand: "", short_description: "", terms: "", pack_size: "", highlights: [], includes: [], specs: [] }));
  const cleared = await row(id);
  assert.deepEqual([cleared.brand, cleared.short_description, cleared.terms, cleared.pack_size, cleared.highlights, cleared.includes, cleared.specs], [null, null, null, null, [], [], []]);
});
