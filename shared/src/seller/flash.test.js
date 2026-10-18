import { test } from "node:test";
import assert from "node:assert/strict";
import { FLASH_MAX_MS, flashPhase, flashPrice, flashQuota, validateFlashSale } from "./flash.js";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const ok = { itemPrice: 1000, discountType: "percent", discountValue: 20, endsAt: new Date(NOW + 3_600_000).toISOString(), afterEnd: "keep" };
const bad = (patch) => validateFlashSale({ ...ok, ...patch }, NOW).error;

test("prices match the database function", () => {
  assert.equal(flashPrice("percent", 15, 999), 849);
  assert.equal(flashPrice("amount_off", 120, 500), 380);
  assert.equal(flashPrice("sale_price", 199, 333), 199);
  assert.equal(flashPrice("amount_off", 900, 500), 0);
});

test("a valid sale starts now and is normalised", () => {
  const r = validateFlashSale({ ...ok, headline: "  Weekend deal ", quantityNote: "" }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.startsAt, new Date(NOW).toISOString());
  assert.equal(r.value.headline, "Weekend deal");
  assert.equal(r.value.quantityNote, null);
  assert.equal(r.value.salePrice, 800);
});

test("the rules the database enforces are enforced here too", () => {
  assert.equal(bad({ discountType: "x" }), "invalid_discount");
  assert.equal(bad({ discountValue: 100 }), "invalid_discount");
  assert.equal(bad({ discountValue: 0 }), "invalid_discount");
  assert.equal(bad({ discountValue: "abc" }), "invalid_discount");
  assert.equal(bad({ discountType: "amount_off", discountValue: 1000 }), "discount_too_large");
  assert.equal(bad({ discountType: "sale_price", discountValue: 1000 }), "sale_price_not_lower");
  assert.equal(bad({ discountType: "sale_price", discountValue: 1500 }), "sale_price_not_lower");
  assert.equal(bad({ itemPrice: null }), "item_not_discountable");
  assert.equal(bad({ endsAt: new Date(NOW - 1000).toISOString() }), "ends_in_past");
  assert.equal(bad({ endsAt: "nope" }), "invalid_window");
  assert.equal(bad({ startsAt: new Date(NOW + 7200_000).toISOString() }), "invalid_window");
  assert.equal(bad({ endsAt: new Date(NOW + FLASH_MAX_MS + 1000).toISOString() }), "duration_too_long");
  assert.equal(bad({ headline: "ab" }), "invalid_headline");
  assert.equal(bad({ headline: "x".repeat(81) }), "invalid_headline");
  assert.equal(bad({ quantityNote: "a" }), "invalid_note");
  assert.equal(bad({ quantityNote: "bad\u0000" }), "invalid_note");
  assert.equal(bad({ afterEnd: "delete" }), "invalid_after_end");
  assert.equal(validateFlashSale({ ...ok, endsAt: new Date(NOW + FLASH_MAX_MS).toISOString() }, NOW).ok, true);
});

test("a scheduled start in the past counts from now", () => {
  const r = validateFlashSale({ ...ok, startsAt: new Date(NOW - 5_000_000).toISOString() }, NOW);
  assert.equal(r.value.startsAt, new Date(NOW).toISOString());
});

test("quota counts open sales now and non-cancelled sales this Nairobi month", () => {
  const at = (h) => new Date(NOW + h * 3_600_000).toISOString();
  const sales = [
    { status: "live", startsAt: at(-1), endsAt: at(2) },
    { status: "scheduled", startsAt: at(5), endsAt: at(6) },
    { status: "cancelled", startsAt: at(1), endsAt: at(2) },
    { status: "ended", startsAt: at(-5), endsAt: at(-4) },
    { status: "ended", startsAt: "2026-08-01T00:00:00Z", endsAt: "2026-08-02T00:00:00Z" }
  ];
  const q = flashQuota(sales, { flashSalesConcurrent: 2, flashSalesPerMonth: 4 }, NOW);
  assert.deepEqual([q.concurrentUsed, q.monthlyUsed, q.canCreate], [2, 3, false]);
  assert.equal(flashQuota(sales, { flashSalesConcurrent: 3, flashSalesPerMonth: 4 }, NOW).canCreate, true);
  assert.equal(flashQuota(sales, { flashSalesConcurrent: null, flashSalesPerMonth: null }, NOW).canCreate, true);
});

test("phase follows the clock, not only the stored status", () => {
  const sale = { status: "live", startsAt: "2026-10-17T10:00:00Z", endsAt: "2026-10-17T11:00:00Z" };
  assert.equal(flashPhase(sale, NOW), "ended");
  assert.equal(flashPhase({ ...sale, endsAt: "2026-10-17T13:00:00Z" }, NOW), "live");
  assert.equal(flashPhase({ ...sale, startsAt: "2026-10-17T12:30:00Z", endsAt: "2026-10-17T13:00:00Z", status: "scheduled" }, NOW), "scheduled");
  assert.equal(flashPhase({ ...sale, status: "cancelled" }, NOW), "cancelled");
});
