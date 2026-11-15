import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getFixtures } from "@epicmkt/shared";
import ItemDetail from "./ItemDetail.jsx";

// 11.3: every contract fixture opens on the real item page, and none of the removed things (reviews, ratings, "Best Seller",
// "Amazon's Choice", coupon or return-policy blocks) appears anywhere.
const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn() }));
vi.mock("../api/index.js", () => ({ logContactEvent: vi.fn(), logEvent: vi.fn(), items: mocks }));

const REMOVED = /\b(reviews?|ratings?|rated|stars?|best seller|bestseller|amazon'?s choice|coupon|return policy|returns? policy)\b/i;
const business = { id: "b1", slug: "shop", name: "Shop" };

describe("every contract fixture on the item page", () => {
  it.each(getFixtures().map((f) => [f.id, f]))("%s opens and shows no reviews, ratings or removed badges", async (_id, fixture) => {
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getDetail.mockResolvedValue({ ...fixture.detail, business: { slug: "shop", name: "Shop", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true } });
    const { container } = render(
      <MemoryRouter initialEntries={["/?item=it"]}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ItemDetail business={business} itemId={fixture.detail.id} onClose={() => {}} onSelect={() => {}} onReport={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>
    );
    await screen.findByRole("heading", { name: fixture.detail.name });
    expect(container.textContent).not.toMatch(REMOVED);
    expect(container.querySelector("[aria-label*='rating' i], [aria-label*='review' i]")).toBeNull();
  });
});
