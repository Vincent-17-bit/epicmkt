// Prices are whole shillings (migration 0161). The buyer is charged whole shillings, so a price with cents is refused everywhere a
// seller can type one, instead of being accepted and then charged rounded.
import test from "node:test";
import assert from "node:assert/strict";
import { validateItemForm } from "./itemForm.js";
import { validateOptions } from "./options.js";
import { isMoney, optionsPayload, priceWarnings, addAxis, addValue, emptyOptionsForm, setRow, rowKeyOf } from "../options/editor.js";
import { priceFor } from "../pricing.js";

const form = (extra = {}) => ({ name: "Royco", description: "", section: "Pantry", priceType: "fixed", price: "10", availability: "available", ...extra });

test("the item form refuses cents on the price, the highest price and the sale price, and takes whole amounts with commas", () => {
  for (const field of ["price", "priceMax", "salePrice"]) {
    const r = validateItemForm(form({ priceType: field === "priceMax" ? "range" : "fixed", price: field === "price" ? "10.50" : "10", ...(field !== "price" && { [field]: field === "priceMax" ? "20.5" : "5.25" }) }));
    assert.equal(r.ok, false, field);
    assert.ok(r.errors[field], `${field} has its own error`);
  }
  const ok = validateItemForm(form({ price: "1,500", salePrice: "1,200" }));
  assert.equal(ok.ok, true);
  assert.equal(ok.value.price, 1500);
  assert.equal(ok.value.sale_price ?? ok.value.salePrice, 1200);
});

test("the option editor and its validator refuse cents on a size's price and sale price", () => {
  assert.equal(isMoney("160"), true);
  assert.equal(isMoney("160.5"), false);
  assert.equal(isMoney("160.50"), false);

  let o = emptyOptionsForm();
  o = addAxis(o, { label: "Size", display: "button" });
  const key = o.axes[0].key;
  o = addValue(o, key, "Jar").options;
  o = addValue(o, key, "Pack").options;
  const rowKey = rowKeyOf(o, o.rows[0].choice);
  const sent = (price, salePrice = "") => {
    const edited = setRow(o, rowKey, { price, salePrice });
    const payload = optionsPayload(edited);
    return validateOptions(payload);
  };
  assert.equal(sent("160").ok, true);
  assert.equal(sent("160.50").ok, false);
  assert.equal(sent("160", "99.5").ok, false);
});

test("the typo check ignores a price with cents instead of treating it as a number", () => {
  let o = emptyOptionsForm();
  o = addAxis(o, { label: "Size", display: "button" });
  const key = o.axes[0].key;
  for (const v of ["A", "B", "C"]) o = addValue(o, key, v).options;
  o = setRow(o, rowKeyOf(o, o.rows[0].choice), { price: "10.5" });
  assert.deepEqual(priceWarnings(o), {});
});

test("what is stored as a whole price is exactly what the buyer pays, for any quantity", () => {
  for (const [price, qty] of [[10, 3], [160, 1], [1499, 7], [250, 12]]) {
    const r = priceFor({ price, priceType: "fixed" }, {}, qty, new Date());
    assert.equal(r.unit, price);
    assert.equal(r.total, price * qty);
  }
});
