import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SEED_SIZE_CHARTS, shoeChartFrom, shoeChartRows } from "@epicmkt/shared";

const SHOE_CHART = shoeChartFrom(null);
let mockRole = "owner";
vi.mock("../../auth/AuthContext.jsx", () => ({ useAuth: () => ({ admin: { role: mockRole }, status: "admin", demo: false }) }));

const row = (i, over = {}) => ({ id: `sc-${i}`, ...SEED_SIZE_CHARTS[i], product_type_ids: SEED_SIZE_CHARTS[i].productTypeIds, active: true, items_using: 0, updated_at: "2026-11-01T00:00:00Z", ...over });
const api = { listSizeCharts: vi.fn(), saveSizeChart: vi.fn(async () => "sc-0"), deleteSizeChart: vi.fn(async () => undefined), getShoeConversion: vi.fn(), saveShoeConversion: vi.fn(async () => 2) };
vi.mock("../../api/index.js", () => ({ api, default: api }));

const { default: SizeChartsPage } = await import("./SizeChartsPage.jsx");
const { seriousViolations } = await import("../../test/axe.js");
const { ToastProvider } = await import("../../components/Toast.jsx");
const renderPage = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter><ToastProvider><SizeChartsPage /></ToastProvider></MemoryRouter>
  </QueryClientProvider>,
);

