import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items } from "../api/index.js";
import HomeProducts, { itemPath } from "./HomeProducts.jsx";

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
  business: { id: `b${n}`, slug: `shop-${n}`, name: `Shop ${n}` },
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
  it("shows each product with its price and the store it is from", async () => {
    vi.mocked(items.getHome).mockResolvedValue([product(1), product(2)]);
    view();
    expect(await screen.findByText("Product 1")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByText("Product 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "From Shop 1" })).toHaveAttribute("href", "/b/shop-1");
  });

  it("opens the product on its store page when picked", async () => {
    vi.mocked(items.getHome).mockResolvedValue([product(1)]);
    view();
    await userEvent.click(await screen.findByRole("button", { name: /Product 1/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/b/shop-1?item=item-1"));
  });

  it("renders nothing when there are no products", async () => {
    vi.mocked(items.getHome).mockResolvedValue([]);
    const { container } = view();
    await waitFor(() => expect(items.getHome).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("renders nothing when products cannot be loaded, so the home page still works", async () => {
    vi.mocked(items.getHome).mockRejectedValue(new Error("boom"));
    const { container } = view();
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("builds an item link that survives odd ids", () => {
    expect(itemPath(product(1, { id: "a b" }))).toBe("/b/shop-1?item=a%20b");
  });
});
