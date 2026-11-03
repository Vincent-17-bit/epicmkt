import { describe, expect, it } from "vitest";
import { whyShown } from "./whyShown.js";

const shop = { live: true, status: "live" };
const item = { visible: true, draft: false, availability: "available", hiddenByAdmin: false, removedByAdmin: false };

describe("whyShown", () => {
  it("has no reasons for a live shop and a showing item", () => {
    expect(whyShown({ item, shop })).toEqual({ showing: true, reasons: [] });
  });

  it("explains a hidden item and offers to show it", () => {
    const out = whyShown({ item: { ...item, visible: false }, shop });
    expect(out.showing).toBe(false);
    expect(out.reasons.map((r) => [r.code, r.fix?.id])).toEqual([["hidden", "show"]]);
  });

  it("explains a draft with a publish fix", () => {
    const out = whyShown({ item: { ...item, draft: true, visible: false }, shop });
    expect(out.reasons.map((r) => [r.code, r.fix?.label])).toEqual([["draft", "Publish"]]);
  });

  it("explains an item that is out of stock", () => {
    const out = whyShown({ item: { ...item, availability: "out_of_stock" }, shop });
    expect(out.reasons.map((r) => [r.code, r.fix?.id])).toEqual([["stock", "restock"]]);
  });

  it("a paused shop can be resumed, an expired one renewed, a suspended one has no fix", () => {
    expect(whyShown({ item, shop: { live: false, status: "paused" } }).reasons[0].fix.id).toBe("resume");
    expect(whyShown({ item, shop: { live: false, status: "expired" } }).reasons[0].fix.to).toBe("/business/subscription");
    expect(whyShown({ item, shop: { live: false, status: "suspended" } }).reasons[0].fix).toBeNull();
  });

  it("an admin hide cannot be fixed by the seller and lists the reason", () => {
    const out = whyShown({ item: { ...item, hiddenByAdmin: true, adminHideReason: "Wrong photo" }, shop });
    expect(out.reasons).toHaveLength(1);
    expect(out.reasons[0].text).toContain("Wrong photo");
    expect(out.reasons[0].fix).toBeUndefined();
  });

  it("lists every reason that applies, shop first after the admin reasons", () => {
    const out = whyShown({ item: { ...item, visible: false, availability: "out_of_stock" }, shop: { live: false, status: "paused" } });
    expect(out.reasons.map((r) => r.code)).toEqual(["shop", "hidden", "stock"]);
  });
});
