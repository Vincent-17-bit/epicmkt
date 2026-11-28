// One line, one price: the item page, the Saved drawer and the message to a shop all read it from lineFor, so for the same item, option,
// quantity and time they cannot differ. These cases pin the numbers (worked by hand) for every kind of price the site has.
import { describe, expect, it } from "vitest";
import { phone } from "@epicmkt/shared/options/fixtures";
import { lineFor, resolveOption, savedLine, shownForQty } from "./lineFor.js";
import { orderLine, quantityInfo } from "./itemView.js";

const shop = { id: "b1", slug: "shop", name: "Shop", categoryId: "general" };
const pricing = (n, sale = n) => ({ regularPrice: n, salePrice: sale, savings: n - sale, discountPercent: n > 0 ? Math.round(((n - sale) / n) * 100) : 0, unit: null, variants: [] });
const base = (over = {}) => ({ id: "i1", name: "Thing", kind: "product", availability: "available", business: shop, pricing: pricing(150), ...over });
const entry = (over = {}) => ({ key: "i1|", itemId: "i1", businessId: "b1", optionParam: "", qty: 1, kind: "product", snap: {}, ...over });
const tiers = [{ minQty: 1, maxQty: 10, unitPrice: 10 }, { minQty: 11, maxQty: 100, unitPrice: 7 }, { minQty: 101, maxQty: null, unitPrice: 5 }];
const phoneItem = (over = {}) => {
  const f = phone();
  return { ...base({ name: f.item.name, pricing: pricing(f.item.price) }), options: f.options, optionVariants: f.optionVariants, defaultVariantId: f.defaultVariantId, ...over };
};

// What the drawer says for an entry and what the page says for the same choice must be the same number.
const both = (item, optionParam, qty) => {
  const o = resolveOption(item, optionParam);
  const option = o?.state === "ok" ? { variant: o.variant, label: o.label } : null;
  const page = lineFor({ item, option, qty });
  const drawer = savedLine({ entry: entry({ optionParam, qty }), item });
  return { page, drawer };
};

describe("lineFor parity: page, drawer and message agree", () => {
  it("regular price", () => {
    const { page, drawer } = both(base(), "", 3);
    expect([page.total, drawer.total, drawer.status]).toEqual([450, 450, "ok"]);
  });

  it("sale price: pays the sale price, the struck-through price scales with the quantity", () => {
    const item = base({ pricing: pricing(300, 240) });
    const { page, drawer } = both(item, "", 3);
    expect([page.total, drawer.total, page.was]).toEqual([720, 720, 900]);
  });

  it("flash sale: the price the page shows (the flash price)", () => {
    const item = base({ pricing: pricing(300, 240), flash: { sale: { id: "s", endsAt: "2999-01-01T00:00:00Z" } } });
    const { page, drawer } = both(item, "", 2);
    expect([page.total, drawer.total]).toEqual([480, 480]);
  });

  it("whole tiers: every unit costs the tier the quantity reaches", () => {
    const item = base({ unit: "page", pricing: pricing(10), priceTiers: tiers, priceTierMode: "whole" });
    expect(both(item, "", 11).page.total).toBe(77);
    expect(both(item, "", 11).drawer.total).toBe(77);
    expect(both(item, "", 101).drawer.total).toBe(505);
  });

  it("graduated tiers: each unit costs the price of its own band", () => {
    const item = base({ unit: "page", pricing: pricing(10), priceTiers: tiers, priceTierMode: "graduated" });
    const { page, drawer } = both(item, "", 12);
    expect([page.total, drawer.total]).toEqual([114, 114]); // 10 x 10 + 2 x 7
  });

  it("measured (kg, 0.25 steps): the amount times the price per kg", () => {
    const item = base({ unit: "kg", quantityMode: "measure", quantity: { min: 0.5, step: 0.25, unit: "kg" }, pricing: pricing(800) });
    expect(both(item, "", 1.5).page.total).toBe(1200);
    expect(both(item, "", 1.5).drawer.total).toBe(1200);
    expect(both(item, "", null).page.qty).toBe(0.5);
  });

  it("options with different prices: each option is priced by its own", () => {
    const item = phoneItem();
    expect(both(item, "grey.128", 3).page.total).toBe(63000);
    expect(both(item, "grey.128", 3).drawer.total).toBe(63000);
    expect(both(item, "grey.256", 3).drawer.total).toBe(72000);
    expect(resolveOption(item, "grey.256").label).toBe("Grey / 256 GB");
  });

  it("stock: the quantity is held at what is left, and the line says so, without changing the stored quantity", () => {
    const item = phoneItem({ optionVariants: phone().optionVariants.map((v) => (v.choice.color === "grey" && v.choice.storage === "128" ? { ...v, stockLeft: 3 } : v)) });
    const { drawer } = both(item, "grey.128", 9);
    expect([drawer.qty, drawer.total, drawer.capped]).toEqual([3, 63000, 3]);
  });

  it("a flash sale on an item with options uses the item's flash price for the chosen option (the page's rule, kept on purpose)", () => {
    const item = phoneItem({ pricing: pricing(22000, 17600), flash: { sale: { id: "s", endsAt: "2999-01-01T00:00:00Z" } } });
    // The page shows the item's flash price for any option; the saved line and the message follow it, so all three agree.
    expect(both(item, "grey.256", 2).page.total).toBe(35200);
    expect(both(item, "grey.256", 2).drawer.total).toBe(35200);
  });

  it("a service is one of the thing, with no quantity", () => {
    const item = base({ kind: "service", pricing: pricing(2000) });
    expect(quantityInfo(item)).toBeNull();
    const { drawer } = both(item, "", 5);
    expect([drawer.total, drawer.qty, drawer.service]).toEqual([2000, 1, true]);
  });
});

