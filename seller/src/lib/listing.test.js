import { describe, expect, it } from "vitest";
import { banner, canOpen, daysLeft, highlightSubscription, isLocked, listingState } from "./listing.js";
import { businessReadiness } from "./readiness.js";
import { todaySentences } from "./today.js";

const now = new Date("2026-10-10T09:00:00+03:00");
const biz = (over) => ({ status: "live", paid_until: "2026-10-20", ...over });

describe("listingState", () => {
  it.each([
    [biz({}), "live"],
    [biz({ paid_until: "2026-10-10" }), "live"],
    [biz({ paid_until: "2026-10-09" }), "grace"],
    [biz({ paid_until: "2026-10-08" }), "expired"],
    [biz({ status: "paused" }), "paused"],
    [biz({ status: "suspended" }), "suspended"],
    [biz({ status: "pending", paid_until: null }), "unlisted"],
    [biz({ unlisted: true }), "unlisted"],
    [biz({ status: "deleted" }), "deleted"],
    [biz({ paid_until: null }), "unlisted"]
  ])("%j is %s", (business, expected) => {
    expect(listingState(business, now)).toBe(expected);
  });

  it("counts days in Nairobi time", () => {
    expect(daysLeft("2026-10-15", now)).toBe(5);
    expect(daysLeft("2026-10-10T20:59:00Z", new Date("2026-10-10T20:59:00Z"))).toBe(0);
    expect(daysLeft("2026-10-10T20:59:00Z", new Date("2026-10-10T21:00:00Z"))).toBe(-1);
  });
});

describe("guards", () => {
  it("locks only suspended and unlisted, leaving three routes open", () => {
    expect(isLocked("suspended")).toBe(true);
    expect(isLocked("unlisted")).toBe(true);
    ["live", "grace", "expired", "paused"].forEach((s) => expect(isLocked(s)).toBe(false));
    ["/subscription", "/notifications", "/help"].forEach((p) => expect(canOpen("suspended", p)).toBe(true));
    ["/", "/catalog", "/account", "/offers", "/settings"].forEach((p) => expect(canOpen("unlisted", p)).toBe(false));
    expect(canOpen("expired", "/catalog")).toBe(true);
  });

  it("raises banners at 7 and 3 days, in grace, expired and paused", () => {
    expect(banner("live", 8)).toBeNull();
    expect(banner("live", 7)).toMatchObject({ tone: "notice" });
    expect(banner("live", 4)).toMatchObject({ tone: "notice" });
    expect(banner("live", 3)).toMatchObject({ tone: "urgent" });
    expect(banner("live", 0).title).toMatch(/today/);
    expect(banner("grace", -1)).toMatchObject({ tone: "urgent", action: { label: "Renew" } });
    expect(banner("expired", -5).text).toMatch(/hidden|cannot see/i);
    expect(banner("paused", 10).action).toMatchObject({ label: "Resume", resume: true });
    expect(banner("suspended", 10)).toBeNull();
  });

  it("highlights Subscription for grace and expired only", () => {
    expect(highlightSubscription("grace")).toBe(true);
    expect(highlightSubscription("expired")).toBe(true);
    expect(highlightSubscription("live")).toBe(false);
  });
});

describe("businessReadiness", () => {
  const full = { phone: "+254712345678", town: "Kisumu", lat: 1, lng: 2, hours: { mon: ["08:00", "17:00"] }, logo_path: "l", cover_path: "c", tagline: "t", description: "d", whatsapp: "w", payment_methods: ["mpesa"] };

  it("splits blocking from recommended and scores them", () => {
    const empty = businessReadiness({ plan_key: "standard" }, { catalog: { total: 0 } });
    expect(empty.blocking.map((x) => x.key)).toEqual(["phone", "location", "hours", "item"]);
    expect(empty.score).toBe(0);
    const done = businessReadiness(full, { catalog: { total: 3, without_photo: 0 }, usage: { faqs: 1 } });
    expect(done.blocking).toEqual([]);
    expect(done.recommended).toEqual([]);
    expect(done.score).toBe(100);
  });

  it("weighs blocking items more and asks premium sellers for socials", () => {
    const partial = businessReadiness(full, { catalog: { total: 0 } });
    expect(partial.blocking.map((x) => x.key)).toEqual(["item"]);
    const premium = businessReadiness({ ...full, plan_key: "premium", socials: {} }, { catalog: { total: 1, without_photo: 1 }, usage: { faqs: 0 } });
    expect(premium.recommended.map((x) => x.key)).toEqual(expect.arrayContaining(["socials", "photos", "faq"]));
  });
});

describe("todaySentences", () => {
  it("builds rule-based sentences and stays empty when nothing needs attention", () => {
    expect(todaySentences({ catalog: {}, notifications: [], questions: [], left: 20, state: "live" })).toEqual([]);
    const out = todaySentences({ catalog: { out_of_stock: 2, stale_prices: 1 }, notifications: [{ read: false }], questions: [{}], left: 5, state: "live" });
    expect(out).toEqual([
      "Your listing expires in 5 days.",
      "1 question from the EpicMKT team is waiting for your reply.",
      "2 items are out of stock.",
      "1 price has not been confirmed in 90 days.",
      "You have 1 unread notification."
    ]);
  });
});
