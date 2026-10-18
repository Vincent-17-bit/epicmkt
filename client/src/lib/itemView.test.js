import { describe, expect, it } from "vitest";
import { buildItemJsonLd, buildSpecGroups, chatMessage, countdown, countRows, defaultVariantId, endedPricing, limitGroups, offerExpiry, offerTarget, offerValueLabel, paragraphs, previewText, priceParts } from "./itemView.js";

const item = { name: "Fade and beard" };

describe("chatMessage", () => {
  it("states the regular price", () => {
    const pricing = { regularPrice: 300, salePrice: 300, savings: 0 };
    expect(chatMessage({ item, pricing })).toBe("Hi, I saw Fade and beard (KSh 300) on EpicMKT");
  });

  it("states the flash sale with the old price", () => {
    const pricing = { regularPrice: 300, salePrice: 240, savings: 60 };
    expect(chatMessage({ item, pricing })).toBe(
      "Hi, I saw the flash sale on Fade and beard: KSh 240 (was KSh 300) on EpicMKT"
    );
  });

  it("includes the chosen variant and its price", () => {
    const pricing = { regularPrice: 2500, salePrice: 2250, savings: 250 };
    const variant = { label: "Small", regularPrice: 3500, salePrice: 3500, savings: 0 };
    expect(chatMessage({ item, variant, pricing })).toBe("Hi, I saw Fade and beard (Small) (KSh 3,500) on EpicMKT");
  });

  it("omits the price when there is none", () => {
    expect(chatMessage({ item, pricing: null })).toBe("Hi, I saw Fade and beard on EpicMKT");
  });
});

describe("defaultVariantId", () => {
  it("prefers the variant matching the base price", () => {
    const pricing = { regularPrice: 2500, variants: [{ id: "small", regularPrice: 3500 }, { id: "medium", regularPrice: 2500 }] };
    expect(defaultVariantId(pricing)).toBe("medium");
  });

  it("falls back to the first variant and handles none", () => {
    expect(defaultVariantId({ regularPrice: 1, variants: [{ id: "a", regularPrice: 2 }] })).toBe("a");
    expect(defaultVariantId({ regularPrice: 1, variants: [] })).toBeNull();
    expect(defaultVariantId(null)).toBeNull();
  });
});

describe("buildSpecGroups", () => {
  const category = {
    singular: "Barbershop",
    fields: [
      { key: "walkins", label: "Walk-ins", type: "boolean" },
      { key: "chairs", label: "Chairs", type: "number" },
      { key: "about", label: "About", type: "longtext" },
      { key: "kids", label: "Kids cuts", type: "boolean", group: "Services" }
    ]
  };

  it("merges specs, meta and template fields without duplicates", () => {
    const groups = buildSpecGroups({
      item: { specs: [{ group: "A", label: "Duration", value: "1h" }, { label: "Colour", value: "Red" }], duration: "2h", packSize: "2 kg", pricing: { unit: "kg" } },
      category,
      attributes: { walkins: true, chairs: 4, about: "text", kids: false }
    });
    expect(groups.map((g) => g.name)).toEqual(["A", null, "Barbershop details"]);
    expect(groups[1].rows.map((r) => r.label)).toEqual(["Colour", "Pack size", "Unit"]);
    expect(groups[2].rows).toEqual([{ label: "Walk-ins", value: "Yes" }, { label: "Chairs", value: "4" }]);
  });

  it("returns nothing when there is nothing to show", () => {
    expect(buildSpecGroups({ item: { specs: [] }, category: null, attributes: {} })).toEqual([]);
  });
});

describe("limitGroups", () => {
  const groups = [{ name: "A", rows: [1, 2, 3].map((n) => ({ label: `a${n}`, value: "x" })) }, { name: "B", rows: [1, 2, 3].map((n) => ({ label: `b${n}`, value: "x" })) }];

  it("cuts across groups and drops empty ones", () => {
    expect(countRows(limitGroups(groups, 4))).toBe(4);
    expect(limitGroups(groups, 3).map((g) => g.name)).toEqual(["A"]);
    expect(countRows(limitGroups(groups, 8))).toBe(6);
  });
});

describe("countdown", () => {
  it("formats clock and day forms", () => {
    expect(countdown(3661000)).toBe("01:01:01");
    expect(countdown(59000)).toBe("00:00:59");
    expect(countdown(2 * 86400000 + 5 * 3600000)).toBe("2d 5h");
    expect(countdown(-5)).toBe("00:00:00");
  });
});

describe("offer helpers", () => {
  it("labels values", () => {
    expect(offerValueLabel({ kind: "percent_off", value: 10 })).toBe("10% off");
    expect(offerValueLabel({ kind: "amount_off", value: 300 })).toBe("KSh 300 off");
    expect(offerValueLabel({ kind: "multi_buy", valueText: "2 for 250" })).toBe("2 for 250");
    expect(offerValueLabel({ kind: "freebie" })).toBe("Free gift");
  });

  it("formats expiry", () => {
    expect(offerExpiry(null)).toBeNull();
    expect(offerExpiry(3 * 86400000)).toBe("3d");
    expect(offerExpiry(5 * 3600000)).toBe("5h");
    expect(offerExpiry(90000)).toBe("2m");
  });
});

