import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ getRelated: vi.fn(), logEvent: vi.fn() }));
vi.mock("../../api/index.js", () => ({ items: { getRelated: mocks.getRelated }, logEvent: mocks.logEvent }));
const { RecommendList, RecommendSection } = await import("./Recommend.jsx");

const card = (n, mine = false) => ({
  id: `r${n}`, name: `Related ${n}`, imageUrl: null, fromThisShop: mine,
  pricing: { regularPrice: 1000 + n, salePrice: 1000 + n, savings: 0, discountPercent: 0 },
  business: { slug: mine ? "nakuru-electronics-centre" : `shop-${n}`, name: mine ? "Nakuru Electronics Centre" : `Shop ${n}`, isOpen: true }
});
const all = { items: Array.from({ length: 14 }, (_, i) => card(i + 1, i === 0 || i === 5)), page: 1, hasMore: false, total: 14 };
const ctx = { item: { id: "b_040-jbl" }, business: { id: "b_040", slug: "nakuru-electronics-centre" } };
const mount = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  mocks.getRelated.mockReset();
  mocks.getRelated.mockResolvedValue(all);
});

describe("Goes well with this (C19)", () => {
  it("lists what goes with this item in one carousel, marks the ones from this shop, with one request per visit", async () => {
    mount(<RecommendSection ctx={ctx} />);
    const section = await screen.findByRole("region", { name: "Goes well with this" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(14));
    expect(within(section).getAllByText("From this shop")).toHaveLength(2);
    expect(mocks.getRelated).toHaveBeenCalledTimes(1);
    expect(mocks.getRelated).toHaveBeenCalledWith("b_040-jbl", expect.objectContaining({ businessId: "b_040", page: 1, seed: expect.any(String) }));
    expect(within(section).getByRole("link", { name: /Related 3/ })).toHaveAttribute("href", "/b/shop-3/i/r3");
    expect(within(section).getByRole("button", { name: "Next page of Goes well with this" })).toBeInTheDocument();
  });

  it("the tab shows the first five and links down to the full section", async () => {
    mount(<RecommendList ctx={ctx} />);
    expect(await screen.findByRole("link", { name: "See all that goes with it" })).toHaveAttribute("href", "#item-recommend");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("is not there at all when nothing goes with the item (a haircut), and the tab says so", async () => {
    mocks.getRelated.mockResolvedValue({ items: [], page: 1, hasMore: false, total: 0 });
    const { container } = mount(<RecommendSection ctx={ctx} />);
    await waitFor(() => expect(mocks.getRelated).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("#item-recommend")).toBeNull());
    mount(<RecommendList ctx={ctx} />);
    expect(await screen.findByText("Nothing goes with this item yet.")).toBeInTheDocument();
  });

  it("logs which suggestion was opened, and whether it was from this shop", async () => {
    mount(<RecommendSection ctx={ctx} />);
    const section = await screen.findByRole("region", { name: "Goes well with this" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(14));
    fireEvent.click(within(section).getAllByRole("listitem")[0]);
    expect(mocks.logEvent).toHaveBeenCalledWith("related_item_click", { itemId: "b_040-jbl", targetItemId: "r1", position: 1, fromThisShop: true });
  });
});
