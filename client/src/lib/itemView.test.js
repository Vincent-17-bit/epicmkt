import { describe, expect, it } from "vitest";
import { chatMessage, defaultVariantId, groupSpecs } from "./itemView.js";

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

describe("groupSpecs", () => {
  it("groups by name keeping order", () => {
    const groups = groupSpecs([
      { group: "A", label: "x", value: "1" },
      { label: "y", value: "2" },
      { group: "A", label: "z", value: "3" }
    ]);
    expect(groups.map((g) => [g.name, g.rows.length])).toEqual([["A", 2], [null, 1]]);
  });
});
