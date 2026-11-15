import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_SEARCH, KINDS, kindOf, parseSearch, searchProducts, writeSearch } from "./index.js";

// A small catalogue in the shape getAllProducts returns (item + business card + option summary).
const shop = (slug, over = {}) => ({ id: slug, slug, name: slug.replace(/-/g, " "), town: "Nakuru", isOpen: true, verified: false, featured: false, delivery: null, ...over });
const p = (id, name, { price = 1000, ...over } = {}) => ({
  id, name, regularPrice: price, pricing: { regularPrice: price, salePrice: price, savings: 0 }, images: [{ url: "a.png" }], videos: [], swatches: [], specs: [], highlights: [],
  business: shop("nakuru-audio"), ...over
});
const spec = (label, value) => ({ label, value });
const CATALOGUE = [
  p("flip", "JBL Flip 6 portable Bluetooth speaker", { brand: "JBL", price: 15000, videos: [{ url: "v.mp4" }], swatches: [{ label: "Black", color: "#111" }, { label: "Blue", color: "#1d4ed8" }],
    specs: [spec("Speaker maximum output power", "30 W"), spec("Battery life", "12 hours"), spec("Water resistance", "IP67 waterproof"), spec("Connectivity", "Bluetooth 5.1, USB-C")],
    business: shop("nakuru-audio", { delivery: { offers: true, fee: 300 } }) }),
  p("charge", "JBL Charge 5 Bluetooth speaker with power bank", { brand: "JBL", price: 21000, specs: [spec("Speaker maximum output power", "40 W"), spec("Battery life", "20 hours"), spec("Connectivity", "Bluetooth")] }),
  p("oraimo", "Oraimo SoundPro portable speaker 20 W", { brand: "Oraimo", price: 3400, specs: [spec("Speaker maximum output power", "20 W"), spec("Battery life", "24 hours")], business: shop("kisumu-tech", { town: "Kisumu" }) }),
  p("tv", "Hisense 55 inch 4K UHD smart TV", { brand: "Hisense", price: 58500, specs: [spec("Screen size", "55 inch"), spec("Resolution", "4K UHD")] }),
  p("cable", "USB-C charging cable 1 m", { price: 350 }),
  p("bread", "White bread 400 g", { price: 65, business: shop("mama-bakery") })
];
const run = (q, over = {}) => searchProducts(CATALOGUE, { ...EMPTY_SEARCH, q, ...over });

test("finds what the words describe, most relevant and fullest listing first", () => {
  const r = run("speakers");
  assert.deepEqual(r.items.map((i) => i.id).sort(), ["charge", "flip", "oraimo"]);
  assert.equal(r.items[0].id, "flip", "the listing with a video and colour choices ranks first among equal matches");
  assert.equal(run("bread").items[0].id, "bread");
  assert.equal(run("nothing like this").total, 0);
});

test("every product gets a kind, and a speaker with a power bank is still a speaker", () => {
  assert.equal(kindOf(CATALOGUE[1])?.id, "speakers");
  assert.equal(kindOf(CATALOGUE[3])?.id, "tvs");
  assert.ok(KINDS.length >= 20);
});

test("the filters on the left are the ones that kind of product needs, with counts", () => {
  const r = run("speakers");
  const ids = r.facets.map((f) => f.id);
  for (const id of ["brand", "price", "power", "battery", "connectivity"]) assert.ok(ids.includes(id), `${id} filter`);
  assert.ok(!ids.includes("screen"), "no TV filters on a speaker search");
  const brand = r.facets.find((f) => f.id === "brand");
  assert.deepEqual(brand.values.map((v) => [v.label, v.count]).sort(), [["JBL", 2], ["Oraimo", 1]]);
});

test("filters narrow the results, and a filter's own options still count as if it were off", () => {
  const jbl = run("speakers", { brands: ["jbl"] });
  assert.deepEqual(jbl.items.map((i) => i.id).sort(), ["charge", "flip"]);
  assert.equal(jbl.facets.find((f) => f.id === "brand").values.find((v) => v.label === "Oraimo").count, 1);
  assert.deepEqual(run("speakers", { max: 5000 }).items.map((i) => i.id), ["oraimo"]);
  assert.deepEqual(run("speakers", { price: "20000-50000" }).items.map((i) => i.id), ["charge"]);
  assert.deepEqual(run("speakers", { delivery: true }).items.map((i) => i.id), ["flip"]);
  assert.deepEqual(run("speakers", { towns: ["kisumu"] }).items.map((i) => i.id), ["oraimo"]);
  assert.deepEqual(run("speakers", { colours: ["blue"] }).items.map((i) => i.id), ["flip"]);
});

test("sorts by price and pages through the results", () => {
  assert.deepEqual(run("speakers", { sort: "price_asc" }).items.map((i) => i.id), ["oraimo", "flip", "charge"]);
  assert.deepEqual(run("speakers", { sort: "price_desc" }).items.map((i) => i.id), ["charge", "flip", "oraimo"]);
  const one = searchProducts(CATALOGUE, { ...EMPTY_SEARCH, q: "speakers", page: 2 }, { pageSize: 2 });
  assert.equal(one.pages, 2);
  assert.equal(one.items.length, 1);
});

test("each row carries its short facts and price, and related searches follow the kind", () => {
  const flip = run("speakers").items.find((i) => i.id === "flip");
  assert.equal(flip.search.kind.id, "speakers");
  assert.equal(flip.search.price, 15000);
  assert.ok(flip.search.facts.length > 0);
  assert.ok(run("speakers").related.some((q) => q.includes("speaker")));
});

test("a search survives the page address and back, leaving defaults out", () => {
  const s = { ...EMPTY_SEARCH, q: "speakers", kind: "speakers", brands: ["jbl", "oraimo"], delivery: true, min: 1000, max: 20000, facets: { power: ["20-40"] }, sort: "price_asc", page: 2 };
  const params = writeSearch(s);
  assert.equal(params.get("brand"), "jbl,oraimo");
  assert.equal(params.has("price"), false);
  const back = parseSearch(params);
  assert.deepEqual({ ...back, facets: back.facets }, { ...EMPTY_SEARCH, ...s, facets: { power: ["20-40"] } });
  assert.equal(writeSearch(EMPTY_SEARCH).toString(), "");
});

test("bad address values fall back instead of breaking the page", () => {
  const s = parseSearch(new URLSearchParams("k=spaceships&sort=random&page=-4&min=abc&f_notafacet=1"));
  assert.equal(s.kind, "");
  assert.equal(s.sort, "featured");
  assert.equal(s.page, 1);
  assert.equal(s.min, null);
  assert.deepEqual(s.facets, {});
});
