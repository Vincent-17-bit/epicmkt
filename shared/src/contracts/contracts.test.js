import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTRACT_VERSION, PRODUCT_TYPES, productTypeById, getFixtures, getFixture,
  checkItemDetail, checkItemListCard, checkItemAgainstProductType, checkProductType, checkPriceTiers, checkDimensions, checkOptionAxis,
  isProductType, isItemDetail, isItemListCard, isDimensions, isPriceTiers, isOptionAxis, isOptionVariant, isQuantity, isSellerCard
} from "./index.js";
import * as shared from "../index.js";
import { emptyOptions, selectableValues, statusForChoice } from "../seller/options.js";

const EXPECTED = [
  "fx-phone", "fx-sandisk", "fx-shoes", "fx-table", "fx-sofa", "fx-bread", "fx-water",
  "fx-led-strip", "fx-led-bulb", "fx-printing", "fx-butcher", "fx-necklace", "fx-fragrance", "fx-legacy"
];
const fixtures = getFixtures();
const clone = (v) => structuredClone(v);

test("contract version is 1 and is exported from @epicmkt/shared", () => {
  assert.equal(CONTRACT_VERSION, 1);
  assert.equal(shared.CONTRACT_VERSION, 1);
  assert.equal(typeof shared.isItemDetail, "function");
  assert.equal(typeof shared.getFixtures, "function");
});

test("there are exactly the 14 fixtures, with unique ids, built once", () => {
  assert.deepEqual(fixtures.map((f) => f.id), EXPECTED);
  assert.equal(new Set(fixtures.map((f) => f.id)).size, 14);
  assert.equal(getFixtures(), fixtures);
  assert.equal(getFixture("fx-phone"), fixtures[0]);
  assert.equal(getFixture("nope"), null);
});

// One test per fixture: the detail and the list card pass the validators and the item fits its product type.
for (const id of EXPECTED) {
  test(`fixture ${id} validates against the validators`, () => {
    const f = getFixture(id);
    assert.deepEqual(checkItemDetail(f.detail), [], "detail");
    assert.ok(isItemDetail(f.detail));
    assert.deepEqual(checkItemListCard(f.card), [], "list card");
    assert.ok(isItemListCard(f.card));
    if (id === "fx-legacy") {
      assert.equal(f.detail.productType, null);
    } else {
      assert.deepEqual(checkItemAgainstProductType(f.detail, productTypeById(f.productType)), [], "product type");
    }
  });
}

test("every product type is valid, unique, and used by exactly one fixture", () => {
  assert.equal(PRODUCT_TYPES.length, 13);
  for (const t of PRODUCT_TYPES) assert.deepEqual(checkProductType(t), [], t.id);
  assert.ok(PRODUCT_TYPES.every(isProductType));
  assert.equal(new Set(PRODUCT_TYPES.map((t) => t.id)).size, PRODUCT_TYPES.length);
  assert.deepEqual(fixtures.map((f) => f.productType).filter(Boolean).sort(), PRODUCT_TYPES.map((t) => t.id).sort());
});

test("phone: Black 25,000, Grey 24,000, three storages", () => {
  const d = getFixture("fx-phone").detail;
  const storage = d.options.find((a) => a.key === "storage");
  assert.equal(storage.values.length, 3);
  const priceOf = (colour) => new Set(d.optionVariants.filter((v) => v.choice.colour === colour).map((v) => v.price));
  assert.deepEqual([...priceOf("black")], [25000]);
  assert.deepEqual([...priceOf("grey")], [24000]);
  assert.equal(d.regularPrice, 24000);
  assert.equal(d.optionVariants.length, 6);
});

test("SanDisk: Capacity depends on Style, and no impossible pair exists", () => {
  const d = getFixture("fx-sandisk").detail;
  const capacity = d.options.find((a) => a.key === "capacity");
  assert.equal(capacity.dependsOn.axis, "style");
  assert.ok(!d.optionVariants.some((v) => v.choice.style === "usb" && v.choice.capacity === "2-tb"));
  assert.ok(!d.optionVariants.some((v) => v.choice.style === "ssd" && v.choice.capacity === "32-gb"));
  // A picker that chose the SSD style can only still reach SSD capacities.
  const left = selectableValues(d.optionAvailability, { style: "ssd" }).capacity;
  assert.equal(left["2-tb"], "available");
  assert.equal(left["32-gb"], "unavailable");
});

