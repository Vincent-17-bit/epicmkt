import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids, asA } from "./db.mjs";

let c;
before(async () => { c = await connect(await createDatabase()); await seedFixtures(c); await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});
const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const save = (id, f) => as(asA, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(f)]).then((r) => r[0].id);
const catalog = () => as(asA, `select seller_catalog_items() as r`).then((r) => { const v = r[0].r; return Array.isArray(v) ? v : (v.items ?? v); });

// What the seller app's itemRow sends for a normal edit.
const edit = (o = {}) => ({
  name: "Whole Wheat Loaf", description: "Fresh daily", section: "Bread", price_type: "fixed", price: 120, price_max: null, sale_price: null, unit: null,
  availability: "available", track_stock: false, stock_count: null, low_stock_threshold: 3, show_stock_count: false,
  specs: [{ group: "Features & Specs", label: "Weight", value: "400 g" }],
  brand: "Baker's Best", short_description: "Soft brown loaf", pack_size: "1 loaf", terms: "Same day", includes: ["Paper bag"], highlights: [{ title: "Grain", text: "Whole grain" }],
  ...o,
});

test("a new item and an edit of it persist every detail the editor sends, and read back through the catalog", async () => {
  const id = await save(null, edit());
  const one = async () => (await catalog()).find((i) => i.id === id);
  let it = await one();
  assert.equal(it.name, "Whole Wheat Loaf"); assert.equal(it.brand, "Baker's Best"); assert.equal(it.short_description, "Soft brown loaf");
  await save(id, edit({ name: "Whole Wheat Loaf 800g", price: 200, brand: "Other", highlights: [{ text: "A" }, { text: "B" }], terms: "Pre-order", pack_size: "2 loaves", description: "New text" }));
  it = await one();
  assert.equal(it.name, "Whole Wheat Loaf 800g"); assert.equal(Number(it.price), 200); assert.equal(it.brand, "Other");
  assert.deepEqual(it.highlights, [{ text: "A" }, { text: "B" }]); assert.equal(it.terms, "Pre-order"); assert.equal(it.pack_size, "2 loaves"); assert.equal(it.description, "New text");
});

test("an edit that also sends options: null, a size chart id and a product type still persists", async () => {
  const id = await save(null, edit());
  await save(id, edit({ name: "Renamed", options: null, productTypeId: null }));
  assert.equal((await catalog()).find((i) => i.id === id).name, "Renamed");
});

test("an item whose product type was later switched off can still be edited when the type is not re-sent, and is refused when it is", async () => {
  const [t] = await sql(c, `select id from product_types where active and department_id is not null and restricted_to = '{}' limit 1`);
  const id = await save(null, edit({ productTypeId: t.id }));
  await sql(c, `update product_types set active = false where id = $1`, [t.id]);
  try {
    await save(id, edit({ name: "Edited without type" }));
    assert.equal((await catalog()).find((i) => i.id === id).name, "Edited without type");
    await assert.rejects(() => save(id, edit({ name: "Edited with type", productTypeId: t.id })), /unknown_product_type/);
  } finally { await sql(c, `update product_types set active = true where id = $1`, [t.id]); }
});

test("supabase/diagnose-item-save.sql runs and reports OK on a fully migrated database", async () => {
  const fs = await import("node:fs");
  const text = fs.readFileSync(new URL("../diagnose-item-save.sql", import.meta.url), "utf8");
  const rows = await sql(c, text.replace(/^--.*$/gm, "").trim().replace(/;\s*$/, ""));
  const bad = rows.filter((r) => /MISSING|PROBLEM/.test(r.result));
  assert.deepEqual(bad, []);
  assert.ok(rows.length >= 20);
});
