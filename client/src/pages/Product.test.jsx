import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Product from "./Product.jsx";

const biz = { id: "b_001", slug: "fade-kings", name: "Fade Kings", category: { singular: "Barbershop", name: "Barbershops" }, attributes: {}, services: [] };

const detail = {
  id: "fade",
  name: "Skin fade",
  kind: "service",
  images: [],
  videos: [],
  specs: [],
  offers: [],
  flash: null,
  availability: "available",
  pricing: { regularPrice: 300, salePrice: 300, savings: 0, discountPercent: 0, variants: [], unit: null },
  business: { slug: "fade-kings", name: "Fade Kings", phone: "0712345678", whatsapp: "0712345678", townName: "Maseno", isOpen: true }
};

const getDetail = vi.fn(async () => detail);

vi.mock("../api/index.js", () => ({
  getBusiness: vi.fn(async () => biz),
  logContactEvent: vi.fn(),
  logEvent: vi.fn(),
  items: { getDetail: (...args) => getDetail(...args), getStoreSelective: vi.fn(async () => []) }
}));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));
vi.mock("../components/ReportDialog.jsx", () => ({ default: () => null }));

const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Routes>
          <Route path="/b/:slug/i/:itemId" element={<Product />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

describe("Product page", () => {
  it("renders the item with seller actions", async () => {
    mount("/b/fade-kings/i/fade");
    expect(await screen.findByRole("heading", { level: 1, name: "Skin fade" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Chat Seller/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Visit Store/i })[0]).toHaveAttribute("href", "/b/fade-kings");
  });

  it("shows the unavailable state when the item is gone", async () => {
    const err = Object.assign(new Error("gone"), { name: "NotFoundError" });
    getDetail.mockRejectedValueOnce(err);
    mount("/b/fade-kings/i/missing");
    expect(await screen.findByRole("heading", { name: /no longer available/i })).toBeInTheDocument();
  });
});
