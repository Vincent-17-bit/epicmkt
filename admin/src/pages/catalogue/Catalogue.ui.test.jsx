import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockRole = "finance";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const plan = (over = {}) => ({ category_id: "bakery", category_name: "Bakery", grp: "Food", sort: 1, category_active: true, plan_key: "standard", price_kes: 500, top_benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: null, live_businesses: 10, live_monthly_kes: 5000, versions: 2, ...over });
const category = (over = {}) => ({ id: "bakery", name: "Bakery", grp: "Food", icon: "bread-slice", tier: "B", sort: 3, active: true, live_businesses: 14, businesses: 14, min_price: 500, priced_plans: 2, template: [], extra_docs: [], ...over });

const api = {
  listPlans: vi.fn(), getPlanHistory: vi.fn(async () => [{ id: 1, created_at: "2026-01-01T00:00:00Z", reason: "Inflation", price_kes: 500, top_benefits: ["a", "b", "c"], badge: null, changed_by_email: "owner@test" }]),
  savePlan: vi.fn(async () => 3), listCategories: vi.fn(), saveCategory: vi.fn(async () => true),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: PlansPage } = await import("./PlansPage.jsx");
const { default: CategoriesPage } = await import("./CategoriesPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");

const renderPage = (el) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider>{el}</ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  mockRole = "finance";
  api.listPlans.mockResolvedValue([plan(), plan({ plan_key: "premium", price_kes: 1300, badge: "Best value", live_businesses: 4, live_monthly_kes: 5200 }), plan({ category_id: "salon", category_name: "Salon", category_active: false, price_kes: 0, live_businesses: 0, live_monthly_kes: 0 })]);
  api.listCategories.mockResolvedValue([category(), category({ id: "salon", name: "Salon", active: false, priced_plans: 0, min_price: 0, live_businesses: 0, businesses: 0 })]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Plans", () => {
  it("shows prices, live counts and flags plans with no price", async () => {
    renderPage(<PlansPage />);
    expect(await screen.findByText("KES 1,300")).toBeInTheDocument();
    expect(screen.getAllByText("Not priced").length).toBeGreaterThan(0);
    expect(screen.getByText("10 live · 2 versions")).toBeInTheDocument();
  });

  it("a price change shows its impact and cannot be saved without a reason", async () => {
    renderPage(<PlansPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bakery standard plan" }));
    const dialog = await screen.findByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "Save plan" });
    expect(save).toBeEnabled(); // nothing changed yet
    fireEvent.change(within(dialog).getByLabelText(/Monthly price/), { target: { value: "600" } });
    expect(within(dialog).getByText(/KES 600 a month instead of KES 500/)).toBeInTheDocument();
    expect(within(dialog).getByText(/10 live businesses keep the monthly price/)).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Why is the price changing/), { target: { value: "Costs went up" } });
    fireEvent.click(save);
    await waitFor(() => expect(api.savePlan).toHaveBeenCalledWith({ category: "bakery", plan: "standard", price: 600, benefits: ["Listed on EpicMKT", "Contact buttons", "Opening hours"], badge: "", reason: "Costs went up" }));
  });

  it("refuses a blank benefit before it reaches the server", async () => {
    renderPage(<PlansPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bakery standard plan" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Benefit 2"), { target: { value: "" } });
    expect(within(dialog).getByRole("button", { name: "Save plan" })).toBeDisabled();
    expect(within(dialog).getByText(/exactly three benefits/)).toBeInTheDocument();
  });

  it("reviewers can read plans and history but not edit", async () => {
    mockRole = "reviewer";
    renderPage(<PlansPage />);
    expect(await screen.findByRole("button", { name: "Edit Bakery standard plan" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "History of Bakery standard plan" }));
    expect(await screen.findByText("Reason: Inflation")).toBeInTheDocument();
  });
});

