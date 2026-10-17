import { describe, expect, it } from "vitest";
import { buildPlanRows, planHeader, startingPrice } from "@epicmkt/shared/plans";
import { couponSchema, limitsSchema, planPairSchema, validate } from "./schema.js";
import { describeImpact } from "./impact.js";

const plan = (o = {}) => ({ price: 300, items: 15, topBenefits: ["a", "b", "c"], badge: null, trialDays: 0, ...o });
const pair = (s = {}, p = {}) => ({ standard: plan(s), premium: plan({ price: 800, items: 40, ...p }) });

describe("plan validation", () => {
  it("accepts a valid pair and coerces text inputs", () => {
    const r = validate(planPairSchema, pair({ price: "300", items: "15" }));
    expect(r.ok).toBe(true);
    expect(r.data.standard.price).toBe(300);
  });
  it("rejects empty, fractional and out-of-range prices", () => {
    expect(validate(planPairSchema, pair({ price: "" })).errors["standard.price"]).toBeTruthy();
    expect(validate(planPairSchema, pair({ price: "10.5" })).errors["standard.price"]).toMatch(/whole/);
    expect(validate(planPairSchema, pair({}, { price: 100001 })).errors["premium.price"]).toBeTruthy();
  });
  it("allows a free plan", () => {
    expect(validate(planPairSchema, pair({ price: 0 }, { price: 0 })).ok).toBe(true);
  });
  it("needs exactly three benefits, each 1 to 80 characters", () => {
    expect(validate(planPairSchema, pair({ topBenefits: ["a", "b"] })).ok).toBe(false);
    expect(validate(planPairSchema, pair({ topBenefits: ["a", "", "c"] })).errors["standard.topBenefits.1"]).toBeTruthy();
    expect(validate(planPairSchema, pair({ topBenefits: ["a", "x".repeat(81), "c"] })).errors["standard.topBenefits.1"]).toMatch(/80/);
  });
  it("keeps Premium at or above Standard", () => {
    expect(validate(planPairSchema, pair({ price: 900 }, { price: 800 })).errors["premium.price"]).toMatch(/less/);
    expect(validate(planPairSchema, pair({ items: 50 }, { items: 40 })).errors["premium.items"]).toBeTruthy();
  });
  it("limits trial days to 0 to 90 and badges to the allowed set", () => {
    expect(validate(planPairSchema, pair({ trialDays: 91 })).ok).toBe(false);
    expect(validate(planPairSchema, pair({ badge: "Cheap" })).ok).toBe(false);
    expect(validate(planPairSchema, pair({ badge: "Popular", trialDays: 14 })).ok).toBe(true);
  });
});

describe("global limits and coupons", () => {
  const g = (o = {}) => ({ photosPerItem: 7, videosPerItem: 1, galleryPhotos: 5, faqs: 5, activeOffers: 8, flashSalesPerMonth: 3, flashSalesConcurrent: 1, ...o });
  it("allows unlimited offers only for activeOffers and keeps Premium >= Standard", () => {
    expect(validate(limitsSchema, { standard: g(), premium: g({ photosPerItem: 15, activeOffers: null }) }).ok).toBe(true);
    expect(validate(limitsSchema, { standard: g({ faqs: null }), premium: g() }).ok).toBe(false);
    expect(validate(limitsSchema, { standard: g(), premium: g({ faqs: 4 }) }).errors["premium.faqs"]).toBeTruthy();
  });
  const coupon = (o = {}) => ({ code: "launch-10", kind: "percent", value: 10, scopeCategory: null, scopePlan: null, validFrom: null, validUntil: null, maxRedemptions: null, active: true, ...o });
  it("upper-cases codes and checks percent, dates and format", () => {
    expect(validate(couponSchema, coupon()).data.code).toBe("LAUNCH-10");
    expect(validate(couponSchema, coupon({ value: 101 })).errors.value).toBeTruthy();
    expect(validate(couponSchema, coupon({ kind: "fixed", value: 500 })).ok).toBe(true);
    expect(validate(couponSchema, coupon({ code: "no spaces" })).errors.code).toBeTruthy();
    expect(validate(couponSchema, coupon({ validFrom: "2026-11-02", validUntil: "2026-11-01" })).errors.validUntil).toBeTruthy();
  });
});

