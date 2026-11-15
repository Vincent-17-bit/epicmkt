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
const page1 = { items: Array.from({ length: 10 }, (_, i) => card(i + 1, i === 0 || i === 5)), page: 1, hasMore: true, total: 14 };
const page2 = { items: Array.from({ length: 4 }, (_, i) => card(i + 11)), page: 2, hasMore: false, total: 14 };
const ctx = { item: { id: "b_040-jbl" }, business: { id: "b_040", slug: "nakuru-electronics-centre" } };
const mount = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  mocks.getRelated.mockReset();
  mocks.getRelated.mockImplementation(async (_id, { page }) => (page === 1 ? page1 : page2));
});

describe("Recommended with this item (C19)", () => {
  it("lists products that go with this one, marks the ones from this shop, and See more loads the next page", async () => {
    mount(<RecommendSection ctx={ctx} />);
    const section = await screen.findByRole("region", { name: "Recommended with this item" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(10));
    expect(within(section).getAllByText("From this shop")).toHaveLength(2);
    expect(mocks.getRelated).toHaveBeenCalledWith("b_040-jbl", expect.objectContaining({ businessId: "b_040", page: 1, pageSize: 10 }));
    fireEvent.click(within(section).getByRole("button", { name: "See more" }));
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(14));
    expect(within(section).queryByRole("button", { name: "See more" })).toBeNull();
    expect(within(section).getByText("That is everything we can suggest for now.")).toBeInTheDocument();
  });

  it("the Recommended tab shows the first five and links down to the full section", async () => {
    mount(<RecommendList ctx={ctx} compact />);
    expect(await screen.findByRole("link", { name: "See all recommended items" })).toHaveAttribute("href", "#item-recommend");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
  });

  it("disappears when there is nothing to suggest, and the tab says so", async () => {
    mocks.getRelated.mockResolvedValue({ items: [], page: 1, hasMore: false, total: 0 });
    const { container } = mount(<RecommendSection ctx={ctx} />);
    await waitFor(() => expect(mocks.getRelated).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("#item-recommend")).toBeNull());
    mount(<RecommendList ctx={ctx} compact />);
    expect(await screen.findByText("Nothing to suggest for this item yet.")).toBeInTheDocument();
  });

  it("logs which suggestion was opened, and whether it was from this shop", async () => {
    mount(<RecommendSection ctx={ctx} />);
    const section = await screen.findByRole("region", { name: "Recommended with this item" });
    await waitFor(() => expect(within(section).getAllByRole("listitem")).toHaveLength(10));
    fireEvent.click(within(section).getAllByRole("listitem")[0]);
    expect(mocks.logEvent).toHaveBeenCalledWith("related_item_click", { itemId: "b_040-jbl", targetItemId: "r1", position: 1, fromThisShop: true });
  });
});
