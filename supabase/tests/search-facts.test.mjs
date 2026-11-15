// Migration 0127: public_item_search_facts gives product search the spec rows, highlights, short description, option value labels
// and swatch colours of every live public item, capped, and nothing for items that are not public.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createDatabase, connect, seedFixtures, tx, sql, ids } from "./db.mjs";

let c;
before(async () => {
  c = await connect(await createDatabase("search_facts"));
  await seedFixtures(c);
  await sql(c, `update plans set items_limit = 50 where category_id = 'barber'`);
});
after(async () => { await c.end(); });
beforeEach(async () => {
  await sql(c, `delete from flash_sales; delete from item_history; delete from items`);
  await sql(c, `update businesses set status = 'live', paid_until = now() + interval '30 days'`);
});

const anon = { role: "anon" };
const facts = (limit = null) => tx(c, anon, (k) => sql(k, limit === null ? `select public_item_search_facts() as f` : `select public_item_search_facts($1) as f`, limit === null ? [] : [limit]), { commit: true }).then((r) => r[0].f);
const newItem = async (extra = {}) => {
  const f = { name: "Speaker", price: 15000, price_type: "fixed", availability: "available", visible: true, ...extra };
  const keys = Object.keys(f);
  return (await sql(c, `insert into items (business_id, ${keys.join(",")}) values ($1, ${keys.map((_, i) => `$${i + 2}`).join(",")}) returning id`, [ids.bizA, ...Object.values(f)]))[0].id;
};
const axes = [
  { key: "colour", label: "Colour", display: "swatch", values: [{ id: "black", label: "Black", color: "#111111" }, { id: "blue", label: "Blue", color: "#1d4ed8" }] },
  { key: "size", label: "Size", display: "button", values: [{ id: "s", label: "Small" }] }
];

test("returns what search reads for a live item: specs, highlights, short description, option values and swatches", async () => {
  const id = await newItem({ short_description: "Up to 12 hours playtime" });
  await sql(c, `update items set specs = $2::jsonb, highlights = $3::jsonb, option_axes = $4::jsonb where id = $1`, [
    id,
    JSON.stringify([{ label: "Speaker maximum output power", value: "30 W", group: "Features & Specs" }, { label: "Battery life", value: "12 hours", group: "Features & Specs" }]),
    JSON.stringify([{ text: "IP67 waterproof" }, { title: "PartyBoost", text: "pairs two speakers" }]),
    JSON.stringify(axes)
  ]);
  const f = (await facts())[id];
  assert.deepEqual(f.specs, [{ label: "Speaker maximum output power", value: "30 W" }, { label: "Battery life", value: "12 hours" }]);
  assert.deepEqual(f.highlights, ["IP67 waterproof", "PartyBoost pairs two speakers"]);
  assert.equal(f.shortDescription, "Up to 12 hours playtime");
  assert.deepEqual([...f.optionValues].sort(), ["Black", "Blue", "Small"]);
  assert.deepEqual(f.swatches, [{ label: "Black", color: "#111111" }, { label: "Blue", color: "#1d4ed8" }]);
});

test("caps the rows, skips empty and malformed ones, and never fails on odd input", async () => {
  const one = async (specs, highlights = [], short = null, axes = []) =>
    (await sql(c, `select item_search_facts($1::jsonb, $2::jsonb, $3, $4::jsonb) as f`, [JSON.stringify(specs), JSON.stringify(highlights), short, JSON.stringify(axes)]))[0].f;
  const rows = Array.from({ length: 40 }, (_, i) => ({ label: `Row ${i}`, value: "x" }));
  assert.equal((await one(rows)).specs.length, 24);
  assert.deepEqual(await one([{ label: "", value: "x" }, "text", { label: "Only label" }]), {});
  assert.deepEqual(await one({ not: "a list" }, "nope", "   ", { axes: 1 }), {});
  assert.equal((await one([], Array.from({ length: 9 }, (_, i) => ({ text: `H${i}` })))).highlights.length, 6);
});

test("leaves out items with nothing to add, and items that are not public", async () => {
  const bare = await newItem({ name: "Bare" });
  const hidden = await newItem({ name: "Hidden", visible: false, short_description: "secret" });
  const shown = await newItem({ name: "Described", short_description: "A good one" });
  await sql(c, `update items set created_at = now() + interval '1 minute' where id = $1`, [shown]);
  const all = await facts();
  assert.equal(all[shown].shortDescription, "A good one");
  assert.equal(all[bare], undefined);
  assert.equal(all[hidden], undefined);
  assert.deepEqual(Object.keys(await facts(0)), [shown], "a silly limit is clamped to one item, the newest");
  await sql(c, `update businesses set status = 'suspended' where id = $1`, [ids.bizA]);
  assert.deepEqual(await facts(), {}, "a shop that is not live shows nothing");
});
