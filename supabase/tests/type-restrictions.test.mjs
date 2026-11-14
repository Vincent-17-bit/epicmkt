// Migration 0091 (A08): departments, selling restrictions on product types, missing-type requests.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { REGULATED_TYPES } from "../../shared/src/types/restrictions.js";
import { categories as liveCategories } from "../../client/src/data/categories.js";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB, asAdmin } from "./db.mjs";

let c;
const U = (n) => `00000000-0000-0000-0000-0000000001${n}`;
const B = (n) => `10000000-0000-0000-0000-0000000001${n}`;
// shops by category: boutique, electronics, chemist, agrovet (+ the fixtures' two barbers)
const shops = { boutique: [U("01"), B("01"), "tailor-boutique"], electronics: [U("02"), B("02"), "electronics-computers"], chemist: [U("03"), B("03"), "chemist"], agrovet: [U("04"), B("04"), "agrovet"] };
const who = (k) => ({ sub: shops[k][0] });
const reviewer = { sub: U("11") };
const support = { sub: U("12") };

before(async () => {
  c = await connect(await createDatabase());
  await seedFixtures(c);
  for (const [k, [u, b, cat]] of Object.entries(shops)) {
    await sql(c, `insert into auth.users (id, email) values ($1, $2)`, [u, `${k}@test`]);
    await sql(c, `insert into categories (id, name, grp, tier, sort) values ($1, $1, 'G', 'A', 5) on conflict do nothing`, [cat]);
    await sql(c, `insert into plans (category_id, plan_key, price_kes, items_limit, top_benefits) values ($1, 'standard', 500, 50, '["a","b","c"]') on conflict do nothing`, [cat]);
    await sql(c, `insert into businesses (id, seller_id, user_id, slug, name, category_id, plan_key, status, phone) values ($1, $2, $3, $4, $5, $6, 'standard', 'live', $7)`,
      [b, `ES2000${k.length}${b.slice(-2)}`, u, `shop-${k}`, `Shop ${k}`, cat, `+2547${b.slice(-2)}000${b.slice(-2)}`]);
  }
  await sql(c, `insert into auth.users (id, email) values ($1, 'rev@test'), ($2, 'sup@test')`, [reviewer.sub, support.sub]);
  await sql(c, `insert into admins (user_id, role, email) values ($1, 'reviewer', 'rev@test'), ($2, 'support', 'sup@test')`, [reviewer.sub, support.sub]);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from type_requests; delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const as = (w, text, params) => tx(c, w, (k) => sql(k, text, params), { commit: true });
const base = (o = {}) => ({ name: "Thing", description: "", section: "General", price_type: "fixed", price: 1000, price_max: null, sale_price: null, unit: null, availability: "available", ...o });
const save = (w, id, fields) => as(w, `select seller_save_item($1::uuid, $2::jsonb) as id`, [id, JSON.stringify(fields)]).then((r) => r[0].id);
const saveFails = (w, id, fields, pattern) => rejects(c, w, `select seller_save_item($1::uuid, $2::jsonb)`, [id, JSON.stringify(fields)], pattern);
const typeOf = (id) => sql(c, `select product_type_id as t from items where id = $1`, [id]).then((r) => r[0].t);
const itemCount = () => sql(c, `select count(*)::int as n from items`).then((r) => r[0].n);

// ---- departments ----

test("departments exist as data: the thirteen named ones and a department for every live category group", async () => {
  const rows = await sql(c, `select id, name from departments where active order by sort`);
  const names = rows.map((r) => r.name);
  for (const n of ["Clothing", "Shoes", "Bags", "Jewellery", "Fragrance", "Phones", "Computers", "Cables and power", "Lighting", "Batteries", "Printers and ink", "Printing services", "Stationery"]) {
    assert.ok(names.includes(n), `missing department ${n}`);
  }
  assert.ok(liveCategories.length > 30);
  const groups = new Set(liveCategories.map((x) => x.group));
  assert.ok(groups.size >= 10);
  // every live group maps to a department whose name or id covers it (water-energy, food-drink, ...)
  const covered = { "Water and energy": "water-energy", "Food and drink": "food-drink", "Health": "medicine-health", "Beauty and fitness": "beauty-personal-care",
    "Agriculture": "farm-inputs", "Tech and office": "electronics", "Home and construction": "hardware-building", "Fashion": "clothing", "Auto": "auto-parts", "Services and education": "education" };
  for (const g of groups) { assert.ok(covered[g], `test map misses live group ${g}`); assert.ok(rows.some((r) => r.id === covered[g]), `no department for ${g}`); }
});

test("departments are readable by anyone and writable by no browser role", async () => {
  assert.ok((await as({ role: "anon" }, `select count(*)::int as n from departments`))[0].n > 20);
  await rejects(c, asA, `insert into departments (id, name) values ('x-dept', 'X dept')`, [], /permission denied/);
});

// ---- seeded restrictions agree with the code ----

test("the seeded restricted_to lists are exactly shared REGULATED_TYPES, and nothing else is restricted", async () => {
  const rows = await sql(c, `select id, restricted_to from product_types where cardinality(restricted_to) > 0 order by id`);
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.id, r.restricted_to])), Object.fromEntries(Object.entries(REGULATED_TYPES).map(([k, v]) => [k, [...v]])));
});

