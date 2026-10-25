import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { StoreShowcase, planShowcase } from "./index.js";
import { business } from "./test/fixtures.js";

const product = (n, over = {}) => ({
  id: `p${n}`,
  name: `Product ${n}`,
  imageUrl: `/p${n}.jpg`,
  availability: "available",
  pricing: { salePrice: 100 * n, regularPrice: 100 * n, savings: 0, discountPercent: 0 },
  ...over
});
const products = (n) => Array.from({ length: n }, (_, i) => product(i + 1));
const itemHref = (item) => `/b/fade-kings/i/${item.id}`;
const view = (list, extra = {}) => render(<StoreShowcase business={business} products={list} href="/b/fade-kings" itemHref={itemHref} {...extra} />);

describe("planShowcase", () => {
  it.each([
    [0, ["store:hero"]],
    [1, ["product:tall", "store:tall"]],
    [2, ["product:cell", "product:cell", "store:wide"]],
    [3, ["product:cell", "product:cell", "product:cell", "store:cell"]],
    [4, ["product:cell", "product:cell", "product:cell", "product:cell"]],
    [1000, ["product:cell", "product:cell", "product:cell", "product:cell"]]
  ])("fills the card for %i products", (n, expected) => {
    expect(planShowcase(products(Math.min(n, 50))).map((c) => `${c.kind}:${c.span}`)).toEqual(expected);
  });
});

describe("StoreShowcase", () => {
  it("opens the store from the header and each product from its own picture", () => {
    view(products(4));
    expect(screen.getByRole("heading", { name: /Fade Kings/ }).querySelector("a")).toHaveAttribute("href", "/b/fade-kings");
    expect(screen.getByRole("link", { name: /Product 2/ })).toHaveAttribute("href", "/b/fade-kings/i/p2");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows the contact buttons at the bottom with full names and tracks them", () => {
    const onContact = vi.fn();
    view(products(4), { onContact });
    const group = screen.getByRole("group", { name: "Contact Fade Kings" });
    expect(within(group).getAllByRole("link")).toHaveLength(3);
    fireEvent.click(within(group).getByRole("link", { name: "WhatsApp Fade Kings" }));
    expect(onContact).toHaveBeenCalledWith(business, "whatsapp");
    expect(within(group).getByRole("link", { name: "Directions to Fade Kings" })).toBeInTheDocument();
  });

  it("completes the card with a visit-store cell when there are fewer than four products", () => {
    view(products(2));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Visit store/ })).toHaveAttribute("href", "/b/fade-kings");
  });

  it("shows a store with no products at all as one store cell with its tagline", () => {
    view([]);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Sharp cuts")).toBeInTheDocument();
  });

  it("says products are coming soon for a new store with no tagline either", () => {
    view([], { business: { ...business, tagline: "" } });
    expect(screen.getByText("Products coming soon")).toBeInTheDocument();
  });

  it("shows the sale percentage and prices, and leaves a sold-out product out", () => {
    view([
      product(1, { pricing: { salePrice: 80, regularPrice: 100, savings: 20, discountPercent: 20 } }),
      product(2, { availability: "out_of_stock" }),
      product(3, { imageUrl: null }),
      product(4)
    ]);
    expect(screen.getByText("-20%")).toBeInTheDocument();
    expect(screen.getByText(/KES\s?80/)).toBeInTheDocument();
    expect(screen.queryByText("Sold out")).not.toBeInTheDocument();
    expect(screen.queryByText("Product 2")).not.toBeInTheDocument();
  });

  it("swaps a broken product picture for a placeholder", () => {
    const { container } = view(products(4));
    const img = container.querySelector("img[src='/p1.jpg']");
    fireEvent.error(img);
    // the picture stays out of sight and the EpicMKT placeholder keeps the cell's shape
    expect(img.closest("[data-state]")).toHaveAttribute("data-state", "error");
  });

  it("shows placeholders instead of cells while products load", () => {
    const { container } = view([], { loading: true });
    expect(container.querySelector("ul[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText("Visit store")).not.toBeInTheDocument();
  });

  it("copes with a long name and no logo, cover or contact details", () => {
    const fresh = { id: "n1", slug: "new", name: "A Very Long Business Name That Cannot Possibly Fit On One Line", plan: "standard", verified: false, isOpen: false, categoryName: "Bakery", area: "Kisumu" };
    view([], { business: fresh, href: "/b/new" });
    expect(screen.getByRole("heading", { name: /A Very Long Business Name/ })).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });
});
