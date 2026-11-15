import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductTile } from "./index.js";

const item = (over = {}) => ({
  id: "i1",
  name: "Samsung Galaxy",
  imageUrl: "/p.jpg",
  availability: "available",
  pricing: { regularPrice: 30000, salePrice: 30000, savings: 0, discountPercent: 0 },
  flash: null,
  business: { name: "Phone Hub", verified: false, featured: false },
  ...over
});
const ranged = (over = {}) => ({ regularPrice: 30000, salePrice: 30000, savings: 0, discountPercent: 0, hasRange: true, priceMin: 24000, priceMax: 52000, ...over });

describe("ProductTile price: range and single", () => {
  it('shows "From KES 24,000" when the combinations are priced differently', () => {
    render(<ProductTile item={item({ pricing: ranged() })} href="/x" />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/From\s?KES\s?24,000/);
    expect(link).not.toHaveTextContent(/30,000/);
  });

  it("shows the single price, with no From, when there is no range", () => {
    render(<ProductTile item={item()} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent(/KES\s?30,000/);
    expect(screen.queryByText("From")).toBeNull();
  });

  it("a legacy item (no range fields at all) is drawn exactly as before", () => {
    const { container } = render(<ProductTile item={item({ pricing: { regularPrice: 150, salePrice: 150, savings: 0, discountPercent: 0 } })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent(/KES\s?150/);
    expect(screen.queryByText("From")).toBeNull();
    expect(container.querySelector("s")).toBeNull();
    expect(screen.queryByText("Options")).toBeNull();
  });

  it("in a flash sale shows the lowest flash price and no struck-through regular price next to a From", () => {
    render(<ProductTile item={item({ pricing: ranged({ salePrice: 20000, savings: 10000, discountPercent: 33, priceMin: 20000 }) })} href="/x" />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/From\s?KES\s?20,000/);
    expect(link.querySelector("s")).toBeNull();
    expect(link).not.toHaveTextContent("-33%");
  });

  it("a single price in a flash sale keeps its percentage badge", () => {
    render(<ProductTile item={item({ pricing: { regularPrice: 1000, salePrice: 800, savings: 200, discountPercent: 20 } })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("-20%");
  });

  it("counts the options when the count is known", () => {
    const { rerender } = render(<ProductTile item={item({ hasOptions: true, optionCount: 6, pricing: ranged() })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("6 options");
    rerender(<ProductTile item={item({ hasOptions: true, optionCount: 1, pricing: ranged() })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("1 option");
    rerender(<ProductTile item={item({ hasOptions: true, optionCount: 6, pricing: ranged() })} href="/x" labels={{ optionsMany: "Chaguo {n}" }} />);
    expect(screen.getByRole("link")).toHaveTextContent("Chaguo 6");
    rerender(<ProductTile item={item({ hasOptions: true, pricing: ranged() })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("Options");
  });

  it("a flash sale on a single price still shows the regular price struck through", () => {
    const { container } = render(<ProductTile item={item({ pricing: { regularPrice: 1000, salePrice: 800, savings: 200, discountPercent: 20 } })} href="/x" />);
    expect(container.querySelector("s")).not.toBeNull();
  });

  it('adds a small "Options" hint when the item has options, in the caller\'s words', () => {
    render(<ProductTile item={item({ hasOptions: true, pricing: ranged() })} href="/x" labels={{ from: "Kuanzia", options: "Chaguo" }} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("Kuanzia");
    expect(link).toHaveTextContent("Chaguo");
  });
});
