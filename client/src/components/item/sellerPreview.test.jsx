import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useOptionSelection } from "../../hooks/useOptionSelection.js";
import { previewDetail } from "../../api/flash/preview.js";
import Options from "./Options.jsx";

// The seller editor's preview message, as previewPayload (seller app) builds it: White bread by brand and weight, and a soundbar in
// three colours with no photos.
const options = (axes, rows) => ({
  options: axes,
  optionVariants: rows.map(([choice, price], i) => ({ id: `pv${i + 1}`, label: Object.values(choice).join(" / "), choice, price, salePrice: null, status: "available", sku: null, mediaIds: [], specs: [], stockLeft: null })),
  optionAvailability: { axes: [], missing: "unavailable", cells: [], values: {} },
  defaultVariantId: null,
  sizeChart: null
});
const bread = {
  row: { id: "preview", name: "White bread", price: 60, price_type: "from", availability: "available", highlights: [{ title: "• Freshness Guaranteed:", text: "Baked daily." }], includes: ["Loaf"], include_media: [null], specs: [], has_options: true, option_count: 4, price_min: 60, price_high: 130 },
  business: { id: "b1", slug: "sunrise", name: "Sunrise Bakery" },
  options: options(
    [{ key: "brand", label: "Brand", display: "button", values: [{ id: "festive", label: "Festive" }, { id: "supa", label: "Supa Loaf" }] }, { key: "weight", label: "Weight", display: "button", values: [{ id: "400", label: "400 g" }, { id: "700", label: "700 g" }] }],
    [[{ brand: "festive", weight: "400" }, 65], [{ brand: "festive", weight: "700" }, 100], [{ brand: "supa", weight: "400" }, 60], [{ brand: "supa", weight: "700" }, 130]]
  ),
  media: [{ id: "m1", kind: "image", url: "https://img.test/a.jpg" }],
  media3d: []
};

function Harness({ item }) {
  const option = useOptionSelection(item, item.id);
  return <Options ctx={{ option }} slot={{ item }} />;
}

describe("the seller's live preview", () => {
  it("turns the editor's message into the page's item, with each combination's own price", () => {
    const item = previewDetail(bread);
    expect(item).toMatchObject({ name: "White bread", preview: true, flash: null, offers: [] });
    expect(item.business).toMatchObject({ slug: "sunrise", name: "Sunrise Bakery" });
    expect(item.images.map((m) => m.url)).toEqual(["https://img.test/a.jpg"]);
    expect(item.optionVariants.map((v) => [v.label, v.price])).toEqual([["festive / 400", 65], ["festive / 700", 100], ["supa / 400", 60], ["supa / 700", 130]]);
    expect(item.highlights).toEqual([{ title: "• Freshness Guaranteed:", text: "Baked daily." }]);
    expect(item.pricing.regularPrice).toBe(60);
  });

  it("draws an option card per brand and weight with its price", () => {
    render(<MemoryRouter><Harness item={previewDetail(bread)} /></MemoryRouter>);
    const brand = screen.getByRole("radiogroup", { name: /^Brand:/ });
    expect(within(brand).getAllByRole("radio").map((r) => r.textContent.replace(/\s+/g, " ").trim())).toEqual(["Festive KES 65", "Supa Loaf KES 60"]);
  });

  it("gives colours without photos a swatch from their name (Black, Grey, Silver)", () => {
    const soundbar = previewDetail({
      ...bread,
      row: { ...bread.row, name: "Soundbar" },
      options: options([{ key: "colour", label: "Colour", display: "button", values: [{ id: "black", label: "Black" }, { id: "grey", label: "Grey" }, { id: "silver", label: "Silver" }] }], [[{ colour: "black" }, 7500], [{ colour: "grey" }, 9900], [{ colour: "silver" }, 9300]])
    });
    const { container } = render(<MemoryRouter><Harness item={soundbar} /></MemoryRouter>);
    const swatches = [...container.querySelectorAll('[data-kind="swatch"] span[aria-hidden="true"]')].map((s) => s.style.background);
    expect(swatches).toHaveLength(3);
    expect(swatches[0]).toMatch(/rgb\(17, 17, 17\)|#111111/);
  });
});
