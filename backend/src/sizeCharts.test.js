import test from "node:test";
import assert from "node:assert/strict";
import { SEED_SIZE_CHARTS, shoeChartRows } from "@epicmkt/shared";
import { getShoeConversion, getSizeChartsForType, listSizeCharts, saveShoeConversion, setLatency } from "./index.js";

setLatency(0);

test("mock: listSizeCharts keeps the shape the seller app reads (no new keys), and has the A05 seed charts", async () => {
  const list = await listSizeCharts();
  assert.deepEqual(Object.keys(list[0]).sort(), ["category", "columns", "id", "name", "rows", "unit"]);
  for (const seed of SEED_SIZE_CHARTS) {
    const got = list.find((c) => c.name === seed.name);
    assert.ok(got, seed.name);
    assert.deepEqual([got.columns, got.rows, got.unit], [seed.columns, seed.rows, seed.unit]);
  }
  assert.ok(new Set(list.map((c) => c.id)).size === list.length, "ids are unique");
});
test("mock: charts by type mirror size_charts_for_type: a type has one chart; otherwise the category's charts that no type uses", async () => {
  const names = async (t, c) => (await getSizeChartsForType(t, c)).map((x) => x.name);
  assert.deepEqual(await names("dress"), ["Dresses and tops (cm)"]);
  assert.deepEqual(await names("shirt"), ["Shirt collar"]);
  assert.deepEqual(await names("shoes-eu"), [], "the shoe charts are picked per item, not attached to a type");
  assert.deepEqual(await names("nothing"), []);
  assert.deepEqual(await names(null, null), []);
  assert.deepEqual(await names("nothing", "fashion-boutiques"), ["Tops and dresses", "Women's shoes (EU)"], "the category's charts that no type uses");
  const dress = (await getSizeChartsForType("dress"))[0];
  assert.deepEqual(dress.product_type_ids, ["dress"]);
  assert.deepEqual(Object.keys(dress).sort(), ["category", "columns", "id", "name", "product_type_ids", "rows", "unit"]);
});
test("mock: the shoe conversion chart reads, saves with the database's rules, bumps the version, and returns copies", async () => {
  const first = await getShoeConversion();
  assert.deepEqual(first.chart, shoeChartRows());
  first.chart.adult[0].eu = 99;
  assert.equal((await getShoeConversion()).chart.adult[0].eu, 35, "a read returns a copy");
  const edited = shoeChartRows(); edited.adult[7].cm = 26.8;
  const v = await saveShoeConversion(edited);
  assert.equal(v, first.version + 1);
  assert.equal((await getShoeConversion()).chart.adult[7].cm, 26.8);
  const bad = shoeChartRows(); bad.adult[3].eu = bad.adult[2].eu;
  await assert.rejects(saveShoeConversion(bad), (e) => e.code === "invalid_shoe_chart" && e.status === 422 && Array.isArray(e.fields.chart));
  await assert.rejects(saveShoeConversion(null), { code: "invalid_shoe_chart" });
  assert.equal((await getShoeConversion()).version, v, "a refused save changes nothing");
  await saveShoeConversion(shoeChartRows());
});
