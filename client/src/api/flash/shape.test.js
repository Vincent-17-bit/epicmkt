import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { businessOf, cardOfBusiness, cardOfFlash, itemOf } from "./shape.js";
import { hoursRows } from "../../lib/businessView.js";

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
