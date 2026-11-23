import { whatsappLink } from "@epicmkt/shared";
import { describe, expect, it } from "vitest";
import { buildItemJsonLd, buildSpecGroups, chatMessage, choiceLines, countdown, countRows, defaultVariantId, normalizeHighlights, offerExpiry, offerTarget, offerValueLabel, orderMessage, listMessage } from "./itemView.js";

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

  it("keeps the seller's greeting as written, whatever quantity the buyer picked", () => {
    const greeting = "Hello! Is {item} in stock?";
    const pricing = { regularPrice: 300, salePrice: 300, savings: 0 };
    expect(chatMessage({ item, pricing, greeting, order: { qty: 3, total: 900, measure: false } })).toBe("Hello! Is Fade and beard in stock?");
    expect(chatMessage({ item, pricing, order: { qty: 3, total: 900, measure: false } })).toBe("Hi, I saw Fade and beard (KES 300) on EpicMKT");
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

  it("gives an AggregateOffer with the low and high price when options are priced differently", () => {
    const data = buildItemJsonLd({ item: { ...base, kind: "product", pricing: { salePrice: 25000, hasRange: true, priceMin: 24000, priceMax: 25000 } }, siteUrl: "https://e.test" });
    expect(data.offers).toMatchObject({ "@type": "AggregateOffer", lowPrice: 24000, highPrice: 25000, priceCurrency: "KES" });
    expect(data.offers.price).toBeUndefined();
  });

  it("keeps a plain Offer when the range is flat or missing", () => {
    const flat = buildItemJsonLd({ item: { ...base, pricing: { salePrice: 500, hasRange: true, priceMin: 500, priceMax: 500 } }, siteUrl: "https://e.test" });
    expect(flat.offers).toMatchObject({ "@type": "Offer", price: 500 });
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

describe("choiceLines and orderMessage", () => {
  const option = { axes: [{ key: "c", label: "Colour", values: [{ id: "g", label: "Grey" }] }, { key: "s", label: "Size", values: [{ id: "8", label: "8" }] }], choice: { c: "g", s: "8" } };

  it("lists each option axis with the chosen value, skipping axes with no pick", () => {
    expect(choiceLines(option)).toEqual([{ label: "Colour", value: "Grey" }, { label: "Size", value: "8" }]);
    expect(choiceLines({ ...option, choice: { c: "g" } })).toEqual([{ label: "Colour", value: "Grey" }]);
  });

  it("falls back to the variant label, and to nothing", () => {
    expect(choiceLines(null, { label: "Small" })).toEqual([{ label: "Option", value: "Small" }]);
    expect(choiceLines(null, null)).toEqual([]);
  });

  it("writes a whole message with no shop and no choices", () => {
    const text = orderMessage({ item, order: { qty: 3, unit: 300, total: 900, measure: false } });
    expect(text).toBe("Hi, I'd like to order:\n\n*Fade and beard*\nQuantity: 3\nPrice: KES 300 each\nTotal: KES 900\n\nPlease confirm it is available and how I can pay and receive it.\nSent from EpicMKT");
  });
});

describe("listMessage", () => {
  const shop = { name: "Nyumbani Home Store" };
  const line = (over = {}) => ({ name: "Wooden coffee table", optionLabel: "Walnut", qty: 1, measure: false, unitLabel: null, total: 8500, service: false, status: "ok", ...over });

  it("writes a products list the way buyers already message shops", () => {
    const text = listMessage({ business: shop, lines: [line(), line({ name: "Cushion covers", optionLabel: "Grey", qty: 2, total: 1600 })] });
    expect(text).toBe(
      [
        "Hi Nyumbani Home Store, I'd like these from EpicMKT:",
        "1. Wooden coffee table, Walnut, x1, KES 8,500",
        "2. Cushion covers, Grey, x2, KES 1,600",
        "Total: KES 10,100",
        "Are they available?"
      ].join("\n")
    );
  });

  it("services only: to book, no quantity, no total, and a question about time", () => {
    const text = listMessage({ business: { name: "Glow Salon Kilimani" }, lines: [line({ name: "Braids", optionLabel: "", total: 3000, service: true }), line({ name: "Wash", optionLabel: "", total: 500, service: true })] });
    expect(text).toBe(["Hi Glow Salon Kilimani, I'd like to book these from EpicMKT:", "1. Braids, KES 3,000", "2. Wash, KES 500", "When can you fit me in?"].join("\n"));
  });

  it("products and services together: products first, then To book:, one total", () => {
    const text = listMessage({ business: shop, lines: [line({ name: "Haircut", optionLabel: "", total: 500, service: true }), line()] });
    expect(text.split("\n")).toEqual(["Hi Nyumbani Home Store, I'd like these from EpicMKT:", "1. Wooden coffee table, Walnut, x1, KES 8,500", "To book:", "2. Haircut, KES 500", "Total: KES 9,000", "Are they available? When can you fit me in?"]);
  });

  it("asks about a missing price and about options not chosen; the total covers only what has a price", () => {
    const text = listMessage({ business: shop, lines: [line({ total: null, status: "no_price", optionLabel: "" }), line({ name: "Sofa", total: null, status: "choose_options", optionLabel: "" }), line({ name: "Lamp", optionLabel: "", total: 900 })] });
    expect(text).toContain("1. Wooden coffee table, x1 (what's the price?)");
    expect(text).toContain("2. Sofa, x1 (which options do you have?)");
    expect(text).toContain("Total: KES 900");
  });

  it("a measured line says the amount, not x", () => {
    const text = listMessage({ business: shop, lines: [line({ name: "Beef", optionLabel: "", qty: 1.5, measure: true, unitLabel: "kg", total: 1200 })] });
    expect(text).toContain("1. Beef, 1.5 kg, KES 1,200");
  });

  it("a very long list ends with +N more items and stays under the limit when encoded", () => {
    const lines = Array.from({ length: 120 }, (_, i) => line({ name: `Product number ${i + 1} with a rather long name`, total: 100 }));
    const text = listMessage({ business: shop, lines });
    expect(encodeURIComponent(text).length).toBeLessThanOrEqual(3000);
    expect(text).toMatch(/\n\+\d+ more items\n/);
    expect(text).toContain("Total: KES 12,000"); // the total still covers every line
  });

  it("builds a working link with the shared whatsappLink, encoded", () => {
    const text = listMessage({ business: shop, lines: [line({ name: "Café & table" })] });
    const href = whatsappLink("0712345678", text);
    expect(href.startsWith("https://wa.me/254712345678?text=")).toBe(true);
    expect(decodeURIComponent(href.split("text=")[1])).toBe(text);
  });
});