describe("who is affected", () => {
  const stats = { liveBusinesses: 12, inProgressApplications: 2 };
  it("returns nothing when nothing changed", () => {
    expect(describeImpact({ planKey: "standard", before: plan(), after: plan(), stats })).toEqual([]);
  });
  it("explains price changes with live counts", () => {
    const [line] = describeImpact({ planKey: "standard", before: plan(), after: plan({ price: 400 }), stats });
    expect(line).toMatch(/KSh 300 to KSh 400/);
    expect(line).toMatch(/12 live Standard businesses keep/);
    expect(line).toMatch(/2 applications in progress keep/);
  });
  it("says nothing is deleted when the item limit drops", () => {
    const [line] = describeImpact({ planKey: "premium", before: plan({ items: 40 }), after: plan({ items: 30 }), stats });
    expect(line).toMatch(/nothing is deleted/i);
  });
  it("uses singular wording for one business", () => {
    const [line] = describeImpact({ planKey: "standard", before: plan(), after: plan({ price: 350 }), stats: { liveBusinesses: 1, inProgressApplications: 1 } });
    expect(line).toMatch(/1 live Standard business keeps/);
  });
});

describe("shared plan rows (what the Become a Seller page renders)", () => {
  const plans = {
    standard: { price: 300, limits: { items: 15 }, topBenefits: ["x", "y", "z"], features: { Visibility: ["Listed in search"] }, badge: null, trialDays: 0 },
    premium: { price: 800, limits: { items: 40 }, topBenefits: ["p", "q", "r"], features: { Visibility: ["Featured badge on shop card", "Priority placement in search"] }, badge: "Best value", trialDays: 14 },
  };
  const limits = { standard: { photosPerItem: 7, videosPerItem: 1, galleryPhotos: 5, faqs: 5, activeOffers: 8, flashSalesPerMonth: 3 }, premium: { photosPerItem: 15, videosPerItem: 3, galleryPhotos: 20, faqs: 20, activeOffers: null, flashSalesPerMonth: 10 } };
  const row = (rows, label) => rows.find((r) => r.label === label);
  it("takes every number from the plan and limit data", () => {
    const rows = buildPlanRows({ plans, globalLimits: limits });
    expect(row(rows, "Items you can list").standard).toEqual({ text: "Up to 15" });
    expect(row(rows, "Items you can list").premium).toEqual({ text: "Up to 40" });
    expect(row(rows, "Active offers").premium).toEqual({ text: "Unlimited" });
    expect(row(rows, "Top benefits").premium.list).toEqual(["p", "q", "r"]);
  });
  it("flips feature rows when the feature text is edited out", () => {
    expect(row(buildPlanRows({ plans, globalLimits: limits }), "Featured badge").premium.yes).toBe(true);
    const edited = { ...plans, premium: { ...plans.premium, features: { Visibility: ["Listed in search"] } } };
    expect(row(buildPlanRows({ plans: edited, globalLimits: limits }), "Featured badge").premium.yes).toBe(false);
  });
  it("builds header text, free plans and the starting price", () => {
    expect(planHeader(plans.premium)).toMatchObject({ price: "KSh 800", badge: "Best value", trial: "14-day free trial", free: false });
    expect(planHeader({ ...plans.standard, price: 0 })).toMatchObject({ price: "Free", free: true });
    expect(startingPrice([{ plans: { standard: { price: 500 } } }, { plans }])).toBe(300);
    expect(startingPrice([])).toBeNull();
  });
});
