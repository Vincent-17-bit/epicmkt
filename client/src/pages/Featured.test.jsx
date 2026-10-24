import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { items, searchBusinesses } from "../api/index.js";
import { seenMemory } from "../lib/seen.js";
import Featured from "./Featured.jsx";

vi.mock("../api/index.js", () => ({
  searchBusinesses: vi.fn(),
  items: { getShowcase: vi.fn() },
  logContactEvent: vi.fn(),
  logEvent: vi.fn(),
  getBusiness: vi.fn(),
  getCategories: vi.fn(),
  getTowns: vi.fn()
}));

vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => null }));

const shop = (n) => ({
  id: `b${n}`,
  slug: `shop-${n}`,
  name: `Shop ${n}`,
  tagline: "",
  plan: "premium",
  verified: false,
  isOpen: true,
  phone: "0712345678",
  whatsapp: "0712345678",
  lat: 0,
  lng: 34,
  area: "Maseno",
  categoryName: "Bakery"
});

const view = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Featured />
      </MemoryRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  vi.mocked(searchBusinesses).mockReset();
  vi.mocked(items.getShowcase).mockReset().mockResolvedValue({});
  seenMemory().clear();
});

describe("Featured page", () => {
  it("asks only for featured stores and shows each as a card with the total", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [shop(1), shop(2)], total: 2, page: 1, pageSize: 12, totalPages: 1 });
    view();
    expect(await screen.findByText("2 featured businesses")).toBeInTheDocument();
    expect(searchBusinesses).toHaveBeenCalledWith(expect.objectContaining({ featuredOnly: true, page: 1 }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Show more businesses" })).not.toBeInTheDocument();
  });

  it("loads the next page of stores on request and keeps the earlier cards", async () => {
    vi.mocked(searchBusinesses)
      .mockResolvedValueOnce({ items: [shop(1)], total: 2, page: 1, pageSize: 1, totalPages: 2 })
      .mockResolvedValueOnce({ items: [shop(2)], total: 2, page: 2, pageSize: 1, totalPages: 2 });
    view();
    await screen.findAllByRole("heading", { level: 3 });
    await userEvent.setup().click(await screen.findByRole("button", { name: "Show more businesses" }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2));
    expect(searchBusinesses).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("still lists the stores when their products cannot be read", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [shop(1)], total: 1, page: 1, pageSize: 12, totalPages: 1 });
    vi.mocked(items.getShowcase).mockRejectedValue(new Error("down"));
    view();
    expect(await screen.findByRole("heading", { level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Visit store/ })).toBeInTheDocument();
  });

  it("says so when no store is featured yet", async () => {
    vi.mocked(searchBusinesses).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });
    view();
    expect(await screen.findByText(/No featured businesses yet/)).toBeInTheDocument();
  });

  it("offers a retry when loading fails", async () => {
    vi.mocked(searchBusinesses).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({ items: [shop(1)], total: 1, page: 1, pageSize: 12, totalPages: 1 });
    view();
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not load featured businesses.");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 3 })).toBeInTheDocument();
  });
});
