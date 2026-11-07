import { test } from "node:test";
import assert from "node:assert/strict";
import { validateFlashVariants, flashComboPrice, overridesShapeValid } from "./validateFlashVariants.js";
import { getFixture } from "../contracts/index.js";

const phone = () => getFixture("fx-phone").detail;
const flash = (extra = {}) => ({ discountType: "percent", discountValue: 20, variantTarget: "all", variantOverrides: [], ...extra });
const BLACK_64 = "colour=black|storage=64-gb";
const prices = (r) => Object.fromEntries(r.targets.map((t) => [t.combo, t.salePrice]));

test("target all discounts every sold combination", () => {
  const r = validateFlashVariants(flash(), phone());
  assert.equal(r.ok, true);
  assert.equal(r.targets.length, 6);
  assert.equal(prices(r)[BLACK_64], 20000);
  assert.equal(prices(r)["colour=grey|storage=128-gb"], 19200);
});

test("target chosen discounts only the listed combinations", () => {
  const overrides = ["64-gb", "128-gb", "256-gb"].map((s) => ({ combo: `colour=black|storage=${s}`, type: "percent", value: 20 }));
  const r = validateFlashVariants(flash({ variantTarget: "chosen", variantOverrides: overrides }), phone());
  assert.equal(r.ok, true);
  assert.deepEqual(r.targets.map((t) => t.combo).sort(), overrides.map((o) => o.combo).sort());
  assert.ok(r.targets.every((t) => t.regularPrice === 25000));
});

test("each combination can use its own percent, amount off or sale price", () => {
  const r = validateFlashVariants(flash({ variantTarget: "chosen", variantOverrides: [
    { combo: BLACK_64, type: "percent", value: 10 },
    { combo: "colour=black|storage=128-gb", type: "amount_off", value: 3000 },
    { combo: "colour=grey|storage=64-gb", type: "sale_price", value: 20000 }
  ] }), phone());
  assert.deepEqual(prices(r), { [BLACK_64]: 22500, "colour=black|storage=128-gb": 22000, "colour=grey|storage=64-gb": 20000 });
});

test("with target all an override replaces the discount for that combination", () => {
  const r = validateFlashVariants(flash({ variantOverrides: [{ combo: BLACK_64, type: "sale_price", value: 15000 }] }), phone());
  assert.equal(prices(r)[BLACK_64], 15000);
  assert.equal(prices(r)["colour=black|storage=128-gb"], 20000);
});

test("a target that is not a sold combination is refused", () => {
  const bad = (combo, item = phone()) => validateFlashVariants(flash({ variantTarget: "chosen", variantOverrides: [{ combo, type: "percent", value: 10 }] }), item);
  assert.deepEqual(bad("colour=red|storage=64-gb").errors, [{ code: "invalid_flash_target", combo: "colour=red|storage=64-gb" }]);
  assert.equal(bad("colour=black").ok, false);
  const item = structuredClone(phone());
  item.optionVariants.find((v) => v.choice.colour === "black" && v.choice.storage === "64-gb").status = "unavailable";
  assert.equal(bad(BLACK_64, item).errors[0].code, "invalid_flash_target");
});

test("chosen needs at least one combination and an item with options", () => {
  assert.equal(validateFlashVariants(flash({ variantTarget: "chosen" }), phone()).errors[0].code, "flash_needs_combinations");
  const plain = getFixture("fx-legacy").detail;
  assert.equal(validateFlashVariants(flash({ variantTarget: "chosen", variantOverrides: [{ combo: BLACK_64, type: "percent", value: 10 }] }), plain).errors[0].code, "flash_needs_combinations");
});

test("a discount that is too large or not lower is refused", () => {
  const one = (type, value) => validateFlashVariants(flash({ variantTarget: "chosen", variantOverrides: [{ combo: BLACK_64, type, value }] }), phone()).errors[0]?.code;
  assert.equal(one("amount_off", 25000), "discount_too_large");
  assert.equal(one("sale_price", 25000), "sale_price_not_lower");
  assert.equal(one("sale_price", 30000), "sale_price_not_lower");
  assert.equal(one("percent", 99), undefined);
});

test("bad override shapes are refused", () => {
  const bad = (list) => assert.equal(overridesShapeValid(list), false, JSON.stringify(list));
  bad("x");
  bad({});
  bad([1]);
  bad([{ combo: BLACK_64, type: "percent" }]);
  bad([{ combo: BLACK_64, type: "percent", value: 0 }]);
  bad([{ combo: BLACK_64, type: "percent", value: 100 }]);
  bad([{ combo: BLACK_64, type: "bogus", value: 10 }]);
  bad([{ combo: BLACK_64, type: "percent", value: "10" }]);
  bad([{ combo: BLACK_64, type: "percent", value: 10, extra: 1 }]);
  bad([{ combo: BLACK_64, type: "amount_off", value: 1.005 }]);
  bad([{ combo: "ab", type: "percent", value: 10 }]);
  bad([{ combo: BLACK_64, type: "percent", value: 10 }, { combo: BLACK_64, type: "percent", value: 20 }]);
  bad(Array.from({ length: 201 }, (_, i) => ({ combo: `a=${i}`, type: "percent", value: 10 })));
  assert.equal(validateFlashVariants(flash({ variantTarget: "some" }), phone()).errors[0].code, "invalid_flash_overrides");
});

test("a legacy single price flash on an item without options still validates", () => {
  const plain = getFixture("fx-legacy").detail;
  const r = validateFlashVariants(flash(), plain);
  assert.equal(r.ok, true);
  assert.equal(overridesShapeValid([{ variantId: "medium", salePrice: 2000 }]), true);
});

test("flashComboPrice skips combinations the discount cannot lower", () => {
  assert.equal(flashComboPrice(flash({ discountType: "amount_off", discountValue: 500 }), "a=b", 400), null);
  assert.equal(flashComboPrice(flash({ discountType: "sale_price", discountValue: 500 }), "a=b", 400), null);
  assert.equal(flashComboPrice(flash(), "a=b", 400), 320);
  assert.equal(flashComboPrice(flash({ variantTarget: "chosen" }), "a=b", 400), null);
});
