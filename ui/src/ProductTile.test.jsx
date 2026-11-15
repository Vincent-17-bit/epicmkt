import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProductTile } from "./index.js";

const item = (over = {}) => ({
  id: "i1",
  name: "Chapati and beans",
  imageUrl: "/p.jpg",
  availability: "available",
  pricing: { regularPrice: 150, salePrice: 150, savings: 0, discountPercent: 0 },
  flash: null,
  business: { name: "Mama Pima Kitchen", verified: false, featured: false },
  ...over
});

describe("ProductTile", () => {
  it("is one link carrying the product, its price and its store", () => {
    render(<ProductTile item={item()} href="/b/mama-pima/i/i1" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/b/mama-pima/i/i1");
    expect(link).toHaveTextContent("Chapati and beans");
    expect(link).toHaveTextContent(/KES\s?150/);
    expect(link).toHaveTextContent("Mama Pima Kitchen");
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("marks a verified store with a tick and a featured store with the star, each named for screen readers", () => {
    render(<ProductTile item={item({ business: { name: "Shop", verified: true, featured: true } })} href="/x" />);
    expect(screen.getByText("Verified store")).toBeInTheDocument();
    expect(screen.getByText(/Featured store/)).toBeInTheDocument();
  });

  it("shows neither mark for an ordinary store", () => {
    render(<ProductTile item={item()} href="/x" />);
    expect(screen.queryByText("Verified store")).not.toBeInTheDocument();
    expect(screen.queryByText(/Featured store/)).not.toBeInTheDocument();
  });

  it("shows the sale badge, both prices and the flash chip only when on sale", () => {
    const onSale = item({
      pricing: { regularPrice: 1800, salePrice: 1440, savings: 360, discountPercent: 20 },
      flash: { sale: { endsAt: "2099-01-01T00:00:00Z" } }
    });
    render(<ProductTile item={onSale} href="/x" renderFlash={(cls) => <span className={cls}>CLOCK</span>} />);
    expect(screen.getByText("-20%")).toBeInTheDocument();
    // The price is drawn as a small "KES" and the amount, so it is read from the card's text.
    expect(screen.getByRole("link")).toHaveTextContent(/KES\s?1,440/);
    expect(screen.getByText(/KES\s?1,800/)).toBeInTheDocument();
    expect(screen.getByText("CLOCK")).toBeInTheDocument();
  });

  it("does not show sale parts at the regular price", () => {
    render(<ProductTile item={item()} href="/x" renderFlash={() => <span>CLOCK</span>} />);
    expect(screen.queryByText(/-\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText("CLOCK")).not.toBeInTheDocument();
  });

  it("shows nothing about availability when the product is available", () => {
    const { container } = render(<ProductTile item={item()} href="/x" />);
    expect(container.querySelector("[data-stock-tag]")).toBeNull();
    expect(screen.queryByText(/stock|available|left/i)).not.toBeInTheDocument();
  });

  it("shows nothing extra for a by-appointment product either", () => {
    const { container } = render(<ProductTile item={item({ availability: "by_appointment" })} href="/x" />);
    expect(container.querySelector("[data-stock-tag]")).toBeNull();
  });

  it("tags a product that is running low, with the number when the seller shares it", () => {
    const { rerender } = render(<ProductTile item={item({ availability: "limited_stock" })} href="/x" />);
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    rerender(<ProductTile item={item({ availability: "limited_stock", stockLeft: 3 })} href="/x" />);
    expect(screen.getByText("Only 3 left")).toBeInTheDocument();
    expect(screen.queryByText("Low stock")).not.toBeInTheDocument();
  });

  it("takes the tag's words from the caller", () => {
    render(<ProductTile item={item({ availability: "limited_stock", stockLeft: 2 })} href="/x" labels={{ lowStock: "Imebaki kidogo", onlyLeft: "Zimebaki {n}" }} />);
    expect(screen.getByText("Zimebaki 2")).toBeInTheDocument();
  });

  it("draws nothing for a sold-out product, however it got here", () => {
    for (const availability of ["out_of_stock", "unavailable"]) {
      const { container, unmount } = render(<ProductTile item={item({ availability })} href="/x" />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it("copes with a missing picture and a missing price", () => {
    render(<ProductTile item={item({ imageUrl: null, pricing: null })} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("Chapati and beans");
    expect(document.querySelector("img")).toBeNull();
  });

  it("uses the caller's link component and labels", () => {
    const renderLink = ({ href, children, ...rest }) => (
      <a data-router="yes" href={`#${href}`} {...rest}>
        {children}
      </a>
    );
    render(
      <ProductTile
        item={item({ business: { name: "Duka", verified: true } })}
        href="/p"
        renderLink={renderLink}
        labels={{ was: "Ilikuwa", verified: "Imethibitishwa", featured: "Maarufu" }}
      />
    );
    expect(screen.getByRole("link")).toHaveAttribute("data-router", "yes");
    expect(screen.getByText("Imethibitishwa")).toBeInTheDocument();
  });

  it("goes nowhere in preview mode", () => {
    render(<ProductTile item={item()} href="/x" mode="preview" />);
    const link = document.querySelector("a");
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
  });
});

describe("ProductTile in search results", () => {
  const base = { id: "s1", name: "JBL Flip 6", availability: "available", pricing: { regularPrice: 14500, salePrice: 14500, savings: 0, discountPercent: 0 }, business: { name: "Nakuru Electronics", isOpen: true } };

  it("adds the item's own facts, colours, delivery line and button, still as one link", () => {
    render(
      <ProductTile
        item={{ ...base, videos: [{ id: "v1", url: "https://x.test/v.mp4" }] }}
        href="/b/n/i/s1"
        facts={["Bluetooth", "30 W"]}
        swatches={[{ id: "a", label: "Black", color: "#111" }, { id: "b", label: "Blue", color: "#24c" }, { id: "c", label: "Red", color: "#c22" }]}
        delivery={{ kind: "delivery", text: "Delivery KES 300 · 15 km" }}
        cta="See options"
      />
    );
    const link = screen.getByRole("link");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(link).toHaveTextContent("Bluetooth · 30 W");
    expect(screen.getByRole("img", { name: "3 colours" })).toBeInTheDocument();
    expect(link).toHaveTextContent("Delivery KES 300 · 15 km");
    expect(link).toHaveTextContent("See options");
    expect(link).toHaveTextContent("Has video");
    expect(screen.getByRole("img", { name: "Open now" })).toBeInTheDocument();
  });

  it("shows no extras when none are given, and asks for the price when there is none", () => {
    const { container } = render(<ProductTile item={{ ...base, pricing: null }} href="/x" />);
    expect(screen.getByRole("link")).toHaveTextContent("Ask for the price");
    expect(screen.queryByText("See options")).toBeNull();
    expect(container.querySelector("[data-kind]")).toBeNull();
  });

  it("calls onClick when the card is opened", () => {
    let opened = 0;
    render(<ProductTile item={base} href="/x" onClick={(e) => { e.preventDefault(); opened += 1; }} />);
    screen.getByRole("link").click();
    expect(opened).toBe(1);
  });
});
