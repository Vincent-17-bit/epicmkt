import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    business: { id: `b${i}`, slug: `shop-${i}`, name: `Shop ${i}` }
  }));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const mount = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="*" element={<><SimilarItems itemId="cur" businessId="b-cur" /><Where /></>} />
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

  it("opens the item in its own store and tracks the click", async () => {
    mocks.getSimilar.mockResolvedValue(similar(3));
    mount();
    await userEvent.click(await screen.findByRole("button", { name: /Other 1/ }));
    expect(screen.getByTestId("where")).toHaveTextContent("/b/shop-1/i/s1");
    expect(logEvent).toHaveBeenCalledWith("similar_item_click", { businessId: "b-cur", itemId: "cur", targetItemId: "s1", targetBusinessId: "b1", position: 2 });
  });

  it("drops rows that cannot be opened", async () => {
    mocks.getSimilar.mockResolvedValue([...similar(2), { id: "x", name: "No store", availability: "available" }]);
    mount();
    await screen.findByText("Other 0");
    expect(screen.queryByText("No store")).toBeNull();
  });
});
