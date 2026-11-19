// Guards "Goes well with this" against the whole catalogue, not just the products somebody thought of.
// It reads every seeded product type (scripts/seeds) and checks the complement map decides each one. Adding a product type without
// deciding what goes with it (or that nothing does) fails here, so an empty section is always a choice and never an oversight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TYPES } from "./seeds/index.mjs";
import { COMPLEMENTS, NO_PARTNERS, complementGroupOf, complementWeight, complementsOf, hasComplements } from "../shared/src/related/complements.js";
import { LOCKED_GROUPS, PHRASES, TYPE_GROUPS } from "../shared/src/related/data/complementMap.js";

const groupOfType = (id) => (Object.hasOwn(TYPE_GROUPS, id) ? TYPE_GROUPS[id] : id);
const decided = (group) => group in COMPLEMENTS || group in NO_PARTNERS;
const NEVER_SUGGESTED = ["services", "accommodation", "property", "medicine", "vitamins-supplements", "skin-hair-medical", "first-aid-devices", "liquor"];

test("every product type has an explicit decision: partners, or a recorded reason that nothing goes with it", () => {
  const missing = ALL_TYPES.filter((t) => !decided(groupOfType(t.id))).map((t) => `${t.id} -> ${groupOfType(t.id)}`);
  assert.deepEqual(missing, [], "add each group to COMPLEMENTS (with partners) or to NO_PARTNERS (with the reason) in complementMap.js");
});

test("every service type lands in the one group nothing goes with, and a typed service can never be taken for a product", () => {
  for (const t of ALL_TYPES.filter((x) => x.kind === "service")) {
    assert.equal(groupOfType(t.id), "services", t.id);
    assert.equal(hasComplements({ name: "Sofa and bed and carpet and phone", productTypeId: t.id }), false, t.id);
  }
});

test("medicine, alcohol, health products, services and places are never suggested for anything", () => {
  for (const [group, partners] of Object.entries(COMPLEMENTS)) {
    for (const [partner] of partners) assert.ok(!NEVER_SUGGESTED.includes(partner), `${group} -> ${partner}`);
  }
  for (const group of NEVER_SUGGESTED) assert.deepEqual(complementsOf(group), [], group);
});

test("every phrase classifies to its own group: none is hidden behind an earlier one", () => {
  const shadowed = [];
  for (const [group, phrases] of PHRASES) for (const phrase of phrases) if (complementGroupOf({ name: phrase }) !== group) shadowed.push(`"${phrase}" (${group}) -> ${complementGroupOf({ name: phrase })}`);
  assert.deepEqual(shadowed, []);
});

test("every partner can actually be reached, weights are 1-10, and nothing pairs with itself", () => {
  const reachable = new Set([...PHRASES.map(([g]) => g), ...ALL_TYPES.map((t) => groupOfType(t.id))]);
  for (const [group, partners] of Object.entries(COMPLEMENTS)) {
    assert.ok(reachable.has(group), `${group} has partners but no phrase or product type can land in it`);
    const seen = new Set();
    for (const [partner, weight] of partners) {
      assert.ok(reachable.has(partner), `${group} -> ${partner} is unreachable`);
      assert.notEqual(partner, group, `${group} lists itself`);
      assert.ok(Number.isInteger(weight) && weight >= 1 && weight <= 10, `${group} -> ${partner} weight ${weight}`);
      assert.ok(!seen.has(partner), `${group} lists ${partner} twice`);
      seen.add(partner);
    }
  }
});

test("no group is both a place with partners and a recorded no-partner group", () => {
  for (const group of Object.keys(NO_PARTNERS)) assert.ok(!(group in COMPLEMENTS), group);
  for (const group of LOCKED_GROUPS) assert.ok(decided(group), `${group} is locked but undecided`);
});

