import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, asA, asAdmin, ids } from "./db.mjs";

let c;
const REVIEWER = "00000000-0000-0000-0000-0000000000c1";
const asReviewer = { sub: REVIEWER };
const axis = (key, over = {}) => ({ key, label: key, display: "button", ...over });
const type = (over = {}) => ({ name: "Tablet", departmentId: null, categoryIds: [], axes: [axis("storage", { suggested: [{ id: "64-gb", label: "64 GB" }] })], ...over });

before(async () => {
  c = await connect(await createDatabase({ database: "epicmkt_admin_product_types" }));
  await seedFixtures(c);
  await sql(c, `insert into auth.users (id, email) values ('${REVIEWER}', 'reviewer@test');
    insert into public.admins (user_id, role, email) values ('${REVIEWER}', 'reviewer', 'reviewer@test');
    update public.admins set role = 'owner', email = 'admin@test' where user_id = '${ids.admin}'`);
});
after(async () => { await c?.end(); });

const save = (who, id, t) => tx(c, who, async (k) => (await k.query(`select admin_save_product_type($1, $2::jsonb) as r`, [id, JSON.stringify(t)])).rows[0].r, { commit: true });
const fails = (who, id, t, pattern) => rejects(c, who, `select admin_save_product_type($1, $2::jsonb)`, [id, JSON.stringify(t)], pattern);
const list = (who) => tx(c, who, async (k) => (await k.query(`select admin_product_types_list() as r`)).rows[0].r);

test("the owner creates a type, edits it, and both are audited and listed", async () => {
  await save(asAdmin, "tablet", type());
  await save(asAdmin, "tablet", type({ name: "Tablets", axes: [axis("storage"), axis("colour", { display: "swatch" })] }));
  const got = (await list(asReviewer)).types.find((t) => t.id === "tablet");
  assert.equal(got.name, "Tablets");
  assert.deepEqual(got.axes.map((a) => a.key), ["storage", "colour"]);
  const actions = (await sql(c, `select action from audit_log where target_id = 'tablet' order by created_at`)).map((r) => r.action);
  assert.deepEqual(actions, ["product_type.create", "product_type.update"]);
});

test("the list also carries departments and categories", async () => {
  const r = await list(asReviewer);
  assert.ok(Array.isArray(r.departments) && Array.isArray(r.categories));
});

test("only the owner can save; a seller cannot even list", async () => {
  await fails(asReviewer, "tablet", type(), /forbidden/);
  await fails(asA, "tablet", type(), /forbidden/);
  await rejects(c, asA, `select admin_product_types_list()`, [], /forbidden/);
});

test("bad input is refused", async () => {
  await fails(asAdmin, "Bad Id", type(), /invalid_type_id/);
  await fails(asAdmin, "tablet", type({ name: " " }), /invalid_type_name/);
  await fails(asAdmin, "tablet", type({ departmentId: "nope" }), /invalid_department/);
  await fails(asAdmin, "tablet", type({ categoryIds: ["nope"] }), /invalid_categories/);
  await fails(asAdmin, "tablet", type({ axes: [axis("Bad Key")] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a"), axis("a")] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a", { display: "sparkle" })] }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: ["a", "b", "c", "d"].map((k) => axis(k)) }), /invalid_axes/);
  await fails(asAdmin, "tablet", type({ axes: [axis("a", { suggested: [{ id: "Bad Id", label: "x" }] })] }), /invalid_axes/);
});

// ---- 0126: drafts, published versions and the fields a type carries ----
const call = (who, q, args = []) => tx(c, who, async (k) => (await k.query(q, args)).rows[0].r, { commit: true });
const draft = (who, id, t) => call(who, `select admin_save_type_draft($1, $2::jsonb) as r`, [id, JSON.stringify(t)]);
const publish = (who, id, note = null) => call(who, `select admin_publish_type_version($1, $2) as r`, [id, note]);
const live = async (id) => (await sql(c, `select name, kind, quantity_mode, restricted_to, size_chart_id, axes from product_types where id = '${id}'`))[0];

