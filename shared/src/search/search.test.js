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

// ---- every kind of product (the whole catalogue, not only speakers) ----------------------------------------------
import { FACETS as ALL_FACETS, KIND_BY_TYPE, PLACED_FACETS } from "./data/facetCatalog.js";
import { ALL_TYPES } from "../../../scripts/seeds/index.mjs";
import { categories as LIVE_CATEGORIES } from "../../../client/src/data/categories.js";
import { getAllProducts, setLatency } from "../../../backend/src/index.js";

test("every seeded product type belongs to exactly one kind, every live category sells at least one, every filter exists", () => {
  assert.deepEqual(ALL_TYPES.map((t) => t.id).filter((id) => !KIND_BY_TYPE[id]), []);
  const listed = KINDS.flatMap((k) => k.types);
  assert.equal(new Set(listed).size, listed.length, "a type is in two kinds");
  assert.deepEqual(LIVE_CATEGORIES.map((c) => c.id).filter((c) => !KINDS.some((k) => k.cats.includes(c))), []);
  assert.deepEqual(KINDS.flatMap((k) => k.facets.filter((f) => !ALL_FACETS[f] && !PLACED_FACETS.includes(f)).map((f) => `${k.id}:${f}`)), []);
  assert.ok(KINDS.length >= 55);
});

test("a product's type decides its kind, whatever it is called", () => {
  assert.equal(kindOf({ name: "Spark 20", productTypeId: "phone" }).id, "phones");
  assert.equal(kindOf({ name: "The big one", productTypeId: "mattress" }).id, "beds");
  assert.equal(kindOf({ name: "Express", productTypeId: "laundry-by-weight" }).id, "laundry");
});

