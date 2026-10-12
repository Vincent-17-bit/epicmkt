import { test } from "node:test";
import assert from "node:assert/strict";
import {
  limitsFor, teamCapabilities, canPair, eatMonthKey, offerStatus, flashStatus, moderation, isCountedOffer,
  formatCountdown, discountLabel, salePrice, validateOfferDraft, validateFlashDraft, checkFlashLimits, promoErrorMessage,
  slotsOverlap, findTrainerConflict, validateSlotDraft, validateStaffDraft, parseSpecialties, timetableByDay, toMinutes,
  qrUrl, shopUrl, displayUrl, defaultCaption, withLink, whatsappUrl, smsUrl, mailUrl, POSTER_SIZES,
} from "../index.js";

const NOW = Date.parse("2030-05-10T09:00:00Z");
const iso = (mins) => new Date(NOW + mins * 60000).toISOString();
const items = [{ id: "i1", price: 1000 }, { id: "i2", price: 3000 }, { id: "i3", price: null }];

test("plan limits come from the plan with server overrides", () => {
  assert.deepEqual(limitsFor("standard"), { galleryPhotos: 5, activeOffers: 8, flashSalesPerMonth: 3, flashSalesConcurrent: 1 });
  assert.deepEqual(limitsFor("premium"), { galleryPhotos: 20, activeOffers: null, flashSalesPerMonth: 10, flashSalesConcurrent: 5 });
  assert.equal(limitsFor("standard", { standard: { galleryPhotos: 7 } }).galleryPhotos, 7);
  assert.equal(limitsFor("weird").galleryPhotos, 5);
});

test("team capabilities follow plan and category", () => {
  assert.deepEqual(teamCapabilities("standard", "salon-beauty"), { staff: true, services: false, timetable: false, timetableCategory: true });
  assert.equal(teamCapabilities("premium", "gym-fitness").timetable, true);
  assert.equal(teamCapabilities("premium", "bakery").timetable, false);
  assert.equal(canPair("barbershop"), true);
  assert.equal(canPair("gym-fitness"), false);
});

test("months are counted in Africa/Nairobi", () => {
  assert.equal(eatMonthKey("2030-12-31T20:59:00Z"), "2030-12");
  assert.equal(eatMonthKey("2030-12-31T21:00:00Z"), "2031-01");
  assert.equal(eatMonthKey("2030-12-31T21:30:00Z"), "2031-01");
});

test("offer and flash statuses are computed from dates", () => {
  assert.equal(offerStatus({ starts_at: iso(60), ends_at: iso(120) }, NOW), "scheduled");
  assert.equal(offerStatus({ starts_at: iso(-60), ends_at: iso(120) }, NOW), "active");
  assert.equal(offerStatus({ starts_at: iso(-60), ends_at: iso(-1) }, NOW), "expired");
  assert.equal(offerStatus({ starts_at: iso(-60), ends_at: null }, NOW), "active");
  assert.equal(flashStatus({ starts_at: iso(10), ends_at: iso(20) }, NOW), "scheduled");
  assert.equal(flashStatus({ starts_at: iso(-10), ends_at: iso(20) }, NOW), "running");
  assert.equal(flashStatus({ starts_at: iso(-20), ends_at: iso(-10) }, NOW), "ended");
});

test("moderation shows removed and hidden with the reason", () => {
  assert.deepEqual(moderation({}), { state: "ok", reason: null });
  assert.deepEqual(moderation({ removed_by_admin: true, admin_reason: "Misleading" }), { state: "removed", reason: "Misleading" });
  assert.deepEqual(moderation({ admin_status: "removed", admin_reason: "Spam" }), { state: "removed", reason: "Spam" });
  assert.deepEqual(moderation({ hidden_by_admin: true, admin_hide_reason: "Under review" }), { state: "hidden", reason: "Under review" });
  assert.equal(isCountedOffer({ active: true, ends_at: iso(5), removed_by_admin: true }, NOW), false);
  assert.equal(isCountedOffer({ active: true, ends_at: iso(-5) }, NOW), false);
  assert.equal(isCountedOffer({ active: false, ends_at: iso(5) }, NOW), false);
  assert.equal(isCountedOffer({ active: true, ends_at: iso(5) }, NOW), true);
});

