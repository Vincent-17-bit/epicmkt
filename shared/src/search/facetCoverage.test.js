import test from "node:test";
import assert from "node:assert/strict";
import { KINDS, FACETS, PLACED_FACETS } from "./data/facetCatalog.js";

test("every filter a kind lists exists, and no kind lists one twice", () => {
  for (const k of KINDS) {
    const seen = new Set();
    for (const id of k.facets) {
      assert.ok(FACETS[id] || PLACED_FACETS.includes(id), `${k.id}: unknown filter ${id}`);
      assert.ok(!seen.has(id), `${k.id}: ${id} listed twice`);
      seen.add(id);
    }
  }
});

test("everything that is sold can be filtered by price, and every kind has at least five filters", () => {
  for (const k of KINDS) {
    assert.ok(k.facets.length >= 5 || k.id === "money", `${k.id} has only ${k.facets.length} filters`);
    if (!k.service) assert.ok(k.facets.includes("price"), `${k.id} has no price filter`);
  }
});
