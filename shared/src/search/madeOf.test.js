import test from "node:test";
import assert from "node:assert/strict";
import { searchProducts } from "./index.js";

const item = (id, name, extra = {}) => ({ id, name, regularPrice: 100, specs: [], images: [], business: { name: "Shop", town: "Kisumu" }, ...extra });
const catalogue = [
  item(1, "Insulated Water Bottle", { section: "Home & Kitchen" }),
  item(2, "Red Bull Energy Drink", { specs: [{ label: "Ingredients", value: "Water, sucrose, caffeine" }] }),
  item(3, "White Bread Loaf", { specs: [{ label: "Ingredients", value: "Wheat flour, water, yeast, salt" }] }),
  item(4, "Orange Juice 1L", { specs: [{ label: "Contains", value: "Water, oranges" }] })
];

test("'maji' (water) does not bring bread and energy drinks just because water is an ingredient", () => {
  const names = searchProducts(catalogue, { q: "maji" }).items.map((p) => p.name);
  assert.deepEqual(names, ["Insulated Water Bottle"]);
});

test("an ingredient still finds a product when nothing is really about the word", () => {
  const names = searchProducts(catalogue.slice(1), { q: "yeast" }).items.map((p) => p.name);
  assert.deepEqual(names, ["White Bread Loaf"]);
});

test("'maji' does not find a juice that says 'no added water', or a loaf that only mentions water", () => {
  const shop = [
    item(1, "Insulated Water Bottle", { section: "Home & Kitchen" }),
    item(5, "100% Freshly Squeezed Orange Juice", { shortDescription: "Pure juice, no added water or sugar." }),
    item(6, "White Bread Loaf", { shortDescription: "Freshly baked, made with clean water and flour." })
  ];
  assert.deepEqual(searchProducts(shop, { q: "maji" }).items.map((p) => p.name), ["Insulated Water Bottle"]);
  assert.deepEqual(searchProducts(shop, { q: "water" }).items.map((p) => p.name), ["Insulated Water Bottle"]);
});
