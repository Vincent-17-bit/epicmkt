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
    expect(screen.getByText(/KES\s?1,440/)).toBeInTheDocument();
    expect(screen.getByText(/KES\s?1,800/)).toBeInTheDocument();
    expect(screen.getByText("CLOCK")).toBeInTheDocument();
  });

  it("does not show sale parts at the regular price", () => {
    render(<ProductTile item={item()} href="/x" renderFlash={() => <span>CLOCK</span>} />);
    expect(screen.queryByText(/-\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText("CLOCK")).not.toBeInTheDocument();
  });

  it("labels a sold-out product instead of showing an availability dot", () => {
    render(<ProductTile item={item({ availability: "out_of_stock" })} href="/x" />);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
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
        labels={{ was: "Ilikuwa", verified: "Imethibitishwa", featured: "Maarufu", availability: () => "Ipo" }}
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
