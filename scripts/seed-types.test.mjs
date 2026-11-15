import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TYPES, FASHION, ELECTRONICS, CYBER, FOOD_HEALTH, HOME_AUTO } from "./seeds/index.mjs";
import {
  validateProductType, validateTiers, validateOptions, publicOptions, unitPrice, REGULATED_TYPES, quantityModeOf, specIssues, generateCombinations
} from "../shared/src/index.js";
import { resolveVariant } from "../shared/src/pricing/combination.js";
import { dimensionLabels } from "../shared/src/scales/remaining/dimensions.js";

const byId = (id) => ALL_TYPES.find((t) => t.id === id);
// The seeded suggestions become the axis values a seller would start from.
const axesOf = (type, keys) => keys.map((k) => {
  const a = type.axes.find((x) => x.key === k);
  return { key: a.key, label: a.label, display: a.display, ...(a.scale ? { scale: a.scale } : {}), values: a.suggested.map((v) => ({ id: v.id, label: v.label })) };
});

test("every seeded type loads and passes validateProductType", () => {
  for (const type of ALL_TYPES) {
    const r = validateProductType(type);
    assert.deepEqual(r.errors, [], `${type.id}: ${r.errors.join("; ")}`);
  }
});

test("the five batches cover the tables (counts) and ids are unique", () => {
  assert.equal(FASHION.length, 17);
  assert.equal(ELECTRONICS.length, 26);
  assert.equal(CYBER.length, 14);
  assert.ok(FOOD_HEALTH.length >= 15);
  assert.ok(HOME_AUTO.length >= 30);
  const ids = [...FASHION, ...ELECTRONICS, ...CYBER, ...FOOD_HEALTH, ...HOME_AUTO].map((t) => t.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  // Two batches may describe the same type on purpose (a later one replaces the earlier); the merged list never repeats.
  assert.equal(new Set(ALL_TYPES.map((t) => t.id)).size, ALL_TYPES.length);
  assert.deepEqual([...new Set(dupes)].sort(), ["drinking-water", "sofa", "table", "phone-repair", "phone", "memory-card"].filter((id) => dupes.includes(id)).sort());
});

test("at most four required rows on any type (a conditional row counts)", () => {
  for (const type of ALL_TYPES) {
    const n = type.specRows.filter((r) => r.level === "required" || r.requiredIf).length;
    assert.ok(n <= 4, `${type.id} has ${n} required rows`);
  }
});

test("jewellery asks for purity only when the material is gold or silver", () => {
  for (const id of ["necklace-chain-bracelet", "earrings", "ring"]) {
    const purity = byId(id).specRows.find((r) => r.key === "purity");
    assert.deepEqual(purity.requiredIf, { row: "material", tag: "precious-metal" }, id);
    const tags = { gold: ["precious-metal"], brass: [] };
    const item = (material) => ({ specs: [{ label: "Material", value: material }] });
    assert.ok(specIssues(item("Gold"), byId(id), { tags }).blockers.some((b) => b.key === "purity"), `${id} gold`);
    assert.ok(!specIssues(item("Brass"), byId(id), { tags }).blockers.some((b) => b.key === "purity"), `${id} brass`);
  }
});

test("restrictions: prescription medicine to a chemist, vet drugs and agrochemicals to an agrovet, nothing else", () => {
  for (const [id, shops] of Object.entries(REGULATED_TYPES)) assert.deepEqual(byId(id).restrictedTo, shops, id);
  assert.deepEqual(ALL_TYPES.filter((t) => t.restrictedTo.length).map((t) => t.id).sort(), Object.keys(REGULATED_TYPES).sort());
});

test("quantity modes: butchery and greengrocer measure (kg), the others count units, services without a count are none", () => {
  assert.equal(byId("meat-by-weight").quantityMode, "measure");
  assert.equal(byId("produce").quantityMode, "measure");
  assert.equal(byId("bread").quantityMode, "units");
  assert.equal(byId("drinking-water").quantityMode, "units");
  assert.equal(byId("salon-service").quantityMode, "none");
  assert.equal(quantityModeOf({ quantityMode: byId("laundry-by-weight").quantityMode }), "measure");
});

test("cyber services: price tiers pass the A14 validation, computer use is priced per duration", () => {
  for (const id of ["printing", "scanning", "banners-posters-cards"]) {
    const { tiers, mode } = byId(id).extras.tiers;
    const priced = tiers.map((t, i) => ({ ...t, unitPrice: 10 - i }));
    assert.deepEqual(validateTiers(priced, mode), { ok: true, errors: [] }, id);
    assert.equal(byId(id).kind, "service");
  }
  assert.equal(byId("printing").extras.tiers.tiers[0].minQty, 1);
  assert.equal(byId("computer-internet-use").extras.priceRule, "per-duration");
  assert.deepEqual(byId("computer-internet-use").axes[0].suggested.map((v) => v.label).slice(0, 2), ["30 min", "1 hour"]);
  assert.deepEqual(byId("banners-posters-cards").extras.packs, [100, 250, 500]);
});

test("the water grid (5, 10, 20 L x refill or new) saves, prices each combination and shows the price per litre", () => {
  const type = byId("drinking-water");
  assert.deepEqual(type.axes.map((a) => a.label), ["Container size", "How it is filled"]);
  const axes = axesOf(type, ["size", "fill"]);
  const price = { "5-l": [30, 150], "10-l": [50, 250], "20-l": [80, 450] };
  const variants = generateCombinations(axes).map((choice) => ({ choice, price: price[choice.size][choice.fill === "refill" ? 0 : 1], status: "available" }));
  assert.equal(variants.length, 6);
  const saved = validateOptions({ axes, variants });
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  const item = { id: "w", price: null, ...publicOptions({ axes, variants, item: {} }) };
  assert.equal(resolveVariant(item, { size: "20-l", fill: "new-bottle" }).variant.price, 450);
  assert.equal(resolveVariant(item, { size: "5-l", fill: "refill" }).variant.price, 30);
  assert.equal(unitPrice(80, "20 L").text, "KES 4 per L");
  assert.equal(Math.min(...variants.map((v) => v.price)), 30, 'the card says "From KES 30"');
});

test("the bread grid (weights x kinds) saves, prices correctly and shows the price per kg", () => {
  const type = byId("bread");
  const axes = axesOf(type, ["weight", "kind"]);
  assert.deepEqual(axes[0].values.map((v) => v.label), ["400 g", "600 g", "800 g", "1 kg"]);
  assert.deepEqual(axes[1].values.map((v) => v.label), ["White", "Brown", "Whole wheat"]);
  const grid = { "400-g": { white: 60, brown: 65, "whole-wheat": 70 }, "800-g": { white: 115, brown: 125, "whole-wheat": 135 } };
  const variants = generateCombinations(axes).filter((c) => grid[c.weight]).map((choice) => ({ choice, price: grid[choice.weight][choice.kind], status: "available" }));
  assert.equal(variants.length, 6);
  const saved = validateOptions({ axes, variants });
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  const item = { id: "b", ...publicOptions({ axes, variants, item: {} }) };
  assert.equal(resolveVariant(item, { weight: "800-g", kind: "brown" }).variant.price, 125);
  assert.equal(resolveVariant(item, { weight: "1-kg", kind: "white" }).reason, "not_sold");
  assert.equal(unitPrice(115, "800 g").text, "KES 144 per kg");
  assert.equal(Math.min(...variants.map((v) => v.price)), 60);
  const required = type.specRows.filter((r) => r.level === "required").map((r) => r.label);
  assert.deepEqual(required, ["Ingredients", "Allergens"]);
});

test("the car-wash grid (wash type x vehicle class) prices every pair", () => {
  const type = byId("car-wash");
  assert.deepEqual(type.extras.priceGrid, ["wash", "vehicle"]);
  const axes = axesOf(type, ["wash", "vehicle"]);
  const variants = generateCombinations(axes).map((choice, i) => ({ choice, price: 200 + i * 50, status: "available" }));
  assert.equal(variants.length, 25);
  const saved = validateOptions({ axes, variants });
  assert.equal(saved.ok, true, JSON.stringify(saved.errors));
  const item = { id: "c", ...publicOptions({ axes, variants, item: {} }) };
  assert.equal(resolveVariant(item, { wash: "full-wash", vehicle: "suv" }).variant.price, variants.find((v) => v.choice.wash === "full-wash" && v.choice.vehicle === "suv").price);
});

test("the sofa and the other furniture carry their own dimension labels, per option", () => {
  assert.equal(byId("sofa").extras.dimensionsPerOption, true);
  assert.deepEqual(dimensionLabels("sofa"), ["Width", "Depth", "Height"]);
  assert.deepEqual(dimensionLabels("table"), ["Length", "Width", "Height"]);
  assert.deepEqual(dimensionLabels("door"), ["Width", "Height"]);
  for (const id of ["table", "chair", "sofa", "bed", "door-window"]) {
    assert.equal(byId(id).extras.dimensionsPerOption, true, id);
    assert.ok(byId(id).extras.open.includes("material") && byId(id).extras.open.includes("colour"), `${id} material and colour are typed`);
  }
});

test("a memory card's Capacity follows its Style, with the SanDisk lists", () => {
  const type = byId("memory-card");
  assert.equal(type.axes[1].dependsOn, "style");
  assert.deepEqual(type.extras.capacityByStyle["old-version"], ["32-gb", "128-gb", "256-gb", "512-gb", "1-tb"]);
  assert.ok(!type.extras.capacityByStyle["new-version"].includes("32-gb") && type.extras.capacityByStyle["new-version"].includes("2-tb"));
  const caps = type.axes[1].suggested.map((v) => v.id);
  for (const list of Object.values(type.extras.capacityByStyle)) for (const id of list) assert.ok(caps.includes(id), id);
});

test("cases and protectors match a compatible-model list; spare parts match a vehicle", () => {
  for (const id of ["phone-case", "screen-protector"]) assert.equal(byId(id).extras.compat.list, "phone-models", id);
  for (const id of ["tyre", "car-battery", "spare-part"]) assert.equal(byId(id).extras.compat.list, "vehicles", id);
});
