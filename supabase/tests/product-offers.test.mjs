import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";
import { OFFER_KINDS, offerLabel, validateOffer } from "../../shared/src/offers.js";

let c;
const anon = { role: "anon" };
const PAID = "now() + interval '30 days'";
const H = 3600000;

const bottleA = "20000000-0000-0000-0000-0000000000a1";
const refillA = "20000000-0000-0000-0000-0000000000a2";
const juiceA = "20000000-0000-0000-0000-0000000000a3";
const juiceB = "20000000-0000-0000-0000-0000000000b1";

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_test_product_offers" }));
  await seedFixtures(c);
});
after(async () => { await c.end(); });

beforeEach(async () => {
  await sql(c, `delete from offers`);
  await sql(c, `delete from items`);
  await sql(c, `update businesses set status = 'live', deleted_at = null, paid_until = ${PAID}`);
  for (const [id, biz, name, price] of [[bottleA, ids.bizA, "20L bottle", 400], [refillA, ids.bizA, "20L refill", 100], [juiceA, ids.bizA, "Juice", 120], [juiceB, ids.bizB, "Other juice", 130]]) {
    await sql(c, `insert into items (id, business_id, name, price, price_type) values ($1, $2, $3, $4, 'fixed')`, [id, biz, name, price]);
  }
});

const save = (who, id, fields, items) =>
  tx(c, who, (k) => sql(k, `select seller_save_offer($1, $2::jsonb, $3::jsonb) as id`, [id, JSON.stringify(fields), JSON.stringify(items)]), { commit: true }).then((r) => r[0].id);
const saveFails = (who, id, fields, items, pattern) =>
  rejects(c, who, `select seller_save_offer($1, $2::jsonb, $3::jsonb)`, [id, JSON.stringify(fields), JSON.stringify(items)], pattern);
const pct = (percent = 10, extra = {}) => ({ kind: "percent_off", config: { percent }, title: `${percent}% off`, ...extra });
const one = (item) => [{ item_id: item, role: "main" }];

const publicOffers = async (biz) => (await tx(c, anon, (k) => sql(k, `select id, kind, items from public_offers where business_id = $1 order by title`, [biz])));
const publicIds = async (biz) => (await publicOffers(biz)).map((r) => r.id);

// ---- Rules: SQL and JavaScript agree ------------------------------------------------------------------------------

const CORPUS = [
  ["percent_off", { percent: 10 }], ["percent_off", { percent: 0 }], ["percent_off", { percent: 100 }], ["percent_off", { percent: 12.5 }], ["percent_off", {}],
  ["amount_off", { amount: 50 }], ["amount_off", { amount: 0 }], ["amount_off", { amount: -1 }], ["amount_off", { amount: 10.5 }], ["amount_off", {}],
  ["buy_x_get_y", { buy: 2, get: 1, discountPercent: 100 }], ["buy_x_get_y", { buy: 1, get: 1, discountPercent: 50 }], ["buy_x_get_y", { buy: 0, get: 1, discountPercent: 100 }],
  ["buy_x_get_y", { buy: 2, get: 51, discountPercent: 100 }], ["buy_x_get_y", { buy: 2, get: 1, discountPercent: 101 }], ["buy_x_get_y", { buy: 2, get: 1, discountPercent: 0 }],
  ["multi_buy", { qty: 3, price: 1000 }], ["multi_buy", { qty: 1, price: 1000 }], ["multi_buy", { qty: 3 }], ["multi_buy", { qty: 3, price: 0 }], ["multi_buy", { qty: 101, price: 5 }],
  ["bundle", { rewardType: "bundle_price", rewardValue: 450 }], ["bundle", { rewardType: "bundle_price" }], ["bundle", { rewardType: "percent_off", rewardValue: 10 }],
  ["bundle", { rewardType: "percent_off", rewardValue: 100 }], ["bundle", { rewardType: "amount_off", rewardValue: 40 }], ["bundle", { rewardType: "free_gift", gift: "Cap" }],
  ["bundle", { rewardType: "free_gift", gift: "x" }], ["bundle", { rewardType: "free_gift" }], ["bundle", { rewardType: "nope", rewardValue: 5 }], ["bundle", {}],
  ["volume", { tiers: [{ qty: 3, percent: 5 }, { qty: 6, percent: 10 }] }], ["volume", { tiers: [{ qty: 3, percent: 5 }] }], ["volume", { tiers: [] }],
  ["volume", { tiers: [{ qty: 6, percent: 10 }, { qty: 3, percent: 20 }] }], ["volume", { tiers: [{ qty: 3, percent: 10 }, { qty: 6, percent: 5 }] }],
  ["volume", { tiers: [{ qty: 1, percent: 10 }] }], ["volume", { tiers: [{ qty: 2, percent: 1 }, { qty: 3, percent: 2 }, { qty: 4, percent: 3 }, { qty: 5, percent: 4 }, { qty: 6, percent: 5 }] }],
  ["free_gift", { gift: "Free delivery" }], ["free_gift", { gift: "Free delivery", minQty: 5 }], ["free_gift", { gift: "Free delivery", minQty: 0 }], ["free_gift", { gift: " " }],
  ["free_gift", { gift: "x".repeat(49) }], ["free_gift", {}]
];

