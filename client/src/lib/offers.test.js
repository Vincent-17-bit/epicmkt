import { describe, expect, it } from "vitest";
import { offerHref } from "./offers.js";

const view = (ids) => ({ offer: { items: ids.map((itemId) => ({ itemId, role: "main" })) }, business: { slug: "fade-kings" } });

describe("offerHref", () => {
  it("opens the product when the offer is on exactly one product", () => {
    expect(offerHref(view(["fade and beard"]))).toBe("/b/fade-kings?item=fade%20and%20beard");
  });

  it("opens the store's offers section when several products are in it", () => {
    expect(offerHref(view(["a", "b"]))).toBe("/b/fade-kings#offers");
    expect(offerHref(view([]))).toBe("/b/fade-kings#offers");
  });
});
