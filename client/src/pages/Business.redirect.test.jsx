import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
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
    { id: "hair dye", name: "Hair dye", priceKes: 900, section: "Colour" }
  ]
};

vi.mock("../api/index.js", () => ({ getBusiness: vi.fn(async () => biz), logContactEvent: vi.fn(), reportBusiness: vi.fn() }));
vi.mock("../components/FlashStrip.jsx", () => ({ default: () => null }));
vi.mock("../components/TemplateDetails.jsx", () => ({ default: () => null }));
vi.mock("../components/QrCode.jsx", () => ({ default: () => null }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));

function Probe() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="loc">{`${pathname}${search}`}</p>
      <button onClick={() => navigate(-1)}>back</button>
    </div>
  );
}

const mount = (entries, index) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <Probe />
        <Routes>
          <Route path="/b/:slug" element={<Business />} />
          <Route path="/b/:slug/item/:itemId" element={<p>item page</p>} />
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

const loc = () => screen.getByTestId("loc").textContent;

describe("Business page and the item route", () => {
  it("redirects an old ?item= link to the item page, replacing the history entry", async () => {
    const user = userEvent.setup();
    mount(["/", "/b/fade-kings?item=fade"], 1);
    expect(await screen.findByText("item page")).toBeInTheDocument();
    expect(loc()).toBe("/b/fade-kings/item/fade");
    await user.click(screen.getByText("back"));
    expect(loc()).toBe("/");
  });

  it("encodes the item id in the redirect", async () => {
    mount(["/b/fade-kings?item=hair%20dye"], 0);
    await screen.findByText("item page");
    expect(loc()).toBe("/b/fade-kings/item/hair%20dye");
  });

  it("links each service to its own item page instead of opening a dialog", async () => {
    const user = userEvent.setup();
    mount(["/", "/b/fade-kings"], 1);
    const link = await screen.findByRole("link", { name: /Fade/ });
    expect(link).toHaveAttribute("href", "/b/fade-kings/item/fade");
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(link);
    expect(loc()).toBe("/b/fade-kings/item/fade");
    await user.click(screen.getByText("back"));
    expect(loc()).toBe("/b/fade-kings");
  });

  it("stays on the business page when item is empty", async () => {
    mount(["/b/fade-kings?item="], 0);
    expect(await screen.findByRole("link", { name: /Fade/ })).toBeInTheDocument();
    expect(loc()).toBe("/b/fade-kings?item=");
  });
});
