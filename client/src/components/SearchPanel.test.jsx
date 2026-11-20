import { createRef } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items } from "../api/index.js";
import SearchPanel from "./SearchPanel.jsx";
import Header from "./Header.jsx";
import { useOpenSearch } from "../hooks/useOpenSearch.js";

vi.mock("../api/index.js", () => ({
  items: { suggest: vi.fn(), getTrending: vi.fn() },
  getCategories: vi.fn(async () => [{ id: "mini-marts", name: "Mini Marts" }, { id: "barber", name: "Barbers" }]),
  logSearch: vi.fn(),
  flash: { facets: vi.fn(async () => ({ total: 0 })) }
}));

const MILK = {
  terms: [{ label: "milk" }, { label: "milk powder" }, { label: "brookside milk" }],
  products: [{ id: "p1", name: "Brookside Fresh Milk 500ml", slug: "mama-mart", image: "https://img.test/milk.webp", price: 65 }],
  stores: [{ label: "Milele Chemist", slug: "milele-chemist" }],
  categories: [],
  corrected: null
};

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function panel(onSelect = vi.fn()) {
  const inputRef = createRef();
  const panelRef = createRef();
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <SearchPanel open onClose={vi.fn()} onSelect={onSelect} panelRef={panelRef} inputRef={inputRef} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { onSelect, input: screen.getByRole("combobox") };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(items.suggest).mockReset().mockImplementation(async (q) => (q.startsWith("mi") ? MILK : { terms: [], products: [], stores: [], categories: [], corrected: null }));
  vi.mocked(items.getTrending).mockReset().mockResolvedValue({ computedAt: "2026-11-16T09:02:00Z", live: false, items: [{ term: "milk", count: 9, hot: true }, { term: "panadol", count: 5, hot: false }] });
});

describe("search type-ahead", () => {
  it("offers phrases with the completion in bold, products with picture and price, stores and categories", async () => {
    const { input } = panel();
    await userEvent.type(input, "mi");
    const list = await screen.findByRole("listbox", { name: "Suggestions" });
    const options = within(list).getAllByRole("option");
    expect(options[0]).toHaveTextContent("milk");
    expect(within(options[0]).getByText("lk").tagName).toBe("B");
    expect(within(list).getByText("Brookside Fresh Milk 500ml")).toBeInTheDocument();
    expect(within(list).getByText("KES 65")).toBeInTheDocument();
    expect(within(list).getByText("Milele Chemist")).toBeInTheDocument();
    expect(within(list).getByText("Mini Marts")).toBeInTheDocument();
    expect(within(list).getByText(/See all products for/)).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("arrow keys copy a phrase into the box, Escape puts back what was typed, and Enter searches the phrase", async () => {
    const { input, onSelect } = panel();
    await userEvent.type(input, "mi");
    await screen.findByRole("listbox");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input).toHaveValue("milk powder");
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(input).toHaveValue("mi");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("/products?q=milk");
  });

  it("a product row opens the product, a store row the store", async () => {
    const { input, onSelect } = panel();
    await userEvent.type(input, "mil");
    await userEvent.click(await screen.findByText("Brookside Fresh Milk 500ml"));
    expect(onSelect).toHaveBeenCalledWith("/b/mama-mart/i/p1");
    await userEvent.click(screen.getByText("Milele Chemist"));
    expect(onSelect).toHaveBeenCalledWith("/b/milele-chemist");
  });

  it("the edit arrow fills the box with a phrase to keep typing, without searching", async () => {
    const { input, onSelect } = panel();
    await userEvent.type(input, "mi");
    await userEvent.click(await screen.findByRole("button", { name: "Edit “milk powder”" }));
    expect(input).toHaveValue("milk powder ");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says when it shows a corrected spelling", async () => {
    vi.mocked(items.suggest).mockResolvedValue({ ...MILK, corrected: "milk" });
    const { input } = panel();
    await userEvent.type(input, "mlik");
    expect(await screen.findByRole("status")).toHaveTextContent("Showing results for milk");
  });

  it("before typing, shows the hourly trending searches", async () => {
    panel();
    const section = (await screen.findByRole("heading", { name: /Trending searches/ })).closest("section");
    expect((await within(section).findAllByRole("button")).length).toBe(2);
    expect(within(section).queryByText(/Updated/)).toBeNull();
    expect(within(section).getAllByRole("button").map((b) => b.textContent)).toEqual([expect.stringContaining("milk"), expect.stringContaining("panadol")]);
  });
});

describe("opening search", () => {
  const Where = () => {
    const location = useLocation();
    return <p data-testid="state">{JSON.stringify(location.state ?? null)}</p>;
  };
  const HeroSearch = () => {
    const openSearch = useOpenSearch();
    return (
      <button type="button" onClick={openSearch}>
        Hero search
      </button>
    );
  };

  it("from the home page search bar opens search alone, never the menu behind it, and focus comes back on close", async () => {
    render(
      <QueryClientProvider client={client()}>
        <MemoryRouter>
          <Header />
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <HeroSearch />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    const hero = screen.getByRole("button", { name: "Hero search" });
    await userEvent.click(hero);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('{"search":true}'));
    expect(document.getElementById("site-search")).toHaveAttribute("data-open", "true");
    expect(document.getElementById("site-menu")).toHaveAttribute("data-open", "false");
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveFocus());
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /Close search/ }));
    });
    await waitFor(() => expect(document.getElementById("site-search")).toHaveAttribute("data-open", "false"));
    expect(document.getElementById("site-menu")).toHaveAttribute("data-open", "false");
    await waitFor(() => expect(hero).toHaveFocus());
  });
});
