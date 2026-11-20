// Guards "Goes well with this" against the whole catalogue, not just the products somebody thought of.
// It reads every seeded product type (scripts/seeds) and checks the complement map decides each one: either it lands in a group
// with partners, or it is on the short list of types that deliberately have none. Adding a product type without deciding what goes
// with it fails here, so an empty section is always a choice and never an oversight.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_TYPES } from "./seeds/index.mjs";
import { COMPLEMENTS, complementGroupOf, complementWeight, complementsOf, hasComplements } from "../shared/src/related/complements.js";
import { LOCKED_TYPES, PHRASES, TYPE_GROUPS } from "../shared/src/related/data/complementMap.js";

// Types with nothing that goes with them, on purpose: medicine and alcohol are never suggested, paperwork and professional services are
// not bought in bundles, and a loose battery has no single partner.
const NO_PARTNERS = new Set([
  "liquor", "medicine", "prescription-medicine", "beer-cider", "wine", "spirits", "bar-menu-drink", "skin-hair-medical",
  "printing", "scanning", "lamination", "binding", "typing-documents", "passport-photos", "banners-posters-cards", "computer-internet-use",
  "milling-service", "mpesa-agent-service", "airtime-bills-tokens", "property-sale", "professional-consultation", "legal-service",
  "accounting-tax-service", "architecture-survey-service", "property-management-service", "furniture-custom-order", "small-battery"
]);
const groupOfType = (id) => complementGroupOf({ productTypeId: id });

test("every product type has a decision: partners, or a place on the short list that has none", () => {
  const undecided = ALL_TYPES.filter((t) => !NO_PARTNERS.has(t.id) && complementsOf(groupOfType(t.id)).length === 0).map((t) => `${t.id} -> ${groupOfType(t.id)}`);
  assert.deepEqual(undecided, [], "map each type in TYPE_GROUPS to a group with partners, or add it to NO_PARTNERS here (with a reason)");
});

test("the no-partners list is honest: nothing on it quietly has partners, and every entry is a real type", () => {
  const ids = new Set(ALL_TYPES.map((t) => t.id));
  for (const id of NO_PARTNERS) {
    assert.ok(ids.has(id), `${id} is not a seeded type`);
    assert.equal(complementsOf(groupOfType(id)).length, 0, `${id} has partners now: remove it from NO_PARTNERS`);
  }
});

test("TYPE_GROUPS and LOCKED_TYPES only name real product types, and point at groups a name can reach or that have partners", () => {
  const ids = new Set(ALL_TYPES.map((t) => t.id));
  const reachable = new Set([...PHRASES.map(([g]) => g), ...Object.keys(COMPLEMENTS)]);
  for (const [type, group] of Object.entries(TYPE_GROUPS)) {
    assert.ok(ids.has(type), `TYPE_GROUPS: ${type} is not a seeded type`);
    assert.ok(reachable.has(group), `TYPE_GROUPS: ${type} -> ${group} is not a group anything can land in`);
  }
  for (const type of LOCKED_TYPES) assert.ok(ids.has(type), `LOCKED_TYPES: ${type} is not a seeded type`);
  assert.equal(new Set(LOCKED_TYPES).size, LOCKED_TYPES.length, "LOCKED_TYPES lists a type twice");
});

test("a typed service is never taken for a product by a word in its name", () => {
  assert.equal(complementGroupOf({ name: "Sofa and bed and carpet", productTypeId: "house-cleaning" }), "cleaning-service");
  assert.equal(complementGroupOf({ name: "Table cloths", productTypeId: "event-hire-furniture" }), "event-rental");
  assert.equal(complementGroupOf({ name: "Liver function", productTypeId: "lab-test" }), "health-service");
  assert.equal(complementGroupOf({ name: "Shirt", productTypeId: "alterations-repairs" }), "tailoring-service");
  assert.equal(hasComplements({ name: "Bed", productTypeId: "legal-service" }), false);
});

test("a typed item is what its type says, even when its name holds another product's word", () => {
  const typed = (name, productTypeId) => complementGroupOf({ name, productTypeId });
  assert.equal(typed("Brake pads", "motorbike-parts-gear"), "moto-gear");
  assert.equal(typed("Chain", "locks-hardware"), "locks-security");
  assert.equal(typed("Chain per metre", "rope-wire-by-metre"), "steel-reinforcement");
  assert.equal(typed("Bed", "pet-accessories"), "pet-supplies");
  assert.equal(typed("Shampoo", "car-accessories-care"), "car-accessory");
  assert.equal(typed("Chicken wings", "dressed-chicken"), "meat");
  assert.equal(typed("Meat pie", "buns-doughnuts-snacks"), "cupcakes-pastries");
  // An item with no locked type still reads its name first.
  assert.equal(typed("Fanta 500ml", "soft-drinks-bottled-water"), "soft-drink");
});

test("names that contain another product's word are still the right product", () => {
  const cases = {
    "Brake pads": "brake-parts",
    "Fan belt": "oil-filter",
    "Table fan": "appliance",
    "Table-top dispenser": "water-dispenser",
    "Phone holder": "car-accessory",
    "Milk can": "farm-tools",
    "Fencing wire": "farm-tools",
    "False nails": "nail-care",
    "Curry powder": "sauces-spices",
    "Pilau masala": "sauces-spices",
    "Meat pie": "cupcakes-pastries",
    "Egg tray": "poultry-supplies",
    "Body butter": "makeup-skincare",
    "Hand wash": "cleaning-supplies",
    "Table cloths": "event-decor",
    "Liver function": "health-service",
    "Welding machine": "welding-supplies",
    "iPhone 13 case": "phone-case",
    "Samsung A15 screen guard": "screen-protector",
    "Tea masala": "tea-coffee",
    "Sanitary pads": "feminine-care"
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(complementGroupOf({ name }), want, name);
});

test("pairs that must work, and pairs that must not", () => {
  const w = (a, b) => complementWeight({ name: a }, { name: b });
  assert.ok(w("Samsung Galaxy A15", "iPhone 13 case") > 0 && w("Samsung Galaxy A15", "Samsung A15 screen guard") > 0);
  assert.ok(w("Silicone phone case", "Tempered glass screen protector") > 0, "a case goes with a screen protector");
  assert.ok(w("Day old chicks", "Chick feeders") > 0 && w("Day old chicks", "Layers mash") > 0);
  assert.ok(w("Beef pilau", "Coca-Cola 500ml") > 0);
  assert.equal(w("6kg gas cylinder", "Water jug"), 0);
  assert.equal(w("Beef pilau", "Tusker 500ml"), 0, "alcohol is never offered");
  assert.equal(w("Paracetamol tablets", "Coca-Cola 500ml"), 0, "medicine has nothing that goes with it");
});

test("the section hides itself where nothing goes with the product", () => {
  for (const name of ["Paracetamol tablets", "Tusker 500ml", "M-Pesa deposit"]) assert.equal(hasComplements({ name }), false, name);
});

test("a name far longer than the database allows is still classified, quickly", () => {
  const long = `${"x".repeat(150)} phone case ${"y".repeat(20000)}`;
  const start = performance.now();
  complementGroupOf({ name: long });
  assert.ok(performance.now() - start < 250);
});
