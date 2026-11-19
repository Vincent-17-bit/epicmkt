import test from "node:test";
import assert from "node:assert/strict";
import { complementGroupOf, complementWeight, complementSearchWords, hasComplements } from "./complements.js";

const group = (name, extra = {}) => complementGroupOf({ name, ...extra });

test("names decide the group, the most specific phrase first", () => {
  const cases = {
    "Chicken pilau": "restaurant-meal",
    "Honey-Glazed Smash Burger": "restaurant-meal",
    "Butter chicken": "restaurant-meal",
    "Coca-Cola 500ml": "soft-drink",
    "Fresh mango juice 500ml": "juice",
    "White Bread Loaf": "bread",
    "Burger buns 6": "bread",
    "Blue Band margarine 500g": "spreads",
    "Classic Chocolate Chip Cookie": "cupcakes-pastries",
    "6kg gas cylinder with gas": "lpg-gas",
    "Gas regulator": "gas-accessory",
    "Two-burner gas cooker": "gas-cooker",
    "Pressure cooker 5L": "cookware",
    "Silicone phone case": "phone-case",
    "Samsung Galaxy A15 128GB": "phone",
    "43 inch smart TV": "tv",
    "Laptop bag": "backpack-travel-bag",
    "Ladies Ankara dress": "clothing",
    "Women's sandals": "shoes",
    "Cotton bedsheet set double": "bedding"
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(group(name), want, name);
});

test("medicine, liquor, tests and printing things have groups but nothing goes with them", () => {
  for (const name of ["Sugar test", "Paracetamol 500mg", "Tusker 500ml", "Lamination"]) {
    assert.ok(group(name), name);
    assert.equal(hasComplements({ name }), false, name);
  }
});

test("the product type is the fallback when the name says nothing", () => {
  assert.equal(group("Special of the day", { productTypeId: "restaurant-meal" }), "restaurant-meal");
  assert.equal(group("Style 2", { productTypeId: "barbershop-service" }), "barber-service");
  assert.equal(group("Item"), null);
});

test("a complement is never the same kind: another pilau is similar, not 'goes with'", () => {
  assert.ok(complementWeight({ name: "Chicken pilau" }, { name: "Coca-Cola 2L" }) > 0);
  assert.equal(complementWeight({ name: "Chicken pilau" }, { name: "Beef pilau" }), 0);
  assert.ok(complementWeight({ name: "6kg gas cylinder" }, { name: "Gas regulator" }) > complementWeight({ name: "6kg gas cylinder" }, { name: "Aluminium sufuria" }));
});

test("search words for the partners are plain words, strongest partners first, never too many", () => {
  const words = complementSearchWords("restaurant-meal");
  assert.ok(words.includes("soda") && words.includes("juice") && words.includes("water"));
  assert.ok(words.indexOf("soda") < words.indexOf("juice"));
  assert.ok(words.length <= 24 && words.every((w) => /^[a-z][a-z0-9]{2,}$/.test(w)));
  assert.deepEqual(complementSearchWords("services"), []);
});

test("words that look like food in other things: chocolate is not milk, a coffee table is not coffee, a kettle is not tea", () => {
  assert.equal(group("Toblerone milk chocolate 100g"), "confectionery");
  assert.equal(group("Cadbury Dairy Milk chocolate bar 80g"), "confectionery");
  assert.equal(group("Glass coffee table"), "table");
  assert.equal(group("Electric kettle 1.7L"), "appliance");
  assert.equal(group("Coffee maker"), "appliance");
  assert.equal(group("Fresh milk 500ml"), "milk");
  assert.equal(group("Nescafe Classic 100g"), "tea-coffee");
  assert.equal(group("Hot chocolate drink"), "tea-coffee");
  assert.equal(group("Chocolate milkshake"), "juice");
  assert.equal(group("Chocolate cake"), "cake");
  assert.equal(complementWeight({ name: "White bread 400g" }, { name: "Toblerone milk chocolate 100g" }), 0);
  assert.equal(complementWeight({ name: "White bread 400g" }, { name: "Glass coffee table" }), 0);
});

test("a water jug is for the table, not the stove: never offered with a gas cylinder, still not drinking water", () => {
  assert.equal(complementGroupOf({ name: "Water jug 2L" }), "utensils");
  assert.equal(complementWeight({ name: "6kg gas cylinder with gas" }, { name: "Water jug 2L" }), 0);
  assert.ok(complementWeight({ name: "6kg gas cylinder with gas" }, { name: "Aluminium sufuria set 3 pcs" }) > 0);
  assert.ok(complementWeight({ name: "Milk pan" }, { name: "Gas regulator" }) > 0);
});