beforeEach(() => {
  mockRole = "owner";
  api.listSizeCharts.mockResolvedValue([row(0, { items_using: 4 }), row(1), row(2, { active: false })]);
  api.getShoeConversion.mockResolvedValue({ chart: shoeChartRows(SHOE_CHART), version: 1 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Size charts", () => {
  it("lists the charts and opens the first with a live preview of what the buyer sees", async () => {
    renderPage();
    const list = await screen.findByRole("navigation", { name: "Size charts" });
    expect(within(list).getByText("Shirt collar")).toBeInTheDocument();
    expect(within(list).getByText(/hidden/)).toBeInTheDocument();
    const preview = screen.getByRole("complementary", { name: "What the buyer sees" });
    expect(within(preview).getByRole("columnheader", { name: "Bust" })).toBeInTheDocument();
    expect(within(preview).getByRole("rowheader", { name: "XS" })).toBeInTheDocument();
  });

  it("the preview follows the edit before anything is saved", async () => {
    renderPage();
    const cell = await screen.findByRole("textbox", { name: "Bust, row 1" });
    fireEvent.change(cell, { target: { value: "81" } });
    const preview = screen.getByRole("complementary", { name: "What the buyer sees" });
    expect(within(preview).getByRole("cell", { name: "81" })).toBeInTheDocument();
    expect(api.saveSizeChart).not.toHaveBeenCalled();
  });

  it("saves the cleaned fields, including the product types it is the default for", async () => {
    renderPage();
    const cell = await screen.findByRole("textbox", { name: "Bust, row 1" });
    fireEvent.change(cell, { target: { value: "81" } });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(api.saveSizeChart).toHaveBeenCalledTimes(1));
    const [id, fields] = api.saveSizeChart.mock.calls[0];
    expect(id).toBe("sc-0");
    expect(fields).toMatchObject({ name: "Dresses and tops (cm)", unit: "cm", product_type_ids: ["dress"] });
    expect(fields.rows[0]).toEqual(["XS", "81", "62", "88"]);
  });

  it("Save is off until something changes, and a bad draft is not sent", async () => {
    renderPage();
    const save = await screen.findByRole("button", { name: "Save changes" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "" } });
    await userEvent.click(save);
    expect(await screen.findByText(/Use 2 to 80 characters/)).toBeInTheDocument();
    expect(api.saveSizeChart).not.toHaveBeenCalled();
  });

  it("creates a new chart", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "New chart" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Name" }), { target: { value: "Kids shoes" } });
    for (const [r, c, v] of [[1, 0, "S"], [1, 1, "50"], [1, 2, "40"], [1, 3, "55"], [2, 0, "M"], [2, 1, "55"], [2, 2, "45"], [2, 3, "60"], [3, 0, "L"], [3, 1, "60"], [3, 2, "50"], [3, 3, "65"]]) {
      fireEvent.change(screen.getByRole("textbox", { name: `${["Size", "Chest", "Waist", "Hip"][c]}, row ${r}` }), { target: { value: v } });
    }
    await userEvent.click(screen.getByRole("button", { name: "Create chart" }));
    await waitFor(() => expect(api.saveSizeChart).toHaveBeenCalledWith(null, expect.objectContaining({ name: "Kids shoes" })));
  });

  it("warns that listing a product type moves it from its old chart", async () => {
    renderPage();
    const types = await screen.findByLabelText(/Default for these product types/);
    fireEvent.change(types, { target: { value: "dress, shirt" } });
    expect(screen.getByText(/Saving moves dress, shirt to this chart/)).toBeInTheDocument();
    fireEvent.change(types, { target: { value: "bad id!" } });
    expect(await screen.findByText(/Not a product type id/)).toBeInTheDocument();
  });

  it("deleting asks first, and shows the database's reason when the chart is in use", async () => {
    api.deleteSizeChart.mockRejectedValueOnce({ code: "size_chart_in_use" });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete chart" }));
    await waitFor(() => expect(api.deleteSizeChart).toHaveBeenCalledWith("sc-0"));
    expect(await screen.findByText(/still use this chart/)).toBeInTheDocument();
  });

  it("is read only for anyone but an owner", async () => {
    mockRole = "reviewer";
    renderPage();
    expect(await screen.findByText(/Only Owners can change size charts/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New chart" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDisabled();
  });

  it("shows a retry when the list will not load", async () => {
    api.listSizeCharts.mockRejectedValueOnce(new Error("down"));
    renderPage();
    expect(await screen.findByRole("button", { name: /try again|retry/i })).toBeInTheDocument();
  });
});

describe("Accessibility", () => {
  it("both tabs have no serious axe violations", async () => {
    const { container } = renderPage();
    await screen.findByRole("textbox", { name: "Name" });
    expect(await seriousViolations(container)).toEqual([]);
    await userEvent.click(screen.getByRole("tab", { name: "Shoe conversion" }));
    await screen.findByRole("form", { name: "Shoe conversion chart" });
    expect(await seriousViolations(container)).toEqual([]);
  });
  it("the preview and editor tables are keyboard reachable regions with names", async () => {
    renderPage();
    await screen.findByRole("textbox", { name: "Name" });
    expect(screen.getByRole("region", { name: "Chart editor" })).toHaveAttribute("tabindex", "0");
  });
});

describe("Shoe conversion", () => {
  const open = async () => { renderPage(); await userEvent.click(await screen.findByRole("tab", { name: "Shoe conversion" })); await screen.findByRole("form", { name: "Shoe conversion chart" }); };

  it("shows the editable chart and the men's preview", async () => {
    await open();
    expect(screen.getByRole("spinbutton", { name: "EU, row 1" })).toHaveValue(SHOE_CHART.adult[0].eu);
    const preview = screen.getByRole("complementary", { name: "What the buyer sees" });
    expect(within(preview).getByRole("columnheader", { name: "US men" })).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole("button", { name: "Women" }));
    expect(within(preview).getByRole("columnheader", { name: "US women" })).toBeInTheDocument();
    await userEvent.click(within(preview).getByRole("button", { name: "Kids" }));
    expect(within(preview).queryByRole("columnheader", { name: "UK" })).toBeNull();
  });

  it("an edit changes the preview and saves the numbers", async () => {
    await open();
    const cm = screen.getByRole("spinbutton", { name: "Foot (cm), row 1" });
    const next = String(SHOE_CHART.adult[0].cm + 0.1);
    fireEvent.change(cm, { target: { value: next } });
    const preview = screen.getByRole("complementary", { name: "What the buyer sees" });
    expect(within(preview).getAllByRole("cell", { name: next }).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Save conversion" }));
    await waitFor(() => expect(api.saveShoeConversion).toHaveBeenCalledTimes(1));
    expect(api.saveShoeConversion.mock.calls[0][0].adult[0].cm).toBeCloseTo(SHOE_CHART.adult[0].cm + 0.1);
  });

  it("a chart that does not rise says why and cannot be saved", async () => {
    await open();
    fireEvent.change(screen.getByRole("spinbutton", { name: "EU, row 2" }), { target: { value: "1" } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Fix these before saving/);
    expect(screen.getByRole("button", { name: "Save conversion" })).toBeDisabled();
    expect(screen.getByText(/preview appears once the chart is valid/)).toBeInTheDocument();
  });

  it("is read only for anyone but an owner", async () => {
    mockRole = "support";
    await open();
    expect(screen.getByText(/Only Owners can change the shoe conversion/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save conversion" })).toBeNull();
  });
});