test("every seeded type points at a real department and its categories exist in the live category list", async () => {
  const live = new Set(liveCategories.map((x) => x.id));
  for (const t of await sql(c, `select t.id, t.category_ids, t.restricted_to, d.id as dept from product_types t left join departments d on d.id = t.department_id`)) {
    assert.ok(t.dept, `${t.id} has no department`);
    for (const k of [...t.category_ids, ...t.restricted_to]) assert.ok(live.has(k), `${t.id} names unknown category ${k}`);
  }
});

// ---- seller_save_item: allowed and forbidden ----

test("a boutique can add fragrance", async () => {
  const id = await save(who("boutique"), null, base({ name: "Oud", productTypeId: "fragrance" }));
  assert.equal(await typeOf(id), "fragrance");
});

test("an electronics shop can add stationery", async () => {
  const id = await save(who("electronics"), null, base({ name: "Pens", productTypeId: "stationery" }));
  assert.equal(await typeOf(id), "stationery");
});

test("any shop can sell any unrestricted type, even outside its usual categories", async () => {
  const id = await save(who("agrovet"), null, base({ name: "Perfume", productTypeId: "fragrance" }));
  assert.equal(await typeOf(id), "fragrance");
});

test("a non-chemist cannot add prescription medicine, and nothing is written", async () => {
  for (const k of ["boutique", "electronics", "agrovet"]) {
    await saveFails(who(k), null, base({ name: "Amoxicillin", productTypeId: "prescription-medicine" }), /type_not_allowed/);
  }
  assert.equal(await itemCount(), 0);
});

test("a chemist can add prescription medicine but not vet medicine or agrochemicals", async () => {
  const id = await save(who("chemist"), null, base({ name: "Amoxicillin", productTypeId: "prescription-medicine" }));
  assert.equal(await typeOf(id), "prescription-medicine");
  await saveFails(who("chemist"), null, base({ productTypeId: "vet-medicine" }), /type_not_allowed/);
  await saveFails(who("chemist"), null, base({ productTypeId: "agrochemicals" }), /type_not_allowed/);
});

test("an agrovet can add vet medicine and agrochemicals but not prescription medicine", async () => {
  assert.equal(await typeOf(await save(who("agrovet"), null, base({ name: "Dewormer", productTypeId: "vet-medicine" }))), "vet-medicine");
  assert.equal(await typeOf(await save(who("agrovet"), null, base({ name: "Herbicide", productTypeId: "agrochemicals" }))), "agrochemicals");
  await saveFails(who("agrovet"), null, base({ productTypeId: "prescription-medicine" }), /type_not_allowed/);
});

