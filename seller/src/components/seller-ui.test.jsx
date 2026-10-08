import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BusinessPage, ProductCard, ShopCard } from "@epicmkt/ui";
import ListingCard from "./ListingCard.jsx";
import ViewAsFrame from "./ViewAsFrame.jsx";

const item = { id: "i1", name: "Fade", availability: "available", pricing: { salePrice: 300, regularPrice: 300, savings: 0, discountPercent: 0 } };
const business = {
  id: "b1", name: "Fade Kings", plan: "standard", verified: false, isOpen: true, rating: 4, reviewCount: 1, phone: "0712345678", whatsapp: "0712345678",
  lat: 0, lng: 0, area: "Maseno", county: "Kisumu", categoryName: "Barbershops", offers: [], gallery: [], services: [], category: { singular: "Barbershop" }
};

describe("ViewAsFrame", () => {
  it("shows the caller notice and keeps customer components inert", () => {
    const onSelect = vi.fn();
    const onContact = vi.fn();
    const { container } = render(
      <ViewAsFrame device="mobile" notice="Preview only">
        <ProductCard item={item} mode="preview" onSelect={onSelect} />
        <ShopCard business={business} href="/b/x" mode="preview" onContact={onContact} />
      </ViewAsFrame>
    );
    expect(screen.getByRole("note")).toHaveTextContent("Preview only");
    container.querySelectorAll("a, button").forEach((el) => fireEvent.click(el));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onContact).not.toHaveBeenCalled();
    expect(container.querySelectorAll("a[href]")).toHaveLength(0);
  });

  it("omits the notice when none is given", () => {
    render(
      <ViewAsFrame notice={null}>
        <p>content</p>
      </ViewAsFrame>
    );
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("frames a business page in desktop width", () => {
    const { container } = render(
      <ViewAsFrame device="desktop">
        <BusinessPage business={business} icon={{ prefix: "fas", iconName: "store", icon: [1, 1, [], "f000", "M0 0"] }} mode="preview" shortUrl="https://x.example/s/a" hoursRows={[]} statusText="Open now" reviewsText="4.0 (1)" locate={{ label: "Show" }} />
      </ViewAsFrame>
    );
    expect(container.querySelector('[data-device="desktop"]')).not.toBeNull();
    expect(container.querySelector('[data-mode="preview"]')).not.toBeNull();
  });
});

describe("ListingCard", () => {
  it("shows seller chips in the overlay and actions in quickActions", () => {
    render(<ListingCard item={item} flags={{ hiddenByMe: true, reports: 2, stalePrice: true }} />);
    expect(screen.getByText("Hidden by me")).toBeInTheDocument();
    expect(screen.getByText("2 reports")).toBeInTheDocument();
    expect(screen.getByText("Stale price")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show" })).toBeEnabled();
  });

  it("shows the removed-by-admin chip and disables actions", () => {
    render(<ListingCard item={item} flags={{ removedByAdmin: true }} />);
    expect(screen.getByText("Removed by admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Edit price" })).toBeDisabled();
  });

  it("calls back from quick actions", () => {
    const onToggleHidden = vi.fn();
    const onEditPrice = vi.fn();
    render(<ListingCard item={item} onToggleHidden={onToggleHidden} onEditPrice={onEditPrice} />);
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit price" }));
    expect(onToggleHidden).toHaveBeenCalledWith(item);
    expect(onEditPrice).toHaveBeenCalledWith(item);
  });

  it("has no chips when there are no flags", () => {
    const { container } = render(<ListingCard item={item} />);
    expect(container.querySelector('[data-slot="overlay"]')).toBeNull();
  });
});
