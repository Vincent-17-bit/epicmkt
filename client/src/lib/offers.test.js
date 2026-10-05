import { describe, expect, it } from "vitest";
import { offerHref } from "./offers.js";

const view = (offer) => ({ offer, business: { slug: "fade-kings" } });

describe("offerHref", () => {
  it("opens the item when the offer targets exactly one", () => {
    expect(offerHref(view({ appliesTo: "items", itemIds: ["hair dye"] }))).toBe("/b/fade-kings?item=hair%20dye");
  });

  it("opens the offers section for store, section and multi-item offers", () => {
    expect(offerHref(view({ appliesTo: "store", itemIds: [] }))).toBe("/b/fade-kings#offers");
    expect(offerHref(view({ appliesTo: "section", itemIds: [] }))).toBe("/b/fade-kings#offers");
    expect(offerHref(view({ appliesTo: "items", itemIds: ["a", "b"] }))).toBe("/b/fade-kings#offers");
  });
});