test("moving an existing item onto a forbidden type is refused and the item keeps its old type", async () => {
  const id = await save(who("boutique"), null, base({ productTypeId: "fragrance" }));
  await saveFails(who("boutique"), id, base({ productTypeId: "prescription-medicine" }), /type_not_allowed/);
  assert.equal(await typeOf(id), "fragrance");
});

test("Other goods: a null type is always allowed, and clears an earlier type", async () => {
  const id = await save(who("boutique"), null, base({ productTypeId: "fragrance" }));
  await save(who("boutique"), id, base({ productTypeId: null }));
  assert.equal(await typeOf(id), null);
  assert.equal(await typeOf(await save(who("chemist"), null, base({ productTypeId: null }))), null);
});

test("items that never send productTypeId behave as before, and editing keeps the type already there", async () => {
  const plain = await save(who("boutique"), null, base({ name: "Dress" }));
  assert.equal(await typeOf(plain), null);
  const typed = await save(who("boutique"), null, base({ productTypeId: "fragrance" }));
  await save(who("boutique"), typed, base({ name: "Renamed", price: 1200 }));    // no productTypeId key
  assert.equal(await typeOf(typed), "fragrance");
  assert.equal((await sql(c, `select name from items where id = $1`, [typed]))[0].name, "Renamed");
});

test("unknown, inactive and malformed type ids are refused with a named error", async () => {
  await saveFails(who("boutique"), null, base({ productTypeId: "no-such-type" }), /unknown_product_type/);
  await sql(c, `update product_types set active = false where id = 'stationery'`);
  await saveFails(who("electronics"), null, base({ productTypeId: "stationery" }), /unknown_product_type/);
  await sql(c, `update product_types set active = true where id = 'stationery'`);
  await saveFails(who("boutique"), null, base({ productTypeId: 5 }), /invalid_product_type/);
  await saveFails(who("boutique"), null, base({ productTypeId: ["fragrance"] }), /invalid_product_type/);
});

test("a restriction naming a category that does not exist fails closed: nobody can sell the type", async () => {
  await sql(c, `insert into product_types (id, slug, name, department_id, restricted_to) values ('ghost-type', 'ghost-type', 'Ghost', 'stationery', '{no-such-category}')`);
  for (const k of ["boutique", "electronics", "chemist", "agrovet"]) await saveFails(who(k), null, base({ productTypeId: "ghost-type" }), /type_not_allowed/);
});

test("seller_check_item applies the same rule and writes nothing", async () => {
  const before = await itemCount();
  const refused = await as(who("boutique"), `select seller_check_item($1::uuid, $2::jsonb) as r`, [null, JSON.stringify(base({ productTypeId: "prescription-medicine" }))]);
  assert.deepEqual(refused[0].r, { ok: false, issues: [{ code: "type_not_allowed" }] });
  const ok = await as(who("boutique"), `select seller_check_item($1::uuid, $2::jsonb) as r`, [null, JSON.stringify(base({ productTypeId: "fragrance" }))]);
  assert.ok(ok[0].r);
  assert.equal(await itemCount(), before);
});

test("the guarantee is in the database: a direct insert or update of a forbidden type is refused for every writer", async () => {
  const [, bBoutique] = shops.boutique;
  await rejects(c, { role: "service_role" }, `insert into items (business_id, name, price_type, price, availability, product_type_id) values ($1, 'xx', 'fixed', 1, 'available', 'prescription-medicine')`, [bBoutique], /type_not_allowed/);
  const id = (await sql(c, `insert into items (business_id, name, price_type, price, availability) values ($1, 'xx', 'fixed', 1, 'available') returning id`, [bBoutique]))[0].id;
  await rejects(c, { role: "service_role" }, `update items set product_type_id = 'vet-medicine' where id = $1`, [id], /type_not_allowed/);
  await sql(c, `update items set product_type_id = 'fragrance', specs = '[{"group":"Item details","label":"Authenticity","value":"Original"}]' where id = $1`, [id]);
  assert.equal(await typeOf(id), "fragrance");
});

