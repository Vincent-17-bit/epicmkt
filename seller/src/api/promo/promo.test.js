import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as mock from "./mock.js";

const names = [
  "getWorkspace", "listItems", "getUsage", "listOffers", "saveOffer", "deleteOffer", "listFlash", "createFlash", "updateFlash", "deleteFlash",
  "uploadImage", "listGallery", "addGalleryPhoto", "updateGalleryPhoto", "softDeleteGallery", "restoreGallery", "purgeGallery", "reorderGallery",
  "listStaff", "saveStaff", "deleteStaff", "listSlots", "saveSlot", "deleteSlot", "publicUrl",
];

const exportsOf = (file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/export const (\w+)/g)].map((m) => m[1]);
const blob = () => new Blob([new Uint8Array(10)], { type: "image/webp" });
const plus = (m) => new Date(Date.now() + m * 60000).toISOString();

test("live and mock expose the same promo functions", () => {
  const live = exportsOf("./live.js");
  for (const n of names) {
    assert.ok(live.includes(n), `live ${n}`);
    assert.equal(typeof mock[n], "function", `mock ${n}`);
  }
});

test("mock enforces standard offer limits, scheduling and KES rules", async () => {
  mock.resetPromoMock();
  const base = { title: "Weekend deal", discount_type: "percent", discount_value: 10, starts_at: plus(-1), ends_at: plus(600), item_ids: ["i1"] };
  for (let n = 0; n < 8; n++) await mock.saveOffer(null, { ...base, title: `Deal ${n}` });
  await assert.rejects(mock.saveOffer(null, base), { code: "limit_reached:offers" });
  mock.resetPromoMock();
  await assert.rejects(mock.saveOffer(null, { ...base, starts_at: plus(60 * 24), ends_at: plus(60 * 48) }), { code: "premium_only:schedule" });
  await assert.rejects(mock.saveOffer(null, { ...base, ends_at: plus(-30) }), { code: "invalid_dates" });
  await assert.rejects(mock.saveOffer(null, { ...base, discount_type: "kes", discount_value: 1000 }), { code: "invalid_discount" });
  await assert.rejects(mock.saveOffer(null, { ...base, item_ids: ["nope"] }), { code: "item_not_owned" });
  mock.resetPromoMock({ plan_key: "premium" });
  for (let n = 0; n < 12; n++) await mock.saveOffer(null, { ...base, title: `Deal ${n}` });
  assert.equal((await mock.getUsage()).activeOffers, 12);
});

test("mock enforces flash sale limits and read-only status", async () => {
  mock.resetPromoMock();
  const sale = { item_id: "i1", discount_type: "percent", discount_value: 20, ends_at: plus(60) };
  await mock.createFlash(sale);
  await assert.rejects(mock.createFlash({ ...sale, item_id: "i2" }), { code: "limit_reached:flash_sales_concurrent" });
  assert.deepEqual((await mock.getUsage()), { month: (await mock.getUsage()).month, activeOffers: 0, flashMonth: 1, flashRunning: 1, galleryPhotos: 0 });
  mock.resetPromoMock({ status: "paused" });
  await assert.rejects(mock.createFlash(sale), /row-level security/);
});

test("mock gallery: limit, undo, reorder, pairs", async () => {
  mock.resetPromoMock({ category_id: "barbershop" });
  const ids = [];
  for (let n = 0; n < 5; n++) ids.push((await mock.addGalleryPhoto({ blob: blob(), width: 800, height: 600 })).id);
  await assert.rejects(mock.addGalleryPhoto({ blob: blob(), width: 800, height: 600 }), { code: "limit_reached:gallery_photos" });
  await mock.softDeleteGallery([ids[4]]);
  await mock.addGalleryPhoto({ blob: blob(), width: 800, height: 600 });
  await assert.rejects(mock.restoreGallery([ids[4]]), { code: "limit_reached:gallery_photos" });
  const live = await mock.listGallery();
  await mock.reorderGallery(live.map((g) => g.id).reverse());
  assert.deepEqual((await mock.listGallery()).map((g) => g.id), live.map((g) => g.id).reverse());
  mock.resetPromoMock({ category_id: "gym-fitness" });
  await assert.rejects(mock.addGalleryPhoto({ blob: blob(), width: 1, height: 1, pairId: "p", pairRole: "before" }), { code: "pair_category" });
});

test("mock team: services and timetable are premium and trainers cannot overlap", async () => {
  mock.resetPromoMock({ category_id: "gym-fitness" });
  const slot = { day_of_week: 2, start_time: "07:00", end_time: "08:00", class_name: "HIIT" };
  await assert.rejects(mock.saveSlot(null, slot), { code: "premium_only:timetable" });
  await assert.rejects(mock.saveStaff(null, { name: "Ken", service_ids: ["i1"] }), { code: "premium_only:services" });
  mock.resetPromoMock({ category_id: "gym-fitness", plan_key: "premium" });
  const ken = await mock.saveStaff(null, { name: "Ken", role: "Trainer", specialties: ["hiit"], service_ids: ["i1"] });
  await mock.saveSlot(null, { ...slot, staff_id: ken.id });
  await assert.rejects(mock.saveSlot(null, { ...slot, start_time: "07:30", end_time: "08:30", staff_id: ken.id }), { code: "timetable_trainer_no_overlap" });
  await mock.saveSlot(null, { ...slot, start_time: "08:00", end_time: "09:00", staff_id: ken.id });
  await mock.saveSlot(null, { ...slot, start_time: "07:30", end_time: "08:30", staff_id: null });
  mock.resetPromoMock({ category_id: "bakery", plan_key: "premium" });
  await assert.rejects(mock.saveSlot(null, slot), { code: "timetable_category" });
});