test("shoes: EU sizes with widths, a missing combination reads as unavailable, size chart attached", () => {
  const d = getFixture("fx-shoes").detail;
  assert.equal(d.options.length, 2);
  assert.equal(statusForChoice(d.optionAvailability, { size: "eu-43", width: "narrow" }), "unavailable");
  assert.equal(statusForChoice(d.optionAvailability, { size: "eu-40", width: "regular" }), "out_of_stock");
  assert.equal(d.sizeChart.columns[0], "EU");
  assert.equal(d.optionVariants.find((v) => v.status === "limited_stock").stockLeft, 2);
});

test("table and sofa: dimensions on every option", () => {
  for (const id of ["fx-table", "fx-sofa"]) {
    const d = getFixture(id).detail;
    assert.ok(d.optionVariants.length > 0);
    assert.ok(d.optionVariants.every((v) => isDimensions(v.dimensions)), id);
  }
  const sofa = getFixture("fx-sofa").detail;
  assert.ok(sofa.options.find((a) => a.key === "seats").values.some((v) => v.id === "3-seater"));
  assert.ok(sofa.options.find((a) => a.key === "upholstery").values.some((v) => v.id === "leather"));
});

test("bread is weight x kind and water is a size x fill grid", () => {
  assert.equal(getFixture("fx-bread").detail.optionVariants.length, 2 * 3);
  const water = getFixture("fx-water").detail;
  assert.equal(water.optionVariants.length, 3 * 2);
  assert.ok(water.options.find((a) => a.key === "size").values.some((v) => v.label === "20 L"));
});

test("printing has price tiers on the item, and A3 carries its own", () => {
  const d = getFixture("fx-printing").detail;
  assert.ok(isPriceTiers(d.priceTiers));
  assert.equal(d.priceType, "from");
  assert.equal(d.unit, "page");
  assert.equal(d.regularPrice, 10);
  assert.equal(d.optionVariants.find((v) => v.choice.paper === "a4").priceTiers, undefined);
  assert.ok(isPriceTiers(d.optionVariants.find((v) => v.choice.paper === "a3").priceTiers));
});

test("butcher is priced per kg with a quantity step, necklace has purity and weight, fragrance has volumes", () => {
  const butcher = getFixture("fx-butcher").detail;
  assert.equal(butcher.unit, "kg");
  assert.ok(isQuantity(butcher.quantity));
  assert.equal(butcher.quantity.step, 0.25);
  const necklace = getFixture("fx-necklace").detail;
  assert.deepEqual(necklace.options.find((a) => a.key === "purity").values.map((v) => v.label), ["18K", "22K", "24K"]);
  assert.ok(necklace.optionVariants.every((v) => v.weightGrams > 0));
  assert.equal(getFixture("fx-fragrance").detail.options[0].values.length, 3);
});

test("LED strip and LED bulb are valid typed items of the same group", () => {
  assert.equal(productTypeById("led-strip").group, productTypeById("led-bulb").group);
  for (const id of ["fx-led-strip", "fx-led-bulb"]) assert.ok(getFixture(id).detail.optionVariants.length >= 6);
});

test("the legacy item has no type and no options, exactly the empty shape of today", () => {
  const d = getFixture("fx-legacy").detail;
  const none = emptyOptions();
  assert.equal(d.productType, null);
  assert.equal(d.priceTiers, null);
  assert.equal(d.quantity, null);
  assert.deepEqual(d.options, none.options);
  assert.deepEqual(d.optionVariants, none.optionVariants);
  assert.deepEqual(d.optionAvailability, none.optionAvailability);
  assert.equal(d.sizeChart, null);
  assert.deepEqual(d.variants, []);
  assert.equal(d.priceType, "fixed");
  assert.equal(d.regularPrice, 1500);
});

test("a list card is the detail without the option payload", () => {
  for (const f of fixtures) {
    for (const k of ["options", "optionVariants", "optionAvailability", "sizeChart", "offers"]) assert.ok(!(k in f.card), `${f.id} ${k}`);
    assert.equal(f.card.id, f.detail.id);
    assert.equal(f.card.productType, f.detail.productType);
    assert.deepEqual(f.card.pricing, f.detail.pricing);
  }
});

// ---- the validators refuse what the contract forbids ----

test("isItemDetail refuses an item whose option variant uses an unknown value", () => {
  const d = clone(getFixture("fx-phone").detail);
  d.optionVariants[0].choice.colour = "purple";
  assert.ok(!isItemDetail(d));
  assert.match(checkItemDetail(d).join("\n"), /not a value of that axis/);
});