describe("a service that is counted", () => {
  it("units: 50 pages cost 50 times the price, in the page, the drawer and the line", () => {
    const item = base({ kind: "service", quantityMode: "units", pricing: pricing(10) });
    expect(quantityInfo(item)).not.toBeNull();
    const { page, drawer } = both(item, "", 50);
    expect([page.total, drawer.total, drawer.qty, drawer.service]).toEqual([500, 500, 50, true]);
  });

  it("measure: 3 hours at a price per hour", () => {
    const item = base({ kind: "service", unit: "hour", quantityMode: "measure", quantity: { min: 0.5, step: 0.5, unit: "hour" }, pricing: pricing(120) });
    const { page, drawer } = both(item, "", 3);
    expect([page.total, drawer.total, drawer.info.unit]).toEqual([360, 360, "hour"]);
  });
});

describe("lines that cannot be totalled", () => {
  it("no price", () => {
    expect(savedLine({ entry: entry(), item: base({ pricing: null }) })).toMatchObject({ status: "no_price", total: null, priced: false });
  });
  it("options never chosen: shows the lowest price, counts for nothing", () => {
    const item = phoneItem({ pricing: { ...pricing(21000), hasRange: true, priceMin: 21000 } });
    expect(savedLine({ entry: entry(), item })).toMatchObject({ status: "choose_options", from: 21000, total: null });
  });
  it("an option that is no longer sold", () => {
    expect(savedLine({ entry: entry({ optionParam: "grey.512" }), item: phoneItem() })).toMatchObject({ status: "option_gone", total: null });
    expect(savedLine({ entry: entry({ optionParam: "nope.nope" }), item: phoneItem() }).status).toBe("option_gone");
  });
  it("an item that is not listed any more", () => {
    expect(savedLine({ entry: entry({ qty: 2 }), item: null })).toMatchObject({ status: "unavailable", total: null, qty: 2 });
  });
});

describe("the price the page shows follows the quantity", () => {
  it("scales the amounts and leaves one of the thing alone", () => {
    const item = base({ pricing: pricing(300, 240) });
    const shown = item.pricing;
    expect(shownForQty(shown, lineFor({ item, qty: 1 }))).toBe(shown);
    expect(shownForQty(shown, lineFor({ item, qty: 3 }))).toMatchObject({ salePrice: 720, regularPrice: 900, savings: 180 });
  });
  it("orderLine is still what totals a quantity", () => {
    expect(orderLine({ shown: pricing(150), info: quantityInfo(base()), qty: 2 }).total).toBe(300);
  });
});