test("the database accepts exactly the settings the shared engine accepts", async () => {
  for (const [kind, config] of CORPUS) {
    const js = OFFER_KINDS[kind].check(config);
    const db = (await sql(c, `select offer_config_valid($1, $2::jsonb) as ok`, [kind, JSON.stringify(config)]))[0].ok;
    assert.equal(db, js !== null, `${kind} ${JSON.stringify(config)}: js ${js !== null}, sql ${db}`);
    if (js) assert.equal((await sql(c, `select offer_config_valid($1, $2::jsonb) as ok`, [kind, JSON.stringify(js)]))[0].ok, true, `normalised ${kind} ${JSON.stringify(js)}`);
  }
  assert.equal((await sql(c, `select offer_config_valid('mystery', '{}') as ok`))[0].ok, false);
  assert.equal((await sql(c, `select offer_config_valid('percent_off', '[]') as ok`))[0].ok, false);
});

test("conditions are checked the same way", async () => {
  const good = [{}, { daysOfWeek: ["sat", "sun"] }, { hours: { from: "16:00", to: "18:00" } }, { newCustomersOnly: true, minSpend: 500 }, { hours: { from: "22:00", to: "02:00" } }];
  const bad = [{ daysOfWeek: ["funday"] }, { daysOfWeek: "mon" }, { daysOfWeek: ["mon", "mon"] }, { hours: { from: "25:00", to: "18:00" } }, { hours: { from: "16:00", to: "16:00" } },
    { newCustomersOnly: "yes" }, { minSpend: -1 }, { minSpend: 0 }, []];
  for (const cond of good) assert.equal((await sql(c, `select offer_conditions_valid($1::jsonb) as ok`, [JSON.stringify(cond)]))[0].ok, true, JSON.stringify(cond));
  for (const cond of bad) assert.equal((await sql(c, `select offer_conditions_valid($1::jsonb) as ok`, [JSON.stringify(cond)]))[0].ok, false, JSON.stringify(cond));
});

test("every kind's label on the shared engine matches what a saved offer reads back as", async () => {
  const id = await save(asA, null, { kind: "buy_x_get_y", config: { buy: 2, get: 1, discountPercent: 100 }, title: "Buy 2 Get 1 Free" }, one(juiceA));
  const [row] = await sql(c, `select kind, config from offers where id = $1`, [id]);
  assert.equal(offerLabel({ kind: row.kind, config: row.config }), "Buy 2 Get 1 Free");
});

// ---- Writing an offer ---------------------------------------------------------------------------------------------

test("a seller creates an offer on their own products", async () => {
  const id = await save(asA, null, { ...pct(20), description: "Fresh", code: " juice20 ", terms: "While stock lasts", chip_text: "Happy hour", conditions: { daysOfWeek: ["mon", "tue"] } }, one(juiceA));
  const [o] = await sql(c, `select * from offers where id = $1`, [id]);
  assert.equal(o.business_id, ids.bizA);
  assert.equal(o.kind, "percent_off");
  assert.equal(o.code, "JUICE20");
  assert.equal(o.chip_text, "Happy hour");
  assert.deepEqual(o.conditions, { daysOfWeek: ["mon", "tue"] });
  assert.equal(o.active, true);
  assert.ok(Date.parse(o.starts_at) <= Date.now() + 1000);
  const items = await sql(c, `select item_id, role, business_id from offer_items where offer_id = $1`, [id]);
  assert.deepEqual(items, [{ item_id: juiceA, role: "main", business_id: ids.bizA }]);
});