test("isItemDetail refuses duplicate combinations, a missing v1 field and options with no variants", () => {
  const dup = clone(getFixture("fx-phone").detail);
  dup.optionVariants[1] = clone(dup.optionVariants[0]);
  assert.match(checkItemDetail(dup).join("\n"), /same combination/);
  const missing = clone(getFixture("fx-bread").detail);
  delete missing.productType;
  assert.ok(!isItemDetail(missing));
  const empty = clone(getFixture("fx-bread").detail);
  empty.optionVariants = [];
  assert.match(checkItemDetail(empty).join("\n"), /without any variant/);
  assert.ok(!isItemDetail(null));
  assert.ok(!isItemDetail("item"));
});

test("a dependent axis refuses a pair its parent does not allow", () => {
  const d = clone(getFixture("fx-sandisk").detail);
  const v = d.optionVariants.find((x) => x.choice.style === "usb");
  v.choice.capacity = "2-tb";
  assert.match(checkItemDetail(d).join("\n"), /does not go with style/);
});

test("price tiers must be gapless, descending in price and end open", () => {
  assert.ok(isPriceTiers([{ minQty: 1, maxQty: 9, unitPrice: 5 }, { minQty: 10, maxQty: null, unitPrice: 4 }]));
  assert.ok(!isPriceTiers([]));
  assert.ok(!isPriceTiers([{ minQty: 2, maxQty: null, unitPrice: 5 }]), "must start at 1");
  assert.ok(!isPriceTiers([{ minQty: 1, maxQty: 9, unitPrice: 5 }, { minQty: 11, maxQty: null, unitPrice: 4 }]), "gap");
  assert.ok(!isPriceTiers([{ minQty: 1, maxQty: 9, unitPrice: 5 }, { minQty: 9, maxQty: null, unitPrice: 4 }]), "overlap");
  assert.ok(!isPriceTiers([{ minQty: 1, maxQty: 9, unitPrice: 5 }, { minQty: 10, maxQty: 20, unitPrice: 4 }]), "last tier is open");
  assert.ok(!isPriceTiers([{ minQty: 1, maxQty: 9, unitPrice: 4 }, { minQty: 10, maxQty: null, unitPrice: 5 }]), "bigger quantity costs more");
  assert.deepEqual(checkPriceTiers([{ minQty: 1, maxQty: null, unitPrice: 0 }]), []);
});

test("dimensions, quantity, axes, cards and variants are checked", () => {
  assert.ok(isDimensions({ length: 1, width: 1, height: 1, unit: "m" }));
  assert.ok(!isDimensions({ length: 0, width: 1, height: 1, unit: "m" }));
  assert.ok(!isDimensions({ length: 1, width: 1, height: 1, unit: "ft" }));
  assert.ok(checkDimensions(null).length > 0);
  assert.ok(!isQuantity({ min: 0, step: 1, unit: "kg" }));
  assert.ok(isOptionAxis({ key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }] }));
  assert.ok(!isOptionAxis({ key: "size", label: "Size", display: "slider", values: [{ id: "s", label: "S" }] }));
  assert.ok(checkOptionAxis({ key: "size", label: "Size", display: "button", values: [{ id: "s", label: "S" }, { id: "s", label: "T" }] }).length > 0);
  assert.ok(isSellerCard(getFixture("fx-phone").detail.business));
  assert.ok(!isSellerCard({}));
  assert.ok(isOptionVariant(getFixture("fx-phone").detail.optionVariants[0]));
  assert.ok(!isOptionVariant({ label: "x", choice: {}, price: -1, status: "available", sku: null, mediaIds: [] }));
  const lean = clone(getFixture("fx-phone").card);
  lean.options = [];
  assert.match(checkItemListCard(lean).join("\n"), /lists stay lean/);
});

test("an item must fit its product type", () => {
  const d = clone(getFixture("fx-phone").detail);
  assert.ok(checkItemAgainstProductType(d, productTypeById("sofa")).length > 0);
  const extra = clone(d);
  extra.optionVariants[0].weightGrams = 100;
  assert.match(checkItemAgainstProductType(extra, productTypeById("phone")).join("\n"), /weightGrams is not allowed/);
  const typo = clone(productTypeById("phone"));
  typo.group = "toys";
  assert.ok(!isProductType(typo));
});
