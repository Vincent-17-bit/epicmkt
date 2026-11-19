import test from "node:test";
import assert from "node:assert/strict";
import { complementGroupOf, complementsOf, hasComplements, complementWeight } from "./complements.js";

const GOLDEN = [
  ["Chicken pilau", "restaurant-meal"],
  ["Coca-Cola 500ml", "soft-drink"],
  ["Mango juice", "juice"],
  ["Tea masala", "tea-coffee"],
  ["iPhone 15 case", "phone-case"],
  ["Dairy meal 70kg", "animal-feed"],
  ["Y12 steel bar", "steel-reinforcement"],
  ["Boda boda helmet", "moto-gear"],
  ["Oil change", "garage-service"],
  ["Wedding photography", "photo-video"],
  ["Tent hire 100 seats", "event-rental"],
  ["Cement 50kg", "cement-sand-bags"],
  ["Ballast lorry", "aggregate"],
  ["Mens shirt", "clothing"],
  ["Solar panel 200W", "solar-panel"],
  ["Deep cycle battery 100Ah", "solar-storage"],
  ["Hair braiding knotless", "beauty-service"],
  ["Beef 1kg", "meat"],
  ["Rice pishori 5kg", "rice-grains"],
  ["Cooking oil 3L", "cooking-oil"],
  ["Exercise book 200pg", "school-books"],
  ["Water dispenser hot cold", "water-dispenser"],
  ["Dog food 10kg", "pet-food"]
];

test("golden names land in the right group", () => {
  for (const [name, group] of GOLDEN) assert.equal(complementGroupOf({ name }), group, name);
});

test("every group a name can land in either has partners or is on the short list of groups with none", () => {
  const NONE = new Set(["medicine", "liquor", "services", "mobile-money", "milling-service"]);
  for (const [name] of GOLDEN) {
    const group = complementGroupOf({ name });
    assert.ok(complementsOf(group).length > 0 || NONE.has(group), `${name} -> ${group}`);
    assert.equal(hasComplements({ name }), complementsOf(group).length > 0);
  }
});

test("service bundles pair both ways", () => {
  assert.ok(complementWeight({ name: "Tent hire" }, { name: "Catering for 100" }) > 0);
  assert.ok(complementWeight({ name: "Catering for 100" }, { name: "Tent hire" }) > 0);
  assert.ok(complementWeight({ name: "Oil change" }, { name: "Engine oil 5L" }) > 0);
});
