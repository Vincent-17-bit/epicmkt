import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Business from "./Business.jsx";

const biz = {
  id: "b_001",
  slug: "fade-kings",
  name: "Fade Kings",
  category: { singular: "Barbershop", name: "Barbershops" },
  area: "Maseno",
  county: "Kisumu",
  hours: [],
  offers: [],
  gallery: [],
  socials: {},
  attributes: {},
  services: [
    { id: "fade", name: "Fade", priceKes: 300, section: "Cuts" },
    { id: "kids", name: "Kids cut", priceKes: 100, section: "Cuts" }
  ]
};

vi.mock("../api/index.js", () => ({ getBusiness: vi.fn(async () => biz), logContactEvent: vi.fn(), reportBusiness: vi.fn() }));
vi.mock("../components/FlashStrip.jsx", () => ({ default: () => null }));
vi.mock("../components/TemplateDetails.jsx", () => ({ default: () => null }));
vi.mock("../components/QrCode.jsx", () => ({ default: () => null }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));

function Probe() {
  const { pathname, search } = useLocation();
  return <p data-testid="loc">{`${pathname}${search}`}</p>;
}

const mount = (entries, index) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Probe />
        <Routes>
          <Route path="/b/:slug" element={<Business />} />
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

const loc = () => screen.getByTestId("loc").textContent;

describe("Business item links", () => {
  it("opens an item on its own page", async () => {
    const user = userEvent.setup();
    mount(["/b/fade-kings"], 0);
    await user.click(await screen.findByRole("button", { name: /Fade/ }));
    expect(loc()).toBe("/b/fade-kings/i/fade");
  });

  it("redirects a legacy ?item= link to the item page", async () => {
    mount(["/b/fade-kings?item=fade&section=cuts"], 0);
    await vi.waitFor(() => expect(loc()).toBe("/b/fade-kings/i/fade?section=cuts"));
  });
});