test("names that contain another product's word are still the right product", () => {
  const cases = {
    "HP laptop charger 65W": "laptop-charger",
    "Samsung Galaxy Tab A9": "tablet",
    "iPhone 13 case": "phone-case",
    "Samsung A15 screen guard": "screen-protector",
    "Infinix Hot 40 tempered glass": "screen-protector",
    "Tecno Spark charger": "phone-charger",
    "Fan belt": "spare-part",
    "Table fan": "fan-heater-small-appliance",
    "TV unit": "wardrobe-cabinet",
    "Dairy meal 70kg": "animal-feed",
    "Pilau masala": "herbs-spices",
    "Body butter": "body-care-lotions",
    "Fencing wire": "farm-tools-equipment",
    "Milk can": "farm-tools-equipment",
    "Chain per metre": "rope-wire",
    "Chain and sprocket": "motorbike-parts-gear",
    "Filter cartridge": "water-dispenser",
    "False nails": "nail-lash-tools",
    "Phone holder": "car-accessories-care",
    "High chair": "baby-gear",
    "Baby lotion": "sanitary-baby-care",
    "Pet bed": "pet-accessories",
    "Bed bug fumigation": "services",
    "Carpet cleaning": "services",
    "Sofa cleaning": "services",
    "Hostel bed per night": "accommodation",
    "Double room bed and breakfast": "accommodation",
    "Boxer 150 motorbike": "motorbike-sale",
    "Braiding hair": "hair-wigs",
    "Doughnuts": "cupcakes-pastries",
    "Dining chairs set": "chair",
    "Fried rice": "restaurant-meal",
    "Rice cooker": "appliance",
    "Dinner set": "utensils",
    "Plates set": "utensils",
    "Tape dispenser": "staplers-glue-tape-scissors"
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(complementGroupOf({ name }), want, name);
});

test("a product type in a locked group beats the words in the name", () => {
  assert.equal(complementGroupOf({ name: "Sofa cleaning", productTypeId: "house-cleaning" }), "services");
  assert.equal(complementGroupOf({ name: "Shirt", productTypeId: "school-uniform" }), "school-uniform");
  assert.equal(complementGroupOf({ name: "Bed", productTypeId: "pet-accessories" }), "pet-accessories");
  assert.equal(complementGroupOf({ name: "Shampoo", productTypeId: "car-accessories-care" }), "car-accessories-care");
  assert.equal(complementGroupOf({ name: "Chicken wings", productTypeId: "dressed-chicken" }), "dressed-chicken");
  assert.equal(complementGroupOf({ name: "Kitenge fabric per metre", productTypeId: "fabric-by-metre" }), "fabric-by-metre");
});

test("pairs that must work, and pairs that must not", () => {
  const w = (a, b) => complementWeight({ name: a }, { name: b });
  assert.ok(w("HP 15 laptop", "HP laptop charger 65W") > 0, "a laptop goes with its charger");
  assert.ok(w("Samsung Galaxy A15", "iPhone 13 case") > 0 && w("Samsung Galaxy A15", "Samsung A15 screen guard") > 0);
  assert.ok(w("Silicone phone case", "Tempered glass screen protector") > 0, "a case goes with a screen protector");
  assert.equal(w("Silicone phone case", "Samsung Galaxy A15"), 0, "a case page does not offer another phone");
  assert.ok(w("Day old chicks", "Layers mash") > 0 && w("Day old chicks", "Feeder") > 0);
  assert.ok(w("Maize seed", "DAP fertiliser 50kg") > 0);
  assert.ok(w("Baby formula", "Baby wipes") > 0);
  assert.ok(w("School uniform shirt", "Men's leather shoes") > 0, "a school uniform goes with shoes");
  assert.ok(w("Beef pilau", "Coca-Cola 500ml") > 0);
  assert.equal(w("6kg gas cylinder", "Water jug"), 0);
  assert.equal(w("6kg gas cylinder", "Water container 20L"), 0);
  assert.equal(w("Dining table", "Haircut"), 0, "a service is never offered with a product");
  assert.equal(w("Beef pilau", "Tusker 500ml"), 0, "alcohol is never offered");
  assert.equal(w("Paracetamol tablets", "Coca-Cola 500ml"), 0, "medicine has nothing that goes with it");
});

test("the section hides itself where the owner said nothing goes with the product", () => {
  for (const name of ["Haircut", "Phone repair", "Paracetamol tablets", "Tusker 500ml", "Maize flour 2kg", "Toilet rolls 10 pack", "Hostel bed per night", "Wedding photography package"]) {
    assert.equal(hasComplements({ name }), false, name);
  }
});

test("a word or product type id that is also an Object.prototype key is just a word", () => {
  for (const key of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(complementGroupOf({ name: "x", productTypeId: key }), key, `type ${key}`);
    assert.deepEqual(complementsOf(key), [], `partners ${key}`);
    assert.equal(complementWeight({ name: "x", productTypeId: key }, { name: "x", productTypeId: "phone" }), 0, `weight ${key}`);
    assert.equal(typeof complementGroupOf({ name: key }) === "function", false, `name ${key}`);
  }
});

test("a name far longer than the database allows is still classified, quickly", () => {
  const long = `${"x".repeat(150)} phone case ${"y".repeat(20000)}`;
  const start = performance.now();
  complementGroupOf({ name: long });
  assert.ok(performance.now() - start < 100);
});
