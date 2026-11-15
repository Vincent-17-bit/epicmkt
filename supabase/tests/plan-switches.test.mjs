// Migration 0124: the plan feature switches (0111) are enforced. Off stops new use and hides it from shoppers; it never removes what a shop has.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, rejects, ids, asA, asB } from "./db.mjs";

let c;
const anon = { role: "anon" };
before(async () => { c = await connect(await createDatabase({ database: "epicmkt_plan_switches" })); await seedFixtures(c); });
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from item_media; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days', delivers = null`);
  await sql(c, `update global_limits set standard = '{}', premium = '{}' where id = 1`);
});

const off = (plan, ...keys) => sql(c, `update global_limits set ${plan} = $1::jsonb where id = 1`, [JSON.stringify({ features: Object.fromEntries(keys.map((k) => [k, false])) })]);
const item = async (biz = ids.bizA, extra = "") => (await sql(c, `insert into items (business_id, name, price, price_type, visible, draft ${extra ? "," + extra.split("|")[0] : ""}) values ($1, 'Thing', 100, 'fixed', true, false ${extra ? "," + extra.split("|")[1] : ""}) returning id`, [biz]))[0].id;
const AXES = `[{"key":"size","label":"Size","display":"button","values":[{"id":"s","label":"S"}]}]`;

test("plan_feature_on: on unless a plan says false, per plan", async () => {
  const on = async (biz, key) => (await sql(c, `select plan_feature_on($1, $2) as v`, [biz, key]))[0].v;
  assert.equal(await on(ids.bizA, "options"), true);
  await off("standard", "options", "threeD");
  assert.equal(await on(ids.bizA, "options"), false);
  assert.equal(await on(ids.bizA, "recommend"), true);
  assert.equal(await on(ids.bizB, "options"), true, "the premium plan is a separate setting");
});

test("options: adding them to an item without any is refused, existing ones keep working", async () => {
  const withOptions = await item(ids.bizA, `option_axes|'${AXES}'::jsonb`);
  const plain = await item(ids.bizA);
  await off("standard", "options");
  await rejects(c, asA, `update items set option_axes = '${AXES}'::jsonb where id = $1`, [plain], /feature_off/);
  await sql(c, `update items set name = 'Renamed', option_axes = '${AXES.replace('"S"', '"Small"')}'::jsonb where id = $1`, [withOptions]);
  assert.equal((await sql(c, `select name from items where id = $1`, [withOptions]))[0].name, "Renamed");
  await sql(c, `update items set option_axes = '[]'::jsonb where id = $1`, [withOptions]);
  await rejects(c, asA, `update items set option_axes = '${AXES}'::jsonb where id = $1`, [withOptions], /feature_off/);
  await sql(c, `update items set option_axes = '${AXES}'::jsonb where id = $1`, [await item(ids.bizB)]);
});

test("3D: a model, frame or poster cannot be attached, a plain photo still can, and shoppers get no viewer", async () => {
  const id = await item(ids.bizA);
  const add = (kind, path) => sql(c, `insert into item_media (item_id, business_id, kind, path, mime, role) values ($1, $2, $3, $4, 'image/jpeg', $5)`, [id, ids.bizA, kind, path, kind === "image" ? "image" : kind === "model" ? "model-glb" : kind === "spin" ? "spin-frame" : "poster"]);
  await add("poster", "poster-1");
  const pub = async () => (await tx(c, anon, (k) => sql(k, `select public_item_media3d($1) as v`, [id])))[0].v;
  assert.ok(await pub());
  await off("standard", "threeD");
  await add("image", "photo-1");
  await assert.rejects(add("poster", "poster-2"), /feature_off/);
  await assert.rejects(add("spin", "frame-1"), /feature_off/);
  assert.equal(await pub(), null);
});

test("delivery: a shop cannot start offering it, can still say it does not, and shoppers see nothing", async () => {
  const set = (who, offers) => tx(c, who, (k) => sql(k, `select seller_set_delivery($1::boolean, 100, 10, 'Town', null, null) as r`, [offers]), { commit: true });
  await set(asA, true);
  const shown = async () => (await sql(c, `select delivery from public_businesses where id = $1`, [ids.bizA]))[0].delivery;
  assert.equal((await shown()).offers, true);
  await off("standard", "delivery");
  assert.deepEqual(await shown(), { offers: false });
  await assert.rejects(set(asA, true), /feature_off/);
  await set(asA, false);
  await set(asB, true);
  assert.equal((await sql(c, `select delivery from public_businesses where id = $1`, [ids.bizB]))[0].delivery.offers, true);
});

test("demand: the seller's view is refused, nothing else changes", async () => {
  await off("standard", "demand");
  await assert.rejects(tx(c, asA, (k) => sql(k, `select seller_unmet_demand(7)`)), /feature_off/);
  assert.ok((await tx(c, asB, (k) => sql(k, `select seller_unmet_demand(7) as r`)))[0].r);
});

test("recommend: related items are not offered for a shop whose plan has it off", async () => {
  const id = await item(ids.bizA);
  const cand = async () => (await tx(c, anon, (k) => sql(k, `select related_item_candidates($1) as v`, [id])))[0].v;
  assert.ok(await cand());
  await off("standard", "recommend");
  assert.equal(await cand(), null);
});
