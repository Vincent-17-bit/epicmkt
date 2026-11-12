import { test } from "node:test";
import assert from "node:assert/strict";
import { priceFor } from "../pricing.js";
import { getFixture } from "../contracts/index.js";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const phone = () => structuredClone(getFixture("fx-phone").detail);
const idOf = (item, colour, storage) => item.optionVariants.find((v) => v.choice.colour === colour && v.choice.storage === storage).id;
const sale = (extra = {}) => ({ discount: { type: "percent", value: 20 }, startsAt: "2026-11-06T00:00:00Z", endsAt: "2026-11-07T00:00:00Z", variantTarget: "all", variantOverrides: [], ...extra });
const BLACK_64 = "colour=black|storage=64-gb";
const BLACK_128 = "colour=black|storage=128-gb";
const GREY_64 = "colour=grey|storage=64-gb";
const ov = (combo, type, value) => ({ combo, type, value });
const priced = (item, colour, storage) => priceFor(item, idOf(item, colour, storage), 1, NOW);

test("flash on Black only: Black is discounted, Grey pays the listed price", () => {
  const item = phone();
  item.flash = sale({ variantTarget: "chosen", variantOverrides: [ov(BLACK_64, "percent", 20), ov(BLACK_128, "percent", 20)] });
  const black = priced(item, "black", "64-gb");
  assert.deepEqual([black.unit, black.was, black.source], [20000, 25000, "flash"]);
  assert.equal(priced(item, "black", "128-gb").unit, 20000);
  const grey = priced(item, "grey", "64-gb");
  assert.deepEqual([grey.unit, grey.was, grey.source], [24000, null, "regular"]);
});

test("flash on all: every combination is discounted from its own price", () => {
  const item = phone();
  item.flash = sale({ discount: { type: "percent", value: 10 } });
  assert.deepEqual([priced(item, "black", "64-gb").unit, priced(item, "grey", "64-gb").unit], [22500, 21600]);
});

test("each combination can use its own kind of discount", () => {
  const item = phone();
  item.flash = sale({ variantTarget: "chosen", variantOverrides: [ov(BLACK_64, "percent", 10), ov(BLACK_128, "amount_off", 3000), ov(GREY_64, "sale_price", 20000)] });
  assert.deepEqual([priced(item, "black", "64-gb").unit, priced(item, "black", "128-gb").unit, priced(item, "grey", "64-gb").unit], [22500, 22000, 20000]);
});

test("with target all an override replaces the sale's discount for that combination only", () => {
  const item = phone();
  item.flash = sale({ discount: { type: "percent", value: 10 }, variantOverrides: [ov(BLACK_64, "sale_price", 15000)] });
  assert.deepEqual([priced(item, "black", "64-gb").unit, priced(item, "grey", "64-gb").unit], [15000, 21600]);
});

test("a sale price override never raises a price", () => {
  const item = phone();
  item.flash = sale({ variantTarget: "chosen", variantOverrides: [ov(BLACK_64, "sale_price", 30000)] });
  assert.deepEqual([priced(item, "black", "64-gb").unit, priced(item, "black", "64-gb").source], [25000, "regular"]);
});

test("older id entries and a sale with no overrides behave as before", () => {
  const item = phone();
  const black = idOf(item, "black", "64-gb");
  item.flash = sale({ variantOverrides: [black] });
  assert.equal(priced(item, "black", "64-gb").source, "flash");
  assert.equal(priced(item, "grey", "64-gb").source, "regular");
  item.flash = sale();
  assert.equal(priced(item, "grey", "64-gb").source, "flash");
});

test("a flash on a chosen combination applies to its tier prices", () => {
  const item = phone();
  const black = item.optionVariants.find((v) => v.choice.colour === "black" && v.choice.storage === "64-gb");
  black.priceTiers = [{ minQty: 1, maxQty: 9, unitPrice: 25000 }, { minQty: 10, maxQty: null, unitPrice: 20000 }];
  item.flash = sale({ variantTarget: "chosen", variantOverrides: [ov(BLACK_64, "percent", 10)] });
  const r = priceFor(item, black.id, 10, NOW);
  assert.deepEqual([r.unit, r.total, r.was, r.source], [18000, 180000, 200000, "flash"]);
  assert.equal(priceFor(item, idOf(item, "grey", "64-gb"), 1, NOW).source, "regular");
});

test("outside the sale window nothing changes", () => {
  const item = phone();
  item.flash = sale({ variantTarget: "chosen", variantOverrides: [ov(BLACK_64, "percent", 20)] });
  assert.equal(priceFor(item, idOf(item, "black", "64-gb"), 1, Date.parse("2026-11-07T00:00:01Z")).source, "regular");
});
