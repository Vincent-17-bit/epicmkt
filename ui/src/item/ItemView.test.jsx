import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemView from "./ItemView.jsx";

const variant = (id, label, price) => ({ id, label, regularPrice: price, salePrice: price, savings: 0, discountPercent: 0 });
const item = (extra = {}) => ({
  id: "i1",
  name: "Fade cut",
  brand: "Acme",
  shortDescription: "Clean and quick",
  description: "A longer story about the cut.",
  section: null,
  packSize: null,
  availability: "available",
  highlights: [{ title: "", text: "Done in 30 minutes" }],
  specs: [],
  images: [],
  videos: [],
  offers: [],
  flash: null,
  pricing: { regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0, unit: null, variants: [variant("a", "Small", 500), variant("b", "Large", 800)] },
  ...extra
});

describe("ItemView options", () => {
  it("lists the options and reports the one picked", async () => {
    const onVariant = vi.fn();
    render(<ItemView item={item()} shown={item().pricing.variants[0]} activeId="a" onVariant={onVariant} />);
    const group = screen.getByRole("radiogroup", { name: "Options" });
    expect(group.querySelectorAll("[role=radio]")).toHaveLength(2);
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(onVariant).toHaveBeenCalledWith("b");
  });
});

describe("ItemView marks", () => {
  it("marks only the parts the caller asks for", () => {
    const marks = (part) => (["name", "brand", "short", "price", "highlights", "description", "media", "specs"].includes(part) ? "" : undefined);
    const { container } = render(<ItemView item={item()} shown={item().pricing} marks={marks} />);
    expect(container.querySelectorAll("[data-hl]").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByRole("heading", { name: "Fade cut" })).toHaveAttribute("data-hl");
  });

  it("adds no marks when none are asked for", () => {
    const { container } = render(<ItemView item={item()} shown={item().pricing} />);
    expect(container.querySelector("[data-hl]")).toBeNull();
  });
});
