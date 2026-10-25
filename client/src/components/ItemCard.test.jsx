import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard as SharedCard } from "@epicmkt/ui";
import ItemCard from "./ItemCard.jsx";
import { t } from "../i18n/index.js";

const item = {
  id: "i1", name: "Fade cut", imageUrl: "https://example.test/a.webp", availability: "limited_stock",
  pricing: { regularPrice: 500, salePrice: 400, savings: 100, discountPercent: 20, variants: [] },
};

describe("customer ItemCard", () => {
  it("is the shared card from @epicmkt/ui, so the seller portal shows the same markup", () => {
    const customer = render(<ItemCard item={item} />).container.querySelector("[data-card]");
    const shared = render(
      <SharedCard item={item} labels={{ was: t("item.was"), lowStock: t("item.lowStock"), onlyLeft: t("item.onlyLeft") }} />,
    ).container.querySelector("[data-card]");
    expect(customer.outerHTML).toBe(shared.outerHTML);
    expect(customer).toMatchSnapshot();
  });

  it("says nothing about availability for an available item", () => {
    const { container } = render(<ItemCard item={{ ...item, availability: "available" }} />);
    expect(container.querySelector("[data-stock-tag]")).toBeNull();
    expect(screen.queryByText(/stock|left/i)).not.toBeInTheDocument();
  });

  it("tags an item running low, with the number when the seller shares it", () => {
    const { rerender } = render(<ItemCard item={item} />);
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    rerender(<ItemCard item={{ ...item, stockLeft: 2 }} />);
    expect(screen.getByText("Only 2 left")).toBeInTheDocument();
  });
});
