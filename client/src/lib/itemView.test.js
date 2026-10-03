import { describe, expect, it } from "vitest";
import { buildSpecGroups, chatMessage, countRows, defaultVariantId, limitGroups } from "./itemView.js";

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
