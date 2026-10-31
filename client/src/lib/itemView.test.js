import { describe, expect, it } from "vitest";
import { buildItemJsonLd, buildSpecGroups, chatMessage, countdown, countRows, defaultVariantId, normalizeHighlights, offerExpiry, offerTarget, offerValueLabel } from "./itemView.js";

const item = { name: "Fade and beard" };

describe("chatMessage", () => {
  it("states the regular price", () => {
    const pricing = { regularPrice: 300, salePrice: 300, savings: 0 };
    expect(chatMessage({ item, pricing })).toBe("Hi, I saw Fade and beard (KES 300) on EpicMKT");
  });

  it("states the flash sale with the old price", () => {
    const pricing = { regularPrice: 300, salePrice: 240, savings: 60 };
    expect(chatMessage({ item, pricing })).toBe(
      "Hi, I saw the flash sale on Fade and beard: KES 240 (was KES 300) on EpicMKT"
    );
  });

  it("includes the chosen variant and its price", () => {
    const pricing = { regularPrice: 2500, salePrice: 2250, savings: 250 };
    const variant = { label: "Small", regularPrice: 3500, salePrice: 3500, savings: 0 };
    expect(chatMessage({ item, variant, pricing })).toBe("Hi, I saw Fade and beard (Small) (KES 3,500) on EpicMKT");
  });

  it("omits the price when there is none", () => {
    expect(chatMessage({ item, pricing: null })).toBe("Hi, I saw Fade and beard on EpicMKT");
  });

  it("uses the seller's own greeting, filling in the item and the price they will pay", () => {
    const greeting = "Hello! Is {item} ({price}) in stock?";
    expect(chatMessage({ item, pricing: { regularPrice: 300, salePrice: 300, savings: 0 }, greeting })).toBe("Hello! Is Fade and beard (KES 300) in stock?");
    expect(chatMessage({ item, pricing: { regularPrice: 300, salePrice: 240, savings: 60 }, greeting })).toBe("Hello! Is Fade and beard (KES 240) in stock?");
    expect(chatMessage({ item, pricing: null, greeting })).toBe("Hello! Is Fade and beard in stock?");
  });

  it("ignores a greeting that is empty or unsafe and keeps the standard text", () => {
    const pricing = { regularPrice: 300, salePrice: 300, savings: 0 };
    for (const greeting of ["", "   ", null, "Call 0712 345 678 about {item}", "See https://x.example {item}", "Hi {name}"]) {
      expect(chatMessage({ item, pricing, greeting })).toBe("Hi, I saw Fade and beard (KES 300) on EpicMKT");
    }
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

  it("merges specs, meta and template fields into the fixed groups without duplicates", () => {
    const groups = buildSpecGroups({
      item: { specs: [{ group: "Measurements", label: "Duration", value: "1h" }, { label: "Colour", value: "Red" }], duration: "2h", packSize: "2 kg", pricing: { unit: "kg" } },
      category,
      attributes: { walkins: true, chairs: 4, about: "text", kids: false }
    });
    expect(groups.map((g) => g.name)).toEqual(["Features & Specs", "Measurements", "Item details"]);
    expect(groups[0].rows).toEqual([{ label: "Colour", value: "Red" }]);
    expect(groups[2].rows.map((r) => r.label)).toEqual(["Pack size", "Unit", "Walk-ins", "Chairs"]);
  });

  it("orders groups fixed regardless of input order and sends unknown groups to Features & Specs", () => {
    const groups = buildSpecGroups({
      item: { specs: [{ group: "User guide", label: "A", value: "1" }, { group: "Measurements", label: "B", value: "2" }, { group: "Nope", label: "C", value: "3" }] },
      category: null,
      attributes: {}
    });
    expect(groups.map((g) => g.name)).toEqual(["Features & Specs", "Measurements", "User guide"]);
  });

  it("returns nothing when there is nothing to show", () => {
    expect(buildSpecGroups({ item: { specs: [] }, category: null, attributes: {} })).toEqual([]);
    expect(countRows([])).toBe(0);
  });
});

describe("normalizeHighlights", () => {
  it("accepts strings and title/text objects and drops blanks", () => {
    expect(normalizeHighlights(["Plain", { title: "Lead", text: "Body" }, { text: " Only " }, { title: "T" }, { text: "" }, "  ", null, 4])).toEqual([
      { title: "", text: "Plain" },
      { title: "Lead", text: "Body" },
      { title: "", text: "Only" },
      { title: "", text: "T" }
    ]);
    expect(normalizeHighlights(undefined)).toEqual([]);
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
    expect(offerValueLabel({ kind: "amount_off", value: 300 })).toBe("KES 300 off");
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
  const base = { id: "a b", name: "Pan", description: "Good", images: [{ url: "x.png" }], availability: "limited_stock", business: { slug: "shop", name: "Shop" } };

  it("builds a Product with price validity for a flash sale", () => {
    const data = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 240 }, flash: { sale: { endsAt: "2026-10-04T10:00:00.000Z" } } }, siteUrl: "https://e.test" });
    expect(data["@type"]).toBe("Product");
    expect(data.offers).toMatchObject({ price: 240, priceCurrency: "KES", priceValidUntil: "2026-10-04T10:00:00.000Z", availability: "https://schema.org/LimitedAvailability" });
    expect(data.offers.url).toBe("https://e.test/b/shop?item=a%20b");
  });

  it("builds a Service without priceValidUntil when no sale", () => {
    const data = buildItemJsonLd({ item: { ...base, kind: "service", availability: "available", pricing: { salePrice: 300 }, flash: null }, siteUrl: "https://e.test" });
    expect(data["@type"]).toBe("Service");
    expect(data.provider.name).toBe("Shop");
    expect(data.offers.priceValidUntil).toBeUndefined();
    expect(data.offers.availability).toBe("https://schema.org/InStock");
  });

  it("says out of stock for both sold-out words, and in stock for by appointment", () => {
    const of = (availability) => buildItemJsonLd({ item: { ...base, availability, pricing: { salePrice: 300 } }, siteUrl: "https://e.test" }).offers.availability;
    expect(of("out_of_stock")).toBe("https://schema.org/OutOfStock");
    expect(of("unavailable")).toBe("https://schema.org/OutOfStock");
    expect(of("by_appointment")).toBe("https://schema.org/InStock");
  });

  it("adds the item's brand and specs, and keeps the store brand without them", () => {
    const withDetails = buildItemJsonLd({
      item: { ...base, kind: "product", pricing: { salePrice: 1 }, brand: " Thermos ", specs: [{ group: "Measurements", label: "Capacity", value: "1 litre" }, { label: "", value: "x" }] },
      siteUrl: "https://e.test"
    });
    expect(withDetails.brand).toEqual({ "@type": "Brand", name: "Thermos" });
    expect(withDetails.additionalProperty).toEqual([{ "@type": "PropertyValue", name: "Capacity", value: "1 litre" }]);
    const plain = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 1 } }, siteUrl: "https://e.test" });
    expect(plain.brand).toEqual({ "@type": "Brand", name: "Shop" });
    expect(plain.additionalProperty).toBeUndefined();
    const service = buildItemJsonLd({ item: { ...base, kind: "service", pricing: null, brand: "Acme" }, siteUrl: "https://e.test" });
    expect(service.brand.name).toBe("Acme");
    expect(service.provider.name).toBe("Shop");
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