test("names from every kind of shop land in the right kind, using the shop's category to break ties", () => {
  const cases = [
    ["Coca-Cola 500ml", "supermarket-minimart", "drinks"], ["Crate of soda 24 x 300ml", "supermarket-minimart", "drinks"], ["Mumias sugar 2kg", "supermarket-minimart", "groceries"],
    ["Kensalt table salt 1kg", "supermarket-minimart", "groceries"], ["Cadbury Dairy Milk 80g", "supermarket-minimart", "sweets"], ["5x6 wooden bed with storage", "furniture-carpentry", "beds"],
    ["Mattress 5x6 8 inch", "furniture-carpentry", "beds"], ["Dining table 6 seater", "furniture-carpentry", "tables"], ["TV stand 1.8m", "furniture-carpentry", "furniture"],
    ["Haircut", "barbershop", "barber"], ["Dress making", "tailor-boutique", "tailoring"], ["Ladies maxi dress", "tailor-boutique", "clothing"], ["Full body Swedish massage 60 min", "spa-massage", "spa"],
    ["Philips LED bulb 9W E27", "plumbing-electrical", "lighting"], ["HP 250 G9 laptop Core i5 8GB", "electronics-computers", "laptops"], ["SanDisk 64GB USB 3.0 flash disk", "electronics-computers", "storage-devices"],
    ["Samsung 27 inch monitor 75Hz", "electronics-computers", "monitors"], ["Bic ballpoint pens box of 50", "printing-stationery", "stationery"], ["Whiteboard 90 x 120 cm", "printing-stationery", "stationery"],
    ["Cypress timber 2x2 12ft", "hardware-building", "timber"], ["Shaggy carpet 5x7", "home-kitchen", "carpets"], ["Red roses bouquet 12 stems", "photography-events", "flowers"],
    ["Beef pilau full plate", "restaurant-cafe", "meals"], ["Chai and mandazi", "restaurant-cafe", "meals"], ["White bread 600g", "bakery", "bakery"], ["Ramtons 20L solo microwave", "electronics-appliances", "appliances"],
    ["Men's long sleeve official shirt", "fashion-boutiques", "clothing"], ["Tecno Spark 20 128GB", "phones-accessories", "phones"], ["Black and white printing per page", "cyber-cafe", "printing"],
    ["KRA PIN registration", "cyber-cafe", "printing"], ["13kg gas refill", "lpg-gas", "gas"], ["20L water refill", "water-refill", "water"], ["Engine oil 4L 15W-40", "auto-spare-parts", "auto-parts"],
    ["Paracetamol 500mg 20 tablets", "chemist", "medicine"], ["Blood pressure monitor", "chemist", "medicine"], ["Wash and fold per kg", "cleaning-laundry", "laundry"], ["Monthly gym membership", "gym-fitness", "gym"],
    ["Maths tuition Grade 6", "tuition-daycare", "tuition"], ["Tent hire 100 seater", "photography-events", "event-hire"], ["Wedding photography package", "photography-events", "photography"], ["Airtime top up", "mpesa-airtime-agent", "money"], ["Box braids", "salon-beauty", "salon"],
    ["Makeup", "salon-beauty", "salon"], ["Nivea body lotion 400ml", "supermarket-minimart", "beauty"], ["Tusker lager 500ml", "supermarket-minimart", "liquor"], ["Dinner plates set of 6", "home-kitchen", "kitchenware"],
    ["Bed sheet set 5x6", "home-kitchen", "home-textiles"], ["Screen replacement", "phone-repair", "repairs"], ["Eye test", "optician", "health-services"],
    // the kinds added with the filter catalogue (poultry, fish, motorbikes, solar, CCTV, baby, books, pets, grains, welding,
    // event hire, lodging, property, transport, professionals, fundis, funerals)
    ["Day old Kenbro chicks", "agrovet", "poultry"], ["Layers mash 70kg", "agrovet", "farm"], ["Kienyeji chicken 1.5kg", "butchery", "meat"], ["Tilapia whole fresh 1kg", "butchery", "fish"],
    ["Bajaj Boxer 150cc", "auto-spare-parts", "motorbikes"], ["Toyota Fielder headlight 2010", "auto-spare-parts", "auto-parts"], ["Solar panel 300W mono", "electronics-appliances", "solar"],
    ["Hikvision 4 channel CCTV kit", "electronics-computers", "cctv"], ["Pampers baby dry size 4", "supermarket-minimart", "baby"], ["KLB Grade 4 English learner's book", "printing-stationery", "books"],
    ["Exercise book 96 pages", "printing-stationery", "stationery"], ["Pedigree dog food 3kg", "agrovet", "pets"], ["Rosecoco beans 1kg", "supermarket-minimart", "cereals"], ["Bean seeds 2kg", "agrovet", "farm"],
    ["Hot dog", "restaurant-cafe", "meals"], ["Steel gate 12ft", "hardware-building", "welding"], ["House wiring", "plumbing-electrical", "trades"], ["Double room per night", "hotels-lodging", "hotels"],
    ["2 bedroom apartment to let", "rentals-real-estate", "rentals"], ["Boda boda ride to town", "transport-logistics", "transport"], ["Coffin", "funeral-services", "funeral"], ["Land survey", "professional-services", "professional"]
  ];
  const wrong = cases.map(([name, cat, want]) => [name, kindOf({ name, business: { categoryId: cat } })?.id, want]).filter(([, got, want]) => got !== want);
  assert.deepEqual(wrong, []);
});

test("every demo product gets a kind, and a search for each everyday thing shows the filters that fit it", async () => {
  setLatency(0);
  const all = await getAllProducts();
  assert.deepEqual(all.filter((p) => !kindOf(p)).map((p) => p.name), []);
  const want = {
    soda: ["drinkType", "drinkSize", "drinkPack"], sugar: ["groceryType", "packWeight"], chocolate: ["sweetType"], bed: ["bedType", "bedSize", "mattressThickness"], table: ["tableType", "tableShape"],
    carpet: ["rugType", "rugSize"], flowers: ["flowerType", "arrangement", "giftOccasion"], microwave: ["applianceCapacity"], shirt: ["garment", "sleeve"], bulb: ["lightBase", "lightColour", "lampPower"],
    timber: ["woodType", "timberSize", "timberLength", "treatment"], pens: ["stationeryType", "penType", "packCount"], whiteboard: ["boardSize", "boardMount"], monitor: ["monitorSize", "refreshRate", "panel"],
    "flash disk": ["storageDevice", "usbVersion"], pilau: ["protein", "portion"], menu: ["cuisine", "mealTime"], massage: ["massageType", "duration"], haircut: ["booking"], "dress making": ["garmentMade", "turnaround"],
    printing: ["printService", "colourMode"], laptop: ["processor", "ram", "storage"], phone: ["storage", "ram", "accessoryType"], speaker: ["power", "battery", "connectivity"], bread: ["bakeType"]
  };
  const missing = [];
  for (const [q, ids] of Object.entries(want)) {
    const shown = searchProducts(all, { ...EMPTY_SEARCH, q }).facets.map((f) => f.id);
    for (const id of ids) if (!shown.includes(id)) missing.push(`${q}: ${id}`);
  }
  assert.deepEqual(missing, []);
});

