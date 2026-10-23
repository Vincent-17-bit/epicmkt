import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items } from "../api/index.js";
import HomeProducts from "./HomeProducts.jsx";
import { itemPagePath } from "./ProductTile.jsx";

vi.mock("../api/index.js", () => ({ items: { getHome: vi.fn() }, logContactEvent: vi.fn() }));

const product = (n, over = {}) => ({
  id: `item-${n}`,
  businessId: `b${n}`,
  businessSlug: `shop-${n}`,
  name: `Product ${n}`,
  imageUrl: null,
  availability: "available",
  pricing: { regularPrice: 100, salePrice: 100, savings: 0, discountPercent: 0 },
  flash: null,
  business: { id: `b${n}`, slug: `shop-${n}`, name: `Shop ${n}`, verified: false, featured: false },
  ...over
});

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
};

const view = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomeProducts />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.mocked(items.getHome).mockReset();
});

describe("HomeProducts", () => {
  it("shows each product as one card with its price and its store inside it", async () => {
    vi.mocked(items.getHome).mockResolvedValue({
      items: [product(1, { business: { id: "b1", slug: "shop-1", name: "Shop 1", verified: true, featured: true } }), product(2)],
      nextOffset: null
    });
    view();
    const card = (await screen.findByText("Product 1")).closest("a");
    expect(card).toHaveAttribute("href", "/b/shop-1/i/item-1");
    expect(within(card).getByText("Shop 1")).toBeInTheDocument();
    expect(within(card).getByText("Verified store")).toBeInTheDocument();
    expect(within(card).getByText(/Featured store/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more products" })).not.toBeInTheDocument();
  });

  it("opens a product on its own page, not a sheet", async () => {
    vi.mocked(items.getHome).mockResolvedValue({ items: [product(1)], nextOffset: null });
    view();
    await userEvent.click(await screen.findByRole("link", { name: /Product 1/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/b/shop-1/i/item-1"));
  });

  it("lists every product by loading more pages, without repeating any", async () => {
    vi.mocked(items.getHome).mockImplementation(async ({ offset }) =>
      offset === 0
        ? { items: [product(1), product(2)], nextOffset: 2 }
        : { items: [product(2), product(3)], nextOffset: null }
    );
    view();
    await screen.findByText("Product 1");
    await userEvent.click(screen.getByRole("button", { name: "Show more products" }));
    await screen.findByText("Product 3");
    expect(screen.getAllByText("Product 2")).toHaveLength(1);
    expect(vi.mocked(items.getHome)).toHaveBeenLastCalledWith({ limit: 24, offset: 2 });
    expect(screen.queryByRole("button", { name: "Show more products" })).not.toBeInTheDocument();
  });

  it("keeps the products on screen and offers a retry when a later page fails", async () => {
    vi.mocked(items.getHome).mockImplementation(async ({ offset }) => {
      if (offset === 0) return { items: [product(1)], nextOffset: 1 };
      throw new Error("boom");
    });
    view();
    await screen.findByText("Product 1");
    await userEvent.click(screen.getByRole("button", { name: "Show more products" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load more products.");
    expect(screen.getByText("Product 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders nothing when there are no products", async () => {
    vi.mocked(items.getHome).mockResolvedValue({ items: [], nextOffset: null });
    const { container } = view();
    await waitFor(() => expect(items.getHome).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when products cannot be loaded, so the home page still works", async () => {
    vi.mocked(items.getHome).mockRejectedValue(new Error("boom"));
    const { container } = view();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("builds an item page link that survives odd ids", () => {
    expect(itemPagePath(product(1, { id: "a b" }))).toBe("/b/shop-1/i/a%20b");
  });
});
