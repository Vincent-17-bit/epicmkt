import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { asA, asB, connect, createDatabase, ids, rejects, seedFixtures, sql, tx } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_availability" }));
  await seedFixtures(c);
  await sql(c, `update public.businesses set paid_until = now() + interval '30 days'`);
  await sql(c, `update plans set items_limit = 600 where category_id = 'barber'`);
});
after(async () => c?.end());

const item = async (name, extra = {}, biz = ids.bizA) => {
  const cols = { business_id: biz, name, price: 100, visible: true, draft: false, ...extra };
  const keys = Object.keys(cols);
  const rows = await sql(c, `insert into items (${keys.join(",")}) values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning id`, Object.values(cols));
  return rows[0].id;
};
const row = (id) => sql(c, `select * from items where id = $1`, [id]).then((r) => r[0]);
const as = (who, text, params) => tx(c, who, (k) => sql(k, text, params), { commit: true });
const publicNames = async () => (await sql(c, `select name from public_items order by name`)).map((r) => r.name);
const save = (who, id, fields) => as(who, `select seller_save_item($1, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const stock = (who, id, action, count = null) => as(who, `select seller_item_stock($1, $2, $3) as r`, [id, action, count]).then((r) => r[0].r);

const base = { name: "Loaf", price_type: "fixed", price: "100", availability: "available" };

test("customers see available, limited and by-appointment items but never sold-out ones", async () => {
  await item("Avail", { availability: "available" });
  await item("Low", { availability: "limited_stock" });
  await item("Appt", { availability: "by_appointment" });
  await item("Gone", { availability: "out_of_stock" });
  await item("Old word", { availability: "unavailable" });
  assert.deepEqual(await publicNames(), ["Appt", "Avail", "Low"]);
});

test("stock_left is only exposed when the seller counts stock, is running low and allows it", async () => {
  await item("Shown", { track_stock: true, stock_count: 2, show_stock_count: true });
  await item("Private", { track_stock: true, stock_count: 2, show_stock_count: false });
  await item("Plenty", { track_stock: true, stock_count: 50, show_stock_count: true });
  const left = Object.fromEntries((await sql(c, `select name, stock_left from public_items where name in ('Shown','Private','Plenty')`)).map((r) => [r.name, r.stock_left]));
  assert.deepEqual(left, { Shown: 2, Private: null, Plenty: null });
});

test("a sold-out product no longer keeps an offer alive", async () => {
  const a = await item("Offer cake", { availability: "available" });
  const o = (await sql(c, `insert into offers (business_id, title, kind, config, active) values ($1, 'Deal', 'percent_off', '{"percent":10}', true) returning id`, [ids.bizA]))[0].id;
  await sql(c, `insert into offer_items (offer_id, item_id, business_id, role) values ($1, $2, $3, 'main')`, [o, a, ids.bizA]);
  assert.equal((await sql(c, `select count(*)::int n from public_offer_items where item_id = $1`, [a]))[0].n, 1);
  await sql(c, `update items set availability = 'out_of_stock' where id = $1`, [a]);
  assert.equal((await sql(c, `select count(*)::int n from public_offer_items where item_id = $1`, [a]))[0].n, 0);
  assert.equal((await sql(c, `select count(*)::int n from public_offers where id = $1`, [o]))[0].n, 0);
  await sql(c, `update items set availability = 'available' where id = $1`, [a]);
  assert.equal((await sql(c, `select count(*)::int n from public_offers where id = $1`, [o]))[0].n, 1);
});

test("the home snapshot leaves out sold-out items and carries stock_left", async () => {
  const s = (await sql(c, `select products_snapshot(1000) as s`))[0].s;
  const names = s.items.map((i) => i.name);
  assert.ok(names.includes("Avail") && !names.includes("Gone") && !names.includes("Old word"));
  assert.equal(s.items.find((i) => i.name === "Shown").stock_left, 2);
});

test("saving with a count derives the status: plenty, low, then out", async () => {
  const id = await save(asA, null, { ...base, name: "Counted", track_stock: true, stock_count: "10", low_stock_threshold: "3", show_stock_count: true });
  assert.equal((await row(id)).availability, "available");
  await save(asA, id, { ...base, name: "Counted", track_stock: true, stock_count: "2", low_stock_threshold: "3", show_stock_count: true });
  assert.equal((await row(id)).availability, "limited_stock");
  await save(asA, id, { ...base, name: "Counted", track_stock: true, stock_count: "0", low_stock_threshold: "3", show_stock_count: true });
  const gone = await row(id);
  assert.equal(gone.availability, "out_of_stock");
  assert.equal(gone.stock_count, 0);
});

test("a counted item ignores a chosen status, and a caller that sends no stock fields changes nothing", async () => {
  const id = await save(asA, null, { ...base, name: "Counted 2", availability: "by_appointment", track_stock: true, stock_count: "20" });
  assert.equal((await row(id)).availability, "available");
  await save(asA, id, { ...base, name: "Counted 2 renamed" });
  const r = await row(id);
  assert.equal(r.track_stock, true);
  assert.equal(r.stock_count, 20);
  assert.equal(r.name, "Counted 2 renamed");
});

test("bad stock input is refused cleanly", async () => {
  await rejects(c, asA, `select seller_save_item(null, $1::jsonb)`, [JSON.stringify({ ...base, track_stock: true })], /invalid_stock/);
  await rejects(c, asA, `select seller_save_item(null, $1::jsonb)`, [JSON.stringify({ ...base, track_stock: true, stock_count: "-1" })], /invalid_stock/);
  await rejects(c, asA, `select seller_save_item(null, $1::jsonb)`, [JSON.stringify({ ...base, track_stock: "maybe", stock_count: "1" })], /invalid_stock/);
  await rejects(c, asA, `select seller_save_item(null, $1::jsonb)`, [JSON.stringify({ ...base, low_stock_threshold: "x" })], /invalid_stock/);
});

test("mark out of stock, then back in stock, for an item that is not counted", async () => {
  const id = await item("Plain", { availability: "available" });
  assert.deepEqual(await stock(asA, id, "sold_out"), { availability: "out_of_stock", stock_count: null });
  assert.ok(!(await publicNames()).includes("Plain"));
  assert.deepEqual(await stock(asA, id, "restock"), { availability: "available", stock_count: null });
  assert.ok((await publicNames()).includes("Plain"));
});

test("a counted item goes to 0 when sold out and needs a real count to come back", async () => {
  const id = await item("Tracked", { track_stock: true, stock_count: 8, low_stock_threshold: 3 });
  assert.equal((await stock(asA, id, "sold_out")).availability, "out_of_stock");
  await rejects(c, asA, `select seller_item_stock($1, 'restock', null)`, [id], /stock_count_required/);
  await rejects(c, asA, `select seller_item_stock($1, 'restock', 0)`, [id], /stock_count_required/);
  assert.equal((await row(id)).availability, "out_of_stock");
  assert.deepEqual(await stock(asA, id, "restock", 2), { availability: "limited_stock", stock_count: 2 });
  assert.deepEqual(await stock(asA, id, "restock", 9), { availability: "available", stock_count: 9 });
});

test("a seller cannot touch another seller's stock, and visitors cannot call it", async () => {
  const theirs = await item("Theirs", {}, ids.bizB);
  await rejects(c, asA, `select seller_item_stock($1, 'sold_out')`, [theirs], /item_not_found/);
  await rejects(c, asA, `select seller_item_stock($1, 'nope')`, [theirs], /invalid_action/);
  await rejects(c, { role: "anon" }, `select seller_item_stock($1, 'sold_out')`, [theirs], /permission denied/);
  assert.equal((await row(theirs)).availability, "available");
  assert.equal((await as(asB, `select seller_item_stock($1, 'sold_out') as r`, [theirs]))[0].r.availability, "out_of_stock");
});

test("bulk availability skips counted items it cannot relist, and zeroes them when marking out", async () => {
  const counted = await item("Bulk counted", { track_stock: true, stock_count: 0, availability: "out_of_stock" });
  const plain = await item("Bulk plain", { availability: "out_of_stock" });
  const r = (await as(asA, `select seller_bulk_items('set_availability', $1::uuid[], '{"availability":"available"}') as r`, [[counted, plain]]))[0].r;
  assert.deepEqual(r, { affected: 1, skipped: 1 });
  assert.equal((await row(plain)).availability, "available");
  assert.equal((await row(counted)).availability, "out_of_stock");

  const tracked = await item("Bulk tracked", { track_stock: true, stock_count: 5 });
  await as(asA, `select seller_bulk_items('set_availability', $1::uuid[], '{"availability":"out_of_stock"}')`, [[tracked]]);
  const after = await row(tracked);
  assert.equal(after.availability, "out_of_stock");
  assert.equal(after.stock_count, 0);
});