test("an item already typed stays editable if the shop's category later changes (the check runs only when the type is set)", async () => {
  const id = await save(who("chemist"), null, base({ productTypeId: "prescription-medicine" }));
  await sql(c, `update businesses set category_id = 'tailor-boutique' where id = $1`, [shops.chemist[1]]);
  await sql(c, `update items set name = 'Still editable' where id = $1`, [id]);
  await sql(c, `update businesses set category_id = 'chemist' where id = $1`, [shops.chemist[1]]);
});

test("a visitor who is not a seller cannot save with a type", async () => {
  await rejects(c, { sub: ids.admin }, `select seller_save_item($1::uuid, $2::jsonb)`, [null, JSON.stringify(base({ productTypeId: "fragrance" }))], /not_a_seller/);
  assert.equal(await tx(c, { role: "anon" }, async (k) => { try { await k.query(`select seller_save_item(null, '{}')`); return "ran"; } catch { return "denied"; } }), "denied");
});

// ---- seller_product_types ----

test("seller_product_types leaves out types the shop may not sell and keeps the contract shape", async () => {
  const idsFor = async (k) => (await as(who(k), `select seller_product_types() as r`))[0].r;
  const names = async (k) => (await idsFor(k)).types.map((t) => t.id);
  // Not an exact list: the seeded general types (fragrance, stationery, liquor, bread, phone ...) grow over time. The rule is what is tested.
  const open = ["fragrance", "stationery", "liquor"];           // no restriction: every shop is offered them
  const boutique = await idsFor("boutique");
  const chemist = await names("chemist");
  const agrovet = await names("agrovet");
  const boutiqueIds = boutique.types.map((t) => t.id);
  for (const id of open) for (const list of [boutiqueIds, chemist, agrovet]) assert.ok(list.includes(id), `${id} is offered to every shop`);
  for (const id of ["prescription-medicine", "agrochemicals", "vet-medicine"]) assert.ok(!boutiqueIds.includes(id), `a boutique is not offered ${id}`);
  assert.ok(chemist.includes("prescription-medicine") && !chemist.includes("agrochemicals") && !chemist.includes("vet-medicine"));
  assert.ok(agrovet.includes("agrochemicals") && agrovet.includes("vet-medicine") && !agrovet.includes("prescription-medicine"));
  // The general rule, for every shop: a type that is restricted lists the shop's own category.
  for (const k of ["boutique", "chemist", "agrovet"]) {
    const category = (await sql(c, `select category_id from businesses where id = $1`, [shops[k][1]]))[0].category_id;
    for (const t of (await idsFor(k)).types) if (t.restrictedTo) assert.ok(t.restrictedTo.includes(category), `${t.id} is restricted to ${t.restrictedTo} but was offered to a ${category}`);
  }
  assert.ok(boutique.departments.length > 20 && boutique.departments[0].id && boutique.departments[0].name);
  const rx = (await idsFor("chemist")).types.find((t) => t.id === "prescription-medicine");
  assert.deepEqual(rx.restrictedTo, ["chemist"]);
  assert.equal(rx.departmentId, "medicine-health");
  assert.equal(rx.quantityMode, "units");
  const fr = boutique.types.find((t) => t.id === "fragrance");
  assert.equal("restrictedTo" in fr, false);
  for (const k of ["id", "slug", "name", "kind", "departmentId", "categoryIds", "quantityMode", "axes", "specRows"]) assert.ok(k in fr, k);
});

test("a suspended seller cannot load the type list", async () => {
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [shops.boutique[1]]);
  try { await rejects(c, who("boutique"), `select seller_product_types()`, []); }
  finally { await sql(c, `update businesses set status = 'live' where id = $1`, [shops.boutique[1]]); }
});

