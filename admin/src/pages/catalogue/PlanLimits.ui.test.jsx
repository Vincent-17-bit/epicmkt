import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

let mockRole = "finance";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));
const row = (over = {}) => ({ category_id: "bakery", category_name: "Bakery", grp: "Food", sort: 1, category_active: true, plan_key: "standard", price_kes: 500, top_benefits: ["a1", "b2", "c3"], badge: null, updated_at: "2026-01-01T00:00:00Z", live_businesses: 12, live_monthly_kes: 6000, versions: 2, ...over });
const api = {
  listPlans: vi.fn(async () => [row(), row({ category_id: "salon", category_name: "Salon", live_businesses: 3 }), row({ plan_key: "premium", price_kes: 1300, live_businesses: 4 })]),
  getPlanHistory: vi.fn(async () => []),
  getPlanLimits: vi.fn(async () => ({ standard: { galleryPhotos: 5 }, premium: { options: { axes: 2 } } })),
  savePlanLimits: vi.fn(async () => ({})),
};
vi.mock("../../api/index.js", () => ({ api, default: api }));
const { default: PlansPage } = await import("./PlansPage.jsx");
const { ToastProvider } = await import("../../components/Toast.jsx");
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><PlansPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);
const card = async (name) => within(await screen.findByRole("form", { name }));

beforeEach(() => { mockRole = "finance"; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Plan limits and features", () => {
  it("shows both plans with what each has now, and every switch on by default", async () => {
    renderPage();
    const std = await card("Standard");
    expect(std.getByLabelText("Option types per item")).toHaveValue("3");
    expect(std.getByLabelText("Combinations per item")).toHaveValue("200");
    expect(std.getAllByRole("checkbox")).toHaveLength(5);
    std.getAllByRole("checkbox").forEach((box) => expect(box).toBeChecked());
    const prem = await card("Premium");
    expect(prem.getByLabelText("Option types per item")).toHaveValue("2");
  });

  it("leaves the plan counts on the page as they were", async () => {
    renderPage();
    await screen.findByRole("form", { name: "Standard" });
    expect(await screen.findAllByText(/12 live · 2 versions/)).not.toHaveLength(0);
  });

  it("says who is affected before anything is saved, and asks for a reason", async () => {
    const user = userEvent.setup();
    renderPage();
    const std = await card("Standard");
    await user.clear(std.getByLabelText("Option types per item"));
    await user.type(std.getByLabelText("Option types per item"), "2");
    await user.click(std.getByLabelText(/3D and 360 views/));
    expect(await std.findByText(/Option types per item: 3 becomes 2/)).toBeInTheDocument();
    expect(std.getByText(/15 live shops in 2 categories will be held to 2/)).toBeInTheDocument();
    expect(std.getByText(/3D and 360 views is switched off for Standard.*lose it/)).toBeInTheDocument();
    expect(std.getByRole("button", { name: "Save Standard limits" })).toBeDisabled();
    await user.type(std.getByLabelText(/Why are the limits changing/), "Starter plan is simpler");
    expect(std.getByRole("button", { name: "Save Standard limits" })).toBeEnabled();
  });

  it("saves only that plan, with the numbers and switches as typed", async () => {
    const user = userEvent.setup();
    renderPage();
    const std = await card("Standard");
    await user.clear(std.getByLabelText("Combinations per item"));
    await user.type(std.getByLabelText("Combinations per item"), "24");
    await user.click(std.getByLabelText(/Demand signals/));
    await user.type(std.getByLabelText(/Why are the limits changing/), "Starter plan is simpler");
    await user.click(std.getByRole("button", { name: "Save Standard limits" }));
    await waitFor(() => expect(api.savePlanLimits).toHaveBeenCalledTimes(1));
    const call = api.savePlanLimits.mock.calls[0][0];
    expect(call.plan).toBe("standard");
    expect(call.reason).toBe("Starter plan is simpler");
    expect(call.limits.options.variants).toBe(24);
    expect(call.limits.features.demand).toBe(false);
    expect(call.limits.features.options).toBe(true);
  });

  it("names a limit that is outside what the editor allows, and will not save", async () => {
    const user = userEvent.setup();
    renderPage();
    const std = await card("Standard");
    await user.clear(std.getByLabelText("Option types per item"));
    await user.type(std.getByLabelText("Option types per item"), "9");
    expect(await std.findByRole("alert")).toHaveTextContent(/1 to 3/);
    expect(std.getByLabelText("Option types per item")).toHaveAttribute("aria-invalid", "true");
    expect(std.getByRole("button", { name: "Save Standard limits" })).toBeDisabled();
  });

  it("is read only for a role that cannot edit plans", async () => {
    mockRole = "reviewer";
    renderPage();
    const std = await card("Standard");
    expect(std.getByLabelText("Option types per item")).toBeDisabled();
    expect(std.getAllByRole("checkbox")[0]).toBeDisabled();
    expect(std.getByRole("button", { name: "Save Standard limits" })).toBeDisabled();
  });

  it("Reset puts the form back as saved", async () => {
    const user = userEvent.setup();
    renderPage();
    const std = await card("Standard");
    await user.click(std.getAllByRole("checkbox")[1]);
    expect(std.getAllByRole("checkbox")[1]).not.toBeChecked();
    await user.click(std.getByRole("button", { name: "Reset" }));
    expect(std.getAllByRole("checkbox")[1]).toBeChecked();
  });
});
