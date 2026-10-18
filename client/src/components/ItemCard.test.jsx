import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ItemCard from "./ItemCard.jsx";

const item = {
  id: "kids cut",
  businessSlug: "fade-kings",
  name: "Kids cut",
  imageUrl: "a.png",
  availability: "available",
  pricing: { regularPrice: 100, salePrice: 80, savings: 20, discountPercent: 20 }
};

describe("ItemCard", () => {
  it("is a link to the item page, not a dialog button", () => {
    render(
      <MemoryRouter>
        <ItemCard item={item} />
      </MemoryRouter>
    );
    const link = screen.getByRole("link", { name: /Kids cut/ });
    expect(link).toHaveAttribute("href", "/b/fade-kings/item/kids%20cut");
    expect(link).not.toHaveAttribute("aria-haspopup");
    expect(screen.getByText("-20%")).toBeInTheDocument();
  });

  it("reports the click for analytics without blocking navigation", async () => {
    const onSelect = vi.fn();
    render(
      <MemoryRouter>
        <ItemCard item={item} onSelect={onSelect} />
      </MemoryRouter>
    );
    await userEvent.setup().click(screen.getByRole("link"));
    expect(onSelect).toHaveBeenCalledWith(item);
  });
});