test("seller_product_types is for sellers only", async () => {
  await rejects(c, { sub: ids.admin }, `select seller_product_types()`, [], /not_a_seller/);
  await rejects(c, { role: "anon" }, `select seller_product_types()`, [], /permission denied/);
});

// ---- seller_request_type ----

const request = (w, name, note) => as(w, `select seller_request_type($1, $2) as id`, [name, note]).then((r) => r[0].id);

test("a seller who cannot find a type requests it and still adds the item as Other goods", async () => {
  const rid = await request(who("boutique"), "  Wedding   favours ", "Small gifts for guests");
  const row = (await sql(c, `select * from type_requests where id = $1`, [rid]))[0];
  assert.equal(row.name, "Wedding favours");
  assert.equal(row.note, "Small gifts for guests");
  assert.equal(row.status, "pending");
  assert.equal(row.business_id, shops.boutique[1]);
  assert.equal(await typeOf(await save(who("boutique"), null, base({ name: "Favour box", productTypeId: null }))), null);
});

test("asking again for the same name returns the open request; another shop gets its own row", async () => {
  const a = await request(who("boutique"), "Wedding favours", null);
  assert.equal(await request(who("boutique"), "wedding  FAVOURS", "again"), a);
  const b = await request(who("electronics"), "Wedding favours", null);
  assert.notEqual(a, b);
  assert.equal((await sql(c, `select count(*)::int as n from type_requests`))[0].n, 2);
});

test("a note is optional; names and notes are validated", async () => {
  assert.ok(await request(who("boutique"), "Candles", null));
  await rejects(c, who("boutique"), `select seller_request_type('a', null)`, [], /invalid_name/);
  await rejects(c, who("boutique"), `select seller_request_type($1, null)`, ["x".repeat(81)], /invalid_name/);
  await rejects(c, who("boutique"), `select seller_request_type(null, null)`, [], /invalid_name/);
  await rejects(c, who("boutique"), `select seller_request_type('Fine name', $1)`, ["n".repeat(501)], /invalid_note/);
});

test("a shop can have at most 20 open requests", async () => {
  for (let i = 0; i < 20; i++) await request(who("boutique"), `Type number ${i}`, null);
  await rejects(c, who("boutique"), `select seller_request_type('One too many', null)`, [], /too_many_type_requests/);
  assert.ok(await request(who("electronics"), "Another shop is unaffected", null));
});

test("only sellers can request; a seller reads only their own requests", async () => {
  await rejects(c, { sub: ids.admin }, `select seller_request_type('Candles', null)`, [], /not_a_seller/);
  await rejects(c, { role: "anon" }, `select seller_request_type('Candles', null)`, [], /permission denied/);
  await request(who("boutique"), "Candles", null);
  await request(who("electronics"), "Cables", null);
  assert.deepEqual((await as(who("boutique"), `select name from type_requests`)).map((r) => r.name), ["Candles"]);
  assert.deepEqual((await as(who("electronics"), `select name from type_requests`)).map((r) => r.name), ["Cables"]);
  await rejects(c, who("boutique"), `update type_requests set status = 'resolved'`, [], /permission denied/);
});

test("a suspended seller cannot request a type", async () => {
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [shops.boutique[1]]);
  try { await rejects(c, who("boutique"), `select seller_request_type('Candles', null)`, []); }
  finally { await sql(c, `update businesses set status = 'live' where id = $1`, [shops.boutique[1]]); }
});

// ---- admin: list and resolve ----

test("admin lists requests with the shop and how many others asked the same", async () => {
  await request(who("boutique"), "Wedding favours", "gifts");
  await request(who("electronics"), "wedding favours", null);
  await request(who("chemist"), "Candles", null);
  const rows = (await as(asAdmin, `select admin_type_requests_list() as r`))[0].r;
  assert.equal(rows.length, 3);
  const fav = rows.find((r) => r.businessId === shops.boutique[1]);
  assert.equal(fav.alsoAskedBy, 1);
  assert.equal(fav.categoryId, "tailor-boutique");
  assert.equal(fav.businessName, "Shop boutique");
  assert.equal(rows.find((r) => r.name === "Candles").alsoAskedBy, 0);
  assert.deepEqual(rows.map((r) => r.status), ["pending", "pending", "pending"]);
});

