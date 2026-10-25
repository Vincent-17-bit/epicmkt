import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard, OfferChip, ProductCard, ProductTile } from "./index.js";

const item = (over = {}) => ({
  id: "i1",
  name: "Bread",
  imageUrl: "/p.jpg",
  availability: "available",
  pricing: { regularPrice: 65, salePrice: 65, savings: 0, discountPercent: 0 },
  flash: null,
  offer: null,
  business: { name: "Golden Crust", verified: false, featured: false },
  ...over
});

describe("OfferChip", () => {
  it("names the offer, and the extras, for screen readers and the eye", () => {
    render(<OfferChip offer={{ label: "Buy 2 Get 1 Free", extra: 2 }} />);
    expect(screen.getByText("Offer: Buy 2 Get 1 Free, +2 more")).toBeInTheDocument();
    expect(document.querySelector("[data-offer-chip]")).toHaveTextContent("Buy 2 Get 1 Free");
    expect(document.querySelector("[data-offer-chip]")).toHaveTextContent("+2");
  });

  it("shows nothing for a product with no offer", () => {
    const { container } = render(<OfferChip offer={null} />);
    expect(container).toBeEmptyDOMElement();
    render(<OfferChip offer={{ label: "" }} />);
    expect(document.querySelector("[data-offer-chip]")).toBeNull();
  });

  it("takes its words from the page, so it can be translated", () => {
    render(<OfferChip offer={{ label: "15% off", extra: 1 }} labels={{ offer: "Ofa", more: "zaidi" }} />);
    expect(screen.getByText("Ofa: 15% off, +1 zaidi")).toBeInTheDocument();
  });

  it("is never a click target of its own, so the card behind it takes the tap", () => {
    render(<OfferChip offer={{ label: "15% off" }} />);
    expect(document.querySelector("[data-offer-chip]").className).toMatch(/offerTag/);
  });
});

describe("the chip on product cards", () => {
  const offer = { id: "o1", label: "15% off", extra: 0 };

  it.each([
    ["ProductTile", (i) => <ProductTile item={i} href="/x" />],
    ["ItemCard", (i) => <ItemCard item={i} />],
    ["ProductCard", (i) => <ProductCard item={i} />]
  ])("%s shows it on a product in an offer and not on one that is not", (_name, make) => {
    const { unmount } = render(make(item({ offer })));
    expect(document.querySelectorAll("[data-offer-chip]")).toHaveLength(1);
    unmount();
    render(make(item()));
    expect(document.querySelectorAll("[data-offer-chip]")).toHaveLength(0);
  });

  it("does not change what the card prints: name, price and store are the same with and without it", () => {
    const { container, unmount } = render(<ProductTile item={item()} href="/x" />);
    const plain = container.textContent;
    unmount();
    const { container: withOffer } = render(<ProductTile item={item({ offer })} href="/x" />);
    expect(withOffer.textContent.replace("Offer: 15% off", "").replace("15% off", "")).toBe(plain);
  });

  it("keeps the sale badge and the offer chip together", () => {
    render(<ProductTile item={item({ offer, pricing: { regularPrice: 100, salePrice: 80, savings: 20, discountPercent: 20 } })} href="/x" />);
    expect(screen.getByText("-20%")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-offer-chip]")).toHaveLength(1);
  });

  it("is only a link when it is one link: the chip adds no second link or button", () => {
    render(<ProductTile item={item({ offer })} href="/x" />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