test("a draft does not change the live type until it is published, and each publish gets the next number", async () => {
  await save(asAdmin, "speaker", type({ name: "Speaker" }));
  const first = (await list(asReviewer)).types.find((t) => t.id === "speaker");
  assert.equal(first.version, 1);
  assert.equal(first.draft, null);

  const cat = (await sql(c, `select id from categories order by id limit 1`))[0].id;
  await draft(asAdmin, "speaker", type({ name: "Speakers", kind: "good", quantityMode: "none", restrictedTo: [cat],
    axes: [axis("power", { scale: "power", open: true, optional: false, affectsPrice: "auto" }), axis("colour", { display: "swatch", affectsPrice: false })] }));
  assert.equal((await live("speaker")).name, "Speaker", "live type unchanged by a draft");
  const listed = (await list(asReviewer)).types.find((t) => t.id === "speaker");
  assert.equal(listed.draft.name, "Speakers");
  assert.ok(listed.draftUpdatedAt);

  const r = await publish(asAdmin, "speaker", "Power is now a scale");
  assert.equal(r.version, 2);
  const row = await live("speaker");
  assert.equal(row.name, "Speakers");
  assert.equal(row.quantity_mode, "none");
  assert.deepEqual(row.restricted_to, [cat]);
  assert.equal(row.axes[0].scale, "power");
  assert.equal(row.axes[1].affectsPrice, false);
  const after = (await list(asReviewer)).types.find((t) => t.id === "speaker");
  assert.equal(after.version, 2);
  assert.equal(after.draft, null);
  const actions = (await sql(c, `select action from audit_log where target_id = 'speaker' order by created_at`)).map((x) => x.action);
  assert.deepEqual(actions, ["product_type.create", "product_type.draft", "product_type.publish"]);
});

test("a new type can live as a draft first, and publishing creates it", async () => {
  await draft(asAdmin, "soundbar", type({ name: "Soundbar" }));
  assert.equal(await live("soundbar"), undefined);
  assert.ok((await list(asReviewer)).newDrafts.some((d) => d.id === "soundbar"));
  const r = await publish(asAdmin, "soundbar");
  assert.equal(r.version, 1);
  assert.equal((await live("soundbar")).name, "Soundbar");
});

test("a draft can be discarded; publishing with no draft is refused", async () => {
  await draft(asAdmin, "speaker", type({ name: "Speakers (draft)" }));
  await call(asAdmin, `select admin_discard_type_draft($1) as r`, ["speaker"]);
  assert.equal((await list(asReviewer)).types.find((t) => t.id === "speaker").draft, null);
  await rejects(c, asAdmin, `select admin_publish_type_version($1)`, ["speaker"], /no_draft/);
  await rejects(c, asAdmin, `select admin_discard_type_draft($1)`, ["speaker"], /no_draft/);
});

test("only the owner drafts, publishes or discards", async () => {
  await rejects(c, asReviewer, `select admin_save_type_draft($1, $2::jsonb)`, ["speaker", JSON.stringify(type())], /forbidden/);
  await rejects(c, asReviewer, `select admin_publish_type_version($1)`, ["speaker"], /forbidden/);
  await rejects(c, asA, `select admin_discard_type_draft($1)`, ["speaker"], /forbidden/);
});

test("the new fields are checked", async () => {
  const bad = (t, pattern) => rejects(c, asAdmin, `select admin_save_type_draft($1, $2::jsonb)`, ["speaker", JSON.stringify(t)], pattern);
  await bad(type({ kind: "gadget" }), /invalid_kind/);
  await bad(type({ quantityMode: "lots" }), /invalid_quantity_mode/);
  await bad(type({ sizeChartId: "00000000-0000-0000-0000-000000000000" }), /invalid_size_chart/);
  await bad(type({ restrictedTo: ["nope"] }), /invalid_restricted_to/);
  await bad(type({ axes: [axis("a", { scale: "Not A Scale" })] }), /invalid_axes/);
  await bad(type({ axes: [axis("a", { open: "yes" })] }), /invalid_axes/);
  await bad(type({ axes: [axis("a", { affectsPrice: "sometimes" })] }), /invalid_axes/);
  await bad(type({ axes: [axis("a", { dependsOn: "b" }), axis("b")] }), /invalid_axes/);
});