test("admin functions refuse non-admins and anon", async () => {
  await rejects(c, who("boutique"), `select admin_type_requests_list()`, [], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_type_requests_list()`, [], /permission denied/);
  const rid = await request(who("boutique"), "Candles", null);
  await rejects(c, who("boutique"), `select admin_resolve_type_request($1, 'resolved')`, [rid], /forbidden/);
  await rejects(c, { role: "anon" }, `select admin_resolve_type_request($1, 'resolved')`, [rid], /permission denied/);
  await rejects(c, support, `select admin_resolve_type_request($1, 'resolved')`, [rid], /forbidden/);
});

test("a reviewer resolves a request pointing at a type; it leaves the pending list and is audited", async () => {
  const rid = await request(who("boutique"), "Perfume oils", null);
  await as(reviewer, `select admin_resolve_type_request($1, 'resolved', 'fragrance', 'Use Fragrance')`, [rid]);
  const row = (await sql(c, `select * from type_requests where id = $1`, [rid]))[0];
  assert.equal(row.status, "resolved");
  assert.equal(row.resolved_type_id, "fragrance");
  assert.equal(row.admin_note, "Use Fragrance");
  assert.equal(row.resolved_by, reviewer.sub);
  assert.ok(row.resolved_at);
  assert.equal((await as(asAdmin, `select admin_type_requests_list() as r`))[0].r.length, 0);
  const done = (await as(asAdmin, `select admin_type_requests_list('resolved') as r`))[0].r;
  assert.equal(done[0].resolvedTypeId, "fragrance");
  assert.equal((await as(asAdmin, `select admin_type_requests_list('all') as r`))[0].r.length, 1);
  assert.equal((await sql(c, `select count(*)::int as n from audit_log where action = 'type_request.resolved' and target_id = $1`, [rid]))[0].n, 1);
  // the seller can now ask for the same name again
  assert.ok(await request(who("boutique"), "Perfume oils", null));
});

test("declining needs a note; resolve can be closed without a type; closed requests cannot be resolved again", async () => {
  const a = await request(who("boutique"), "Illegal thing", null);
  await rejects(c, asAdmin, `select admin_resolve_type_request($1, 'declined')`, [a], /note_required/);
  await rejects(c, asAdmin, `select admin_resolve_type_request($1, 'declined', 'fragrance', 'x')`, [a], /invalid_outcome/);
  await as(asAdmin, `select admin_resolve_type_request($1, 'declined', null, 'Not something we list')`, [a]);
  await rejects(c, asAdmin, `select admin_resolve_type_request($1, 'resolved')`, [a], /type_request_closed/);
  const b = await request(who("boutique"), "Candles", null);
  await as(asAdmin, `select admin_resolve_type_request($1, 'resolved')`, [b]);
  assert.equal((await sql(c, `select status, resolved_type_id from type_requests where id = $1`, [b]))[0].resolved_type_id, null);
});

test("resolve and list validate their inputs", async () => {
  const rid = await request(who("boutique"), "Candles", null);
  await rejects(c, asAdmin, `select admin_resolve_type_request($1, 'maybe')`, [rid], /invalid_outcome/);
  await rejects(c, asAdmin, `select admin_resolve_type_request($1, 'resolved', 'no-such-type')`, [rid], /unknown_product_type/);
  await rejects(c, asAdmin, `select admin_resolve_type_request('00000000-0000-0000-0000-00000000ffff', 'resolved')`, [], /type_request_not_found/);
  await rejects(c, asAdmin, `select admin_type_requests_list('bogus')`, [], /invalid_status/);
});
