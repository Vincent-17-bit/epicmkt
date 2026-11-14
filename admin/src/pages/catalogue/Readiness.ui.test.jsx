import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import conformance from "../../data/conformanceResult.json";

const cat = (over = {}) => ({ id: "bakery", name: "Bakery", grp: "Food", icon: "x", tier: "B", sort: 1, active: true, live_businesses: 4, businesses: 4, min_price: 500, priced_plans: 2, template: [], extra_docs: [], ...over });
const api = {
  listCategories: vi.fn(),
  listTypeSettings: vi.fn(async () => ({ types: [{ id: "bread", name: "Bread", categoryIds: ["bakery"], active: true }] })),
  listSpecTypes: vi.fn(async () => [{ id: "bread", specRows: [{ key: "ingredients", label: "Ingredients", level: "required", input: "text" }] }]),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
const { default: ReadinessPage } = await import("./ReadinessPage.jsx");
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ReadinessPage /></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  api.listCategories.mockResolvedValue([cat(), cat({ id: "barbershop", name: "Barbershop", priced_plans: 1, active: false }), cat({ id: "brand-new", name: "Brand new", priced_plans: 2, active: false })]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const article = async (name) => within(await screen.findByRole("article", { name }));

describe("Category readiness", () => {
  it("shows every check for a category, with a word and a mark, not colour alone", async () => {
    renderPage();
    const bakery = await article("Bakery");
    expect(bakery.getByText("Ready")).toBeInTheDocument();
    for (const label of ["Plans priced", "Product types defined", "Spec rules valid", "Conformance suite", "Preview item"]) expect(bakery.getByText(label)).toBeInTheDocument();
    expect(bakery.getAllByText(/: Passed\./).length).toBe(5);
    expect(bakery.getByText(/Preview: Sample Bread/)).toBeInTheDocument();
  });

  it("says what blocks a category: unpriced plans, and a category the conformance result has never seen", async () => {
    renderPage();
    const shop = await article("Barbershop");
    expect(shop.getByText(/Not ready: plans priced/)).toBeInTheDocument();
    expect(shop.getByText(/1 of 2 plans have a price/)).toBeInTheDocument();
    const fresh = await article("Brand new");
    expect(fresh.getByText(/Not ready: conformance suite/)).toBeInTheDocument();
    expect(fresh.getByText(/not in the stored result/)).toBeInTheDocument();
  });

  it("counts the ready ones and filters", async () => {
    renderPage();
    await article("Bakery");
    expect(Object.keys(conformance.categories)).toContain("bakery");
    expect(await screen.findByText("1 of 3 categories ready")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not ready" }));
    expect(screen.queryByRole("article", { name: "Bakery" })).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Brand new" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not ready" })).toHaveAttribute("aria-pressed", "true");
  });

  it("still loads for a role that cannot read product types, and says two checks are incomplete", async () => {
    api.listTypeSettings.mockRejectedValue(new Error("forbidden"));
    renderPage();
    expect(await screen.findByText(/could not be loaded for your role/)).toBeInTheDocument();
    expect(await article("Bakery")).toBeTruthy();
  });
});

describe("Sandbox", () => {
  it("builds a throwaway item and shows what the seller chooses and that nothing is saved", async () => {
    renderPage();
    const box = within(await screen.findByRole("region", { name: "Sandbox" }));
    expect(box.getByText(/Nothing is saved/)).toBeInTheDocument();
    expect(box.getByRole("article", { name: "What a buyer sees in a list" })).toHaveTextContent("Sample Phone");
    expect(box.getByText("Colour")).toBeInTheDocument();
    expect(box.getByText(/Nothing stops a seller publishing this/)).toBeInTheDocument();
  });

  it("shows the seller's own words when the required answers are left empty, and switches type", async () => {
    renderPage();
    const box = within(await screen.findByRole("region", { name: "Sandbox" }));
    fireEvent.click(box.getByLabelText("Leave the required answers empty"));
    expect(await box.findByText(/A seller could not publish/)).toBeInTheDocument();
    expect(box.getByText(/Warranty is required/)).toBeInTheDocument();
    fireEvent.change(box.getByLabelText("Product type"), { target: { value: "printing" } });
    await waitFor(() => expect(box.getByRole("article", { name: "What a buyer sees in a list" })).toHaveTextContent("Sample Printing"));
  });
});
