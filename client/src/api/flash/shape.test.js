import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businessOf, cardOfBusiness, cardOfFlash, itemOf } from "./shape.js";
import { hoursCaption, hoursRows, statusText } from "../../lib/businessView.js";
import { toSummary } from "../browse/engine.js";
import { setUserTimeZone } from "@epicmkt/shared";

// Tue 20 Oct 2026, 09:30 in Nairobi (UTC+3).
beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-20T06:30:00Z") }));
afterEach(() => vi.useRealTimers());

const hours = { mon: ["08:00", "18:00"], tue: ["08:00", "18:00"], wed: ["08:00", "18:00"], sat: ["09:00", "13:00"] };
const row = (over = {}) => ({ id: "b1", slug: "shop", name: "Shop", category_id: "barber", plan_key: "standard", hours, exceptions: [], lat: 0, lng: 0, ...over });
const closedToday = { id: "e1", date: "2026-10-20", kind: "closed", intervals: [], note: "Holiday" };

describe("customer business shape with opening-hours exceptions", () => {
  it("uses the weekly hours when there are no exceptions, or the column is missing", () => {
    for (const exceptions of [[], undefined, null]) {
      const b = businessOf(row({ exceptions }), { category: null, services: [] });
      expect(b.isOpen).toBe(true);
      expect(b.closesAt).toBe("18:00");
      expect(b.exceptions).toEqual([]);
    }
  });

  it("a closed exception makes today closed and moves 'opens at' to the next day", () => {
    const b = businessOf(row({ exceptions: [closedToday] }), { category: null, services: [] });
    expect(b.isOpen).toBe(false);
    expect(b.closesAt).toBeNull();
    expect(b.opensAt).toEqual({ day: "wed", time: "08:00", date: "2026-10-21" });
  });

  it("special hours open the shop only inside the intervals", () => {
    const special = { id: "e2", date: "2026-10-20", kind: "special", intervals: [["14:00", "16:00"]], note: null };
    const b = businessOf(row({ exceptions: [special] }), { category: null, services: [] });
    expect(b.isOpen).toBe(false);
    expect(b.opensAt).toEqual({ day: "tue", time: "14:00", date: "2026-10-20" });
  });

  it("business cards and flash cards agree with the page", () => {
    expect(cardOfBusiness(row({ exceptions: [closedToday] })).isOpen).toBe(false);
    expect(cardOfBusiness(row()).isOpen).toBe(true);
    const flash = (exceptions) => cardOfFlash({ business_id: "b1", business_hours: hours, business_exceptions: exceptions });
    expect(flash([closedToday]).isOpen).toBe(false);
    expect(flash(undefined).isOpen).toBe(true);
  });

  it("the hours table shows the exception for its date and leaves the other days alone", () => {
    const rows = hoursRows(hours, [closedToday]);
    const tuesday = rows.find((r) => r.day === "tue");
    expect(tuesday).toMatchObject({ today: true, text: "Closed", changed: true, date: "2026-10-20" });
    expect(rows.find((r) => r.day === "wed")).toMatchObject({ text: "8:00 AM to 6:00 PM", changed: false });
    expect(rows.map((r) => r.day)).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});

describe("customer item shape with videos", () => {
  it("turns video paths into video entries, apart from the images, and tolerates none", () => {
    const item = itemOf({ id: "i1", name: "Reel item", imagePaths: ["a/photo.webp"], videoPaths: ["a/first.webm", "a/second.mp4"] });
    expect(item.images).toHaveLength(1);
    expect(item.videos.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(item.videos[0]).toMatchObject({ caption: "Reel item" });
    expect(item.videos[0].url).toMatch(/seller-media\/a\/first\.webm$/);
    for (const videoPaths of [undefined, null, []]) expect(itemOf({ id: "i2", name: "Plain", videoPaths }).videos).toEqual([]);
  });
});

describe("customer item media: one sequence, plus images[] and videos[] for older code", () => {
  const mediaPaths = [
    { path: "a/v1.mp4", kind: "video", duration: 9 },
    { path: "a/p1.webp", kind: "image", duration: null },
    { path: "a/p2.webp", kind: "image", duration: null },
    { path: "a/v2.webm", kind: "video", duration: 4 },
  ];
  const item = itemOf({ id: "i1", name: "Reel item", imagePaths: ["a/p1.webp", "a/p2.webp"], videoPaths: ["a/v1.mp4", "a/v2.webm"], mediaPaths });

  it("lists photos and videos in the seller's order, with ids that match images[] and videos[]", () => {
    expect(item.media.map((m) => [m.id, m.kind])).toEqual([["v1", "video"], ["i1", "image"], ["i2", "image"], ["v2", "video"]]);
    expect(item.media.map((m) => m.url.split("/").pop())).toEqual(["v1.mp4", "p1.webp", "p2.webp", "v2.webm"]);
    expect(item.media.every((m) => m.caption === "Reel item")).toBe(true);
    for (const m of item.media) expect(m).not.toHaveProperty("poster");
    for (const v of item.videos) expect(item.media.find((m) => m.id === v.id).url).toBe(v.url);
    for (const i of item.images) expect(item.media.find((m) => m.id === i.id).url).toBe(i.url);
  });

  it("keeps images and videos and takes the cover from the first photo, never from a video first in the sequence", () => {
    expect(item.images.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(item.videos.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(item.imageUrl).toBe(item.images[0].url);
    expect(item.media[0].kind).toBe("video");
  });

  it("falls back to photos then videos when the database sends no media list, and tolerates junk", () => {
    const old = itemOf({ id: "i2", name: "Old", imagePaths: ["a/p1.webp"], videoPaths: ["a/v1.mp4"] });
    expect(old.media.map((m) => [m.id, m.kind])).toEqual([["i1", "image"], ["v1", "video"]]);
    expect(itemOf({ id: "i3", name: "Bare" }).media).toEqual([]);
    expect(itemOf({ id: "i4", name: "Odd", mediaPaths: [null, { path: "", kind: "image" }, { path: "a/x", kind: "pdf" }, { path: "a/ok.webp", kind: "image" }] }).media.map((m) => m.id)).toEqual(["i1"]);
  });
});

describe("customer item shape with product details", () => {
  const base = { id: "i1", name: "Kettle", description: "A kettle." };

  it("keeps title and text highlights from the database and drops malformed ones", () => {
    const item = itemOf({
      ...base,
      highlights: [{ title: " Fast ", text: " Boils in 2 min " }, { text: "No title" }, { title: "No text" }, { title: 3, text: "Bad title" }, "Plain", 7, null, { text: "  " }]
    });
    expect(item.highlights).toEqual([{ title: "Fast", text: "Boils in 2 min" }, { text: "No title" }, { text: "Bad title" }, "Plain"]);
  });

  it("an item without the new fields has the defaults", () => {
    const item = itemOf(base);
    expect(item).toMatchObject({ brand: null, highlights: [], includes: [], terms: "", packSize: null, specs: [], shortDescription: "A kettle." });
  });

  it("maps the real values", () => {
    const item = itemOf({
      ...base,
      shortDescription: "Boils fast",
      brand: "Acme",
      highlights: ["1.7 L", "Auto shut-off"],
      includes: ["Base"],
      terms: "6 month warranty",
      packSize: "1 piece",
      specs: [{ label: "Power", value: "2200 W", group: "Electrical" }, { label: "Colour", value: "Steel" }]
    });
    expect(item).toMatchObject({ brand: "Acme", shortDescription: "Boils fast", highlights: ["1.7 L", "Auto shut-off"], includes: ["Base"], terms: "6 month warranty", packSize: "1 piece" });
    expect(item.specs).toEqual([{ label: "Power", value: "2200 W", group: "Electrical" }, { label: "Colour", value: "Steel" }]);
  });

  it("falls back to the shortened description when there is no short description", () => {
    const long = `${"word ".repeat(60)}end`;
    expect(itemOf({ ...base, description: long, shortDescription: "  " }).shortDescription.length).toBeLessThanOrEqual(141);
  });

  it("uses the empty default for any value of the wrong type and never throws", () => {
    const item = itemOf({ ...base, shortDescription: 5, brand: {}, highlights: "fast", includes: { a: 1 }, terms: 7, packSize: ["x"], specs: "none" });
    expect(item).toMatchObject({ brand: null, highlights: [], includes: [], terms: "", packSize: null, specs: [], shortDescription: "A kettle." });
    expect(itemOf({ ...base, description: 42, specs: [null, 3, { label: 4 }, { label: "A", value: {} }, { label: "B", value: 9 }], highlights: ["ok", 1, null] })).toMatchObject({
      specs: [{ label: "B", value: "9" }],
      highlights: ["ok"]
    });
  });

  it("business shape carries a product count that defaults to 0", () => {
    expect(businessOf(row(), { category: null, services: [] }).productCount).toBe(0);
    expect(businessOf(row({ product_count: 12 }), { category: null, services: [] }).productCount).toBe(12);
    expect(businessOf(row({ product_count: "x" }), { category: null, services: [] }).productCount).toBe(0);
    expect(businessOf(row(), { category: null }).productCount).toBe(0);
    expect(businessOf(row(), { category: null, services: [{}, {}] }).productCount).toBe(2);
  });
});

describe("customer business shape for a shop outside Nairobi", () => {
  const sanJuan = "America/Puerto_Rico";
  beforeEach(() => setUserTimeZone("Africa/Nairobi"));
  afterEach(() => setUserTimeZone(null));

  it("keeps the shop's zone and uses it in the badge, hours caption and banner", () => {
    const b = businessOf(row({ timezone: sanJuan }), { category: null, services: [] });
    expect(b.timezone).toBe(sanJuan);
    expect(b.isOpen).toBe(false);
    expect(statusText(b)).toBe("Closed · Opens 8:00 AM GMT-4 · 3:00 PM your time");
    expect(hoursCaption(b.timezone)).toBe("Hours are in shop time (GMT-4). Your time is shown too.");
    expect(b.openStatus.reopens).toBe("Reopens today at 8:00 AM GMT-4 · 3:00 PM your time");
  });

  it("reads today's hours on the shop's calendar day", () => {
    vi.setSystemTime(new Date("2026-10-20T22:30:00Z"));
    const b = businessOf(row({ timezone: sanJuan }), { category: null, services: [] });
    expect(b.todayHours).toBe(hours.tue);
  });

  it("falls back to Nairobi when the shop has no zone", () => {
    expect(businessOf(row(), { category: null, services: [] }).timezone).toBe("Africa/Nairobi");
  });

  it("business summaries carry the zone", () => {
    const b = { id: "b1", slug: "shop", name: "Shop", categoryId: "barber", hours, exceptions: [], timezone: sanJuan, tags: [], attributes: {}, flashEnds: [], offerEnds: [] };
    const snap = { categories: new Map() };
    expect(toSummary(b, snap, null, Date.now()).timezone).toBe(sanJuan);
  });
});

describe("customer gallery, team, timetable and shop settings", () => {
  it("maps photos with before and after labels, dropping any without a picture", async () => {
    const { galleryOf } = await import("./shape.js");
    const out = galleryOf([
      { id: "1", path: "biz/gallery/a.webp", caption: "Fade", pair_id: "p", pair_role: "before" },
      { id: "2", path: "biz/gallery/b.webp", caption: null, pair_id: "p", pair_role: "after" },
      { id: "3", path: null, caption: "Broken" },
      { id: "4", path: "biz/gallery/c.webp", caption: null }
    ]);
    expect(out.map((p) => [p.id, p.caption, p.pairRole])).toEqual([["1", "Fade · Before", "before"], ["2", "After", "after"], ["4", "Shop photo", null]]);
  });

  it("links team members to service names and timetable slots to trainers", async () => {
    const { teamOf, timetableOf } = await import("./shape.js");
    const team = teamOf([{ id: "t1", name: "Ken", role: "Coach", specialties: ["spin"], photo_path: null, item_ids: ["s1", "gone"] }], [{ id: "s1", name: "Spin class" }]);
    expect(team).toEqual([{ id: "t1", name: "Ken", role: "Coach", specialties: ["spin"], photoUrl: null, services: ["Spin class"] }]);
    expect(timetableOf([{ id: "x", day_of_week: 2, start_time: "07:00:00", end_time: "08:00:00", class_name: "Spin", staff_id: "t1" }, { id: "y", day_of_week: 3, start_time: "09:00", end_time: "10:00", class_name: "Yoga", staff_id: null }], team))
      .toEqual([{ id: "x", day: 2, start: "07:00", end: "08:00", name: "Spin", trainer: "Ken" }, { id: "y", day: 3, start: "09:00", end: "10:00", name: "Yoga", trainer: null }]);
  });

  it("reads the seller's shop settings and falls back to defaults when they are missing", async () => {
    const { shopSettingsOf } = await import("./shape.js");
    expect(shopSettingsOf(null)).toEqual({ whatsappGreeting: null, showClosesChip: true, partialClosureMessage: null });
    expect(shopSettingsOf({ whatsapp_greeting: "Hi {item}", show_closes_chip: false, partial_closure_message: "Some items are out." }))
      .toEqual({ whatsappGreeting: "Hi {item}", showClosesChip: false, partialClosureMessage: "Some items are out." });
  });
});
