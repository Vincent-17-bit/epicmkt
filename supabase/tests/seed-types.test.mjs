// Seeds A24 to A28: the wave 5 product types load into the real schema, twice, with the restrictions the database enforces.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, sql } from "./db.mjs";
import { ALL_TYPES, seedProductTypes } from "../../scripts/seeds/index.mjs";
import { validateProductType } from "../../shared/src/index.js";

let c;
before(async () => { c = await connect(await createDatabase()); });
after(async () => { await c?.end(); });

const rows = () => sql(c, `select id, name, kind, quantity_mode, department_id, restricted_to, category_ids, axes, spec_rows, extras from product_types order by id`);

test("every seeded type loads, the database accepts the axes and rows, and nothing is dropped", async () => {
  const r = await seedProductTypes(c);
  assert.equal(r.types, ALL_TYPES.length);
  const stored = await rows();
  for (const type of ALL_TYPES) {
    const row = stored.find((x) => x.id === type.id);
    assert.ok(row, `${type.id} was not stored`);
    assert.equal(row.department_id, type.departmentId);
    assert.deepEqual(row.axes, type.axes);
    assert.deepEqual(row.spec_rows, type.specRows);
    assert.deepEqual(row.extras, type.extras);
    assert.equal(row.quantity_mode, type.quantityMode);
    const back = { ...type, axes: row.axes, specRows: row.spec_rows, extras: row.extras };
    assert.deepEqual(validateProductType(back).errors, [], type.id);
    assert.ok((await sql(c, `select product_type_axes_valid($1::jsonb) as ok`, [JSON.stringify(row.axes)]))[0].ok, `${type.id} axes pass product_type_axes_valid`);
  }
});

test("seeding twice gives no duplicates and changes nothing", async () => {
  const before_ = await rows();
  const again = await seedProductTypes(c);
  assert.equal(again.departments, 0);
  const after_ = await rows();
  assert.equal(after_.length, before_.length);
  assert.deepEqual(after_, before_);
  const dupes = await sql(c, `select slug from product_types where slug is not null group by slug having count(*) > 1`);
  assert.deepEqual(dupes, []);
});

test("restrictions hold in the database: prescription medicine is a chemist's, vet drugs and agrochemicals an agrovet's", async () => {
  const r = Object.fromEntries((await rows()).map((x) => [x.id, x.restricted_to]));
  assert.deepEqual(r["prescription-medicine"], ["chemist"]);
  assert.deepEqual(r["vet-medicine"], ["agrovet"]);
  assert.deepEqual(r["agrochemicals"], ["agrovet"]);
  const open = (await rows()).filter((x) => x.restricted_to.length === 0 && ALL_TYPES.find((t) => t.id === x.id));
  assert.ok(open.length > 100);
});

test("a type an admin switched off stays off when the seed runs again", async () => {
  await sql(c, `update product_types set active = false where id = 'wiper-blade'`);
  await seedProductTypes(c);
  assert.equal((await sql(c, `select active from product_types where id = 'wiper-blade'`))[0].active, false);
  await sql(c, `update product_types set active = true where id = 'wiper-blade'`);
});

test("old rows from migration 0106 are upgraded in place (same ids, richer axes and rows)", async () => {
  const water = (await rows()).find((x) => x.id === "drinking-water");
  assert.deepEqual(water.axes.map((a) => a.label), ["Container size", "How it is filled"]);
  assert.equal(water.spec_rows[0].label, "Water type");
});