test("countdown, labels and sale prices", () => {
  assert.equal(formatCountdown(0), "Ended");
  assert.equal(formatCountdown(59 * 1000), "0m 59s");
  assert.equal(formatCountdown(3 * 60 * 60000 + 5 * 60000), "3h 05m");
  assert.equal(formatCountdown(2 * 86400000 + 4 * 3600000), "2d 4h");
  assert.equal(discountLabel("percent", 20), "20% off");
  assert.equal(discountLabel("kes", 1500), "KES 1,500 off");
  assert.equal(salePrice(1000, "percent", 25), 750);
  assert.equal(salePrice(1000, "kes", 250), 750);
  assert.equal(salePrice(null, "kes", 250), null);
});

const goodOffer = { title: "Weekend braids", discount_type: "percent", discount_value: 20, starts_at: iso(-1), ends_at: iso(600), item_ids: ["i1"] };

test("offer drafts: dates, discounts, scheduling and ownership", () => {
  const ctx = { plan: "standard", items, now: NOW };
  assert.deepEqual(validateOfferDraft(goodOffer, ctx), {});
  assert.ok(validateOfferDraft({ ...goodOffer, title: "ab" }, ctx).title);
  assert.ok(validateOfferDraft({ ...goodOffer, ends_at: goodOffer.starts_at }, ctx).ends_at);
  assert.ok(validateOfferDraft({ ...goodOffer, ends_at: iso(-30) }, ctx).ends_at);
  assert.ok(validateOfferDraft({ ...goodOffer, starts_at: "" }, ctx).starts_at);
  for (const v of [0, 91, 12.5, -3, ""]) assert.ok(validateOfferDraft({ ...goodOffer, discount_value: v }, ctx).discount_value, `percent ${v}`);
  for (const v of [1, 90]) assert.equal(validateOfferDraft({ ...goodOffer, discount_value: v }, ctx).discount_value, undefined);
  assert.ok(validateOfferDraft({ ...goodOffer, discount_type: "kes", discount_value: 1000 }, ctx).discount_value);
  assert.equal(validateOfferDraft({ ...goodOffer, discount_type: "kes", discount_value: 999 }, ctx).discount_value, undefined);
  assert.ok(validateOfferDraft({ ...goodOffer, discount_type: "kes", discount_value: 100, item_ids: ["i3"] }, ctx).discount_value);
  assert.ok(validateOfferDraft({ ...goodOffer, discount_type: "kes", discount_value: 1500, item_ids: ["i1", "i2"] }, ctx).discount_value);
  assert.ok(validateOfferDraft({ ...goodOffer, item_ids: ["zz"] }, ctx).item_ids);
  const future = { ...goodOffer, starts_at: iso(60 * 24), ends_at: iso(60 * 48) };
  assert.ok(validateOfferDraft(future, ctx).starts_at);
  assert.equal(validateOfferDraft(future, { ...ctx, plan: "premium" }).starts_at, undefined);
});

test("flash drafts validate item, discount and dates", () => {
  const ctx = { items, now: NOW };
  const good = { item_id: "i1", discount_type: "percent", discount_value: 30, ends_at: iso(120) };
  assert.deepEqual(validateFlashDraft(good, ctx), {});
  assert.ok(validateFlashDraft({ ...good, item_id: "nope" }, ctx).item_id);
  assert.ok(validateFlashDraft({ ...good, ends_at: iso(-5) }, ctx).ends_at);
  assert.ok(validateFlashDraft({ ...good, starts_at: iso(60), ends_at: iso(30) }, ctx).ends_at);
  assert.ok(validateFlashDraft({ ...good, starts_at: iso(-60) }, ctx).starts_at);
  assert.ok(validateFlashDraft({ ...good, discount_type: "kes", discount_value: 1000 }, ctx).discount_value);
  assert.ok(validateFlashDraft({ ...good, item_id: "i3", discount_type: "kes", discount_value: 5 }, ctx).discount_value);
  assert.ok(validateFlashDraft({ ...good, discount_value: 95 }, ctx).discount_value);
});

