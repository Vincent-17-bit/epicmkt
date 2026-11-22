import test from "node:test";
import assert from "node:assert/strict";
import { understandQuery, placePhrases } from "./understand.js";
import { distance, closestWords } from "./fuzzy.js";

const u = (q, ctx) => understandQuery(q, ctx);

test("a price in any of the ways people write it", () => {
  assert.equal(u("phones under 20k").max, 20000);
  assert.equal(u("phone below ksh 20,000").max, 20000);
  assert.equal(u("phone 20000").max, 20000);
  assert.equal(u("gas refill 1,500/=").max, 1500);
  assert.equal(u("shoes less than 3000 kes").max, 3000);
  assert.equal(u("iron sheets over 800").min, 800);
  assert.deepEqual([u("iphone between 30k and 50k").min, u("iphone between 30k and 50k").max], [30000, 50000]);
  const about = u("tyres around 8000");
  assert.deepEqual([about.min, about.max], [6400, 9600]);
});

test("a size, a year or a model number is not a price", () => {
  for (const q of ["water tank 1000 litres", "toyota 2020", "4k tv 55 inch", "sofa 5 seater", "under 5 kg", "shoes size 42", "samsung a15 128gb"]) {
    assert.equal(u(q).max, null, q);
    assert.equal(u(q).min, null, q);
  }
  assert.equal(u("nokia 1100", { modelNumbers: new Set(["1100"]) }).max, null);
  assert.equal(u("nokia 1100").max, 1100, "without the catalogue's help, a bare number that big is a budget");
});

test("what is left are the words, without the way the request was phrased", () => {
  assert.equal(u("where can i find a plumber").groups[0], "plumber");
  assert.equal(u("i need someone to fix my phone screen").groups[0], "fix phone screen");
  assert.equal(u("nataka simu ya bei nafuu").groups[0], "simu");
  assert.equal(u("i phone").groups[0], "i phone", "'i' is part of a name here");
  assert.deepEqual(u("best").groups, [], "a query of only filler has no words");
});

test("cheap, new and used are read as the filters they are", () => {
  const r = u("cheap used mitumba jacket");
  assert.equal(r.sort, "price_asc");
  assert.deepEqual(r.conditions, ["used"]);
  assert.equal(r.groups[0], "jacket");
  assert.deepEqual(u("brand new fridge").conditions, ["new"]);
  assert.deepEqual(u("fridge on discount").deals, ["sale"]);
  assert.equal(u("pizza delivered to me").delivery, true);
  assert.deepEqual(u("open now pharmacy").store, ["open"]);
});

test("a place, with or without the word before it", () => {
  const places = placePhrases(["Kisumu CBD"]);
  assert.deepEqual(u("plumber in Kisumu", { places }).places, ["kisumu"]);
  assert.deepEqual(u("hot towel in Kisumu CBD", { places }).places, ["kisumu cbd"]);
  assert.equal(u("hot towel in Kisumu CBD", { places }).groups[0], "hot towel");
  assert.equal(u("nairobi photographer", { places }).groups[0], "photographer");
});

test("quotes, minus and or, for people who search like programmers", () => {
  const r = u('"samsung a15" -case');
  assert.deepEqual(r.exact, ["samsung", "a15"]);
  assert.deepEqual(r.exclude, ["case"]);
  assert.deepEqual(u("samsung or tecno phone").groups, ["samsung phone", "tecno phone"]);
});

test("every piece taken out can be undone: the chip carries the query without it", () => {
  const r = u("cheap samsung phone under 20000");
  const price = r.chips.find((c) => c.id === "price");
  assert.equal(price.label, "Up to KES 20,000");
  assert.equal(price.without, "cheap samsung phone");
});

test("a slip of the finger is one step away, a swap included", () => {
  assert.equal(distance("haircut", "haricut"), 1);
  assert.equal(distance("milk", "mlik"), 1);
  assert.equal(distance("phone", "phne"), 1);
  const known = new Map([["haircut", 3], ["hairdye", 1], ["pizza", 1]]);
  assert.deepEqual(closestWords("harcut", known, 1), ["haircut"]);
  assert.deepEqual(closestWords("pima", new Map([["pizza", 1]]), 1), [], "short words must be almost exact");
});