test("editing replaces the products and keeps the offer", async () => {
  const id = await save(asA, null, pct(10), [{ item_id: juiceA }, { item_id: refillA }]);
  assert.equal((await sql(c, `select count(*)::int as n from offer_items where offer_id = $1`, [id]))[0].n, 2);
  const same = await save(asA, id, pct(15), one(bottleA));
  assert.equal(same, id);
  assert.deepEqual((await sql(c, `select item_id from offer_items where offer_id = $1`, [id])).map((r) => r.item_id), [bottleA]);
  assert.equal((await sql(c, `select config from offers where id = $1`, [id]))[0].config.percent, 15);
  assert.equal((await sql(c, `select count(*)::int as n from offers`))[0].n, 1);
});

test("a bundle needs a main product and a companion; other kinds ignore roles", async () => {
  const bundle = { kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 }, title: "Bottle and refill" };
  await saveFails(asA, null, bundle, one(bottleA), /bundle_needs_two/);
  await saveFails(asA, null, bundle, [{ item_id: bottleA }, { item_id: refillA }], /bundle_needs_two/);
  const id = await save(asA, null, bundle, [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
  assert.deepEqual((await sql(c, `select item_id, role from offer_items where offer_id = $1 order by sort`, [id])), [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
  const plain = await save(asA, null, pct(5), [{ item_id: juiceA, role: "with" }]);
  assert.equal((await sql(c, `select role from offer_items where offer_id = $1`, [plain]))[0].role, "main");
});

test("bad offers are refused with a reason", async () => {
  await saveFails(asA, null, { ...pct(), kind: "mystery" }, one(juiceA), /invalid_kind/);
  await saveFails(asA, null, pct(0), one(juiceA), /invalid_config/);
  await saveFails(asA, null, pct(10, { conditions: { daysOfWeek: ["funday"] } }), one(juiceA), /invalid_conditions/);
  await saveFails(asA, null, pct(10, { title: "ab" }), one(juiceA), /invalid_title/);
  await saveFails(asA, null, pct(10, { description: "x".repeat(201) }), one(juiceA), /invalid_description/);
  await saveFails(asA, null, pct(10, { chip_text: "x" }), one(juiceA), /invalid_chip_text/);
  await saveFails(asA, null, pct(10, { code: "no spaces" }), one(juiceA), /invalid_code/);
  await saveFails(asA, null, pct(10, { terms: "x".repeat(281) }), one(juiceA), /invalid_terms/);
  await saveFails(asA, null, pct(10, { title: "bad\u0007text" }), one(juiceA), /invalid_text/);
  await saveFails(asA, null, pct(10, { ends_at: new Date(Date.now() - H).toISOString() }), one(juiceA), /ends_in_past/);
  await saveFails(asA, null, pct(10, { starts_at: new Date(Date.now() + 2 * H).toISOString(), ends_at: new Date(Date.now() + H).toISOString() }), one(juiceA), /invalid_window/);
  await saveFails(asA, null, pct(10, { ends_at: new Date(Date.now() + 366 * 24 * H).toISOString() }), one(juiceA), /duration_too_long/);
  await saveFails(asA, null, pct(), [], /no_items/);
  await saveFails(asA, null, pct(), null, /no_items/);
  await saveFails(asA, null, pct(), [{ item_id: "not-a-uuid" }], /item_not_found/);
  assert.equal((await sql(c, `select count(*)::int as n from offers`))[0].n, 0, "nothing half-saved");
});

test("a seller cannot attach another store's product or touch another store's offer", async () => {
  await saveFails(asA, null, pct(), one(juiceB), /item_not_found/);
  await saveFails(asA, null, pct(), [{ item_id: juiceA }, { item_id: juiceB }], /item_not_found/);
  const mine = await save(asA, null, pct(), one(juiceA));
  await saveFails(asB, mine, pct(50), one(juiceB), /offer_not_found/);
  await rejects(c, asB, `select seller_set_offer_active($1, false)`, [mine], /offer_not_found/);
  await rejects(c, asB, `select seller_end_offer($1)`, [mine], /offer_not_found/);
  assert.equal((await sql(c, `select active from offers where id = $1`, [mine]))[0].active, true);
});

test("an offer can be on at most twelve products", async () => {
  const many = [];
  for (let i = 0; i < 13; i++) {
    const id = `20000000-0000-0000-0000-0000000001${String(i).padStart(2, "0")}`;
    await sql(c, `insert into items (id, business_id, name, price) values ($1, $2, $3, 50)`, [id, ids.bizA, `Many ${i}`]);
    many.push({ item_id: id });
  }
  await saveFails(asA, null, pct(), many, /too_many_items/);
  await save(asA, null, pct(), many.slice(0, 12));
});

test("the same product listed twice is one product", async () => {
  const id = await save(asA, null, pct(), [{ item_id: juiceA }, { item_id: juiceA }]);
  assert.equal((await sql(c, `select count(*)::int as n from offer_items where offer_id = $1`, [id]))[0].n, 1);
});

test("the rules also hold for direct writes, not only the function", async () => {
  await rejects(c, asA, `insert into offers (business_id, title, kind, config) values ($1, 'Direct', 'percent_off', '{"percent": 500}')`, [ids.bizA], /invalid_offer_config/);
  await rejects(c, asA, `insert into offers (business_id, title, kind, config, conditions) values ($1, 'Direct', 'percent_off', '{"percent": 5}', '{"daysOfWeek":["x"]}')`, [ids.bizA], /invalid_offer_conditions/);
  await rejects(c, asA, `insert into offers (business_id, title, kind, config, ends_at, starts_at) values ($1, 'Direct', 'percent_off', '{"percent": 5}', now(), now() + interval '1 hour')`, [ids.bizA], /invalid_window/);
  await rejects(c, asA, `insert into offers (business_id, title, config) values ($1, 'Direct', '{"percent": 5}')`, [ids.bizA], /invalid_offer_config/);
  await rejects(c, asA, `insert into offers (business_id, title, kind) values ($1, 'Direct', 'teleport')`, [ids.bizA], /invalid_offer_config|offers_kind_check/);
  const mine = await save(asA, null, pct(), one(juiceA));
  await rejects(c, asA, `update offers set config = '{"percent": 0}' where id = $1`, [mine], /invalid_offer_config/);
  await rejects(c, asA, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [mine, juiceB, ids.bizA], /offer_item_mismatch/);
  await rejects(c, asB, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [mine, juiceB, ids.bizB], /offer_item_mismatch/);
  await rejects(c, asB, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [mine, juiceA, ids.bizA], /offer_item_mismatch|row-level security/);
});

test("a seller only sees their own offers and offer products", async () => {
  const mine = await save(asA, null, pct(), one(juiceA));
  await save(asB, null, pct(7), one(juiceB));
  assert.deepEqual((await tx(c, asA, (k) => sql(k, `select id from offers`))).map((r) => r.id), [mine]);
  assert.equal((await tx(c, asA, (k) => sql(k, `select item_id from offer_items`))).length, 1);
  await rejects(c, anon, `select * from offer_items`, [], /permission denied/);
  await rejects(c, anon, `select * from offers`, [], /permission denied|row-level security/);
});

test("a suspended seller cannot write offers", async () => {
  const mine = await save(asA, null, pct(), one(juiceA));
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  await saveFails(asA, null, pct(), one(juiceA), /account_suspended/);
  await saveFails(asA, mine, pct(5), one(juiceA), /account_suspended/);
  await rejects(c, asA, `select seller_set_offer_active($1, false)`, [mine], /account_suspended/);
  await rejects(c, asA, `select seller_end_offer($1)`, [mine], /account_suspended/);
  await rejects(c, asA, `insert into offer_items (offer_id, item_id, business_id) values ($1, $2, $3)`, [mine, refillA, ids.bizA], /row-level security|account_suspended|offer_item_mismatch/);
});

// ---- Pause, end, limit --------------------------------------------------------------------------------------------

test("a seller pauses and resumes; ending stamps the end, and a scheduled one is removed", async () => {
  const id = await save(asA, null, pct(), one(juiceA));
  await tx(c, asA, (k) => k.query(`select seller_set_offer_active($1, false)`, [id]), { commit: true });
  assert.equal((await sql(c, `select active from offers where id = $1`, [id]))[0].active, false);
  assert.deepEqual(await publicIds(ids.bizA), []);
  await tx(c, asA, (k) => k.query(`select seller_set_offer_active($1, true)`, [id]), { commit: true });
  assert.deepEqual(await publicIds(ids.bizA), [id]);

  const ended = (await tx(c, asA, (k) => sql(k, `select seller_end_offer($1) as r`, [id]), { commit: true }))[0].r;
  assert.equal(ended, "ended");
  const [row] = await sql(c, `select ends_at, active from offers where id = $1`, [id]);
  assert.ok(Date.parse(row.ends_at) <= Date.now());
  assert.deepEqual(await publicIds(ids.bizA), []);

  const later = await save(asA, null, pct(5, { starts_at: new Date(Date.now() + 5 * H).toISOString() }), one(juiceA));
  assert.equal((await tx(c, asA, (k) => sql(k, `select seller_end_offer($1) as r`, [later]), { commit: true }))[0].r, "removed");
  assert.equal((await sql(c, `select count(*)::int as n from offers where id = $1`, [later]))[0].n, 0);
  await rejects(c, asA, `select seller_end_offer($1)`, [later], /offer_not_found/);
});

test("the plan limit counts running offers, not ones that have ended", async () => {
  for (let i = 0; i < 8; i++) await save(asA, null, pct(5 + i), one(juiceA));
  await saveFails(asA, null, pct(40), one(juiceA), /limit_reached:offers/);
  const [first] = await sql(c, `select id from offers order by created_at limit 1`);
  await tx(c, asA, (k) => k.query(`select seller_end_offer($1)`, [first.id]), { commit: true });
  await save(asA, null, pct(41), one(juiceA));
  await saveFails(asA, null, pct(42), one(juiceA), /limit_reached:offers/);
  await sql(c, `update offers set active = false where id = (select id from offers where title = '41% off')`);
  const [paused] = await sql(c, `select id from offers where title = '41% off'`);
  await save(asA, null, pct(43), one(juiceA));
  await rejects(c, asA, `select seller_set_offer_active($1, true)`, [paused.id], /limit_reached:offers/);
});

// ---- What customers see -------------------------------------------------------------------------------------------

test("customers see an offer with the products it is on", async () => {
  const id = await save(asA, null, { kind: "bundle", config: { rewardType: "bundle_price", rewardValue: 450 }, title: "Bottle and refill", code: "WATER" }, [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
  const rows = await publicOffers(ids.bizA);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.equal(rows[0].kind, "bundle");
  assert.deepEqual(rows[0].items, [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
  const perItem = await tx(c, anon, (k) => sql(k, `select item_id, role from public_offer_items where offer_id = $1 order by role`, [id]));
  assert.deepEqual(perItem, [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
});

test("a product with no offer has no row, and a store counts its products", async () => {
  await save(asA, null, pct(10), [{ item_id: juiceA }]);
  await save(asA, null, pct(20), [{ item_id: juiceA }, { item_id: refillA }]);
  const rows = await tx(c, anon, (k) => sql(k, `select item_id, count(*)::int as n from public_offer_items where business_id = $1 group by item_id order by item_id`, [ids.bizA]));
  assert.deepEqual(rows, [{ item_id: refillA, n: 1 }, { item_id: juiceA, n: 2 }]);
  assert.equal(rows.some((r) => r.item_id === bottleA), false, "the bottle has no offer, so no chip");
  assert.equal((await tx(c, anon, (k) => sql(k, `select distinct item_id from public_offer_items where business_id = $1`, [ids.bizA]))).length, 2);
  assert.equal((await tx(c, anon, (k) => sql(k, `select item_id from public_offer_items where business_id = $1`, [ids.bizB]))).length, 0);
});

test("only running offers show: window, switch, admin and store state", async () => {
  const open = await save(asA, null, pct(1), one(juiceA));
  const windowed = await save(asA, null, pct(2, { ends_at: new Date(Date.now() + H).toISOString() }), one(juiceA));
  await save(asA, null, pct(3, { starts_at: new Date(Date.now() + H).toISOString() }), one(juiceA));
  const off = await save(asA, null, pct(4), one(juiceA));
  await sql(c, `update offers set active = false where id = $1`, [off]);
  const hidden = await save(asA, null, pct(5), one(juiceA));
  await sql(c, `update offers set hidden_by_admin = true where id = $1`, [hidden]);
  const removed = await save(asA, null, pct(6), one(juiceA));
  await sql(c, `update offers set removed_by_admin = true where id = $1`, [removed]);
  assert.deepEqual(await publicIds(ids.bizA), [open, windowed]);
  await sql(c, `update offers set ends_at = now() - interval '1 minute', starts_at = now() - interval '1 day' where id = $1`, [windowed]);
  assert.deepEqual(await publicIds(ids.bizA), [open]);
  await sql(c, `update businesses set status = 'paused' where id = $1`, [ids.bizA]);
  assert.deepEqual(await publicIds(ids.bizA), []);
  await sql(c, `update businesses set status = 'live', deleted_at = now() where id = $1`, [ids.bizA]);
  assert.deepEqual(await publicIds(ids.bizA), []);
});

test("an offer follows its products: hidden, draft, removed or deleted products drop out", async () => {
  const id = await save(asA, null, pct(10), [{ item_id: juiceA }, { item_id: refillA }]);
  const itemsOf = async () => (await publicOffers(ids.bizA))[0]?.items.map((i) => i.item_id).sort();
  assert.deepEqual(await itemsOf(), [refillA, juiceA].sort());
  await sql(c, `update items set visible = false where id = $1`, [juiceA]);
  assert.deepEqual(await itemsOf(), [refillA]);
  await sql(c, `update items set visible = true, draft = true where id = $1`, [juiceA]);
  assert.deepEqual(await itemsOf(), [refillA]);
  await sql(c, `update items set draft = false, hidden_by_admin = true where id = $1`, [juiceA]);
  assert.deepEqual(await itemsOf(), [refillA]);
  await sql(c, `update items set hidden_by_admin = false, removed_by_admin = true where id = $1`, [juiceA]);
  assert.deepEqual(await itemsOf(), [refillA]);
  assert.equal((await tx(c, anon, (k) => sql(k, `select item_id from public_offer_items where item_id = $1`, [juiceA]))).length, 0, "no chip on a product customers cannot see");
  await sql(c, `delete from items where id = $1`, [refillA]);
  assert.deepEqual(await publicIds(ids.bizA), [], "with no product left the offer shows nothing");
  assert.equal((await sql(c, `select count(*)::int as n from offers where id = $1`, [id]))[0].n, 1, "but it is kept for the seller");
});

test("a bundle needs its main and a companion to be public", async () => {
  const id = await save(asA, null, { kind: "bundle", config: { rewardType: "free_gift", gift: "Cap" }, title: "Bottle and cap" }, [{ item_id: bottleA, role: "main" }, { item_id: refillA, role: "with" }]);
  assert.deepEqual(await publicIds(ids.bizA), [id]);
  await sql(c, `update items set visible = false where id = $1`, [refillA]);
  assert.deepEqual(await publicIds(ids.bizA), [], "the companion is gone");
  await sql(c, `update items set visible = true where id = $1`, [refillA]);
  await sql(c, `update items set visible = false where id = $1`, [bottleA]);
  assert.deepEqual(await publicIds(ids.bizA), [], "the main product is gone");
});

test("offers from before products were attached stay in the database and show nothing", async () => {
  await sql(c, `insert into offers (business_id, title) values ($1, 'Old store-wide offer')`, [ids.bizA]);
  await sql(c, `insert into offers (business_id, title, kind, config) values ($1, 'No products yet', 'percent_off', '{"percent": 10}')`, [ids.bizA]);
  assert.deepEqual(await publicIds(ids.bizA), []);
  assert.equal((await tx(c, asA, (k) => sql(k, `select id from offers`))).length, 2, "the seller still sees them");
});

test("the views expose only customer-safe columns", async () => {
  await save(asA, null, pct(), one(juiceA));
  await rejects(c, anon, `select admin_reason from public_offers`, [], /column "admin_reason" does not exist/);
  await rejects(c, anon, `select hidden_by_admin from public_offers`, [], /column "hidden_by_admin" does not exist/);
  await rejects(c, anon, `select business_id, updated_at from public_offer_items`, [], /column "updated_at" does not exist/);
  const cols = Object.keys((await tx(c, anon, (k) => sql(k, `select * from public_offers limit 1`)))[0]);
  assert.deepEqual(cols, ["id", "business_id", "title", "description", "starts_at", "ends_at", "created_at", "kind", "config", "conditions", "chip_text", "code", "terms", "items"]);
});

test("a saved offer passes the same checks in the shared engine", async () => {
  const items = [{ id: juiceA, name: "Juice", price: 120, priceType: "fixed" }];
  const input = { kind: "multi_buy", config: { qty: 3, price: 300 }, itemIds: [juiceA], chipText: "Value pack", code: "pack3", conditions: { hours: { from: "16:00", to: "18:00" } } };
  const js = validateOffer(input, { items });
  assert.equal(js.ok, true);
  const id = await save(asA, null, { kind: js.value.kind, config: js.value.config, conditions: js.value.conditions, title: js.value.title, chip_text: js.value.chipText, code: js.value.code, terms: js.value.terms, description: js.value.description }, js.value.items.map((i) => ({ item_id: i.itemId, role: i.role })));
  const [row] = await sql(c, `select title, config, conditions, chip_text, code from offers where id = $1`, [id]);
  assert.deepEqual(row.config, js.value.config);
  assert.deepEqual(row.conditions, js.value.conditions);
  assert.equal(row.title, js.value.title);
  assert.equal(row.code, "PACK3");
});
