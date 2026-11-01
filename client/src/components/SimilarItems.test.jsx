import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SimilarItems from "./SimilarItems.jsx";

const mocks = vi.hoisted(() => ({ getSimilar: vi.fn() }));
const logEvent = vi.hoisted(() => vi.fn());
vi.mock("../api/index.js", () => ({ logEvent, items: mocks }));

const pricing = (regular, sale) => ({ regularPrice: regular, salePrice: sale, savings: regular - sale, discountPercent: Math.round(((regular - sale) / regular) * 100), unit: null, variants: [] });
const similar = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    name: `Other ${i}`,
    imageUrl: "b.png",
    availability: "available",
    pricing: i === 0 ? pricing(1000, 800) : pricing(500, 500),
    business: { id: `b${i}`, slug: `shop-${i}`, name: `Shop ${i}`, verified: i === 1 }
  }));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const mount = (props = {}) =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<><SimilarItems itemId="cur" businessId="b-cur" {...props} /><Where /></>} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  mocks.getSimilar.mockReset();
  logEvent.mockReset();
});

describe("SimilarItems", () => {
  it("shows skeletons while loading, then cards with name, price and store", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    const { container } = mount();
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Similar items" })).toBeInTheDocument();
    expect(await screen.findByText("Other 0")).toBeInTheDocument();
    expect(screen.getByText("Shop 2")).toBeInTheDocument();
    expect(screen.getByText("KES 800")).toBeInTheDocument();
    expect(mocks.getSimilar).toHaveBeenCalledWith("cur", expect.objectContaining({ limit: 12 }));
  });

  it("renders nothing with fewer than two results, on failure, or when empty", async () => {
    for (const answer of [similar(1), [], null]) {
      mocks.getSimilar.mockResolvedValue(answer);
      const { container, unmount } = mount();
      await waitFor(() => expect(container.querySelector("[aria-busy='true']")).toBeNull());
      expect(screen.queryByRole("heading", { name: "Similar items" })).toBeNull();
      unmount();
    }
    mocks.getSimilar.mockRejectedValue(new Error("down"));
    mount();
    await waitFor(() => expect(mocks.getSimilar).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Similar items" })).toBeNull());
  });

  it("uses the same product card as the home grid: a link to the item in its own store, store name included", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    mount();
    const link = await screen.findByRole("link", { name: /Other 1/ });
    expect(link).toHaveAttribute("href", "/b/shop-1/i/s1");
    expect(link).toHaveTextContent("Shop 1");
  });

  it("counts the click without stopping the link", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    mount();
    await userEvent.click(await screen.findByRole("link", { name: /Other 1/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/b/shop-1/i/s1");
    expect(logEvent).toHaveBeenCalledWith("similar_item_click", { businessId: "b-cur", itemId: "cur", targetItemId: "s1", targetBusinessId: "b1", position: 2 });
  });

  it("has scroll arrows that page the row, shown only while there is more to scroll to", async () => {
    mocks.getSimilar.mockResolvedValue(similar(6));
    mount();
    await screen.findByText("Other 0");
    const next = screen.getByRole("button", { name: "Scroll right" });
    const prev = screen.getByRole("button", { name: "Scroll left" });
    expect(prev).toBeDisabled();
    const row = document.querySelector("[data-similar] ul");
    Object.defineProperties(row, { scrollWidth: { value: 2000, configurable: true }, clientWidth: { value: 400, configurable: true } });
    row.scrollBy = vi.fn();
    row.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(next).toBeEnabled());
    await userEvent.click(next);
    expect(row.scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
  });

  it("drops rows that cannot be opened", async () => {
    mocks.getSimilar.mockResolvedValue([...similar(2), { id: "x", name: "No store", availability: "available" }]);
    mount();
    await screen.findByText("Other 0");
    expect(screen.queryByText("No store")).toBeNull();
  });

  it("says why the items are here, but only for a product the vocabulary knows", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    const { unmount } = mount({ name: "Brown Bread 400g" });
    expect(await screen.findByText("Other stores selling bread")).toBeInTheDocument();
    unmount();
    mount({ name: "Samsung Galaxy A15", brand: "Samsung" });
    await screen.findByText("Other 0");
    expect(screen.queryByText(/Other stores selling/)).toBeNull();
  });

  it("passes an abort signal that fires when the visitor moves on", async () => {
    let signal;
    mocks.getSimilar.mockImplementation((_id, opts) => {
      signal = opts.signal;
      return new Promise(() => {});
    });
    const { unmount } = mount();
    await waitFor(() => expect(signal).toBeInstanceOf(AbortSignal));
    expect(signal.aborted).toBe(false);
    unmount();
    await waitFor(() => expect(signal.aborted).toBe(true));
  });

  it("holds the height of the cards while loading, in the same shape as a card", async () => {
    mocks.getSimilar.mockImplementation(() => new Promise(() => {}));
    const { container } = mount();
    const section = await waitFor(() => {
      const el = container.querySelector("[data-similar]");
      expect(el).not.toBeNull();
      return el;
    });
    expect(section).toHaveAttribute("data-state", "loading");
    expect(section.querySelectorAll("[class*='skeleton']").length).toBe(4);
  });

  it("is a heading with an accessible name tied to its section", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    mount();
    await screen.findByText("Other 0");
    expect(screen.getByRole("region", { name: "Similar items" })).toHaveAttribute("data-state", "ready");
  });
});

describe("SimilarItems, lazy", () => {
  let observers;
  beforeEach(() => {
    observers = [];
    globalThis.IntersectionObserver = class {
      constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.disconnect = vi.fn();
        observers.push(this);
      }
      observe(node) {
        this.node = node;
      }
    };
  });
  afterEach(() => {
    delete globalThis.IntersectionObserver;
  });

  it("fetches nothing and takes no room until the section is near the screen, then fetches once", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    const { container } = mount();
    expect(mocks.getSimilar).not.toHaveBeenCalled();
    expect(container.querySelector("[data-similar]")).toBeNull();
    expect(container.querySelector("[data-similar-marker]")).not.toBeNull();
    expect(observers).toHaveLength(1);
    expect(observers[0].options.rootMargin).toMatch(/^\d+px/);

    act(() => observers[0].callback([{ isIntersecting: false }]));
    expect(mocks.getSimilar).not.toHaveBeenCalled();

    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(await screen.findByText("Other 0")).toBeInTheDocument();
    expect(mocks.getSimilar).toHaveBeenCalledTimes(1);
    expect(observers[0].disconnect).toHaveBeenCalled();
    expect(container.querySelector("[data-similar-marker]")).toBeNull();
  });

  it("leaves no trace at all when it turns out there is nothing to show", async () => {
    mocks.getSimilar.mockResolvedValue(similar(1));
    const { container } = mount();
    act(() => observers[0].callback([{ isIntersecting: true }]));
    await waitFor(() => expect(mocks.getSimilar).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-similar]")).toBeNull());
    expect(container.querySelector("[data-similar-marker]")).toBeNull();
  });

  it("never shows the previous product's results under the next one", async () => {
    mocks.getSimilar.mockImplementation((id) => Promise.resolve(id === "first" ? similar(3) : new Promise(() => {})));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (id) => (
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <SimilarItems key={id} itemId={id} businessId="b" />
        </QueryClientProvider>
      </MemoryRouter>
    );
    const { rerender } = render(ui("first"));
    act(() => observers[0].callback([{ isIntersecting: true }]));
    expect(await screen.findByText("Other 0")).toBeInTheDocument();
    rerender(ui("second"));
    expect(screen.queryByText("Other 0")).toBeNull();
  });
});