describe("Categories and the template builder", () => {
  beforeEach(() => { mockRole = "owner"; });

  it("lists categories with status and pricing state", async () => {
    renderPage(<CategoriesPage />);
    expect(await screen.findByText("From KES 500")).toBeInTheDocument();
    expect(screen.getAllByText("Off").length).toBeGreaterThan(0);
  });

  it("builds a valid template: generated keys, choices, conditions, then saves clean data", async () => {
    renderPage(<CategoriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "New category" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Pet Shop" } });
    expect(within(dialog).getByLabelText(/Id \(cannot change/)).toHaveValue("pet-shop");
    fireEvent.change(within(dialog).getByLabelText("Group"), { target: { value: "Shops" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add a question" }));
    fireEvent.change(within(dialog).getByLabelText("Question"), { target: { value: "Delivery available" } });
    fireEvent.change(within(dialog).getByLabelText("Answer type"), { target: { value: "boolean" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add a question" }));
    fireEvent.change(within(dialog).getAllByLabelText("Question")[1], { target: { value: "Animals" } });
    fireEvent.change(within(dialog).getAllByLabelText("Answer type")[1], { target: { value: "multiselect" } });
    expect(within(dialog).getByText(/at least two choices/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save category" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Choices/), { target: { value: "Dogs\nCats\nDogs" } });
    fireEvent.change(within(dialog).getAllByLabelText("Only ask when")[1], { target: { value: "deliveryAvailable" } });

    fireEvent.click(within(dialog).getByRole("button", { name: "Add a document" }));
    fireEvent.change(within(dialog).getByLabelText("Document"), { target: { value: "Vet licence" } });
    fireEvent.change(within(dialog).getByLabelText(/Why we ask/), { target: { value: "Animals need a vet." } });

    const save = within(dialog).getByRole("button", { name: "Save category" });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.saveCategory).toHaveBeenCalled());
    expect(api.saveCategory.mock.calls[0][0]).toEqual({
      id: "pet-shop", name: "Pet Shop", group: "Shops", icon: "store", tier: "B", sort: 100, active: false,
      template: [{ key: "deliveryAvailable", label: "Delivery available", type: "boolean" }, { key: "animals", label: "Animals", type: "multiselect", options: ["Dogs", "Cats"], showIf: { field: "deliveryAvailable", equals: true } }],
      extraDocs: [{ key: "vet_licence", label: "Vet licence", rule: "required", why: "Animals need a vet." }], reason: null,
    });
  });

  it("removing a question another depends on keeps the template valid", async () => {
    api.listCategories.mockResolvedValue([category({ template: [{ key: "delivery", label: "Delivery", type: "boolean" }, { key: "area", label: "Area", type: "text", showIf: { field: "delivery", equals: true } }] })]);
    renderPage(<CategoriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bakery" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove question 1" }));
    expect(within(dialog).getAllByLabelText("Question")).toHaveLength(1);
    expect(within(dialog).getByLabelText("Only ask when")).toHaveValue("");
    expect(within(dialog).getByRole("button", { name: "Save category" })).toBeEnabled();
  });

  it("switching a live category off needs a reason; a server refusal is shown in words", async () => {
    api.saveCategory.mockRejectedValueOnce(Object.assign(new Error("plans_not_priced"), { code: "plans_not_priced" }));
    renderPage(<CategoriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Salon" }));
    let dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/Available to new applicants/));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save category" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/Set a price on both plans/);
    cleanup();
    renderPage(<CategoriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bakery" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/Available to new applicants/));
    expect(within(dialog).getByRole("button", { name: "Save category" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Why is it being switched off/), { target: { value: "Merged into another" } });
    expect(within(dialog).getByRole("button", { name: "Save category" })).toBeEnabled();
  });

  it("only the owner can edit categories", async () => {
    mockRole = "finance";
    renderPage(<CategoriesPage />);
    expect(await screen.findByRole("button", { name: "New category" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Edit Bakery" })).toBeDisabled();
  });
});