test("a search word matches the same word or its endings, not a longer word that starts the same", () => {
  const items = [p("t1", "Paracetamol 20 tablets"), p("t2", "Glass coffee table"), p("p1", "HB pencil"), p("p2", "Gel pen"), p("c1", "Dozen cupcakes"), p("c2", "Ceramic cup")];
  assert.deepEqual(searchProducts(items, { ...EMPTY_SEARCH, q: "table" }).items.map((i) => i.id), ["t2"]);
  assert.deepEqual(searchProducts(items, { ...EMPTY_SEARCH, q: "pen" }).items.map((i) => i.id), ["p2"]);
  assert.deepEqual(searchProducts(items, { ...EMPTY_SEARCH, q: "cup" }).items.map((i) => i.id), ["c2"]);
});

test("the filters follow what was searched for, not words in descriptions; services have no condition filter", async () => {
  const all = await getAllProducts();
  const phone = searchProducts(all, { ...EMPTY_SEARCH, q: "phone" });
  assert.ok(phone.facets.some((f) => f.id === "storage"), "phone filters even though printing services mention phones");
  const haircut = searchProducts(all, { ...EMPTY_SEARCH, q: "haircut" });
  assert.equal(haircut.facets.some((f) => f.id === "condition"), false);
  const sodas = searchProducts(all, { ...EMPTY_SEARCH, q: "soda", facets: { drinkType: ["soda"] } }).items.map((i) => i.name);
  assert.ok(sodas.length >= 4);
  assert.equal(sodas.some((n) => /juice/i.test(n)), false, "a juice on the \"Soda and drinks\" shelf is not a soda");
});

// ---- the filter column's rules ------------------------------------------------------------------------------------
test("a filter shows only where its kind has it, and only with at least two values to choose between", async () => {
  const all = await getAllProducts();
  for (const q of ["bread", "meat", "pilau", "haircut", "printing", "sugar", "flowers", "speaker", "shirt", "timber"]) {
    const r = searchProducts(all, { ...EMPTY_SEARCH, q });
    for (const f of r.facets) {
      if (f.type === "price" || f.type === "range") continue;
      // A yes/no filter ("Open now") has its two values: with it and without it.
      if (f.toggle) assert.ok(f.values.every((v) => v.count > 0 && v.count < r.matched), `${q}: ${f.id} splits the results`);
      else assert.ok(f.values.length >= 2 || f.values.some((v) => v.selected), `${q}: ${f.id} offers ${f.values.length} value(s)`);
    }
    if (["bread", "meat", "pilau", "haircut", "printing", "sugar"].includes(q)) assert.equal(r.facets.some((f) => f.id === "colour"), false, `${q} has no colour filter`);
  }
  // A filter in use stays, even with one value left, so it can be taken off.
  const meat = searchProducts(all, { ...EMPTY_SEARCH, q: "meat", facets: { meatType: ["beef"] } });
  assert.ok(meat.facets.some((f) => f.id === "meatType" && f.values.some((v) => v.selected)));
});

test("the most used filters come first, and the first five are the quick chips", () => {
  const items = [
    p("s1", "Ladies maxi dress size M red", { business: shop("a") }), p("s2", "Men's shirt size L blue", { business: shop("b") }), p("s3", "Kids dress size S yellow", { business: shop("a") }),
    p("m1", "Beef steak boneless 1kg", { business: shop("butch", { categoryId: "butchery" }) }), p("m2", "Goat ribs with bone 500g", { business: shop("butch", { categoryId: "butchery" }) }),
    p("m3", "Beef mince 2kg", { business: shop("b2", { categoryId: "butchery" }) })
  ];
  const fashion = searchProducts(items.slice(0, 3), EMPTY_SEARCH);
  assert.equal(fashion.facets.find((f) => f.id !== "kind").id, "clothingSize", "size first for clothes");
  assert.ok(fashion.facets.some((f) => f.id === "colour"), "clothes have colours");
  const meat = searchProducts(items, { ...EMPTY_SEARCH, kind: "meat" });
  assert.deepEqual(meat.facets.filter((f) => f.id !== "kind").slice(0, 2).map((f) => f.id), ["cut", "weight"], "cut and weight first for meat");
  assert.equal(meat.facets.some((f) => f.id === "colour"), false, "no colour on meat");
  assert.ok(meat.quick.length <= 5);
  assert.deepEqual(meat.quick, meat.facets.filter((f) => f.id !== "kind").slice(0, 5).map((f) => f.id));
});

