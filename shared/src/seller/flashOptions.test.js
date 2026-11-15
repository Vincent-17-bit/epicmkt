import test from "node:test";
import assert from "node:assert/strict";
import { flashOptionRows, flashOptionTable, flashVariantFields } from "./flashOptions.js";

const axes = [{ key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "white", label: "White" }, { id: "red", label: "Red" }] }];
const options = { axes, variants: [
  { choice: { colour: "black" }, price: 1000, status: "available" },
  { choice: { colour: "white" }, price: 1200, status: "available" },
  { choice: { colour: "red" }, price: 900, status: "unavailable" }] };

test("rows read the option data; an unavailable combination is not sold", () => {
  const rows = flashOptionRows(options);
  assert.deepEqual(rows.map((r) => [r.label, r.regular, r.sold]), [["Black", 1000, true], ["White", 1200, true], ["Red", 900, false]]);
  assert.equal(rows[0].combo, "colour=black");
});

test("on every option: the sale's discount applies to every sold combination", () => {
  const t = flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("all") });
  assert.equal(t.ok, true);
  assert.deepEqual(t.rows.map((r) => r.sale), [900, 1080, null]);
  assert.equal(t.lowest, 900);
});

test("on Black only: just that combination has a sale price", () => {
  const t = flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=black": { type: "amount_off", value: "250" } }) });
  assert.equal(t.ok, true);
  assert.deepEqual(t.rows.map((r) => [r.label, r.sale, r.percent]), [["Black", 750, 25], ["White", null, 0], ["Red", null, 0]]);
  assert.equal(t.lowest, 750);
});

test("a different discount type per combination", () => {
  const t = flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=black": { type: "percent", value: 20 }, "colour=white": { type: "sale_price", value: 1000 } }) });
  assert.deepEqual(t.rows.map((r) => r.sale), [800, 1000, null]);
});

test("a target that is not a sold combination is refused", () => {
  const t = flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=red": { type: "percent", value: 10 } }) });
  assert.equal(t.ok, false);
  assert.equal(t.error, "invalid_flash_target");
  assert.equal(t.errorCombo, "colour=red");
  assert.deepEqual(t.rows.map((r) => r.sale), [null, null, null]);
  assert.equal(t.lowest, null);
});

test("other refusals: no choice, price too low, price not lower, bad numbers", () => {
  assert.equal(flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", {}) }).error, "flash_needs_combinations");
  assert.equal(flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=black": { type: "amount_off", value: 1000 } }) }).error, "discount_too_large");
  assert.equal(flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=black": { type: "sale_price", value: 1000 } }) }).error, "sale_price_not_lower");
  assert.equal(flashOptionTable(options, { discountType: "percent", discountValue: 10, ...flashVariantFields("chosen", { "colour=black": { type: "percent", value: 120 } }) }).error, "invalid_flash_overrides");
});

test("the fields a sale sends", () => {
  assert.deepEqual(flashVariantFields("all", { x: { type: "percent", value: 5 } }), { variantTarget: "all", variantOverrides: [] });
  assert.deepEqual(flashVariantFields("chosen", { "colour=black": { type: "percent", value: "15" } }), { variantTarget: "chosen", variantOverrides: [{ combo: "colour=black", type: "percent", value: 15 }] });
});
