import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { items } from "../api/index.js";
import HomeProducts from "./HomeProducts.jsx";
import { itemPagePath } from "./ProductTile.jsx";
import { GRID_PAGE_SIZES, countsSummary, facetsSummary, pageOf } from "../lib/productQuery.js";

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

// A screen `px` wide, for the media queries the grid reads (jsdom has none: with it unset the grid is the 2-column phone layout).
const realMatchMedia = window.matchMedia;
const atWidth = (px) => {
  window.matchMedia = vi.fn((query) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query);
    const max = /max-width:\s*([\d.]+)rem/.exec(query);
    const matches = min ? px >= Number(min[1]) * 16 : max ? px <= Number(max[1]) * 16 : false;
    return { matches, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} };
  });
};

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

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

  const many = (n) => Array.from({ length: n }, (_, i) => product(i + 1, { createdAt: new Date(Date.UTC(2026, 0, 1) + i * 3_600_000).toISOString() }));
  const cards = () => screen.queryAllByRole("link", { name: /Product \d+/ });

  it("lists every product, 50 at a time on a phone", async () => {
    serve(many(60));
    view();
    await waitFor(() => expect(cards()).toHaveLength(50));
    await userEvent.click(screen.getByRole("button", { name: "Show more products" }));
    await waitFor(() => expect(cards()).toHaveLength(60));
    expect(new Set(cards().map((a) => a.textContent)).size).toBe(60);
    expect(screen.queryByRole("button", { name: "Show more products" })).not.toBeInTheDocument();
  });

  it.each([
    [390, 2, 50],
    [600, 3, 51],
    [800, 4, 52],
    [1100, 4, 52],
    [1400, 6, 54]
  ])("on a %ipx screen (%i columns) a page is %i cards, a whole number of rows", async (px, columns, size) => {
    atWidth(px);
    expect(GRID_PAGE_SIZES[columns]).toBe(size);
    expect(size % columns).toBe(0);
    serve(many(200));
    view();
    await waitFor(() => expect(cards()).toHaveLength(size));
    expect(vi.mocked(items.getPage).mock.calls.every(([, opts]) => opts.pageSize === size)).toBe(true);
  });

  it("offers page links, and a page link jumps straight to that page", async () => {
    serve(many(150));
    view();
    await waitFor(() => expect(cards()).toHaveLength(50));
    const pager = screen.getByRole("navigation", { name: "Product pages" });
    expect(within(pager).getAllByRole("button", { name: /^Page / }).map((b) => b.textContent)).toEqual(["1", "2", "3"]);
    expect(within(pager).getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Showing 1–50 of 150")).toBeInTheDocument();
    await userEvent.click(within(pager).getByRole("button", { name: "Page 3" }));
    await waitFor(() => expect(cards()).toHaveLength(50));
    expect(within(pager).getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Showing 101–150 of 150")).toBeInTheDocument();
  });

  it("has Previous and Next beside the numbers", async () => {
    serve(many(150));
    view();
    await waitFor(() => expect(cards()).toHaveLength(50));
    const pager = screen.getByRole("navigation", { name: "Product pages" });
    expect(within(pager).getByRole("button", { name: "Previous page" })).toBeDisabled();
    await userEvent.click(within(pager).getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(screen.getByText("Showing 51–100 of 150")).toBeInTheDocument());
  });

  it("asks for every page with the visit's rotation hour, so the order never changes while the visitor pages through it", async () => {
    serve(many(150));
    view();
    await waitFor(() => expect(cards()).toHaveLength(50));
    await userEvent.click(screen.getByRole("button", { name: "Show more products" }));
    await waitFor(() => expect(cards()).toHaveLength(100));
    const epochs = vi.mocked(items.getPage).mock.calls.map(([, opts]) => opts.epoch);
    expect(new Set(epochs).size).toBe(1);
    expect(Number.isInteger(epochs[0])).toBe(true);
  });

  it("keeps the list shallow: after the last page it invites the visitor to search, filter or browse instead", async () => {
    serve(many(500));
    view("/?ppage=8");
    await waitFor(() => expect(cards()).toHaveLength(50));
    expect(screen.getByText("That’s the top of the list for now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search products" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more products" })).not.toBeInTheDocument();
    const pager = screen.getByRole("navigation", { name: "Product pages" });
    expect(within(pager).getAllByRole("button", { name: /^Page / })).toHaveLength(8);
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
  describe("brand filter (A18)", () => {
    const phones = () => serve([
      product(1, { name: "Phone", brand: "Samsung" }),
      product(2, { name: "TV", brand: "SAMSUNG" }),
      product(3, { name: "Radio", brand: " samsung " }),
      product(4, { name: "Shoe", brand: "Nike" }),
      product(5, { name: "Bag" })
    ]);

    it('offers "Samsung", "SAMSUNG" and "samsung" as one choice with one count, and narrows to all of them', async () => {
      phones();
      view();
      await screen.findByText("Phone");
      await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
      const dialog = await screen.findByRole("dialog", { hidden: true });
      const boxes = within(dialog).getAllByLabelText(/^(Samsung|SAMSUNG|samsung|Nike)/);
      expect(boxes.map((b) => b.closest("label").textContent.replace(/\s+/g, ""))).toEqual(["Samsung3", "Nike1"]);
      await userEvent.click(within(dialog).getByLabelText(/^Samsung/));
      await waitFor(() => expect(screen.queryByText("Shoe")).not.toBeInTheDocument());
      for (const name of ["Phone", "TV", "Radio"]) expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove filter: Samsung" })).toBeInTheDocument();
    });

    it("reads the brand from the address, and the chip removes it", async () => {
      phones();
      view("/?pbrand=nike");
      await screen.findByText("Shoe");
      expect(screen.queryByText("Phone")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Remove filter: Nike" }));
      expect(await screen.findByText("Phone")).toBeInTheDocument();
    });

    it("shows no Brand section when there is nothing to choose between", async () => {
      serve([product(1, { name: "Phone", brand: "Samsung" }), product(2, { name: "Bag" })]);
      view();
      await screen.findByText("Phone");
      await userEvent.click(screen.getByRole("button", { name: /Filters/ }));
      const dialog = await screen.findByRole("dialog", { hidden: true });
      expect(within(dialog).queryByText("Brand")).not.toBeInTheDocument();
    });
  });
});