describe("buildItemJsonLd", () => {
  const base = { id: "a b", name: "Pan", description: "Good", images: [{ url: "x.png" }], availability: "limited", business: { slug: "shop", name: "Shop" } };

  it("builds a Product with price validity for a flash sale", () => {
    const data = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 240 }, flash: { sale: { endsAt: "2026-10-04T10:00:00.000Z" } } }, siteUrl: "https://e.test" });
    expect(data["@type"]).toBe("Product");
    expect(data.offers).toMatchObject({ price: 240, priceCurrency: "KES", priceValidUntil: "2026-10-04T10:00:00.000Z", availability: "https://schema.org/LimitedAvailability" });
    expect(data.offers.url).toBe("https://e.test/b/shop/item/a%20b");
    expect(data.url).toBe("https://e.test/b/shop/item/a%20b");
  });

  it("adds validFrom and validThrough to the offer of a flash sale only", () => {
    const sale = { startsAt: "2026-10-03T10:00:00.000Z", endsAt: "2026-10-04T10:00:00.000Z" };
    const flash = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 240 }, flash: { sale } }, siteUrl: "https://e.test" });
    expect(flash.offers).toMatchObject({ validFrom: sale.startsAt, validThrough: sale.endsAt, priceValidUntil: sale.endsAt });
    const plain = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 240 }, flash: null }, siteUrl: "https://e.test" });
    expect(plain.offers.validThrough).toBeUndefined();
    expect(plain.offers.validFrom).toBeUndefined();
  });

  it("builds a Service without priceValidUntil when no sale", () => {
    const data = buildItemJsonLd({ item: { ...base, kind: "service", availability: "available", pricing: { salePrice: 300 }, flash: null }, siteUrl: "https://e.test" });
    expect(data["@type"]).toBe("Service");
    expect(data.provider.name).toBe("Shop");
    expect(data.offers.priceValidUntil).toBeUndefined();
    expect(data.offers.availability).toBe("https://schema.org/InStock");
  });

  it("omits offers without a price", () => {
    expect(buildItemJsonLd({ item: { ...base, kind: "service", pricing: null, flash: null }, siteUrl: "https://e.test" }).offers).toBeUndefined();
  });
});

describe("offerTarget", () => {
  const business = {
    slug: "fade-kings",
    services: [
      { id: "haircut", section: "Cuts" },
      { id: "wig", section: null }
    ]
  };

  it("sends store offers to the business page", () => {
    expect(offerTarget({ appliesTo: "store" }, business)).toBe("/b/fade-kings");
  });

  it("sends section offers to their section", () => {
    expect(offerTarget({ appliesTo: "section", sectionId: "cuts" }, business)).toBe("/b/fade-kings?section=cuts");
  });

  it("sends item offers to the section of the first sectioned item", () => {
    expect(offerTarget({ appliesTo: "items", itemIds: ["wig", "haircut"] }, business)).toBe("/b/fade-kings?section=cuts");
    expect(offerTarget({ appliesTo: "items", itemIds: ["wig"] }, business)).toBe("/b/fade-kings");
  });
});

describe("item page helpers", () => {
  it("splits a description into paragraphs", () => {
    expect(paragraphs("One.\n\nTwo line\nwrapped.\n\n\n")).toEqual(["One.", "Two line wrapped."]);
    expect(paragraphs("")).toEqual([]);
    expect(paragraphs(null)).toEqual([]);
  });

  it("keeps short text whole and cuts long text at a word with an ellipsis", () => {
    expect(previewText("Short text")).toEqual({ text: "Short text", truncated: false });
    const long = "word ".repeat(300);
    const cut = previewText(long, 100);
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBeLessThanOrEqual(101);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(cut.text).not.toMatch(/wor…$/);
  });

  it("turns an ended flash price back into the regular price, variants included", () => {
    const ended = endedPricing({ regularPrice: 300, salePrice: 225, savings: 75, discountPercent: 25, variants: [{ id: "a", regularPrice: 400, salePrice: 300, savings: 100, discountPercent: 25 }] });
    expect(ended).toMatchObject({ salePrice: 300, savings: 0, discountPercent: 0 });
    expect(ended.variants[0]).toMatchObject({ salePrice: 400, savings: 0, discountPercent: 0 });
    expect(endedPricing(null)).toBeNull();
  });

  it("classifies prices: regular, sale, from, free and contact", () => {
    const row = (regularPrice, salePrice) => ({ regularPrice, salePrice, savings: regularPrice - salePrice });
    expect(priceParts(row(300, 300))).toEqual({ kind: "regular", amount: 300, prefix: null });
    expect(priceParts(row(300, 225))).toEqual({ kind: "sale", amount: 225, prefix: null });
    expect(priceParts(row(300, 300), "from")).toMatchObject({ kind: "regular", prefix: "from" });
    expect(priceParts(row(0, 0))).toEqual({ kind: "free", amount: 0, prefix: null });
    expect(priceParts(row(300, 300), "free").kind).toBe("free");
    expect(priceParts(null).kind).toBe("contact");
    expect(priceParts({ regularPrice: null }).kind).toBe("contact");
  });
});
