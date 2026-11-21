// How well a name picks its product type, measured on the seed catalogue (scripts/seeds). The catalogue is synthetic and was written from the
// same material the suggester reads, so these floors guard against the suggester getting WORSE; they are not proof it is good on real listings.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TYPES } from "./seeds/index.mjs";
import { buildCatalogue } from "./recommendation-audit.mjs";
import { suggestProductType } from "../shared/src/productType/suggest.js";

const types = ALL_TYPES.map((t) => ({ id: t.id, name: t.name, categoryIds: t.categoryIds, restrictedTo: t.restrictedTo }));
const items = buildCatalogue();
const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function measure(list, withCategory = false) {
  let high = 0, highOk = 0, top1 = 0;
  for (const it of list) {
    const categoryId = withCategory ? ALL_TYPES.find((t) => t.id === it.typeId).categoryIds[0] : "";
    const s = suggestProductType(it.name, types, { categoryId });
    if (s.typeId === it.typeId) top1 += 1;
    if (s.confidence === "high") { high += 1; if (s.typeId === it.typeId) highOk += 1; }
  }
  return { n: list.length, high, highPrecision: highOk / Math.max(1, high), highShare: high / list.length, top1: top1 / list.length };
}

test("catalogue: the suggester has something to say about a good share of names, and is right when it is sure", () => {
  const m = measure(items);
  assert.ok(m.highShare >= 0.35, `high-confidence share ${m.highShare.toFixed(3)}`);
  assert.ok(m.highPrecision >= 0.9, `precision when high ${m.highPrecision.toFixed(3)}`);
});

test("names that belong to a single type are suggested correctly when the suggester is sure", () => {
  const owners = new Map();
  for (const it of items) owners.set(norm(it.name), new Set([...(owners.get(norm(it.name)) ?? []), it.typeId]));
  const m = measure(items.filter((it) => owners.get(norm(it.name)).size === 1));
  assert.ok(m.highPrecision >= 0.95, `precision when high, unambiguous names ${m.highPrecision.toFixed(3)}`);
});

test("knowing the shop's category helps and never hurts", () => {
  const blind = measure(items, false);
  const informed = measure(items, true);
  assert.ok(informed.top1 >= blind.top1, `${informed.top1} vs ${blind.top1}`);
  assert.ok(informed.highPrecision >= blind.highPrecision - 0.005);
});

test("named cases: a full type phrase is high, a name shared by two types is not", () => {
  assert.equal(suggestProductType("Dress shirt", types).typeId, "dress-shirt");
  assert.equal(suggestProductType("Dress shirt", types).confidence, "high");
  assert.notEqual(suggestProductType("Shirt", types).confidence, "high"); // clothing for sale or laundry: only the shop can say
});
