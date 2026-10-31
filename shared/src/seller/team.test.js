import { test } from "node:test";
import assert from "node:assert/strict";
import { limitsFor, planOf, teamCapabilities, canPair } from "./limits.js";
import { findTrainerConflict, parseSpecialties, slotsOverlap, timetableByDay, toMinutes, validateSlotDraft, validateStaffDraft } from "./team.js";
import { galleryImageId, isCloudinaryId, ownsImageId, staffImageId } from "./images.js";

const slot = (id, day, a, b, staff = "t1") => ({ id, day_of_week: day, start_time: a, end_time: b, staff_id: staff, class_name: "Spin" });

test("plan limits fall back to defaults and take server overrides", () => {
  assert.equal(limitsFor("standard", null).galleryPhotos, 5);
  assert.equal(limitsFor("premium", null).galleryPhotos, 20);
  assert.equal(limitsFor("premium", { premium: { galleryPhotos: 30 } }).galleryPhotos, 30);
  assert.equal(planOf("anything"), "standard");
});

test("team features follow plan and category", () => {
  assert.deepEqual(teamCapabilities("standard", "gym-fitness"), { staff: true, services: false, timetable: false, timetableCategory: true });
  assert.deepEqual(teamCapabilities("premium", "gym-fitness"), { staff: true, services: true, timetable: true, timetableCategory: true });
  assert.equal(teamCapabilities("premium", "kiosk").timetable, false);
  assert.equal(canPair("barbershop"), true);
  assert.equal(canPair("kiosk"), false);
});

test("a trainer cannot teach two classes at once, but back to back and other days are fine", () => {
  assert.equal(toMinutes("09:30"), 570);
  assert.equal(slotsOverlap(slot("a", 1, "09:00", "10:00"), slot("b", 1, "10:00", "11:00")), false);
  assert.equal(slotsOverlap(slot("a", 1, "09:00", "10:00"), slot("b", 1, "09:59", "11:00")), true);
  assert.equal(slotsOverlap(slot("a", 1, "09:00", "10:00"), slot("b", 2, "09:00", "10:00")), false);
  const have = [slot("a", 1, "09:00", "10:00")];
  assert.equal(findTrainerConflict(have, slot("b", 1, "09:30", "10:30"))?.id, "a");
  assert.equal(findTrainerConflict(have, slot("a", 1, "09:30", "10:30")), null);
  assert.equal(findTrainerConflict(have, slot("b", 1, "09:30", "10:30", null)), null);
});

test("slot and staff drafts are validated", () => {
  const staff = [{ id: "t1", name: "Ken" }];
  assert.deepEqual(validateSlotDraft(slot("n", 1, "09:00", "10:00"), [], staff), {});
  assert.equal(validateSlotDraft({ ...slot("n", 1, "10:00", "09:00") }, [], staff).end_time, "End must be after the start");
  assert.equal(validateSlotDraft({ ...slot("n", 1, "09:00", "10:00"), class_name: "x" }, [], staff).class_name, "Class name needs 2 to 80 characters");
  assert.equal(validateSlotDraft({ ...slot("n", 1, "09:00", "10:00"), staff_id: "zz" }, [], staff).staff_id, "Choose a trainer from your team");
  assert.match(validateSlotDraft(slot("n", 1, "09:30", "10:30"), [slot("a", 1, "09:00", "10:00")], staff).staff_id, /already has a class/);
  assert.equal(validateStaffDraft({ name: "A" }).name, "Needs 2 to 80 characters".replace("Needs", "Name needs"));
  assert.deepEqual(validateStaffDraft({ name: "Amina", specialties: ["fade"] }), {});
  assert.deepEqual(parseSpecialties("fade, beard, fade,, "), ["fade", "beard"]);
});

test("the weekly timetable is grouped by day in time order with trainer names", () => {
  const days = timetableByDay([slot("b", 2, "11:00", "12:00"), slot("a", 2, "08:00", "09:00"), slot("c", 1, "07:00", "08:00", null)], [{ id: "t1", name: "Ken" }]);
  assert.equal(days.length, 7);
  assert.deepEqual(days[1].slots.map((s) => [s.id, s.trainer]), [["a", "Ken"], ["b", "Ken"]]);
  assert.equal(days[0].slots[0].trainer, null);
});

test("gallery and team picture ids sit in the shop's own folder and are Cloudinary ids", () => {
  const biz = "10000000-0000-4000-8000-0000000000a1";
  const g = galleryImageId(biz, "u1");
  const s = staffImageId(biz, "u2");
  assert.equal(g, `${biz}/gallery/u1`);
  assert.equal(s, `${biz}/staff/u2`);
  assert.equal(isCloudinaryId(g) && isCloudinaryId(s), true);
  assert.equal(ownsImageId(biz, g), true);
  assert.equal(ownsImageId("other", g), false);
});
