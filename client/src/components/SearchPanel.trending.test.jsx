import { createRef } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TOWNS } from "@epicmkt/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items, logSearch } from "../api/index.js";
import { useGeoStore } from "../stores/geo.js";
import { trendPath } from "../hooks/useTrending.js";
import SearchPanel from "./SearchPanel.jsx";

vi.mock("../api/index.js", () => ({
  items: { suggest: vi.fn(), getTrending: vi.fn() },
  getCategories: vi.fn(async () => []),
  logSearch: vi.fn(),
  flash: { facets: vi.fn(async () => ({ total: 0 })) }
}));

// One ranking for every kind of search: a product, a store, a flash sale and a category side by side.
const POPULAR = [
  { rank: 1, term: "gas cylinder", count: 9, hot: true, kind: "product", label: "Gas Cylinder 6kg" },
  { rank: 2, term: "mama njeri bakery", count: 7, hot: false, kind: "store", slug: "mama-njeri" },
  { rank: 3, term: "flash sneakers", count: 5, hot: false, kind: "flash", label: "Flash Sneakers" },
  { rank: 4, term: "barber", count: 4, hot: false, kind: "category", label: "Barber" }
];
const RISING = [{ rank: 1, term: "solar lamp", count: 9, ratio: 9, hot: true, kind: "product", label: "Solar Lamp" }];
const lists = (extra = {}) => ({ computedAt: "2026-11-16T09:12:00Z", live: false, scope: "*", county: null, fallback: "none", popular: POPULAR, rising: RISING, items: POPULAR, ...extra });

const kisumuTown = TOWNS.find((t) => t.county === "Kisumu").name;

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
function panel(onSelect = vi.fn()) {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <SearchPanel open onClose={vi.fn()} onSelect={onSelect} panelRef={createRef()} inputRef={createRef()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onSelect, input: screen.getByRole("combobox") };
}
const section = async () => (await screen.findByRole("heading", { name: /Trending searches/ })).closest("section");

beforeEach(() => {
  localStorage.clear();
  useGeoStore.setState({ town: null, coords: null });
  vi.mocked(logSearch).mockReset();
  vi.mocked(items.suggest).mockReset().mockResolvedValue({ terms: [], products: [], stores: [], categories: [], corrected: null });
  vi.mocked(items.getTrending).mockReset().mockResolvedValue(lists());
});

describe("trending in the search panel", () => {
  it("ranks every kind of search in one list and says what each one is", async () => {
    panel();
    const s = await section();
    await within(s).findByText("gas cylinder");
    const rows = within(s).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === null);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("gas cylinder"),
      expect.stringContaining("mama njeri bakery"),
      expect.stringContaining("flash sneakers"),
      expect.stringContaining("barber")
    ]);
    expect(within(rows[0]).getByText("Product")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Store")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Flash sale")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Category")).toBeInTheDocument();
  });

  it("has two views, popular this week and rising now, and switches between them", async () => {
    panel();
    const s = await section();
    expect(await within(s).findByRole("button", { name: "Popular this week" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(s).getByRole("button", { name: "Rising now" }));
    expect(within(s).getByRole("button", { name: "Rising now" })).toHaveAttribute("aria-pressed", "true");
    expect(within(s).getByText("solar lamp")).toBeInTheDocument();
    expect(within(s).queryByText("gas cylinder")).toBeNull();
    await userEvent.click(within(s).getByRole("button", { name: "Popular this week" }));
    expect(within(s).getByText("gas cylinder")).toBeInTheDocument();
  });

  it("with nothing rising there is nothing to switch to: just a caption", async () => {
    vi.mocked(items.getTrending).mockResolvedValue(lists({ rising: [] }));
    panel();
    const s = await section();
    expect(await within(s).findByText("Popular this week")).toBeInTheDocument();
    expect(within(s).queryByRole("button", { name: "Rising now" })).toBeNull();
  });

  it("still reads an older response that only has `items`", async () => {
    vi.mocked(items.getTrending).mockResolvedValue({ computedAt: "2026-11-16T09:02:00Z", live: false, items: [{ term: "milk", count: 9, hot: true }] });
    panel();
    const s = await section();
    expect(await within(s).findByText("milk")).toBeInTheDocument();
    expect(within(s).queryByText("Product")).toBeNull(); // no kind known, no badge
  });

  it("a tap on a trending row is not counted as a search, so the list cannot vote for itself", async () => {
    const { onSelect } = panel();
    const s = await section();
    await userEvent.click(await within(s).findByText("gas cylinder"));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining("q=gas%20cylinder"));
    expect(logSearch).not.toHaveBeenCalled();
  });

  it("a trending store opens its own page", async () => {
    const { onSelect } = panel();
    const s = await section();
    await userEvent.click(await within(s).findByText("mama njeri bakery"));
    expect(onSelect).toHaveBeenCalledWith("/b/mama-njeri");
    expect(logSearch).not.toHaveBeenCalled();
  });

  it("a search the shopper types is counted, with the county of the town they chose", async () => {
    useGeoStore.setState({ town: kisumuTown });
    const { input } = panel();
    await userEvent.type(input, "milk{Enter}");
    await waitFor(() => expect(logSearch).toHaveBeenCalledWith("milk", "Kisumu"));
  });

  it("without a chosen town, no county is sent", async () => {
    const { input } = panel();
    await userEvent.type(input, "milk{Enter}");
    await waitFor(() => expect(logSearch).toHaveBeenCalledWith("milk", null));
  });

  it("asks for the shopper's county, and says when the list is local or national", async () => {
    useGeoStore.setState({ town: kisumuTown });
    vi.mocked(items.getTrending).mockResolvedValue(lists({ scope: "kisumu", county: "kisumu" }));
    panel();
    const s = await section();
    expect(await within(s).findByText("Trending in Kisumu")).toBeInTheDocument();
    expect(items.getTrending).toHaveBeenCalledWith("Kisumu");
  });

  it("when the county has too few searches, it says it is showing the national list", async () => {
    useGeoStore.setState({ town: kisumuTown });
    vi.mocked(items.getTrending).mockResolvedValue(lists({ fallback: "national" }));
    panel();
    const s = await section();
    expect(await within(s).findByText(/Not many searches in Kisumu yet, showing all of Kenya/)).toBeInTheDocument();
  });
});

describe("trendPath", () => {
  it("opens a store's page, and sends everything else to the search", () => {
    expect(trendPath({ kind: "store", slug: "shop-a" }, "/products?q=x")).toBe("/b/shop-a");
    expect(trendPath({ kind: "store" }, "/products?q=x")).toBe("/products?q=x");
    expect(trendPath({ kind: "product", slug: "shop-a" }, "/products?q=x")).toBe("/products?q=x");
    expect(trendPath({ kind: "flash" }, null)).toBeNull();
  });
});
