import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items } from "../api/index.js";
import HomeProducts from "./HomeProducts.jsx";
import { itemPagePath } from "./ProductTile.jsx";
import { countsSummary, facetsSummary, pageOf } from "../lib/productQuery.js";

vi.mock("../api/index.js", () => ({ items: { getPage: vi.fn(), getFacets: vi.fn(), getCounts: vi.fn() }, getCategories: vi.fn(async () => [{ id: "bakery", name: "Bakery" }, { id: "hardware", name: "Hardware" }]), logContactEvent: vi.fn() }));

const product = (n, over = {}) => ({
  id: `item-${n}`,
  businessId: `b${n}`,
  businessSlug: `shop-${n}`,
  name: `Product ${n}`,
  imageUrl: null,
  availability: "available",
  pricing: { regularPrice: 100, salePrice: 100, savings: 0, discountPercent: 0 },
  flash: null,
  business: { id: `b${n}`, slug: `shop-${n}`, name: `Shop ${n}`, verified: false, featured: false, categoryId: "bakery" },
  ...over
});

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
};

const view = (initial = "/") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route path="/" element={<HomeProducts />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

// The server answers pages, facets and counts with the same pure functions the endpoint runs; the tests give the fake
// server a product list and let it answer the way the endpoint would.
const serve = (list) => {
  vi.mocked(items.getPage).mockImplementation(async (filters, opts) => pageOf(list, filters, opts));
  vi.mocked(items.getFacets).mockImplementation(async () => facetsSummary(list));
  vi.mocked(items.getCounts).mockImplementation(async (filters) => countsSummary(list, filters));
};

beforeEach(() => {
  for (const fn of [items.getPage, items.getFacets, items.getCounts]) vi.mocked(fn).mockReset();
  serve([]);
});

describe("HomeProducts", () => {
  it("shows each product as one card with its price and its store inside it", async () => {
    serve([
      product(1, { business: { id: "b1", slug: "shop-1", name: "Shop 1", verified: true, featured: true } }),
      product(2)
    ]);
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
    serve([product(1)]);
    view();
    await userEvent.click(await screen.findByRole("link", { name: /Product 1/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/b/shop-1/i/item-1"));
  });

  it("lists every product, 24 at a time", async () => {
    serve(Array.from({ length: 30 }, (_, i) => product(i + 1, { createdAt: `2026-01-${String(30 - i).padStart(2, "0")}T00:00:00Z` })));
    view();
    await screen.findByText("Product 1");
    expect(screen.getAllByRole("link")).toHaveLength(24);
    await userEvent.click(screen.getByRole("button", { name: "Show more products" }));
    expect(screen.getAllByRole("link")).toHaveLength(30);
    expect(screen.queryByRole("button", { name: "Show more products" })).not.toBeInTheDocument();
  });

  it("renders nothing when there are no products", async () => {
    serve([]);
    const { container } = view();
    await waitFor(() => expect(items.getPage).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says so and offers a retry when products cannot be loaded", async () => {
    vi.mocked(items.getPage).mockRejectedValue(new Error("boom"));
    view();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("builds an item page link that survives odd ids", () => {
    expect(itemPagePath(product(1, { id: "a b" }))).toBe("/b/shop-1/i/a%20b");
  });
});

describe("HomeProducts filters", () => {
  const stock = () =>
    serve([
      product(1, { name: "Bread", pricing: { regularPrice: 65, salePrice: 65, savings: 0, discountPercent: 0 } }),
      product(2, { name: "Cake", pricing: { regularPrice: 1800, salePrice: 1440, savings: 360, discountPercent: 20 } }),
      product(3, { name: "Knife", pricing: { regularPrice: 1470, salePrice: 1470, savings: 0, discountPercent: 0 } })
    ]);

  it("opens the filter panel from a button beside the heading, and narrows the list as options are chosen", async () => {
    stock();
    view();
    await screen.findByText("Bread");
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    await userEvent.click(within(dialog).getByLabelText(/^On sale/));
    await waitFor(() => expect(screen.queryByText("Bread")).not.toBeInTheDocument());
    expect(screen.getByText("Cake")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("1");
    expect(screen.getByRole("button", { name: "Remove filter: On sale" })).toBeInTheDocument();
  });

  it("reads filters from the address and clears them", async () => {
    stock();
    view("/?pmin=1000&psort=price_desc");
    await screen.findByText("Knife");
    expect(screen.queryByText("Bread")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link").map((a) => a.textContent)[0]).toMatch(/Knife/);
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(await screen.findByText("Bread")).toBeInTheDocument();
  });

  it("keeps the grid right when two stores use the same item id", async () => {
    serve([
      product(1, { id: "s0", name: "Bread" }),
      product(2, { id: "s0", name: "Cake" }),
      product(3, { id: "s0", name: "Knife" })
    ]);
    view();
    await screen.findByText("Bread");
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    await userEvent.type(within(dialog).getByLabelText("Search products"), "knife");
    await waitFor(() => expect(screen.queryByText("Bread")).not.toBeInTheDocument());
    expect(screen.queryByText("Cake")).not.toBeInTheDocument();
    expect(screen.getByText("Knife")).toBeInTheDocument();
  });

  it("explains when nothing matches", async () => {
    stock();
    view("/?pq=zzzz");
    expect(await screen.findByText("No products match these filters.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(await screen.findByText("Bread")).toBeInTheDocument();
  });

  it("updates the count in the footer as you type and tick, and says so when nothing matches", async () => {
    stock();
    view();
    await screen.findByText("Bread");
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    expect(within(dialog).getByRole("status")).toHaveTextContent("Show 3 products");
    await userEvent.type(within(dialog).getByLabelText("Search products"), "cak");
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Show 1 product"));
    await userEvent.type(within(dialog).getByLabelText("Search products"), "zz");
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("No products match"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Show 3 products"));
  });

  it("lists every category the admin has, including new ones with no products yet, and filters by them", async () => {
    stock();
    view();
    await screen.findByText("Bread");
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    expect(within(dialog).getByLabelText(/^Bakery/)).toBeEnabled();
    expect(within(dialog).getByLabelText(/^Hardware/)).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText(/^Bakery/));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Show 3 products"));
  });

  it("sets a price range from a quick range button", async () => {
    stock();
    view();
    await screen.findByText("Bread");
    await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
    const dialog = await screen.findByRole("dialog", { hidden: true });
    await userEvent.click(within(dialog).getByRole("button", { name: "1,000 – 5,000" }));
    await waitFor(() => expect(within(dialog).getByRole("status")).toHaveTextContent("Show 2 products"));
    expect(screen.getByRole("button", { name: /Remove filter: KES 1000 to 5000/ })).toBeInTheDocument();
  });
});
