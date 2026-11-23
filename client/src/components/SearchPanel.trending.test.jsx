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
const lists = (extra = {}) => ({ computedAt: "2026-11-16T09:12:00Z", live: false, scope: "*", fallback: "none", popular: POPULAR, rising: RISING, items: POPULAR, ...extra });

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
const section = async () => (await screen.findByRole("heading", { name: /Top searches/ })).closest("section");

beforeEach(() => {
  localStorage.clear();
  useGeoStore.setState({ town: null, coords: null });
  vi.mocked(logSearch).mockReset();
  vi.mocked(items.suggest).mockReset().mockResolvedValue({ terms: [], products: [], stores: [], categories: [], corrected: null });
  vi.mocked(items.getTrending).mockReset().mockResolvedValue(lists());
});

describe("trending in the search panel", () => {
  it("lists the ten most searched, by search count whatever order they arrive in, with the flame on the first only", async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ term: `word ${i}`, count: i + 1, hot: true, kind: "product", label: `Word ${i}` }));
    vi.mocked(items.getTrending).mockResolvedValue(lists({ popular: many, items: many, rising: [] }));
    panel();
    const s = await section();
    await within(s).findByText("Word 11");
    const rows = within(s).getAllByRole("listitem");
    expect(rows).toHaveLength(10);
    rows.forEach((row, i) => expect(within(row).getByText(`Word ${11 - i}`)).toBeInTheDocument());
    expect(within(s).getAllByRole("img", { name: "Trending now" })).toHaveLength(1);
    expect(within(rows[0]).getByRole("img", { name: "Trending now" })).toBeInTheDocument();
  });

  it("ranks every kind of search in one list and says what each one is", async () => {
    vi.mocked(items.getTrending).mockResolvedValue(lists({ rising: [] }));
    panel();
    const s = await section();
    await within(s).findByText("Gas Cylinder 6kg");
    const rows = within(s).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === null);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Gas Cylinder 6kg"),
      expect.stringContaining("mama njeri bakery"),
      expect.stringContaining("flash sneakers"),
      expect.stringContaining("barber")
    ]);
    expect(within(rows[0]).getByText("Product")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Store")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Flash sale")).toBeInTheDocument();
    expect(within(rows[3]).getByText("Category")).toBeInTheDocument();
  });

  it("is one list of top searches: no tabs, and a word that is both most searched and rising is marked inside it", async () => {
    const popular = [
      { term: "gas cylinder", count: 9, kind: "product", label: "Gas Cylinder 6kg" },
      { term: "mama njeri bakery", count: 7, kind: "store", slug: "mama-njeri" },
      { term: "barber", count: 4, kind: "category", label: "Barber" }
    ];
    const rising = [
      { term: "mama njeri bakery", count: 7, kind: "store", slug: "mama-njeri" },
      { term: "gas cylinder", count: 9, kind: "product", label: "Gas Cylinder 6kg" },
      { term: "solar lamp", count: 3, kind: "product", label: "Solar Lamp" }
    ];
    vi.mocked(items.getTrending).mockResolvedValue(lists({ popular, items: popular, rising }));
    panel();
    const s = await section();
    await within(s).findByText("Gas Cylinder 6kg");
    expect(within(s).queryByRole("button", { name: "Rising now" })).toBeNull();
    const rows = within(s).getAllByRole("listitem");
    // Ranked by searches: the gas cylinder is first even though the bakery is the fastest riser.
    expect(within(rows[0]).getByText("Gas Cylinder 6kg")).toBeInTheDocument();
    expect(within(rows[0]).getByText("Rising")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Fastest rising")).toBeInTheDocument();
    expect(within(rows[2]).queryByText(/rising/i)).toBeNull();
    // A riser outside the top ten is not lost: it sits under "Also rising fast".
    expect(within(s).getByRole("heading", { name: "Also rising fast" })).toBeInTheDocument();
    expect(within(s).getByText("Solar Lamp")).toBeInTheDocument();
  });

  it("with nothing rising there is no rising mark and no legend for it", async () => {
    vi.mocked(items.getTrending).mockResolvedValue(lists({ rising: [] }));
    panel();
    const s = await section();
    expect(await within(s).findByText(/Most searched this week/)).toBeInTheDocument();
    expect(within(s).queryByText(/rising/i)).toBeNull();
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
    await userEvent.click(await within(s).findByText("Gas Cylinder 6kg"));
    expect(onSelect).toHaveBeenCalledWith(expect.stringContaining("q=gas%20cylinder"));
    expect(logSearch).not.toHaveBeenCalled();
  });

  it("a product word shows the exact product it finds and opens that product", async () => {
    vi.mocked(items.getTrending).mockResolvedValue(
      lists({ popular: [{ rank: 1, term: "red bull", count: 9, hot: false, itemId: "item-9", slug: "mama-njeri", label: "Red Bull Energy Drink - Assorted Flavors" }] })
    );
    const { onSelect } = panel();
    const s = await section();
    await userEvent.click(await within(s).findByText("Red Bull Energy Drink - Assorted Flavors"));
    expect(onSelect).toHaveBeenCalledWith("/b/mama-njeri/i/item-9");
    expect(logSearch).not.toHaveBeenCalled();
  });

  it("filler products sit under their own heading, with no rank and no flame", async () => {
    vi.mocked(items.getTrending).mockResolvedValue(
      lists({
        rising: [],
        popular: [
          { rank: 1, term: "gas cylinder", count: 9, hot: true, kind: "product", label: "Gas Cylinder 6kg" },
          { term: "bread", count: 0, hot: false, kind: "product", filler: true, label: "White Bread 400g", itemId: "i1", slug: "mama" }
        ]
      })
    );
    panel();
    const s = await section();
    expect(await within(s).findByRole("heading", { name: "Popular products" })).toBeInTheDocument();
    const rows = within(s).getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === null);
    expect(within(rows[0]).getByText("1")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("White Bread 400g");
    expect(within(rows[1]).queryByText("2")).toBeNull();
  });

  it("a trending store opens its own page", async () => {
    const { onSelect } = panel();
    const s = await section();
    await userEvent.click(await within(s).findByText("mama njeri bakery"));
    expect(onSelect).toHaveBeenCalledWith("/b/mama-njeri");
    expect(logSearch).not.toHaveBeenCalled();
  });

  it("a search the shopper types is counted, with no location attached", async () => {
    const { input } = panel();
    await userEvent.type(input, "milk{Enter}");
    await waitFor(() => expect(logSearch).toHaveBeenCalledWith("milk"));
  });

  it("asks for one list for everyone, whatever town was chosen", async () => {
    useGeoStore.setState({ town: kisumuTown });
    panel();
    const s = await section();
    await within(s).findByText("Gas Cylinder 6kg");
    expect(items.getTrending).toHaveBeenCalledWith();
    expect(within(s).queryByText(/Trending in|Not many searches/)).toBeNull();
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
