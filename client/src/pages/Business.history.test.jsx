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
    { id: "kids", name: "Kids cut", priceKes: 100, section: "Cuts" }
  ]
};

vi.mock("../api/index.js", () => ({ getBusiness: vi.fn(async () => biz), logContactEvent: vi.fn(), reportBusiness: vi.fn() }));
vi.mock("../components/FlashStrip.jsx", () => ({ default: () => null }));
vi.mock("../components/TemplateDetails.jsx", () => ({ default: () => null }));
vi.mock("../components/QrCode.jsx", () => ({ default: () => null }));
vi.mock("../components/PageBreadcrumbs.jsx", () => ({ default: () => <nav aria-label="page trail" /> }));
vi.mock("../components/ItemDetail.jsx", () => ({
  default: ({ itemId, onClose, onSelect }) => (
    <div role="dialog" aria-label="sheet">
      <span>open:{itemId}</span>
      <button onClick={() => onSelect("kids")}>swap</button>
      <button onClick={onClose}>close</button>
    </div>
  )
}));

function Probe() {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <p data-testid="loc">{`${pathname}${search}|${JSON.stringify(state)}`}</p>
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
          <Route path="*" element={null} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );

const loc = () => screen.getByTestId("loc").textContent;

describe("Business sheet history", () => {
  it("pushes from a page card with sheetFrom, swaps by replace, closes with back", async () => {
    const user = userEvent.setup();
    mount(["/", "/b/fade-kings"], 1);
    await user.click(await screen.findByRole("button", { name: /Fade/ }));
    expect(loc()).toBe('/b/fade-kings?item=fade|{"sheetFrom":"page"}');

    await user.click(screen.getByText("swap"));
    expect(loc()).toBe('/b/fade-kings?item=kids|{"sheetFrom":"page"}');

    await user.click(screen.getByText("close"));
    expect(loc()).toBe("/b/fade-kings|null");
    await user.click(screen.getByText("back"));
    expect(loc()).toBe("/|null");
  });

  it("closes a cold or cross-page open by replacing, never leaving the page", async () => {
    const user = userEvent.setup();
    mount(["/b/fade-kings?item=fade"], 0);
    await user.click(await screen.findByText("close"));
    expect(loc()).toBe("/b/fade-kings|null");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("makes the page trail inert while the sheet is open", async () => {
    mount(["/b/fade-kings?item=fade"], 0);
    await screen.findByRole("dialog");
    expect(screen.getByLabelText("page trail", { selector: "nav", hidden: true }).parentElement).toHaveAttribute("inert");
  });
});
