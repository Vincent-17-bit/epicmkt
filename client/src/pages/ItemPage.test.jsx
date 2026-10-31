import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ItemPage from "./ItemPage.jsx";

const biz = { id: "b_001", slug: "fade-kings", name: "Fade Kings", category: { singular: "Barbershop" }, area: "Maseno", lat: 0, lng: 34 };
const detail = {
  id: "fade",
  name: "Fade and beard",
  description: "Sharp.",
  shortDescription: "Sharp.",
  images: [{ id: "i1", url: "a.png", caption: "x" }],
  kind: "service",
  offers: [],
  flash: null,
  specs: [],
  availability: "available",
  section: "Cuts",
  pricing: { regularPrice: 300, salePrice: 300, savings: 0, discountPercent: 0, unit: null, variants: [] },
  business: { slug: "fade-kings", name: "Fade Kings", phone: "0712555101", whatsapp: "0712555101", townName: "Maseno", isOpen: true, verified: true }
};

const mocks = vi.hoisted(() => ({ getDetail: vi.fn(), getStoreSelective: vi.fn(), getBusiness: vi.fn(), getSimilar: vi.fn() }));
vi.mock("../api/index.js", () => ({
  getBusiness: mocks.getBusiness,
  logContactEvent: vi.fn(),
  logEvent: vi.fn(),
  reportBusiness: vi.fn(),
  items: { getDetail: mocks.getDetail, getStoreSelective: mocks.getStoreSelective, getSimilar: mocks.getSimilar }
}));

const Where = () => {
  const l = useLocation();
  return <p data-testid="where">{`${l.pathname}${l.search}`}</p>;
};

const mount = (path = "/b/fade-kings/i/fade") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Where />
        <Routes>
          <Route path="/b/:slug/i/:itemId" element={<ItemPage />} />
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

describe("ItemPage", () => {
  it("shows the item as a page: its own heading, no dialog, no close button", async () => {
    mocks.getBusiness.mockResolvedValue(biz);
    mocks.getDetail.mockResolvedValue(detail);
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Fade and beard" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Visit Store/ })[0]).toHaveAttribute("href", "/b/fade-kings");
    expect(document.title).toContain("Fade and beard");
  });

  it("goes back to the store from the trail", async () => {
    mocks.getBusiness.mockResolvedValue(biz);
    mocks.getDetail.mockResolvedValue(detail);
    mocks.getStoreSelective.mockResolvedValue([]);
    mount();
    await screen.findByRole("heading", { level: 1, name: "Fade and beard" });
    await userEvent.click(screen.getByRole("button", { name: /Fade Kings/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/b/fade-kings"));
  });

  it("opens another item from the store's selection on its own page", async () => {
    mocks.getBusiness.mockResolvedValue(biz);
    mocks.getDetail.mockResolvedValue(detail);
    mocks.getStoreSelective.mockResolvedValue(
      [0, 1].map((i) => ({ id: `s${i}`, name: `Other ${i}`, imageUrl: "b.png", availability: "available", pricing: { regularPrice: 100, salePrice: 100, savings: 0, discountPercent: 0 } }))
    );
    mount();
    await screen.findByRole("heading", { level: 1, name: "Fade and beard" });
    await userEvent.click(await screen.findByRole("button", { name: /Other 0/ }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/b/fade-kings/i/s0"));
  });

  it("says so when the store does not exist", async () => {
    mocks.getBusiness.mockRejectedValue(Object.assign(new Error("nope"), { name: "NotFoundError" }));
    mount("/b/ghost/i/x");
    expect(await screen.findByText(/not found|couldn.t find|doesn.t exist/i)).toBeInTheDocument();
  });

  const similarRows = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, name: `Other ${i + 1}`, imageUrl: "b.png", availability: "available", pricing: detail.pricing, business: { id: `b${i + 1}`, slug: `shop-${i + 1}`, name: `Shop ${i + 1}`, verified: false } }));

  it("puts Similar items last: after the description, the specs and the seller card, and just before the action bar", async () => {
    mocks.getBusiness.mockResolvedValue(biz);
    mocks.getDetail.mockResolvedValue({ ...detail, highlights: ["Fast"], specs: [{ label: "Time", value: "30 min" }] });
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getSimilar.mockResolvedValue(similarRows(3));
    const { container } = mount();
    const similar = await waitFor(() => {
      const el = container.querySelector("[data-similar]");
      expect(el).not.toBeNull();
      return el;
    });
    const follows = (a, b) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING, "order").toBeTruthy();
    follows(screen.getAllByText("Sharp.")[0], similar);
    follows(screen.getByRole("region", { name: "Sold by" }), similar);
    follows(screen.getByRole("heading", { level: 1, name: "Fade and beard" }), similar);
    const specs = container.querySelector("[class*='panels']");
    if (specs) follows(specs, similar);
    follows(similar, container.querySelector("footer"));
    // Nothing of the item page comes after it except the sticky action bar.
    const body = similar.parentElement;
    expect(body.lastElementChild).toBe(similar);
    expect(similar).toHaveAttribute("aria-labelledby", "similar-items-title");
    expect(document.getElementById("similar-items-title")).toHaveTextContent("Similar items");
  });

  it("leaves nothing behind when there are fewer than two similar items: no section, no gap", async () => {
    mocks.getBusiness.mockResolvedValue(biz);
    mocks.getDetail.mockResolvedValue(detail);
    mocks.getStoreSelective.mockResolvedValue([]);
    mocks.getSimilar.mockResolvedValue(similarRows(1));
    const { container } = mount();
    await screen.findByRole("heading", { level: 1, name: "Fade and beard" });
    await waitFor(() => expect(mocks.getSimilar).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("[data-similar]")).toBeNull());
    expect(container.querySelector("[data-similar-marker]")).toBeNull();
  });
});
