import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchBusinesses } from "../api/index.js";
import RecentlyAdded, { SEE_ALL_PATH } from "./RecentlyAdded.jsx";

vi.mock("../api/index.js", () => ({ searchBusinesses: vi.fn(), logContactEvent: vi.fn() }));

const shop = (n) => ({
  id: `b${n}`,
  slug: `shop-${n}`,
  name: `Shop ${n}`,
  tagline: "Tagline",
  plan: "standard",
  verified: false,
  isOpen: true,
  rating: 0,
  reviewCount: 0,
  phone: "0712345678",
  whatsapp: "0712345678",
  lat: 0,
  lng: 34,
  area: "Maseno",
  county: "Kisumu",
  categoryName: "Bakery",
  fromPriceKes: 10
});

const view = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecentlyAdded />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

const sizes = { scrollWidth: 1000, clientWidth: 400 };

beforeEach(() => {
  vi.mocked(searchBusinesses).mockReset();
  Element.prototype.scrollBy = vi.fn();
  Element.prototype.getBoundingClientRect = () => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 });
  Object.entries(sizes).forEach(([prop, value]) => Object.defineProperty(HTMLElement.prototype, prop, { configurable: true, get: () => value }));
});

describe("RecentlyAdded", () => {
  it("asks for the newest businesses and renders them as tiles with See more links", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [shop(1), shop(2), shop(3)], total: 27 });
    view();

    expect(await screen.findByRole("heading", { name: "Recently added" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Shop 1" })).toBeInTheDocument();
    expect(searchBusinesses).toHaveBeenCalledWith({ sort: "newest", pageSize: 12 });

    const seeAll = screen.getAllByRole("link", { name: /See more/ });
    expect(seeAll).toHaveLength(2);
    seeAll.forEach((link) => expect(link).toHaveAttribute("href", SEE_ALL_PATH));
    expect(screen.getByText("27 businesses")).toBeInTheDocument();
    expect(screen.queryByText("Tagline")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Call Shop/ })).toHaveLength(3);
  });

  it("pages by whole visible cards with the arrow buttons and disables the start arrow at the start", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [shop(1), shop(2), shop(3), shop(4), shop(5)], total: 5 });
    view();
    await screen.findByRole("heading", { name: "Shop 1" });

    const prev = screen.getByRole("button", { name: "Show previous businesses" });
    const next = screen.getByRole("button", { name: "Show next businesses" });
    await waitFor(() => expect(next).toBeEnabled());
    expect(prev).toBeDisabled();

    await userEvent.setup().click(next);
    // 400px track, 100px cards, no gap: four whole cards fit, so one page moves 400px.
    expect(Element.prototype.scrollBy).toHaveBeenCalledWith(expect.objectContaining({ left: 400 }));
  });

  it("renders nothing when there are no businesses", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [], total: 0 });
    const { container } = view();
    await waitFor(() => expect(searchBusinesses).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("offers a retry when loading fails", async () => {
    vi.mocked(searchBusinesses).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ items: [shop(1)], total: 1 });
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load recently added businesses.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Shop 1" })).toBeInTheDocument();
  });
});
