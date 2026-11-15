import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import GoesWith from "./GoesWith.jsx";

const mocks = vi.hoisted(() => ({ getRelated: vi.fn() }));
const logEvent = vi.hoisted(() => vi.fn());
vi.mock("../api/index.js", () => ({ logEvent, items: mocks }));

const card = (i, mine = false) => ({
  id: `r${i}`,
  name: `Goes ${i}`,
  imageUrl: "a.png",
  availability: "available",
  fromThisShop: mine,
  pricing: { regularPrice: 500 + i, salePrice: 500 + i, savings: 0, discountPercent: 0, unit: null, variants: [] },
  business: { id: mine ? "b-cur" : `b${i}`, slug: mine ? "cur-shop" : `shop-${i}`, name: mine ? "Current shop" : `Shop ${i}` }
});
const pageOf = (page, ids, { hasMore = false, total = ids.length } = {}) => ({ items: ids.map(([i, mine]) => card(i, mine)), page, pageSize: 10, hasMore, total });

const mount = () =>
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <GoesWith itemId="cur" businessId="b-cur" />
      </QueryClientProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  mocks.getRelated.mockReset();
  logEvent.mockReset();
});

describe("GoesWith (Goes well with this)", () => {
  it("shows a loading state, then the first page with the shop labels", async () => {
    mocks.getRelated.mockResolvedValue(pageOf(1, [[1, true], [2], [3]]));
    const { container } = mount();
    expect(container.querySelector("[data-goes-with][aria-busy='true']")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Goes well with this" })).toBeInTheDocument();
    expect(await screen.findByText("Goes 1")).toBeInTheDocument();
    expect(mocks.getRelated).toHaveBeenCalledWith("cur", expect.objectContaining({ page: 1, pageSize: 10 }));
    const mine = screen.getByText("Goes 1").closest("li");
    expect(within(mine).getByText("From this shop")).toBeInTheDocument();
    expect(within(screen.getByText("Goes 2").closest("li")).queryByText("From this shop")).toBeNull();
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
    expect(screen.queryByText(/everything we have/)).toBeNull();
  });

  it("See more loads the next page, moves focus to the first new card, and says when the list ends", async () => {
    mocks.getRelated
      .mockResolvedValueOnce(pageOf(1, [[1, true], [2], [3]], { hasMore: true, total: 5 }))
      .mockResolvedValueOnce(pageOf(2, [[4], [5]], { hasMore: false, total: 5 }));
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "See more" }));
    expect(await screen.findByText("Goes 5")).toBeInTheDocument();
    expect(mocks.getRelated).toHaveBeenLastCalledWith("cur", expect.objectContaining({ page: 2 }));
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText("Goes 4").closest("a")));
    expect(screen.getByRole("status")).toHaveTextContent("2 more shown.");
    expect(screen.queryByRole("button", { name: "See more" })).toBeNull();
    expect(screen.getByText("That is everything we have to suggest.")).toBeInTheDocument();
  });

  it("is not there at all when there is nothing to suggest, or the request fails", async () => {
    mocks.getRelated.mockResolvedValue(pageOf(1, []));
    const { container } = mount();
    await waitFor(() => expect(mocks.getRelated).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-goes-with]")).toBeNull());
    expect(screen.queryByRole("heading", { name: "Goes well with this" })).toBeNull();
  });

  it("counts a click on a card, with its place and whether it is from this shop", async () => {
    mocks.getRelated.mockResolvedValue(pageOf(1, [[1, true], [2]]));
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByText("Goes 2"));
    expect(logEvent).toHaveBeenCalledWith("related_item_click", expect.objectContaining({ itemId: "cur", targetItemId: "r2", position: 2, fromThisShop: false }));
  });

  it("has no accessibility problems", async () => {
    mocks.getRelated.mockResolvedValue(pageOf(1, [[1, true], [2], [3]], { hasMore: true }));
    const { container } = mount();
    await screen.findByText("Goes 3");
    expect((await axe(container)).violations).toEqual([]);
  });
});
