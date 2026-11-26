import { test } from "node:test";
import assert from "node:assert/strict";
import { FLASH_MAX_MS, FLASH_QUICK, extendChoices, flashPhase, flashPrice, flashQuota, flashRenewable, renewInput, spanText, validateFlashSale } from "./flash.js";

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

test("a sale can run for 14 days, not a minute more", () => {
  assert.equal(FLASH_MAX_MS, 14 * 86_400_000);
  assert.equal(validateFlashSale({ ...ok, endsAt: new Date(NOW + 14 * 86_400_000).toISOString() }, NOW).ok, true);
  assert.equal(bad({ endsAt: new Date(NOW + 14 * 86_400_000 + 1000).toISOString() }), "duration_too_long");
  assert.equal(bad({ endsAt: new Date(NOW + 15 * 86_400_000).toISOString() }), "duration_too_long");
  assert.deepEqual(FLASH_QUICK.map((q) => q.key), ["1h", "6h", "24h", "48h", "7d", "14d"]);
});

test("14 days counts from a scheduled start, not from now", () => {
  const startsAt = new Date(NOW + 2 * 86_400_000).toISOString();
  assert.equal(validateFlashSale({ ...ok, startsAt, endsAt: new Date(NOW + 16 * 86_400_000).toISOString() }, NOW).ok, true);
  assert.equal(validateFlashSale({ ...ok, startsAt, endsAt: new Date(NOW + 16 * 86_400_000 + 1000).toISOString() }, NOW).error, "duration_too_long");
});

const ended = (over = {}) => ({ id: "s1", itemId: "i1", status: "ended", startsAt: new Date(NOW - 86_400_000).toISOString(), endsAt: new Date(NOW - 1000).toISOString(), endedReason: "time", discountType: "percent", discountValue: 20, headline: "Deal", quantityNote: null, afterEnd: "keep", variantTarget: "all", variantOverrides: [], ...over });

test("only a sale that ended on time or by the seller can be renewed", () => {
  assert.equal(flashRenewable(ended(), NOW), true);
  assert.equal(flashRenewable(ended({ endedReason: "seller" }), NOW), true);
  for (const endedReason of ["admin", "item_removed", "subscription"]) assert.equal(flashRenewable(ended({ endedReason }), NOW), false);
  assert.equal(flashRenewable(ended({ status: "cancelled", endedReason: "seller" }), NOW), false);
  assert.equal(flashRenewable({ ...ended(), status: "live", endsAt: new Date(NOW + 1000).toISOString() }, NOW), false);
});

test("a renewal repeats the sale and takes a new end", () => {
  const endsAt = new Date(NOW + 5 * 86_400_000).toISOString();
  assert.deepEqual(renewInput(ended(), { endsAt }), { itemId: "i1", discountType: "percent", discountValue: 20, startsAt: null, endsAt, headline: "Deal", quantityNote: null, afterEnd: "keep" });
  const chosen = ended({ variantTarget: "chosen", variantOverrides: [{ combo: "a", type: "percent", value: 10 }], afterEnd: "unlist" });
  const r = renewInput(chosen, { endsAt, startsAt: "2026-10-20T00:00:00.000Z" });
  assert.equal(r.variantTarget, "chosen");
  assert.equal(r.variantOverrides.length, 1);
  assert.equal(r.afterEnd, "unlist");
  assert.equal(r.startsAt, "2026-10-20T00:00:00.000Z");
  // A renewal that is valid for the rules: now to 14 days.
  assert.equal(validateFlashSale({ itemPrice: 1000, ...renewInput(ended(), { endsAt: new Date(NOW + FLASH_MAX_MS).toISOString() }) }, NOW).ok, true);
});

test("extension choices stop at the 14 day limit and offer the limit itself", () => {
  const sale = { startsAt: new Date(NOW - 86_400_000).toISOString(), endsAt: new Date(NOW + 3_600_000).toISOString() };
  const { choices, cap } = extendChoices(sale, NOW);
  assert.equal(cap, Date.parse(sale.startsAt) + FLASH_MAX_MS);
  assert.deepEqual(choices.map((c) => c.key), ["1h", "6h", "24h", "48h", "7d", "max"]);
  assert.equal(Date.parse(choices.at(-1).endsAt), cap);
  const full = { startsAt: new Date(NOW - 14 * 86_400_000 + 5000).toISOString(), endsAt: new Date(NOW + 1000).toISOString() };
  assert.deepEqual(extendChoices(full, NOW).choices.map((c) => c.key), ["max"]);
  const atCap = { startsAt: new Date(NOW - 14 * 86_400_000).toISOString(), endsAt: new Date(NOW).toISOString() };
  assert.deepEqual(extendChoices(atCap, NOW - 1).choices, []);
});

test("spanText reads naturally", () => {
  assert.equal(spanText(14 * 86_400_000), "14 days");
  assert.equal(spanText(13 * 86_400_000 + 4 * 3_600_000), "13 days 4 hours");
  assert.equal(spanText(86_400_000 + 3_600_000), "1 day 1 hour");
  assert.equal(spanText(6.5 * 3_600_000), "6 hours 30 minutes");
  assert.equal(spanText(45 * 60_000), "45 minutes");
  assert.equal(spanText(-5), "0 minutes");
});
