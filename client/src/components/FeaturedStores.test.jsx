import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFeaturedBusinesses, items } from "../api/index.js";
import { seenMemory } from "../lib/seen.js";
import FeaturedStores, { FEATURED_PATH } from "./FeaturedStores.jsx";

vi.mock("../api/index.js", () => ({
  getFeaturedBusinesses: vi.fn(),
  items: { getShowcase: vi.fn() },
  logContactEvent: vi.fn()
}));

const shop = (n, over = {}) => ({
  id: `b${n}`,
  slug: `shop-${n}`,
  name: `Shop ${n}`,
  tagline: `Tagline ${n}`,
  plan: "premium",
  verified: true,
  isOpen: true,
  phone: "0712345678",
  whatsapp: "0712345678",
  lat: 0,
  lng: 34,
  area: "Maseno",
  categoryName: "Bakery",
  ...over
});

const product = (shopN, n) => ({
  id: `p${shopN}-${n}`,
  businessSlug: `shop-${shopN}`,
  name: `Item ${shopN}-${n}`,
  imageUrl: `/i${shopN}-${n}.jpg`,
  availability: "available",
  pricing: { salePrice: 50, regularPrice: 50, savings: 0, discountPercent: 0 }
});

const view = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <FeaturedStores />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.mocked(getFeaturedBusinesses).mockReset();
  vi.mocked(items.getShowcase).mockReset();
  seenMemory().clear();
  Element.prototype.scrollBy = vi.fn();
});

describe("FeaturedStores", () => {
  it("shows each store as a card whose header opens the store and whose pictures open products", async () => {
    vi.mocked(getFeaturedBusinesses).mockResolvedValue([shop(1), shop(2)]);
    vi.mocked(items.getShowcase).mockImplementation(async (ids) =>
      Object.fromEntries(ids.map((id) => [id, { total: 4, items: [1, 2, 3, 4].map((n) => product(id.slice(1), n)) }]))
    );
    view();

    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(2);
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Item \d-1/ }).length).toBeGreaterThan(0));
    const card = headings[0].closest("article");
    const header = within(card).getAllByRole("link")[0];
    expect(header).toHaveAttribute("href", expect.stringMatching(/^\/b\/shop-[12]$/));
    expect(within(card).getAllByRole("link", { name: /Item/ })[0]).toHaveAttribute("href", expect.stringMatching(/^\/b\/shop-[12]\/i\/p/));
    expect(within(card).getByRole("link", { name: /^Call Shop/ })).toBeInTheDocument();
  });

  it("links See more to the featured page", async () => {
    vi.mocked(getFeaturedBusinesses).mockResolvedValue([shop(1)]);
    vi.mocked(items.getShowcase).mockResolvedValue({ b1: { total: 0, items: [] } });
    view();
    await screen.findByRole("heading", { name: "Featured businesses" });
    expect(screen.getByRole("link", { name: /See more/ })).toHaveAttribute("href", FEATURED_PATH);
  });

  it("still shows a store that has no products yet", async () => {
    vi.mocked(getFeaturedBusinesses).mockResolvedValue([shop(1, { tagline: "Fresh bread daily" })]);
    vi.mocked(items.getShowcase).mockResolvedValue({ b1: { total: 0, items: [] } });
    view();
    expect(await screen.findByText("Fresh bread daily")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visit store/ })).toHaveAttribute("href", "/b/shop-1");
  });

  it("draws from a pool and shows at most eight stores, preferring ones not shown lately", async () => {
    const pool = Array.from({ length: 12 }, (_, i) => shop(i + 1));
    seenMemory().mark("b", pool.slice(0, 4).map((s) => s.id));
    vi.mocked(getFeaturedBusinesses).mockResolvedValue(pool);
    vi.mocked(items.getShowcase).mockImplementation(async (ids) => Object.fromEntries(ids.map((id) => [id, { total: 0, items: [] }])));
    view();
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings).toHaveLength(8);
    const names = headings.map((h) => h.textContent);
    expect(names.some((n) => /^Shop (1|2|3|4)(?!\d)/.test(n))).toBe(false);
  });

  it("renders nothing when there are no featured stores", async () => {
    vi.mocked(getFeaturedBusinesses).mockResolvedValue([]);
    const { container } = view();
    await waitFor(() => expect(getFeaturedBusinesses).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("offers a retry when loading fails", async () => {
    vi.mocked(getFeaturedBusinesses).mockRejectedValueOnce(new Error("boom"));
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load featured businesses.");
  });
});
