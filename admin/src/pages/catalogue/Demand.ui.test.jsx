import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import * as demandApi from "../../api/mockDemand.js";

const api = { getUnmetDemand: vi.fn(demandApi.getUnmetDemand), listCategories: async () => [{ id: "electronics", name: "Electronics" }, { id: "fashion", name: "Fashion" }] };
vi.mock("../../api/index.js", () => ({ api, default: api }));
const { default: DemandPage } = await import("./DemandPage.jsx");
const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><DemandPage /></MemoryRouter></QueryClientProvider>);
afterEach(() => { cleanup(); api.getUnmetDemand.mockClear(); });

describe("Unmet demand", () => {
  it("lists asks by category with the shops behind them", async () => {
    renderPage();
    const row = (await screen.findByText("12 shoppers looked for Samsung, 512 GB".replace(/^12 shoppers looked for /, ""))).closest("tr");
    expect(within(row).getByText("Electronics")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "Mobile Hub" })).toHaveAttribute("href", "/admin/businesses/s1");
  });
  it("re-reads for 30 days and for one category", async () => {
    renderPage();
    await screen.findByText("Samsung, 512 GB");
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "fashion" } });
    await screen.findByText("43");
    expect(api.getUnmetDemand).toHaveBeenLastCalledWith(30, "fashion");
    expect(screen.queryByText("Samsung, 512 GB")).toBeNull();
  });
  it("has no serious accessibility violations", async () => {
    const { container } = renderPage();
    await screen.findByText("Samsung, 512 GB");
    const r = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact))).toEqual([]);
  });
});