test("numbers are ranges in one unit: 1 kg and 1000 g match, and a shopper's own min and max work", () => {
  const items = [p("a", "Beef 1kg"), p("b", "Beef 1000g"), p("c", "Beef ½ kg"), p("d", "Beef 2 kilos"), p("e", "Beef 1,500 gms")].map((x) => ({ ...x, business: shop("butch", { categoryId: "butchery" }) }));
  const r = searchProducts(items, { ...EMPTY_SEARCH, q: "beef" });
  const weight = r.facets.find((f) => f.id === "weight");
  assert.equal(weight.type, "range");
  assert.equal(weight.unit, "kg");
  assert.deepEqual(weight.bounds, { min: 0.5, max: 2 });
  assert.deepEqual(searchProducts(items, { ...EMPTY_SEARCH, q: "beef", ranges: { weight: { min: 1, max: 1 } } }).items.map((i) => i.id).sort(), ["a", "b"]);
  assert.deepEqual(searchProducts(items, { ...EMPTY_SEARCH, q: "beef", ranges: { weight: { min: 1.2, max: null } } }).items.map((i) => i.id).sort(), ["d", "e"]);
  const back = parseSearch(writeSearch({ ...EMPTY_SEARCH, q: "beef", ranges: { weight: { min: 0.5, max: null } } }));
  assert.deepEqual(back.ranges, { weight: { min: 0.5, max: null } });
  assert.deepEqual(parseSearch(new URLSearchParams("r_weight=abc&r_nothing=1-2")).ranges, {});
});

test("products and services are separate listing types", () => {
  const items = [
    p("cut", "Haircut and beard trim", { business: shop("kinyozi", { categoryId: "barbershop" }), availability: "by_appointment" }),
    p("fade", "Kids fade haircut walk-in", { business: shop("kinyozi", { categoryId: "barbershop" }) }),
    p("clip", "Wahl hair clipper", { brand: "Wahl", business: shop("tech"), availability: "limited_stock", stockLeft: 2 })
  ];
  const all = searchProducts(items, { ...EMPTY_SEARCH, q: "" });
  assert.deepEqual(all.listing, { product: 1, service: 2 });
  const services = searchProducts(items, { ...EMPTY_SEARCH, q: "", type: "service" });
  assert.deepEqual(services.items.map((i) => i.id).sort(), ["cut", "fade"]);
  assert.ok(services.items.every((i) => i.search.listing === "service"));
  assert.equal(services.facets.some((f) => f.id === "avail"), false, "services have no stock");
  assert.ok(services.facets.find((f) => f.id === "booking")?.values.some((v) => v.id === "appointment"), "booking from the shop's 'by appointment'");
  const goods = searchProducts(items, { ...EMPTY_SEARCH, q: "", type: "product" });
  assert.deepEqual(goods.items.map((i) => i.id), ["clip"]);
  assert.equal(goods.facets.some((f) => f.id === "booking"), false, "products have no booking");
  assert.equal(parseSearch(writeSearch({ ...EMPTY_SEARCH, type: "service" })).type, "service");
});

test("Model follows Make, and car parts read make, model and year", () => {
  const items = [p("a", "Toyota Fielder headlight 2008"), p("b", "Toyota Probox brake pads 2014"), p("c", "Nissan Note side mirror 2012")].map((x) => ({ ...x, business: shop("parts", { categoryId: "auto-spare-parts" }) }));
  const r = searchProducts(items, { ...EMPTY_SEARCH, kind: "auto-parts" });
  assert.deepEqual(r.facets.slice(0, 4).map((f) => f.id), ["kind", "vehicle", "carModel", "year"]);
  const toyota = searchProducts(items, { ...EMPTY_SEARCH, kind: "auto-parts", facets: { vehicle: ["toyota"] } });
  assert.deepEqual(toyota.facets.find((f) => f.id === "carModel").values.map((v) => v.label).sort(), ["Fielder", "Probox / Succeed"]);
});