test("flash limits mirror the database: per month in EAT and concurrent peak", () => {
  const sale = (id, a, b) => ({ id, starts_at: a, ends_at: b });
  const std = { plan: "standard" };
  assert.equal(checkFlashLimits([sale(1, iso(-5), iso(60))], { id: 9, starts_at: iso(10), ends_at: iso(30) }, std), "limit_reached:flash_sales_concurrent");
  assert.equal(checkFlashLimits([sale(1, iso(-5), iso(60))], { id: 9, starts_at: iso(60), ends_at: iso(90) }, std), null);
  assert.equal(checkFlashLimits([sale(1, iso(100), iso(120))], { id: 9, starts_at: iso(90), ends_at: iso(110) }, std), "limit_reached:flash_sales_concurrent");

  const dec = (h, m) => `2030-12-31T${String(h - 3).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;
  const three = [sale(1, dec(22, 0), dec(22, 10)), sale(2, dec(22, 20), dec(22, 30)), sale(3, dec(23, 30), dec(23, 40))];
  assert.equal(checkFlashLimits(three, { id: 4, starts_at: dec(23, 50), ends_at: dec(23, 55) }, std), "limit_reached:flash_sales_month");
  assert.equal(checkFlashLimits(three, { id: 4, starts_at: "2030-12-31T21:30:00Z", ends_at: "2030-12-31T21:50:00Z" }, std), null);

  const five = [1, 2, 3, 4, 5].map((n) => sale(n, iso(0), iso(120)));
  assert.equal(checkFlashLimits(five, { id: 6, starts_at: iso(30), ends_at: iso(60) }, { plan: "premium" }), "limit_reached:flash_sales_concurrent");
  assert.equal(checkFlashLimits(five.slice(0, 4), { id: 6, starts_at: iso(30), ends_at: iso(60) }, { plan: "premium" }), null);
  const ten = Array.from({ length: 10 }, (_, n) => sale(n, iso(n * 100), iso(n * 100 + 10)));
  assert.equal(checkFlashLimits(ten, { id: 99, starts_at: iso(2000), ends_at: iso(2010) }, { plan: "premium" }), "limit_reached:flash_sales_month");
  const removed = ten.map((s, n) => (n === 0 ? { ...s, removed_by_admin: true } : s));
  assert.equal(checkFlashLimits(removed, { id: 99, starts_at: iso(2000), ends_at: iso(2010) }, { plan: "premium" }), null);
});

test("error messages are friendly and plan aware", () => {
  assert.match(promoErrorMessage({ message: "limit_reached:offers" }, "standard"), /8 active offers/);
  assert.match(promoErrorMessage({ message: "limit_reached:flash_sales_concurrent" }, "standard"), /1 flash sale at a time/);
  assert.match(promoErrorMessage({ message: "limit_reached:flash_sales_concurrent" }, "premium"), /5 flash sales at a time/);
  assert.match(promoErrorMessage({ message: "limit_reached:gallery_photos" }, "premium"), /20 gallery photos/);
  assert.match(promoErrorMessage({ message: 'conflicting key value violates exclusion constraint "timetable_trainer_no_overlap"' }), /already has a class/);
  assert.match(promoErrorMessage({ message: "invalid_discount:kes_not_below_price" }), /less than the item price/);
  assert.match(promoErrorMessage({ message: 'new row violates row-level security policy for table "offers"' }), /read-only/);
  assert.match(promoErrorMessage(new Error("boom")), /Something went wrong/);
});

test("timetable overlap per trainer", () => {
  const a = { id: "a", day_of_week: 2, start_time: "07:00:00", end_time: "08:00:00", staff_id: "t1", class_name: "HIIT" };
  assert.equal(toMinutes("07:30:00"), 450);
  assert.equal(slotsOverlap(a, { ...a, id: "b", start_time: "07:30", end_time: "08:30" }), true);
  assert.equal(slotsOverlap(a, { ...a, id: "b", start_time: "08:00", end_time: "09:00" }), false);
  assert.equal(slotsOverlap(a, { ...a, id: "b", day_of_week: 3 }), false);
  assert.equal(findTrainerConflict([a], { id: "n", day_of_week: 2, start_time: "06:30", end_time: "07:01", staff_id: "t1" }).id, "a");
  assert.equal(findTrainerConflict([a], { id: "n", day_of_week: 2, start_time: "07:30", end_time: "08:30", staff_id: "t2" }), null);
  assert.equal(findTrainerConflict([a], { id: "n", day_of_week: 2, start_time: "07:30", end_time: "08:30", staff_id: null }), null);
  assert.equal(findTrainerConflict([a], { id: "a", day_of_week: 2, start_time: "07:15", end_time: "07:45", staff_id: "t1" }), null);
  const staff = [{ id: "t1", name: "Ken" }];
  assert.ok(validateSlotDraft({ class_name: "Y", day_of_week: 2, start_time: "07:00", end_time: "08:00" }, [], staff).class_name);
  assert.ok(validateSlotDraft({ class_name: "Yoga", day_of_week: 2, start_time: "08:00", end_time: "07:00" }, [], staff).end_time);
  assert.ok(validateSlotDraft({ class_name: "Yoga", day_of_week: 2, start_time: "07:30", end_time: "08:30", staff_id: "t1" }, [a], staff).staff_id);
  assert.deepEqual(validateSlotDraft({ class_name: "Yoga", day_of_week: 2, start_time: "08:00", end_time: "09:00", staff_id: "t1" }, [a], staff), {});
  const grid = timetableByDay([a, { ...a, id: "c", start_time: "06:00", end_time: "06:30", class_name: "Run" }], staff);
  assert.equal(grid.length, 7);
  assert.deepEqual(grid[1].slots.map((s) => [s.class_name, s.trainer]), [["Run", "Ken"], ["HIIT", "Ken"]]);
});

test("staff drafts", () => {
  assert.deepEqual(validateStaffDraft({ name: "Amina", role: "Stylist", specialties: ["braids"] }), {});
  assert.ok(validateStaffDraft({ name: "A" }).name);
  assert.ok(validateStaffDraft({ name: "Amina", specialties: new Array(11).fill("x") }).specialties);
  assert.deepEqual(parseSpecialties(" braids, locs ,braids,, "), ["braids", "locs"]);
});

test("QR link, share links and poster sizes", () => {
  assert.equal(qrUrl("https://epicmkt.co.ke/", "salon-prem"), "https://epicmkt.co.ke/s/salon-prem?src=qr");
  assert.equal(shopUrl("https://epicmkt.co.ke", "a b"), "https://epicmkt.co.ke/s/a%20b");
  assert.equal(qrUrl("", "x"), "https://epicmkt.co.ke/s/x?src=qr");
  assert.equal(displayUrl("https://epicmkt.co.ke", "x"), "epicmkt.co.ke/s/x");
  const link = shopUrl("https://epicmkt.co.ke", "x");
  const text = defaultCaption("Salon X", link);
  assert.match(text, /Visit Salon X on EpicMKT/);
  assert.equal(withLink("Come by!", link), `Come by! ${link}`);
  assert.equal(withLink(text, link), text);
  assert.equal(whatsappUrl("a b&c"), "https://wa.me/?text=a%20b%26c");
  assert.equal(smsUrl("a b"), "sms:?body=a%20b");
  assert.equal(mailUrl("Hi", "a b"), "mailto:?subject=Hi&body=a%20b");
  assert.deepEqual(POSTER_SIZES.A4.px.map((p, i) => Math.round((p / 300) * 25.4) - POSTER_SIZES.A4.mm[i]), [0, 0]);
  assert.deepEqual(POSTER_SIZES.A5.px.map((p, i) => Math.round((p / 300) * 25.4) - POSTER_SIZES.A5.mm[i]), [0, 0]);
});
